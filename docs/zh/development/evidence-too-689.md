# TOO-689 无文字转写结束响应修复

## 根因与范围

2026-11-03，sqmc03，基线 `118140a`。用户在无转写文字时停止录制或结束重连旧连接，前端报 `PROTOCOL_ERROR: 转写响应不符合消息契约`。

直接向真实火山实时 2.0 服务发送 2 秒生成静音（16 kHz / mono / PCM16，语气词规整开启），收到正常终帧，结构如下（log_id 替换为占位值）：

```json
{"final":true,"sequence":1,"raw":{"audio_info":{"duration":2000},"result":{"additions":{"log_id":"fixture-log-id"}}}}
```

旧 Provider 只忽略非最终元数据帧，最终帧进入要求 `result.text` 的严格解析器，因文本省略而失败。无文字是合法业务结果；不能据此放行任意损坏响应。

## 实现与自审

- 仅当终帧省略 text/utterances、含非空 log_id 及非负有限 duration，且当前识别段无文本/分句时，规范为标准空 complete 结果。共享解析器与历史会话校验保持严格。
- 非最终元数据不清空稿件；已有文字后缺文本终帧仍报错并保留旧稿；鉴权、超时与非法分句保留原有失败语义。
- 本次火山连接正常结束、全部识别段 complete 且原音保存完成后，显示“未识别到语音；原音已保留”或正常完成提示。
- 自审发现跨服务商或已断开的旧 complete 记录可能误覆盖当前失败提示，已限定到本次连接仍处于正常连接状态的火山 Provider，并覆盖原音保存失败/中断、识别未完成、已断开和其他服务商。
- 协议错误 details 只含处理阶段和白名单校验原因，不输出原始 JSON 错误正文、识别文本或凭据。当前诊断包仍只收集主进程日志，前端 details 在渲染控制台查看。

影响范围为 VolcProvider、停止录制提示、对应测试和协议文档；不更改采音、持久化结构、配置、依赖或公共导出。不将系统音轨无声的硬件排查混入本卡。

## 开发阶段验证

- 全量 Vitest：57 文件 / 456 项通过（补充 Hook 防覆盖测试之前）。
- 最终定向测试：3 文件 / 27 项通过，包含 7 项 Hook 测试；未把它们算成已运行的全量 463 项。
- 前端和 Electron 构建通过；前端仍有既有大 chunk 提示。
- 全量 lint：0 错误 / 15 项既有警告；最终修改的四个 TS 文件定向 lint 无错误或警告。
- 真实桌面集成：产品 main/preload/UI/本地代理/云端服务，输入替换为生成静音与已有 Tingting 中文样本。静音停止后界面提示正确、空识别段 complete；静音旧连接经设备变化重连后正常完成，下一识别段返回合成语音，ID 独立且时间有偏移；无渲染错误；两次会话三轨原音可读；重载保留空稿与有字稿。
- 实际未调用现场麦克风或系统采音，不代表真实设备、多人归属或长会验收。

本机忽略目录证据：`tmp/evidence/689/silence-response.json`、`unit.log`、`final-focused.log`、`lint.log`、`lint-final.log`、`build-client-final.log`、`build-electron.log`、`acceptance.json`、`acceptance-final.log`、`silence-ui.png`、`reconnect-ui.png`。隔离验收脚本与 profile 在 `tmp/too-689/`；真实凭据仅从既有受控文件读取，隔离 profile 使用 safeStorage 加密，不写入上述摘要或 Git。

## 交付边界

用户授权完成 PR 并合入 main，Linear 状态随实际交付流转。提交/合并收尾复用上述开发阶段证据，不重复执行测试。未公开发布、未替换当前运行的 DeLive SQ 旧包；实际使用新行为需重新构建并启动更新后的应用。
