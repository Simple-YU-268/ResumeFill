(function(root){
  let rows=null,loading=null;
  const clean=s=>String(s||'').normalize('NFKC').replace(/[\s,，/\\>＞\-]/g,'').trim();
  const aliases=(s,level)=>{const short=level==='province'?({'新疆维吾尔自治区':'新疆','广西壮族自治区':'广西','宁夏回族自治区':'宁夏','内蒙古自治区':'内蒙古','西藏自治区':'西藏'}[s]||s.replace(/省|市$/g,'')):level==='city'?s.replace(/市$/,''):s.replace(/区$|县$/,'');return [...new Set([s,short])];};
  function setRegions(data){rows=[];for(const p of data){rows.push({province:p.name,city:'',county:'',code:p.code});for(const c of p.children||[]){const city=/市辖区|县/.test(c.name)&&/北京市|天津市|上海市|重庆市/.test(p.name)?p.name:c.name;rows.push({province:p.name,city,county:'',code:c.code});for(const d of c.children||[])rows.push({province:p.name,city,county:d.name,code:d.code});}}}
  async function ready(){if(rows)return;if(!loading)loading=fetch(chrome.runtime.getURL('data/regions.json')).then(r=>{if(!r.ok)throw Error('地区词典读取失败');return r.json();}).then(setRegions).catch(e=>{loading=null;throw e;});await loading;}
  function resolveRegion(raw){
    if(!rows)throw Error('地区词典尚未就绪');const query=clean(raw),matches=[];
    if(!query)return {status:'empty',candidates:[]};
    for(const row of rows){const groups=[aliases(row.province,'province'),row.city?aliases(row.city,'city'):[],row.county?aliases(row.county,'county'):[]];
      const combos=row.county?[[0,1,2],[1,2],[0,2],[2]]:row.city?[[0,1],[1]]:[[0]];
      if(combos.some(indices=>{let words=[''];for(const i of indices)words=words.flatMap(w=>groups[i].map(a=>w+a));return words.includes(query);}))matches.push({...row,path:[row.province,row.city,row.county].filter(Boolean).join(' > ')});
    }
    const unique=Array.from(new Map(matches.map(r=>[r.path,r])).values());return {status:unique.length===1?'resolved':unique.length?'ambiguous':'unresolved',candidates:unique.slice(0,30)};
  }
  function parseDate(raw){
    let s=String(raw||'').normalize('NFKC').trim();if(/^\d{8}$/.test(s))s=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6);const m=s.match(/^(\d{4})(?:[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?月?)?$/);
    if(!m)return null;const year=+m[1],month=m[2]?+m[2]:null,day=m[3]?+m[3]:null;
    if(year<1000||year>9999||month!==null&&(month<1||month>12)||day!==null&&(day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()))return null;
    return {year:String(year),month:month===null?null:String(month).padStart(2,'0'),day:day===null?null:String(day).padStart(2,'0'),precision:day!==null?'day':month!==null?'month':'year',iso:[String(year),month===null?null:String(month).padStart(2,'0'),day===null?null:String(day).padStart(2,'0')].filter(Boolean).join('-')};
  }
  function formatDate(raw,format){const d=parseDate(raw);if(!d)throw Error('日期无效，支持 YYYY-MM-DD、斜线及中文年月日');if(format.includes('MM')&&!d.month||format.includes('DD')&&!d.day)throw Error('日期精度不足，未自动补造月或日');return format.replace('YYYY',d.year).replace('MM',d.month||'').replace('DD',d.day||'');}
  function normalize(resume){
    const out=JSON.parse(JSON.stringify(resume)),changes=[],issues=[];out._normalization||={};const meta=out._normalization;meta.regions||={};meta.dates||={};
    if(out.basics)for(const [source,target]of [['hukouAddress','hukou'],['nativePlace','nativeRegion'],['address','currentResidence']])if(typeof out.basics[target]==='string'&&!out.basics[source]){out.basics[source]=out.basics[target];changes.push({path:'basics.'+source,value:out.basics[source]});}
    for(const [source,target] of [['hukouAddress','hukou'],['nativePlace','nativeRegion'],['address','currentResidence']]){
      const raw=out.basics?.[source];if(typeof raw!=='string'||!raw.trim())continue;const result=resolveRegion(raw);
      if(meta.regions[target]?.confirmed&&meta.regions[target].raw===raw)continue;
      if(result.status==='resolved'){const r=result.candidates[0],existing=out.basics[target];if(existing&&Object.entries(existing).some(([k,v])=>['province','city','county'].includes(k)&&v&&v!==r[k])){issues.push({path:'basics.'+source,status:'conflict',raw});continue;}
        const value={province:r.province,city:r.city,county:r.county,path:r.path};if(JSON.stringify(existing)!==JSON.stringify(value)){out.basics[target]=value;changes.push({path:'basics.'+target,value});}meta.regions[target]={raw,code:r.code,dataset:'2023-06-30'};
      }else issues.push({path:'basics.'+source,raw,status:result.status,candidates:result.candidates});
    }
    const dates=[];if(out.basics)dates.push([out.basics,'birthday','basics.birthday']);for(const group of ['education','work','projects'])for(const [i,r] of (out[group]||[]).entries())for(const key of ['startDate','endDate'])dates.push([r,key,`${group}.${i}.${key}`]);
    for(const [obj,key,path]of dates){if(!obj[key])continue;const d=parseDate(obj[key]);if(!d){issues.push({path,status:'invalid-date'});continue;}if(d.iso!==obj[key]){meta.dates[path]={raw:obj[key],precision:d.precision};obj[key]=d.iso;changes.push({path,value:d.iso});}}
    return {resume:out,changes,issues};
  }
  async function enrich(resume){await ready();return normalize(resume);}
  function confirmRegion(resume,source,raw,path){const target={hukouAddress:'hukou',nativePlace:'nativeRegion',address:'currentResidence'}[source];if(!target||resume.basics?.[source]!==raw)throw Error('原始地区已变化，请重新整理');const r=resolveRegion(raw).candidates.find(c=>c.path===path);if(!r)throw Error('候选地区已变化');const out=JSON.parse(JSON.stringify(resume));out.basics[target]={province:r.province,city:r.city,county:r.county,path:r.path};out._normalization||={};out._normalization.regions||={};out._normalization.regions[target]={raw,code:r.code,dataset:'2023-06-30',confirmed:true};return out;}
  root.ResumeProfile={setRegions,ready,resolveRegion,parseDate,formatDate,normalize,enrich,confirmRegion};if(typeof module!=='undefined')module.exports=root.ResumeProfile;
})(globalThis);
