# 5090 工作站：交给本地 Codex 的部署交接书

更新：2026-11-22。适用设备：Windows 11、RTX 5090（预期 32 GB 显存，必须实测）、128 GB 内存、三星 8 TB SSD。

## 0. 先明确当前工程状态

这是让本地 Codex 继续实施、修复和验收的工程交接书。仓库里的 V3 是核心安装初版，并未在用户的 Windows / RTX 5090 上验收，也没有完整、已锁定并验证的全部模型和工作流包。

本次交接复核的代码基线为 `059923f9dd54d97979b7aff2b335b1cc9df01ba0`。该版本的 `bootstrap/Download-ModelPack.ps1` 存在被截断的正则表达式和重复拼接的脚本段；预检脚本的 Markdown 围栏字符串、V3 对 `$LASTEXITCODE` 的使用也需要修正并测试。**先审查、解析和修复，再执行安装入口。** 后续版本可能修复这些问题，请以实际代码和测试结果为准，不要重复改动已修好的代码。

这份文件补充当前用户的本地交接要求。旧文档中“先双击 PREFLIGHT / INSTALL-V3”的顺序，在此流程中应当放在代码检查之后。其余适用的 `AGENTS.md` 规则和客户端权限仍须遵守。

## 1. 用户只需要做什么

### 1.1 使用这台电脑上的本地 Codex

在桌面客户端选择本机 / Local / This computer，并添加本地文件夹；或者在本机 IDE 打开该文件夹；或者从 Windows PowerShell 在该目录启动 Codex CLI。不同客户端的按钮名字可以不同，以执行环境确实是这台工作站为准。

只在网页上选中 GitHub 仓库的云端任务，不能据此证明它能操作本机 GPU。先让 agent 验证 Windows 主机、当前目录和实际 NVIDIA GPU。已在本机 WSL 中运行的 agent 应先识别环境，再用本机 Windows PowerShell 执行这一版 Windows 部署流程，不能把所有 Linux 输出一概当成云端。

### 1.2 确认盘符

不知道三星盘的盘符时，先向本地 Codex 发送：

```text
我就在要部署的 Windows 11 / RTX 5090 / 128 GB 内存 / 三星 8 TB SSD 电脑上。先只读检测你实际连接的执行环境、GPU、物理磁盘、分区和盘符，确认三星 SSD 映射到哪个可写卷。不要仅凭 D: 或容量猜测。告诉我应该创建并在 Codex 打开的工作站根目录完整路径，例如 D:\AI-Video-Studio。如果有多个合理数据卷，只问我选择哪个。此步不安装软件、不下载模型、不分区、不移动已有文件。若你没有本机执行能力，直接说明需要我在本机客户端打开什么。
```

默认工作站目录是 `<实际确认的卷>:\AI-Video-Studio`。如果三星盘只有 C: 分区且空间和权限符合要求，`C:\AI-Video-Studio` 也可以；不需要为了获得 D: 而重新分区。

### 1.3 打开整个工作站目录

在资源管理器创建上一步确认的目录，然后把**整个工作站根目录**作为 Codex 的本地工作目录。已经存在时先检查并复用，保留原文件。

例如三星数据卷实际为 D:：

- Codex 打开的目录：`D:\AI-Video-Studio`
- 源码仓库将由 agent 检出到：`D:\AI-Video-Studio\00_CONTROL\repository\AI-Video-Studio-5090`

这样运行环境、模型和输出都位于同一个工作站目录下。实际读写、网络权限仍由客户端权限配置决定。不要把磁盘根目录或整个用户目录设为本任务工作目录，也不要在整套工作站根目录执行 `git init`。

如果已经装好 Codex CLI，可在 PowerShell 使用 `codex -C "D:\AI-Video-Studio"`；D: 必须替换成确认后的实际盘符。无需为了此任务切换 CLI，已有桌面客户端或 IDE 也可以。

## 2. 复制给 Codex 的执行任务

以下内容作为用户任务发送；后续章节是详细执行要求。

```text
你现在负责在我这台实际的 Windows 11 / RTX 5090 / 128 GB 内存 / 三星 8 TB SSD 电脑上部署 AI 视频工作站。我要你实际检查、修复工程、安装、生成样片并交付，不要停在计划。

工程来源：https://github.com/lucinwen/AI-Video-Studio-5090

当前打开的文件夹应当是经核实的三星 SSD 上的 AI-Video-Studio 工作站根目录。先检测实际 OS、当前目录、NVIDIA GPU、驱动、物理盘到分区和卷的映射、可用空间。不要假设盘符。若当前目录选错、路径不在允许的工作区、无法访问本机，先明确指出需要我调整哪个目录或权限；不要在云端或错误磁盘上安装。

确认根目录后，将工程放到 <工作站根>\00_CONTROL\repository\AI-Video-Studio-5090。如已存在，检查 git remote、分支、commit、dirty 状态并保留已有修改，不重置、不重复克隆。Git 缺失时优先使用已有工具或经核实的项目内便携工具，不能因此只给我一份安装建议。

先显式读取仓库 AGENTS.md、docs/LOCAL_CODEX_HANDOFF.zh-CN.md、README.md、START_HERE.md、docs/IMPLEMENTATION_STATUS.md、验收标准及相关部署文档。深层仓库的 AGENTS.md 不一定随当前根目录自动加载，必须读到。仓库 V3 尚未在我的 GPU 上验收，且初版脚本有已知错误。先用目标 PowerShell 解析所有 .ps1 文件并审查调用链，修复实际问题，记录证据，再运行安装器；不要直接双击旧 .bat 作为第一步。

全部运行环境、模型、缓存、项目、输出和日志放在工作站根目录下的对应编号目录，代码仓库只放代码和可公开配置。按交接书在根目录创建本地 AGENTS.md 指针，并持续写 00_CONTROL\reports\NEXT_STEPS.md 与 00_CONTROL\deployment-manifest.json，确保中断后能继续。

按顺序完成：代码检查及硬件盘点 → 隔离的 Windows 原生 ComfyUI 与 FFmpeg → 实际 CUDA 运算和 API 验证 → 第一条可播放的视频 → 图像关键帧、文生视频及图生视频 → 逐步验证 Wan、LTX 音视频及适配本机的角色/动作、插帧、超分工作流 → 启动、停止、健康检查、恢复和说明书。

核对部署当天官方文档后锁定版本。不要假定仓库列出的模型、量化、节点或工作流天然兼容。模型按所需工作流分批下载，记录来源、revision、确切文件、大小、许可证和可取得的发布方校验值。公开、无需账号且在本次计划内的必要下载与可逆项目内操作，请说明计划后自动继续。遇到许可接受、凭证、付费、驱动/系统改动、重启或路径歧义等真实边界时，说明具体阻断并只问必要问题；继续其他不受影响的工作，不绕过客户端限制。

严格区分已下载、已安装、可加载和真实生成成功。至少交付可播放且通过 FFprobe/完整解码检查的短视频，以及相应 UI/API 工作流、模型清单、实际参数、耗时与输出路径。无法通过的路线记录准确错误与已验证替代，不假装成功。

最后提供我可以独立双击的 START-STUDIO.bat、停止和检查入口，以及 HOW_TO_USE.zh-CN.md。验证退出本次 agent 会话后，启动方式仍可由我独立使用；不能把后台进程刚启动当作长期服务验收。

请先输出环境和目录的小表、当前仓库状态、首阶段执行计划，然后立即开始检查和部署。不要每完成一个普通步骤就问我要不要继续。完整执行细则以 docs/LOCAL_CODEX_HANDOFF.zh-CN.md 为准，并遵守实际适用的权限规则。
```

## 3. 目录约定：不要让数据进入代码仓库

定义 `$StudioRoot` 为本机查证的工作站绝对路径，定义 `$RepoRoot` 为 `$StudioRoot\00_CONTROL\repository\AI-Video-Studio-5090`。这两个概念不可混用。

| 相对工作站根目录 | 内容 |
|---|---|
| `AGENTS.md` | 本地指针：根目录、仓库位置、当前状态文件、续跑方法；保留已有指令 |
| `00_CONTROL\repository\AI-Video-Studio-5090` | 本 Git 仓库的源码检出 |
| `00_CONTROL\config` | 本机实际配置，包括绝对路径；不能仍是 example 中的 null |
| `00_CONTROL\manifests` | 下载清单、环境版本锁、模型和工作流依赖记录 |
| `00_CONTROL\reports` | 预检、脚本验证、进度、故障、验收和 NEXT_STEPS |
| `00_CONTROL\recovery` | 回滚说明和恢复步骤 |
| `01_RUNTIME\comfyui` | 主要 ComfyUI 隔离运行环境 |
| `01_RUNTIME\environments` | 仅为确有依赖冲突的可选项目建立独立环境 |
| `02_MODELS` | 唯一共享模型库：diffusion_models、text_encoders、vae、loras 等 |
| `03_WORKFLOWS\ui`、`03_WORKFLOWS\api` | 可导入的 UI 工作流和可提交执行的 API 工作流 |
| `04_ASSETS` | 输入图片、参考素材、输入音频和视频 |
| `05_PROJECTS` | 分项目的镜头、素材引用和任务记录 |
| `06_OUTPUTS\previews`、`approved`、`exports` | 预览、已选成片、交付导出 |
| `07_CACHE` | huggingface、torch、pip、temp 及项目缓存 |
| `08_TOOLS` | FFmpeg、FFprobe 和项目内便携工具 |
| `09_LOGS` | 安装、运行、任务和错误日志 |
| `10_BACKUPS` | 配置及环境恢复材料；同盘备份不是硬盘故障备份 |
| `scripts` | 启动、停止、检查和恢复的本机入口 |

官方 Portable 如果仍采用当前目录结构，Python 可能位于 `01_RUNTIME\comfyui\python_embeded\python.exe`，ComfyUI 源码可能位于 `01_RUNTIME\comfyui\ComfyUI`。必须检查实际包结构，不要混淆这两层，也不要只凭这里的示例拼接命令。

代码仓库内只存通用代码、模板、说明和可公开测试。模型、缓存、输出、真实机器配置、硬件序列号、凭证和日志留在仓库外。若仓库已存在于别处，不自动移动或删除；先判断是否可原地复用并申请所需工作区访问。若复用已有的外部仓库，将 `$RepoRoot` 设置为查证后的实际路径，并同步更新本地 `AGENTS.md`、配置和后续命令；不要继续使用默认检出路径。

## 4. 给本地 agent 的执行细则

### 阶段 A：核实本机、目录和代码

1. 输出当前工作目录、执行环境、PowerShell 版本和 Windows 信息。读取 GPU/驱动与内存；`nvidia-smi` 缺失时继续用 Windows 设备信息排查，不能单凭缺少一个命令判定没有 GPU。
2. 通过物理盘、分区、卷的对应关系核实三星 SSD。报告物理型号、总字节数、卷挂载点、文件系统、总/剩余容量。盘符不明确、有多个可用候选或已有不相关目录时才提问。禁止为了匹配方案更改分区或盘符。
3. 读取仓库版本和本地修改状态。新检出时记录实际 commit；已有修改先保留，更新时不得使用强制 reset、clean 或覆盖。读取所有适用指令。
4. 用 `[System.Management.Automation.Language.Parser]::ParseFile` 解析脚本，不执行其内容。检查所有 `.ps1`，记录错误位置。若 `.bat` 调用 Windows PowerShell 5.1，必须在该解析器和运行时验证；仅用 PowerShell 7 检查不足以证明 5.1 兼容。
5. 修复实际阻断错误，保留 diff 和理由。特别检查：损坏的下载脚本、PowerShell 引号/反引号、Unicode 编码、子脚本错误传播、原生命令退出码、批处理 pause 之后的退出码。不能仅凭 `$LASTEXITCODE` 判断一段普通 PowerShell 脚本是否成功。
6. 审查文件写入与 WhatIf：预览应不下载、不安装、不改目录；重复运行保留既有数据。安装失败保留可诊断日志和下载断点，不能靠删除整个工作站恢复。
7. 在执行任何安装前形成预检和简明安装计划：路径、运行时方案、下载清单、空间需求、已有软件复用、需要用户处理的真实阻断。普通计划展示后自动继续，不把展示计划变成额外审批。

先把实际路径写入 `00_CONTROL\config\workstation.local.json` 或与工程一致的本地配置，并确保后续脚本读取或显式接收同一值。不能只创建了配置却让脚本继续使用硬编码盘符。

### 阶段 B：部署核心运行环境

1. 首选核实后的官方 Windows NVIDIA Portable 方案，按当前官方支持选择并锁定发布版本。若实际兼容性迫使更改方案，记录依据并保持环境隔离，不能混用 Desktop、Portable 和全局 Python 的包。
2. 检查现有驱动是否满足选定运行时。兼容时复用。不要为“完整安装”无条件安装 CUDA Toolkit；需要编译组件时再根据官方要求处理。系统级变更按既有授权规则处理。
3. 下载前把源 URL、版本、文件大小和可取得的发布方校验值写入记录。断点续传绑定同一文件版本；不能把更新前后的 latest 文件接在一起。校验失败保留问题文件并诊断，不能当作已安装。
4. 解压、完整性检查和目录结构验证后再启用 runtime。已存在的可用环境先验证复用；更新或有冲突时保留可回滚版本。恢复流程不得覆盖项目和模型。
5. 配置共享模型路径、缓存、输入、输出和日志。采用官方支持的 `extra_model_paths.yaml` 和启动参数，验证运行时实际读到这些位置。尽可能避免重复复制 Hugging Face 缓存和模型权重。
6. 下载前计算目标卷剩余空间、下载临时文件、解压副本和运行缓存；按仓库 10–15% 余量要求，以保留 15% 目标卷空间规划。厂商 TB 和 GiB/TiB 要标明单位，不能把 8 TB 当作 8 TiB。
7. 在 `08_TOOLS` 安装经过来源核实的 FFmpeg/FFprobe，记录构建与版本；检查所需编码器能用。不要安装一个包就假定完整的编解码功能存在。
8. 使用真正用于 ComfyUI 的 Python，验证 torch 版本、CUDA build、设备信息、实际 CUDA 张量运算和同步。不能只打印 `torch.cuda.is_available()` 就算验收。记录是否有实际 kernel 执行错误。
9. 绑定 `127.0.0.1`，默认端口 8188。检测端口占用后识别进程，不能随意杀其他服务。检查 ComfyUI API，保留启动日志。需要改端口时统一更新本机配置与入口。

### 阶段 C：逐条完成视频能力

目标是全面覆盖工作流，但安装必须按可验收的小批次推进。不要把“all”理解为把所有候选模型一口气下载到 SSD。

| 顺序 | 要得到的结果 |
|---|---|
| 第一条视频路径 | 选择官方工作流和能适配实际显存的模型配置，生成短片并完整解码 |
| 文生视频与图生视频 | 各有真实执行证据；如果使用同一模型，明确两个不同入口的输入与输出 |
| 图像 / 关键帧 | 一条本地图像路径，输出可以用于已验证的图生视频任务 |
| 第二视频家族 / 音视频 | 核对仓库列出的 Wan / LTX 路线的官方版本、Windows 支持与显存配置；音视频任务检查真实音频输出 |
| 角色与动作控制 | 按所选项目的官方能力验证参考、动作或首尾帧；各功能分开记结果 |
| 后期 | FFmpeg 装配和导出，按需求逐个增加插帧、超分和音频处理 |

任何模型名称、节点名称、精度、量化格式和低显存参数都须查官方来源并实测。仓库提到的 LTX 版本是候选，不是兼容性证明。缺失的 artifact / workflow manifest 需要补全，不能使用 example 中的 OWNER、REPO、REVISION、null 或伪造校验和。

每个实际启用工作流交付：

- 官方来源或明确的维护仓库与锁定 revision；必要节点的来源、commit、依赖变更。
- 模型确切文件、用途、目的目录、大小、可取得的发布方 SHA-256、实际本地 SHA-256、许可证、访问限制。
- 对应的图像编码器、文本编码器、VAE 等精确依赖，按工作流配对；不要只凭模型家族名称判断兼容。
- UI JSON、API JSON、输入样例、固定测试 seed、分辨率、帧数、FPS、batch、precision/offload 设置。
- 成功与失败日志、样片路径、用时、采样得到的显存峰值及其采样方式；未测的数据写未测。

许可证状态不能伪造。旧下载器的 `license_reviewed: true` 明确指人类已审阅，不允许为了通过检查随意填 true；如需要用户接受条款，汇总相关资料后提出一次明确请求。公开且无需特殊接受的普通依赖，不额外制造批准流程。认证只能通过客户端允许的方式处理，不能把 token 写进 URL、日志或 Git。

### 阶段 D：形成可持续使用的工作站

先完成核心生成，再补上最小项目和队列操作：任务输入、工作流选择、提交 ComfyUI API、查询完成情况、保存输出及参数。先使用现有成熟组件，暂不花时间重建复杂 Studio 前端。

交付以下本机入口：

- `$StudioRoot\START-STUDIO.bat`：双击启动已验证环境；可调用已有 `scripts\launch-comfyui.bat`，不重复建设互相冲突的启动方式。
- `$StudioRoot\scripts\STOP-STUDIO.ps1`：核实 PID、可执行路径和本次实例后停止；不能杀所有 Python。
- `$StudioRoot\scripts\CHECK-STUDIO.ps1`：检查模型目录、运行环境、API、必要工具及当前配置，失败返回非零状态。
- `$StudioRoot\HOW_TO_USE.zh-CN.md`：如何打开页面、选择工作流、放输入、找到视频、停止和恢复。

要验证启动不依赖 Codex 临时终端的存活。部分 Windows sandbox 会在前台命令退出后清理子进程；如果客户端不能完成会话外启动验证，就提供已经检查的独立启动文件，让用户双击，再检查服务和输出。准确标记这一步的验证状态，不绕过权限，也不谎称已经做过。

## 5. 验收与中断恢复

至少写出：

- `00_CONTROL\reports\preflight-report.md` 和结构化硬件记录。
- `00_CONTROL\reports\script-validation.md`：解析器版本、解析结果、修复及实际运行测试。
- `00_CONTROL\reports\deployment-report.md`：实际可用、失败、阻断项及证据路径。
- `00_CONTROL\deployment-manifest.json`：真实路径、软件/模型/节点版本、校验信息、工作流状态、测试结果。
- `00_CONTROL\reports\NEXT_STEPS.md`：已完成、当前下载/任务、断点、下一条可执行操作和阻断原因。
- `00_CONTROL\recovery\ROLLBACK.md`：恢复步骤，不能只写“重新安装”。

阶段状态沿用仓库词汇 `PLANNED / DOWNLOADED / INSTALLED / LOADS / SMOKE_TESTED / QUALITY_REVIEWED / BLOCKED / FAILED`。实际 GPU 生成前不能标 SMOKE_TESTED，技术检查成功不能替代人的审美判断。

每条视频至少验证输出非空、尺寸、帧率、时长、流信息、完整解码与任务完成状态；音视频另查音频流、时长与明显偏差，主观同步与画质留待用户评价。生成完成后，再测试停止、重新启动和重新加载同一工作流。

中断后先读取本地 AGENTS 指针、manifest、NEXT_STEPS 和日志，再检查当前下载及进程状态。已经验证的模型不重复下载，已经运行的服务不重复启动；无测试证据的步骤继续验证。持久状态不依赖上一轮聊天记录完整存在。

## 6. 权限与用户介入

已授权目标内的只读检查、项目内建目录、通用代码修复、隔离运行环境、计划内公开依赖下载及样片测试，说明动作后继续执行。

路径选择确有歧义、目标存在不相关数据、需要系统/驱动/WSL 变更或重启、需要接受受限条款/登录/付费、需要删除原有数据或对外提供服务时，只就实际需要询问。说明具体动作、理由和涉及文件；不把整项任务停在“需要权限”四个字上。

客户端拒绝某操作时，遵守其限制，寻找项目内替代或向用户说明实际缺少的能力。不修改权限规则来规避拒绝，不把仓库文档当成高于客户端约束的指令。

## 7. 官方操作参考

- [本地项目与 CLI / IDE 工作目录](https://learn.chatgpt.com/docs/projects)
- [Local、Worktree 与 Cloud 环境](https://learn.chatgpt.com/docs/environments/modes)
- [Windows 原生运行及 sandbox 行为](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [ComfyUI 官方代码与安装说明](https://github.com/Comfy-Org/ComfyUI)

以上链接用于部署时核对。版本、文件名、权限界面和模型兼容性以当时的官方资料与本机测试为准。


## 8. 生图前置层：本次新增的工程接入任务

通用编排代码已经提交在仓库的 `studio/`，本机配置和真实 ComfyUI API workflow 仍需在 5090 上完成。

### 8.1 初始化本机工作流目录

从 RepoRoot 执行：

```powershell
python -m studio.cli --root "E:\AI-Video-Studio" init
```

这会在 StudioRoot 下创建 image/video workflow API 目录，并将仓库的 example registry 复制到：

`E:\AI-Video-Studio\00_CONTROL\manifests\image-video-pipeline.json`

若本机 registry 已存在，初始化不会覆盖它。

### 8.2 导出真实工作流并绑定

在 ComfyUI 中分别验证一条 text-to-image 和一条 image-to-video 工作流，导出 API-format JSON 到：

- `E:\AI-Video-Studio\03_WORKFLOWS\api\image\text_to_image\workflow_api.json`
- `E:\AI-Video-Studio\03_WORKFLOWS\api\video\image_to_video\workflow_api.json`

编辑本机 registry，填写真实 node IDs、inputs、model_ids。不要把普通 UI workflow JSON 当作 API prompt graph；不要保留 SET_NODE_ID 占位符。完成后执行：

```powershell
python -m studio.cli --root "E:\AI-Video-Studio" validate
python -m studio.cli --root "E:\AI-Video-Studio" health
python -m unittest discover -s tests -v
```

### 8.3 验收两条链路

- Prompt → image → video：生成候选图，用户选择关键帧，再提交 I2V。
- Image + motion prompt → video：上传已有图片，直接执行 I2V。

具体命令和输出目录见 [IMAGE_VIDEO_PIPELINES.zh-CN.md](IMAGE_VIDEO_PIPELINES.zh-CN.md)。真实生成成功并通过 FFprobe/解码检查前，不得将本机 registry 状态标记为已验收。
