# ResumeFill 产品 Wiki

少填一点，多一点可能。ResumeFill 是本地优先的简历填表 Agent，包含 Windows 桌面端和 Chrome / Edge 扩展。

**当前开发测试版：0.26.0** · [下载发行版](https://github.com/Simple-YU-268/ResumeFill/releases/latest) · [项目主页](https://github.com/Simple-YU-268/ResumeFill)

## 从这里开始

1. [安装与首次连接](Getting-Started.md)：安装桌面端、加载扩展、自动配对。
2. [资料与表单学习](Profile-and-Learning.md)：整理资料、导入简历、学习手动填写。
3. [填写与匹配](Autofill.md)：扫描、核对分组、填写与回读。

## 进一步使用

- [AI 与 OCR](AI-and-OCR.md)：模型配置、测试、PDF 解析与图片标签。
- [隐私与安全](Privacy-and-Security.md)：本地存储与外发数据范围。
- [常见问题](Troubleshooting.md)：连接、扫描、下拉和模型错误。
- [开发与发行](Development-and-Releases.md)：源码、验证、构建和发布规则。

## 0.24.0 的变化

家庭成员姓名、证件与出生年月按关系独立匹配和保存，避免使用本人资料。桌面可视化编辑家庭成员；插件可选开启仅在本机保存的手动输入记忆。先选择关系，再扫描；未知或多人关系停止自动匹配。

软件不会自动提交申请。复杂网站仍可能需要人工处理；AI 建议和网页回读均需核对。

仓库内 `docs/wiki/` 是文档源文件，GitHub Wiki 是阅读镜像。实现与历史变更见 [CHANGELOG](https://github.com/Simple-YU-268/ResumeFill/blob/main/CHANGELOG.md)。
