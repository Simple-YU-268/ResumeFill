const assert=require('node:assert/strict'),R=require('./agent-recovery'),{AgentEngine}=require('./local-server/agent.cjs');
function field(id='1:f0',stableId='node-a'){const f={id,stableId,label:'姓名',section:'basics',recordIndex:null,type:'input',context:'基本信息',rootId:'root-1',candidatePaths:['basics.name']};f.recoveryKey=R.identity(f);return f;}
const base={pageKey:'http://fixture.test/form',documentKey:'synthetic-document',fields:[field()],candidatePaths:['basics.name'],bindings:[{id:'1:f0',path:'basics.name'}]};
function exercise({model=false,redraw=false,ambiguous=false,alwaysFail=false,modelFailure=false,disabled=false}={}){
 const engine=new AgentEngine({modelEnabled:model});let state=engine.create({observation:base,recoveryEnabled:!disabled}),fills=0,waits=0,plans=0,ok=false,current=base.fields;
 for(let step=0;state.pending&&step<50;step++){
  const call=state.pending;let result;
  if(call.name==='verify_fields')result={results:call.arguments.items.map(i=>({id:i.id,status:ok?'verified':'mismatch',diagnostic:{displayEmpty:!ok}}))};
  if(call.name==='fill_fields'){fills++;assert.equal(call.arguments.overwrite,false);assert.equal(call.arguments.saveCards,false);if(fills===1&&redraw)current=[field('2:f0','node-b')];if(fills>1&&!alwaysFail)ok=true;result={results:call.arguments.items.map(i=>({id:i.id,status:ok?'verified':'failed',failureCode:redraw?'CONTROL_STALE':'OPTIONS_PENDING'}))};}
  if(call.name==='observe_page'){if(ambiguous&&call.arguments.recovery)current=[field('2:f0','node-b'),field('2:f1','node-c')];result={observation:{...base,fields:current,bindings:[]}};}
  if(call.name==='wait_page'){waits++;assert.ok(call.arguments.delayMs<=1500);result={waited:true};}
  if(call.name==='plan_recovery'){plans++;assert.equal(call.arguments.packet.shareValues,false);assert.ok(!JSON.stringify(call.arguments.packet).includes('basics.name'));if(modelFailure){state=engine.toolError(state.id,{callId:call.id,errorCode:'RF_AGENT_HTTP_401',message:'PRIVATE-MARKER'});continue;}result={strategy:'wait_rescan',fieldIds:call.arguments.packet.fields.map(f=>f.id),confidence:.99};if(!call.arguments.packet.strategies.includes('wait_rescan'))result.strategy='rescan';}
  assert.ok(result,'unexpected tool '+call.name);state=engine.result(state.id,{callId:call.id,result});
 }
 return {state,fills,waits,plans};
}
let r=exercise();assert.equal(r.state.status,'completed');assert.equal(r.fills,2);assert.equal(r.waits,1);assert.equal(r.state.recovery.used,1);
r=exercise({redraw:true});assert.equal(r.state.status,'completed');assert.equal(r.state.fields[0].stableId,'node-b');assert.ok(r.state.events.some(e=>e.event==='controls_rebound'));
r=exercise({model:true});assert.equal(r.state.status,'completed');assert.equal(r.plans,1);assert.equal(r.state.recovery.source,'model');
r=exercise({model:true,modelFailure:true});assert.equal(r.state.status,'completed');assert.equal(r.state.recovery.source,'local-fallback');assert.ok(!JSON.stringify(r.state).includes('PRIVATE-MARKER'));
r=exercise({alwaysFail:true});assert.equal(r.state.status,'needs_input');assert.equal(r.state.recovery.used,2);assert.equal(r.fills,3);assert.ok(r.state.steps<=24);
r=exercise({disabled:true});assert.equal(r.state.status,'needs_input');assert.equal(r.fills,1);
r=exercise({redraw:true,ambiguous:true});assert.equal(r.state.status,'needs_input');assert.equal(r.fills,1);
const packet={version:1,kind:'recovery',shareValues:false,fields:[{id:'f0',type:'combobox',code:'OPTIONS_PENDING',attempts:0}],strategies:['wait_rescan','manual'],budget:{remaining:3,maxDelayMs:1500}};
assert.throws(()=>R.parse({strategy:'execute_js',fieldIds:['f0'],confidence:1},packet));assert.throws(()=>R.parse({strategy:'wait_rescan',fieldIds:['outside'],confidence:1},packet));assert.throws(()=>R.parse({strategy:'wait_rescan',fieldIds:['f0'],confidence:.8},packet));assert.throws(()=>R.validatePacket({...packet,value:'PRIVATE'}));assert.throws(()=>R.validatePacket({...packet,fields:[{...packet.fields[0],label:'PRIVATE'}]}));
assert.equal(R.classify({status:'preserved'}),'USER_CONTENT');assert.equal(R.classify({status:'mismatch',diagnostic:{displayEmpty:false}}),'USER_CONTENT');assert.equal(R.classify({error:'选项不唯一'}),'AMBIGUOUS');
// A failed approved field must not suppress proposals for an independent unresolved field.
const engine=new AgentEngine({modelEnabled:true}),extra={...field('1:f1','node-extra'),label:'联系邮箱',candidatePaths:['basics.email']};extra.recoveryKey=R.identity(extra);let s=engine.create({observation:{...base,fields:[...base.fields,extra],candidatePaths:['basics.name','basics.email']}});
for(let step=0;s.pending&&step<20;step++){const c=s.pending;let result;if(c.name==='verify_fields')result={results:c.arguments.items.map(i=>({id:i.id,status:'invalid',failureCode:'VALIDATION'}))};if(c.name==='fill_fields')result={results:c.arguments.items.map(i=>({id:i.id,status:'invalid',failureCode:'VALIDATION'}))};if(c.name==='observe_page')result={observation:{...base,fields:[...base.fields,extra],candidatePaths:['basics.name','basics.email'],bindings:[]}};if(c.name==='match_fields')result={matches:[{fieldId:'1:f1',path:'basics.email',confidence:.99}]};s=engine.result(s.id,{callId:c.id,result});}
assert.equal(s.status,'needs_input');assert.equal(s.proposals[0].path,'basics.email');assert.equal(s.counts.approved,1);
const moved=new AgentEngine();let d=moved.create({observation:base});d=moved.result(d.id,{callId:d.pending.id,result:{results:[{id:'1:f0',status:'verified'}]}});d=moved.result(d.id,{callId:d.pending.id,result:{observation:{...base,documentKey:'other-document'}}});assert.equal(d.status,'cancelled');
console.log('PASS: bounded local/model recovery, wait/rescan/rebind/verify, conflict refusal, fixed scope, independent AI proposals, privacy, fallback and retry limits');

const dependencies=[{id:'city',section:'basics',rootId:'r',regionRole:'hukou',regionLevel:'city'},{id:'other',section:'work',recordIndex:1,rootId:'r'},{id:'province',section:'basics',rootId:'r',regionRole:'hukou',regionLevel:'province'}];assert.deepEqual(R.order(dependencies.map(f=>({id:f.id})),dependencies).map(i=>i.id),['other','province','city']);assert.throws(()=>R.order([{id:'city'},{id:'city'}],dependencies));
(async()=>{
 const token='synthetic-recovery-http-token'.padEnd(64,'x'),gateway=require('./local-server/server.cjs').createGateway({port:0,token,upstream:{enabled:false}}),address=await gateway.listen(),baseURL='http://127.0.0.1:'+address.port;
 const call=async(route,body,origin=true)=>{const response=await fetch(baseURL+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...origin?{Origin:'chrome-extension://'+'a'.repeat(32)}:{}},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 try{
  const legacy=await call('/v1/agent/start',{observation:base});assert.equal(legacy.status,200);assert.equal(legacy.body.agent.recovery.enabled,false);
  const second=field('1:f1','node-extra');second.label='邮箱';second.candidatePaths=['basics.email'];second.recoveryKey=R.identity(second);const observation={...base,fields:[...base.fields,second],candidatePaths:['basics.name','basics.email'],bindings:[...base.bindings,{id:'1:f1',path:'basics.email'}]};
  const modern=await call('/v1/agent/start',{agentProtocol:2,recoveryEnabled:true,observation});assert.equal(modern.status,200);assert.equal(modern.body.agent.recovery.enabled,true);
  const state=modern.body.agent;const bad=await call('/v1/agent/result',{sessionId:state.id,callId:state.pending.id,result:{results:[{id:'1:f0',status:'verified'},{id:'wrong',status:'verified'}]}});assert.equal(bad.status,400);const unchanged=await call('/v1/agent/status',{sessionId:state.id});assert.equal(unchanged.body.agent.counts.verified,0);assert.equal(unchanged.body.agent.pending.id,state.pending.id);
  const local=await call('/v1/plan-recovery',packet);assert.equal(local.status,200);assert.equal(local.body.strategy,'wait_rescan');assert.equal(local.body.gateway.engine,'local-rules');
  const invalid=await call('/v1/plan-recovery',{...packet,resumeValue:'PRIVATE-MARKER'});assert.equal(invalid.status,400);assert.ok(!JSON.stringify(invalid).includes('PRIVATE-MARKER'));
  assert.equal((await call('/v1/agent/start',{agentProtocol:3,observation:base})).status,400);assert.equal((await call('/v1/agent/start',{agentProtocol:2,recoveryEnabled:'yes',observation:base})).status,400);assert.equal((await call('/v1/agent/start',{observation:base},false)).status,403);
  console.log('PASS: recovery HTTP contract, legacy protocol compatibility, atomic rejected receipts, local planning, malformed data refusal and extension-origin requirement');
 }finally{await gateway.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

for(const path of ['custom.delivery','fieldAnswers.0.value']){const f={...field(),supplementalPath:path};const o={...base,fields:[f],candidatePaths:[...base.candidatePaths,path],bindings:[{id:f.id,path}]};assert.equal(new AgentEngine().create({observation:o}).counts.approved,1);assert.equal(R.supplementalAllowed(f,'custom.other'),false);assert.equal(R.supplementalAllowed({...f,contextBlocked:true},path),false);assert.equal(R.supplementalAllowed({...f,workBindingRequired:true},path),false);assert.equal(R.supplementalAllowed({...f,section:'family'},path),false);if(path.startsWith('custom.'))assert.equal(R.supplementalAllowed({...f,section:'work',recordIndex:0},path),false);assert.throws(()=>new AgentEngine().create({observation:{...o,fields:[{...f,supplementalPath:null}]}}));}
console.log('PASS: explicitly approved custom/scoped learned paths preserved, exact path and record/family/context guards retained');
