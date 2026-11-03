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

时间戳为音频统一时间轴偏移加服务分句时间。每次连接以首个实际发送 PCM 块的采集时点为起点，断线期间保留原音和时间间隔。PCM 按 100ms 组包，尾部不足一包在结束前发送。不能从重连结果推断断线期间已转写。

停止录音先结束原音落盘，再发送一次 audio_end，等待终帧最多 10 秒；超时/异常标记 incomplete，已有文本和原音保留。切换连接先接收旧连接的收尾结果，再清理监听器，避免丢尾稿。连接阶段停止也会结清等待 Promise。

无识别文字不等于转写失败。2026-11-03 真实静音请求确认：正常终帧可只有 `audio_info.duration` 与 `result.additions.log_id`，省略 `text` 和 `utterances`。仅在当前识别段尚无文本/分句、终帧有非负有限时长和非空 log_id 时，将该结构规范为空的 complete 结果；初始化元数据仍不替换稿件。已有文字后的缺文本终帧、损坏结构、服务错误与超时继续失败，不用空稿掩盖丢失。正常保存原音且识别段全部完成后，无文字录制显示“未识别到语音；原音已保留”。详见 [TOO-689 验收记录](./evidence-too-689.md)。

前端协议失败的 `details` 包含处理阶段（json/message/snapshot）及固定的本地校验原因，不保存原始响应、识别正文或凭据；可在渲染进程控制台查看。内置诊断包目前只包含主进程日志，不代表完整的前端诊断信息。

网络、握手、额度、服务错误码、协议损坏和发送积压都可见。失败不会停止本地原音；用户点击“重新连接转写”建立新识别段，不自动重放断线音频或无依据重复计费。重新启动会把未结束 recording 会话的 streaming 识别段标记 incomplete。会后补全由 TOO-684 实现。

## 开发验证与正式交接

合成协议帧、合成 440/880Hz 音频和内存 WebSocket 替身用于测试，没有真实服务响应或实际识别结果。入口见 [TOO-683 开发证据](./evidence-too-683.md)。TOO-686 需验证真实凭据与权限、钥匙串、语言/说话人效果、尾包延迟、长会和断网后时间对齐；全部为 NOT_RUN。
