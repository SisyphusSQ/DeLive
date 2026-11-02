import { app, safeStorage, type IpcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { assertTrustedSender } from '../ipcSecurity'
import type { RecordingStore } from '../recordingStore'
import type { FileTaskConfig } from '../../shared/fileTranscription'
import type { VolcCredentials } from '../../shared/volcProtocol'
import { FileTaskManager } from './taskManager'
import { S3TemporaryAudioStore } from './s3TemporaryStore'
import { VolcFileService } from './volcFileService'

const defaults: FileTaskConfig = { endpoint: '', region: '', bucket: '', prefix: 'delive-transcription',
  forcePathStyle: true, accessKeyId: '', secretAccessKey: '', urlTtlSeconds: 86400 }
export function validateTaskConfig(config: FileTaskConfig) {
  let endpoint: URL
  try { endpoint = new URL(config.endpoint) } catch { throw new Error('存储 endpoint 地址无效') }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('存储 endpoint 必须是无访问参数的 HTTPS 地址')
  if (!config.region.trim() || !config.bucket.trim() || !/^[a-zA-Z0-9/_-]+$/.test(config.prefix) || config.prefix.includes('..')) throw new Error('请配置区域、私有桶与独立对象前缀')
  if (!config.accessKeyId || !config.secretAccessKey) throw new Error('请填写对象存储访问凭据')
  if (!Number.isInteger(config.urlTtlSeconds) || config.urlTtlSeconds < 60 || config.urlTtlSeconds > 604800) throw new Error('签名访问期必须为 60–604800 秒')
}
export function registerFileTaskIpc(ipc: IpcMain, owner: (id: string) => RecordingStore) {
  let manager: FileTaskManager | undefined
  const configPath = () => path.join(app.getPath('userData'), 'file-transcription-config.enc')
  const readConfig = (): FileTaskConfig => {
    if (!fs.existsSync(configPath())) throw new Error('请先配置会后转写的私有对象存储')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取对象存储凭据')
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(configPath())))
  }
  const getManager = () => manager ??= new FileTaskManager(path.join(app.getPath('userData'), 'file-transcription-jobs'),
    owner, readConfig, config => new S3TemporaryAudioStore(config), new VolcFileService())
  const handlers = {
    settings: () => {
      const config = fs.existsSync(configPath()) ? readConfig() : defaults
      const { accessKeyId, secretAccessKey, sessionToken: _token, ...publicConfig } = config
      return { ...publicConfig, configured: Boolean(accessKeyId && secretAccessKey) }
    },
    configure: (patch: Partial<FileTaskConfig>) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，对象存储凭据未保存')
      const previous = fs.existsSync(configPath()) ? readConfig() : defaults
      const config = { ...previous, ...patch }
      // Blank credential inputs mean keep the existing encrypted value.
      for (const key of ['accessKeyId', 'secretAccessKey', 'sessionToken'] as const) if (!patch[key]) config[key] = previous[key] ?? ''
      validateTaskConfig(config)
      if (getManager().hasPendingObjects() && ['endpoint', 'region', 'bucket', 'prefix', 'forcePathStyle'].some(key =>
        config[key as keyof FileTaskConfig] !== previous[key as keyof FileTaskConfig])) throw new Error('仍有未结束任务或待清理对象；可以更新凭据，但不能更换存储位置')
      const file = configPath(), fd = fs.openSync(file + '.tmp', 'w', 0o600)
      try { fs.writeFileSync(fd, safeStorage.encryptString(JSON.stringify(config))); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
      fs.renameSync(file + '.tmp', file)
    },
    list: () => getManager().list(),
    start: (sessionId: string, recordingId: string, credentials: VolcCredentials, enableDdc?: boolean) => getManager().start(sessionId, recordingId, credentials, enableDdc),
    query: (id: string, credentials: VolcCredentials) => getManager().query(id, credentials),
    cleanup: (id: string) => getManager().cleanup(id),
    cancel: (id: string) => getManager().cancel(id),
  }
  for (const [name, handler] of Object.entries(handlers)) ipc.handle('file-tasks:' + name, (event, ...args) => {
    assertTrustedSender(event, 'file-tasks:' + name)
    return (handler as (...args: never[]) => unknown)(...args as never[])
  })
  app.on('before-quit', () => manager?.dispose())
}
