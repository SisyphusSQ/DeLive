import type { RealtimeRecognition } from '../../types/realtime'
import { parseVolcSnapshot, VolcUtteranceError } from '../../utils/volcTranscript'
/**
 * 火山引擎 ASR Provider 实现
 * 
 * 由于浏览器原生 WebSocket 不支持自定义 HTTP Headers，
 * 而火山引擎需要通过 Headers 传递认证信息，
 * 因此通过本地代理服务器转发 WebSocket 连接。
 */

import { BaseASRProvider } from '../base'
import type {
  ASRProviderInfo,
  ProviderConfig,
  ASRVendor,
} from '../../types/asr'

import { getProxyWsUrl } from '../../utils/proxyUrl'

export class VolcProvider extends BaseASRProvider {
  readonly id: ASRVendor = 'volc' as ASRVendor

  readonly info: ASRProviderInfo = {
    id: 'volc' as ASRVendor,
    name: '火山引擎',
    description: '字节跳动旗下语音识别服务，支持中文优化，实时 + 文件转录',
    type: 'cloud',
    supportsStreaming: true,
    capabilities: {
      audioInputMode: 'pcm16',
      audioProfile: {
        payloadFormat: 'pcm16',
        sampleRateHz: 16000,
        channels: 1,
        preferredChunkMs: 100,
      },
      transport: {
        type: 'realtime',
        captureRestartStrategy: 'reuse-session',
      },
      prompting: {
        supportsLanguageHints: true,
      },
      workloads: {
        liveCapture: {
          availability: 'implemented',
          executionMode: 'realtime-stream',
          inputSources: ['system-audio', 'microphone'],
          acceptedFileKinds: ['audio'],
        },
        fileTranscription: {
          availability: 'implemented',
          executionMode: 'native-job',
          inputSources: ['file'],
          acceptedFileKinds: ['audio'],
        },
      },
      supportsConfigTest: true,
      supportsSpeakerDiarization: true,
      timestamps: { supportsSegmentTimestamps: true },
    },
    requiredConfigKeys: [],
    supportedLanguages: ['zh', 'en'],
    website: 'https://www.volcengine.com/product/speech',
    docsUrl: 'https://www.volcengine.com/docs/6561/80818',
    configFields: [
      { key: 'apiKey', label: 'API Key（新版控制台）', type: 'password', required: false, description: '或使用下方旧版 APP ID + Access Token' },
      { key: 'enableDdc', label: '语气词规整', type: 'boolean', required: false, defaultValue: false, description: '默认关闭；开启会删除部分语气词与重复内容' },
      {
        key: 'appKey',
        label: 'APP ID',
        type: 'password',
        required: false,
        placeholder: '输入你的 APP ID',
        description: '从火山引擎控制台获取',
      },
      {
        key: 'accessKey',
        label: 'Access Token',
        type: 'password',
        required: false,
        placeholder: '输入你的 Access Token',
        description: '从火山引擎控制台获取',
      },
      {
        key: 'languageHints',
        label: '语言提示',
        type: 'text',
        required: false,
        placeholder: 'zh, en',
        description: '用逗号分隔的语言代码',
      },
    ],
  }

  private ws: WebSocket | null = null
  private ready = false
  private terminal = false
  private stopping = false
  private snapshot: RealtimeRecognition | null = null
  private recognitionId = ''
  private offsetMs: number | undefined
  private revision = 0
  private pending = Promise.resolve()
  private pendingBytes = 0
  private audioTail = new Uint8Array()
  private settled: (() => void) | undefined
  private rejectConnect: ((error: Error) => void) | undefined
  private stopPromise: Promise<void> | undefined

  async connect(config: ProviderConfig): Promise<void> {
    if (!(config.apiKey || (config.appKey && config.accessKey))) throw new Error('请配置 API Key，或 APP ID 与 Access Token')
    if ((config.languageHints ?? []).some(x => !['zh', 'zh-CN', 'en', 'en-US'].includes(x))) throw new Error('实时二遍说话人分离仅支持中英文，请移除其他语言提示')
    this._config = config
    this.recognitionId = crypto.randomUUID()
    this.setState('connecting')
    const url = await getProxyWsUrl('/ws/volc')
    return new Promise<void>((resolve, reject) => {
      this.rejectConnect = reject
      const ws = new WebSocket(url)
      this.ws = ws
      const timer = setTimeout(() => fail('CONNECT_TIMEOUT', '转写连接超时'), 15000)
      const fail = (code: string, message: string, details?: Record<string, unknown>) => {
        if (this.terminal) return
        this.terminal = true
        this.ready = false
        clearTimeout(timer)
        this.publishIncomplete(code)
        reject(new Error(message))
        this.settled?.()
        ws.close()
        this.emitError(this.createError(code, message, details))
      }
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', config: {
        apiKey: config.apiKey, appKey: config.appKey, accessKey: config.accessKey, enableDdc: config.enableDdc === true,
      } }))
      ws.onmessage = event => {
        let stage = 'json'
        try {
          const msg = JSON.parse(event.data)
          stage = 'message'
          if (msg.type === 'ready') {
            clearTimeout(timer); this.ready = true; this.setState('connected'); resolve()
          } else if (msg.type === 'snapshot') {
            if (this.terminal) return
            stage = 'snapshot'
            const result = msg.raw?.result
            const metadataOnly = result?.text === undefined && result?.utterances === undefined &&
              typeof result?.additions?.log_id === 'string' && result.additions.log_id.length > 0
            // 初始化元数据不替换稿件；真实静音终帧另带时长，但省略文本和分句。
            if (!msg.final && metadataOnly) return
            if (typeof msg.sequence === 'number' && this.snapshot?.sequence !== undefined && Math.abs(msg.sequence) < Math.abs(this.snapshot.sequence)) return
            const duration = msg.raw?.audio_info?.duration
            const emptyFinal = msg.final === true && metadataOnly && typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 &&
              !this.snapshot?.text && !this.snapshot?.segments.length
            this.snapshot = parseVolcSnapshot(emptyFinal ? { result: { text: '', utterances: [] } } : msg.raw,
              this.recognitionId, this.offsetMs ?? 0, ++this.revision, msg.final === true, msg.sequence)
            this.emit('onRealtime', this.snapshot)
            if (msg.final) {
              this.terminal = true; this.ready = false
              clearTimeout(timer); this.settled?.(); this.emitFinished()
            }
          } else if (msg.type === 'error') {
            fail(String(msg.code || 'SERVER_ERROR'), String(msg.message || '火山识别失败'))
          } else fail('PROTOCOL_ERROR', '未知的转写代理消息')
        } catch (error) {
          // 只暴露本地校验原因，JSON 错误正文可能包含服务响应或敏感文本。
          const reason = error instanceof Error && ['火山响应缺少 result.text', '火山分句格式错误', '火山分句时间或状态错误'].includes(error.message)
            ? error.message : '消息解析失败'
          fail('PROTOCOL_ERROR', '转写响应不符合消息契约', { stage, reason,
            ...(error instanceof VolcUtteranceError ? error.details : {}) })
        }
      }
      ws.onerror = () => fail('NETWORK_ERROR', '转写网络连接失败，原音继续保存')
      ws.onclose = () => {
        clearTimeout(timer)
        if (!this.terminal) fail('CONNECTION_CLOSED', '转写连接中断，最终稿未完成；可手动重新连接')
        this.ready = false
      }
    })
  }
  private publishIncomplete(code: string) {
    const previous = this.snapshot ?? parseVolcSnapshot({ result: { text: '', utterances: [] } }, this.recognitionId, this.offsetMs ?? 0, 0, false)
    this.snapshot = { ...previous, status: 'incomplete', errorCode: code, revision: ++this.revision }
    this.emit('onRealtime', this.snapshot)
  }
  disconnect(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    this.stopping = true
    this.stopPromise = (async () => {
      await this.pending
      const ws = this.ws
      if (ws && this.ready && !this.terminal) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => {
            this.terminal = true
            this.publishIncomplete('FINAL_TIMEOUT')
            this.emitError(this.createError('FINAL_TIMEOUT', '等待最终转写结果超时，已保留未完成稿与原音'))
            resolve()
          }, 10000)
          this.settled = () => { clearTimeout(timer); resolve() }
          if (this.audioTail.length) { ws.send(this.audioTail); this.audioTail = new Uint8Array() }
          ws.send(JSON.stringify({ type: 'audio_end' }))
        })
      } else if (!this.terminal && this.recognitionId) {
        this.terminal = true
        this.publishIncomplete('CANCELLED')
        this.rejectConnect?.(new Error('转写连接已取消'))
      }
      ws?.close(1000, 'Stopped')
      this.ws = null; this.ready = false; this.setState('idle')
    })()
    return this.stopPromise
  }
  sendAudio(data: Blob | ArrayBuffer): void {
    if (!this.ready || this.stopping || this.terminal) return
    const size = data instanceof Blob ? data.size : data.byteLength
    if (this.offsetMs === undefined) {
      const clock = this._config?.timelineOffsetMs
      this.offsetMs = Math.max(0, (typeof clock === 'function' ? clock() : 0) - size / 32)
    }
    this.pendingBytes += size
    this.pending = this.pending.then(async () => {
      if (!this.ws || !this.ready || this.terminal) return
      if (this.pendingBytes + this.ws.bufferedAmount > 1024 * 1024) throw new Error('BACKPRESSURE')
      const bytes = data instanceof Blob ? await data.arrayBuffer() : data
      const joined = new Uint8Array(this.audioTail.length + bytes.byteLength)
      joined.set(this.audioTail); joined.set(new Uint8Array(bytes), this.audioTail.length)
      let offset = 0
      while (offset + 3200 <= joined.length) { this.ws.send(joined.slice(offset, offset + 3200)); offset += 3200 }
      this.audioTail = joined.slice(offset)
    }).catch(() => {
      if (this.terminal) return
      this.terminal = true; this.ready = false
      this.publishIncomplete('AUDIO_SEND_ERROR')
      this.ws?.close()
      this.emitError(this.createError('AUDIO_SEND_ERROR', '音频发送失败或网络积压，原音继续保存'))
    }).finally(() => { this.pendingBytes -= size })
  }
}
