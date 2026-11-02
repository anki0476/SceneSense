// SPDX-License-Identifier: GPL-3.0-or-later
// Native OBS filter: bounded latest-frame worker, no camera ownership or network.
#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#include <windows.h>
#include <dxgi.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <obs-module.h>
#include "onnxruntime_c_api.h"

OBS_DECLARE_MODULE()
#define W 640
#define H 360
#define PIX (W*H)
#define BYTES (PIX*4)
#define AGE_WINDOW 600
#define API(sym) static __typeof__(&sym) p_##sym
API(obs_register_source_s);API(obs_filter_get_target);API(obs_filter_get_parent);
API(obs_source_video_render);API(obs_source_default_render);API(obs_source_skip_video_filter);
API(obs_source_get_base_width);API(obs_source_get_base_height);API(obs_get_base_effect);
API(obs_enter_graphics);API(obs_leave_graphics);API(obs_source_get_settings);
API(obs_data_set_string);API(obs_data_set_double);API(obs_data_set_int);API(obs_data_get_double);API(obs_data_get_bool);
API(obs_data_set_default_double);API(obs_data_set_default_bool);API(obs_data_release);
API(obs_source_async_unbuffered);API(obs_source_set_async_unbuffered);
API(gs_texrender_create);API(gs_texrender_destroy);API(gs_texrender_reset);API(gs_texrender_begin);API(gs_texrender_end);API(gs_texrender_get_texture);
API(gs_stagesurface_create);API(gs_stagesurface_destroy);API(gs_stagesurface_map);API(gs_stagesurface_unmap);API(gs_stage_texture);
API(gs_texture_create);API(gs_texture_destroy);API(gs_texture_set_image);API(gs_draw_sprite);
API(gs_effect_get_param_by_name);API(gs_effect_set_texture);API(gs_effect_loop);
API(gs_ortho);API(gs_clear);API(gs_blend_state_push);API(gs_blend_state_pop);API(gs_blend_function);
API(obs_properties_create);API(obs_properties_add_float_slider);
API(blog);
static HMODULE runtime;
static const OrtApi *ort;
static wchar_t folder[MAX_PATH];
static DWORD64 now_ms(void){return GetTickCount64();}
static bool check(OrtStatus *status){if(!status)return true;p_blog(LOG_ERROR,"[SceneSense native] %s",ort->GetErrorMessage(status));ort->ReleaseStatus(status);return false;}
static int nvidia_adapter(void){
    HMODULE dxgi=LoadLibraryW(L"dxgi.dll");if(!dxgi)return -1;
    HRESULT (WINAPI *create)(REFIID,void**)=(void*)GetProcAddress(dxgi,"CreateDXGIFactory1");
    const GUID iid={0x770aae78,0xf26f,0x4dba,{0xa8,0x29,0x25,0x3c,0x83,0xd1,0xb3,0x87}};
    IDXGIFactory1 *factory=NULL;int found=-1;
    if(create&&SUCCEEDED(create(&iid,(void**)&factory))){for(UINT i=0;i<8;i++){IDXGIAdapter1*a=NULL;DXGI_ADAPTER_DESC1 d;if(FAILED(IDXGIFactory1_EnumAdapters1(factory,i,&a)))break;if(SUCCEEDED(IDXGIAdapter1_GetDesc1(a,&d))&&d.VendorId==0x10de&&!(d.Flags&DXGI_ADAPTER_FLAG_SOFTWARE))found=(int)i;IDXGIAdapter1_Release(a);if(found>=0)break;}IDXGIFactory1_Release(factory);}FreeLibrary(dxgi);return found;
}
struct filter{
    obs_source_t *source,*parent;HANDLE thread,event;CRITICAL_SECTION lock,output_lock;
    volatile LONG stop,failed,ready,active,epoch;bool pending,output,was_unbuffered,have_parent,display_valid,capture_due;
    uint64_t display_at,display_sequence;LONG input_epoch,output_epoch,display_epoch;
    double ratio,last_ms,age_ms;uint64_t produced,input_at,output_at;
    uint8_t *input,*result,*display;gs_texrender_t* capture;gs_stagesurf_t* stage[2];gs_texture_t* texture;
    uint64_t stage_at[2];bool stage_valid[2];unsigned stage_write;LONG capture_epoch;
    double readback_ms,max_readback_ms;
    uint64_t uploaded_sequence,texture_uploads,rendered_ticks,last_tick_sequence;
    unsigned repeat_run,max_repeat_run,age_count,age_index;
    double ages[AGE_WINDOW],max_age_ms;
    OrtEnv*env;OrtSession*session;OrtMemoryInfo*memory;OrtValue *src,*ratio_tensor,*rec[4];OrtRunOptions*run;
    float *tensor,downsample;DWORD64 publish_at;
};
static int compare_age(const void*a,const void*b){double x=*(const double*)a,y=*(const double*)b;return (x>y)-(x<y);}
static void metrics(struct filter*f,const char*status){
    EnterCriticalSection(&f->output_lock);double processing=f->last_ms;uint64_t produced=f->produced;LeaveCriticalSection(&f->output_lock);
    double sorted[AGE_WINDOW];memcpy(sorted,f->ages,f->age_count*sizeof(double));qsort(sorted,f->age_count,sizeof(double),compare_age);
    obs_data_t*s=p_obs_source_get_settings(f->source);p_obs_data_set_string(s,"native_status",status);p_obs_data_set_string(s,"native_build","buffered-handoff-v2");p_obs_data_set_double(s,"processing_ms",processing);p_obs_data_set_double(s,"frame_age_ms",f->age_ms);p_obs_data_set_int(s,"processed_frames",produced);
    p_obs_data_set_double(s,"frame_age_p95_ms",f->age_count?sorted[(f->age_count-1)*95/100]:0);p_obs_data_set_double(s,"max_frame_age_ms",f->max_age_ms);p_obs_data_set_double(s,"readback_ms",f->readback_ms);p_obs_data_set_double(s,"max_readback_ms",f->max_readback_ms);p_obs_data_set_int(s,"max_repeated_ticks",f->max_repeat_run);p_obs_data_set_int(s,"texture_uploads",f->texture_uploads);p_obs_data_set_int(s,"rendered_ticks",f->rendered_ticks);p_obs_data_release(s);
}
static void reset_rec(struct filter*f){for(int i=0;i<4;i++){if(f->rec[i])ort->ReleaseValue(f->rec[i]);f->rec[i]=NULL;}}
static bool make_rec(struct filter*f){OrtAllocator*a=NULL;if(!check(ort->GetAllocatorWithDefaultOptions(&a)))return false;int64_t dims[4]={1,1,1,1};for(int i=0;i<4;i++){if(!check(ort->CreateTensorAsOrtValue(a,dims,4,ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&f->rec[i])))return false;float*p=NULL;if(!check(ort->GetTensorMutableData(f->rec[i],(void**)&p)))return false;*p=0;}return true;}
static bool init_model(struct filter*f){
    int device=nvidia_adapter();if(device<0)return false;
    OrtSessionOptions*options=NULL;wchar_t model[MAX_PATH];swprintf(model,MAX_PATH,L"%ls\\rvm_mobilenetv3_fp32.onnx",folder);
    OrtStatus* (ORT_API_CALL *append)(OrtSessionOptions*,int)=(void*)GetProcAddress(runtime,"OrtSessionOptionsAppendExecutionProvider_DML");
    if(!append)return false;
    if(!check(ort->CreateEnv(ORT_LOGGING_LEVEL_ERROR,"SceneSense",&f->env))||!check(ort->CreateSessionOptions(&options)))return false;
    bool ok=check(ort->SetSessionExecutionMode(options,ORT_SEQUENTIAL))&&check(ort->DisableMemPattern(options))&&check(ort->SetIntraOpNumThreads(options,2))&&check(ort->SetSessionGraphOptimizationLevel(options,ORT_ENABLE_ALL))&&check(append(options,device))&&check(ort->CreateSession(f->env,model,options,&f->session));ort->ReleaseSessionOptions(options);if(!ok)return false;
    if(!check(ort->CreateCpuMemoryInfo(OrtArenaAllocator,OrtMemTypeDefault,&f->memory)))return false;
    int64_t shape[4]={1,3,H,W},one[1]={1};
    return check(ort->CreateTensorWithDataAsOrtValue(f->memory,f->tensor,PIX*3*sizeof(float),shape,4,ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&f->src))&&check(ort->CreateTensorWithDataAsOrtValue(f->memory,&f->downsample,sizeof(float),one,1,ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&f->ratio_tensor))&&check(ort->CreateRunOptions(&f->run))&&make_rec(f);
}
static uint8_t to_u8(float v){return (uint8_t)(v<=0?0:v>=255?255:v+.5f);}
static DWORD WINAPI work(void*data){
    struct filter*f=data;uint8_t*raw=malloc(BYTES),*rgba=malloc(BYTES);if(!raw||!rgba||!init_model(f)){InterlockedExchange(&f->failed,1);goto done;}
    InterlockedExchange(&f->ready,1);
    while(!InterlockedCompareExchange(&f->stop,0,0)){
        WaitForSingleObject(f->event,100);if(f->stop)break;
        EnterCriticalSection(&f->lock);bool pending=f->pending;uint64_t captured=f->input_at;LONG epoch=f->input_epoch;double ratio=f->ratio;bool active=f->active;if(pending){uint8_t*spare=raw;raw=f->input;f->input=spare;f->pending=false;}LeaveCriticalSection(&f->lock);if(!pending||!active)continue;
        if(fabs(f->downsample-ratio)>.001){reset_rec(f);if(!make_rec(f)){f->failed=1;break;}f->downsample=(float)ratio;}
        DWORD64 started=now_ms();for(size_t i=0;i<PIX;i++){f->tensor[i]=raw[i*4]/255.f;f->tensor[PIX+i]=raw[i*4+1]/255.f;f->tensor[PIX*2+i]=raw[i*4+2]/255.f;}
        const char* names[]={"src","r1i","r2i","r3i","r4i","downsample_ratio"};const char* outs[]={"fgr","pha","r1o","r2o","r3o","r4o"};
        const OrtValue* inputs[]={f->src,f->rec[0],f->rec[1],f->rec[2],f->rec[3],f->ratio_tensor};OrtValue*outputs[6]={0};
        if(!check(ort->Run(f->session,f->run,names,inputs,6,outs,6,outputs))){for(int i=0;i<6;i++)if(outputs[i])ort->ReleaseValue(outputs[i]);if(!f->stop)f->failed=1;break;}
        float*fg=NULL,*alpha=NULL;bool ok=check(ort->GetTensorMutableData(outputs[0],(void**)&fg))&&check(ort->GetTensorMutableData(outputs[1],(void**)&alpha));
        if(ok){for(size_t i=0;i<PIX;i++){float a=fminf(1,fmaxf(0,alpha[i]));rgba[4*i]=to_u8(fg[i]*a*255);rgba[4*i+1]=to_u8(fg[PIX+i]*a*255);rgba[4*i+2]=to_u8(fg[PIX*2+i]*a*255);rgba[4*i+3]=to_u8(a*255);}}
        reset_rec(f);for(int i=0;i<4;i++)f->rec[i]=outputs[i+2];ort->ReleaseValue(outputs[0]);ort->ReleaseValue(outputs[1]);
        if(!ok){f->failed=1;break;}
        // Three owners: worker writes rgba, mailbox owns result, renderer owns
        // display. Exchange pointers only; no frame copy under the output lock.
        EnterCriticalSection(&f->output_lock);uint8_t*spare=rgba;rgba=f->result;f->result=spare;f->output=true;f->output_epoch=epoch;f->last_ms=(double)(now_ms()-started);f->output_at=captured;f->produced++;LeaveCriticalSection(&f->output_lock);
    }
done:free(raw);free(rgba);reset_rec(f);if(f->src)ort->ReleaseValue(f->src);if(f->ratio_tensor)ort->ReleaseValue(f->ratio_tensor);if(f->run)ort->ReleaseRunOptions(f->run);if(f->session)ort->ReleaseSession(f->session);if(f->memory)ort->ReleaseMemoryInfo(f->memory);if(f->env)ort->ReleaseEnv(f->env);return 0;
}
static void restore_parent(struct filter*f){if(f->have_parent&&f->parent){p_obs_source_set_async_unbuffered(f->parent,f->was_unbuffered);f->have_parent=false;}}
static void update(void*data,obs_data_t*s){struct filter*f=data;bool active=p_obs_data_get_bool(s,"native_active");EnterCriticalSection(&f->lock);double r=p_obs_data_get_double(s,"ratio");f->ratio=r>=.3&&r<=.8?r:.5;if(active!=!!f->active){InterlockedIncrement(&f->epoch);InterlockedExchange(&f->active,active);f->pending=false;}LeaveCriticalSection(&f->lock);if(!active)restore_parent(f);}
static void*create(obs_data_t*s,obs_source_t*source){struct filter*f=calloc(1,sizeof(*f));if(!f)return NULL;f->source=source;InitializeCriticalSection(&f->lock);InitializeCriticalSection(&f->output_lock);f->event=CreateEventW(NULL,FALSE,FALSE,NULL);f->input=malloc(BYTES);f->result=malloc(BYTES);f->display=malloc(BYTES);f->tensor=malloc(PIX*3*sizeof(float));f->downsample=.5;update(f,s);f->thread=CreateThread(NULL,0,work,f,0,NULL);return f;}
static void destroy(void*data){struct filter*f=data;if(!f)return;InterlockedExchange(&f->stop,1);SetEvent(f->event);if(f->thread)WaitForSingleObject(f->thread,INFINITE);restore_parent(f);p_obs_enter_graphics();if(f->capture)p_gs_texrender_destroy(f->capture);for(int i=0;i<2;i++)if(f->stage[i])p_gs_stagesurface_destroy(f->stage[i]);if(f->texture)p_gs_texture_destroy(f->texture);p_obs_leave_graphics();if(f->thread)CloseHandle(f->thread);CloseHandle(f->event);DeleteCriticalSection(&f->lock);DeleteCriticalSection(&f->output_lock);free(f->input);free(f->result);free(f->display);free(f->tensor);free(f);}
static void tick(void*data,float seconds){(void)seconds;struct filter*f=data;f->capture_due=true;}
static void render(void*data,gs_effect_t*unused){
    (void)unused;struct filter*f=data;obs_source_t*target=p_obs_filter_get_target(f->source);obs_source_t*parent=p_obs_filter_get_parent(f->source);
    if(!target||!parent||!f->active||f->failed){if(f->failed)metrics(f,"error");restore_parent(f);p_obs_source_skip_video_filter(f->source);return;}
    uint32_t width=p_obs_source_get_base_width(target),height=p_obs_source_get_base_height(target);if(!width||!height){p_obs_source_skip_video_filter(f->source);return;}
    LONG epoch=InterlockedCompareExchange(&f->epoch,0,0);
    if(f->display_epoch!=epoch)f->display_valid=false;
    // Consume completed output before staging/waking the next inference job.
    if(TryEnterCriticalSection(&f->output_lock)){if(f->output&&f->output_epoch==epoch&&(!f->display_valid||f->display_sequence!=f->produced)){uint8_t*spare=f->display;f->display=f->result;f->result=spare;f->display_at=f->output_at;f->display_sequence=f->produced;f->display_epoch=epoch;f->display_valid=true;}LeaveCriticalSection(&f->output_lock);}
    if(!f->have_parent){f->parent=parent;f->was_unbuffered=p_obs_source_async_unbuffered(parent);f->have_parent=true;p_obs_source_set_async_unbuffered(parent,true);}
    if(!f->capture)f->capture=p_gs_texrender_create(GS_RGBA,GS_ZS_NONE);for(int i=0;i<2;i++)if(!f->stage[i])f->stage[i]=p_gs_stagesurface_create(W,H,GS_RGBA);
    if(f->capture_epoch!=epoch){f->stage_valid[0]=f->stage_valid[1]=false;f->capture_epoch=epoch;}
    // OBS can render a source several times per tick (preview, output, snapshot).
    // Only stage one input per video tick; all consumers share the cached matte.
    bool video_frame=f->capture_due;
    if(f->capture_due){f->capture_due=false;
    // Read the previous tick's staging surface BEFORE submitting this tick's
    // copy. Never immediately map the surface just sent to the GPU.
    unsigned read=(f->stage_write+1)%2;uint8_t*pixels=NULL;uint32_t stride=0;
    if(f->stage_valid[read]){DWORD64 began=now_ms();
      if(p_gs_stagesurface_map(f->stage[read],&pixels,&stride)){if(TryEnterCriticalSection(&f->lock)){for(int y=0;y<H;y++)memcpy(f->input+y*W*4,pixels+y*stride,W*4);f->input_at=f->stage_at[read];f->input_epoch=epoch;f->pending=true;LeaveCriticalSection(&f->lock);SetEvent(f->event);}p_gs_stagesurface_unmap(f->stage[read]);}
      f->readback_ms=(double)(now_ms()-began);f->max_readback_ms=fmax(f->max_readback_ms,f->readback_ms);f->stage_valid[read]=false;
    }
    uint64_t captured=now_ms();p_gs_texrender_reset(f->capture);if(p_gs_texrender_begin(f->capture,W,H)){struct vec4 zero={0};p_gs_clear(GS_CLEAR_COLOR,&zero,0,0);p_gs_ortho(0,(float)width,0,(float)height,-100,100);p_gs_blend_state_push();p_gs_blend_function(GS_BLEND_ONE,GS_BLEND_ZERO);p_obs_source_video_render(target);p_gs_blend_state_pop();p_gs_texrender_end(f->capture);
      p_gs_stage_texture(f->stage[f->stage_write],p_gs_texrender_get_texture(f->capture));f->stage_at[f->stage_write]=captured;f->stage_valid[f->stage_write]=true;f->stage_write=read;
    }
    }
    f->age_ms=f->display_valid?(double)(now_ms()-f->display_at):0;
    bool output=f->display_valid;
    if(video_frame&&output){f->rendered_ticks++;f->ages[f->age_index++]=f->age_ms;if(f->age_index==AGE_WINDOW)f->age_index=0;if(f->age_count<AGE_WINDOW)f->age_count++;f->max_age_ms=fmax(f->max_age_ms,f->age_ms);if(f->last_tick_sequence==f->display_sequence)f->repeat_run++;else{f->repeat_run=0;f->last_tick_sequence=f->display_sequence;}if(f->repeat_run>f->max_repeat_run)f->max_repeat_run=f->repeat_run;}
    if(now_ms()-f->publish_at>1000){metrics(f,f->failed?"error":!output?"loading":f->age_ms>=250?"stalled":"ready");f->publish_at=now_ms();}
    // A missed processing deadline is a status, not a visibility switch.
    // Retain the last cutout until a newer result arrives. A stalled worker can
    // therefore freeze the cutout; report it instead of blinking or exposing the room.
    if(!output)return;
    if(!f->texture)f->texture=p_gs_texture_create(W,H,GS_RGBA,1,NULL,GS_DYNAMIC);
    if(f->uploaded_sequence!=f->display_sequence){p_gs_texture_set_image(f->texture,f->display,W*4,false);f->uploaded_sequence=f->display_sequence;f->texture_uploads++;}
    gs_effect_t*effect=p_obs_get_base_effect(OBS_EFFECT_DEFAULT);p_gs_effect_set_texture(p_gs_effect_get_param_by_name(effect,"image"),f->texture);while(p_gs_effect_loop(effect,"Draw"))p_gs_draw_sprite(f->texture,0,width,height);
}
static const char*name(void*x){(void)x;return "SceneSense Native Matting (GPU)";}
static void defaults(obs_data_t*s){p_obs_data_set_default_double(s,"ratio",.5);p_obs_data_set_default_bool(s,"native_active",true);}
static obs_properties_t*properties(void*x){(void)x;obs_properties_t*p=p_obs_properties_create();p_obs_properties_add_float_slider(p,"ratio","Detail / GPU cost",.375,.8,.025);return p;}
static void removed(void*data,obs_source_t*parent){(void)parent;restore_parent(data);}
MODULE_EXPORT const char*obs_module_description(void){return "SceneSense local native DirectML matting; latest-frame worker.";}
MODULE_EXPORT bool obs_module_load(void){
    HMODULE obs=GetModuleHandleW(L"obs.dll");if(!obs)return false;
#define LOAD(sym) p_##sym=(__typeof__(&sym))GetProcAddress(obs,#sym);if(!p_##sym)return false
    LOAD(blog);LOAD(obs_register_source_s);LOAD(obs_filter_get_target);LOAD(obs_filter_get_parent);LOAD(obs_source_video_render);LOAD(obs_source_default_render);LOAD(obs_source_skip_video_filter);LOAD(obs_source_get_base_width);LOAD(obs_source_get_base_height);LOAD(obs_get_base_effect);LOAD(obs_enter_graphics);LOAD(obs_leave_graphics);LOAD(obs_source_get_settings);LOAD(obs_data_set_string);LOAD(obs_data_set_double);LOAD(obs_data_set_int);LOAD(obs_data_get_double);LOAD(obs_data_get_bool);LOAD(obs_data_set_default_double);LOAD(obs_data_set_default_bool);LOAD(obs_data_release);LOAD(obs_source_async_unbuffered);LOAD(obs_source_set_async_unbuffered);LOAD(gs_texrender_create);LOAD(gs_texrender_destroy);LOAD(gs_texrender_reset);LOAD(gs_texrender_begin);LOAD(gs_texrender_end);LOAD(gs_texrender_get_texture);LOAD(gs_stagesurface_create);LOAD(gs_stagesurface_destroy);LOAD(gs_stagesurface_map);LOAD(gs_stagesurface_unmap);LOAD(gs_stage_texture);LOAD(gs_texture_create);LOAD(gs_texture_destroy);LOAD(gs_texture_set_image);LOAD(gs_draw_sprite);LOAD(gs_effect_get_param_by_name);LOAD(gs_effect_set_texture);LOAD(gs_effect_loop);LOAD(gs_ortho);LOAD(gs_clear);LOAD(gs_blend_state_push);LOAD(gs_blend_state_pop);LOAD(gs_blend_function);LOAD(obs_properties_create);LOAD(obs_properties_add_float_slider);
    HMODULE self=NULL;GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS|GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,(LPCWSTR)&obs_module_load,&self);GetModuleFileNameW(self,folder,MAX_PATH);wchar_t*slash=wcsrchr(folder,L'\\');if(!slash)return false;*slash=0;
    wchar_t dll[MAX_PATH];swprintf(dll,MAX_PATH,L"%ls\\scenesense-ort.dll",folder);runtime=LoadLibraryExW(dll,NULL,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);if(!runtime)return false;
    const OrtApiBase* (ORT_API_CALL*base)(void)=(void*)GetProcAddress(runtime,"OrtGetApiBase");if(!base||(ort=base()->GetApi(ORT_API_VERSION))==NULL)return false;
    struct obs_source_info info={.id="scenesense_native_matting",.type=OBS_SOURCE_TYPE_FILTER,.output_flags=OBS_SOURCE_VIDEO,.get_name=name,.create=create,.destroy=destroy,.update=update,.get_defaults=defaults,.get_properties=properties,.video_tick=tick,.video_render=render,.filter_remove=removed};p_obs_register_source_s(&info,sizeof(info));return true;
}
