(() => {
  if(globalThis.__resumeInline)return;globalThis.__resumeInline=true;
  let resume=null,active=null,version=0,writing=false;
  const host=document.createElement('div');host.setAttribute('data-resumefill-assistant','');
  host.style.cssText='all:initial;position:fixed;z-index:2147483647;display:none;';
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent=':host{font:14px system-ui;color:#283f3c}section{box-sizing:border-box;width:340px;max-width:95vw;max-height:280px;overflow:auto;background:white;border:1px solid #a7b9ad;border-radius:16px;box-shadow:0 4px 20px #0003;padding:10px}button{display:block;width:100%;text-align:left;background:#edf2e9;border:0;border-radius:10px;padding:8px;margin:5px 0;cursor:pointer;color:#173b38;font:inherit}small{display:block;color:#55736d;white-space:pre-wrap}p{margin:5px 0}';
  const panel=document.createElement('section');panel.setAttribute('role','region');panel.setAttribute('aria-label','简历快填匹配建议');shadow.append(style,panel);document.documentElement.append(host);
  async function request(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;}
  function eligible(el){return el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement&&['text','email','tel','search','url','number'].includes(el.type);}
  function hide(){version++;host.style.display='none';active=null;}
  function page(){return {origin:location.origin,page:location.pathname,url:location.href};}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onpointerdown=e=>e.preventDefault();b.onclick=async()=>{if(writing)return;const before=document.activeElement;writing=true;try{await fn();}catch(e){panel.replaceChildren();const p=document.createElement('p');p.textContent=e.message;panel.append(p);}finally{writing=false;const focused=document.activeElement;if(focused!==before&&eligible(focused))show(focused);}};panel.append(b);}
  function position(){if(!active?.isConnected){hide();return;}const r=active.getBoundingClientRect();host.style.left=Math.max(4,Math.min(r.left,innerWidth-350))+'px';host.style.top=Math.max(4,Math.min(r.bottom+4,innerHeight-290))+'px';}
  async function show(el){
    if(writing)return;
    if(!eligible(el)||!ResumeLayout.visible(el)||el.disabled||el.readOnly){hide();return;}
    const field=ResumeFillPage.describe(el);if(field.scopeExcluded||ResumeAnswers.protectedField(field)){hide();return;}
    active=el;const rev=++version;
    try{resume=(await request('RF_ASSIST_DATA')).resume;}catch{hide();return;}
    if(rev!==version||active!==el)return;
    const values=ResumeMatcher.flatten(resume),known=ResumeAnswers.match(field,resume,page())||ResumeMatcher.match(field,values)||ResumeMatcher.infer(field);
    const query=el.value.trim().toLowerCase(),candidates=ResumeMatcher.suggestions(field,values,query);
    if(known?.path&&values[known.path]&&!candidates.some(c=>c.path===known.path))candidates.unshift({path:known.path,reason:'已保存的本页答案',confirmed:true});
    panel.replaceChildren();const title=document.createElement('p');title.textContent='简历快填 · '+field.label;panel.append(title);
    for(const {path,reason,confirmed} of candidates.slice(0,6))button((confirmed?'':reason+' · ')+path+'：'+values[path],async()=>{
      if(!el.isConnected)throw Error('输入框已变化，请重新选择');
      const result=await ResumeFillPage.fill(el,values[path],ResumeMatcher.referenceData(path,values));if(result.status!=='verified')throw Error(result.error||'回读未通过');hide();
    });
    if(!candidates.length){const hint=document.createElement('small');hint.textContent=known?`已识别 ${known.path}，请在网页输入后保存。`:'暂无匹配；在网页输入答案后可保存为新资料。';panel.append(hint);}
    if(query&&(!known||!values[known.path])){
      const captured=el.value;
      button(known?'保存到 '+known.path:'创建新 JSON 项目并保存',async()=>{
        if(!el.isConnected||el.value!==captured)throw Error('输入内容已变化，请重新选择保存');
        const saved=await request('RF_ASSIST_SAVE',{field,value:captured});resume=saved.resume;
        panel.replaceChildren();const done=document.createElement('p');done.textContent='已保存到本地简历 JSON，下次自动匹配。'+(saved.normalizationIssues?.length?' 地区/日期有待确认项，请在插件中整理。':'');panel.append(done);
      });
    }
    button('关闭建议',hide);host.style.display='block';position();
  }
  let timer;document.addEventListener('focusin',e=>{if(e.target===host)return;clearTimeout(timer);show(e.target);},true);
  document.addEventListener('input',e=>{if(!eligible(e.target)||document.activeElement!==e.target)return;clearTimeout(timer);timer=setTimeout(()=>show(e.target),180);},true);
  document.addEventListener('pointerdown',e=>{if(e.target!==host&&e.target!==active)hide();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();},true);
  addEventListener('scroll',()=>{if(active)position();},true);addEventListener('resize',()=>{if(active)position();});
})();
