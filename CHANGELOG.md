# Changelog

## 0.27.2 — 2026-10-30（开发测试版，暂停发布）

- 使用 Impeccable 重构桌面端、扩展弹窗与设置页，突出扫描、核对、填写主流程。
- 统一共享视觉变量、键盘焦点、窄窗口布局与状态反馈；高级工具按需展开。
- 固定弹窗填写操作，确保长字段列表不遮挡；设置页操作状态保持视口可见。
- [版本说明](docs/releases/0.27.2.md)。

## 0.27.1 — 2026-10-28（开发测试版）

- 修复 Element 下拉点击外层容器无法触发内部选择的问题。
- 识别 Element 级联控件，支持单层及完整路径逐级选择；严格关联当前浮层并独立回读。
- 新增实际安装扩展回归，覆盖异步分级、已展开列表、禁用项、无完整路径及选择回空。
- [版本说明](docs/releases/0.27.1.md)。

## 0.27.0 — 2026-10-26（开发测试版）

- 新增有限自动恢复：等待、重扫、唯一身份重绑与独立回读；固定次数和步骤上限。
- 已核对字段按省市区、年月日依赖排序；资料、文档或容器变化停止。
- AI 仅规划限定恢复策略，失败采用本地兜底，已有内容与批准范围保持保护。
- 实际安装扩展构造页面验收；Live AI 仍返回 401，未正式发行。
- [版本说明](docs/releases/0.27.0.md)。

## 0.26.0 — 2026-10-26（开发测试版）

- 工作/实习类型与独立记录分配，冲突、资料或结构变化后阻止旧任务。
- 增加表单文档选择和扫描诊断；支持验证同源父链的 srcdoc，不执行跨域填写。
- 支持开放 Shadow DOM 扫描、根内菜单、内联建议与学习读取；封闭根不进入填写。
- 新增实际安装扩展回归；真实招聘站与同版本 Live AI 证据状态见版本说明。
- [版本说明](docs/releases/0.26.0.md)。

## 0.25.3 — 2026-10-23（开发测试版）

- 新增仅本地的 AI 校准事件记录：仅保存模型、置信度、资料路径与处理结果（不含任何简历值、选项文字、页面标签或网址），环形保留最近 500 条，用于评估建议质量。
- 新增扩展与桌面端图标：同一 buddy 造型的 16/32/48/128 像素扩展图标与 256 像素桌面图标，桌面端品牌位同步改用新图标。
- 打包链路支持子目录资源并校验 action.default_icon 依赖。
- 详见 [版本说明](docs/releases/0.25.3.md)。

## 0.25.2 — 2026-10-23（开发测试版）

- 修复真实 Moka 页面年月菜单直接使用 sd-Menu-container 导致的不可选：同时支持普通嵌套选项与直接菜单项，排除嵌套重复候选，保持浮层归属、唯一性与稳定回读检查。
- 获奖经历年月对应 awards[n].date，按已有日期精度拆分，缺月不补造。
- 真实页面仅检查结构并开合列表，未修改、保存或提交个人资料；新版插件在线填写尚待复测。详见 [版本说明](docs/releases/0.25.2.md)。

## 0.25.1 — 2026-10-23（开发测试版）

- 修复 Moka sd-Select 受控下拉：按实际页面结构点击内部菜单节点，外层点击不再静默失败；已存在目标选项时不注入搜索文字。
- Moka「项目经验」按项目经历识别，保持多条记录隔离；保留稳定回读与禁用控件检查。
- 回归样例使用合成资料：旧实现复现整批下拉失败，修复后通过。真实页面仅做结构检查。详见 [版本说明](docs/releases/0.25.1.md)。

## 0.25.0 — 2026-10-22（评审修复测试版）

- 修复隐私扫描、打包残留、损坏配置恢复、配对字节长度和批量回读的异常隔离。
- AI 选项本地优先且拦截敏感外发，Agent 逐字段候选约束，模型混合结果逐条拒绝。
- 本地 OCR 复用进程并空闲回收；两端共用可视化资料编辑器，增加累计统计、进度与醒目取消。
- 静态主题、统一 token 与窄窗口布局，更新界面收敛；增加发布门禁和逐项处理记录。
- 详见 [版本说明](docs/releases/0.25.0.md) 和 [评审处理表](docs/reviews/2026-10-22-resolution.md)。真实上游/真实申请页验证、商店上架与签名仍有外部条件，不作为本次已完成项。

## 0.24.3 — 2026-10-22（开发测试版）

- AI 主动复核较弱自动匹配；标准路径缺失时从同模块已有资料生成候选，保留人工编辑与经历隔离。
- 详见 [版本说明](docs/releases/0.24.3.md)。

## 0.24.2 — 2026-10-22（开发测试版）

- 针对实际 Moka 页面识别 sd-Select 受控组件，按控件所属容器寻找真实候选并点击，读取已提交的显示层，避免将搜索文字误当作选中值或保存为资料。
- 使用明确的字段标题和教育/实习记录边界，匹配分段开始/结束年月；区分证件类型与号码、电话区号与手机号，补齐本人政治面貌、证件号码标签。
- 家庭成员按当前记录称谓归属，关系变化使旧填写失效；年月字段按部件区分，不因同名标签误判重复。生日弹窗及多级籍贯仍需人工处理，不直接改写只读显示框。
- 新增合成 Moka 组件回归，覆盖真实选项点击、搜索值与选中值隔离、两段教育年月、证件类型隔离、家庭关系切换与读回。仅对实际申请页面做只读结构检查，未自动填写、上传或提交。

## 0.24.1 — 2026-10-22（开发测试版）

- 填写前核对页面脚本版本与协议；旧版、无版本标记及不兼容脚本在注入新模块前停止，避免页面混用新旧控件逻辑。提醒先保存网页内容、手动刷新再扫描。
- 扫描后再发生版本不一致时，清除过期路由与填写预览，阻止手动填写和 Agent 继续使用旧扫描；不自动刷新网页，不改动已填内容。
- 禁用的 Layui 原生下拉不再因显示替身被误列为可填字段。回空诊断区分真实选择清空与仅显示清空，检查点记录两端版本及布尔诊断标志，不新增填写值日志。
- 增加批量重绘、跨字段清空、旧脚本、iframe 和刷新恢复回归；可选测试使用固定摘要的网站原版 Layui JS/CSS，阻断网络验证四种组合场景。真实报考页面暂不可用，尚未复测或正式发行。

## 0.24.0 — 2026-10-21

- 家庭成员弹窗优先识别所属成员，姓名、身份证、出生年月等写入 `family.<关系>.*`，禁止匹配本人或其他成员；关系变化后旧扫描失效，未知或多人关系停止自动匹配。
- 新增桌面家庭成员可视化编辑；结构化学习、检索、AI 候选校验统一使用成员路径，兼容旧身份证字段拼写。
- 插件新增默认关闭的本地家庭资料自动记忆：识别手动修改并串行保存，拒绝空值、脱敏值、不完整身份证号与已有不同值。家庭资料差异同步全部作为敏感项核对。
- 增加合成家庭弹窗、手动记忆、错误路径、关系切换和桌面编辑回归；测试不操作实际招聘申请。
- 下拉修复：已展开且归属明确的 Layui / ARIA 列表不重复点击关闭；政治面貌支持精确信息选择明确包含它的合并类别，优先精确选项，禁止反向细化。

- 修复 Layui 联动重绘后旧控件失效：仅按原底层 select 绑定新显示控件；下拉填写增加稳定期核验，延迟回空、数据源替换与状态不一致不计成功。

## 0.23.0 — 2026-10-21

- 修复“桌面已有民族、插件却提示资料为空”的使用断层：重连后检查两端差异，提示桌面新增或修改，并提供直接核对同步入口。
- 插件弹窗与设置页支持逐项差异同步。空缺普通字段默认勾选，已有内容、敏感项和整组经历不自动覆盖；桌面空值不清空插件资料，网站学习答案与插件独有字段保留。
- 同步前再次核对两端资料，阻止过期预览和未保存编辑被覆盖，保留同步前备份；成功后使旧扫描失效，要求重新扫描使用新资料。

## 0.22.0 — 2026-10-21

- 桌面端、插件弹窗与设置页统一为简洁插画风格：原创文档小搭档、鼠尾草绿主色、淡蓝与杏色辅助色，圆润按钮和清晰的信息层次。
- 桌面端新增三步使用引导与统一线条导航图标；插件突出扫描、核对、填写和学习已填内容，保留全部现有功能与数据行为。
- 共用本地 SVG 插画与视觉样式，不引入外部字体、图床或远程 UI 依赖；保持键盘焦点、减少动态效果偏好与窄窗口适配。
- 重写产品 README，加入经过审查的合成资料截图，建立安装、填写、学习、AI/OCR、隐私、排错与开发发行 Wiki；文档源随仓库版本管理。

## 0.21.0 — 2026-10-21

- 新增“重新扫描并学习已填内容”：读取可见表单、下拉显示文字和同源 iframe，预览新增/修改项后保存到本地 JSON，不改写或提交网页。
- 精确同义字段写入既有路径，未知字段创建带网站、区块和经历序号的网站答案；支持明确且连续的新经历，归属歧义和目标冲突停止学习。
- 修改项与敏感项默认不选；敏感项需单独确认，密码、验证码、安全答案及脱敏值不学习。保存前再次核对网页内容与本地资料，并保留上次学习前的备份。
- 学习过程不向模型发送网页填写值；原有 AI 匹配与手动补充流程保持独立。

## 0.20.6 — 2026-10-21

- 针对当前个人中心嵌入式报考表单，扫描可见同源 iframe，按 frameId、documentId 和 URL 绑定填写/回读/Agent；隐藏、跨域、刷新及多表单歧义不自动路由。
- 支持 Layui 可见下拉替身与隐藏原生 select 的双重核验；区分最高学历、最高学位名称，防止是否/有无问题串用专业等资料。
- 隔离家庭主要成员区块；iframe 暂不使用截图 OCR，防止子页面坐标与整页截图错位。
- 标签存在精确同义词时，候选仅保留精确项，避免院校建议中混入学历等弱关联资料。

## 0.20.5 — 2026-10-21

- 修复本机加密凭据无法解开时管理界面不出现的问题：进入只读凭据恢复状态，保留原配置与简历，禁止启动服务或覆盖加密配置。
- 提供显式恢复操作，备份原加密配置后重建本地连接凭据、撤销旧配对并暂停模型；用户重新配对和输入 API 密钥。

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
