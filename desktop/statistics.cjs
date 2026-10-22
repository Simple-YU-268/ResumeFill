const fs = require("node:fs"),
  path = require("node:path");
const bundled =
  process.resourcesPath && path.join(process.resourcesPath, "agent/metrics.js");
const M = require(
  bundled && fs.existsSync(bundled)
    ? bundled
    : path.join(__dirname, "../metrics.js"),
);
// Compare per-client cumulative snapshots, so heartbeat/reconnect never double-counts.
function merge(state, input, key) {
  const value = M.validate(input),
    next = structuredClone(state || { totals: M.empty(), clients: {} });
  next.totals = { ...M.empty(), ...next.totals };
  next.clients ??= {};
  const old = next.clients[key];
  for (const k of M.keys) {
    const previous = old?.epoch === value.epoch ? old.counts[k] : 0;
    next.totals[k] = Math.min(
      1000000000,
      next.totals[k] + Math.max(0, value.counts[k] - previous),
    );
  }
  next.clients[key] =
    old?.epoch === value.epoch
      ? {
          ...value,
          counts: Object.fromEntries(
            M.keys.map((k) => [k, Math.max(old.counts[k], value.counts[k])]),
          ),
        }
      : value;
  const ids = Object.keys(next.clients);
  if (ids.length > 100) delete next.clients[ids[0]];
  return next;
}
function normalize(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.clients ||
    Object.keys(value.clients).length > 100
  )
    throw Error("统计文件无效");
  const totals = M.validate({
    version: 1,
    epoch: "totals",
    counts: value.totals,
  }).counts;
  const clients = {};
  for (const [key, snapshot] of Object.entries(value.clients)) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw Error("统计客户端无效");
    clients[key] = M.validate(snapshot);
  }
  return { totals, clients };
}
module.exports = { merge, normalize, empty: M.empty };
