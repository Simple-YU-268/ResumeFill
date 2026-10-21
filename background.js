importScripts('profile.js','matcher.js','option-match.js','answers.js','ai.js');
const requests=new Map();
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
async function matchAI(message){
  const {aiSettings,resume}=await chrome.storage.local.get(['aiSettings','resume']);
  const config=ResumeAI.settings(aiSettings);if(!config.enabled)throw Error('请先在设置中启用 AI 并配置服务');
  if(!await chrome.permissions.contains({origins:[config.originPattern]}))throw Error('尚未授权访问此 AI 服务，请重新保存 AI 设置');
  const values=ResumeMatcher.flatten(resume||{});
  const optionMode=message.type==='RF_AI_OPTION';
  const packet=optionMode?ResumeOptionMatch.validate(message.packet,values):message.type==='RF_AI_TEST'?{version:1,shareValues:false,fields:[{id:'test-email-'+crypto.randomUUID(),label:'联系电子信箱',section:'basics',recordIndex:null,type:'input',options:[]}],candidates:[{path:'basics.email'}]}:ResumeAI.validatePacket(message.packet,values);
  const {desktopConnection}=await chrome.storage.local.get('desktopConnection');if(desktopConnection?.autoPair&&new URL(config.endpoint).origin===desktopConnection.origin)await ResumeDesktop.link();
  const savedKey=await chrome.storage.session.get('aiApiKey');const aiApiKey=ResumeAI.normalizeKey(savedKey.aiApiKey);if(new URL(config.endpoint).hostname==='openrouter.ai'&&!aiApiKey)throw Error('尚未保存 OpenRouter 会话密钥，或浏览器重启后密钥已清除；请在设置中重新保存');
  const controller=new AbortController(),requestId=message.requestId;
  if(typeof requestId!=='string'||requestId.length>100)throw Error('请求 ID 无效');
  requests.get(requestId)?.abort();requests.set(requestId,controller);
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
    const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',...aiApiKey?{Authorization:'Bearer '+aiApiKey}:{}},body:JSON.stringify(optionMode?{...ResumeAI.requestOptions(config),model:config.model,messages:[{role:'system',content:ResumeOptionMatch.system},{role:'user',content:JSON.stringify(packet)}],stream:false,...config.jsonMode?{response_format:{type:'json_object'}}:{}}:ResumeAI.requestBody(config,packet)),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
    if(!response.ok){let status=response.status;if(status===502&&['127.0.0.1','localhost'].includes(new URL(config.endpoint).hostname)){const data=await response.json().catch(()=>({}));const upstream=Number(data.code==='RF_UPSTREAM_HTTP'&&String(data.error||'').match(/HTTP (\d{3})/)?.[1]);if([401,402,403,404,429,500,502,503,504].includes(upstream))status=upstream;}throw Error('AI 服务返回 '+ResumeAI.httpError(status,config.endpoint));}
    const length=Number(response.headers.get('content-length')||0);if(length>300000)throw Error('AI 响应超过大小限制');
    const reader=response.body.getReader(),decoder=new TextDecoder();let raw='',bytes=0;
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>300000){controller.abort();throw Error('AI 响应超过大小限制');}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();let result;try{result=JSON.parse(raw);}catch{throw Error('AI 服务没有返回兼容接口 JSON');}
    const content=result.choices?.[0]?.message?.content;if(typeof content!=='string')throw Error('AI 服务未返回 choices[0].message.content');
    return optionMode?{suggestion:ResumeOptionMatch.parse(content,packet),requestId,model:config.model,gateway:result.gateway}:{...ResumeAI.parseResponse(content,packet),requestId,model:config.model,gateway:result.gateway};
  }catch(e){if(e.name==='AbortError')throw Error('AI 请求已取消或超过 25 秒');throw e;}finally{clearTimeout(timer);if(requests.get(requestId)===controller)requests.delete(requestId);}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(['RF_ASSIST_DATA','RF_ASSIST_SAVE'].includes(message.type)){
    if(sender.id!==chrome.runtime.id||!sender.tab||sender.frameId!==0||!/^https?:/.test(sender.url||'')){respond({error:'仅允许已启用的网页助手使用'});return;}
    (async()=>{const {resume}=await chrome.storage.local.get('resume');if(!resume)throw Error('请先保存简历');
      if(message.type==='RF_ASSIST_DATA')return {resume};
      const f=message.field;if(!f||typeof f.label!=='string'||f.label.length>500||typeof message.value!=='string')throw Error('资料格式无效');
      const u=new URL(sender.url),page={origin:u.origin,page:u.pathname,url:u.href};
      const known=ResumeAnswers.match(f,resume,page)||ResumeMatcher.match(f,ResumeMatcher.flatten(resume))||ResumeMatcher.infer(f);
      const path=known?.path||null;
      const updated=await ResumeProfile.enrich(ResumeAnswers.save(resume,[{field:f,value:message.value,path}],page));await chrome.storage.local.set({resume:updated.resume});return {resume:updated.resume,normalizationIssues:updated.issues};
    })().then(respond,e=>respond({error:e.message}));return true;
  }
  if(!['RF_AI_MATCH','RF_AI_TEST','RF_AI_OPTION','RF_AI_CANCEL'].includes(message.type))return;
  if(!sender.url?.startsWith(chrome.runtime.getURL(''))){respond({error:'AI 仅接受扩展界面请求'});return;}
  if(message.type==='RF_AI_CANCEL'){requests.get(message.requestId)?.abort();respond({cancelled:true});return;}
  matchAI(message).then(respond,e=>respond({error:e.message}));return true;
});

importScripts('agent-bridge.js');
importScripts('desktop-bridge.js');

importScripts('web-ocr-match.js','web-ocr-bridge.js');
