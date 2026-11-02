import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FileTask, FileTaskConfig } from '../../shared/fileTranscription'
import type { VolcCredentials } from '../../shared/volcProtocol'
import { fileHeaders, fileVersion, parseFileResult, validateFileLimits } from '../../shared/volcFileContract'
import type { RecordingStore } from '../recordingStore'
import { exportRecordingWav } from './audioExport'
import type { TemporaryAudioStore } from './s3TemporaryStore'
import type { FileService } from './volcFileService'

const terminal = (job: FileTask) => ['completed', 'failed', 'cancelled'].includes(job.status)
function rejectionMessage(code: string): string {
  if (['HTTP_401','HTTP_403'].includes(code)) return '鉴权或产品权限被拒绝，请检查火山凭据及标准文件产品开通'
  if (['HTTP_429','45000131'].includes(code)) return '服务额度或请求频率限制，请检查账号配额后再操作'
  if (['HTTP_413','45000132'].includes(code)) return '音频达到服务文件大小限制，未截断音频'
  if (code === '45000151') return '服务无法处理音频格式'
  if (code === '45000002') return '服务确认音频为空'
  return '服务拒绝请求，请检查权限、额度、音频格式与产品限制'
}
function saveJson(file: string, value: unknown) {
  const fd = fs.openSync(file + '.tmp', 'w', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  fs.renameSync(file + '.tmp', file)
}
export class FileTaskManager {
  private jobs = new Map<string, FileTask>()
  private active = new Map<string, Promise<void>>()
  private aborts = new Map<string, AbortController>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private cancelled = new Set<string>()
  constructor(private root: string, private owner: (id: string) => RecordingStore,
    private config: () => FileTaskConfig, private storage: (config: FileTaskConfig) => TemporaryAudioStore, private service: FileService) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    for (const name of fs.readdirSync(root).filter(n => /^[a-f0-9-]+\.json$/.test(n))) {
      const job = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')) as FileTask
      if (name !== job.id + '.json') throw new Error('文件任务索引不匹配')
      if (job.status === 'submitting') {
        job.status = 'submission-unknown'
        job.error = { code: 'INTERRUPTED_SUBMIT', message: '提交期间中断，先查询原任务 ID，禁止自动重新提交' }
      } else if (job.status === 'preparing' || job.status === 'uploading') {
        job.status = 'failed'
        job.error = { code: 'INTERRUPTED_UPLOAD', message: '准备或上传期间中断；先清理临时副本，再显式创建新任务' }
      }
      this.jobs.set(job.id, job); this.save(job)
      fs.rmSync(path.join(root, job.id + '.wav'), { force: true })
    }
  }
  private save(job: FileTask) { job.updatedAt = Date.now(); saveJson(path.join(this.root, job.id + '.json'), job) }
  private get(id: string) { const job = this.jobs.get(id); if (!job) throw new Error('文件任务不存在'); return job }
  list() { return [...this.jobs.values()].sort((a,b) => b.createdAt - a.createdAt).map(job => structuredClone(job)) }
  hasPendingObjects() { return this.list().some(job => !terminal(job) || job.cleanup === 'pending' || job.cleanup === 'failed') }
  async start(sessionId: string, recordingId: string, credentials: VolcCredentials, enableDdc = false): Promise<FileTask> {
    fileHeaders(credentials, 'validate')
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error('无效会话 ID')
    if (this.list().some(job => job.recordingId === recordingId && !terminal(job))) throw new Error('该录音已有未结束任务，请查询现有任务，勿重复计费提交')
    const config = this.config()
    const recording = this.owner(recordingId).read(recordingId)
    if (recording.status === 'recording') throw new Error('请先停止录音')
    validateFileLimits(44 + Math.ceil(recording.durationMs * 16) * 2, recording.durationMs)
    const id = randomUUID(), now = Date.now()
    const job: FileTask = { id, taskId: id, sessionId, recordingId, createdAt: now, updatedAt: now, status: 'preparing',
      durationMs: recording.durationMs, sizeBytes: 0, uploadedBytes: 0, objectKey: config.prefix.replace(/\/$/,'') + '/' + id + '.wav',
      ssdVersion: recording.durationMs > 180000 ? '300' : '200', enableDdc, cleanup: 'none' }
    this.jobs.set(id, job); this.save(job)
    const controller = new AbortController(); this.aborts.set(id, controller)
    const run = this.execute(job, config, credentials, controller.signal).catch(() => { job.error = { code: 'PERSISTENCE_FAILED', message: '任务记录写入失败，请检查磁盘；禁止未经查询重复提交' } }).finally(() => { this.active.delete(id); this.aborts.delete(id) })
    this.active.set(id, run)
    return structuredClone(job)
  }
  private async execute(job: FileTask, config: FileTaskConfig, credentials: VolcCredentials, signal: AbortSignal) {
    const file = path.join(this.root, job.id + '.wav')
    let store: TemporaryAudioStore | undefined
    let submitAttempted = false
    try {
      const info = await exportRecordingWav(this.owner(job.recordingId), job.recordingId, file, signal)
      Object.assign(job, info)
      if (signal.aborted) throw new Error('CANCELLED')
      store = this.storage(config)
      job.status = 'uploading'; job.cleanup = 'pending'; this.save(job)
      let persistedBytes = 0
      await store.upload(job.objectKey, file, signal, bytes => {
        job.uploadedBytes = bytes
        if (bytes - persistedBytes >= 1024 * 1024 || bytes === job.sizeBytes) { persistedBytes = bytes; this.save(job) }
      })
      if (signal.aborted) throw new Error('CANCELLED')
      const url = await store.signedUrl(job.objectKey, config.urlTtlSeconds)
      job.expiresAt = Date.now() + config.urlTtlSeconds * 1000
      job.status = 'submitting'; this.save(job) // Durable BEFORE the possibly billed operation.
      submitAttempted = true
      const reply = await this.service.submit(job.taskId, url, job.durationMs, job.enableDdc, credentials)
      if (reply.taskId) job.taskId = reply.taskId
      if (reply.code === '20000000') { job.status = 'queued'; job.error = undefined; this.save(job); this.schedule(job, credentials) }
      else if (reply.code === '45000001' || reply.code.startsWith('55')) {
        job.status = 'submission-unknown'; job.error = { code: reply.code, message: '提交未确认，可能已存在任务；请查询，勿自动重投' }; this.save(job)
      } else {
        job.status = 'failed'; job.error = { code: reply.code, message: rejectionMessage(reply.code) }; this.save(job)
      }
    } catch {
      job.status = submitAttempted ? 'submission-unknown' : 'failed'
      job.error = { code: job.status === 'submission-unknown' ? 'SUBMIT_UNKNOWN' : 'PREPARE_OR_UPLOAD_FAILED',
        message: job.status === 'submission-unknown' ? '提交响应未知，保留任务 ID 与临时音频，先查询确认' : '音频准备或上传失败，请检查音频限制、磁盘和私有存储权限/网络' }
      this.save(job)
    } finally {
      store?.close()
      fs.rmSync(file, { force: true }) // Derived upload copy only; original recording is never deleted.
      if (this.cancelled.has(job.id)) { job.status = 'cancelled'; this.save(job) }
      if (terminal(job) && job.cleanup === 'pending') await this.cleanup(job.id)
    }
  }
  private schedule(job: FileTask, credentials: VolcCredentials) {
    this.clearTimer(job.id)
    if (Date.now() - job.createdAt >= 3 * 60 * 60 * 1000) {
      job.error = { code: 'POLL_PAUSED', message: '任务已超过 3 小时，自动查询暂停；可手动查询或联系服务支持' }; this.save(job); return
    }
    this.timers.set(job.id, setTimeout(() => { this.timers.delete(job.id); void this.query(job.id, credentials) }, 10000))
  }
  private clearTimer(id: string) { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id) }
  async query(id: string, credentials: VolcCredentials): Promise<FileTask> {
    const job = this.get(id)
    if (terminal(job) || this.active.has(id)) return structuredClone(job)
    fileHeaders(credentials, job.taskId)
    this.clearTimer(id)
    const run = (async () => {
      try {
        const reply = await this.service.query(job.taskId, credentials)
        if (reply.code === '20000000' || reply.code === '20000003') {
          const result = reply.code === '20000003' ? { text: '', durationMs: job.durationMs, utterances: [] } : parseFileResult(reply.raw)
          job.version = fileVersion(job.id, result, job.ssdVersion); job.status = 'completed'; job.error = undefined
        } else if (reply.code === '20000001' || reply.code === '20000002') {
          job.status = reply.code === '20000001' ? 'processing' : 'queued'; job.error = undefined
        } else if (['45000002', '45000132', '45000151'].includes(reply.code)) {
          job.status = 'failed'; job.error = { code: reply.code, message: rejectionMessage(reply.code) }
        } else {
          job.error = { code: reply.code, message: rejectionMessage(reply.code) + '；查询未确认结果，保留原任务，未重新提交' }
        }
        this.save(job)
      } catch {
        job.error = { code: 'QUERY_FAILED', message: '查询网络或协议错误，原任务保留，自动查询已暂停' }; this.save(job)
      }
      if (terminal(job)) await this.cleanup(id)
      else if (!job.error && job.expiresAt && job.expiresAt < Date.now()) { job.error = { code: 'URL_EXPIRED', message: '临时访问期已结束；原任务仍保留，可查询是否已处理，勿直接重投' }; this.save(job) }
      else if (!job.error) this.schedule(job, credentials)
    })().catch(() => { job.error = { code: 'PERSISTENCE_FAILED', message: '任务记录写入失败，请检查磁盘后查询原任务' } }).finally(() => this.active.delete(id))
    this.active.set(id, run); await run
    return structuredClone(job)
  }
  async cleanup(id: string): Promise<FileTask> {
    const job = this.get(id)
    if (!terminal(job)) throw new Error('任务未结束；未知提交结果必须先查询，或显式取消并清理')
    if (job.cleanup === 'none' || job.cleanup === 'done') return structuredClone(job)
    let store: TemporaryAudioStore | undefined
    try {
      store = this.storage(this.config()); await store.remove(job.objectKey)
      job.cleanup = 'done'; job.cleanupError = undefined
    } catch { job.cleanup = 'failed'; job.cleanupError = '云端清理未确认，请检查删除/分片清理权限后重试；本地原音保留' }
    finally { store?.close(); this.save(job) }
    return structuredClone(job)
  }
  async cancel(id: string): Promise<FileTask> {
    const job = this.get(id)
    this.clearTimer(id); this.cancelled.add(id); this.aborts.get(id)?.abort()
    await this.active.get(id)
    if (job.status !== 'completed') { job.status = 'cancelled'; job.error = { code: 'CANCELLED_LOCALLY', message: '已停止本地任务并清理临时副本；无法撤销服务端已接受的任务或计费' }; this.save(job) }
    this.clearTimer(id); this.cancelled.delete(id)
    return this.cleanup(id)
  }
  dispose() { for (const id of this.timers.keys()) this.clearTimer(id); for (const controller of this.aborts.values()) controller.abort() }
}
