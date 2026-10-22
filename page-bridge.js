// One explicitly identified form document per tab. Never choose the first or
// largest frame when several forms are present, and never route by frame ID alone.
(() => {
 const key=id=>'pageRoute:'+id;
 function wrap(snapshot,route){return {...snapshot,runtimeVersion:route.runtimeVersion,url:route.tabUrl,frameUrl:route.url,frameId:route.frameId,frameDocumentId:route.documentId,fields:snapshot.fields.map(f=>({...f,stableId:route.documentId?route.documentId+':'+f.stableId:f.stableId}))};}
 function requireRuntime(info){const version=chrome.runtime.getManifest().version;if(info?.ready&&info.runtimeVersion===version&&info.runtimeProtocol===1)return;const error=Error('页面仍在使用旧版或未就绪的填表脚本。请先保存网页已填内容，手动刷新页面后重新扫描；仅重载插件不会更新旧页面');error.code='RF_PAGE_RUNTIME_STALE';throw error;}
 async function frameInfo(tabId,frameIds){return chrome.scripting.executeScript({target:{tabId,...frameIds?{frameIds}:{allFrames:true}},func:()=>{
   let visible=true,view=window;try{for(let depth=0;view!==view.top;depth++){if(depth>20){visible=false;break;}const frame=view.frameElement;if(!frame){visible=false;break;}for(let node=frame;node;node=node.parentElement){const style=node.ownerDocument.defaultView.getComputedStyle(node);if(!node.getClientRects().length||style.display==='none'||style.visibility==='hidden'||node.hidden||node.closest('[inert],[aria-hidden="true"]')){visible=false;break;}}if(!visible)break;view=view.parent;}}catch{visible=false;}
   return {url:location.href,visible,ready:!!globalThis.__resumeFillV2,runtimeVersion:globalThis.__resumeFillRuntime?.version,runtimeProtocol:globalThis.__resumeFillRuntime?.protocol};
 }});}
 async function prepare(tabId){const tab=await chrome.tabs.get(tabId),origin=new URL(tab.url).origin;for(const frame of await frameInfo(tabId)){const info=frame.result;if(!info?.ready||!info.visible||!/^https?:/.test(info.url)||new URL(info.url).origin!==origin)continue;try{requireRuntime(info);}catch(e){await chrome.storage.session.remove(key(tabId));throw e;}}}
 async function scan(tabId,message){
  const tab=await chrome.tabs.get(tabId),origin=new URL(tab.url).origin,frames=await frameInfo(tabId),choices=[];
  for(const frame of frames){const info=frame.result;if(!info?.ready||!info.visible||!/^https?:/.test(info.url)||new URL(info.url).origin!==origin)continue;
   try{requireRuntime(info);}catch(e){await chrome.storage.session.remove(key(tabId));throw e;}
   const route={tabUrl:tab.url,url:info.url,frameId:frame.frameId,documentId:frame.documentId,runtimeVersion:info.runtimeVersion};
   const result=await chrome.tabs.sendMessage(tabId,message,{frameId:route.frameId,...route.documentId?{documentId:route.documentId}:{}});
   if(result?.error)throw Error(result.error);if(result?.fields?.length)choices.push({result,route});
  }
  if(choices.length>1){await chrome.storage.session.remove(key(tabId));throw Error('检测到多个独立表单，请将需要填写的嵌入式页面单独打开后扫描；未自动选择第一个表单');}
  const selected=choices[0];if(!selected){const top=frames.find(f=>f.frameId===0);const route={tabUrl:tab.url,url:tab.url,frameId:0,documentId:top?.documentId,runtimeVersion:top?.result?.runtimeVersion};await chrome.storage.session.set({[key(tabId)]:route});return wrap({url:tab.url,origin,page:new URL(tab.url).pathname,fields:[],coverage:[],sectionIssues:[],adapter:null,fingerprint:'empty'},route);}
  await chrome.storage.session.set({[key(tabId)]:selected.route});return wrap(selected.result,selected.route);
 }
 async function send(tabId,message){
  const data=await chrome.storage.session.get(key(tabId)),route=data[key(tabId)];if(!route)throw Error('表单页面未确定，请重新扫描');
  const tab=await chrome.tabs.get(tabId);if(tab.url!==route.tabUrl)throw Error('外层页面已变化，请重新扫描');
  const frames=await frameInfo(tabId,[route.frameId]),frame=frames[0];if(!frame?.result?.visible||frame.result.url!==route.url||route.documentId&&frame.documentId!==route.documentId)throw Error('嵌入表单已刷新、隐藏或跳转，请重新扫描');
  try{requireRuntime(frame.result);if(route.runtimeVersion!==chrome.runtime.getManifest().version)requireRuntime(null);}catch(e){await chrome.storage.session.remove(key(tabId));throw e;}
  const result=await chrome.tabs.sendMessage(tabId,message,{frameId:route.frameId,...route.documentId?{documentId:route.documentId}:{}});if(result?.error)throw Error(result.error);return message.type==='RF_SCAN'?wrap(result,route):result;
 }
 globalThis.ResumePageBridge={prepare,scan,send};
})();
