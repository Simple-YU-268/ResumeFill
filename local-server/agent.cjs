const crypto=require('node:crypto');
const AI=require('../ai.js');
const TOOLS=['verify_fields','fill_fields','observe_page','match_fields'];
class AgentEngine{
 constructor({modelEnabled=false,now=Date.now}={}){this.modelEnabled=modelEnabled;this.now=now;this.sessions=new Map();}
 observation(o){
  if(!o||typeof o.pageKey!=='string'||o.pageKey.length>2000||!Array.isArray(o.fields)||o.fields.length>200||!Array.isArray(o.candidatePaths)||o.candidatePaths.length>500||!Array.isArray(o.bindings))throw Error('观察数据无效');
  const u=new URL(o.pageKey);if(!['http:','https:'].includes(u.protocol)||[...u.searchParams.keys()].some(k=>k!=='formId')||u.hash||u.username||u.password)throw Error('页面范围无效');
  const fields=o.fields.map(f=>{if(!f||typeof f.id!=='string'||typeof f.stableId!=='string'||typeof f.label!=='string')throw Error('字段身份无效');return {id:f.id,stableId:f.stableId,label:f.label.slice(0,200),section:f.section||null,recordIndex:Number.isInteger(f.recordIndex)?f.recordIndex:null,type:f.type||'input',required:!!f.required,ambiguousLabel:!!f.ambiguousLabel};});
  if(new Set(fields.map(f=>f.id)).size!==fields.length||new Set(fields.map(f=>f.stableId)).size!==fields.length)throw Error('重复字段身份');
  const paths=[...new Set(o.candidatePaths)];if(paths.some(p=>typeof p!=='string'||p.length>200||p.split('.').some(s=>['__proto__','prototype','constructor'].includes(s))))throw Error('资料路径无效');
  const bound=new Set(),bindings=o.bindings.map(b=>{const f=fields.find(f=>f.id===b.id);if(!f||!paths.includes(b.path)||bound.has(b.id)||/密码|验证码|captcha|password|\botp\b/i.test(f.label))throw Error('未授权或受保护字段');bound.add(b.id);return {id:b.id,path:b.path,stableId:f.stableId,signature:JSON.stringify([f.label,f.section,f.recordIndex,f.type])};});
  return {pageKey:o.pageKey,fields,candidatePaths:paths,bindings};
 }
 get(id){const s=this.sessions.get(id);if(!s||this.now()-s.updatedAt>1800000){this.sessions.delete(id);throw Error('Agent 会话已过期，请重新启动');}return s;}
 log(s,event,detail={}){s.updatedAt=this.now();s.events.push({at:new Date(s.updatedAt).toISOString(),event,...detail});if(s.events.length>100)s.events.shift();}
 issue(s,name,args){if(!TOOLS.includes(name))throw Error('工具不在白名单');if(s.steps>=24){s.status='needs_input';s.reason='已达到 24 步限制';s.pending=null;return;}s.pending={id:crypto.randomUUID(),name,arguments:args};s.steps++;this.log(s,'tool_requested',{tool:name,callId:s.pending.id});}
 create(input){for(const [id,s]of this.sessions)if(this.now()-s.updatedAt>1800000)this.sessions.delete(id);if(this.sessions.size>=20)throw Error('Agent 会话数达到上限');
  const observation=this.observation(input.observation),s={id:crypto.randomUUID(),goal:'填写用户已核对的当前页字段并验证；缺失信息交给用户',status:'running',pageKey:observation.pageKey,observation,approved:observation.bindings,steps:0,phase:'initial_verify',results:{},events:[],proposals:[],pending:null,lastReply:null,matched:false,reason:'',createdAt:this.now(),updatedAt:this.now()};this.sessions.set(s.id,s);this.log(s,'started',{approvedFields:s.approved.length});this.next(s);return this.view(s);}
 view(s){return {id:s.id,goal:s.goal,status:s.status,reason:s.reason,steps:s.steps,pending:s.pending,proposals:s.proposals.map(p=>({...p,stableId:s.observation.fields.find(f=>f.id===p.fieldId)?.stableId})),fields:Object.entries(s.results).map(([stableId,r])=>({stableId,status:r.status,error:r.error})),counts:{approved:s.approved.length,verified:s.approved.filter(b=>s.results[b.stableId]?.status==='verified').length,unbound:s.observation.fields.filter(f=>!s.approved.some(b=>b.stableId===f.stableId)).length},events:s.events,submissionVerified:false,allowedTools:TOOLS};}
 activeItems(s){return s.approved.flatMap(b=>{const f=s.observation.fields.find(f=>f.stableId===b.stableId);return f&&JSON.stringify([f.label,f.section,f.recordIndex,f.type])===b.signature?[{id:f.id,path:b.path}]:[];});}
 review(s,reason){s.status='needs_input';s.reason=reason;s.pending=null;this.log(s,'needs_input',{reason});}
 next(s){if(s.status!=='running')return;
  const items=this.activeItems(s);
  if(items.length!==s.approved.length){this.review(s,'字段已移除或含义变化，请重新核对页面');return;}
  if(s.phase==='initial_verify'){if(items.length){this.issue(s,'verify_fields',{items});return;}s.phase='observe';}
  if(s.phase==='fill'){const pending=items.filter(i=>{const b=s.approved.find(b=>b.path===i.path&&b.id===i.id)||s.approved.find(b=>b.stableId===s.observation.fields.find(f=>f.id===i.id)?.stableId);return s.results[b?.stableId]?.status!=='verified';});if(pending.length){this.issue(s,'fill_fields',{items:pending,overwrite:false,saveCards:false});return;}s.phase='observe';}
  if(s.phase==='post_verify'){this.issue(s,'verify_fields',{items});return;}
  if(s.phase==='observe'){this.issue(s,'observe_page',{});return;}
  if(s.phase==='final_verify'){if(items.length){this.issue(s,'verify_fields',{items});return;}s.phase='finish';}
  if(s.phase==='finish'){
   if(s.approved.some(b=>s.results[b.stableId]?.status!=='verified')){this.review(s,'部分字段未通过回读，已有内容不会被覆盖，请人工处理后继续');return;}
   const unbound=s.observation.fields.filter(f=>!s.approved.some(b=>b.stableId===f.stableId));
   if(unbound.length&&this.modelEnabled&&!s.matched){s.matched=true;const fieldIds=unbound.filter(f=>!f.ambiguousLabel).map(f=>f.id);if(fieldIds.length){this.issue(s,'match_fields',{fieldIds});return;}}
   if(unbound.length){this.review(s,'仍有新增、缺少资料或未核对的字段，请补充并选择对应路径后继续');return;}
   s.status='completed';s.reason='当前授权字段已独立回读一致；未提交申请';this.log(s,'completed');
  }
 }
 result(id,input){const s=this.get(id),digest=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');if(s.lastReply?.callId===input.callId){if(s.lastReply.digest!==digest)throw Error('同一工具结果内容冲突');return this.view(s);}
  if(s.status!=='running'||!s.pending||s.pending.id!==input.callId)throw Error('工具结果已失效或不属于当前调用');
  const call=s.pending;
  if(call.name==='observe_page'){
   const obs=this.observation(input.result?.observation);if(obs.pageKey!==s.pageKey){s.status='cancelled';s.reason='页面范围已变化，任务终止';s.pending=null;this.log(s,'scope_changed');return this.view(s);}s.observation={...obs,bindings:[]};s.phase='final_verify';
  }else if(call.name==='match_fields'){
   const fields=s.observation.fields.filter(f=>call.arguments.fieldIds.includes(f.id));const packet={fields,candidates:s.observation.candidatePaths.map(path=>({path}))};const parsed=AI.parseResponse({matches:input.result?.matches||[]},packet);s.proposals=parsed.accepted;s.phase='finish';
  }else{
   const results=input.result?.results;if(!Array.isArray(results)||results.length!==call.arguments.items.length||new Set(results.map(r=>r.id)).size!==results.length)throw Error('工具回执数量无效');
   for(const item of call.arguments.items){const r=results.find(r=>r.id===item.id),f=s.observation.fields.find(f=>f.id===item.id);if(!r||!['verified','filled','failed','stale','mismatch','preserved','invalid','unconfirmed'].includes(r.status))throw Error('工具回执无效');s.results[f.stableId]={status:r.status,error:typeof r.error==='string'?r.error.slice(0,240):''};}
   if(call.name==='fill_fields')s.phase='post_verify';else if(s.phase==='initial_verify')s.phase='fill';else if(s.phase==='post_verify')s.phase='observe';else s.phase='finish';
  }
  s.lastReply={callId:input.callId,digest};s.pending=null;this.log(s,'tool_result',{tool:call.name,callId:call.id});this.next(s);return this.view(s);
 }
 toolError(id,input){const s=this.get(id);if(!s.pending||s.pending.id!==input.callId)throw Error('工具回执已失效');this.log(s,'tool_error',{tool:s.pending.name});this.review(s,'工具执行中断，请检查页面或服务连接后继续');return this.view(s);}
 resume(id,input){const s=this.get(id);if(!['needs_input'].includes(s.status))throw Error('当前任务不能继续');const obs=this.observation(input.observation);if(obs.pageKey!==s.pageKey)throw Error('不能在其它页面继续');if(s.steps>=24)throw Error('步数已耗尽，请重新启动任务');s.observation=obs;s.approved=obs.bindings;s.results={};s.phase='initial_verify';s.status='running';s.reason='';s.proposals=[];s.matched=false;this.log(s,'resumed',{approvedFields:s.approved.length});this.next(s);return this.view(s);}
 cancel(id){const s=this.get(id);s.status='cancelled';s.pending=null;s.reason='用户已停止';this.log(s,'cancelled');return this.view(s);}
}
module.exports={AgentEngine};
