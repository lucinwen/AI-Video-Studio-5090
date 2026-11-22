# 生图前置层与图生视频管线

## 目标

在同一套 ComfyUI 运行时中增加可选的图像生成前置层。图像模型与视频模型保持独立、可替换；由注册表将经过本机验证的 API 工作流连接起来。

优先提供两条主链：

1. 提示词 → 生图 → 选择关键帧 → 图生视频（prompt-to-image-to-video）
2. 已有图片 + 动作提示词 → 图生视频（image-to-video）

参考图重绘/角色关键帧作为可选扩展，不阻塞前两条。

## 架构决定

不把所有节点塞进一个庞大的 ComfyUI 图。图像模型和视频模型可能使用不同权重、文本编码器、VAE、节点、显存配置和更新周期。将它们拆成独立 API 工作流，Studio 只负责串联、传递图片和记录任务。

ComfyUI 官方支持本地 API、图像生成、图像编辑和视频工作流。本工程使用其本地 HTTP API：
- POST /prompt：提交 API-format workflow
- GET /history/{prompt_id}：等待执行完成并读取输出
- POST /upload/image：上传用户图片或选中的关键帧
- GET /view：下载生成结果

官方资料：
- https://github.com/Comfy-Org/ComfyUI
- https://docs.comfy.org/development/comfyui-server/comms_routes

## 工作站目录

下列路径相对于工作站根目录。源码仓库单独管理。

    00_CONTROL\manifests\image-video-pipeline.json
    03_WORKFLOWS\api\image\text_to_image\workflow_api.json
    03_WORKFLOWS\api\image\reference_to_image\workflow_api.json
    03_WORKFLOWS\api\video\image_to_video\workflow_api.json
    05_PROJECTS\<project>\runs\<run-id>\images
    05_PROJECTS\<project>\runs\<run-id>\videos
    05_PROJECTS\<project>\runs\<run-id>\inputs
    05_PROJECTS\<project>\runs\<run-id>\metadata\run.json
    05_PROJECTS\<project>\runs\<run-id>\metadata\<workflow-key>.api.json

真实 API 工作流必须从本机已安装并成功运行的 ComfyUI workflow 导出。仓库不提供伪造的节点图，也不把占位节点 ID 当成可运行工作流。

## 初始化

在 Git 仓库根目录运行以下命令，将 `<StudioRoot>` 替换为工作站根目录。Windows Portable 内嵌 Python 可以用同一入口，命令中的 `python` 换成内嵌的 `python.exe` 路径。

    python run_studio.py --root "<StudioRoot>" init

该命令创建工作流目录，并在本机 registry 缺失时从 example 初始化。已有 registry 会保留。标准 Python 也支持 `python -m studio.cli`。

## 配置真实工作流

1. 在 ComfyUI 中先单独运行一条 text-to-image 工作流和一条 image-to-video 工作流。
2. 从 ComfyUI 导出 API format JSON（不是普通 UI workflow JSON）。
3. 将 API JSON 分别保存到：
   - `03_WORKFLOWS/api/image/text_to_image/workflow_api.json`
   - `03_WORKFLOWS/api/video/image_to_video/workflow_api.json`
4. 编辑本机的 `00_CONTROL/manifests/image-video-pipeline.json`，按图中的节点与输入配置绑定。
   - 把 SET_NODE_ID 换成 API JSON 中真实 node ID；
   - input 必须是该节点 inputs 对象中真实存在的字段；
   - text-to-image 至少绑定正向提示词和 seed；
   - image-to-video 至少绑定 LoadImage.image 与 motion prompt；
   - 图中有独立输入时才绑定 negative prompt、camera prompt 或 style prompt。单文本输入的图生视频工作流可以把镜头动作写进主动作提示词；
   - 使用 `model_ids` 和 `model_revisions` 记录所用文件及其锁定版本。
5. 只有模型、节点、API JSON 和绑定均可用时，才设置 enabled=true。
6. 执行 `python run_studio.py --root "<StudioRoot>" validate`。每条绑定都必须指向真实节点及输入，即使参数值可省略。

在 registry 顶层设置可选的 `media_validation` 对象以启用自动检查。将 `ffprobe` 和 `ffmpeg` 指向工作站根目录内的实际可执行文件，值使用相对于根目录的路径。Studio 用 FFprobe 读取流、时长和帧数，再用 FFmpeg 完整解码视频流及存在的音频流。失败的检查会中止本次验收。

## 使用方式

### A. 纯提示词 → 图片 → 视频

    python run_studio.py --root "<StudioRoot>" run prompt-to-image-to-video --prompt "A yellow paper boat on rainwater, cinematic lighting" --video-prompt "The boat drifts slowly as ripples spread. Gentle camera push-in." --negative-prompt "flicker, text, hard cut" --project "paper-boat" --seed 20261122

命令会列出候选图的路径并等待你输入序号。候选数量由生图工作流决定。自动化运行时可用 `--image-index 0` 之类的参数指定序号。Studio 通过 ComfyUI 的上传接口把选中的图送入图生视频工作流。

### B. 已有图片 + 提示词 → 视频

    python run_studio.py --root "<StudioRoot>" run image-to-video --image "<StudioRoot>\04_ASSETS\my-character.png" --prompt "The character smiles gently and waves at the camera. Slow camera push-in." --project "my-character" --seed 20261122

### 输出记录

每次运行使用独立目录，保存候选图、视频、输入副本、提交给 ComfyUI 的 API 图和 `metadata/run.json`。记录包括所选序号、提示词、seed、模型版本、ComfyUI prompt ID、阶段耗时、输出路径和 SHA-256。配置媒体检查后，记录还包含 FFprobe 的流信息和完整解码结果。

## 图像模型策略

不要把一个模型硬编码成唯一选择。ComfyUI 官方工作流库目前涵盖 SDXL、Flux、Qwen Image、Z-Image、Hunyuan Image 等多种图像家族。由本机 Codex 根据部署当天的官方模板、RTX 5090 实测显存、Windows/Blackwell 兼容性、许可证与下载量选择一个主图像模型。第一阶段只部署一条图像路线，避免重复下载多个大模型。参考图重绘需要时再单独启用 reference_to_image。

官方模型与工作流目录：
- https://comfy.org/hub/workflows/?capability=Text%20to%20Image
- https://github.com/Comfy-Org/ComfyUI

## 交付边界

仓库提供通用 API 编排器和 registry 模板；不包含虚构的模型节点图，也不声称已在用户的 RTX 5090 上生成样片。必须在本机导出真实 API workflow 并生成视频后，才能将工作流标记为 SMOKE_TESTED。画面质量还需要人工 QUALITY_REVIEWED。
