const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('rfBrowser',{
 command:async input=>{const result=await ipcRenderer.invoke('rf:browser',input);if(result.error)throw Error(result.error);return result.value;},
 onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('rf:browser-state',listener);return ()=>ipcRenderer.removeListener('rf:browser-state',listener);},
});
