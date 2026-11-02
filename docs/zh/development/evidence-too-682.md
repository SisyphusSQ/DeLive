# TOO-682 开发验证与 Review

日期：2026-11-02。机器：sqmc04；macOS 27.0.1（26A434），Node 25.9.0，npm 11.12.1，Electron 40.0.0。基线 e411441786e56beac37d929430616e4d769ef517，分支 suqing/too-682-dual-recording。实现文件摘要见 [source.sha256](./evidence/too-682/source.sha256)，Git 提交与 PR 见对应 Linear 回写。

## 结果

| 状态 | 开发验证 | 证据 |
| --- | --- | --- |
| PASS | 首轮前端全量测试 49 文件 / 394 项 | sqmc04 仓库 tmp/evidence/682-tests.log |
| PASS | 新增采集/存储专项 10 项：合成 WAV、时间轴缺口、恢复、配额、磁盘失败、权限拒绝、来源释放、工作线程混音与尾块 | tmp/evidence/682-focused-tests.log |
| PASS | 修复后相关回归 5 文件 / 19 项，涵盖采集/存储、旧会话 schema、仓库与自动保存 | [测试摘要](./evidence/too-682/regression.txt) |
| PASS | 最后 sourceMeta 调整后的自动保存 2 项 | tmp/evidence/682-autosave-reviewed.log |
| PASS | Electron TypeScript 与前端生产构建 | [Electron 构建](./evidence/too-682/build-electron.txt)、[前端构建](./evidence/too-682/build-frontend.txt) |
| PASS | 修改文件 ESLint 无错误/警告 | tmp/evidence/682-lint-reviewed.log |
| PASS | Electron 编译界面、preload、IPC、AudioWorklet、文件存储集成 | [结构化结果](./evidence/too-682/electron-integration.json) |
| NOT_RUN | 正式真实设备、真实会议、外放/耳机回声、长会漂移与实际火山服务 | 按用户要求移交 TOO-686 |

首轮全量 lint 为 0 错误、18 警告，其中 2 个本次 Hook 依赖警告已修正并通过修改文件检查；其余 16 个为未修改文件的既有警告。前端构建仍有上游已有 Browserslist 数据与大 chunk 警告，无构建失败。完整日志保留在目标仓库 tmp/evidence/，不因收尾重复运行。

Electron 集成用 440 / 880 Hz 合成正弦和明确标注的 mediaDevices 测试替身；真实编译后的应用代码负责混音、录音、持久化和界面。隔离 userData 并拒绝所有 HTTP/WebSocket 请求。验证仅录音、单来源结束、设备变化、增量保存、停止刷新、重开、缺少 ASR 配置时继续原音、配额失败和真实 renderer 进程崩溃后的恢复。已取得 PASS 回执。该证据不代表原生系统音频采集或真实麦克风声学效果通过。

## 对抗式 Review

已检查采集与转写生命周期隔离、主进程受信 IPC 与路径边界、增量写盘提交顺序、损坏资产、设备重新授权间隔、停止尾块、仅原音会话保留及旧 schema 兼容。发现并修复：

1. 原流程 ASR 失败结束本地采集：拆开归档与转写生命周期，并覆盖无配置场景。
2. 设备重建等待时间未计入偏移：在重新授权之后确定偏移，保留时间缺口。
3. 隐藏窗口/窄画布下原波形负圆角使 React 崩溃：处理无尺寸画布并限制条宽。
4. 一条坏音频索引可能阻止全部历史加载：列表隔离损坏资产，保留文件并明确无法回放。
5. renderer 崩溃而主进程存活时状态悬挂：主进程监听退出和主页面导航，标记中断；以真正 renderer crash 验证。
6. 设备重连时 ASR 重连失败可能停止新原音图：将两者错误路径分开；恢复录制状态使波形重新绑定音源。
7. 会话保存可能把 mixed 来源覆盖成 system-audio：快照保留当前会话来源信息。

默认不自动删除已获用户确认；设置配额和显式删除不改变云端副本策略。尚未验证的真实设备、长会、回声和平台版本适用范围继续保留在 TOO-686，不以开发 PASS 替代正式验收。未发布、未部署、未使用真实火山/对象存储凭据。
