// Keep the update state machine independent of Electron for deterministic verification.
function createUpdater({autoUpdater,isPackaged,publish=()=>{},beforeInstall=async()=>{},defer=setImmediate}){
 let state={phase:'idle'},job=null;
 const snapshot=()=>({...state,busy:!!job||state.phase==='installing'});
 const emit=next=>{if(next)state=next;publish(snapshot());};
 autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.on('checking-for-update',()=>emit({phase:'checking'}));
 autoUpdater.on('update-available',info=>emit({phase:'available',version:info.version}));
 autoUpdater.on('update-not-available',()=>emit({phase:'none'}));
 autoUpdater.on('download-progress',p=>emit({phase:'downloading',version:state.version,percent:Math.max(0,Math.min(100,Math.round(p.percent||0)))}));
 autoUpdater.on('update-downloaded',info=>emit({phase:'ready',version:info.version}));
 const diagnostic=e=>/sha512|checksum|signature|digest/i.test(e?.message||'')?{code:'RF_UPDATE_INTEGRITY',message:'更新校验失败，请重新下载或到发行页核对文件'}:/404|latest.yml|not found/i.test(e?.message||'')?{code:'RF_UPDATE_FEED',message:'未找到更新元数据，请检查发行页'}:{code:'RF_UPDATE_NETWORK',message:'更新连接失败，请检查网络后重试'};
 autoUpdater.on('error',e=>emit({phase:'error',...diagnostic(e)}));
 const guard=()=>{if(!isPackaged())throw Error('请在安装版 EXE 中使用更新功能');};
 function exclusive(fn){if(job)return job;if(state.phase==='installing')return Promise.resolve(snapshot());job=Promise.resolve().then(()=>{guard();return fn();}).catch(e=>{emit({phase:'error',...diagnostic(e)});throw e;}).finally(()=>{job=null;emit();});emit();return job;}
 async function check(){if(!['available','ready'].includes(state.phase)){emit({phase:'checking'});await autoUpdater.checkForUpdates();}return snapshot();}
 async function download(){if(state.phase==='ready')return snapshot();if(state.phase!=='available')throw Error('请先检查并找到可用更新');await autoUpdater.downloadUpdate();if(state.phase!=='ready')throw Error('更新下载未完成，请重试');return snapshot();}
 async function install(){if(state.phase!=='ready')throw Error('更新尚未下载完成');await beforeInstall();emit({...state,phase:'installing'});defer(()=>autoUpdater.quitAndInstall(true,true));return snapshot();}
 return {state:snapshot,check:()=>exclusive(check),download:()=>exclusive(download),install:()=>exclusive(install),oneClick:()=>exclusive(async()=>{await check();if(state.phase==='none')return snapshot();await download();return install();})};
}
module.exports={createUpdater};
