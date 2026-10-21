const crypto=require('node:crypto');
class DesktopPairing{
 constructor({grants,save,secret}){this.grants=grants;this.save=save;this.secret=secret;this.pending=new Map();this.denied=new Map();}
 id(origin,clientId){return crypto.createHash('sha256').update(origin+'\n'+clientId).digest('hex');}
 token(grant){return crypto.createHmac('sha256',this.secret()).update('desktop-session-v1\n'+grant.origin+'\n'+grant.clientId).digest('hex');}
 request(input,origin){
  if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin||'')||typeof input?.clientId!=='string'||!/^[-\w]{8,80}$/.test(input.clientId))throw Object.assign(Error('配对客户端无效'),{status:400,code:'RF_PAIR_INVALID'});
  const id=this.id(origin,input.clientId),now=Date.now();this.status();
  if((this.denied.get(id)||0)>now)throw Object.assign(Error('桌面端已拒绝本次连接，请稍后重试'),{status:403,code:'RF_PAIR_DENIED'});
  const grant=this.grants().find(g=>g.id===id&&g.origin===origin&&g.clientId===input.clientId);
  if(grant)return {status:200,data:{paired:true,token:this.token(grant),model:'resumefill-local'}};
  let pending=this.pending.get(id);
  if(!pending){if(this.pending.size>=10||[...this.pending.values()].filter(p=>p.origin===origin).length>=3)throw Object.assign(Error('待确认连接过多，请在桌面端处理后再试'),{status:429,code:'RF_PAIR_RATE_LIMITED'});pending={id,origin,clientId:input.clientId,browser:input.browser==='Edge'?'Edge':'Chrome',version:String(input.version||'').slice(0,20),expiresAt:now+120000};this.pending.set(id,pending);}
  return {status:202,data:{paired:false,pending:true,requestId:id,expiresAt:pending.expiresAt}};
 }
 approve(id){this.status();const request=this.pending.get(id);if(!request)throw Error('配对请求已过期，请在插件中重新连接');const grants=this.grants().filter(g=>g.id!==id);if(grants.length>=20)throw Error('已配对浏览器过多，请先撤销旧授权');grants.push({...request,createdAt:Date.now()});this.save(grants);this.pending.delete(id);return true;}
 reject(id){this.pending.delete(id);this.denied.set(id,Date.now()+120000);return true;}
 revoke(id){this.save(this.grants().filter(g=>g.id!==id));return true;}
 authenticate(token,origin){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;return this.grants().filter(g=>g.origin===origin).some(g=>crypto.timingSafeEqual(Buffer.from(token),Buffer.from(this.token(g))));}
 status(){const now=Date.now();for(const [id,p]of this.pending)if(p.expiresAt<now)this.pending.delete(id);for(const [id,until]of this.denied)if(until<now)this.denied.delete(id);return {pending:[...this.pending.values()],approved:this.grants().map(({id,origin,browser,createdAt})=>({id,origin,browser,createdAt}))};}
}
module.exports={DesktopPairing};
