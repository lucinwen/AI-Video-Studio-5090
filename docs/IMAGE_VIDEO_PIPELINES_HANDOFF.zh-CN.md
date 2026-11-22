# 交给本机 Codex：接入生图前置层

通用代码已放入仓库 studio/。请在实际 Windows 11 / RTX 5090 工作站完成本机工作流配置与验收。

1. 读取 AGENTS.md 与 docs/IMAGE_VIDEO_PIPELINES.zh-CN.md。
2. 在仓库根目录运行 `python run_studio.py --root "<StudioRoot>" init`。Windows Portable 可将 `python` 换成内嵌的 `python.exe`。
3. 检查 ComfyUI API、GPU、现有图像/视频模型与节点；优先复用现有安装。
4. 从 ComfyUI 官方工作流库选择一条适合本机的 text-to-image 工作流和一条 image-to-video 工作流。图像模型按当日官方模板、RTX 5090 32GB、Windows/Blackwell 兼容性、许可证和实测显存选择一个主方案；不要未经核验下载多个候选模型。
5. 在 ComfyUI 中真实运行两个基础工作流，确认图片和视频都成功输出，再导出 API format JSON。
6. 将 JSON 保存到 StudioRoot 的 03_WORKFLOWS/api 对应目录。
7. 根据真实 API JSON 的 node ID 和 inputs 编辑本机 00_CONTROL/manifests/image-video-pipeline.json。不要猜节点 ID，不要把 UI workflow JSON 当 API JSON。
8. 启用两个 registry entry，用 `python run_studio.py --root "<StudioRoot>" validate` 检查真实节点与字段。在 registry 的 `media_validation` 配置工作站内的 FFprobe 和 FFmpeg，以便将检查结果写入每次运行记录。
9. 验收两条主链：
   - `prompt-to-image-to-video` 生成图片后，在终端输入候选序号并保存视频。
   - `image-to-video` 使用另一张本地图片和动作提示词，确认上传和视频输出都成功。
10. 核对两条链路的 FFprobe 记录、分辨率、帧率、帧数、时长、流类型和完整解码退出码。记录真实参数、耗时、模型版本、日志和有实测数据的显存采样。ComfyUI 的部分核心视频节点会把输出列在历史记录的 `images` 下，Studio 会按媒体类型识别实际产物。
11. 真实跑通前只能标记 PLANNED / INSTALLED / LOADS，不要伪造 SMOKE_TESTED。
12. 更新本机 registry、deployment manifest、deployment report 和 NEXT_STEPS.md。模型权重、真实工作流中的私有路径、输入素材、生成视频和敏感信息不要提交到 Git。
13. 审查 Git diff，在仓库根目录运行单元测试，然后提交并 push 通用代码和文档。标准 Python 用 `python -m unittest discover -s tests -v`。Windows Portable 内嵌 Python 需要显式加入仓库的导入路径。在 PowerShell 中可使用以下命令，`$python` 指向内嵌解释器。

    ```powershell
    & $python -B -c 'import sys; sys.path.insert(0, sys.argv.pop(1)); import unittest; unittest.main(module=None)' $PWD.Path discover -s tests -v
    ```

ComfyUI API 参考：
https://docs.comfy.org/development/comfyui-server/comms_routes
