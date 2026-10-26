(function(root){
  function roots(scope){const out=[scope];for(const el of scope.querySelectorAll('*'))if(el.shadowRoot&&!el.matches('[data-resumefill-assistant]'))out.push(...roots(el.shadowRoot));return out;}
  function query(scope,selector){return roots(scope).flatMap(r=>Array.from(r.querySelectorAll(selector)));}
  function contains(scope,el){for(let n=el;n;n=n.getRootNode()?.host)if(scope===n||scope.contains(n))return true;return false;}
  function activeElement(doc=document){let el=doc.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;return el;}
  function visible(el){
    if(!el.getClientRects().length || el.closest?.('[hidden],[inert],[aria-hidden="true"]')) return false;
    for(let node=el;node;node=node.parentElement||node.getRootNode()?.host){const s=getComputedStyle(node);if(node.matches?.('[hidden],[inert],[aria-hidden="true"]')||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return false;}return true;
  }
  function distance(f,l){
    const overlap=Math.min(f.bottom,l.bottom)-Math.max(f.top,l.top),left=f.left-l.right,above=f.top-l.bottom;
    if(overlap>Math.min(f.height,l.height)*.35 && left>=-4 && left<240)return left+Math.abs((f.top+f.bottom-l.top-l.bottom)/2)*2;
    if(above>=-4 && above<80 && Math.min(f.right,l.right)>Math.max(f.left,l.left) && Math.abs(f.left-l.left)<120)return above*2+Math.abs(f.left-l.left)+30;
    return Infinity;
  }
  function collect(doc){
    const nodes=[];for(const tree of roots(doc)){const walker=doc.createTreeWalker(tree===doc?doc.body:tree,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){
      const parent=node.parentElement;
      if(!parent||parent.closest('script,style,noscript,option,textarea,button,[role="option"],.help,.hint,.description,.explanation,[role="note"]')||!visible(parent))continue;
      const text=node.textContent.replace(/\s+/g,' ').trim().replace(/^[*＊\s]+|[*＊：:\s]+$/g,'');
      if(!text||text.length>60)continue;
      const range=doc.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();
      if(rect.width&&rect.height)nodes.push({text,rect,parent});
    }}return nodes;
  }
  function infer(el,nodes,controls){
    nodes=nodes.filter(n=>n.parent.getRootNode()===el.getRootNode());controls=controls.filter(n=>n.getRootNode()===el.getRootNode());
    const box=el.getBoundingClientRect();
    const cell=el.closest('td,th'),definition=el.closest('dd');
    const candidates=nodes.filter(n=>!el.contains(n.parent)&&(!cell||!n.parent.closest('td,th')||n.parent.closest('td,th')===cell)&&(!definition||!n.parent.closest('dt')||definition.previousElementSibling===n.parent.closest('dt'))).map(n=>({...n,score:distance(box,n.rect)})).filter(n=>Number.isFinite(n.score)&&!controls.some(other=>other!==el&&distance(other.getBoundingClientRect(),n.rect)<n.score)).sort((a,b)=>a.score-b.score);
    const first=candidates[0],ambiguous=candidates[1]&&candidates[1].text!==first.text&&candidates[1].score-first.score<12;
    const heading=nodes.filter(n=>/^(教育经历|教育背景|工作经历|实习经历|项目经历|基本信息|个人信息|education|work experience|projects)$/i.test(n.text)&&n.rect.bottom<=box.top&&box.top-n.rect.bottom<1000).sort((a,b)=>b.rect.bottom-a.rect.bottom)[0];
    return {label:first&&!ambiguous?first.text:'',context:heading?.text||'',evidence:first&&!ambiguous?'可见文字与控件位置':''};
  }
  function associate(el){
    const clean=n=>(n?.innerText||n?.textContent||'').replace(/\s+/g,' ').replace(/[*＊:：]|必填|选填/g,'').trim();
    const labelText=node=>{const copy=node.cloneNode(true);const originals=[...node.querySelectorAll('*')],clones=[...copy.querySelectorAll('*')];originals.forEach((n,i)=>{if(!visible(n)||n.matches('small,.help,.hint,.description,.explanation,[role="note"],script,style,input,select,textarea,button'))clones[i].remove();});return clean(copy);};
    const cell=el.closest('td,th');let tableLabel='',annotation='';
    if(cell){for(let prev=cell.previousElementSibling;prev;prev=prev.previousElementSibling){if(!prev.matches('th,td')||prev.querySelector('input,textarea,select,[contenteditable=true],[role="combobox"]'))break;if(!visible(prev))continue;const value=labelText(prev);if(!value)continue;if(/^[（(]/.test(value)){annotation||=value;continue;}if(value.length<=80)tableLabel=value;break;}tableLabel||=annotation;}
    const definition=el.closest('dd');const term=definition?.previousElementSibling;const definitionLabel=term?.matches('dt')&&visible(term)?labelText(term):'';
    const container=el.closest('.el-form-item,.ant-form-item,.form-item,.form-row,.layui-form-item,[data-field-label]');
    const labels=container?Array.from(container.querySelectorAll('label,.field-label,.layui-form-label')).filter(n=>visible(n)&&!n.querySelector('input,select,textarea')).map(clean).filter(Boolean):[];
    const radioGroup=el.type==='radio'?el.closest('[role="radiogroup"],fieldset'):el.matches('[role="radiogroup"]')?el:null;
    const groupIds=(radioGroup?.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>el.ownerDocument.getElementById(id)).filter(n=>n&&visible(n));
    const groupLabel=radioGroup?(radioGroup.getAttribute('aria-label')||groupIds.map(clean).join(' ')||clean(radioGroup.querySelector(':scope > legend'))):'';
    const label=groupLabel||el.getAttribute('data-label')||container?.getAttribute('data-field-label')||(labels.length===1?labels[0]:'')||tableLabel||definitionLabel;
    const roleText=label||clean(el.closest('fieldset')?.querySelector('legend'));
    const regionRole=/户籍|户口/.test(roleText)?'hukou':/籍贯/.test(roleText)?'native':/现居|居住地|居住地址/.test(roleText)?'current':null;
    const technical=(el.name||'')+' '+(el.id||'');
    const regionHint=el.getAttribute('data-region-level')||el.getAttribute('aria-label')||el.placeholder||(el.matches('select')?el.options[0]?.textContent:'')||'';
    const level=/\b(?:province|sheng)[-_]/i.test(technical)||/^(请选择)?(省|省份|省\/直辖市)$|^province$/i.test(regionHint.trim())?'province':/\b(?:city|shi)[-_]/i.test(technical)||/^(请选择)?(市|城市|地级市)$|^city$/i.test(regionHint.trim())?'city':/\b(?:county|district|qu)[-_]/i.test(technical)||/^(请选择)?(区|县|区县|区\/县)$|^(county|district)$/i.test(regionHint.trim())?'county':null;
    const dateContainer=el.closest('[data-date-group],.date-group,.birthday-group')||container||cell;
    const groupText=clean(dateContainer?.querySelector('legend,label,.field-label'))||tableLabel||label;
    const dateHint=el.matches('select')?el.options[0]?.textContent||'':'';
    const datePart=el.matches('select')&&/出生|生日/.test(groupText)?(/year|nian/i.test(technical)||el.getAttribute('data-date-part')==='year'||/年份|^年$/.test(dateHint)?'year':/month|yue/i.test(technical)||el.getAttribute('data-date-part')==='month'||/月份|^月$/.test(dateHint)?'month':/day|ri_/i.test(technical)||el.getAttribute('data-date-part')==='day'||/日期|^日$/.test(dateHint)?'day':null):null;
    return {label:label||'',groupLabel,context:tableLabel||'',regionRole,regionLevel:regionRole?level:null,datePart,datePath:datePart?'basics.birthday':null,evidence:groupLabel?'单选组可见标签':tableLabel?'表格同行标签':definitionLabel?'定义列表标签':'表单容器标签'};
  }
  root.ResumeLayout={roots,query,contains,activeElement,visible,distance,collect,infer,associate};
  if(typeof module!=='undefined')module.exports=root.ResumeLayout;
})(globalThis);
