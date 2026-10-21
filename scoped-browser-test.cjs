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
 // New fields/cards added after the initial scan use the same local semantic matcher.
 await page.setContent('<div id="dynamic"><div>项目经历</div><div id="cards"></div></div>');
 assert.equal((await call({type:'RF_SCAN'})).fields.length,0);
 await page.evaluate(()=>document.getElementById('cards').innerHTML=Array.from({length:2},()=>'<div><label>请填写项目名称（必填）<input></label><label>项目简介<textarea></textarea></label></div>').join(''));
 snap=await call({type:'RF_SCAN'});assert.equal(snap.fields.length,4);assert.deepEqual(snap.fields.map(f=>f.recordIndex),[0,0,1,1]);
 const plans=await page.evaluate(fields=>{const values=ResumeMatcher.flatten({projects:[{name:'Project A',description:'Description A'},{name:'Project B',description:'Description B'}]});return fields.map(f=>{const m=ResumeMatcher.match(f,values);return {id:f.id,path:m?.path,value:values[m?.path]};});},snap.fields);
 assert.deepEqual(plans.map(p=>p.path),['projects.0.name','projects.0.description','projects.1.name','projects.1.description']);
 result=await call({type:'RF_FILL',items:plans});assert.ok(result.results.every(r=>r.status==='verified'));
 assert.deepEqual(await page.locator('#cards input,#cards textarea').evaluateAll(els=>els.map(e=>e.value)),['Project A','Description A','Project B','Description B']);
 // Sanitized 51job highest-education structure observed in the user's current page.
 await page.setContent('<div class="resume-module common"><div class="resume-module-header">最高学历</div><div class="common-item"><form class="el-form basic-wrapper">'+['学历层次','入学时间','毕业时间','毕业学校','专业','其他学校','其他专业','学习成绩排名','担任职务','主修课程'].map(label=>'<div class="el-form-item"><label>'+label+'</label><div class="el-form-item__content"><input></div></div>').join('')+'</form></div></div>');
 snap=await call({type:'RF_SCAN'});assert.equal(snap.fields.length,10);assert.ok(snap.fields.every(f=>f.section==='education'&&f.recordPolicy==='highestEducation'&&f.recordIndex===null));
 const highestPlans=await page.evaluate(fields=>{const values=ResumeMatcher.flatten({education:[{degree:'本科',school:'Bachelor',major:'Major A',startDate:'2020-09',endDate:'2024-07'},{degree:'硕士',school:'Master',major:'Major B',startDate:'2024-09',endDate:'2026-07',courses:['Course A','Course B']}]});return fields.map(f=>({field:f.label,path:ResumeMatcher.match(f,values)?.path||null}));},snap.fields);
 assert.equal(highestPlans.filter(p=>p.path).length,6);assert.ok(highestPlans.filter(p=>p.path).every(p=>p.path.startsWith('education.1.')));assert.ok(highestPlans.filter(p=>/^其他/.test(p.field)).every(p=>p.path===null));
 // Seven real-page module vocabularies; values below are synthetic and local only.
 const modules=[['基本信息编辑',['姓名','性别','出生日期','婚姻状况','政治面貌','目前居住地','户口所在地','期望工作地','电子邮件','手机号码','通信地址','紧急联系人姓名','紧急联系方式']],['最高学历',['学历层次','入学时间','毕业时间','毕业学校','专业','其他学校','其他专业','学习成绩排名','担任职务','主修课程']],['外语水平',['英语水平','英语水平具体分数','其他外语水平','其他外语具体分数']],['IT技能添加',['技能','掌握程度']],['在校荣誉添加',['荣誉名称','获奖时间','荣誉简述']],['学生实践经验添加',['开始日期','结束日期','学校/单位','部门','职位','项目描述','实践荣誉']],['其他内容缺失，待补充编辑',['是否有亲属受雇于某集团','是否愿意接受其他公司邀约','招聘信息来源渠道','自我评价']]];
 await page.setContent(modules.map(([title,labels])=>'<div class="resume-module"><div class="resume-module-header">'+title+'</div><form>'+labels.map(label=>'<div class="el-form-item"><label>'+label+'</label><input></div>').join('')+'</form></div>').join(''));
 snap=await call({type:'RF_SCAN'});assert.equal(snap.fields.length,43);
 const profile={basics:{name:'Synthetic person',gender:'男',birthday:'2000-01-02',maritalStatus:'未婚',politicalStatus:'群众',city:'南京市',hukouAddress:'江苏省南京市鼓楼区',expectedCity:'上海市',email:'person@example.invalid',phone:'10000000000',address:'Synthetic address',emergencyContactName:'Synthetic contact',emergencyContactPhone:'10000000001'},education:[{degree:'硕士',school:'Synthetic school',major:'Synthetic major',startDate:'2020-09',endDate:'2023-07',ranking:'前10%',courses:['Synthetic A','Synthetic B']}],languages:[{language:'法语',level:'B2',score:'80'},{language:'英语',level:'大学英语六级',score:'500'}],skills:[{name:'Python',level:'熟练'}],awards:[{name:'Synthetic award',date:'2021-06',description:'Synthetic award detail'}],activities:[{organization:'Synthetic organization',department:'Synthetic department',position:'Synthetic role',startDate:'2020-06',endDate:'2021-07',description:'Synthetic practice',honors:'Synthetic honors'}],projects:[{description:'Unrelated project'}],work:[{position:'Unrelated work'}],summary:'Synthetic summary'};
 const sevenPlans=await page.evaluate(({fields,profile})=>{const values=ResumeMatcher.flatten(profile);return fields.map(f=>({label:f.label,section:f.section,id:f.id,path:ResumeMatcher.match(f,values)?.path||null,value:values[ResumeMatcher.match(f,values)?.path]}));},{fields:snap.fields,profile});
 assert.ok(sevenPlans.slice(0,13).every(p=>p.section==='basics'&&p.path?.startsWith('basics.')));
 assert.deepEqual(sevenPlans.slice(23,27).map(p=>p.path),['languages.1.level','languages.1.score','languages.0.level','languages.0.score']);
 assert.deepEqual(sevenPlans.slice(27,29).map(p=>p.path),['skills.0.name','skills.0.level']);
 assert.deepEqual(sevenPlans.slice(29,32).map(p=>p.path),['awards.0.name','awards.0.date','awards.0.description']);
 assert.ok(sevenPlans.slice(32,39).every(p=>p.path?.startsWith('activities.0.')));
 assert.ok(sevenPlans.slice(39,42).every(p=>p.path===null));assert.equal(sevenPlans[42].path,'summary');
 result=await call({type:'RF_FILL',items:sevenPlans.filter(p=>p.path)});assert.ok(result.results.every(r=>r.status==='verified'));
 const blocked=await page.evaluate(({fields,profile})=>{profile.activities.push({...profile.activities[0],description:'Second practice'});profile.skills.push({name:'Java',level:'一般'});profile.awards.push({name:'Another award'});profile.languages.push({language:'英语',level:'CET4',score:'450'});const values=ResumeMatcher.flatten(profile);return fields.filter(f=>['activities','skills','awards'].includes(f.section)||/^英语/.test(f.label)).map(f=>({match:ResumeMatcher.match(f,values),candidates:ResumeMatcher.candidatePaths(f,values)}));},{fields:snap.fields,profile});
 assert.ok(blocked.every(p=>p.match===null&&p.candidates.length===0));
 await page.setContent('<div class="resume-module"><div class="resume-module-header">最高学历</div><form><div class="el-form-item is-required"><label>入学时间</label><div class="el-date-editor el-date-editor--date"><input id="day-date" placeholder="选择时间"></div></div><div class="el-form-item"><label>毕业时间</label><div class="el-date-editor el-date-editor--month"><input id="month-date"></div></div></form></div><div class="resume-module"><div class="resume-module-header">外语水平</div><div class="el-form-item"><label>英语水平</label><div class="jbs_three_layers_input_wrapper"><input id="reference"></div></div></div>');
 snap=await call({type:'RF_SCAN'});assert.equal(snap.fields[0].required,true);
 result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,value:'2020-09'},{id:snap.fields[1].id,value:'2023/07/15'},{id:snap.fields[2].id,value:'CET6'}]});
 assert.equal(result.results[0].status,'failed');assert.match(result.results[0].error,/精度不足/);assert.equal(await page.locator('#day-date').inputValue(),'');
 assert.equal(result.results[1].status,'verified');assert.equal(await page.locator('#month-date').inputValue(),'2023-07');
 assert.equal(result.results[2].status,'failed');assert.match(result.results[2].error,/多级选择器/);assert.equal(await page.locator('#reference').inputValue(),'');
 result=await call({type:'RF_FILL',items:[{id:snap.fields[0].id,value:'2020/09/02'}]});assert.equal(result.results[0].status,'verified');assert.equal(await page.locator('#day-date').inputValue(),'2020-09-02');
 console.log('PASS: label ownership, scopes/cards/date pairs, dynamic cards; seven 51job modules / 43 fields, local fill-readback and repeated-record isolation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
