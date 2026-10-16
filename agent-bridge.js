(() => {
 const runs=new Map(),signature=f=>JSON.stringify([f.label,f.section,f.recordIndex,f.type]);let starting=false;
 const pageKey=url=>{const u=new URL(url);return u.origin+u.pathname+(u.searchParams.has('formId')?'?formId='+encodeURIComponent(u.searchParams.get('formId')):'');};
 async function connection(){const {aiSettings}=await chrome.storage.local.get('aiSettings');const config=ResumeAI.settings(aiSettings);const u=new URL(config.endpoint||'http://invalid');if(!config.enabled||u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname))throw Error('Agent 需要配置本地网关连接');const {aiApiKey}=await chrome.storage.session.get('aiApiKey');if(!aiApiKey||aiApiKey.length<32)throw Error('请先导入并保存本地服务连接文件');if(!await chrome.permissions.contains({origins:[config.originPattern]}))throw Error('请重新保存本地连接并授权地址');const check=new AbortController(),timer=setTimeout(()=>check.abort(),5000);try{const r=await fetch(u.origin+'/health',{headers:{Authorization:'Bearer '+aiApiKey},signal:check.signal,credentials:'omit',redirect:'error'});const health=await r.json();if(!r.ok||health.identity!=='ResumeFillAgent')throw Error('本地服务不支持 Agent，请升级并重启服务');}finally{clearTimeout(timer);}return {base:u.origin,key:aiApiKey};}
 async function rpc(run,action,data){const controller=new AbortController();run.controller=controller;const timer=setTimeout(()=>controller.abort(),24000);try{const r=await fetch(run.connection.base+'/v1/agent/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+run.connection.key},body:JSON.stringify(data),signal:controller.signal,credentials:'omit',redirect:'error'});const body=await r.json();if(!r.ok||!body.agent)throw Error('Agent 服务请求失败，请检查服务或重新启动任务');return body.agent;}finally{clearTimeout(timer);if(run.controller===controller)run.controller=null;}}
 async function publish(run){await chrome.storage.session.set({agentRun:{runId:run.id,tabId:run.tabId,pageKey:run.pageKey,state:run.state,error:run.error||'',running:!!run.running,updatedAt:new Date().toISOString()}});}
 async function checkPage(run){const tab=await chrome.tabs.get(run.tabId);if(tab.url!==run.url||pageKey(tab.url)!==run.pageKey)throw Error('页面范围变化，Agent 停止');}
 async function send(run,message){await checkPage(run);const r=await chrome.tabs.sendMessage(run.tabId,message);if(r?.error)throw Error(r.error);return r;}
 async function observe(run){
  const {resume,adapters}=await chrome.storage.local.get(['resume','adapters']);if(!resume)throw Error('没有简历');
  const snap=await send(run,{type:'RF_SCAN',adapters:adapters||{version:1,adapters:[]},counts:Object.fromEntries(['education','work','projects'].map(k=>[k,resume[k]?.length||0]))});
  if(snap.url!==run.url||pageKey(snap.url)!==run.pageKey)throw Error('页面范围变化');run.snapshot=snap;
  const values=ResumeMatcher.flatten(resume);const bindings=[];for(const f of snap.fields){const b=run.approved.get(f.stableId);if(b&&b.signature===signature(f)&&values[b.path]===run.values[b.path])bindings.push({id:f.id,path:b.path});}
  return {pageKey:run.pageKey,fields:snap.fields.map(f=>({id:f.id,stableId:f.stableId,label:f.label,section:f.section,recordIndex:f.recordIndex,type:f.type,required:f.required,ambiguousLabel:f.ambiguousLabel})),candidatePaths:Object.keys(values).filter(p=>values[p]),bindings};
 }
 async function execute(run,call){
  if(run.cancelled)throw Error('Agent 已停止');await checkPage(run);if(!['fill_fields','verify_fields','observe_page','match_fields'].includes(call.name))throw Error('Agent 请求了未允许的工具');
  if(call.name==='observe_page')return {observation:await observe(run)};
  if(call.name==='match_fields'){
   const fields=run.snapshot.fields.filter(f=>call.arguments.fieldIds.includes(f.id));if(!fields.length)return {matches:[]};const packet=ResumeAI.build(fields,run.values,{shareValues:false,page:run.snapshot.url});
   const requestId=crypto.randomUUID();run.modelRequestId=requestId;try{const r=await matchAI({type:'RF_AI_MATCH',requestId,packet});return {matches:r.accepted.map(m=>({fieldId:m.fieldId,path:m.path,confidence:m.confidence,reason:m.reason}))};}finally{run.modelRequestId=null;}
  }
  const {resume,optionMappings={}}=await chrome.storage.local.get(['resume','optionMappings']),current=ResumeMatcher.flatten(resume),items=[];
  if(!Array.isArray(call.arguments.items)||call.arguments.items.length>200)throw Error('工具参数无效');
  for(const item of call.arguments.items){const f=run.snapshot.fields.find(f=>f.id===item.id),allowed=f&&run.approved.get(f.stableId);if(!allowed||allowed.path!==item.path||allowed.signature!==signature(f)||!Object.hasOwn(run.values,item.path)||current[item.path]!==run.values[item.path])throw Error('工具超出授权或简历资料已变化');
   const ruleKey='matching-v2::'+run.snapshot.origin+run.snapshot.page+'::'+(new URL(run.snapshot.url).searchParams.get('formId')||'')+'::'+run.snapshot.fingerprint+'::'+(run.snapshot.adapter||'generic');
   const mappingKey=ruleKey+'::'+JSON.stringify([f.label,f.section,f.recordIndex,f.type,f.path])+'::'+item.path+'::'+run.values[item.path];
   items.push({id:item.id,value:optionMappings[mappingKey]||run.values[item.path]});
  }
  const result=await send(run,{type:call.name==='fill_fields'?'RF_FILL':'RF_VERIFY',items,overwrite:false,saveCards:false});const results=Array.isArray(result)?result:result.results;
  return {results:results.map(r=>({id:r.id,status:r.status,error:r.status==='verified'?'':'未通过本地控件检查'}))};
 }
 async function loop(run){run.running=true;await publish(run);try{
  while(run.state?.status==='running'&&!run.cancelled){const call=run.state.pending;if(!call)throw Error('Agent 未提供下一步工具');let result;try{result=await execute(run,call);}catch{if(!run.cancelled)run.state=await rpc(run,'error',{sessionId:run.state.id,callId:call.id});break;}if(run.cancelled)break;run.state=await rpc(run,'result',{sessionId:run.state.id,callId:call.id,result});await publish(run);}
 }catch(e){run.error=e.message;}finally{run.running=false;await publish(run);}}
 async function start(message){if([...runs.values()].some(r=>r.running))throw Error('已有 Agent 任务运行中');const config=await connection();const {resume}=await chrome.storage.local.get('resume');if(!resume)throw Error('请先保存简历');const values=ResumeMatcher.flatten(resume);if(!Array.isArray(message.bindings)||message.bindings.length>200)throw Error('授权字段无效');
  const run={id:crypto.randomUUID(),tabId:message.tabId,url:message.url,pageKey:pageKey(message.url),connection:config,values,approved:new Map(message.bindings.map(b=>{if(!b||typeof b.stableId!=='string'||typeof b.signature!=='string'||!values[b.path])throw Error('授权路径无效');return [b.stableId,{path:b.path,signature:b.signature}];})),cancelled:false,running:true,state:null};
  const observation=await observe(run);if(observation.bindings.length!==message.bindings.length)throw Error('字段或资料已变化，请重新扫描核对');
  if(message.resumeRunId){const prior=runs.get(message.resumeRunId);if(!prior||prior.running||prior.state?.status!=='needs_input'||prior.url!==run.url||prior.pageKey!==run.pageKey||prior.tabId!==run.tabId)throw Error('没有可继续的任务');run.id=prior.id;run.state=await rpc(run,'resume',{sessionId:prior.state.id,observation});}else run.state=await rpc(run,'start',{observation});
  runs.set(run.id,run);while(runs.size>20){const [id,r]=runs.entries().next().value;if(r.running)break;runs.delete(id);}await publish(run);void loop(run);return {runId:run.id,state:run.state};
 }
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(!['RF_AGENT_START','RF_AGENT_STATUS','RF_AGENT_STOP'].includes(message.type))return;
  if(!sender.url?.startsWith(chrome.runtime.getURL(''))){respond({error:'仅扩展界面可以控制 Agent'});return;}
  (async()=>{if(message.type==='RF_AGENT_START'){if(starting)throw Error('Agent 正在启动');starting=true;try{return await start(message);}finally{starting=false;}}
   if(message.type==='RF_AGENT_STATUS'){const {agentRun}=await chrome.storage.session.get('agentRun');if(agentRun?.running&&!runs.get(agentRun.runId)?.running)return {agentRun:{...agentRun,running:false,state:{...agentRun.state,status:'interrupted',pending:null},error:'后台任务已中断，请重新扫描后启动；未自动重放工具'}};return {agentRun};}
   const run=runs.get(message.runId);if(!run)throw Error('任务不存在或后台已重启');run.cancelled=true;run.controller?.abort();if(run.modelRequestId)requests.get(run.modelRequestId)?.abort();try{await chrome.tabs.sendMessage(run.tabId,{type:'RF_CANCEL'});}catch{}if(run.state)run.state=await rpc(run,'cancel',{sessionId:run.state.id});run.running=false;await publish(run);return {stopped:true};
  })().then(respond,e=>respond({error:e.message}));return true;
 });
})();
