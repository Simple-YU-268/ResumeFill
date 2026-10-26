// Each selected route is bound to a browser document, never just a frame ID.
(() => {
 const key=id=>'pageRoute:'+id;
 const safeURL=url=>{try{const u=new URL(url);return u.protocol==='about:'?u.href:u.origin+u.pathname;}catch{return '未知文档';}};
 const wrap=(snapshot,route,documents=[],diagnostics=[])=>({...snapshot,runtimeVersion:route.runtimeVersion,url:route.tabUrl,frameUrl:route.url,frameId:route.frameId,frameDocumentId:route.documentId,documents,diagnostics:[...diagnostics,...(snapshot.diagnostics||[])],fields:snapshot.fields.map(f=>({...f,stableId:route.documentId+':'+f.stableId}))});
 function requireRuntime(info){if(info?.ready&&info.runtimeVersion===chrome.runtime.getManifest().version&&info.runtimeProtocol===1)return;const e=Error('页面脚本旧版或未就绪，请保存已填内容后手动刷新页面并重新扫描');e.code='RF_PAGE_RUNTIME_STALE';throw e;}
 async function frameInfo(tabId,frameIds){return chrome.scripting.executeScript({target:{tabId,...frameIds?{frameIds}:{allFrames:true}},func:()=>{
   let visible=true,view=window,reason=null,srcdocVerified=false,origin=location.origin;
   try{for(let depth=0;view!==view.top;depth++){
     if(depth>20){visible=false;reason='DEPTH_LIMIT';break;}
     const frame=view.frameElement;if(!frame){visible=false;reason='CROSS_ORIGIN_OR_OPAQUE';break;}
     if(frame.hasAttribute('sandbox')&&!frame.sandbox.contains('allow-same-origin')){visible=false;reason='OPAQUE_SANDBOX';break;}
     if(view===window&&location.href==='about:srcdoc'&&frame.hasAttribute('srcdoc')){srcdocVerified=true;origin=frame.ownerDocument.location.origin;}
     for(let node=frame;node;node=node.parentElement||node.getRootNode()?.host){const style=node.ownerDocument.defaultView.getComputedStyle(node);if(!node.getClientRects().length||style.display==='none'||style.visibility==='hidden'||style.opacity==='0'||node.hidden||node.matches('[inert],[aria-hidden="true"]')){visible=false;reason='HIDDEN_DOCUMENT';break;}}
     if(!visible)break;view=view.parent;
   }}catch{visible=false;reason='CROSS_ORIGIN_OR_OPAQUE';}
   const embedded=Array.from(document.querySelectorAll('iframe')).map(f=>{let kind='unknown';try{kind=f.hasAttribute('srcdoc')?'srcdoc':new URL(f.src,location.href).origin===location.origin?'same-origin':'cross-origin';}catch{}return {kind};});
   if(srcdocVerified&&visible){try{origin=window.top.location.origin;}catch{visible=false;reason='CROSS_ORIGIN_OR_OPAQUE';}}
   return {url:location.href,origin,srcdocVerified,visible,reason,embedded,ready:!!globalThis.__resumeFillV2,runtimeVersion:globalThis.__resumeFillRuntime?.version,runtimeProtocol:globalThis.__resumeFillRuntime?.protocol};
 }});}
 function eligible(info,origin){return info?.visible&&info.origin===origin&&(/^https?:/.test(info.url)||info.url==='about:srcdoc'&&info.srcdocVerified);}
 async function prepare(tabId){const tab=await chrome.tabs.get(tabId),origin=new URL(tab.url).origin;for(const f of await frameInfo(tabId))if(eligible(f.result,origin)&&f.result.ready)requireRuntime(f.result);}
 async function scan(tabId,message){
  const tab=await chrome.tabs.get(tabId),origin=new URL(tab.url).origin,frames=await frameInfo(tabId),choices=[],documents=[],diagnostics=[];
  for(const frame of frames){const info=frame.result||{},route={tabUrl:tab.url,url:info.url,frameId:frame.frameId,documentId:frame.documentId,runtimeVersion:info.runtimeVersion};let reason=info.reason;
   if(!reason&&!eligible(info,origin))reason=info.origin!==origin?'CROSS_ORIGIN_DOCUMENT':'UNSUPPORTED_DOCUMENT_URL';
   if(!reason&&!frame.documentId)reason='DOCUMENT_ID_UNAVAILABLE';
   if(!reason&&!info.ready)reason='RUNTIME_NOT_READY';
   if(!reason){try{requireRuntime(info);}catch{reason='RUNTIME_STALE';}}
   let result;
   if(!reason){result=await chrome.tabs.sendMessage(tabId,message,{frameId:frame.frameId,documentId:frame.documentId});if(result?.error)throw Error(result.error);if(result?.fields?.length)choices.push({result,route});else reason='NO_FIELDS';}
   documents.push({frameId:frame.frameId,documentId:frame.documentId||null,url:safeURL(info.url),status:reason?'excluded':'available',reason:reason||null,fieldCount:result?.fields?.length||0});
   if(reason)diagnostics.push({code:reason,frameId:frame.frameId});
   for(const embedded of info.embedded||[])if(embedded.kind==='cross-origin')diagnostics.push({code:'CROSS_ORIGIN_DOCUMENT'});
  }
  const prior=(await chrome.storage.session.get(key(tabId)))[key(tabId)];
  const wanted=message.documentId||(prior?.explicit?prior.documentId:null);
  const selected=choices.length===1&&!message.documentId?choices[0]:choices.find(c=>c.route.documentId===wanted);
  if(!selected){await chrome.storage.session.remove(key(tabId));if(!choices.length){const top=frames.find(f=>f.frameId===0);if(top?.documentId&&eligible(top.result,origin)&&top.result.ready)await chrome.storage.session.set({[key(tabId)]:{tabUrl:tab.url,url:top.result.url,frameId:0,documentId:top.documentId,runtimeVersion:top.result.runtimeVersion}});}if(choices.length>1)diagnostics.push({code:'MULTIPLE_DOCUMENTS'});return {url:tab.url,origin,page:new URL(tab.url).pathname,fields:[],coverage:[],sectionIssues:[],adapter:null,fingerprint:'empty',documents,diagnostics,selectionRequired:choices.length>1};}
  selected.route.explicit=!!message.documentId||!!prior?.explicit;await chrome.storage.session.set({[key(tabId)]:selected.route});return wrap(selected.result,selected.route,documents,diagnostics);
 }
 async function send(tabId,message){const route=(await chrome.storage.session.get(key(tabId)))[key(tabId)];if(!route)throw Error('请先选择表单文档并扫描');const tab=await chrome.tabs.get(tabId);if(tab.url!==route.tabUrl)throw Error('外层页面已变化，请重新扫描');const f=(await frameInfo(tabId,[route.frameId]))[0];if(!f?.result?.visible||f.documentId!==route.documentId||f.result.url!==route.url||!eligible(f.result,new URL(tab.url).origin))throw Error('嵌入表单已刷新、隐藏或跳转，请重新扫描');try{requireRuntime(f.result);}catch(e){await chrome.storage.session.remove(key(tabId));throw e;}if(route.runtimeVersion!==chrome.runtime.getManifest().version)throw Error('页面脚本版本已变化，请刷新后扫描');const result=await chrome.tabs.sendMessage(tabId,message,{frameId:route.frameId,documentId:route.documentId});if(result?.error)throw Error(result.error);return message.type==='RF_SCAN'?wrap(result,route):result;}
 globalThis.ResumePageBridge={prepare,scan,send};
})();
