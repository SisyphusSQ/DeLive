# 火山标准文件转写 2.0

TOO-684 的开发实现。真实云端联调和正式验收由 TOO-686 执行；本文中的配置示例没有真实凭据。

## 使用流程

1. 在桌面客户端设置页选择火山引擎，配置 API Key，或 APP ID 与 Access Token。文件转写复用该凭据，口语顺滑 enableDdc 由用户显式开启，默认关闭。
2. 打开「文件」，选择火山引擎，展开「私有临时存储配置」，填写 endpoint、区域、私有桶、独立对象前缀、访问凭据；签名有效期默认 24 小时。保存必须依赖可用的 Electron safeStorage，失败时不降级明文。
3. 选择已经停止的会议原音，点击「提交会后转写（可能计费）」；也可选择音频文件后点击「开始转录」。导入文件转换为 16 kHz、单声道 PCM16 WAV，分片保存到本地原音目录，原文件不修改。转换可能占用较大内存，内存与长文件导入上限留待 686 实测；应用自身长会议录音采用逐块转换，不把完整会议装入内存。
4. 页面显示准备、上传字节进度、提交、排队、转写、未知提交、完成或错误。收到成功提交后每 10 秒查询；网络/协议/权限错误、URL 到期或任务超过 3 小时则暂停自动查询，用户可手动查询。
5. 完成后保存独立会后稿，保留原稿、人工校对和已确认姓名；可以预览或打开所在会话。TOO-685 接续版本选择、对照、人工说话人映射、回放和导出。
6. 应用重启不自动上传或重新提交，不自动联网查询。原任务保留，打开「文件」后手动「查询 / 继续查询」。已完成结果会在启动时补入现存会话；不会重建用户已删除的会话。

## 接口与约束

- 固定标准资源 **volc.seedasr.auc**；POST /api/v3/auc/bigmodel/submit 和 /query，不使用 flash / auc_turbo。
- Header 使用 X-Api-Key，或 X-Api-App-Key + X-Api-Access-Key；X-Api-Resource-Id 固定标准资源。提交前生成并落盘 X-Api-Request-Id；提交 X-Api-Sequence=-1，查询复用任务 ID、body 为 {}。兼容空提交 body 和返回 task_id 的版本。
- 请求包含 model_name=bigmodel、enable_speaker_info=true、show_utterances=true、enable_itn=true、enable_punc=true；不限制语言为中文。时长不超过 3 分钟用 ssd_version=200，更长用 300；不传声纹库或真实身份标识。
- 响应通过 X-Api-Status-Code 判定：20000000 成功、20000001 转写、20000002 排队、20000003 静音完成。文件结果读取 utterances[].additions.speaker（实时接口为 speaker_id，不能混用）。
- 严格拒绝达到 512 MiB 或 5 小时的音频，导入前和转换后均检查。由于本地上传统一为 PCM16/16 kHz/mono，512 MiB 对应约 4 小时 39 分钟，先触及文件大小约束；明确报错，不裁剪、不偷偷拆为多个计费任务。
- 仅保存文本、时间、匿名编号、词级时间、时长等白名单字段。原始整包、服务端任意错误文本、签名 URL 和密钥不写入任务、日志、稿件或导出。

## 私有 S3 兼容临时存储

配置由 UI 写入 userData/file-transcription-config.enc，系统安全存储加密；UI 回读只返回 endpoint、region、bucket、prefix、forcePathStyle、urlTtlSeconds 和 configured。密码框留空保留已有凭据，可在待处理任务存在时轮换凭据；有未结束任务或未清理对象时禁止更换存储位置。

配置字段：

| 字段 | 含义 |
| --- | --- |
| endpoint | 无用户名、密码、查询参数和片段的 HTTPS 服务地址 |
| region / bucket | 实际区域与专用私有桶 |
| prefix | 应用专用对象前缀，默认 delive-transcription |
| forcePathStyle | 路径式桶地址，默认 true；按服务要求调整 |
| accessKeyId / secretAccessKey | 用户在 686 配置的对象存储凭据 |
| sessionToken | 可选临时凭据令牌 |
| urlTtlSeconds | 默认 86400，允许 60–604800；凭据本身较早过期会缩短有效访问期 |

使用**从未开启版本控制的专用私有桶**。启动上传先调用 GetBucketVersioning，Enabled 或 Suspended 均拒绝，避免 DeleteObject 仅增加删除标记却留下旧音频版本。默认不设置 public-read ACL，必须由桶策略禁止公共访问；686 验证匿名请求不可读取、有签名才可读取、有效期和撤销行为。

所需权限对应 GetBucketVersioning、PutObject（含 Create/UploadPart/CompleteMultipartUpload）、GetObject/HeadObject、DeleteObject、ListMultipartUploads、AbortMultipartUpload。仅授权专用桶/前缀及必要桶级动作。AWS SDK 使用显式配置凭据，不扫描共享凭据或机器角色。分片 8 MiB、并发 2，连接超时 10 秒、请求超时 30 秒，SDK maxAttempts=1；不作隐式业务重投。私有 URL 只在内存产生并提交给火山。

成功、明确失败或用户显式停止后：清理该 UUID 对象的残留分片，DeleteObject，再以 HeadObject 404 确认。无法确认显示「清理未确认」，用户可重试，不伪装成功。有对象锁、保留策略、缺少删除/分片权限或版本控制时不能宣称完成清理。用户显式停止仅终止本地跟踪/删除下载副本，不能撤销火山已接受的任务或计费。

提交结果未知时保留云端副本，**先查询原任务，不自动重投**。关闭应用后没有后台守护清理程序；再次打开应用查询或显式停止清理。签名过期只终止 URL 的访问能力，不等于对象已删除。对象存储流量、容量和火山计费由用户实际服务配置决定，未在本阶段产生真实调用。

## 持久化、恢复与版本迁移

- 原音沿用 recording-assets.md 的目录与手动保留策略。任何云端清理都不删除本地原音。用户配置配额，达到配额时停止写入并保留已提交分片。
- `userData/file-transcription-jobs/<UUID>.json` 保存身份、会话/原音关联、状态、对象键、访问到期时刻、进度、清理状态、独立结果版本；临时写入、fsync 后替换。签名地址和服务凭据不入 JSON。
- 提交前先持久化 submitting；重启将其恢复为 submission-unknown。准备/上传中断恢复为明确本地失败，待清理状态保留。重启删除同任务的衍生上传 WAV，不动原音。
- unknown、queued、processing 阻止同录音新增任务。45000001（可能重复）、55 系列、网络断开、HTTP/协议不确定均保守保留待查询；查询权限/额度/未知状态不擅自认定失败。
- 会话 schema 升至 4。旧会话不依赖新字段；首次追加会后稿时保存原稿快照。versions[] 按 ID 幂等追加，selectedVersionId 保持旧选择；correction、原稿和旧姓名不被覆盖。首次纯音频转写填入兼容展示字段，同时保留独立版本。
- 每份会后稿编号以 `file-<job UUID>:speaker:<原编号>` 限定作用域。与实时稿相同整数不表示同一个人。speakerMapping 仅表示用户显式确认的 sourceVersionId、confirmedAt 和版本内 ID 配对；缺省未确认。没有自动跨版本/跨会议身份合并。
- IndexedDB 保存失败向 UI 报错；主进程任务中的版本保留供下次导入。客户端启动和文件任务刷新都可补入完成版本。稿件、任务和原音是不同数据，不把来源 system/microphone 当作说话人身份。

## 开发验证与正式验收

开发入口和证据见 evidence-too-684.md。适配默认连接真实官方 HTTP 与 S3 SDK；测试替身只存在测试文件和隔离脚本中。

**NOT_RUN——按用户要求移交 TOO-686**：真实 API Key/APP ID/Access Token、真实存储权限及私有性、计费/产品开通、云端真实上传与取回、正式钥匙串可用性、长会议与多人识别质量、打包真机、发布部署。当前隔离 Electron 检测到安全存储不可用；测试中加密可用分支使用明确的加密替身，不等同于正式钥匙串通过。

## 官方契约来源

核对日期 2026-11-02：

- [标准版说明](https://docs.volcengine.com/docs/doubao-voice/large-model-recording-file-recognition-standard-version-api?lang=en)
- [提交任务](https://docs.volcengine.com/docs/doubao-voice/task-submission-http-1?lang=en)
- [查询结果](https://docs.volcengine.com/docs/doubao-voice/result-query-http-1?lang=en)
- [说话人分离](https://docs.volcengine.com/docs/doubao-voice/speaker-separation?lang=en)
- [S3 签名 URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS JavaScript SDK S3 示例](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
