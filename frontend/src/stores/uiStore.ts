import { create } from 'zustand'
import {
  type Language,
  type Translations,
  getTranslations,
  getSavedLanguage,
  saveLanguage
} from '../i18n'
import { type ColorThemeId, defaultColorTheme, applyColorThemeToDOM } from '../themes'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

const resolveTheme = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? getSystemTheme() : theme

const getSavedTheme = (): Theme => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved
    }
  }
  return 'system'
}

const applyTheme = (resolvedTheme: ResolvedTheme) => {
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    if (resolvedTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
}

export type WorkspaceView = 'live' | 'review' | 'topics' | 'file' | 'settings'

export type ReviewTab = 'transcript' | 'summary' | 'chat' | 'mindmap'
export type SettingsSection = 'provider' | 'fileStorage' | 'aiPostProcess' | 'appearance' | 'openApi' | 'cloudBackup' | 'dataManagement' | 'about'

let settingsLeaveGuard: (() => Promise<boolean>) | undefined

export function setSettingsLeaveGuard(guard: () => Promise<boolean>) {
  settingsLeaveGuard = guard
  return () => { if (settingsLeaveGuard === guard) settingsLeaveGuard = undefined }
}

function leaveSettings(currentView: WorkspaceView, navigate: () => void) {
  if (currentView !== 'settings' || !settingsLeaveGuard) navigate()
  else void settingsLeaveGuard().then(confirmed => { if (confirmed) navigate() })
}

export interface UIState {
  language: Language
  t: Translations
  setLanguage: (lang: Language) => void

  theme: Theme
  resolvedTheme: ResolvedTheme
  colorTheme: ColorThemeId
  setTheme: (theme: Theme) => void
  setColorTheme: (colorTheme: ColorThemeId) => void
  initTheme: () => void

  currentView: WorkspaceView
  reviewOriginTopicId: string | null
  reviewSessionId: string | null
  reviewVersionId: string | null
  reviewTab: ReviewTab
  fileSessionId: string | null
  fileSource: 'recording' | 'import'
  pendingAudioFiles: File[]
  importingAudio: boolean
  audioImportError: string
  mindMapDrafts: Record<string, string>
  settingsSection: SettingsSection
  settingsProviderId?: string
  settingsOrigin: Exclude<WorkspaceView, 'settings'> | null
  settingsReturnFocus?: string
  openSettings: (section: SettingsSection, providerId?: string) => void
  returnFromSettings: (saved?: boolean) => void
  setView: (view: WorkspaceView, reviewSessionId?: string | null) => void
  openReview: (sessionId: string, versionId?: string) => void
  openTopicReview: (sessionId: string, topicId: string) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
}

/**
 * The window title comes from the page, not from the BrowserWindow option —
 * Electron follows the document title once the page loads. Keeping it in sync
 * here is what makes the title track the chosen language.
 */
function applyDocumentTitle(t: ReturnType<typeof getTranslations>): void {
  if (typeof document === 'undefined') return
  document.title = `${t.app.name} - ${t.app.subtitle}`
}

applyDocumentTitle(getTranslations(getSavedLanguage()))

export const useUIStore = create<UIState>((set, get) => ({
  language: getSavedLanguage(),
  t: getTranslations(getSavedLanguage()),
  setLanguage: (lang) => {
    const t = getTranslations(lang)
    saveLanguage(lang)
    applyDocumentTitle(t)
    set({ language: lang, t })
    if (window.electronAPI?.langChange) {
      window.electronAPI.langChange(lang).catch(() => {})
    }
  },

  theme: 'system',
  resolvedTheme: 'light',
  colorTheme: defaultColorTheme,
  setTheme: (theme) => {
    const resolved = resolveTheme(theme)
    localStorage.setItem('theme', theme)
    applyTheme(resolved)
    applyColorThemeToDOM(get().colorTheme, resolved === 'dark')
    set({ theme, resolvedTheme: resolved })
  },
  setColorTheme: (colorTheme) => {
    localStorage.setItem('colorTheme', colorTheme)
    applyColorThemeToDOM(colorTheme, get().resolvedTheme === 'dark')
    set({ colorTheme })
  },
  currentView: 'live',
  reviewOriginTopicId: null,
  reviewSessionId: null,
  reviewVersionId: null,
  reviewTab: 'transcript',
  fileSessionId: null,
  fileSource: 'recording',
  pendingAudioFiles: [],
  importingAudio: false,
  audioImportError: '',
  mindMapDrafts: {},
  settingsSection: 'provider',
  settingsOrigin: null,
  openSettings: (section, providerId) => {
    const { currentView } = get()
    if (currentView === 'settings') {
      if (get().settingsSection === section && get().settingsProviderId === providerId) return
      leaveSettings(currentView, () => set({ settingsSection: section, settingsProviderId: providerId }))
      return
    }
    const settingsReturnFocus = typeof document === 'undefined' ? undefined : document.activeElement?.getAttribute('data-settings-entry') ?? undefined
    set({ currentView: 'settings', settingsSection: section, settingsProviderId: providerId, settingsOrigin: currentView, settingsReturnFocus })
  },
  returnFromSettings: (saved = false) => {
    const { currentView, settingsOrigin } = get()
    if (currentView !== 'settings') return
    const restore = () => set({ currentView: settingsOrigin ?? 'live', settingsOrigin: null, settingsProviderId: undefined })
    if (saved) restore()
    else leaveSettings(currentView, restore)
  },
  setView: (view, reviewSessionId = null) => {
    if (view === 'settings') { get().openSettings('provider'); return }
    leaveSettings(get().currentView, () => set({ currentView: view, reviewSessionId, reviewOriginTopicId: null, reviewVersionId: null, reviewTab: 'transcript', settingsOrigin: null, settingsReturnFocus: undefined }))
  },
  openReview: (sessionId, versionId) => leaveSettings(get().currentView, () => set({
    currentView: 'review', reviewSessionId: sessionId, reviewVersionId: versionId ?? null, reviewTab: 'transcript', settingsOrigin: null, settingsReturnFocus: undefined,
  })),

  openTopicReview: (sessionId, topicId) => leaveSettings(get().currentView, () => set({ currentView: 'review', reviewSessionId: sessionId, reviewVersionId: null, reviewTab: 'transcript', reviewOriginTopicId: topicId })),

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  initTheme: () => {
    const savedTheme = getSavedTheme()
    const resolved = resolveTheme(savedTheme)
    const savedColor = (localStorage.getItem('colorTheme') as ColorThemeId) || defaultColorTheme
    applyTheme(resolved)
    applyColorThemeToDOM(savedColor, resolved === 'dark')
    set({ theme: savedTheme, resolvedTheme: resolved, colorTheme: savedColor })

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        const currentTheme = get().theme
        if (currentTheme === 'system') {
          const newResolved = getSystemTheme()
          applyTheme(newResolved)
          applyColorThemeToDOM(get().colorTheme, newResolved === 'dark')
          set({ resolvedTheme: newResolved })
        }
      })
    }
  },
}))
