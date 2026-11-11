const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rf-courier-')),extension=path.join(temp,'extension');
 fs.mkdirSync(extension);
 for(const name of require('./scripts/runtime-files.cjs')){
  const output=path.join(extension,name);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(__dirname,name),output);
 }
 fs.cpSync(path.join(__dirname,'data'),path.join(extension,'data'),{recursive:true});
 fs.writeFileSync(path.join(extension,'desktop-connect.js'),'// Isolated synthetic workflow.');
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
 manifest.host_permissions=['https://jobs.example.test/*'];
 fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext(path.join(temp,'browser'),{
  ...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),
  headless:true,args:[`--load-extension=${extension}`,`--disable-extensions-except=${extension}`],
 });
 context.setDefaultTimeout(12000);
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=worker.url().split('/')[2],target=await context.newPage();
  await target.route('https://jobs.example.test/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<form><label>姓名<input name="name"></label><button type="submit">提交</button></form><script>window.submissions=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submissions++};</script>'}));
  await target.goto('https://jobs.example.test/application?private=synthetic');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const tab=(await popup.evaluate(()=>chrome.tabs.query({}))).find(tab=>tab.url?.startsWith('https://jobs.example.test/'));
  await popup.evaluate(async tab=>{
   chrome.tabs.query=async()=>[tab];
   await chrome.storage.local.set({resume:{basics:{name:'Synthetic Candidate'}},autoAIEnabled:false});
  },tab);
  const api=(action,extra={})=>popup.evaluate(({action,extra})=>chrome.runtime.sendMessage({type:'RF_RUN_COURIER',action,...extra}),{action,extra});
  const apiJob={id:'synthetic-api-job',companyKey:'synthetic-api-company',origin:'https://jobs.example.test'};
  assert.equal((await api('screen',{job:apiJob})).action,'review');
  assert.match((await api('enqueue',{job:apiJob})).error,/review/);
  assert.ok((await api('saveRules',{rules:{excludeKeywords:['']}})).error);
  await api('saveRules',{rules:{excludeKeywords:['sales']}});
  assert.ok((await api('enqueue',{job:{...apiJob,confirmedByUser:true,screening:{title:'Synthetic sales role'}}})).error);
  assert.deepEqual(await api('list'),[]);
  const untrusted=await popup.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>chrome.runtime.sendMessage({type:'RF_RUN_COURIER',action:'saveRules',rules:{}})}),tab.id);
  assert.match(untrusted[0].result.error,/source/);
  await popup.locator('#scan').click();
  await popup.locator('#summary').filter({hasText:'1 个字段'}).waitFor();
  await popup.getByText('投递任务',{exact:true}).click();
  await popup.getByRole('textbox',{name:'投递任务公司名称',exact:true}).fill('Synthetic Company');
  await popup.getByRole('textbox',{name:'投递任务职位名称',exact:true}).fill('Synthetic Engineer');
  await popup.getByRole('combobox',{name:'职位开放状态',exact:true}).selectOption('closed');
  await popup.getByRole('button',{name:'检查并加入任务',exact:true}).click();
  await popup.locator('#courierStatus').filter({hasText:'职位已关闭'}).waitFor();
  assert.deepEqual(await api('list'),[]);
  await popup.getByRole('combobox',{name:'职位开放状态',exact:true}).selectOption('open');
  await popup.getByRole('button',{name:'检查并加入任务',exact:true}).click();
  await popup.locator('#courierStatus').filter({hasText:'需要核对'}).waitFor();
  await popup.getByRole('checkbox',{name:'我已核对未确定的职位条件',exact:true}).check();
  await popup.getByRole('combobox',{name:'职位资格',exact:true}).selectOption('ineligible');
  assert.equal(await popup.getByRole('checkbox',{name:'我已核对未确定的职位条件',exact:true}).isChecked(),false);
  await popup.getByRole('button',{name:'检查并加入任务',exact:true}).click();
  await popup.locator('#courierStatus').filter({hasText:'不符合职位资格'}).waitFor();
  await popup.getByRole('combobox',{name:'职位资格',exact:true}).selectOption('eligible');
  await popup.getByRole('combobox',{name:'职位范围',exact:true}).selectOption('in-scope');
  await popup.getByRole('button',{name:'检查并加入任务',exact:true}).click();
  await popup.locator('#courierStatus').filter({hasText:'任务已加入'}).waitFor();
  assert.equal((await api('list'))[0].screened,true);
  const receipt=JSON.stringify(await api('export'));
  assert.ok(!/Synthetic Engineer|Synthetic Company|Candidate|private/.test(receipt));
  await popup.locator('#fill').click();
  await popup.waitForFunction(()=>!document.getElementById('scan').disabled);
  assert.match(await popup.locator('#status').innerText(),/回读一致 1/);
  assert.equal((await api('list'))[0].status,'handoff');
  assert.equal(await target.locator('input[name=name]').inputValue(),'Synthetic Candidate');
  assert.equal(await target.evaluate(()=>window.submissions),0);
  const rules=popup.getByRole('group',{name:'职位关键词筛选'});
  await rules.getByRole('textbox',{name:'排除关键词',exact:true}).fill('Sales,ＪＡＶＡ');
  await rules.getByRole('button',{name:'保存职位筛选',exact:true}).click();
  await popup.locator('#courierStatus').filter({hasText:'筛选规则已保存'}).waitFor();
  assert.deepEqual((await api('rules')).excludeKeywords,['sales','java']);
  await popup.reload();
  await popup.getByText('投递任务',{exact:true}).click();
  await popup.getByRole('textbox',{name:'排除关键词',exact:true}).filter({visible:true}).waitFor();
  assert.equal(await popup.getByRole('textbox',{name:'排除关键词',exact:true}).inputValue(),'sales, java');
  await popup.setViewportSize({width:420,height:900});
  assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await popup.getByRole('combobox',{name:'职位资格',exact:true}).focus();
  assert.equal(await popup.getByRole('combobox',{name:'职位资格',exact:true}).evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
  fs.mkdirSync(path.join(__dirname,'tmp'),{recursive:true});
  await popup.screenshot({path:path.join(__dirname,'tmp/courier-screening.png'),fullPage:true});
  const acceptedReview=await api('enqueue',{job:{id:'synthetic-reviewed',companyKey:'synthetic-reviewed-company',origin:'https://other.example.test',confirmedByUser:true}});
  assert.equal(acceptedReview.find(row=>row.id==='synthetic-reviewed').screened,true);
  console.log('PASS: authoritative screening, unknown-condition review reset, exclusions, queue/fill/handoff, private receipts, persistent rules and narrow keyboard layout');
 }finally{await context.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
