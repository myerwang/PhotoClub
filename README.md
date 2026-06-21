# PhotoClub

本地 AI 照相馆控制台，支持人物多视图设定、风格照片生成以及 7-Eleven L/2L 打印尺寸。

## 启动

需要 macOS、Node.js，以及已登录的 Codex 桌面应用。

```bash
npm start
```

服务会启动本地控制页面。完整使用方法见 [`docs/SYSTEM_USAGE.md`](docs/SYSTEM_USAGE.md)。

## 隐私目录

- `input/`：用户参考照片
- `profiles/`：人物多视图
- `output/`：生成结果

这些目录会保留在仓库中，但其中的实际照片和生成文件不会提交。

风格预览图在首次成功生成后自动写入 `styles/previews/<styleId>.jpg`，每个风格仅保留最近一张本地预览，不提交到 Git。
