# TOO-686 本机自动化与独立包验收（2026-11-03）

## 目标与边界

机器 sqmc03，macOS 27.0.1 arm64，目录 `/Users/suqing/Coding/app/DeLive`，分支 `suqing/too-686-packaging-prep`，开发基线 `8319b0b13df4e0f3d98dea69deb98d22ba40ff4e`。本文件记录交付前完成的验收证据；未公开发布安装包。用户于同日明确要求交付当前分支并将 TOO-686 置为 Done，任务关闭不改变下述未验收项目的事实。

用户授权跑当前自动化项目并采用 DeLive SQ 独立包；明确不采集现场声音，长会由用户后续实测，暂不配置对象存储。未擅自以生成样本代替这些正式指标。

输入为 macOS Tingting 生成的 14.193 秒中文语音，系统来源注入样本，麦克风来源注入静音。真实运行产品 main、preload、UI、本地代理、火山服务和 macOS safeStorage；仅替换采音输入，不伪造云端响应。未采集用户会议、现场系统音频或真实麦克风。

## 两类 PROTOCOL_ERROR 的修复

1. 初始化只有 `{"result":{"additions":{"log_id":"…"}}}`，没有文本。仅忽略非最终、无 text/utterances、带 log_id 的元数据响应，不清空已有稿。缺文本的最终帧继续报错。
2. 重连时真实首分句带 `end_time:1199`，省略零值 `start_time`，导致严格解析拒绝。解析时将省略的起点按当前识别段零点处理，再加会话偏移；显式 null、负值、非数字、非有限值、倒序时间和缺失终点仍拒绝。

回归覆盖初始化、已有稿保留、坏终帧拒绝、重连省略起点及非法时间。第二项修复后相关 2 文件 / 10 项通过；修复前本轮全量 57 文件 / 445 项通过，不能把新增测试算成已运行的全量 446 项。前端与 Electron 构建均成功。

## 验收矩阵

| 项目 | 结果 | 证据与边界 |
| --- | --- | --- |
| 真实实时转写与最终帧 | PASS | 生成中文短样本返回 33 次修订，最终 complete，speaker 0 / two_pass；不是多人准确率验收 |
| 三轨原音、保存、重开、播放 | PASS | system/microphone/mix 17 个同步分片，可经产品接口读取；重载/进程重启保留；AudioContext 调度并推进播放。未测耳机实际输出延迟 |
| 断线与手动重连 | PASS | 强制关闭真实连接，离线期间原音持续落盘；重连新 recognitionId 和时间偏移，不合并编号；首段 incomplete、次段 complete，25 个分片。未改变本机网络配置 |
| 来源结束、设备变化、配额、renderer 崩溃 | PASS（自动化） | 合成双来源、真实 IPC/磁盘，注入 ended/devicechange；实际 forcefullyCrashRenderer，恢复已提交分片。没有实拔物理设备 |
| 实际空间不足 | PASS | 独立 32 MiB 挂载镜像填入 30 MiB，生产 RecordingStore 明确拒绝后续写入；已提交 1 分片恢复可读，状态 interrupted；未填满系统盘，镜像已卸载 |
| 实际进程异常退出 | PASS | 子进程 SIGKILL，恢复完整已提交分片，明确标出未提交尾部不可恢复 |
| 校对、版本、导出与旧历史 | PASS（自动化） | 改名/文字/归属、版本对照、晚到会后稿不覆盖人工选择、显式映射、重载、纯文字旧历史；TXT/MD/SRT 内容断言，缺时序不导出 SRT。云端会后结果为替身 |
| 文件任务故障与清理 | PASS（替身服务） | 实际 UI/任务管理器，HTTP/S3 替身；提交结果未知后重启沿用同 ID 查询、不重投，导入 WAV、保留版本与清理状态 |
| S3 协议路径 | PASS（本机服务） | 实际 AWS SDK 向 loopback HTTP 服务进行 17 MiB 分片上传、24h SigV4、孤儿分片取消、删除后 HEAD 404、版本控制拒绝；非真实云桶 |
| 独立标识、数据、更新、许可证 | PASS | DeLive SQ / io.github.sisyphussq.delive，独立 userData，不自动迁移；实际包 capability=false、更新 IPC 拒绝，包无 app-update.yml，保留 LICENSE |
| 独立包真实实时、回放、校对、导出、重启解密 | PASS | 依赖升级后实际 .app 重新跑通真实云端；退出重启后解密、人工修订和三种格式导出通过，原稿及人工版本均保留 |
| 根生产依赖审计 | PASS（本次审计范围） | 更新 adm-zip、ws、express、electron-updater 及受影响间接依赖，npm audit --omit=dev 从 10 项到 0 项；不是所有工程/Chromium/开发依赖安全证明 |
| ZIP 导入与代理依赖回归 | PASS | 生产运行时安装函数导入 binary/伴随库/执行权限；坏包和缺 binary 保留原安装；代理协议回归通过 |
| 真实麦克风/系统采音权限、设备拔插、耳机/外放/回声 | USER_DEFERRED / NOT_RUN | 按用户要求暂不采集现场声音；后续需在此独立包实测 |
| 三人/插话/重叠、准确率和真实说话人归属 | NOT_RUN | 无许可的多人标注样本与指标，单人 TTS 不代表达标 |
| 长会资源、时间漂移 | USER_DEFERRED / NOT_RUN | 用户选择自行实测，未运行长时间录制 |
| 标准文件云端转写、真实桶清理/过期/限权 | BLOCKED | 用户暂不配置对象存储；此前随机任务查询鉴权成功不能代替 submit/download/transcribe/cleanup |
| 真实账单与额度扣减 | UNKNOWN | 开通及控制台免费额度已确认；短样本真实调用会用额度，未回读实际扣减 |
| Developer ID、公证、公开发行和其他机器 | NOT_RUN | 当前明确选择本机 ad-hoc；无可信公证、跨机或 Windows/Linux 验收结论 |

## 独立包与依赖升级后复验

产物为 `release/DeLive SQ-2.3.0-beta.2-mac-arm64.dmg`、同名 ZIP 和 `release/SHA256SUMS`。包以 ad-hoc 签名，通过 deep/strict 签名检查、DMG 校验、ZIP 完整性检查。包内不含本机真实密钥、测试 profile 或日志；Apache-2.0 许可证保留。未安装到 `/Applications`。

定向依赖升级后的新包于本机时间 10:47–10:49 重新验证通过：真实服务返回完整测试稿，17 个三轨分片保存、重开和回放正常；退出进程再启动后 safeStorage 解密成功，人工校对保存与原稿保留，TXT/Markdown/SRT 导出内容断言通过。扫描该独立 userData 和本轮验收输出共 304 个文件，未发现实际 API Key 明文。`final-package-acceptance.json` 将通过证据绑定到以下产物摘要：

- DMG：`082141d2d19f55163445707aee9c48b5a9870e4106a0acafdc427f90b0c4b0c6`
- ZIP：`853affa6df00ec3ac4c2f5ddf0b5c155aa6459a3ebc37b05a5ea19c2259d2667`

重建后一度在系统钥匙串读取处等待授权，采样显示 `SecItemCopyMatching → SecKeychainItemCopyContent → SecurityServer decrypt`。用户已自行允许，阻塞解除，未清除钥匙串或降级明文。首次恢复的旧测试脚本因目录已有上一轮会话而触发单会话数量断言；调整测试脚本只选择本轮新增会话后通过，不删除旧数据，也未据此修改产品代码。

实际独立 userData 为 `/Users/suqing/Library/Application Support/DeLive SQ`，保留本轮生成样本及人工修订。原版数据未迁移。重建 ad-hoc 包可能再次触发钥匙串授权，允许访问只由用户在本机完成。

## 当前阶段结论与下一步

当前授权且具备条件的自动化、真实短样本链路及独立包检查已完成。整卡正式验收仍为 PARTIAL：用户后续完成现场设备、多人标注及长会实测；对象存储就绪后再跑标准文件真实上传/转写/清理。实际额度扣减未回读。量化准确率、归属错误、端到端延迟和资源阈值尚未确认，不据短样本宣称达标。

验收结束时 Linear TOO-686 为 Backlog。随后用户明确要求提交、推送、创建并合并 PR，以及将 TOO-686 置为 Done；按用户指令收尾，不将 PARTIAL / NOT_RUN / BLOCKED 改写为 PASS。实际提交、PR 合并与卡片状态以 GitHub / Linear 回执为准。本次提交收尾按约定未重复执行测试。

## 本机证据入口

证据与临时脚本在 Git 忽略目录中，不随提交或安装包发布：

- `tmp/evidence/686-live.json`、`686-live.log`、`686-reopen.log`、`686-live-review.png`：首次真实开发链路和进程重开；隔离 profile 扫描无明文 Key。
- `tmp/evidence/686-synthetic-responses.ndjson`：真实服务对生成样本的响应，包括两类故障，未记录鉴权头。
- `tmp/evidence/686-full/unit.log`、`recording.log`、`review.log`、`file.log`、`s3.log`：本轮自动化；故障注入产生的预期错误不能单独判作测试失败，结果以末尾断言为准。
- `tmp/evidence/686-full/reconnect.json`、`disk-full.json`、`process-crash.json`：真实断连、磁盘空间和进程中断恢复。
- `tmp/evidence/686-full/packaged-live.json`、`packaged-review.json`、`packaged-live.png`、`export-*.txt`：包内真实服务、重启、人工校对和导出字节检查。
- `tmp/evidence/686-full/final-package-acceptance.json`：最终包的摘要、真实服务/重启校对通过和明文凭据扫描；`packaged-static.json`：包内依赖版本、独立标识、许可证和隔离检查。
- `tmp/evidence/686-full/runtime-audit.json` / `runtime-audit-after.json`：根生产依赖更新前后结果；`runtime-zip.json`、`proxy-after-update.log`：对应回归。
- `tmp/evidence/686-full/pack.log`、`dmg-integrity.log`、`zip-integrity.log`：打包签名与归档检查；`packaged-hang.sample.txt`：钥匙串等待栈。
- `tmp/too-686-live/`：生成样本、带断言的本机脚本和隔离配置。live/reconnect/packaged 脚本使用真实凭据与云额度，不作为默认离线测试入口。

正式现场步骤与量化指标清单沿用 [历史交接](./handoff-too-686.md)，当前打包策略见 [构建说明](./build.md)。卡片按用户指令关闭与完整真实验收通过是两个不同结论；延期项继续保留在本记录中。
