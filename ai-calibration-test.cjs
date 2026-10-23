// Calibration telemetry: validate, ring cap, tolerant stored entries.
const assert = require("node:assert/strict");
const calibration = require("./ai-calibration.js");

const base = {
  v: 1,
  ts: Date.now(),
  kind: "match",
  event: "proposed",
  confidence: 0.9,
  model: "qwen/qwen3.8-flash",
  host: "openrouter.ai",
  path: "basics.email",
};

// Accepts a well-formed event and clips long strings.
const clean = calibration.validate({
  ...base,
  model: "m".repeat(200),
  host: "h".repeat(200),
  path: "p".repeat(200),
});
assert.equal(clean.model.length, 150);
assert.equal(clean.host.length, 100);
assert.equal(clean.path.length, 120);
assert.deepEqual(
  Object.keys(clean).sort(),
  ["confidence", "event", "host", "kind", "model", "path", "ts", "v"].sort(),
);

// Rejects malformed events.
for (const bad of [
  null,
  {},
  { ...base, v: 2 },
  { ...base, kind: "page" },
  { ...base, event: "clicked" },
  { ...base, ts: "now" },
  { ...base, confidence: 1.5 },
  { ...base, confidence: -0.1 },
  { ...base, confidence: "high" },
  { ...base, event: "filtered" },
  { ...base, event: "filtered", filter: "unknown" },
  { ...base, event: "readback" },
  { ...base, event: "readback", outcome: "clicked" },
])
  assert.throws(() => calibration.validate(bad), /校准/);

// filter only on filtered, outcome only on readback.
const filtered = calibration.validate({
  ...base,
  event: "filtered",
  filter: "confidence",
});
assert.equal(filtered.filter, "confidence");
assert.equal(filtered.outcome, undefined);
const readback = calibration.validate({
  ...base,
  event: "readback",
  outcome: "verified",
});
assert.equal(readback.outcome, "verified");
assert.equal(readback.filter, undefined);

// Never keeps values, labels or URLs even if a caller tries to sneak them in.
const sneaky = calibration.validate({
  ...base,
  value: "张三 13800001234",
  label: "身份证号",
  url: "https://example.com/apply?token=abc",
});
assert.equal(sneaky.value, undefined);
assert.equal(sneaky.label, undefined);
assert.equal(sneaky.url, undefined);

// append: empty store, cap at MAX, invalid stored entries dropped.
assert.deepEqual(calibration.append(null, [base]).entries.length, 1);
const big = {
  v: 1,
  entries: Array.from({ length: calibration.MAX }, (_, i) => ({
    ...base,
    ts: i,
  })),
};
const appended = calibration.append(big, [base]);
assert.equal(appended.entries.length, calibration.MAX);
assert.equal(appended.entries[calibration.MAX - 1].ts, base.ts);
const tolerant = calibration.append(
  { v: 1, entries: [{ garbage: true }, { ...base, ts: 1 }] },
  [],
);
assert.equal(tolerant.entries.length, 1);
assert.equal(tolerant.entries[0].ts, 1);
assert.throws(() => calibration.append(null, [{ ...base, v: 2 }]), /校准/);

console.log("PASS: ai-calibration");
