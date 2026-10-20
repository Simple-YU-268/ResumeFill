const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'resumefill-test-'));
 const testExtension=path.join(profile,'extension');fs.mkdirSync(testExtension);
 for(const f of fs.readdirSync(__dirname).filter(f=>/\.(js|html|css|json)$/.test(f)&&!['resume.json'].includes(f)))fs.copyFileSync(path.join(__dirname,f),path.join(testExtension,f));
 fs.cpSync(path.join(__dirname,'data'),path.join(testExtension,'data'),{recursive:true});
 // Open only the test copy's shadow root so Playwright can inspect the assistant.
 const inlineFile=path.join(testExtension,'inline.js');fs.writeFileSync(inlineFile,fs.readFileSync(inlineFile,'utf8').replace("mode:'closed'","mode:'open'"));
 const testManifest=JSON.parse(fs.readFileSync(path.join(testExtension,'manifest.json'),'utf8'));
 // Toolbar activeTab grants cannot be simulated by opening popup.html as a tab.
 // Grant only the local fixture origin in this throwaway test copy.
 testManifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(path.join(testExtension,'manifest.json'),JSON.stringify(testManifest));
 let aiCalls=[];
 const server=http.createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1);if(file==='v1/chat/completions'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const payload=JSON.parse(body),packet=JSON.parse(payload.messages[1].content);aiCalls.push({packet,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(packet.kind==='options'?{candidateId:packet.candidates.find(c=>c.text==='线上领取')?.id||null,confidence:.99,reason:'Synthetic option mapping'}:{matches:packet.fields.map(f=>({fieldId:f.id,path:'basics.email',confidence:.99,reason:'Synthetic email mapping'}))})}}]}));});return;}if(!['demo-advanced.html','demo-advanced.js','style.css'].includes(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,file)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const gatewayToken='test-gateway-local-token'.padEnd(64,'x');const pairCode='test-pairing-code'.padEnd(64,'p');const gateway=require('./local-server/server.cjs').createGateway({port:0,token:gatewayToken,pairing:{redeem:code=>code===pairCode?gatewayToken:null},upstream:{enabled:true,endpoint:`http://127.0.0.1:${server.address().port}/v1/chat/completions`,model:'mock-provider',apiKey:'mock-provider-key',jsonMode:true}});const gatewayAddress=await gateway.listen();
 const context=await chromium.launchPersistentContext(profile,{...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:process.env.BROWSER_CHANNEL||'msedge'}),headless:true,args:[`--load-extension=${testExtension}`,`--disable-extensions-except=${testExtension}`]});context.setDefaultTimeout(7000);
 try{
  const manager=await context.newPage();await manager.goto('edge://extensions/');
  const id=await manager.evaluate(()=>new Promise(resolve=>chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true},items=>resolve(items.find(e=>e.name.includes('ResumeFill'))?.id))));
  if(!id)throw Error('Extension not installed');
  const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);
  const resume={basics:{name:'界面测试',email:'ui@example.com',gender:'女',city:'南京',region:'江苏省 > 南京市'},education:[{school:'UI 学校 A',major:'专业 A',degree:'本科',startDate:'2020-09',endDate:'2024-07'},{school:'UI 学校 B',major:'专业 B',degree:'硕士',startDate:'2024-09',endDate:'2026-10'}]};
  resume.basics.hukouAddress='南京鼓楼';resume.basics.birthday='2000年2月29日';
  await options.locator('#json').fill(JSON.stringify(resume));await options.locator('#save').click();await options.locator('#status').filter({hasText:'已保存到本地'}).waitFor();
  const enriched=await options.evaluate(async()=>(await chrome.storage.local.get('resume')).resume);assert.equal(enriched.basics.hukou.province,'江苏省');assert.equal(enriched.basics.hukou.county,'鼓楼区');assert.equal(enriched.basics.hukouAddress,'南京鼓楼');assert.equal(enriched.basics.birthday,'2000-02-29');
  await options.locator('#demoAdapters').click();await options.locator('#saveAdapters').click();await options.locator('#status').filter({hasText:'站点规则已保存'}).waitFor();
  const target=await context.newPage();await target.goto(`http://127.0.0.1:${server.address().port}/demo-advanced.html`);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  // Advanced tools are grouped in a collapsed section in the 0.16 UI; open once for real clicks.
  await popup.locator('#agentTools').evaluate(el=>{el.open=true;});
  // A real toolbar popup retains the originating active tab. Opening its HTML as a
  // test tab does not; provide only that browser query result through the test tab.
  const tabs=await options.evaluate(()=>chrome.tabs.query({}));const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));
  await popup.evaluate(tab=>{chrome.tabs.query=async()=>[tab];},tab);
  await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'待补经历 1'}).waitFor();
  await popup.locator('#prepare').click();await popup.locator('#summary').filter({hasText:'待补经历 0'}).waitFor();
  await popup.locator('#saveCards').check();await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'回读一致 15'}).waitFor();
  await popup.locator('#resultCard').filter({hasText:'回读一致 15'}).waitFor();
  assert.equal(await target.locator('#full-name').inputValue(),'界面测试');assert.deepEqual(await target.evaluate(()=>window.demoSaved.map(r=>r.school)),['UI 学校 A','UI 学校 B']);
  await popup.locator('#remember').click();await popup.locator('#status').filter({hasText:'表单结构'}).waitFor();
  const checkpoint=await options.evaluate(async()=> (await chrome.storage.local.get('lastCheckpoint')).lastCheckpoint);assert.equal(checkpoint.counts.verified,15);assert.equal(checkpoint.submission_verified,false);
  // Configure only a loopback mock, using real extension storage and service worker.
  await options.evaluate(async endpoint=>{await chrome.storage.local.set({aiSettings:{enabled:true,endpoint,model:'mock',jsonMode:true}});await chrome.storage.session.set({aiApiKey:'synthetic-key'});},`http://127.0.0.1:${server.address().port}/v1/chat/completions`);
  await options.locator('#testAI').click();await options.locator('#status').filter({hasText:'连接和路径协议通过'}).waitFor();
  await target.evaluate(()=>{const wrap=document.createElement('div');wrap.className='form-row';wrap.innerHTML='<label for="unknown">Unclassified contact channel</label><input id="unknown">';document.querySelector('#basics').append(wrap);});
  await popup.locator('#incremental').click();await popup.locator('#summary').filter({hasText:'16 个字段'}).waitFor();
  assert.equal(await popup.locator('#fields select').last().count(),1);
  await popup.locator('#aiPreview').click();assert.ok(!(await popup.locator('#aiPayload').textContent()).includes('ui@example.com'));
  await popup.locator('#aiRun').click();await popup.locator('#status').filter({hasText:'AI 建议 1 项'}).waitFor();
  assert.equal(await target.locator('#unknown').inputValue(),'');
  await popup.locator('#aiApply').click();await popup.locator('#saveCards').uncheck();await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'回读一致 1'}).waitFor();
  assert.equal(await target.locator('#unknown').inputValue(),'ui@example.com');assert.equal(aiCalls.length,2);assert.equal(aiCalls[1].packet.fields.length,1);assert.equal(aiCalls[1].authorization,'Bearer synthetic-key');assert.ok(!JSON.stringify(aiCalls).includes('ui@example.com'));
  await target.locator('#unknown').fill('');await popup.locator('#incremental').click();await popup.locator('#summary').filter({hasText:'16 个字段'}).waitFor();await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'回读一致 1'}).waitFor();assert.equal(await target.locator('#unknown').inputValue(),'ui@example.com');
  await target.evaluate(()=>{const wrap=document.createElement('div');wrap.className='form-row';wrap.innerHTML='<label for="certificate">职称证书编号</label><input id="certificate">';document.querySelector('#basics').append(wrap);});
  await popup.locator('#incremental').click();await popup.locator('#summary').filter({hasText:'17 个字段'}).waitFor();
  await popup.getByRole('textbox',{name:'职称证书编号 补充资料',exact:true}).fill('CERT-2026-001');await popup.locator('#saveAnswers').click();await popup.locator('#status').filter({hasText:'补充资料保存到简历 JSON'}).waitFor();
  const learned=await options.evaluate(async()=>(await chrome.storage.local.get('resume')).resume);assert.equal(learned.fieldAnswers[0].value,'CERT-2026-001');assert.equal(learned.fieldAnswers[0].label,'职称证书编号');
  await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'17 个字段'}).waitFor();assert.equal(await popup.getByRole('combobox',{name:'职称证书编号 对应简历字段',exact:true}).inputValue(),'fieldAnswers.0.value');
  await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'请核对网页'}).waitFor();assert.equal(await target.locator('#certificate').inputValue(),'CERT-2026-001');
  await options.evaluate(async()=>{const {resume}=await chrome.storage.local.get('resume');resume.basics.gender='';await chrome.storage.local.set({resume});});
  await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'17 个字段'}).waitFor();
  assert.equal(await popup.getByRole('combobox',{name:'性别 对应简历字段',exact:true}).inputValue(),'basics.gender');
  // 0.16 UX: options show human labels with the raw path on the secondary title; unresolved rows sort first.
  assert.equal(await popup.getByRole('combobox',{name:'性别 对应简历字段',exact:true}).locator('option[value="basics.gender"]').innerText(),'基本信息 · 性别');
  assert.ok((await popup.locator('#fields .row').first().innerText()).includes('性别'),'unresolved field must sort to the top');
  await popup.getByRole('textbox',{name:'性别 补充资料',exact:true}).fill('女');await popup.locator('#saveAnswers').click();await popup.locator('#status').filter({hasText:'补充资料保存到简历 JSON'}).waitFor();
  const fixed=await options.evaluate(async()=>(await chrome.storage.local.get('resume')).resume);assert.equal(fixed.basics.gender,'女');assert.equal(fixed.fieldAnswers.length,1);
  await target.evaluate(()=>{const wrap=document.createElement('div');wrap.className='form-row';wrap.innerHTML='<label for="identity">身份证号码</label><input id="identity"><label for="new-answer">校内特殊荣誉</label><input id="new-answer">';document.querySelector('#basics').append(wrap);});
  await target.locator('#identity').fill('SYNTHETIC-ID');
  const assistant=target.locator('[data-resumefill-assistant]');await assistant.getByRole('button',{name:'保存到 basics.idNumber',exact:true}).click();await assistant.getByText('已保存到本地简历 JSON，下次自动匹配。').waitFor();
  assert.equal(await options.evaluate(async()=>(await chrome.storage.local.get('resume')).resume.basics.idNumber),'SYNTHETIC-ID');
  await target.locator('#identity').fill('');await assistant.getByRole('button',{name:'basics.idNumber：SYNTHETIC-ID',exact:true}).click();await target.waitForFunction(()=>document.querySelector('#identity').value==='SYNTHETIC-ID');
  await target.locator('#new-answer').fill('Synthetic award');await assistant.getByRole('button',{name:'创建新 JSON 项目并保存',exact:true}).click();await assistant.getByText('已保存到本地简历 JSON，下次自动匹配。').waitFor();
  const inlineSaved=await options.evaluate(async()=>(await chrome.storage.local.get('resume')).resume);assert.ok(inlineSaved.fieldAnswers.some(a=>a.label==='校内特殊荣誉'&&a.value==='Synthetic award'));
  await target.locator('#full-name').fill('界面');await assistant.getByRole('button',{name:'basics.name：界面测试',exact:true}).click();await target.waitForFunction(()=>document.querySelector('#full-name').value==='界面测试');
  await assistant.waitFor({state:'hidden'});
  await options.evaluate(async()=>{const {resume}=await chrome.storage.local.get('resume');resume.custom||={};resume.custom['领取方式']='电子';await chrome.storage.local.set({resume});});
  await target.evaluate(()=>{const wrap=document.createElement('div');wrap.className='form-row';wrap.innerHTML='<label for="delivery">领取方式</label><select id="delivery"><option value="">请选择</option><option value="online">线上领取</option><option value="offline">线下领取</option></select>';document.querySelector('#basics').append(wrap);});
  await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'20 个字段'}).waitFor();await popup.locator('#fill').click();
  const connection=path.join(profile,'resumefill-pairing.json');fs.writeFileSync(connection,JSON.stringify({kind:'resumefill-pairing',version:1,endpoint:`http://127.0.0.1:${gatewayAddress.port}/v1/chat/completions`,model:'resumefill-local',code:pairCode,expiresAt:Date.now()+600000}));await options.locator('#gatewayImport').setInputFiles(connection);await options.locator('#status').filter({hasText:'配对成功'}).waitFor();await options.locator('#saveAI').click();await options.locator('#status').filter({hasText:'AI 已启用'}).waitFor();assert.equal(await options.evaluate(async()=>(await chrome.storage.session.get('aiApiKey')).aiApiKey),'test-gateway-local-token'.padEnd(64,'x'),'pairing delivers the gateway token into session storage only');
  // Legacy long-token connection files remain accepted for standalone gateways.
  const legacy=path.join(profile,'connection.json');fs.writeFileSync(legacy,JSON.stringify({kind:'resumefill-local-gateway',version:1,endpoint:`http://127.0.0.1:${gatewayAddress.port}/v1/chat/completions`,model:'resumefill-local',token:gatewayToken}));await options.locator('#gatewayImport').setInputFiles(legacy);await options.locator('#status').filter({hasText:'本地连接已载入'}).waitFor();await options.locator('#saveAI').click();await options.locator('#status').filter({hasText:'AI 已启用'}).waitFor();
  // Paste-based one-step pairing from the desktop "copy pairing code" action.
  await options.locator('#pairingCode').fill(JSON.stringify({kind:'resumefill-pairing',version:1,endpoint:`http://127.0.0.1:${gatewayAddress.port}/v1/chat/completions`,model:'resumefill-local',code:pairCode,expiresAt:Date.now()+600000}));await options.locator('#pairDesktop').click();await options.locator('#status').filter({hasText:'配对成功，已连接桌面端'}).waitFor();await options.locator('#desktopState').filter({hasText:'已连接桌面端'}).waitFor();assert.equal(await options.evaluate(async()=>(await chrome.storage.session.get('aiApiKey')).aiApiKey),gatewayToken,'paste pairing stores the token in session only');
  await popup.getByRole('combobox',{name:'领取方式 网页真实选项',exact:true}).waitFor();await popup.locator('#shareValues').check();await popup.getByRole('button',{name:'AI 建议真实选项',exact:true}).click();await popup.locator('#status').filter({hasText:'建议：线上领取'}).waitFor();assert.equal(await target.locator('#delivery').inputValue(),'');await popup.getByRole('button',{name:'填写并记住此选项',exact:true}).click();await popup.locator('#status').filter({hasText:'记住选项映射'}).waitFor();assert.equal(await target.locator('#delivery').inputValue(),'online');
  await target.locator('#delivery').selectOption('');await popup.locator('#incremental').click();await popup.locator('#summary').filter({hasText:'20 个字段'}).waitFor();await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'请核对网页'}).waitFor();assert.equal(await target.locator('#delivery').inputValue(),'online');
  await target.locator('#full-name').fill('');await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'20 个字段'}).waitFor();
  await popup.locator('#agentStart').click();await popup.locator('#agentStatus').filter({hasText:'等待补充或核对'}).waitFor({timeout:20000});assert.equal(await target.locator('#full-name').inputValue(),'界面测试');
  const agentCheckpoint=await options.evaluate(async()=>(await chrome.storage.session.get('agentRun')).agentRun);assert.ok(agentCheckpoint.state.events.some(e=>e.tool==='fill_fields'));assert.ok(agentCheckpoint.state.events.some(e=>e.tool==='observe_page'));assert.equal(agentCheckpoint.state.proposals.length,1);assert.equal(agentCheckpoint.state.submissionVerified,false);assert.ok(!JSON.stringify(agentCheckpoint).includes('ui@example.com'));
  await popup.locator('#agentApply').click();await popup.locator('#agentResume').click();await popup.locator('#agentStatus').filter({hasText:'授权字段已验证'}).waitFor({timeout:20000});
  const completedAgent=await options.evaluate(async()=>(await chrome.storage.session.get('agentRun')).agentRun);assert.equal(completedAgent.state.status,'completed');assert.equal(completedAgent.state.counts.verified,20);assert.equal(completedAgent.state.submissionVerified,false);
  await target.locator('#full-name').fill('');await popup.locator('#scan').click();await popup.locator('#summary').filter({hasText:'20 个字段'}).waitFor();await popup.locator('#agentStart').click();await popup.locator('#agentStop').click();await popup.locator('#agentStatus').filter({hasText:'已停止'}).waitFor({timeout:12000});const stoppedAgent=await options.evaluate(async()=>(await chrome.storage.session.get('agentRun')).agentRun);assert.equal(stoppedAgent.state.status,'cancelled');
  await target.evaluate(()=>{const root=document.createElement('section');root.id='scope-fixture';root.innerHTML='<h2>范围测试项目</h2><label>项目名称<input id="scope-project"></label>';document.body.append(root);});
  await options.evaluate(async()=>{const {resume}=await chrome.storage.local.get('resume');resume.projects=[{name:'Synthetic scoped project'}];await chrome.storage.local.set({resume,adapters:{version:1,adapters:[]}});});
  await popup.locator('#scan').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);assert.ok(!(await popup.locator('#status').innerText()).startsWith('操作失败'),await popup.locator('#status').innerText());assert.ok((await popup.locator('#fields .row').count())>1);
  await popup.getByText('只处理选定区块',{exact:true}).click();await popup.locator('#scopeList').click();await popup.locator('#status').filter({hasText:'选择容器后可先定位'}).waitFor();
  const rootId=await popup.locator('#scopeRoot option').evaluateAll(options=>options.find(o=>o.textContent.includes('范围测试项目'))?.value);assert.ok(rootId);await popup.locator('#scopeRoot').selectOption(rootId);await popup.locator('#scopeSection').selectOption('projects');await popup.locator('#scopeApply').click();await popup.locator('#summary').filter({hasText:'1 个字段'}).waitFor();
  const mapping=popup.getByRole('combobox',{name:'项目名称 对应简历字段',exact:true});assert.equal(await mapping.inputValue(),'projects.0.name');assert.deepEqual(await mapping.locator('option').evaluateAll(options=>options.map(o=>o.value)),['','projects.0.name']);await popup.locator('#fill').click();await popup.locator('#status').filter({hasText:'请核对网页'}).waitFor();assert.equal(await target.locator('#scope-project').inputValue(),'Synthetic scoped project');
  await popup.locator('#scopeClear').click();await popup.waitForFunction(()=>!document.getElementById('scan').disabled);assert.ok(!(await popup.locator('#status').innerText()).startsWith('操作失败'),await popup.locator('#status').innerText());assert.ok((await popup.locator('#fields .row').count())>1);
  assert.deepEqual(errors,[]);console.log('PASS: installed extension, gateway/options, JSON reuse, Agent verify/fill/observe/model-propose/pause/resume with 20 fields, selected-container UI and restricted paths, stop, no submission');
 }finally{await context.close();await gateway.close();server.close();/* Temp profile contains only synthetic data; left for diagnostic inspection. */}
})().catch(e=>{console.error(e);process.exitCode=1});
