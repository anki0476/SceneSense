"""Final local RVM feasibility experiment. No camera, network or OBS access.

Model interface follows PeterL1n/RobustVideoMatting documentation/inference.md.
DirectML sessions use sequential execution and no memory patterns. The verified
reference path copies recurrent states through CPU memory. GPU I/O binding was
unstable on this machine and is deliberately excluded from this executable.
"""
import argparse, ctypes as C, json, pathlib, time, collections
import cv2
import numpy as np
import onnxruntime as ort

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'matting-evaluation-20261101' / 'native'
OUT.mkdir(parents=True, exist_ok=True)

def adapters():
    class GUID(C.Structure):
        _fields_=[('a',C.c_uint32),('b',C.c_uint16),('c',C.c_uint16),('d',C.c_ubyte*8)]
    class LUID(C.Structure):
        _fields_=[('low',C.c_uint32),('high',C.c_int32)]
    class DESC(C.Structure):
        _fields_=[('description',C.c_wchar*128),('vendor',C.c_uint32),('device',C.c_uint32),('subsystem',C.c_uint32),('revision',C.c_uint32),('video',C.c_size_t),('system',C.c_size_t),('shared',C.c_size_t),('luid',LUID),('flags',C.c_uint32)]
    guid=GUID(0x770aae78,0xf26f,0x4dba,(C.c_ubyte*8)(0xa8,0x29,0x25,0x3c,0x83,0xd1,0xb3,0x87))
    factory=C.c_void_p()
    create=C.windll.dxgi.CreateDXGIFactory1
    create.argtypes=[C.POINTER(GUID),C.POINTER(C.c_void_p)];create.restype=C.c_long
    if create(C.byref(guid),C.byref(factory))!=0: raise RuntimeError('DXGI enumeration failed')
    def method(ptr,index,result,*args):
        table=C.cast(ptr,C.POINTER(C.POINTER(C.c_void_p))).contents
        return C.WINFUNCTYPE(result,C.c_void_p,*args)(table[index])
    found=[]
    try:
        enum=method(factory,12,C.c_long,C.c_uint32,C.POINTER(C.c_void_p))
        for i in range(8):
            adapter=C.c_void_p()
            if enum(factory,i,C.byref(adapter))!=0: break
            try:
                desc=DESC();hr=method(adapter,10,C.c_long,C.POINTER(DESC))(adapter,C.byref(desc))
                if hr==0:found.append({'id':i,'name':desc.description,'vendor':desc.vendor,'vramMiB':int(desc.video/1024/1024),'software':bool(desc.flags&2)})
            finally:method(adapter,2,C.c_uint32)(adapter)
    finally:method(factory,2,C.c_uint32)(factory)
    return found

def summaries(values):
    a=np.asarray(values,dtype=np.float64)
    return {'medianMs':float(np.median(a)), 'p95Ms':float(np.percentile(a,95)), 'meanMs':float(a.mean()), 'maxMs':float(a.max())}

def save_json(file,data):
    file.write_text(json.dumps(data,indent=2),encoding='utf8')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--precision',choices=['fp16','fp32'],default='fp32');parser.add_argument('--ratio',type=float,default=.375);parser.add_argument('--frames',type=int,default=0);parser.add_argument('--cpu',action='store_true');parser.add_argument('--naive',action='store_true',help='Compatibility alias; the verified reference path is always used.');args=parser.parse_args()
    if not 0 < args.ratio <= 1:raise ValueError('Ratio must be between zero and one')
    tag=('cpu-' if args.cpu else 'directml-')+args.precision+'-'+str(args.ratio)+'-reference'
    available=adapters();gpu=next((a for a in available if a['vendor']==0x10de and not a['software']),None)
    if not args.cpu and not gpu:raise RuntimeError('NVIDIA DXGI adapter not found; refusing an unverified GPU test')
    if not args.cpu and 'DmlExecutionProvider' not in ort.get_available_providers():raise RuntimeError('DirectML unavailable')
    print(json.dumps({'phase':'loading','tag':tag,'runtime':ort.__version__,'adapters':available,'selected':gpu}),flush=True)
    options=ort.SessionOptions();options.enable_mem_pattern=False;options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL;options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL;options.enable_profiling=True;options.profile_file_prefix=str(OUT/(tag+'-profile'));options.log_severity_level=3
    providers=['CPUExecutionProvider'] if args.cpu else [('DmlExecutionProvider',{'device_id':gpu['id']})]
    model=ROOT/'.tmp-review'/'native-matting'/'models'/('rvm_mobilenetv3_'+args.precision+'.onnx')
    started=time.perf_counter();session=ort.InferenceSession(str(model),sess_options=options,providers=providers);session.disable_fallback()
    dtype=np.float16 if args.precision=='fp16' else np.float32
    ratio=np.asarray([args.ratio],np.float32)
    def initial():return [np.zeros((1,1,1,1),dtype=dtype) for _ in range(4)]
    rec=initial()
    def infer(bgr):
        nonlocal rec
        frame_start=time.perf_counter()
        src=np.ascontiguousarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB).transpose(2,0,1)[None],dtype=np.float32)
        src*=np.float32(1/255)
        if dtype==np.float16:src=src.astype(np.float16)
        inference_start=time.perf_counter()
        fgr,pha,*rec=session.run(None,{'src':src,'downsample_ratio':ratio,**{'r'+str(i+1)+'i':r for i,r in enumerate(rec)}})
        inference_ms=(time.perf_counter()-inference_start)*1000
        rgb=np.clip(fgr[0].transpose(1,2,0).astype(np.float32),0,1);alpha=np.clip(pha[0,0].astype(np.float32),0,1)
        rgba=np.concatenate((rgb,alpha[:,:,None]),axis=2);rgba*=255;np.rint(rgba,out=rgba);rgba=rgba.astype(np.uint8)
        return rgba,(time.perf_counter()-frame_start)*1000,inference_ms
    frame=cv2.imread(str(OUT.parent/'raw-4000.png'))
    if frame is None:raise RuntimeError('Saved reference image missing')
    for _ in range(5):infer(frame)
    profile=session.end_profiling();events=json.loads(pathlib.Path(profile).read_text(encoding='utf8'))
    provider_counts=collections.Counter(e.get('args',{}).get('provider') for e in events if e.get('cat')=='Node' and e.get('args',{}).get('provider'))
    if not args.cpu and not provider_counts.get('DmlExecutionProvider'):raise RuntimeError('Profiling did not prove DirectML execution')
    print(json.dumps({'phase':'warm','tag':tag,'providers':dict(provider_counts),'loadAndWarmupSeconds':time.perf_counter()-started}),flush=True)
    static_times=[];infer_times=[]
    for _ in range(40):rgba,ms,ims=infer(frame);static_times.append(ms);infer_times.append(ims)
    cv2.imwrite(str(OUT/(tag+'-static.png')),cv2.cvtColor(rgba,cv2.COLOR_RGBA2BGRA))
    static={'processing':summaries(static_times),'inferenceWithReadback':summaries(infer_times)}
    rec=initial();capture=cv2.VideoCapture(str(OUT.parent/'raw.mkv'));fps=capture.get(cv2.CAP_PROP_FPS);times=[];model_times=[];decode_times=[];frames=0;motion_start=time.perf_counter();next_sample=4;samples=[]
    # Local video output excluded from timings. Save representative RGBA frames separately.
    writer=cv2.VideoWriter(str(OUT/(tag+'-black.mp4')),cv2.VideoWriter_fourcc(*'mp4v'),fps,(640,360));wall_start=time.perf_counter()
    while True:
        read_start=time.perf_counter();ok,frame=capture.read();decode=(time.perf_counter()-read_start)*1000
        if not ok:break
        if args.frames and frames>=args.frames:break
        rgba,ms,ims=infer(frame);times.append(ms+decode);model_times.append(ims);decode_times.append(decode)
        alpha=rgba[:,:,3:4].astype(np.float32)/255;rgb=rgba[:,:,:3].astype(np.float32);black=np.rint(rgb*alpha).astype(np.uint8)
        writer.write(cv2.cvtColor(black,cv2.COLOR_RGB2BGR));frames+=1;t=frames/fps
        if t>=next_sample:
            file=tag+'-'+str(int(next_sample*1000))+'.png';cv2.imwrite(str(OUT/file),cv2.cvtColor(rgba,cv2.COLOR_RGBA2BGRA));samples.append({'inputTime':t,'file':file});next_sample+=4
        if frames%150==0:print(json.dumps({'phase':'motion','tag':tag,'frames':frames,'medianMs':float(np.median(times))}),flush=True)
        if time.perf_counter()-motion_start>180:raise RuntimeError('Motion benchmark exceeded three-minute execution limit')
    capture.release();writer.release();processing_fps=1000/(sum(times)/len(times));wall_seconds=time.perf_counter()-wall_start
    result={'tag':tag,'runtime':ort.__version__,'providers':session.get_providers(),'profileNodeProviders':dict(provider_counts),'gpu':gpu,'precision':args.precision,'ratio':args.ratio,'inputResolution':[640,360],'recurrentStateOnGPU':not args.cpu,'static':static,'motion':{'frames':frames,'clipSeconds':frames/fps,'processingIncludingDecode':summaries(times),'inferenceAndReadback':summaries(model_times),'decode':summaries(decode_times),'processingFps':processing_fps,'wallSecondsIncludingExport':wall_seconds,'samples':samples},'limitations':['Isolated native processing; no physical camera, production OBS transport or Asphalt contention measured.','Processing includes CPU frame normalization, GPU inference, GPU/CPU transfers, foreground and alpha extraction, compositing preparation, and decode. Video encoding is excluded.','No ground-truth mask; no quality percentage.']}
    result['recurrentStateOnGPU']=False
    if args.cpu:result['gpu']=None
    save_json(OUT/(tag+'-results.json'),result);print(json.dumps({'phase':'complete',**result}),flush=True)

if __name__=='__main__':main()
