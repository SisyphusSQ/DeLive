# ASR Providers

Volcengine is the default and only cloud ASR provider in DeLive SQ. Three local services are available. Recording and file transcription can use different providers.

| Provider | Recording | File transcription |
| --- | --- | --- |
| Volcengine | Realtime 2.0 streaming with speaker diarization | Standard File Transcription 2.0 for imports and saved recordings |
| Local OpenAI-compatible | Windowed batch | `/v1/audio/transcriptions` |
| Local FunASR / SenseVoice | Windowed batch | `/v1/audio/transcriptions` |
| Local whisper.cpp | Electron-managed runtime | Decoded 16 kHz mono WAV sent to local `/inference` |

## Volcengine

Enter an API Key or an APP ID and Access Token in service settings. Realtime ASR connects via the loopback proxy. File transcription also needs private temporary object storage. See the [API Key Guide](./api-keys).

Realtime translation and the floating caption window have been removed. Timed original transcripts can still be exported as SRT or VTT from Review.

## Local OpenAI-Compatible

Works with Ollama or any service exposing the OpenAI-compatible audio transcription endpoint.

**Required:** `baseUrl`, `model`

**Optional:** `apiKey`, `languageHints`

DeLive can probe the service at `baseUrl`, list installed models via `/v1/models`, and pull models from Ollama if detected.

## Local FunASR / SenseVoice

Local transcription through a self-hosted [FunASR](https://github.com/modelscope/FunASR) `funasr-server`, which exposes an OpenAI-compatible `/v1/audio/transcriptions` endpoint. No API cost.

**Required:** `baseUrl` (default `http://127.0.0.1:8000`)

**Optional:** `model`, `languageHints`

Models: `sensevoice` (default; multilingual with emotion and audio-event tags), `paraformer` (production-grade Chinese with VAD and punctuation), and `fun-asr-nano` (LLM-based, 31 languages).

Start the server with:

```bash
pip install funasr
funasr-server --device cuda --port 8000
```

Use `--device cpu` without an NVIDIA GPU, or `--device mps` on Apple Silicon. Older configs that used `paraformer-en` (rejected by funasr-server) fall back to `sensevoice` automatically.

## Local whisper.cpp

Fully offline transcription using the `whisper-server` binary.

**Required:** `modelPath`

**Optional:** `binaryPath`, `port` (default 8177), `languageHints`

DeLive can import or download both the binary and model files. Silent audio chunks are automatically skipped to reduce unnecessary inference.
