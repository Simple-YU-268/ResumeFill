const $=id=>document.getElementById(id);
const status=text=>$('status').textContent=text;
let desktopEditorDirty=false,desktopAIEditorDirty=false;
const profileEditor=new ProfileEditor($('profileEditor'),()=>{desktopEditorDirty=true;try{$('json').value=JSON.stringify(profileEditor.value(),null,2);}catch{}});
function showProfile(value){$('json').value=JSON.stringify(value,null,2);profileEditor.load(value);}
$('json').addEventListener('change',()=>safe(async()=>{profileEditor.load(parse($('json').value));desktopEditorDirty=true;}));
$('json').addEventListener('input',()=>desktopEditorDirty=true);
for(const id of ['aiEnabled','aiEndpoint','aiModel','aiKey','aiJson','aiProvider','aiThinking'])for(const event of ['input','change'])$(id).addEventListener(event,()=>desktopAIEditorDirty=true);
addEventListener('resumefill-desktop-connected',async()=>{const {aiSettings,resume}=await chrome.storage.local.get(['aiSettings','resume']);if(!desktopEditorDirty&&resume)showProfile(resume);if(aiSettings&&!desktopAIEditorDirty){$('aiEnabled').checked=!!aiSettings.enabled;$('aiEndpoint').value=aiSettings.endpoint||'';$('aiModel').value=aiSettings.model||'';$('aiJson').checked=!!aiSettings.jsonMode;$('aiThinking').value=aiSettings.thinkingMode||'auto';}void refreshDesktopState();});
function parse(text){const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object'||!data.basics||typeof data.basics!=='object'||Array.isArray(data.basics))throw Error('JSON 顶层必须是对象，并包含 basics 对象');for(const key of ['education','work','projects'])if(data[key]&&!Array.isArray(data[key]))throw Error(key+' 必须是数组');return data;}
async function safe(fn){try{await fn();}catch(e){status('操作失败：'+e.message);}}
async function sample(){return await (await fetch('sample.json')).json();}
safe(async()=>{window.ResumeRegions=await(await fetch('data/regions.json')).json();const {resume}=await chrome.storage.local.get('resume');showProfile(resume||await sample());status(resume?'已载入本地简历。':'当前为示例，请替换为真实信息后保存。');});
$('save').onclick=()=>safe(async()=>{if(profileEditor.errors.size)profileEditor.value();const enriched=await ResumeProfile.enrich(parse($('json').value));await chrome.storage.local.set({resume:enriched.resume});showProfile(enriched.resume);desktopEditorDirty=false;status('已保存到本地。地区/日期整理 '+enriched.changes.length+' 项，待确认 '+enriched.issues.length+' 项；可在插件的整理地区与日期中选择。');});
$('sample').onclick=()=>safe(async()=>{desktopEditorDirty=true;showProfile(await sample());status('示例已载入编辑器，点击保存后生效。');});
$('import').onchange=()=>safe(async()=>{const file=$('import').files[0];if(!file)return;const data=parse(await file.text());desktopEditorDirty=true;showProfile(data);status('已导入编辑器，点击保存后生效。');});
$('export').onclick=()=>safe(async()=>{if(profileEditor.errors.size)profileEditor.value();const data=parse($('json').value);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='resume.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已导出编辑器中的 JSON。');});
$('clearRules').onclick=()=>safe(async()=>{await chrome.storage.local.remove('rules');status('已清除字段匹配记忆。');});
safe(async()=>{const {adapters}=await chrome.storage.local.get('adapters');$('adapters').value=JSON.stringify(adapters||{version:1,adapters:[]},null,2);});
$('saveAdapters').onclick=()=>safe(async()=>{const adapters=ResumeAdapters.validate(JSON.parse($('adapters').value));await chrome.storage.local.set({adapters});status('站点规则已保存；刷新招聘页面后重新扫描。');});
$('importAdapters').onchange=()=>safe(async()=>{const file=$('importAdapters').files[0];if(!file)return;const data=ResumeAdapters.validate(JSON.parse(await file.text()));$('adapters').value=JSON.stringify(data,null,2);status('规则已导入编辑器，点击保存后生效。');});
$('demoAdapters').onclick=()=>safe(async()=>{$('adapters').value=JSON.stringify(await(await fetch('sample-adapters.json')).json(),null,2);status('本地演示规则已载入；点击保存后使用 demo-advanced.html 测试。');});
safe(async()=>{const {aiSettings={}}=await chrome.storage.local.get('aiSettings');$('aiEnabled').checked=!!aiSettings.enabled;$('aiEndpoint').value=aiSettings.endpoint||'';$('aiModel').value=aiSettings.model||'';$('aiJson').checked=!!aiSettings.jsonMode;});
$('saveAI').onclick=()=>safe(async()=>{
  const config=ResumeAI.settings({enabled:$('aiEnabled').checked,endpoint:$('aiEndpoint').value,model:$('aiModel').value,jsonMode:$('aiJson').checked,thinkingMode:$('aiThinking').value});
  if(config.enabled&&!await chrome.permissions.request({origins:[config.originPattern]}))throw Error('服务域名未授权，未保存设置');
  const {aiSettings:previous}=await chrome.storage.local.get('aiSettings');
  if(config.enabled&&(!previous?.endpoint||new URL(previous.endpoint).origin!==new URL(config.endpoint).origin))await chrome.storage.session.remove('aiApiKey');
  await chrome.storage.local.set({aiSettings:config});
  if($('aiKey').value){await chrome.storage.session.set({aiApiKey:ResumeAI.normalizeKey($('aiKey').value)});$('aiKey').value='';}
  status(config.enabled?'AI 已启用；默认只发送字段描述与 JSON 路径。':'AI 已关闭');refreshDesktopState();
});
$('clearKey').onclick=()=>safe(async()=>{await chrome.storage.session.remove('aiApiKey');$('aiKey').value='';status('会话密钥已清除');});
$('testAI').onclick=()=>safe(async()=>{status('正在用虚构邮箱字段测试连接…');const r=await chrome.runtime.sendMessage({type:'RF_AI_TEST',requestId:crypto.randomUUID()});if(r?.error)throw Error(r.error);status(r.accepted?.some(m=>m.path==='basics.email')?'连接和路径协议通过；仅使用虚构字段，未发送简历。'+(r.gateway?' 服务模式：'+r.gateway.engine:''):'服务已响应，但虚构字段未获得有效匹配');});

async function applyConnection(data){const u=new URL(data.endpoint);if(data.version!==1||u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/v1/chat/completions'||u.username||u.password||u.search||u.hash)throw Error('不是有效的本地服务连接文件');
 if(data.kind==='resumefill-pairing'){
  if(typeof data.code!=='string'||data.code.length<32||data.code.length>256)throw Error('配对内容缺少有效配对码');
  if(typeof data.expiresAt==='number'&&Date.now()>data.expiresAt)throw Error('配对码已过期，请在桌面端重新获取');
  if(!await chrome.permissions.contains({origins:[u.origin+'/']})&&!await chrome.permissions.request({origins:[u.origin+'/']}))throw Error('本机服务地址未授权，无法完成配对');
  const r=await fetch(u.origin+'/v1/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:data.code}),signal:AbortSignal.timeout(5000),redirect:'error',credentials:'omit'});const d=await r.json().catch(()=>({}));
  if(!r.ok||typeof d.token!=='string'||d.token.length<32||d.token.length>256)throw Error(d.error||'配对失败，配对码可能已被使用或过期');
  const config=ResumeAI.settings({enabled:true,endpoint:u.href,model:'resumefill-local',jsonMode:true});
  await chrome.storage.local.set({aiSettings:config});await chrome.storage.session.set({aiApiKey:ResumeAI.normalizeKey(d.token)});
  $('aiEnabled').checked=true;$('aiEndpoint').value=u.href;$('aiModel').value='resumefill-local';$('aiJson').checked=true;$('aiKey').value='';$('pairingCode').value='';
  status('配对成功，已连接桌面端；令牌仅保存在本次浏览器会话。上游云模型密钥不会导入插件。');refreshDesktopState();return;
 }
 if(data.kind!=='resumefill-local-gateway'||typeof data.token!=='string'||data.token.length<32||data.token.length>256)throw Error('不是有效的本地服务连接文件');
 $('aiEnabled').checked=true;$('aiEndpoint').value=u.href;$('aiModel').value='resumefill-local';$('aiJson').checked=true;$('aiKey').value=data.token;status('本地连接已载入；点击保存 AI 设置授权本机地址，再测试连接。上游云模型密钥不会导入插件。');}
$('gatewayImport').onchange=()=>safe(async()=>{const file=$('gatewayImport').files[0];if(!file)return;await applyConnection(JSON.parse(await file.text()));});
$('pairDesktop').onclick=()=>safe(async()=>{const raw=$('pairingCode').value.trim();if(!raw)throw Error('请先从桌面端复制配对码并粘贴到此处');await applyConnection(JSON.parse(raw));});
async function refreshDesktopState(){if(!$('desktopState'))return;const {aiSettings,desktopConnection}=await chrome.storage.local.get(['aiSettings','desktopConnection']);const {aiApiKey,desktopSessionToken}=await chrome.storage.session.get(['aiApiKey','desktopSessionToken']);const automatic=!!desktopConnection?.autoPair,local=automatic||aiSettings?.enabled&&/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(aiSettings.endpoint||'');$('desktopState').textContent=local?(automatic?(desktopSessionToken?'已连接桌面端；会话过期后自动重连':'桌面端已记住配对，正在自动重连，可点击上方自动连接重试'):(aiApiKey?'已连接桌面端（本次会话有效）':'手动配对令牌已过期，请点击上方自动连接')):'未连接桌面端';}
safe(refreshDesktopState);
const desktopActions=document.createElement('div');desktopActions.className='actions';
for(const [label,type]of [['从桌面端读取资料','RF_DESKTOP_PULL'],['将扩展已保存资料同步到桌面','RF_DESKTOP_PUSH']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>safe(async()=>{if(type==='RF_DESKTOP_PULL'&&globalThis.ResumeProfileSyncUI){await ResumeProfileSyncUI.check();return;}const r=await chrome.runtime.sendMessage({type});if(r?.error)throw Error(r.error);if(type==='RF_DESKTOP_PULL'){showProfile(r.resume);status('桌面资料已载入编辑器，核对后点击保存简历。');}else status('扩展中已保存的资料已同步到桌面。');});desktopActions.append(button);}$('status').before(desktopActions);
setInterval(()=>chrome.runtime.sendMessage({type:'RF_DESKTOP_HEARTBEAT'}).catch(()=>{}),30000);
chrome.runtime.sendMessage({type:'RF_DESKTOP_HEARTBEAT'}).catch(()=>{});

$('aiProvider').onchange=()=>{const t={openrouter:['https://openrouter.ai/api/v1/chat/completions','qwen/qwen3.8-flash'],deepseek:['https://api.deepseek.com/chat/completions','deepseek-flash'],kimi:['https://api.moonshot.cn/v1/chat/completions','kimi-k2.6'],openai:['https://api.openai.com/v1/chat/completions','gpt-4.1-mini']}[$('aiProvider').value];if(!t)return;$('aiEndpoint').value=t[0];$('aiModel').value=t[1];$('aiEnabled').checked=true;$('aiJson').checked=true;$('aiKey').value='';status('模板已载入，请填写该服务商的 API 密钥，保存并测试。');};

addEventListener('resumefill-profile-sync-guard',event=>{if(desktopEditorDirty)event.preventDefault();});
addEventListener('resumefill-profile-synced',async()=>{if(desktopEditorDirty)return;const {resume}=await chrome.storage.local.get('resume');showProfile(resume);status('已同步所选桌面资料并保存到插件，网站答案已保留。');});
chrome.storage.onChanged.addListener(async(changes,area)=>{if(area!=='local'||!changes.resumeSyncBackup)return;if(desktopEditorDirty){status('其他窗口已同步资料，当前未保存草稿已保留；保存前请导出草稿并核对最新资料。');return;}const {resume}=await chrome.storage.local.get('resume');showProfile(resume);});

function renderLocalStats(value){const c=value?.counts||ResumeMetrics.empty();$('localStats').textContent='扫描 '+c.scans+' 次 · 填写 '+c.fillRuns+' 次 · 回读一致 '+c.verified+' / '+c.attempted+' 项 · AI 建议 '+c.aiAccepted+' 项';}void chrome.storage.local.get('localMetrics').then(d=>renderLocalStats(d.localMetrics));chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.localMetrics)renderLocalStats(changes.localMetrics.newValue);});
