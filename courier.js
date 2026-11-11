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
  function enqueue(rows,job,now=Date.now()){
    if(!Array.isArray(rows)||!key(job?.id)||!key(job.companyKey))throw Error('Invalid application identity');
    const url=new URL(job.origin);
    if(url.origin!==job.origin||url.protocol!=='https:')throw Error('An exact HTTPS origin is required');
    if(rows.some(row=>row.id===job.id||row.companyKey===job.companyKey&&row.status!=='skipped'))
      throw Error('Duplicate application or company quota reached');
    if(rows.filter(row=>now-row.at<86400000&&row.status!=='skipped').length>=20)
      throw Error('Daily application budget reached');
    const site=rows.filter(row=>row.origin===job.origin).sort((a,b)=>b.updatedAt-a.updatedAt);
    if(site[0]&&now-site[0].updatedAt<1800000)throw Error('Site cooldown is active');
    if(site.length>=3&&site.slice(0,3).every(row=>row.status==='failed')&&now-site[0].updatedAt<86400000)
      throw Error('Site circuit breaker is active');
    if(rows.length>=100)throw Error('Clear old application receipts before adding more');
    return [...rows,{id:job.id,companyKey:job.companyKey,origin:job.origin,at:now,updatedAt:now,status:'queued',verified:0,failed:0}];
  }
  function transition(rows,id,status,detail={},now=Date.now()){
    const current=rows.find(row=>row.id===id);
    if(!current||!edges[current.status]?.includes(status))throw Error('Invalid application transition');
    if(status==='submitted'&&detail.confirmedByUser!==true)throw Error('Human confirmation is required');
    if(status==='queued'||status==='running')
      enqueue(rows.filter(row=>row.id!==id),current,now);
    return rows.map(row=>row.id!==id?row:{...row,status,updatedAt:now,
      verified:Number.isInteger(detail.verified)&&detail.verified>=0&&detail.verified<=500?detail.verified:row.verified,
      failed:Number.isInteger(detail.failed)&&detail.failed>=0&&detail.failed<=500?detail.failed:row.failed});
  }
  root.ResumeCourier={enqueue,transition};
  if(typeof module!=='undefined')module.exports=root.ResumeCourier;
})(globalThis);
