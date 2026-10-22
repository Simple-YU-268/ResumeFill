(function(root) {
  const recordSections=['education','work','projects','languages','skills','awards','activities'];
  const familyRoles={father:['父亲','父','爸爸','father'],mother:['母亲','母','妈妈','mother'],spouse:['配偶','丈夫','妻子','spouse','husband','wife'],paternalGrandfather:['祖父','爷爷'],paternalGrandmother:['祖母','奶奶'],maternalGrandfather:['外祖父','外公'],maternalGrandmother:['外祖母','外婆']};
  const familyFields={name:['姓名','成员姓名','家属姓名'],relationship:['与本人关系','与申请人关系','与应聘者关系','关系','称谓','家庭关系','亲属关系'],idNumber:['身份证号码','身份证号','证件号码','身份证件号码'],birthday:['出生日期','出生年月','生日'],politicalStatus:['政治面貌'],employerAndPosition:['工作单位及职务','工作单位和职务'],company:['工作单位','单位名称'],position:['职务','职位'],employmentStatus:['人员状态','工作状态','在职状态'],phone:['手机号码','联系电话','电话'],gender:['性别'],ethnicity:['民族'],address:['地址','家庭住址']};
  function familyRole(value){const s=normalize(value);const hits=Object.entries(familyRoles).filter(([,names])=>names.some(n=>normalize(n)===s));return hits.length===1?hits[0][0]:null;}
  function isFamilyField(field){return field.section==='family'||/^(父亲|母亲|配偶|祖父|祖母|外祖父|外祖母)(?:的)?(?:姓名|身份证|证件|出生|政治|工作|职务|电话|手机|性别|民族)/.test(String(field.label||''));}
  function familyPath(field){
    if(!isFamilyField(field)||field.ambiguousLabel||field.familyAmbiguous)return null;
    let role=field.familyRole,label=String(field.label||'');const explicit=label.match(/^(父亲|母亲|配偶|外祖父|外祖母|祖父|祖母)(?:的)?/);if(explicit){const detected=familyRole(explicit[1]);if(role&&role!==detected)return null;role=detected;label=label.slice(explicit[0].length);}
    if(!Object.hasOwn(familyRoles,role))return null;
    if(field.datePart)return `family.${role}.birthdayParts.${field.datePart}`;
    const hits=Object.entries(familyFields).filter(([,names])=>names.some(n=>labelVariants(label).includes(normalize(n))));return hits.length===1?`family.${role}.${hits[0][0]}`:null;
  }
  const enums={
    gender:[['男','男性','male','man'],['女','女性','female','woman'],['其他'],['不愿透露','保密']],
    politicalStatus:[['中共党员','中国共产党党员','共产党员','党员'],['中共预备党员','中国共产党预备党员','预备党员'],['共青团员','中国共产主义青年团团员','团员'],['民革党员','中国国民党革命委员会党员'],['民盟盟员','中国民主同盟盟员'],['民建会员','中国民主建国会会员'],['民进会员','中国民主促进会会员'],['农工党党员','中国农工民主党党员'],['致公党党员','中国致公党党员'],['九三学社社员'],['台盟盟员','台湾民主自治同盟盟员'],['无党派人士'],['群众','普通群众']],
    degree:[['高中','普通高中'],['中专','中等专业学校'],['大专','专科','大学专科'],['本科','大学本科','undergraduate'],['硕士','硕士研究生'],['博士','博士研究生'],['学士','学士学位'],['其他']],
    maritalStatus:[['未婚','unmarried'],['已婚','married'],['离异','离婚','divorced'],['丧偶','widowed'],['不愿透露','保密']],
    nationality:[['中国','中华人民共和国','中国籍','PRC'],['其他']]
  };
  enums.ethnicity='汉族 蒙古族 回族 藏族 维吾尔族 苗族 彝族 壮族 布依族 朝鲜族 满族 侗族 瑶族 白族 土家族 哈尼族 哈萨克族 傣族 黎族 傈僳族 佤族 畲族 高山族 拉祜族 水族 东乡族 纳西族 景颇族 柯尔克孜族 土族 达斡尔族 仫佬族 羌族 布朗族 撒拉族 毛南族 仡佬族 锡伯族 阿昌族 普米族 塔吉克族 怒族 乌孜别克族 俄罗斯族 鄂温克族 德昂族 保安族 裕固族 京族 塔塔尔族 独龙族 鄂伦春族 赫哲族 门巴族 珞巴族 基诺族'.split(' ').map(name=>[name,name.slice(0,-1)]);
  const optionNorm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s*＊:：]/g,'').trim();
  function enumKey(field={}){const key=String(field.path||'').split('.').at(-1);if(enums[key])return key;const label=String(field.label||'');return /政治面貌|political.?status/i.test(label)?'politicalStatus':/性别|^gender$|^sex$/i.test(label)?'gender':/婚姻|marital/i.test(label)?'maritalStatus':/国籍|nationality/i.test(label)?'nationality':/民族|ethnicity/i.test(label)?'ethnicity':/学历|学位|^degree$/i.test(label)?'degree':null;}
  function canonicalOption(value,field){const normalized=optionNorm(value),key=enumKey(field);const found=key&&enums[key].find(group=>group.some(v=>optionNorm(v)===normalized));return found?optionNorm(found[0]):normalized;}
  // Directional containment: a precise status may select an explicitly inclusive
  // website category. An inclusive source never implies a more precise status.
  function optionContains(option,value,field){return enumKey(field)==='politicalStatus'&&/^中共党员\(含预备党员\)$/.test(optionNorm(option))&&['中共党员','中共预备党员'].map(v=>optionNorm(v)).includes(canonicalOption(value,field));}
  const aliases = {
    'basics.name':['姓名','中文姓名','真实姓名','本人姓名','应聘者姓名','申请人姓名','name','fullname','yourname'],
    'basics.idNumber':['证件号码','身份证号码','身份证号','居民身份证号码','身份证件号码','idnumber','identitynumber'],
    'basics.nationality':['国籍','nationality'], 'basics.ethnicity':['民族','ethnicity'],
    'basics.politicalStatus':['政治面貌','本人政治面貌','politicalstatus'],
    'basics.nativePlace':['籍贯'], 'basics.hukouAddress':['户籍','户籍所在地','户籍地址','户口所在地'],
    'basics.address':['现居住地址','现居地址','详细地址','通讯地址','通信地址','联系地址'],
    'basics.expectedCity':['期望工作地','期望工作城市','意向工作地'],
    'basics.emergencyContactName':['紧急联系人姓名'],
    'basics.emergencyContactPhone':['紧急联系方式','紧急联系人电话','紧急联系人手机'],
    'basics.maritalStatus':['婚姻状况'], 'basics.professionalQualification':['职称/职业资格','职称','职业资格'],
    'basics.email':['邮箱','电子邮箱','电子邮件','电子信箱','联系电子信箱','联系邮箱','常用邮箱','email','emailaddress'],
    'basics.phone':['手机','手机号','手机号码','联系电话','phone','mobile','tel'],
    'basics.city':['现居城市','现居地','现居住地','目前居住地','居住城市','city'],
    'basics.wechat':['微信','微信号','wechat'],
    'basics.gender':['性别','gender','sex'], 'basics.birthday':['出生日期','生日','birthday','dateofbirth'],
    'basics.website':['个人网站','个人主页','website','portfolio'],
    'education.*.school':['学校','毕业学校','最高学历毕业院校','毕业院校','院校名称','学校名称','就读院校','就读学校','school','university'],
    'education.*.major':['专业','最高学历所学专业','所学专业','专业名称','major'],
    'education.*.degree':['学历','学历层次','学位','最高学历','degree','educationlevel'],
    'education.*.degreeName':['最高学位','学位名称'],
    'education.*.courses':['主修课程','主要课程','所学课程'],
    'education.*.ranking':['学习成绩排名','成绩排名','专业排名'],
    'education.*.gpa':['绩点','gpa'],
    'work.*.company':['公司','公司名称','实习单位','工作单位','任职单位','单位名称','企业名称','company','employer','companyname'],
    'work.*.position':['职位','职位名称','岗位名称','担任职务','position','jobtitle'],
    'work.*.description':['工作内容','工作描述','实习内容','职责描述','工作职责','岗位职责','实习职责','responsibilities','jobdescription'],
    'projects.*.name':['项目名称','项目标题','projectname'], 'projects.*.role':['项目角色','担任角色','担任职务','项目职务','projectrole'],
    'projects.*.description':['项目描述','项目介绍','项目职责','项目内容','项目经历描述','项目简介','projectdescription'],
    'activities.*.organization':['学校/单位','实践单位','组织名称'],
    'activities.*.department':['部门'], 'activities.*.position':['职位','担任职务'],
    'activities.*.description':['项目描述','实践内容','实践描述'], 'activities.*.honors':['实践荣誉'],
    'awards.*.name':['荣誉名称','奖项名称','获奖名称'], 'awards.*.date':['获奖时间','获奖日期'], 'awards.*.description':['荣誉简述','奖项描述'],
    'skills.*.name':['技能','技能名称'], 'skills.*.level':['掌握程度','熟练程度'],
    'languages.*.level':['英语水平','其他外语水平','外语等级'], 'languages.*.score':['英语水平具体分数','其他外语具体分数','外语成绩'],
    'skills':['技能','专业技能','技能特长','skills'], 'summary':['自我评价','个人简介','自我介绍','summary'],
    '*.startDate':['开始时间','开始日期','项目开始时间','项目开始日期','入学时间','入职时间','startdate'],
    '*.endDate':['结束时间','结束日期','项目结束时间','项目结束日期','毕业时间','最高学历毕业时间','离职时间','enddate']
  };
  const normalize = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s_\-:：*＊（）()]/g,'');
  function labelVariants(value){
    const raw=String(value||'').normalize('NFKC').trim().replace(/^(?:请(?:输入|填写|选择)|填写)(?:您|你)?的?/,'').replace(/^(?:您|你)的/,'').replace(/(?:[（(]?\s*(?:必填|选填|非必填)\s*[）)]?)$/,'');
    const parts=[raw,...Array.from(raw.matchAll(/[（(]([^（）()]+)[）)]/g),m=>m[1]),raw.replace(/[（(][^（）()]*[）)]/g,'')];
    return [...new Set(parts.map(normalize).filter(Boolean))];
  }
  const foreignPerson=f=>/父亲|母亲|配偶|紧急联系人|家庭(?:主要)?成员|推荐人|联系人姓名|联系人电话|联系人手机|推荐者|监护人|emergencycontact|referencecontact/i.test(normalize(f.label)+' '+normalize(f.context));
  const protectedLabel=f=>/验证码|校验码|密码|安全问题|密保|问题[一二三123]答案|security.?question|security.?answer|recovery.?answer|一次性.*码|captcha|password|verification.?code|\botp\b/i.test(f.label||'');
  function namesFor(path){
    if(path.endsWith('.startDate'))return aliases['*.startDate'];
    if(path.endsWith('.endDate'))return aliases['*.endDate'];
    return aliases[path.replace(/\.\d+\./g,'.*.')]||(!path.includes('.')?aliases['basics.'+path]:null)||(path.startsWith('custom.')?[path.slice(7)]:[]);
  }
  function flatten(data, prefix='', out={}) {
    const member=prefix.match(/^family\.([^.]+)$/)?.[1];if(member&&familyRoles[member]&&!data?.relationship)out[prefix+'.relationship']=familyRoles[member][0];
    for (const [key,value] of Object.entries(data || {})) {
      if(!prefix&&key==='_normalization')continue;
      if(!prefix&&key==='fieldAnswers'){
        if(Array.isArray(value))value.forEach((a,i)=>{if(typeof a?.value==='string')out[`fieldAnswers.${i}.value`]=a.value;});
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      if(/^family\.[^.]+$/.test(prefix)&&['IDnmber','IDnumber','IDNumber'].includes(key)&&!Object.hasOwn(data,'idNumber')&&typeof value==='string')out[prefix+'.idNumber']=value;
      if(Array.isArray(value)&&path.endsWith('.courses')&&value.every(v=>typeof v==='string')){out[path]=value.filter(v=>v.trim()).join('、');continue;}
      if (value !== null && typeof value === 'object') flatten(value,path,out);
      else if (typeof value === 'string' || typeof value === 'number') out[path]=String(value);
      if(typeof value==='string'&&(/\.(birthday|startDate|endDate)$/.test(path)||/^awards\.\d+\.date$/.test(path))&&root.ResumeProfile){const date=root.ResumeProfile.parseDate(value);if(date)for(const part of ['year','month','day'])if(date[part])out[path+'Parts.'+part]=String(Number(date[part]));}
    }
    return out;
  }
  function match(field, values) {
    if(isFamilyField(field)){const path=familyPath(field);return path&&Object.hasOwn(values,path)&&String(values[path]).trim()?{path,score:100}:null;}
    field=resolveField(field,values);if(!field)return null;
    if(/^其他(学校|专业)$/.test(field.label||''))return null;
    if(field.ambiguousLabel||field.contextBlocked)return null;
    if(protectedLabel(field))return null;
    const semantic=infer(field);
    if(semantic&&Object.hasOwn(values,semantic.path))return semantic;
    // Visible labels outrank technical names/IDs. A city-* internal ID is not
    // evidence that a hukou/native-place control should receive current city.
    const sources=field.label?[field.label]:(field.tokens||[]);
    const label=normalize(field.label),question=/是否|有无/.test(label),tokens=sources.flatMap(labelVariants).filter(t=>t&&!/^(?:field|cityfield|countyfield|provincefield)[a-z0-9]+$/i.test(t)&&t!=='未命名字段');
    if(!tokens.length)return null;
    const context=normalize(field.context);
    const section=field.section||(/教育|学历|education/.test(context)?'education':/工作|实习|work|employment/.test(context)?'work':/项目|project/.test(context)?'projects':'');
    const ranked=[];
    for (const [path,value] of Object.entries(values)) {
      if(path.startsWith('family.'))continue;
      if(foreignPerson(field)&&path.startsWith('basics.')&&path!==semantic?.path)continue;
      if(recordSections.includes(section)&&/^(education|work|projects|languages|skills|awards|activities)\./.test(path)&&!path.startsWith(section+'.'))continue;
      if(Number.isInteger(field.recordIndex)&&section&&/^(education|work|projects|languages|skills|awards|activities)\./.test(path)&&!path.startsWith(section+'.'+field.recordIndex+'.'))continue;
      if(semantic&&path!==semantic.path&&path!==semantic.path.replace(/^basics\./,''))continue;
      if(/(?:地址|籍贯|户籍|户口|省份|区县)/.test(label)&&path==='basics.city')continue;
      if(/父亲|母亲|配偶|紧急联系人|家庭(?:主要)?成员|推荐人/.test(label)&&path==='basics.name')continue;
      const names=namesFor(path);
      let score=0;
      for (const name of names) for (const token of tokens) {
        const n=normalize(name);
        score=Math.max(score,token===n?100: !question && n.length>=3 && token.includes(n)&&!['basics.city','basics.address','basics.name'].includes(path)?78:0);
      }
      if (!score) continue;
      if (section && path.startsWith(section+'.')) score+=12;
      if (section && /^(education|work|projects|languages|skills|awards|activities)\./.test(path) && !path.startsWith(section+'.')) score-=35;
      ranked.push({path,score});
    }
    ranked.sort((a,b)=>b.score-a.score);
    if (!ranked.length || ranked[0].score<78) return null;
    if (ranked[1] && ranked[0].score-ranked[1].score<10) return null;
    return ranked[0];
  }
  function infer(field){
    if(isFamilyField(field)){const path=familyPath(field);return path?{path,score:100}:null;}
    if(field.ambiguousLabel||field.contextBlocked||protectedLabel(field))return null;
    if(foreignPerson(field)){
      const label=normalize(field.label),key=/^紧急联系人姓名$/.test(label)?'emergencyContactName':/^紧急联系方式$|^紧急联系人(?:电话|手机)$/.test(label)?'emergencyContactPhone':null;
      return key?{path:'basics.'+key,score:100}:null;
    }
    if(field.datePart&&field.datePath)return {path:field.datePath+'Parts.'+field.datePart,score:100};
    if(field.regionRole&&field.regionLevel){
      const group={current:'currentResidence',hukou:'hukou',native:'nativeRegion'}[field.regionRole];
      if(group&&['province','city','county'].includes(field.regionLevel))return {path:field.regionRole==='current'&&field.regionLevel==='city'?'basics.city':`basics.${group}.${field.regionLevel}`,score:100};
    }
    // Only exact known personal labels create global basics fields. Other labels
    // remain scoped answers; e.g. a relative's name must never become basics.name.
    const labels=labelVariants(field.label);
    const hits=Object.entries(aliases).filter(([path,names])=>path.startsWith('basics.')&&names.some(n=>labels.includes(normalize(n))));
    return hits.length===1?{path:hits[0][0],score:100}:null;
  }
  // Keep units and interval boundaries. A shared endpoint is deliberately ambiguous.
  function numericInterval(value,field={}){
    let s=String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[～~—–至]/g,'-');
    const label=String(field.label||'').toLowerCase(),source=String(field.sourcePath||field.path||'').toLowerCase(),salary=/薪|工资|salary|收入/.test(label+source);
    const period=t=>/月薪|月工资|\/月|每月|monthly/.test(t)?'month':/年薪|年工资|\/年|每年|annual|yearly/.test(t)?'year':null;
    const explicitPeriod=period(s),labelPeriod=period(label),sourcePeriod=period(source);
    if(new Set([explicitPeriod,labelPeriod,sourcePeriod].filter(Boolean)).size>1)return null;
    let unit='',factor=1;
    if(salary||/元|[万千k]|rmb/.test(s)){
      const p=explicitPeriod||sourcePeriod||labelPeriod;if(!p)return null;
      unit='salary:'+p;
      const units=s.match(/万|千|k/g)||[];if(new Set(units).size>1)return null;
      const leftScale=s.match(/\d(?:\.\d+)?(万|千|k)(?:元)?-/)?.[1];if(leftScale&&!s.split('-').at(-1).includes(leftScale))return null;
      factor=units[0]==='万'?10000:units.length?1000:/万元/.test(label)?10000:/千元/.test(label)?1000:1;
      s=s.replace(/月薪|年薪|月工资|年工资|每月|每年|monthly|annual|rmb|人民币|元|万|千|k|\/月|\/年/g,'');
    }else if(/年|月|岁|years?|months?/.test(s)||/年限|工龄|年龄|工作经验|years?/.test(label)){
      if(/岁/.test(s)||/年龄/.test(label))unit='age';else unit='duration';
      if(/月|months?/.test(s))factor=1/12;
      if(/年/.test(s)&&/月/.test(s))return null;
      s=s.replace(/years?|months?|年|个月|月|周岁|岁/g,'');
    }else return null;
    const n='(\\d+(?:\\.\\d+)?)';let m,lo,hi,lc=true,hc=true;
    if((m=s.match(new RegExp('^([\\[(])'+n+'[,-]'+n+'([\\])])$')))){lo=+m[2];hi=+m[3];lc=m[1]==='[';hc=m[4]===']';}
    else if((m=s.match(new RegExp('^'+n+'-'+n+'$')))){lo=+m[1];hi=+m[2];}
    else if((m=s.match(new RegExp('^(>=|>|<=|<|≥|≤|超过|大于|不少于|至少|不足|小于|不超过|至多)'+n+'$')))){
      const lower=['>=','>','≥','超过','大于','不少于','至少'].includes(m[1]);lo=lower?+m[2]:-Infinity;hi=lower?Infinity:+m[2];lc=!['>','超过','大于'].includes(m[1]);hc=!['<','不足','小于'].includes(m[1]);
    }else if((m=s.match(new RegExp('^'+n+'(以上|及以上|以下|及以下|以内|不含以上|不含以下)$')))){
      const lower=m[2].endsWith('以上');lo=lower?+m[1]:-Infinity;hi=lower?Infinity:+m[1];lc=hc=!m[2].startsWith('不含');
    }else if((m=s.match(new RegExp('^'+n+'$')))){lo=hi=+m[1];}
    else return null;
    if(lo>hi||lo===hi&&(!lc||!hc))return null;
    return {lo:lo*factor,hi:hi*factor,lc,hc,unit};
  }
  function numericOptions(value,candidates,field={}){
    const point=numericInterval(value,field);
    if(point&&point.lo!==point.hi){const hits=candidates.filter(c=>optionNorm(c.text??c.textContent)===optionNorm(value));return {handled:true,hits,reason:hits.length===1?'明确区间原文匹配':'区间值需选择唯一同文选项'};}
    if(!point||point.lo!==point.hi)return {handled:/\d/.test(String(value))&&/薪|工资|salary|收入/i.test((field.label||'')+(field.sourcePath||field.path||'')),hits:[],reason:'薪资单位或周期不明确，请人工选择'};
    const hits=candidates.filter(c=>{const r=numericInterval(c.text??c.textContent,{...field,path:null,sourcePath:null});return r&&r.unit===point.unit&&(point.lo>r.lo||point.lo===r.lo&&r.lc)&&(point.hi<r.hi||point.hi===r.hi&&r.hc);});
    return {handled:true,hits,reason:hits.length>1?'数值区间边界重叠，请人工选择':hits.length?'唯一同单位区间':'没有同单位的明确区间，请人工选择'};
  }
  function allowedPath(field,path){
    if(isFamilyField(field)){const memberPath=familyPath(field);return !!memberPath&&path===memberPath;}
    if(path.startsWith('family.'))return false;
    if(field.contextBlocked||protectedLabel(field)||foreignPerson(field)&&path.startsWith('basics.')&&path!==infer(field)?.path)return false;
    const section=field.section;if(!['basics',...recordSections].includes(section))return true;
    return path.startsWith(section+'.')&&(!Number.isInteger(field.recordIndex)||section==='basics'||path.startsWith(section+'.'+field.recordIndex+'.'));
  }
  function candidatePaths(field,values){
    field=resolveField(field,values);if(!field||/^其他(学校|专业)$/.test(field.label||''))return [];
    if(field.ambiguousLabel||protectedLabel(field))return [];
    if(recordSections.includes(field.section)&&!Number.isInteger(field.recordIndex))return [];
    const eligible=Object.keys(values).filter(p=>String(values[p]??'').trim()&&allowedPath(field,p)&&!p.startsWith('fieldAnswers.'));
    const known=infer(field);if(known&&eligible.includes(known.path))return [known.path];
    const labels=labelVariants(field.label),question=/是否|有无/.test(field.label||''),scored=eligible.map(path=>{
      const names=namesFor(path).length?namesFor(path):[path.split('.').at(-1)];
      const score=Math.max(0,...labels.flatMap(label=>names.map(name=>{const n=normalize(name);if(n===label)return 100;if(question)return 0;if(n.length>=2&&(label.includes(n)||n.includes(label)))return 60;let overlap=0;for(let i=0;i<label.length-1;i++)if(n.includes(label.slice(i,i+2)))overlap++;return overlap*5;})));return {path,score};
    }).sort((a,b)=>b.score-a.score);
    const exact=scored.filter(c=>c.score===100);if(exact.length)return exact.slice(0,12).map(c=>c.path);
    const relevant=scored.filter(c=>c.score>=Math.max(1,(scored[0]?.score||0)*.5));if(relevant.length)return relevant.slice(0,12).map(c=>c.path);
    // Unknown labels may use only a small, explicitly identified record. Otherwise abstain.
    return !question&&(field.section==='basics'&&eligible.length<=48||field.section&&Number.isInteger(field.recordIndex)&&eligible.length<=12)?eligible:[];
  }
  function resolveField(field,values){
    if(isFamilyField(field)&&!familyPath(field))return null;
    if(field.recordPolicy==='uniqueRecord'){
      let indices=[...new Set(Object.keys(values).filter(p=>p.startsWith(field.section+'.')).map(p=>p.split('.')[1]).filter(i=>/^\d+$/.test(i)))];
      if(field.section==='languages'){
        const english=/^英语/.test(field.label||''),other=/^其他外语/.test(field.label||'');
        if(english||other)indices=indices.filter(i=>{const language=values['languages.'+i+'.language']||values['languages.'+i+'.name'];if(!language)return false;const isEnglish=/^(英语|英文|english|en)$/i.test(String(language).trim());return english?isEnglish:!isEnglish;});
      }
      return indices.length===1?{...field,recordIndex:Number(indices[0])}:null;
    }
    if(field.recordPolicy!=='highestEducation')return field;
    const indices=[...new Set(Object.keys(values).map(p=>p.match(/^education\.(\d+)\./)?.[1]).filter(i=>i!==undefined))];if(!indices.length)return null;
    const rank=value=>{const s=normalize(value);return /博士|doctor|phd/.test(s)?6:/硕士|master/.test(s)?5:/本科|学士|bachelor|undergraduate/.test(s)?4:/大专|专科|associate/.test(s)?3:/高中|中专|职高/.test(s)?2:null;};
    let index=indices[0];if(indices.length>1){const ranked=indices.map(i=>({i,rank:rank(values['education.'+i+'.degree'])}));if(ranked.some(r=>r.rank===null))return null;ranked.sort((a,b)=>b.rank-a.rank);if(ranked[0].rank===ranked[1].rank)return null;index=ranked[0].i;}
    return {...field,section:'education',recordIndex:Number(index)};
  }
  function suggestions(field,values,query=''){
    field=resolveField(field,values);if(!field)return [];
    if(field.ambiguousLabel||field.contextBlocked||protectedLabel(field))return [];
    const known=match(field,values),paths=candidatePaths(field,values),q=normalize(query);
    if(q)for(const [path,value] of Object.entries(values))if(allowedPath(field,path)&&!path.startsWith('fieldAnswers.')&&String(value).trim()&&(normalize(value).includes(q)||normalize(path).includes(q))&&!paths.includes(path))paths.push(path);
    const ordered=[...new Set([known?.path,...paths].filter(Boolean))];
    return ordered.filter(path=>values[path]&&allowedPath(field,path)).slice(0,6).map(path=>({path,reason:known?.path===path?'本地字段匹配':'候选资料，请核对',confirmed:known?.path===path}));
  }
  function referenceData(path,values){
    const value=String(values[path]??''),language=path.match(/^(languages\.\d+)\.level$/);
    if(language)return {sourceValue:value,kind:'language',level:value,score:String(values[language[1]+'.score']??'')};
    const region=path==='basics.city'?'basics.currentResidence':path==='basics.hukouAddress'?'basics.hukou':path==='basics.nativePlace'?'basics.nativeRegion':null;
    if(region){const parts=['province','city','county'].map(k=>String(values[region+'.'+k]||'')).filter(Boolean);if(parts.length>=2&&(/Address$|Place$/.test(path)||optionNorm(parts[1]).replace(/市$/,'')===optionNorm(value).replace(/市$/,'')))return {sourceValue:value,kind:'region',parts};}
    const skill=path.match(/^(skills\.\d+)\.name$/),category=skill&&values[skill[1]+'.category'];
    return {sourceValue:value,kind:/^basics\.(?:city|hukouAddress|nativePlace|expectedCity)$/.test(path)?'region':'exact',parts:category?[String(category),value]:value.split(/\s*[>＞→]\s*/).filter(Boolean)};
  }
  root.ResumeMatcher={familyRoles,familyFields,familyRole,familyPath,isFamilyField,recordSections,flatten,match,infer,normalize,labelVariants,suggestions,resolveField,referenceData,enums,enumKey,canonicalOption,optionContains,numericInterval,numericOptions,allowedPath,candidatePaths};
  if (typeof module!=='undefined') module.exports=root.ResumeMatcher;
})(globalThis);
