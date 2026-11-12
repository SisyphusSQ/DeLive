# ASR Provider

DeLive SQ 默认使用火山引擎，支持实时 2.0 和标准文件转写 2.0。服务设置同时提供三种本地识别。录制和文件转写可分别选择服务。

| 服务 | 录制 | 文件转写 |
| --- | --- | --- |
| 火山引擎 | 实时流式、说话人分离 | 标准文件转写 2.0，支持导入文件及已有会议原音 |
| 本地 OpenAI 兼容 | 窗口批处理 | `/v1/audio/transcriptions` |
| 本地 FunASR / SenseVoice | 窗口批处理 | `/v1/audio/transcriptions` |
| 本地 whisper.cpp | Electron 托管运行时 | 解码为 16 kHz 单声道 WAV，提交到本机 `/inference` |

## 火山引擎

在服务设置中填写 API Key 或 APP ID + Access Token。实时路径经本机代理连接。标准文件转写需要另行配置私有临时对象存储，详见 [API Key 获取指引](./api-keys)。

悬浮字幕窗和实时翻译已下线。带有效逐句时间的采用稿可在回顾页导出原文 SRT/VTT。

## 本地 OpenAI 兼容

兼容 Ollama 或任何暴露 OpenAI 兼容音频转录端点的服务。

**必填：** `baseUrl`、`model`

**可选：** `apiKey`、`languageHints`

DeLive 可探测 `baseUrl` 处的服务，通过 `/v1/models` 列出已安装模型，如检测到 Ollama 还可拉取模型。

## 本地 FunASR / SenseVoice

通过自建的 [FunASR](https://github.com/modelscope/FunASR) `funasr-server` 本地转录，该服务提供 OpenAI 兼容的 `/v1/audio/transcriptions` 接口，无 API 费用。

**必填：** `baseUrl`（默认 `http://127.0.0.1:8000`）

**可选：** `model`、`languageHints`

模型：`sensevoice`（默认；多语言，带情感与音频事件标签）、`paraformer`（中文生产级，含 VAD 与标点）、`fun-asr-nano`（基于 LLM，31 种语言）。

启动服务：

```bash
pip install funasr
funasr-server --device cuda --port 8000
```

没有 NVIDIA 显卡时用 `--device cpu`，Apple 芯片可用 `--device mps`。旧配置中的 `paraformer-en`（funasr-server 不支持）会自动回退为 `sensevoice`。

## 本地 whisper.cpp

使用 `whisper-server` 二进制文件的完全离线转录。

**必填：** `modelPath`

**可选：** `binaryPath`、`port`（默认 8177）、`languageHints`

DeLive 可导入或下载二进制文件和模型文件。静音音频块会自动跳过以减少不必要的推理。
