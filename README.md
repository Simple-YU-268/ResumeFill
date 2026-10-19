# ResumeFill Agent

本地优先的简历填表专用 Agent，包含 Windows 桌面管理端与 Chrome / Edge 扩展。当前版本 **0.16.0**，MIT 开源。

## 使用

从本仓库 Releases 下载 Windows 安装程序。桌面端内置运行环境和浏览器扩展，无需另外安装 Node.js。

1. 安装并打开桌面端，在个人资料中使用中文表单填写信息，或导入自己的 JSON。
2. 按桌面端指引，在 Chrome / Edge 开发者模式中加载扩展目录。
3. 导出一次性配对文件，在扩展设置中导入完成配对并授权本机服务；长期令牌只保存在扩展会话中，浏览器重启后需重新配对。
4. 在扩展设置中读取桌面资料并保存；进入招聘页面扫描，核对字段和资料后启动 Agent。
5. Agent 观察页面、调用受限填写工具并独立回读；遇到新字段或不确定建议时暂停，供用户补充后继续。最终申请由用户提交。

完整操作见 [桌面端说明](desktop/README.md)。仅使用扩展时可下载 Release 中的扩展 ZIP，加载解压后的目录；示例资料在 sample.json。

## 功能

- 可视化编辑基本信息、教育、工作、项目、自定义字段及网站补充答案，保留已有扩展字段。
- 性别、政治面貌、民族、学历、婚姻等下拉选择；后台共享严格同义词词典，含义不同的状态不会混选。
- 依据页面可见标签、位置、分组和站点适配规则匹配，不只依赖控件代码名称。
- 原生输入、下拉、单选、组合框、地区级联和多种日期控件；复杂网站仍可能需要适配。
- 本地网页 OCR 补充图片 / Canvas 标签：主动截图、确认标签、绑定真实控件、填写后回读，DOM 标签优先；不根据截图坐标盲目点击。
- 可选本地模型网关、模型建议审核、任务停止、暂停继续和检查记录。
- PDF 文字提取、本地扫描件 OCR 与可选 AI 语义解析：明确授权发送原文，逐项核对结果，再合并到表单保存。

## 隐私与边界

个人资料默认保存在本机。可选 AI 配置默认关闭；PDF 解析需要主动授权将提取的简历文本发送到用户配置的模型服务。匹配模式是否附带资料值由扩展设置决定。网关令牌与模型密钥由桌面端使用系统加密（Windows DPAPI）保存；配对文件只含一次性配对码，勿公开分享。

PDF 限 15 MB、15 页和 60000 字符；内置离线简体中文、繁体中文、英文 OCR，自动识别扫描页，也可强制全部页面 OCR。模型可能出错，必须核对。现有内容默认保留，不自动提交申请。Windows 安装程序未代码签名；扩展尚未上架商店。端到端模型协议使用模拟服务验证，真实模型效果取决于所配置服务。

## 开发

需要 Node.js 22.13+，建议 Node.js 24。

```powershell
npm ci
npm test
npm run privacy
npm --prefix desktop ci
npm --prefix desktop run prepare:resources
npm --prefix desktop test
npm --prefix desktop start
npm run build
```

浏览器测试默认使用已安装的 Edge；可设置 BROWSER_CHANNEL=chromium 并先运行 npx playwright install chromium，或通过 BROWSER_EXECUTABLE 指定浏览器。运行 npm run test:browser；桌面 UI 与 PDF 集成测试分别为 node desktop/ui-test.cjs 和 node desktop/pdf-test.cjs。

构建输出位于 dist/，不进入 Git。测试只使用合成资料与临时浏览器目录。公开前运行 npm run privacy；构建后运行 npm run privacy:artifacts。参见 [隐私检查](PRIVACY-REVIEW.md)、[版本记录](CHANGELOG.md) 和 [第三方许可](THIRD_PARTY_NOTICES.md)。

### 内置模型模板与调用验证

桌面端和扩展设置内置 DeepSeek（deepseek-flash）、Kimi 国内接口（kimi-k2.6）、OpenAI（gpt-4.1-mini）、OpenRouter（qwen/qwen3.8-flash）模板，模型 ID 可修改。使用各平台正式 API 密钥。DeepSeek / Kimi K2.6 的字段、选项与 PDF 请求默认关闭思考模式，减少等待；OpenAI 不发送该专有参数。桌面端跨服务商域名保存时清除旧密钥。

桌面端“测试已保存配置”通过临时鉴权本地网关访问真实配置的上游，不使用缓存或规则回退。只发送虚构字段与候选 JSON 路径，检查 Chat Completions 响应及有效字段匹配，显示耗时；HTTP 200、空匹配或错误 JSON 均不能冒充验证成功。

2026-10-16：三个官方端点均已实际 POST 并返回 HTTP 401（未携带密钥），证明接口网络可达；当前开发环境未配置有效密钥，真实鉴权和推理尚未验证。模拟上游、鉴权失败、错误响应、空匹配及实际 Electron 模板 UI 测试通过。官方文档：[DeepSeek](https://api-docs.deepseek.com/)、[Kimi](https://platform.kimi.com/docs/get-api-key)、[OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。

2026-10-16 OpenRouter 真实调用验证：Key 鉴权 HTTP 200；使用 `https://openrouter.ai/api/v1/chat/completions` 与 `qwen/qwen3.8-flash`，桌面控制器 → 鉴权本地网关 → 真实模型字段匹配通过（8307 ms），PDF 语义解析与结构校验通过（12517 ms）。只使用合成候选资料，密钥未写入配置或项目文件。`openai/gpt-4.1-mini` 返回 HTTP 403，服务提示 provider Terms Of Service 限制；该响应不能证明具体限制原因。此测试不证明其他模型或提供商均可用。

0.13.0 资料编辑：现居地区、户籍、籍贯及经历 / 补充信息中的地区字段使用本地省市区县三级联动，保存完整路径和区县代码；切换上级会清空下级。详细街道地址保留文字。日期使用原生日历 / 月份控件，可选年份精度，结束日期支持至今，导入资料不会自动补齐缺失精度。地区词典为 2023-06-30 数据，未收录地区与旧原文保留，需人工核对。

### 公开插件研究与改进

牛客、塔塔、招聘盯公开发布包的静态 REA 结果、样本哈希、Evidence IDs 和实现边界见 [研究记录](COMPETITOR-RESEARCH.md)。本项目独立实现了复用下拉弹层跟踪、带完整索引的虚拟列表查重选择、DOM 复用确认失效，以及单选组 / 定义列表标签增强。原始第三方包不随源码或安装包发布。

### 区块与区间匹配（0.15.0）

在插件中展开“只处理选定区块”，列出容器并定位核对，选择教育/项目/工作或基本信息及起始经历序号，再点击“仅扫描此区块”。已识别的多张经历卡片依次对应 JSON 记录；无法识别卡片时请选择单条经历的容器。所选容器失效时停止操作，不自动扩大到整页；点击“恢复整页扫描”解除范围。区块模式不自动新增/保存经历卡片，网页内联填写请改用插件预览。

数值区间保留单位和开闭边界。3 年同时落入 1–3 年与 3–5 年时要求人工选择；月薪与年薪不自动换算，单位不明或不支持的表达转人工。模型只收到未解决字段及每字段最多 12 个相关候选路径，默认不发送资料值；无相关候选时不调用模型。

桌面端“保存并测试模型”使用界面当前配置。OpenRouter HTTP 401 表示鉴权被拒绝：请在服务商控制台检查密钥状态，重新填入有效密钥后测试；不要把密钥发送到聊天。浏览器插件的密钥只保存于会话，浏览器重启后需要重新保存。

可复现接入验证：`node scripts/verify-ai-browser.cjs --mock` 使用本机模拟模型；`--live` 显式读取桌面端已保存的服务配置并调用真实模型（可能消耗少量额度）。可用 RF_MODEL_CONFIG 指定配置文件；测试仅使用合成资料，真实密钥留在网关进程中，报告写入 dist/ai-live-verification.json。2026-10-19 使用 OpenRouter qwen/qwen3.8-flash 验证了三种页面叫法的语义映射和实际填写回读，建议阶段约 10.8 秒；该数值不是延迟保证。
