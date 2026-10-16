# ResumeFill Agent

本地优先的简历填表专用 Agent，包含 Windows 桌面管理端与 Chrome / Edge 扩展。当前版本 **0.12.0**，MIT 开源。

## 使用

从本仓库 Releases 下载 Windows 安装程序。桌面端内置运行环境和浏览器扩展，无需另外安装 Node.js。

1. 安装并打开桌面端，在个人资料中使用中文表单填写信息，或导入自己的 JSON。
2. 按桌面端指引，在 Chrome / Edge 开发者模式中加载扩展目录。
3. 导出本地连接文件，在扩展设置中导入、保存并授权本机服务。浏览器重启后需重新导入会话令牌。
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

个人资料默认保存在本机。可选 AI 配置默认关闭；PDF 解析需要主动授权将提取的简历文本发送到用户配置的模型服务。匹配模式是否附带资料值由扩展设置决定。连接文件含本机访问令牌，勿提交到 Git 或公开分享。

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
