# ResumeFill 填写引擎架构方案

> 蓝图文档（只出方案，未实现功能）。基于 main 分支 v0.27.1 逐项核对：`matcher.js`、`controls.js`、`content.js`、`adapters.js`、`layout.js`、`page-bridge.js`、`agent-bridge.js`、`agent-recovery.js`、`background.js`、`popup.js`、`local-server/server.cjs`、`desktop/controller.cjs`、`desktop/pdf-service.cjs`、`desktop/main.cjs`、`scripts/*` 均已实际读取确认。行号对应当前提交。

## 0. 决策基线

本方案在两处决策变更后重写前一版设计：

1. **放弃自动提交。** 自治阶梯止于「自动填 + 人确认提交」，不再有策略提交与全自动档。填写完成后由软件告知还差什么并定位提交控件，最终点击由人完成。
2. **在 resume-fill 基础上开发。** 不新建仓库、不新建独立应用，复用现有 MV3 扩展 + Electron 桌面端 + loopback 网关三段结构。

由此带来第三项推论，也是本方案与前一版最大的不同：

3. **不重写核心引擎，只补齐缺口。** 核实后确认 resume-fill 现有的字段识别与资料匹配**比目标竞品更严谨**，动态 SPA 适配甚至已有更安全的实现。把竞品方案整体搬进来会造成能力倒退。真正的工作是四件事：附件上传（从零）、原生 setter 补边角、身份重绑下沉到通用填充路径、多版本简历路由。

## 1. 现状核实结论

### 1.1 已具备且优于竞品的部分

| 能力 | resume-fill 现状 | 证据 | 与竞品对比 |
| --- | --- | --- | --- |
| 标签降级链 | 几何距离 + DT/DD + 表格同行 + 单选组 legend + 表单容器标签 + 可见关联标签，多源交叉 | `layout.js:59` `ResumeLayout.infer/associate`、`content.js:754` `descriptor` | 竞品为「7 级标签降级链 + 四套框架根」，按框架类名硬编码；本项目按语义与几何，不绑定框架 |
| 框架覆盖 | Element / Ant / Layui / Moka(semi-design) | `content.js:229` `kind`、`controls.js:1016` `fill` 各分支 | 竞品 Element/Ant/View/semi-design 四根；本项目另有 Layui、Moka 且不依赖根节点探测 |
| 资料匹配 | 语义精确命中优先、别名表、分节与记录隔离、家庭成员隔离、protectedLabel 永不匹配、数值区间带单位与开闭边界 | `matcher.js:108` `match`、`matcher.js:148` `infer`、`matcher.js:167` `numericInterval` | 竞品为加权置信度（label .70 / name .68 / id .68 / placeholder .64，阈值 0.62，冲突 −0.25） |
| 弃权纪律 | 阈值 78 且 top1−top2<10 弃权 | `matcher.js:108` 末尾 | 竞品无 top1/top2 差值纪律，模糊项可能误填 |
| 原生 setter 劫持 | 取 `Object.getOwnPropertyDescriptor(proto,"value").set` 绕过 React/Vue 的 value tracker | `controls.js:225` `setValue` | 与竞品 `setNativeValue` 同手法 |
| 独立回读 | 填后强制回读，回读不一致计 unconfirmed | `controls.js:873` `verify`、`content.js:1324` `fill` 末段 | 竞品部分成功仅表示未抛异常 |
| 动态重定位 | 语义身份 + 签名 + **唯一性要求**重绑，不走 CSS selector | `agent-bridge.js:139`、`agent-bridge.js:164` `identityCounts` | 竞品 `resolveCurrentFillSelector` 重解析 selector，易误命中 |
| 保护字段 | 密码、验证码、安全答案永不匹配永不保存 | `answers.js` `protectedField` | 与 JobHuntBot 的「验证码/2FA 一律阻塞转人工」一致 |

### 1.2 真实缺口

| 编号 | 缺口 | 证据 | 影响 |
| --- | --- | --- | --- |
| G-1 | **附件上传完全不存在** | 全仓库检索 `type="file"` / `fileInput` / `DataTransfer` / `upload` 仅命中 CHANGELOG 一行；`content.js:194` `eligible()` 明确把 `file` 排除在可填字段外 | 简历投递的必需动作缺失 |
| G-2 | 桌面端只读 PDF，不产出可上传的简历文件 | `desktop/pdf-service.cjs` 只有 `extract` / `parse`；`desktop/main.cjs:78` `importPDF` 读取、`main.cjs:158` `showSaveDialog` 仅导出 pairing 与 resume.json | 附件字节无本地来源 |
| G-3 | 身份重绑只在 Agent 路径生效，通用填充路径没有 | `agent-bridge.js:139` 在 `observe(run,recovery)` 内；`content.js:1324` `fill(message)` 走不到 | 普通站点遇到 SPA 重渲染只能失败重来 |
| G-4 | setter 提交序列不完整 | `controls.js:225` 用普通 `Event("input")` 而非 `InputEvent`；无 focus→set→blur；无 `checked` 原生 setter；contenteditable 分支直接写 `textContent` | 受控组件可能不触发 onChange |
| G-5 | 无三态决策输出 | `matcher.js:246` `suggestions` 有候选与理由，但无统一 fill/review/skip 判定 | UI 只能二态呈现，用户难以分辨「该填」与「不敢填」 |
| G-6 | 无多版本简历与岗位路由 | `resume` 结构由 `pdf-service.cjs` `schema` 固定，`matcher.js` 的 `flatten` 无变体概念 | 一份简历打天下，投不同岗位无法换附件 |
| G-7 | 无填充回执台账 | `metrics.js` 只有聚合计数 | 无法回答「这周投了多少、哪些没填上」 |

### 1.3 明确不做

- **不自动点击提交。** 定位提交控件并高亮，点击由人完成。依据 JobHuntBot 安全边界与本项目既有的「不自动提交申请」承诺（`popup.html` 结尾文案）。
- **不代填密码、验证码、短信码、2FA。** 沿用 `answers.js` `protectedField`，此类字段在前置自检中列为「需人工处理」。
- **不移植竞品的放宽型加权匹配。** 竞品 0.62 阈值与置信度加权只用于**候选队列内部排序与 UI 呈现**，绝不用于放宽 `matcher.js:108` 的 78 阈值与弃权纪律。
- **不引入 `chrome.debugger`。** CDP 方案在扩展侧会显示调试横幅并要求高危权限；扩展场景用 DataTransfer 注入等价实现。
- **不虚构附件内容。** 附件字节来自用户亲自选择的本地文件，不生成、不补造。
- **不把个人资料、凭据或真实网页个人信息写入源码、测试样本、截图或发布包。**（AGENTS.md）

## 2. 总体架构

三段结构沿用现状，不新增进程：

```text
桌面端 (Electron)
  资料编辑器 · PDF 解析/OCR · 附件库(新增)
        |
        | 本机 loopback 127.0.0.1:17322
        | Bearer 64hex + Origin 白名单（既有）
        v
扩展后台 (MV3 service worker)
  background.js  资料路由 · AI 路由 · 桌面桥接
  附件字节中转（内存态，不落 storage）
        |
        | chrome.tabs.sendMessage
        v
内容脚本 (页面注入)
  content.js  scan / fill / prepare / learn
    |- matcher.js   匹配与弃权（既有，阈值不动）
    |- controls.js  控件操作（setter 增强在此）
    |- layout.js    标签与结构识别（既有）
    |- adapters.js  站点声明式适配（新增 file 类型）
    +- 本轮新增：重绑下沉 · 附件注入 · 提交前自检
```

### 2.1 模块依赖方向

单向向下：`popup.js` → `content.js` → `controls.js` → 浏览器 API。

- `matcher.js` 保持零 DOM 依赖（可被 Node 测试与本地网关直接 require），三态决策作为新导出加入。
- `controls.js` 承载 setter 与控件操作，不感知模块编排。
- `content.js` 作为编排层持有 registry、调用 `controls`、执行重绑与自检。
- `upload.js` 为内容脚本专用，仅依赖 `controls` 的回读约定。
- 桌面端附件库 → loopback 网关 → background → content → `upload.js`，构成附件字节的唯一通路。

### 2.2 与前一版方案的差异

| 项 | 前一版 | 本版 | 原因 |
| --- | --- | --- | --- |
| 仓库 | 新建独立应用 | resume-fill 内新增模块 | 决策变更 2 |
| 字段识别 | 新建 detect 模块 | **不新建**，复用 `layout.js` + `content.js` | 核实后确认现有实现更严谨 |
| 资料匹配 | 三方融合重写 | **不重写**，加 `decide()` 三态包装 | 放宽型加权匹配会造成倒退 |
| SPA 适配 | 新建 adapt 模块 | **下沉** agent-bridge 的身份重绑 | 已有更安全实现，只缺复用路径 |
| 附件 | 新建 upload 模块 | 保留，但完整链路从零实现 | 确认为最大缺口 |
| 提交 | 提交闸门（策略提交） | 改为**提交前自检 + 定位** | 决策变更 1 |
| 编排 | courier 编排层 | 降级为填充回执（不引入独立编排进程） | 无自动提交后编排层失去存在理由 |
| 多版本简历 | 资料模型内建 | 独立存储，不侵入 `flatten` | 侵入 `matcher.js` 会牵连 26 个既有测试 |

## 3. 模块技术方案

### M-A 三态决策层

**职责**：把 `matcher.js` 现有的二态判定（命中 / 未命中）编排成 UI 可直接消费的 fill / review / skip 三态，**不改变任何匹配阈值**。

**位置**：`matcher.js` 内新增导出，不新增文件（避免新增运行时白名单条目与打包改动）。

**接口**：

```js
function decide(field, values, options = {}) {
  // 返回 { action, path, confidence, reason, candidates }
  //   action: "fill" | "review" | "skip"
}
```

**判定顺序**（先短路，后打分）：

1. `protectedLabel(field)` 或 `answers.protectedField(field)` 命中 → `skip`，reason `受保护字段`。
2. `field.ambiguousLabel` / `field.contextBlocked` / `field.workBindingRequired` / `field.familyAmbiguous` → `review`，reason 沿用既有语义。
3. `match(field, values)` 命中且未触发弃权 → `fill`，`path` 为命中路径。
4. 未命中但 `candidatePaths(field, values)` 非空 → `review`，候选带 `suggestions()` 的既有 reason 文案。
5. 无候选 → `skip`。

**confidence 取值**：仅用于候选队列内排序与 UI 呈现，**不参与任何阈值判定**。

- `fill`：`min(0.98, 0.9 + 0.02 * (top1 - 78) / 22)`，即命中态区间 [0.90, 0.98]。
- `review`：候选按 `matcher.js:246` `suggestions` 的顺序取位次分 `0.88 - 0.08 * index`。
- `skip`：无 confidence。

这套取值刻意不引入竞品式的 label/name/id/placeholder 权重：那些权重会让「技术名恰好等于标签子串」的弱信号获得高分，与 `matcher.js` 的弃权纪律冲突。

**`options` 参数**：`{ allowReview: false }`，默认 review 不参与自动填充，仅进 UI 队列。

**失败模式**：`decide` 不抛异常。`values` 非对象时按空对象处理并返回 `skip`；`field` 缺 label 时返回 `skip` + reason `字段信息不足`。

**测试**：`semantic-test.cjs` 扩一组三态断言；覆盖「命中 / top1−top2<10 弃权 / ambiguousLabel / protectedLabel / 无候选」五条路径。

### M-B 原生 setter 补边角

**职责**：在 `controls.js:225` 现有 `setValue` 基础上补齐受控组件需要的事件与提交序列。**核心手法不变**（仍取原型 `value` 的 setter 绕过 value tracker）。

**位置**：`controls.js` 内新增私有函数，`setValue` 调用之。

**接口**：

```js
function setNativeValue(el, value);      // 原型 setter 优先，缺失时退回 el.value
function dispatchInputEvents(el, opts);  // InputEvent("input") + Event("change")
function commitValue(el, value, opts);   // focus -> setNativeValue -> dispatch -> blur
function setNativeChecked(el, checked);  // 原型 checked setter
```

**关键实现点**：

- `dispatchInputEvents` 用 `ownerDocument.defaultView.InputEvent` 构造，`inputType` 默认 `"insertText"`，`data` 传字符串值；构造失败时退回 `Event`。
- `commitValue` 的 focus/blur 只在元素当前**未聚焦**时补做，且 blur 放在 dispatch 之后——顺序错了会导致受控组件先收到 change 再收到失焦校验。
- `contenteditable` 分支（`controls.js:1258` 附近）当前直接写 `textContent`，改为写入后派发 `InputEvent`（`inputType: "insertText"`），使富文本框架的 `onInput` 能收到。
- `radio` 分支继续走点击真实选项（`controls.js:1120` 附近），**不改**：点击能触发框架的选中态，setter 不能。
- `setNativeChecked` 仅作预留；本轮无 checkbox 填充路径，不在 UI 暴露。

**失败模式**：事件派发包在 try/catch 内，派发失败不抛错但计入 `diagnostic.dispatchFailed`，由 `verify` 决定是否算通过。**回读仍是唯一成功判据**。

**测试**：`controls-v06-test.cjs` 增加 React 受控 input 合成页（模拟 value tracker 与 onChange），断言 setter 劫持后 onChange 被调用且回读一致。

### M-C 身份重绑下沉（动态 SPA 适配）

**职责**：把 `agent-bridge.js:139` 的语义身份重绑能力，从 Agent 恢复路径下沉到 `content.js:1324` 的**通用填充路径**。站点在填充过程中重渲染 DOM 时，不必整轮重来。

**为什么不自己写 selector 重定位**：竞品用 `resolveCurrentFillSelector` 重解析 CSS selector（id→name→nth-of-type），selector 在 SPA 重渲染后极易失效或误命中他人控件。本项目已有更安全的材料：

- `content.js:899` `stableIds` WeakMap 为每个 DOM 元素分配 `node-N` 身份；
- `content.js:1077` 写入 `field.stableId`；
- `agent-recovery.js` `identity(field)` 提供语义身份键（label + section + recordIndex + type + context + rootId + workModuleId + familyRole + datePart + datePath + shadowScope + regionRole + regionLevel + scopeId）；
- `agent-bridge.js:4` `signature(field)` 提供签名（label + section + recordIndex + type）。

**位置**：`content.js` 内新增私有函数（内容脚本需要访问 DOM 与 registry）。

**接口**：

```js
function rebindField(d, field);   // 成功后改写 d.el / d.field，返回 true；失败返回 false
```

**重绑算法**：

1. 触发条件：`controls.js:60` `guard(d)` 检测到 `d.el` 已脱离文档或根已变化，且本次填充尚未对该字段重绑过。
2. 候选集：在同一 `d.scope` 内按 `field.type` 与标签语义重新收集候选控件。
3. 身份筛选：候选的 `ResumeRecovery.identity(field)` 与原字段完全相同。
4. **唯一性要求**：候选数必须恰好为 1。0 个或 ≥2 个一律拒绝重绑（沿用 `agent-bridge.js:164` `identityCounts` 纪律）。
5. 签名复核：重绑后 `signature(field)` 必须与原签名一致，label / section / recordIndex / type 任一变化即拒绝。
6. 二次校验：`guard(d)` 重新执行，确认可见、可用、根未变、scope 未变。
7. 成功后同步 `d.el`、`d.field.stableId`，以及 `d.field` 上已有的 `referenceData` 与 `sourcePath` 引用。

**预算**（与 `agent-recovery.js` `limits` 对齐，不新造更宽的额度）：

| 项 | 上限 | 依据 |
| --- | --- | --- |
| 单字段重绑次数 | 1 | `limits.perField: 2` 的一半，留余量 |
| 单次重绑超时 | 1200 ms | 与 `limits.delayMs: 600` / `maxDelayMs: 1500` 区间一致 |
| 单轮填充总重绑数 | 3 | `limits.total: 3` |
| 扫描重取 | 复用既有 `scan()`，`revision` 递增使旧 registry 失效 | `content.js:801` |

**失败模式**：任一步不满足即放弃该字段，计 `status: "stale"`、reason `控件已变化，未找到唯一替代`。**不猜、不填邻近控件**。

**测试**：新增 `spa-rebind-browser-test.cjs`，合成页在填充第一个字段后替换整个表单容器（含唯一同身份字段），断言第二个字段经重绑后填入并回读一致；再合成「同身份出现两次」场景，断言拒绝并计 stale。

### M-D 附件上传

**职责**：从零建立附件链路——本机文件字节 → 页面 `input[type=file]`。

**为什么不用 CDP**：竞品是 Electron 主进程，用 `DOM.setFileInputFiles`；扩展侧要用 `chrome.debugger`，会产生调试横幅并要求高危权限。浏览器扩展的等价正解是 **DataTransfer 注入 File 对象**，`FileList` 由构造器生成，浏览器接受。

**链路四段**：

```text
1 桌面端附件库       2 loopback 网关         3 扩展后台              4 内容脚本
用户选本地简历 PDF -> /v1/desktop/attachment -> 内存中转（不落 storage） -> DataTransfer 注入
```

**① 桌面端附件库**

- 位置：`desktop/main.cjs` 新增 IPC `rf:chooseAttachment`，复用 `main.cjs:78` `importPDF` 的 `showOpenDialog` 模式，滤镜限 `pdf`。
- 存储：文件**复制**进桌面端数据目录（与 `resume.json` 同级），不保留外部路径引用。记录 `{ id, fileName, size, sha256, mime, createdAt }` 到桌面端 config。
- 校验：大小上限 15 MB（与 `pdf-service.cjs` `extract` 的 15 MB 一致）；`sha256` 用 `node:crypto` 计算，作为版本与去重标识。
- 提供 `rf:listAttachments` / `rf:removeAttachment`。

**② loopback 网关**

- `local-server/server.cjs`：`desktopAction` 正则扩一个分支 `attachment`，与既有 `heartbeat|pull|push` 同级。
- 权限：`sensitive` 正则已覆盖 `/^\/v1\/desktop\//`，自动继承「必须有扩展 Origin」；`auth(req)` 校验 Bearer token，沿用既有鉴权。
- 返回：`{ id, fileName, mime, size, sha256, dataBase64 }`。**bytes 只在本机回环传输**。
- 体量：单次响应上限 15 MB；超过直接拒绝，不分块（附件一次性使用，无需分块）。

**③ 扩展后台**

- `desktop-bridge.js` 新增 `RF_DESKTOP_ATTACHMENT` 消息处理，调用 `call('attachment', {id})` 拉取。
- 字节**只存在于内存**，不写入 `chrome.storage`，不进入 checkpoint，不进 metrics。任务结束即释放。
- popup 侧提供「附件」选择与「上传到当前表单」的显式操作。

**④ 内容脚本注入**

```js
// 新增 upload.js（内容脚本专用，挂 root.ResumeUpload）
async function attach(d, payload);   // payload: { fileName, mime, dataBase64 }
```

- 目标识别：`input[type=file]`。**注意 `content.js:194` `eligible()` 当前排除 `file` 类型**——附件控件不进入常规字段 registry，改由 `upload.js` 独立扫描，不改动 `eligible()` 的既有语义（否则密码、验证码等保护逻辑会受影响）。
- 注入：

  ```js
  const bytes = base64ToBytes(dataBase64);
  const file = new File([bytes], fileName, { type: mime || "application/pdf" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  ```

- 目标唯一性：`scope` 内 `input[type=file]` 必须恰好 1 个；多个时按 `adapters.js` 的 `file` 配置消解，仍不唯一则拒绝。
- **独立回读**：读 `input.files[0].name` 与期望 `fileName` 一致才计 `verified`；不一致计 `unconfirmed`。
- 站点若在 change 后异步上传，回读只能确认「已选中」，**不能确认「已上传到服务器」**。UI 文案据此区分。

**站点适配**：`adapters.js` 的 `types` 集合新增 `"file"`，字段配置新增 `file: { attachmentId, accept }`，`accept` 校验文件 MIME 是否被页面接受，不接受则拒绝注入。

**失败模式**：文件过大、类型不被接受、目标不唯一、字节解码失败、回读不一致——各自独立 reason，**不回退到猜测文件名**。

**测试**：

- `desktop/attachment-test.cjs`：合成 PDF 落盘 → 网关返回 base64 → 断言 sha256 与体积一致；断言无 Origin 或 token 错误时 401/403。
- `upload-browser-test.cjs`：合成页含 `input[type=file]`，断言注入后 `input.files[0].name` 与内容一致、`change` 事件被收到；合成两个 file input 断言拒绝。
- **所有测试使用合成 PDF**，不引入真实简历文件。

### M-E 提交前自检与定位

**职责**：填完后告诉用户「还差什么」，并把提交控件指出来，**但不点击**。

**位置**：`content.js` 新增 `preflight(scope)`，走既有 `RF_*` 通道新增消息码 `RF_PREFLIGHT`。

**检查项**：

| 项 | 判定 | 提示 |
| --- | --- | --- |
| 必填未填 | 字段 `required` 且当前值为空 | 「必填项未填：<label>」 |
| 回读未通过 | 存在 `status` 非 `verified` 的已填字段 | 「有 N 项未通过回读」 |
| 附件未附 | 页面存在 `input[type=file]` 且未注入 | 「附件未上传」 |
| 需人工处理 | 标签命中 `protectedField`（密码、验证码、短信码） | 「需你手动填写：<label>」 |
| 歧义待核对 | `decide` 结果为 `review` 的字段 | 「有 N 项等你核对」 |

**提交控件定位**：

- 在同一 `scope` 内查找 `button[type=submit]`、`input[type=submit]`、`role=button`、文本含「提交 / 投递 / 递交 / 确认投递 / 下一步」的控件。
- 命中多个时不做猜测，按视觉顺序列出候选由人选择。
- 命中后**滚动到可见位置并高亮**，使用既有 `visual.js` 的高亮能力，不新增样式体系。
- **不调用 `click()`**。代码层不留任何自动提交路径，避免被误用。

**输出**：`{ ready: boolean, blockers: [...], submitCandidates: [...] }`。`ready` 为真也只意味着「软件侧该做的都做完了」，UI 文案明确写「请自行确认后点击提交」。

**测试**：`preflight-browser-test.cjs` 合成页：全部必填已填 → ready 真且定位到唯一提交按钮；存在空必填 → ready 假且 blockers 列出 label；断言点击次数为 0。

### M-F 多版本简历与岗位路由

**职责**：支持按岗位类型切换简历附件与补充答案，回答「投不同岗位要不要换一份简历」。

**为什么不进 `resume` 主结构**：`resume` 的结构由 `desktop/pdf-service.cjs` `schema` 与 `matcher.js` `flatten` 共同定义，任何字段扩展都会波及 26 个既有测试与 `learning.js` 的路径校验。**隔离到独立存储是更小的风险面。**

**存储**：`chrome.storage.local` 新键 `resumeVariants`，不进桌面端同步，不进任何网络请求。

```js
{
  version: 1,
  variants: [
    {
      id: "v-backend",
      label: "后端开发",
      attachmentIds: ["att_1"],       // 指向桌面端附件库
      answerOverrides: { "basics.summary": "…" },
      rules: {                         // 命中任一即选用
        hostnames: ["zhipin.com"],
        keywords: ["后端", "Java", "Go"]
      }
    }
  ]
}
```

**路由规则**：

- `hostnames` 精确域名优先于关键词匹配（与 `adapters.js` `choose` 的最长前缀优先一致）。
- 命中 0 个或 ≥2 个变体时不自动选择，列出候选让用户选。
- 变体只影响**附件选择**与**补充答案**（`fieldAnswers` 层面的覆盖），**不影响** `matcher.js` 的核心匹配。
- `answerOverrides` 写入时仍走 `answers.js` `save` 的既有路径与保护字段校验，不新开写入通道。

**测试**：`variant-test.cjs` 覆盖域名优先、关键词命中、多义弃权、变体不改变核心匹配四条断言。

### M-G 填充回执

**职责**：让用户回看「最近投了哪些、哪些没填上」，对应 JobHuntBot 的 dashboard 意图，但形态是本机回执而非独立看板应用。

**数据**：扩展 `chrome.storage.local` 新键 `fillReceipts`，环形保留最近 100 条。

```js
{
  id, at, siteLabel,        // 仅域名，不含完整 URL 与查询串
  variantId, attachmentName,// 附件文件名，不含路径
  attempted, verified, failed, review, blocked,
  blockerKinds: []          // 枚举：required-empty / unverified / attachment-missing / protected / ambiguous
}
```

**隐私边界**（关键）：

- **不记录字段标签、字段值、简历内容、完整 URL、页面标题。**
- `siteLabel` 只存域名主体，不含路径与查询串（与 `page-bridge.js` `safeURL` 的既有口径一致）。
- `blockerKinds` 只存枚举，不存 label 文本（label 属于网页个人信息）。
- 导出为 CSV 时同样只含上述字段。

**与 `metrics.js` 的关系**：`metrics.js` 继续只做聚合计数（无维度、无标签）；回执是逐次记录，两者不混。回执可由用户随时一键清空。

**测试**：`receipt-test.cjs` 断言不含 label/value/url 子串，断言环形上限 100，断言清空后为空。

## 4. 消息码与协议变更

沿用既有 `RF_*` 前缀与向后兼容原则，现有码语义不变。

| 消息码 | 方向 | 新增/变更 | 载荷 |
| --- | --- | --- | --- |
| `RF_DECIDE` | popup → background | 新增 | `{ fields, values }` → 三态决策数组 |
| `RF_ATTACHMENT_LIST` | popup → background | 新增 | 无 → 附件元数据列表（不含字节） |
| `RF_ATTACHMENT_PULL` | popup → background | 新增 | `{ id }` → `{ fileName, mime, size, sha256, dataBase64 }` |
| `RF_DESKTOP_ATTACHMENT` | background → 桌面端 | 新增 | 转发 `call('attachment', {id})` |
| `RF_UPLOAD` | popup → content | 新增 | `{ id, fileName, mime, dataBase64 }` → 注入结果 |
| `RF_PREFLIGHT` | popup → content | 新增 | 无 → `{ ready, blockers, submitCandidates }` |
| `RF_SCAN` | popup → content | 不变 | 字段结构保持，附件控件仍不入 registry |
| `RF_FILL` | popup → content | 不变 | `items` 结构保持，仅内部 `controls.setValue` 行为增强 |
| `RF_VERIFY` | popup → content | 不变 | — |

**协议版本**：`page-bridge.js` 的 `runtimeProtocol` 保持 1；`requireRuntime` 已按 manifest 版本比对 `runtimeVersion`，新增模块随 manifest 版本自然同步，无需新协议号。

## 5. 运行时与打包接入

本项目**没有 `content_scripts` 声明**（`manifest.json` 只有 `background` + `action` + `options_page`），页面脚本由 `popup.js:278` 用 `chrome.scripting.executeScript` 注入：

```js
files: ["profile.js","matcher.js","layout.js","adapters.js","controls.js","answers.js","content.js","inline.js"]
```

**新增 `upload.js` 需三处登记**：

1. `popup.js:278` 的 `files` 数组——加入 `"upload.js"`，且必须在 `content.js` **之前**（`content.js` 在加载期就要引用 `ResumeUpload`）。
2. `scripts/runtime-files.cjs` 允许清单——加入 `"upload.js"`。该清单同时是 `desktop/prepare.cjs` 的打包源，漏登记会导致安装包内文件缺失。
3. `scripts/check-runtime.cjs` 会遍历注入数组校验文件存在，**漏登记会直接报错**——这正是我们要的护栏。

**测试接入**：`scripts/test.cjs` 是显式测试清单。新增测试文件必须登记，否则 `npm test` 不会跑：

- Node 组：`variant-test.cjs`、`receipt-test.cjs`
- 浏览器组：`spa-rebind-browser-test.cjs`、`upload-browser-test.cjs`、`preflight-browser-test.cjs`

**后台接入**：新增消息处理若需 `matcher.js` / `ai.js` 等纯逻辑，`background.js` 顶部 `importScripts` 链已含 `matcher.js`；`upload.js` 仅在内容脚本侧使用，不进 background。

## 6. UI 落点

遵守 AGENTS.md 的插画风格约定：趣味、简洁、圆润按钮、清爽排版，插画与图标同一造型与配色体系。桌面端、扩展弹窗与设置页共享既有 `theme.css` / `style.css` 变量，不新造设计系统。

| 位置 | 新增 | 说明 |
| --- | --- | --- |
| 弹窗「核对」区 | 三态列 | 每行左侧状态点：填=实心、核对=半实、跳过=空心；沿用既有 `labels` 映射风格（`popup.js:45`） |
| 弹窗 | 附件卡片 | 复用 `buddy.svg` 角色体系，配一枚「递交简历」小插画；提供附件选择与「上传到当前表单」 |
| 弹窗结果卡 | 自检清单 | 复用既有 `resultCard` 的行式布局，列出 blockers 与「定位提交按钮」按钮 |
| 设置页 | 附件库管理 | 列表、添加、删除；显示文件名/大小/时间，不显示路径 |
| 桌面端 | 附件库区 | 与资料编辑器同区域的视觉语言；复用 `desktop/ui/app.js` 的 `el()` 构造模式 |

**不改**：既有配色变量、`buddy.svg` 主体造型、`style.css` 与 `theme.css` 的排版尺度。

## 7. 落地顺序

按「风险从低到高、先建立护栏再上能力」排列。每个阶段独立可发布、独立可回滚。

| 阶段 | 内容 | 版本 | 主要验证 |
| --- | --- | --- | --- |
| P0 | 本文档 + 架构评审 | 不升版本 | 文档评审 |
| P1 | M-A 三态决策 | 0.28.0 | `semantic-test.cjs` 扩展；既有 26 个测试全绿 |
| P2 | M-B setter 补边角 | 0.28.0 | `controls-v06-test.cjs` 扩展；React 受控合成页 |
| P3 | M-C 身份重绑下沉 | 0.28.0 | 新增 `spa-rebind-browser-test.cjs` |
| P4 | M-D 附件链路 | 0.29.0 | 新增 `upload-browser-test.cjs` + `desktop/attachment-test.cjs` |
| P5 | M-E 提交前自检 | 0.29.0 | 新增 `preflight-browser-test.cjs` |
| P6 | M-F 多版本简历 | 0.30.0 | 新增 `variant-test.cjs` |
| P7 | M-G 填充回执 | 0.30.0 | 新增 `receipt-test.cjs`；`npm run privacy` 零发现 |

**版本策略**：

- 新增能力且向后兼容 → 次版本号递增（P1–P3 合并为 0.28.0，P4–P5 为 0.29.0，P6–P7 为 0.30.0）。
- **不动 1.0.0**，按 AGENTS.md「产品成熟或发生重大兼容性变化时规划主版本」，1.0 留给 Release Gate 四条判据全部满足之时。
- 每个版本号在**五处**保持一致：`package.json`、`desktop/package.json`、`manifest.json`、`package-lock.json`、`desktop/package-lock.json`（`scripts/check-version.cjs` 校验）。
- 每个可用版本提交前跑：`npm test`、`npm run test:browser`、`npm run test:desktop`、`npm run test:electron`、`npm run release:check`、`npm run privacy`、`npm run privacy:artifacts`。
- 发布说明写入 `docs/releases/<version>.md`，CHANGELOG 补条目，`PRIVACY-REVIEW.md` 的 `Reviewed for v<version> on <date>` 同步更新（`scripts/check-release.cjs` 强制）。

## 8. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 站点用框架自研上传控件（不走原生 change） | 附件选中但不生效 | 回读只承诺「已选中」；文案如实说明；不重试猜测 |
| 附件控件与普通字段混淆导致误填 | 覆盖文件 | `eligible()` 不改；附件走独立扫描路径与独立消息码 |
| 重绑误命中同名控件 | 填错位置 | 唯一性硬要求 + 签名复核；不唯一即拒绝 |
| 三态置信度被误当作阈值 | 放宽弃权纪律 | 置信度不参与任何阈值判定，代码层分离 |
| 附件字节外泄 | 个人资料泄露 | 仅本机回环 + Bearer + Origin；不落 storage、不进日志与导出 |
| 回执含网页个人信息 | 隐私违规 | 只存域名主体与枚举 kind，禁存 label/value/完整 URL |
| 引入 CDP 权限 | 权限与体验退化 | 本方案明确不用 CDP；DataTransfer 等价实现 |
| 打包漏登记新文件 | 安装包运行时报错 | `scripts/check-runtime.cjs` 在打包期强制校验 |

## 9. 与 JobHuntBot 的关系

JobHuntBot 是流程与资料组织层，不是可移植的代码库。本方案吸收它的**方法与纪律**，不复制其实现：

| JobHuntBot 资产 | 在本项目中的对应 |
| --- | --- |
| `candidate_profile.json` | `resume`（`chrome.storage.local` / 桌面端 `resume.json`），已存在 |
| `answer_bank.md` | `resume.fieldAnswers` + `answers.js`，已存在 |
| `experience_bank.md` | `resume.education/work/projects`，已存在 |
| `application_rules.md` | `adapters.js` 站点适配 + `learning.js` 学习闭环，已存在 |
| `safety-and-boundaries.md` | `answers.js` `protectedField` + M-E 提交前自检的「需人工处理」类 |
| 「点了提交但没看到确认记 Blocked 不记 Submitted」 | M-G `blockerKinds` 中 `unverified` 与 `attachment-missing` 只记阻塞，不记成功 |
| `resume_routing.md` | M-F 多版本简历与岗位路由（**本次新增**） |
| `dashboard-template/*.csv` + `csv-store.js` | M-G 填充回执（本机环形存储 + CSV 导出，**本次新增**） |
| `lead-discovery.md` | 不在本轮范围：自动找岗位与投递编排依赖自动提交前提，与决策变更 1 冲突 |

## 10. 文档与研究纪律

- 竞品观察结论按既有体例记入 `COMPETITOR-RESEARCH.md`：写清观察对象、证据边界、**明确拒绝移植的项与理由**、独立实现的部分。原始包与完整导出留在私人研究目录，不随项目发布。
- 不复制竞品专有规则库、代码与资源；仅借鉴通用手法（原生 setter、DataTransfer、语义身份重绑），并在本文档记录独立实现方式。
- 本文档所述能力均为**未实现**；发布前不得在版本说明或用户界面中宣称已具备。

## 变更记录

- 2026-11-10：初版。依据 REA 对 Electron 网申桌面端的静态分析结论，以及对 main 分支 v0.27.1 的逐文件核实，改写前一版「新建独立应用」方案为「resume-fill 内新增模块」方案；放弃自动提交，自治阶梯止于人工确认提交。
