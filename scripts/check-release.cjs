const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),version=require('../package.json').version;
const review=fs.readFileSync(path.join(root,'PRIVACY-REVIEW.md'),'utf8');
assert.ok(review.includes('Reviewed for v'+version+' on '),'Current version needs a privacy review');
assert.ok(fs.existsSync(path.join(root,'docs/releases',version+'.md')),'Current version needs release notes');
for(const item of ['Family information','Aggregate statistics','Web OCR'])assert.ok(review.includes(item),'Missing privacy boundary: '+item);
const server=fs.readFileSync(path.join(root,'local-server/server.cjs'),'utf8');assert.match(server,/require\(['"]\.\.\/package\.json['"]\)\.version/,'Gateway must use package version');
console.log('PASS: release notes, current privacy review, family/statistics/OCR boundaries and gateway version source');
