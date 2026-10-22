# ResumeFill 独立本地服务（开发者模式）

0.8.0 插件新增有状态的专用 Agent：目标、规划、受限工具、执行反馈、暂停与继续。详见 [Agent 说明](../FEATURES-0.8.md)。升级服务后需停止并重新启动，私人连接配置不变。

面向开发者保留并测试的 Node.js 独立网关，与桌面端复用相同匹配与鉴权代码。普通用户请优先安装桌面端，获得凭据加密、自动配对和更新界面。独立模式自行管理私人配置，无 npm 依赖。插件基础扫描、填写、地区和日期处理不依赖它。

## 启动和连接

需要 Node.js 22.13 或更新版本。在 resume-fill 目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\local-server\start.ps1
```

脚本隐藏启动服务，并输出配置及连接文件的位置，不打印令牌。默认监听 `http://127.0.0.1:17321`。首次自动生成随机本地访问令牌；重复运行 setup 保留已有配置。

默认私人文件夹位于扩展源码上一级的 `%APPDATA%/ResumeFillAgent/gateway/`。可用脚本 `-ConfigPath` 参数或 Node 启动时的 `RF_GATEWAY_CONFIG` 环境变量指定其他位置。

1. 更新插件到 0.7.0 并刷新招聘页。
2. 打开插件管理页，点击「导入本地服务连接」，选择私人目录中的 connection.json。
3. 点击「保存 AI 设置」授权本机地址，再「用虚构字段测试连接」。此操作不会发送真实简历。
4. 服务未配置上游时显示 `local-rules`，只是本地确定性规则，不是假装已经连接 AI。

停止服务：

```powershell
powershell -ExecutionPolicy Bypass -File .\local-server\stop.ps1
```

两个脚本只管理 PID 文件指向且命令行符合本服务的进程，不停止其他 Node 应用。没有注册开机自启或系统服务。

## 配置模型

在私人 config.json 中设置以下 upstream 字段，并停止、重新启动服务：

```json
{
  "upstream": {
    "enabled": true,
    "endpoint": "https://你的服务域名/v1/chat/completions",
    "model": "服务支持的模型 ID",
    "apiKey": "只在本地配置中填写",
    "jsonMode": true
  }
}
```

兼容 Chat Completions，完整 URL 可指向 HTTPS 云服务，或 localhost/127.0.0.1 的本地 HTTP 模型服务。供应商不支持 JSON 模式时关闭 jsonMode。未填有效地址/模型时不会以模型模式启动。原配置中的 port/token 等字段应保留。

插件只获得本地访问令牌，上游密钥保留在服务配置和进程内。连接文件含本地令牌，请放私人目录，不提交或分享。服务配置没有加密存储。云端模式仍会将请求数据发往用户配置的服务，不等于资料完全离线。

## 字段与选项

- 字段建议：默认只发送当前页面字段描述和候选 JSON 路径；用户主动勾选附带简历值才发送值。上游只能返回现有字段 ID 与路径，服务和插件分别校验。
- 下拉建议：本地规则无法选择时展示真实候选，点击「AI 建议真实选项」。须先勾选附带简历值；只发送该字段值、标签、上下文和候选集合，不发送整份简历。返回候选 ID 后仍需人工核对，再点击「填写并记住此选项」。重复文本、未知 ID、低置信度会拒绝或保留人工选择。
- 插件始终控制点击和回读；服务没有浏览器驱动、脚本执行或申请提交接口。

## 边界和运行策略

- 仅监听 IPv4 loopback；验证 Host、Bearer 随机令牌；携带 Origin 时仅接受扩展来源。allowedExtensionIds 留空表示持令牌的扩展来源可连接，也可设为具体扩展 ID 列表。
- 所有业务及健康接口都需认证。不接受普通网站 Origin，不使用通配 CORS；预检不返回业务数据。
- 请求最大约 200KB；上游响应最大 300KB；并发最多 4。单次总超时默认 20 秒，断开连接或超时会取消上游请求。
- 上游 429/502/503/504 最多重试一次，仍受总超时约束。不会因为接口错误自动伪造 AI 结果；未配置上游时才使用明确标注的本地规则模式。
- 相同匹配请求内存缓存默认 5 分钟、最多 128 项。过期项不会命中；进程结束缓存消失，不保存简历数据库或请求正文日志。
- 修改配置需重启服务。浏览器重启后会话令牌需重新通过连接文件导入并保存。

## 接口

| 方法/路径 | 内容 |
| --- | --- |
| GET /health | 模式、版本、活动请求数、缓存数，无密钥 |
| POST /v1/match-fields | ResumeFill 字段包，返回 matches |
| POST /v1/match-options | version/kind/fieldId/label/path/value/candidates，返回候选 ID 或 abstain |
| POST /v1/chat/completions | 给现有插件使用的兼容封装，只接受 ResumeFill 匹配数据，不是通用聊天代理 |

## 验证

```text
node local-server/test.cjs
node extension-test.cjs
```

第一组覆盖认证、Host/Origin、两种本地匹配、缓存、大小限制、真实回环模拟上游、密钥隔离、状态重试、输出校验和取消。第二组实际加载 Edge 插件，导入连接文件，经过真实本地网关请求模拟上游，获得真实候选建议，人工确认后填写、回读、记忆并复用。

测试只用虚构数据和模拟上游。尚未配置或验证用户的真实外部模型；OCR、PDF/Word 简历解析和模型安装不在本版本中。
