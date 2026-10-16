/* Local region dictionary; rendering never silently changes imported facts. */
(()=>{
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const regionKey=k=>/^(city|region|location|hukou|hukouAddress|nativePlace|nativeRegion|currentResidence|birthPlace|birthRegion|workLocation|schoolLocation)$/.test(k)||/地区|城市|籍贯|户籍|出生地|工作地|学校所在地/.test(k);
function region(editor,parent,path,key,value){
 const alias=path[0]==='basics'?{city:'currentResidence',hukouAddress:'hukou',nativePlace:'nativeRegion'}[key]:null;
 const target=alias?[...path.slice(0,-1),alias]:path;
 const raw=typeof value==='string'?value:'';
 const existing=editor.get(target);const initial=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:{};
 const box=node('fieldset');box.className='profile-nested';box.append(node('legend',({city:'现居地区',currentResidence:'现居地区',hukouAddress:'户籍地区',hukou:'户籍地区',nativePlace:'籍贯地区',nativeRegion:'籍贯地区'})[key]||key));
 const grid=node('div');grid.className='profile-grid';box.append(grid);parent.append(box);
 const select=(part,title)=>{const label=node('label',title);label.className='profile-field';const s=node('select');s.dataset.profilePath=[...target,part].join('.');s.setAttribute('aria-label',box.firstChild.textContent+' · '+title);label.append(s);grid.append(label);return s;};
 const province=select('province','省 / 直辖市'),city=select('city','市'),county=select('county','区 / 县');
 const fill=(s,items,value)=>{s.replaceChildren();const empty=node('option','请选择');empty.value='';s.append(empty);for(const r of items||[]){const o=node('option',r.name);o.value=r.name;s.append(o);}s.value=value||'';if(!s.value)s.value='';s.disabled=!(items?.length);};
 const rows=window.ResumeRegions||[];fill(province,rows,initial.province);const p=()=>rows.find(r=>r.name===province.value);const c=()=>p()?.children?.find(r=>r.name===city.value);
 fill(city,p()?.children,initial.city);fill(county,c()?.children,initial.county);
 const original=node('p');original.className='muted';original.textContent=raw?'原有资料：'+raw+'。请明确选择三级地区，原文在选择前保持不变。':'省、市、区县联合定位；未明确的信息可暂留空，不自动猜测。';box.append(original);
 const save=()=>{const selected={...initial,province:province.value,city:city.value,county:county.value,path:[province.value,city.value,county.value].filter(Boolean).join(' > ')};if(county.value){const item=c()?.children?.find(r=>r.name===county.value);if(item)selected.code=item.code;}else delete selected.code;editor.set(target,selected);if(alias)editor.set(path,key==='city'?city.value:selected.path);if(target[0]==='basics'){const meta=editor.data._normalization||={};meta.regions||={};meta.regions[target.at(-1)]={...meta.regions[target.at(-1)],confirmed:!!county.value,raw:alias?editor.get(path):selected.path,code:selected.code||'',dataset:'2023-06-30'};}original.textContent=county.value?'已选择：'+selected.path:'地区尚未完整选择到区 / 县';};
 province.addEventListener('change',()=>{fill(city,p()?.children,'');fill(county,[],'');save();});city.addEventListener('change',()=>{fill(county,c()?.children,'');save();});county.addEventListener('change',save);
}
function date(editor,parent,path,key,value){
 const box=node('fieldset');box.className='profile-nested';box.append(node('legend',({birthday:'出生日期',startDate:'开始时间',endDate:'结束时间'})[key]||key));parent.append(box);
 const precision=node('select');precision.dataset.datePrecision=path.join('.');precision.setAttribute('aria-label',(box.firstChild.textContent||key)+'精度');for(const [v,t]of [['day','年 / 月 / 日'],['month','年 / 月'],['year','年']]){const o=node('option',t);o.value=v;precision.append(o);}
 const raw=String(value??'');precision.value=/^\d{4}$/.test(raw)?'year':/^\d{4}-\d{2}$/.test(raw)?'month':raw||key==='birthday'?'day':'month';
 const input=node('input');input.dataset.profilePath=path.join('.');input.setAttribute('aria-label',box.firstChild.textContent);const info=node('p');info.className='muted';
 const setup=()=>{input.type=precision.value==='day'?'date':precision.value==='month'?'month':'number';if(input.type==='number'){input.min='1900';input.max='2200';input.step='1';}else{input.removeAttribute('step');input.min=precision.value==='day'?'1900-01-01':'1900-01';input.max=precision.value==='day'?'2200-12-31':'2200-12';}};
 setup();input.value=raw;info.textContent=raw&&input.value!==raw?'原有日期：'+raw+'（保留原值，请用日期控件重新选择）':'保存格式：YYYY-MM-DD / YYYY-MM / YYYY；不会自动补齐缺失的月或日。';
 const save=()=>{const errorKey=JSON.stringify(path);if(!input.validity.valid){editor.errors.set(errorKey,input.value);editor.changed();return;}editor.errors.delete(errorKey);editor.set(path,input.value);};input.addEventListener('input',save);input.addEventListener('change',save);
 precision.addEventListener('change',()=>{const old=input.value;setup();input.value=precision.value==='year'?old.slice(0,4):precision.value==='month'?old.slice(0,7):/^\d{4}-\d{2}-\d{2}$/.test(old)?old:'';save();});
 box.append(precision,input,info);
 if(key==='endDate'){const label=node('label','至今 / 仍在进行');const ongoing=node('input');ongoing.type='checkbox';ongoing.checked=/^(至今|现在|present|current)$/i.test(raw);if(ongoing.checked)input.disabled=true;ongoing.addEventListener('change',()=>{input.disabled=ongoing.checked;editor.set(path,ongoing.checked?'至今':input.value);});label.prepend(ongoing);box.append(label);}
}
window.StructuredFields={regionKey,region,date};
})();
