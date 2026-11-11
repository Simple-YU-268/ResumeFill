# ResumeFill 填写引擎架构方案 v2

> 蓝图文档（只出方案，未实现功能）。v2 基于 main 分支 v0.27.1 逐项核对：`matcher.js`、`controls.js`、`content.js`、`adapters.js`、`layout.js`、`page-bridge.js`、`agent-bridge.js`、`agent-recovery.js`、`answers.js`、`ai.js`、`background.js`、`popup.js`、`local-server/server.cjs`、`desktop/controller.cjs`、`desktop/main.cjs`、`desktop/pdf-service.cjs`、`scripts/*` 均已实际读取确认。行号对应当前提交。
>
> v2 吸收了职悟空网申 0.1.32 的静态分析结论与 JobHuntBot 的流程方法，模块编号改用 M1–M9 命名。每一处「吸收」都标注了**已验证 / 需修正 / 全新**三种状态，方案与现实不符处以现实为准。

## 0. v2 相对 v1 的实质变化

| 项 | v1 | v2 | 变化原因 |
| --- | --- | --- | --- |
| 模块编号 | M-A…M-G | **M1…M9** | 与评审方案的编号对齐，便于逐条表决 |
| 字段识别 | 不新建 detect 模块 | **M1 新增 `detect` 层**，把现有扫描结果升级为 `FieldSignal` | 现有 `content.js` 的 field 对象已含 17 个信号中的 12 个，补齐成本低 |
| 资料匹配 | `decide()` 三态包装 | **M2 双通道融合**（语义通道 + 加权通道），四态 `fill/review/skip/block` | 需要可解释的置信度与候选排序，同时保留隔离纪律 |
| 动态适配 | 身份重绑下沉 | **M4 升为独立核心模块**：双通道重定位 + 边填边发现 + 语义漂移回滚 + 空闲判定 | 这是本项目相对竞品最具差异化的能力，值得独立成模块 |
| 附件 | 附件链路四段 | **M5** 追加 CDP 兜底与附件匹配（Dice 相似度 + 贪心分配 + 类型约束） | 附件是投递必需动作，且「简历栏只配简历」是硬需求 |
| 提交 | 提交前自检（不点击） | **M6 提交闸门链 L0–L9**，默认档仍由人点击 | 闸门链本身是安全资产；自动点击作为高自治档的可选能力 |
| 编排 | 降级为填充回执 | **M7 courier 状态机 + 投递预算** | 与 L0–L9 的配额门（L9）配套才有意义 |
| 简历变体 | 独立存储 | 归入 **M7 路由** | 变体本质是「职位 → 简历」路由，不是独立特性 |
| 桌面端 | 资料编辑器 + 附件库 | **M8** 增 autoFill 策略列、投递看板、审计回放器、AI 网关、**PDF 生成（全新）** | PDF 生成是 M5 附件字节的来源前提 |

## 1. 决策基线

1. **在 resume-fill 基础上开发。** 不新建仓库与独立应用，复用现有 MV3 扩展 + Electron 桌面端 + loopback 网关三段结构。
2. **默认不自动提交。** v1 的「放弃自动提交」在 v2 中细化为**自治档位制**：默认 A1（自动填 + 定位提交控件 + 人确认点击），A3（自动点击）需要站点适配显式声明 + 全局开关 + L0–L9 全链通过。详见 §9。
3. **不重写核心引擎，只补齐缺口。** 核实后确认 resume-fill 的字段识别与资料匹配**比目标竞品更严谨**，动态适配甚至已有更安全的实现。把竞品方案整体搬进来会造成能力倒退。真正的工作是六件事：附件上传（从零）、PDF 生成（从零）、原生 setter 补边角、动态适配下沉到通用路径、`FieldSignal` 规范化、编排与闸门。

### 1.1 明确不做

- **不代填密码、验证码、短信码、2FA、安全问题答案。** 沿用 `answers.js:3` `protectedField`，此类字段在自检中列为「需人工处理」，永不进入填充计划。
- **不移植竞品的放宽型加权匹配作为唯一决策依据。** 加权通道可补充证据，但必须过 resume-fill 的隔离纪律（见 §5.2）。
- **不虚构资料与精度。** 不采用竞品「缺月补 1」「非法日期截月末」「去除省市区县全部字符」等策略（`COMPETITOR-RESEARCH.md` 已判定其虚构精度）；日期只填到资料具备的精度。
- **不把个人资料、凭据或真实网页个人信息写入源码、测试样本、截图或发布包。**（AGENTS.md）
- **不读跨域 iframe、不读未验证 srcdoc、不读 closed Shadow DOM。** 边界见 §4.5。

## 2. 现状核实结论

### 2.1 已具备且优于竞品的部分

| 能力 | resume-fill 现状 | 证据 | 与竞品对比 |
| --- | --- | --- | --- |
| 标签来源 | 语义优先：单选组 legend、DT/DD、表格同行、表单容器标签、几何最近文本（**带歧义守卫**） | `layout.js:36` `associate`、`layout.js:27` `infer` | 竞品为 7 级降级链，**无 legend、无 DT/DD、无歧义守卫** |
| 几何歧义守卫 | 首选与次选分差 < 12 即判为歧义并清空标签 | `layout.js:29` | 竞品 `nearbyTextLabel` 无界向上遍历父级，无守卫 |
| ARIA 作用域安全 | `aria-labelledby` 用 `el.ownerDocument.getElementById` | `layout.js:46` | 竞品用全局 `document.getElementById`，跨 Shadow Root 不安全 |
| 可见性 | `ResumeLayout.visible` 覆盖 inert / aria-hidden / opacity / 尺寸 / display / visibility | `layout.js:6` | 竞品判定更宽 |
| 跨文档边界 | 同源等值 + 可见 + 已验证 srcdoc + sandbox 判定 | `page-bridge.js:7` `frameInfo`、`:21` `eligible` | 竞品无同源边界概念 |
| 资料匹配 | 语义精确命中优先、别名表、分节与记录隔离、家庭成员隔离、protectedLabel 永不匹配、数值区间带单位与开闭边界 | `matcher.js:108` `match`、`:148` `infer`、`:167` `numericInterval`、`:206` `allowedPath` | 竞品为加权置信度，无隔离概念 |
| 弃权纪律 | 阈值 78 且 top1−top2<10 弃权 | `matcher.js:108` 末尾 | 竞品无 top1/top2 差值纪律 |
| 原生 setter 劫持 | 取 `Object.getOwnPropertyDescriptor(proto,"value").set` 绕过 React/Vue value tracker | `controls.js:225` `setValue` | 与竞品 `setNativeValue` 同手法 |
| 独立回读 | 填后强制回读，不一致计 mismatch | `controls.js:873` `verify` | 竞品部分成功仅表示未抛异常 |
| 虚拟下拉枚举 | `aria-posinset` 全量枚举，500 项 / 40 次滚动上限 | `controls.js:334`、`:357` | 竞品无此能力 |
| 动态重定位 | 语义身份 + 签名 + **唯一性要求**，不走 CSS selector | `agent-bridge.js:139`、`:164` `identityCounts` | 竞品 `resolveCurrentFillSelector` 重解析 selector，易误命中 |
| 保护字段 | 密码、验证码、安全答案永不匹配永不保存 | `answers.js:3` | 与 JobHuntBot 的「验证码/2FA 一律阻塞转人工」一致 |
| AI 外发口径 | 默认只发标签与候选路径，简历值需显式勾选才附带 | `ai.js:47` `build`、`popup.js` 的「本次 AI 请求附带简历值」 | 竞品无对应披露 |

### 2.2 真实缺口

| 编号 | 缺口 | 证据 | 影响 |
| --- | --- | --- | --- |
| G-1 | **附件上传完全不存在** | 全仓库检索 `type="file"` / `DataTransfer` / `upload` 仅命中 CHANGELOG 一行；`content.js:194` `eligible()` 明确把 `file` 排除 | 简历投递的必需动作缺失 |
| G-2 | **桌面端不产出可上传文件** | `desktop/pdf-service.cjs:18` 仅导出 `extract/parse/validate/schema`；全仓库无 `printToPDF` | M5 附件字节无本地来源 |
| G-3 | **身份重绑只在 Agent 路径生效** | `agent-bridge.js:139` 在 `observe(run,recovery)` 内；`content.js:1324` `fill` 走不到 | 普通站点遇到 SPA 重渲染只能失败重来 |
| G-4 | **setter 提交序列不完整** | `controls.js:225` 用普通 `Event("input")` 而非 `InputEvent`；无 focus→set→blur；无 `checked` 原生 setter | 受控组件可能不触发 onChange |
| G-5 | **无统一决策输出** | `matcher.js:246` `suggestions` 有候选与理由，但无 fill/review/skip/block 判定 | UI 只能二态呈现 |
| G-6 | **无多版本简历与岗位路由** | `resume` 结构由 `pdf-service.cjs` `schema` 固定，`flatten` 无变体概念 | 一份简历打天下 |
| G-7 | **无投递编排与配额** | 全仓库无 job_pool / 状态机 / 配额概念 | 无法回答「这周投了多少、哪些没填上」 |
| G-8 | **无 valueType / risk / framework 组件归类** | 全仓库检索 `valueType` 为空；`content.js:229` `kind` 只按元素类型分类 | 缺加权通道的强信号与风险分级 |
| G-9 | **iView 组件根未归类** | `controls.js:89,147,247` 有 `.ivu-select-dropdown` / `.ivu-select-item` 选项支持，但 `content.js:237` 的扫描选择器与 `kind` 均无 `.ivu-*` 根 | iView 站点只能按原生 input 处理 |
| G-10 | **无自治档位 / autoSubmit / trustedSubmitSelectors** | 全仓库无任何现有实现 | M6/M7 的前置 |

## 3. 总体架构

```text
桌面端 (Electron)
  资料编辑器(autoFill 策略列) · PDF 解析/OCR · PDF 生成(新增) · 附件库(新增)
  投递看板 · 审计回放器 · AI 网关(只发标签与候选路径)
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
    |- matcher.js   匹配与弃权（既有，阈值不动）  -> M2
    |- controls.js  控件操作（setter 增强在此）   -> M3
    |- layout.js    标签与结构识别（既有）        -> M1
    |- adapters.js  站点声明式适配（新增 file 类型）-> M5
    |- detect.js    FieldSignal 归一化（新增）     -> M1
    +- adapt.js     动态重定位与边填边发现（新增） -> M4
    +- upload.js    附件注入（新增）               -> M5
    +- submit.js    提交闸门与候选定位（新增）     -> M6
```

### 3.1 模块依赖方向

单向向下：`popup.js` -> `content.js` -> `controls.js` -> 浏览器 API。

- `matcher.js` 保持零 DOM 依赖（可被 Node 测试与本地网关直接 require），M2 的决策层作为新导出加入。
- `controls.js` 承载 setter 与控件操作，不感知模块编排。
- `content.js` 作为编排层持有 registry、调用 `controls`、执行 M1/M2/M4/M5/M6。
- `detect.js` / `adapt.js` / `upload.js` / `submit.js` 为内容脚本专用，仅依赖 `controls` 与 `matcher` 的既有约定。
- 桌面端附件库 -> loopback 网关 -> background -> content -> `upload.js`，构成附件字节的唯一通路。

### 3.2 与目录重组计划的对齐

`docs/restructure-plan.md` 已规划 `src/` 三层结构（`core/` 纯逻辑、`content/` 页面上下文、`ui/` 共享界面）。本方案的新增文件按该规划落位：

| 新增文件 | 目标位置 | 理由 |
| --- | --- | --- |
| `detect.js` | `src/content/detect.js` | 页面上下文，依赖 DOM |
| `adapt.js` | `src/content/adapt.js` | 页面上下文，依赖 DOM 与 MutationObserver |
| `upload.js` | `src/content/upload.js` | 页面上下文，依赖 File/DataTransfer |
| `submit.js` | `src/content/submit.js` | 页面上下文，需读 DOM 找提交控件 |
| M2 决策层 | `src/core/matcher.js` 内新增导出 | 纯逻辑，保持零 DOM 依赖 |
| M7 courier | `src/core/courier.js` | 纯逻辑状态机，可被 Node 测试直接 require |

**在目录重组落地前**，新增文件暂放仓库根目录（与现有 `content.js`/`controls.js` 同级），路径引用随重组一次性调整，不做二次搬迁。

## 4. M1 · 字段识别 detect

**职责**：把当前散落在 `content.js` 扫描流程里的字段信息，收敛为一份规范化、可解释、可被上层直接消费的 `FieldSignal[]`。

### 4.1 信号定义与来源

`FieldSignal` 是现有 `content.js:904` `field` 对象的**超集**——12 个字段已存在，本模块补齐 5 个并形式化 2 个。

| 信号 | 类型 | 现状 | 来源与动作 |
| --- | --- | --- | --- |
| `stableId` | string | 已有 `content.js:1077` | 沿用 `content.js:191` WeakMap 分配 |
| `selector` | string | 无 | **新增**。诊断用提示，**不作为主定位依据**（见 §7.2） |
| `identity` | string | 无 | **新增**。取 `agent-recovery.js:73` `identity(f)`，作为 M4 重定位的主键 |
| `label` | string | 已有 `content.js:875` | 沿用融合后的标签链结果 |
| `labelProvenance` | enum | 已有 `evidence` 字段 | **形式化**。`content.js:933` 已有 `evidence`，改为枚举：`adapter` / `aria` / `legend` / `dt-dd` / `table-row` / `container` / `sibling` / `placeholder` / `geometry` / `ocr` / `attribute` |
| `name` | string | 在 `tokens` 内 | **提升**为独立信号（`el.name`） |
| `id` | string | 在 `tokens` 内 | **提升**为独立信号（`el.id`） |
| `placeholder` | string | 在 `tokens` 内 | **提升**为独立信号（`el.placeholder`） |
| `type` | string | 已有 `content.js:911` | 沿用 `content.js:229` `kind(el)` |
| `valueType` | enum | 无 | **新增**（见 §4.3） |
| `visible` | boolean | 隐含 | **新增**。恒等于 `ResumeLayout.visible(el)`，显式落盘便于审计 |
| `component` | enum | 无 | **新增**。框架组件归类（见 §4.4） |
| `options` | string[] | 已有 `content.js:938` | 沿用；`SELECT` 取 `el.options`，组件下拉走适配配置 |
| `section` | string | 已有 `content.js:905` `ctx` | 沿用 `contextFor` |
| `recordIndex` | number | 已有 `ctx` | 沿用 |
| `required` | boolean | 已有 `content.js:919` | 沿用（`el.required` / `aria-required` / `is-required` 类 / 星号） |
| `risk` | enum | 无 | **新增**（见 §4.6） |

### 4.2 标签提取：resume-fill 九级链

**修正**：竞品的 7 级链（`main/index.js:2841` `labelFor`）实际为 `aria-label -> aria-labelledby -> label[for] -> 祖先 label -> placeholder -> 相邻兄弟文本 -> 组件内占位符`——**不含单选组 legend 与 DT/DD**。这两级恰是 resume-fill 独有且更严谨的能力。

因此融合后的**九级链**（自上而下取首个命中）：

| 级 | 来源 | resume-fill | 竞品 |
| --- | --- | --- | --- |
| 1 | `aria-label` | 有 `content.js:880` | 有 |
| 2 | `aria-labelledby` | 有 `content.js:873` `linked` | 有 |
| 3 | 单选组 legend / `role=radiogroup` | 有 `layout.js:45` `groupLabel` | 无 |
| 4 | DT/DD | 有 `layout.js:41` `definitionLabel` | 无 |
| 5 | `label[for]` | 有 `el.labels` | 有 |
| 6 | 祖先 label | 有 `content.js:868` | 有 |
| 7 | placeholder | 有 `content.js:885` | 有 |
| 8 | 相邻兄弟文本 | 仅几何最近文本 | 有，但**无歧义守卫** |
| 9 | 组件内占位符 | 有 `content.js:884` `inferred.label` 兜底 | 有 `placeholderFor` |

**实现要求**：

- 级 8 若采用竞品的「相邻兄弟文本」语义，**必须继承 resume-fill 的歧义守卫**（`layout.js:29`：首选与次选分差 < 12 即放弃），不得引入无界父级遍历。
- 级 2 的 `aria-labelledby` 解析必须使用 `el.ownerDocument.getElementById`（`layout.js:46` 既有做法），**不得**用全局 `document`。
- 每级命中都写入 `labelProvenance`，使 UI 能说明「这个标签是怎么来的」。

### 4.3 valueType 语义类型

`valueType` 描述**值的语义形态**，与控件类型 `type` 正交。它是 M2 加权通道的强信号（一致 +0.12 / 冲突 -0.25）。

```text
text | longtext | email | phone | url | number | integer | date | month | year
| select | radio | checkbox | switch | file | password | unknown
```

**推导规则**（按优先级，先命中先定）：

1. `el.type` 直接映射：`email` -> `email`，`tel` -> `phone`，`url` -> `url`，`number` -> `number`，`date` -> `date`，`month` -> `month`，`password` -> `password`，`file` -> `file`，`checkbox` -> `checkbox`，`radio` -> `radio`。
2. `type` 为 `text` 时按 `autocomplete` 提升：`email`->`email`，`tel`->`phone`，`url`->`url`，`name`->`text`。
3. `type` 为 `text` 时按 `maxlength` 提升：`maxlength > 200` -> `longtext`。
4. `type=number` 且 `step=1` -> `integer`。
5. 控件类型映射：`select`->`select`，`combobox`->`select`，`radio`->`radio`，`contenteditable`->`longtext`。
6. 组件根映射（§4.4）：`switch` -> `switch`，`date-picker` -> `date`。
7. 兜底 `unknown`。

**冲突定义**（用于 M2 的 -0.25 惩罚）：一方为 `email/phone/url/number/integer/date/month/year` 中的**强类型**，另一方为 `text/longtext/unknown` 时视为冲突。`select` 与具体类型不冲突（选项语义由选项文本另行判断）。

### 4.4 框架组件归类

**修正**：评审方案中写作「Element / Ant / View / semi-design」，竞品源码实为 **Element / Ant / iView / semi-design**（`main/index.js:2646` `componentRootSelectors`，其中 iView 为 `.ivu-input-wrapper` / `.ivu-select` / `.ivu-checkbox-wrapper` / `.ivu-radio-wrapper` / `.ivu-radio-group` / `.ivu-switch` / `.ivu-input-number` / `.ivu-date-picker`；semi-design 为 `[class*="sd-Dropdown-container"]` / `[class*="sd-Input-container"]`）。

`component` 取值与判定（**由具体到一般**）：

| 取值 | 判定依据 |
| --- | --- |
| `element` | `.el-input` / `.el-select` / `.el-checkbox` / `.el-radio(-group)` / `.el-switch` / `.el-input-number` / `.el-date-editor` |
| `ant` | `.ant-input-affix-wrapper` / `.ant-select` / `.ant-checkbox-wrapper` / `.ant-radio-wrapper` / `.ant-radio-group` / `.ant-switch` / `.ant-input-number` / `.ant-picker` |
| `iview` | `.ivu-input-wrapper` / `.ivu-select` / `.ivu-checkbox-wrapper` / `.ivu-radio-wrapper` / `.ivu-radio-group` / `.ivu-switch` / `.ivu-input-number` / `.ivu-date-picker` |
| `semi` | `[class*="sd-Dropdown-container"]` / `[class*="sd-Input-container"]` |
| `layui` | `.layui-form-select` / `.layui-input` 等（resume-fill 既有覆盖） |
| `moka` | `[class*="sd-Select-container-"]`（resume-fill 既有覆盖） |
| `native` | 以上皆非 |

**与现有 `kind()` 的关系**：`content.js:229` `kind(el)` 按**元素类型**分类（select / radio / combobox / date / input / contenteditable），`component` 按**框架归属**分类，二者正交，共存不冲突。

**修复 G-9**：iView 根归类落地后，`content.js:237` 的扫描候选选择器需补 `.ivu-select` 等根，使 iView 下拉被识别为 `combobox` 而非原生 input。选项读取已由 `controls.js:89,147,247` 的 `.ivu-select-item` 支持，无需新增。

### 4.5 边界：只读可见且同源的表单

以下四条为**隐私红线**，实现中不得放宽：

1. **只读当前可见表单** — `ResumeLayout.visible(el)`（`layout.js:6`），覆盖 inert / `aria-hidden` / opacity=0 / 零尺寸 / `display:none` / `visibility:hidden|collapse`。
2. **可见同源 iframe** — `page-bridge.js:21` `eligible` 要求 `info.origin === origin`（严格相等）。
3. **已验证同源 srcdoc** — `page-bridge.js:13` `srcdocVerified` 且 `:18` 校验 `window.top.location.origin`。
4. **开放 Shadow DOM** — `layout.js:4` `roots()` 只递归 `el.shadowRoot`（closed 根的 `shadowRoot` 为 null，自然不可达）。

另：`page-bridge.js:11` 拒绝 `sandbox` 且不含 `allow-same-origin` 的 frame（`OPAQUE_SANDBOX`）。

### 4.6 risk 风险分级

resume-fill 的 `answers.js:3` `protectedField` 与竞品的高风险正则（`main/index.js:3013`）覆盖范围不同，取**并集**并分级：

| 级别 | 判定 | 处置 |
| --- | --- | --- |
| `protected` | `answers.js:3` 命中（验证码 / 密码 / 安全问题 / 一次性码等） | **永不匹配、永不保存、永不填充**；M6 的 L5/L6 据此阻断 |
| `identity` | 身份证 / 护照 / 证件号 | 永不外发（`option-match.js:8` 已对身份证 / 银行卡 / 手机 / 邮箱做拦截）；仅本地填写 |
| `high` | 竞品正则命中但非上述两类：银行卡 / CVV / 信用卡 / `otp` / `one-time` | 需人工确认；不进入自动填充计划 |
| `normal` | 其余 | 正常参与匹配 |

**竞品细节修正**：竞品在做高风险判定前会**剥离身份证词**再匹配（`main/index.js:3014` `identityCardFieldPattern` -> `identity-document`），目的是避免「身份证」被 `card` 规则误伤为银行卡。本方案采用同样的剥离顺序，但把结果**升级为 `identity` 独立级别**而非简单放过。

### 4.7 测试

- `detect-test.cjs`（Node）：`valueType` 推导表全覆盖；`component` 归类表全覆盖；`risk` 分级，含身份证不被 `card` 误伤。
- `detect-browser-test.cjs`：合成页覆盖九级标签链各级命中，断言 `labelProvenance` 正确；断言几何歧义时标签为空。
- 断言 iView 合成下拉被识别为 `component==='iview'` 且 `type==='combobox'`。

## 5. M2 · 资料匹配 match

**职责**：输出可解释的**四态**决策与候选排序，并保留 resume-fill 已有的全部隔离纪律。

### 5.1 决策类型

```js
MatchDecision = {
  fieldId: string,
  action: 'fill' | 'review' | 'skip' | 'block',
  confidence: number,        // 0..1，仅用于排序与呈现
  sourcePath: string | null, // 命中的简历路径
  reason: string,            // 人可读，中文
  alternatives: [{ path, confidence, reason }],
  risk: 'normal' | 'high' | 'identity' | 'protected'
}
```

### 5.2 双通道融合

**核心不变式**：加权通道**永远不能**绕过 resume-fill 的隔离纪律（记录隔离、家庭隔离、protectedLabel、字段歧义）。

**通道 A · 语义通道（resume-fill 既有，最高优先）**

1. `infer()` 精确命中（`matcher.js:148`，score 100）-> `confidence 0.98`。
2. `match()` 命中（`matcher.js:108`，score >= 78 且 top1-top2 >= 10）-> `confidence` 按 `0.78 + (score-78)/22 * 0.19` 映射到 `[0.78, 0.97]`。
3. 通道 A 命中即 `action: 'fill'`（仍需通过 §5.4 的隔离校验）。

**通道 B · 加权通道（吸收竞品）**

在通道 A 未命中时启用，对**每个候选路径**按竞品权重（`main/index.js:4853` `matchProfileField`，数值已核实）计算：

```text
label 命中            -> 0.70
name 命中             -> 0.68（label 已命中则 +0.04）
id 命中               -> 0.68（label 已命中则 +0.04）
placeholder 命中      -> 0.64（label 已命中则 +0.08）
valueType 一致        -> +0.12
valueType 明确冲突    -> -0.25
html type 一致        -> +0.08
封顶 0.98
```

**命中判定**沿用 resume-fill 的 `labelVariants`（`matcher.js:79`）与 `namesFor`（`:86`）别名表，**不引入竞品的 `textMatches` 宽松包含**。

**通道 B 的 fill 附加条件（比竞品更严的一处收紧）**：

> 通道 B 的最佳候选**必须含 label 家族信号**（即 label/name/id/placeholder 中至少一个是 label 系命中）才可判 `fill`；若仅靠技术名（`name`/`id`）命中而无可见标签支撑，降级为 `review`。

依据：`matcher.js:112` 既有注释——「可见标签优先于技术名与 ID；`city-*` 这类内部 ID 不足以证明户籍控件应填现居城市」。竞品无此约束，正是其误填的主要来源。

### 5.3 弃权纪律

| 条件 | 动作 | 依据 |
| --- | --- | --- |
| 最高分 < 0.62 | `skip` | 竞品阈值，已核实 |
| top1 - top2 < 0.08 | `skip`（歧义） | 竞品阈值，已核实 |
| 通道 A 命中但 top1 - top2 < 0.10 | `skip` | resume-fill 既有纪律（`matcher.js:108`，78 分制下差 10 约等 0.10） |
| 受保护字段（`risk==='protected'`） | `block` | `answers.js:3` |
| 候选路径被 `allowedPath` 拒绝 | `skip`（该候选不可用） | `matcher.js:206` |
| `valueType` 冲突且无其它证据 | `skip` | §4.3 |
| 通过但置信度落在灰区 | `review` | 见下 |

**灰区定义**：通道 B 命中且置信度 >= 0.62，但（a）无 label 家族信号，或（b）`risk==='high'`，或（c）数值型字段落入 `numericInterval` 的区间重叠 -> `review`，不 `fill`。

### 5.4 隔离规则（全部沿用，不放宽）

| 规则 | 实现 | 证据 |
| --- | --- | --- |
| 记录隔离 | work/education 只允许同 section 同 recordIndex | `matcher.js:206` `allowedPath` |
| 家庭成员隔离 | `family.*` 永不与 `basics.*` 互串 | `matcher.js:206` + `matcher.js:108` 开头分支 |
| 字段歧义 | `ambiguousLabel` / `contextBlocked` / `workBindingRequired` / `familyAmbiguous` -> 非 fill | `matcher.js:110`、`:108` |
| 保护字段 | `protectedLabel` 永不匹配 | `matcher.js:111` |
| 数值语义 | 薪资 / 年龄 / 工龄复用 `numericInterval`（单位与开闭边界），重叠区间转人工 | `matcher.js:167`、`:199` `numericOptions` |
| 外来人员字段 | `foreignPerson` 不得取 `basics.*` 除专属键外 | `matcher.js:113`、`:150` |
| 地区语义 | 户籍 / 籍贯 / 现居 由 `regionRole` + `regionLevel` 决定，不按字符串猜 | `layout.js:52`、`:54` |

### 5.5 输出与消费

- `matcher.js` 新增导出 `decide(field, values, options)`，零 DOM 依赖，可被 Node 测试直接 require。
- `options`：`{ allowReview: false }`——默认 `review` 不进入自动填充，只进 UI 队列。
- `alternatives` 最多 6 项，来源复用 `matcher.js:246` `suggestions` 的既有路径与理由文案。
- `confidence` **不参与任何阈值判定**，只用于排序与呈现——与 v1 同一纪律，代码层与判定层分离。

### 5.6 测试

- `decide-test.cjs`（Node）：四态各路径；通道 A/B 分流；label 家族信号约束；`valueType` 冲突惩罚；记录/家庭隔离；`numericInterval` 重叠转人工；受保护字段 -> `block`。
- 断言「技术名命中但无标签」降级为 `review`。
- 断言 `confidence` 变化不影响任何 `action`（同分不同序的回归）。

## 6. M3 · 填充执行 fill

**核心手法**：原生 setter 劫持。`controls.js:225` 已有原型 setter 的一半，本模块补齐事件序列与受控组件分支。

### 6.1 setter 补齐

**现状核对**：`controls.js:225` `setValue` 已取 `Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value)`，且 `input` 事件**已带 `composed: true`**（Shadow DOM 场景已覆盖）。缺的是：

| 缺口 | 现状 | 补齐 |
| --- | --- | --- |
| 事件类型 | 普通 `Event("input")` | 改 `InputEvent`，`inputType: "insertText"`，`data` 传值 |
| change 事件 | `Event("change",{bubbles:true})`，**无 `composed`** | 补 `composed: true` |
| 提交序列 | 无 focus / blur | `focus -> set -> dispatch -> blur`，仅在元素当前未聚焦时补 focus |
| checkbox | 无 `checked` 原生 setter | 新增 `setNativeChecked`，取原型 `checked` 的 setter |
| contenteditable | `controls.js:1263` 已发 `InputEvent` 但只写 `textContent` | 补 `composed: true` |

**关键实现点**：

- `InputEvent` 用 `el.ownerDocument.defaultView.InputEvent` 构造，构造失败退回 `Event`。
- blur 必须**放在 dispatch 之后**——顺序反了会让受控组件先收到 change 再收到失焦校验，导致校验态不一致。
- `setNativeChecked` 同样走原型 setter，`controls.js` 现有 radio 分支**不改**：radio 必须点击真实选项，setter 不能触发框架选中态。

### 6.2 组件适配与真实选中回读

每一类适配都必须**真实选中项回读**（`controls.js:873` `verify` 既有能力），不得以「没抛异常」当成功。

| 控件 | 现状 | 本模块动作 |
| --- | --- | --- |
| 原生 `select` | 已有 `controls.js` | 复用 |
| 组件下拉（Element / Ant / iView / semi / Layui） | 已有元素 / 选项支持；iView **根**未归类 | 随 M1 §4.4 修复 |
| 虚拟滚动下拉 | 已有 `controls.js:334` 500 项上限、`:357` 40 次滚动 | 直接复用，不放宽上限 |
| 日期面板 | 已有，精度保留 | 复用；**不补造月日** |
| 级联 cascader | 已有 `controls.js:1240` 逐级选择 + `readbackSelector` 必需 | 复用 |
| radio 组 | 已有，真实点击 | 复用 |
| contenteditable | 已有 `controls.js:1263` | 补 composed |
| checkbox / switch | 无 `content.js:194` 排除 | 本轮**不纳入**可填字段；`setNativeChecked` 留作接口预留 |

### 6.3 失败模式

- 事件派发包 try/catch，失败计 `diagnostic.dispatchFailed`，由 `verify` 判定成败。**回读仍是唯一成功判据**。
- 回读不一致 -> `status: 'mismatch'`，文案「值未保留或显示值与预期不一致」，附 `selectionState(d)` 诊断。

### 6.4 测试

- `controls-v06-test.cjs` 扩展：React 受控 input 合成页（模拟 value tracker + onChange），断言 setter 劫持后 onChange 被调用且回读一致。
- 断言 Shadow DOM 内 change 事件被外部容器接收（验证 `composed`）。
- 断言 blur 在 change 之后（用监听顺序数组断言）。

## 7. M4 · 动态 SPA 适配 adapt ★

**职责**：让「边填边发现」与「语义漂移回滚」成为**通用填充路径**的能力，而非 Agent 专用。这是本项目相对竞品最具差异化的模块。

### 7.1 稳定身份

两套身份并行：

| 身份 | 来源 | 用途 |
| --- | --- | --- |
| `stableId` | `content.js:191` WeakMap 分配的 `node-N` | 单次会话内的元素指针（DOM 被替换即失效） |
| 结构指纹 | FNV-1a 哈希 | 跨 DOM 重建的语义身份 |

**修正**：评审方案称「结构指纹 FNV（adapters.js 已有）」。核实 `adapters.js:39` `fingerprint(fields)` 确为 FNV-1a（基础值 2166136261、质数 16777619），但它是**对整组适配字段求一个页面级指纹**（`[label,section,recordIndex,type,path,options]` 的 JSON），**不是**可用于逐字段重定位的指纹。

因此本模块新增 `fieldFingerprint(field)`：对 `label + name + id + placeholder + type + valueType + section + recordIndex` 求 FNV-1a，得到 8 位十六进制串。这与 `agent-recovery.js:73` `identity(f)` 是**互补**的两种粒度：

- `identity(f)`：语义键（label + section + recordIndex + type + context + rootId + workModuleId + familyRole + datePart + shadowScope + regionRole + regionLevel + scopeId），**用于唯一性校验**。
- `fieldFingerprint(field)`：内容指纹，**用于跨 DOM 重建的相似度比较**。

### 7.2 选择器重定位：双通道

**不用 CSS 选择器作主定位**（竞品 `resolveCurrentFillSelector` 重解析 selector，SPA 重渲染后极易失效或误命中他人控件）。

**通道 A · 身份完全一致**

1. 候选集：同一 `scope` 内同 `type` 的控件。
2. 筛选：`ResumeRecovery.identity(candidate) === identity(原字段)`。
3. **唯一性硬要求**：候选数必须恰好为 1。0 个或 >= 2 个一律拒绝（沿用 `agent-bridge.js:164` `identityCounts` 纪律）。
4. 通过后改写 `d.el` / `d.field`，并同步 `stableId` 与既有的 `referenceData` / `sourcePath` 引用。

**通道 B · 语义唯一**

1. 候选集：同 `scope` 内同 `type` 控件。
2. 评分：`label` 归一化相等（`matcher.js:79` `labelVariants`）+ `valueType` 相等 + `section` 相等 + `recordIndex` 相等。
3. **唯一候选才用**：多于一个 -> 不填。

**`nth-of-type` 只作最后兜底**，且**必须过通道 A/B 的重定位校验**后才可采用，不能单独作为定位依据。

**`selector` 信号的定位**：`FieldSignal.selector` 仅作诊断提示（供人排查与日志），**不进入重定位决策链**。

### 7.3 边填边发现（MutationObserver）

**竞品杀手锏，本项目此前只在 Agent 等待路径用过观察器，本模块把它接入通用填充路径。**

**观察范围**：**scope root，不是整个 body**。`layout.js:4` `roots()` 返回 scope 及其开放 Shadow Root，逐个 `observe`。

**观察配置**：`{ attributes: true, childList: true, subtree: true }`。

**流程**：

1. 填充开始前建立观察器。
2. 变更触发后进入 **settle 等待**：静止 `stableMs` 后才重新 detect，避免在骨架屏/动画中读取半成品 DOM。
3. 重新 detect 后，**新字段并入计划续填**（不是重启整轮）。
4. 完成或失败后**必须断开观察器**——在 `finally` 中执行，确保异常路径也断开。

**预算**（评审方案给定值，与 `agent-recovery.js:23` `limits` 对齐或更严）：

| 项 | 上限 | 说明 |
| --- | --- | --- |
| 单轮新增字段数 | 50 | 本轮边填边发现最多并入 50 个新字段 |
| 发现轮数 | 3 | 与 `limits.total: 3` 一致 |
| settle 等待 | 1200 ms | 与 `limits.maxDelayMs: 1500` 同量级 |
| 单字段重绑次数 | 1 | `limits.perField: 2` 的一半，留余量 |

### 7.4 语义漂移回滚

**竞品只做到「取消已填写状态」**（`COMPETITOR-RESEARCH.md` 记：模块、标签或重复组变化时取消已填写状态）。本项目能做得更强：**安全恢复原值**。

**前置条件**：填前必须快照原值。**新增能力**——现有 `controls.js` 填充路径不回存原值，`agent-recovery.js` 也没有。落地方式：在 `content.js` 填充计划生成时对每个目标字段记录 `originalValue`（空控件记 `null`，用于区分「本来就有值」与「被填成空」）。

**触发条件**：重定位（通道 A 或 B）成功后，若发现字段语义已变——

- `label` 变了；
- `type` 变了；
- `section` / `recordIndex` 变了；
- `valueType` 变了；

则：

1. **撤销该字段的填充**：用 M3 的原生 setter 写回 `originalValue`（`null` 则清空），走同一套事件序列。
2. 该字段标记 `action: 'review'`，reason 说明「字段语义已变化，已恢复原值，请人工核对」。
3. **不自动重填**——语义已变的字段需要人重新确认。

**边界**：回滚只恢复**本字段**，不触碰其他已填字段；回滚本身同样要回读验证，回读失败则标记 `unconfirmed` 并在 UI 明示。

### 7.5 页面空闲判定

**避免在骨架屏阶段检测**（骨架屏上跑 detect 会得到一堆假字段，且可能误触组件）。

- `PerformanceObserver` 监听 `resource` 条目。
- 资源数**连续稳定计数**达阈值（如 2 次采样内无新增 resource）才认为页面进入可检测态。
- 采样间隔 300 ms，总等待上限 5 s；超时则**继续扫描但标记 `skeletonSuspected`**，让 UI 提示「页面可能仍在加载，建议刷新后重扫」。
- 只观察 `entry.name` 的**数量**，不记录 URL 内容——URL 属网页信息，不进日志与存储。

### 7.6 测试

- `spa-rebind-browser-test.cjs`：合成页在填第一个字段后替换整个表单容器（含唯一同身份字段），断言第二个字段经通道 A 重绑后填入并回读一致；再合成「同身份出现两次」，断言拒绝并计 stale。
- `spa-channel-b-browser-test.cjs`：合成 label+valueType 唯一候选，断言通道 B 生效；合成两个同语义候选，断言不填。
- `spa-drift-browser-test.cjs`：填后重渲染并改变该字段 label，断言原值被恢复、动作变 `review`、其余字段不受影响。
- `spa-observer-browser-test.cjs`：断言观察器在成功与异常两条路径都被断开（暴露计数归零）。
- `spa-idle-browser-test.cjs`：合成持续加载的资源流，断言在稳定前不 detect。

## 8. M5 · 附件上传 upload

**职责**：从零建立附件链路——本机文件字节 -> 页面 `input[type=file]`；并解决「简历栏只配简历」这类类型错配。

### 8.1 链路四段

```text
1 桌面端附件库       2 loopback 网关         3 扩展后台              4 内容脚本
用户选本地简历 PDF -> /v1/desktop/attachment -> 内存中转（不落 storage） -> DataTransfer 注入
                      二级：CDP 兜底（仅桌面托管浏览器，显式开启）
```

**① 桌面端附件库**

- 位置：`desktop/main.cjs` 新增 IPC `rf:chooseAttachment`，复用 `main.cjs:78` `importPDF` 的 `showOpenDialog` 模式。
- 存储：文件**复制**进桌面端数据目录（与 `resume.json` 同级），不保留外部路径引用。记录 `{ id, fileName, size, sha256, mime, kind, createdAt }`。
- `kind` 取值：`resume` / `transcript` / `portfolio` / `other`——供 §8.4 的类型约束使用。
- 校验：大小上限 15 MB（与 `pdf-service.cjs` `extract` 的 15 MB 一致）；`sha256` 用 `node:crypto` 计算。
- 提供 `rf:listAttachments` / `rf:removeAttachment`。

**② loopback 网关**

- `local-server/server.cjs:51` 的 `desktopAction` 正则扩一个分支 `attachment`，与既有 `heartbeat|pull|push` 同级。
- 权限：`sensitive` 正则已覆盖 `/^\/v1\/desktop\//`，自动继承「必须有扩展 Origin」；`auth(req)` 校验 Bearer token。
- 返回：`{ id, fileName, mime, size, sha256, dataBase64 }`。**字节只在本机回环传输**。

**③ 扩展后台**

- `desktop-bridge.js` 新增 `RF_DESKTOP_ATTACHMENT`，调用 `call('attachment', {id})`。
- 字节**只存在于内存**，不写入 `chrome.storage`，不进 checkpoint，不进 metrics。任务结束即释放。

**④ 内容脚本注入**

```js
const bytes = base64ToBytes(dataBase64);
const file = new File([bytes], fileName, { type: mime || "application/pdf" });
const dt = new DataTransfer();
dt.items.add(file);
input.files = dt.files;
input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
```

- 目标识别：`input[type=file]`。**注意 `content.js:194` `eligible()` 当前排除 `file` 类型**——附件控件不进入常规字段 registry，改由 `upload.js` 独立扫描，**不改动 `eligible()` 的既有语义**（否则会波及密码、验证码等保护逻辑）。
- 目标唯一性：`scope` 内 `input[type=file]` 必须恰好 1 个；多个时按 `adapters.js` 的 `file` 配置消解，仍不唯一则拒绝。
- **独立回读**：读 `input.files[0].name` 与期望 `fileName` 一致才计 `verified`。
- 站点若在 change 后异步上传，回读只能确认「已选中」，**不能确认「已上传到服务器」**，UI 文案据此区分。

### 8.2 CDP 兜底

**修正**：v1 明确「不引入 `chrome.debugger`」。v2 按评审方案补入兜底，但**限定在桌面端托管浏览器内**——

- 扩展侧**永不**申请 `debugger` 权限（会产生 Chrome 顶部「正在调试」横幅，属高危权限）。
- 桌面端托管浏览器（Electron 自带窗口）内可用 CDP：先清空 `input.value`，再 `DOM.setFileInputFiles`，最后 detach。
- 需在 UI 明示「正在调试」状态，由用户在桌面端显式开启，默认关闭。

### 8.3 站点适配

- `adapters.js:3` 的 `types` 集合新增 `"file"`；字段配置新增 `file: { attachmentId, accept }`。
- `accept` 校验文件 MIME 是否被页面接受，不接受则拒绝注入。

### 8.4 附件匹配：标签与文件名

**需求**：「个人简历」栏只配 `kind:resume`，不能把成绩单填进简历栏。

**流程**：

1. **归一化**：去扩展名、去空格、全角转半角、去除「个人/本人/我的」等修饰词、统一大小写。
2. **字符 Dice 相似度**：`2 * 共同字符数 / (A 字符数 + B 字符数)`，对**字符多重集**求交（不是集合，避免「简历」与「履历」这类复字误配）。
3. **阈值 0.5** 判定为相关。
4. **贪心分配**：按相似度从高到低依次配对，每个附件与每个附件栏各只用一次。
5. **类型约束（硬约束，优先于相似度）**：`kind:resume` 的附件**只能**进入标签含「简历 / resume / CV」的栏；`kind:transcript` 只进「成绩单 / transcript」栏；其余类型无约束。
6. **无匹配不填**：相似度不足或类型冲突 -> 该附件栏标记为「需人工上传」。

### 8.5 失败模式

文件过大、类型不被接受、目标不唯一、字节解码失败、回读不一致、类型约束冲突——各自独立 reason，**不回退到猜测文件名**。

### 8.6 测试

- `desktop/attachment-test.cjs`：合成 PDF 落盘 -> 网关返回 base64 -> 断言 sha256 与体积一致；断言无 Origin 或 token 错误时 401/403。
- `upload-browser-test.cjs`：合成页含 `input[type=file]`，断言注入后 `input.files[0].name` 与内容一致、`change` 事件被收到；合成两个 file input 断言拒绝。
- `attachment-match-test.cjs`（Node）：Dice 相似度边界；「个人简历」栏拒绝 `transcript`；贪心分配不重复占用；相似度不足时不填。
- **所有测试使用合成 PDF**，不引入真实简历文件。

## 9. M6 · 提交闸门 submit

**职责**：在提交前做完整的「是否可提交」判定，产出可解释的阻断原因；并定位提交控件。**默认档不自动点击**。

### 9.1 自治档位

| 档 | 含义 | 提交动作 |
| --- | --- | --- |
| A0 | 只扫描与预览 | 不填不提交 |
| A1 | 自动填 + 人确认提交 | **默认档**。定位提交控件并高亮，由人点击 |
| A2 | 自动填 + 提交前闸门全过 + 人确认提交 | 闸门检查更严，仍由人点击 |
| A3 | 自动填 + 闸门全过后自动点击 | 需站点适配声明 `trustedSubmitSelectors` + 全局开关开启 |

**L0 的含义**：适配未声明 `trustedSubmitSelectors` -> **最高只能到 A2**。

**全局档 >= 站点档**：站点只能下调自己的档位，不能上调。全局默认 A1。

### 9.2 闸门链 L0–L9

任一不过 -> `submit-blocked` + 原因。

| 级 | 检查 | 判定 |
| --- | --- | --- |
| **L0** | 适配是否声明 `trustedSubmitSelectors` | 否 -> 档位上限 A2，自动点击不可用 |
| **L1** | **origin 严格相等** | `new URL(pageUrl).origin === new URL(siteOrigin).origin`，**不使用 `includes`** |
| **L2** | path 在适配 `pathPrefix` 内 | `pathname.startsWith(pathPrefix)` |
| **L3** | 全局自治档 >= 站点自治档 | 否 -> 阻断 |
| **L4** | 站点 `autoSubmit` 取值为 `ask` 或 `allowed` | `never` -> 直接拒 |
| **L5** | 无验证码 / 滑块 / Cloudflare 信号 | 命中 `answers.js:3` 保护词、常见挑战元素 -> 阻断 |
| **L6** | 无待确认敏感项 | 存在 `action==='review'` 的敏感字段 -> 阻断 |
| **L7** | 无低置信填充 | 存在已填字段 `confidence < 0.62` -> 阻断 |
| **L8** | 无异常跳转 / 校验错误信号 | URL 已变、页面出现错误提示 -> 阻断 |
| **L9** | 该公司投递配额未超 | 查 M7 的 `companyQuota` |

**L1/L2 的修正价值**：竞品用 `targetUrl.includes(workflow.targetSite.toLowerCase())`（`main/index.js:2450`），子串匹配下 `targetSite: "a"` 会命中所有含 `a` 的 URL。本方案改用**严格 origin 相等 + path 前缀**，并让 `adapters.js:3` `validate` 的既有约束（hostnames 必须为明确域名、不支持通配符）继续生效。

### 9.3 提交候选识别

- 扫 `button` / `input[type=submit|button]` -> 可见性过滤 -> 文本匹配 `/(submit|send|save|apply|continue|提交|保存|发送|申请|下一步|继续)/i` -> **最多 5 个**。
- 命中多个时按视觉顺序列出候选由人选择，**不猜测**。
- 命中后滚动到可见位置并高亮，复用 `visual.js` 的能力，不新增样式体系。

### 9.4 默认档的动作边界

**默认 A1/A2 下，代码层不留任何自动点击路径。** `submit.js` 只做「判定 + 定位 + 高亮」，`click()` 调用只在 A3 生效时才可达，且 A3 需要 L0 通过 + 全局开关开启。

`popup.html` 现有的「不自动提交申请」承诺在默认档保持成立；若将来开启 A3，文案必须同步改为「已开启自动提交（当前站点）」，不得让承诺与实际不一致。

### 9.5 测试

- `submit-gate-test.cjs`（Node）：L0–L9 逐级阻断断言；L1 用 `includes` 陷阱用例（`targetSite:"a"` 不得命中 `https://b.example/x`）；L3 档位比较；L7 置信度阈值。
- `preflight-browser-test.cjs`：合成页全部必填已填 -> 闸门通过且定位到唯一提交按钮；存在空必填 -> 阻断并列出 label；**断言点击次数为 0**。

## 10. M7 · 投递编排 courier

**职责**：把投递流程落成状态机 + 队列，配额与预算，并与 M6 的 L9 对接。

### 10.1 状态机

```text
job_pool
  -> 筛选(规则 / 超纲 / 关闭 / 重复 / 资格)
  -> 职位 x 简历变体路由
  -> ApplicationRun
  -> 引擎执行(扫描 -> 计划 -> 填 -> 附件 -> 提交闸门)
  -> 需要人工 -> HandoffRequest(挂起)
  -> 结果分类(submitted / blocked / failed / skipped)
  -> application-progress.json + blocker_queue
```

**位置**：`src/core/courier.js`（纯逻辑，可被 Node 测试直接 require）。状态持久化到 `chrome.storage.local` 的 `applicationProgress`，导出为 `application-progress.json` 时只含 §10.4 的字段。

### 10.2 投递预算

JobHuntBot 建议 Volume 模式，但**必须有硬上限**：

| 项 | 上限 | 说明 |
| --- | --- | --- |
| 每日投递总数 | 20 | A3/A4 档下的硬上限 |
| 单站冷却 | 30 分钟 | 同域名两次投递最小间隔 |
| 单公司配额 | 1 份 | 「每公司限 1 份」，由 L9 强制 |
| 失败熔断 | 同站连续失败 3 次 -> 暂停该站 24 小时 | 防止在坏站点空转 |

**熔断与冷却是安全阀**，防止自动化在异常站点上反复重试。

### 10.3 简历变体路由

**为什么不进 `resume` 主结构**：`resume` 的结构由 `desktop/pdf-service.cjs` `schema` 与 `matcher.js` `flatten` 共同定义，任何字段扩展都会波及既有测试与 `learning.js` 的路径校验。**隔离到独立存储是更小的风险面。**

```js
{
  version: 1,
  variants: [
    {
      id: "v-backend",
      label: "后端开发",
      attachmentIds: ["att_1"],
      answerOverrides: { "basics.summary": "…" },
      rules: { hostnames: ["zhipin.com"], keywords: ["后端", "Java", "Go"] }
    }
  ]
}
```

- `hostnames` 精确域名优先于关键词匹配（与 `adapters.js` `choose` 的最长前缀优先一致）。
- 命中 0 个或 >= 2 个变体时**不自动选择**，列出候选让用户选。
- 变体只影响**附件选择**与**补充答案**，**不影响** `matcher.js` 的核心匹配。
- `answerOverrides` 写入仍走 `answers.js` `save` 的既有路径与保护字段校验。

### 10.4 结果记录与隐私边界

```js
{
  id, at, siteLabel,        // 仅域名主体，不含路径与查询串
  variantId, attachmentName,
  attempted, verified, failed, review, blocked,
  blockerKinds: []          // 枚举，不存 label 文本
}
```

- **不记录字段标签、字段值、简历内容、完整 URL、页面标题。**
- `siteLabel` 只存域名主体（与 `page-bridge.js:4` `safeURL` 的既有口径一致）。
- `blockerKinds` 只存枚举：`required-empty` / `unverified` / `attachment-missing` / `protected` / `ambiguous` / `low-confidence` / `gate-l5` 等。
- 环形保留最近 100 条，可一键清空。
- `metrics.js` 继续只做聚合计数（无维度、无标签），回执是逐次记录，两者不混。

### 10.5 测试

- `courier-test.cjs`（Node）：状态机流转；筛选规则；变体路由（域名优先、多义弃权、变体不改核心匹配）；预算与熔断；配额与 L9 联动。
- `receipt-test.cjs`：断言不含 label/value/url 子串，断言环形上限 100，断言清空后为空。

## 11. M8 · 桌面端

### 11.1 资料编辑器：autoFill 策略列

在既有 `field-labels.js` 共享字典与 `desktop/ui/profile-editor.js` 的表格中新增一列 `autoFill`：

| 取值 | 含义 |
| --- | --- |
| `auto` | 默认，参与匹配 |
| `review` | 永远只进待核对队列，不自动填 |
| `never` | 完全排除 |
| `only` | 仅在指定站点/变体下填充 |

策略只影响 M2 的 `action` 产出，**不改变匹配算法**。保护字段恒为 `never`，且策略**不能**把 `protected` 字段改成可填。

### 11.2 PDF 生成（全新）

**核实**：桌面端当前**没有** PDF 产出能力——`desktop/pdf-service.cjs:18` 仅导出 `extract/parse/validate/schema`，全仓库无 `printToPDF`。这是 M5 附件字节的来源前提。

- 位置：`desktop/pdf-service.cjs` 新增 `render(profile, options)`，用 Electron `webContents.printToPDF`。
- 排版：单页精确排版，沿用既有 one-page 验收标准（页数、字号下限、无截断、无溢出）。
- 输出：写入附件库并登记 `kind: 'resume'`；或直接导出为用户指定路径。
- **不虚构内容**：只排版用户资料，缺字段留空，不补造。

### 11.3 投递看板与审计回放器

- **投递看板**：按 §10.4 的字段聚合展示，可按域名、状态、时间筛选；点击某条可查看 `blockerKinds` 与该次的 `alternatives`（**不含字段值**）。
- **审计回放器**：回放一次填充的**决策过程**——每个字段的 `label`（可选，默认关闭）、`action`、`confidence`、`reason`、`sourcePath`。默认只回放结构与理由，**不回放真实值**；用户可显式开启含值回放，且该内容**仅存本机、随清空按钮一起清除**。

### 11.4 AI 网关

- **只发标签与候选路径，绝不发值。** 走既有 `ai.js:47` `build` 的默认形态（`shareValues=false`）。
- **不参与自动提交决策。** AI 的输出只进 `review` 队列，`action` 由 M2 的规则决定。
- 现有「本次 AI 请求附带简历值」的显式勾选（`popup.js`）保持不变——那是用户当场的显式动作，与网关默认口径不冲突。

## 12. M9 · 扩展端

### 12.1 content script 瘦身为「注入 engine + 转发指令」

业务逻辑全部位于 `matcher.js` / `controls.js` / `detect.js` / `adapt.js` / `upload.js` / `submit.js`；`content.js` 只做**注入、消息路由与生命周期**。

**范围**：本次只做**职责收敛**（把 `content.js` 内的编排逻辑搬到 `detect.js` / `adapt.js` / `submit.js`），**不改变目录结构**——目录重组由 `docs/restructure-plan.md` 统一执行，避免两次搬迁。

### 12.2 弹窗「先看后填」

沿用现有三步：扫描 -> 计划预览 -> 一键执行。计划预览按 M2 的四态呈现：

| 状态 | 呈现 |
| --- | --- |
| `fill` | 实心状态点，一键执行时自动填 |
| `review` | 半实状态点，进待核对队列，需逐项确认 |
| `skip` | 空心状态点，折叠展示原因 |
| `block` | 警示状态点，明示「需你手动处理」 |

状态点复用既有 `popup.js:45` `labels` 映射风格与 `theme.css` 变量，不新造设计系统。

### 12.3 协议

**向后兼容**：保留现有 `RF_SCAN` / `RF_FILL` 消息码与载荷结构。

| 消息码 | 方向 | 载荷 |
| --- | --- | --- |
| `RF_RUN_DETECT` | popup -> content | 无 -> `FieldSignal[]` |
| `RF_RUN_DECIDE` | popup -> content | `{ values }` -> `MatchDecision[]` |
| `RF_RUN_FILL` | popup -> content | `{ decisions }` -> 逐字段结果 |
| `RF_RUN_UPLOAD` | popup -> content | `{ attachmentId }` -> 注入结果 |
| `RF_RUN_SUBMIT_GATE` | popup -> content | 无 -> `{ blocked, reasons[], candidates[] }` |
| `RF_RUN_COURIER` | background -> background | `{ runId }` -> 编排进度 |
| `RF_SCAN` | popup -> content | **不变** |
| `RF_FILL` | popup -> content | **不变**（内部行为增强） |

`page-bridge.js` 的 `runtimeProtocol` 保持 1；新增模块随 manifest 版本自然同步。

## 13. 运行时与打包接入

本项目**没有 `content_scripts` 声明**（`manifest.json` 只有 `background` + `action` + `options_page`），页面脚本由 `popup.js:278` 用 `chrome.scripting.executeScript` 注入：

```js
files: ["profile.js","matcher.js","layout.js","adapters.js","controls.js","answers.js","content.js","inline.js"]
```

**新增 4 个文件需三处登记**：

1. `popup.js:278` 的 `files` 数组——加入 `"detect.js"`、`"adapt.js"`、`"upload.js"`、`"submit.js"`，且必须排在 `"content.js"` **之前**（`content.js` 加载期即引用它们）。
2. `scripts/runtime-files.cjs` 允许清单——加入四个文件名。该清单同时是 `desktop/prepare.cjs` 的打包源。
3. `scripts/check-runtime.cjs` 会遍历注入数组校验文件存在，**漏登记会直接报错**——这正是护栏。

**测试接入**：`scripts/test.cjs` 是显式清单，新增测试文件必须登记，否则 `npm test` 不会跑：

- Node 组：`decide-test.cjs`、`detect-test.cjs`、`submit-gate-test.cjs`、`courier-test.cjs`、`attachment-match-test.cjs`、`receipt-test.cjs`
- 浏览器组：`detect-browser-test.cjs`、`spa-rebind-browser-test.cjs`、`spa-channel-b-browser-test.cjs`、`spa-drift-browser-test.cjs`、`spa-observer-browser-test.cjs`、`spa-idle-browser-test.cjs`、`upload-browser-test.cjs`、`preflight-browser-test.cjs`

**后台接入**：新增消息处理若需 `matcher.js` / `ai.js` 等纯逻辑，`background.js:1` 的 `importScripts` 链已含 `matcher.js`；`detect.js` / `adapt.js` / `upload.js` / `submit.js` 仅在内容脚本侧使用，不进 background。`courier.js` 若需进 background，须同步登记 `background.js` 的 `importScripts`。

## 14. UI 落点

遵守 AGENTS.md 的插画风格约定：趣味、简洁、圆润按钮、清爽排版，插画与图标同一造型和配色体系。桌面端、扩展弹窗与设置页共享既有 `theme.css` / `style.css` 变量，不新造设计系统。

| 位置 | 新增 | 说明 |
| --- | --- | --- |
| 弹窗「核对」区 | 四态状态点 | 沿用 `popup.js:45` `labels` 映射风格；实心/半实/空心/警示 |
| 弹窗 | 附件卡片 | 复用 `buddy.svg` 角色体系，配一枚「递交简历」小插画；附件选择与上传 |
| 弹窗结果卡 | 闸门清单 | 复用既有 `resultCard` 行式布局，列出 `reasons` 与「定位提交按钮」 |
| 设置页 | 附件库管理 | 列表、添加、删除；显示文件名/大小/类型，不显示路径 |
| 桌面端 | 资料编辑器 autoFill 列 | 与既有字段表格同风格 |
| 桌面端 | 投递看板 | 域名 / 状态 / 时间筛选；`blockerKinds` 徽标 |
| 桌面端 | 审计回放器 | 时间线 + 决策理由；含值回放默认关闭 |

**不改**：既有配色变量、`buddy.svg` 主体造型、`style.css` 与 `theme.css` 排版尺度。

## 15. 落地顺序

按「风险从低到高、先建立护栏再上能力」排列。每个阶段独立可发布、独立可回滚。

| 阶段 | 内容 | 版本 | 主要验证 |
| --- | --- | --- | --- |
| P0 | 本文档 v2 + 架构评审 | 不升版本 | 文档评审 |
| P1 | M2 决策接口已实现；待 M1 提供完整信号后接入预览 | 0.28.0 目标 | `semantic-test.cjs` |
| P2 | M1 `detect` 层（`FieldSignal` + `valueType` + `component` + `risk` + 九级链 provenance） | 0.28.0 | `detect-test.cjs` + `detect-browser-test.cjs` |
| P3 | M3 setter 补边角 | 0.28.0 | `controls-v06-test.cjs` 扩展 |
| P4 | M4 动态适配（含填前快照与语义漂移回滚） | 0.29.0 | `spa-*-browser-test.cjs` 四组 |
| P5 | M5 附件链路，仅使用用户选择的现有文件；M8 PDF 产出暂缓 | 0.29.0 | `desktop/attachment-test.cjs` + `upload-browser-test.cjs` |
| P6 | M5 附件匹配（Dice + 类型约束） | 0.30.0 | `attachment-match-test.cjs` |
| P7 | M6 提交闸门（默认档） | 0.30.0 | `submit-gate-test.cjs` + `preflight-browser-test.cjs` |
| P8 | M7 courier + 变体路由 + 回执 | 0.31.0 | `courier-test.cjs` + `receipt-test.cjs` |
| P9 | M9 弹窗四态 + content script 职责收敛 | 0.31.0 | 既有浏览器测试全绿 |
| P10 | A3 档（自动点击）——**需单独评审** | 0.32.0 | 全链闸门 + 配额压测 |

**版本策略**：

- 新增能力且向后兼容 -> 次版本号递增。
- **不动 1.0.0**，按 AGENTS.md「产品成熟或发生重大兼容性变化时规划主版本」。
- 每个版本号在**五处**保持一致：`package.json`、`desktop/package.json`、`manifest.json`、`package-lock.json`、`desktop/package-lock.json`（`scripts/check-version.cjs` 校验）。
- 每个可用版本提交前跑：`npm test`、`npm run test:browser`、`npm run test:desktop`、`npm run test:electron`、`npm run release:check`、`npm run privacy`、`npm run privacy:artifacts`。
- 发布说明写入 `docs/releases/<version>.md`，CHANGELOG 补条目，`PRIVACY-REVIEW.md` 的 `Reviewed for v<version> on <date>` 同步更新（`scripts/check-release.cjs` 强制）。

**P10 单列的理由**：A3 是本方案里唯一会让软件代替人点击「提交」的阶段，风险与前九个阶段不同量级，必须独立评审、独立版本、独立回滚。P1–P9 全部达成且闸门链在真实站点上稳定运行之前，不启动 P10。

## 16. 风险登记

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 加权通道放宽了匹配边界 | 误填到相邻字段 | 通道 B 需 label 家族信号；`allowedPath` 与家庭隔离为硬约束；`confidence` 不参与阈值判定 |
| 技术名命中被当成语义命中 | 户籍控件填现居城市 | §5.2 的 label 家族信号约束（依据 `matcher.js:112` 既有注释） |
| 语义漂移回滚写坏原值 | 用户原有数据被覆盖 | 回滚前有填前快照；回滚后同样回读验证；只动本字段 |
| 边填边发现无限扩张 | 页面卡死 | 50 字段 / 3 轮 / 1200 ms settle 三重预算；观察器在 `finally` 必断开 |
| 骨架屏阶段误检 | 产生一批假字段 | PerformanceObserver 空闲判定；超时则标记 `skeletonSuspected` 提示重扫 |
| 附件字节外泄 | 个人资料泄露 | 仅本机回环 + Bearer + Origin；不落 storage、不进日志与导出 |
| CDP 兜底引入高危权限 | 权限与体验退化 | CDP 仅在桌面托管浏览器内；扩展侧不申请 `debugger` |
| 附件类型错配 | 成绩单填进简历栏 | `kind` 硬约束优先于相似度；无匹配不填 |
| 闸门链有绕过路径 | 误提交 | L1 严格 origin 相等；L0 未声明则档位上限 A2；默认档代码层无 `click()` 路径 |
| 投递预算被绕过 | 批量滥用 | 预算在 courier 单一入口强制；L9 校验公司配额；熔断与冷却兜底 |
| 回执含网页个人信息 | 隐私违规 | 只存域名主体与枚举 kind，禁存 label/value/完整 URL |
| 新文件漏登记 | 安装包运行时报错 | `scripts/check-runtime.cjs` 在打包期强制校验 |

## 17. 与 JobHuntBot 和竞品的关系

JobHuntBot 是流程与资料组织层，不是可移植的代码库。本方案吸收它的**方法与纪律**，不复制其实现：

| JobHuntBot 资产 | 在本项目中的对应 |
| --- | --- |
| `candidate_profile.json` | `resume`（`chrome.storage.local` / 桌面端 `resume.json`），已存在 |
| `answer_bank.md` | `resume.fieldAnswers` + `answers.js`，已存在 |
| `experience_bank.md` | `resume.education/work/projects`，已存在 |
| `application_rules.md` | `adapters.js` 站点适配 + `learning.js` 学习闭环，已存在 |
| `safety-and-boundaries.md` | `answers.js` `protectedField` + M6 的 L5/L6 |
| 「点了提交但没看到确认记 Blocked 不记 Submitted」 | M7 `blockerKinds` 中 `unverified` 与 `attachment-missing` 只记阻塞，不记成功 |
| `resume_routing.md` | M7 变体路由 |
| `dashboard-template/*.csv` + `csv-store.js` | M7 回执 + M8 投递看板 |
| Volume 模式 | M7 投递预算（**加硬上限**） |

对职悟空网申 0.1.32 的**移植清单**：

| 手法 | 处置 |
| --- | --- |
| 原生 setter 劫持 | **移植**（M3），补齐 InputEvent / focus-blur / composed |
| 组件根归类 | **移植**（M1 §4.4），并修正为 Element/Ant/**iView**/semi-design |
| 7 级标签降级链 | **移植并扩展**为九级，补入 resume-fill 的 legend 与 DT/DD，保留其歧义守卫 |
| 加权置信度 | **移植但收紧**（M2 §5.2），仅作补充通道，需 label 家族信号 |
| 数值语义 | **不移植**其虚构精度做法；复用 `numericInterval` |
| URL 子串匹配 | **拒绝移植**，改严格 origin 相等 + path 前缀（M6 L1/L2） |
| 高风险正则 | **移植并升级**为三级 `risk`（M1 §4.6） |
| MutationObserver 边填边发现 | **移植并扩展**（M4 §7.3），加三重预算与必断开约束 |
| 语义漂移取消已填 | **移植并增强**为回滚原值（M4 §7.4） |
| 竞品高风险未做 | **新增**：AI 只发标签与路径、审计回放不含值、投递配额 |

## 18. 文档与研究纪律

- 竞品观察结论按既有体例记入 `COMPETITOR-RESEARCH.md`：写清观察对象、证据边界、**明确拒绝移植的项与理由**、独立实现的部分。原始包与完整导出留在私人研究目录，不随项目发布。
- 不复制竞品专有规则库、代码与资源；仅借鉴通用手法（原生 setter、加权评分、观察器、语义身份重绑），并在本文档记录独立实现方式。
- 本文档所述能力均为**未实现**；发布前不得在版本说明或用户界面中宣称已具备。

## 变更记录

- M7 首个实现：新增 `courier.js` 状态机、后台串行存储及扩展任务列表；用户输入的公司名归一化后以 SHA-256 键存储。手动添加任务后，填写结果进入 handoff 或 blocked，submitted 只接受用户显式确认。入队验证日预算、同站冷却、公司配额及连续失败熔断。待补：职位筛选与简历变体路由、桌面看板、回执导出及失败任务恢复预算校验。

- M5 首个实现：桌面端可导入或移除一份投递用原始 PDF。扩展先显示文件名，再按内容摘要与当前扫描绑定确认；仅写入唯一可见的空简历附件栏。回读确认本地选中文件，网站上传状态由用户核对。

- 2026-11-11：P1 新增 `ResumeMatcher.decide()`，不更改既有 `match()` 调用链。仅既有本地匹配通过隔离和风险校验后可返回 `fill`；加权信号使用 0.62 和 0.08 做候选弃权，只能返回 `review` 或 `skip`。初版类型证据覆盖邮箱、电话与网址。P5 不依赖 PDF 产出。

- 2026-11-10（v2）：吸收职悟空网申 0.1.32 与 JobHuntBot 的方法，模块编号改为 M1–M9。落实核实结论：组件根为 Element/Ant/**iView**/semi-design（评审方案写作「View」）；竞品 7 级链无 legend 与 DT/DD，融合后为九级；`adapters.js:39` 的 FNV 是页面级指纹，逐字段指纹为新增；竞品 URL 子串匹配确认为缺陷，L1/L2 改为严格 origin 相等。决策变化：提交策略由「放弃自动提交」细化为 A0–A3 自治档位制，默认 A1 仍由人点击，A3 需 L0 声明 + 全局开关并单列为 P10。桌面端新增 PDF 生成能力（现无 `printToPDF`）。
- 2026-11-10（v1）：依据 REA 对 Electron 网申桌面端的静态分析结论，以及对 main 分支 v0.27.1 的逐文件核实，改写「新建独立应用」方案为「resume-fill 内新增模块」方案。
