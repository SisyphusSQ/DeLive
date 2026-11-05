# AI 接入、模型与权限

设置 → AI 后处理提供三种入口，摘要、纠错、问答、思维导图共用相同传输与错误处理。

| 入口 | 协议与配置 | 图片与结构化结果 |
| --- | --- | --- |
| OpenAI API | 默认 `https://api.openai.com/v1`，Responses；填写自己的 Key 和模型 | 图文输入、严格 JSON Schema、流式事件 |
| OpenAI-compatible | 保留原地址、Key 和模型；旧配置默认 Chat Completions，也可显式选 Responses | 图片能力需用户确认；Chat Completions 使用原有 JSON 提示词与结果校验 |
| 本机 Codex | 安装 CLI，留空自动探测或指定绝对路径；使用 app-server stdio | 由 CLI 报告模型模态；图文输入、outputSchema、增量事件 |

获取模型列表不是能力测试。API 的视觉模型需要根据服务说明填写；Codex 自动填写其报告的视觉模型。未确认视觉能力时拒绝发送图片，不悄悄丢弃图片。可手动添加服务模型别名，但 Codex 需要相应的完整模型元数据，缺失时明确拒绝启动。

按功能分配模型的设置继续有效。切换入口会清空当前模型选择和密钥，需重新配置；请求失败不会切换服务、模型或协议。AI 设置可独立保存，不要求先填写语音转写服务的凭据。

Responses 模式提供“推理强度（Effort）”：模型默认值、`low`、`medium`、`high`、`xhigh`、`max`。选择值保存在 `reasoningEffort`，摘要、对话、思维导图和纠错的共享传输会发送 `reasoning.effort`；默认值不发送该参数。Chat Completions 和本机 Codex 不使用此设置。`gpt-6.1-sol` 支持上述五档，默认 `medium`；其他模型需按服务能力选择，不支持推理的模型应使用默认值。提高强度通常增加耗时和费用。[官方模型说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

OpenAI 入口的“获取模型列表”从当前账号 `/models` 结果中仅保留 GPT-6 和 GPT-6.1 系列；兼容服务仍展示其返回的全部模型。模型出现在列表中不代表已经通过图文调用验收，需按实际能力配置图片支持。

## Codex 的版本、Home 和任务隔离

当前支持 `codex-cli 0.156.x`，实际验证版本为 `0.156.0`；升级支持范围前应重新验证协议与工具隔离。

- Electron 管理自己的 app-server 子进程。它不连接 Codex 桌面 App，不要求桌面 App 开启，也不终止其他 Codex 进程。
- 继承已有 `CODEX_HOME`；未设置时由 CLI 使用默认 `~/.codex`。不复制认证文件，不改全局 `config.toml`。子进程 PATH 在继承值后补充 Homebrew、`/usr/local/bin` 和 `~/.local/bin`，让 Finder 启动的应用也能调用常见 npm CLI；只安装在其他自定义 Node 目录时，需提供可独立执行的 Codex 程序。认证与自定义模型服务由 CLI 管理。
- 启动时通过进程参数关闭 Shell、Hooks、插件、Apps、浏览器、联网搜索、子 Agent、JS 工具、记忆与权限申请等功能，读取有效配置核对。每个线程关闭已有 MCP，并使用只读沙箱与 `approvalPolicy=never`。
- **只读沙箱不能替代禁用工具**。0.156.0 即使关闭 Shell，仍可能向模型暴露 `apply_patch`。DeLive 从有效 `model_catalog_json` 或默认 Home 的 `models_cache.json` 读取模型元数据，在应用的 `ai-workspace/models-*/catalog.json` 临时目录移除工具能力，供本次子进程使用。认证、服务配置和模型上下文参数保持继承；完成、失败或取消时删除临时目录。元数据缺失不会用猜测值继续运行。
- 对服务端工具/批准请求拒绝并终止任务；对非文本任务事件终止任务。受控真实 CLI 验证要求发给模型的工具列表为空，伪造工具调用也不能写文件。
- 每次任务采用 ephemeral 线程，连续问答由 DeLive 已保存的对话历史提供上下文。结果和任务状态由 DeLive 保存，不依赖 Codex 会话历史。
- DeLive 不自动重发；Codex 内部传输沿用原 provider 的重试策略。权限约束只作用于本应用的子进程。

## 取消、失败与密钥

回顾页任务进行中显示“停止 AI”，停止当前会议的 AI 任务。任务最多运行 10 分钟，超时、HTTP 错误、拒绝、断流、进程退出或无效结果均标记失败。取消不能撤回服务端已处理的请求，可能已有用量。应用重启后将遗留 pending/detecting/correcting 状态记为中断，需手动重新生成；已有成功结果保留。

AI 密钥仅以 safeStorage 加密保存。安全存储不可用时拒绝新密钥的明文保存；旧明文迁移失败会清除磁盘明文并明确提示，当前运行的内存凭据仍可用。修改其他设置不能把已解密密钥重新写入 localStorage/IndexedDB。JSON 导出与云备份剔除 AI Key 和本机 Codex 程序路径。错误中的 Key、Bearer 和 URL 查询参数脱敏。

本地优先不表示 AI 资料不离开设备：选择远端 API 或远端 Codex provider 后，提供的文字和图片会发送给所选服务。

图片时间轴、实际图文上下文、来源引用与结果过期说明见 [会话图片](./session-images.md)。

## 验证入口

开发阶段：`npm run check`；定向协议测试在 `aiTransport.test.ts`、`codexClient.test.ts`，密钥和重启恢复测试在 utils。桌面集成在构建后运行 `npx electron scripts/test-ai-electron.cjs`，使用临时 profile、假 CLI、生产 UI/preload/IPC，并阻断外部网络。

真实服务与打包验收的本次结果见 [TOO-690 验证记录](./evidence-too-690.md)。不要把假服务的错误注入当成真实账号额度、生产故障或钥匙串通过。

参考：[App Server](https://learn.chatgpt.com/docs/app-server)、[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)、[图片输入](https://developers.openai.com/api/docs/guides/images-vision)。


### 模型选择与对话发送（2026-11-04）

- 功能模型优先于默认模型，之后沿用旧版 model；均未设置时使用用户已勾选的第一个非空模型，不使用仅出现在可用列表中但未勾选的模型。首次勾选会设置默认模型，移除默认项时同步更新默认值与旧版 model。
- 对话、摘要和思维导图分别按自身功能检查模型配置。回车、发送按钮和重新生成共用配置、材料及等待状态的限制；输入法组合阶段的回车不发送。
- 流式对话的配置/材料/问题校验错误也走 onError，结束 pending 状态。重启时保留历史问题，将未完成任务标为中断，不自动重发。
