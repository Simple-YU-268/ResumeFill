(() => {
  const fail = (message, code) => Object.assign(Error(message), { code });
  const runs = new Map(),
    signature = (f) =>
      JSON.stringify([f.label, f.section, f.recordIndex, f.type]);
  let starting = false;
  const pageKey = (url) => {
    const u = new URL(url);
    return (
      u.origin +
      u.pathname +
      (u.searchParams.has("formId")
        ? "?formId=" + encodeURIComponent(u.searchParams.get("formId"))
        : "")
    );
  };
  async function connection() {
    const { base, key, automatic } = await ResumeDesktop.link();
    const r = await fetch(base + "/health", {
      ...(automatic ? { method: "POST", body: "{}" } : {}),
      headers: {
        Authorization: "Bearer " + key,
        ...(automatic ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(5000),
      credentials: "omit",
      redirect: "error",
    });
    const health = await r.json();
    if (
      !r.ok ||
      health.identity !== "ResumeFillAgent" ||
      health.agentCapabilities?.protocol !== 2
    )
      throw Error("本地服务不支持 Agent，请升级并重新连接");
    return { base, key };
  }
  async function rpc(run, action, data) {
    const controller = new AbortController();
    run.controller = controller;
    const timer = setTimeout(() => controller.abort(), 24000);
    try {
      const r = await fetch(run.connection.base + "/v1/agent/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + run.connection.key,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      const body = await r.json();
      if (!r.ok || !body.agent)
        throw Error("Agent 服务请求失败，请检查服务或重新启动任务");
      return body.agent;
    } finally {
      clearTimeout(timer);
      if (run.controller === controller) run.controller = null;
    }
  }
  async function publish(run) {
    await chrome.storage.session.set({
      agentRun: {
        runId: run.id,
        tabId: run.tabId,
        pageKey: run.pageKey,
        state: run.state,
        error: run.error || "",
        running: !!run.running,
        updatedAt: new Date().toISOString(),
      },
    });
  }
  async function checkPage(run) {
    if (run.invalidated) throw fail("任务范围或资料已变化", run.invalidated);
    const tab = await chrome.tabs.get(run.tabId);
    if (tab.url !== run.url || pageKey(tab.url) !== run.pageKey)
      throw fail("页面范围变化，Agent 停止", "RF_AGENT_DOCUMENT_CHANGED");
    if (run.documentId) {
      const route = (
        await chrome.storage.session.get("pageRoute:" + run.tabId)
      )["pageRoute:" + run.tabId];
      if (route?.documentId !== run.documentId)
        throw fail("表单文档已变化", "RF_AGENT_DOCUMENT_CHANGED");
    }
  }
  async function checkProfile(run) {
    const { resume } = await chrome.storage.local.get("resume");
    if (
      !resume ||
      (await ResumeMatcher.workProfile(resume)).key !== run.profileKey
    )
      throw fail("本地资料已变化，请重新核对", "RF_AGENT_PROFILE_CHANGED");
  }
  async function send(run, message) {
    await checkPage(run);
    const r = await ResumePageBridge.send(run.tabId, message);
    if (r?.error) throw Error(r.error);
    return r;
  }
  async function observe(run, recovery = false) {
    const { resume, adapters } = await chrome.storage.local.get([
      "resume",
      "adapters",
    ]);
    if (!resume) throw Error("没有简历");
    const profile = await ResumeMatcher.workProfile(resume);
    if (profile.key !== run.profileKey)
      throw fail("资料已变化，请重新核对", "RF_AGENT_PROFILE_CHANGED");
    const snap = await send(run, {
      type: "RF_SCAN",
      adapters: adapters || { version: 1, adapters: [] },
      workProfile: profile,
      counts: Object.fromEntries(
        ["education", "work", "projects"].map((k) => [
          k,
          resume[k]?.length || 0,
        ]),
      ),
    });
    if (
      snap.url !== run.url ||
      pageKey(snap.url) !== run.pageKey ||
      (run.documentId && snap.frameDocumentId !== run.documentId)
    )
      throw fail("页面或文档范围变化", "RF_AGENT_DOCUMENT_CHANGED");
    run.documentId = snap.frameDocumentId;
    const effective = snap.fields.map((f) => ({
      ...f,
      ...(ResumeMatcher.resolveField(f, run.values) || f),
    }));
    for (const f of effective) {
      const b =
        run.approved.get(f.stableId) ||
        (recovery
          ? [...run.approved.values()].find(
              (b) => b.recoveryKey === ResumeRecovery.identity(f),
            )
          : null);
      if (
        !b ||
        f.contextBlocked ||
        f.workBindingRequired ||
        f.ambiguousLabel ||
        ResumeAI.protectedField(f)
      )
        continue;
      const learned = ResumeAnswers.match(f, resume, snap);
      if (
        (learned?.path === b.path &&
          /^fieldAnswers\.\d+\.value$/.test(b.path)) ||
        (/^custom\./.test(b.path) && (!f.section || f.section === "basics"))
      )
        f.supplementalPath = b.path;
    }
    const byKey = new Map();
    for (const f of effective) {
      const key = ResumeRecovery.identity(f);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(f);
    }
    if (!run.identityCounts)
      run.identityCounts = new Map(
        [...byKey].map(([key, items]) => [key, items.length]),
      );
    if (recovery)
      for (const [oldId, b] of [...run.approved]) {
        if (
          effective.some((f) => f.stableId === oldId) ||
          !b.recoveryKey ||
          run.identityCounts.get(b.recoveryKey) !== 1
        )
          continue;
        const matches = byKey.get(b.recoveryKey) || [];
        if (matches.length !== 1) continue;
        const f = matches[0];
        if (
          run.approved.has(f.stableId) ||
          f.ambiguousLabel ||
          f.contextBlocked ||
          ResumeAI.protectedField(f) ||
          signature(f) !== b.signature ||
          !(
            ResumeMatcher.allowedPath(f, b.path) ||
            ResumeRecovery.supplementalAllowed(f, b.path)
          )
        )
          continue;
        run.approved.delete(oldId);
        run.approved.set(f.stableId, b);
      }
    const bindings = [];
    for (const f of effective) {
      const b = run.approved.get(f.stableId),
        key = ResumeRecovery.identity(f);
      if (b && !b.recoveryKey) b.recoveryKey = key;
      if (
        b &&
        b.signature === signature(f) &&
        b.recoveryKey === key &&
        (ResumeMatcher.allowedPath(f, b.path) ||
          ResumeRecovery.supplementalAllowed(f, b.path)) &&
        run.values[b.path]
      )
        bindings.push({ id: f.id, path: b.path });
    }
    run.snapshot = { ...snap, fields: effective };
    return {
      pageKey: run.pageKey,
      documentKey: snap.frameDocumentId,
      fields: effective.map((f) => ({
        id: f.id,
        stableId: f.stableId,
        label: f.label,
        section: f.section,
        recordIndex: f.recordIndex,
        type: f.type,
        required: f.required,
        ambiguousLabel: f.ambiguousLabel,
        contextBlocked: f.contextBlocked,
        familyRole: f.familyRole,
        familyAmbiguous: f.familyAmbiguous,
        recoveryKey: ResumeRecovery.identity(f),
        supplementalPath: f.supplementalPath,
        workBindingRequired: f.workBindingRequired,
        candidatePaths: ResumeMatcher.candidatePaths(f, run.values),
      })),
      candidatePaths: Object.keys(run.values).filter((p) => run.values[p]),
      bindings,
    };
  }
  async function execute(run, call) {
    if (run.cancelled) throw Error("Agent 已停止");
    await checkPage(run);
    await checkProfile(run);
    if (
      ![
        "fill_fields",
        "verify_fields",
        "observe_page",
        "match_fields",
        "wait_page",
        "plan_recovery",
      ].includes(call.name)
    )
      throw Error("Agent 请求了未允许的工具");
    if (call.name === "observe_page")
      return {
        observation: await observe(run, call.arguments.recovery === true),
      };
    if (call.name === "wait_page") {
      const delay = call.arguments.delayMs;
      if (
        !Number.isInteger(delay) ||
        delay < 0 ||
        delay > ResumeRecovery.limits.maxDelayMs
      )
        throw Error("等待时间超出限制");
      const controller = new AbortController();
      run.waitController = controller;
      try {
        await new Promise((resolve, reject) => {
          const done = () => {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
          };
          const abort = () => {
            done();
            reject(Error("等待已取消"));
          };
          const timer = setTimeout(() => {
            done();
            resolve();
          }, delay);
          controller.signal.addEventListener("abort", abort, { once: true });
          if (run.cancelled) abort();
        });
        await checkPage(run);
        await checkProfile(run);
        return { waited: true };
      } finally {
        if (run.waitController === controller) run.waitController = null;
      }
    }
    if (call.name === "plan_recovery") {
      const packet = ResumeRecovery.validatePacket(call.arguments.packet);
      if (
        packet.fields.some((item) => {
          const f = run.snapshot.fields.find((f) => f.id === item.id);
          return !f || !run.approved.has(f.stableId);
        })
      )
        throw Error("恢复字段超出授权");
      const requestId = crypto.randomUUID();
      run.modelRequestId = requestId;
      try {
        const result = await matchAI({
          type: "RF_AI_RECOVERY",
          requestId,
          packet,
        });
        await checkPage(run);
        await checkProfile(run);
        return {
          plan: ResumeRecovery.parse(result.plan, packet),
          source:
            result.endpointOrigin === new URL(run.connection.base).origin &&
            result.gateway?.engine === "local-rules"
              ? "local"
              : "model",
        };
      } finally {
        run.modelRequestId = null;
      }
    }
    if (call.name === "match_fields") {
      const fields = run.snapshot.fields.filter(
        (f) =>
          call.arguments.fieldIds.includes(f.id) &&
          !run.approved.has(f.stableId),
      );
      if (!fields.length) return { matches: [] };
      const packet = ResumeAI.build(fields, run.values, {
        shareValues: false,
        page: run.snapshot.frameUrl || run.snapshot.url,
      });
      if (!packet.fields.length) return { matches: [] };
      const requestId = crypto.randomUUID();
      run.modelRequestId = requestId;
      try {
        const r = await matchAI({ type: "RF_AI_MATCH", requestId, packet });
        await checkPage(run);
        await checkProfile(run);
        return {
          matches: r.accepted.map((m) => ({
            fieldId: m.fieldId,
            path: m.path,
            confidence: m.confidence,
            reason: m.reason,
          })),
        };
      } finally {
        run.modelRequestId = null;
      }
    }
    const { resume, optionMappings = {} } = await chrome.storage.local.get([
        "resume",
        "optionMappings",
      ]),
      current = ResumeMatcher.flatten(resume),
      items = [];
    if ((await ResumeMatcher.workProfile(resume)).key !== run.profileKey)
      throw fail("资料已变化，请重新扫描核对", "RF_AGENT_PROFILE_CHANGED");
    if (
      !Array.isArray(call.arguments.items) ||
      call.arguments.items.length > 200
    )
      throw Error("工具参数无效");
    for (const item of call.arguments.items) {
      const f = run.snapshot.fields.find((f) => f.id === item.id),
        allowed = f && run.approved.get(f.stableId);
      if (
        !allowed ||
        allowed.path !== item.path ||
        allowed.signature !== signature(f) ||
        allowed.recoveryKey !== ResumeRecovery.identity(f) ||
        !Object.hasOwn(run.values, item.path) ||
        current[item.path] !== run.values[item.path]
      )
        throw Error("工具超出授权或简历资料已变化");
      const ruleKey =
        "matching-v2::" +
        run.snapshot.origin +
        run.snapshot.page +
        "::" +
        (new URL(run.snapshot.frameUrl || run.snapshot.url).searchParams.get(
          "formId",
        ) || "") +
        "::" +
        run.snapshot.fingerprint +
        "::" +
        (run.snapshot.adapter || "generic");
      const mappingKey =
        ruleKey +
        "::" +
        JSON.stringify([f.label, f.section, f.recordIndex, f.type, f.path]) +
        "::" +
        item.path +
        "::" +
        run.values[item.path];
      items.push({
        id: item.id,
        path: item.path,
        referenceData: ResumeMatcher.referenceData(item.path, run.values),
        value: optionMappings[mappingKey] || run.values[item.path],
      });
    }
    let ordered = items;
    if (call.name === "fill_fields") {
      try {
        ordered = ResumeRecovery.order(items, run.snapshot.fields);
      } catch {
        throw fail("字段依赖存在歧义，请人工核对", "RF_AGENT_SCOPE_CHANGED");
      }
    }
    const result = await send(run, {
      type: call.name === "fill_fields" ? "RF_FILL" : "RF_VERIFY",
      items: ordered,
      overwrite: false,
      saveCards: false,
    });
    const results = Array.isArray(result) ? result : result.results;
    return {
      ordered: items.some((item, i) => ordered[i]?.id !== item.id),
      results: results.map((r) => ({
        id: r.id,
        status: r.status,
        failureCode: ResumeRecovery.classify(r),
        error: r.status === "verified" ? "" : "未通过本地控件检查",
      })),
    };
  }
  async function loop(run) {
    run.running = true;
    await publish(run);
    try {
      while (run.state?.status === "running" && !run.cancelled) {
        const call = run.state.pending;
        if (!call) throw Error("Agent 未提供下一步工具");
        let result;
        try {
          result = await execute(run, call);
        } catch (e) {
          if (!run.cancelled) {
            const failure = ResumeAI.toolFailure(
              run.invalidated ? { code: run.invalidated } : e,
              call.name,
            );
            run.state = await rpc(run, "error", {
              sessionId: run.state.id,
              callId: call.id,
              errorCode: failure.code,
            });
            run.error = run.state.status === "running" ? "" : failure.message;
            await publish(run);
            if (run.state.status === "running") continue;
          }
          break;
        }
        if (run.cancelled) break;
        run.state = await rpc(run, "result", {
          sessionId: run.state.id,
          callId: call.id,
          result,
        });
        await publish(run);
      }
    } catch (e) {
      run.error = e.message;
    } finally {
      run.running = false;
      await publish(run);
    }
  }
  async function start(message) {
    if ([...runs.values()].some((r) => r.running))
      throw Error("已有 Agent 任务运行中");
    const config = await connection();
    const { resume } = await chrome.storage.local.get("resume");
    if (!resume) throw Error("请先保存简历");
    const values = ResumeMatcher.flatten(resume);
    if (!Array.isArray(message.bindings) || message.bindings.length > 200)
      throw Error("授权字段无效");
    const run = {
      id: crypto.randomUUID(),
      tabId: message.tabId,
      documentId: message.documentId || null,
      url: message.url,
      pageKey: pageKey(message.url),
      connection: config,
      values,
      profileKey: (await ResumeMatcher.workProfile(resume)).key,
      approved: new Map(
        message.bindings.map((b) => {
          if (
            !b ||
            typeof b.stableId !== "string" ||
            typeof b.signature !== "string" ||
            !values[b.path]
          )
            throw Error("授权路径无效");
          return [
            b.stableId,
            {
              path: b.path,
              signature: b.signature,
              recoveryKey: b.recoveryKey || null,
            },
          ];
        }),
      ),
      cancelled: false,
      running: true,
      state: null,
    };
    const observation = await observe(run);
    if (observation.bindings.length !== message.bindings.length)
      throw Error("字段或资料已变化，请重新扫描核对");
    if (message.resumeRunId) {
      const prior = runs.get(message.resumeRunId);
      if (
        !prior ||
        prior.running ||
        prior.state?.status !== "needs_input" ||
        prior.url !== run.url ||
        prior.pageKey !== run.pageKey ||
        prior.tabId !== run.tabId
      )
        throw Error("没有可继续的任务");
      run.id = prior.id;
      run.state = await rpc(run, "resume", {
        sessionId: prior.state.id,
        observation,
        agentProtocol: 2,
        recoveryEnabled: message.recoveryEnabled !== false,
      });
    } else
      run.state = await rpc(run, "start", {
        observation,
        agentProtocol: 2,
        recoveryEnabled: message.recoveryEnabled !== false,
      });
    runs.set(run.id, run);
    while (runs.size > 20) {
      const [id, r] = runs.entries().next().value;
      if (r.running) break;
      runs.delete(id);
    }
    await publish(run);
    void loop(run);
    return { runId: run.id, state: run.state };
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.resume) return;
    void (async () => {
      let key = null;
      try {
        if (changes.resume.newValue)
          key = (await ResumeMatcher.workProfile(changes.resume.newValue)).key;
      } catch {}
      for (const run of runs.values())
        if (run.running && key !== run.profileKey) {
          run.invalidated = "RF_AGENT_PROFILE_CHANGED";
          run.waitController?.abort();
          if (run.modelRequestId) requests.get(run.modelRequestId)?.abort();
          try {
            await ResumePageBridge.send(run.tabId, { type: "RF_CANCEL" });
          } catch {}
        }
    })();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      !["RF_AGENT_START", "RF_AGENT_STATUS", "RF_AGENT_STOP"].includes(
        message.type,
      )
    )
      return;
    if (!sender.url?.startsWith(chrome.runtime.getURL(""))) {
      respond({ error: "仅扩展界面可以控制 Agent" });
      return;
    }
    (async () => {
      if (message.type === "RF_AGENT_START") {
        if (starting) throw Error("Agent 正在启动");
        starting = true;
        try {
          return await start(message);
        } finally {
          starting = false;
        }
      }
      if (message.type === "RF_AGENT_STATUS") {
        const { agentRun } = await chrome.storage.session.get("agentRun");
        if (agentRun?.running && !runs.get(agentRun.runId)?.running)
          return {
            agentRun: {
              ...agentRun,
              running: false,
              state: {
                ...agentRun.state,
                status: "interrupted",
                pending: null,
              },
              error: "后台任务已中断，请重新扫描后启动；未自动重放工具",
            },
          };
        return { agentRun };
      }
      const run = runs.get(message.runId);
      if (!run) throw Error("任务不存在或后台已重启");
      run.cancelled = true;
      run.controller?.abort();
      run.waitController?.abort();
      if (run.modelRequestId) requests.get(run.modelRequestId)?.abort();
      try {
        await ResumePageBridge.send(run.tabId, { type: "RF_CANCEL" });
      } catch {}
      if (run.state)
        run.state = await rpc(run, "cancel", { sessionId: run.state.id });
      run.running = false;
      await publish(run);
      return { stopped: true };
    })().then(respond, (e) => respond({ error: e.message }));
    return true;
  });
})();
