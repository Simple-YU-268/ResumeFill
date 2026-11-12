const $=id=>document.getElementById(id);
let plan=null,attachmentPending=false,working=false,latestState=null;
const fields=new Map();
function feedback(text,error=false){$('browserFeedback').textContent=text;$('browserFeedback').dataset.error=String(error);}
function controls(){
 for(const id of ['scan','fill','attachment','preflight','back','forward','reload','external'])$(id).disabled=working||!!latestState?.busy||['fill','attachment','preflight'].includes(id)&&!plan;
 if(!working&&!latestState?.busy){$('back').disabled=!latestState?.back;$('forward').disabled=!latestState?.forward;}
 for(const row of fields.values())row.select.disabled=working||!!latestState?.busy||row.blocked;
 $('overwrite').disabled=working||!!latestState?.busy;
}
function clearPlan(){plan=null;attachmentPending=false;fields.clear();$('browserFields').replaceChildren();$('browserDocuments').replaceChildren();$('browserWork').replaceChildren();$('browserSummary').textContent='页面已变化，请重新扫描';$('attachment').textContent='选择投递用 PDF';controls();}
function renderState(state){
 latestState=state;$('browserState').dataset.loading=String(state.loading);$('browserState').dataset.url=state.url;
 $('browserLoading').hidden=!state.loading;
 if(document.activeElement!==$('address')&&state.url&&state.url!=='about:blank')$('address').value=state.url;
 try{$('browserLocation').textContent=new URL(state.url).origin;}catch{$('browserLocation').textContent='尚未打开网站';}
 if(state.url&&state.url!=='about:blank')$('browserEmpty').hidden=true;
 if(plan&&!state.hasPlan)clearPlan();controls();
}
async function command(input){
 working=true;controls();
 try{return await window.rfBrowser.command(input);}catch(error){feedback(error.message,true);throw error;}
 finally{working=false;controls();}
}
function pathName(path){
 const parts=path.split('.'),names=globalThis.ResumeFieldLabels;
 return [names?.sections[parts[0]]||parts[0],/^\d+$/.test(parts[1])?'第 '+(Number(parts[1])+1)+' 条':null,names?.fields[parts.at(-1)]||parts.at(-1)].filter(Boolean).join(' · ');
}
function renderPlan(next){
 plan=next;fields.clear();$('browserFields').replaceChildren();$('browserDocuments').replaceChildren();$('browserWork').replaceChildren();
 attachmentPending=false;$('attachment').textContent='选择投递用 PDF';
 $('browserSummary').textContent=next.fields.length+' 个字段 · 请核对后填写';
 const available=(next.documents||[]).filter(document=>document.status==='available');
 if(available.length>1){
  const label=document.createElement('label');label.textContent='选择表单文档';
  const select=document.createElement('select');select.setAttribute('aria-label','选择表单文档');select.append(new Option('请选择目标表单',''));
  for(const document of available)select.append(new Option(document.url+' · '+document.fieldCount+' 个字段',document.documentId));
  select.value=next.frameDocumentId||'';select.onchange=()=>scan({documentId:select.value}).catch(()=>{});label.append(select);$('browserDocuments').append(label);
 }
 const diagnosticNames={CROSS_ORIGIN_DOCUMENT:'跨域文档未读取',CROSS_ORIGIN_OR_OPAQUE:'跨域或不透明文档未读取',HIDDEN_DOCUMENT:'隐藏文档已排除',OPAQUE_SANDBOX:'不透明文档已排除',MULTIPLE_DOCUMENTS:'请选择唯一目标文档'};
 for(const code of new Set((next.diagnostics||[]).map(item=>item.code))){if(diagnosticNames[code]){const text=document.createElement('p');text.textContent=diagnosticNames[code];$('browserDocuments').append(text);}}
 for(const binding of next.workBindings||[]){
  const label=document.createElement('label'),select=document.createElement('select');
  label.textContent=binding.context+' · 第 '+(binding.moduleRecordIndex+1)+' 条';select.setAttribute('aria-label',label.textContent+' 对应经历');
  select.append(new Option('请选择独立记录',''));
  for(const record of next.workRecords||[])if(record.type==='unknown'||record.type===binding.employmentType)select.append(new Option('第 '+(record.index+1)+' 条 · '+record.company,String(record.index)));
  select.value=binding.recordIndex===null?'':String(binding.recordIndex);
  select.onchange=()=>{
   const assignments=Object.fromEntries(next.workBindings.filter(item=>item.recordIndex!==null).map(item=>[item.id,item.recordIndex]));
   if(select.value==='')delete assignments[binding.id];else assignments[binding.id]=Number(select.value);
   scan({documentId:next.frameDocumentId,workAssignments:assignments,workTopology:next.workTopology,profileKey:next.profileKey}).catch(()=>{});
  };
  label.append(select);$('browserWork').append(label);
 }
 for(const field of next.fields){
  const row=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),reason=document.createElement('small'),preview=document.createElement('p');
  row.className='field-row';label.textContent=field.label;select.setAttribute('aria-label',field.label+' 对应资料');select.append(new Option('跳过本字段',''));
  for(const item of field.candidates)select.append(new Option(pathName(item.path),item.path));
  select.value=field.selected;select.disabled=field.decision.action==='block';
  reason.textContent=field.decision.reason;preview.className='field-preview';
  const update=()=>{preview.textContent=field.candidates.find(item=>item.path===select.value)?.preview||'';};select.onchange=update;update();
  label.append(select);row.append(label,reason,preview);$('browserFields').append(row);fields.set(field.id,{select,reason,blocked:field.decision.action==='block'});
 }
 controls();
}
async function scan(extra={}){const next=await command({action:'scan',...extra});renderPlan(next);feedback(next.selectionRequired?'请选择要填写的表单文档':'请核对匹配结果');}
$('navigation').onsubmit=event=>{event.preventDefault();command({action:'navigate',url:$('address').value}).catch(()=>{});};
for(const name of ['back','forward','reload','external'])$(name).onclick=()=>command({action:name}).catch(()=>{});
$('scan').onclick=()=>scan().catch(()=>{});
$('fill').onclick=async()=>{
 try{
  const result=await command({action:'fill',token:plan?.token,overwrite:$('overwrite').checked,
   choices:[...fields].filter(([_id,row])=>row.select.value).map(([id,row])=>({id,path:row.select.value}))});
  for(const item of result.results||[]){const row=fields.get(item.id);if(row)row.reason.textContent=({verified:'回读一致',preserved:'保留原值',stale:'字段已变化',mismatch:'回读不一致',failed:'填写失败'})[item.status]||'请核对';}
  const verified=(result.results||[]).filter(item=>item.status==='verified').length;
  feedback('回读一致 '+verified+' · 未确认 '+((result.results||[]).length-verified)+(result.adaptation?.requiresReview?'；发现新字段，请重新扫描核对':'')+'。最终提交由你完成。');
 }catch{}
};
$('attachment').onclick=async()=>{
 try{
  const result=await command({action:'attachment',token:plan?.token,confirm:attachmentPending});
  attachmentPending=!!result.pending;$('attachment').textContent=attachmentPending?'确认上传 PDF':'选择投递用 PDF';
  feedback(result.pending?'待上传：'+result.fileName:result.selected?'已选中 PDF，请在网页核对上传状态':'无法确认附件，请在网页核对');
 }catch{attachmentPending=false;$('attachment').textContent='选择投递用 PDF';}
};
$('preflight').onclick=async()=>{
 try{
  const result=await command({action:'preflight',token:plan?.token});
  const names={'invalid':'格式无效','required-empty':'必填未填','challenge':'需要人工处理','semantic-drift':'字段语义变化','unconfirmed':'填写未确认','readback-changed':'填写后内容变化'};
  feedback((result.issues||[]).map(item=>item.label+'：'+(names[item.code]||'需要核对')).join('；')+'。请在网页核对并手动提交');
 }catch{}
};
$('cancel').onclick=()=>window.rfBrowser.command({action:'cancel'}).then(()=>feedback('填写已停止')).catch(error=>feedback(error.message,true));
window.rfBrowser.onState(renderState);window.rfBrowser.command({action:'state'}).then(renderState).catch(error=>feedback(error.message,true));
