import { installPreviewBridge } from '../product/previewBridge'
import { useUIStore } from '../../stores/uiStore'
import { getTranslations } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useFileTaskStore } from '../../stores/fileTaskStore'
import { useTagStore } from '../../stores/tagStore'
import { useReviewDraftStore } from '../../stores/reviewDraftStore'
import { saveSessions } from '../../utils/sessionStorage'
import { sessionRepository } from '../../utils/sessionRepository'
import { meeting, meetings, corrected, job } from './fixtures'

export async function preparePreview(options?: { updates: boolean }) {
  installPreviewBridge(options)
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
