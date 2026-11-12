const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const WORLD='ResumeFill isolated engine';
const ENGINE_FILES=['profile.js','matcher.js','layout.js','platform-workflows.js','adapters.js','controls.js','answers.js','content.js'];
function webURL(value){
 if(typeof value!=='string'||value.length>8192)throw Error('仅支持 HTTP/HTTPS 网站地址');
 let url;try{url=new URL(value);}catch{throw Error('仅支持 HTTP/HTTPS 网站地址');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('仅支持 HTTP/HTTPS 网站地址，不能包含登录凭据');
 return url.href;
}
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
class BrowserEngine{
 constructor(contents,controller,runtime,notify=()=>{}){
  this.contents=contents;this.controller=controller;this.runtime=runtime;this.notify=notify;
  this.epoch=0;this.plan=null;this.busy=false;this.approval=null;this.routes={};
  this.version=require(path.join(runtime,'package.json')).version;
  this.matcher=require(path.join(runtime,'matcher.js'));
  this.answers=require(path.join(runtime,'answers.js'));
  this.ready=null;
  const session={get:async key=>({[key]:this.routes[key]}),set:async value=>Object.assign(this.routes,value),remove:async key=>{delete this.routes[key];}};
  const chrome={runtime:{getManifest:()=>({version:this.version})},storage:{session},
   tabs:{get:async()=>({id:1,url:this.contents.getURL()}),sendMessage:(_id,message,route)=>this.dispatch(message,route)},
   scripting:{executeScript:options=>this.execute(options)},
  };
  const context=vm.createContext({chrome,URL});
  vm.runInContext(fs.readFileSync(path.join(runtime,'extension/page-bridge.js'),'utf8'),context);
  this.bridge=context.ResumePageBridge;
 }
 invalidate(){
  const route=this.routes['pageRoute:1'];
  if(this.busy&&route)void this.dispatch({type:'RF_CANCEL'},route).catch(()=>{});
  this.epoch++;this.plan=null;this.approval=null;this.routes={};this.notify();
 }
 async initialize(){
  if(!this.ready)this.ready=(async()=>{
   if(!this.contents.debugger.isAttached())this.contents.debugger.attach('1.3');
   await this.contents.debugger.sendCommand('Page.enable');
  })().catch(error=>{this.ready=null;throw error;});
  return this.ready;
 }
 async frames(){
  await this.initialize();
  const {frameTree}=await this.contents.debugger.sendCommand('Page.getFrameTree');
  const frames=[];
  const visit=async(tree,id,parentOrigin)=>{
   const frame=tree.frame;let securityOrigin=frame.securityOrigin;
   // Chromium reports :// for srcdoc; verify its owner before inheriting a trusted parent origin.
   if(frame.url==='about:srcdoc'&&parentOrigin===new URL(webURL(this.contents.getURL())).origin){
    try{
     const owner=await this.contents.debugger.sendCommand('DOM.getFrameOwner',{frameId:frame.id});
     const {node}=await this.contents.debugger.sendCommand('DOM.describeNode',{backendNodeId:owner.backendNodeId});
     const attrs=new Map();for(let i=0;i<(node.attributes||[]).length;i+=2)attrs.set(node.attributes[i],node.attributes[i+1]);
     if(attrs.has('srcdoc')&&(!attrs.has('sandbox')||attrs.get('sandbox').split(/\s+/).includes('allow-same-origin')))securityOrigin=parentOrigin;
    }catch{}
   }
   frames.push({frameId:id,cdpId:frame.id,documentId:frame.id+':'+frame.loaderId,url:frame.url,securityOrigin});
   for(const child of tree.childFrames||[])await visit(child,child.frame.id,securityOrigin);
  };
  await visit(frameTree,0,null);return frames;
 }
 async evaluate(frame,expression){
  const current=(await this.frames()).find(item=>item.cdpId===frame.cdpId);
  if(current?.documentId!==frame.documentId)throw Error('表单文档已变化，请重新扫描');
  const origin=new URL(webURL(this.contents.getURL())).origin;
  if(current.securityOrigin!==origin)throw Error('不能访问跨域表单');
  const {executionContextId}=await this.contents.debugger.sendCommand('Page.createIsolatedWorld',{frameId:frame.cdpId,worldName:WORLD});
  const result=await this.contents.debugger.sendCommand('Runtime.evaluate',{
   expression,contextId:executionContextId,returnByValue:true,awaitPromise:true,timeout:120000,
  });
  if(result.exceptionDetails)throw Error('页面引擎执行失败，请重新扫描');
  return result.result?.value;
 }
 async execute({target,func}){
  const frames=(await this.frames()).filter(frame=>target.allFrames||target.frameIds?.includes(frame.frameId));
  const results=[];
  const origin=new URL(webURL(this.contents.getURL())).origin;
  for(const frame of frames){
   if(frame.securityOrigin!==origin){results.push({...frame,result:{visible:false,reason:'CROSS_ORIGIN_DOCUMENT'}});continue;}
   try{results.push({...frame,result:await this.evaluate(frame,'('+func.toString()+')()')});}
   catch{results.push({...frame,result:{visible:false,reason:'DOCUMENT_ID_UNAVAILABLE'}});}
  }
  return results;
 }
 async dispatch(message,route){
  const frame=(await this.frames()).find(item=>item.frameId===route.frameId&&item.documentId===route.documentId);
  if(!frame)throw Error('表单文档已变化，请重新扫描');
  return this.evaluate(frame,`new Promise(resolve=>{
   const listener=globalThis.__rfMessageListener;
   if(!listener)return resolve({error:'页面引擎尚未就绪'});
   const handled=listener(${JSON.stringify(message)},{},resolve);
   if(handled!==true)resolve({error:'不支持的页面操作'});
  })`);
 }
 async inject(){
  webURL(this.contents.getURL());
  const origin=new URL(this.contents.getURL()).origin;
  const files=ENGINE_FILES.map(name=>fs.readFileSync(path.join(this.runtime,'extension',name),'utf8')).join('\n;\n');
  for(const frame of await this.bridge.inspect(1)){
   if(!this.bridge.eligible(frame.result,origin))continue;
   if(frame.result.ready){
    if(frame.result.runtimeVersion!==this.version||frame.result.runtimeProtocol!==1)throw Error('页面引擎版本已变化，请刷新后扫描');
    continue;
   }
   await this.evaluate(frame,`globalThis.chrome={runtime:{getManifest:()=>({version:${JSON.stringify(this.version)}}),
    onMessage:{addListener:listener=>{globalThis.__rfMessageListener=listener;}},sendMessage:async()=>({})}};\n${files}\ntrue;`);
  }
  await this.bridge.prepare(1);
 }
 async scan(options={}){
  const epoch=this.epoch,profile=this.controller.profile();
  await this.inject();
  const snapshot=await this.bridge.scan(1,{type:'RF_SCAN',documentId:options.documentId,
   workProfile:await this.matcher.workProfile(profile),
   ...(options.workAssignments?{workAssignments:options.workAssignments,workTopology:options.workTopology,workAssignmentProfileKey:options.profileKey}:{}),
   adapters:{version:1,adapters:[]},counts:Object.fromEntries(['education','work','projects'].map(name=>[name,profile[name]?.length||0])),
  });
  if(epoch!==this.epoch)throw Error('页面已跳转，请重新扫描');
  const values=this.matcher.flatten(profile),fields=[];
  for(const field of snapshot.fields){
   const decision=this.matcher.decide(field,values,profile.autoFill);
   const answer=this.answers.match(field,profile,snapshot);
   const allowed=path=>Object.hasOwn(values,path)&&String(values[path]??'').trim()&&this.matcher.fieldPolicy(profile,path)!=='never'&&
    (path===answer?.path||this.matcher.allowedPath(field,path));
   const candidates=decision.action==='block'?[]:[...new Set([answer?.path,decision.sourcePath,...decision.alternatives.map(item=>item.path),...this.matcher.candidatePaths(field,values)])]
    .filter(path=>path&&allowed(path)).slice(0,20).map(path=>({path,preview:String(values[path]).slice(0,200)}));
   const answerAuto=answer&&decision.risk==='normal'&&!field.ambiguousLabel&&!field.contextBlocked&&!field.workBindingRequired&&this.matcher.fieldPolicy(profile,answer.path)==='auto';
   const selected=decision.action==='block'?'':answerAuto?answer.path:
    decision.action==='fill'?decision.sourcePath:'';
   fields.push({id:field.id,label:field.label,section:field.section,recordIndex:field.recordIndex,decision,candidates,selected:candidates.some(item=>item.path===selected)?selected:''});
  }
  const token=crypto.randomUUID();
  this.plan={epoch,token,profileKey:digest(profile),snapshot,values,fields};this.approval=null;
  return {token,fields,workflow:snapshot.workflow,documents:snapshot.documents,selectionRequired:snapshot.selectionRequired,frameDocumentId:snapshot.frameDocumentId,
   diagnostics:snapshot.diagnostics,workBindings:snapshot.workBindings,workTopology:snapshot.workTopology,profileKey:snapshot.workProfileKey,
   workRecords:(profile.work||[]).map((record,index)=>({index,type:record.employmentType||'unknown',company:String(record.company||'未命名').slice(0,100)}))};
 }
 requirePlan(token){
  if(!this.plan||this.plan.token!==token||this.plan.epoch!==this.epoch)throw Error('填写计划已失效，请重新扫描');
  if(digest(this.controller.profile())!==this.plan.profileKey){this.invalidate();throw Error('资料已变化，请重新扫描');}
  return this.plan;
 }
 async fill(input){
  const plan=this.requirePlan(input.token);
  if(!Array.isArray(input.choices)||input.choices.length>500)throw Error('无效的填写计划');
  const seen=new Set(),items=[];
  for(const choice of input.choices){
   const field=plan.fields.find(field=>field.id===choice.id);
   if(!field||seen.has(choice.id)||!field.candidates.some(item=>item.path===choice.path))throw Error('填写项目超出已核对的候选范围');
   seen.add(choice.id);
   items.push({id:choice.id,path:choice.path,value:plan.values[choice.path],referenceData:this.matcher.referenceData(choice.path,plan.values)});
  }
  if(!items.length)throw Error('请先核对至少一个填写字段');
  const result=await this.bridge.send(1,{type:'RF_FILL',items,overwrite:input.overwrite===true,saveCards:false});
  this.requirePlan(input.token);return result;
 }
 async attachment(input){
  this.requirePlan(input.token);
  const file=this.controller.resumeAttachment();
  if(!file)throw Error('请先在资料管理中导入投递用 PDF');
  if(!input.confirm){
   const target=await this.bridge.send(1,{type:'RF_RUN_UPLOAD'});
   this.approval={token:input.token,sha256:file.sha256,target:target.token};
   return {pending:true,fileName:file.fileName,size:file.size};
  }
  const approval=this.approval;this.approval=null;
  if(!approval||approval.token!==input.token||approval.sha256!==file.sha256)throw Error('PDF 或表单已变化，请重新选择附件');
  const result=await this.bridge.send(1,{...file,type:'RF_RUN_UPLOAD',token:approval.target});
  if(result.rescanRequired)this.invalidate();
  return result;
 }
 async command(input){
  if(!input||typeof input!=='object')throw Error('无效的网站操作');
  if(input.action==='cancel')return this.bridge.send(1,{type:'RF_CANCEL'});
  if(this.busy)throw Error('上一项操作尚未结束');
  if(!['scan','fill','attachment','preflight'].includes(input.action))throw Error('不支持的网站操作');
  this.busy=true;this.notify();
  try{
   if(input.action==='scan')return await this.scan(input);
   if(input.action==='fill')return await this.fill(input);
   if(input.action==='attachment')return await this.attachment(input);
   this.requirePlan(input.token);return await this.bridge.send(1,{type:'RF_RUN_PREFLIGHT'});
  }finally{this.busy=false;this.notify();}
 }
 close(){this.invalidate();try{if(this.contents.debugger.isAttached())this.contents.debugger.detach();}catch{}}
}
function createBrowserWorkspace(controller,runtime){
 const {BrowserWindow,WebContentsView,session,shell}=require('electron');
 const prefs={partition:'persist:resumefill-websites',nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,navigateOnDragDrop:false,safeDialogs:true};
 const guestSession=session.fromPartition(prefs.partition);
 guestSession.setPermissionCheckHandler(()=>false);
 guestSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 guestSession.setDevicePermissionHandler(()=>false);
 const window=new BrowserWindow({width:1360,height:900,minWidth:900,minHeight:650,autoHideMenuBar:true,title:'ResumeFill · 网站工作区',
  webPreferences:{preload:path.join(__dirname,'browser-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const view=new WebContentsView({webPreferences:prefs});
 window.contentView.addChildView(view);view.setVisible(false);
 const popups=new Set();let closed=false;
 const state=()=>({url:view.webContents.getURL(),loading:view.webContents.isLoading(),back:view.webContents.navigationHistory.canGoBack(),
  forward:view.webContents.navigationHistory.canGoForward(),epoch:engine.epoch,hasPlan:!!engine.plan,busy:engine.busy});
 const publish=()=>{if(!closed&&!window.webContents.isDestroyed())window.webContents.send('rf:browser-state',state());};
 const engine=new BrowserEngine(view.webContents,controller,runtime,publish);
 function secure(contents){
  for(const name of ['will-navigate','will-redirect'])contents.on(name,(event,url)=>{
   try{webURL(url||event.url);}catch{event.preventDefault();}
  });
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.setWindowOpenHandler(({url})=>{
   try{webURL(url);return {action:'allow',overrideBrowserWindowOptions:{width:900,height:700,parent:window,autoHideMenuBar:true,webPreferences:prefs}};}
   catch{return {action:'deny'};}
  });
  contents.on('did-create-window',child=>{popups.add(child);secure(child.webContents);child.on('closed',()=>popups.delete(child));});
 }
 secure(view.webContents);
 const resize=()=>{
  const [width,height]=window.getContentSize();
  view.setBounds({x:0,y:96,width:Math.max(0,width-360),height:Math.max(0,height-96)});
 };
 window.on('resize',resize);resize();
 view.webContents.on('did-start-navigation',()=>engine.invalidate());
 for(const event of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','did-fail-load'])view.webContents.on(event,publish);
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.webContents.ipc.handle('rf:browser',async(event,input)=>{
  if(event.senderFrame!==window.webContents.mainFrame)throw Error('无效的界面来源');
  try{
   if(input?.action==='state')return {value:state()};
   if(input?.action==='navigate'){
    if(engine.busy)throw Error('请先停止填写再切换网站');
    const url=webURL(input.url);engine.invalidate();view.setVisible(true);
    await view.webContents.loadURL(url);return {value:state()};
   }
   if(input?.action==='back'||input?.action==='forward'||input?.action==='reload'){
    if(engine.busy)throw Error('请先停止填写再切换网站');
    engine.invalidate();
    const history=view.webContents.navigationHistory;
    if(input.action==='back'&&history.canGoBack())history.goBack();
    if(input.action==='forward'&&history.canGoForward())history.goForward();
    if(input.action==='reload')view.webContents.reload();
    return {value:state()};
   }
   if(input?.action==='external'){await shell.openExternal(webURL(view.webContents.getURL()));return {value:true};}
   return {value:await engine.command(input)};
  }catch(error){return {error:error.message};}
 });
 window.on('closed',()=>{
  closed=true;for(const popup of popups)popup.destroy();
  engine.close();if(!view.webContents.isDestroyed())view.webContents.close();
 });
 window.loadFile(path.join(__dirname,'ui/browser.html'));
 return {window,engine};
}
module.exports={webURL,BrowserEngine,createBrowserWorkspace};
