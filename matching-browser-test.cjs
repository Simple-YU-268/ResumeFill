const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const M=require('./matcher.js');
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});
 try{
  const page=await browser.newPage();await page.setContent(`<style>td,th{padding:12px}input,select{width:160px}</style><table>
  <tr><th><span>姓</span><span>名</span></th><td><div><input id="field_9kxsx3Tv"></div></td></tr>
  <tr><th>现居住地址</th><td><input id="address"></td></tr>
  <tr><th>户籍所在地</th><td><select id="province-field_abc"><option value="">省</option><option>江苏省</option></select><select id="city-field_abc"><option value="">市</option><option>南京市</option></select><select id="county-field_abc"><option value="">区</option><option>鼓楼区</option></select></td></tr>
  <tr><th>现居住地</th><td><select id="city-field_current"><option value="">市</option><option>南京市</option></select></td></tr>
  <tr><th>（税前年收入）</th><td><input id="income1"><input id="income2"></td></tr></table>`);
  await page.evaluate(()=>{globalThis.chrome={runtime:{onMessage:{addListener:fn=>globalThis.listener=fn}}};});
  for(const f of ['matcher.js','layout.js','adapters.js','controls.js','content.js'])await page.addScriptTag({path:path.join(__dirname,f)});
  const call=message=>page.evaluate(message=>new Promise((resolve,reject)=>listener(message,{},r=>r.error?reject(Error(r.error)):resolve(r))),message);
  const scan=await call({type:'RF_SCAN',adapters:{version:1,adapters:[]}});
  const name=scan.fields.find(f=>f.label==='姓名');assert.ok(name);assert.equal(name.evidence,'表格同行标签');
  assert.equal(M.match(name,{'basics.name':'合成姓名'}).path,'basics.name');
  const address=scan.fields.find(f=>f.label==='现居住地址');assert.equal(M.match(address,{'basics.city':'南京'}),null);assert.equal(M.infer(address).path,'basics.address');
  const hukouCity=scan.fields.find(f=>f.regionRole==='hukou'&&f.regionLevel==='city');assert.ok(hukouCity);assert.equal(M.infer(hukouCity).path,'basics.hukou.city');assert.equal(M.match(hukouCity,{'basics.city':'南京'}),null);
  const city=scan.fields.find(f=>f.regionRole==='current'&&f.regionLevel==='city');assert.equal(M.match(city,{'basics.city':'南京'}).path,'basics.city');
  const result=await call({type:'RF_FILL',items:[{id:city.id,value:'南京'}]});assert.equal(result.results[0].status,'verified');assert.equal(await page.locator('#city-field_current').inputValue(),'南京市');
  assert.equal(scan.fields.filter(f=>f.ambiguousLabel).length,2);
  console.log('PASS: split name table label, address vs city, hukou/current separation, region suffix option readback, duplicate income ambiguity');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
