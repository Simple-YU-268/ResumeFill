const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const runtimeSource=process.env.RF_TEST_EXTENSION_DIR||__dirname;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rf-element-')),ext=path.join(temp,'extension');fs.mkdirSync(ext);
 for(const f of require('./scripts/runtime-files.cjs')){fs.mkdirSync(path.dirname(path.join(ext,f)),{recursive:true});fs.copyFileSync(path.join(runtimeSource,f),path.join(ext,f));}
 fs.cpSync(path.join(runtimeSource,'data'),path.join(ext,'data'),{recursive:true});fs.writeFileSync(path.join(ext,'desktop-connect.js'),'// Synthetic isolated test.');
 const manifest=JSON.parse(fs.readFileSync(path.join(ext,'manifest.json')));manifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify(manifest));
 const html=`<style>.field{margin:24px}.el-popper[hidden]{display:none}.el-popper{border:1px solid;padding:8px}.el-cascader-menu{display:inline-block;padding:8px}li{padding:5px}</style>
 <div class=field><label>性别</label><div class=el-select id=gender><div class=select-trigger><div class=el-input><input class=el-input__inner readonly placeholder=请选择></div></div></div></div>
 <div class=field><label>政治面貌</label><div class=el-cascader id=politics><input class=el-input__inner placeholder=请选择></div></div>
 <div class=field><label>地区</label><div class=el-cascader id=region><input class=el-input__inner placeholder=请选择></div></div>
 <div class=el-select-dropdown id=foreign><li class=el-select-dropdown__item>女</li></div>
 <div class="el-popper el-select__popper" id=gender-menu hidden role=tooltip><div class=el-select-dropdown><li class=el-select-dropdown__item><span>女</span></li><li class="el-select-dropdown__item is-disabled"><span>男</span></li></div></div>
 <div class="el-popper el-cascader__dropdown" id=politics-menu hidden role=tooltip></div><div class="el-popper el-cascader__dropdown" id=region-menu hidden role=tooltip></div>
 <script>
 window.writes={gender:0,politics:0,region:0,foreign:0};window.reset=false;
 const g=document.getElementById('gender'),gm=document.getElementById('gender-menu'),gt=g.querySelector('.select-trigger');
 gt.onclick=()=>{gm.hidden=!gm.hidden;if(!gm.hidden)gt.setAttribute('aria-describedby','gender-menu');else gt.removeAttribute('aria-describedby');};
 for(const li of gm.querySelectorAll('li'))li.querySelector('span').onclick=()=>{if(li.classList.contains('is-disabled'))return;writes.gender++;g.querySelector('input').value=li.textContent;gm.hidden=true;gt.removeAttribute('aria-describedby');if(window.reset)setTimeout(()=>g.querySelector('input').value='',400);};
 document.getElementById('foreign').onclick=()=>writes.foreign++;
 for(const id of ['politics','region']){
  const root=document.getElementById(id),menu=document.getElementById(id+'-menu'),input=root.querySelector('input');
  const tree=id==='politics'?[{text:'群众'},{text:'共青团员'}]:[{text:'江苏省',children:[{text:'南京市',children:[{text:'鼓楼区'},{text:'玄武区'}]}]}];
  function render(nodes,depth,trail){while(menu.children.length>depth)menu.lastElementChild.remove();const col=document.createElement('div');col.className='el-cascader-menu';menu.append(col);for(const node of nodes){const li=document.createElement('li');li.className='el-cascader-node';li.setAttribute('aria-haspopup',String(!!node.children));li.innerHTML='<span class=el-cascader-node__label></span>';li.firstChild.textContent=node.text;col.append(li);li.firstChild.onclick=e=>{e.stopPropagation();if(node.children)setTimeout(()=>render(node.children,depth+1,[...trail,node.text]),160);else{writes[id]++;input.value=[...trail,node.text].join(' / ');menu.hidden=true;root.removeAttribute('aria-describedby');}};}}
  root.onclick=()=>{menu.hidden=!menu.hidden;if(!menu.hidden){root.setAttribute('aria-describedby',id+'-menu');render(tree,0,[]);}else root.removeAttribute('aria-describedby');};
 }
 </script>`;
 const server=http.createServer((q,r)=>{r.setHeader('Content-Type','text/html;charset=utf-8');r.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const context=await chromium.launchPersistentContext(path.join(temp,'browser'),{channel:'msedge',headless:true,args:[`--load-extension=${ext}`,`--disable-extensions-except=${ext}`]});context.setDefaultTimeout(15000);
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=worker.url().split('/')[2],target=await context.newPage();await target.goto('http://127.0.0.1:'+server.address().port+'/form');const popup=await context.newPage();await popup.goto('chrome-extension://'+id+'/popup.html');const tabId=(await popup.evaluate(()=>chrome.tabs.query({}))).find(t=>t.url?.startsWith('http://127.0.0.1:')).id;
  await popup.evaluate(async tabId=>{chrome.tabs.query=async()=>[await chrome.tabs.get(tabId)];await chrome.storage.local.set({autoAIEnabled:false,resume:{basics:{gender:'女',politicalStatus:'共青团员',region:'江苏省 > 南京市 > 鼓楼区'}}});},tabId);
  const scan=async()=>{await popup.locator('#scan').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);assert.equal(await popup.locator('#fields .row').count(),3,await popup.locator('#status').innerText());for(const [label,p]of [['性别','basics.gender'],['政治面貌','basics.politicalStatus'],['地区','basics.region']])await popup.getByRole('combobox',{name:label+' 对应简历字段',exact:true}).selectOption(p);};
  const fill=async()=>{await popup.locator('#fill').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);};
  await scan();await fill();assert.equal(await target.locator('#gender input').inputValue(),'女',await popup.locator('#status').innerText());assert.equal(await target.locator('#politics input').inputValue(),'共青团员',await popup.locator('#status').innerText());assert.equal(await target.locator('#region input').inputValue(),'江苏省 / 南京市 / 鼓楼区',await popup.locator('#status').innerText());assert.deepEqual(await target.evaluate(()=>writes),{gender:1,politics:1,region:1,foreign:0});assert.match(await popup.locator('#status').innerText(),/回读一致 3/);
  // Preopened, explicitly owned menu must not be toggled closed.
  await target.locator('#gender input').evaluate(el=>el.value='');await target.locator('#gender input').click();await scan();await fill();assert.equal(await target.locator('#gender input').inputValue(),'女');assert.equal(await target.evaluate(()=>writes.foreign),0);
  // A leaf-only city cannot authorize traversing an unknown parent path.
  await target.locator('#region input').evaluate(el=>el.value='');await popup.evaluate(async()=>{const {resume}=await chrome.storage.local.get('resume');resume.basics.region='南京市';await chrome.storage.local.set({resume});});await scan();await fill();assert.equal(await target.locator('#region input').inputValue(),'');assert.equal(await target.evaluate(()=>writes.region),1);
  await target.reload();await target.locator('#gender').evaluate(el=>el.classList.add('is-disabled'));await scan();await fill();assert.equal(await target.locator('#gender input').inputValue(),'');assert.equal(await target.evaluate(()=>writes.gender),0);
  await target.reload();await popup.evaluate(async()=>{const {resume}=await chrome.storage.local.get('resume');resume.basics.region='江苏省 > 南京市 > 鼓楼区';await chrome.storage.local.set({resume});});await target.evaluate(()=>window.reset=true);await scan();await fill();assert.equal(await target.locator('#gender input').inputValue(),'');assert.doesNotMatch(await popup.locator('#status').innerText(),/回读一致 3/);
  console.log('PASS: installed Edge Element select internal triggers, dynamic describedby ownership, foreign/preopened menus, flat and async multilevel cascaders, exact full paths and delayed reset refusal');
 }finally{await context.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
