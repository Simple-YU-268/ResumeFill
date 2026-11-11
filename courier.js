(function(root){
  const edges={
    queued:['running','skipped'],
    running:['handoff','blocked','failed'],
    handoff:['running','submitted','blocked','skipped'],
    blocked:['queued','skipped'],
    failed:['queued','skipped'],
    submitted:[],skipped:[]
  };
  const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);
  const normalize=value=>value.normalize('NFKC').trim().toLowerCase();
  function validateRules(input={}){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid screening rules');
    const result={};
    for(const name of ['includeKeywords','excludeKeywords']){
      const list=input[name]??[];
      if(!Array.isArray(list)||list.length>30||list.some(word=>typeof word!=='string'||!word.trim()||word.length>100))
        throw Error('Screening keywords require at most 30 nonempty terms of 100 characters');
      result[name]=[...new Set(list.map(normalize))];
    }
    return result;
  }
  function validateJob(rows,job){
    if(!Array.isArray(rows)||!key(job?.id)||!key(job.companyKey))throw Error('Invalid application identity');
    const url=new URL(job.origin);
    if(url.origin!==job.origin||url.protocol!=='https:')throw Error('An exact HTTPS origin is required');
  }
  function screen(rows,job,rules={}){
    validateJob(rows,job);
    const config=validateRules(rules),input=job.screening??{};
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid job screening');
    const title=input.title??'';
    if(typeof title!=='string'||title.length>500)throw Error('Invalid job title');
    const reasons=[];
    for(const [name,known] of Object.entries({availability:['open','closed'],scope:['in-scope','out-of-scope'],eligibility:['eligible','ineligible']})){
      const value=input[name]??'unknown';
      if(value==='unknown')reasons.push(name+'-unknown');
      else if(!known.includes(value))throw Error('Invalid job '+name);
    }
    if(input.availability==='closed')return {action:'skip',reasons:['closed']};
    if(input.scope==='out-of-scope')return {action:'skip',reasons:['out-of-scope']};
    if(input.eligibility==='ineligible')return {action:'block',reasons:['ineligible']};
    if(rows.some(row=>row.id===job.id))return {action:'skip',reasons:['duplicate']};
    if(rows.some(row=>row.companyKey===job.companyKey&&row.status!=='skipped'))return {action:'skip',reasons:['company-quota']};
    const text=normalize(title);
    if(!text)reasons.push('title-unknown');
    else {
      if(config.excludeKeywords.some(word=>text.includes(word)))return {action:'skip',reasons:['excluded-keyword']};
      if(config.includeKeywords.length&&!config.includeKeywords.some(word=>text.includes(word)))return {action:'skip',reasons:['outside-keywords']};
    }
    return {action:reasons.length?'review':'accept',reasons};
  }
  function capacity(rows,job,now){
    validateJob(rows,job);
    if(rows.some(row=>row.id===job.id||row.companyKey===job.companyKey&&row.status!=='skipped'))
      throw Error('Duplicate application or company quota reached');
    if(rows.filter(row=>now-row.at<86400000&&row.status!=='skipped').length>=20)
      throw Error('Daily application budget reached');
    const site=rows.filter(row=>row.origin===job.origin).sort((a,b)=>b.updatedAt-a.updatedAt);
    if(site[0]&&now-site[0].updatedAt<1800000)throw Error('Site cooldown is active');
    if(site.length>=3&&site.slice(0,3).every(row=>row.status==='failed')&&now-site[0].updatedAt<86400000)
      throw Error('Site circuit breaker is active');
    if(rows.length>=100)throw Error('Clear old application receipts before adding more');
  }
  function enqueue(rows,job,now=Date.now(),rules={}){
    capacity(rows,job,now);
    const decision=screen(rows,job,rules);
    if(decision.action==='skip'||decision.action==='block')throw Error('Application screening: '+decision.reasons.join(', '));
    if(decision.action==='review'&&job.confirmedByUser!==true)throw Error('Application screening requires human review: '+decision.reasons.join(', '));
    return [...rows,{id:job.id,companyKey:job.companyKey,origin:job.origin,at:now,updatedAt:now,status:'queued',verified:0,failed:0,screened:true}];
  }
  function transition(rows,id,status,detail={},now=Date.now()){
    const current=rows.find(row=>row.id===id);
    if(!current||!edges[current.status]?.includes(status))throw Error('Invalid application transition');
    if(status==='submitted'&&detail.confirmedByUser!==true)throw Error('Human confirmation is required');
    if(status==='running'&&current.screened!==true&&detail.confirmedByUser!==true)
      throw Error('Application screening requires human review');
    if(status==='queued'||status==='running')capacity(rows.filter(row=>row.id!==id),current,now);
    return rows.map(row=>row.id!==id?row:{...row,status,updatedAt:now,
      ...status==='running'?{screened:true}:{},
      verified:Number.isInteger(detail.verified)&&detail.verified>=0&&detail.verified<=500?detail.verified:row.verified,
      failed:Number.isInteger(detail.failed)&&detail.failed>=0&&detail.failed<=500?detail.failed:row.failed});
  }
  function recover(rows,id,now=Date.now()){
    if(rows.find(row=>row.id===id)?.status!=='running')throw Error('Only a running application can be recovered');
    return transition(rows,id,'blocked',{},now).map(row=>row.id===id?{...row,reason:'interrupted'}:row);
  }
  function receipts(rows,revision){
    return {version:1,...revision!==undefined?{revision}:{},applications:rows.map(row=>Object.fromEntries(
      ['id','companyKey','origin','at','updatedAt','status','verified','failed','reason','screened']
        .filter(key=>row[key]!==undefined).map(key=>[key,row[key]])))};
  }
  function validateReceipts(input){
    if(input?.version!==1||!Array.isArray(input.applications)||input.applications.length>100)
      throw Error('Invalid application receipts');
    if(input.revision!==undefined&&(!Number.isSafeInteger(input.revision)||input.revision<0))
      throw Error('Invalid application receipt revision');
    const ids=new Set();
    for(const row of input.applications){
      if(!key(row?.id)||!key(row.companyKey)||ids.has(row.id)||!Object.hasOwn(edges,row.status))
        throw Error('Invalid application receipt identity or status');
      ids.add(row.id);
      const url=new URL(row.origin);
      if(url.protocol!=='https:'||url.origin!==row.origin)throw Error('Invalid application receipt origin');
      if(![row.at,row.updatedAt].every(value=>Number.isSafeInteger(value)&&value>=0)||row.updatedAt<row.at||
        ![row.verified,row.failed].every(value=>Number.isInteger(value)&&value>=0&&value<=500)||
        row.reason!==undefined&&row.reason!=='interrupted'||row.screened!==undefined&&row.screened!==true)throw Error('Invalid application receipt details');
    }
    return receipts(input.applications,input.revision);
  }
  root.ResumeCourier={screen,validateRules,enqueue,transition,recover,receipts,validateReceipts};
  if(typeof module!=='undefined')module.exports=root.ResumeCourier;
})(globalThis);
