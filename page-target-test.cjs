const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rf-page-target-')),extension=path.join(temp,'extension');fs.mkdirSync(extension);
 for(const file of fs.readdirSync(__dirname).filter(f=>/\.(js|html|css|json|svg)$/.test(f)&&f!=='resume.json'))fs.copyFileSync(path.join(__dirname,file),path.join(extension,file));fs.cpSync(path.join(__dirname,'data'),path.join(extension,'data'),{recursive:true});
fs.cpSync(path.join(__dirname,'icons'),path.join(extension,'icons'),{recursive:true});
 fs.writeFileSync(path.join(extension,'desktop-connect.js'),'// Auto-pair UI has its own isolated integration suite.');const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));manifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<label>姓名<input></label>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launchPersistentContext(path.join(temp,'browser'),{...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true,args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 try{
  const manager=await browser.newPage();await manager.goto('edge://extensions/');const id=await manager.evaluate(()=>new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({},items=>resolve(items.find(e=>e.name.includes('ResumeFill'))?.id))));assert.ok(id);
  const target=await browser.newPage();await target.goto('http://127.0.0.1:'+server.address().port+'/form');const popup=await browser.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const tabs=await popup.evaluate(()=>chrome.tabs.query({})),tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));assert.ok(tab);
  await popup.evaluate(async tab=>{window.testTab=tab;window.injections=0;window.failInjection=false;const inject=chrome.scripting.executeScript.bind(chrome.scripting);chrome.scripting.executeScript=async args=>{window.injections++;if(window.failInjection)throw Error('The extensions gallery cannot be scripted.');return inject(args);};chrome.tabs.query=async()=>window.testTab?[window.testTab]:[];await chrome.storage.local.set({autoAIEnabled:false,resume:{basics:{name:'Synthetic Candidate'}}});},tab);
  const scan=async()=>{await popup.locator('#scan').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  await scan();assert.equal(await popup.locator('#fields .row').count(),1);assert.equal(await popup.locator('#fill').isEnabled(),true);const initial=await popup.evaluate(()=>injections);
  for(const url of ['edge://extensions/','chrome://extensions/','https://microsoftedge.microsoft.com/addons/detail/test','https://chromewebstore.google.com/detail/test','https://chrome.google.com/webstore/detail/test','about:blank']){
   await popup.evaluate(url=>window.testTab={id:1,url},url);await scan();assert.match(await popup.locator('#status').innerText(),/切回招聘网站/);assert.equal(await popup.locator('#fields .row').count(),0);assert.equal(await popup.locator('#fill').isEnabled(),false);assert.equal(await popup.evaluate(()=>injections),initial);
  }
  await popup.evaluate(()=>window.testTab=null);await scan();assert.match(await popup.locator('#status').innerText(),/无法读取当前页面地址/);
  await popup.evaluate(tab=>{window.testTab=tab;window.failInjection=true;},tab);await scan();assert.match(await popup.locator('#status').innerText(),/浏览器限制了此页面/);assert.ok(!(await popup.locator('#status').innerText()).includes('extensions gallery'));assert.equal(await popup.locator('#fill').isEnabled(),false);
  await popup.evaluate(()=>window.failInjection=false);await scan();assert.equal(await popup.locator('#fields .row').count(),1);
  await popup.evaluate(()=>window.testTab={id:1,url:'edge://extensions/'});await popup.locator('#fill').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);assert.equal(await target.locator('input').inputValue(),'');assert.equal(await popup.locator('#fill').isEnabled(),false);assert.match(await popup.locator('#status').innerText(),/切回招聘网站/);
  console.log('PASS: installed extension blocks browser/gallery pages before injection, clears stale fill state, translates late gallery errors, recovers on forms and prevents wrong-tab fills');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
