# 技术评估报告 — 首席技术官（CTO）

## 0. 事实核对（先说清楚我审的是什么版本）

任务描述是 v0.18.0，但工作区实际是 **0.24.1**（package.json、manifest.json、desktop/package.json 三方对齐，由 scripts/check-version.cjs 强制；git 最新 tag 为 v0.23.0，HEAD 领先 6 个提交）。另外两处描述与实际有出入，顺带纠正：

- `local-server/` 在**仓库根目录**，不在 `desktop/` 下；desktop/prepare.cjs 打包时把 `server.cjs`/`agent.cjs` 复制进 `desktop/resources/local-server/`。
- 测试分组实际为 **10 组 Node 测试 + 19 组浏览器测试**（scripts/test.cjs），另有 desktop 6 组单元/状态机测试 + 3 组集成测试 + 4 组 Electron UI 测试，不是 7+8。

以下评估基于 0.24.1 实际代码。

---

## 1. 总体结论

**这是一个工程质量显著高于其规模预期的项目。** 安全与隐私纪律（最小权限、凭据加密、隐私扫描门禁）接近商业产品水准；测试体系分层完整且有真实浏览器集成测试；零构建工具链的选型与单人/小团队、双运行时（MV3 扩展 + Electron）的约束匹配。主要风险集中在三处：**共享文件手工清单的漂移隐患、源码的高密度书写风格带来的可维护性债、未签名的自动更新通道**。

---

## 2. 架构分层与共享模块机制

**设计本身：合理，且是约束下的正确选择。** 共享模块（matcher.js / ai.js / answers.js / field-labels.js / option-match.js）采用 UMD 式双导出（`root.ResumeX` 全局 + `require` 回退），同一份代码同时服务于：MV3 service worker（importScripts）、扩展页面（script 标签）、桌面渲染进程、Node 测试、以及桌面网关进程。没有引入 bundler/transpiler，依赖面极小（根 devDependencies 只有 playwright）。对一个需要"改一处、四端生效"的项目，这比上构建链划算。

**但复制机制是全仓库最脆弱的一环。** desktop/prepare.cjs:7 维护一份**手工硬编码的 33 文件白名单**。CHANGELOG 自己已经记录过一次教训（field-labels.js 漏进发布清单的备注）。问题在于：

- 漏加 → 打包产物静默缺文件，开发态正常、用户态崩溃；
- 多加 → 隐私白名单被稀释，而白名单本身就是隐私防线（PRIVACY-REVIEW.md 明确依赖它）；
- **目前没有任何测试断言白名单完整性**——没有一个检查"manifest.json / popup.html / options.html / importScripts 引用的每个文件都在清单里"的关卡。

**另一个漂移点**：local-server/server.cjs:4 硬编码 `VERSION='0.16.0'` 兜底。桌面嵌入路径由 controller 传入真实版本覆盖了它，但独立运行模式（setup.cjs/start.ps1）会以落后 8 个小版本的号上报——而 0.24.x 刚加的"页面脚本版本核对"功能恰恰依赖准确的版本信号做诊断。check-version.cjs 没覆盖这个常量。

**附带一个待决问题**：网关现在有两条生命——桌面内嵌（主路径）和根目录独立运行模式。如果独立模式已是遗产，应明确弃用，否则每条安全修复都要验证两遍。

---

## 3. Electron 主进程与 loopback 网关

这部分是全书最好的章节，逐条说：

**主进程（desktop/main.cjs）**：单实例锁、渲染进程 `sandbox:true + contextIsolation:true + nodeIntegration:false`、`will-navigate` 全拦、`setWindowOpenHandler` 全拒、UI 自带严格 CSP（desktop/ui/index.html，`connect-src 'none'`）、**每个 IPC handler 校验 `event.sender` 与 `mainFrame` 来源**、preload 只暴露白名单方法。这套配置把 Electron 常见的 RCE 面基本关完了。

**凭据管理（desktop/controller.cjs）**：token/apiKey 用 `safeStorage` 加密落盘（`_seal`/`_open`），配置文件原子写（tmp+rename、0600），解密失败进入**只读凭据恢复态**——备份锁定配置、重建凭据、撤销旧配对，绝不覆盖原文件。这是正确处理。

**loopback 网关（local-server/server.cjs）** 的纵深防御做得罕见地细：

- 只绑 127.0.0.1 + Host 头白名单（防 DNS rebinding）；
- Origin 必须是合法 `chrome-extension://` 形态，可配扩展 ID 白名单；**敏感端点强制要求 Origin 头**（挡住本机其他进程裸 curl）；
- Bearer token ≥32 字节 + `timingSafeEqual`；配对码一次性、10 分钟过期、失败 5 次/分钟限流；自动配对派发的是 **HMAC 派生的按 origin+clientId 隔离的会话 token**（desktop/pairing.cjs:19），撤销粒度正确；
- body 上限、并发上限 4（429）、请求超时、429/502/503/504 单次重试、缓存 TTL+条数双控且参数范围校验；
- 不记请求体日志，错误信息对外脱敏（`/上游/` 以外的错误统一泛化）。

**剩余瑕疵（均非阻断）**：端口冲突只自动 +1 且仅限 17322/17323 两档，第三次冲突直接失败（controller.cjs:15）；配对码经剪贴板传递（`copyPairing`），有 10 分钟一次性保护兜底，可接受但值得在文档中明示；audit 日志仅内存 50 条，无持久化——对隐私产品是特性，对排障是成本。

---

## 4. electron-updater 自动更新

desktop/updater.cjs 的**状态机与 Electron 解耦、依赖注入 `autoUpdater`**，因此可以确定性单测——这是正确的测试策略，不是偷懒。行为上：`autoDownload=false`、用户显式触发、`install` 前经 `beforeInstall` 钩子**阻断 PDF 处理中与 Agent 运行中两种危险窗口并优雅停服**、main.cjs:2 的 exclusive 单飞锁防并发点击。设计层面没有可挑剔的。

**真正的风险在供应链，不在代码**：desktop/package.json:54 `signAndEditExecutable:false` + CI 里 `CSC_IDENTITY_AUTO_DISCOVERY:false`（build.yml:21），即**安装包与更新包完全无代码签名**。后果清单：

1. 首次安装和**每次更新**都过 SmartScreen 拦截，普通用户的更新漏斗会很难看；
2. 更新真实性的唯一信任锚是"GitHub 仓库 + HTTPS"。仓库账号失陷 = 可向全部用户推任意代码。代码签名能把攻击面从"拿到 GitHub 权限"抬高到"拿到签名证书"；
3. 更新源硬绑 `Simple-YU-268/ResumeFill`，仓库改名/转私有后更新静默失败，UI 只显示 `error` 态，无诊断信息；
4. 状态机有单测，但没有针对真实 latest.yml 的端到端演练，也没有灰度/分批推送机制（electron-updater 支持 stagingPercentage，未启用）。

另外注意 `oneClick` 一条链路走完 check→download→install，中间无二次确认——`beforeInstall` 兜住了"忙时不装"，但"下载完立即重启安装"的产品语义要确认是有意为之。

---

## 5. 测试体系

分层是教科书式的，且 CI（ci.yml）真的全跑：

| 层 | 内容 | 评注 |
|---|---|---|
| Node 单元/协议 | 10 组（matcher/AI 协议/配对/网关/答案保护等） | 纯 Node 断言，零框架，快 |
| 真实浏览器 | 19 组 Playwright（下拉/iframe/学习/Agent 失败路径/版本核对…） | 回归导向明显，每组对应一个修过的 bug |
| 桌面集成 | desktop/extension-test.cjs 等：**真实 Controller + 临时端口网关 + Chromium 加载打包后扩展**做端到端同步 | 这是能抓住 prepare.cjs 类缺陷的层，价值最高 |
| Electron UI | 4 组（含 `--smoke-test` 钩子） | 冒烟级，够 |
| 门禁 | version:check + privacy（git 追踪文件 + **asar 产物内**的凭据/身份/路径模式扫描）+ pre-commit 钩子 | 隐私扫描连打包产物都查，截图白名单按 sha256 钉死 |

**缺口**：① 上节说的 prepare.cjs 白名单完整性无断言；② 19 组浏览器测试串行 spawnSync、fail-fast、无分片，CI 单 runner 无矩阵——现在能忍，墙钟时间超过 ~15 分钟就该切分；③ 无 lint/类型检查，全部契约安全靠运行时断言+测试兜，成本会随代码密度上升（见下）。

---

## 6. 技术债台账（按利息排序，不按羞耻感）

| 债项 | 本金（修复量） | 利息（每周期代价） | 触发还债信号 |
|---|---|---|---|
| 高密度单行源码风格（controller.cjs 35 行但单行数千字符；popup.js 40KB / content.js 32KB / controls.js 30KB） | 2–3 周（格式化+回归验证） | **每次 review/调试多花数倍时间；diff 基本不可读；事实上锁死外部贡献者，你是唯一单点** | 出现第二个常驻维护者，或一次因读错密代码引入的线上 bug |
| prepare.cjs 手工白名单 | 0.5–1 天（加完整性断言即可，不必改机制） | 每次发版的人工核对成本 + 一次静默打包事故的风险敞口 | 立即。这不是"以后再说"的债，是一次发版就能炸的雷 |
| 无签名的更新通道 | 证书采购 + CI 配置 ≈ 数百元/年 + 2–3 天 | 每次更新的用户流失 + 供应链敞口常开 | 用户量超出亲友圈、或开始正式分发时**必须还** |
| server.cjs 硬编码 0.16.0 兜底 + 独立网关双模式 | 半天 | 版本诊断信号失真 | 立即（常量对齐）；独立模式去留下个版本窗口拍板 |
| 无 lint/类型层 | 1 周（JSDoc+checkJs 渐进式即可，不必上 TS 构建） | 跨模块契约漂移靠测试事后兜 | 模块间接口再增加 ~30% 时 |
| 浏览器测试串行无分片 | 1 天 | CI 墙钟时间线性增长 | CI 超过 15 分钟 |

---

## 7. 改进建议（两档，按惯例你选）

| | A 档：快（本周可做，合计 ~2 天） | B 档：对（下一个版本周期，~2–3 周） |
|---|---|---|
| 打包完整性 | 在 CI 加断言：解析 manifest/popup/options/importScripts 的引用集合 ⊆ prepare.cjs 白名单；白名单外的新文件必须显式登记 | 把白名单改为从入口**自动爬取依赖图**生成，prepare.cjs 只保留隐私否决清单 |
| 版本一致性 | check-version.cjs 增加对 server.cjs `VERSION` 常量的校验 | 全仓库版本号单一来源（生成式注入） |
| 更新通道 | 给 updater 的 `error` 态带上可诊断信息（网络/无更新/校验失败分类） | 引入代码签名证书 + 灰度推送（stagingPercentage）；这属于分发性决策，**等你确认要对外正式发布再花这个钱** |
| 可维护性 | 对 controller.cjs/main.cjs 跑一遍 prettier + 全量测试（零逻辑改动，diff 一次性付清） | popup/content/controls 三大件按职责拆分模块 + JSDoc 类型 + eslint；配合现有测试网兜底 |
| 独立网关 | 在 README 标注独立模式状态 | 拍板弃用或保留，二选一，删掉另一条路径的维护义务 |

**推荐**：A 档全做，B 档里"打包依赖图"和"代码签名"两项按是否打算正式分发来决定——不分发就不签，这笔钱不该花。源码密度那笔债是现在利息最高的一项，但它不伤用户、不伤安全，伤的是未来迭代速度，可以在功能压力小的窗口还。

**否决线**：在修好打包完整性断言之前，不建议做下一次正式发布——这是目前唯一一个"已知会在某个版本静默爆炸"的缺陷。其余各项均给成本、由你拍板。

**总体评价**：这套架构的安全工程品位（网关纵深防御、safeStorage、隐私门禁、最小权限）明显高于同规模个人项目的常态，选型纪律也很好——没有为简历亮点引入任何框架。它现在最缺的不是技术升级，而是把几个"靠人记"的环节（白名单、版本常量）变成"靠 CI 卡"。
