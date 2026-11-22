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

在 E:\AI-Video-Studio（不是 Git 仓库内部）：

    00_CONTROL\manifests\image-video-pipeline.json
    03_WORKFLOWS\api\image\text_to_image\workflow_api.json
    03_WORKFLOWS\api\image\reference_to_image\workflow_api.json
    03_WORKFLOWS\api\video\image_to_video\workflow_api.json
    05_PROJECTS\<project>\runs\<run-id>\images
    05_PROJECTS\<project>\runs\<run-id>\videos
    05_PROJECTS\<project>\runs\<run-id>\inputs
    05_PROJECTS\<project>\runs\<run-id>\metadata\run.json

真实 API 工作流必须从本机已安装并成功运行的 ComfyUI workflow 导出。仓库不提供伪造的节点图，也不把占位节点 ID 当成可运行工作流。

## 初始化

在 Git 仓库根目录执行：

    python -m studio.cli --root "E:\AI-Video-Studio" init

该命令创建工作流目录，并在本机 registry 不存在时复制 example。已存在的 registry 不会被覆盖。

## 配置真实工作流

1. 在 ComfyUI 中先单独运行一条 text-to-image 工作流和一条 image-to-video 工作流。
2. 从 ComfyUI 导出 API format JSON（不是普通 UI workflow JSON）。
3. 将 API JSON 分别保存到：
   - E:\AI-Video-Studio\03_WORKFLOWS\api\image\text_to_image\workflow_api.json
   - E:\AI-Video-Studio\03_WORKFLOWS\api\video\image_to_video\workflow_api.json
4. 编辑 E:\AI-Video-Studio\00_CONTROL\manifests\image-video-pipeline.json：
   - 把 SET_NODE_ID 换成 API JSON 中真实 node ID；
   - input 必须是该节点 inputs 对象中真实存在的字段；
   - text-to-image 至少绑定正向提示词和 seed；
   - image-to-video 至少绑定 LoadImage.image 与 motion prompt；
   - 按工作流实际情况绑定 negative prompt、camera prompt、style prompt；
   - 填写真实 model_ids 和 revision。
5. 只有模型、节点、API JSON 和绑定均可用时，才设置 enabled=true。
6. 执行 validate；任何占位符、缺失节点或字段都会导致验证失败。

## 使用方式

### A. 纯提示词 → 图片 → 视频

    python -m studio.cli --root "E:\AI-Video-Studio" run prompt-to-image-to-video --prompt "A young woman in a red coat standing in a rainy neon-lit Tokyo street, cinematic composition" --video-prompt "She slowly turns toward the camera as rain falls; subtle dolly-in, natural cloth movement" --negative-prompt "deformed hands, flicker, duplicate person" --style-prompt "cinematic, realistic lighting, detailed environment" --project "tokyo-rain" --seed 20261122 --image-index 0

生图阶段会保存所有候选图片，默认选择第 0 张作为关键帧；用 --image-index 1 选择第二张。选中的图像会通过 ComfyUI upload API 送入图生视频工作流。

### B. 已有图片 + 提示词 → 视频

    python -m studio.cli --root "E:\AI-Video-Studio" run image-to-video --image "E:\AI-Video-Studio\04_ASSETS\my-character.png" --prompt "The character smiles gently and waves at the camera; slow camera push-in" --project "my-character" --seed 20261122

### 输出记录

每次运行创建唯一 run 目录，保存候选图、视频、输入图片副本和 metadata/run.json。记录 prompt、seed、workflow ID、ComfyUI prompt ID、阶段耗时和输出路径。不会覆盖已有成片。

## 图像模型策略

不要把一个模型硬编码成唯一选择。ComfyUI 官方工作流库目前涵盖 SDXL、Flux、Qwen Image、Z-Image、Hunyuan Image 等多种图像家族。由本机 Codex 根据部署当天的官方模板、RTX 5090 实测显存、Windows/Blackwell 兼容性、许可证与下载量选择一个主图像模型。第一阶段只部署一条图像路线，避免重复下载多个大模型。参考图重绘需要时再单独启用 reference_to_image。

官方模型与工作流目录：
- https://comfy.org/workflows/tag/text-to-image/
- https://github.com/Comfy-Org/ComfyUI

## 交付边界

仓库提供通用 API 编排器和 registry 模板；不包含虚构的模型节点图，也不声称已在用户的 RTX 5090 上生成样片。必须在本机导出真实 API workflow 并生成视频后，才能将工作流标记为 SMOKE_TESTED。画面质量还需要人工 QUALITY_REVIEWED。
