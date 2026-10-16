const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'..'),dest=path.join(__dirname,'resources');fs.mkdirSync(dest,{recursive:true});for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(source,file),path.join(dest,file));
fs.copyFileSync(path.join(source,'matcher.js'),path.join(__dirname,'ui/matcher.js'));
const extension=path.join(dest,'extension');fs.mkdirSync(extension,{recursive:true});
const files=['manifest.json','background.js','agent-bridge.js','desktop-bridge.js','profile.js','matcher.js','option-match.js','ai.js','answers.js','popup.html','popup.js','options.html','options.js','style.css','content.js','controls.js','adapters.js','layout.js','inline.js','sample.json','sample-adapters.json','LICENSE','THIRD_PARTY_NOTICES.md'];
for(const f of files)fs.copyFileSync(path.join(source,f),path.join(extension,f));fs.cpSync(path.join(source,'data'),path.join(extension,'data'),{recursive:true});
for(const f of ['ai.js','matcher.js','option-match.js'])fs.copyFileSync(path.join(source,f),path.join(dest,f));fs.mkdirSync(path.join(dest,'local-server'),{recursive:true});for(const f of ['server.cjs','agent.cjs'])fs.copyFileSync(path.join(source,'local-server',f),path.join(dest,'local-server',f));
console.log('Packaged only allowlisted runtime files; no personal profile or credentials.');
