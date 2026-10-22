const assert=require('node:assert/strict'),http=require('node:http');
const {createGateway}=require('./server.cjs'),Options=require('../option-match.js');
const token='test-local-token-'.padEnd(64,'x'),origin='chrome-extension://'+'a'.repeat(32);
const packet={version:1,shareValues:false,fields:[{id:'f1',label:'电子邮箱',section:'basics',recordIndex:null,type:'input'}],candidates:[{path:'basics.email'}]};
const option={kind:'options',version:1,fieldId:'f2',label:'学历',path:'education.0.degree',value:'大学本科',candidates:[{id:'a',text:'本科'},{id:'b',text:'硕士'}]};
(async()=>{
 const local=createGateway({port:0,token,allowedExtensionIds:['a'.repeat(32)]});const address=await local.listen();let base='http://127.0.0.1:'+address.port;
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:origin};
 const post=(url,data,extra={})=>fetch(url,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 try{
  assert.equal((await fetch(base+'/health')).status,401);
  assert.equal((await fetch(base+'/health',{headers:{...headers,Origin:'https://evil.test'}})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{const req=http.request(base+'/health',{headers:{...headers,Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(wrongHost,403);
  assert.equal((await fetch(base+'/health',{headers:{...headers,Origin:'chrome-extension://'+'b'.repeat(32)}})).status,403);
  const health=await (await fetch(base+'/health',{headers})).json();assert.equal(health.engine,'local-rules');assert.ok(!JSON.stringify(health).includes(token));
  const first=await (await post(base+'/v1/match-fields',packet)).json();assert.equal(first.matches[0].path,'basics.email');assert.equal(first.gateway.cacheHit,false);
  assert.equal((await (await post(base+'/v1/match-fields',packet)).json()).gateway.cacheHit,true);
  assert.equal((await (await post(base+'/v1/match-options',option)).json()).candidateId,'a');
  const ambiguous={...option,value:'本科',candidates:[{id:'a',text:'本科'},{id:'b',text:'本科'}]};assert.equal((await (await post(base+'/v1/match-options',ambiguous)).json()).candidateId,null);
  assert.throws(()=>Options.parse({candidateId:'invented',confidence:1},option));assert.throws(()=>Options.parse({candidateId:'a',confidence:1},ambiguous));
  const compatible=await (await post(base+'/v1/chat/completions',{model:'ignored',messages:[{role:'system',content:'untrusted client prompt'},{role:'user',content:JSON.stringify(packet)}]})).json();assert.equal(JSON.parse(compatible.choices[0].message.content).matches[0].path,'basics.email');
  assert.equal((await post(base+'/v1/match-fields',{bad:true})).status,400);
  assert.equal((await (await post(base+'/v1/match-fields',{bad:true})).json()).code,'RF_PACKET_INVALID','errors carry structured codes');
  assert.equal((await post(base+'/v1/match-fields',{data:'x'.repeat(210000)})).status,413);
 }finally{await local.close();}
 let calls=0,seen=[],hangClosed=false;
 const upstream=http.createServer((req,res)=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{const body=JSON.parse(raw);seen.push({authorization:req.headers.authorization,body});calls++;
  if(req.url==='/hang'){res.on('close',()=>hangClosed=true);return;}
  if(calls===1){res.writeHead(503);res.end();return;}
  const p=JSON.parse(body.messages[1].content),content=req.url==='/bad'?{matches:[{fieldId:'f1',path:'invented',confidence:1}]}:p.kind==='options'?{candidateId:'a',confidence:.99,reason:'mock'}:{matches:[{fieldId:'f1',path:'basics.email',confidence:.99}]};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));});});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const endpoint='http://127.0.0.1:'+upstream.address().port;
 const proxy=createGateway({port:0,token,upstream:{enabled:true,endpoint:endpoint+'/chat',model:'mock-upstream-model',apiKey:'secret-upstream-key',jsonMode:true}});
 try{
  base='http://127.0.0.1:'+(await proxy.listen()).port;const answer=await (await post(base+'/v1/match-fields',packet)).json();assert.equal(answer.matches[0].path,'basics.email');assert.equal(answer.gateway.engine,'upstream');assert.equal(calls,2);
  assert.equal(seen[0].authorization,'Bearer secret-upstream-key');assert.equal(seen[0].body.model,'mock-upstream-model');assert.ok(!JSON.stringify(seen).includes(token));
  await post(base+'/v1/match-fields',packet);assert.equal(calls,2,'cached request skips upstream');
  const chosen=await (await post(base+'/v1/match-options',option)).json();assert.equal(chosen.candidateId,'a');
 }finally{await proxy.close();}
 const bad=createGateway({port:0,token,upstream:{enabled:true,endpoint:endpoint+'/bad',model:'mock'}});try{base='http://127.0.0.1:'+(await bad.listen()).port;const response=await post(base+'/v1/match-fields',packet);assert.equal(response.status,200);assert.equal((await response.json()).matches.length,0);}finally{await bad.close();}
 const slow=createGateway({port:0,token,timeoutMs:150,upstream:{enabled:true,endpoint:endpoint+'/hang',model:'mock'}});try{base='http://127.0.0.1:'+(await slow.listen()).port;assert.equal((await post(base+'/v1/match-fields',packet)).status,504);await new Promise(r=>setTimeout(r,50));assert.equal(hangClosed,true);}finally{await slow.close();await new Promise(r=>upstream.close(r));upstream.closeAllConnections();}
 console.log('PASS: loopback gateway authentication/origin/host, local matching, options, cache, compatible endpoint, body limits, upstream isolation/retry, response validation, timeout abort');
let outstanding='p'.repeat(64);
const sensitiveGateway=createGateway({port:0,token,desktopHandler:action=>({ok:true,action}),pairing:{redeem:code=>{if(code!==outstanding)return null;outstanding=null;return token;}}});
try{const sensitiveBase='http://127.0.0.1:'+(await sensitiveGateway.listen()).port;
 const noOrigin=await fetch(sensitiveBase+'/v1/desktop/pull',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}'});assert.equal(noOrigin.status,403,'desktop endpoints reject requests without an Origin');
 const badOrigin=await fetch(sensitiveBase+'/v1/agent/status',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,Origin:'https://evil.test'},body:'{}'});assert.equal(badOrigin.status,403);
 assert.equal((await post(sensitiveBase+'/v1/desktop/pull',{})).status,200,'extension origin with token still works');
 const pair=code=>fetch(sensitiveBase+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({code})});
 const pairNoOrigin=await fetch(sensitiveBase+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'q'.repeat(64)})});assert.equal(pairNoOrigin.status,403,'pairing requires an extension Origin');
 assert.equal((await pair('r'.repeat(64))).status,401);assert.equal((await pair('p'.repeat(64))).status,200);
 outstanding='s'.repeat(64);assert.equal((await pair('p'.repeat(64))).status,401,'redeemed codes do not work twice');
 assert.equal((await pair('s'.repeat(64))).status,200);
 for(let i=0;i<3;i++)assert.equal((await pair('t'.repeat(64))).status,401);
 assert.equal((await pair('t'.repeat(64))).status,429,'pairing attempts are rate limited');
}finally{await sensitiveGateway.close();}
console.log('PASS: sensitive endpoints require extension origin, one-time pairing redemption, pairing rate limit');
})().catch(e=>{console.error(e);process.exitCode=1});
