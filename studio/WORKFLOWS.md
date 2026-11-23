# 把本机 ComfyUI 工作流接给 Studio

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

如果要用**复用参考图／同种子对比**，请保留官方模板的 KSampler 节点 3，并在导出前把 `seed` 设为非负安全整数，例如 `42`。配置器只在能确认这个整数输入时开启固定种子；旧配置仍能普通生成，不需要为了普通生成重新配置。固定种子便于对照修改前后，不保证在模型、参数或软件环境变化后逐像素一致。

## 3. 选配文生图

如果本机已经能在 ComfyUI 生成静帧，可增加「文字 → 图片」。此步骤不安装模型、不下载权重、不执行自定义节点；视频不依赖它。只接受先在本机用自有提示词跑通、再用 **Save (API Format)** 导出的常规 SD 风格单图节点图。选已安装的相对路径 `.safetensors`；不要导入来源不明的模型或工作流。暂不支持前端画布 JSON、参考图／修图、Flux 等其他拓扑、LoRA、自定义节点和多输出。

可用 [ComfyUI 官方首张图片教程的内置节点图](https://github.com/Comfy-Org/docs/blob/main/get_started/first_generation.mdx) 核对连线；只复用结构，不要求下载教程的模型。只保留这 7 个节点（数字 ID 可不同，按连线确定哪个 `CLIPTextEncode` 为正向）：

| 节点 | 必须保留的连线与设置 |
| --- | --- |
| CheckpointLoaderSimple ×1 | MODEL (0) → KSampler.model；CLIP (1) → 正、负两个 CLIPTextEncode.clip；VAE (2) → VAEDecode.vae |
| CLIPTextEncode ×2 | 分别连 KSampler 的 `positive` 和 `negative`；Studio 只改正向 `text`，负面保留 |
| EmptyLatentImage ×1 | 输出接 KSampler.latent_image；`batch_size=1`，宽高 64–2048 人工选定、且为 8 的倍数 |
| KSampler ×1 | 输出接 VAEDecode.samples；`seed` 非负安全整数，`steps` 1–100，`cfg` 0–30，`denoise` 0–1；采样器和调度器选本机 ComfyUI 已支持的名称 |
| VAEDecode ×1 | 输出接 SaveImage.images |
| SaveImage ×1 | 导出可沿用现有名称；Studio 会将输出前缀统一为 `StudioStill`，不沿用导出图内路径 |

只启用文生图时可单独运行 `node .\studio\configure-workflows.mjs --still "C:\path\still-api.json"`。这样只启用静帧，不会顺带启用任一视频模式。

## 4. 生成本机配置并启动

在仓库根目录的 PowerShell 里执行，替换为刚导出的实际路径：

```powershell
node .\studio\configure-workflows.mjs --text "C:\path\wan-text-api.json" --image "C:\path\wan-image-api.json"
node .\studio\server.mjs
```

已有视频工作流，想在不丢失它们的情况下追加文生图：**先退出 Studio，确认手里有原来仍要使用的 API 导出，再把旧本机配置原样移到一个新的备份名**。不要在现有路径上覆盖。下面是要启用三种模式的示例，省略本来就不需要的模式。

```powershell
$backup = ".\studio\workflows.local.backup-$(Get-Date -Format yyyyMMdd-HHmmssfff).json"
if (Test-Path -LiteralPath $backup) { throw "备份路径已存在" }
Move-Item -LiteralPath ".\studio\workflows.local.json" -Destination $backup -ErrorAction Stop
node .\studio\configure-workflows.mjs --text "C:\path\wan-text-api.json" --image "C:\path\wan-image-api.json" --still "C:\path\still-api.json"
```

如果生成失败且原位置没有新文件，把刚才的备份移回原名；不要删除备份。配置脚本只创建 `studio/workflows.local.json`，不会覆盖已有配置，也不会验证模型已能出图。勿提交本机配置、备份和导出图。完成后启动服务器或双击 `studio/START-STUDIO.bat`，打开终端显示的地址（默认 `http://127.0.0.1:8787`）。只有参考图视频模式时，网页需要一张参考图和一句动作描述。

## 5. 实机发布门槛

对每个启用的视频模式，从 Studio 网页用自有测试素材依次验证：提交任务、产生一个真实 MP4、网页播放、下载并用本机播放器重新打开。若启用文生图，另外验证同一提交返回真实 PNG、网页预览、下载、本机查看；另用这张自有 PNG 验证下一步图生视频（如已配置）。检查在生成期间刷新网页仍可恢复同一个任务。记录实际的 ComfyUI / 模型版本、模式和运行结果，不把健康检查、节点映射测试、模拟接口或 Linux 联调当成 RTX 5090 出片证明。

ComfyUI 原始 PNG／MP4 都可能包含提示词和工作流。未经单独清理、检查的本地下载件不作为默认对外分享件。
