const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true});
 try{
  for(const width of [1280,700]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    const metadata={fileName:'synthetic-original-resume-with-a-long-filename-for-layout-testing.pdf',size:2048};
    window.rf={profile:async()=>({basics:{}}),model:async()=>({enabled:false}),
      status:async()=>({running:true,connections:[],pairing:{},applications:[
       {origin:'https://jobs.example.test',status:'handoff',verified:3,failed:1,updatedAt:1},
       {origin:'https://finished.example.test',status:'submitted',verified:5,failed:0,updatedAt:2}]}),
      updateState:async()=>({phase:'idle'}),onUpdate:()=>{},onPDFProgress:()=>{},
      resumeAttachmentMetadata:async()=>metadata,chooseResumeAttachment:async()=>metadata,removeResumeAttachment:async()=>true};
   });
   await page.goto(pathToFileURL(path.join(__dirname,'ui/index.html')).href);
   const policyState=await page.evaluate(()=>{
    const editor=new ProfileEditor(document.createElement('div'));
    editor.load({work:[{company:'Synthetic A'},{company:'Synthetic B'}],autoFill:{'work.0.company':'never','work.1.company':'review'}});
    editor.remove(['work',0]);
    const after=editor.value().autoFill;
    [...editor.host.querySelectorAll('button')].find(button=>button.textContent==='撤销上次删除').click();
    return {after,restored:editor.value().autoFill};
   });
   assert.deepEqual(policyState.after,{'work.0.company':'review'});
   assert.deepEqual(policyState.restored,{'work.0.company':'never','work.1.company':'review'});
   await page.locator('#profile-tab-policies').click();
   await page.getByRole('combobox',{name:'基本信息 · 电子邮箱 填写策略',exact:true}).selectOption('never');
   assert.equal(await page.evaluate(()=>profileEditor.value().autoFill['basics.email']),'never');
   await page.locator('#applicationBoard [role=listitem]').last().waitFor();
   assert.equal(await page.locator('#applicationBoard [role=listitem]').count(),2);
   const filter=page.getByRole('combobox',{name:'投递任务状态筛选'});
   await filter.selectOption('pending');
   assert.equal(await page.locator('#applicationBoard [role=listitem]').count(),1);
   assert.match(await page.locator('#applicationBoard').innerText(),/等待手动提交/);
   await filter.selectOption('finished');
   assert.match(await page.locator('#applicationBoard [role=listitem]').innerText(),/已确认投递/);
   await filter.focus();
   assert.equal(await filter.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
   assert.match(await page.locator('#resumeAttachmentInfo').innerText(),/2 KB/);
   await page.getByRole('button',{name:'移除投递用 PDF',exact:true}).click();
   assert.equal(await page.locator('#resumeAttachmentInfo').innerText(),'尚未导入投递用 PDF');
   await page.getByRole('button',{name:'导入投递用 PDF',exact:true}).click();
   assert.match(await page.locator('#resumeAttachmentInfo').innerText(),/synthetic-original/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   fs.mkdirSync(path.resolve('tmp'),{recursive:true});
   await page.locator('#applicationBoard').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.resolve('tmp/application-board-'+width+'.png')});
   await page.close();
  }
  console.log('PASS: desktop task filters, PDF metadata/import/removal, keyboard focus and 1280/700 layouts');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
