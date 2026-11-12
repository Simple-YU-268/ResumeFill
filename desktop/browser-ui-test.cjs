const { _electron:electron }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'rf-browser-ui-'));
 fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({port:0,token:'synthetic-browser-token'.padEnd(64,'x'),upstream:{enabled:false}}));
 fs.writeFileSync(path.join(data,'resume.json'),JSON.stringify({basics:{name:'Synthetic Browser Candidate',email:'browser@example.test'},autoFill:{'basics.email':'review'}}));
 const original=Buffer.from('%PDF-1.7\n% Synthetic browser upload\n%%EOF\n');
 const {Controller}=require('./controller.cjs');
 const controller=new Controller(data,path.join(__dirname,'resources'));
 const pdf=path.join(data,'synthetic-original.pdf');fs.writeFileSync(pdf,original);controller.saveResumeAttachment(pdf);fs.unlinkSync(pdf);
 const field='<form><label>姓名<input id="name" name="name"></label><label>电子邮箱<input id="email" type="email"></label><label>个人简历<input type="file" accept=".pdf" hidden></label><button type="submit">提交申请</button></form><script>window.submissions=0;window.inputs=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submissions++};document.getElementById("name").addEventListener("input",()=>window.inputs++);</script>';
 const cross=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(field);});
 await new Promise(resolve=>cross.listen(0,'127.0.0.1',resolve));
 const fixture=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html;charset=utf-8');
  if(req.url==='/login')return res.end('<button id="login">登录合成网站</button><script>document.getElementById("login").onclick=()=>{document.cookie="synthetic_session=authenticated; Max-Age=86400; SameSite=Lax; Path=/";location.href="/form"}</script>');
  if(req.url==='/frames')return res.end('<iframe src="/inner" style="width:600px;height:400px"></iframe><iframe src="http://127.0.0.1:'+cross.address().port+'/" style="width:600px;height:400px"></iframe>');
  if(req.url==='/srcdoc')return res.end('<iframe style="width:600px;height:400px" srcdoc="'+field.replaceAll('&','&amp;').replaceAll('"','&quot;')+'"></iframe>');
  res.end(field);
 });
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+fixture.address().port;
 let app;
 const launch=()=>electron.launch({executablePath:process.env.RF_ELECTRON_EXECUTABLE||path.join(__dirname,'node_modules/electron/dist/electron.exe'),args:process.env.RF_ELECTRON_EXECUTABLE?[]:[__dirname],env:{...process.env,RF_DESKTOP_DATA:data}});
 try{
  app=await launch();const manager=await app.firstWindow();
  await manager.getByRole('button',{name:'打开网站工作区',exact:true}).waitFor({timeout:15000});
  const opened=app.waitForEvent('window');await manager.getByRole('button',{name:'打开网站工作区',exact:true}).click();
  const workspace=await opened;await workspace.waitForFunction(()=>!!window.rfBrowser);
  const navigate=async suffix=>{
   await workspace.getByRole('textbox',{name:'网站地址',exact:true}).fill(base+suffix);
   await workspace.getByRole('button',{name:'打开网站',exact:true}).click();
   await workspace.waitForFunction(url=>document.getElementById('browserState').dataset.url===url&&document.getElementById('browserState').dataset.loading==='false',base+suffix);
  };
  const read=expression=>app.evaluate(({webContents},{base,expression})=>{
   const guest=webContents.getAllWebContents().find(item=>item.getURL().startsWith(base));
   if(!guest)throw Error('Synthetic guest not found');return guest.executeJavaScript(expression);
  },{base,expression});
  await navigate('/login');
  await read('document.getElementById("login").click()');
  await workspace.waitForFunction(()=>document.getElementById('address').value.endsWith('/form'));
  assert.deepEqual(await read('({node:typeof require,bridge:typeof window.rf,host:typeof window.rfBrowser,engine:typeof globalThis.__resumeFillV2})'),{node:'undefined',bridge:'undefined',host:'undefined',engine:'undefined'});
  const popupOpened=app.waitForEvent('window');await read('window.open("/form?popup=synthetic");true');
  const popup=await popupOpened;await popup.waitForLoadState('domcontentloaded');
  assert.deepEqual(await popup.evaluate(()=>({node:typeof require,bridge:typeof window.rf,host:typeof window.rfBrowser,cookie:document.cookie})),{node:'undefined',bridge:'undefined',host:'undefined',cookie:'synthetic_session=authenticated'});
  await popup.close();
  await workspace.getByRole('button',{name:'扫描表单',exact:true}).click();
  await workspace.locator('#browserSummary').filter({hasText:'2 个字段'}).waitFor();
  const name=workspace.getByRole('combobox',{name:'姓名 对应资料',exact:true});
  const email=workspace.getByRole('combobox',{name:'电子邮箱 对应资料',exact:true});
  assert.equal(await name.inputValue(),'basics.name');assert.equal(await email.inputValue(),'');
  assert.equal(await workspace.locator('#browserEmpty').isVisible(),false);
  const forged=await workspace.evaluate(async()=>{
   try{await window.rfBrowser.command({action:'fill',token:plan.token,choices:[{id:plan.fields[0].id,path:'family.father.idNumber'}]});return false;}
   catch{return true;}
  });
  assert.equal(forged,true);assert.equal(await read('document.getElementById("name").value'),'');
  await email.selectOption('basics.email');
  await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'回读一致 2'}).waitFor();
  assert.deepEqual(await read('({name:document.getElementById("name").value,email:document.getElementById("email").value,inputs:window.inputs,submissions:window.submissions})'),{name:'Synthetic Browser Candidate',email:'browser@example.test',inputs:1,submissions:0});
  assert.equal(await read('typeof globalThis.__resumeFillV2'),'undefined');
  const blockedCommand=await workspace.evaluate(async()=>{
   try{await window.rfBrowser.command({action:'evaluate',code:'require("node:fs")'});return false;}
   catch{return true;}
  });
  assert.equal(blockedCommand,true);
  await workspace.getByRole('button',{name:'选择投递用 PDF',exact:true}).click();
  await workspace.getByRole('button',{name:'确认上传 PDF',exact:true}).waitFor();
  assert.equal(await read('document.querySelector("input[type=file]").files.length'),0);
  await workspace.getByRole('button',{name:'确认上传 PDF',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'已选中 PDF'}).waitFor();
  const selected=await read('(async()=>{const file=document.querySelector("input[type=file]").files[0];return {name:file.name,bytes:[...new Uint8Array(await file.arrayBuffer())]}})()');
  assert.equal(selected.name,'synthetic-original.pdf');assert.deepEqual(Buffer.from(selected.bytes),original);
  await workspace.getByRole('button',{name:'提交前检查',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'请在网页核对并手动提交'}).waitFor();
  assert.equal(await read('window.submissions'),0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('/browser.html')).setContentSize(1000,760));
  await workspace.waitForFunction(()=>innerWidth===1000);
  assert.equal(await workspace.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await workspace.getByRole('button',{name:'扫描表单',exact:true}).focus();
  assert.ok(await workspace.getByRole('button',{name:'扫描表单',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).outlineWidth)>=2.5));
  const guestSurface=await app.evaluate(async({webContents,BrowserWindow},base)=>{
   const guest=webContents.getAllWebContents().find(item=>item.getURL().startsWith(base));
   const window=BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('/browser.html'));
   const image=await guest.capturePage(),bitmap=image.toBitmap();
   return {bounds:window.contentView.children.find(view=>view.webContents===guest).getBounds(),nonblank:bitmap.some((value,index)=>index%4!==3&&value<200),png:image.toPNG().toString('base64')};
  },base);
  assert.deepEqual(guestSurface.bounds,{x:0,y:96,width:640,height:664});assert.equal(guestSurface.nonblank,true);
  fs.mkdirSync(path.resolve('tmp'),{recursive:true});await workspace.screenshot({path:path.resolve('tmp/browser-workspace.png')});
  fs.writeFileSync(path.resolve('tmp/browser-guest.png'),Buffer.from(guestSurface.png,'base64'));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('/browser.html')).setContentSize(900,650));
  await workspace.waitForFunction(()=>innerWidth===900&&innerHeight===650);
  assert.equal(await workspace.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const id of ['scan','fill','attachment','preflight'])assert.equal(await workspace.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
  await navigate('/form?changed=synthetic');
  assert.equal(await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).isDisabled(),true);
  await workspace.getByRole('textbox',{name:'网站地址',exact:true}).fill('file:///C:/Windows/win.ini');
  await workspace.getByRole('button',{name:'打开网站',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'仅支持 HTTP/HTTPS'}).waitFor();
  assert.match(await read('location.href'),/\/form\?changed=synthetic$/);
  await navigate('/frames');
  await app.evaluate(({webContents},base)=>{
   const guest=webContents.getAllWebContents().find(item=>item.getURL().startsWith(base));
   guest.__testWorldFrames=[];const original=guest.debugger.sendCommand.bind(guest.debugger);
   guest.debugger.sendCommand=(method,params,...rest)=>{if(method==='Page.createIsolatedWorld')guest.__testWorldFrames.push(params.frameId);return original(method,params,...rest);};
  },base);
  await workspace.getByRole('button',{name:'扫描表单',exact:true}).click();
  await workspace.locator('#browserSummary').filter({hasText:'2 个字段'}).waitFor();
  await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'回读一致 1'}).waitFor();
  assert.equal(await read('document.querySelector("iframe").contentDocument.getElementById("name").value'),'Synthetic Browser Candidate');
  assert.match(await workspace.locator('#browserDocuments').innerText(),/跨域/);
  const inspectedCrossOrigin=await app.evaluate(async({webContents},{base,crossOrigin})=>{
   const guest=webContents.getAllWebContents().find(item=>item.getURL().startsWith(base));
   const {frameTree}=await guest.debugger.sendCommand('Page.getFrameTree');
   const cross=(frameTree.childFrames||[]).find(child=>child.frame.url.startsWith(crossOrigin));
   return guest.__testWorldFrames.includes(cross.frame.id);
  },{base,crossOrigin:'http://127.0.0.1:'+cross.address().port});
  assert.equal(inspectedCrossOrigin,false,'foreign documents must not receive even the metadata inspection script');
  await navigate('/srcdoc');
  await workspace.getByRole('button',{name:'扫描表单',exact:true}).click();
  await workspace.locator('#browserSummary').filter({hasText:'2 个字段'}).waitFor();
  await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'回读一致 1'}).waitFor();
  assert.equal(await read('document.querySelector("iframe").contentDocument.getElementById("name").value'),'Synthetic Browser Candidate');
  await navigate('/form');
  await workspace.getByRole('button',{name:'扫描表单',exact:true}).click();
  await workspace.locator('#browserSummary').filter({hasText:'2 个字段'}).waitFor();
  await workspace.getByRole('button',{name:'选择投递用 PDF',exact:true}).click();
  await workspace.getByRole('button',{name:'确认上传 PDF',exact:true}).waitFor();
  const replacement=path.join(data,'replacement.pdf');fs.writeFileSync(replacement,Buffer.from('%PDF-1.7\n% Replacement synthetic PDF\n%%EOF\n'));controller.saveResumeAttachment(replacement);fs.unlinkSync(replacement);
  await workspace.getByRole('button',{name:'确认上传 PDF',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'PDF 或表单已变化'}).waitFor();
  assert.equal(await read('document.querySelector("input[type=file]").files.length'),0);
  const profile=JSON.parse(fs.readFileSync(path.join(data,'resume.json'),'utf8'));profile.basics.name='Changed Synthetic Candidate';fs.writeFileSync(path.join(data,'resume.json'),JSON.stringify(profile));
  await workspace.getByRole('button',{name:'填写已核对字段',exact:true}).click();
  await workspace.locator('#browserFeedback').filter({hasText:'资料已变化'}).waitFor();
  assert.equal(await read('document.getElementById("name").value'),'');
  await app.close();app=null;
  app=await launch();const restarted=await app.firstWindow();
  const reopened=app.waitForEvent('window');await restarted.getByRole('button',{name:'打开网站工作区',exact:true}).click();
  const second=await reopened;await second.waitForFunction(()=>!!window.rfBrowser);
  await second.getByRole('textbox',{name:'网站地址',exact:true}).fill(base+'/form');
  await second.getByRole('button',{name:'打开网站',exact:true}).click();
  await second.waitForFunction(()=>document.getElementById('browserState').dataset.loading==='false');
  assert.match(await read('document.cookie'),/synthetic_session=authenticated/);
  console.log('PASS: actual Electron login/popup/session restart, isolated engine, candidate tampering refusal, reviewed fill, exact original PDF, changed profile/PDF refusal, manual submission, navigation invalidation, same-origin/srcdoc routing, cross-origin script refusal and 900px layout');
 }finally{
  await app?.close();await Promise.all([fixture,cross].map(server=>new Promise(resolve=>server.close(resolve))));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
