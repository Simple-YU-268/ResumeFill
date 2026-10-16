(() => {
  if(globalThis.__resumeFillV2)return;
  globalThis.__resumeFillV2=true;
  const C=ResumeControls,A=ResumeAdapters;
  let registry=new Map(),activeAdapter=null,revision=0,busy=false,scannedUrl='',operationController=null;
  let mutations=0;new MutationObserver(()=>mutations++).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  const ocrLabels=new WeakMap();const viewport=()=>({url:location.href,width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale||1,offsetX:visualViewport?.offsetLeft||0,offsetY:visualViewport?.offsetTop||0,mutations});
  function ocrContext(){return {viewport:viewport(),fields:Array.from(registry.values()).map(d=>({...d.field,position:(()=>{const r=d.el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()})).filter(f=>f.position.x>=0&&f.position.y>=0&&f.position.x+f.position.width<=innerWidth&&f.position.y+f.position.height<=innerHeight).map(f=>({id:f.id,stableId:f.stableId,label:f.label,ocrEligible:f.ocrEligible,position:f.position}))};}
  const stableIds=new WeakMap(),lastDescriptors=new WeakMap();let nextStableId=0;
  const eligible=el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true'&&ResumeLayout.visible(el)&&!['hidden','password','file','submit','button','reset','checkbox'].includes(el.type);
  const query=(scope,selector)=>selector?Array.from(scope.querySelectorAll(selector)):[];
  const shown=(scope,selector)=>query(scope,selector).filter(ResumeLayout.visible);
  const text=el=>{if(!el)return '';let raw;if(el.matches?.('label')){const copy=el.cloneNode(true);copy.querySelectorAll('input,select,textarea,[role="combobox"],button').forEach(n=>n.remove());raw=copy.textContent;}else raw=el.innerText||el.textContent||'';return raw.replace(/[*＊:：]|必填|选填/g,'').trim();};
  const kind=el=>el.isContentEditable?'contenteditable':el.tagName==='SELECT'?'select':el.type==='radio'||el.matches('[role="radiogroup"]')?'radio':el.matches('[role="combobox"],.el-select,.ant-select')?'combobox':['date','month','datetime-local'].includes(el.type)?'date':'input';
  function scopes(adapter){
    if(adapter){const out=[];for(const config of adapter.sections){const roots=shown(document,config.selector);if(roots.length!==1){out.push({config,key:config.key,error:'模块选择器未唯一命中'});continue;}const root=roots[0],cards=config.cardSelector?query(root,config.cardSelector):[root];cards.forEach((scope,index)=>out.push({config,key:config.key,root,scope,index:config.cardSelector?index:null}));if(!cards.length)out.push({config,key:config.key,root,error:'没有经历卡片，请先补齐经历'});}return out;}
    return [{scope:document,root:document,key:null,index:null,config:{}}];
  }
  function contextFor(el,s){
    if(s.key)return {section:s.key,recordIndex:s.index,context:s.config.title||s.key};
    const cardSelector='[data-resume-record],.experience-card,.project-card,.project-item,.education-card,.work-card,.experience-item';
    let group=null,context='',section=null;
    for(let node=el.parentElement;node&&node!==document.body;node=node.parentElement){
      const title=text(node.querySelector(':scope > legend,:scope > h2,:scope > h3,:scope > h4,:scope > header > h2'));
      if(node.matches(cardSelector)&&!node.hasAttribute('data-resume-section'))continue;
      const detected=node.getAttribute('data-resume-section')||(/教育|学历|education/i.test(title)?'education':/工作经历|实习经历|work experience|^(工作|实习|work|employment)$/i.test(title)?'work':/项目经历|项目经验|科研经历|project experience|projects/i.test(title)?'projects':null);
      if(detected){group=node;context=title;section=detected;break;}
    }
    let card=el.closest(cardSelector);
    let peers=card&&group?query(group,cardSelector).filter(n=>{for(let p=n.parentElement;p&&p!==group;p=p.parentElement)if(p.matches(cardSelector))return false;return true;}):[];
    if(!card&&group){const structural=Array.from(group.children).filter(n=>n.matches('section,fieldset')&&n.querySelector('input,textarea,select'));if(structural.length){const owner=structural.find(n=>n.contains(el));if(owner){card=owner;peers=structural;}}}
    return {section,recordIndex:card&&peers.includes(card)?peers.indexOf(card):null,context};
  }
  function descriptor(el,scope,config={}){
    const type=config.type||kind(el),radios=type==='radio'?(el.type==='radio'?query(el.form||scope,'input[type="radio"]').filter(r=>r.name===el.name&&r.name&&eligible(r)):shown(el,'input[type="radio"]')):null;
    return {el,scope,type,config,radios:radios?.length?radios:[el]};
  }
  function scan(data,counts={}){
    if(data){A.validate(data);activeAdapter=A.choose(data,location.href);}
    revision++;registry=new Map();scannedUrl=location.href;const fields=[],sectionIssues=[];
    const visibleText=ResumeLayout.collect(document);
    for(const s of scopes(activeAdapter)){
      if(s.error){sectionIssues.push({section:s.key,error:s.error});continue;}
      const candidates=shown(s.scope,'[role="radiogroup"],[role="combobox"],.el-select,.ant-select,input,textarea,select,[contenteditable="true"]');
      const used=new Set();
      const add=(el,config={})=>{
        const configuredControl=(['combobox','cascader','radio'].includes(config.type)||config.datePanel)&&!el.disabled&&ResumeLayout.visible(el);
        if(used.has(el)||!eligible(el)&&!configuredControl)return;
        const d=descriptor(el,s.scope,config);
        if(d.type==='radio'&&d.radios.some(r=>used.has(r)))return;
        used.add(el);if(d.type==='radio')d.radios.forEach(r=>used.add(r));
        for(const child of query(el,'input,select,textarea,[role="combobox"],[contenteditable="true"]'))used.add(child);
        const linked=(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>text(document.getElementById(id))).join(' ');
        const labels=Array.from(el.labels||[]).filter(ResumeLayout.visible).map(text);
        if(!labels.length&&el.closest('label')&&ResumeLayout.visible(el.closest('label')))labels.push(text(el.closest('label')));
        const container=el.closest(s.config.fieldContainerSelector||'.el-form-item,.ant-form-item,.form-item,.form-row');
        const containerLabels=container?shown(container,s.config.labelSelector||'label,.el-form-item__label,.ant-form-item-label,.field-label').map(text):[];
        const inferred=ResumeLayout.infer(el,visibleText,candidates);
        const structural=ResumeLayout.associate(el);
        const label=config.label||structural.groupLabel||labels[0]||linked||el.getAttribute('aria-label')||structural.label||containerLabels[0]||inferred.label||el.placeholder||el.name||el.id||'未命名字段';
        const tokens=[config.label,...labels,...containerLabels,inferred.label].filter(Boolean);
        const ctx=contextFor(el,s),id=`${revision}:f${registry.size}`;
        if(!stableIds.has(el))stableIds.set(el,'node-'+(++nextStableId));
        const rect=el.getBoundingClientRect();
        const path=config.path?A.recordPath(config.path,s.index??0):null;
        const field={id,label,tokens:tokens.length?tokens:[linked,el.getAttribute('aria-label'),el.placeholder,el.name,el.id,el.autocomplete].filter(Boolean),...ctx,type:d.type,path,value:C.read(d),required:!!el.required||el.getAttribute('aria-required')==='true',evidence:config.path?'站点配置':labels.length||containerLabels.length?'可见关联标签':inferred.evidence||'控件属性',options:el.tagName==='SELECT'?Array.from(el.options).map(o=>o.textContent):null};
        if(!field.context)field.context=structural.context||inferred.context||'';
        field.regionRole=structural.regionRole;field.regionLevel=structural.regionLevel;
        field.datePart=structural.datePart;field.datePath=structural.datePath;if(field.datePart)field.label='出生日期 · '+({year:'年',month:'月',day:'日'}[field.datePart]);
        if(structural.label&&!config.label&&!labels.length)field.evidence=structural.evidence;
        if(field.regionLevel)field.label=label+' · '+({province:'省',city:'市',county:'区县'}[field.regionLevel]);
        field.ocrEligible=!config.label&&!config.path&&!labels.length&&!linked&&!el.getAttribute('aria-label')&&!structural.label&&!containerLabels.length&&!inferred.label&&!field.datePart;
        const approved=ocrLabels.get(el);if(field.ocrEligible&&approved&&JSON.stringify(approved.viewport)===JSON.stringify(viewport())&&JSON.stringify(approved.position)===JSON.stringify({x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)})){field.label=approved.label;field.tokens=[approved.label];field.evidence='本地 OCR（已人工确认）';d.ocrGuard=()=>{const r=el.getBoundingClientRect();return JSON.stringify(approved.viewport)===JSON.stringify(viewport())&&JSON.stringify(approved.position)===JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});};}
        field.stableId=stableIds.get(el);field.position={x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)};
        const previous=lastDescriptors.get(el);if(previous&&previous.type===d.type&&['label','section','recordIndex','context','path','regionRole','regionLevel','datePart','datePath'].every(key=>previous.field[key]===field[key])){d.optionConfirmed=previous.optionConfirmed;d.selectedPath=previous.selectedPath;}
        const entry={...d,scanUrl:location.href,field,sectionScope:s};lastDescriptors.set(el,entry);registry.set(id,entry);fields.push(field);
      };
      for(const config of s.config.fields||[]){const elements=shown(s.scope,config.selector);if(elements.length!==1){sectionIssues.push({section:s.key,recordIndex:s.index,error:`字段选择器未唯一命中：${config.label||config.path}`});continue;}add(elements[0],config);}
      candidates.forEach(el=>{if(!el.parentElement?.closest('[role="combobox"],.el-select,.ant-select,[contenteditable="true"]'))add(el);});
    }
    const coverage=(activeAdapter?.sections||[]).filter(s=>s.cardSelector).map(s=>{const roots=shown(document,s.selector),present=roots.length===1?query(roots[0],s.cardSelector).length:0;return {section:s.key,expected:counts[s.key]??null,present,missing:Math.max(0,(counts[s.key]||0)-present)};});
    const groups=new Map();for(const field of fields){const key=JSON.stringify([field.label,field.context,field.section,field.recordIndex,field.type]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(field);}
    for(const group of groups.values())if(group.length>1)for(const field of group){field.ambiguousLabel=true;field.matchWarning='同组同名字段，需人工选择；不自动复用答案';}
    return {fields,sectionIssues,coverage,adapter:activeAdapter?.id||null,url:location.href,origin:location.origin,page:location.pathname,fingerprint:A.fingerprint(fields)};
  }
  async function clickAction(scope,selector){
    const nodes=shown(scope,selector).filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true');
    if(nodes.length!==1)throw Error('操作按钮未唯一命中');const button=nodes[0];
    if(button.type==='submit'||button.tagName==='A'&&button.hasAttribute('href')||/删除|移除|提交申请|立即投递|delete|remove|submit|apply now/i.test(text(button)))throw Error('操作不是明确的经历编辑按钮');
    button.click();
  }
  async function prepare(counts){
    if(!activeAdapter)throw Error('补齐经历需要先扫描并命中站点适配');
    const results=[];
    for(const config of activeAdapter.sections.filter(s=>s.key!=='basics'&&s.cardSelector)){
      try{
        const roots=shown(document,config.selector);if(roots.length!==1)throw Error('模块不唯一');const root=roots[0],expected=counts[config.key]||0;
        if(!Number.isInteger(expected)||expected<0||expected>30)throw Error('每组经历限 0–30 条');
        let cards=query(root,config.cardSelector);if(cards.length>expected)throw Error('页面经历多于简历，保留原内容，请手动检查');
        while(cards.length<expected){if(!config.addButton)throw Error('缺少新增按钮配置');const before=cards.length;await clickAction(root,config.addButton);await C.waitFor(()=>query(root,config.cardSelector).length===before+1,config.timeoutMs||2500);cards=query(root,config.cardSelector);}
        for(const card of cards){if(config.editButton&&shown(card,config.editButton).length){await clickAction(card,config.editButton);await C.waitFor(()=>shown(card,'input,textarea,select,[role="combobox"],[contenteditable="true"]').some(eligible),config.timeoutMs||2500);}}
        results.push({section:config.key,status:'prepared',count:cards.length});
      }catch(e){results.push({section:config.key,status:'blocked',error:e.message});}
    }
    return results;
  }
  async function fill(message){
    if(location.href!==scannedUrl)throw Error('页面地址已变化，请重新扫描');
    operationController=new AbortController();
    const results=[],touched=new Map();
    for(const item of message.items){const d=registry.get(item.id);if(!d){results.push({id:item.id,status:'stale',error:'扫描已失效'});continue;}
      d.signal=operationController.signal;if(d.signal.aborted){results.push({id:item.id,status:'failed',error:'操作已取消'});continue;}
      try{const r=item.verifyOnly?await C.verify(d,item.value):await C.fill(d,item.value,message.overwrite);results.push({id:item.id,...r});if(r.status==='filled'||r.status==='verified'){const key=d.sectionScope.scope;touched.set(key,d.sectionScope);}}catch(e){let candidates=[];try{candidates=C.candidates(d);}catch{}results.push({id:item.id,status:'failed',error:e.message,candidates});}
    }
    await new Promise(resolve=>setTimeout(resolve,350));
    for(const item of message.items){const result=results.find(r=>r.id===item.id),d=registry.get(item.id);if(result?.status==='filled')Object.assign(result,await C.verify(d,item.value));}
    const saves=[];
    if(message.saveCards&&!operationController.signal.aborted)for(const s of touched.values()){
      if(!s.config.saveButton)continue;
      const own=message.items.filter(i=>registry.get(i.id)?.sectionScope.scope===s.scope);
      const unresolved=Array.from(registry.values()).filter(d=>d.sectionScope.scope===s.scope&&d.field.required).some(d=>!own.some(i=>i.id===d.field.id));
      if(unresolved||own.some(i=>results.find(r=>r.id===i.id)?.status!=='verified')){saves.push({section:s.key,index:s.index,status:'blocked',error:'存在必填遗漏或回读未通过，未保存'});continue;}
      try{const before=s.config.savedSelector?shown(s.scope,s.config.savedSelector)[0]:null,beforeText=before?.textContent;await clickAction(s.scope,s.config.saveButton);if(!s.config.savedSelector)throw Error('已点击保存，但没有 savedSelector，无法确认保存状态');await C.waitFor(()=>{const markers=shown(s.scope.isConnected?s.scope:s.root,s.config.savedSelector);return markers.length===1&&(markers[0]!==before||markers[0].textContent!==beforeText);},s.config.timeoutMs||2500);saves.push({section:s.key,index:s.index,status:'save_indicator_observed'});}catch(e){saves.push({section:s.key,index:s.index,status:'unconfirmed',error:e.message});}
    }
    return {results,saves,submissionVerified:false};
  }
  globalThis.ResumeFillPage={
    describe(el){
      const existing=Array.from(registry.values()).find(d=>d.el===el);if(existing)return existing.field;
      const visibleText=ResumeLayout.collect(document),near=ResumeLayout.infer(el,visibleText,shown(document,'input,textarea,select'));
      const direct=Array.from(el.labels||[]).filter(ResumeLayout.visible).map(text)[0]||el.getAttribute('aria-label');
      const structure=ResumeLayout.associate(el),resolved=direct||structure.label||near.label||el.placeholder||el.name||'未命名字段';
      const adapterScope=scopes(activeAdapter).find(s=>!s.error&&s.scope?.contains(el))||{config:{}};
      return {label:resolved,tokens:[resolved],...contextFor(el,adapterScope),regionRole:structure.regionRole,regionLevel:structure.regionLevel,datePart:structure.datePart,datePath:structure.datePath,type:kind(el)};
    },
    async fill(el,value){if(busy)throw Error('正在填写，请稍后');busy=true;try{const d=descriptor(el,document);d.scanUrl=location.href;const result=await C.fill(d,value,true);if(result.status==='filled'){await new Promise(r=>setTimeout(r,350));return C.verify(d,value);}return result;}finally{busy=false;}}
  };
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message.type==='RF_CANCEL'){operationController?.abort();respond({cancelled:true});return;}
    if(!['RF_SCAN','RF_FILL','RF_VERIFY','RF_PREPARE','RF_OCR_CONTEXT','RF_OCR_APPLY','RF_OCR_HIGHLIGHT'].includes(message.type))return;
    if(busy){respond({error:'上一项操作尚未结束'});return;}
    busy=true;
    (async()=>{
      if(message.type==='RF_OCR_CONTEXT')return ocrContext();
      if(message.type==='RF_OCR_HIGHLIGHT'){if(JSON.stringify(message.context)!==JSON.stringify(ocrContext())||!registry.has(message.id))throw Error('页面已变化，请重新识别');registry.get(message.id).el.animate([{outline:'3px solid #0d8b68',outlineOffset:'3px'},{outline:'3px solid transparent',outlineOffset:'3px'}],{duration:1800});return {highlighted:true};}
      if(message.type==='RF_OCR_APPLY'){if(JSON.stringify(message.context)!==JSON.stringify(ocrContext()))throw Error('页面已变化，OCR 建议失效');if(!Array.isArray(message.items)||message.items.length>200)throw Error('OCR 建议无效');for(const item of message.items){const d=registry.get(item.id);if(!d?.field.ocrEligible||typeof item.label!=='string'||!item.label.trim()||item.label.length>40||/密码|验证码|password|captcha|\botp\b/i.test(item.label))throw Error('OCR 不能覆盖现有标签或保护字段');}for(const item of message.items){const d=registry.get(item.id);ocrLabels.set(d.el,{label:item.label,position:d.field.position,viewport:viewport()});}return {approved:message.items.length};}
      if(message.type==='RF_SCAN')return scan(message.adapters,message.counts);
      if(message.type==='RF_PREPARE')return prepare(message.counts||{});
      if(message.type==='RF_FILL')return fill(message);
      return Promise.all(message.items.map(async item=>({id:item.id,...(registry.has(item.id)?await C.verify(registry.get(item.id),item.value):{status:'stale'})})));
    })().then(respond,e=>respond({error:e.message})).finally(()=>busy=false);
    return true;
  });
})();
