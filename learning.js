(function(root){
  const clean=v=>String(v??'').trim();
  const signature=value=>JSON.stringify(value,(_key,node)=>node&&typeof node==='object'&&!Array.isArray(node)?Object.fromEntries(Object.keys(node).sort().map(key=>[key,node[key]])):node);
  const sensitive=f=>/身份证|证件|护照|电话|手机|邮箱|邮件|住址|地址|生日|出生|联系人|家庭|亲属|健康|病史|银行卡|收入|薪资|薪酬|政治面貌|passport|identity|\bid\b|phone|mobile|e.?mail|address|birth|emergency|salary|medical/i.test((f.label||'')+' '+(f.context||''));
  const keys={education:['school','major','degree','degreeName','startDate','endDate','studyMode'],work:['company','position','startDate','endDate','description'],projects:['name','role','startDate','endDate','description']};
  function plan(resume,snapshot){
    const M=root.ResumeMatcher,A=root.ResumeAnswers,values=M.flatten(resume),items=[],skipped=[];
    for(const original of snapshot.fields){
      const value=clean(original.value);if(!value)continue;
      let field=M.resolveField(original,values);
      const skip=reason=>skipped.push({label:original.label,reason});
      if(A.protectedField(original)){skip('不记录密码、验证码或安全答案');continue;}
      if(!field||field.ambiguousLabel){skip('经历或同名字段归属不明确，请选择区块后重扫');continue;}
      if(/^(请选择|请选择.*|选择日期|未选择|select|please select)$/i.test(value)||value.includes('****')){skip('占位或脱敏内容');continue;}
      if(value.length>20000){skip('内容过长');continue;}
      if(keys[field.section]&&!Number.isInteger(field.recordIndex)){skip('请先确定所属经历');continue;}
      const lookup={...values};
      if(keys[field.section]&&field.recordIndex>=0&&field.recordIndex<30)for(const key of keys[field.section])lookup[`${field.section}.${field.recordIndex}.${key}`]??='';
      const answer=A.match(field,resume,snapshot),guess=field.path?{path:field.path,score:100}:M.match(field,lookup)||M.infer(field);
      let path=answer?.path||(guess?.score>=100?guess.path:null);
      if(path&&!path.startsWith('fieldAnswers.')&&!M.allowedPath(field,path))path=null;
      const oldValue=path?clean(values[path]):'';
      if(oldValue===value)continue;
      items.push({field,value,path,oldValue,kind:oldValue?'修改':path?'新增资料':'新增网站答案',sensitive:sensitive(field),checked:!oldValue&&!sensitive(field)});
    }
    // One destination must have one value; never silently let the last control win.
    const groups=new Map();for(const item of items){const key=item.path||A.key(A.identity(item.field,snapshot));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
    const unique=[];for(const group of groups.values()){if(new Set(group.map(i=>i.value)).size>1){for(const item of group)skipped.push({label:item.field.label,reason:'多个字段指向同一资料但内容不同，请先核对归属'});}else unique.push(group[0]);}
    return {baseline:signature(resume),page:snapshot,items:unique,skipped};
  }
  function apply(resume,review,indices,sensitiveApproved=false){
    if(signature(resume)!==review.baseline)throw Error('本地资料已变化，请重新扫描并学习');
    if(!Array.isArray(indices)||!indices.length)throw Error('请选择至少一项资料');
    const out=JSON.parse(JSON.stringify(resume)),A=root.ResumeAnswers;
    for(const index of new Set(indices)){
      const item=review.items[index];if(!item)throw Error('学习项已失效');
      if(item.sensitive&&!sensitiveApproved)throw Error('请单独确认保存所选敏感资料');
      if(!item.path||item.path.startsWith('fieldAnswers.')){Object.assign(out,A.save(out,[{field:item.field,value:item.value}],review.page));continue;}
      const parts=item.path.split('.');if(parts.some(p=>!p||['__proto__','prototype','constructor'].includes(p))||!root.ResumeMatcher.allowedPath(item.field,item.path))throw Error('资料路径无效');
      if(!['basics','family'].includes(parts[0])&&!keys[parts[0]]&&!Object.hasOwn(root.ResumeMatcher.flatten(resume),item.path))throw Error('此资料需在管理页修改');
      if(keys[parts[0]]){const n=Number(parts[1]);if(parts.length!==3||!Number.isInteger(n)||n<0||n>29)throw Error('经历路径无效');out[parts[0]]??=[];if(!Array.isArray(out[parts[0]])||n>out[parts[0]].length)throw Error('经历序号不连续，请先补齐前面的经历');if(n===out[parts[0]].length)out[parts[0]].push({});}
      let node=out;for(const part of parts.slice(0,-1)){if(!Object.hasOwn(node,part))node[part]={};node=node[part];if(!node||typeof node!=='object')throw Error('资料结构冲突');}
      const last=parts.at(-1);if(Object.hasOwn(node,last)&&!['string','number'].includes(typeof node[last]))throw Error('不能覆盖结构化资料');node[last]=item.value;
    }
    return out;
  }
  root.ResumeLearning={plan,apply,sensitive};if(typeof module!=='undefined')module.exports=root.ResumeLearning;
})(globalThis);
