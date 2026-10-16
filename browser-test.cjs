const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const scripts=['matcher.js','layout.js','adapters.js','controls.js','content.js'];
const adapters=JSON.parse(fs.readFileSync(path.join(__dirname,'sample-adapters.json'),'utf8'));
const resume={basics:{name:'测试姓名',email:'fixture@example.com',gender:'女',city:'南京',region:'江苏省 > 南京市'},education:[{school:'学校 A',major:'专业 A',degree:'本科',startDate:'2020-09',endDate:'2024-07'},{school:'学校 B',major:'专业 B',degree:'硕士',startDate:'2024-09',endDate:'2026-10'}]};
const allowed=new Set(['demo-advanced.html','demo-advanced.js','style.css','popup.html','popup.js','matcher.js','adapters.js']);
(async()=>{
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1);if(!allowed.has(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,file)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/demo-advanced.html`);
  await page.evaluate(()=>{window.chrome={runtime:{onMessage:{addListener:fn=>window.__rfListener=fn}}};});
  for(const file of scripts)await page.addScriptTag({path:path.join(__dirname,file)});
  const call=message=>page.evaluate(message=>new Promise((resolve,reject)=>{__rfListener(message,{},result=>result?.error?reject(Error(result.error)):resolve(result));}),message);
  let scan=await call({type:'RF_SCAN',adapters});assert.equal(scan.adapter,'local-advanced-demo');assert(!scan.fields.some(f=>f.label==='隐藏字段'));
  const firstIds=scan.fields.map(f=>f.id);
  let prepared=await call({type:'RF_PREPARE',counts:{education:2}});assert.equal(prepared[0].count,2);
  prepared=await call({type:'RF_PREPARE',counts:{education:2}});assert.equal(prepared[0].count,2);assert.equal(await page.locator('.experience-card').count(),2);
  scan=await call({type:'RF_SCAN',adapters});
  const stale=await call({type:'RF_FILL',items:[{id:firstIds[0],value:'不能写入'}]});assert.equal(stale.results[0].status,'stale');
  const values=require('./matcher.js').flatten(resume);
  values['education.0.degree']='大学本科'; // Independent, conservative option equivalence.
  const items=scan.fields.filter(f=>f.path&&values[f.path]).map(f=>({id:f.id,value:values[f.path]}));
  const filled=await call({type:'RF_FILL',items,overwrite:false,saveCards:true});
  assert.equal(filled.results.filter(r=>r.status==='verified').length,items.length,JSON.stringify(filled));assert.equal(filled.saves.length,2);assert(filled.saves.every(s=>s.status==='save_indicator_observed'));
  const saved=await page.evaluate(()=>window.demoSaved);assert.deepEqual(saved.map(r=>r.school),['学校 A','学校 B']);assert.equal(saved[1].degree,'master');
  assert.equal(await page.locator('#city-value').innerText(),'南京');assert.equal(await page.locator('#region-value').innerText(),'江苏省 > 南京市');assert(await page.locator('#gender-group input[value=F]').isChecked());
  const name=scan.fields.find(f=>f.path==='basics.name'),city=scan.fields.find(f=>f.path==='basics.city'),date=scan.fields.find(f=>f.path==='education.0.startDate');
  const preserve=await call({type:'RF_FILL',items:[{id:name.id,value:'不应覆盖'}],overwrite:false});assert.equal(preserve.results[0].status,'preserved');assert.equal(await page.locator('#full-name').inputValue(),'测试姓名');
  await page.evaluate(()=>document.querySelector('#city-value').textContent='');
  const missing=await call({type:'RF_FILL',items:[{id:city.id,value:'不存在的城市'}],overwrite:true});assert.equal(missing.results[0].status,'failed');
  await page.evaluate(()=>{const name=document.querySelector('#full-name');name.addEventListener('input',()=>setTimeout(()=>name.value='框架重置',100),{once:true});});
  const reset=await call({type:'RF_FILL',items:[{id:name.id,value:'会被重置'}],overwrite:true});assert.equal(reset.results[0].status,'mismatch');
  const invalid=await call({type:'RF_FILL',items:[{id:date.id,value:'2020-09-01'}],overwrite:true});assert.equal(invalid.results[0].status,'failed');
  await page.locator('.experience-card').first().locator('[name=school]').evaluate(el=>el.remove());
  const staleField=scan.fields.find(f=>f.path==='education.0.school');const detached=await call({type:'RF_VERIFY',items:[{id:staleField.id,value:'学校 A'}]});assert.equal(detached[0].status,'stale');
  // An unmatched required field prevents the section save action.
  await page.locator('.experience-card').nth(1).evaluate(card=>{const input=document.createElement('input');input.required=true;input.name='unknown-required';card.append(input);card.querySelector('.saved-marker')?.remove();});
  scan=await call({type:'RF_SCAN',adapters});const schoolB=scan.fields.find(f=>f.path==='education.1.school');const blockedSave=await call({type:'RF_FILL',items:[{id:schoolB.id,value:'学校 B'}],saveCards:true});assert.equal(blockedSave.saves[0].status,'blocked');
  // Rules must not match a different page, and structure changes alter the signature.
  assert.notEqual(scan.fingerprint,require('./adapters.js').fingerprint([]));
  assert.deepEqual(errors,[]);
  const report={passed:true,cases:['site rules','hidden controls','two records','no duplicate additions','stale scan','native select','month precision','radio','async combobox','cascader readback','card save indicators','preserve existing','missing options','framework reset','detached field','required gap blocks save'],verifiedFields:items.length};
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
