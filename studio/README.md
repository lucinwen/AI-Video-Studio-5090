# AI Video Studio · 本地创作网页

把素材写进一句话，或添加一张参考图，点击生成。ComfyUI 在本机运行：不用学节点，也不用在创作界面打开 ComfyUI。此开发版没有公共服务、账号、付费 API 或模型自动下载。

## 首次配置（由本机 Codex 或操作者完成）

1. 阅读仓库根的 `AGENTS.md` 和 `docs/LOCAL_CODEX_HANDOFF.zh-CN.md`。先核对 5090 上已经安装的 ComfyUI、模型及其版本，不重复安装或下载。Studio 需要 Node.js 22+。本机启动 ComfyUI，确认本机回环地址为 `http://127.0.0.1:8188`。
2. 用 [官方 Wan 2.2 5B 图](https://docs.comfy.org/tutorials/video/wan/wan2_2)建两个预设，在当前安装中各导出 API JSON：文生预设禁用 LoadImage，图生预设启用 LoadImage。验证输出为 MP4。下方的配置或脚本都不等同于跑通模型。
3. 按 [工作流配置说明](WORKFLOWS.md)产生本机的 `studio/workflows.local.json`。不要把实际提示词、参考图片、权重、机器报告或本机配置提交到 Git。
4. 双击 `studio/START-STUDIO.bat`，或从仓库根运行 `node studio/server.mjs`。浏览器打开终端显示的本机地址（默认 `http://127.0.0.1:8787`）。直接双击 HTML 只能看布局，不会生成。

日常使用时只需要启动本地服务和 ComfyUI，再打开网页。后台故障时保留输入，不显示虚构进度。当前图生模式也需要一句描述画面如何动；不会暗中替用户填提示词。

## 验收边界

- Linux 验证只覆盖 Studio 交互／接口。测试替身没有运行模型，不得当作 GPU 出片。
- 真机：用同一网页跑一次文生和一次图生；在任务中刷新，确认回来后仍看到同一个任务，不会重复提交。两个结果分别正常播放和下载，且能在本机用播放器重开。
- 当前下载用于本机制作：ComfyUI 导出的原件可能含 prompt / workflow 元数据。对外发片前请另外生成并检查去掉这些元数据的分享副本；本版尚无自动清理导出功能。
- Studio 和 ComfyUI 默认只监听本机。不要打开公网端口或反向代理它们。
