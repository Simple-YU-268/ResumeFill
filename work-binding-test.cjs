const assert=require('node:assert/strict'),M=require('./matcher');
const make=()=>['employment','internship'].map((employmentType,i)=>({label:'公司名称',section:'work',recordIndex:0,workModuleId:'module-'+i,moduleRecordIndex:0,employmentType}));
let fields=make();M.bindWork(fields);assert.ok(fields.every(f=>f.workBindingRequired));
fields=make();const profile={records:[{index:0,type:'internship'},{index:1,type:'employment'},{index:2,type:'unknown'}]};let groups=M.bindWork(fields,profile);assert.deepEqual(fields.map(f=>f.recordIndex),[1,0]);assert.equal(M.match(fields[0],{'work.0.company':'A','work.1.company':'B'}).path,'work.1.company');assert.equal(M.allowedPath(fields[0],'work.0.company'),false);
fields=make();M.bindWork(fields,profile,{'module-0:0':2,'module-1:0':2});assert.ok(fields.every(f=>f.workBindingRequired));assert.deepEqual(M.candidatePaths(fields[0],{'work.2.company':'C'}),[]);
fields=make();M.bindWork(fields,profile,{'module-0:0':0});assert.equal(fields[0].workBindingRequired,true);
assert.equal(M.flatten({work:[{employmentType:'internship',company:'Synthetic'}]})['work.0.employmentType'],undefined);
assert.ok(!M.resolveField(fields[0],{'work.0.company':'Synthetic'}));console.log('PASS: typed work allocation, original indices, unknown/manual conflict, wrong type refusal and metadata exclusion');
