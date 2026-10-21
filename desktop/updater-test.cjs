const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{createUpdater}=require('./updater.cjs');
function fixture({packaged=true,available=true,fail=false}={}){
 const engine=new EventEmitter(),calls=[],states=[],deferred=[];
 engine.checkForUpdates=async()=>{calls.push('check');engine.emit('checking-for-update');if(fail)throw Error('synthetic network failure');engine.emit(available?'update-available':'update-not-available',{version:'99.0.0'});};
 engine.downloadUpdate=async()=>{calls.push('download');engine.emit('download-progress',{percent:52.4});engine.emit('update-downloaded',{version:'99.0.0'});};
 engine.quitAndInstall=(...args)=>calls.push(['install',...args]);
 const updater=createUpdater({autoUpdater:engine,isPackaged:()=>packaged,publish:s=>states.push(s),beforeInstall:async()=>calls.push('stop-service'),defer:fn=>deferred.push(fn)});
 return {engine,calls,states,deferred,updater};
}
(async()=>{
 let f=fixture();const a=f.updater.oneClick(),b=f.updater.oneClick();assert.equal(a,b);await a;
 assert.deepEqual(f.calls,['check','download','stop-service']);assert.equal(f.updater.state().phase,'installing');assert.ok(f.states.some(s=>s.phase==='downloading'&&s.percent===52));assert.equal(f.deferred.length,1);f.deferred[0]();assert.deepEqual(f.calls.at(-1),['install',true,true]);assert.equal(f.engine.autoDownload,false);assert.equal(f.engine.autoInstallOnAppQuit,false);
 f=fixture({available:false});await f.updater.oneClick();assert.deepEqual(f.calls,['check']);assert.equal(f.updater.state().phase,'none');assert.equal(f.deferred.length,0);
 f=fixture({fail:true});await assert.rejects(f.updater.oneClick(),/network/);assert.equal(f.updater.state().phase,'error');assert.equal(f.updater.state().busy,false);assert.equal(f.deferred.length,0);
 f=fixture({packaged:false});await assert.rejects(f.updater.oneClick(),/安装版/);assert.deepEqual(f.calls,[]);
 f=fixture();await assert.rejects(f.updater.install(),/尚未下载/);assert.equal(f.deferred.length,0);await f.updater.check();await f.updater.download();await f.updater.install();assert.deepEqual(f.calls,['check','download','stop-service']);
 const engine=new EventEmitter();engine.quitAndInstall=()=>{throw Error('must not install');};const updater=createUpdater({autoUpdater:engine,isPackaged:()=>true,beforeInstall:async()=>{throw Error('active task');}});engine.emit('update-downloaded',{version:'99.0.0'});await assert.rejects(updater.install(),/active task/);
 console.log('PASS: one-click check/download/stop/silent-install/relaunch, duplicate coalescing, latest-version no-op, errors, development guard, staged flow and active-task refusal');
})().catch(e=>{console.error(e);process.exitCode=1;});
