(function(root) {
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
  const aliases = {
    'basics.name':['姓名','中文姓名','真实姓名','本人姓名','应聘者姓名','申请人姓名','name','fullname','yourname'],
    'basics.idNumber':['身份证号码','身份证号','居民身份证号码','身份证件号码','idnumber','identitynumber'],
    'basics.nationality':['国籍','nationality'], 'basics.ethnicity':['民族','ethnicity'],
    'basics.politicalStatus':['政治面貌','politicalstatus'],
    'basics.nativePlace':['籍贯'], 'basics.hukouAddress':['户籍','户籍所在地','户籍地址','户口所在地'],
    'basics.address':['现居住地址','现居地址','详细地址','通讯地址','联系地址'],
    'basics.maritalStatus':['婚姻状况'], 'basics.professionalQualification':['职称/职业资格','职称','职业资格'],
    'basics.email':['邮箱','电子邮箱','电子邮件','电子信箱','联系电子信箱','email','emailaddress'],
    'basics.phone':['手机','手机号','手机号码','联系电话','phone','mobile','tel'],
    'basics.city':['现居城市','现居地','现居住地','居住城市','city'],
    'basics.wechat':['微信','微信号','wechat'],
    'basics.gender':['性别','gender','sex'], 'basics.birthday':['出生日期','生日','birthday','dateofbirth'],
    'basics.website':['个人网站','个人主页','website','portfolio'],
    'education.*.school':['学校','毕业院校','院校名称','学校名称','school','university'],
    'education.*.major':['专业','所学专业','专业名称','major'],
    'education.*.degree':['学历','学位','最高学历','degree','educationlevel'],
    'education.*.gpa':['绩点','gpa'],
    'work.*.company':['公司','公司名称','实习单位','工作单位','company','employer'],
    'work.*.position':['职位','职位名称','岗位名称','担任职务','position','jobtitle'],
    'work.*.description':['工作内容','工作描述','实习内容','职责描述','responsibilities'],
    'projects.*.name':['项目名称','项目标题','projectname'], 'projects.*.role':['项目角色','担任角色','担任职务','项目职务','projectrole'],
    'projects.*.description':['项目描述','项目介绍','项目职责','项目内容','项目经历描述','projectdescription'],
    'skills':['技能','专业技能','技能特长','skills'], 'summary':['自我评价','个人简介','自我介绍','summary'],
    '*.startDate':['开始时间','开始日期','项目开始时间','项目开始日期','入学时间','入职时间','startdate'],
    '*.endDate':['结束时间','结束日期','项目结束时间','项目结束日期','毕业时间','离职时间','enddate']
  };
  const normalize = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s_\-:：*＊（）()]/g,'');
  function flatten(data, prefix='', out={}) {
    for (const [key,value] of Object.entries(data || {})) {
      if(!prefix&&key==='_normalization')continue;
      if(!prefix&&key==='fieldAnswers'){
        if(Array.isArray(value))value.forEach((a,i)=>{if(typeof a?.value==='string')out[`fieldAnswers.${i}.value`]=a.value;});
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') flatten(value,path,out);
      else if (typeof value === 'string' || typeof value === 'number') out[path]=String(value);
      if(typeof value==='string'&&/\.(birthday|startDate|endDate)$/.test(path)&&root.ResumeProfile){const date=root.ResumeProfile.parseDate(value);if(date)for(const part of ['year','month','day'])if(date[part])out[path+'Parts.'+part]=String(Number(date[part]));}
    }
    return out;
  }
  function match(field, values) {
    if(field.ambiguousLabel)return null;
    if(/验证码|校验码|密码|captcha|password|verification.?code|\botp\b/i.test(field.label||''))return null;
    const semantic=infer(field);
    if(semantic&&Object.hasOwn(values,semantic.path))return semantic;
    // Visible labels outrank technical names/IDs. A city-* internal ID is not
    // evidence that a hukou/native-place control should receive current city.
    const sources=field.label?[field.label]:(field.tokens||[]);
    const label=normalize(field.label),tokens=sources.map(normalize).filter(t=>t&&!/^(?:field|cityfield|countyfield|provincefield)[a-z0-9]+$/i.test(t)&&t!=='未命名字段');
    if(!tokens.length)return null;
    const context=normalize(field.context);
    const section=field.section||(/教育|学历|education/.test(context)?'education':/工作|实习|work|employment/.test(context)?'work':/项目|project/.test(context)?'projects':'');
    const ranked=[];
    for (const [path,value] of Object.entries(values)) {
      if(['education','work','projects'].includes(section)&&/^(education|work|projects)\./.test(path)&&!path.startsWith(section+'.'))continue;
      if(Number.isInteger(field.recordIndex)&&section&&/^(education|work|projects)\./.test(path)&&!path.startsWith(section+'.'+field.recordIndex+'.'))continue;
      const pattern=path.replace(/\.\d+\./g,'.*.');
      if(semantic&&path!==semantic.path&&path!==semantic.path.replace(/^basics\./,''))continue;
      if(/(?:地址|籍贯|户籍|户口|省份|区县)/.test(label)&&path==='basics.city')continue;
      if(/父亲|母亲|配偶|紧急联系人|家庭成员|推荐人/.test(label)&&path==='basics.name')continue;
      let names=aliases[pattern] || (!path.includes('.')?aliases['basics.'+path]:null) || (path.startsWith('custom.')?[path.slice(7)]:[]);
      if (path.endsWith('.startDate')) names=aliases['*.startDate'];
      if (path.endsWith('.endDate')) names=aliases['*.endDate'];
      let score=0;
      for (const name of names) for (const token of tokens) {
        const n=normalize(name);
        score=Math.max(score,token===n?100: n.length>=3 && token.includes(n)&&!['basics.city','basics.address','basics.name'].includes(path)?78:0);
      }
      if (!score) continue;
      if (section && path.startsWith(section+'.')) score+=12;
      if (section && /^(education|work|projects)\./.test(path) && !path.startsWith(section+'.')) score-=35;
      ranked.push({path,score});
    }
    ranked.sort((a,b)=>b.score-a.score);
    if (!ranked.length || ranked[0].score<78) return null;
    if (ranked[1] && ranked[0].score-ranked[1].score<10) return null;
    return ranked[0];
  }
  function infer(field){
    if(field.ambiguousLabel)return null;
    if(field.datePart&&field.datePath)return {path:field.datePath+'Parts.'+field.datePart,score:100};
    if(field.regionRole&&field.regionLevel){
      const group={current:'currentResidence',hukou:'hukou',native:'nativeRegion'}[field.regionRole];
      if(group&&['province','city','county'].includes(field.regionLevel))return {path:field.regionRole==='current'&&field.regionLevel==='city'?'basics.city':`basics.${group}.${field.regionLevel}`,score:100};
    }
    // Only exact known personal labels create global basics fields. Other labels
    // remain scoped answers; e.g. a relative's name must never become basics.name.
    const label=normalize(field.label).replace(/^(请输入|请填写)(您的|你的)?/,'').replace(/必填|选填/g,'');
    const hits=Object.entries(aliases).filter(([path,names])=>path.startsWith('basics.')&&names.some(n=>normalize(n)===label));
    return hits.length===1?{path:hits[0][0],score:100}:null;
  }
  root.ResumeMatcher={flatten,match,infer,normalize,enums,enumKey,canonicalOption};
  if (typeof module!=='undefined') module.exports=root.ResumeMatcher;
})(globalThis);
