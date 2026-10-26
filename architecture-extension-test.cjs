const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rf-architecture-')),ext=path.join(temp,'extension');fs.mkdirSync(ext);
 for(const f of require('./scripts/runtime-files.cjs')){fs.mkdirSync(path.dirname(path.join(ext,f)),{recursive:true});fs.copyFileSync(path.join(__dirname,f),path.join(ext,f));}
 fs.cpSync(path.join(__dirname,'data'),path.join(ext,'data'),{recursive:true});fs.writeFileSync(path.join(ext,'desktop-connect.js'),'// Isolated synthetic architecture test.');
 const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json')));manifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
 const field='<label>姓名<input id="name"></label>';
 const srcdoc='<iframe id="doc" srcdoc="'+field.replaceAll('"','&quot;')+'"></iframe>';
 const moka=title=>`<section class="apply-block-test"><div class="blockTitle-test"><div>${title}</div></div><div class="apply-fields-test"><div class="apply-field-test"><div class="title-test">公司名称</div><input></div></div></section>`;
 let crossOrigin;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(req.url==='/srcdoc'?srcdoc:req.url==='/multiple'?field+srcdoc:req.url==='/opaque'?srcdoc.replace('<iframe','<iframe sandbox="allow-scripts"'):req.url==='/work'?moka('工作经历')+moka('实习经历'):req.url==='/cross'?`<iframe src="${crossOrigin}/leaf"></iframe>`:req.url==='/shadow'?`<div id="one"></div><div id="two"></div><div id="hidden" hidden></div><div id="closed"></div><script>
 for(const id of ['one','two','hidden']){const root=document.getElementById(id).attachShadow({mode:'open'});root.innerHTML='<label id="label">姓名</label><input id="name" aria-labelledby="label">';}
 document.getElementById('closed').attachShadow({mode:'closed'}).innerHTML='<label>邮箱<input></label>';
 const nested=document.createElement('div');nested.id='nested';document.getElementById('one').shadowRoot.append(nested);nested.attachShadow({mode:'open'}).innerHTML='<label>性别<select id="gender"><option value="">请选择</option><option>女</option><option>男</option></select></label>';
 </script>`:field);});
 const cross=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html;charset=utf-8');r.end(field);});await new Promise(r=>server.listen(0,'127.0.0.1',r));await new Promise(r=>cross.listen(0,'127.0.0.1',r));crossOrigin='http://127.0.0.1:'+cross.address().port;const base='http://127.0.0.1:'+server.address().port;
 const context=await chromium.launchPersistentContext(path.join(temp,'browser'),{channel:'msedge',headless:true,args:[`--load-extension=${ext}`,`--disable-extensions-except=${ext}`]});context.setDefaultTimeout(15000);
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=worker.url().split('/')[2],target=await context.newPage();await target.goto(base+'/srcdoc');
  const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');const tabs=await popup.evaluate(()=>chrome.tabs.query({})),tab=tabs.find(t=>t.url===base+'/srcdoc');
  await popup.evaluate(async tabId=>{chrome.tabs.query=async()=>[await chrome.tabs.get(tabId)];await chrome.storage.local.set({autoAIEnabled:false,resume:{basics:{name:'Synthetic Candidate',gender:'女'},work:[{company:'Synthetic Internship',employmentType:'internship'},{company:'Synthetic Employment',employmentType:'employment'}]}});},tab.id);
  const scan=async route=>{if(route)await target.goto(base+route);await popup.locator('#scan').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  const fill=async()=>{await popup.locator('#fill').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  await scan();assert.equal(await popup.locator('#fields .row').count(),1);await fill();assert.equal(await target.frameLocator('#doc').locator('#name').inputValue(),'Synthetic Candidate',await popup.locator('#status').innerText());
  await target.frameLocator('#doc').locator('#name').fill('');await target.locator('#doc').evaluate(el=>el.srcdoc=el.srcdoc+' ');await fill();assert.equal(await target.frameLocator('#doc').locator('#name').inputValue(),'');
  await scan('/multiple');assert.equal(await popup.locator('#fields .row').count(),0);const docs=await popup.getByLabel('选择表单文档',{exact:true}).locator('option').evaluateAll(els=>els.map(e=>({text:e.textContent,value:e.value})));const selected=docs.find(d=>d.text.includes('about:srcdoc'));assert.ok(selected);await popup.getByLabel('选择表单文档',{exact:true}).selectOption(selected.value);await popup.waitForFunction(()=>!document.getElementById('scan').disabled);await fill();assert.equal(await target.locator('#name').inputValue(),'');assert.equal(await target.frameLocator('#doc').locator('#name').inputValue(),'Synthetic Candidate');
  await scan('/shadow');assert.equal(await popup.locator('#fields .row').count(),3);await fill();assert.equal(await target.locator('#one').locator('#name').inputValue(),'Synthetic Candidate');assert.equal(await target.locator('#two').locator('#name').inputValue(),'Synthetic Candidate');assert.equal(await target.locator('#nested').locator('#gender').inputValue(),'女');assert.equal(await target.evaluate(()=>document.getElementById('hidden').shadowRoot.querySelector('input').value),'');
  await target.evaluate(()=>{const root=document.getElementById('one').shadowRoot;root.innerHTML='<label>姓名<input id="replacement"></label>';});await fill();assert.equal(await target.locator('#one').locator('#replacement').inputValue(),'');
  await scan('/work');await fill();assert.deepEqual(await target.locator('input').evaluateAll(els=>els.map(e=>e.value)),['Synthetic Employment','Synthetic Internship']);
  await popup.evaluate(()=>chrome.storage.local.set({resume:{basics:{name:'Synthetic Candidate'},work:[{company:'Unknown A'},{company:'Unknown B'}]}}));await scan('/work');assert.equal(await popup.getByRole('combobox',{name:'公司名称 对应简历字段',exact:true}).first().inputValue(),'');
  const assign=async(label,index)=>{await popup.getByLabel(label,{exact:true}).selectOption(String(index));await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  await assign('工作经历 · 第 1 条 对应经历',0);await assign('实习经历 · 第 1 条 对应经历',0);assert.equal(await popup.getByRole('combobox',{name:'公司名称 对应简历字段',exact:true}).first().inputValue(),'');
  await assign('工作经历 · 第 1 条 对应经历',0);await assign('实习经历 · 第 1 条 对应经历',1);await fill();assert.deepEqual(await target.locator('input').evaluateAll(els=>els.map(e=>e.value)),['Unknown A','Unknown B']);
  await target.locator('input').first().fill('');await popup.evaluate(()=>chrome.storage.local.set({resume:{basics:{name:'Changed Synthetic'},work:[{company:'Changed A'},{company:'Unknown B'}]}}));await fill();assert.equal(await target.locator('input').first().inputValue(),'');assert.match(await popup.locator('#status').innerText(),/资料已变化/);
  await scan('/cross');assert.equal(await popup.locator('#fields .row').count(),0);assert.match(await popup.locator('#documentDiagnostics').innerText(),/跨域/);assert.equal(await target.frameLocator('iframe').locator('#name').inputValue(),'');
  await scan('/opaque');assert.equal(await popup.locator('#fields .row').count(),0);
  console.log('PASS: installed extension srcdoc fill/stale rejection, explicit document selection, nested open roots/duplicate IDs/hidden hosts/closed roots, stale shadow replacement, typed work indices and cross-origin/opaque refusal');
 }finally{await context.close();await Promise.all([server,cross].map(s=>new Promise(r=>s.close(r))));}
})().catch(e=>{console.error(e);process.exitCode=1;});
