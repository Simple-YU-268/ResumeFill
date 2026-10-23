// Local-only AI calibration events: model, confidence, field path and outcome.
// Never stores resume values, option text, page labels, URLs or prompts.
(function (root) {
  const VERSION = 1,
    MAX = 500;
  const KINDS = new Set(["match", "option"]),
    EVENTS = new Set(["proposed", "filtered", "applied", "readback"]),
    FILTERS = new Set(["confidence", "scope", "protocol"]),
    OUTCOMES = new Set([
      "verified",
      "failed",
      "unconfirmed",
      "preserved",
      "stale",
    ]);
  const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
  function validate(event) {
    if (!event || typeof event !== "object") throw Error("校准事件无效");
    if (
      event.v !== VERSION ||
      !KINDS.has(event.kind) ||
      !EVENTS.has(event.event)
    )
      throw Error("校准事件版本或类型无效");
    if (!Number.isSafeInteger(event.ts) || event.ts < 0)
      throw Error("校准事件时间无效");
    if (typeof event.confidence !== "number" || !(event.confidence >= 0 && event.confidence <= 1))
      throw Error("校准事件置信度无效");
    const out = {
      v: VERSION,
      ts: event.ts,
      kind: event.kind,
      event: event.event,
      confidence: event.confidence,
      model: clip(event.model, 150),
      host: clip(event.host, 100),
      path: clip(event.path, 120),
    };
    if (event.event === "filtered") {
      if (!FILTERS.has(event.filter)) throw Error("校准过滤原因无效");
      out.filter = event.filter;
    }
    if (event.event === "readback") {
      if (!OUTCOMES.has(event.outcome)) throw Error("校准回读结果无效");
      out.outcome = event.outcome;
    }
    return out;
  }
  function append(store, events) {
    const base =
      store && store.v === VERSION && Array.isArray(store.entries)
        ? store.entries
            .map((e) => {
              try {
                return validate(e);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [];
    const added = (Array.isArray(events) ? events : []).map(validate);
    return {
      v: VERSION,
      entries: base.concat(added).slice(-MAX),
    };
  }
  async function record(events) {
    if (!events?.length) return;
    const clean = events
      .map((e) => {
        try {
          return validate(e);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (!clean.length) return;
    try {
      await chrome.runtime.sendMessage({ type: "RF_AI_CALIBRATE", events: clean });
    } catch {
      /* Calibration telemetry never blocks the application workflow. */
    }
  }
  root.ResumeAICalibration = { MAX, validate, append, record };
  if (typeof module !== "undefined") module.exports = root.ResumeAICalibration;
})(globalThis);
