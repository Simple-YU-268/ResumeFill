const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});try{
 const page=await browser.newPage();await page.setContent('<main></main>');
 for(const f of ['profile.js','matcher.js','layout.js','controls.js','adapters.js'])await page.addScriptTag({path:path.join(__dirname,f)});
 await page.evaluate(()=>globalThis.chrome={runtime:{onMessage:{addListener:fn=>globalThis.listener=fn}}});await page.addScriptTag({path:path.join(__dirname,'content.js')});
 const call=message=>page.evaluate(message=>new Promise(resolve=>listener(message,{},resolve)),message);
 await page.setContent('<table><tr><th>姓名<small>填写真实姓名</small></th><td><input id="name"></td><th><span>性别</span><span class="help">请按证件填写</span></th><td><input id="gender"></td></tr><tr><th>联系方式</th><td><input id="phone1"><input id="phone2"></td><td><input id="unlabelled"></td></tr></table><dl><dt>电子邮箱<span role="note">说明</span></dt><dd><input id="mail"></dd><dd><input id="orphan"></dd></dl>');
 assert.deepEqual(await page.evaluate(()=>['name','gender','mail','orphan','unlabelled'].map(id=>ResumeLayout.associate(document.getElementById(id)).label)),['姓名','性别','电子邮箱','','']);
 let snap=await call({type:'RF_SCAN',adapters:{version:1,adapters:[]}});assert.equal(snap.fields.filter(f=>f.label==='联系方式').length,2);assert.ok(snap.fields.filter(f=>f.label==='联系方式').every(f=>f.ambiguousLabel));
 await page.setContent('<table><tr><th>外层标签</th><td><table><tr><th>项目名称</th><td><input id="nested"></td></tr></table></td><th hidden>隐藏说明</th><th>项目角色</th><td><input id="role"></td></tr></table>');
 assert.deepEqual(await page.evaluate(()=>['nested','role'].map(id=>ResumeLayout.associate(document.getElementById(id)).label)),['项目名称','项目角色']);
 // Range ambiguity must not mutate the native control. Readback checks the actual option.
 await page.setContent('<label for="years">工作年限</label><select id="years"><option value="">请选择</option><option>1-3年</option><option>3-5年</option></select>');
 snap=await call({type:'RF_SCAN'});let result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,value:'3年'}]});assert.match(result.results[0].error,/边界/);assert.equal(await page.locator('select').inputValue(),'');
 await page.locator('select').evaluate(el=>el.options[1].textContent='[1,3)年');result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,value:'3年'}]});assert.equal(result.results[0].status,'verified');assert.equal(await page.locator('select').inputValue(),'3-5年');
 await page.locator('select').evaluate(el=>el.value='');assert.equal((await call({type:'RF_VERIFY',items:[{id:snap.fields[0].id,value:'3年'}]}))[0].status,'mismatch');
 result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,value:'3-5年',manualOption:true}]});assert.equal(result.results[0].status,'verified');
 // ARIA ownership wins over an unrelated, closer list and configured broad selectors.
 await page.setContent('<input id="trigger" role="combobox" aria-controls="owned" readonly><div role="listbox"><div role="option">目标</div></div><div id="owned" role="listbox" aria-busy="true" style="margin-top:300px"><div role="option" aria-disabled="true">目标</div></div>');
 await page.evaluate(()=>{const t=document.getElementById('trigger'),menu=document.getElementById('owned');t.onclick=()=>setTimeout(()=>{menu.insertAdjacentHTML('beforeend','<div role="option" id="target">目标</div><div role="option" hidden>目标</div>');document.getElementById('target').onclick=()=>t.value='目标';menu.setAttribute('aria-busy','false');},240);});
 assert.equal(await page.evaluate(async()=>{const d={el:document.getElementById('trigger'),scope:document,type:'combobox',config:{optionsSelector:'[role="option"]'}};await ResumeControls.fill(d,'目标',true);return (await ResumeControls.verify(d,'目标')).status;}),'verified');
 // A selected root maps repeated cards to distinct JSON records, excluding the rest of the page.
 await page.setContent('<label>姓名<input id="outside"></label><section id="projects"><h2>项目经历</h2><fieldset><legend>第一个项目</legend><label>项目名称<input id="p1"></label></fieldset><fieldset><legend>第二个项目</legend><label>项目名称<input id="p2"></label></fieldset></section><section><h2>教育经历</h2><label>学校<input id="school"></label></section>');
 const choices=await call({type:'RF_SCOPE_LIST'}),choice=choices.scopes.find(s=>s.label==='项目经历'&&s.tag==='section');assert.ok(choice);
 assert.equal((await call({type:'RF_SCOPE_SET',id:choice.id,section:'projects',recordIndex:1})).selected,true);
 snap=await call({type:'RF_SCAN'});assert.equal(snap.fields.length,2);assert.deepEqual(snap.fields.map(f=>[f.section,f.recordIndex]),[['projects',1],['projects',2]]);
 result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,path:'projects.2.name',value:'wrong'}]});assert.match(result.results[0].error,/所选经历/);assert.equal(await page.locator('#p1').inputValue(),'');
 result=await call({type:'RF_FILL',items:snap.fields.map((f,i)=>({id:f.id,path:'projects.'+(i+1)+'.name',value:'Synthetic project '+i}))});assert.ok(result.results.every(r=>r.status==='verified'));assert.equal(await page.locator('#outside').inputValue(),'');assert.equal(await page.locator('#school').inputValue(),'');
 assert.equal((await call({type:'RF_PREPARE',counts:{projects:3}})).error.includes('区块模式'),true);
 await page.locator('#p1').evaluate(el=>document.body.append(el));assert.equal((await call({type:'RF_VERIFY',items:[{id:snap.fields[0].id,value:'Synthetic project 0'}]}))[0].status,'stale');
 await page.locator('#projects').evaluate(el=>el.remove());assert.match((await call({type:'RF_SCAN'})).error,/区块失效/);
 await call({type:'RF_SCOPE_SET',clear:true});snap=await call({type:'RF_SCAN'});assert.equal(snap.selectedScope,null);assert.ok(snap.fields.length>=2);
 // Plain DIV cards and a two-control date row, matching campus recruitment layouts.
 await page.setContent('<div><div>实习经历</div><div>'+Array.from({length:3},()=>'<div class="opaque-card"><div><label>公司名称<input></label></div><div><label>在职时间</label><span><input></span><span>至</span><span><input></span></div><div><label>工作内容<textarea></textarea></label></div></div>').join('')+'</div></div><div><div>校内活动</div><label>项目描述<textarea></textarea></label></div>');
 snap=await call({type:'RF_SCAN'});
 assert.equal(snap.fields.length,13);
 for(let i=0;i<3;i++)assert.deepEqual(snap.fields.slice(i*4,i*4+4).map(f=>[f.label,f.section,f.recordIndex,!!f.ambiguousLabel]),[['公司名称','work',i,false],['开始日期','work',i,false],['结束日期','work',i,false],['工作内容','work',i,false]]);
 const matched=await page.evaluate(fields=>{const values=ResumeMatcher.flatten({work:Array.from({length:3},(_,i)=>({company:'Synthetic '+i,startDate:'2020-01',endDate:'2021-01',description:'Synthetic duties '+i})),projects:[{description:'Unrelated project'}]});return fields.map(f=>ResumeMatcher.match(f,values)?.path||null);},snap.fields);
 assert.deepEqual(matched,[...Array.from({length:3},(_,i)=>['company','startDate','endDate','description'].map(k=>'work.'+i+'.'+k)).flat(),null]);
 console.log('PASS: multi-column/nested labels, strict DT/DD, shared-cell ambiguity, interval no-click/readback, async ARIA precedence, selected-root isolation, generic repeated cards, date pairs and campus context boundary');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
