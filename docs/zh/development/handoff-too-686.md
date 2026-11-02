# TOO-686 正式验收交接

本文件是前四卡开发阶段的交接，不授权自动启动 TOO-686、公开发布、部署或启用更新。TOO-686 与项目保持未完成。所有正式真实验收为 **NOT_RUN——按用户要求移交 TOO-686**。

## 已交付开发基线

执行目标为 **sqmc04**，目录 /Users/suqing/Coding/app/DeLive，fork SisyphusSQ/DeLive 的 main。初始提示词里的 sqmc05 已被本次用户明确指令替换；没有把 sqmc04 的结果推广为其他机器通过。

| 卡片 | PR / 合并 | 开发证据 |
| --- | --- | --- |
| TOO-682 | [PR #1](https://github.com/SisyphusSQ/DeLive/pull/1)，b0d680841c8e2404114ee3213d17c196d720658a | [证据](./evidence-too-682.md)、[原音契约](./recording-assets.md) |
| TOO-683 | [PR #2](https://github.com/SisyphusSQ/DeLive/pull/2)，fd1d9ae249de3ec77c8d0491cdf12e09e8d5e918 | [证据](./evidence-too-683.md)、[实时配置](./volc-realtime.md) |
| TOO-684 | [PR #3](https://github.com/SisyphusSQ/DeLive/pull/3)，ddccfd4e8477b58b21eaa88e49e3534338f8109b | [证据](./evidence-too-684.md)、[文件与存储配置](./volc-file.md) |
| TOO-685 | [PR #4](https://github.com/SisyphusSQ/DeLive/pull/4)；最终合并 SHA 在 [TOO-685](https://linear.app/sisyphus-sq/issue/TOO-685) 和 [TOO-686](https://linear.app/sisyphus-sq/issue/TOO-686) 最终交接回写 | [证据](./evidence-too-685.md)、[回放/版本/导出](./review-playback.md) |

环境快照：macOS 27.0.1 / Node 25.9.0 / npm 11.12.1 / Electron 40.0.0。开发测试数据为合成 PCM/振荡器与协议样例/替身；真实云端、真实录音设备和正式打包应用未验收。实际实现默认使用真实官方 HTTP/WebSocket 和 S3 SDK，测试替身仅在测试/脚本中。

## 开始正式阶段前

1. 用户明确启动 TOO-686 后，回读项目 Overview、五张卡、main 与四个 PR 的合并 SHA，保留已有修改。
2. 明确自有应用名称、appId、用户数据目录、原版共存/迁移、签名/公证/分发策略与更新源。现有 package.json build 配置仍保留上游 com.delive.app、DeLive 和 XimilalaXiang 发布源；本阶段未修改它们，不得直接据此发行独立 fork 或开启更新。
3. 明确正式目标 macOS、设备、耳机/外放场景、样本许可/人工标注方式、会议时长和人数，确认文字错误、说话人归属、延迟、回放偏差、漂移、CPU/内存/磁盘及清理时限的量化阈值。
4. 用户只在受控目标机器配置凭据，不向聊天、Linear、仓库或日志粘贴值。缺少正式配置时对应项目记为 BLOCKED/NOT_RUN，不能将模拟结果算通过。
5. 复用已有开发证据；只对新环境、真实服务、正式包与发现的缺陷做必要验证。提交/推送/发版收尾不重复测试，不用 --no-verify。

## 真实配置入口与必要资源

### 火山

桌面设置页 → 火山引擎。使用 providerConfigs.volc.apiKey，或 providerConfigs.volc.appKey（APP ID）+ providerConfigs.volc.accessKey（Access Token）。enableDdc 为显式口语顺滑选择，默认 false。正式配置需要系统安全存储可用；不以环境变量探测或默认机器角色获取秘密。

- 实时 WebSocket：wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async，资源 volc.seedasr.sauc.duration；16 kHz PCM16 mono；匿名分离 200，完整快照和 utterances。
- 标准文件：POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit 与 /query，资源 volc.seedasr.auc；小于等于 3 分钟 SSD 200，更长 300。不得误开/误用极速 auc_turbo 代替标准资源。
- 确认两产品实际开通、鉴权形式、资源权限、额度和计费口径。报告实际账单或回执，不把代码选择或估算写成实际计费。
- 不启用声纹库、真实身份识别或跨会议认人。重连按新识别段隔离匿名编号。

### 私有临时对象存储

文件页 → 火山 → 私有临时存储配置：

endpoint、region、bucket、prefix、forcePathStyle、accessKeyId、secretAccessKey、sessionToken（可选）、urlTtlSeconds（默认 86400）。正式用户填写实际值，不提交完整配置。

配置由 Electron safeStorage 加密保存为 app.getPath('userData')/file-transcription-config.enc；任务在同目录 file-transcription-jobs/，只包含无凭据的身份、状态、对象键和结果。火山凭据使用同一 userData 下现有安全存储模块；原音路径/配额在录音界面显式设置。发行阶段确定 appId/数据目录后，要验证这些数据的迁移与隔离，不能假设开发目录等于正式包目录。

专用私有桶必须从未启用版本控制。需要 GetBucketVersioning、PutObject/分片上传、GetObject/HeadObject、DeleteObject、ListMultipartUploads、AbortMultipartUpload 的必要权限。按桶/专用前缀限权；检查公共访问禁止、签名访问正常、火山可下载、凭据提前过期对 URL 的影响。上传并发/分片参数与清理步骤见 volc-file.md。

已确认生命周期：
- 本地原音不自动删除，界面显示占用、提供显式删除；配额由用户配置，满额停止并保留已落盘部分。
- 私有临时链接默认 24 小时。完成/明确失败后清理对象并验证 404；未知提交保留副本，先查询同一 ID，不自动重投。
- URL 到期不等于对象删除；应用关闭没有后台清理守护。重启后查询/显式清理，失败保留清理未确认状态。
- 手动停止不能撤销云端已接受的任务或计费。检查对象版本、残留分片、删除权限/对象锁，不能只检查删除标记。

## 启动与真实验收步骤（待本卡授权后执行）

在 sqmc04 仓库确认 main 后，按 setup.md 准备依赖；开发运行入口 npm run dev，仅用于配置和问题定位。正式包的配置变更、构建、签名、公证以及实际包运行由本卡另行执行，开发 Electron 通过不等于正式包通过。

1. **双来源/权限**：正式包分别授权麦克风和系统录音，确认 system/microphone/mix 文件与来源状态。耳机、外放、无声、静音、来源结束、拒绝权限、设备拔插/切换逐项记录；外放重复采音/回声要实测。
2. **真实实时识别**：至少三人轮流、短插话、同时重叠，保留匿名编号、缺失/临时/稳定状态和真实时间。验证修订/重复/终帧、停止超时、断网原音继续落盘、手动重连不跨段合并编号。
3. **长会/恢复**：在确认的时长和资源阈值下录制，检查持续落盘、时间漂移、内存/CPU/磁盘占用；配额满、实际磁盘不足、进程/renderer 中断和重新启动后的已提交分片与缺口。
4. **标准文件任务**：用同一批短/长标注音频核对标准资源和 SSD、上传进度、服务下载 URL、排队/转写/静音/失败；重启查询、提交响应丢失、URL 过期、401/403/额度失败、文件大小/时长超限。记录同 ID 查询和实际计费证据，未知状态不直接重投。
5. **清理与保留**：成功/明确失败、取消、残留分片和删除权限失败；确认云端对象实际不可读/不存在，本地三路原音还在；更换存储位置被未结束/未清理任务阻止，凭据轮换能继续处理。
6. **回放校对**：三路播放、文字定位、时间缺口、音频缺失；实际耳机/扬声器偏移和长会漂移按确认阈值测量。改名、改字、归属/时间修正、版本选择/对照、晚到会后稿、编号重排与显式映射；保存重开、旧纯文字历史与 TXT/MD/SRT 字节内容核对。
7. **安全与发行**：检查实际钥匙串成功、日志/导出/备份无明文凭据和临时 URL，原版共存/迁移、更新源隔离、许可证/版权、签名与分发依据。公开发布、部署或启用自动更新仍需单独授权。

每项填写 PASS / NOT_RUN / BLOCKED / PARTIAL / UNKNOWN，注明机器、OS、包/commit、设备、样本/时长/人数、资源参数、实际指标、时间、清理状态和证据入口；不上传原始密钥或受控访问地址。

## 已知限制与未确认项

- 当前隔离 Electron 的真实 safeStorage.isEncryptionAvailable() 为 false。不可用时产品阻止凭据明文持久化；加密成功测试使用明确的隔离替身。正式包/用户钥匙串必须实测，这是正式配置前置条件。
- 统一 PCM16 / 16 kHz / mono 上传，小于 512 MiB 的大小限制约在 4 小时 39 分钟先于 5 小时触发；明确拒绝，不裁剪或自动多次提交。若正式需求超过此范围需重新讨论服务契约/显式分段及计费。
- 应用录音逐块导出，回放约 4 秒预读；已有压缩文件导入仍采用浏览器完整解码，长文件导入内存和大规模稿件 UI 资源尚未正式测量。
- 开发播放检查小于 1ms 指调度到目标 PCM 位置的参数，不包含系统输出延迟、ASR 时间误差或设备时钟漂移；正式阈值尚未确认。
- 不具备回声消除/重叠说话人准确率的正式结论；来源数绝不是人数。
- npm 安装审计仍报告 53 项（2 low / 11 moderate / 37 high / 3 critical），基线为 56；未自动 audit fix，需在独立发行风险评估中处理，不宣称依赖安全已通过。
- 本阶段未修改发行标识/更新源，未打正式包、未发布、未部署，未启动 TOO-686。
