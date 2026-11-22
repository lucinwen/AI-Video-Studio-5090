# 把 Wan 2.2 接给 Studio

这份配置只做一次，日常创作者不用打开节点编辑器。Studio 复用现有 ComfyUI，而不是安装另一套推理环境。

## 1. 检查本机运行环境

- 从仓库根的 `AGENTS.md` 和 `docs/LOCAL_CODEX_HANDOFF.zh-CN.md` 开始。先检查现有本机运行时和权重，不要重复下载、覆盖工作环境或调整盘符。
- Studio 需要 Node.js 22+；ComfyUI 需运行在本机。默认地址是 `http://127.0.0.1:8188`。PowerShell 可用 `Invoke-RestMethod http://127.0.0.1:8188/system_stats` 检查服务能否访问；这一步不代表模型可用。
- [内置官方模板](vendor/wan2.2-5b-ti2v.comfy.json) 固定在 Comfy Org release v0.11.114 的具体提交。启动前按 [官方教程](https://docs.comfy.org/tutorials/video/wan/wan2_2)核对本机模型路径和许可。模型和模板不是同一个许可证包。

## 2. 用目标版本的 ComfyUI 导出两个 API 图

打开内置 JSON，保留节点 ID 6（正向提示词）、55（视频潜变量）、56（参考图）和 58（保存视频）。将 SaveVideo 的格式设为 MP4。先用便于验证的短片参数；官方模板的默认值不等于已验证性能。

1. **文字 → 视频**：保持 LoadImage 56 跳过。用不含私有内容的提示词跑一个简短测试，再从当前安装导出 API 格式 JSON。
2. **参考图 → 视频**：启用 LoadImage 56，保留它到 55 的 `start_image` 连线，给 56 一张自有测试图片。用这张图跑一次，再导出 API 格式 JSON。Studio 会用用户选择的参考图替换模板输入。
3. 如果菜单中只有保存普通工作流，在 ComfyUI 设置中打开开发模式，选择 Save (API Format) 或当前版本等价的导出操作。普通画布 JSON 有顶层 `nodes` 数组；API 图按节点 ID 编号，每个节点有 `class_type` 和 `inputs`。不要把普通 JSON 直接提交给生成 API。只配置一个模式也可以。

## 3. 生成本机配置并启动

在仓库根目录的 PowerShell 里执行，替换为刚导出的实际路径：

```powershell
node .\studio\configure-workflows.mjs --text "C:\path\wan-text-api.json" --image "C:\path\wan-image-api.json"
node .\studio\server.mjs
```

也可在完成配置后双击 `studio/START-STUDIO.bat`。浏览器打开终端显示的地址，默认 `http://127.0.0.1:8787`。配置脚本只创建 `studio/workflows.local.json`，不会覆盖已有配置；更新前请先备份旧文件。不要提交本机配置和导出图。只有参考图模式时，网页需要一张参考图和一句动作描述。

## 4. 实机发布门槛

对每个启用的模式，从 Studio 网页用自有测试素材依次验证：提交任务、产生一个真实 MP4、网页播放、下载并用本机播放器重新打开。检查在生成期间刷新网页仍可恢复同一个任务。记录实际的 ComfyUI / 模型版本、模式和运行结果，不把健康检查、节点映射测试、模拟接口或 Linux 联调当成 RTX 5090 出片证明。

ComfyUI 原始 MP4 可能包含提示词和工作流。未经单独清理、检查的本地下载件不作为默认对外分享件。
