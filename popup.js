const $ = (id) => document.getElementById(id);
let tabId,
  values = {},
  snapshot,
  rows = [],
  resume;
let aiSuggestions = null,
  aiRequestId = null,
  aiRevision = null;
let autoAITimer = null,
  aiGeneration = 0;
const autoAICache = new Map();
let optionMappings = {};
let agentRunning = false,
  agentNeedsRescan = false,
  lastAgentRun = null,
  agentPolling = false;
const status = (text, state) => {
  const el = $("status");
  el.textContent = text;
  el.dataset.state = state || "";
};
const labels = {
  verified: "回读一致",
  preserved: "保留原值",
  stale: "字段失效",
  failed: "填写失败",
  invalid: "格式无效",
  mismatch: "值不一致",
  unconfirmed: "未确认选项",
};
const SECTION_NAMES = {
  ...ResumeFieldLabels.sections,
  skills: "技能",
  summary: "个人简介",
};
const PATH_LABEL_OVERRIDES = {
  basics: { city: "现居城市", idNumber: "证件号码" },
  education: { school: "就读院校", degree: "学历", gpa: "成绩 / GPA" },
  work: { company: "公司", position: "职位", description: "工作描述" },
  projects: { name: "项目名称", role: "承担角色", description: "项目描述" },
};
const fieldLabel = (section, key) =>
  PATH_LABEL_OVERRIDES[section]?.[key] ||
  globalThis.ResumeFieldLabels?.fields[key] ||
  key;
function pathLabel(path) {
  const parts = String(path || "").split(".");
  const section = SECTION_NAMES[parts[0]] || parts[0];
  if (parts[0] === "family")
    return (
      "家庭成员 · " +
      (ResumeMatcher.familyRoles[parts[1]]?.[0] || parts[1]) +
      " · " +
      fieldLabel("family", parts.slice(2).join("."))
    );
  if (parts[0] === "fieldAnswers")
    return "网站补充答案 · 第 " + (Number(parts[1]) + 1) + " 条";
  if (["skills", "summary", "custom"].includes(parts[0]))
    return parts.length > 1
      ? section + " · " + parts.slice(1).join(".")
      : section;
  if (parts.length === 3)
    return (
      section +
      " 第 " +
      (Number(parts[1]) + 1) +
      " 条 · " +
      fieldLabel(parts[0], parts[2])
    );
  return parts.length === 2
    ? section + " · " + fieldLabel(parts[0], parts[1])
    : path;
}
async function run(fn) {
  document
    .querySelectorAll("button")
    .forEach((b) => (b.disabled = b.id !== "cancelFill"));
  document.body.setAttribute("aria-busy", "true");
  status("正在处理，请稍候；可点击取消填写停止页面操作。");
  try {
    await fn();
  } catch (e) {
    status("操作失败：" + e.message, "error");
  } finally {
    document.body.removeAttribute("aria-busy");
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    $("scan").disabled = false;
    $("edit").disabled = false;
    $("fill").disabled = !rows.length;
    $("remember").disabled = !rows.length;
    $("prepare").disabled = !snapshot?.adapter;
    document
      .querySelectorAll("[data-always]")
      .forEach((b) => (b.disabled = false));
  }
}
let fillProgressId = null;
async function send(message) {
  if (agentRunning && message.type !== "RF_CANCEL")
    throw Error("Agent 正在操作页面，请先停止或等待");
  if (agentNeedsRescan && !["RF_SCAN", "RF_CANCEL"].includes(message.type))
    throw Error("Agent 已更新扫描，请先重新扫描页面");
  if (["RF_FILL", "RF_PREPARE"].includes(message.type)) {
    try {
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      requireFormTab(active);
      if (active.id !== tabId || active.url !== snapshot?.url)
        throw Error("当前页面已切换，请重新扫描后填写");
    } catch (e) {
      clearPage();
      throw e;
    }
  }
  if (message.type === "RF_FILL") {
    message = { ...message, progressId: crypto.randomUUID() };
    fillProgressId = message.progressId;
  }
  try {
    const result = await (message.type === "RF_SCAN"
      ? ResumePageBridge.scan(tabId, message)
      : ResumePageBridge.send(tabId, message));
    if (result?.error) throw Error(result.error);
    return result;
  } catch (e) {
    if (e.code === "RF_PAGE_RUNTIME_STALE") clearPage();
    throw e;
  } finally {
    if (message.type === "RF_FILL") fillProgressId = null;
  }
}
const ruleField = (f) =>
  JSON.stringify([f.label, f.section, f.recordIndex, f.type, f.path]);
const ruleKey = () =>
  "matching-v2::" +
  snapshot.origin +
  snapshot.page +
  "::" +
  (new URL(snapshot.frameUrl || snapshot.url).searchParams.get("formId") ||
    "") +
  "::" +
  snapshot.fingerprint +
  "::" +
  (snapshot.adapter || "generic");
function clearPage() {
  snapshot = null;
  tabId = null;
  rows = [];
  $("fields").replaceChildren();
  $("summary").textContent = "请切回招聘网站的简历填写页面，再点击插件扫描。";
  $("scopeStatus").textContent = "";
  $("resultCard").hidden = true;
  $("pagePreview").hidden = true;
  $("webOCRReview").replaceChildren();
  $("aiStatus").textContent = "当前页面不可填写，未请求 AI。";
}
function requireFormTab(tab) {
  let url;
  try {
    url = new URL(tab?.pendingUrl || tab?.url);
  } catch {
    throw Error(
      "无法读取当前页面地址。请切回招聘表单，点击浏览器工具栏中的本插件后再扫描",
    );
  }
  const store =
    url.hostname === "chromewebstore.google.com" ||
    (url.hostname === "chrome.google.com" &&
      /^\/webstore(?:\/|$)/.test(url.pathname)) ||
    (url.hostname === "microsoftedge.microsoft.com" &&
      /^\/addons(?:\/|$)/.test(url.pathname));
  if (store || !["http:", "https:"].includes(url.protocol))
    throw Error(
      "浏览器不允许在扩展管理页、扩展商店或内部页面运行填表。请切回招聘网站的简历填写页面，再点击插件扫描",
    );
  if (!Number.isInteger(tab.id))
    throw Error("当前标签页已失效，请重新打开插件");
  return tab;
}
async function scan(incremental = false, learning = false) {
  clearLearning();
  await cancelAI();
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = requireFormTab(tabs[0]);
  } catch (e) {
    clearPage();
    throw e;
  }
  const oldRows = incremental
    ? new Map(
        rows.map((r) => [
          r.field.stableId,
          {
            path: r.select.value,
            verified: r.verified,
            label: r.field.label,
            section: r.field.section,
            index: r.field.recordIndex,
            aiLocked: r.aiLocked,
            touched: r.touched,
            aiReview: r.aiReview,
          },
        ]),
      )
    : new Map();
  const previousUrl = snapshot?.url,
    previousTab = tabId;
  aiSuggestions = null;
  const data = await chrome.storage.local.get([
    "resume",
    "rules",
    "adapters",
    "optionMappings",
    "aiSettings",
    "autoAIEnabled",
  ]);
  optionMappings = data.optionMappings || {};
  $("autoAI").checked = data.autoAIEnabled !== false;
  if (!data.resume) throw Error("请先打开「管理简历与站点规则」保存简历");
  const enriched = await ResumeProfile.enrich(data.resume);
  resume = enriched.resume;
  if (JSON.stringify(resume) !== JSON.stringify(data.resume))
    await chrome.storage.local.set({ resume });
  values = ResumeMatcher.flatten(resume);
  renderNormalization(enriched.issues);
  tabId = tab.id;
  try {
    await ResumePageBridge.prepare(tabId);
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [
        "profile.js",
        "matcher.js",
        "layout.js",
        "adapters.js",
        "controls.js",
        "answers.js",
        "content.js",
        "inline.js",
      ],
    });
  } catch (e) {
    clearPage();
    if (
      /extensions gallery|cannot be scripted|cannot access|missing host permission/i.test(
        e.message,
      )
    )
      throw Error(
        "浏览器限制了此页面的访问。请切回招聘表单并刷新页面，再从工具栏打开本插件扫描",
      );
    throw e;
  }
  try {
    snapshot = await send({
      type: "RF_SCAN",
      adapters: data.adapters || { version: 1, adapters: [] },
      counts: Object.fromEntries(
        ["education", "work", "projects"].map((key) => [
          key,
          resume[key]?.length || 0,
        ]),
      ),
    });
  } catch (e) {
    clearPage();
    throw e;
  }
  agentNeedsRescan = false;
  void ResumeMetrics.record({ scans: 1 });
  $("scopeStatus").textContent = snapshot.selectedScope
    ? "当前仅处理：" +
      snapshot.selectedScope.section +
      " · 从第 " +
      ((snapshot.selectedScope.recordIndex ?? 0) + 1) +
      " 条经历开始"
    : snapshot.frameId
      ? "当前处理嵌入式表单 · " + new URL(snapshot.frameUrl).pathname
      : "当前处理整页";
  const rules = data.rules?.[ruleKey()] || {};
  $("fields").replaceChildren();
  rows = [];
  $("resultCard").hidden = true;
  $("resultCard").replaceChildren();
  for (const field of snapshot.fields) {
    const savedAnswer = ResumeAnswers.match(field, resume, snapshot);
    const guess =
      savedAnswer ||
      (field.path
        ? { path: field.path }
        : ResumeMatcher.match(field, values) || ResumeMatcher.infer(field));
    if (guess?.path && !Object.hasOwn(values, guess.path))
      values[guess.path] = "";
    const old =
      previousUrl === snapshot.url && previousTab === tabId
        ? oldRows.get(field.stableId)
        : null;
    const same =
      old &&
      old.label === field.label &&
      old.section === field.section &&
      old.index === field.recordIndex;
    const key = ruleField(field),
      chosen = same
        ? old.path
        : Object.hasOwn(rules, key)
          ? rules[key]
          : guess?.path || "";
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.textContent = field.label + (field.required ? " *" : "");
    const small = document.createElement("small");
    small.textContent = [
      field.context,
      Number.isInteger(field.recordIndex)
        ? `第 ${field.recordIndex + 1} 条`
        : "",
      field.evidence,
      field.matchWarning,
    ]
      .filter(Boolean)
      .join(" · ");
    left.append(small);
    const right = document.createElement("div"),
      select = document.createElement("select");
    select.setAttribute("aria-label", field.label + " 对应简历字段");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "跳过 / 尚未确定匹配";
    select.append(blank);
    for (const path of Object.keys(values).filter(
      (p) =>
        (!snapshot.selectedScope && !ResumeMatcher.isFamilyField(field)) ||
        ResumeMatcher.allowedPath(field, p),
    )) {
      const option = document.createElement("option");
      option.value = path;
      option.textContent = pathLabel(path);
      option.title = path;
      select.append(option);
    }
    select.value = chosen;
    const preview = document.createElement("input");
    preview.readOnly = true;
    preview.setAttribute("aria-label", "填充值预览");
    const draft = document.createElement("textarea");
    draft.rows = 2;
    draft.setAttribute("aria-label", field.label + " 补充资料");
    draft.maxLength = 20000;
    const state = {
      field,
      select,
      key,
      small,
      aiLocked: same
        ? old.aiLocked
        : !!savedAnswer || !!field.path || Object.hasOwn(rules, key),
      touched: !!(same && old.touched),
      aiReview: same
        ? old.aiReview
        : !savedAnswer &&
          !field.path &&
          !Object.hasOwn(rules, key) &&
          (!guess || guess.score < 100 || !values[guess.path]),
      verified: !!(same && old.verified),
      preview,
      draft,
      row,
    };
    const update = () => {
      preview.value = values[select.value] || "";
      draft.hidden = !!preview.value || ResumeAnswers.protectedField(field);
      draft.placeholder = select.value
        ? `已识别 ${pathLabel(select.value)}，尚无资料；请补充或检查桌面资料更新`
        : field.ambiguousLabel
          ? "经历或字段归属不明确，请选择区块后重新扫描"
          : field.contextBlocked
            ? "此类经历尚无专用资料结构，可手动选取或保存本页补充答案"
            : "尚未确定对应资料，请先选择已有 JSON 字段；确实缺少时再补充保存";
    };
    state.update = update;
    select.onchange = () => {
      state.touched = true;
      state.verified = false;
      update();
      summary();
    };
    draft.oninput = () => (state.touched = true);
    update();
    right.append(select, preview, draft);
    row.append(left, right);
    $("fields").append(row);
    rows.push(state);
  }
  const prior = rows.filter((r) => r.verified && r.select.value);
  if (prior.length) {
    const checked = await send({
      type: "RF_VERIFY",
      items: prior.map((r) => ({
        id: r.field.id,
        path: r.select.value,
        referenceData: ResumeMatcher.referenceData(r.select.value, values),
        value: optionMappings[optionKey(r)] || values[r.select.value],
      })),
    });
    const verified = new Set(
      checked.filter((r) => r.status === "verified").map((r) => r.id),
    );
    prior.forEach((r) => {
      r.verified = verified.has(r.field.id);
      if (r.verified) r.small.textContent = "已重新回读一致，本轮跳过";
    });
  }
  // Unresolved fields first (required first), so review starts at the top.
  const order = (r) =>
    r.select.value && values[r.select.value] ? 2 : r.field.required ? 0 : 1;
  [...rows]
    .sort((a, b) => order(a) - order(b))
    .forEach((r) => $("fields").append(r.row));
  $("scan").classList.remove("primary");
  summary();
  status(
    snapshot.sectionIssues.length
      ? snapshot.sectionIssues.map((s) => `${s.section}：${s.error}`).join("\n")
      : "核对匹配后填写。多段经历可先补齐卡片。",
  );
  if (!learning) scheduleAutoAI(data.aiSettings);
}
function summary() {
  const matched = rows.filter(
      (r) => r.select.value && values[r.select.value],
    ).length,
    required = rows.filter(
      (r) => r.field.required && (!r.select.value || !values[r.select.value]),
    ).length,
    missing = snapshot.coverage.reduce((n, c) => n + c.missing, 0);
  $("summary").textContent =
    `${snapshot.adapter || "通用识别"} · ${rows.length} 个字段 · 有资料 ${matched} · 必填缺漏 ${required} · 待补经历 ${missing}`;
}
$("edit").onclick = () => chrome.runtime.openOptionsPage();
$("scan").onclick = () => run(scan);
$("incremental").onclick = () => run(() => scan(true));
// Explicit local learning: no form writes and no model requests with captured values.
let learningReview = null,
  learningChecks = [];
const learnButton = document.createElement("button");
learnButton.id = "learnScan";
learnButton.textContent = "重新扫描并学习已填内容";
$("scan").after(learnButton);
const familyMemoLabel = document.createElement("label"),
  familyMemo = document.createElement("input");
familyMemo.type = "checkbox";
familyMemo.id = "autoFamilyLearning";
familyMemoLabel.append(
  familyMemo,
  document.createTextNode("自动记住手动填写的家庭成员（仅本机）"),
);
const familyMemoNote = document.createElement("p");
familyMemoNote.append(familyMemoLabel);
$("autoAI").closest("p").after(familyMemoNote);
void chrome.storage.local
  .get("autoFamilyLearning")
  .then((data) => (familyMemo.checked = !!data.autoFamilyLearning));
familyMemo.onchange = async () => {
  await chrome.storage.local.set({ autoFamilyLearning: familyMemo.checked });
  status(
    familyMemo.checked
      ? "已开启：按所选家庭关系记住手动输入，不覆盖已有不同值。"
      : "已关闭家庭成员自动记忆。",
  );
};
const learnPanel = document.createElement("section");
learnPanel.id = "learningReview";
learnPanel.className = "card";
learnPanel.hidden = true;
$("fields").before(learnPanel);
function clearLearning() {
  learningReview = null;
  learningChecks = [];
  learnPanel.hidden = true;
  learnPanel.replaceChildren();
}
function showLearning(review) {
  learningReview = review;
  learnPanel.hidden = false;
  const title = document.createElement("h2");
  title.textContent = `学习预览 · ${review.items.length} 项新增或修改`;
  learnPanel.append(title);
  const note = document.createElement("p");
  note.textContent =
    "仅保存你勾选的内容到本地 JSON；修改项和敏感项默认不勾选。不会填写或提交网页，也不会将这些值发送给 AI。";
  learnPanel.append(note);
  for (const [index, item] of review.items.entries()) {
    const row = document.createElement("div"),
      label = document.createElement("label"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.checked = item.checked;
    check.dataset.learningIndex = index;
    label.append(
      check,
      document.createTextNode(
        `${item.kind}${item.sensitive ? " · 敏感资料" : ""}：${item.field.label} → ${item.path ? pathLabel(item.path) : "网站补充答案"}`,
      ),
    );
    const before = document.createElement("p"),
      after = document.createElement("p");
    before.textContent = "原值：" + (item.oldValue || "（无）");
    after.textContent = "网页值：" + item.value;
    before.style.whiteSpace = after.style.whiteSpace = "pre-wrap";
    row.append(label, before, after);
    learnPanel.append(row);
    learningChecks.push(check);
  }
  if (review.skipped.length) {
    const note = document.createElement("p");
    note.textContent =
      "未学习：" +
      review.skipped.map((s) => s.label + "（" + s.reason + "）").join("；");
    learnPanel.append(note);
  }
  const sensitiveLabel = document.createElement("label"),
    sensitiveCheck = document.createElement("input");
  sensitiveCheck.type = "checkbox";
  sensitiveCheck.id = "learnSensitive";
  sensitiveLabel.append(
    sensitiveCheck,
    document.createTextNode("我确认将勾选的敏感资料保存到本地 JSON"),
  );
  learnPanel.append(sensitiveLabel);
  const save = document.createElement("button");
  save.id = "learnSave";
  save.textContent = "确认保存所选学习项";
  save.onclick = () =>
    run(async () => {
      if (learningReview !== review) throw Error("学习预览已失效，请重新扫描");
      const indices = learningChecks.flatMap((c, i) => (c.checked ? [i] : []));
      if (!indices.length) throw Error("请选择至少一项资料");
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      requireFormTab(active);
      if (active.id !== tabId || active.url !== snapshot.url)
        throw Error("当前页面已切换，请重新扫描并学习");
      const live = await send({ type: "RF_LEARN_READ" }),
        read = new Map(live.map((f) => [f.id, String(f.value ?? "").trim()]));
      for (const i of indices)
        if (read.get(review.items[i].field.id) !== review.items[i].value)
          throw Error("网页内容已改变或字段已隐藏，请重新扫描并学习");
      const { resume: current } = await chrome.storage.local.get("resume");
      const updated = ResumeLearning.apply(
          current,
          review,
          indices,
          sensitiveCheck.checked,
        ),
        enriched = await ResumeProfile.enrich(updated);
      const latest = await chrome.storage.local.get("resume");
      ResumeLearning.apply(
        latest.resume,
        review,
        indices,
        sensitiveCheck.checked,
      );
      await chrome.storage.local.set({
        resumeLearningBackup: {
          resume: current,
          createdAt: new Date().toISOString(),
        },
        resume: enriched.resume,
      });
      void ResumeMetrics.record({ learned: indices.length });
      await scan(false, true);
      status(
        `已学习 ${indices.length} 项并保存到本地 JSON，保留了学习前的备份。下次扫描会使用这些资料；可在管理页查看和导出。`,
      );
    });
  learnPanel.append(save);
  const discard = document.createElement("button");
  discard.textContent = "放弃本次学习";
  discard.onclick = clearLearning;
  learnPanel.append(discard);
}
learnButton.onclick = () =>
  run(async () => {
    await scan(false, true);
    const review = ResumeLearning.plan(resume, snapshot);
    showLearning(review);
    status(
      `已读取当前可见表单，发现 ${review.items.length} 项差异。请核对后保存。`,
    );
  });
$("normalizeProfile").onclick = () =>
  run(async () => {
    const { resume: current } = await chrome.storage.local.get("resume");
    if (!current) throw Error("请先保存简历");
    const enriched = await ResumeProfile.enrich(current);
    await chrome.storage.local.set({ resume: enriched.resume });
    renderNormalization(enriched.issues);
    status(
      `已整理 ${enriched.changes.length} 项，待确认 ${enriched.issues.length} 项；原始地区保留。重新扫描可使用新增路径。`,
    );
  });
function renderNormalization(issues) {
  const panel = $("normalization");
  panel.replaceChildren();
  for (const issue of issues) {
    const box = document.createElement("div"),
      note = document.createElement("p");
    note.textContent =
      issue.path +
      "：" +
      issue.status +
      (issue.raw ? "（" + issue.raw + "）" : "");
    box.append(note);
    if (issue.status === "ambiguous") {
      const select = document.createElement("select"),
        blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "请选择实际地区";
      select.append(blank);
      for (const c of issue.candidates) {
        const o = document.createElement("option");
        o.value = c.path;
        o.textContent = c.path;
        select.append(o);
      }
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "确认地区层级";
      save.onclick = () =>
        run(async () => {
          if (!select.value) throw Error("请选择地区");
          const { resume: current } = await chrome.storage.local.get("resume");
          const updated = ResumeProfile.confirmRegion(
            current,
            issue.path.split(".")[1],
            issue.raw,
            select.value,
          );
          await chrome.storage.local.set({ resume: updated });
          box.remove();
          status("已保存确认的地区层级；重新扫描使用。");
        });
      box.append(select, save);
    }
    panel.append(box);
  }
}
$("saveAnswers").onclick = () =>
  run(async () => {
    if (!snapshot) throw Error("请先扫描页面");
    const drafts = rows
      .filter((r) => !r.draft.hidden && r.draft.value.trim())
      .map((r) => ({
        field: r.field,
        value: r.draft.value,
        path: r.select.value || null,
      }));
    if (!drafts.length) throw Error("请先填写至少一项补充资料");
    const current = await chrome.storage.local.get("resume");
    const enriched = await ResumeProfile.enrich(
      ResumeAnswers.save(current.resume || resume, drafts, snapshot),
    );
    await chrome.storage.local.set({ resume: enriched.resume });
    await scan();
    status(
      `已将 ${drafts.length} 项补充资料保存到简历 JSON，并更新匹配；核对后点击填写。下次同站点、页面和分组自动复用。`,
    );
  });
$("prepare").onclick = () =>
  run(async () => {
    const counts = Object.fromEntries(
      ["education", "work", "projects"].map((key) => [
        key,
        resume[key]?.length || 0,
      ]),
    );
    const result = await send({ type: "RF_PREPARE", counts });
    await scan();
    status(
      result
        .map(
          (r) =>
            `${r.section}：${r.status === "prepared" ? `已准备 ${r.count} 条` : r.error}`,
        )
        .join("\n") || "此适配没有经历卡片规则",
    );
  });
$("fill").onclick = () =>
  run(async () => {
    await cancelAI();
    const items = rows
      .filter(
        (r) =>
          (!r.verified || $("saveCards").checked) &&
          r.select.value &&
          values[r.select.value],
      )
      .map((r) => ({
        id: r.field.id,
        path: r.select.value,
        referenceData: ResumeMatcher.referenceData(r.select.value, values),
        value: optionMappings[optionKey(r)] || values[r.select.value],
        verifyOnly: r.verified,
      }));
    status("正在填写并核对 " + items.length + " 个字段，可点击取消填写停止。");
    const response = await send({
      type: "RF_FILL",
      overwrite: $("overwrite").checked,
      saveCards: $("saveCards").checked,
      items,
    });
    const final = new Map(response.results.map((r) => [r.id, r]));
    rows.forEach((r) => {
      const result = final.get(r.field.id);
      if (result) r.verified = result.status === "verified";
      r.resultStatus = result
        ? result.status
        : r.verified
          ? "verified"
          : "unmatched";
      r.small.textContent = result
        ? [labels[result.status] || result.status, result.error]
            .filter(Boolean)
            .join("：")
        : r.verified
          ? "已回读一致，本轮跳过"
          : "未填：未匹配或没有资料";
    });
    for (const r of rows) {
      const result = final.get(r.field.id);
      if (result?.status === "failed" && result.candidates?.length)
        renderOptions(r, result.candidates);
    }
    const verified = response.results.filter(
        (r) => r.status === "verified",
      ).length,
      preserved = response.results.filter(
        (r) => r.status === "preserved",
      ).length,
      failed = response.results.length - verified - preserved,
      skipped = rows.length - items.length;
    const checkpoint = {
      schema_version: 3,
      extension_version: chrome.runtime.getManifest().version,
      page_runtime_version: snapshot.runtimeVersion || null,
      updated_at: new Date().toISOString(),
      page: snapshot.origin + snapshot.page,
      adapter: snapshot.adapter,
      fingerprint: snapshot.fingerprint,
      state: "review_required",
      submission_verified: false,
      counts: { verified, preserved, failed, skipped },
      sections: snapshot.sectionIssues,
      coverage: snapshot.coverage,
      saves: response.saves,
      fields: rows.map((r) => ({
        label: r.field.label,
        section: r.field.section,
        recordIndex: r.field.recordIndex,
        path: r.select.value,
        required: r.field.required,
        type: r.field.type,
        evidence: r.field.evidence,
        context: r.field.context,
        regionRole: r.field.regionRole,
        regionLevel: r.field.regionLevel,
        ambiguousLabel: !!r.field.ambiguousLabel,
        options: (r.field.options || []).slice(0, 60),
        status:
          final.get(r.field.id)?.status ||
          (r.verified ? "verified" : "unmatched"),
        error: final.get(r.field.id)?.error || "",
        diagnostic: final.get(r.field.id)?.diagnostic || null,
      })),
    };
    await chrome.storage.local.set({ lastCheckpoint: checkpoint });
    void ResumeMetrics.record({
      fillRuns: 1,
      attempted: items.length,
      verified,
      preserved,
      failed,
    });
    renderResults();
    status(
      `回读一致 ${verified} · 保留 ${preserved} · 失败 ${failed} · 未填 ${skipped}\n` +
        response.saves
          .map(
            (s) =>
              `${s.section} 第 ${s.index + 1} 条：${s.status === "save_indicator_observed" ? "已观察到页面保存标识" : s.error}`,
          )
          .join("\n") +
        "\n请核对网页；未检查其他分页或服务器保存状态。",
    );
  });
function renderResults() {
  const card = $("resultCard");
  card.replaceChildren();
  const done = rows.filter((r) => r.resultStatus);
  if (!done.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const count = (s) => rows.filter((r) => r.resultStatus === s).length;
  const failedRows = rows.filter(
    (r) =>
      r.resultStatus && !["verified", "preserved"].includes(r.resultStatus),
  );
  const head = document.createElement("strong");
  head.textContent = `本次结果：回读一致 ${count("verified")} · 保留原值 ${count("preserved")} · 待处理 ${failedRows.length}`;
  card.append(head);
  for (const r of failedRows) {
    const line = document.createElement("div");
    line.className = "result-row";
    const text = document.createElement("span");
    text.textContent = `${r.field.label}：${labels[r.resultStatus] || "未填写"}`;
    line.append(text);
    if (r.select.value && values[r.select.value]) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试此字段";
      retry.onclick = () =>
        run(async () => {
          const response = await send({
            type: "RF_FILL",
            overwrite: $("overwrite").checked,
            saveCards: $("saveCards").checked,
            items: [
              {
                id: r.field.id,
                path: r.select.value,
                referenceData: ResumeMatcher.referenceData(
                  r.select.value,
                  values,
                ),
                value: optionMappings[optionKey(r)] || values[r.select.value],
              },
            ],
          });
          const result = response.results[0];
          r.resultStatus = result?.status || "failed";
          r.verified = result?.status === "verified";
          r.small.textContent = result
            ? [labels[result.status] || result.status, result.error]
                .filter(Boolean)
                .join("：")
            : "未填";
          if (result?.status === "failed" && result.candidates?.length)
            renderOptions(r, result.candidates);
          renderResults();
          status(
            r.verified
              ? "重试成功，回读一致。"
              : "重试仍未通过：" + (result?.error || "请检查字段"),
            r.verified ? "" : "error",
          );
        });
      line.append(retry);
    }
    card.append(line);
  }
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "请核对网页；未检查其他分页或服务器保存状态。";
  card.append(note);
}
function optionKey(r) {
  return (
    ruleKey() +
    "::" +
    ruleField(r.field) +
    "::" +
    r.select.value +
    "::" +
    values[r.select.value]
  );
}
function optionAIButton(r, candidates, select, box) {
  const ask = document.createElement("button");
  ask.type = "button";
  ask.textContent = "AI 建议真实选项";
  ask.onclick = async () => {
    try {
      if (!$("shareValues").checked)
        throw Error("选项匹配需发送此字段值和候选项，请先勾选附带简历值");
      if (aiRequestId) throw Error("已有 AI 请求，请等待或取消");
      if (!r.select.value || !values[r.select.value])
        throw Error("请先关联简历路径");
      const packet = {
        kind: "options",
        version: 1,
        fieldId: r.field.id,
        label: r.field.label,
        path: r.select.value,
        value: String(values[r.select.value]).slice(0, 1200),
        context: { regionRole: r.field.regionRole, level: r.field.regionLevel },
        candidates: candidates.map((c, i) => ({ id: "o" + i, text: c.text })),
      };
      $("aiPayload").hidden = false;
      $("aiPayload").textContent = JSON.stringify(packet, null, 2);
      const requestId = crypto.randomUUID(),
        current = snapshot;
      aiRequestId = requestId;
      status("正在请求真实选项建议…");
      const result = await chrome.runtime.sendMessage({
        type: "RF_AI_OPTION",
        requestId,
        packet,
      });
      if (aiRequestId !== requestId) return;
      aiRequestId = null;
      if (result?.error) throw Error(result.error);
      if (snapshot !== current || !box.isConnected)
        throw Error("页面匹配已更新，建议已丢弃");
      const suggestion = result.suggestion,
        candidate = packet.candidates.find(
          (c) => c.id === suggestion?.candidateId,
        );
      if (!candidate) {
        status(suggestion?.reason || "未找到可靠选项，请人工选择");
        return;
      }
      select.value = candidate.text;
      status(
        `${result.gateway?.engine === "local-rules" ? "本地规则（未调用模型） " : result.gateway ? "模型网关 " : ""}建议：${candidate.text}（${Math.round(suggestion.confidence * 100)}%）${suggestion.reason}；核对后点击填写并记住。`,
      );
    } catch (e) {
      aiRequestId = null;
      status("选项建议失败：" + e.message);
    }
  };
  box.append(ask);
}
function renderOptions(r, candidates) {
  r.optionBox?.remove();
  const box = document.createElement("div"),
    select = document.createElement("select"),
    blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "请选择网页中的真实选项";
  select.setAttribute("aria-label", r.field.label + " 网页真实选项");
  select.append(blank);
  for (const c of candidates) {
    const o = document.createElement("option");
    o.value = c.text;
    o.textContent = c.text;
    select.append(o);
  }
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "填写并记住此选项";
  b.onclick = () =>
    run(async () => {
      if (!select.value) throw Error("请选择选项");
      const response = await send({
        type: "RF_FILL",
        overwrite: true,
        items: [
          {
            id: r.field.id,
            path: r.select.value,
            value: select.value,
            manualOption: true,
          },
        ],
      });
      const result = response.results[0];
      if (result?.status !== "verified")
        throw Error(result?.error || "回读未通过");
      if (r.select.value && values[r.select.value]) {
        optionMappings[optionKey(r)] = select.value;
        await chrome.storage.local.set({ optionMappings });
      }
      r.verified = true;
      r.small.textContent = "用户确认选项，回读一致";
      box.remove();
      status("已填写并按站点、字段和原始值记住选项映射。");
    });
  box.append(select, b);
  optionAIButton(r, candidates, select, box);
  r.preview.parentElement.append(box);
  r.optionBox = box;
}
$("remember").onclick = () =>
  run(async () => {
    const { rules = {} } = await chrome.storage.local.get("rules");
    rules[ruleKey()] = Object.fromEntries(
      rows.map((r) => [r.key, r.select.value]),
    );
    await chrome.storage.local.set({ rules });
    status("已按域名、路径、表单结构和经历序号记住匹配");
  });
$("screenshot").onclick = () =>
  run(async () => {
    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = requireFormTab(active);
    if (tabId && tab.id !== tabId) throw Error("当前标签页已变化，请重新扫描");
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    $("pagePreview").src = url;
    $("pagePreview").hidden = false;
    status("仅当前可见区域，供人工核对；未上传或保存截图。");
  });
$("checkpoint").onclick = () =>
  run(async () => {
    const { lastCheckpoint } = await chrome.storage.local.get("lastCheckpoint");
    if (!lastCheckpoint) throw Error("请先填写一次");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(lastCheckpoint, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "application-checkpoint.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
function aiPacket(automatic = false) {
  if (!snapshot) throw Error("请先扫描页面");
  const pending = rows.filter((r) => ResumeAI.reviewable(r, values));
  if (!pending.length)
    throw Error("没有未解决或需复核的自动匹配字段；人工选择和已核对项保持不变");
  const packet = ResumeAI.build(
    pending.map((r) => r.field),
    values,
    {
      shareValues: !automatic && $("shareValues").checked,
      page: snapshot.frameUrl || snapshot.url,
    },
  );
  if (!packet.fields.length)
    throw Error("没有足够相关的候选资料，请手动匹配或补充资料");
  return packet;
}
async function cancelAI() {
  clearTimeout(autoAITimer);
  autoAITimer = null;
  aiGeneration++;
  const requestId = aiRequestId;
  aiRequestId = null;
  aiSuggestions = null;
  if (requestId)
    await chrome.runtime.sendMessage({ type: "RF_AI_CANCEL", requestId });
}
function applyAISuggestions(matches, automatic = false) {
  let count = 0;
  for (const m of matches) {
    const r = rows.find((r) => r.field.id === m.fieldId);
    if (
      r &&
      ResumeAI.reviewable(r, values) &&
      ResumeMatcher.allowedPath(r.field, m.path) &&
      values[m.path]
    ) {
      r.select.value = m.path;
      if (r.select.value !== m.path) continue;
      r.update();
      r.small.textContent = `AI 建议 ${Math.round(m.confidence * 100)}%：${m.reason} · 请核对后填写`;
      count++;
    }
  }
  summary();
  return count;
}
function scheduleAutoAI(config) {
  if (!$("autoAI").checked) {
    $("aiStatus").textContent = "AI 主动匹配已关闭，可手动请求建议。";
    return;
  }
  if (!config?.enabled) {
    $("aiStatus").textContent = "尚未启用模型；配置后扫描会自动请求 AI 建议。";
    return;
  }
  let packet;
  try {
    packet = aiPacket(true);
  } catch (e) {
    $("aiStatus").textContent = "AI：" + e.message;
    return;
  }
  $("aiStatus").textContent =
    `本地匹配完成，AI 将继续分析 ${packet.fields.length} 个未解决或待复核字段…`;
  const generation = aiGeneration;
  autoAITimer = setTimeout(() => {
    autoAITimer = null;
    if (generation === aiGeneration) void requestFieldAI(true);
  }, 250);
}
$("autoAI").onchange = async () => {
  await cancelAI();
  await chrome.storage.local.set({ autoAIEnabled: $("autoAI").checked });
  const { aiSettings } = await chrome.storage.local.get("aiSettings");
  if (snapshot) scheduleAutoAI(aiSettings);
};
void chrome.storage.local.get("autoAIEnabled").then((data) => {
  $("autoAI").checked = data.autoAIEnabled !== false;
});
addEventListener("pagehide", () => {
  clearTimeout(autoAITimer);
  if (aiRequestId)
    void chrome.runtime
      .sendMessage({ type: "RF_AI_CANCEL", requestId: aiRequestId })
      .catch(() => {});
});
$("aiPreview").onclick = () =>
  run(async () => {
    $("aiPayload").textContent = JSON.stringify(aiPacket(), null, 2);
    $("aiPayload").hidden = false;
    status(
      "以上为完整请求数据；不包含截图、Cookie 或页面 HTML。附带简历值选项由你控制。",
    );
  });
async function requestFieldAI(automatic = false) {
  let ownRequest = null;
  try {
    if (aiRequestId) throw Error("已有 AI 请求，请等待或取消");
    if (agentRunning) return;
    const packet = aiPacket(automatic),
      requestId = crypto.randomUUID(),
      version = snapshot,
      generation = aiGeneration;
    const { aiSettings } = await chrome.storage.local.get("aiSettings");
    if (generation !== aiGeneration || snapshot !== version || aiRequestId)
      return;
    const cacheKey = JSON.stringify([
      aiSettings,
      packet.fields.map(({ id, ...f }) => f),
      packet.candidates,
      packet.page,
    ]);
    const cached = automatic && autoAICache.get(cacheKey);
    ownRequest = requestId;
    aiRequestId = requestId;
    aiRevision = version;
    aiSuggestions = null;
    $("aiPayload").textContent = JSON.stringify(packet, null, 2);
    if (!automatic) $("aiPayload").hidden = false;
    $("aiStatus").textContent =
      `AI 正在分析 ${packet.fields.length} 个未解决或待复核字段，已匹配内容可继续核对…`;
    if (!automatic) status("正在请求 AI 字段建议…");
    const response = cached
      ? {
          ...cached,
          accepted: cached.accepted.map((m) => ({
            ...m,
            fieldId: packet.fields.find((f) => f.stableId === m.stableId)?.id,
          })),
        }
      : await chrome.runtime.sendMessage({
          type: "RF_AI_MATCH",
          requestId,
          packet,
        });
    if (aiRequestId !== requestId) return;
    aiRequestId = null;
    if (response?.error) throw Error(response.error);
    if (snapshot !== version) throw Error("扫描已更新，旧 AI 建议已丢弃");
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (generation !== aiGeneration || snapshot !== version) return;
    if (activeTab?.id !== tabId || activeTab?.url !== snapshot.url)
      throw Error("当前页面已切换，AI 建议已丢弃，请重新扫描");
    aiSuggestions = response.accepted;
    void ResumeMetrics.record({
      aiRequests: cached ? 0 : 1,
      aiAccepted: response.accepted.length,
    });
    $("aiPayload").textContent = JSON.stringify(
      {
        suggestions: response.accepted,
        rejected: response.rejected,
        unmatched: response.unmatched,
      },
      null,
      2,
    );
    if (automatic) {
      if (!cached) {
        autoAICache.set(cacheKey, {
          ...response,
          accepted: response.accepted.map((m) => ({
            ...m,
            stableId: packet.fields.find((f) => f.id === m.fieldId)?.stableId,
          })),
        });
        if (autoAICache.size > 10)
          autoAICache.delete(autoAICache.keys().next().value);
      }
      const count = applyAISuggestions(response.accepted, true);
      aiSuggestions = null;
      $("aiStatus").textContent =
        `${response.gateway?.engine === "local-rules" ? "本地网关规则" : "AI"}${cached ? "（复用本次会话建议）" : ""}已将 ${count} 项建议加入预览，拒绝 ${response.rejected.length} 项，未给建议 ${response.unmatched?.length || 0} 项；核对后点击填写。`;
      return;
    }
    $("aiStatus").textContent =
      `AI 返回 ${response.accepted.length} 项建议，待核对并应用。`;
    status(
      `${response.gateway?.engine === "local-rules" ? "本地规则（未调用模型）" : "AI"} 建议 ${response.accepted.length} 项，拒绝 ${response.rejected.length} 项。核对上方路径和理由，再点击应用；应用后仍需点击填写。`,
    );
  } catch (e) {
    if (ownRequest && aiRequestId && aiRequestId !== ownRequest) return;
    if (ownRequest && aiRequestId === ownRequest) aiRequestId = null;
    $("aiStatus").textContent =
      "AI 匹配失败：" + e.message + "；已有本地匹配仍可填写。";
    if (!automatic) status("AI 匹配失败：" + e.message);
  }
}
$("aiRun").onclick = async () => {
  await cancelAI();
  return requestFieldAI(false);
};
$("aiApply").onclick = () =>
  run(async () => {
    if (!aiSuggestions || aiRevision !== snapshot)
      throw Error("没有当前扫描的有效 AI 建议");
    applyAISuggestions(aiSuggestions);
    aiSuggestions = null;
    status("建议已加入字段预览；核对填充值后点击一键填充。");
  });
$("aiCancel").onclick = async () => {
  await cancelAI();
  $("aiStatus").textContent = "AI 请求已取消";
  status("AI 请求已取消");
};
async function agentMessage(type, extra = {}) {
  const r = await chrome.runtime.sendMessage({ type, ...extra });
  if (r?.error) throw Error(r.error);
  return r;
}
async function refreshAgent() {
  if (agentPolling) return;
  agentPolling = true;
  try {
    const { agentRun } = await agentMessage("RF_AGENT_STATUS");
    if (!agentRun) return;
    lastAgentRun = agentRun;
    agentRunning = !!agentRun.running;
    if (agentRun.tabId === tabId) agentNeedsRescan = true;
    const s = agentRun.state;
    const names = {
      running: "运行中",
      needs_input: "等待补充或核对",
      completed: "授权字段已验证",
      cancelled: "已停止",
      interrupted: "后台已中断",
    };
    $("agentStatus").textContent =
      `Agent：${names[s?.status] || "中断"} · ${s?.steps || 0} 步 · 回读 ${s?.counts?.verified || 0}/${s?.counts?.approved || 0} · 未核对 ${s?.counts?.unbound || 0}\n${agentRun.error || s?.reason || s?.pending?.name || ""}`;
    for (const r of rows) {
      const outcome = s?.fields?.find((f) => f.stableId === r.field.stableId);
      if (outcome)
        r.small.textContent =
          "Agent：" + (labels[outcome.status] || outcome.status);
    }
  } catch (e) {
    $("agentStatus").textContent = "Agent：" + e.message;
  } finally {
    agentPolling = false;
  }
}
async function startAgent(resumeTask = false) {
  await cancelAI();
  if (!snapshot) throw Error("请先扫描并核对字段");
  if (agentRunning) throw Error("Agent 正在运行");
  const bindings = rows
    .filter((r) => r.select.value && values[r.select.value])
    .map((r) => ({
      stableId: r.field.stableId,
      signature: JSON.stringify([
        r.field.label,
        r.field.section,
        r.field.recordIndex,
        r.field.type,
      ]),
      path: r.select.value,
    }));
  const r = await agentMessage("RF_AGENT_START", {
    tabId,
    url: snapshot.url,
    bindings,
    ...(resumeTask ? { resumeRunId: lastAgentRun?.runId } : {}),
  });
  agentRunning = true;
  agentNeedsRescan = true;
  status(
    "Agent 已启动，只处理已选择路径且有资料的字段；不会覆盖已有不同值或提交申请。",
  );
  await refreshAgent();
  return r;
}
$("agentStart").onclick = () => run(() => startAgent(false));
$("agentResume").onclick = () => run(() => startAgent(true));
$("agentRefresh").onclick = () => refreshAgent();
$("agentStop").onclick = async () => {
  try {
    if (!lastAgentRun) return;
    await agentMessage("RF_AGENT_STOP", { runId: lastAgentRun.runId });
    agentRunning = false;
    await refreshAgent();
  } catch (e) {
    status(e.message);
  }
};
$("agentApply").onclick = () =>
  run(async () => {
    if (agentRunning) throw Error("请等待 Agent 暂停");
    const proposals = lastAgentRun?.state?.proposals || [];
    let count = 0;
    for (const p of proposals) {
      const r = rows.find((r) => r.field.stableId === p.stableId);
      if (r && !r.select.value && values[p.path]) {
        r.select.value = p.path;
        r.select.dispatchEvent(new Event("change"));
        r.small.textContent = "Agent 建议：" + p.reason;
        count++;
      }
    }
    summary();
    status(`已应用 ${count} 项建议；请核对后重新扫描或继续 Agent。`);
  });
$("agentExport").onclick = () =>
  run(async () => {
    await refreshAgent();
    if (!lastAgentRun) throw Error("没有 Agent 记录");
    const data = {
      schema_version: 1,
      kind: "resumefill-agent-checkpoint",
      ...lastAgentRun,
      submission_verified: false,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "agent-checkpoint.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
setInterval(() => {
  if (lastAgentRun?.running) void refreshAgent();
}, 1000);
void refreshAgent();

$("cancelFill").onclick = async () => {
  try {
    await send({ type: "RF_CANCEL" });
    status("已请求取消，等待中的操作将停止。");
  } catch (e) {
    status(e.message);
  }
};

$("webOCRCancel").onclick = () =>
  chrome.runtime.sendMessage({ type: "RF_WEB_OCR_CANCEL" });
$("webOCR").onclick = async () => {
  if (agentRunning) {
    status("请先停止 Agent");
    return;
  }
  await run(async () => {
    await scan();
    if (snapshot.frameId)
      throw Error(
        "嵌入表单暂不支持截图 OCR，请将表单单独打开后使用；DOM 扫描与填写可正常使用",
      );
    status("正在本机识别可见页，请勿滚动或切换页面…");
    $("webOCRCancel").disabled = false;
    const result = await chrome.runtime.sendMessage({
      type: "RF_WEB_OCR",
      tabId,
      url: snapshot.url,
    });
    if (result.error) throw Error(result.error);
    const panel = $("webOCRReview");
    panel.replaceChildren();
    const checked = [];
    for (const suggestion of result.proposals) {
      const label = document.createElement("label"),
        check = document.createElement("input");
      check.type = "checkbox";
      label.append(
        check,
        document.createTextNode(
          " " +
            suggestion.label +
            " · " +
            suggestion.confidence +
            "%（第 " +
            (result.context.fields.findIndex((f) => f.id === suggestion.id) +
              1) +
            " 个可见控件）",
        ),
      );
      const locate = document.createElement("button");
      locate.textContent = "定位控件";
      locate.onclick = async () => {
        try {
          await send({
            type: "RF_OCR_HIGHLIGHT",
            id: suggestion.id,
            context: result.context,
          });
        } catch (e) {
          status(e.message);
        }
      };
      panel.append(label, locate, document.createElement("br"));
      checked.push({ suggestion, check });
    }
    if (!checked.length) {
      status("未找到可唯一对应控件的图片标签，保留 DOM 识别结果；请手动匹配。");
      return;
    }
    const apply = document.createElement("button");
    apply.id = "webOCRApply";
    apply.textContent = "确认勾选的 OCR 标签并更新匹配";
    apply.onclick = () =>
      run(async () => {
        const items = checked
          .filter((r) => r.check.checked)
          .map((r) => ({ id: r.suggestion.id, label: r.suggestion.label }));
        if (!items.length) throw Error("请先核对并勾选标签");
        await send({ type: "RF_OCR_APPLY", context: result.context, items });
        await scan();
        panel.replaceChildren();
        status("已更新标签和字段匹配，尚未填写；请核对后点击填写。");
      });
    panel.append(apply);
    status(
      "已生成 " + checked.length + " 项 OCR 标签建议，勾选确认后更新匹配。",
    );
  });
};

$("scopeList").onclick = () =>
  run(async () => {
    if (!snapshot) await scan();
    const result = await send({ type: "RF_SCOPE_LIST" });
    $("scopeRoot").replaceChildren(
      ...result.scopes.map((s) => {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.label + " · " + s.count + " 个控件 · " + s.tag;
        return o;
      }),
    );
    status("选择容器后可先定位，再仅扫描此区块。");
  });
$("scopeHighlight").onclick = () =>
  run(() =>
    send({ type: "RF_SCOPE_SET", id: $("scopeRoot").value, highlight: true }),
  );
$("scopeApply").onclick = () =>
  run(async () => {
    await send({
      type: "RF_SCOPE_SET",
      id: $("scopeRoot").value,
      section: $("scopeSection").value,
      recordIndex: Number($("scopeIndex").value) - 1,
    });
    await scan();
  });
$("scopeClear").onclick = () =>
  run(async () => {
    await send({ type: "RF_SCOPE_SET", clear: true });
    await scan();
  });

addEventListener("resumefill-profile-sync-guard", (event) => {
  if (agentRunning || $("scan").disabled) event.preventDefault();
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.resumeSyncBackup) return;
  await cancelAI();
  clearLearning();
  clearPage();
  status("资料已更新，请重新扫描当前网页以使用新资料。");
});

$("setupProfile").onclick = () => chrome.runtime.openOptionsPage();
function showOnboarding(resume) {
  $("onboarding").hidden = !!resume;
  $("scan").hidden = !resume;
}
void chrome.storage.local
  .get("resume")
  .then((data) => showOnboarding(data.resume));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.resume)
    showOnboarding(changes.resume.newValue);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message.type === "RF_FILL_PROGRESS" &&
    sender.id === chrome.runtime.id &&
    sender.tab?.id === tabId &&
    fillProgressId &&
    message.progressId === fillProgressId &&
    Number.isInteger(message.completed) &&
    Number.isInteger(message.total) &&
    message.completed >= 0 &&
    message.completed <= message.total
  )
    status(
      "正在填写第 " +
        message.completed +
        " / " +
        message.total +
        " 项，完成后独立回读核对；可取消。",
    );
});
