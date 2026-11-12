# 网申插件静态 REA 与独立实现记录

2026-11-12 补充：职悟空 Moka 0.0.23、北森 0.0.20 与智联校招 0.0.11 工作流的来源、散列、静态证据、选择器事实和独立实现边界见 [三平台工作流研究](docs/PLATFORM-WORKFLOW-RESEARCH.md)。三份专有模块只留在忽略的研究目录，不执行、不打包，不复用私有资料映射或业务接口。

调查日期：2026-10-16。目标为官方公开发布包；未运行这些插件、未登录其账号、未调用业务后端、未发送个人简历。下列结果是静态观察，不是对方填写成功率或服务端模型能力的实测。原始包和完整 REA 导出保留在私人研究目录，不随本项目发布；本项目未复制专有代码、规则库或资源。

## 样本身份与证据

| 软件 | 官方获取入口 / 样本 | SHA256 | REA Evidence |
| --- | --- | --- | --- |
| 牛客网申助手 1.1.0 | [官方介绍页](https://www.nowcoder.com/my/resume-plugin-intro) 明示的公开 ZIP，内含 CRX | ZIP `f5554cf3c029c1653dbdec0bdfd00f9767be06cf4488ffe4fd2aa52670ab9871`；CRX `284927820feee227da318763073dd36a2d6e7e9d7756bbcff887eef33d1432a2` | `ev_11f724b4d3f98bfcc197b5d54f1f635b3c1f7308d6e16bce908b902afee0f5bc` |
| 塔塔网申神器 0.8.4 | [官网](https://www.tatawangshen.com/) 对应商店 ID `ldohbgcnonoffldimgdngkojkejibina`，Google 官方扩展更新服务的 CRX | `af018f9c9f3c261730e4a40e7eb1c13456408c02469c5325ed388f4b46ee0f65` | content/background：`ev_d2a6e1a7a559739ddf34e73cf16382afcae0ed1629aef684e5aff85ccd76e9b1`；entry/config：`ev_69c96846b544e89bd5836ca7605108bd5efe53dce93af2a747f0ea6f86cc4d92` |
| 招聘盯智能简历助手 2.0 | [官网](https://deepipe.com.cn/) 链接的 `/crx/Dzhpin_2.0.0_autofill.zip`；manifest 为 2.0 | ZIP `2aebff41cdc8271ed5c1879ce1bf5e077e02fa742accc6a6e3e9781b1fbb199f` | `ev_41060fe6fb44dcd0a4a4dfa0d619dba6565712586293f68a9789f96d52f987ab` |

版本号取实际 manifest，不能以商店搜索缓存或外层文件名替代。牛客和招聘盯的分析包含选定源文件和节点数量限制，图覆盖部分；相关结论另以精确文件范围静态核对。服务器实现、登录后行为和未选模块仍未知。

## 观察及边界

**牛客**：`page/background/main.entry.js`（SHA256 `e9d76329902c3437b3a7dff481bd749c3085ba2611a377339c773e0a795e5262`）UTF-8 byte 220500–228700、236200–237600 包含点击前后节点/属性/可见性变化、ARIA 引用和可选项结构的弹层归因；105500–106600 在模块、标签或重复组发生变化时取消已填写状态；218849–219550 的选项请求和缓存考虑模块、字段、简历值及候选集合。`fill-form`、`fill-selector` 契约可见，但服务端算法、模型和新项学习机制无法由客户端确定。

**塔塔**：`js/content.js` UTF-16 offset 74728 附近通过 `aria-owns` 关联 Ant 列表；123117–123461 先输入搜索词再等待候选；126459–126678 有带滚动步长和停止条件的 `scrollTreePages` 定义，但只见一次定义，未找到调用证据，不能声称通用虚拟滚动实际启用。126678–128998 有日期组件适配和有界年月翻页。部分成功标记仅表示未抛异常，不能视作独立回读。原生 radio 被普通输入收集排除，不能作为通用单选能力证据。

**招聘盯**：选定模块包括表格及 DT/DD 标签关联、可见浮层定位、本地同义词及服务端 `/analyze_fields`、`/selection_fill` 兜底。去除全部省市区县字符、缺月日补 1、非法日期截到月末、首个包含匹配等策略可能破坏唯一性或虚构精度，本项目不采用。顶层已有字符串键的匹配兜底不能证明支持动态新增 JSON 项。

## ResumeFill 的实现取舍

已有能力继续保留：ARIA 优先、明确域名适配、真实选项确认、异步稳定候选等待、经历记录隔离、固定信息域内同义词、未知项人工补充及 JSON 保存、日期精度保留、填后独立回读。未移植远端私有服务或规则。

本次独立实现：

1. 对复用的可见下拉弹层记录短期 DOM 变化，结合候选结构和位置约束定位；多个弹层变化、表单/日历/导航混入时不猜测。观察器在操作完成或失败后断开。
2. 对提供 `aria-posinset` / `aria-setsize` 的可滚动虚拟下拉先完整枚举再选择。最多 500 项、40 次滚动；重复项可能在屏幕外，仍会拒绝。索引缺失、枚举不完整、内容变化或取消时不点击。
3. 同一 DOM 节点的标签、模块、记录、路径或地区/日期语义变化后，不沿用旧下拉确认状态。
4. 识别单选组 legend / ARIA 组标签，避免把“男 / 女”等选项文字当成字段名；增加 DT/DD 标签归属和无语义 ID 的地区层级提示。

虚拟下拉能力是我们的独立设计与实际浏览器测试结果，不是对塔塔运行行为的推断。未实现没有索引的任意虚拟列表、第三方完整运行时验证或对方服务端算法复现。

## 验证

`competitor-regression-test.cjs` 使用合成页面验证单选组、DT/DD、无语义地区 ID、复用 portal、DOM 复用确认失效、跨屏唯一选项、屏幕外重复项、索引缺口和取消后不点击。已加入标准浏览器测试组，与既有填写、项目经历、日期、固定枚举、安装扩展和 Agent 回读测试一同运行。

## 0.15.0 后续实现

A–E 改进已独立实现：邻接标签与嵌套说明回归、单位与开闭区间（重叠转人工）、ARIA 优先及异步候选过滤、用户选容器和经历序号的局部预览/填写、按字段收敛模型候选并校验返回。相关测试见 semantic-test.cjs、scoped-browser-test.cjs 和 extension-test.cjs。仍不声称支持任意无索引虚拟列表，也未复现竞品服务端算法。

## 职悟空网申 0.1.32（Electron 桌面端）

调查日期：2026-11-10。目标为用户本机已安装的官方程序 `C:\Program Files\electron-autofill-desktop`。仅做**静态**分析：解包 ASAR 并阅读其一方源码，未运行该程序、未登录其账号、未调用其业务后端、未向任何招聘站点发送个人简历。原始包和完整 REA 导出保留在私人研究目录，不随本项目发布；本项目未复制其专有代码、规则库或资源。

### 样本身份与证据

| 项 | 值 |
| --- | --- |
| 程序版本 | 0.1.32 |
| 运行时 | Electron 35.7.5 / Chromium 134 |
| ASAR SHA256 | `6f810d13…` |
| ASAR 文件数 | 1595（其中一方代码仅 37 个） |
| fuses 证据 | `ev_ecdcda145cedc8ce9e28ef7de5ab1cd4405aebdcfb9331857f5fe0a9c59f648a` |
| 全量 ASAR 证据 | `ev_0b55ff698479cc71dd35f441d10649ad94c90eb483463fc3a69fde14b059fbc7` |
| main + preload 聚焦 | `ev_1165597e2a51a65c6389dc514a9e54c931d048babb7d2a70999b1564907cfe50` |
| renderer 聚焦 | `ev_16eb71313f94465bcf601b90fc0133071116c62dbf06196ce1d63cf41c227fd0` |

版本号取实际安装包内 manifest，不以安装目录名或外层文件名替代。

### 观察到的四项技术手法

1. **字段识别**：主进程 `browserCollectFields`（`main/index.js:2646`）收集四套框架组件根，按 id → name → nth-of-type 生成 selector。

   **复核修正**：此前记为「Element / Ant / View / semi-design」，实为 **Element / Ant / iView / semi-design**——iView 的根为 `.ivu-input-wrapper`、`.ivu-select`、`.ivu-checkbox-wrapper`、`.ivu-radio-wrapper`、`.ivu-radio-group`、`.ivu-switch`、`.ivu-input-number`、`.ivu-date-picker`；semi-design 为 `[class*="sd-Dropdown-container"]` 与 `[class*="sd-Input-container"]`。不存在名为 "View" 的框架。

   **复核修正**：其 7 级标签降级链（`labelFor`，`:2841`）实为 `aria-label` → `aria-labelledby` → `label[for]` → 祖先 label → placeholder → 相邻兄弟文本（`nearbyTextLabel`） → 组件内占位符（`placeholderFor`）。**不含单选组 legend，也不含 DT/DD**——这两级是本项目独有的更强判据。其 `nearbyTextLabel` 无界向上遍历父级且无歧义守卫；其 `aria-labelledby` 用全局 `document.getElementById` 解析，跨 Shadow Root 不安全。
2. **资料匹配**：`matchProfileField`（`:4853`）用加权置信度——label 0.70、name 0.68、id 0.68、placeholder 0.64；label 已命中则 name/id 各 +0.04、placeholder +0.08；valueType 一致 +0.12、明确冲突 −0.25；html type 一致 +0.08；封顶 0.98；阈值 0.62；输出 fill / skip / review 三态。
3. **站点 URL 匹配缺陷**：`main/index.js:2450` 用 `targetUrl.includes(workflow.targetSite.toLowerCase())` 做子串匹配。`targetSite` 为单字符（如 `"a"`）时会命中所有含该字符的 URL。本项目改用严格 origin 相等 + path 前缀（`adapters.js` 的 `hostnames` 既有校验要求明确域名、不支持通配符）。
4. **高风险字段判定**：`highRiskFieldPattern`（`:3013`）为 `/password|passwd|passcode|otp|one-time|captcha|verify|verification|cvv|cvc|card|credit|cc-number|cc-csc|cc-exp|cc-name/i`。判定前先以 `identityCardFieldPattern`（`:3014`）剥离 id-card 词再匹配，避免「身份证」被 `card` 规则误伤为银行卡。
5. **原生 setter 劫持**：`setNativeValue`（`:3220`）取 `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set` 绕过 React/Vue 的 value tracker，再由 `dispatchInputEvents`（`:3202`）补发 `InputEvent` 与 `change`。另有 `dispatchCommitEvents` 做 focus → 派发 → blur 的提交序列。
6. **动态 SPA 适配**：`targetApplyFillPlan`（`:5084`）在填充过程中用 MutationObserver 观察 DOM 变化，配合 `resolveCurrentFillSelector` 重定位已失效控件；预算为 `MAX_DYNAMIC_FILL_FIELDS=50`、`DYNAMIC_FIELD_MUTATION_TIMEOUT_MS=1200`、稳定窗口 100 ms、最多 3 轮。
7. **附件上传**：`targetSetFileInputFiles`（`:5440`）走 CDP：`DOM.getDocument` → `DOM.querySelector` → 先清空 `input.value` → `DOM.setFileInputFiles` → detach。

### 本项目的取舍

**移植的部分**：

- 原生 setter 劫持与 focus/set/blur 提交序列。本项目 `controls.js:225` 早已取原型 `value` 的 setter 绕过 value tracker，本次补齐 `InputEvent` 与提交序列，并新增 `checked` 的原型 setter 预留。
- 动态重定位的**目标**（填充途中控件被重渲染后继续，而不是整轮重来）。但不采用其 selector 重定位方式，改用本项目已有的语义身份重绑（`agent-recovery.js` `identity()` + `agent-bridge.js` 的 `signature()` 与唯一性纪律）。
- 附件上传的**目标**（把本机文件字节送进 `input[type=file]`）。但不使用 CDP：Electron 主进程可用 `DOM.setFileInputFiles`，浏览器扩展侧则需 `chrome.debugger`，会产生调试横幅并要求高危权限。扩展场景改用 DataTransfer 注入 File 对象，等价且不需要额外权限。

  2026-11-10 v2 修订：CDP 兜底重新纳入，但**限定在桌面端托管浏览器内**——扩展侧永不申请 `debugger` 权限，避免高危权限与「正在调试」横幅落到普通用户的 Chrome 上。

**拒绝移植的部分**：

- **放宽型加权匹配。** 其 0.62 阈值与 label/name/id/placeholder 权重会让「技术名恰好等于标签子串」的弱信号获得高分。本项目 `matcher.js` 已有更严谨的判据：语义精确命中优先、别名表、分节与记录隔离、家庭成员隔离、protectedLabel 永不匹配、数值区间带单位与开闭边界、阈值 78 且 top1−top2<10 弃权。竞品方案无 top1/top2 差值纪律，整体移植会造成能力倒退。其三态思想则以 `matcher.js` 内新增 `decide()` 包装实现，且置信度只用于候选排序与 UI 呈现，不参与任何阈值判定。

  2026-11-10 v2 修订：加权通道**作为补充通道保留**，但不单独决定 `fill`。融合为双通道——通道 A 是本项目既有的语义通道（`infer()` / `match()`），通道 B 是竞品式加权。通道 B 的最佳候选**必须含 label 家族信号**才可判 `fill`；仅靠技术名（`name`/`id`）命中而无可见标签支撑时降级为 `review`。依据是 `matcher.js:112` 的既有注释：可见标签优先于技术名与 ID，`city-*` 这类内部 ID 不足以证明户籍控件应填现居城市。弃权阈值沿用其 0.62 与 0.08 差值，同时保留本项目通道 A 的 78 分阈值与 10 分差值纪律。
- **URL 子串匹配。** 其 `targetUrl.includes(targetSite)`（`main/index.js:2450`）在 `targetSite` 为单字符时会命中所有含该字符的 URL。本项目提交闸门 L1/L2 改用严格 origin 相等 + path 前缀，不移植此缺陷。
- **四套框架根的硬编码探测。** 本项目按语义与几何关联标签（`layout.js` `infer`/`associate`），处理 DT/DD、表格同行、单选组 legend、表单容器标签与可见关联标签，不绑定具体框架类名，因而覆盖竞品框架之外的对象（Layui、Moka）也无需新增根规则。

  2026-11-10 v2 修订：组件根归类仍作为**附加信号**引入（`FieldSignal.component`，取值 Element / Ant / **iView** / semi-design / Layui / Moka / native），但不取代语义关联。核实发现本项目 `controls.js` 已有 `.ivu-select-item` / `.ivu-select-dropdown` 选项支持，却无 iView **组件根**归类——iView 站点目前会被当作原生 input 处理，此为真实缺口。
- **重解析 CSS selector 的重定位。** selector 在 SPA 重渲染后极易失效或误命中他人控件；语义身份 + 唯一性要求的方案更保守。

**不能由静态分析确定的部分**：其服务端模型与算法、登录后行为、未选模块、附件上传在真实站点上的成功率，以及 `DOM.setFileInputFiles` 之外的提交相关行为。上述观察仅为客户端源码事实，不是对其填写成功率或服务端能力的实测。

### 与本项目的关系

本项目的字段识别与资料匹配**强于**该竞品，动态 SPA 适配已有更安全的实现形态。真实缺口是附件上传与桌面端 PDF 生成（本项目完全没有），以及 iView 组件根归类。模块方案详见 `docs/ENGINE-ARCHITECTURE.md` v2 的 M1–M9。本次不引入其任何专有规则库、代码与资源。

2026-11-10 补充复核的证据边界：以上权重、阈值、组件根清单、标签链层级、URL 匹配与高风险正则，均来自对解包后 `main/index.js` 的静态阅读，行号为该文件内偏移；不是对其运行时行为的实测。
