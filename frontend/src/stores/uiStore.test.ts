import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
vi.stubGlobal('document', { title: '', activeElement: null })
const { useUIStore, setSettingsLeaveGuard } = await import('./uiStore')

beforeEach(() => { useUIStore.setState({ currentView: 'live', reviewSessionId: null, reviewOriginTopicId: null, settingsOrigin: null, settingsSection: 'provider' }) })

describe('workspace navigation', () => {
  it('keeps the topic return context through review selection and settings', () => {
    useUIStore.getState().openTopicReview('meeting-a', 'topic-a')
    useUIStore.getState().openReview('meeting-b')
    useUIStore.getState().openSettings('aiPostProcess')
    useUIStore.getState().returnFromSettings(true)
    expect(useUIStore.getState()).toMatchObject({ currentView: 'review', reviewSessionId: 'meeting-b', reviewOriginTopicId: 'topic-a' })
    useUIStore.getState().setView('file')
    expect(useUIStore.getState().reviewOriginTopicId).toBeNull()
  })
  it('does not discard drafts when the current settings section is selected again', () => {
    useUIStore.getState().openSettings('provider')
    const guard = vi.fn(async () => true), cleanup = setSettingsLeaveGuard(guard)
    try { useUIStore.getState().openSettings('provider'); expect(guard).not.toHaveBeenCalled() } finally { cleanup() }
  })
  it('guards topic navigation and command-driven changes within settings', async () => {
    useUIStore.getState().openSettings('provider')
    let approved = false
    const cleanup = setSettingsLeaveGuard(async () => approved)
    try {
      useUIStore.getState().openTopicReview('meeting-a', 'topic-a')
      await Promise.resolve()
      expect(useUIStore.getState().currentView).toBe('settings')
      useUIStore.getState().openSettings('dataManagement')
      await Promise.resolve()
      expect(useUIStore.getState().settingsSection).toBe('provider')
      approved = true
      useUIStore.getState().openSettings('dataManagement')
      await Promise.resolve()
      expect(useUIStore.getState()).toMatchObject({ currentView: 'settings', settingsSection: 'dataManagement', settingsOrigin: 'live' })
    } finally { cleanup() }
  })
})
