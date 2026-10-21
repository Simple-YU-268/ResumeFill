(function(root){
 const clone=x=>JSON.parse(JSON.stringify(x));
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const signature=x=>JSON.stringify(x,(_k,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const empty=x=>x==null||typeof x==='string'&&!x.trim()||Array.isArray(x)&&!x.length||object(x)&&!Object.keys(x).length;
 const valid=k=>!['__proto__','prototype','constructor'].includes(k)&&!k.startsWith('_');
 const sensitive=path=>/phone|mobile|email|address|birthday|birthPlace|birthRegion|hukou|nativePlace|nativeRegion|currentResidence|idNumber|idCard|passport|politicalStatus|emergency|salary|电话|手机|邮箱|地址|生日|出生|户籍|籍贯|证件|身份证|联系人|薪资|政治面貌/i.test(path.join('.'));
 function plan(local,remote){
  if(!object(local)||!object(remote)||!object(remote.basics))throw Error('资料格式无效，请检查桌面个人资料');
  const items=[];
  function walk(target,source,path){
   if(empty(source)||signature(target)===signature(source))return;
   // Records are atomic groups: array position does not establish identity.
   const atomic=Array.isArray(source)||object(source)&&(!empty(target)&&!object(target)||['hukou','nativeRegion','currentResidence'].includes(path.at(-1)));
   if(object(source)&&!atomic){for(const [key,value]of Object.entries(source))if(valid(key)&&!(path.length===0&&key==='fieldAnswers'))walk(object(target)?target[key]:undefined,value,[...path,key]);return;}
   if(!path.length)return;
   items.push({path,previous:target===undefined?null:clone(target),value:clone(source),missing:empty(target),group:atomic,sensitive:atomic||sensitive(path),checked:empty(target)&&!atomic&&!sensitive(path)});
  }
  walk(local,remote,[]);return {local:signature(local),remote:signature(remote),items};
 }
 function apply(local,remote,review,indices){
  if(signature(local)!==review.local)throw Error('插件资料已改变，请重新检查桌面更新');
  if(signature(remote)!==review.remote)throw Error('桌面资料已改变，请重新检查桌面更新');
  if(!Array.isArray(indices)||!indices.length)throw Error('请选择至少一项更新');
  const current=plan(local,remote);if(signature(current.items)!==signature(review.items))throw Error('更新预览已失效');
  const out=clone(local);
  for(const i of new Set(indices)){
   const item=current.items[i];if(!item)throw Error('更新项无效');
   let node=out;for(const part of item.path.slice(0,-1)){if(!valid(part))throw Error('路径无效');if(!Object.hasOwn(node,part))node[part]={};if(!object(node[part]))throw Error('资料结构冲突，请在管理页整理');node=node[part];}
   const last=item.path.at(-1);if(!valid(last)||item.path[0]==='fieldAnswers')throw Error('不能覆盖网站答案');node[last]=clone(item.value);
   if(item.path[0]==='basics'){
    const region={city:'currentResidence',address:'currentResidence',hukouAddress:'hukou',nativePlace:'nativeRegion',hukou:'hukou',nativeRegion:'nativeRegion',currentResidence:'currentResidence'}[item.path[1]];
    if(region&&out._normalization?.regions)delete out._normalization.regions[region];
   }
  }
  return out;
 }
 root.ResumeProfileSync={plan,apply,signature};if(typeof module!=='undefined')module.exports=root.ResumeProfileSync;
})(globalThis);
