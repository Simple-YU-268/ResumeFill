# ResumeFill Agent 视觉与样式验收报告

- 验收日期：2026-10-22
- 验收范围：`style.css`、`theme.css`、`popup.html`、`options.html`、`desktop/ui/style.css`、`desktop/ui/theme.css`、`desktop/ui/index.html`、`visual.js`（视觉注入层）
- 方法：静态样式审查 + WCAG 2.1 对比度量化计算（27 组前景/背景色组合）

> ⚠️ **版本说明**：任务描述为 v0.18.0，但工作区实际版本为 **0.24.1**（`package.json`、`desktop/package.json`、`manifest.json` 三者一致，符合 AGENTS.md 版本一致性约定）。本报告基于 0.24.1 源码。

---

## 一、总体结论

**有条件通过**。核心视觉语言（插画 buddy.svg、明快色块、圆润按钮、共享 theme.css）在扩展与桌面端是统一的，全部 27 组文字对比度达到 WCAG AA（≥4.5:1）。但存在一个**架构级风险**（主题完全依赖 JS 运行时注入，基础层是另一套视觉）和若干 token 治理问题，建议修复后再发布。

## 二、符合项

| 项目 | 证据 |
|---|---|
| 共享视觉资源 | `buddy.svg` 三处副本（根目录、`desktop/ui/`、`desktop/resources/extension/`）字节一致；`theme.css` 三处副本字节一致 |
| 打包副本同步 | `style.css`/`popup.html`/`options.html`/`theme.css` 与 `desktop/resources/extension/` 内副本完全一致 |
| 对比度 | 27/27 组通过 AA，含主按钮白字/#3e6758（6.39:1）、muted 文字（4.90–5.23:1）、错误态 #ad413b（5.27–5.79:1）、桌面基础层深色侧栏文字（6.71–9.69:1） |
| 焦点可见性 | `theme.css` 为 button/a/summary 提供 3px `#526fc2` outline + 3px offset；`style.css` 为 select/input/textarea 提供 2px `:focus-visible` outline，均清晰可见 |
| 圆润按钮/明快色块 | theme.css 圆角 12/16/22px、按钮 40px 最小高度；统计卡片三色块（绿/蓝/橙）、步骤序号三色 chip，符合 AGENTS.md 约定 |
| 插画风格统一 | `visual.js` 统一注入 buddy 插画、`.brand-mark`、`.journey` 步骤条；插画 `alt=""`+`aria-hidden` 处理正确 |
| 窄窗口布局 | theme.css 提供 1000px / 760px 两档断点；760px 下侧栏转顶部导航、栅格降单列 |
| 减少动效 | `@media(prefers-reduced-motion:reduce)` 全局禁用 transition |
| 空状态（桌面端） | `#connections:empty::before`、`#activity:empty::before` 提供"暂无…"占位 |
| 错误状态 | `#status[data-state=error]`（红色左边条）、`#notice.error`、`.field-error` 均有明确样式 |
| 弹窗尺寸 | `body.popup{width:620px}` 在 Chrome 弹窗 800px 上限内 |
| 桌面端 CSP | `style-src 'self'` 且无内联样式，合规 |

## 三、不符合项（按严重度排序）

### P0 — 主题完全依赖 JS 注入，基础层是另一套视觉语言

- **位置**：`visual.js:2-3`（`document.body.classList.add(desktop?'desktop-ui':popup?'popup-ui':'options-ui')`）；`options.html:9` 与 `desktop/ui/index.html:10` 的 `<body>` 均无静态 class。
- **问题**：`theme.css` 中所有 `body.desktop-ui …` / `body.options-ui …` 规则（含桌面端浅色侧栏、全部窄窗口媒体查询）只有在 `visual.js` 成功执行后才生效。若脚本失败或被 CSP 拦截，桌面端回退到 `desktop/ui/style.css` 的**深绿侧栏（#183b3b）旧视觉**，与扩展端浅色插画风格完全割裂，且窄窗口布局失效。
- **同时存在 FOUC**：页面先以基础层样式渲染，JS 执行后才换肤，并动态插入 welcome 横幅与步骤条，产生可见跳动。
- **修复建议**：在 `options.html` 与 `desktop/ui/index.html` 的 `<body>` 上直接写死 `class="options-ui"` / `class="desktop-ui"`（JS 注入降级为兜底）；welcome/journey 等装饰性内容若属关键首屏，改为静态 HTML。

### P1 — 设计 token 三套并存、声明值与实际渲染值不一致

- **位置**：`style.css:1`（`--primary:#17695A` 等 24 个 token）；`desktop/ui/style.css:1`（`--text:#203443`、`--bg:#F3F6F7`，缺 `--on-primary` 与间距/圆角 token）；`theme.css:2`（`--primary:#3e6758` 等，因后加载而全部胜出）。
- **问题**：`style.css` 里以 `#17695A` 为核心的整套 token 是**死代码**——实际渲染主色是 theme.css 的 `#3e6758`。若设计契约仍以 `--primary:#17695A` 为准，则线上界面不符合契约；若以 theme.css 为准，则两份基础样式表的 `:root` 应删除以免误导后续开发。桌面端基础层 token 与扩展端也不同源。
- **修复建议**：确立 theme.css 为唯一 token 源（SSOT）；删除 `style.css` 与 `desktop/ui/style.css` 中重复的 `:root` 定义，基础层只保留结构样式；同步更新设计契约文档中的主色值。

### P2 — 硬编码色值绕过 token，破坏可维护性

- **位置与选择器**（部分列举）：
  - `style.css:15` `button.primary:disabled{background:#E3EAE7…}`、`style.css:22` `#agentStatus:not(:empty){background:#EEF4F1…}`、`style.css:30` `.badge{background:#E1EFE9…}`
  - `desktop/ui/style.css:4` `aside{background:#183b3b;color:#d9e9e5}`、`:25` `button{border:1px solid #d4dfdb;color:#254d42}`、`:37` `#notice{background:#edf7ed;color:#22543b}`
  - `desktop/ui/style.css:88` `.profile-nested > input[…]{border:1px solid #d9dfe8;…color:#172033}` —— 蓝灰色系，与全局绿色系不一致，属视觉异味
  - `theme.css` 内部亦有大量字面量（`#e9efdf`、`#f4da86` 等）
- **修复建议**：至少将跨文件复用的色值（表面底色、徽章底色、通知底色）收敛为 token；修正 `desktop/ui/style.css:88` 的 `#d9dfe8/#172033` 为 `--border`/`--text`。

### P3 — 细节不一致与死代码

1. **焦点样式双轨制**：按钮 3px outline（theme.css），输入框 2px（`style.css:17`）；`desktop/ui/style.css:71` 用 `:focus` 而非 `:focus-visible`，鼠标点击输入框也会出现焦点框。建议统一为 `:focus-visible` + 同一线宽。
2. **错误状态两种约定**：`#status[data-state=error]`（属性）vs `#notice.error`（类）。建议统一为 `data-state` 属性约定。
3. **死 class**：`visual.js:3` 注入的 `popup-ui` 在 theme.css 中无任何对应规则（弹窗样式用的是静态的 `body.popup`）。删除或改用它。
4. **死标记**：`popup.html:15` 与 `options.html:16` 的 `<span class="badge">` 被 theme.css `display:none` 隐藏，属冗余 DOM；要么删除元素，要么移除隐藏规则让徽标可见。
5. **内联样式**：`popup.html` 中 `#aiPayload`（`style="white-space:pre-wrap;max-height:240px;overflow:auto"`）与 `#pagePreview`（`style="width:100%;margin-top:16px"`）绕过样式表，建议移入 `style.css`。
6. **触碰目标例外**：`style.css:37` `.result-row button{min-height:32px}` 低于全局 40px 约定，如属有意为之请在注释中说明。
7. **空状态覆盖不全（扩展端）**：`popup.html` 的 `#fields`、`#normalization`、`#webOCRReview` 为空时无任何占位样式（`#summary` 有默认文案，尚可）；桌面端 `#pairingRequests`、`#pairedBrowsers` 亦无 `:empty` 占位。建议补齐。
8. **基础层圆角体系不统一**：`desktop/ui/style.css` 使用 7/8/12px 字面量，theme.css 为 12/16/22px；虽然 theme.css 最终覆盖按钮/卡片，但 textarea（`:31` radius 7px）等组件在 theme.css 只覆盖到 11px，存在三档圆角并存。建议统一引用 `--r-*` token。

## 四、扩展与桌面端视觉语言一致性评估

- **一致的部分**：主色、圆角、字体栈、按钮体系、插画资源、badge/eyebrow 组件均来自同一 theme.css，运行时视觉语言统一。
- **不一致的风险点**：桌面端"基础层"（无 JS 时）是深色侧栏旧设计（`desktop/ui/style.css:4-11`），与扩展端基础层浅色设计不同源——这正是 P0 的具体表现。修复 P0 后两端即可在任何渲染路径下保持一致。

## 五、修复优先级清单

| 优先级 | 动作 | 涉及文件 |
|---|---|---|
| P0 | body 主题 class 静态化 | options.html、desktop/ui/index.html |
| P1 | token 单源化，删除死 token，更新设计契约主色 | style.css、desktop/ui/style.css、theme.css |
| P2 | 硬编码色值收敛；修正 `.profile-nested` 蓝灰色系 | desktop/ui/style.css:88 等 |
| P3 | 焦点/错误约定统一、死代码清理、空状态补齐 | 各文件 |

---

*报告生成方式：静态审查 + WCAG 对比度脚本计算；未做浏览器实机截图验收，建议修复 P0/P1 后在 1280×800 与 700×900 两种窗口下人工复核一次实际渲染。*
