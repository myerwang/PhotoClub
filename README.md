# PhotoClub

本地 AI 照相馆控制台，支持人物多视图设定、风格照片生成以及 7-Eleven L/2L 打印尺寸。

## 启动

唯一前提是已经安装并登录 Codex 桌面版，支持 macOS、Windows 和 Linux。不需要预装 Node.js、npm、pnpm、Python、图片工具或系统包管理器。

在 Codex 桌面版中打开本项目并输入“启动 PhotoClub”。启动 Skill 会使用 Codex 内置运行时检测环境、自动安装项目本地依赖、启动服务、完成健康检查并通过系统默认浏览器打开控制台。

环境安装不会调用 Homebrew、winget、apt 或管理员权限，也不会读取或要求 API Key。

## 隐私目录

- `input/`：用户参考照片
- `profiles/`：人物多视图
- `output/`：生成结果

这些目录会保留在仓库中，但其中的实际照片和生成文件不会提交。

风格预览图在首次成功生成后自动写入 `styles/previews/<styleId>.jpg`，每个风格仅保留最近一张本地预览，不提交到 Git。
