const crypto = require("node:crypto");
const AI = require("../ai.js"),
  M = require("../matcher.js"),
  R = require("../agent-recovery.js");
const TOOLS = [
  "verify_fields",
  "fill_fields",
  "observe_page",
  "match_fields",
  "wait_page",
  "plan_recovery",
];
const signature = (f) =>
  JSON.stringify([f.label, f.section, f.recordIndex, f.type]);
const manualCodes = new Set([
  "USER_CONTENT",
  "VALIDATION",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "SCOPE_CHANGED",
  "CANCELLED",
]);
const descriptions = {
  CONTROL_STALE: "控件已重绘，需重新定位",
  OPTIONS_PENDING: "选项尚未就绪",
  SELECTION_RESET: "联动清空了选择",
  VALUE_EMPTY: "值未稳定保留",
  USER_CONTENT: "保留已有内容，请人工核对",
  VALIDATION: "网页校验未通过",
  AMBIGUOUS: "候选或归属不唯一",
  UNSUPPORTED: "控件需要专用适配",
  SCOPE_CHANGED: "字段归属已变化",
  CANCELLED: "操作已取消",
  UNKNOWN: "未通过控件核验",
};
class AgentEngine {
  constructor({ modelEnabled = false, now = Date.now } = {}) {
    this.modelEnabled = modelEnabled;
    this.now = now;
    this.sessions = new Map();
  }
  observation(o) {
    if (
      !o ||
      typeof o.pageKey !== "string" ||
      o.pageKey.length > 2000 ||
      !Array.isArray(o.fields) ||
      o.fields.length > 200 ||
      !Array.isArray(o.candidatePaths) ||
      o.candidatePaths.length > 500 ||
      !Array.isArray(o.bindings)
    )
      throw Error("观察数据无效");
    const u = new URL(o.pageKey);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      [...u.searchParams.keys()].some((k) => k !== "formId") ||
      u.hash ||
      u.username ||
      u.password
    )
      throw Error("页面范围无效");
    if (
      o.documentKey !== undefined &&
      (typeof o.documentKey !== "string" ||
        !o.documentKey ||
        o.documentKey.length > 200)
    )
      throw Error("文档身份无效");
    const fields = o.fields.map((f) => {
      if (
        !f ||
        typeof f.id !== "string" ||
        typeof f.stableId !== "string" ||
        typeof f.label !== "string" ||
        f.id.length > 200 ||
        f.stableId.length > 500 ||
        (f.recoveryKey !== undefined &&
          (typeof f.recoveryKey !== "string" || f.recoveryKey.length > 4000))
      )
        throw Error("字段身份无效");
      return {
        id: f.id,
        stableId: f.stableId,
        label: f.label.slice(0, 200),
        section: f.section || null,
        recordIndex: Number.isInteger(f.recordIndex) ? f.recordIndex : null,
        type: [
          "input",
          "date",
          "select",
          "radio",
          "combobox",
          "cascader",
          "contenteditable",
        ].includes(f.type || "input")
          ? f.type || "input"
          : (() => {
              throw Error("控件类型无效");
            })(),
        required: !!f.required,
        ambiguousLabel: !!f.ambiguousLabel,
        contextBlocked: !!f.contextBlocked,
        familyRole: f.familyRole,
        familyAmbiguous: !!f.familyAmbiguous,
        recoveryKey: f.recoveryKey || null,
        supplementalPath: f.supplementalPath || null,
        workBindingRequired: !!f.workBindingRequired,
        candidatePaths: Array.isArray(f.candidatePaths) ? f.candidatePaths : [],
      };
    });
    if (
      new Set(fields.map((f) => f.id)).size !== fields.length ||
      new Set(fields.map((f) => f.stableId)).size !== fields.length
    )
      throw Error("重复字段身份");
    const paths = [...new Set(o.candidatePaths)];
    if (
      paths.some(
        (p) =>
          typeof p !== "string" ||
          p.length > 200 ||
          p
            .split(".")
            .some((s) => ["__proto__", "prototype", "constructor"].includes(s)),
      )
    )
      throw Error("资料路径无效");
    for (const f of fields)
      if (
        f.candidatePaths.length > 48 ||
        f.candidatePaths.some((p) => !paths.includes(p) || !M.allowedPath(f, p))
      )
        throw Error("字段候选范围无效");
    const bound = new Set(),
      bindings = o.bindings.map((b) => {
        const f = fields.find((f) => f.id === b.id);
        if (
          !f ||
          !paths.includes(b.path) ||
          bound.has(b.id) ||
          AI.protectedField(f) ||
          f.ambiguousLabel ||
          !(M.allowedPath(f, b.path) || R.supplementalAllowed(f, b.path))
        )
          throw Error("未授权或受保护字段");
        bound.add(b.id);
        return {
          id: b.id,
          path: b.path,
          stableId: f.stableId,
          signature: signature(f),
          recoveryKey: f.recoveryKey,
        };
      });
    return {
      pageKey: o.pageKey,
      documentKey: o.documentKey || null,
      fields,
      candidatePaths: paths,
      bindings,
    };
  }
  get(id) {
    const s = this.sessions.get(id);
    if (!s || this.now() - s.updatedAt > 1800000) {
      this.sessions.delete(id);
      throw Error("Agent 会话已过期，请重新启动");
    }
    return s;
  }
  log(s, event, detail = {}) {
    s.updatedAt = this.now();
    s.events.push({
      at: new Date(s.updatedAt).toISOString(),
      event,
      ...detail,
    });
    if (s.events.length > 100) s.events.shift();
  }
  issue(s, name, args) {
    if (!TOOLS.includes(name)) throw Error("工具不在白名单");
    if (s.steps >= R.limits.steps) {
      this.review(s, "已达到 24 步限制，请检查页面后重新启动");
      return;
    }
    s.pending = { id: crypto.randomUUID(), name, arguments: args };
    s.steps++;
    this.log(s, "tool_requested", { tool: name, callId: s.pending.id });
  }
  create(input) {
    if (
      input.recoveryEnabled !== undefined &&
      typeof input.recoveryEnabled !== "boolean"
    )
      throw Error("恢复开关无效");
    for (const [id, s] of this.sessions)
      if (this.now() - s.updatedAt > 1800000) this.sessions.delete(id);
    if (this.sessions.size >= 20) throw Error("Agent 会话数达到上限");
    const observation = this.observation(input.observation),
      s = {
        id: crypto.randomUUID(),
        goal: "观察、填写已核对字段、独立验证并有限恢复；缺少资料交给用户",
        status: "running",
        pageKey: observation.pageKey,
        documentKey: observation.documentKey,
        observation,
        approved: observation.bindings,
        steps: 0,
        phase: "initial_verify",
        results: {},
        fillFailures: {},
        events: [],
        proposals: [],
        pending: null,
        lastReply: null,
        matched: false,
        reason: "",
        recovery: {
          enabled: input.recoveryEnabled !== false,
          used: 0,
          attempts: {},
          targets: [],
          packet: null,
          strategy: null,
          source: null,
          stopped: false,
          modelUnavailable: false,
        },
        createdAt: this.now(),
        updatedAt: this.now(),
      };
    this.sessions.set(s.id, s);
    this.log(s, "started", { approvedFields: s.approved.length });
    this.next(s);
    return this.view(s);
  }
  view(s) {
    return {
      id: s.id,
      goal: s.goal,
      status: s.status,
      reason: s.reason,
      steps: s.steps,
      pending: s.pending,
      proposals: s.proposals.map((p) => ({
        ...p,
        stableId: s.observation.fields.find((f) => f.id === p.fieldId)
          ?.stableId,
      })),
      fields: Object.entries(s.results).map(([stableId, r]) => ({
        stableId,
        status: r.status,
        error: r.error,
        failureCode: r.failureCode,
        ...(s.approved.find((b) => b.stableId === stableId)?.previousStableIds
          ? {
              previousStableIds: s.approved.find((b) => b.stableId === stableId)
                .previousStableIds,
            }
          : {}),
      })),
      counts: {
        approved: s.approved.length,
        verified: s.approved.filter(
          (b) => s.results[b.stableId]?.status === "verified",
        ).length,
        unbound: s.observation.fields.filter(
          (f) => !s.approved.some((b) => b.stableId === f.stableId),
        ).length,
      },
      recovery: {
        enabled: s.recovery.enabled,
        used: s.recovery.used,
        max: R.limits.total,
        perFieldMax: R.limits.perField,
        strategy: s.recovery.strategy,
        source: s.recovery.source,
        phase: s.phase,
      },
      events: s.events,
      submissionVerified: false,
      allowedTools: TOOLS,
    };
  }
  activeItems(s) {
    return s.approved.flatMap((b) => {
      const f = s.observation.fields.find((f) => f.stableId === b.stableId);
      return f &&
        signature(f) === b.signature &&
        f.recoveryKey === b.recoveryKey &&
        (M.allowedPath(f, b.path) || R.supplementalAllowed(f, b.path)) &&
        !f.ambiguousLabel
        ? [{ id: f.id, path: b.path }]
        : [];
    });
  }
  review(s, reason) {
    s.status = "needs_input";
    s.reason = reason;
    s.pending = null;
    this.log(s, "needs_input", { reason });
  }
  startRecovery(s, plan, source) {
    plan = R.parse(plan, s.recovery.packet);
    s.recovery.strategy = plan.strategy;
    s.recovery.source = source;
    if (plan.strategy === "manual") {
      s.recovery.stopped = true;
      s.phase = "finish";
      return;
    }
    s.recovery.targets = plan.fieldIds.map(
      (id) => s.observation.fields.find((f) => f.id === id).stableId,
    );
    s.recovery.used++;
    for (const id of s.recovery.targets)
      s.recovery.attempts[id] = (s.recovery.attempts[id] || 0) + 1;
    this.log(s, "recovery_planned", {
      strategy: plan.strategy,
      source,
      fields: s.recovery.targets.length,
      attempt: s.recovery.used,
    });
    s.phase =
      plan.strategy === "wait_rescan" ? "recovery_wait" : "recovery_observe";
  }
  scheduleRecovery(s) {
    if (
      !s.recovery.enabled ||
      s.recovery.stopped ||
      s.recovery.used >= R.limits.total ||
      s.steps >= R.limits.steps - 3
    )
      return false;
    const fields = s.approved.flatMap((b) => {
      const f = s.observation.fields.find((f) => f.stableId === b.stableId),
        r = s.results[b.stableId],
        attempts = s.recovery.attempts[b.stableId] || 0;
      return r?.status !== "verified" &&
        R.recoverable.has(r?.failureCode) &&
        attempts < R.limits.perField
        ? [{ id: f.id, type: f.type, code: r.failureCode, attempts }]
        : [];
    });
    if (!fields.length) return false;
    s.recovery.packet = R.validatePacket({
      version: 1,
      kind: "recovery",
      shareValues: false,
      fields,
      strategies: fields.every((f) => f.code === "CONTROL_STALE")
        ? ["rescan", "manual"]
        : ["rescan", "wait_rescan", "manual"],
      budget: {
        remaining: R.limits.total - s.recovery.used,
        maxDelayMs: R.limits.maxDelayMs,
      },
    });
    if (this.modelEnabled && !s.recovery.modelUnavailable)
      s.phase = "recovery_plan";
    else this.startRecovery(s, R.fallback(s.recovery.packet), "local");
    return true;
  }
  next(s) {
    if (s.status !== "running") return;
    const items = this.activeItems(s);
    if (items.length !== s.approved.length) {
      this.review(s, "字段已移除或含义变化，请重新核对页面");
      return;
    }
    if (s.phase === "initial_verify") {
      if (items.length) {
        this.issue(s, "verify_fields", { items });
        return;
      }
      s.phase = "observe";
    }
    if (s.phase === "fill" || s.phase === "recovery_fill") {
      const pending = items.filter((i) => {
        const f = s.observation.fields.find((f) => f.id === i.id);
        return (
          s.results[f.stableId]?.status !== "verified" &&
          (s.phase === "fill" || s.recovery.targets.includes(f.stableId))
        );
      });
      if (pending.length) {
        this.issue(s, "fill_fields", {
          items: pending,
          overwrite: false,
          saveCards: false,
        });
        return;
      }
      s.phase = s.phase === "recovery_fill" ? "post_verify" : "observe";
    }
    if (s.phase === "post_verify") {
      this.issue(s, "verify_fields", { items });
      return;
    }
    if (s.phase === "observe") {
      this.issue(s, "observe_page", {});
      return;
    }
    if (s.phase === "final_verify") {
      if (items.length) {
        this.issue(s, "verify_fields", { items });
        return;
      }
      s.phase = "finish";
    }
    if (s.phase === "recovery_plan") {
      this.issue(s, "plan_recovery", { packet: s.recovery.packet });
      return;
    }
    if (s.phase === "recovery_wait") {
      this.issue(s, "wait_page", { delayMs: R.limits.delayMs });
      return;
    }
    if (s.phase === "recovery_observe") {
      this.issue(s, "observe_page", { recovery: true });
      return;
    }
    if (s.phase === "recovery_verify") {
      this.issue(s, "verify_fields", { items });
      return;
    }
    if (s.phase === "finish") {
      const failed = s.approved.some(
        (b) => s.results[b.stableId]?.status !== "verified",
      );
      if (failed && this.scheduleRecovery(s)) {
        this.next(s);
        return;
      }
      const unbound = s.observation.fields.filter(
        (f) => !s.approved.some((b) => b.stableId === f.stableId),
      );
      if (unbound.length && this.modelEnabled && !s.matched) {
        s.matched = true;
        const fieldIds = unbound
          .filter(
            (f) =>
              !f.ambiguousLabel &&
              !f.contextBlocked &&
              !AI.protectedField(f) &&
              f.candidatePaths.length,
          )
          .map((f) => f.id);
        if (fieldIds.length) {
          this.issue(s, "match_fields", { fieldIds });
          return;
        }
      }
      if (failed) {
        this.review(
          s,
          "部分字段未通过回读或恢复次数已到上限；已有内容不会覆盖，请人工核对",
        );
        return;
      }
      if (unbound.length) {
        this.review(s, "仍有新增、缺少资料或未核对字段，请核对建议后继续");
        return;
      }
      s.status = "completed";
      s.reason = "当前授权字段已独立回读一致；未提交申请";
      this.log(s, "completed");
    }
  }
  reobserve(s, obs, recovery) {
    if (obs.pageKey !== s.pageKey || obs.documentKey !== s.documentKey) {
      s.status = "cancelled";
      s.reason = "页面或文档范围已变化，任务终止";
      s.pending = null;
      this.log(s, "scope_changed");
      return;
    }
    const missing = s.approved.filter(
      (b) => !obs.fields.some((f) => f.stableId === b.stableId),
    );
    if (
      !recovery &&
      s.recovery.enabled &&
      missing.length &&
      s.documentKey &&
      !missing.some((b) => manualCodes.has(s.results[b.stableId]?.failureCode))
    ) {
      for (const b of missing)
        s.results[b.stableId] = {
          status: "stale",
          failureCode: "CONTROL_STALE",
          error: descriptions.CONTROL_STALE,
        };
      s.phase = "finish";
      return;
    }
    const remaps = [];
    for (const b of s.approved) {
      const direct = obs.fields.find((f) => f.stableId === b.stableId);
      if (direct) continue;
      if (!recovery || !s.documentKey || !b.recoveryKey) continue;
      const before = s.observation.fields.filter(
          (f) => f.recoveryKey === b.recoveryKey,
        ),
        after = obs.fields.filter((f) => f.recoveryKey === b.recoveryKey);
      if (
        before.length !== 1 ||
        after.length !== 1 ||
        after[0].ambiguousLabel ||
        after[0].contextBlocked ||
        AI.protectedField(after[0]) ||
        signature(after[0]) !== b.signature ||
        !(
          M.allowedPath(after[0], b.path) ||
          R.supplementalAllowed(after[0], b.path)
        )
      )
        continue;
      if (s.approved.some((a) => a !== b && a.stableId === after[0].stableId))
        continue;
      remaps.push([b, after[0]]);
    }
    for (const [b, f] of remaps) {
      const old = b.stableId;
      b.previousStableIds = [
        ...new Set([...(b.previousStableIds || []), old]),
      ].slice(-R.limits.perField);
      b.stableId = f.stableId;
      b.id = f.id;
      if (s.results[old]) {
        s.results[f.stableId] = {
          ...s.results[old],
          status: "stale",
          failureCode: "CONTROL_STALE",
          error: descriptions.CONTROL_STALE,
        };
        delete s.results[old];
      }
      if (s.fillFailures[old]) {
        s.fillFailures[f.stableId] = s.fillFailures[old];
        delete s.fillFailures[old];
      }
      if (s.recovery.attempts[old]) {
        s.recovery.attempts[f.stableId] = s.recovery.attempts[old];
        delete s.recovery.attempts[old];
      }
      s.recovery.targets = s.recovery.targets.map((id) =>
        id === old ? f.stableId : id,
      );
    }
    if (remaps.length)
      this.log(s, "controls_rebound", { fields: remaps.length });
    s.observation = { ...obs, bindings: [] };
    s.phase = recovery ? "recovery_verify" : "final_verify";
  }
  result(id, input) {
    const s = this.get(id),
      digest = crypto
        .createHash("sha256")
        .update(JSON.stringify(input))
        .digest("hex");
    if (s.lastReply?.callId === input.callId) {
      if (s.lastReply.digest !== digest) throw Error("同一工具结果内容冲突");
      return this.view(s);
    }
    if (s.status !== "running" || !s.pending || s.pending.id !== input.callId)
      throw Error("工具结果已失效或不属于当前调用");
    const call = s.pending;
    if (call.name === "observe_page")
      this.reobserve(
        s,
        this.observation(input.result?.observation),
        call.arguments.recovery === true,
      );
    else if (call.name === "wait_page") {
      if (input.result?.waited !== true) throw Error("等待回执无效");
      s.phase = "recovery_observe";
    } else if (call.name === "plan_recovery")
      this.startRecovery(
        s,
        input.result?.plan || input.result,
        input.result?.source === "local" ? "local" : "model",
      );
    else if (call.name === "match_fields") {
      const fields = s.observation.fields.filter((f) =>
          call.arguments.fieldIds.includes(f.id),
        ),
        packet = {
          fields,
          candidates: s.observation.candidatePaths.map((path) => ({ path })),
        };
      s.proposals = AI.parseResponse(
        { matches: input.result?.matches || [] },
        packet,
      ).accepted;
      s.phase = "finish";
    } else {
      const results = input.result?.results;
      if (
        !Array.isArray(results) ||
        results.length !== call.arguments.items.length ||
        new Set(results.map((r) => r.id)).size !== results.length
      )
        throw Error("工具回执数量无效");
      if (
        results.some(
          (r) =>
            !r ||
            !call.arguments.items.some((i) => i.id === r.id) ||
            ![
              "verified",
              "filled",
              "failed",
              "stale",
              "mismatch",
              "preserved",
              "invalid",
              "unconfirmed",
            ].includes(r.status),
        )
      )
        throw Error("工具回执无效");
      if (call.name === "fill_fields" && input.result?.ordered === true)
        this.log(s, "dependencies_ordered", {
          fields: call.arguments.items.length,
        });
      for (const item of call.arguments.items) {
        const r = results.find((r) => r.id === item.id),
          f = s.observation.fields.find((f) => f.id === item.id);
        if (
          !r ||
          ![
            "verified",
            "filled",
            "failed",
            "stale",
            "mismatch",
            "preserved",
            "invalid",
            "unconfirmed",
          ].includes(r.status)
        )
          throw Error("工具回执无效");
        let code = R.classify(r);
        if (call.name === "fill_fields" && code)
          s.fillFailures[f.stableId] = code;
        if (r.status === "verified") delete s.fillFailures[f.stableId];
        else if (manualCodes.has(s.fillFailures[f.stableId]))
          code = s.fillFailures[f.stableId];
        s.results[f.stableId] = {
          status: r.status,
          failureCode: code,
          error: code ? descriptions[code] : "",
        };
      }
      if (call.name === "fill_fields") s.phase = "post_verify";
      else if (s.phase === "initial_verify") s.phase = "fill";
      else if (s.phase === "recovery_verify") s.phase = "recovery_fill";
      else if (s.phase === "post_verify")
        s.phase = s.approved.some((b) =>
          R.recoverable.has(s.results[b.stableId]?.failureCode),
        )
          ? "finish"
          : "observe";
      else s.phase = "finish";
    }
    s.lastReply = { callId: input.callId, digest };
    s.pending = null;
    this.log(s, "tool_result", { tool: call.name, callId: call.id });
    this.next(s);
    return this.view(s);
  }
  toolError(id, input) {
    const s = this.get(id);
    if (s.status !== "running" || !s.pending || s.pending.id !== input.callId)
      throw Error("工具回执已失效");
    const tool = s.pending.name,
      failure = AI.toolFailure({ code: input.errorCode }, tool);
    this.log(s, "tool_error", { tool, code: failure.code });
    if (
      tool === "plan_recovery" &&
      ![
        "RF_AGENT_DOCUMENT_CHANGED",
        "RF_AGENT_PROFILE_CHANGED",
        "RF_AGENT_SCOPE_CHANGED",
        "RF_AGENT_PAGE_CHANGED",
      ].includes(failure.code)
    ) {
      s.pending = null;
      s.recovery.modelUnavailable = true;
      this.startRecovery(s, R.fallback(s.recovery.packet), "local-fallback");
      this.next(s);
    } else this.review(s, failure.message);
    return this.view(s);
  }
  resume(id, input) {
    const s = this.get(id);
    if (s.status !== "needs_input") throw Error("当前任务不能继续");
    const obs = this.observation(input.observation);
    if (obs.pageKey !== s.pageKey || obs.documentKey !== s.documentKey)
      throw Error("不能在其它页面或文档继续");
    if (s.steps >= R.limits.steps) throw Error("步数已耗尽，请重新启动任务");
    if (input.recoveryEnabled !== undefined) {
      if (typeof input.recoveryEnabled !== "boolean")
        throw Error("恢复开关无效");
      s.recovery.enabled = input.recoveryEnabled;
    }
    s.observation = obs;
    s.approved = obs.bindings;
    s.results = {};
    s.fillFailures = {};
    s.phase = "initial_verify";
    s.status = "running";
    s.reason = "";
    s.proposals = [];
    s.matched = false;
    s.recovery.targets = [];
    s.recovery.stopped = false;
    this.log(s, "resumed", { approvedFields: s.approved.length });
    this.next(s);
    return this.view(s);
  }
  cancel(id) {
    const s = this.get(id);
    s.status = "cancelled";
    s.pending = null;
    s.reason = "用户已停止";
    this.log(s, "cancelled");
    return this.view(s);
  }
}
module.exports = { AgentEngine };
