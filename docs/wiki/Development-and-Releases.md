# 开发与发行

## 运行与测试

Node.js 22.13+，建议 Node.js 24。先安装两端依赖并准备允许清单中的运行时资源：

```powershell
npm ci
npm --prefix desktop ci
npm --prefix desktop run prepare:resources
npm test
npm --prefix desktop start
```

`npm run test:browser` 默认使用 Edge，可设置 `BROWSER_CHANNEL` / `BROWSER_EXECUTABLE`。`npm run test:desktop` 覆盖桌面核心、配对与同步；`npm run test:electron` 覆盖 Electron / PDF。部分本地 GUI 测试在无法启动时跳过，跳过不等于通过。

`node scripts/verify-ai-browser.cjs --mock` 使用合成模型。`--live` 显式读取配置并调用真实模型，可能消耗额度；只用合成输入，密钥不写进报告。

## 构建与检查

```powershell
npm run version:check
npm run privacy
npm run build
$env:RF_ARTIFACT_DIR = 'dist/desktop/win-unpacked'
npm run privacy:artifacts
```

改变输出目录时相应修改 `RF_ARTIFACT_DIR`。检查覆盖公开源码、ASAR、允许清单中的扩展 / 网关，不代表整台电脑或旧包通过检查。

## 版本与文档

每个可用版本提交 Git。根包、桌面包、锁文件、manifest 与说明一致。按变更范围升级版本，主版本用于成熟或重大兼容变化，不为小修改机械提升。视觉约定见 `AGENTS.md`。

`docs/wiki/` 为版本化文档源。同步 GitHub Wiki 时，将 `.md` 相对链接转为 Wiki 页面链接。README 面向初次使用者；技术历史保留在 CHANGELOG 和研究记录。

## 发行资产

| 文件 | 用途 |
| --- | --- |
| `ResumeFill-Agent-版本-Setup.exe` | Windows x64 安装程序 |
| `ResumeFill-Extension-版本.zip` | 独立浏览器扩展 |
| `SHA256SUMS.txt` | EXE / ZIP 的 SHA-256 |
| `latest.yml` | 更新器版本、文件、大小及 SHA-512 |
| `*.exe.blockmap` | 配套块映射 |

确认元数据对应实际 EXE、标签指向已审查提交，先 Draft 上传核对，再发布为 Latest。不上传调试文件、私人资料、测试浏览器和旧包。

[返回首页](Home.md)

## 可选：网站原版 Layui 组件测试

此测试不依赖登录或实际报考表单。自行将以下公开组件下载到忽略的 `tmp/` 目录，设置 `RF_LAYUI_BUNDLE` 和 `RF_LAYUI_CSS` 为两个本地文件的路径，再执行 `npm run test:layui`：

- JS 来源：<http://cdn.cpta.com.cn/student_html_yc/libs/layui/layui.js>
- CSS 来源：<http://cdn.cpta.com.cn/student_html_yc/libs/layui/css/layui.css>

测试脚本校验固定 SHA256（见 `scripts/test-real-layui.cjs`），资源变化时停止执行；不会自动下载或更新资源，也不将第三方组件放入源码与发行包。加载后阻断全部网络请求，验证普通/可搜索下拉与静态/重绘的四种组合，使用合成资料。组件测试通过不代表真实网站业务联动已经验证。
