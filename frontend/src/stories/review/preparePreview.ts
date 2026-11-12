import { useUIStore } from '../../stores/uiStore'
import { getTranslations } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useFileTaskStore } from '../../stores/fileTaskStore'
import { useTagStore } from '../../stores/tagStore'
import { useReviewDraftStore } from '../../stores/reviewDraftStore'
import { saveSessions } from '../../utils/sessionStorage'
import { sessionRepository } from '../../utils/sessionRepository'
import { meeting, meetings, corrected, job, manifest, silentBlock } from './fixtures'

const blocked = async () => { throw new Error('设计预览不连接真实服务，也不修改桌面数据') }

export async function preparePreview() {
  if (window.electronAPI?.isElectron) throw new Error('请在独立浏览器 Storybook 中打开设计预览')
  window.electronAPI = {
    platform: 'darwin',
    recording: {
      read: async () => manifest, readBlock: async () => silentBlock(),
      settings: async () => ({ directory: '合成原音目录', quotaBytes: 8 * 1024 ** 3, bytes: 146 * 1024 ** 2 }),
      list: async () => [manifest], configure: blocked, remove: blocked,
    },
    fileTasks: {
      settings: async () => ({ configured: true }), list: async () => [job],
      start: blocked, query: blocked, configure: blocked, cleanup: blocked, cancel: blocked,
    },
  } as unknown as typeof window.electronAPI
  await saveSessions(structuredClone(meetings))
  const loaded = await sessionRepository.loadForLaunch()
  useSessionStore.setState({ sessions: loaded.sessions })
  useFileTaskStore.setState({ jobs: [job], error: '' })
  useTagStore.setState({ tags: [], selectedTagIds: [], searchQuery: '' })
  useReviewDraftStore.setState({ drafts: {}, error: '' })
  useSettingsStore.setState(s => ({ settings: { ...s.settings, currentVendor: 'volc', providerConfigs: {}, aiPostProcess: { enabled: false } } }))
  useUIStore.setState({ language: 'zh', t: getTranslations('zh') })
  const ui = useUIStore.getState()
  ui.setTheme(ui.theme)
  ui.setColorTheme(ui.colorTheme)
  useUIStore.getState().openReview(meeting.id, corrected.id)
  document.title = 'DeLive · 回顾页设计预览'
}
