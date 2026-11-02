"""Bounded pipe worker. Input is local JPEG/PNG, output straight RGBA; no camera/network."""
import argparse, collections, json, pathlib, struct, sys, time
import cv2
import numpy as np
from native_matting_core import NativeMatting

def read_exact(size):
    chunks=[];remaining=size
    while remaining:
        part=sys.stdin.buffer.read(remaining)
        if not part:
            if not chunks:return None
            raise EOFError('Incomplete local input packet')
        chunks.append(part);remaining-=len(part)
    return b''.join(chunks)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model',required=True);parser.add_argument('--profile',required=True);parser.add_argument('--transport',choices=['raw','png','jpeg-alpha'],default='jpeg-alpha');args=parser.parse_args()
    engine=NativeMatting(args.model,profile=args.profile)
    for _ in range(5):engine.infer(np.zeros((360,640,3),np.uint8))
    profile=engine.session.end_profiling();events=json.loads(pathlib.Path(profile).read_text())
    counts=collections.Counter(e.get('args',{}).get('provider') for e in events if e.get('cat')=='Node' and e.get('args',{}).get('provider'))
    if not counts.get('DmlExecutionProvider'):raise RuntimeError('DirectML execution was not verified')
    engine.reset()
    print(json.dumps({'ready':True,'gpu':engine.gpu,'providers':dict(counts),'ratio':.375}),file=sys.stderr,flush=True)
    while True:
        head=read_exact(16)
        if head is None:return
        size,seq,captured=struct.unpack('<IId',head)
        if not 0<size<=4*1024*1024:raise ValueError('Invalid input size')
        data=read_exact(size)
        if data is None:raise EOFError('Input frame missing')
        started=time.time()*1000
        image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
        if image is None:raise ValueError('Input image could not be decoded')
        if image.shape!=(360,640,3):image=cv2.resize(image,(640,360))
        decoded=time.time()*1000
        rgba,processing_ms,inference_ms=engine.infer(image);finished=time.time()*1000
        if args.transport=='png':
            # Undefined RGB under zero alpha need not consume transport bandwidth.
            rgba[rgba[:,:,3]==0,:3]=0
            ok,encoded=cv2.imencode('.png',cv2.cvtColor(rgba,cv2.COLOR_RGBA2BGRA),[cv2.IMWRITE_PNG_COMPRESSION,1])
            if not ok:raise RuntimeError('Local PNG encoding failed')
            payload=encoded.tobytes();head=struct.pack('<4sIIIdddI',b'SSPN',seq,640,360,captured,started,finished,len(payload))
        elif args.transport=='jpeg-alpha':
            # JPEG only for foreground colour; retain the exact 8-bit soft alpha losslessly.
            ok,colour=cv2.imencode('.jpg',cv2.cvtColor(rgba[:,:,:3],cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,97])
            mask_ok,alpha=cv2.imencode('.png',rgba[:,:,3],[cv2.IMWRITE_PNG_COMPRESSION,1])
            if not ok or not mask_ok:raise RuntimeError('Local colour/alpha encoding failed')
            payload=colour.tobytes()+alpha.tobytes();head=struct.pack('<4sIIIdddII',b'SSJP',seq,640,360,captured,started,finished,len(payload),len(colour))
        else:payload=rgba.tobytes();head=struct.pack('<4sIIIddd',b'SSRG',seq,640,360,captured,started,finished)
        if seq%90==0:print(json.dumps({'timingSample':{'decodeMs':decoded-started,'processingMs':processing_ms,'inferenceMs':inference_ms,'encodingMs':time.time()*1000-finished}}),file=sys.stderr,flush=True)
        sys.stdout.buffer.write(head);sys.stdout.buffer.write(payload);sys.stdout.buffer.flush()

if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'error':str(error)[:300]}),file=sys.stderr,flush=True);sys.exit(1)
