const {_electron:electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'rf-platform-native-'));
 fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({port:0,token:'synthetic-platform-token'.padEnd(64,'x'),upstream:{enabled:false}}));
 fs.writeFileSync(path.join(data,'resume.json'),JSON.stringify({basics:{name:'Synthetic Native Candidate'}}));
 const bytes=Buffer.from('%PDF-1.7\nSynthetic native fixture\n%%EOF\n'),pdf=path.join(data,'synthetic.pdf');fs.writeFileSync(pdf,bytes);
 const {Controller}=require('./controller.cjs');new Controller(data,path.join(__dirname,'resources')).saveResumeAttachment(pdf);fs.unlinkSync(pdf);
 let app;
 try{
  app=await electron.launch({executablePath:process.env.RF_ELECTRON_EXECUTABLE||path.join(__dirname,'node_modules/electron/dist/electron.exe'),args:process.env.RF_ELECTRON_EXECUTABLE?[]:[__dirname],env:{...process.env,RF_DESKTOP_DATA:data}});
  await app.evaluate(({session})=>session.fromPartition('persist:resumefill-websites').protocol.handle('https',request=>{
   if(new URL(request.url).hostname!=='synthetic.zhiye.com')return new Response('Blocked test network',{status:403});
   return new Response('<section><h2>基本信息</h2><div class="ux-standard-form"><div class="form-item"><div class="form-item__text">姓名</div><input id="person"></div><div class="form-item"><div class="form-item__text">个人简历</div><input type="file" accept=".pdf" hidden></div></div></section><button onclick="window.submitted=true">提交申请</button>',{headers:{'content-type':'text/html;charset=utf-8'}});
  }));
  const manager=await app.firstWindow();await manager.getByRole('button',{name:'打开网站工作区',exact:true}).waitFor();
  const opened=app.waitForEvent('window');await manager.getByRole('button',{name:'打开网站工作区',exact:true}).click();const workspace=await opened;
  await workspace.getByRole('textbox',{name:'网站地址',exact:true}).fill('https://synthetic.zhiye.com/form');await workspace.getByRole('button',{name:'打开网站',exact:true}).click();
  await workspace.waitForFunction(()=>document.getElementById('browserState').dataset.url==='https://synthetic.zhiye.com/form'&&document.getElementById('browserState').dataset.loading==='false');
  const read=expression=>app.evaluate(({webContents},expression)=>webContents.getAllWebContents().find(w=>w.getURL()==='https://synthetic.zhiye.com/form').executeJavaScript(expression),expression);
  const scan=async()=>{await workspace.getByRole('button',{name:'扫描表单',exact:true}).click();await workspace.locator('#browserSummary').filter({hasText:'北森'}).waitFor();};
  await scan();assert.match(await workspace.locator('#browserSummary').innerText(),/北森.*简历表单/);
  await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).click();await workspace.locator('#browserFeedback').filter({hasText:'回读一致 1'}).waitFor();assert.equal(await read('document.getElementById("person").value'),'Synthetic Native Candidate');
  await workspace.getByRole('button',{name:'选择投递用 PDF',exact:true}).click();await workspace.getByRole('button',{name:'确认上传 PDF',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'重新扫描'}).waitFor();assert.equal(await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).isDisabled(),true);
  assert.deepEqual(Buffer.from(await read('(async()=>[...new Uint8Array(await document.querySelector("input[type=file]").files[0].arrayBuffer())])()')),bytes);
  await read('document.body.insertAdjacentHTML("beforeend",`<div role="dialog"><input type="tel"><button>短信登录</button></div>`);true');await scan();await workspace.locator('#browserSummary').filter({hasText:'请先登录'}).waitFor();
  assert.equal(await read('!!window.submitted'),false);assert.equal(await read('typeof globalThis.ResumePlatforms'),'undefined');
  console.log('PASS: native Electron shared Beisen workflow, reviewed fill, exact imported PDF, parsing invalidates plan, SMS login handoff and isolated adapter');
 }finally{await app?.close();fs.rmSync(data,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
