(() => {
  if(globalThis.__resumeFillV2)return;
  globalThis.__resumeFillV2=true;
  globalThis.__resumeFillRuntime={version:chrome.runtime.getManifest?.().version||'development',protocol:1};
  const C=ResumeControls,A=ResumeAdapters;
  let registry=new Map(),activeAdapter=null,revision=0,busy=false,scannedUrl='',operationController=null,pendingOperation=null;
  let selectedScope=null,scopeChoices=new Map(),scopeChoiceUrl='',scopeGeneration=0;
  const recordSelector='[class*="apply-fields-"],[data-resume-record],.experience-card,.project-card,.project-item,.education-card,.work-card,.experience-item';
  function scopeList(){
    scopeChoices=new Map();scopeChoiceUrl=location.href;scopeGeneration++;
    const roots=new Set();for(const el of shown(document,'input,textarea,select,[role="combobox"]')){if(!eligible(el))continue;for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement)if(p.matches('section,fieldset,article,div,table,dl,form,main'))roots.add(p);}
    const result=[];for(const root of roots){if(result.length>=200)break;const controls=shown(root,'input,textarea,select,[role="combobox"]').filter(eligible);if(!controls.length)continue;const id=`scope-${scopeGeneration}-${result.length}`;scopeChoices.set(id,root);const heading=text(root.querySelector('legend,h2,h3,h4'))||root.getAttribute('aria-label')||text(root.querySelector('label,th,dt'))||root.tagName.toLowerCase();result.push({id,label:heading.slice(0,70),count:controls.length,tag:root.tagName.toLowerCase()});}return result;
  }
  function chooseScope(message){
    if(message.clear){selectedScope=null;registry.clear();return {cleared:true};}
    const root=scopeChoices.get(message.id);if(scopeChoiceUrl!==location.href||!root?.isConnected||!ResumeLayout.visible(root))throw Error('区块已失效，请重新列出区块');
    if(message.highlight){root.scrollIntoView({block:'center'});root.animate([{outline:'4px solid #0d8b68'},{outline:'4px solid transparent'}],{duration:2500});return {highlighted:true};}
    if(!['education','projects','work','basics'].includes(message.section)||!Number.isInteger(message.recordIndex)||message.recordIndex<0||message.recordIndex>29)throw Error('请选择资料类目和经历序号');
    selectedScope={root,key:message.section,index:message.section==='basics'?null:message.recordIndex,url:location.href};registry.clear();return {selected:true};
  }
  let mutations=0;new MutationObserver(()=>mutations++).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  const ocrLabels=new WeakMap();const viewport=()=>({url:location.href,width:innerWidth,height:innerHeight,scrollX,scrollY,scale:visualViewport?.scale||1,offsetX:visualViewport?.offsetLeft||0,offsetY:visualViewport?.offsetTop||0,mutations});
  function ocrContext(){return {viewport:viewport(),fields:Array.from(registry.values()).map(d=>({...d.field,position:(()=>{const r=d.el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()})).filter(f=>f.position.x>=0&&f.position.y>=0&&f.position.x+f.position.width<=innerWidth&&f.position.y+f.position.height<=innerHeight).map(f=>({id:f.id,stableId:f.stableId,label:f.label,ocrEligible:f.ocrEligible,position:f.position}))};}
  const stableIds=new WeakMap(),lastDescriptors=new WeakMap();let nextStableId=0;
  const eligible=el=>!el.disabled&&!(el.closest('.layui-form-select')?.previousElementSibling?.matches('select:disabled'))&&el.getAttribute('aria-disabled')!=='true'&&ResumeLayout.visible(el)&&!['hidden','password','file','submit','button','reset','checkbox'].includes(el.type);
  const query=(scope,selector)=>selector?Array.from(scope.querySelectorAll(selector)):[];
  const shown=(scope,selector)=>query(scope,selector).filter(ResumeLayout.visible);
  const text=el=>{if(!el)return '';let raw;if(el.matches?.('label')){const copy=el.cloneNode(true);copy.querySelectorAll('input,select,textarea,[role="combobox"],button').forEach(n=>n.remove());raw=copy.textContent;}else raw=el.innerText||el.textContent||'';return raw.replace(/[*＊:：]|必填|选填/g,'').trim();};
  const kind=el=>el.isContentEditable?'contenteditable':el.tagName==='SELECT'?'select':el.type==='radio'||el.matches('[role="radiogroup"]')?'radio':el.matches('[role="combobox"],.el-select,.ant-select,[class*="sd-Select-container-"]')?'combobox':['date','month','datetime-local'].includes(el.type)?'date':'input';
  const familyDialogSelector='[role="dialog"],dialog,.layui-layer,.modal,.ant-modal,.el-dialog';
  const familyTitlePattern=/^(?:(?:新增|添加|编辑|修改)\s*)?(?:家庭(?:主要)?成员(?:信息)?|亲属信息|(?:父亲|母亲|配偶|祖父|祖母|外祖父|外祖母)信息)(?:\s*[×✕x])?$/;
  function familyTitle(node){
    const headings=query(node,':scope > legend,:scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > .layui-layer-title,:scope > .modal-header,:scope > header,:scope > .title');
    if(node.matches(familyDialogSelector))headings.push(...query(node,'.layui-layer-title,.modal-title,.el-dialog__title,.ant-modal-title,h1,h2,h3,h4'));
    headings.push(...Array.from(node.children).filter(n=>!n.matches('label,input,textarea,select')&&!n.querySelector('input,textarea,select')));
    return headings.map(text).find(t=>t.length<80&&familyTitlePattern.test(t))||'';
  }
  function activeFamilyDialog(doc=document){const nodes=shown(doc,familyDialogSelector).filter(n=>familyTitle(n));if(!nodes.length)for(const heading of shown(doc,'h1,h2,h3,h4,legend,header,div').filter(n=>!n.querySelector('input,textarea,select')&&n.textContent.length<80&&familyTitlePattern.test(text(n))))for(let p=heading.parentElement;p&&p!==doc.body;p=p.parentElement){const style=p.ownerDocument.defaultView.getComputedStyle(p);if(['fixed','absolute'].includes(style.position)&&Number(style.zIndex)>0&&familyTitle(p)&&shown(p,'input,textarea,select').length>=3){nodes.push(p);break;}}const roots=[...new Set(nodes)].filter(n=>!nodes.some(p=>p!==n&&p.contains(n)));return roots.length===1?roots[0]:null;}
  function familyContextFor(el){
    let scope=null,title='';for(let node=el.parentElement;node&&node!==document.body;node=node.parentElement){const t=familyTitle(node);if(t){scope=node;title=t;break;}}
    // A same-origin iframe may have its title in the surrounding modal.
    if(!scope)try{const owner=window.frameElement?.closest(familyDialogSelector),t=owner&&familyTitle(owner);if(t){scope=document.documentElement;title=t;}}catch{}
    if(!scope)return null;
    const roles=new Set();const explicit=title.match(/^(父亲|母亲|配偶|外祖父|外祖母|祖父|祖母)信息/);if(explicit)roles.add(ResumeMatcher.familyRole(explicit[1]));
    for(const control of shown(scope,'input,select,[role="combobox"]')){
      const label=text(control.labels?.[0])||control.getAttribute('aria-label')||ResumeLayout.associate(control).label||control.placeholder||'';
      if(!/与本人关系|与申请人关系|与应聘者关系|亲属关系|家庭关系|^称谓$/.test(label))continue;
      const value=C.read(descriptor(control,scope));if(value&& !/^请|选择/.test(value)){const role=ResumeMatcher.familyRole(value);roles.add(role||'unsupported');}
    }
    const role=roles.size===1?[...roles][0]:null,known=role&&role!=='unsupported';
    return {section:'family',recordIndex:null,context:title,familyRole:known?role:null,familyAmbiguous:roles.size>1,matchWarning:known?'家庭成员 · '+ResumeMatcher.familyRoles[role][0]:'请先选择与本人关系；多位同关系成员不自动归属'};
  }
  function scopes(adapter){
    try{for(let view=window;view!==view.top;view=view.parent){const frame=view.frameElement;if(!frame)break;const modal=activeFamilyDialog(frame.ownerDocument);if(modal&&!modal.contains(frame))return [];}}catch{}
    const family=activeFamilyDialog();if(family){if(selectedScope&&!selectedScope.root.contains(family))throw Error('家庭成员弹窗与已选区块不同，请清除范围后重扫');return [{root:family,scope:family,key:'family',index:null,config:{}}];}
    if(selectedScope){const {root,key,index,url}=selectedScope;if(!root.isConnected||url!==location.href||!ResumeLayout.visible(root))throw Error('已选区块失效，请重新选择或清除范围');
      let cards=shown(root,recordSelector).filter(n=>!n.parentElement.closest(recordSelector)||!root.contains(n.parentElement.closest(recordSelector)));
      if(!cards.length)cards=Array.from(root.children).filter(n=>n.matches('section,fieldset')&&n.querySelector('input,textarea,select'));
      if(cards.length>1){const outside=shown(root,'input,textarea,select,[role="combobox"]').filter(eligible).some(el=>!cards.some(c=>c.contains(el)));if(outside)throw Error('区块含经历卡片外字段，请选择更小的容器');return cards.map((scope,i)=>({root,scope,key,index:index===null?null:index+i,config:{}}));}
      return [{root,scope:root,key,index,config:{}}];}
    if(adapter){const out=[];for(const config of adapter.sections){const roots=shown(document,config.selector);if(roots.length!==1){out.push({config,key:config.key,error:'模块选择器未唯一命中'});continue;}const root=roots[0],cards=config.cardSelector?query(root,config.cardSelector):[root];cards.forEach((scope,index)=>out.push({config,key:config.key,root,scope,index:config.cardSelector?index:null}));if(!cards.length)out.push({config,key:config.key,root,error:'没有经历卡片，请先补齐经历'});}return out;}
    return [{scope:document,root:document,key:null,index:null,config:{}}];
  }
  function contextFor(el,s){
    const moka=mokaContextFor(el);if(moka?.section==='family')return moka;if(selectedScope&&s.key)return {section:s.key,recordIndex:s.index,context:s.config.title||s.key};if(moka)return moka;
    const family=familyContextFor(el);if(family)return family;
    if(s.key)return {section:s.key,recordIndex:s.index,context:s.config.title||s.key};
    const cardSelector='[data-resume-record],.experience-card,.project-card,.project-item,.education-card,.work-card,.experience-item';
    let group=null,context='',section=null;
    for(let node=el.parentElement;node&&node!==document.body;node=node.parentElement){
      const title=moduleTitle(node);
      if(node.matches(cardSelector)&&!node.hasAttribute('data-resume-section'))continue;
      const detected=node.getAttribute('data-resume-section')||(/基本信息/.test(title)?'basics':/外语水平|语言能力/.test(title)?'languages':/IT技能|专业技能/.test(title)?'skills':/在校荣誉|获奖经历/.test(title)?'awards':/学生实践经验|社会实践/.test(title)?'activities':/教育|学历|education/i.test(title)?'education':/工作经历|实习经历|work experience|^(工作|实习|work|employment)$/i.test(title)?'work':/项目经历|项目经验|科研经历|project experience|projects/i.test(title)?'projects':null);
      if(title==='其他')return {section:null,recordIndex:null,context:title};
      if(/校内活动|校园经历|社团经历|学生工作|家庭主要成员|家庭成员|亲属信息/.test(title))return {section:null,recordIndex:null,context:title,contextBlocked:true};
      if(detected){group=node;context=title;section=detected;break;}
    }
    let card=el.closest(cardSelector);
    let peers=card&&group?query(group,cardSelector).filter(n=>{for(let p=n.parentElement;p&&p!==group;p=p.parentElement)if(p.matches(cardSelector))return false;return true;}):[];
    if(!card&&group){const structural=Array.from(group.children).filter(n=>n.matches('section,fieldset')&&n.querySelector('input,textarea,select'));if(structural.length){const owner=structural.find(n=>n.contains(el));if(owner){card=owner;peers=structural;}}}
    if(!card&&group){
      // Repeated plain DIV cards: require multiple controls and identical field structure,
      // so individual form rows and two date inputs cannot become separate records.
      for(let node=el.parentElement;node&&node!==group;node=node.parentElement){
        const signature=n=>{const inputs=shown(n,'input,textarea,select').filter(eligible),labels=inputs.map(c=>text(c.labels?.[0])||ResumeLayout.associate(c).label);const distinct=new Set(labels.filter(Boolean));return inputs.length>=3||inputs.length===2&&distinct.size===2?inputs.map((c,i)=>c.tagName+':'+(c.type||'')+':'+labels[i]).join('|'):'';};
        const sig=signature(node);if(!sig)continue;
        const siblings=Array.from(node.parentElement.children).filter(n=>signature(n)===sig);
        if(siblings.length>1){card=node;peers=siblings;}
      }
    }
    const highest=section==='education'&&/最高学历|最高教育/.test(context);
    const single=['languages','skills','awards','activities'].includes(section)&&!card;
    return {section,recordIndex:highest||single||section==='basics'?null:card&&peers.includes(card)?peers.indexOf(card):group?0:null,context,...highest?{recordPolicy:'highestEducation'}:single?{recordPolicy:'uniqueRecord'}:{}};
  }
  function mokaTitle(el){return text(el.closest('[class*="apply-field-"]')?.querySelector(':scope > [class*="title-"]'));}
  function mokaContextFor(el){
    const block=el.closest('[class*="apply-block-"]'),record=el.closest('[class*="apply-fields-"]');if(!block||!record)return null;
    const head=block.querySelector(':scope > [class*="blockTitle-"] > div');if(!head)return null;const copy=head.cloneNode(true);copy.querySelectorAll('button').forEach(n=>n.remove());const title=text(copy).replace(/添加$/,'').trim(),peers=Array.from(block.children).filter(n=>n.matches('[class*="apply-fields-"]')&&ResumeLayout.visible(n)),index=peers.indexOf(record);
    if(/家庭成员|社会关系/.test(title)){const roles=new Set();for(const input of shown(record,'[class*="sd-Select-container-"]'))if(/^(称谓|与本人关系|亲属关系)$/.test(mokaTitle(input))){const value=C.read(descriptor(input,record));if(value)roles.add(ResumeMatcher.familyRole(value)||'unsupported');}
      return {section:'family',recordIndex:null,context:title,familyRole:roles.size===1&&Object.hasOwn(ResumeMatcher.familyRoles,[...roles][0])?[...roles][0]:null,familyAmbiguous:roles.size>1,matchWarning:'先选择当前家庭成员的称谓，再重新扫描'};
    }
    const section=/^(个人信息|基本信息)$/.test(title)?'basics':/^教育背景|^教育经历/.test(title)?'education':/^实习经历|^工作经历/.test(title)?'work':/^项目经历/.test(title)?'projects':null;
    return section?{section,recordIndex:section==='basics'?null:index>=0?index:null,context:title}: {section:null,recordIndex:null,context:title,contextBlocked:true};
  }
  function moduleTitle(node){
    const heading=node.querySelector(':scope > legend,:scope > h2,:scope > h3,:scope > h4,:scope > header > h2');
    if(heading)return text(heading);
    // A module title precedes its controls; a field label must never act as a heading.
    for(const child of node.children){
      if(child.matches('input,textarea,select')||child.querySelector('input,textarea,select'))break;
      if(child.matches('label,button')||!ResumeLayout.visible(child))continue;
      const title=text(child).replace(/内容缺失.*$|编辑$|添加$/g,'').trim();
      if(/^(基本信息|外语水平|语言能力|IT技能|专业技能|在校荣誉|获奖经历|学生实践经验|社会实践|其他|最高学历|最高教育经历|教育经历|教育背景|工作经历|实习经历|项目经历|项目经验|科研经历|家庭主要成员|家庭成员|亲属信息|校内活动|校园经历|社团经历|学生工作)(?:\s|$)/.test(title)&&title.length<80)return title;
    }
    return '';
  }
  function dateRangeLabel(el){
    for(let node=el.parentElement,depth=0;node&&depth<4;node=node.parentElement,depth++){
      const inputs=shown(node,'input,textarea,select').filter(eligible);
      if(inputs.length>2)break;
      if(inputs.length!==2||!inputs.every(e=>e.tagName==='INPUT'))continue;
      const labels=shown(node,'label,.field-label,.el-form-item__label,.ant-form-item-label').map(text);
      const raw=labels.join(' ')||Array.from(node.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ');
      if(!/在职时间|起止时间|时间段|实习时间|项目时间|就读时间/.test(raw))continue;
      return inputs.indexOf(el)===0?'开始日期':'结束日期';
    }
    return '';
  }
  function descriptor(el,scope,config={}){
    if(el.matches('[class*="sd-Select-container-"]'))config={...config,type:'combobox',mokaSelect:true};
    if(el.closest('.jbs_three_layers_input_wrapper'))config={...config,referencePicker:true};
    if(el.closest('.layui-form-select'))config={...config,type:'combobox',layuiSelect:true};
    const type=config.type||kind(el),radios=type==='radio'?(el.type==='radio'?query(scope,'input[type="radio"]').filter(r=>r.name===el.name&&r.name&&eligible(r)):shown(el,'input[type="radio"]')):null;
    return {el,scope,type,config,layuiNative:config.layuiSelect?el.closest('.layui-form-select')?.previousElementSibling:null,radios:radios?.length?radios:[el]};
  }
  function scan(data,counts={}){
    if(data){A.validate(data);activeAdapter=A.choose(data,location.href);}
    revision++;registry=new Map();scannedUrl=location.href;const fields=[],sectionIssues=[];
    const visibleText=ResumeLayout.collect(document).filter(n=>!selectedScope||selectedScope.root.contains(n.parent));
    for(const s of scopes(activeAdapter)){
      if(s.error){sectionIssues.push({section:s.key,error:s.error});continue;}
      const candidates=shown(s.scope,'[role="radiogroup"],[role="combobox"],.el-select,.ant-select,[class*="sd-Select-container-"],input,textarea,select,[contenteditable="true"]');
      const used=new Set();
      const add=(el,config={})=>{
        const configuredControl=(['combobox','cascader','radio'].includes(config.type)||config.datePanel)&&!el.disabled&&ResumeLayout.visible(el);
        if(used.has(el)||!eligible(el)&&!configuredControl)return;
        const d=descriptor(el,s.scope,config);
        if(selectedScope)d.scopeGuard=()=>selectedScope?.root.isConnected&&selectedScope.url===location.href&&selectedScope.root.contains(el)&&s.scope.contains(el);
        if(d.type==='radio'&&d.radios.some(r=>used.has(r)))return;
        used.add(el);if(d.type==='radio')d.radios.forEach(r=>used.add(r));
        for(const child of query(el,'input,select,textarea,[role="combobox"],[contenteditable="true"]'))used.add(child);
        const linked=(el.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>text(document.getElementById(id))).join(' ');
        const labels=Array.from(el.labels||[]).filter(ResumeLayout.visible).map(text);
        if(!labels.length&&el.closest('label')&&ResumeLayout.visible(el.closest('label')))labels.push(text(el.closest('label')));
        const container=el.closest(s.config.fieldContainerSelector||'.el-form-item,.ant-form-item,.form-item,.form-row,[class*="apply-field-"]');
        const containerLabels=container?shown(container,s.config.labelSelector||'label,.el-form-item__label,.ant-form-item-label,.field-label').map(text):[];
        const inferred=ResumeLayout.infer(el,visibleText,candidates);
        const structural=ResumeLayout.associate(el);
        const mokaLabel=mokaTitle(el),effectiveMokaLabel=d.config.mokaSelect&&mokaLabel==='证件号码'?'证件类型':d.config.mokaSelect&&mokaLabel==='手机号码'?'电话区号':mokaLabel;
        const label=config.label||effectiveMokaLabel||structural.groupLabel||labels[0]||linked||el.getAttribute('aria-label')||structural.label||containerLabels[0]||inferred.label||el.placeholder||el.name||el.id||'未命名字段';
        const tokens=effectiveMokaLabel?[effectiveMokaLabel]:[config.label,...labels,...containerLabels,inferred.label].filter(Boolean);
        const ctx=contextFor(el,s),id=`${revision}:f${registry.size}`;
        if(!stableIds.has(el))stableIds.set(el,'node-'+(++nextStableId));
        const rect=el.getBoundingClientRect();
        const path=config.path?A.recordPath(config.path,s.index??0):null;
        const field={id,label,tokens:tokens.length?tokens:[linked,el.getAttribute('aria-label'),el.placeholder,el.name,el.id,el.autocomplete].filter(Boolean),...ctx,type:d.type,path,value:C.read(d),required:!!el.required||el.getAttribute('aria-required')==='true'||!!container?.classList.contains('is-required')||!!container?.querySelector(':scope > [class*="title-"] [class*="required-asterisk-"]'),evidence:config.path?'站点配置':labels.length||containerLabels.length?'可见关联标签':inferred.evidence||'控件属性',options:el.tagName==='SELECT'?Array.from(el.options).map(o=>o.textContent):null};
        if(field.section==='family'){const originalGuard=d.scopeGuard;d.scopeGuard=()=>{const current=mokaContextFor(el)||familyContextFor(el);return (!originalGuard||originalGuard())&&!!current&&current.familyRole===field.familyRole&&!current.familyAmbiguous;};}
        if(/^(?:最高学历(?:毕业院校|所学专业|毕业时间|学习形式)?|最高学位)$/.test(label)){field.section='education';field.recordIndex=null;field.context='最高学历';field.recordPolicy='highestEducation';}
        if(mokaLabel&&!d.config.mokaSelect&&el.readOnly)field.matchWarning=/出生日期/.test(mokaLabel)?'此日历需手动选择日期，本版不直接改写只读输入框':/籍贯/.test(mokaLabel)?'此多级地区需手动选择完整路径，本版不直接改写只读输入框':field.matchWarning;
        if(d.config.referencePicker)field.matchWarning='自动遍历完整路径并核对真实选中项；歧义时停止';
        if(!field.context)field.context=structural.context||inferred.context||'';
        const rangeLabel=dateRangeLabel(el);if(rangeLabel&&!config.path&&!config.label){field.label=rangeLabel;field.tokens=[rangeLabel];field.evidence='同一时间段的起止控件';}
        field.regionRole=structural.regionRole;field.regionLevel=structural.regionLevel;
        field.datePart=structural.datePart;field.datePath=structural.datePath;if(field.datePart)field.label='出生日期 · '+({year:'年',month:'月',day:'日'}[field.datePart]);
        if(mokaLabel&&d.config.mokaSelect){const fieldRoot=el.closest('[class*="apply-field-"]'),parts=shown(fieldRoot,'[class*="sd-Select-container-"]'),i=parts.indexOf(el);if(/^(就读时间|起止时间)$/.test(mokaLabel)&&['education','work','projects'].includes(field.section)&&[2,4].includes(parts.length)&&Number.isInteger(field.recordIndex)){field.datePart=i%2?'month':'year';field.datePath=field.section+'.'+field.recordIndex+'.'+(i<2?'startDate':'endDate');field.label=(i<2?'开始日期':'结束日期')+' · '+(i%2?'月':'年');}else if(field.section==='family'&&/^出生年月$/.test(mokaLabel)&&parts.length===2){field.datePart=i?'month':'year';field.datePath=null;field.label='出生年月';}}
        if(field.section==='family')field.path=ResumeMatcher.familyPath(field);
        if(structural.label&&!config.label&&!labels.length)field.evidence=structural.evidence;
        if(field.regionLevel)field.label=label+' · '+({province:'省',city:'市',county:'区县'}[field.regionLevel]);
        field.ocrEligible=!config.label&&!config.path&&!labels.length&&!linked&&!el.getAttribute('aria-label')&&!structural.label&&!containerLabels.length&&!inferred.label&&!field.datePart;
        const approved=ocrLabels.get(el);if(field.ocrEligible&&approved&&JSON.stringify(approved.viewport)===JSON.stringify(viewport())&&JSON.stringify(approved.position)===JSON.stringify({x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)})){field.label=approved.label;field.tokens=[approved.label];field.evidence='本地 OCR（已人工确认）';d.ocrGuard=()=>{const r=el.getBoundingClientRect();return JSON.stringify(approved.viewport)===JSON.stringify(viewport())&&JSON.stringify(approved.position)===JSON.stringify({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});};}
        field.stableId=stableIds.get(el);field.position={x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)};
        const previous=lastDescriptors.get(el);if(previous&&previous.type===d.type&&['label','section','recordIndex','context','path','regionRole','regionLevel','datePart','datePath'].every(key=>previous.field[key]===field[key])){d.optionConfirmed=previous.optionConfirmed;d.selectedPath=previous.selectedPath;d.numericSelection=previous.numericSelection;d.sourcePath=previous.sourcePath;}
        const entry={...d,scanUrl:location.href,field,sectionScope:s};
        if(d.config.layuiSelect)entry.scopeGuard=()=>{if(selectedScope&&(!selectedScope.root.isConnected||selectedScope.url!==location.href||!selectedScope.root.contains(entry.el)||!s.scope.contains(entry.el)))return false;if(field.section==='family'){const current=familyContextFor(entry.el);return !!current&&current.familyRole===field.familyRole&&!current.familyAmbiguous;}return true;};
        lastDescriptors.set(el,entry);registry.set(id,entry);fields.push(field);
      };
      for(const config of s.config.fields||[]){const elements=shown(s.scope,config.selector);if(elements.length!==1){sectionIssues.push({section:s.key,recordIndex:s.index,error:`字段选择器未唯一命中：${config.label||config.path}`});continue;}add(elements[0],config);}
      candidates.forEach(el=>{if(!el.parentElement?.closest('[role="combobox"],.el-select,.ant-select,[class*="sd-Select-container-"],[contenteditable="true"]'))add(el);});
    }
    const coverage=(selectedScope?[]:activeAdapter?.sections||[]).filter(s=>s.cardSelector).map(s=>{const roots=shown(document,s.selector),present=roots.length===1?query(roots[0],s.cardSelector).length:0;return {section:s.key,expected:counts[s.key]??null,present,missing:Math.max(0,(counts[s.key]||0)-present)};});
    const groups=new Map();for(const field of fields){const key=JSON.stringify([field.label,field.context,field.section,field.recordIndex,field.type,field.datePath,field.datePart,field.familyRole]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(field);}
    for(const group of groups.values())if(group.length>1)for(const field of group){field.ambiguousLabel=true;field.matchWarning='同组同名字段，需人工选择；不自动复用答案';}
    return {fields,sectionIssues,coverage,selectedScope:selectedScope?{section:selectedScope.key,recordIndex:selectedScope.index}:null,adapter:selectedScope?null:activeAdapter?.id||null,url:location.href,origin:location.origin,page:location.pathname,fingerprint:A.fingerprint(fields)};
  }
  async function clickAction(scope,selector){
    const nodes=shown(scope,selector).filter(el=>!el.disabled&&el.getAttribute('aria-disabled')!=='true');
    if(nodes.length!==1)throw Error('操作按钮未唯一命中');const button=nodes[0];
    if(button.type==='submit'||button.tagName==='A'&&button.hasAttribute('href')||/删除|移除|提交申请|立即投递|delete|remove|submit|apply now/i.test(text(button)))throw Error('操作不是明确的经历编辑按钮');
    button.click();
  }
  async function prepare(counts){
    if(selectedScope)throw Error('区块模式不自动新增或保存经历，请先清除范围');
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
      if((selectedScope||ResumeMatcher.isFamilyField(d.field))&&(!item.path||!ResumeMatcher.allowedPath(d.field,item.path))){results.push({id:item.id,status:'failed',error:'资料路径不属于当前成员或所选经历'});continue;}
      d.referenceData=item.referenceData||null;d.sourcePath=item.path;d.manualOption=item.manualOption===true;d.signal=operationController.signal;if(d.signal.aborted){results.push({id:item.id,status:'failed',error:'操作已取消'});continue;}
      try{const r=item.verifyOnly?await C.verify(d,item.value):await C.fill(d,item.value,message.overwrite);results.push({id:item.id,...r});if(r.status==='filled'||r.status==='verified'){const key=d.sectionScope.scope;touched.set(key,d.sectionScope);}}catch(e){let candidates=[];try{candidates=C.candidates(d);}catch{}results.push({id:item.id,status:'failed',error:e.message,candidates,...e.diagnostic?{diagnostic:e.diagnostic}:{}});}
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
    isBusy:()=>busy,
    describe(el){
      el=el.closest('[class*="sd-Select-container-"]')||el;
      if(selectedScope)return {label:'区块模式请使用插件预览',ambiguousLabel:true,scopeExcluded:true};
      const existing=Array.from(registry.values()).find(d=>d.el===el);if(existing){if(existing.field.section!=='family')return existing.field;const current={...existing.field,...(mokaContextFor(el)||familyContextFor(el)||{familyRole:null,familyAmbiguous:true}),path:null};current.path=ResumeMatcher.familyPath(current);return current;}
      const visibleText=ResumeLayout.collect(document),near=ResumeLayout.infer(el,visibleText,shown(document,'input,textarea,select'));
      const direct=Array.from(el.labels||[]).filter(ResumeLayout.visible).map(text)[0]||el.getAttribute('aria-label');
      const structure=ResumeLayout.associate(el),resolved=mokaTitle(el)||dateRangeLabel(el)||direct||structure.label||near.label||el.placeholder||el.name||'未命名字段';
      const adapterScope=scopes(activeAdapter).find(s=>!s.error&&s.scope?.contains(el))||{config:{}};
      return {label:resolved,tokens:[resolved],...contextFor(el,adapterScope),regionRole:structure.regionRole,regionLevel:structure.regionLevel,datePart:structure.datePart,datePath:structure.datePath,type:kind(el)};
    },
    async fill(el,value,referenceData){el=el.closest('[class*="sd-Select-container-"]')||el;if(selectedScope)throw Error('区块模式请在插件预览中核对路径后填写');if(busy)throw Error('正在填写，请稍后');busy=true;try{const d=descriptor(el,document);d.scanUrl=location.href;d.field=this.describe(el);d.referenceData=referenceData;if(ResumeMatcher.isFamilyField(d.field)){if(!ResumeMatcher.familyPath(d.field))throw Error('请先确定家庭成员关系');const role=d.field.familyRole;d.scopeGuard=()=>(mokaContextFor(el)||familyContextFor(el))?.familyRole===role;}const result=await C.fill(d,value,true);if(result.status==='filled'){await new Promise(r=>setTimeout(r,350));return C.verify(d,value);}return result;}finally{busy=false;}}
  };
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message.type==='RF_CANCEL'){operationController?.abort();Promise.resolve(pendingOperation).catch(()=>{}).then(()=>respond({cancelled:true}));return true;}
    if(!['RF_SCOPE_LIST','RF_SCOPE_SET','RF_SCAN','RF_LEARN_READ','RF_FILL','RF_VERIFY','RF_PREPARE','RF_OCR_CONTEXT','RF_OCR_APPLY','RF_OCR_HIGHLIGHT'].includes(message.type))return;
    if(busy){respond({error:'上一项操作尚未结束'});return;}
    busy=true;
    pendingOperation=(async()=>{
      if(message.type==='RF_SCOPE_LIST')return {scopes:scopeList()};
      if(message.type==='RF_SCOPE_SET')return chooseScope(message);
      if(message.type==='RF_OCR_CONTEXT')return ocrContext();
      if(message.type==='RF_OCR_HIGHLIGHT'){if(JSON.stringify(message.context)!==JSON.stringify(ocrContext())||!registry.has(message.id))throw Error('页面已变化，请重新识别');registry.get(message.id).el.animate([{outline:'3px solid #0d8b68',outlineOffset:'3px'},{outline:'3px solid transparent',outlineOffset:'3px'}],{duration:1800});return {highlighted:true};}
      if(message.type==='RF_OCR_APPLY'){if(JSON.stringify(message.context)!==JSON.stringify(ocrContext()))throw Error('页面已变化，OCR 建议失效');if(!Array.isArray(message.items)||message.items.length>200)throw Error('OCR 建议无效');for(const item of message.items){const d=registry.get(item.id);if(!d?.field.ocrEligible||typeof item.label!=='string'||!item.label.trim()||item.label.length>40||/密码|验证码|password|captcha|\botp\b/i.test(item.label))throw Error('OCR 不能覆盖现有标签或保护字段');}for(const item of message.items){const d=registry.get(item.id);ocrLabels.set(d.el,{label:item.label,position:d.field.position,viewport:viewport()});}return {approved:message.items.length};}
      if(message.type==='RF_SCAN')return scan(message.adapters,message.counts);
      if(message.type==='RF_LEARN_READ'){
        if(location.href!==scannedUrl)throw Error('页面已变化，请重新扫描并学习');
        return Array.from(registry.values()).filter(d=>d.el.isConnected&&ResumeLayout.visible(d.el)&&!d.el.disabled&&!ResumeAnswers.protectedField(d.field)&&(!d.scopeGuard||d.scopeGuard())).map(d=>({id:d.field.id,value:C.read(d)}));
      }
      if(message.type==='RF_PREPARE')return prepare(message.counts||{});
      if(message.type==='RF_FILL')return fill(message);
      const checked=[];for(const item of message.items){const d=registry.get(item.id);if(d){d.referenceData=item.referenceData||d.referenceData;d.sourcePath=item.path||d.sourcePath;}checked.push({id:item.id,...(d?await C.verify(d,item.value):{status:'stale'})});}return checked;
    })().finally(()=>busy=false);
    pendingOperation.then(respond,e=>respond({error:e.message}));
    return true;
  });
})();
