const http=require('node:http'),crypto=require('node:crypto');
const AI=require('../ai.js'),Matcher=require('../matcher.js'),Options=require('../option-match.js');
const {AgentEngine}=require('./agent.cjs');
const VERSION='0.2.0';
function createGateway(config,{fetchImpl=fetch}={}){
 if(typeof config.token!=='string'||config.token.length<32)throw Error('本地访问令牌至少 32 字符，请先运行 setup.cjs');
 const port=config.port??17321;if(!Number.isInteger(port)||port<0||port>65535)throw Error('端口无效');
 let upstream=null;if(config.upstream?.enabled){upstream=AI.settings({...config.upstream,enabled:true});}
 const agent=new AgentEngine({modelEnabled:!!upstream});
 const allowed=config.allowedExtensionIds||[];if(!Array.isArray(allowed)||allowed.some(id=>!/^[a-p]{32}$/.test(id)))throw Error('扩展 ID 白名单无效');
 const cache=new Map(),ttl=config.cacheTtlMs??300000,maxCache=config.maxCacheEntries??128,timeout=config.timeoutMs??20000;let active=0;
 if(!Number.isFinite(ttl)||ttl<0||ttl>3600000||!Number.isInteger(maxCache)||maxCache<0||maxCache>512||!Number.isInteger(timeout)||timeout<100||timeout>22000)throw Error('缓存或超时设置无效');
 const originAllowed=o=>!o||/^chrome-extension:\/\/[a-p]{32}$/.test(o)&&(!allowed.length||allowed.includes(o.split('://')[1]));
 const auth=req=>{const provided=String(req.headers.authorization||''),expected='Bearer '+config.token;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);};
 const send=(res,status,data)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 async function body(req,limit=200000){return await new Promise((resolve,reject)=>{let data='',bytes=0;req.setEncoding('utf8');req.on('data',chunk=>{bytes+=Buffer.byteLength(chunk);if(bytes>limit){data='';reject(Object.assign(Error('请求过大'),{status:413}));return;}data+=chunk;});req.on('end',()=>{try{resolve(JSON.parse(data));}catch{reject(Object.assign(Error('请求不是有效 JSON'),{status:400}));}});req.on('error',reject);});}
 function fieldPacket(p){if(!p||p.version!==1||!Array.isArray(p.fields)||!Array.isArray(p.candidates))throw Error('字段请求结构无效');const values=Object.fromEntries(p.candidates.map(c=>[c.path,p.shareValues?c.value:'present']));AI.validatePacket(p,values);if(p.candidates.some(c=>!/^([\w\u4e00-\u9fff-]+\.)*[\w\u4e00-\u9fff-]+$/.test(c.path)||c.path.split('.').some(s=>['__proto__','constructor','prototype'].includes(s))))throw Error('候选路径无效');return p;}
 async function upstreamCall(kind,packet,signal){
  const modelBody=kind==='fields'?AI.requestBody(upstream,packet):{...AI.requestOptions(upstream),model:upstream.model,messages:[{role:'system',content:Options.system},{role:'user',content:JSON.stringify(packet)}],stream:false,...upstream.jsonMode?{response_format:{type:'json_object'}}:{}};
  for(let attempt=0;attempt<2;attempt++){
   const r=await fetchImpl(upstream.endpoint,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'ResumeFillAgent/0.8.0',...(config.upstream.apiKey?{Authorization:'Bearer '+config.upstream.apiKey}:{})},body:JSON.stringify(modelBody),signal,redirect:'error',credentials:'omit'});
   if([429,502,503,504].includes(r.status)&&attempt===0){await r.body?.cancel();await new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};const abort=()=>{done();reject(Error('请求已取消'));};const timer=setTimeout(()=>{done();resolve();},150);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});continue;}
   if(!r.ok){await r.body?.cancel();throw Object.assign(Error('上游模型请求失败，HTTP '+r.status),{status:502});}
   const reader=r.body.getReader();let raw='',size=0;const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>300000){await reader.cancel();throw Error('上游响应过大');}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();let outer;try{outer=JSON.parse(raw);}catch{throw Error('上游响应不是兼容 JSON');}const text=outer.choices?.[0]?.message?.content;if(typeof text!=='string')throw Error('上游缺少 message.content');
   if(kind==='options')return Options.parse(text,packet);const result=AI.parseResponse(text,packet);return {matches:result.accepted.map(m=>({fieldId:m.fieldId,path:m.path,confidence:m.confidence,reason:m.reason}))};
  }
 }
 const server=http.createServer(async(req,res)=>{
  const localPort=server.address()?.port;const host=req.headers.host;if(![`127.0.0.1:${localPort}`,`localhost:${localPort}`].includes(host)){send(res,403,{error:'Host 不允许'});return;}
  const origin=req.headers.origin;if(!originAllowed(origin)){send(res,403,{error:'Origin 不允许'});return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});res.end();return;}
  if(!auth(req)){send(res,401,{error:'本地访问令牌无效'});return;}
  if(req.method==='GET'&&req.url==='/health'){send(res,200,{ok:true,version:VERSION,identity:'ResumeFillAgent',engine:upstream?'upstream':'local-rules',active,cacheEntries:cache.size});return;}
  const agentAction=req.url?.match(/^\/v1\/agent\/(start|result|error|resume|cancel|status)$/)?.[1];
  const desktopAction=config.desktopHandler&&req.url?.match(/^\/v1\/desktop\/(heartbeat|pull|push)$/)?.[1];
  const webOCR=req.url==='/v1/ocr/web'&&typeof config.webOCR==='function';
  if(req.method!=='POST'||!agentAction&&!desktopAction&&!webOCR&&!['/v1/chat/completions','/v1/match-fields','/v1/match-options'].includes(req.url)){send(res,404,{error:'接口不存在'});return;}
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(res,415,{error:'仅接受 application/json'});return;}
  if(active>=4){send(res,429,{error:'本地服务忙，请稍后重试'});return;}active++;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),webOCR?90000:timeout);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   const input=await body(req,webOCR?11200000:200000);
   if(webOCR){send(res,200,await config.webOCR(input,{signal:controller.signal}));return;}
   if(desktopAction){send(res,200,await config.desktopHandler(desktopAction,input));return;}
   if(agentAction){let state;if(agentAction==='start')state=agent.create(input);else if(agentAction==='status')state=agent.view(agent.get(input.sessionId));else if(agentAction==='result')state=agent.result(input.sessionId,input);else if(agentAction==='error')state=agent.toolError(input.sessionId,input);else if(agentAction==='resume')state=agent.resume(input.sessionId,input);else state=agent.cancel(input.sessionId);send(res,200,{agent:state});return;}
   let packet=input,kind=req.url==='/v1/match-options'?'options':'fields';
   if(req.url==='/v1/chat/completions'){if(!Array.isArray(input.messages)||input.messages.length!==2||input.messages[1]?.role!=='user'||typeof input.messages[1]?.content!=='string')throw Error('仅支持 ResumeFill 匹配协议');try{packet=JSON.parse(input.messages[1].content);}catch{throw Error('匹配数据无效');}kind=packet.kind==='options'?'options':'fields';}
   if(kind==='fields')fieldPacket(packet);else Options.validate(packet);
   const cacheKey=crypto.createHash('sha256').update(JSON.stringify({kind,packet,endpoint:upstream?.endpoint,model:upstream?.model})).digest('hex');const cached=cache.get(cacheKey);let result,cacheHit=false;
   if(cached&&Date.now()-cached.at<ttl){result=cached.result;cacheHit=true;}else{
    if(upstream)result=await upstreamCall(kind,packet,controller.signal);
    else if(kind==='options')result=Options.local(packet);
    else{const values=Object.fromEntries(packet.candidates.map(c=>[c.path,'present']));result={matches:packet.fields.flatMap(f=>{const m=Matcher.match(f,values);return m?[{fieldId:f.id,path:m.path,confidence:1,reason:'本地唯一规则匹配，未调用模型'}]:[]})};}
    if(controller.signal.aborted)throw Error('请求已取消');if(maxCache&&ttl){cache.delete(cacheKey);cache.set(cacheKey,{at:Date.now(),result});while(cache.size>maxCache)cache.delete(cache.keys().next().value);}
   }
   const gateway={engine:upstream?'upstream':'local-rules',cacheHit,version:VERSION};send(res,200,req.url==='/v1/chat/completions'?{model:upstream?.model||'resumefill-local',choices:[{message:{role:'assistant',content:JSON.stringify(result)}}],gateway}:{...result,gateway});
  }catch(e){send(res,controller.signal.aborted?504:(e.status||400),{error:controller.signal.aborted?'本地请求已取消或超时':webOCR?String(e.message).slice(0,120):(/上游/.test(e.message)?e.message:'匹配请求无效或无法完成')});}
  finally{clearTimeout(timer);active--;}
 });
 server.headersTimeout=5000;server.requestTimeout=15000;
 return {server,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve(server.address());});}),close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}),clearCache:()=>cache.clear()};
}
module.exports={createGateway};
if(require.main===module){const fs=require('node:fs'),path=require('node:path');const configPath=process.env.RF_GATEWAY_CONFIG||path.join(process.env.APPDATA||path.join(require('node:os').homedir(),'.config'),'ResumeFillAgent','gateway','config.json');try{const gateway=createGateway(JSON.parse(fs.readFileSync(configPath,'utf8')));gateway.listen().then(a=>console.log(`ResumeFill gateway ${VERSION} listening at http://127.0.0.1:${a.port} (no request bodies logged)`)).catch(()=>{console.error('服务启动失败，请检查端口或配置');process.exitCode=1;});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>gateway.close().then(()=>process.exit(0)));}catch{console.error('配置不可用，请先运行 node local-server/setup.cjs');process.exitCode=1;}}
