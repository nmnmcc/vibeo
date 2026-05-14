# Vibeo SPEC

## 1. 项目概述

Vibeo 是 Video + Vibe 的组合词，是一个由 AI Agent 驱动的视频生成平台，第一阶段主要面向教学视频生成。

Vibeo 不直接使用视频生成模型来生成最终视频。系统会让 AI Agent 先理解教学目标，再编写结构化脚本，随后生成可执行的 Manim CE Python 代码，最后在隔离的 Worker 容器中渲染、抽帧、审查并迭代修正视频。

Vibeo 的核心判断是：教学视频需要准确、可控、可复现、可调试，而不是只追求“看起来像视频”。因此最终产物必须包含视频本身，也必须保留脚本、源码、渲染日志、抽帧结果和审查报告。

核心流程：

```text
用户需求
  -> 视频脚本
  -> Manim Python 代码
  -> 渲染视频
  -> 抽帧审查
  -> 修正迭代
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
- 每个 Project 内置一个持续存在的 Agent 对话消息流，用户创建 Project 后即可开始对话。
- 用户的每条消息都可以触发一次新生成、局部修改、重新渲染或审查请求。
- Agent 的回复、阶段进度、工具调用、预览产物和错误都应以流式事件返回。
- 视频预览不是最终产物的附属品，而是生成过程中的一等产物。
- 用户应能在任务完成前看到当前可用的预览，例如关键帧、场景片段、低质量渲染结果或最近一次完整渲染。
- 后端应保留 Project 消息上下文、视频版本、Worker Git 版本和预览产物之间的关联。

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
  | Project、消息、任务、预览事件、Worker 调度
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

Server 是 Vibeo 的控制平面，对外暴露稳定 API，并负责把一次视频生成任务编排成可观测、可恢复的后台流程。

### 5.1 职责

- 接收用户的视频生成请求。
- 管理 Project 和 Project 内的消息历史。
- 校验请求参数并创建任务。
- 持久化任务状态、阶段进度、错误信息和产物引用。
- 持久化预览版本和 Worker Git 提交引用。
- 创建、监控和清理 Worker。
- 向客户端提供轮询接口和事件流。
- 管理任务取消、重试和超时。
- 记录模型调用、渲染耗时、资源消耗和成本指标。

### 5.2 任务状态机

任务状态应尽量稳定，方便客户端实现进度展示。

```text
created
  -> queued
  -> worker_starting
  -> planning
  -> writing
  -> programming
  -> rendering
  -> reviewing
  -> revising
  -> completed

failed
cancelled
expired
```

状态说明：

- `created`：Server 已接收请求。
- `queued`：任务已入队，等待 Worker。
- `worker_starting`：Worker 正在启动。
- `planning`：General Agent 正在理解任务并制定执行计划。
- `writing`：Writer Agent 正在编写视频脚本。
- `programming`：Programmer Agent 正在生成或修改 Manim 代码。
- `rendering`：Reviewer Agent 或渲染工具正在执行 Manim 渲染。
- `reviewing`：Reviewer Agent 正在基于日志和抽帧结果审查视频。
- `revising`：审查未通过，正在回到 Programmer 修正。
- `completed`：任务完成并可下载最终产物。
- `failed`：任务失败，且当前不能自动恢复。
- `cancelled`：用户或系统取消任务。
- `expired`：任务超时或 Worker 生命周期结束。

### 5.3 Worker 编排

Server 通过 Kubernetes 编排 Worker：

- 每个任务默认启动一个独立 Worker Pod。
- Worker 使用预构建镜像，镜像内包含 Manim、Python、Node.js 和 Agent 运行环境。
- Server 向 Worker 注入任务配置、模型配置、临时凭证和产物上传地址。
- Server 监听 Worker 状态并同步任务进度。
- 任务完成、失败或取消后，Server 负责清理 Worker 资源。

### 5.4 持久化

结构化数据存储在数据库中：

- Project。
- Project 内的用户消息和 Agent 消息。
- 用户请求。
- 标准化后的任务输入。
- 任务状态。
- 阶段进度。
- Agent 事件。
- 预览版本。
- Worker Git 提交元数据。
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

### 5.5 Project、消息、任务和预览关系

Vibeo 后端应区分三个核心概念：

- `Project`：用户可见的顶层资源，代表一个视频生成项目和它的完整工作区。
- `ProjectMessage`：Project 内的用户消息、Agent 回复和系统消息。
- `VideoJob`：一次实际生成、修改、渲染或审查任务。
- `PreviewRevision`：任务过程中产生的可预览视频状态。

关系：

```text
Project
  -> ProjectMessage[]
  -> VideoJob[]
      -> PreviewRevision[]
      -> WorkerGitCommit[]
```

设计要求：

- 用户创建 `Project` 后即可发送消息与 Agent 对话。
- 一个 `Project` 可以包含多个 `VideoJob`。
- 一个 `VideoJob` 可以产生多个 `PreviewRevision`。
- 每个 `PreviewRevision` 必须关联 Worker Workspace 中的 Git commit。
- 用户后续消息应能引用“当前预览”“上一个版本”或某个明确版本进行修改。
- Server 不直接理解 Manim 源码细节，但必须保存版本、预览和 Project 消息之间的索引关系。

## 6. Worker 规格

Worker 是 Vibeo 的执行平面。Worker 在 Kubernetes 中运行，内部拥有独立、预构建的 Manim 环境，Agent 可以在容器内自由创建文件、执行命令、渲染视频和检查结果。

### 6.1 职责

- 接收一个视频生成任务。
- 初始化任务工作目录。
- 将 Workspace 初始化为 Git 仓库。
- 运行 General、Writer、Programmer、Reviewer 等 Agent。
- 执行 Manim 渲染命令。
- 按秒抽取视频截图。
- 在关键阶段生成可预览产物。
- 为脚本、代码、渲染和审查结果创建 Git checkpoint。
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

- 每个任务拥有独立工作目录。
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
- 每个任务的初始输入写入后创建初始 commit。
- Writer 生成或修改脚本后创建 commit。
- Programmer 每次完成一轮可运行代码后创建 commit。
- Reviewer 每次渲染尝试和审查报告完成后创建 commit。
- 每个 `PreviewRevision` 必须指向一个明确的 commit SHA。
- 进入修正循环前应保留 Reviewer 拒绝时对应的 commit。
- Worker 上传产物时应包含源码快照和 Git 元数据。
- Server 应保存 commit SHA、commit message、阶段、Agent、预览版本和产物引用。

建议 commit message 格式：

```text
init: create job workspace
script: add initial video script
code: implement scene_01_to_scene_04
render: add attempt-1 preview artifacts
review: reject attempt-1 with major issues
code: fix missing complexity scene
render: add attempt-2 approved video
review: approve final result
```

Worker 不应把 `.git` 目录作为普通源码目录直接暴露给用户。对外产物可以使用：

- `source.zip`：当前源码快照。
- `workspace.bundle`：可选的 Git bundle。
- `patches/`：关键版本之间的 patch。
- `commits.json`：commit 元数据索引。

### 6.5 实时预览产物

Manim 渲染并不天然等同于逐帧直播，因此 Vibeo 的“实时预览”应定义为：Worker 在生成过程中尽早、持续地产生可被前端播放或展示的中间结果。

预览类型：

- `frame`：单张关键帧或按秒抽取的截图。
- `scene_clip`：某个场景的低质量短片段。
- `attempt_video`：某次完整渲染尝试的视频。
- `final_video`：通过 Reviewer 的最终视频。

要求：

- Worker 在预览可用后立即上传产物并发送事件。
- 每个预览必须包含 `previewRevisionId`、`jobId`、`commitSha`、`type`、`url` 和生成时间。
- 预览可以是低质量快速渲染，但最终视频必须使用任务要求的质量配置。
- 后续用户消息默认基于最新已确认的预览版本，除非用户明确指定其他版本。

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

Reviewer 是质量门禁，负责渲染和审查最终视频是否符合脚本。

职责：

- 执行 Manim 渲染。
- 保存渲染日志。
- 每秒抽取一张截图。
- 检查渲染是否成功。
- 对照原始脚本审查视频内容。
- 发现缺失场景、画面错位、文本溢出、时序不合理、视觉表达错误等问题。
- 输出结构化审查报告。
- 当问题可修复时，要求 Programmer 修改代码。

输出：

- `review.json`。
- 抽帧截图。
- 渲染日志。
- 通过、带警告通过或拒绝结果。

任务不应在 Reviewer 拒绝后被标记为 `completed`，除非用户或系统策略明确允许“带警告完成”。

## 8. 生成流程

### 8.1 正常流程

```text
1. Client 创建或打开一个 Project。
2. Client 在 Project 内发送用户消息，请求生成或修改视频。
3. Server 保存消息并创建 VideoJob。
4. Server 启动 Worker。
5. Worker 初始化 Git Workspace 并创建初始 commit。
6. General 理解任务并制定计划。
7. General 调用 Writer。
8. Writer 生成结构化视频脚本并提交 commit。
9. General 调用 Programmer。
10. Programmer 编写 Manim 代码并提交 commit。
11. General 调用 Reviewer。
12. Reviewer 渲染视频。
13. Reviewer 生成预览产物并提交 commit。
14. Reviewer 每秒抽取截图。
15. Reviewer 对照脚本审查视频。
16. 审查通过后 Worker 上传所有产物。
17. Server 标记任务 completed。
18. Client 获取最终视频、预览版本和产物链接。
```

### 8.2 修正循环

当 Reviewer 发现可修复问题时进入修正循环：

```text
Reviewer 生成问题报告
  -> General 判断是否继续修正
  -> Programmer 根据报告修改代码
  -> Reviewer 重新渲染和审查
  -> 直到通过或达到最大修正次数
```

MVP 默认最多修正 3 次。

### 8.3 失败处理

每次失败都必须包含：

- 失败阶段。
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

创建一个可持续上下文的视频生成项目。创建成功后，用户即可在该 Project 内发送消息与 Agent 对话。后续用户消息、Agent 回复、视频任务、预览版本、Git 版本和最终产物都归属于该 Project。

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
  "initialJobId": "job_001",
  "createdAt": "2026-05-14T10:00:00.000Z"
}
```

`initialMessage` 可选。如果创建 Project 时提供 `initialMessage`，Server 应同时创建第一条用户消息，并可立即创建对应的 `VideoJob`。

### 9.2 发送 Project 消息

```http
POST /v1/projects/{projectId}/messages
```

用户在 Project 内发送一条消息。Server 根据消息内容创建新的 `VideoJob`，或让 Worker 基于当前视频版本执行修改、重新渲染、解释或审查。

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
  "jobId": "job_456",
  "status": "queued"
}
```

### 9.3 订阅 Project 事件

```http
GET /v1/projects/{projectId}/events
```

面向 ChatGPT 式体验的主事件流。MVP 使用 SSE 即可。事件包括用户消息确认、Agent 增量回复、任务阶段、工具调用、预览更新、Git checkpoint、错误和完成通知。

### 9.4 创建视频任务

```http
POST /v1/videos
```

该接口用于不经过消息流的直接任务创建，或作为内部兼容接口。面向最终产品体验时，优先通过 Project 消息创建任务。

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

### 9.5 查询任务

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

### 9.6 订阅任务事件

```http
GET /v1/videos/{jobId}/events
```

MVP 使用 SSE 即可。事件包括阶段变化、Agent 消息、工具调用、渲染进度、预览更新、Git checkpoint、上传进度、警告和错误。

### 9.7 查询预览版本

```http
GET /v1/videos/{jobId}/previews
```

响应示例：

```json
{
  "jobId": "job_123",
  "projectId": "proj_123",
  "previews": [
    {
      "previewRevisionId": "preview_123",
      "type": "attempt_video",
      "url": "https://storage.example/jobs/job_123/previews/attempt-1.mp4",
      "commitSha": "8f4b7c1",
      "status": "available",
      "createdAt": "2026-05-14T10:08:00.000Z"
    }
  ]
}
```

### 9.8 取消任务

```http
POST /v1/videos/{jobId}/cancel
```

Server 应停止对应 Worker，并将任务标记为 `cancelled`。

### 9.9 重试任务

```http
POST /v1/videos/{jobId}/retry
```

MVP 可以从头重试。后续版本可支持从最近的安全检查点重试，例如从脚本、源码或渲染阶段继续。

## 10. 输入模型

标准化后的任务输入：

```json
{
  "jobId": "job_123",
  "projectId": "proj_123",
  "messageId": "msg_123",
  "basePreviewRevisionId": "preview_001",
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

## 11. 输出模型

任务完成后的结果：

```json
{
  "jobId": "job_123",
  "projectId": "proj_123",
  "status": "completed",
  "latestPreviewRevisionId": "preview_003",
  "latestCommitSha": "f13a9de",
  "video": {
    "url": "https://storage.example/jobs/job_123/final.mp4",
    "durationSeconds": 92,
    "resolution": "1280x720",
    "format": "mp4"
  },
  "artifacts": {
    "scriptJsonUrl": "https://storage.example/jobs/job_123/script.json",
    "scriptMarkdownUrl": "https://storage.example/jobs/job_123/script.md",
    "sourceArchiveUrl": "https://storage.example/jobs/job_123/source.zip",
    "workspaceBundleUrl": "https://storage.example/jobs/job_123/workspace.bundle",
    "commitsJsonUrl": "https://storage.example/jobs/job_123/commits.json",
    "previewsUrl": "https://storage.example/jobs/job_123/previews.json",
    "reviewReportUrl": "https://storage.example/jobs/job_123/review.json",
    "framesUrl": "https://storage.example/jobs/job_123/frames.zip",
    "logsUrl": "https://storage.example/jobs/job_123/logs.txt"
  },
  "warnings": []
}
```

## 12. 产物目录

每个任务应生成独立产物目录：

```text
jobs/{jobId}/
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
  render/
    attempt-1/
      final.mp4
      logs.txt
    attempt-2/
      final.mp4
      logs.txt
    final.mp4
  frames/
    000000.png
    000001.png
    000002.png
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
render/attempt-1/
render/attempt-2/
render/final.mp4
```

## 16. 事件与可观测性

每个任务都应产生结构化事件：

- `project.created`
- `message.created`
- `message.delta`
- `job.created`
- `job.queued`
- `worker.started`
- `phase.started`
- `phase.completed`
- `agent.started`
- `agent.message`
- `tool.started`
- `tool.completed`
- `workspace.commit.created`
- `preview.created`
- `preview.available`
- `artifact.uploaded`
- `job.completed`
- `job.failed`
- `job.cancelled`

事件字段：

```json
{
  "eventId": "evt_123",
  "projectId": "proj_123",
  "jobId": "job_123",
  "type": "agent.message",
  "phase": "programming",
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
  "jobId": "job_123",
  "type": "preview.available",
  "phase": "rendering",
  "severity": "info",
  "message": "A new low-quality preview is available.",
  "payload": {
    "previewRevisionId": "preview_002",
    "previewType": "attempt_video",
    "commitSha": "8f4b7c1",
    "url": "https://storage.example/jobs/job_123/previews/preview-002/clip.mp4"
  },
  "createdAt": "2026-05-14T10:08:00.000Z"
}
```

## 17. 安全要求

Vibeo 的安全核心是：Agent 生成的代码必须只在隔离 Worker 内执行。

要求：

- Worker 使用最小权限运行。
- Worker 不使用特权容器。
- Worker 不挂载宿主机敏感目录。
- Worker 不直接访问数据库。
- Worker 只获得单任务临时凭证。
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
    "frameSampleIntervalSeconds": 1
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
- 创建视频任务 API。
- 查询任务 API。
- SSE Project 事件流和任务事件流。
- 每个任务启动一个 Worker。
- Worker Workspace Git checkpoint。
- General、Writer、Programmer、Reviewer 四类 Agent。
- Writer 生成结构化脚本。
- Programmer 生成 Manim Python 代码。
- Reviewer 渲染 Manim 视频。
- 预览版本模型和至少一种可实时展示的预览产物。
- Reviewer 每秒抽帧并审查。
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
- `workspaces/worker/container/Dockerfile`：当前已在 `/workspace` 初始化 Git 仓库，可继续扩展为任务级 Git checkpoint 机制。

后续需要补齐：

- Writer Agent。
- Reviewer Agent。
- Server API。
- Worker 任务入口协议。
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
