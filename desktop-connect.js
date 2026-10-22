(()=>{
 const button=document.getElementById('desktopAutoConnect'),status=document.getElementById('desktopAutoStatus'),choice=document.getElementById('desktopChoice');if(!button||!status||!choice)return;
 let timer=null,deadline=0,working=false,closed=false;
 async function message(type,extra={}){const r=await chrome.runtime.sendMessage({type,...extra});if(r?.error)throw Error(r.error);return r;}
 async function pair(origin){if(working||closed)return;working=true;try{
  const result=await message('RF_DESKTOP_CONNECT',{origin});if(closed)return;
  if(result.state==='pending'){status.textContent='已发现桌面端，请在桌面端点击一次“允许此浏览器连接”；确认后会自动完成配对（剩余 '+Math.max(0,Math.ceil((deadline-Date.now())/1000))+' 秒）。';if(Date.now()<deadline)timer=setTimeout(()=>pair(origin),1500);else status.textContent='等待配对已超时；请在桌面端确认后点击重新连接。';return;}
  status.textContent='已连接桌面端；以后打开插件可自动重连。';
  const {resume}=await chrome.storage.local.get('resume');if(!resume){const result=await message('RF_DESKTOP_PULL');if(result.resume?.basics)await chrome.storage.local.set({resume:result.resume});}
  await message('RF_DESKTOP_HEARTBEAT');dispatchEvent(new CustomEvent('resumefill-desktop-connected',{detail:{origin}}));
 }catch(e){status.textContent=e.message;}finally{working=false;button.disabled=false;}}
 async function start(){if(working||closed)return;clearTimeout(timer);deadline=Date.now()+90000;status.textContent='正在发现本机桌面端…';try{const result=await message('RF_DESKTOP_DISCOVER');if(closed)return;choice.replaceChildren();for(const d of result.desktops){const option=document.createElement('option');option.value=d.origin;option.textContent=d.origin+' · '+d.version;choice.append(option);}choice.hidden=result.desktops.length<2;if(!result.desktops.length){status.textContent='未发现桌面端，请打开新版 ResumeFill 并启动服务，再点击自动连接。';return;}if(result.preferred&&result.desktops.some(d=>d.origin===result.preferred))choice.value=result.preferred;if(result.desktops.length>1&&!result.desktops.some(d=>d.origin===result.preferred)){status.textContent='发现多个本机服务，请选择要连接的桌面端。';return;}await pair(choice.value);}catch(e){status.textContent=e.message;}}
 button.onclick=async()=>{const granted=await chrome.permissions.request({origins:['http://127.0.0.1/*']});if(!granted){status.textContent='未授予本机连接权限，仍可手动配对。';return;}await start();};
 choice.onchange=()=>{clearTimeout(timer);deadline=Date.now()+90000;void pair(choice.value);};
 void chrome.permissions.contains({origins:['http://127.0.0.1/*']}).then(allowed=>{if(allowed)void start();});
 addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);});
})();
