(()=>{
 const anchor=document.getElementById('desktopAutoStatus');if(!anchor)return;
 let review=null,working=false,generation=0;
 const controls=document.createElement('div');controls.className='actions';const check=document.createElement('button');check.id='profileSyncCheck';check.textContent='检查桌面资料更新';
 const note=document.createElement('p');note.id='profileSyncStatus';note.className='muted';note.setAttribute('role','status');
 const panel=document.createElement('div');panel.id='profileSyncReview';panel.className='card profile-sync-review';panel.hidden=true;controls.append(check);anchor.after(controls,note,panel);
 const message=async()=>{const r=await chrome.runtime.sendMessage({type:'RF_DESKTOP_PULL'});if(r?.error)throw Error(r.error);return r.resume;};
 const guard=()=>{if(!dispatchEvent(new Event('resumefill-profile-sync-guard',{cancelable:true})))throw Error('请先保存编辑或结束正在进行的填写，再同步资料');};
 const saveGuard=async()=>{guard();const {agentRun}=await chrome.storage.session.get('agentRun');if(agentRun?.running||agentRun?.state?.status==='needs_input')throw Error('请结束或停止当前 Agent，再同步资料');};
 const text=value=>value===null?'（无）':typeof value==='object'?JSON.stringify(value,null,2):String(value);
 const label=path=>path.map((k,i)=>(i===0?globalThis.ResumeFieldLabels?.sections:globalThis.ResumeFieldLabels?.fields)?.[k]||k).join(' · ');
 function render(current){
  panel.replaceChildren();panel.hidden=!current.items.length;if(!current.items.length)return;
  const title=document.createElement('h3');title.textContent=`桌面资料差异 · ${current.items.length} 项`;
  const intro=document.createElement('p');intro.textContent='空缺的普通字段默认勾选。已有值、敏感资料及整组经历需要你选择；不会清空插件独有内容或网站学习答案。';panel.append(title,intro);
  const checks=[];
  current.items.forEach((item,index)=>{const row=document.createElement('div');row.className='profile-sync-item';const name=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=item.checked;box.dataset.syncIndex=index;name.append(box,document.createTextNode((item.missing?'补充':'修改')+'：'+label(item.path)+(item.group?'（整组替换，请核对记录）':'')));const old=document.createElement('pre'),next=document.createElement('pre');old.textContent='插件：'+text(item.previous);next.textContent='桌面：'+text(item.value);row.append(name,old,next);panel.append(row);checks.push(box);});
  const sensitive=document.createElement('input');sensitive.type='checkbox';sensitive.id='profileSyncSensitive';const consent=document.createElement('label');consent.className='profile-sync-consent';consent.append(sensitive,document.createTextNode('确认更新所选敏感资料或整组经历'));panel.append(consent);
  const save=document.createElement('button');save.id='profileSyncSave';save.className='primary';save.textContent='同步所选到插件';
  save.onclick=async()=>{if(working)return;working=true;save.disabled=true;try{
   await saveGuard();if(review!==current)throw Error('请重新检查更新');const indices=checks.flatMap((c,i)=>c.checked?[i]:[]);if(indices.some(i=>current.items[i].sensitive)&&!sensitive.checked)throw Error('请确认所选敏感资料或整组经历');
   const remote=await message(),stored=await chrome.storage.local.get('resume');const updated=ResumeProfileSync.apply(stored.resume,remote,current,indices),enriched=await ResumeProfile.enrich(updated);
   await saveGuard();const freshRemote=await message(),latest=await chrome.storage.local.get('resume');ResumeProfileSync.apply(latest.resume,freshRemote,current,indices);
   await chrome.storage.local.set({resumeSyncBackup:{resume:stored.resume,createdAt:new Date().toISOString()},resume:enriched.resume});review=null;panel.hidden=true;panel.replaceChildren();check.textContent='检查桌面资料更新';note.textContent=`已同步 ${indices.length} 项，网站学习答案已保留。请重新扫描网页使用新资料。`;
   dispatchEvent(new CustomEvent('resumefill-profile-synced'));
  }catch(e){note.textContent='同步未完成：'+e.message;}finally{working=false;save.disabled=false;}};
  const cancel=document.createElement('button');cancel.textContent='暂不同步';cancel.onclick=()=>{review=null;panel.hidden=true;panel.replaceChildren();note.textContent='已保留插件资料，可随时检查桌面更新。';};const actions=document.createElement('div');actions.className='actions';actions.append(save,cancel);panel.append(actions);
 }
 async function inspect(automatic=false){
  if(working)return;working=true;const revision=++generation;check.disabled=true;
  try{guard();note.textContent='正在检查桌面与插件资料差异…';const remote=await message(),stored=await chrome.storage.local.get('resume');if(!stored.resume){note.textContent='尚无插件资料，请先完成连接或保存简历。';return;}const current=ResumeProfileSync.plan(stored.resume,remote);if(revision!==generation)return;review=current;
   if(automatic){panel.hidden=true;panel.replaceChildren();note.textContent=current.items.length?`桌面有 ${current.items.length} 项新增或不同资料。插件仍使用已保存资料，请点击“检查桌面资料更新”核对同步。`:'两端可同步资料一致；网站答案独立保留。';check.textContent=current.items.length?`查看 ${current.items.length} 项桌面更新`:'检查桌面资料更新';}
   else{check.textContent='检查桌面资料更新';render(current);note.textContent=current.items.length?'核对后同步所选项目即可，不需要整份替换 JSON。':'两端可同步资料一致；网站答案独立保留。';}
  }catch(e){note.textContent='资料检查未完成：'+e.message;}finally{working=false;check.disabled=false;}
 }
 check.onclick=()=>inspect();addEventListener('resumefill-desktop-connected',()=>inspect(true));
 globalThis.ResumeProfileSyncUI={check:()=>inspect()};
})();
