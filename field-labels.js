(function(root){
  // 共享字段中文标签：扩展弹窗、桌面资料编辑器与 PDF 导入预览共用同一份字典，避免多处漂移。
  // 各界面可在此基础上有少量上下文覆盖（如弹窗的“现居城市”、PDF 预览的“手机”）。
  const sections={basics:'基本信息',education:'教育经历',work:'工作 / 实习',projects:'项目经历',languages:'外语水平',awards:'荣誉奖项',activities:'实践经历',skills:'技能与简介',custom:'补充信息',fieldAnswers:'网站补充答案',other:'其他资料'};
  const fields={expectedCity:'期望工作地',emergencyContactName:'紧急联系人姓名',emergencyContactPhone:'紧急联系方式',organization:'学校 / 单位',department:'部门',honors:'实践荣誉',level:'等级 / 掌握程度',score:'具体分数',date:'日期',courses:'主修课程',name:'姓名',email:'电子邮箱',phone:'手机号码',city:'所在城市',gender:'性别',birthday:'出生日期',website:'个人主页',wechat:'微信号',idNumber:'身份证号码',idCard:'身份证号码',nationality:'国籍',ethnicity:'民族',politicalStatus:'政治面貌',maritalStatus:'婚姻状况',hukouAddress:'户籍地址',hukou:'户籍地区',nativePlace:'籍贯',nativeRegion:'籍贯地区',address:'现居地址',currentResidence:'现居地区',province:'省 / 直辖市',county:'区 / 县',path:'完整地区',school:'学校名称',major:'专业',degree:'学历 / 学位',startDate:'开始时间',endDate:'结束时间',gpa:'绩点',ranking:'成绩排名',company:'公司名称',position:'职位名称',description:'内容与成果',role:'担任角色',url:'相关链接',summary:'个人简介',language:'语言能力',certificates:'证书',label:'问题名称',value:'回答',code:'地区代码'};
  root.ResumeFieldLabels={sections,fields};if(typeof module!=='undefined')module.exports=root.ResumeFieldLabels;
})(typeof globalThis!=='undefined'?globalThis:this);
