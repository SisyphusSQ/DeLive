import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiRecordingStatus,
  ApiTagData,
  ApiTopicData,
  ElectronAPI,
  SessionDetail,
  SessionSummary,
} from '../shared/electronApi'

const electronAPI: ElectronAPI = {
  sessionImages: {
    cleanupUnreferenced: references => ipcRenderer.invoke('session-images:cleanup', references),
    import: (id, bytes, name) => ipcRenderer.invoke('session-images:import', id, bytes, name),
    read: (id, assetPath) => ipcRenderer.invoke('session-images:read', id, assetPath),
    remove: (id, assetPath) => ipcRenderer.invoke('session-images:remove', id, assetPath),
    removeSession: id => ipcRenderer.invoke('session-images:remove-session', id),
  },
  codex: {
    inspect: executable => ipcRenderer.invoke('codex:inspect', executable),
    complete: (id, executable, request) => ipcRenderer.invoke('codex:complete', id, executable, request),
    cancel: id => ipcRenderer.invoke('codex:cancel', id),
    onDelta: callback => {
      const listener = (_event: Electron.IpcRendererEvent, id: string, delta: string) => callback(id, delta)
      ipcRenderer.on('codex:delta', listener)
      return () => ipcRenderer.removeListener('codex:delta', listener)
    },
  },
  fileTasks: {
    settings: () => ipcRenderer.invoke('file-tasks:settings'),
    configure: config => ipcRenderer.invoke('file-tasks:configure', config),
    list: () => ipcRenderer.invoke('file-tasks:list'),
    start: (sessionId, recordingId, credentials, enableDdc, reconcileBaseId) => ipcRenderer.invoke('file-tasks:start', sessionId, recordingId, credentials, enableDdc, reconcileBaseId),
    query: (id, credentials) => ipcRenderer.invoke('file-tasks:query', id, credentials),
    cleanup: id => ipcRenderer.invoke('file-tasks:cleanup', id),
    cancel: id => ipcRenderer.invoke('file-tasks:cancel', id),
  },
  recording: {
    begin: id => ipcRenderer.invoke('recording:begin', id),
    append: (id, packet) => ipcRenderer.invoke('recording:append', id, packet),
    event: (id, event) => ipcRenderer.invoke('recording:event', id, event),
    finish: (id, interrupted) => ipcRenderer.invoke('recording:finish', id, interrupted),
    list: () => ipcRenderer.invoke('recording:list'),
    read: id => ipcRenderer.invoke('recording:read', id),
    readBlock: (id, index, track) => ipcRenderer.invoke('recording:readBlock', id, index, track),
    remove: id => ipcRenderer.invoke('recording:remove', id),
    settings: () => ipcRenderer.invoke('recording:settings'),
    configure: (quota, pick) => ipcRenderer.invoke('recording:configure', quota, pick),
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  minimizeToTray: () => ipcRenderer.invoke('minimize-to-tray'),
  windowMinimize: (source?: string) => ipcRenderer.invoke('window-minimize', source),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,

  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch') as Promise<boolean>,
  setAutoLaunch: (enable: boolean) => ipcRenderer.invoke('set-auto-launch', enable) as Promise<boolean>,
  pickFilePath: (options) => ipcRenderer.invoke('pick-file-path', options) as Promise<string | null>,
  pathExists: (targetPath: string) => ipcRenderer.invoke('path-exists', targetPath) as Promise<boolean>,

  localRuntimeGetStatus: (runtimeId: string, options) =>
    ipcRenderer.invoke('local-runtime-get-status', runtimeId, options),
  localRuntimeOpenModelsPath: (runtimeId: string) =>
    ipcRenderer.invoke('local-runtime-open-models-path', runtimeId),
  localRuntimeListModels: (runtimeId: string) =>
    ipcRenderer.invoke('local-runtime-list-models', runtimeId),
  localRuntimeImportModel: (runtimeId: string, sourcePath: string) =>
    ipcRenderer.invoke('local-runtime-import-model', runtimeId, sourcePath),
  localRuntimeImportBinary: (runtimeId: string, sourcePath: string) =>
    ipcRenderer.invoke('local-runtime-import-binary', runtimeId, sourcePath),
  localRuntimeDownloadModel: (runtimeId: string, urlString: string) =>
    ipcRenderer.invoke('local-runtime-download-model', runtimeId, urlString),
  localRuntimeDownloadBinary: (runtimeId: string, urlString: string) =>
    ipcRenderer.invoke('local-runtime-download-binary', runtimeId, urlString),
  localRuntimeStart: (runtimeId: string, options) =>
    ipcRenderer.invoke('local-runtime-start', runtimeId, options),
  localRuntimeStop: (runtimeId: string, options) =>
    ipcRenderer.invoke('local-runtime-stop', runtimeId, options),

  ensureRecordingPermissions: sources => ipcRenderer.invoke('ensure-recording-permissions', sources),
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  selectSource: (sourceId: string) => ipcRenderer.invoke('select-source', sourceId),
  cancelSourceSelection: () => ipcRenderer.invoke('cancel-source-selection'),
  onShowSourcePicker: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('show-source-picker', listener)
    return () => ipcRenderer.removeListener('show-source-picker', listener)
  },

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onCheckingForUpdate: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('checking-for-update', listener)
    return () => ipcRenderer.removeListener('checking-for-update', listener)
  },
  onUpdateAvailable: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }) => callback(info)
    ipcRenderer.on('update-available', listener)
    return () => ipcRenderer.removeListener('update-available', listener)
  },
  onUpdateNotAvailable: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on('update-not-available', listener)
    return () => ipcRenderer.removeListener('update-not-available', listener)
  },
  onDownloadProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => callback(progress)
    ipcRenderer.on('download-progress', listener)
    return () => ipcRenderer.removeListener('download-progress', listener)
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info)
    ipcRenderer.on('update-downloaded', listener)
    return () => ipcRenderer.removeListener('update-downloaded', listener)
  },
  onUpdateError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('update-error', listener)
    return () => ipcRenderer.removeListener('update-error', listener)
  },

  onToggleRecording: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('toggle-recording', listener)
    return () => ipcRenderer.removeListener('toggle-recording', listener)
  },

  apiNotifySessionStart: (sessionId: string) => {
    ipcRenderer.send('api-notify-session-start', sessionId)
  },
  apiNotifySessionEnd: (sessionId: string) => {
    ipcRenderer.send('api-notify-session-end', sessionId)
  },

  onApiGetSessions: (callback: (event: unknown, requestId: number) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number) => callback(event, requestId)
    ipcRenderer.on('api-get-sessions', listener)
    return () => ipcRenderer.removeListener('api-get-sessions', listener)
  },
  apiRespondSessions: (requestId: number, sessions: SessionSummary[]) => {
    ipcRenderer.send('api-respond-sessions', requestId, sessions)
  },
  onApiGetSessionDetail: (callback: (event: unknown, requestId: number, sessionId: string) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number, sessionId: string) => callback(event, requestId, sessionId)
    ipcRenderer.on('api-get-session-detail', listener)
    return () => ipcRenderer.removeListener('api-get-session-detail', listener)
  },
  apiRespondSessionDetail: (requestId: number, session: SessionDetail | null) => {
    ipcRenderer.send('api-respond-session-detail', requestId, session)
  },
  onApiSearchSessions: (callback: (event: unknown, requestId: number, query: string) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number, query: string) => callback(event, requestId, query)
    ipcRenderer.on('api-search-sessions', listener)
    return () => ipcRenderer.removeListener('api-search-sessions', listener)
  },
  apiRespondSearchSessions: (requestId: number, sessions: SessionSummary[]) => {
    ipcRenderer.send('api-respond-search-sessions', requestId, sessions)
  },
  onApiGetTopics: (callback: (event: unknown, requestId: number) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number) => callback(event, requestId)
    ipcRenderer.on('api-get-topics', listener)
    return () => ipcRenderer.removeListener('api-get-topics', listener)
  },
  apiRespondTopics: (requestId: number, topics: ApiTopicData[]) => {
    ipcRenderer.send('api-respond-topics', requestId, topics)
  },
  onApiGetTags: (callback: (event: unknown, requestId: number) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number) => callback(event, requestId)
    ipcRenderer.on('api-get-tags', listener)
    return () => ipcRenderer.removeListener('api-get-tags', listener)
  },
  apiRespondTags: (requestId: number, tags: ApiTagData[]) => {
    ipcRenderer.send('api-respond-tags', requestId, tags)
  },
  onApiGetRecordingStatus: (callback: (event: unknown, requestId: number) => void) => {
    const listener = (event: Electron.IpcRendererEvent, requestId: number) => callback(event, requestId)
    ipcRenderer.on('api-get-recording-status', listener)
    return () => ipcRenderer.removeListener('api-get-recording-status', listener)
  },
  apiRespondRecordingStatus: (requestId: number, status: ApiRecordingStatus) => {
    ipcRenderer.send('api-respond-recording-status', requestId, status)
  },

  apiUpdateOpenApiConfig: (config: { enabled: boolean; token: string }) => {
    ipcRenderer.send('api-update-open-api-config', config)
  },

  completeBackup: {
    build: (metadataJson, includeAudio) => ipcRenderer.invoke('complete-backup:build', metadataJson, includeAudio),
    upload: (config, artifactId) => ipcRenderer.invoke('complete-backup:upload', config, artifactId),
    prepare: (config, key) => ipcRenderer.invoke('complete-backup:prepare', config, key),
    apply: (stageId, sessionIds, rollbackId) => ipcRenderer.invoke('complete-backup:apply', stageId, sessionIds, rollbackId),
    settle: (token, committed) => ipcRenderer.invoke('complete-backup:settle', token, committed),
    pendingRestore: () => ipcRenderer.invoke('complete-backup:pendingRestore'),
    prepareRollback: (id) => ipcRenderer.invoke('complete-backup:prepareRollback', id),
    rollbacks: () => ipcRenderer.invoke('complete-backup:rollbacks'),
    jobs: () => ipcRenderer.invoke('complete-backup:jobs'),
    resume: (config, jobId) => ipcRenderer.invoke('complete-backup:resume', config, jobId),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: import('../shared/backup').BackupProgress) => callback(progress)
      ipcRenderer.on('complete-backup-progress', listener)
      return () => ipcRenderer.removeListener('complete-backup-progress', listener)
    },
  },
  cloudBackupTest: (config) => ipcRenderer.invoke('cloud-backup-test', config),
  cloudBackupUpload: (config, jsonData) => ipcRenderer.invoke('cloud-backup-upload', config, jsonData),
  cloudBackupList: (config) => ipcRenderer.invoke('cloud-backup-list', config),
  cloudBackupDownload: (config, key) => ipcRenderer.invoke('cloud-backup-download', config, key),
  cloudBackupDelete: (config, key) => ipcRenderer.invoke('cloud-backup-delete', config, key),

  langChange: (lang: string) => ipcRenderer.invoke('lang:change', lang),
  getProxyPort: () => ipcRenderer.invoke('get-proxy-port') as Promise<number>,

  isElectron: true,
  platform: process.platform as 'win32' | 'darwin' | 'linux',

  exportDiagnostics: (payload) => ipcRenderer.invoke('export-diagnostics', payload),

  safeStorageSet: (key: string, value: string) => ipcRenderer.invoke('safe-storage-set', key, value) as Promise<boolean>,
  safeStorageGet: (key: string) => ipcRenderer.invoke('safe-storage-get', key) as Promise<string | null>,
  safeStorageDelete: (key: string) => ipcRenderer.invoke('safe-storage-delete', key) as Promise<boolean>,
  safeStorageAvailable: () => ipcRenderer.invoke('safe-storage-available') as Promise<boolean>,

  supportsAutoLaunch: process.platform === 'win32' || process.platform === 'darwin',
  supportsAutoUpdate: false,
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
