# ResumeFill 目录重组方案 + UX 优化清单

> 蓝图文档（只出方案，未移动任何文件、未改任何业务代码）。基于 main 分支当前工作区逐项核对：`manifest.json`、`package.json`、`scripts/runtime-files.cjs`、`scripts/test.cjs`、`scripts/check-runtime.cjs`、`desktop/prepare.cjs`、`local-server/*.cjs`、30 个根目录 `*-test.cjs` 的引用方式均已实际读取确认。

---

## 1. 现状信息架构与模块边界

扩展有 4 个运行上下文，共享一套"纯逻辑核心"：

| 上下文 | 入口 | 组成 |
| --- | --- | --- |
| Background Service Worker | `background.js` | `importScripts()` 链：agent-recovery / metrics / ai-calibration / profile / matcher / option-match / answers / ai / page-bridge / agent-bridge / desktop-bridge / web-ocr-match / web-ocr-bridge |
| Content（页面注入） | 由 `popup.js` 通过 `chrome.scripting.executeScript` 注入 | `profile.js, matcher.js, layout.js, adapters.js, controls.js, content.js, inline.js`（扩展根相对路径） |
| Popup | `popup.html` + `popup.js` | 核心模块 + UI 共享模块（visual / field-labels / profile-sync / profile-sync-ui / desktop-connect / page-bridge） |
| Options | `options.html` + `options.js` | 核心模块 + profile-editor / structured-fields / 共享 UI 模块；运行时 `fetch('sample.json')`、`fetch('data/regions.json')`、`fetch('sample-adapters.json')` |

- **纯逻辑核心**（同时被 Node 测试、`local-server/`、`desktop/` require）：`matcher.js`、`option-match.js`、`profile.js`、`answers.js`、`adapters.js`、`ai.js`、`learning.js`、`metrics.js`、`agent-recovery.js`、`ai-calibration.js`。
- **共享 UI 模块**（popup/options/desktop-ui 三方复用）：`visual.js`、`field-labels.js`、`structured-fields.js`、`profile-editor.js/.css`、`profile-sync.js`、`profile-sync-ui.js`、`desktop-connect.js`。
- **已结构化的部分**（保持不动）：`desktop/`（完整 Electron 应用）、`local-server/`、`scripts/`、`docs/wiki|releases|reviews|images|site-profiles`、`icons/`、`data/`。
- **平铺在根目录的部分**：上述全部运行时文件 + 30 个 `*-test.cjs` + `demo*.html/js` + `sample*.json` + `FEATURES-0.2~0.8.md` ×9 + `reviews/2026-10-22|23`。

### 关键既有约束（方案必须遵守）

1. 仓库根目录即"解包加载的扩展根"（README 本地开发流程），`manifest.json` 必须留在根，且 `scripts/check-version.cjs` 从根读它。
2. `scripts/runtime-files.cjs` 是打包扩展的唯一允许清单（43 项），8 个浏览器测试与 `scripts/verify-ai-browser.cjs` 用它搭建扩展 fixture；`scripts/check-runtime.cjs` 会**逐一核对清单内每个 HTML/JS 实际引用到的相对路径文件都在清单内**——任何引用路径写错都会被它直接抓获。
3. `scripts/check-public-package.cjs` 钉住了 `icons/*` 与 `docs/images/*` 的路径+哈希，且强制 `LICENSE`、`THIRD_PARTY_NOTICES.md` 留在根——这些路径不能动。
4. `scripts/test.cjs` 的测试清单是显式文件列表，`package.json` 的 `format:check` 写死了 `popup.js content.js controls.js` 三个文件名。
5. `.github/workflows/*`、`.githooks/pre-commit` 只调 npm script 名——**npm script 名保持不变即可零改动**。

---

## 2. 目标目录结构

```
resume-fill/
├── manifest.json              # 留根：扩展入口 + check-version
├── package.json / package-lock.json
├── README.md / CHANGELOG.md / AGENTS.md
├── LICENSE / THIRD_PARTY_NOTICES.md / PRIVACY-REVIEW.md / COMPETITOR-RESEARCH.md
├── buddy.svg                  # 留根：README、popup、desktop-ui 三方引用的品牌资产
├── icons/  data/              # 不动（manifest 路径、扫描器钉住、运行时 fetch data/regions.json）
├── src/
│   ├── background/  # Service Worker 与桥：background.js, agent-bridge.js, page-bridge.js,
│   │                #   desktop-bridge.js, web-ocr-bridge.js, web-ocr-match.js
│   ├── content/     # 页面上下文：content.js, inline.js, controls.js, layout.js
│   ├── core/        # 纯逻辑（Node 可 require）：matcher.js, option-match.js, profile.js,
│   │                #   answers.js, adapters.js, ai.js, learning.js, metrics.js,
│   │                #   agent-recovery.js, ai-calibration.js
│   ├── popup/       # popup.html, popup.js
│   ├── options/     # options.html, options.js
│   ├── ui/          # popup/options/desktop-ui 共享：visual.js, field-labels.js,
│   │                #   structured-fields.js, profile-editor.js, profile-editor.css,
│   │                #   profile-sync.js, profile-sync-ui.js, desktop-connect.js
│   ├── styles/      # style.css, theme.css
│   └── demo/        # sample.json, sample-adapters.json（仍被打包，options.js 运行时 fetch）
├── tests/
│   ├── *.cjs        # 根目录全部 30 个 *-test.cjs
│   └── fixtures/    # demo.html, demo-advanced.html, demo-advanced.js（不在打包清单内，纯测试夹具）
├── docs/
│   ├── features/    # FEATURES-0.2.md … FEATURES-0.8.md（9 个）
│   ├── reviews/     # 并入 reviews/2026-10-22/*（7 个）、reviews/2026-10-23/*（2 个），
│   │                #   与现有 2 个文件无重名冲突
│   └── wiki/ releases/ images/ site-profiles/   # 不动
├── local-server/    # 目录不动，仅内部 require 路径更新
├── desktop/         # 目录不动，仅 statistics/pdf-test/web-ocr-test/prepare 的源路径更新
├── scripts/         # 目录不动，仅 runtime-files/test/verify-ai-browser 路径更新
└── dist/ tmp/       # 不动（gitignored）
```

**边界设计理由**：
- `core/` 与 UI/页面上下文分离——它是唯一被 Node 侧（测试、local-server、desktop）require 的层，迁移后 `desktop/statistics.cjs` 等的 require 目标全部收敛为 `../src/core/*`，依赖方向单向。
- `ui/` 与 `desktop/prepare.cjs` 拷入 `desktop/ui` 的文件集合完全重合（visual/field-labels/profile-editor/structured-fields），分组与桌面侧消费方式对齐。
- `page-bridge.js` 同时被 background importScripts 和 popup.html 加载，归入 `background/`（popup 以 `../background/page-bridge.js` 引用），不为单一文件增设目录。
- `buddy.svg` 留根：README 首行 `<img src="buddy.svg">`、`popup.html`、`desktop/prepare.cjs` 三处引用，移动收益低、churn 大。
- `manifest.json` 留根：保留"加载仓库根即扩展"的开发流，`check-version.cjs`、`check-release.cjs` 零改动。

---

## 3. 文件级映射表

### 3.1 移动（58 个跟踪文件）

| 现有路径 | 目标路径 |
| --- | --- |
| `background.js` | `src/background/background.js` |
| `agent-bridge.js` | `src/background/agent-bridge.js` |
| `page-bridge.js` | `src/background/page-bridge.js` |
| `desktop-bridge.js` | `src/background/desktop-bridge.js` |
| `web-ocr-bridge.js` | `src/background/web-ocr-bridge.js` |
| `web-ocr-match.js` | `src/background/web-ocr-match.js` |
| `content.js` | `src/content/content.js` |
| `inline.js` | `src/content/inline.js` |
| `controls.js` | `src/content/controls.js` |
| `layout.js` | `src/content/layout.js` |
| `matcher.js` | `src/core/matcher.js` |
| `option-match.js` | `src/core/option-match.js` |
| `profile.js` | `src/core/profile.js` |
| `answers.js` | `src/core/answers.js` |
| `adapters.js` | `src/core/adapters.js` |
| `ai.js` | `src/core/ai.js` |
| `learning.js` | `src/core/learning.js` |
| `metrics.js` | `src/core/metrics.js` |
| `agent-recovery.js` | `src/core/agent-recovery.js` |
| `ai-calibration.js` | `src/core/ai-calibration.js` |
| `popup.html` | `src/popup/popup.html` |
| `popup.js` | `src/popup/popup.js` |
| `options.html` | `src/options/options.html` |
| `options.js` | `src/options/options.js` |
| `visual.js` | `src/ui/visual.js` |
| `field-labels.js` | `src/ui/field-labels.js` |
| `structured-fields.js` | `src/ui/structured-fields.js` |
| `profile-editor.js` | `src/ui/profile-editor.js` |
| `profile-editor.css` | `src/ui/profile-editor.css` |
| `profile-sync.js` | `src/ui/profile-sync.js` |
| `profile-sync-ui.js` | `src/ui/profile-sync-ui.js` |
| `desktop-connect.js` | `src/ui/desktop-connect.js` |
| `style.css` | `src/styles/style.css` |
| `theme.css` | `src/styles/theme.css` |
| `sample.json` | `src/demo/sample.json` |
| `sample-adapters.json` | `src/demo/sample-adapters.json` |
| `demo.html` | `tests/fixtures/demo.html` |
| `demo-advanced.html` | `tests/fixtures/demo-advanced.html` |
| `demo-advanced.js` | `tests/fixtures/demo-advanced.js` |
| 30 个 `*-test.cjs`（agent-failure-browser / agent-recovery-browser / agent-recovery / ai / architecture-doc / architecture-extension / architecture / browser / calibration / content / controls-browser / controls-v06 / controls / extension / family-browser / iframe-browser / learning-browser / learning / local-ai-agent / matcher / metrics / option-match / options-smoke / page-target / popup / privacy-scanner / privacy / profile-sync / profile / review-browser / review-regression / review-visual / runtime-version-browser / ui-parity-browser） | `tests/*.cjs`（文件名不变） |
| `FEATURES-0.2.md` … `FEATURES-0.8.md`（9 个） | `docs/features/` |
| `reviews/2026-10-22/*`（ai-review / code-review / cpo-product-review / cto-technical-review / README / ui-visual-audit / ux-review，共 7 个） | `docs/reviews/2026-10-22/*` |
| `reviews/2026-10-23/*`（brand-creative-review / cpo-product-review，共 2 个） | `docs/reviews/2026-10-23/*`（随后删除空目录 `reviews/`） |

### 3.2 不动

`manifest.json`、`package.json`、`package-lock.json`、`README.md`、`CHANGELOG.md`、`AGENTS.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`PRIVACY-REVIEW.md`、`COMPETITOR-RESEARCH.md`（README 页脚以纯文本提及，无相对链接）、`buddy.svg`、`icons/`、`data/`、`docs/wiki|releases|images|site-profiles` 及 `docs/reviews/` 现有 2 个文件、`desktop/`、`local-server/`、`scripts/`、`.githooks/`、`.github/`、`.gitignore`。

### 3.3 未跟踪文件（不动，仅提示）

- `resume.json`、`resume-review.png`（个人数据，`.gitignore` 已覆盖，继续留根）。
- `scripts/extract-job-posts.cjs`、`scripts/extract-website-info.cjs`（个人采集脚本）：建议先按 AGENTS.md 隐私约定审查，再决定纳入跟踪或保持本地。

---

## 4. 引用更新清单（精确到文件与写法）

### 4.1 扩展运行时（仅改路径字符串，零逻辑改动）

**`manifest.json`**（icons 不动）：
- `background.service_worker` → `"src/background/background.js"`
- `action.default_popup` → `"src/popup/popup.html"`
- `options_page` → `"src/options/options.html"`

**`src/background/background.js`**（importScripts 相对 worker 自身 URL 解析）：
```js
importScripts('../core/agent-recovery.js','../core/metrics.js','../core/ai-calibration.js',
  '../core/profile.js','../core/matcher.js','../core/option-match.js','../core/answers.js',
  '../core/ai.js','page-bridge.js','agent-bridge.js','desktop-bridge.js',
  'web-ocr-match.js','web-ocr-bridge.js');
```

**`src/popup/popup.js`**（`chrome.scripting.executeScript` 的 files 是**扩展根相对**路径，不是 popup 目录相对）：
```js
files: ["src/core/profile.js","src/core/matcher.js","src/content/layout.js",
  "src/core/adapters.js","src/content/controls.js","src/content/content.js","src/content/inline.js"]
```

**`src/popup/popup.html`**：
- `style.css` → `../styles/style.css`；`theme.css` → `../styles/theme.css`；`buddy.svg` → `../../buddy.svg`
- scripts：`metrics.js`→`../core/metrics.js`，`ai-calibration.js`→`../core/ai-calibration.js`，`matcher.js`→`../core/matcher.js`，`profile.js`→`../core/profile.js`，`adapters.js`→`../core/adapters.js`，`answers.js`→`../core/answers.js`，`learning.js`→`../core/learning.js`，`ai.js`→`../core/ai.js`，`agent-recovery.js`→`../core/agent-recovery.js`，`field-labels.js`→`../ui/field-labels.js`，`page-bridge.js`→`../background/page-bridge.js`，`visual.js`→`../ui/visual.js`，`popup.js` 不变，`profile-sync.js`→`../ui/profile-sync.js`，`profile-sync-ui.js`→`../ui/profile-sync-ui.js`，`desktop-connect.js`→`../ui/desktop-connect.js`

**`src/options/options.html`**：
- `style.css` → `../styles/style.css`；`profile-editor.css` → `../ui/profile-editor.css`；`theme.css` → `../styles/theme.css`
- scripts：`metrics.js`→`../core/metrics.js`，`matcher.js`→`../core/matcher.js`，`profile.js`→`../core/profile.js`，`adapters.js`→`../core/adapters.js`，`ai.js`→`../core/ai.js`，`visual.js`→`../ui/visual.js`，`field-labels.js`（两处）→`../ui/field-labels.js`，`structured-fields.js`→`../ui/structured-fields.js`，`profile-editor.js`→`../ui/profile-editor.js`，`options.js` 不变，`profile-sync.js`→`../ui/profile-sync.js`，`profile-sync-ui.js`→`../ui/profile-sync-ui.js`，`desktop-connect.js`→`../ui/desktop-connect.js`

**`src/options/options.js`**（fetch 相对页面 URL 解析）：
- `fetch('sample.json')` → `fetch('../demo/sample.json')`
- `fetch('data/regions.json')` → `fetch('../../data/regions.json')`
- `fetch('sample-adapters.json')` → `fetch('../demo/sample-adapters.json')`

**`tests/fixtures/demo.html` / `demo-advanced.html`**：
- `style.css` → `../../src/styles/style.css`（磁盘打开有效；测试 HTTP 服务按 4.4 规则从仓库根映射后同样解析为 `/src/styles/style.css`）

**`scripts/runtime-files.cjs`**（打包允许清单，43 项整体替换为）：
```
src/core/agent-recovery.js, src/ui/profile-editor.js, src/ui/structured-fields.js,
src/ui/profile-editor.css, src/core/metrics.js, src/core/ai-calibration.js,
manifest.json, src/background/background.js, src/background/agent-bridge.js,
src/background/page-bridge.js, src/background/desktop-bridge.js,
src/ui/desktop-connect.js, src/ui/profile-sync.js, src/ui/profile-sync-ui.js,
src/background/web-ocr-bridge.js, src/background/web-ocr-match.js,
src/core/profile.js, src/core/matcher.js, src/core/option-match.js,
src/core/learning.js, src/core/ai.js, src/core/answers.js, src/ui/field-labels.js,
src/popup/popup.html, src/popup/popup.js, src/options/options.html, src/options/options.js,
src/styles/style.css, src/styles/theme.css, src/ui/visual.js, buddy.svg,
src/content/content.js, src/content/controls.js, src/core/adapters.js,
src/content/layout.js, src/content/inline.js, src/demo/sample.json, src/demo/sample-adapters.json,
LICENSE, THIRD_PARTY_NOTICES.md, icons/…（icons 各行保持原样）
```

### 4.2 构建/脚本工具

- **`package.json`**：仅 `format:check` → `"prettier --check src/popup/popup.js src/content/content.js src/content/controls.js"`；其余 script 名与命令不变（`test:desktop`、`test:electron`、`check-version`、`check-runtime`、`release` 等均零改动，CI 与 pre-commit 钩子因此零改动）。
- **`scripts/test.cjs`**：`quick`/`browser` 清单中 30 个文件名加 `tests/` 前缀；`local-server` 段不变。
- **`scripts/verify-ai-browser.cjs:20`**：`require('../ai.js')` → `require('../src/core/ai.js')`（其 fixture 构建走 `runtime-files.cjs`，自动跟随）。
- **无需改动**：`check-version.cjs`（根 manifest）、`check-release.cjs`（根 CHANGELOG/PRIVACY-REVIEW）、`check-public-package.cjs`（icons/docs-images 钉住路径不变）、`check-runtime.cjs`（对打包产物做通用相对解析，天然兼容新结构——它是迁移后最有力的验证器）、`build-icons.cjs`、`.githooks/pre-commit`、`.github/workflows/*`。

### 4.3 desktop/ 与 local-server/

- **`desktop/prepare.cjs`**：源路径改（目标侧不变）：
  - copyFiles → `['src/core/matcher.js','src/ui/field-labels.js','src/core/ai.js','src/core/agent-recovery.js','src/core/option-match.js','src/core/answers.js','src/core/metrics.js']`
  - copyUi → `['src/core/matcher.js','src/ui/field-labels.js','src/styles/theme.css','src/ui/visual.js','buddy.svg','src/ui/profile-editor.js','src/ui/structured-fields.js','src/ui/profile-editor.css','src/core/metrics.js']`
- **`desktop/statistics.cjs`**：`require('../metrics.js')` → `require('../src/core/metrics.js')`
- **`desktop/pdf-test.cjs`**：`require('../matcher.js')` → `require('../src/core/matcher.js')`
- **`desktop/web-ocr-test.cjs`**：`require('../web-ocr-match.js')` → `require('../src/background/web-ocr-match.js')`
- **`local-server/agent.cjs`**：`../ai.js`→`../src/core/ai.js`，`../matcher.js`→`../src/core/matcher.js`，`../agent-recovery.js`→`../src/core/agent-recovery.js`
- **`local-server/server.cjs`**：`../ai.js`、`../matcher.js`、`../option-match.js`、`../agent-recovery.js` → `../src/core/*`（`../package.json` 不变）
- **`local-server/test.cjs`**：`../option-match.js` → `../src/core/option-match.js`

### 4.4 tests/（30 个文件，机械规则 + 逐文件备注）

统一规则（可用一个 codemod 脚本批量执行）：

- **T1 路径前缀**：`require('./X.js')` → `require('../src/<组>/X.js')`；`require('./local-server/…')`→`require('../local-server/…')`；`require('./desktop/…')`→`require('../desktop/…')`；`require('./scripts/…')`→`require('../scripts/…')`；`fs.readFileSync(path.join(__dirname,'sample.json'))` 等 → 指向 `../src/demo/`；`architecture-doc-test.cjs` 的 `repo=path.join(__dirname)` → `path.join(__dirname,'..')`。
  - 文件名→新路径映射（codemod 表）：core 组 10 个（matcher/option-match/profile/answers/adapters/ai/learning/metrics/agent-recovery/ai-calibration）；content 组 4 个；background 组 6 个；ui 组 8 个；`popup.js→src/popup/`、`options.js→src/options/`、`style.css→src/styles/`、`theme.css→src/styles/`、`sample*.json→src/demo/`。
- **T2 fixture 构建换允许清单**（7 个文件）：`agent-failure-browser-test.cjs:7-8`、`extension-test.cjs:6-8`、`family-browser-test.cjs:2-3`、`iframe-browser-test.cjs:6-7`、`learning-browser-test.cjs:5-6`、`page-target-test.cjs:5-6`、`runtime-version-browser-test.cjs:2`——把 `fs.readdirSync(__dirname).filter(试探)` 改为 `require('../scripts/runtime-files.cjs')` + `path.join(repoRoot,file)` 复制（与 `agent-recovery-browser-test.cjs:19` 现有写法一致）。**注意**：若不改，移动后 `__dirname` 变成 tests/，fixture 会缺 background 而测试直接失败——属于"响亮的失败"，不会静默放过。
- **T3 已用允许清单**（2 个文件）：`agent-recovery-browser-test.cjs:19`、`architecture-extension-test.cjs:5-6`——只改 require 前缀与 join 根。
- **T4 HTTP 夹具服务器**：`browser-test.cjs:6-8`、`extension-test.cjs:16`（及 `page-target-test.cjs` 内的 server）——把"白名单文件名 → `__dirname` 同名文件"改为"URL 路径 = 仓库相对路径，从 repoRoot 提供，目录白名单 `src/`,`tests/fixtures/`,`data/`,`icons/` + 防穿越检查"（参照 `review-visual-test.cjs:2` 的写法）。各测试内 `addScriptTag({path:path.join(__dirname,f)})` 统一改为 `path.join(repoRoot, SRC[f])`。
- **逐文件备注**：
  - `browser-test.cjs`：另需 `require('./matcher.js')`→`../src/core/matcher.js`、`sample-adapters.json` 读路径、`scripts=[...]` 五个注入文件走 SRC 映射。
  - `popup-test.cjs:15-16`：`sample.json`、`manifest.json`、`popup.html` 目前是 cwd 相对读取，建议一并改为 repoRoot 拼接（`tests/fixtures` 不影响）。
  - `review-browser-test.cjs:3`：`path.resolve(script)` cwd 相对，脚本名改为 `src/…` 新路径即可。
  - `review-regression-test.cjs`：`./desktop/*`、`./scripts/*`、`./ai.js` 等 → `../desktop/*`、`../scripts/*`、`../src/core/*`。
  - `architecture-doc-test.cjs:8-9`：repo 根修正 + 检查清单内文件名核对。
  - `review-visual-test.cjs`、`privacy-scanner-test.cjs`：**零改动**（只服务 desktop/ui 与临时 fixture）。
  - `local-ai-agent-test.cjs`、`ui-parity-browser-test.cjs`：本次勘察未展开，迁移时按 T1/T4 规则过一遍 grep 确认。
  - `agent-failure-browser-test.cjs:13` 现为 `require('../local-server/server.cjs')`（根目录下指向仓库外，疑似既有笔误）——移入 tests/ 后该写法恰好解析正确，顺带修复。
- **可选但推荐**：新增 `tests/helpers.cjs`，导出 `repoRoot`、`SRC` 映射、`buildExtensionFixture(tmpDir)`（允许清单复制 + manifest 改写）、`serveRepo()`——收敛约 20 处重复片段，后续维护成本显著下降。纯测试基建，不触碰业务代码。

### 4.5 文档

- `README.md`：根加载流程不变、`buddy.svg` 不变 → 零必需改动；可选在"本地开发"补充一行新目录说明。
- `FEATURES-*.md` 移入 `docs/features/` 后：全库 grep `FEATURES-` 仅命中 `architecture-doc-test.cjs`（同步更新）与 README 纯文本提及（无链接，无需改）。
- `reviews/` 并入 `docs/reviews/`：无代码引用，安全。
- 建议在 `AGENTS.md` 增补一节"仓库结构约定"，固化 `src/{background,content,core,popup,options,ui,styles,demo}` 的边界规则。

---

## 5. 迁移步骤（每步可独立验证、可回滚）

**Commit 1 — 文档归位（零代码风险）**
1. `git mv FEATURES-*.md docs/features/`；`git mv reviews/2026-10-22 docs/reviews/`；`git mv reviews/2026-10-23 docs/reviews/`；删除空 `reviews/`。
2. 更新 `architecture-doc-test.cjs` 中 FEATURES 检查路径。
3. 验证：`node scripts/test.cjs`（或至少 `node tests/architecture-doc-test.cjs`）→ 提交。

**Commit 2 — src + tests 原子迁移（核心变更，单次提交避免半绿状态）**
> src 与 tests 必须同提交：测试引用 src 路径、src 的测试夹具又由测试构建，分开提交必有一侧红。
4. `git mv` 建立 `src/{background,content,core,popup,options,ui,styles,demo}` 并移入 §3.1 文件。
5. 按 §4.1 更新 `manifest.json`、`background.js`、`popup.js`、`popup.html`、`options.html`、`options.js`。
6. 按 §4.1 整体替换 `scripts/runtime-files.cjs` 清单。
7. 冒烟验证 A：`node scripts/check-version.cjs`；临时用 Node 模拟 `check-runtime.cjs` 对仓库根跑一次（或先跳过，待步骤 10 统一跑）。
8. `git mv` 30 个测试入 `tests/`、demo 三件入 `tests/fixtures/`；跑 codemod 完成 T1–T4；更新 `scripts/test.cjs` 清单与 `package.json format:check`。
9. 按 §4.3 更新 `desktop/`、`local-server/`、`scripts/verify-ai-browser.cjs`。
10. 全量验证（按下序，任一失败即修）：
    - `npm test`（quick 层：Node + 无扩展浏览器用例）
    - `npm run test:browser`（扩展真实加载：manifest 路径、importScripts、executeScript、options fetch 全部经真实 Chromium 验证）
    - `npm run test:runtime`（`check-runtime.cjs` 核对打包清单与相互引用闭合）
    - `npm run test:desktop`（prepare.cjs 拷贝 + statistics/pdf/web-ocr 用例）
    - `npm run test:electron`（桌面端完整打包链路，重量级，提交前跑）
    - 手动：Edge/Chrome 以仓库根"加载解包扩展"→ popup 打开渲染正常 → options 打开 → 导入 sample 简历 → 在 `tests/fixtures/demo-advanced.html`（或本地 HTTP 服务）完成一次 扫描→核对→填写。
11. 提交；按 AGENTS.md 完成隐私检查（本变更不涉及个人数据，例行确认即可）。

**Commit 3（可选）— 测试基建收敛**
12. 抽 `tests/helpers.cjs`，替换重复片段；`npm test && npm run test:browser` 回归。

---

## 6. 风险点与对策

| 风险 | 说明 | 对策 |
| --- | --- | --- |
| importScripts 相对解析 | MV3 worker 中相对 worker URL 解析，写错即启动失败 | `architecture-extension-test` / `verify-ai-browser.cjs` 真实加载验证；手动加载解包扩展 |
| executeScript 路径基准 | 是扩展根相对而非 popup 目录相对，最易写错 | §4.1 已给出正确写法；`browser-test`/`extension-test` 真实注入验证 |
| options.js fetch 基准 | 相对 `src/options/options.html` 的页面 URL，需两级 `../..` 到 `data/` | `options-smoke-test` + 手动 options 导入 sample 验证 |
| fixture 服务器 404 | demo 页 CSS/JS 经 HTTP 提供，路径映射错会静默裸奔 | T4 统一"URL=仓库相对路径"规则 + `test:browser` 全绿 |
| prepare.cjs 漏文件 | 桌面端运行缺文件 | `test:desktop`/`test:electron` 覆盖；源清单已逐项列出 |
| Git 重命名识别 | 大批量移动影响 blame | 全部用 `git mv`；Git 按内容相似度识别 rename，单文件未改内容可 100% 匹配 |
| 半迁移状态合并冲突 | 迁移期间他人在旧路径上改代码 | 迁移窗口内冻结其他改动；Commit 2 一次性完成并立即全量回归 |

---

## 7. UX 优化建议清单（按优先级）

> 约束基线（AGENTS.md）：趣味简洁的插画风格、圆润按钮/明快色块/清爽排版；弹窗、设置页、桌面端共享视觉资源与设计变量；突出"扫描→核对→填写"主操作；每次改动后核对实际渲染、对比度、键盘焦点与窄窗口布局。

### P0 — 主流程与状态可见性

1. **主流程三步进度指示**：popup 顶部的"扫描→核对→填写"步骤条（当前步骤高亮、已完成打勾），让用户始终知道自己身处流程哪一环。现状只有按钮与状态行。涉及：`src/popup/popup.html`、`src/popup/popup.js`、`src/styles/style.css`。
2. **空状态与首用引导**：未扫描页面、扫描无字段、资料库为空三种空态，各配一幅 buddy 插画 + 一句引导文案 + 主操作（去设置页导入简历/查看示例）。涉及：`popup.html`、`popup.js`、`src/ui/visual.js`、`style.css`、`src/options/options.js`（资料为空判定）。
3. **填写结果的可读汇总**：`unconfirmed/stale/verified` 按状态分组计数 + 失败项前置 + "重试未确认项"入口，替代逐条文本流。涉及：`popup.js`（fill 结果渲染段）、`style.css`。
4. **错误与异常通道**：扫描失败、页面不支持的适配器缺失、AI 未配置/网关未连接，分别给出明确文案与下一步动作（打开设置/启动桌面端）。涉及：`popup.js`、`src/ui/desktop-connect.js`、`src/options/options.js`。

### P1 — 主题体系与设置/资料体验

5. **亮/暗/跟随系统三态主题**：`theme.css` 已存在（需先盘点其变量覆盖度），补齐三态切换组件（popup 与 options 头部各一），CSS 变量语义化（`--bg-primary/--text-primary/--border-color`…），`localStorage` 记忆 + `prefers-color-scheme` 跟随。涉及：`src/styles/theme.css`、`src/styles/style.css`、`popup.html`、`options.html`、新增 `src/ui/theme-manager.js`（注意加入 `runtime-files.cjs` 与 `prepare.cjs` copyUi）。
6. **设计 Token 统一**：色板/间距阶梯/字号阶梯抽为 `:root` 变量并桌面端共享（AGENTS.md 明确要求共享设计变量），消灭散落色值。涉及：`style.css`、`theme.css`、`profile-editor.css`、`desktop/ui/index.html`。
7. **Options 设置页信息架构**：按"个人资料 / AI 设置 / 站点适配器 / 数据与隐私"分区或分 Tab，AI 状态（enabled/endpoint/key 来源）在页面顶部一眼可见。涉及：`src/options/options.html`、`options.js`、`style.css`。
8. **Profile 编辑器打磨**：教育/项目等重复卡片的添加、删除、拖拽排序、必填项即时校验与错误定位滚动；保存前脏状态提示。涉及：`src/ui/profile-editor.js`、`profile-editor.css`、`src/ui/structured-fields.js`。
9. **填写覆盖保护**：`overwrite` 开关配说明文案，开启时二次确认；`saveCards` 等高级选项折叠进"高级"区。涉及：`popup.html`、`popup.js`。

### P2 — 反馈打磨与无障碍

10. **加载与进度反馈**：扫描/填写/AI 请求中的按钮 loading 态、进度计数（x/y 字段已验证）、可取消。涉及：`popup.html`、`popup.js`、`style.css`。
11. **键盘导航与焦点可见性**：popup/options 全链路 Tab 顺序与 3px 焦点环（desktop 已有 `review-visual-test.cjs` 断言焦点 outline，思路平移到扩展侧并加回归断言）。涉及：`style.css`、`theme.css`、测试 `tests/review-visual-test.cjs`（扩展版新增）。
12. **窄窗口适配**：popup 典型 360–400px 宽度下无横向溢出、按钮不折行错位；options 页 700px 断点。涉及：`style.css`、`profile-editor.css`；可复用 review-visual 的溢出断言。
13. **ARIA 与对比度**：步骤条/开关用 `role` 与 `aria-checked`，表单 label 关联，文本对比度 ≥ WCAG 2.1 AA。涉及：`popup.html`、`options.html`、`theme.css`。
14. **成功反馈**：填写完成后的摘要卡（verified x/y、保存指示器状态）+ 轻量动效，与插画风一致。涉及：`popup.js`、`visual.js`、`style.css`。

### 建议实施顺序

P0-1/2/3（主流程感知）→ P1-5/6（主题与 Token，趁目录迁移后样式文件归位一起做）→ P0-4 + P1-7/8/9 → P2 打磨。每条落地后按 AGENTS.md 做渲染、对比度、键盘焦点、窄窗口四项人工核对，并随版本提交。
