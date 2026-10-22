# 代码审查报告 — 代码审查工程师

验证完毕——先前曾提到的 `recordPolicy` 服务端复检问题**不成立**（`ai.js:41` 构造 packet 时只挑白名单键，`recordPolicy` 不会随包发出，服务端复检拿到的字段不带该策略，所以不会误拒）。以下是最终审查报告。

---

**版本说明**：任务提到 v0.18.0，但当前工作区根包/manifest 为 **0.24.1**、desktop/package.json 为 **0.24.2**——本报告基于工作区当前代码。版本不一致本身也是一个发现（见 🟡-2）。

**总体印象**：安全设计相当扎实——Host/Origin 双重校验、timing-safe 令牌比较、一次性配对、AI 输出的严格协议校验（拒绝未知路径/重复匹配/低置信度）、填写前的多重 guard（scopeGuard/ocrGuard/menuChanges）、对删除/提交类按钮的主动拒绝，都体现了清晰的威胁模型。未发现需要阻断发布的 🔴 问题。以下是 10 个 🟡 建议项和若干 💭 小改进。

---

## 🟡 建议项

### 1. 隐私检查漏掉两字中文姓名
scripts/check-public-package.cjs:4：`value.trim().length>=3` 才纳入身份比对。两字中文姓名（如"李雷"，`.length===2`）被静默跳过，恰好是中文姓名最常见的长度之一。
**建议**：改为 `>=2`，或对含 CJK 字符的值单独放宽阈值。这是隐私闸门的实际缺口，优先级建议提到最高。

### 2. 版本号三处漂移
- local-server/server.cjs:4：`const VERSION='0.16.0'`——硬编码回退版本停留在 0.16.0，独立模式（`require.main`）下用于响应和 `User-Agent`。
- 根包/manifest 0.24.1 vs desktop/package.json 0.24.2——违反 AGENTS.md "版本号在根包、桌面包、锁文件、manifest 和发布说明中保持一致"。

**建议**：server.cjs 改为 `require('../package.json').version`；发布脚本加一步版本一致性断言。

### 3. 批量回读阶段一个字段抛异常会丢失全部结果
content.js:212：第二轮 `Object.assign(result,await C.verify(d,item.value))` 没有 per-item try/catch。`C.verify` 对 referencePicker 字段会走到 controls.js:121-123 的 `refPanel()`，可抛"多级选择器浮层不唯一/ARIA 引用未唯一命中"。一旦抛出，整个 `fill()` 的 Promise reject，前端只收到 `{error}`——**已成功填写的其他字段结果全部丢失**，且后续 `saveCards` 不再执行。content.js:254 的 RF_VERIFY 分支同理。
**建议**：第二轮也包 try/catch，失败的条目降级为 `{status:'unconfirmed',error:e.message}`。

### 4. 配对码长度预检按字符数而非字节数
desktop/controller.cjs:13：`code.length!==ticket.code.length` 按 UTF-16 字符数检查，但 `Buffer.from(code)` 按字节。64 个全角字符（如粘贴了全角十六进制）通过字符检查、字节数却是 192，`crypto.timingSafeEqual` 直接抛 RangeError。结果被 server.cjs:45 兜底成 400 而非 401，且**不计入 pairFails 速率限制**。
**建议**：`if(Buffer.byteLength(code)!==ticket.code.length)return null;` 或先 `Buffer.from` 再比 `a.length`。

### 5. 配置文件损坏导致应用无法启动
desktop/controller.cjs:4：`JSON.parse(fs.readFileSync(this.configFile))` 在构造函数顶层、无 try/catch（只有 `_open` 被包裹）。断电/手动编辑造成的半截 JSON 会让 Controller 构造直接抛异常，应用启动即崩。
**建议**：参照 `recoverCredentials` 的现有模式——解析失败时备份原文件、以默认配置重建并提示。

### 6. 请求体超限后仍持续消耗内存
local-server/server.cjs:18：`body()` 超过 limit 后 `reject`，但 `data=''` 之后 `req.on('data')` 继续 `data+=chunk` 直到 `end`——超限部分仍在拼接字符串。仅限本机回路，风险低，但修复一行的事：超限后 `req.destroy()` 或至少置标志位停止累加。

### 7. courses 数组被双重展开
matcher.js:90-91：字符串数组先合成 `'、'` 连接串写入 `out[path]`，随后第 91 行 `typeof value==='object'` 对数组仍然成立，递归产生 `education.0.courses.0` 这类噪声路径进入候选池。评分阶段基本不会误中（别名查不到、数字段名得分低），但会污染 matcher.js:205 的 eligible 列表和 AI 候选。
**建议**：连接成功时 `continue`，跳过递归。

### 8. 同义词表仍有三份拷贝（去重未彻底）
学历映射同时存在于 matcher.js:17（`enums.degree`）、controls.js:3（`canonical`）、option-match.js:18（`local()` 的 fallback `key()`）。后两者仅在 `ResumeMatcher` 缺席时启用，但已经开始漂移：matcher 的 `enums.degree` 含 `'undergraduate'`，两处 fallback 都没有。这正是本轮"共享模块去重"想消灭的遗留。
**建议**：fallback 直接内联一句"ResumeMatcher 必须可用"并显式抛错，或从 matcher 导出该表复用，删掉第三份拷贝。

### 9. 打包脚本不清理目标目录，被移除的文件会残留发货
desktop/prepare.cjs:6-9：白名单拷贝前没有清空 `resources/` 与 `resources/extension/`。历史上曾在白名单、后来被移除的文件会无限期留在打包目录并进入安装包。check-public-package 的 `--artifacts` 只兜底 `resume/config/connection.json` 和 `test.cjs`，拦不住一般性残留。
**建议**：prepare 开头 `fs.rmSync(dest,{recursive:true,force:true})` 后重建。

### 10. 隐私扫描脚本的两个自洽问题
- scripts/check-public-package.cjs:12-13：asar 扫描整体跳过 `node_modules/`，`unexpected-runtime-file` 检查同样跳过——若构建污染把 `resume.json` 打进 node_modules 则完全不可见；且 `catch` 只认 `/Unexpected|Unable/`，其他提取错误静默吞掉。
- 第 1 行注释承诺"Never echo matched text"，但 findings 输出的**文件路径本身**可能含 PII（如 `my-materials/张三简历.pdf` 被标记时路径原文输出）。

**建议**：路径输出前过一遍 identity 脱敏；asar 提取失败的 catch 全部记录为 `unreadable-artifact`。

---

## 💭 小改进

- matcher.js:98：family 匹配用 `Object.hasOwn` 不检查空串，而 `flatten`（第 92 行）会收录 `''`——可能以 score 100 匹配到一个空值路径。建议加 `String(values[path]).trim()` 条件。
- matcher.js:196：`allowedPath` 对 family 字段每次调用算两遍 `familyPath(field)`；`suggestions` 的热路径里会被反复调用，可缓存一次。
- answers.js:4：`new URL(url)` 对非法 `page.url/frameUrl` 直接抛 TypeError；包 try/catch 返回 `formId:null` 更稳。
- ai.js:24：`new URL(data.endpoint)` 对非法地址抛原始 TypeError，用户看到的是英文堆栈而非引导文案。
- ai.js:33：`originPattern` 丢弃端口，`http://127.0.0.1:8080` 变成 `http://127.0.0.1/*`（匹配任意端口）。若该 pattern 用于扩展权限申请，建议注明或收窄。
- controls.js:41：配了 `optionsSelector` 但菜单未找到且控件无 ARIA 关联时，退化为**全文档**选项搜索，仅靠唯一性兜底；建议此处弃权而非扩大范围。
- controls.js:47：`norm(o.getAttribute('data-value')||o.value)===norm(value)` 在 `value===''` 时对所有无 data-value 的选项假阳性（`''===''`）。上游基本不会传空值，加一道 `if(!norm(value))return []` 更稳。
- controls.js:96：`parsed.iso.replace(/\d/g,'')` 产出 `'--'` 作为哨兵值依赖第 97 行的 `/YYYY/` 检查兜底——功能正确但非常隐晦，值得一行注释或改为显式 `null`。
- controls.js:120 vs content.js:119：类名存在 `jbs`/`jsb`、`three_layer`/`three_layers` 两组拼写变体。若其中一个是笔误，referencePicker 在对应站点会静默失效；建议对照 51job 实际 DOM 核实。
- controls.js:218：`d.selectedPath` 写入后除 content.js:167 的拷贝外无人读取，疑似死状态。
- content.js:21：常驻全文档 MutationObserver 只为了给 `viewport()` 提供一个 mutations 计数器；动态页面上回调开销不小，可考虑仅在操作窗口内观察。
- content.js:28：`text()` 全局剥离"必填/选填"，理论上一个合法标签如"选填项说明"会被误删字。概率极低，记录备查。
- local-server/server.cjs:73：desktop/pairing 错误统一塌缩为"匹配请求无效或无法完成"，只靠 `RF_*` code 传意——确认 UI 层对所有 code 都有映射文案，否则排障体验差。
- desktop/main.cjs:18：`try{await controller.start();}catch{}` 静默吞掉启动失败；至少写一条日志，UI 里 `running:false` 已有体现但用户无从得知原因。

---

## 测试盲区

已有覆盖不错（local-server 的 auth/Host/Origin/缓存/重试/超时、配对、family、dropdown、OCR 都有对应测试文件）。缺口：

1. **`shareValues:true` 的网关路径**——ai.js:53 的值一致性校验分支（`c.value!==String(values[c.path]).slice(0,1200)`）无测试；现有 local-server 测试全部用 `shareValues:false`。
2. **`/v1/pair` 端点级测试**——一次性兑换、5 次/分钟限速、以及上文 🟡-4 的全角字符路径。
3. **批量填写的部分失败语义**——🟡-3 的"单字段 verify 抛异常不影响其他字段结果"应固化为回归测试。
4. **Controller 的异常恢复路径**——config 损坏重建（🟡-5）、EADDRINUSE 端口递增（controller.cjs:15）、credentialRecovery 全流程。
5. **数值区间选项经网关的端到端用例**——`numericOptions` 有单测迹象（enum-test/semantic-test），但经 server 的 `/v1/match-options` + 薪资单位/周期冲突（matcher.js:161-168）的组合没有。
6. **check-public-package 自身的自测**——身份正则、forbiddenPath、approvedImage 哈希校验没有 fixture 级回归，改错正则不会有人发现。

---

**值得肯定**：`answers.js:25` 的原型链污染检查、`server.cjs:16` 的双通道（令牌+会话）认证、`ai.js:61` 对 AI 返回的"未知即拒绝"策略、`controls.js:56-76` 虚拟列表的"全量枚举后才允许选择"、以及 `clickAction` 对破坏性按钮的显式拒绝，都是教科书级的防御实现。建议优先处理 🟡-1（隐私）和 🟡-2（版本一致性），其余可随下个迭代收敛。
