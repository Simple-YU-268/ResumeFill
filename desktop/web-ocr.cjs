const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
class WebOCR{
 constructor({forkImpl=fork,idleMs=300000,timeoutMs=85000}={}){this.active=null;this.worker=null;this.idleTimer=null;this.forkImpl=forkImpl;this.idleMs=idleMs;this.timeoutMs=timeoutMs;}
 async recognize(input,{signal}={}){
  if(this.active)throw Object.assign(Error('OCR 正在运行'),{status:429});if(signal?.aborted)throw Error('OCR 已取消');
  if(typeof input?.image!=='string'||!input.image.startsWith('data:image/png;base64,')||input.image.length>11000000)throw Error('截图格式或大小无效');const base64=input.image.slice(22);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('截图编码无效');const image=Buffer.from(base64,'base64');if(image.length<24||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('仅支持 PNG 截图');const width=image.readUInt32BE(16),height=image.readUInt32BE(20);if(!width||!height||width>6000||height>6000||width*height>12000000)throw Error('截图分辨率过大');
  const masks=input.masks||[];if(!Array.isArray(masks)||masks.length>200||masks.some(m=>!['x','y','width','height'].every(k=>Number.isFinite(m[k])&&m[k]>=0&&m[k]<=1)||m.x+m.width>1.001||m.y+m.height>1.001))throw Error('控件遮罩无效');
  const bundled=process.resourcesPath&&path.join(process.resourcesPath,'agent/ocr-data');const modelPath=bundled&&fs.existsSync(bundled)?bundled:path.join(__dirname,'resources/ocr-data');
  clearTimeout(this.idleTimer);
  if(!this.worker){
   this.worker=this.forkImpl(path.join(__dirname,'web-ocr-worker.cjs'),[],{execPath:process.execPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',RF_OCR_DATA_PATH:modelPath},windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
   const child=this.worker;const reset=()=>{if(this.worker===child)this.worker=null;};child.on('exit',reset);child.on('error',reset);
  }
  return await new Promise((resolve,reject)=>{
   const worker=this.worker;let done=false;
   const abort=()=>finish(Error('网页 OCR 已取消'));
   const onMessage=result=>result.error?finish(Error(result.error)):finish(null,result);
   const onError=()=>finish(Error('OCR 进程启动失败'));
   const onExit=()=>finish(Error('OCR 已中断'));
   const finish=(error,result)=>{
    if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
    worker.removeListener('message',onMessage);worker.removeListener('error',onError);worker.removeListener('exit',onExit);
    if(this.active===abort)this.active=null;
    if(error){if(this.worker===worker)this.worker=null;worker.kill();reject(error);}
    else{this.idleTimer=setTimeout(()=>this.cancel(),this.idleMs);this.idleTimer.unref?.();resolve(result);}
   };
   this.active=abort;const timer=setTimeout(()=>finish(Error('网页 OCR 超时')),this.timeoutMs);
   signal?.addEventListener('abort',abort,{once:true});worker.on('message',onMessage);worker.on('error',onError);worker.on('exit',onExit);
   if(signal?.aborted)abort();else worker.send({base64,width,height,masks},e=>{if(e)onError();});
  });
 }
 cancel(){clearTimeout(this.idleTimer);this.active?.();const child=this.worker;this.worker=null;child?.kill();}
}module.exports={WebOCR};
