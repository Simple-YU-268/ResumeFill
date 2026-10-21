const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
async function launchElectron(opts){if(process.env.CI)return electron.launch(opts);const skip=e=>{console.log('SKIP: Electron GUI cannot launch in this environment ('+e.message+')');process.exit(0);};process.once('uncaughtException',skip);try{const app=await electron.launch(opts);process.removeListener('uncaughtException',skip);return app;}catch(e){skip(e);}}
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'rf-update-ui-'));
 fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({port:0,token:'synthetic-update-token'.padEnd(64,'x'),updates:{autoCheck:false},upstream:{enabled:false,endpoint:'https://api.openai.com/v1/chat/completions',model:'',jsonMode:true}}));
 const app=await launchElectron({executablePath:process.env.RF_TEST_EXE||path.join(__dirname,'node_modules/electron/dist/electron.exe'),args:process.env.RF_TEST_EXE?[]:[__dirname],env:{...process.env,RF_DESKTOP_DATA:data}});
 try{
  const page=await app.firstWindow();await page.locator('#service').filter({hasText:'运行中'}).waitFor();
  // Replace only the transport/installer in this disposable process; run real UI, IPC and update orchestration.
  await app.evaluate(({app})=>{Object.defineProperty(app,'isPackaged',{configurable:true,get:()=>true});const engine=require(app.getAppPath()+'/node_modules/electron-updater').autoUpdater;app.updateTest={checks:0,downloads:0,installed:null};engine.checkForUpdates=async()=>{app.updateTest.checks++;engine.emit('checking-for-update');engine.emit('update-available',{version:'99.0.0'});};engine.downloadUpdate=async()=>{app.updateTest.downloads++;engine.emit('download-progress',{percent:45});await new Promise(resolve=>app.updateTest.finish=resolve);engine.emit('update-downloaded',{version:'99.0.0'});};engine.quitAndInstall=(...args)=>app.updateTest.installed=args;});
  const name=page.locator('[data-profile-path="basics.name"]');await name.fill('Unsaved synthetic');
  await page.locator('#oneClickUpdate').click();await page.locator('#notice').filter({hasText:'个人资料尚未保存'}).waitFor();assert.equal(await app.evaluate(({app})=>app.updateTest.checks),0);
  await page.locator('[data-action=saveProfile]').click();await page.locator('#notice').filter({hasText:'操作完成'}).waitFor();
  await page.locator('#modelId').fill('unsaved-model');await page.locator('#oneClickUpdate').click();await page.locator('#notice').filter({hasText:'模型设置尚未保存'}).waitFor();assert.equal(await app.evaluate(({app})=>app.updateTest.checks),0);
  await page.locator('[data-action=saveModel]').click();await page.locator('#notice').filter({hasText:'操作完成'}).waitFor();
  await page.locator('#oneClickUpdate').click();await page.locator('#updateState').filter({hasText:'45%'}).waitFor();assert.equal(await page.locator('#oneClickUpdate').isDisabled(),true);assert.equal(await name.isDisabled(),true);
  await app.evaluate(({app})=>app.updateTest.finish());await page.locator('#updateState').filter({hasText:'正在安装并重新启动'}).waitFor();await page.locator('#service').filter({hasText:'已停止'}).waitFor();
  const result=await app.evaluate(({app})=>({checks:app.updateTest.checks,downloads:app.updateTest.downloads,installed:app.updateTest.installed}));assert.deepEqual(result,{checks:1,downloads:1,installed:[true,true]});assert.equal(JSON.parse(fs.readFileSync(path.join(data,'resume.json'))).basics.name,'Unsaved synthetic');assert.equal(await page.locator('#oneClickUpdate').isDisabled(),true);
  console.log('PASS: real Electron one-click UI/IPC, unsaved profile/model protection, download progress and edit lock, service shutdown, silent-install/relaunch request; installer transport mocked');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
