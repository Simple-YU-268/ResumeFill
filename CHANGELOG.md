# Changelog

## 0.20.4 — 2026-10-21

- 根据当前考生注册页测试，保护安全问题和恢复答案：排除本地匹配、模型候选、补充答案保存及 Agent 授权路径。
- 增加真实标签结构的注册页回归，验证隐藏步骤不参与扫描、密码与验证码不自动处理，测试不写入表单。

## 0.20.3 — 2026-10-21

- 支持 51job 特殊多级引用选择器：限定触发器所属浮层，悬停展开异步子级，遍历后只点击唯一末级；支持显式分类、省市区和城市级控件。
- 英语等级结合本条语言记录的分数选择区间；分数缺失、重复末级、区间边界重叠或遍历不完整时停止。
- 重新打开菜单校验真实 active 路径与文本回显；保留已有值，支持取消与完整路径人工确认/记忆。
- 弹窗、单项重试、内联建议与 Agent 共用本地辅助资料；逐项回读避免多个浮层并发互相影响。

## 0.20.2

- 根据实际 51job 页面检查七个模块，新增基本信息、语言、技能、荣誉与实践区块语义；隔离同名字段，歧义多条记录不取第一条。
- 补齐目前居住地、通信地址、期望工作地、专用紧急联系人资料的匹配；英语等级与分数独立对应，支持结构化 languages / skills / awards / activities 数据。
- 识别 CSS 必填标记与 Element 日期精度；多级引用选择器禁止以文本写入冒充成功，当前需人工选择真实条目。
- 扩充真实页面匿名化回归：43 字段、填写回读、重复记录、跨区块 AI 拒绝、日期与引用控件。

## 0.20.1

- 修复 51job 最高学历区块识别，按唯一最高学历选择教育记录，支持毕业学校、学历层次与课程数组。
- 其他学校/专业保持人工核对；学历未知或并列时不自动选择。
- Agent 显示失败工具和安全错误码；保留上游 HTTP 状态，支持失败后继续。
- 增加真实 Edge 十字段扫描、两步失败和模型恢复回归。

## 0.20.0 — 2026-10-20

- Desktop auto-discovery and pairing: bounded loopback discovery, first-use approval on the desktop, persistent per-browser grants and session-token renewal after browser/desktop restarts. The desktop lists pending/approved clients with approve, reject and revoke controls; rejected requests pause, expire and are bounded. Session tokens are derived for the approved extension Origin/client, differ from the gateway master token and stop working immediately when revoked. Discovery exposes no profile or token.
- Plugin popup/options automatically reconnect with existing local permission, offer one-click discovery and retain manual pairing. First-time setup imports desktop data only if no browser profile exists. Existing data, unsaved JSON/AI settings and separate cloud-provider keys remain intact. Agent, desktop sync and web OCR share the desktop connection independently of cloud AI configuration. Busy default ports fall back within 17322–17324. Real installed-extension and backend regressions cover discovery, approval, session renewal, origin isolation, profile/key preservation and revocation.

## 0.19.1 — 2026-10-20

- Block browser internal pages and Chrome/Edge extension galleries before attempting injection, with an actionable Chinese message. Failed scans clear stale field mappings; fill/prepare verify the active tab before acting. Late gallery access errors are translated without requesting broader browser permissions. Installed-extension regressions cover restricted URLs, empty tabs, late injection failure, recovery and wrong-tab fill prevention.

## 0.19.0 — 2026-10-20

- Windows desktop: adds “一键更新并重启” to check GitHub Releases, download the verified update, stop the local service and request silent installation with relaunch. Concurrent clicks share one job; no update means no download or restart. Unsaved profile/model edits and active PDF/Agent tasks block installation. The staged update controls remain available. Update state and renderer tests cover the flow with simulated transport/installation; a real installed upgrade remains an interactive verification step.
- Includes proactive AI and improved matching documented below. After desktop updates, reload the unpacked Chrome/Edge extension to activate its new code.

## Unreleased — engineering

- Proactive AI: configured models automatically analyze unresolved fields after scanning and add validated suggestions to the review preview. Local results remain usable during inference. Automatic requests omit resume values, respect manual edits and record boundaries, reuse unchanged suggestions within the popup session, and cancel on rescans/fill/Agent start. A persisted switch disables automatic requests; failures leave local matching available. Installed-extension regression covers automatic requests, preview-only behavior, minimization, caching, edits, 401 fallback and opt-out.

- New-field matching: normalize polite prompts, required markers and bilingual labels; expand school, employer, duty and project-description aliases. Local and AI candidate selection now share custom-key/date aliases. Inline suggestions show relevant local paths before typing and constrain typed-value search to the current record. Relative/emergency-contact fields cannot reuse the candidate's basic information. Repeated plain containers with two distinct labelled fields are recognized as separate records, including cards inserted after scanning; date-range rows remain one record. Browser regressions cover dynamic cards and verified fills.

- CI now runs every automated suite: desktop extension sync, Electron UI profile editing, PDF import flow and the version consistency check (scripts/check-version.cjs asserts package.json, desktop/package.json and manifest.json stay aligned). New npm scripts: test:desktop, test:electron, test:all, version:check.
- The installer build workflow also uploads latest.yml and the NSIS blockmap, so CI-built releases can feed in-app updates.
- Electron GUI tests (ui-test, pdf-test, auth-ui-test) skip gracefully with a clear message when no display session is available locally; they still fail hard in CI.
- Docs: MIGRATION.md renamed to FEATURES-0.2.md to match the FEATURES-*.md series; personal record-keeping statements removed from public feature records.
- Shared modules: the protected-field regex is now defined once in answers.js (extended with 一次性.*码) and reused by ai.js via delegation; human-readable Chinese field labels live in the new field-labels.js (ResumeFieldLabels) shared by the popup review list, the desktop profile editor and the PDF import preview, each keeping only its presentation overrides. desktop/prepare.cjs copies the shared files into desktop/ui, the bundled extension resources and the resources root; note the extension release zip file list must include field-labels.js for future releases.

## 0.18.0 — 2026-10-20

Adds in-app updates for the Windows desktop via electron-updater against GitHub Releases. The overview section gains "check for updates" with an inline state line (checking / available / downloading / ready / error), on-demand download and restart-to-install; downloads never start automatically and installation requires an explicit click. A persisted "check on startup" toggle (default on) controls the silent startup check, which runs only in installed builds. Update verification uses the SHA-512 metadata in latest.yml; releases now attach latest.yml and the NSIS blockmap. The installer remains unsigned; Windows may show a SmartScreen prompt. Checking for updates contacts the GitHub API and the release asset CDN only; no personal data is sent. Update checks are unavailable in unpackaged development runs.

## 0.17.0 — 2026-10-20

Review and connection UX. Field mapping options now show human-readable Chinese labels (section, record ordinal and field name) with the JSON path demoted to a tooltip; unresolved and required-missing rows sort to the top of the review list. The popup converges on a single primary action per stage (scan → review → fill), groups Agent/AI/OCR/scope utilities into a collapsed advanced section, and adds a sticky fill bar plus a result card with per-field retry for failed fills. Status messages distinguish errors visually. One-step desktop pairing: the desktop gains a "copy pairing code" action and the extension options page gains a desktop-connection card that redeems a pasted pairing payload, saves the gateway settings and stores the token in session storage in a single click; a connection state line shows connected or expired. Shared design tokens unify colors, spacing, radii and focus rings across the extension and desktop UI; low-contrast helper text, control borders and the disabled-primary style are corrected, and empty states are provided for connections and audit lists. DOM ids and accessible names are unchanged; browser and installed-extension regression tests cover the new ordering, human labels, paste pairing and result card.

## 0.16.0 — 2026-10-19

Security hardening for local secrets and the loopback gateway. The desktop now encrypts the gateway token and provider API key at rest with Electron safeStorage (DPAPI on Windows). Plaintext configurations are migrated on first launch; a sealed configuration without local encryption fails closed instead of falling back to plaintext. Connection files become one-time pairing tickets: the long-lived token never leaves the gateway, the extension redeems the code through the loopback gateway into session storage only, codes expire after 10 minutes, are invalidated on redemption or replacement, and pairing attempts are rate-limited. Desktop, Agent and webpage-OCR endpoints now require an extension Origin even with a valid token; the pairing endpoint requires one as well. Desktop sync actions (pull/push/heartbeat) are recorded in a bounded in-memory audit surfaced in the management UI. Gateway, desktop and PDF errors carry stable RF_* codes instead of regex text matching, and version strings for /health and the upstream User-Agent are derived from package metadata. Legacy long-token connection files remain accepted for standalone gateways; the desktop no longer exports them.

## 0.15.0 — 2026-10-19

Completes the A–E matching upgrade: nearest-left table labels and strict DT/DD ownership with nested-help filtering; shared numeric interval matching with explicit open/closed boundaries and monthly/annual salary isolation; ARIA-first async dropdown ownership and enabled candidate checks; user-selected container preview/fill with per-record path restrictions and stale-scope rejection; unresolved-only model requests with at most 12 relevant paths per field and per-field response validation. Indexed virtual lists retain the 500-item / 40-page bound; unindexed or incomplete lists remain manual.

Desktop model testing now saves current form inputs first, trims pasted credential whitespace/Bearer prefixes, and provides actionable 401/402/403 diagnostics without echoing provider bodies or secrets. OpenRouter missing-key tests stop locally. Browser extension session keys remain session-only; PDF and field matching share normalized credentials. After updating the saved credential, live OpenRouter qwen/qwen3.8-flash authentication and installed-extension semantic matching passed on a synthetic page: three unresolved fields, five candidate paths, no resume values sent, four independently verified browser fields. The model suggestion flow took 10.8 seconds in this run. Deterministic regression tests use a mock HTTP upstream.

Adds numeric/privacy unit tests, scoped browser and installed-extension interaction tests, and an actual Electron save-and-test/401 regression. No competitor private API or proprietary code is included.

## 0.14.0 — 2026-10-16

Adds independently implemented dropdown ownership tracking for reused portals, bounded complete indexed virtual-list enumeration before selection, confirmation invalidation when recycled DOM semantics change, grouped-radio and DT/DD labels, and opaque region-level hints. Includes public-package static REA findings for Nowcoder, Tata and Deepipe with explicit server/runtime unknowns and browser regression tests.

## 0.13.0 — 2026-10-16

Adds local province/city/county selectors with dependent resets and region codes across profile location fields. Native date/month controls preserve date precision and ongoing experiences. Imported values remain unchanged until edited.

Adds official DeepSeek, Kimi and OpenAI templates in desktop and extension settings. Desktop model tests now traverse an authenticated uncached loopback gateway and require a valid synthetic field match. Rejects malformed/empty responses, isolates saved credentials when changing provider origins, and disables thinking for supported DeepSeek/Kimi models in field, option and PDF requests. All three public endpoints returned HTTP 401 without credentials; authenticated OpenRouter inference with qwen/qwen3.8-flash passed both the production gateway field-matching path and PDF semantic parsing using synthetic data. Also normalizes base URLs to Chat Completions endpoints and improves PDF 404 diagnostics.

## 0.12.0 — 2026-10-16

Adds local webpage OCR for missing image/Canvas labels, authenticated loopback screenshot processing, input-region masking, DPI coordinate conversion, human-reviewed DOM bindings and stale-page rejection. DOM labels remain authoritative. Includes actual Edge capture/fill/readback tests at DPR 2 and preserves the existing PDF OCR flow.

## 0.11.0 — 2026-10-16

Adds embedded offline OCR for scanned and mixed PDFs, simplified/traditional Chinese and English language packs, page-level progress, cancellation, force-OCR mode and low-confidence review warnings. OCR text uses the existing explicit AI consent and reviewed JSON merge flow. Tests cover real image-only PDF extraction with network disabled and the complete mocked-model save workflow.

OCR is heuristic and may require forced mode or manual correction for difficult scans.

## 0.10.1 — 2026-10-16

First public source release. Adds MIT licensing, third-party notices, portable test setup, privacy checks, CI and a clean publication boundary. User-specific development paths and workspace-specific gateway configuration defaults are removed. Personal profiles, screenshots, credentials and research artifacts are excluded.

Includes the 0.10.0 features: Windows desktop management, visual profile editing, enum dropdowns and strict synonym matching, browser autofill Agent, and PDF text extraction followed by optional AI semantic parsing and human review.

## Known limitations

- OCR accuracy varies with scan quality; handwriting, rotation and complex layouts require manual review.
- External model configuration is required for PDF semantic parsing. End-to-end protocol tests use a mock upstream; real provider quality varies.
- Extensions are installed through developer mode; no Chrome/Edge store listing is provided.
- Windows installer is unsigned. No automatic application submission is performed.
