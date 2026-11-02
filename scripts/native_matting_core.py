"""Shared native RVM reference path. Local inference; no capture or network."""
import ctypes as C
import time
import cv2
import numpy as np
import onnxruntime as ort

def adapters():
    class GUID(C.Structure):
        _fields_=[('a',C.c_uint32),('b',C.c_uint16),('c',C.c_uint16),('d',C.c_ubyte*8)]
    class LUID(C.Structure):
        _fields_=[('low',C.c_uint32),('high',C.c_int32)]
    class DESC(C.Structure):
        _fields_=[('description',C.c_wchar*128),('vendor',C.c_uint32),('device',C.c_uint32),('subsystem',C.c_uint32),('revision',C.c_uint32),('video',C.c_size_t),('system',C.c_size_t),('shared',C.c_size_t),('luid',LUID),('flags',C.c_uint32)]
    guid=GUID(0x770aae78,0xf26f,0x4dba,(C.c_ubyte*8)(0xa8,0x29,0x25,0x3c,0x83,0xd1,0xb3,0x87))
    factory=C.c_void_p();create=C.windll.dxgi.CreateDXGIFactory1
    create.argtypes=[C.POINTER(GUID),C.POINTER(C.c_void_p)];create.restype=C.c_long
    if create(C.byref(guid),C.byref(factory))!=0:raise RuntimeError('DXGI enumeration failed')
    def method(ptr,index,result,*args):
        table=C.cast(ptr,C.POINTER(C.POINTER(C.c_void_p))).contents
        return C.WINFUNCTYPE(result,C.c_void_p,*args)(table[index])
    found=[]
    try:
        enum=method(factory,12,C.c_long,C.c_uint32,C.POINTER(C.c_void_p))
        for i in range(8):
            adapter=C.c_void_p()
            if enum(factory,i,C.byref(adapter))!=0:break
            try:
                desc=DESC();hr=method(adapter,10,C.c_long,C.POINTER(DESC))(adapter,C.byref(desc))
                if hr==0:found.append({'id':i,'name':desc.description,'vendor':desc.vendor,'vramMiB':int(desc.video/1024/1024),'software':bool(desc.flags&2)})
            finally:method(adapter,2,C.c_uint32)(adapter)
    finally:method(factory,2,C.c_uint32)(factory)
    return found

class NativeMatting:
    def __init__(self,model,ratio=.375,precision='fp32',cpu=False,profile=None):
        if not 0 < ratio <= 1:raise ValueError('Invalid internal ratio')
        self.gpu=next((a for a in adapters() if a['vendor']==0x10de and not a['software']),None) if not cpu else None
        if not cpu and (not self.gpu or 'DmlExecutionProvider' not in ort.get_available_providers()):raise RuntimeError('Verified NVIDIA DirectML backend unavailable')
        options=ort.SessionOptions();options.enable_mem_pattern=False;options.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL
        options.intra_op_num_threads=2;options.inter_op_num_threads=1;options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_ENABLE_ALL;options.log_severity_level=3
        if profile:options.enable_profiling=True;options.profile_file_prefix=str(profile)
        providers=['CPUExecutionProvider'] if cpu else [('DmlExecutionProvider',{'device_id':self.gpu['id']})]
        self.session=ort.InferenceSession(str(model),sess_options=options,providers=providers);self.session.disable_fallback()
        self.dtype=np.float16 if precision=='fp16' else np.float32
        self.ratio=np.asarray([ratio],np.float32);self.reset()
    def reset(self):self.rec=[np.zeros((1,1,1,1),dtype=self.dtype) for _ in range(4)]
    def infer(self,bgr):
        start=time.perf_counter()
        if bgr.shape!=(360,640,3):raise ValueError('Native experiment expects 640x360 BGR input')
        src=np.ascontiguousarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB).transpose(2,0,1)[None],dtype=np.float32);src*=np.float32(1/255)
        if self.dtype==np.float16:src=src.astype(np.float16)
        inference_start=time.perf_counter()
        fgr,pha,*self.rec=self.session.run(None,{'src':src,'downsample_ratio':self.ratio,**{'r'+str(i+1)+'i':r for i,r in enumerate(self.rec)}})
        inference_ms=(time.perf_counter()-inference_start)*1000
        rgb=np.clip(fgr[0].transpose(1,2,0).astype(np.float32),0,1);alpha=np.clip(pha[0,0].astype(np.float32),0,1)
        rgba=np.concatenate((rgb,alpha[:,:,None]),axis=2);rgba*=255;np.rint(rgba,out=rgba)
        return rgba.astype(np.uint8),(time.perf_counter()-start)*1000,inference_ms
