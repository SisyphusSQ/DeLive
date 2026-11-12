# 火山实时 2.0 与匿名说话人

## 契约与范围

开发卡 TOO-683，依赖 TOO-682 的双来源原音。真实服务为 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`，资源 `volc.seedasr.sauc.duration`；本阶段未请求该服务。正式产品权限、识别准确率、延迟、多人和真机验收统一移交 TOO-686。

2026-11-02 核对官方文档：
- [实时二遍 WebSocket 参数及响应](https://docs.volcengine.com/docs/doubao-voice/bidirectional-streaming-automatic-speech-recognition-websocket?lang=zh)
- [完整二进制协议、旧版与新版鉴权](https://docs.volcengine.com/docs/doubao-voice/large-model-streaming-automatic-speech-recognition-api-1?lang=en)
- [说话人分离最佳实践](https://docs.volcengine.com/docs/doubao-voice/speaker-separation?lang=en)

启用 `enable_speaker_info`、`show_utterances`、`enable_nonstream`，设置 `ssd_version: "200"`、`result_type: "full"`。使用中英文默认模型；二遍不传仅 nostream 支持的 `audio.language`，非中英文提示明确拒绝。官方当前说明流式最多切分 10 个说话人，尾包有额外延迟；实际效果未验证。

默认 ITN、标点开启，`enableDdc` 默认关闭。设置中的“语气词规整”是显式选项，开启后可能删除语气词或重复内容，不声称是严格逐字稿。没有声纹库、真实身份或跨会议识人。

## 配置与安全

“设置 → 火山引擎”可填写新版 API Key，或旧版 APP ID + Access Token；新版 API Key 优先。开通流式语音识别 2.0 后才可实际使用，配置测试会连接真实服务，属于 TOO-686 阶段操作。

设置字段为 `providerConfigs.volc.apiKey` / `appKey` / `accessKey`。通过 Electron safeStorage 加密写入当前应用 userData 下 `safe-store/`，常规设置仅存占位符。系统安全存储不可用时拒绝新凭据保存；旧明文迁移失败会清除磁盘明文、保留当前运行的内存配置并显示重新配置提示。API Key 占位符无法解密时视为未配置。备份导出剔除上述三个字段。

本地代理使用首条 start 消息传递凭据，不放 URL 查询串；上游使用对应鉴权 Header。不记录鉴权配置、原始错误正文或识别正文到代理日志。会话只保留响应白名单，不能携带任意 additions、Header、URL 或访问凭据。

开发隔离 Electron 在 sqmc04 返回 `safeStorageAvailable=false`，已验证拒绝明文回退和迁移提示；加密成功路径为测试替身验证。正式应用钥匙串状态需在 TOO-686 核实，未通过当前结果推断正式安装包可用。

## 数据与停止、恢复

会话增加可选 `realtime[]`；旧会话不需要迁移音频或补造说话人。
每条记录包含独立 UUID、音频起点 offsetMs、streaming/complete/incomplete、revision、可选服务序号、全文、分句与白名单响应。分句 ID 是识别连接 UUID + 快照位置；该 ID 是本版本定位键，不是跨修订的语义身份承诺。685 的人工校对必须使用独立版本，不能按此位置键静默覆盖。

接收 full 快照后替换当前连接结果，不追加重复文本；分句 definite 单独决定临时/稳定，终帧决定连接是否完成。speaker_id 来自 utterances[].additions.speaker_id；缺失时保持未知。内部 speakerId 包含连接 UUID，显示“说话人 N · 识别段 M”，相同服务整数不会跨连接合并。

2026-11-11 修正“首段后转写中断”：经用户授权，将真实录音前 45 秒按当前语气词规整配置重放，复现服务在已确认分句后返回 `start_time`、`end_time`、`definite: false` 正常、尚无正文的临时分句；下一帧开始补正文，后续正常给出最终帧。旧解析器将其判作分句格式错误并触发 `PROTOCOL_ERROR`，关闭连接，因此之后原音仍录制但没有继续转写。首轮脱敏诊断仅记录正文长度，未区分省略与 null；经用户再次授权重放同样 45 秒，补记 `textType: undefined` / `textPresent: false`，确认是省略 `text`，不是显式 null 或其他类型。

修正仅对明确 `definite: false` 且 `text` 省略的占位分句，将正文规范为空串，保留其时间和状态于白名单响应，不生成空白显示片段；后续完整快照按原位置 ID 更新。已确认分句缺正文、显式 null/非字符串及非法时间仍拒绝，不吞掉其他协议错误。回归覆盖连接不中断、后续正文与终帧、持久化重开及非法数据拒绝；全量 67 文件 / 530 项、前后端构建通过。再次授权的真实 45 秒重放收到 7 帧，修正后的解析器无校验失败，后续分句正文补齐且收到最终帧；脱敏结构离线回放同时通过。原始录音仍保留，历史缺失文字未自动补转写。

诊断证据在 `tmp/evidence/dual-audio-fix-20261111/`：`volc-recording-prefix-probe.json` 仅保留字段类型、时间值与正文长度；`volc-schema-offline-replay.json` 使用替代文字回放响应结构。合成语音在语气词规整开/关两种配置下均未复现，不能用合成样本通过代替真实异常场景。

修复包已完成 Developer ID 签名、资源封印和 OCSP 检查，安装并打开 `/Applications/DeLive SQ.app`。产物位于 `release/volc-placeholder-fix-20261111/`，旧应用保存在该目录的 `previous-install/DeLive SQ.app`；版本仍为 `2.3.0-sq.1`，当前安装 `app.asar` SHA-256 为 `11ab017d01c524783cb0290a0316d0fc7e59e7d46a3311ea8e2c7bfcc76cb164`，详情见 `tmp/evidence/dual-audio-fix-20261111/install-placeholder-fixed.json`。未公证、未公开发布、未提交 Git。

用户开启新双选录音后，约 30 秒时 1 段 / 21 字，约 82 秒时同一识别连接持续产生 3 段 / 55 字；但约 4 分 13 秒现场再次出现 `PROTOCOL_ERROR`（`stage: snapshot` / `火山分句时间或状态错误`），当时已有 237 字。短时通过不足以确认修复完整。用户随后已停止录音，会话 `1794386225402-e8yghjzjk` 的约 401 秒原音已保存。

本次复发的原始失败响应未被旧诊断保留。相同混音前 240 秒与 180–240 秒区间分别重放，收到 66 帧与 46 帧，均无解析失败；服务分句与现场不同，不能据此认定复发已解决。随后延长到前 300 秒以覆盖现场约 4 分 13 秒的报错时点，共收到 107 帧，仍无解析失败（`volc-second-recording-long-probe.json`）。解析异常现增加固定白名单证据：失败分句位置、正文是否存在及类型、时间值/类型、definite 值/类型，不包含正文、任意 additions 或凭据；仍保留原有失败语义与上一份有效快照，不凭猜测放宽校验。相关隐私及已有文字保留回归通过，全量 67 文件 / 533 项、前端构建通过，lint 无错误、14 条原有警告；诊断改动已完成 Developer ID 签名与 OCSP 检查，安装到 `/Applications/DeLive SQ.app`；产物与旧应用备份在 `release/volc-diagnostics-20261111/`。安装内容与构建资产一致，`app.asar` SHA-256 为 `fb1114cb72b99d0a5b5ca8f9878eadb1f1d3754eeb425fe6f243a82413bc6032`。启动进程存在，但界面自动回读连续超时，启动后的界面状态未确认；未开始新录音，未进行新的实录验证。

时间戳为音频统一时间轴偏移加服务分句时间。每次连接以首个实际发送 PCM 块的采集时点为起点，断线期间保留原音和时间间隔。PCM 按 100ms 组包，尾部不足一包在结束前发送。不能从重连结果推断断线期间已转写。

停止录音先结束原音落盘，再发送一次 audio_end，等待终帧最多 10 秒；超时/异常标记 incomplete，已有文本和原音保留。切换连接先接收旧连接的收尾结果，再清理监听器，避免丢尾稿。连接阶段停止也会结清等待 Promise。

无识别文字不等于转写失败。2026-11-03 真实静音请求确认：正常终帧可只有 `audio_info.duration` 与 `result.additions.log_id`，省略 `text` 和 `utterances`。仅在当前识别段尚无文本/分句、终帧有非负有限时长和非空 log_id 时，将该结构规范为空的 complete 结果；初始化元数据仍不替换稿件。已有文字后的缺文本终帧、损坏结构、服务错误与超时继续失败，不用空稿掩盖丢失。正常保存原音且识别段全部完成后，无文字录制显示“未识别到语音；原音已保留”。详见 [TOO-689 验收记录](./evidence-too-689.md)。

前端协议失败的 `details` 包含处理阶段（json/message/snapshot）及固定的本地校验原因，分句校验失败另含上述字段白名单，不保存原始响应、识别正文或凭据；可在渲染进程控制台查看。内置诊断包目前只包含主进程日志，不代表完整的前端诊断信息。

网络、握手、额度、服务错误码、协议损坏和发送积压都可见。失败不会停止本地原音；用户点击“重新连接转写”建立新识别段，不自动重放断线音频或无依据重复计费。重新启动会把未结束 recording 会话的 streaming 识别段标记 incomplete。会后补全由 TOO-684 实现。

## 开发验证与正式交接

合成协议帧、合成 440/880Hz 音频和内存 WebSocket 替身用于测试，没有真实服务响应或实际识别结果。入口见 [TOO-683 开发证据](./evidence-too-683.md)。TOO-686 需验证真实凭据与权限、钥匙串、语言/说话人效果、尾包延迟、长会和断网后时间对齐；全部为 NOT_RUN。
