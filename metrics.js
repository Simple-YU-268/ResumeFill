// Aggregate counters only: no field labels, resume values, URLs or model prompts.
(function (root) {
  const keys = [
    "scans",
    "fillRuns",
    "attempted",
    "verified",
    "preserved",
    "failed",
    "learned",
    "aiRequests",
    "aiAccepted",
  ];
  const empty = () => Object.fromEntries(keys.map((k) => [k, 0]));
  function validate(value) {
    if (
      !value ||
      value.version !== 1 ||
      typeof value.epoch !== "string" ||
      !/^[\w-]{1,80}$/.test(value.epoch)
    )
      throw Error("统计格式无效");
    const counts = empty();
    for (const k of keys) {
      const n = value.counts?.[k] ?? 0;
      if (!Number.isSafeInteger(n) || n < 0 || n > 1000000000)
        throw Error("统计计数无效");
      counts[k] = n;
    }
    return { version: 1, epoch: value.epoch, counts };
  }
  function add(previous, delta, epoch) {
    const value = previous
      ? validate(previous)
      : { version: 1, epoch, counts: empty() };
    for (const k of keys) {
      const n = delta[k] ?? 0;
      if (!Number.isSafeInteger(n) || n < 0) throw Error("统计增量无效");
      value.counts[k] = Math.min(1000000000, value.counts[k] + n);
    }
    return value;
  }
  async function record(delta) {
    try {
      await chrome.runtime.sendMessage({ type: "RF_METRICS_RECORD", delta });
    } catch {
      /* Statistics never block the application workflow. */
    }
  }
  root.ResumeMetrics = { keys, empty, validate, add, record };
  if (typeof module !== "undefined") module.exports = root.ResumeMetrics;
})(globalThis);
