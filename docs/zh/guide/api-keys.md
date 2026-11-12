# 火山语音识别配置

1. 在火山语音控制台开通需要使用的实时或标准文件转写能力。
2. 在 DeLive SQ 的「设置 → 转写服务 → 火山引擎」填写 API Key，或填写 APP ID 与 Access Token。凭据由桌面客户端加密保存。
3. 使用标准文件转写时，再在「设置 → 私有文件存储」配置私有 S3 兼容存储。实时录音不依赖临时存储。

更多配置与任务行为见[火山实时 2.0](../development/volc-realtime)和[火山标准文件转写 2.0](../development/volc-file)。本地识别配置见 [ASR Provider](./providers)。
