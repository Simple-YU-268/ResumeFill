(() => {
  if(globalThis.__resumeInline)return;globalThis.__resumeInline=true;
  const target=e=>e.composedPath()[0];
  let resume=null,active=null,version=0,writing=false;
  const host=document.createElement('div');host.setAttribute('data-resumefill-assistant','');
  host.style.cssText='all:initial;position:fixed;z-index:2147483647;display:none;';
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{font:14px system-ui;color:#283f3c}section{box-sizing:border-box;width:340px;max-width:95vw;max-height:280px;overflow:auto;background:white;border:1px solid #a7b9ad;border-radius:16px;box-shadow:0 4px 20px #0003;padding:10px}button{display:block;width:100%;text-align:left;background:#edf2e9;border:0;border-radius:10px;padding:8px;margin:5px 0;cursor:pointer;color:#173b38;font:inherit}small{display:block;color:#55736d;white-space:pre-wrap}p{margin:5px 0}';
  const panel=document.createElement('section');panel.setAttribute('role','region');panel.setAttribute('aria-label','简历快填匹配建议');shadow.append(style,panel);document.documentElement.append(host);
  async function request(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;}
  function eligible(el){if(el.closest?.('[class*="sd-Select-container-"]'))return false;return el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement&&['text','email','tel','search','url','number'].includes(el.type);}
  function hide(){version++;host.style.display='none';active=null;}
  function page(){return {origin:location.origin,page:location.pathname,url:location.href};}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onpointerdown=e=>e.preventDefault();b.onclick=async()=>{if(writing)return;const before=ResumeLayout.activeElement();writing=true;try{await fn();}catch(e){panel.replaceChildren();const p=document.createElement('p');p.textContent=e.message;panel.append(p);}finally{writing=false;const focused=ResumeLayout.activeElement();if(focused!==before&&eligible(focused))show(focused);}};panel.append(b);}
  function position(){if(!active?.isConnected){hide();return;}const r=active.getBoundingClientRect();host.style.left=Math.max(4,Math.min(r.left,innerWidth-350))+'px';host.style.top=Math.max(4,Math.min(r.bottom+4,innerHeight-290))+'px';}
  async function show(el){
    if(writing)return;
    if(!eligible(el)||!ResumeLayout.visible(el)||el.disabled||el.readOnly){hide();return;}
    const field=ResumeFillPage.describe(el);if(field.scopeExcluded||ResumeAnswers.protectedField(field)){hide();return;}
    active=el;const rev=++version;
    try{resume=(await request('RF_ASSIST_DATA')).resume;}catch{hide();return;}
    if(rev!==version||active!==el)return;
    if(field.workModuleId&&ResumeFillPage.workProfileKey?.()!==(await ResumeMatcher.workProfile(resume)).key){hide();return;}
    const values=ResumeMatcher.flatten(resume),known=ResumeAnswers.match(field,resume,page())||ResumeMatcher.match(field,values)||ResumeMatcher.infer(field);
    const query=el.value.trim().toLowerCase(),candidates=ResumeMatcher.suggestions(field,values,query);
    if(known?.path&&values[known.path]&&!candidates.some(c=>c.path===known.path))candidates.unshift({path:known.path,reason:'已保存的本页答案',confirmed:true});
    panel.replaceChildren();const title=document.createElement('p');title.textContent='简历快填 · '+field.label;panel.append(title);
    for(const {path,reason,confirmed} of candidates.slice(0,6))button((confirmed?'':reason+' · ')+path+'：'+values[path],async()=>{
      if(!el.isConnected)throw Error('输入框已变化，请重新选择');if(field.workModuleId){const current=(await request('RF_ASSIST_DATA')).resume;if(ResumeFillPage.workProfileKey?.()!==(await ResumeMatcher.workProfile(current)).key)throw Error('资料已变化，请重新扫描');}
      if(ResumeMatcher.isFamilyField(field)&&ResumeMatcher.familyPath(ResumeFillPage.describe(el))!==path)throw Error('家庭成员关系已变化，请重新选择');const result=await ResumeFillPage.fill(el,values[path],ResumeMatcher.referenceData(path,values));if(result.status!=='verified')throw Error(result.error||'回读未通过');hide();
    });
    if(!candidates.length){const hint=document.createElement('small');hint.textContent=known?`已识别 ${known.path}，请在网页输入后保存。`:'暂无匹配；在网页输入答案后可保存为新资料。';panel.append(hint);}
    if(query&&(!known||!values[known.path])){
      const captured=el.value;
      button(known?'保存到 '+known.path:'创建新 JSON 项目并保存',async()=>{
        if(!el.isConnected||el.value!==captured)throw Error('输入内容已变化，请重新选择保存');
        if(ResumeMatcher.isFamilyField(field)&&ResumeMatcher.familyPath(ResumeFillPage.describe(el))!==known?.path)throw Error('家庭成员关系已变化，请重新选择');const saved=await request('RF_ASSIST_SAVE',{field,value:captured});resume=saved.resume;
        panel.replaceChildren();const done=document.createElement('p');done.textContent='已保存到本地简历 JSON，下次自动匹配。'+(saved.normalizationIssues?.length?' 地区/日期有待确认项，请在插件中整理。':'');panel.append(done);
      });
    }
    button('关闭建议',hide);host.style.display='block';position();
  }
  let timer;document.addEventListener('focusin',e=>{if(target(e)===host)return;clearTimeout(timer);show(target(e));},true);
  document.addEventListener('input',e=>{if(!eligible(target(e))||ResumeLayout.activeElement()!==target(e))return;clearTimeout(timer);timer=setTimeout(()=>show(target(e)),180);},true);
  document.addEventListener('pointerdown',e=>{if(target(e)!==host&&target(e)!==active)hide();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();},true);
  addEventListener('scroll',()=>{if(active)position();},true);addEventListener('resize',()=>{if(active)position();});
  // Opt-in local memory for manually committed family fields; never learn script fills.
  const edits=new WeakMap();let lastGesture=0;
  function memoNotice(message){const note=document.createElement('div');note.textContent=message;note.setAttribute('role','status');note.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;background:#fffefa;color:#283f3c;border:1px solid #a7b9ad;border-radius:12px;padding:12px;font:13px system-ui;max-width:340px';document.documentElement.append(note);setTimeout(()=>note.remove(),4000);}
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,e=>{if(e.isTrusted)lastGesture=Date.now();},true);
  document.addEventListener('focusin',e=>{const el=target(e);if(!eligible(el)&&el.tagName!=='SELECT'&&!(el instanceof HTMLInputElement&&['date','month','datetime-local'].includes(el.type)))return;const field=ResumeFillPage.describe(el);if(ResumeMatcher.isFamilyField(field))edits.set(el,{path:ResumeMatcher.familyPath(field),value:el.value,dirty:false});},true);
  async function remember(el){const edit=edits.get(el);if(!edit?.dirty||writing||ResumeFillPage.isBusy?.())return;const field=ResumeFillPage.describe(el),path=ResumeMatcher.familyPath(field),value=String(el.tagName==='SELECT'?(el.value?el.selectedOptions[0]?.textContent||'':''):el.value||'').trim();if(!path||edit.path&&edit.path!==path||value===edit.value||!value)return;edit.dirty=false;
    try{const result=await request('RF_FAMILY_LEARN',{field,value});if(result?.saved){edit.value=value;memoNotice('已记住家庭成员资料：'+ResumeMatcher.familyRoles[field.familyRole]?.[0]+' · '+field.label);} }
    catch(e){memoNotice('家庭资料未自动保存：'+e.message+'。可使用“重新扫描并学习”核对。');}
  }
  for(const type of ['input','change'])document.addEventListener(type,e=>{const edit=edits.get(target(e));if(!edit||ResumeFillPage.isBusy?.()||writing||!e.isTrusted&&Date.now()-lastGesture>1500)return;edit.dirty=true;if(type==='change')void remember(target(e));},true);
  document.addEventListener('focusout',e=>void remember(target(e)),true);
})();
