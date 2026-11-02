# 双来源录音与原音资产（TOO-682）

需求权威入口：[Linear 项目 Overview](https://linear.app/sisyphus-sq/project/delive-会议录音与转写-cb96ccb694d1)，本页记录实现与操作契约。开发机器 sqmc04，仓库 /Users/suqing/Coding/app/DeLive。正式真实设备验收在 [TOO-686](https://linear.app/sisyphus-sq/issue/TOO-686)，当前 NOT_RUN。

## 使用

Live 页可分别启用系统声音和麦克风，选择麦克风设备；至少启用一项。系统声音沿用 Electron display-media / loopback，麦克风使用 getUserMedia；两者各自需要 macOS 授权，首次系统来源使用现有来源选择器。来源和设备名、音量、权限拒绝、静音或结束状态分别显示，来源不等同于说话人。

“仅录音（无需密钥）”保存原音而不连接 ASR。未勾选但转写配置缺失或连接失败时，明确显示转写失败且本地原音继续保存。Provider 热切换只重建转写编码器，不中止原音归档。设备变化会重新获取来源并保留采集间隔，全部来源结束会停止录音。单路结束仍保存另一来源，可停止后重新录制。

默认保留全部原音，不定期删除（用户已确认）。在“原音存储与恢复”查看保存目录、占用、录音列表，设置 GiB 配额；0 表示不限制应用配额，但仍受真实磁盘可用空间限制。超过配额、磁盘错误或写入积压会停止录音并保留已提交分片，不自动清理旧录音。配额按每个保存目录独立计算。

默认位置为 Electron userData/recordings。更改位置通过系统目录选择器，在所选位置创建 delive-recordings 子目录，只影响新录音；旧目录仍登记并可访问。配置登记于 userData/recording-storage.json。正在录音时不能修改存储配置。界面“删除原音”经二次确认后永久删除该录音目录；只删除文字会话不删除原音。音频不进入现有文字 JSON 备份，需另行备份目录及索引。云端临时副本不属于此生命周期。

## 音频与时间轴

- 一个 48 kHz AudioContext 驱动两个输入，AudioWorklet 在相同帧边界输出系统、麦克风和混音；启用来源分别保存 48 kHz / mono / PCM16 WAV。
- 每秒形成一个完整独立 WAV 分片，停止时刷新不足一秒的尾块。混音为两路各 0.5 增益相加，保留峰值余量；单路时仍沿用相同增益。
- 系统音频关闭回声消除、降噪和自动增益；麦克风请求 Chromium 回声消除、降噪并关闭自动增益。保存的麦克风原音指采集 API 输出，不是未经设备处理的硬件信号。没有文字去重式回声掩盖。
- 麦克风回声消除对远端系统声音的真实效果、蓝牙/耳机/外放支持仍需 TOO-686 测量，不能由合成测试推定。
- ASR 从混音流按既有 Provider 格式编码；网络和 ASR 生命周期不拥有磁盘录音。重采集使用单调时钟偏移，等待权限、设备重建的间隔不压缩。
- 每块 startMs、frames、sampleRate 确定实际区间。相邻块有间隔即缺口；events 的来源 ended/muted/active 给出各来源中断边界。缺失来源在混音中为零，不意味着该时段没有其他说话人。

## 持久化契约

shared/recording.ts 定义版本 1 的 RecordingManifest、AudioBlock、RecordingPacket 和受信 IPC API：

```text
recordings/<sessionId>/
  index.json             # 生命周期、来源状态、事件；schemaVersion=1
  0/block.json           # 第 0 块时间、格式、来源与字节数
  0/system.wav
  0/microphone.wav
  0/mix.wav
  1/...
  pending/               # 未提交块；恢复不采信
```

每块先在 pending 内完整写入音频、fsync 和块描述，再原子重命名为块序号目录。索引采用临时文件替换，采集块目录是增量日志。不会为整场会议缓存音频；待写队列有界。已提交 WAV 可独立用播放器或解码器读取，后续卡通过 readBlock 取音，不暴露任意本机路径读取。

停止完成后更新状态。进程异常退出留下 recording 状态，下次读取扫描完整块、标记 interrupted，并记录末尾未提交部分不可恢复。恢复的是已保存内容，不自动重新授权录音；继续录制新建会话。损坏或缺失分片明确报错，坏录音在列表单独标记，不阻断其他文字会话；原文件保留供人工处理。

TranscriptSession 新增可选 audioRecordingId。旧文字会话不需要音频字段，不因缺失音频阻断已有编辑/导出。原音归档先于文字索引存在时，启动可重建中断录音的会话入口。已完成录音不会自动重建用户已删除的文字会话。已有 schema 3 采用兼容的可选字段扩展，音频结构独立版本化；稿件版本在后续卡处理。

## 开发验证

验证记录见 [TOO-682 开发证据](./evidence-too-682)。测试只使用内存合成正弦 PCM、临时文件及 mediaDevices 替身。Electron 集成运行真实编译后的界面、preload、IPC、AudioWorklet 和磁盘实现，隔离 userData 并禁止所有 HTTP/WebSocket；不证明真实系统采集、声学回声或火山效果。

```sh
npm run test:frontend
npm run build:electron
npm run build:client
node_modules/.bin/electron scripts/test-recording-electron.cjs
```

脚本生成仓库 tmp/evidence/682-ui.png，临时应用目录位于系统 temp，运行结束删除测试数据。只在开发或相关修复期间运行；提交、推送及合并收尾复用已有证据。

## 正式验收交接

TOO-686 需使用正式应用权限和实际设备验证：双来源双方音频、原音/混音回放、耳机和外放回声、三人插话、长会内存/磁盘/漂移、静音与拔插、拒绝权限、磁盘满、断网和异常退出恢复。真实测试须记录 macOS、Electron、设备、持续时间和指标。当前开发环境 macOS 27.0.1 / Electron 40.0.0，不能推广为其他版本兼容承诺；未引入额外原生适配。

平台依据：[Electron 40 desktopCapturer](https://github.com/electron/electron/blob/v40.0.0/docs/api/desktop-capturer.md)、[session display media handler](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts)。现有 Electron 路径已用合成流验证管线，正式平台采集兼容性仍待实测。
