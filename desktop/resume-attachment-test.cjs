const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Controller } = require('./controller.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-original-'));
try {
  const file = path.join(dir, 'fixture.pdf');
  const bytes = Buffer.from('%PDF-1.7\n%%EOF\n');
  fs.writeFileSync(file, bytes);
  const c = new Controller(dir, path.resolve(__dirname, 'resources'));
  const saved = c.saveResumeAttachment(file);
  fs.unlinkSync(file);
  assert.equal(saved.size, bytes.length);
  assert.equal(saved.fileName, 'fixture.pdf');
  assert.deepEqual(Buffer.from(c.resumeAttachment().dataBase64, 'base64'), bytes);
  assert.deepEqual(c.resumeAttachmentMetadata(), saved);
  assert.ok(!JSON.stringify(c.resumeAttachmentMetadata()).includes('dataBase64'));
  fs.writeFileSync(file, 'not a PDF');
  assert.throws(() => c.saveResumeAttachment(file));
  assert.deepEqual(Buffer.from(c.resumeAttachment().dataBase64, 'base64'), bytes);
  c.removeResumeAttachment();
  assert.equal(c.resumeAttachment(), null);
  assert.equal(c.resumeAttachmentMetadata(), null);
  const receipt = {version:1,applications:[{id:'synthetic-job',companyKey:'synthetic-company',
    origin:'https://jobs.example.test',at:1,updatedAt:2,status:'handoff',verified:3,failed:0,value:'private'}]};
  c.saveApplicationProgress('synthetic-client',receipt);
  assert.equal(c.status().applications[0].status,'handoff');
  assert.ok(!JSON.stringify(c.status().applications).includes('private'));
  assert.throws(() => c.saveApplicationProgress('synthetic-client',{...receipt,applications:[{...receipt.applications[0],verified:-1}]}));
  const reopened = new Controller(dir,path.resolve(__dirname,'resources'));
  assert.equal(reopened.status().applications[0].verified,3);
  c.saveApplicationProgress('synthetic-client',{...receipt,revision:2});
  c.saveApplicationProgress('synthetic-client',{...receipt,revision:1,applications:[{...receipt.applications[0],status:'queued'}]});
  assert.equal(c.status().applications[0].status,'handoff');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('PASS: original PDF bytes, invalid replacement refusal, and removal');
