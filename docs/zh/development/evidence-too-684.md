# TOO-684 开发证据

执行机 sqmc04，仓库 /Users/suqing/Coding/app/DeLive；分支 suqing/too-684-file-transcription；基线 fd1d9ae249de3ec77c8d0491cdf12e09e8d5e918。macOS 27.0.1 / Node 25.9.0 / Electron 40.0.0。对应源码清单见 evidence/too-684/source.sha256；PR/合并 SHA 回写 Linear。

## 实现与验证入口

- 标准 submit/query、持久化状态机、16 kHz 逐块混音导出、真实 S3 SDK 上传/签名/清理、安全存储配置、原音选择与文件导入、独立版本/schema 4、任务结果补入 IndexedDB。
- `cd frontend && npm run test -- src/utils/fileTranscriptionNative.test.ts`：16 项，PASS。覆盖公共时间轴空隙、落盘先于提交、未知提交/重启只查询、同原音未决任务去重、上传失败与取消、超限、静音、鉴权/额度 HTTP、URL 过期、清理重试、标准参数/认证、响应白名单、旧稿/姓名/校对共存、映射契约。
- `npm run test:frontend` 首轮：55 文件、424 项，422 PASS，2 项旧测试仍断言 schema 3。已更新为 schema 4；相关 sessionRepository/backupStorage 与新增任务测试复测 3 文件 22 项 PASS。后续补充 HTTP 错误测试，最终该任务文件 16 项 PASS。没有把首轮失败日志改写成全绿。
- `node scripts/test-file-s3.cjs`：PASS。真实编译 S3 SDK，loopback HTTP fixture、虚构密钥和 17 MiB 合成数据；分片上传/进度、24 小时 SigV4 URL、残留分片清理、删除后 HEAD 404、拒绝版本桶。
- `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-file-electron.cjs`：PASS。编译 UI + production preload/可信 IPC/状态机 + 真实 IndexedDB/原音目录；云端服务为替身，拒绝所有外部 HTTP/WS。完成 2 个合成任务、仅 2 次显式提交、2 次查询和清理。覆盖配置 UI、安全存储不可用拒绝写入、未知提交后 reload 查询同 ID、原稿/人工校对/姓名不变、独立版本、实际 WAV 导入与重新打开。
- 加密可用分支用隔离 AES 替身模拟，不是产品 fallback。当前隔离 Electron 真实 safeStorage.isEncryptionAvailable() 为 false；真实钥匙串成功为 NOT_RUN，交接 686。
- `npm run build:electron`、`npm run build:client`：PASS。前端 lint：0 errors / 15 项既有 warnings。构建保留既有 chunk size / Browserslist 提示。
- file-ui.png 已人工视觉检查：无遮挡弹窗，配置、提交入口、清理确认、独立版本预览均可读。它是开发界面证据，不是正式会议验收。

详细输出保存在 evidence/too-684/。两次早期 UI 脚本失败分别为导航文字选择器不匹配、未点击文件选择后的开始按钮；修正测试步骤后完整通过，不将前两次当作产品流程通过。

## 对抗式 Review

重点检查「响应丢失后重复计费」「云端删除影响原音」「版本到达覆盖校对」「显示成功但未持久化」「崩溃残留分片」「敏感数据落盘」。

已修复/落实：
- 提交前 fsync 身份和 submitting；网络与不确定响应转 unknown，不自动重投；状态持久化失败同样保守保留未知结果。
- 查询未确认不误判终态；明确 HTTP 401/403/429/413 与网络/服务未知分开提示。
- 本地原音、衍生上传 WAV 与云端对象分别管理；只清理衍生文件/本任务 UUID 云端对象。
- 重启清理遗留衍生 WAV；SDK 清理不完整分片。版本桶拒绝上传，删除需 HEAD 404，失败可手动重试。
- 版本加入 schema 正规化，持久化成功才更新内存；启动补入结果，用户已删除会话不自动重建。
- 版本 ID 幂等、匿名 ID 按任务隔离；编号不自动继承姓名，人工映射 UI 由 685 承接，契约已保存。
- 桌面配置不可用时明确提示；多文件导入顺序执行，避免导入中状态提前结束。
- 原音转换按分块处理，静音补齐时间缺口；检查目标衍生目录所在磁盘空间。

限制与交接：
- 真实权限、匿名不可读、URL 有效期、对象生命周期、产品配额/计费、长音频内存和多人质量仍需 686 验证；没有用替身结论推断。
- 导入已有压缩文件使用浏览器完整解码，长文件内存开销大；应用会议原音导出为逐块。统一 PCM WAV 下大小限制约先于 5 小时时长限制触发，明确拒绝而不截断。
- 应用关闭时无后台清理守护；未知提交的临时对象需重新打开后查询/显式清理。
- 依赖安装报告由基线 56（2 low / 13 moderate / 38 high / 3 critical）变为 53（2 / 11 / 37 / 3）；没有执行 npm audit fix 或宣称历史依赖已安全。保留此现有发行风险给 686 评估。
- 本阶段 **NOT_RUN——按用户要求移交 TOO-686**：真实火山/云存储调用、钥匙串实际成功、正式打包硬件会议、准确率/归属阈值、发布部署。
