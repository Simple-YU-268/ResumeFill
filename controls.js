(function(root){
  const norm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s*＊:：]/g,'').trim();
  const canonical=v=>{const n=norm(v);return ({'大学本科':'本科','硕士研究生':'硕士','博士研究生':'博士','大学专科':'大专','专科':'大专'})[n]||n;};
  const optionKey=(v,d)=>{const n=root.ResumeMatcher?.canonicalOption?root.ResumeMatcher.canonicalOption(v,d?.field):canonical(v),level=d?.field?.regionLevel;if(d?.field?.datePart&&/^\d+[年月日]?$/.test(n))return String(parseInt(n,10));return level==='city'?n.replace(/市$/,''):level==='province'?n.replace(/省$/,''):n;};
  const visible=el=>!!el?.isConnected&&ResumeLayout.visible(el);
  const list=(scope,selector)=>Array.from(scope.querySelectorAll(selector)).filter(visible);
  const enabled=o=>!o.disabled&&!o.hidden&&!o.closest?.('optgroup[disabled],fieldset[disabled],[aria-disabled="true"],[hidden],[inert]')&&o.getAttribute('aria-disabled')!=='true'&&!o.matches?.('.is-disabled,.ant-select-item-option-disabled,.el-select-dropdown__item--disabled,.layui-disabled')&&(o.tagName!=='OPTION'||getComputedStyle(o).display!=='none');
  function guard(d){if(d.scopeGuard&&!d.scopeGuard())throw Error('所选区块已变化，请重新选择');if(d.ocrGuard&&!d.ocrGuard())throw Error('OCR 确认后页面已变化，请重新扫描核对');if(d.signal?.aborted||d.el.disabled||d.el.getAttribute('aria-disabled')==='true'||!visible(d.el)||d.scanUrl&&location.href!==d.scanUrl)throw Error('操作已取消或字段/页面已变化');}
  const menuSelector='[role="listbox"],.ant-select-dropdown,.el-select-dropdown,.el-select__popper,.ivu-select-dropdown';
  function menus(doc){return list(doc,menuSelector).filter(n=>!n.parentElement?.closest(menuSelector));}
  function associatedMenu(d){
    const id=d.el.getAttribute('aria-controls')||d.el.getAttribute('aria-owns')||d.el.querySelector('[aria-controls],[aria-owns]')?.getAttribute('aria-controls')||d.el.querySelector('[aria-owns]')?.getAttribute('aria-owns');
    if(id){const nodes=id.split(/\s+/).map(id=>d.el.ownerDocument.getElementById(id)).filter(visible);if(nodes.length!==1)return null;return nodes[0];}
    if(d.config?.layuiSelect){const choices=list(d.el.closest('.layui-form-select'),'dl');if(choices.length>1)throw Error('Layui 下拉列表不唯一');return choices[0]||null;}
    const choices=menus(d.el.ownerDocument);if(visible(d.menu)&&choices.includes(d.menu))return d.menu;const fresh=choices.filter(n=>!d.beforeMenus?.has(n));if(fresh.length===1)return fresh[0];if(fresh.length>1)throw Error('展开多个弹层，无法确定归属');
    if(d.menuChanges&&!d.menuChangeOverflow){const anchor=d.el.getBoundingClientRect();const changed=choices.filter(n=>d.menuChanges.has(n)&&!n.contains(d.el)&&list(n,'[role="option"],.ant-select-item-option,.el-select-dropdown__item,.ivu-select-item').length>=2&&!n.querySelector('form,input,textarea,select,[role="grid"]')&&n.querySelectorAll('a[href]').length<2).filter(n=>{const r=n.getBoundingClientRect();return Math.min(r.right,anchor.right)>Math.max(r.left,anchor.left)&&Math.min(Math.abs(r.top-anchor.bottom),Math.abs(anchor.top-r.bottom))<100;});if(changed.length>1)throw Error('多个已有弹层同时变化，无法确定归属');if(changed.length===1)return changed[0];}
    return null;
  }
  function watchMenus(d){
    d.menuChanges=new Set();d.menuChangeOverflow=false;
    const observe=records=>{if(records.length>100){d.menuChangeOverflow=true;return;}for(const record of records){const node=record.target.nodeType===1?record.target:record.target.parentElement;const menu=node?.closest?.(menuSelector);if(menu)d.menuChanges.add(menu);if(d.menuChanges.size>16)d.menuChangeOverflow=true;}};
    const observer=new MutationObserver(observe);observer.observe(d.el.ownerDocument.body,{subtree:true,attributes:true,childList:true,characterData:true});
    return ()=>{observer.disconnect();d.menuChanges=null;};
  }
  function waitFor(fn,timeout=2500){return new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>{let value;try{value=fn();}catch(e){reject(e);return;}if(value){resolve(value);return;}if(Date.now()-started>=timeout){reject(Error('等待页面状态超时'));return;}setTimeout(poll,60);};poll();});}
  function setValue(el,value){
    const win=el.ownerDocument.defaultView;
    const proto=el.tagName==='SELECT'?win.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
    el.dispatchEvent(new win.Event('input',{bubbles:true,composed:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));
  }
  function options(d,selector){
    const menu=associatedMenu(d);d.menu=menu;
    if(menu?.getAttribute('aria-busy')==='true')return [];
    if(selector){const linked=d.el.matches('[aria-controls],[aria-owns]')||d.el.querySelector('[aria-controls],[aria-owns]');return list(d.el.ownerDocument,selector).filter(n=>menu?menu.contains(n):!linked);}
    return menu?list(menu,'[role="option"],.ant-select-item-option,.ant-select-dropdown-menu-item,.el-select-dropdown__item,.ivu-select-item,dd[lay-value]'):[];
  }
  function matchingOptions(elements,value,d){
    const available=elements.filter(enabled),numeric=!d?.manualOption&&root.ResumeMatcher?.numericOptions(value,available,{...d?.field,sourcePath:d?.sourcePath});
    if(numeric?.handled){if(numeric.hits.length>1)throw Error(numeric.reason);return numeric.hits;}
    return available.filter(o=>optionKey(o.textContent,d)===optionKey(value,d)||norm(o.getAttribute('data-value')||o.value)===norm(value));
  }
  function uniqueOption(elements,value,d){
    const matches=matchingOptions(elements,value,d);
    if(matches.length!==1)throw Error(matches.length?'选项不唯一，已停止':'没有匹配的真实选项');return matches[0];
  }
  // Enumerate indexed virtual lists before selecting: a visible hit alone cannot
  // establish uniqueness across off-screen options. Unindexed lists stay manual.
  async function virtualOption(d,value){
    const menu=associatedMenu(d);if(!menu)return null;
    const initial=options(d);if(!initial.length)return null;if(!initial.every(o=>o.hasAttribute('aria-posinset')&&o.hasAttribute('aria-setsize'))){if(initial.some(o=>o.hasAttribute('aria-posinset')||o.hasAttribute('aria-setsize'))||menu.querySelector('.rc-virtual-list,.cdk-virtual-scroll-viewport,[data-virtual-list]'))throw Error('虚拟列表缺少完整索引，请手动选择');return null;}
    const scrolls=new Set();for(const option of initial){for(let p=option.parentElement;p&&menu.contains(p);p=p.parentElement){if(p.clientHeight>0&&p.scrollHeight>p.clientHeight+2&&/auto|scroll/.test(getComputedStyle(p).overflowY)){scrolls.add(p);break;}if(p===menu)break;}}
    if(!scrolls.size)return null;if(scrolls.size!==1)throw Error('虚拟列表滚动区域不唯一');const scroller=[...scrolls][0];
    const total=Number(initial[0].getAttribute('aria-setsize'));if(!Number.isInteger(total)||total<1||total>500)throw Error('虚拟列表条数未知或超过 500，请手动选择');
    const indexed=new Map(),hits=new Map();
    const signature=()=>JSON.stringify(options(d).map(o=>[o.getAttribute('aria-posinset'),o.textContent]));
    const move=async top=>{guard(d);const before=signature();scroller.scrollTop=top;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));await new Promise(r=>setTimeout(r,80));guard(d);if(signature()===before&&top!==0)await waitFor(()=>{guard(d);return signature()!==before;},600);};
    await move(0);let exhausted=false;
    for(let page=0;page<40;page++){
      guard(d);const items=options(d);if(!items.length)throw Error('虚拟列表候选未就绪');
      for(const o of items){const index=Number(o.getAttribute('aria-posinset'));if(!Number.isInteger(index)||index<1||index>total||Number(o.getAttribute('aria-setsize'))!==total)throw Error('虚拟列表索引或总数已变化');const text=o.textContent.trim(),state=JSON.stringify([text,o.getAttribute('data-value'),enabled(o)]);if(indexed.has(index)&&indexed.get(index)!==state)throw Error('虚拟列表内容已变化');indexed.set(index,state);if(matchingOptions([o],value,d).length)hits.set(index,{top:scroller.scrollTop,state});}
      const end=scroller.scrollHeight-scroller.clientHeight;if(scroller.scrollTop>=end-2){exhausted=true;break;}
      const next=Math.min(end,scroller.scrollTop+Math.max(1,scroller.clientHeight*.75));if(next<=scroller.scrollTop)break;await move(next);
    }
    if(!exhausted||indexed.size!==total)throw Error('虚拟列表未完整枚举，请手动选择');
    if(hits.size!==1)throw Error(hits.size?'虚拟列表存在重复选项，已停止':'虚拟列表没有匹配的真实选项');
    const [index,hit]=[...hits][0];if(Math.abs(scroller.scrollTop-hit.top)>1)await move(hit.top);
    return await waitFor(()=>{guard(d);const found=options(d).filter(o=>Number(o.getAttribute('aria-posinset'))===index);if(found.length>1)throw Error('虚拟列表索引不唯一');const o=found[0];if(!o)return false;if(JSON.stringify([o.textContent.trim(),o.getAttribute('data-value'),enabled(o)])!==hit.state)throw Error('虚拟列表目标已变化');return o;});
  }
  function read(d){
    if(d.type==='radio'){const checked=d.radios.find(r=>r.checked);return checked?(checked.labels?.[0]?.innerText||checked.value).trim():'';}
    if(d.config?.readbackSelector){const nodes=list(d.scope,d.config.readbackSelector);if(nodes.length===1)return nodes[0].value??nodes[0].innerText;}
    if(d.el.tagName==='SELECT')return d.el.value===''?'':d.el.selectedOptions[0]?.textContent?.trim()||'';
    if(d.type==='contenteditable')return d.el.innerText;
    if(d.type==='combobox'){const selected=d.el.querySelector('.ant-select-selection-item,.el-select__selected-item,.el-input__inner');return selected?(selected.value??selected.innerText?.trim()):d.el.value??d.el.innerText?.trim()??'';}
    return d.el.value??'';
  }
  function invalid(d){const el=d.el;return el.getAttribute('aria-invalid')==='true'||(el.validity&&!el.validity.valid);}
  function equal(d,actual,value){
    if(d.numericSelection&&d.numericSelection.value===String(value)&&d.numericSelection.sourcePath===d.sourcePath&&['select','combobox'].includes(d.type))return norm(actual)===norm(d.numericSelection.text);
    if(d.field?.datePart)return optionKey(actual,d)===optionKey(value,d);
    if(root.ResumeProfile&&isDate(d)){try{const target=dateValue(d,value),a=root.ResumeProfile.parseDate(actual),b=root.ResumeProfile.parseDate(target);return !!a&&!!b&&a.iso===b.iso;}catch{return false;}}
    if(d.type==='cascader')return norm(actual)===norm(String(value).split('>').map(x=>x.trim()).join('>'));
    return ['select','radio','combobox'].includes(d.type)?optionKey(actual,d)===optionKey(value,d):norm(actual)===norm(value);
  }
  function isDate(d){return d.type==='date'||['date','month'].includes(d.el.type)||d.el.closest('.el-date-editor')||d.config?.dateFormat||d.config?.datePanel||/出生日期|生日|开始日期|结束日期|入学时间|毕业时间|获奖时间/.test(d.field?.label||'');}
  function dateValue(d,value){const p=root.ResumeProfile;if(!p)return String(value);const parsed=p.parseDate(value);if(!parsed)throw Error('日期无效');let format=d.config?.dateFormat||d.el.getAttribute('data-date-format');const hint=d.el.placeholder||'';
    if(!format){if(d.el.type==='date'||d.el.closest('.el-date-editor--date'))format='YYYY-MM-DD';else if(d.el.type==='month'||d.el.closest('.el-date-editor--month'))format='YYYY-MM';else format=['YYYY年MM月DD日','YYYY/MM/DD','YYYY.MM.DD','YYYY-MM-DD','YYYYMMDD','YYYY/MM','YYYY-MM'].find(f=>hint.toUpperCase().includes(f))||parsed.iso.replace(/\d/g,'');}
    if(!/YYYY/.test(format))return parsed.iso;return p.formatDate(value,format);
  }
  // 51job reference pickers: the panel belongs to its trigger container, not the
  // nearest floating list. Traverse branches first; commit only a unique leaf.
  const refText=el=>(el.querySelector('.cascader_item_label')?.textContent||el.textContent||'').trim();
  const refRegion=s=>norm(s).replace(/省$|市$/g,'');
  function refPlan(d,value){const supplied=d.referenceData||{};if(d.manualOption||supplied.sourceValue!==undefined&&String(value)!==supplied.sourceValue)return {kind:'exact',parts:String(value).split(/\s*[>＞→]\s*/).filter(Boolean)};return {...supplied,parts:Array.isArray(supplied.parts)&&supplied.parts.length?supplied.parts.map(String):String(value).split(/\s*[>＞→]\s*/).filter(Boolean),kind:supplied.kind==='language'?'language':/居住地|户口|户籍|工作地/.test(d.field?.label||'')?'region':supplied.kind||'exact'};}
  function langKey(s){const n=norm(s).replace(/[()（）]/g,'');if(/^(?:大学)?英语[六6]级(?:cet6)?$|^cet6$/.test(n))return 'cet6';if(/^(?:大学)?英语[四4]级(?:cet4)?$|^cet4$/.test(n))return 'cet4';return n;}
  function scoreHit(text,score){
    if(!/^\d+(?:\.\d+)?$/.test(String(score).trim()))return false;
    const n=Number(score),s=norm(text).replace(/^cet[46]/,'').replace(/分/g,'');let m;
    if((m=s.match(/^(\d+(?:\.\d+)?)[-~～至](\d+(?:\.\d+)?)$/)))return n>=+m[1]&&n<=+m[2];
    if((m=s.match(/^(\d+(?:\.\d+)?)(及以上|以上|及以下|以下)$/)))return /以上$/.test(m[2])?n>=+m[1]:n<=+m[1];
    if((m=s.match(/^(超过|大于|不足|小于)(\d+(?:\.\d+)?)$/)))return /超过|大于/.test(m[1])?n>+m[2]:n<+m[2];
    return /^\d+(?:\.\d+)?$/.test(s)&&n===Number(s);
  }
  function refMatches(path,plan){
    if(plan.kind==='language')return norm(path.at(-1))===norm(plan.level)||path.length>=2&&langKey(path[0])===langKey(plan.level)&&scoreHit(path.at(-1),plan.score);
    if(plan.parts.length===1)return (plan.kind==='region'?refRegion(path.at(-1)):norm(path.at(-1)))===(plan.kind==='region'?refRegion(plan.parts[0]):norm(plan.parts[0]));
    const compare=plan.kind==='region'?refRegion:norm,parts=path[0]==='中国'?path.slice(1):path;
    // Region widgets may stop at city even when the resume also has a district.
    return parts.length>=(plan.kind==='region'?Math.min(2,plan.parts.length):plan.parts.length)&&parts.every((s,i)=>i<plan.parts.length&&compare(s)===compare(plan.parts[i]));
  }
  function refContainer(d){const container=d.el.closest('.jsb_three_layer_container,.jbs_three_layer_container');if(!container)throw Error('多级选择器触发器归属不明确');return container;}
  function refPanel(d){const container=refContainer(d),ids=(d.el.getAttribute('aria-controls')||d.el.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean);let panels;
    if(ids.length){panels=ids.map(id=>d.el.ownerDocument.getElementById(id)).filter(visible);if(panels.length!==1||!panels[0].matches('.jbs_select_panel'))throw Error('多级选择器 ARIA 引用未唯一命中');}
    else panels=list(container,'.jbs_select_panel');if(panels.length>1)throw Error('多级选择器浮层不唯一');return panels[0]||null;
  }
  async function refOpen(d){guard(d);if(!refPanel(d))d.el.click();return waitFor(()=>{guard(d);return refPanel(d);});}
  function refMenus(panel){const menus=list(panel,'.cascader_panel_menu');if(menus.length>6||panel.querySelector('[data-virtual-list],.rc-virtual-list'))throw Error('多级列表深度过大或不完整，请手动选择');return menus;}
  function refItems(menu){return Array.from(menu.children).filter(n=>n.matches('.cascader_panel_item')&&visible(n)&&enabled(n));}
  async function refStable(d,depth){let stamp='',since=0;return waitFor(()=>{guard(d);const panel=refPanel(d);if(!panel)return false;const menu=refMenus(panel)[depth];if(!menu||menu.getAttribute('aria-busy')==='true')return false;const items=refItems(menu),next=JSON.stringify(items.map(n=>[refText(n),n.classList.contains('leaf')]));if(!items.length)return false;if(next!==stamp){stamp=next;since=Date.now();return false;}return Date.now()-since>=120?menu:false;},2000);}
  async function refBranch(d,depth,index,text){
    const panel=refPanel(d),menu=refMenus(panel)[depth],item=refItems(menu)[index];if(!item||refText(item)!==text||item.classList.contains('leaf'))throw Error('多级菜单内容已变化');
    if(!item.classList.contains('active')){
      let changed=false;const child=refMenus(panel)[depth+1];const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&r.target===panel||child&&(r.target===child||child.contains(r.target))))changed=true;});observer.observe(panel,{subtree:true,childList:true,characterData:true,attributes:true});
      try{for(const node of [item,item.querySelector('.func-item')].filter(Boolean)){node.dispatchEvent(new MouseEvent('mouseenter',{bubbles:false}));node.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));}item.click();await waitFor(()=>{guard(d);return item.classList.contains('active')&&(changed||refMenus(refPanel(d))[depth+1]!==child);},2000);}finally{observer.disconnect();}
    }
    return refStable(d,depth+1);
  }
  async function refRoute(d,route){await refOpen(d);for(let depth=0;depth<route.length-1;depth++){const step=route[depth];await refStable(d,depth);await refBranch(d,depth,step.index,step.text);}const last=route.at(-1),menu=await refStable(d,route.length-1),item=refItems(menu)[last.index];if(!item||refText(item)!==last.text||!item.classList.contains('leaf'))throw Error('末级选项已变化');return item;}
  async function referenceVerify(d,value){
    await refOpen(d);const menus=refMenus(refPanel(d)),path=[];for(const menu of menus){const active=refItems(menu).filter(n=>n.classList.contains('active'));if(active.length!==1)return {status:'unconfirmed',error:'多级列表没有唯一选中路径'};path.push(refText(active[0]));if(active[0].classList.contains('leaf'))break;}
    const last=menus[path.length-1],leaf=last&&refItems(last).find(n=>n.classList.contains('active')&&n.classList.contains('leaf'));
    if(!leaf||!refMatches(path,refPlan(d,value))||norm(read(d))!==norm(path.at(-1)))return {status:'mismatch',error:'多级真实选中路径与输入框回显不一致'};
    return {status:'verified'};
  }
  async function referenceFill(d,value,overwrite){
    if(read(d)&&!overwrite){const checked=await referenceVerify(d,value);return checked.status==='verified'?{...checked,preserved:true}:{status:'preserved',error:'保留已有多级选择，未覆盖'};}
    d.referenceCandidates=[];const plan=refPlan(d,value),hits=[],started=Date.now();let visited=0;
    await refOpen(d);
    async function walk(depth,route){
      guard(d);if(++visited>160||Date.now()-started>18000||depth>5)throw Error('多级菜单遍历超过限制，请补充完整路径或手动选择');
      const menu=await refStable(d,depth),items=refItems(menu).map((n,index)=>({index,text:refText(n),leaf:n.classList.contains('leaf')}));
      for(const step of items){guard(d);if(hits.length>1)return;const path=[...route.map(s=>s.text),step.text],next=[...route,step];
        if(step.leaf){if(refMatches(path,plan))hits.push(next);continue;}
        if(plan.kind==='language'&&depth===0&&langKey(step.text)!==langKey(plan.level))continue;
        if(plan.parts.length>1&&plan.kind!=='language'){const offset=path[0]==='中国'?1:0,part=plan.parts[depth-offset];if(depth>=offset&&part&&(plan.kind==='region'?refRegion(step.text)!==refRegion(part):norm(step.text)!==norm(part)))continue;}
        await refBranch(d,depth,step.index,step.text);await walk(depth+1,next);
      }
    }
    await walk(0,[]);d.referenceCandidates=hits.map(route=>({text:route.map(s=>s.text).join(' > '),value:route.map(s=>s.text).join(' > ')}));if(hits.length!==1)throw Error(hits.length?'多个完整路径或分数区间同时匹配，请人工选择':'没有唯一匹配的多级末级选项，请补充分类路径或分数');
    const leaf=await refRoute(d,hits[0]);guard(d);leaf.querySelector('.func-item')?.click();if(!leaf.querySelector('.func-item'))leaf.click();
    await waitFor(()=>{guard(d);return !refPanel(d)&&norm(read(d))===norm(hits[0].at(-1).text);});const checked=await referenceVerify(d,value);if(checked.status!=='verified')throw Error(checked.error);return {status:'filled'};
  }
  async function verify(d,value){
    if(d.scopeGuard&&!d.scopeGuard())return {status:'stale',error:'所选区块已变化'};
    if(d.ocrGuard&&!d.ocrGuard())return {status:'stale',error:'OCR 确认后页面已变化，请重新核对'};
    if(d.signal?.aborted)return {status:'failed',error:'操作已取消'};
    if(!visible(d.el)||d.scanUrl&&location.href!==d.scanUrl)return {status:'stale',error:'字段或页面已变化，请重新扫描'};
    if(invalid(d))return {status:'invalid',error:d.el.validationMessage||'页面标记该字段无效'};
    if(d.config?.referencePicker)return referenceVerify(d,value);
    if(!equal(d,read(d),value))return {status:'mismatch',error:'值未保留或显示值与预期不一致'};
    if(d.type==='combobox'&&d.config?.layuiSelect){const native=d.el.closest('.layui-form-select')?.previousElementSibling;if(native?.tagName!=='SELECT'||!native.value||norm(native.selectedOptions[0]?.textContent)!==norm(read(d)))return {status:'unconfirmed',error:'Layui 原生选中值与可见文本不一致'};return {status:'verified'};}
    if(d.type==='combobox'&&!d.optionConfirmed)return {status:'unconfirmed',error:'文本已有内容，但未确认选择真实选项'};
    return {status:'verified'};
  }
  async function fill(d,value,overwrite){
    guard(d);
    if(!visible(d.el)||d.el.disabled||d.el.getAttribute('aria-disabled')==='true')throw Error('控件不可用，请重新扫描');
    if(d.config?.referencePicker)return referenceFill(d,value,overwrite);
    const existing=read(d);
    if(existing&&!overwrite){if(equal(d,existing,value)&&!invalid(d)&&!['combobox','cascader'].includes(d.type))return {status:'verified',preserved:true};return {status:'preserved',error:'保留已有内容，未覆盖'};}
    if(d.config?.datePanel){
      const cfg=d.config.datePanel,p=root.ResumeProfile?.parseDate(value);if(!p?.day)throw Error('日期面板需要完整年月日，未补造日期');
      if(!d.config.readbackSelector)throw Error('日期面板需配置 readbackSelector');
      d.el.click();const panel=await waitFor(()=>{guard(d);const all=list(d.el.ownerDocument,cfg.panelSelector);if(all.length>1)throw Error('日期面板不唯一');return all[0];});
      if(cfg.yearSelector&&cfg.monthSelector){for(const [sel,val]of [[cfg.yearSelector,p.year],[cfg.monthSelector,String(+p.month)]]){guard(d);const all=list(panel,sel);if(all.length!==1||all[0].tagName!=='SELECT')throw Error('年月选择器需唯一原生 select');const fake={field:{datePart:sel===cfg.yearSelector?'year':'month'}};const o=uniqueOption(Array.from(all[0].options),val,fake);setValue(all[0],o.value);}}
      else{const target=Number(p.year)*12+Number(p.month);let reached=false;for(let step=0;step<=(cfg.maxMonthSteps||600);step++){guard(d);const heads=list(panel,cfg.headerSelector);if(heads.length!==1)throw Error('日期面板标题不唯一');const current=root.ResumeProfile.parseDate(heads[0].textContent.trim());if(!current?.month)throw Error('无法读取面板年月');const now=Number(current.year)*12+Number(current.month);if(now===target){reached=true;break;}if(step===(cfg.maxMonthSteps||600))break;const buttons=list(panel,now<target?cfg.nextSelector:cfg.prevSelector).filter(enabled);if(buttons.length!==1)throw Error('翻月按钮不唯一');const before=heads[0].textContent;buttons[0].click();await waitFor(()=>{guard(d);return list(panel,cfg.headerSelector)[0]?.textContent!==before;});}if(!reached)throw Error('日期面板翻月超过限制');}
      const iso=p.iso,days=list(panel,cfg.daySelector).filter(enabled).filter(n=>cfg.dateAttribute?n.getAttribute(cfg.dateAttribute)===iso:/^\d+$/.test(n.textContent.trim())&&+n.textContent===+p.day&&!n.matches('.prev-month,.next-month,.ant-picker-cell-disabled')&&(!n.matches('.ant-picker-cell')||n.matches('.ant-picker-cell-in-view')));if(days.length!==1)throw Error('日期选项不唯一，请配置完整日期属性');guard(d);days[0].click();
    }else if(d.type==='radio'){
      uniqueOption(d.radios.map(r=>({value:r.value,textContent:r.labels?.[0]?.innerText||r.value,disabled:r.disabled,getAttribute:k=>r.getAttribute(k),click:()=>r.click()})),value).click();
    }else if(d.type==='select'){
      d.numericSelection=null;const o=await waitFor(()=>{guard(d);const found=matchingOptions(Array.from(d.el.options),value,d);if(found.length>1)throw Error('选项不唯一，已停止');return found[0];});guard(d);setValue(d.el,o.value);d.numericSelection={value:String(value),sourcePath:d.sourcePath,text:o.textContent};
    }else if(d.type==='combobox'){
      d.optionConfirmed=false;d.numericSelection=null;d.beforeMenus=new Set(menus(d.el.ownerDocument));const stopWatching=watchMenus(d);try{d.el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));d.el.click();
      const search=d.config?.searchInputSelector?list(d.scope,d.config.searchInputSelector):d.el.matches('input')?[d.el]:list(d.el,'input');
      if(search.length>1)throw Error('搜索输入框不唯一');
      if(search[0]&&!search[0].readOnly)setValue(search[0],String(value));
      let stamp='',since=0;
      await waitFor(()=>{guard(d);return options(d,d.config?.optionsSelector).length;});
      const virtual=await virtualOption(d,value);
      const option=virtual||await waitFor(()=>{guard(d);const items=options(d,d.config?.optionsSelector).filter(enabled),signature=JSON.stringify(items.map(o=>[o.textContent,enabled(o)]));if(signature!==stamp){stamp=signature;since=Date.now();return false;}if(Date.now()-since<120)return false;const exact=matchingOptions(items,value,d);if(exact.length>1)throw Error('选项不唯一');return exact[0];});
      guard(d);uniqueOption([option],value,d).click();d.optionConfirmed=true;d.numericSelection={value:String(value),sourcePath:d.sourcePath,text:option.textContent};
      }finally{stopWatching();}
    }else if(d.type==='cascader'){
      const parts=String(value).split('>').map(x=>x.trim());
      if(parts.length!==d.config.levels.length)throw Error('地区需用 > 分隔，并与适配 levels 数量一致');
      d.selectedPath=null;d.el.click();
      for(let i=0;i<parts.length;i++){const option=await waitFor(()=>{guard(d);const matches=list(d.el.ownerDocument,d.config.levels[i].optionsSelector).filter(o=>enabled(o)&&norm(o.textContent)===norm(parts[i]));if(matches.length>1)throw Error('级联选项不唯一');return matches[0];});guard(d);uniqueOption([option],parts[i]).click();}
      // Never use a remembered click path as proof of the control's selected state.
      if(!d.config.readbackSelector)throw Error('级联控件需配置 readbackSelector 才能核验');
      const rendered=read(d);if(norm(rendered)!==norm(parts.join('>')))throw Error('级联显示值与目标不一致');d.selectedPath=parts;
    }else if(d.type==='contenteditable'){
      d.el.textContent=String(value);d.el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));
    }else{
      if(d.el.readOnly)throw Error('只读控件需配置专用处理方式');
      const v=isDate(d)&&root.ResumeProfile?dateValue(d,value):String(value);
      if(d.el.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('日期要求 YYYY-MM-DD，未自动补造日');
      if(d.el.type==='month'&&!/^\d{4}-\d{2}$/.test(v))throw Error('月份要求 YYYY-MM');
      setValue(d.el,v);
    }
    return {status:'filled'};
  }
  function candidates(d){if(d.config?.referencePicker)return d.referenceCandidates||[];return (d.el.tagName==='SELECT'?Array.from(d.el.options):options(d,d.config?.optionsSelector)).filter(enabled).filter(o=>visible(o)||o.tagName==='OPTION').map(o=>({text:o.textContent.trim(),value:o.value??o.getAttribute('data-value')??null})).filter(o=>o.text).slice(0,100);}
  root.ResumeControls={norm,waitFor,list,read,verify,fill,setValue,candidates,guard};
})(globalThis);
