const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const M=require('./matcher.js');
const resume={education:[{startDate:'2000-01',description:'EDUCATION'}],work:[{position:'WORK',startDate:'2001-01',description:'WORK'}],projects:[{name:'项目 A',role:'开发',description:'描述 A',startDate:'2024-01',endDate:'2024-06'},{name:'项目 B',role:'研究',description:'描述 B',startDate:'2025-01',endDate:''}]};
(async()=>{const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});try{
 const page=await browser.newPage();
 const card=()=>`<section class="project-card"><h3>项目详情</h3>${['项目名称','担任角色','项目职责','项目开始时间','项目结束时间'].map((label,i)=>`<div><label>${label}<${i===2?'textarea':'input'} ${i>2?'type="month"':''}>${i===2?'</textarea>':''}</label></div>`).join('')}</section>`;
 await page.setContent(`<section class="projects"><h2>项目经历</h2>${card()}${card()}</section>`);
 await page.evaluate(()=>{globalThis.chrome={runtime:{onMessage:{addListener:fn=>globalThis.listener=fn}}};});
 for(const f of ['matcher.js','layout.js','adapters.js','controls.js','content.js'])await page.addScriptTag({path:path.join(__dirname,f)});
 const call=message=>page.evaluate(message=>new Promise((resolve,reject)=>listener(message,{},r=>r.error?reject(Error(r.error)):resolve(r))),message);
 let scan=await call({type:'RF_SCAN',adapters:{version:1,adapters:[]}});
 const values=M.flatten(resume),matches=scan.fields.map(f=>({field:f,match:M.match(f,values)}));
 assert.equal(matches.length,10);assert.equal(matches.filter(r=>r.field.section==='projects').length,10,'project section');
 for(let index=0;index<2;index++){
  const rows=matches.filter(r=>r.field.recordIndex===index);assert.equal(rows.length,5,'project index '+index);
  assert.deepEqual(rows.map(r=>r.match?.path),['name','role','description','startDate','endDate'].map(key=>`projects.${index}.${key}`));
 }
 const items=matches.filter(r=>values[r.match?.path]).map(r=>({id:r.field.id,value:values[r.match.path]}));const filled=await call({type:'RF_FILL',items});assert.equal(filled.results.filter(r=>r.status==='verified').length,9);
 assert.deepEqual(await page.locator('.project-card input').evaluateAll(nodes=>nodes.map(n=>n.value)),['项目 A','开发','2024-01','2024-06','项目 B','研究','2025-01','']);
 assert.equal(M.match({label:'工作内容',section:'projects',recordIndex:0},values),null,'no cross-section fallback');
 assert.equal(M.match({label:'项目名称',section:'projects',recordIndex:9},values),null,'no unknown project index fallback');
  await page.locator('.project-card').evaluateAll(nodes=>nodes.forEach(n=>{n.removeAttribute('class');n.querySelector('h3').textContent='项目详情';}));
  scan=await call({type:'RF_SCAN',adapters:{version:1,adapters:[]}});assert.deepEqual(scan.fields.filter(f=>f.label==='项目名称').map(f=>f.recordIndex),[0,1],'structural cards without CSS class');
 console.log('PASS: two nested project cards, role/description/date aliases, 9 verified values, blank end date retained, section and record isolation');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
