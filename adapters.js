(function(root){
  const keys=new Set(['basics','education','work','projects']);
  const types=new Set(['input','date','select','radio','combobox','cascader','contenteditable']);
  function validate(data){
    if(!data||data.version!==1||!Array.isArray(data.adapters)||data.adapters.length>100)throw Error('适配文件需要 version:1 和 adapters 数组（最多 100 项）');
    const ids=new Set();
    const selector=s=>{if(typeof s!=='string'||!s.trim()||s.length>500)throw Error('选择器必须是 1–500 字符的 CSS 文本');if(typeof document!=='undefined'){try{document.createDocumentFragment().querySelector(s);}catch{throw Error('无效 CSS 选择器：'+s);}}};
    for(const a of data.adapters){
      if(!a||typeof a.id!=='string'||ids.has(a.id)||!a.id.trim())throw Error('适配 id 必须唯一');ids.add(a.id);
      if(!Array.isArray(a.hostnames)||!a.hostnames.length||a.hostnames.some(h=>typeof h!=='string'||!/^[a-z0-9.-]+$/i.test(h)))throw Error('hostnames 必须填写明确域名，不支持通配符');
      if(typeof a.pathPrefix!=='string'||!a.pathPrefix.startsWith('/'))throw Error('需要以 / 开头的 pathPrefix');
      if(!Array.isArray(a.sections)||!a.sections.length||a.sections.length>30)throw Error('需要 sections 数组（最多 30 项）');
      const seen=new Set();
      for(const s of a.sections){
        if(!keys.has(s.key)||seen.has(s.key))throw Error('section.key 必须为 basics/education/work/projects，且不能重复');seen.add(s.key);selector(s.selector);
        for(const k of ['cardSelector','addButton','editButton','saveButton','savedSelector','fieldContainerSelector','labelSelector'])if(s[k])selector(s[k]);
        if(s.timeoutMs!==undefined&&(!Number.isInteger(s.timeoutMs)||s.timeoutMs<100||s.timeoutMs>15000))throw Error('timeoutMs 必须为 100–15000');
        if(s.fields!==undefined&&!Array.isArray(s.fields))throw Error('fields 必须是数组');
        for(const f of s.fields||[]){
          selector(f.selector);if(typeof f.path!=='string'||!f.path.startsWith(s.key+'.')||f.path.split('.').some(x=>['__proto__','constructor','prototype'].includes(x)))throw Error('字段 path 必须属于其 section');
          if(s.key!=='basics'&&!/^\w+\.\*\./.test(f.path))throw Error('经历字段 path 使用 education.*.school 形式');
          if(f.type&&!types.has(f.type))throw Error('未知控件类型：'+f.type);
          for(const k of ['optionsSelector','searchInputSelector','readbackSelector'])if(f[k])selector(f[k]);
          if(f.dateFormat&&!['YYYY-MM-DD','YYYY/MM/DD','YYYY.MM.DD','YYYY年MM月DD日','YYYYMMDD','YYYY-MM','YYYY/MM','YYYY'].includes(f.dateFormat))throw Error('不支持的日期格式');
          if(f.datePanel){const p=f.datePanel;for(const k of ['panelSelector','daySelector'])selector(p[k]);for(const k of ['headerSelector','nextSelector','prevSelector','yearSelector','monthSelector'])if(p[k])selector(p[k]);if(!(p.yearSelector&&p.monthSelector)&&!(p.headerSelector&&p.nextSelector&&p.prevSelector))throw Error('日期面板需配置年月下拉或标题与翻月按钮');if(p.dateAttribute&&!/^data-[\w-]+$/.test(p.dateAttribute))throw Error('日期属性需为 data-*');if(p.maxMonthSteps!==undefined&&(!Number.isInteger(p.maxMonthSteps)||p.maxMonthSteps<1||p.maxMonthSteps>1200))throw Error('翻月限制需为 1–1200');}
          if(f.type==='cascader'&&(!Array.isArray(f.levels)||!f.levels.length||f.levels.length>6))throw Error('级联选择需要 1–6 个 levels');
          for(const level of f.levels||[])selector(level.optionsSelector);
        }
      }
    }
    return data;
  }
  function choose(data,url){
    const u=new URL(url),matches=(data?.adapters||[]).filter(a=>a.hostnames.includes(u.hostname)&&u.pathname.startsWith(a.pathPrefix));
    matches.sort((a,b)=>b.pathPrefix.length-a.pathPrefix.length);
    if(matches.length>1&&matches[0].pathPrefix.length===matches[1].pathPrefix.length)throw Error('多份适配规则同时命中，请保留一份或细化路径');
    return matches[0]||null;
  }
  function fingerprint(fields){
    const text=JSON.stringify(fields.map(f=>[f.label,f.section,f.recordIndex,f.type,f.path,f.options]));let h=2166136261;
    for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
    return (h>>>0).toString(16);
  }
  function recordPath(path,index){return path.replace('.*.','.'+index+'.');}
  root.ResumeAdapters={validate,choose,fingerprint,recordPath};
  if(typeof module!=='undefined')module.exports=root.ResumeAdapters;
})(globalThis);
