# TOO-683 开发证据

执行机 sqmc04，目录 /Users/suqing/Coding/app/DeLive，分支 suqing/too-683-volc-realtime，基线 b0d680841c8e2404114ee3213d17c196d720658a。macOS 27.0.1 / Node 25.9.0 / Electron 40.0.0。对应源码 SHA-256 清单见 evidence/too-683/source.sha256；合并 SHA 回写 Linear 与 PR。

## 验证入口

- `npm run test:frontend`：现有回归、协议 0/1/2/3 序号/终帧、gzip/明文、帧损坏、2.0 参数、完整快照修订/重复、匿名身份隔离、时间偏移、schema 持久化、停止超时、取消连接、安全存储/导出脱敏。
- `node scripts/test-volc-proxy.cjs`：真实编译代理与 codec，传输替换为内存对象，检验 Header、初始请求、二进制音频、完整响应、单次结束标记与解析失败。
- `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron scripts/test-volc-electron.cjs`：编译 UI、真实 preload/可信 IPC/IndexedDB/原音文件，媒体与 WebSocket 为合成替身，所有 HTTP/WS 网络请求被拒绝。覆盖临时/未知、稳定修订、网络错误不停原音、手动重连与时间/身份边界、收尾、保存重开与安全存储不可用分支。
- `npm run build:electron`、`npm run build:client`、前端 lint。
- 截图 live-ui.png 进行了人工视觉检查，显示独立识别段、时间戳、状态和错误反馈；只证明开发界面，不是正式真机会议验收。

结果：PASS（54 个测试文件、412 项测试；代理集成与 Electron 界面/持久化；前后端构建）。前端 lint 为 0 errors / 16 项既有 warnings；改动文件针对性 lint 为 0 errors / 1 项既有 App.tsx loadTopics 依赖 warning。结果记录位于 evidence/too-683/。首次全量回归的两项新增字段翻译失败已修复，随后相关复测通过。加密可用分支由测试替身验证；当前隔离 Electron 真实安全存储不可用，未将其记成钥匙串成功。

## 对抗式 Review

修复了原代理无条件跳过序号、只认 flag=3 终帧、gzip 错误吞掉、凭据 URL/初始化日志泄漏、binary PCM 被误判 JSON、重复结束标记、固定 500ms 丢尾稿、重连前移除监听器丢最终结果、连接取消悬挂、配置标记导致完整快照重复，以及旧凭据无法加密时保留磁盘明文的问题。引入 100ms PCM 组包与有界积压错误，避免每个 AudioWorklet render quantum 单独发网络包。

没有新增自动重试、跨识别段身份猜测、声纹或真实身份库。完整结果仅保存每连接的最新白名单响应与 revision/sequence，不保存无限响应历史。正式识别质量、多人归属、重叠声音、实际网络和用户配置的保留策略不由替身测试推断。

正式验收：**NOT_RUN——按用户要求移交 TOO-686**。真实火山/云存储凭据、计费调用、正式打包硬件会议、发布与部署未执行。
