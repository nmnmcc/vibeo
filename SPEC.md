# Vibeo SPEC

## 1. 项目概述

Vibeo 是 Video + Vibe 的组合词，是一个由 AI Agent 驱动的视频生成平台，第一阶段主要面向教学视频生成。

Vibeo 不直接使用视频生成模型来生成最终视频。系统会让 AI Agent 先理解教学目标，再编写结构化脚本，随后生成可执行的 Manim CE Python 代码。Agent 每次形成一个可运行版本时，会将 Workspace 提交为 Git commit；系统监听 commit 并自动触发预览渲染。用户认可预览效果后，可以直接基于某个 commit 或预览版本触发高质量渲染，这一步不需要再经过 Agent。

Vibeo 的核心判断是：教学视频需要准确、可控、可复现、可调试，而不是只追求“看起来像视频”。因此最终产物必须包含视频本身，也必须保留脚本、源码、渲染日志、抽帧结果和审查报告。

核心流程：

```text
用户需求
  -> 视频脚本
  -> Manim Python 代码
  -> Git commit
  -> 自动预览渲染
  -> 抽帧审查
  -> 修正迭代
  -> 用户确认
  -> 高质量渲染
  -> 最终视频与完整产物
```

## 2. 产品目标

### 2.1 主要目标

- 生成画面精美、内容准确、结构清晰的教学视频。
- 使用 Manim CE 构建可控动画，而不是依赖不可解释的视频生成模型。
- 让每一次生成都可追踪：脚本、代码、日志、帧截图和审查报告都应被保存。
- 支持异步、长耗时的视频生成任务。
- 支持 Worker 在隔离环境内执行代码、渲染视频和自我修复。
- 对失败给出明确原因，而不是只返回“生成失败”。

### 2.2 目标用户

- 教师和课程作者。
- 需要制作技术解释视频的开发者。
- 需要可视化算法、数学、物理、数据结构概念的学习内容创作者。
- 需要批量生产产品教学、技术培训或知识解释视频的团队。

### 2.3 初始使用场景

- 数学概念讲解。
- 物理过程演示。
- 算法和数据结构可视化。
- 编程语言或工程概念解释。
- 产品功能教学视频。
- 面向课堂或在线课程的短视频。

### 2.4 交互体验对后端的约束

前端预期提供类似 ChatGPT 的体验：用户先创建一个 Project，然后在 Project 内持续通过对话描述、追问、修改和确认视频生成过程，同时可以实时预览当前视频结果。具体 UI 不在本规格中设计，但后端必须支持这种交互模型。

后端需要满足：

- `Project` 是用户可见的顶层资源，也是视频生成工作区、消息历史、预览版本和产物的归属边界。
- 每个 Project 内置一个持续存在的 Thread，Thread 保存用户、Agent 和工具结果消息。
- 用户创建 Project 后即可发送消息；每条用户消息会创建一个 `AgentRun`。
- `AgentRun` 是一次类 ChatGPT 的 Agent 执行过程：Agent 可以边回复、边调用工具、边产出预览和产物。
- Agent 的文本回复、思考状态摘要、工具调用、工具结果、预览产物和错误都应以流式事件返回。
- 脚本编写、Manim 编程和 Workspace commit 应表现为 Agent 工具调用。
- 渲染应表现为系统能力：Agent 通过创建 Git commit 触发自动预览渲染，用户通过按钮触发高质量渲染。
- 视频预览不是最终产物的附属品，而是生成过程中的一等产物。
- 用户应能在任务完成前看到当前可用的预览，例如关键帧、场景片段、低质量渲染结果或最近一次完整渲染。
- 后端应保留 Project Thread、AgentRun、工具调用、视频版本、Worker Git 版本和预览产物之间的关联。

## 3. 非目标

Vibeo 第一阶段不追求：

- 生成真人、实拍或影视风格的写实视频。
- 替代完整的视频剪辑软件。
- 支持用户在浏览器里做复杂时间线编辑。
- 在未隔离环境中执行 Agent 生成的任意代码。
- 在没有外部知识校验的情况下保证所有学科事实绝对正确。
- 实时生成长视频。

## 4. 总体架构

Vibeo 后端由两部分组成：

- **Server**：对外提供 API，负责认证、任务管理、状态持久化、事件流和 Worker 编排。
- **Worker**：运行在 Kubernetes 上，内置预构建 Manim 环境，负责执行 AI Agent 工作流、生成代码、渲染视频、抽帧审查和上传产物。

```text
Client
  |
  | HTTP / SSE
  v
Server
  |
  | Project、Thread、Message、AgentRun、工具事件、预览事件、Worker 调度
  v
Kubernetes
  |
  | 启动隔离 Worker Pod
  v
Worker
  |
  | General -> Writer -> Programmer -> Reviewer
  v
Artifacts
  |
  | 脚本、源码、Git 版本、预览、视频、截图、日志、审查报告
  v
Database + Object Storage
```

## 5. Server 规格

Server 是 Vibeo 的控制平面，对外暴露稳定 API，并负责把 Project 内的一次用户消息编排成可观测、可恢复、可流式输出的 AgentRun。

### 5.1 职责

- 接收用户的视频生成请求。
- 管理 Project、Thread 和 Project 内的消息历史。
- 校验用户消息并创建 AgentRun。
- 持久化 Run 状态、Run Step、工具调用、错误信息和产物引用。
- 持久化预览版本和 Worker Git 提交引用。
- 创建、监控和清理 Worker。
- 向客户端提供轮询接口和事件流。
- 管理 Run 取消、重试、恢复和超时。
- 记录模型调用、渲染耗时、资源消耗和成本指标。

### 5.2 AgentRun 状态机

Project 内每条用户消息都会创建一个 `AgentRun`。Run 状态应尽量稳定，方便客户端实现类 ChatGPT 的“正在回复、正在调用工具、已完成、可继续追问”的体验。

```text
queued
  -> in_progress
  -> streaming_response
  -> calling_tool
  -> waiting_for_tool
  -> streaming_response
  -> completed

failed
requires_user_input
cancelling
cancelled
expired
```

状态说明：

- `queued`：用户消息已保存，Run 等待调度。
- `in_progress`：Agent 已开始处理上下文。
- `streaming_response`：Agent 正在向用户流式输出文本或结构化消息。
- `calling_tool`：Agent 决定调用一个工具，例如编写脚本、修改代码、提交 Workspace 或审查视频。
- `waiting_for_tool`：工具正在 Worker 内执行，Run 仍保持活跃并持续推送工具进度。
- `requires_user_input`：Agent 需要用户选择或确认才能继续，例如确认风格方向或是否接受带警告结果。
- `completed`：Run 已完成，Assistant 消息已落库，必要产物已关联到 Project。
- `failed`：Run 失败，且当前不能自动恢复。
- `cancelling`：用户请求停止当前 Run，Server 正在终止 Worker 工具调用。
- `cancelled`：用户或系统取消 Run。
- `expired`：Run 超时或 Worker 生命周期结束。

视频制作阶段不应暴露为顶层状态机。`planning`、`writing`、`programming`、`committing`、`reviewing` 和 `revising` 应作为 Run Step 或 ToolCall 的状态出现在事件流中。`rendering` 应作为独立 `RenderJob` 状态出现在 Project 事件流中。

### 5.3 Worker 编排

Server 通过 Kubernetes 编排 Worker：

- 每个 Project 可以按需启动一个临时 Worker，也可以让一个 Worker 在 Project 活跃期内处理多个连续 Run。
- MVP 可采用每个 Run 启动一个独立 Worker Pod 的简单策略。
- Worker 使用预构建镜像，镜像内包含 Manim、Python、Node.js 和 Agent 运行环境。
- Server 向 Worker 注入 Project 快照、Thread 摘要、Run 配置、模型配置、临时凭证和产物上传地址。
- Server 监听 Worker 状态并同步 Run Step、ToolCall、RenderJob 和预览进度。
- Run 完成、失败或取消后，Server 根据策略保留或清理 Worker 资源。

### 5.4 持久化

结构化数据存储在数据库中：

- Project。
- Project Thread。
- Project 内的用户消息、Assistant 消息、工具消息和系统消息。
- AgentRun。
- Run Step。
- ToolCall。
- RenderJob。
- 用户请求。
- 标准化后的 Run 输入。
- Agent 事件。
- 预览版本。
- Worker Git 提交元数据。
- 渲染请求和渲染状态。
- 错误摘要。
- 产物引用。
- 成本和资源指标。

大文件存储在对象存储中：

- 最终视频。
- 预览视频或场景片段。
- Manim 源码。
- Git bundle、patch 或提交差异。
- 脚本文件。
- 渲染日志。
- 抽帧截图。
- 审查报告。
- Worker 完整结果包。

### 5.5 Project、Thread、Run、工具和预览关系

Vibeo 后端应区分这些核心概念：

- `Project`：用户可见的顶层资源，代表一个视频生成项目和它的完整工作区。
- `ProjectThread`：Project 内持续存在的对话线程。
- `ProjectMessage`：Thread 内的用户消息、Assistant 消息、工具消息和系统消息。
- `AgentRun`：由一条用户消息触发的一次 Agent 执行过程。
- `RunStep`：Run 内的可观察步骤，例如生成回复、调用工具、等待渲染或更新预览。
- `ToolCall`：Agent 发起的具体工具调用，例如 `write_script`、`edit_manim_code`、`commit_workspace`、`review_video`。
- `RenderJob`：系统发起的渲染任务，来源可以是 Git commit 自动触发，也可以是用户请求高质量渲染。
- `PreviewRevision`：RenderJob 产生的可预览视频状态。
- `WorkerGitCommit`：Worker Workspace 中与脚本和代码版本对应的 Git commit。

关系：

```text
Project
  -> Workspace
      -> WorkerGitCommit[]
  -> ProjectThread
      -> ProjectMessage[]
      -> AgentRun[]
          -> RunStep[]
              -> ToolCall[]
  -> RenderJob[]
      -> PreviewRevision[]
```

设计要求：

- 用户创建 `Project` 后即可发送消息与 Agent 对话。
- 一个用户消息最多有一个当前活跃 `AgentRun`，但一个 Project 可以包含多个历史 Run。
- 一个 `AgentRun` 可以调用多个工具，也可以只回复文本而不修改视频。
- 一个 `ToolCall` 可以修改 Workspace 并创建 Git commit。
- 每个可运行的 `WorkerGitCommit` 都可以触发一个系统 `RenderJob`。
- `RenderJob` 不属于 AgentRun 的工具调用；它是系统对 commit 或用户高质量渲染请求的响应。
- 一个 `AgentRun` 可以通过 commit 间接产生多个 `PreviewRevision`。
- 每个 `PreviewRevision` 必须关联 Worker Workspace 中的 Git commit。
- 用户后续消息应能引用“当前预览”“上一个版本”或某个明确版本进行修改。
- Server 不直接理解 Manim 源码细节，但必须保存消息、Run、工具调用、版本、预览和产物之间的索引关系。
- 前端主要订阅 Project 事件流，而不是分别追踪多个底层任务。

### 5.6 Thread 与消息模型

Project Thread 是用户感知到的主界面状态。它不只是聊天文本历史，也包含 Assistant 的流式输出、工具摘要、预览引用和用户确认请求。

消息角色：

- `user`：用户输入。
- `assistant`：General Agent 面向用户的回复。
- `tool`：工具调用结果，默认用于 Agent 上下文，不直接完整展示给用户。
- `system`：系统事件摘要，例如 Run 被取消、Worker 超时或产物上传完成。

Assistant 消息可以由多个 content part 组成：

```json
{
  "messageId": "msg_456",
  "projectId": "proj_123",
  "runId": "run_456",
  "role": "assistant",
  "status": "streaming",
  "content": [
    {
      "type": "text",
      "text": "我会先把这个主题拆成 4 个教学场景，然后生成一个快速预览。"
    },
    {
      "type": "preview_ref",
      "previewRevisionId": "preview_002"
    },
    {
      "type": "artifact_ref",
      "artifactType": "script",
      "url": "https://storage.example/projects/proj_123/script.md"
    }
  ],
  "createdAt": "2026-05-14T10:05:00.000Z"
}
```

设计要求：

- 前端应能只靠 Project Thread 和 Project 事件流恢复当前页面状态。
- Assistant 文本必须支持增量追加。
- 工具原始日志可以存储为 `tool` 消息或 artifact，但 Assistant 应生成适合用户阅读的摘要。
- 当 Agent 需要用户确认时，应创建 `assistant` 消息，并将 Run 状态置为 `requires_user_input`。
- 同一个 Project 默认只允许一个会修改 Workspace 的活跃 Run；纯解释型 Run 可以后续再考虑并发。

## 6. Worker 规格

Worker 是 Vibeo 的执行平面。Worker 在 Kubernetes 中运行，内部拥有独立、预构建的 Manim 环境，Agent 可以在容器内自由创建文件、执行命令、渲染视频和检查结果。

### 6.1 职责

- 接收一个 Project Run 或 ToolCall 执行请求。
- 初始化或恢复 Project Workspace。
- 将 Workspace 初始化为 Git 仓库。
- 运行 General、Writer、Programmer、Reviewer 等 Agent。
- 执行系统 RenderJob 中的 Manim 渲染命令。
- 按秒抽取视频截图。
- 在关键阶段生成可预览产物。
- 为脚本和代码变更创建 Git checkpoint。
- 上传脚本、源码、日志、截图、审查报告和最终视频。
- 向 Server 持续发送结构化事件。
- 在失败时返回明确的错误信息。

### 6.2 运行环境

Worker 镜像应包含：

- Python 3.12。
- Manim CE。
- 常用 Manim 扩展库。
- Node.js 运行时。
- AI Agent SDK。
- shell 工具。
- ffmpeg 或等价的视频处理工具。
- git。
- 一个干净的 Git 工作目录。

当前仓库的 Worker 容器已包含 `manim`、`manim-voiceover`、`manim-physics`、`manim-dsa`、`manim-ml` 等 Manim 相关依赖，可作为第一版环境基础。

### 6.3 隔离要求

由于 Worker 会执行 Agent 生成的代码，Worker 必须被视为不可信执行环境。

最低隔离要求：

- 每个 Project 拥有独立 Workspace；MVP 如果按 Run 启动 Worker，也应为每个 Run 准备隔离工作目录。
- 如果同一 Project 的多个 Run 复用 Worker，必须保证同一时间只有一个会修改 Workspace 的 ToolCall 处于活动状态。
- 默认使用临时文件系统。
- 禁止特权容器。
- 限制 CPU 和内存。
- 限制网络出口。
- 只允许访问模型 API、Server 回调地址和对象存储上传地址。
- shell 命令必须有超时。
- 渲染任务必须有超时。
- 限制上传产物体积。
- Worker 不直接访问主数据库。

### 6.4 Workspace Git 管理

Worker 中的 Workspace 必须使用 Git 进行版本管理。Git 是后端实现可追踪、可回滚、可比较和可预览版本的核心机制。

要求：

- Worker 启动后在 Workspace 中初始化 Git 仓库。
- 每个 Project 的初始输入写入后创建初始 commit。
- Writer 生成或修改脚本后创建 commit。
- Programmer 每次完成一轮可运行代码后创建 commit。
- Agent 不应通过直接调用渲染工具来生成预览；Agent 应通过 `commit_workspace` 创建可运行 commit，由系统自动触发预览 RenderJob。
- 每个 `PreviewRevision` 必须指向一个明确的 commit SHA。
- 进入修正循环前应保留 Reviewer 拒绝时对应的 commit。
- Worker 上传产物时应包含源码快照和 Git 元数据。
- Server 应保存 commit SHA、commit message、阶段、Agent、预览版本和产物引用。

建议 commit message 格式：

```text
init: create job workspace
script: add initial video script
code: implement scene_01_to_scene_04
code: fix missing complexity scene
code: adjust layout after preview review
```

Worker 不应把 `.git` 目录作为普通源码目录直接暴露给用户。对外产物可以使用：

- `source.zip`：当前源码快照。
- `workspace.bundle`：可选的 Git bundle。
- `patches/`：关键版本之间的 patch。
- `commits.json`：commit 元数据索引。

### 6.5 实时预览产物

Manim 渲染并不天然等同于逐帧直播，因此 Vibeo 的“实时预览”应定义为：系统在 Agent 产生可运行 Git commit 后，自动启动快速 RenderJob，并尽早、持续地产生可被前端播放或展示的中间结果。

预览类型：

- `frame`：单张关键帧或按秒抽取的截图。
- `scene_clip`：某个场景的低质量短片段。
- `preview_video`：基于某个 commit 的低质量完整预览。
- `final_video`：用户手动触发的高质量最终视频。

要求：

- 每个可运行 commit 默认触发一个快速预览 RenderJob。
- RenderJob 在预览可用后立即上传产物并发送事件。
- 每个预览必须包含 `previewRevisionId`、`projectId`、`runId`、`commitSha`、`renderJobId`、`type`、`url` 和生成时间。
- 预览可以是低质量快速渲染，但最终高质量视频必须由用户显式触发。
- 后续用户消息默认基于最新已确认的预览版本，除非用户明确指定其他版本。

### 6.6 Commit 触发渲染

Git commit 是 Vibeo 后端触发渲染的版本边界。

触发规则：

- `commit_workspace` 工具成功创建 commit 后，Worker 必须发送 `workspace.commit.created` 事件。
- Server 收到 commit 事件后，应判断该 commit 是否可渲染。
- 可渲染 commit 自动创建一个 `RenderJob`，默认类型为 `preview`。
- `preview` RenderJob 使用快速、低成本配置，目标是尽快给用户反馈。
- 渲染产物、抽帧截图和日志不应写回被 Agent 管理的 Git Workspace，以免产生渲染-提交-再渲染循环。
- 同一个 commit 的 preview RenderJob 应具备幂等性，重复事件不应产生重复渲染。
- 如果 commit 渲染失败，Server 应把失败事件写入 Project Thread，并允许 Agent 在下一轮读取失败摘要后修复。

用户高质量渲染：

- 用户认为当前预览效果不错时，可以基于 `previewRevisionId` 或 `commitSha` 触发 `final` RenderJob。
- `final` RenderJob 不创建 AgentRun，不调用 General、Writer、Programmer 或 Reviewer。
- `final` RenderJob 使用高质量配置，并产出最终视频。
- 高质量渲染完成后，Server 将最终视频关联到 Project，并通过 Project 事件流通知前端。

## 7. Agent 规格

Worker 内包含四类核心 AI Agent：

- General。
- Writer。
- Programmer。
- Reviewer。

### 7.1 General Agent

General 是总控 Agent，负责任务理解、流程协调和 Agent 分发。

General 不直接执行文件编辑、代码运行或视频渲染。它的主要工作是决定下一步应该由哪个 Agent 处理，并把上下文传递给对应 Agent。

职责：

- 理解用户需求、约束和目标受众。
- 生成或维护任务级执行计划。
- 将任务分发给 Writer、Programmer 和 Reviewer。
- 在审查失败时判断是否进入修正循环。
- 在重试次数耗尽时终止任务并给出失败原因。
- 保证所有 Agent 的输出始终对齐原始用户需求。
- 以 Assistant 的身份向用户流式回复当前进展、选择依据和最终结果。
- 将 Writer、Programmer 和 Reviewer 暴露为可调用工具，而不是让用户直接调用这些内部 Agent。

### 7.2 Writer Agent

Writer 负责把用户需求转化为结构化视频脚本。

职责：

- 提炼视频主题、目标受众、教学目标和语气风格。
- 规划完整视频结构。
- 拆分场景。
- 为每个场景描述旁白、画面、动画步骤、时长和校验点。
- 明确哪些内容是必须出现的教学要点。
- 生成可供 Programmer 直接实现的脚本。

输出：

- `script.json`：结构化脚本。
- `script.md`：面向人类阅读的脚本说明。

Writer 输出必须足够明确，使 Programmer 不需要再次询问用户也能实现视频。

### 7.3 Programmer Agent

Programmer 负责根据脚本编写 Manim Python 代码。

职责：

- 读取 Writer 生成的视频脚本。
- 创建 Manim Scene 类和辅助模块。
- 使用 Manim CE 和可用扩展库实现动画。
- 生成清晰、可读、可维护的 Python 代码。
- 在必要时运行静态检查或快速渲染检查。
- 根据 Reviewer 的审查报告修改代码。

输出：

- Manim Python 源码。
- 渲染入口说明。
- 必要的辅助资源。
- 修改说明。

Programmer 应优先生成清楚、稳定、可复现的代码，而不是过度复杂的抽象。

### 7.4 Reviewer Agent

Reviewer 是质量门禁，负责审查系统 RenderJob 生成的视频是否符合脚本。

职责：

- 读取 RenderJob 的视频、渲染日志和抽帧截图。
- 检查渲染结果是否可用。
- 对照原始脚本审查视频内容。
- 发现缺失场景、画面错位、文本溢出、时序不合理、视觉表达错误等问题。
- 输出结构化审查报告。
- 当问题可修复时，要求 Programmer 修改代码。

输出：

- `review.json`。
- 抽帧截图。
- 渲染日志。
- 通过、带警告通过或拒绝结果。

Reviewer 拒绝后，当前 Run 不应发布最终完成结果，除非用户或系统策略明确允许“带警告完成”。

### 7.5 Agent 工具模型

类 ChatGPT 的工作流中，用户只感知到一个正在工作的 Assistant。内部专业 Agent 应作为工具能力被 General 调用。

MVP 工具集合：

- `write_script`：调用 Writer 生成或修改 `script.json` 和 `script.md`。
- `edit_manim_code`：调用 Programmer 生成或修改 Manim Python 代码。
- `commit_workspace`：保存 Worker Workspace Git checkpoint，并触发系统自动预览渲染。
- `review_video`：调用 Reviewer 对已有 RenderJob 结果进行抽帧审查。
- `publish_artifact`：上传源码、审查报告或其他非渲染产物。

工具调用要求：

- 每次工具调用必须有 `toolCallId`、`runId`、`projectId`、输入摘要、状态、开始时间和结束时间。
- 长耗时工具必须持续发送进度事件。
- 工具结果应作为 Thread 中的工具消息落库，但默认不直接暴露完整原始日志给用户。
- Assistant 回复用户时应引用工具结果的摘要、预览链接和需要用户确认的事项。
- 如果工具失败，Run 不应立即丢失上下文；General 应先尝试解释问题、修复或向用户请求下一步。

## 8. 生成流程

### 8.1 类 ChatGPT AgentRun 流程

```text
1. Client 创建或打开一个 Project。
2. Client 在 Project 内发送用户消息，请求生成或修改视频。
3. Server 保存用户消息并创建 AgentRun。
4. Client 订阅 Project 事件流，开始接收 Run 事件。
5. General 读取 Project Thread、当前预览、当前 Git commit 和用户新消息。
6. General 先流式回复正在理解需求，并生成可展示的简短计划。
7. General 按需调用工具：write_script、edit_manim_code、commit_workspace、review_video。
8. 每个工具调用都作为 RunStep 进入事件流，并持续上报状态。
9. Worker 在工具执行过程中更新 Workspace，并通过 commit_workspace 创建 Git commit。
10. Server 收到 commit 事件后自动创建 preview RenderJob。
11. RenderJob 完成快速渲染、抽帧并上传预览产物。
12. Server 将预览、RenderJob 和 commit 事件推送给 Client。
13. General 根据预览和审查结果继续回复、继续调用工具，或请求用户确认。
14. 当预览达到可接受状态时，General 发布 Assistant 消息，提示用户可以触发高质量渲染。
15. 用户点击高质量渲染按钮后，Server 基于选定 commit 创建 final RenderJob。
16. final RenderJob 完成后，Server 将最终视频关联到 Project。
```

### 8.2 工具调用与修正循环

当 Reviewer 发现可修复问题时进入修正循环：

```text
review_video 工具返回问题报告
  -> General 向用户流式说明正在修正
  -> edit_manim_code 工具根据报告修改代码
  -> commit_workspace 工具创建 checkpoint
  -> 系统自动创建 preview RenderJob
  -> review_video 工具基于新的 RenderJob 结果重新审查
  -> General 总结结果或继续下一轮
```

MVP 默认最多修正 3 次。

### 8.3 用户打断与继续

类 ChatGPT 体验必须允许用户在当前 Run 之后继续追问，也应支持停止当前 Run。

要求：

- 用户可以取消正在运行的 `AgentRun`。
- 取消 Run 时，Server 应终止正在执行的 Worker ToolCall 或将其标记为可丢弃。
- 已经产生的消息、预览和 Git commit 不应丢失。
- 用户发送下一条消息时，新的 Run 默认基于 Project 最新稳定版本继续。
- 如果上一轮在工具调用中失败，General 应能在下一轮读取失败摘要并继续修复。

### 8.4 失败处理

每次失败都必须包含：

- 失败 Run Step 或 ToolCall。
- 错误码。
- 面向用户的摘要。
- 面向开发者的详细日志。
- 是否可重试。
- 建议下一步。

错误码示例：

- `INVALID_INPUT`：用户输入无法生成有效任务。
- `SCRIPT_GENERATION_FAILED`：脚本生成失败。
- `CODE_GENERATION_FAILED`：代码生成失败。
- `RENDER_FAILED`：Manim 渲染失败。
- `REVIEW_REJECTED`：审查未通过且修正次数耗尽。
- `TIMEOUT`：任务超时。
- `ARTIFACT_UPLOAD_FAILED`：产物上传失败。
- `WORKER_LOST`：Worker 异常退出或失联。

## 9. API 规格

### 9.1 创建 Project

```http
POST /v1/projects
```

创建一个可持续上下文的视频生成项目。创建成功后，用户即可在该 Project 内发送消息与 Agent 对话。后续用户消息、Agent 回复、AgentRun、预览版本、Git 版本和最终产物都归属于该 Project。

请求示例：

```json
{
  "title": "二分查找教学视频",
  "initialMessage": "帮我生成一个适合初学者的二分查找动画讲解视频。"
}
```

响应示例：

```json
{
  "projectId": "proj_123",
  "title": "二分查找教学视频",
  "initialMessageId": "msg_001",
  "initialRunId": "run_001",
  "createdAt": "2026-05-14T10:00:00.000Z"
}
```

`initialMessage` 可选。如果创建 Project 时提供 `initialMessage`，Server 应同时创建第一条用户消息，并可立即创建对应的 `AgentRun`。

### 9.2 发送 Project 消息

```http
POST /v1/projects/{projectId}/messages
```

用户在 Project 内发送一条消息。Server 根据消息内容创建新的 `AgentRun`。AgentRun 可以只回复文本，也可以调用工具修改视频、重新渲染、解释或审查当前结果。

请求示例：

```json
{
  "content": "把二分查找的视频改得更适合小学生，减少代码术语，多用图形比喻。",
  "basePreviewRevisionId": "preview_123"
}
```

响应示例：

```json
{
  "messageId": "msg_123",
  "projectId": "proj_123",
  "runId": "run_456",
  "status": "queued"
}
```

### 9.3 订阅 Project 事件

```http
GET /v1/projects/{projectId}/events
```

面向 ChatGPT 式体验的主事件流。MVP 使用 SSE 即可。事件包括用户消息确认、Assistant 增量回复、Run Step、工具调用、预览更新、Git checkpoint、错误和完成通知。

### 9.4 查询 AgentRun

```http
GET /v1/projects/{projectId}/runs/{runId}
```

响应示例：

```json
{
  "runId": "run_456",
  "projectId": "proj_123",
  "triggerMessageId": "msg_123",
  "status": "waiting_for_tool",
  "currentStep": {
    "runStepId": "step_003",
    "type": "tool_call",
    "toolName": "commit_workspace",
    "status": "running"
  },
  "latestPreviewRevisionId": "preview_123",
  "latestCommitSha": "8f4b7c1",
  "createdAt": "2026-05-14T10:00:00.000Z",
  "updatedAt": "2026-05-14T10:08:30.000Z"
}
```

### 9.5 取消 AgentRun

```http
POST /v1/projects/{projectId}/runs/{runId}/cancel
```

Server 应停止当前 Run，并取消或终止正在执行的 Worker ToolCall。

### 9.6 触发高质量渲染

```http
POST /v1/projects/{projectId}/renders
```

用户确认某个预览效果不错后，前端调用该接口触发高质量渲染。该接口不创建 `AgentRun`，不经过 General Agent，也不会调用 Writer、Programmer 或 Reviewer。

请求示例：

```json
{
  "source": {
    "previewRevisionId": "preview_123",
    "commitSha": "8f4b7c1"
  },
  "quality": "high_quality",
  "format": "mp4"
}
```

响应示例：

```json
{
  "renderJobId": "render_789",
  "projectId": "proj_123",
  "type": "final",
  "status": "queued",
  "commitSha": "8f4b7c1"
}
```

### 9.7 查询 RenderJob

```http
GET /v1/projects/{projectId}/renders/{renderJobId}
```

响应示例：

```json
{
  "renderJobId": "render_789",
  "projectId": "proj_123",
  "type": "final",
  "status": "running",
  "quality": "high_quality",
  "commitSha": "8f4b7c1",
  "progress": 0.42,
  "createdAt": "2026-05-14T10:12:00.000Z",
  "updatedAt": "2026-05-14T10:13:20.000Z"
}
```

### 9.8 创建内部视频任务

```http
POST /v1/videos
```

该接口用于不经过 Project Thread 的直接任务创建，主要作为内部调试或兼容接口。面向最终产品体验时，前端不应直接调用该接口，而应通过 Project 消息创建 AgentRun。MVP 可以不公开该接口。

请求示例：

```json
{
  "projectId": "proj_123",
  "topic": "用动画解释二分查找",
  "audience": "初学编程的学生",
  "language": "zh-CN",
  "durationSeconds": 90,
  "style": {
    "tone": "清晰、耐心、现代",
    "visualDensity": "medium",
    "colorPalette": "深色背景，高对比强调色"
  },
  "requirements": ["展示搜索区间不断缩小", "使用一个具体有序数组示例", "结尾解释时间复杂度 O(log n)"],
  "constraints": {
    "aspectRatio": "16:9",
    "quality": "medium_quality",
    "maxRevisionCount": 3
  }
}
```

MVP 必填字段：

- `topic`

MVP 可选字段：

- `audience`
- `language`
- `durationSeconds`
- `style`
- `requirements`
- `constraints`

响应示例：

```json
{
  "jobId": "job_123",
  "projectId": "proj_123",
  "status": "queued"
}
```

### 9.9 查询内部视频任务

```http
GET /v1/videos/{jobId}
```

响应示例：

```json
{
  "jobId": "job_123",
  "projectId": "proj_123",
  "status": "reviewing",
  "phase": "reviewing",
  "progress": 0.82,
  "latestPreviewRevisionId": "preview_123",
  "latestCommitSha": "8f4b7c1",
  "createdAt": "2026-05-14T10:00:00.000Z",
  "updatedAt": "2026-05-14T10:08:30.000Z"
}
```

### 9.10 订阅内部视频任务事件

```http
GET /v1/videos/{jobId}/events
```

该接口用于内部调试。产品前端应优先订阅 Project 事件流。

### 9.11 查询 Project 预览版本

```http
GET /v1/projects/{projectId}/previews
```

响应示例：

```json
{
  "projectId": "proj_123",
  "previews": [
    {
      "previewRevisionId": "preview_123",
      "runId": "run_456",
      "renderJobId": "render_123",
      "type": "preview_video",
      "url": "https://storage.example/projects/proj_123/previews/preview-123/preview.mp4",
      "commitSha": "8f4b7c1",
      "status": "available",
      "createdAt": "2026-05-14T10:08:00.000Z"
    }
  ]
}
```

### 9.12 取消内部视频任务

```http
POST /v1/videos/{jobId}/cancel
```

Server 应停止对应 Worker，并将任务标记为 `cancelled`。

### 9.13 重试内部视频任务

```http
POST /v1/videos/{jobId}/retry
```

MVP 可以从头重试。后续版本可支持从最近的安全检查点重试，例如从脚本、源码或渲染阶段继续。

## 10. Run 输入模型

标准化后的 AgentRun 输入：

```json
{
  "projectId": "proj_123",
  "runId": "run_456",
  "messageId": "msg_123",
  "basePreviewRevisionId": "preview_001",
  "baseCommitSha": "8f4b7c1",
  "topic": "用动画解释二分查找",
  "audience": "初学编程的学生",
  "language": "zh-CN",
  "durationSeconds": 90,
  "style": {
    "tone": "清晰、耐心、现代",
    "visualDensity": "medium",
    "colorPalette": "深色背景，高对比强调色"
  },
  "requirements": ["展示搜索区间不断缩小", "使用一个具体有序数组示例", "结尾解释时间复杂度 O(log n)"],
  "constraints": {
    "aspectRatio": "16:9",
    "quality": "medium_quality",
    "maxRevisionCount": 3
  }
}
```

## 11. Run 输出模型

AgentRun 完成后的结果：

```json
{
  "projectId": "proj_123",
  "runId": "run_456",
  "status": "completed",
  "latestPreviewRevisionId": "preview_003",
  "latestCommitSha": "f13a9de",
  "video": {
    "url": "https://storage.example/projects/proj_123/final.mp4",
    "durationSeconds": 92,
    "resolution": "1280x720",
    "format": "mp4"
  },
  "artifacts": {
    "scriptJsonUrl": "https://storage.example/projects/proj_123/script.json",
    "scriptMarkdownUrl": "https://storage.example/projects/proj_123/script.md",
    "sourceArchiveUrl": "https://storage.example/projects/proj_123/source.zip",
    "workspaceBundleUrl": "https://storage.example/projects/proj_123/workspace.bundle",
    "commitsJsonUrl": "https://storage.example/projects/proj_123/commits.json",
    "previewsUrl": "https://storage.example/projects/proj_123/previews.json",
    "reviewReportUrl": "https://storage.example/projects/proj_123/review.json",
    "framesUrl": "https://storage.example/projects/proj_123/frames.zip",
    "logsUrl": "https://storage.example/projects/proj_123/runs/run_456/logs.txt"
  },
  "warnings": []
}
```

## 12. 产物目录

每个 Project 应有持续产物目录；每个 Run 的中间产物放在独立子目录中：

```text
projects/{projectId}/
  input.json
  messages.json
  script.json
  script.md
  source/
    main.py
    helpers.py
  git/
    commits.json
    workspace.bundle
    patches/
      0001-script.patch
      0002-code.patch
  previews/
    preview-001/
      frame.png
      metadata.json
    preview-002/
      clip.mp4
      metadata.json
  renders/
    render-001-preview/
      preview.mp4
      frames/
      logs.txt
      metadata.json
    render-002-final/
      final.mp4
      frames/
      logs.txt
      metadata.json
  frames/
    000000.png
    000001.png
    000002.png
  runs/
    run-001/
      events.jsonl
      tool-calls.json
      logs.txt
  review.json
  result.json
```

Worker 可以产生临时文件，但只有声明过的产物应上传到对象存储。

## 13. 视频脚本 Schema

Writer 输出的 `script.json` 应采用结构化格式：

```json
{
  "title": "二分查找",
  "summary": "用可视化动画解释二分查找如何在有序数组中缩小搜索范围。",
  "audience": "初学编程的学生",
  "language": "zh-CN",
  "durationSeconds": 90,
  "learningObjectives": [
    "理解二分查找需要有序数组",
    "理解 midpoint 的选择",
    "理解每一步如何排除一半搜索空间",
    "理解时间复杂度 O(log n)"
  ],
  "style": {
    "tone": "清晰、耐心",
    "visualStyle": "简洁几何动画",
    "colorPalette": ["#101018", "#F8F8F2", "#50FA7B", "#FFB86C"]
  },
  "scenes": [
    {
      "id": "scene_01",
      "title": "问题设定",
      "durationSeconds": 15,
      "narration": "我们要在一个有序数组中找到目标数字。",
      "visuals": ["展示一个横向排列的有序数组", "在数组上方展示目标数字"],
      "animationSteps": ["数组单元格依次淡入", "目标数字标签从上方出现", "用高亮颜色标出当前搜索范围"],
      "checks": ["数组数值必须有序", "目标数字必须清晰可见", "搜索范围必须与数组对齐"]
    }
  ]
}
```

场景字段要求：

- `id`：稳定场景 ID，供 Reviewer 引用。
- `title`：场景标题。
- `durationSeconds`：目标时长。
- `narration`：旁白或字幕文本。
- `visuals`：画面元素说明。
- `animationSteps`：动画步骤。
- `checks`：审查时必须验证的内容。

## 14. 审查报告 Schema

Reviewer 输出的 `review.json`：

```json
{
  "approved": false,
  "score": 0.82,
  "summary": "视频整体符合脚本，但缺少最终复杂度解释场景。",
  "issues": [
    {
      "severity": "major",
      "sceneId": "scene_05",
      "timeSeconds": 78,
      "type": "missing_content",
      "description": "脚本要求展示 O(log n)，但视频结束前没有出现复杂度解释。",
      "suggestedFix": "增加一个结尾场景，用公式和搜索空间减半动画解释 O(log n)。"
    }
  ],
  "frameSamples": [
    {
      "timeSeconds": 0,
      "path": "frames/000000.png",
      "notes": "标题居中且可读。"
    }
  ]
}
```

问题等级：

- `blocker`：不能接受，必须修复。
- `major`：重要要求缺失或明显错误。
- `minor`：影响观感但不阻断理解。
- `info`：提示性信息。

## 15. 渲染要求

MVP 渲染目标：

- 格式：MP4。
- 比例：16:9。
- 默认质量：`medium_quality`。
- 默认渲染器：`cairo`。
- 默认每秒抽取一张截图。
- 每次渲染保留独立日志。
- 为预览可额外生成低质量快速渲染，但不能替代最终质量渲染。
- 场景级预览应优先使用较低分辨率和较短渲染路径，以便尽快反馈给用户。

渲染尝试应分开保存：

```text
renders/
  render-001-preview/
  render-002-preview/
  render-003-final/
final.mp4
```

### 15.1 RenderJob 状态机

RenderJob 是系统渲染任务，不属于 AgentRun。

```text
queued
  -> running
  -> extracting_frames
  -> uploading
  -> completed

failed
cancelled
expired
```

RenderJob 类型：

- `preview`：由 Git commit 自动触发，使用低质量快速配置。
- `final`：由用户显式触发，使用高质量配置。

设计要求：

- `preview` RenderJob 必须关联 `commitSha` 和触发该 commit 的 `runId`。
- `final` RenderJob 必须关联 `commitSha`，可以选择性关联用户选中的 `previewRevisionId`。
- `final` RenderJob 不应创建 AgentRun。
- 同一 commit 可以有多个 final RenderJob，但应避免无意义的并发重复渲染。
- RenderJob 事件必须进入 Project 事件流。

## 16. 事件与可观测性

每个 Project 和 AgentRun 都应产生结构化事件：

- `project.created`
- `message.created`
- `message.delta`
- `run.created`
- `run.queued`
- `run.in_progress`
- `run.step.created`
- `run.step.delta`
- `run.step.completed`
- `worker.started`
- `agent.started`
- `agent.message`
- `tool_call.created`
- `tool_call.delta`
- `tool_call.completed`
- `tool_call.failed`
- `workspace.commit.created`
- `render_job.created`
- `render_job.started`
- `render_job.progress`
- `render_job.completed`
- `render_job.failed`
- `preview.created`
- `preview.available`
- `artifact.uploaded`
- `run.completed`
- `run.failed`
- `run.cancelled`

事件字段：

```json
{
  "eventId": "evt_123",
  "projectId": "proj_123",
  "runId": "run_456",
  "runStepId": "step_002",
  "type": "agent.message",
  "stepType": "assistant_message",
  "agent": "Programmer",
  "severity": "info",
  "message": "Created initial Manim scene implementation.",
  "payload": {},
  "createdAt": "2026-05-14T10:06:00.000Z"
}
```

预览事件示例：

```json
{
  "eventId": "evt_456",
  "projectId": "proj_123",
  "runId": "run_456",
  "toolCallId": "tool_789",
  "type": "preview.available",
  "stepType": "tool_call",
  "severity": "info",
  "message": "A new low-quality preview is available.",
  "payload": {
    "previewRevisionId": "preview_002",
    "renderJobId": "render_123",
    "previewType": "preview_video",
    "commitSha": "8f4b7c1",
    "url": "https://storage.example/projects/proj_123/previews/preview-002/clip.mp4"
  },
  "createdAt": "2026-05-14T10:08:00.000Z"
}
```

高质量渲染事件示例：

```json
{
  "eventId": "evt_789",
  "projectId": "proj_123",
  "renderJobId": "render_789",
  "type": "render_job.completed",
  "severity": "info",
  "message": "High-quality render completed.",
  "payload": {
    "renderType": "final",
    "commitSha": "8f4b7c1",
    "videoUrl": "https://storage.example/projects/proj_123/final.mp4"
  },
  "createdAt": "2026-05-14T10:20:00.000Z"
}
```

## 17. 安全要求

Vibeo 的安全核心是：Agent 生成的代码必须只在隔离 Worker 内执行。

要求：

- Worker 使用最小权限运行。
- Worker 不使用特权容器。
- Worker 不挂载宿主机敏感目录。
- Worker 不直接访问数据库。
- Worker 只获得单 Project 或单 Run 的临时凭证。
- 产物上传凭证必须短期有效。
- 网络访问使用 allowlist。
- 日志中不得泄露 API Key、对象存储凭证或内部 Token。
- Git commit、patch 和源码快照中不得包含注入的临时凭证。
- 所有 shell 命令和渲染命令必须有超时。
- Server 必须能主动终止 Worker。

## 18. 配置模型

配置示例：

```json
{
  "agent": {
    "general": { "model": "..." },
    "writer": { "model": "..." },
    "programmer": { "model": "..." },
    "reviewer": { "model": "..." }
  },
  "worker": {
    "timeoutSeconds": 1800,
    "maxRevisionCount": 3,
    "gitCheckpoints": true,
    "cpuLimit": "4",
    "memoryLimit": "8Gi"
  },
  "render": {
    "quality": "medium_quality",
    "renderer": "cairo",
    "frameSampleIntervalSeconds": 1,
    "autoPreviewOnCommit": true,
    "finalQuality": "high_quality"
  },
  "preview": {
    "enabled": true,
    "quickQuality": "low_quality",
    "emitSceneClips": true,
    "emitAttemptVideos": true
  }
}
```

## 19. MVP 范围

MVP 必须包含：

- 创建 Project API。
- 发送 Project 消息 API。
- 创建和查询 AgentRun。
- 取消 AgentRun。
- 用户触发高质量 RenderJob。
- SSE Project 事件流。
- 每个 Run 启动一个 Worker，或每个 Project 复用一个活跃 Worker。
- Worker Workspace Git checkpoint。
- Git commit 自动触发低质量预览 RenderJob。
- General、Writer、Programmer、Reviewer 四类 Agent。
- General 以单一 Assistant 身份与用户对话，并通过工具调用其他 Agent。
- Run Step 和 ToolCall 事件模型。
- Writer 生成结构化脚本。
- Programmer 生成 Manim Python 代码。
- RenderJob 渲染 Manim 视频。
- 预览版本模型和至少一种可实时展示的预览产物。
- RenderJob 每秒抽帧，Reviewer 基于抽帧结果审查。
- 最多 3 次自动修正循环。
- 上传最终视频和主要产物。
- 上传 Git commit 元数据。
- 返回可下载的视频链接。

MVP 可以暂缓：

- 用户团队、权限和计费系统。
- 浏览器时间线编辑器。
- 分布式渲染。
- 复杂素材库管理。
- 细粒度场景级重试。
- 完整语音合成和配音系统。
- 多语言字幕工作台。

## 20. 当前仓库对应关系

当前仓库已经有部分早期结构：

- `workspaces/main`：可作为 Server 或本地控制入口的基础。
- `workspaces/worker`：Worker Agent 代码基础。
- `workspaces/worker/container`：Worker 容器环境。
- `workspaces/worker/src/agents/general`：General Agent 骨架。
- `workspaces/worker/src/agents/programmer`：Programmer Agent 骨架。
- `workspaces/worker/src/config`：Agent 模型配置结构。
- `workspaces/worker/container/Dockerfile`：当前已在 `/workspace` 初始化 Git 仓库，可继续扩展为 Project/Run 级 Git checkpoint 机制。

后续需要补齐：

- Writer Agent。
- Reviewer Agent。
- Server API。
- Worker Run 和 ToolCall 入口协议。
- Kubernetes 编排逻辑。
- 事件流。
- 产物上传。
- 数据库模型。
- Project 消息模型。
- 预览版本模型。
- Worker Workspace Git checkpoint、commit 元数据导出和版本关联。
- 审查和修正循环。

## 21. 开放问题

- 第一版视频是否需要真实配音，还是先支持字幕和无声视频？
- Reviewer 应使用视觉模型、确定性检查，还是混合方式？
- Server 应直接调用 Kubernetes API，还是通过队列和 Runner 抽象调度 Worker？
- MVP 最大视频时长应限制在多少秒？
- 用户是否可以上传品牌字体、配色和图片素材？
- 中间产物应保留多久？
- 是否允许用户下载和二次编辑生成的 Manim 源码？
- 对话上下文应如何截断或摘要，以避免长期会话成本失控？
- 预览生成的最低可接受延迟目标是多少？

## 22. 成功指标

产品指标：

- 任务自动完成率。
- 用户接受最终视频的比例。
- 平均生成耗时。
- 平均修正循环次数。

质量指标：

- Manim 渲染成功率。
- Reviewer 通过率。
- 脚本要求覆盖率。
- 完成后被用户指出的严重问题数量。

工程指标：

- Worker 启动耗时。
- 渲染耗时。
- 模型调用成本。
- 单个完成视频的平均成本。
- 产物上传失败率。
