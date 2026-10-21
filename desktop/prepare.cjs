const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(__dirname,'..'),dest=path.join(__dirname,'resources');fs.mkdirSync(dest,{recursive:true});for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(source,file),path.join(dest,file));
fs.writeFileSync(path.join(__dirname,'ui/regions.js'),'window.ResumeRegions='+fs.readFileSync(path.join(source,'data/regions.json'),'utf8')+';');
fs.copyFileSync(path.join(source,'matcher.js'),path.join(__dirname,'ui/matcher.js'));
fs.copyFileSync(path.join(source,'field-labels.js'),path.join(__dirname,'ui/field-labels.js'));
const extension=path.join(dest,'extension');fs.mkdirSync(extension,{recursive:true});
const files=['manifest.json','background.js','agent-bridge.js','page-bridge.js','desktop-bridge.js','desktop-connect.js','web-ocr-bridge.js','web-ocr-match.js','profile.js','matcher.js','option-match.js','learning.js','ai.js','answers.js','field-labels.js','popup.html','popup.js','options.html','options.js','style.css','content.js','controls.js','adapters.js','layout.js','inline.js','sample.json','sample-adapters.json','LICENSE','THIRD_PARTY_NOTICES.md'];
for(const f of files)fs.copyFileSync(path.join(source,f),path.join(extension,f));fs.cpSync(path.join(source,'data'),path.join(extension,'data'),{recursive:true});
for(const f of ['ai.js','matcher.js','option-match.js','answers.js'])fs.copyFileSync(path.join(source,f),path.join(dest,f));fs.mkdirSync(path.join(dest,'local-server'),{recursive:true});for(const f of ['server.cjs','agent.cjs'])fs.copyFileSync(path.join(source,'local-server',f),path.join(dest,'local-server',f));
console.log('Packaged only allowlisted runtime files; no personal profile or credentials.');

const ocrData=path.join(dest,'ocr-data');fs.mkdirSync(ocrData,{recursive:true});for(const lang of ['eng','chi_sim','chi_tra']){const pkg=path.dirname(require.resolve('@tesseract.js-data/'+lang+'/package.json'));fs.copyFileSync(path.join(pkg,'4.0.0_best_int',lang+'.traineddata.gz'),path.join(ocrData,lang+'.traineddata.gz'));}

fs.writeFileSync(path.join(ocrData,'NOTICE.txt'),'Local OCR uses Tesseract.js and tesseract.js-core (Apache-2.0). Language packages @tesseract.js-data/eng, chi_sim and chi_tra version 1.0.0 declare MIT. Data variant: 4.0.0_best_int. See https://github.com/naptha/tessdata and https://github.com/naptha/tesseract.js .');
