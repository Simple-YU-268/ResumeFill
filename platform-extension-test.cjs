const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rf-platform-extension-')),extension=path.join(temp,'extension');
 for(const file of require('./scripts/runtime-files.cjs')){fs.mkdirSync(path.dirname(path.join(extension,file)),{recursive:true});fs.copyFileSync(path.join(__dirname,file),path.join(extension,file));}
 fs.cpSync(path.join(__dirname,'data'),path.join(extension,'data'),{recursive:true});
 fs.writeFileSync(path.join(extension,'desktop-connect.js'),'// Synthetic isolated extension test.');
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));manifest.host_permissions=['https://synthetic.zhiye.com/*'];fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(path.join(temp,'browser'),{channel:'msedge',headless:true,args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`]});
 try{
  await context.route('https://synthetic.zhiye.com/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<section><h2>基本信息</h2><div class="ux-standard-form"><div class="form-item"><div class="form-item__text">姓名</div><input id="person"></div></div></section><button id="submit" onclick="window.submitted=true">提交</button>'}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=worker.url().split('/')[2],target=await context.newPage();
  await target.goto('https://synthetic.zhiye.com/form');const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');
  const tab=(await popup.evaluate(()=>chrome.tabs.query({}))).find(tab=>tab.url==='https://synthetic.zhiye.com/form');
  await popup.evaluate(async tabId=>{chrome.tabs.query=async()=>[await chrome.tabs.get(tabId)];await chrome.storage.local.set({autoAIEnabled:false,resume:{basics:{name:'Synthetic Platform Candidate'}}});},tab.id);
  const scan=async()=>{await popup.locator('#scan').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  await scan();assert.match(await popup.locator('#summary').innerText(),/北森.*简历表单/);assert.equal(await popup.locator('#fields .row').count(),1);
  await popup.locator('#fill').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);assert.equal(await target.locator('#person').inputValue(),'Synthetic Platform Candidate',await popup.locator('#status').innerText()+' '+await popup.locator('#fields').innerText());assert.equal(await target.evaluate(()=>!!window.submitted),false);
  await target.evaluate(()=>{const password=document.createElement('input');password.type='password';document.body.append(password);});await scan();assert.match(await popup.locator('#summary').innerText(),/北森.*请先登录/);assert.equal(await popup.locator('#fields .row').count(),0);
  await popup.setViewportSize({width:420,height:820});assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await popup.screenshot({path:path.join(__dirname,'tmp/platform-popup-synthetic.png'),fullPage:true});
  await target.setContent('<div class="form-item"><div class="form-item__text">个人简历</div><input type="file" hidden accept=".pdf"></div>');await scan();assert.match(await popup.locator('#summary').innerText(),/简历表单/);
  assert.ok((await popup.evaluate(tabId=>ResumePageBridge.send(tabId,{type:'RF_RUN_UPLOAD'}),tab.id)).token);
  console.log('PASS: installed extension injects shared platform module, renders localized state, fills Beisen form, blocks login and never submits; 420px layout');
 }finally{await context.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
