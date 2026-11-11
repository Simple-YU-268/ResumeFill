const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});try{
 const page=await browser.newPage();await page.setContent('<main></main>');for(const f of ['profile.js','matcher.js','layout.js','controls.js'])await page.addScriptTag({path:path.join(__dirname,f)});
 await page.setContent('<fieldset><legend>性别</legend><label><input type="radio" name="sex">男</label><label><input type="radio" name="sex">女</label></fieldset><dl><dt>电子邮箱</dt><dd><input id="email"></dd></dl><div class="form-row"><label>户籍所在地</label><select id="opaque"><option>请选择市</option><option>南京市</option></select></div>');
 assert.deepEqual(await page.evaluate(()=>[ResumeLayout.associate(document.querySelector('input')).groupLabel,ResumeLayout.associate(document.querySelector('#email')).label,ResumeLayout.associate(document.querySelector('#opaque')).regionLevel]),['性别','电子邮箱','city']);
 await page.evaluate(()=>{globalThis.chrome={runtime:{onMessage:{addListener:fn=>globalThis.listener=fn}}};});for(const f of ['adapters.js','content.js'])await page.addScriptTag({path:path.join(__dirname,f)});
 const scan=await page.evaluate(()=>new Promise(resolve=>listener({type:'RF_SCAN',adapters:{version:1,adapters:[]}}, {}, resolve)));const gender=scan.fields.find(f=>f.type==='radio');assert.equal(gender.label,'性别');
 const filled=await page.evaluate(id=>new Promise(resolve=>listener({type:'RF_FILL',items:[{id,value:'女'}]}, {}, resolve)),gender.id);assert.equal(filled.results[0].status,'verified');
 assert.equal(gender.labelProvenance,'legend');
 const emailSignal=scan.fields.find(f=>f.label==='电子邮箱');
 assert.equal(emailSignal.labelProvenance,'dt-dd');
 assert.equal(emailSignal.visible,true);
 assert.equal(emailSignal.component,'native');
 // A reused visible portal has no ARIA link and existed before the click.
 await page.setContent('<input role="combobox" id="trigger" readonly><div role="listbox" id="menu"><div role="option">旧候选</div></div><div role="listbox" style="margin-top:200px"><div role="option">目标</div></div>');
 await page.evaluate(()=>{const input=document.querySelector('#trigger'),menu=document.querySelector('#menu');input.onclick=()=>{menu.replaceChildren();for(const text of ['目标','其他']){const o=document.createElement('div');o.setAttribute('role','option');o.textContent=text;o.onclick=()=>{input.value=text;};menu.append(o);}};});
 assert.equal(await page.evaluate(async()=>{const d={el:document.querySelector('#trigger'),scope:document,type:'combobox',config:{}};await ResumeControls.fill(d,'目标',true);return (await ResumeControls.verify(d,'目标')).status;}),'verified');
 const call=message=>page.evaluate(message=>new Promise(resolve=>listener(message,{},resolve)),message);await page.evaluate(()=>{const label=document.createElement('label');label.htmlFor='trigger';label.id='recycled-label';label.textContent='毕业院校';document.body.prepend(label);});let observed=await call({type:'RF_SCAN',adapters:{version:1,adapters:[]}});let field=observed.fields.find(f=>f.type==='combobox');assert.equal(field.label,'毕业院校');await call({type:'RF_FILL',overwrite:true,items:[{id:field.id,value:'目标'}]});observed=await call({type:'RF_SCAN'});field=observed.fields.find(f=>f.type==='combobox');assert.equal((await call({type:'RF_VERIFY',items:[{id:field.id,value:'目标'}]}))[0].status,'verified');await page.locator('#recycled-label').evaluate(n=>n.textContent='工作单位');observed=await call({type:'RF_SCAN'});field=observed.fields.find(f=>f.type==='combobox');assert.equal(field.label,'工作单位');assert.equal((await call({type:'RF_VERIFY',items:[{id:field.id,value:'目标'}]}))[0].status,'unconfirmed');
 await page.setContent('<form><label>个人简历<input type="file" accept=".pdf"></label><button type="submit">提交</button></form>');
 await page.evaluate(()=>{window.submissions=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submissions++;};});
 await call({type:'RF_SCAN'});
 const pdf=Buffer.from('%PDF-1.7\n%%EOF\n');
 const upload={type:'RF_RUN_UPLOAD',fileName:'fixture.pdf',size:pdf.length,dataBase64:pdf.toString('base64')};
 const stale=await call({type:'RF_RUN_UPLOAD'});
 assert.ok(stale.token,stale.error);
 await page.locator('input[type=file]').evaluate(el=>el.replaceWith(el.cloneNode()));
 assert.match((await call({...upload,token:stale.token})).error,/变化/);
 assert.equal(await page.locator('input[type=file]').evaluate(el=>el.files.length),0);
 const fresh=await call({type:'RF_RUN_UPLOAD'});
 assert.deepEqual(await call({...upload,token:fresh.token}),{selected:true});
 assert.deepEqual(await page.locator('input[type=file]').evaluate(async el=>[await el.files[0].text(),window.submissions]),[pdf.toString(),0]);
 assert.ok((await call({type:'RF_RUN_UPLOAD'})).error);
 await page.setContent('<form><label>Email<input type="email" required></label><input hidden required><button type="submit">Apply</button></form>');
 await page.evaluate(()=>{window.submissions=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submissions++;};});
 await call({type:'RF_SCAN'});
 let check=await call({type:'RF_RUN_PREFLIGHT'});
 assert.deepEqual(check.issues.map(i=>i.code),['required-empty']);
 assert.deepEqual(check.candidates,['Apply']);
 await page.locator('input[type=email]').fill('invalid');
 check=await call({type:'RF_RUN_PREFLIGHT'});
 assert.deepEqual(check.issues.map(i=>i.code),['invalid']);
 await page.locator('input[type=email]').fill('candidate@example.test');
 assert.deepEqual((await call({type:'RF_RUN_PREFLIGHT'})).issues,[]);
 assert.equal(await page.evaluate(()=>window.submissions),0);
 for(const duplicate of [false,true]){
  await page.setContent('<form><label>姓名<input id="first"></label><label>邮箱<input name="email"></label></form>');
  await page.evaluate(duplicate=>document.querySelector('#first').addEventListener('input',()=>{
   const label=document.querySelector('[name=email]').parentElement;
   label.replaceWith(...Array.from({length:duplicate?2:1},()=>label.cloneNode(true)));
  }),duplicate);
  const {fields}=await call({type:'RF_SCAN'});
  const result=await call({type:'RF_FILL',items:[{id:fields[0].id,value:'Synthetic'},{id:fields[1].id,value:'candidate@example.test'}]});
  assert.equal(result.results[1].status,duplicate?'stale':'verified');
  assert.deepEqual(await page.locator('[name=email]').evaluateAll(nodes=>nodes.map(n=>n.value)),duplicate?['','']:['candidate@example.test']);
 }
 await page.setContent('<div id="controlled"></div>');
 const events=await page.evaluate(async()=>{
  const host=document.querySelector('#controlled'),shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML='<label>邮箱<input></label>';
  const input=shadow.querySelector('input'),events=[];
  Object.defineProperty(input,'value',{get(){return this.getAttribute('tracked')||'';},set(value){this.setAttribute('tracked',value);}});
  host.addEventListener('input',event=>events.push([event.type,event instanceof InputEvent,event.inputType]));
  host.addEventListener('change',event=>events.push([event.type,event.composed]));
  await ResumeControls.fill({el:input,type:'input',scope:shadow,config:{}},'candidate@example.test',true);
  return {events,native:Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').get.call(input)};
 });
 assert.deepEqual(events,{events:[['input',true,'insertText'],['change',true]],native:'candidate@example.test'});
 assert.equal(await page.evaluate(async()=>{
  const shadow=document.querySelector('#controlled').shadowRoot;
  shadow.innerHTML='<div contenteditable="true"></div>';
  const el=shadow.firstChild;
  let received=false;
  document.querySelector('#controlled').addEventListener('input',event=>{received=event instanceof InputEvent&&event.composed;},{once:true});
  await ResumeControls.fill({el,type:'contenteditable',scope:shadow,config:{}},'Synthetic content',true);
  return received;
 }),true);
 await page.setContent('<label id="ivu-label">学历</label><div class="ivu-select" aria-labelledby="ivu-label" aria-controls="ivu-menu"><div class="ivu-select-selection"><span class="ivu-select-selected-value"></span><input readonly></div></div><div class="ivu-select-dropdown" id="ivu-menu" style="display:none"><div class="ivu-select-item">本科</div></div>');
 await page.evaluate(()=>{
  const select=document.querySelector('.ivu-select'),menu=document.querySelector('#ivu-menu');
  select.onclick=()=>{menu.style.display='block';};
  menu.firstChild.onclick=()=>{select.querySelector('.ivu-select-selected-value').textContent='本科';menu.style.display='none';};
 });
 const ivu=await call({type:'RF_SCAN'});
 assert.equal(ivu.fields.length,1);
 assert.equal(ivu.fields[0].component,'iview');
 assert.equal(ivu.fields[0].type,'combobox');
 assert.equal((await call({type:'RF_FILL',items:[{id:ivu.fields[0].id,value:'本科'}]})).results[0].status,'verified');
 await page.evaluate(()=>{
   document.querySelector('.ivu-select-selected-value').textContent='';
   document.querySelector('.ivu-select-item').classList.add('ivu-select-item-disabled');
 });
 const disabledIvu=await call({type:'RF_SCAN'});
 assert.notEqual((await call({type:'RF_FILL',items:[{id:disabledIvu.fields[0].id,value:'本科'}]})).results[0].status,'verified');
 // Render only a window into an indexed list. Duplicate matches can be off-screen.
 async function virtual(mode){await page.setContent('<input role="combobox" id="trigger" aria-controls="virtual" readonly><div id="virtual" role="listbox" style="display:none;height:100px;width:200px;overflow-y:auto;position:relative"><div id="space" style="height:400px;position:relative"></div></div>');await page.evaluate(mode=>{const input=document.querySelector('#trigger'),menu=document.querySelector('#virtual'),space=document.querySelector('#space');window.clicked=[];const names=Array.from({length:20},(_,i)=>'候选'+i);names[16]='目标';if(mode==='duplicate')names[2]='目标';window.testValue=mode==='numeric'?'3年':'目标';if(mode==='numeric'){names[2]='1-3年';names[16]='3-5年';}const render=()=>{space.replaceChildren();let first=Math.floor(menu.scrollTop/20);if(mode==='gap')first+=1;for(let i=first;i<Math.min(first+5,20);i++){const o=document.createElement('div');o.setAttribute('role','option');o.setAttribute('aria-posinset',String(i+1));o.setAttribute('aria-setsize','20');o.textContent=names[i];o.style.cssText='position:absolute;height:20px;top:'+i*20+'px';o.onclick=()=>{clicked.push(i);input.value=names[i];};space.append(o);}};menu.onscroll=render;input.onclick=()=>{menu.style.display='block';render();};window.abort=new AbortController();if(mode==='cancel')menu.addEventListener('scroll',()=>abort.abort(),{once:true});},mode);
 return await page.evaluate(async()=>{const d={el:document.querySelector('#trigger'),scope:document,type:'combobox',config:{},field:{label:'工作年限'},signal:abort.signal};try{await ResumeControls.fill(d,testValue,true);return {status:(await ResumeControls.verify(d,testValue)).status,clicked};}catch(e){return {error:e.message,clicked};}});}
 const success=await virtual('ok');assert.equal(success.status,'verified');assert.deepEqual(success.clicked,[16]);const duplicate=await virtual('duplicate');assert.match(duplicate.error,/重复/);assert.deepEqual(duplicate.clicked,[]);const numeric=await virtual('numeric');assert.match(numeric.error,/重复/);assert.deepEqual(numeric.clicked,[]);const gap=await virtual('gap');assert.match(gap.error,/未完整枚举/);assert.deepEqual(gap.clicked,[]);const cancel=await virtual('cancel');assert.match(cancel.error,/取消/);assert.deepEqual(cancel.clicked,[]);
 console.log('PASS: grouped radio labels, DT/DD, opaque region controls, reused portal ownership, complete indexed virtual dropdown, off-screen duplicate/incomplete/cancel rejection');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
