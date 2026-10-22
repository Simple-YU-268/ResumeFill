const assert=require('node:assert/strict');
const AI=require('./ai.js');
const values={'basics.email':'private@example.com','education.0.school':'Private university','education.1.school':'Other'};
const fields=[{id:'f1',label:'电子信箱',section:'basics'},{id:'f2',label:'院校',section:'education',recordIndex:1},{id:'otp',label:'验证码'}];
const packet=AI.build(fields,values);
assert.equal(packet.fields.length,2);
assert.ok(!JSON.stringify(packet).includes('private@example.com'));
AI.validatePacket(packet,values);
const response=matches=>JSON.stringify({matches});
assert.equal(AI.parseResponse(response([{fieldId:'f1',path:'basics.email',confidence:.99}]),packet).accepted.length,1);
assert.throws(()=>AI.parseResponse(response([{fieldId:'f2',path:'education.0.school',confidence:.99}]),packet));assert.ok(!packet.candidates.some(c=>c.path==='education.0.school'));
assert.equal(AI.parseResponse(response([{fieldId:'f1',path:'basics.email',confidence:.8}]),packet).rejected.length,1);
for(const matches of [[{fieldId:'unknown',path:'basics.email',confidence:1}],[{fieldId:'f1',path:'invented',confidence:1}],[{fieldId:'f1',path:'basics.email',confidence:1},{fieldId:'f1',path:'basics.email',confidence:1}]])assert.throws(()=>AI.parseResponse(response(matches),packet));
const shared=AI.build(fields,values,{shareValues:true});AI.validatePacket(shared,values);shared.candidates[0].value='forged';assert.throws(()=>AI.validatePacket(shared,values));
assert.throws(()=>AI.settings({enabled:true,endpoint:'http://remote.example/v1',model:'test'}));
assert.throws(()=>AI.settings({enabled:true,endpoint:'https://example.com/v1?key=secret',model:'test'}));
const config=AI.settings({enabled:true,endpoint:'http://127.0.0.1:1234/v1/chat/completions',model:'mock',jsonMode:true});
assert.equal(AI.requestBody(config,packet).response_format.type,'json_object');
console.log('PASS: AI privacy default, protected fields, existing paths, duplicate rejection, record isolation, confidence threshold, settings');

assert.deepEqual(AI.requestOptions({endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'}),{thinking:{type:'disabled'}});assert.deepEqual(AI.requestOptions({endpoint:'https://api.moonshot.cn/v1/chat/completions',model:'kimi-k2.6'}),{thinking:{type:'disabled'}});assert.deepEqual(AI.requestOptions({endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4.1-mini'}),{});

for(const [endpoint,expected]of [['https://api.openai.com','https://api.openai.com/v1/chat/completions'],['https://api.moonshot.cn/v1/','https://api.moonshot.cn/v1/chat/completions'],['https://api.deepseek.com','https://api.deepseek.com/chat/completions'],['https://proxy.example/v1','https://proxy.example/v1/chat/completions']])assert.equal(AI.settings({enabled:true,endpoint,model:'test'}).endpoint,expected);assert.throws(()=>AI.settings({enabled:true,endpoint:'https://api.openai.com/v1/responses',model:'test'}),/Chat Completions/);

assert.equal(AI.settings({enabled:true,endpoint:'https://openrouter.ai/api/v1',model:'test'}).endpoint,'https://openrouter.ai/api/v1/chat/completions');

const imported={'basics.nationalityGroup':'示例民族','basics.mailAddress':'synthetic@example.test'};
const p=AI.build([{id:'custom',label:'民族',section:'basics'}],imported);assert.equal(p.fields.length,1);AI.validatePacket(p,imported);assert.ok(p.fields[0].candidatePaths.includes('basics.nationalityGroup'));assert.ok(!JSON.stringify(p).includes('示例民族'));
assert.equal(AI.parseResponse({matches:[{fieldId:'custom',path:'basics.nationalityGroup',confidence:.96}]},p).accepted.length,1);
const row={verified:false,touched:false,draft:{value:''},select:{value:'basics.mailAddress'},aiReview:true};assert.equal(AI.reviewable(row,imported),true);for(const change of [{touched:true},{verified:true},{draft:{value:'用户补充'}},{aiReview:false}])assert.equal(AI.reviewable({...row,...change},imported),false);
assert.equal(AI.build([{id:'x',label:'陌生名称',section:'work'}],{'work.0.company':'x','work.1.company':'y'}).fields.length,0);
console.log('PASS: AI missing canonical fallback, semantic response, privacy, weak-guess review and user-edit protection');

const broad=Object.fromEntries(Array.from({length:24},(_,i)=>['basics.custom'+i,'synthetic']));const broadPacket=AI.build([{id:'broad',label:'未收录的基础属性',section:'basics'}],broad);assert.equal(broadPacket.fields[0].candidatePaths.length,24);AI.validatePacket(broadPacket,broad);assert.equal(AI.reviewable({...row,aiLocked:true},imported),false);
