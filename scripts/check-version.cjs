const assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>require(path.join(root,p));
const versions={
 'package.json':read('package.json').version,
 'desktop/package.json':read('desktop/package.json').version,
 'manifest.json':read('manifest.json').version,
 'package-lock.json':read('package-lock.json').version,
 'desktop/package-lock.json':read('desktop/package-lock.json').version
};
const unique=new Set(Object.values(versions));
assert.equal(unique.size,1,'version drift: '+JSON.stringify(versions));
assert.match([...unique][0],/^\d+\.\d+\.\d+$/,'version must be semver: '+[...unique][0]);
console.log('PASS: versions aligned at '+[...unique][0]+' ('+Object.keys(versions).join(', ')+')');
