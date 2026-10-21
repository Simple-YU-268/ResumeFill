const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{Controller}=require('./controller.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rf-auto-pair-')),runtime=path.join(__dirname,'resources');let controller=new Controller(directory,runtime);controller.config.port=0;controller.write(controller.configFile,controller._seal(controller.config));await controller.start();
 const origin='chrome-extension://'+'a'.repeat(32),other='chrome-extension://'+'b'.repeat(32),client={clientId:'synthetic-client-123',browser:'Edge',version:'0.20.0'};
 const call=async(route,{body,token,from=origin}={})=>{const r=await fetch('http://127.0.0.1:'+controller.gateway.server.address().port+route,{method:body?'POST':'GET',headers:{...(from?{Origin:from}:{}),...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await call('/v1/discovery',{from:null})).status,403);assert.equal((await call('/v1/discovery',{from:'https://untrusted.example'})).status,403);const discovery=await call('/v1/discovery');assert.equal(discovery.status,200);assert.deepEqual(Object.keys(discovery.data).sort(),['autoPair','identity','version']);
  const pending=await call('/v1/pair/auto',{body:client});assert.equal(pending.status,202);assert.equal(pending.data.token,undefined);await call('/v1/pair/auto',{body:client});assert.equal(controller.status().pairing.pending.length,1);assert.equal((await call('/v1/desktop/pull',{body:{}})).status,401);
  controller.pairing().approve(pending.data.requestId);const paired=await call('/v1/pair/auto',{body:client});assert.equal(paired.status,200);const token=paired.data.token;assert.notEqual(token,controller.config.token);assert.ok(!fs.readFileSync(controller.configFile,'utf8').includes(token));
  assert.equal((await call('/v1/desktop/pull',{body:{},token})).status,200);assert.equal((await call('/v1/desktop/pull',{body:{},token,from:other})).status,401);assert.equal((await call('/v1/desktop/pull',{body:{},token,from:null})).status,403);
  assert.equal((await call('/health',{body:{},token})).status,200);assert.equal((await call('/health',{body:{},token,from:other})).status,401);
  await controller.stop();controller=new Controller(directory,runtime);await controller.start();assert.equal((await call('/v1/pair/auto',{body:client})).data.token,token,'approved client reconnects after restart');
  controller.pairing().revoke(pending.data.requestId);assert.equal((await call('/v1/desktop/pull',{body:{},token})).status,401);const retry=await call('/v1/pair/auto',{body:client});assert.equal(retry.status,202);controller.pairing().reject(retry.data.requestId);assert.equal((await call('/v1/pair/auto',{body:client})).status,403);
  for(let i=0;i<3;i++)assert.equal((await call('/v1/pair/auto',{body:{...client,clientId:'another-client-'+i},from:other})).status,202);assert.equal((await call('/v1/pair/auto',{body:{...client,clientId:'another-client-4'},from:other})).status,429);
  for(const p of controller.pairing().pending.values())p.expiresAt=Date.now()-1;assert.equal(controller.status().pairing.pending.length,0);
  console.log('PASS: extension-only discovery, explicit desktop approval, no token before consent, origin-bound session keys, persistent reconnect, revocation, denial, expiry and bounded pairing requests');
 }finally{await controller.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
