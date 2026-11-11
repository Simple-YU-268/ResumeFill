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
  fs.writeFileSync(file, 'not a PDF');
  assert.throws(() => c.saveResumeAttachment(file));
  assert.deepEqual(Buffer.from(c.resumeAttachment().dataBase64, 'base64'), bytes);
  c.removeResumeAttachment();
  assert.equal(c.resumeAttachment(), null);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('PASS: original PDF bytes, invalid replacement refusal, and removal');
