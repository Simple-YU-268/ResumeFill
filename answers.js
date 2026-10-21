(function(root){
  const norm=s=>String(s??'').normalize('NFKC').trim().toLowerCase().replace(/[\s*＊:：]/g,'');
  const protectedField=f=>/验证码|校验码|密码|安全问题|密保|问题[一二三123]答案|security.?question|security.?answer|recovery.?answer|一次性.*码|captcha|password|one.?time|verification.?code|\botp\b/i.test(f.label||'');
  function identity(f,page){const formId=page.url?new URL(page.url).searchParams.get('formId'):null;return {label:String(f.label||'').trim(),section:f.section||null,recordIndex:Number.isInteger(f.recordIndex)?f.recordIndex:null,context:String(f.context||''),type:f.type,origin:page.origin,page:page.page,formId};}
  function key(a){return JSON.stringify([norm(a.label),a.section,a.recordIndex,norm(a.context),a.type,a.origin,a.page,a.formId||null]);}
  function match(field,resume,page){
    if(protectedField(field)||field.ambiguousLabel)return null;
    const wanted=key(identity(field,page)),found=[];
    for(const [i,a] of (Array.isArray(resume.fieldAnswers)?resume.fieldAnswers:[]).entries())if(a&&key(a)===wanted&&typeof a.value==='string'&&a.value.trim())found.push({path:`fieldAnswers.${i}.value`});
    return found.length===1?found[0]:null;
  }
  function save(resume,drafts,page){
    const out=JSON.parse(JSON.stringify(resume));
    if(out.fieldAnswers!==undefined&&!Array.isArray(out.fieldAnswers))throw Error('fieldAnswers 必须是数组');
    out.fieldAnswers||=[];const seen=new Map();
    for(const {field,value,path} of drafts){
      if(protectedField(field))throw Error('不保存密码或验证码');
      if(field.ambiguousLabel)throw Error('同组存在同名字段，无法确定答案归属，请先补充站点规则');
      if(typeof value!=='string'||!value.trim())continue;
      if(value.length>20000)throw Error('单项补充资料限 20000 字符');
      if(path&&!path.startsWith('fieldAnswers.')){
        const parts=path.split('.');let target=out;
        if(parts.some(p=>['__proto__','prototype','constructor'].includes(p)))throw Error('无效资料路径');
        const inferred=root.ResumeMatcher?.infer(field)?.path;
        if(parts[0]==='basics'&&inferred===path){let node=out;for(const part of parts.slice(0,-1)){if(!Object.hasOwn(node,part))node[part]={};if(!node[part]||typeof node[part]!=='object'||Array.isArray(node[part]))throw Error('资料结构冲突，请在管理页整理');node=node[part];}if(!Object.hasOwn(node,parts.at(-1)))node[parts.at(-1)]='';}
        for(const part of parts.slice(0,-1)){if(!target||!Object.hasOwn(target,part))throw Error('资料路径已变化，请重新扫描');target=target[part];}
        const last=parts.at(-1);if(!target||!Object.hasOwn(target,last)||!['string','number'].includes(typeof target[last]))throw Error('资料路径已变化，请重新扫描');
        if(String(target[last]).trim())throw Error('该资料已有内容，请在管理页修改后重新扫描');
        target[last]=value;continue;
      }
      const entry={...identity(field,page),value},id=key(entry);
      if(seen.has(id)&&seen.get(id)!==value)throw Error('同一分组存在同名字段且答案不同，请先核对字段分组');
      seen.set(id,value);
      const existing=out.fieldAnswers.map((a,i)=>a&&key(a)===id?i:-1).filter(i=>i>=0);
      if(existing.length>1)throw Error('补充资料存在重复项，请在管理页整理');
      if(existing.length)out.fieldAnswers[existing[0]]=entry;else out.fieldAnswers.push(entry);
    }
    return out;
  }
  root.ResumeAnswers={match,save,protectedField};if(typeof module!=='undefined')module.exports=root.ResumeAnswers;
})(globalThis);
