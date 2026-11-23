import type { FileTask } from '../../../../shared/fileTranscription'
import { job, manifest, silentBlock } from '../review/fixtures'

const blocked = async () => { throw new Error('设计预览不连接真实服务，也不修改桌面数据') }
const subscribe = () => () => {}

export function installPreviewBridge({ desktop = false, updates = false, jobs = [job], recording = manifest }: {
  desktop?: boolean
  updates?: boolean
  jobs?: FileTask[]
  recording?: typeof manifest
} = {}) {
  const previous = window.electronAPI
  if (previous?.isElectron) throw new Error('请在独立浏览器 Storybook 中打开设计预览')
  const listeners = new Set<(info: { version: string }) => void>()
  const version = __APP_VERSION__
  window.electronAPI = {
    isElectron: desktop, platform: 'darwin',
    recording: {
      read: async () => recording, readBlock: async () => silentBlock(),
      settings: async () => ({ directory: '合成原音目录', quotaBytes: 8 * 1024 ** 3, bytes: 146 * 1024 ** 2 }),
      list: async () => [recording], configure: blocked, remove: blocked,
    },
    fileTasks: {
      settings: async () => ({ configured: true }), list: async () => jobs,
      start: blocked, query: blocked, configure: blocked, cleanup: blocked, cancel: blocked,
    },
    onApiGetSessions: subscribe, onApiGetSessionDetail: subscribe, onApiSearchSessions: subscribe,
    onApiGetTopics: subscribe, onApiGetTags: subscribe, onApiGetRecordingStatus: subscribe,
    apiUpdateOpenApiConfig: () => {}, getAppVersion: async () => version, supportsAutoUpdate: updates,
    onCheckingForUpdate: subscribe, onUpdateAvailable: subscribe, onUpdateDownloaded: subscribe,
    onUpdateError: subscribe, onDownloadProgress: subscribe,
    onUpdateNotAvailable: (callback: (info: { version: string }) => void) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    checkForUpdates: async () => {
      listeners.forEach(callback => callback({ version }))
      return { success: true, version }
    },
  } as unknown as typeof window.electronAPI
  return () => { window.electronAPI = previous }
}
