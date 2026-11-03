import { AudioProcessor } from '../utils/audioProcessor'
import type { ASRAudioProfileCapabilities, ASRProviderCapabilities } from '../types/asr'
import type { AudioSource, RecordingPacket, SourceState } from '../../../shared/recording'

export interface CaptureCallbacks {
  onAudioData: (data: Blob | ArrayBuffer) => void
  onTrackEnded: () => void
  onDeviceChange: () => void
}
type Capabilities = Pick<ASRProviderCapabilities, 'audioInputMode' | 'audioProfile'>
export interface CaptureOptions {
  system: boolean
  microphone: boolean
  microphoneId?: string
  onSource?: (state: SourceState) => void
  onError?: (error: Error) => void
}
export class CaptureManager {
  private streams = new Map<AudioSource, MediaStream>()
  private context: AudioContext | null = null
  private worklet: AudioWorkletNode | null = null
  private mixed: MediaStream | null = null
  private processor: AudioProcessor | null = null
  private recorder: MediaRecorder | null = null
  private callbacks: CaptureCallbacks | null = null
  private options: CaptureOptions = { system: true, microphone: true }
  private id: string | null = null
  private origin = 0
  private offset = 0
  private graphOrigin = 0
  private lastArchiveTime = 0
  private queue: Promise<unknown> = Promise.resolve()
  private pending = 0
  private diskFailed = false
  private states = new Map<AudioSource, SourceState>()
  private meters: Array<{ source: AudioSource; analyser: AnalyserNode }> = []
  private meterTimer: ReturnType<typeof setInterval> | null = null
  private flushResolve: (() => void) | null = null
  private _isRestarting = false
  private deviceHandler = () => this.callbacks?.onDeviceChange()

  get isRestarting() { return this._isRestarting }
  get currentStream() { return this.mixed }
  get elapsedMs() { return this.origin ? performance.now() - this.origin : 0 }
  get archiveTimeMs() { return this.id && this.context ? this.offset + Math.max(0, this.context.currentTime - this.graphOrigin) * 1000 : this.lastArchiveTime }

  private state(source: AudioSource, status: SourceState['status'], device?: string) {
    const state: SourceState = { source, status, device, level: 0, atMs: this.elapsedMs }
    this.states.set(source, state)
    this.options.onSource?.(state)
    if (this.id) this.enqueue(() => window.electronAPI!.recording.event(this.id!, { atMs: state.atMs, message: source + ': ' + status, source: state }))
  }
  private enqueue(action: () => Promise<unknown>) {
    if (this.diskFailed) return
    if (++this.pending > 8) {
      this.pending--
      this.fail(new Error('磁盘写入过慢，录音已停止；已落盘原音保留'))
      return
    }
    this.queue = this.queue.then(action).catch(error => this.fail(error)).finally(() => { this.pending-- })
  }
  private fail(error: unknown) {
    if (this.diskFailed) return
    this.diskFailed = true
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)))
  }
  async acquireStream(options: CaptureOptions = this.options): Promise<MediaStream> {
    this.options = options
    if (!options.system && !options.microphone) throw new Error('请至少启用一个音频来源')
    try {
      for (const source of ['system', 'microphone'] as const) {
        if (!options[source]) { this.state(source, 'disabled'); continue }
        this.state(source, 'requesting')
        let stream: MediaStream
        try {
          stream = source === 'system'
            ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
            : await navigator.mediaDevices.getUserMedia({ audio: { deviceId: options.microphoneId ? { exact: options.microphoneId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false })
        } catch (error) {
          this.state(source, (error as Error).name === 'NotAllowedError' ? 'denied' : 'error')
          throw error
        }
        this.streams.set(source, stream)
        if (!stream.getAudioTracks().length) throw new Error(source + ' 未提供音频，请检查系统录音权限')
        const track = stream.getAudioTracks()[0]
        this.state(source, 'active', track.label)
        track.onmute = () => this.state(source, 'muted', track.label)
        track.onunmute = () => this.state(source, 'active', track.label)
        track.onended = () => {
          this.state(source, 'ended', track.label)
          if ([...this.streams.values()].every(s => s.getAudioTracks().every(t => t.readyState === 'ended'))) this.callbacks?.onTrackEnded()
        }
        // Retain the display video track for the lifetime of the capture grant.
      }
      this.context = new AudioContext({ sampleRate: 48000 })
      await this.context.suspend()
      await this.context.audioWorklet.addModule(new URL('./dual-recorder.worklet.js', window.location.href).href)
      this.worklet = new AudioWorkletNode(this.context, 'dual-recorder', { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' })
      const destination = this.context.createMediaStreamDestination()
      this.worklet.connect(destination)
      const silent = this.context.createGain()
      silent.gain.value = 0
      this.worklet.connect(silent).connect(this.context.destination)
      this.mixed = destination.stream
      for (const [source, stream] of this.streams) {
        const input = this.context.createMediaStreamSource(stream)
        input.connect(this.worklet, 0, source === 'system' ? 0 : 1)
        const analyser = this.context.createAnalyser()
        input.connect(analyser)
        this.meters.push({ source, analyser })
      }
      // Start the archive at a single audio frame boundary after begin().
      await this.context.suspend()
      this.worklet.port.onmessage = e => {
        if (e.data.flushed) { this.flushResolve?.(); return }
        if (!this.id || this.diskFailed) return
        const { startFrame, sampleRate, buffers } = e.data as { startFrame: number; sampleRate: number; buffers: ArrayBuffer[] }
        const tracks: RecordingPacket['tracks'] = { mix: buffers[2] }
        if (options.system) tracks.system = buffers[0]
        if (options.microphone) tracks.microphone = buffers[1]
        const id = this.id
        this.enqueue(() => window.electronAPI!.recording.append(id, { startMs: this.offset + startFrame / sampleRate * 1000, sampleRate, tracks }))
      }
      return this.mixed
    } catch (error) {
      await this.releaseGraph()
      throw error
    }
  }
  async startArchive(sessionId: string) {
    if (!window.electronAPI?.recording) throw new Error('原音持久化需要 Electron 桌面应用')
    await window.electronAPI.recording.begin(sessionId)
    this.id = sessionId; this.origin = performance.now(); this.offset = 0
    this.graphOrigin = this.context!.currentTime; this.lastArchiveTime = 0
    this.diskFailed = false; this.pending = 0; this.queue = Promise.resolve()
    for (const state of this.states.values()) this.state(state.source, state.status, state.device)
    this.startMeters()
    await this.context!.resume()
    navigator.mediaDevices.addEventListener('devicechange', this.deviceHandler)
  }
  private startMeters() {
    this.meterTimer = setInterval(() => {
      for (const { source, analyser } of this.meters) {
        const data = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(data)
        const previous = this.states.get(source)!
        const state = { ...previous, level: Math.sqrt(data.reduce((n, x) => n + x * x, 0) / data.length) }
        this.options.onSource?.(state)
      }
    }, 250)
  }
  async start(capabilities: Capabilities, callbacks: CaptureCallbacks): Promise<MediaStream> {
    const stream = await this.acquireStream()
    await this.startWithStream(capabilities, callbacks)
    return stream
  }
  async startWithStream(capabilities: Capabilities, callbacks: CaptureCallbacks) {
    this.callbacks = callbacks
    await this.startPipeline(capabilities)
  }
  private async startPipeline(capabilities: Capabilities) {
    if (!this.mixed) throw new Error('No audio stream')
    if (capabilities.audioInputMode === 'pcm16') {
      this.processor = new AudioProcessor({ sampleRate: capabilities.audioProfile?.sampleRateHz ?? 16000 })
      await this.processor.start(this.mixed, data => this.callbacks?.onAudioData(data))
    } else this.startRecorder(capabilities.audioProfile)
  }
  private startRecorder(profile?: ASRAudioProfileCapabilities) {
    if (!this.mixed) return
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t))
    this.recorder = new MediaRecorder(this.mixed, mimeType ? { mimeType } : undefined)
    this.recorder.ondataavailable = e => { if (e.data.size) this.callbacks?.onAudioData(e.data) }
    this.recorder.onerror = () => this.options.onError?.(new Error('ASR 编码失败，原音继续保存'))
    this.recorder.start(profile?.preferredChunkMs ?? 100)
  }
  pauseRecorder() {
    this.processor?.stop(); this.processor = null
    if (this.recorder?.state !== 'inactive') this.recorder?.stop()
    this.recorder = null
  }
  async switchPipeline(capabilities: Capabilities) { this.pauseRecorder(); await this.startPipeline(capabilities) }
  restartRecorder(capabilities: Capabilities) { void this.switchPipeline(capabilities).catch(error => this.options.onError?.(error)) }
  private async flush() {
    if (!this.worklet || !this.context || this.context.state === 'closed') return
    if (this.context.state === 'suspended') await this.context.resume()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.flushResolve = null; reject(new Error('音频线程未确认停止；末尾音频可能缺失')) }, 3000)
      this.flushResolve = () => { clearTimeout(timer); this.flushResolve = null; resolve() }
      this.worklet!.port.postMessage('flush')
    })
    await this.queue
  }
  private async releaseGraph() {
    this.lastArchiveTime = this.archiveTimeMs
    this.pauseRecorder()
    if (this.meterTimer) clearInterval(this.meterTimer)
    this.meterTimer = null; this.meters = []
    for (const stream of this.streams.values()) for (const track of stream.getTracks()) { track.onended = null; track.stop() }
    this.streams.clear()
    this.worklet?.disconnect(); this.worklet = null
    await this.context?.close(); this.context = null
    this.mixed?.getTracks().forEach(t => t.stop()); this.mixed = null
  }
  async restartStreamOnly(): Promise<MediaStream> {
    this._isRestarting = true
    await this.flush()
    await this.releaseGraph()
    const stream = await this.acquireStream()
    this.offset = this.elapsedMs
    this.graphOrigin = this.context!.currentTime
    this.startMeters()
    await this.context!.resume()
    return stream
  }
  async restartPipeline(capabilities: Capabilities) {
    try { const stream = await this.restartStreamOnly(); await this.startPipeline(capabilities); return stream }
    finally { this._isRestarting = false }
  }
  finishRestart() { this._isRestarting = false }
  async stop() {
    navigator.mediaDevices.removeEventListener('devicechange', this.deviceHandler)
    let interrupted = this.diskFailed
    try { await this.flush() } catch (e) { interrupted = true; this.options.onError?.(e as Error) }
    await this.releaseGraph()
    await this.queue
    const id = this.id; this.id = null; this.callbacks = null
    if (id) return window.electronAPI!.recording.finish(id, interrupted)
  }
}
