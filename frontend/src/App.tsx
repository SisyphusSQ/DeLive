import { loadReviewDrafts, useReviewDraftStore } from './stores/reviewDraftStore'
import { recoverBackupRestore, restoringBackup } from './services/completeBackup'
import { startAutoBackup } from './services/autoBackup'
import { flushImageRemovals } from './services/imageCleanup'
import { refreshFileTasks } from './stores/fileTaskStore'
import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useUIStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useSessionStore } from './stores/sessionStore'
import { useTagStore } from './stores/tagStore'
import { useTopicStore } from './stores/topicStore'
import { useASR } from './hooks/useASR'
import { useApiIpcResponder } from './hooks/useApiIpcResponder'
import { useSidebarState } from './hooks/useSidebarState'
import { getWhatsNewForVersion, getAllWhatsNew } from './utils/whatsNew'
import { 
  ApiKeyConfig, 
  TranscriptDisplay, 
  RecordingControls, 
  ToastContainer,
  SourcePicker,
  TitleBar,
  WaveformVisualizer,
  type ToastMessage 
} from './components'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { UpdateNotification } from './components/UpdateNotification'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { ReviewDeskView } from './components/ReviewDeskView'
import { TopicsView } from './components/TopicsView'
import { TopicPicker } from './components/TopicPicker'
import { FileTranscriptionView } from './components/FileTranscriptionView'
import { initStorage } from './utils/storage'

function App() {
  const [showSourcePicker, setShowSourcePicker] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [restoreBusy,setRestoreBusy] = useState(false)
  useEffect(()=>{const update=()=>setRestoreBusy(restoringBackup);window.addEventListener('backup-restore-state',update);return()=>window.removeEventListener('backup-restore-state',update)},[])
  const [storageError, setStorageError] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const { initTheme, t, currentView, setView, returnFromSettings } = useUIStore()
  const { loadSettings, settings, credentialError } = useSettingsStore()
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarState()
  const {
    loadSessions,
    recoverySession,
    restoreRecoverySession,
    dismissRecoverySession,
    recordingState,
  } = useSessionStore()
  const { loadTags } = useTagStore()
  const { loadTopics } = useTopicStore()
  const [lastFinishedSessionId, setLastFinishedSessionId] = useState<string | null>(null)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [whatsNewShowAll, setWhatsNewShowAll] = useState(false)

  useEffect(() => {
    // The main process keeps its own copy of the language for the tray, the
    // window title, and the shortcut names. It only ever heard about a change
    // the user made, so a language restored from storage at startup never
    // reached it and everything outside the renderer stayed Chinese.
    void window.electronAPI?.langChange?.(useUIStore.getState().language).catch(() => {})
  }, [])

  // Toast 管理
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    setToasts((prev) => [...prev, { id, type, message }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleError = useCallback((message: string) => {
    addToast('error', message)
  }, [addToast])

  useEffect(()=>{const report=(event:Event)=>handleError('恢复未完成：'+(event as CustomEvent<string>).detail);window.addEventListener('backup-error',report);return()=>window.removeEventListener('backup-error',report)},[handleError])

  useEffect(() => { if (credentialError) handleError(credentialError) }, [credentialError, handleError])

  useApiIpcResponder()

  // ASR — lifted to App so global shortcut can reach it
  const { startRecording, stopRecording, switchProvider, getMediaStream, getRecordingTime, reconnectTranscription } = useASR({
    onError: handleError,
    onStarted: () => setLastFinishedSessionId(null),
    onSaved: setLastFinishedSessionId,
  })

  // Global shortcut: toggle recording from Electron
  useEffect(() => {
    if (!window.electronAPI?.onToggleRecording) return
    return window.electronAPI.onToggleRecording(() => {
      if(restoringBackup)return
      const state = useSessionStore.getState().recordingState
      if (state === 'idle') {
        startRecording()
      } else if (state === 'recording') {
        stopRecording()
      }
    })
  }, [startRecording, stopRecording])

  // 初始化加载
  useEffect(() => {
    let cancelled = false

    void (async () => {
      await recoverBackupRestore()
      await initStorage()
      initTheme()
      await loadSettings()
      loadTags()
      loadTopics()
      await loadSessions()
      loadReviewDrafts(useSessionStore.getState().sessions.map(s=>s.id))
      if(useReviewDraftStore.getState().error)addToast('error',useReviewDraftStore.getState().error)
      try {
        const sessions = useSessionStore.getState().sessions
        await flushImageRemovals(sessions)
        await window.electronAPI?.sessionImages?.cleanupUnreferenced(Object.fromEntries(sessions.map(s => [s.id, (s.images || []).map(i => i.assetPath)])))
      } catch (error) { addToast('error', `图片素材清理未完成：${(error as Error).message}；将在下次启动时重试`) }
      await refreshFileTasks()

      if (!cancelled) {
        setIsInitialized(true)
      }
    })().catch(error => { if (!cancelled) setStorageError(`会话数据读取失败：${error.message}。原数据保留，请恢复磁盘或存储访问后重试。`) })

    return () => {
      cancelled = true
    }
  }, [initTheme, loadSettings, loadSessions, loadTags, loadTopics, addToast])

  useEffect(()=>{if(isInitialized)return startAutoBackup(handleError)},[isInitialized,handleError])
  useEffect(()=>{
    if (!isInitialized || restoreBusy) return
    const timer = setInterval(()=>void refreshFileTasks(), 2000)
    return ()=>clearInterval(timer)
  },[isInitialized,restoreBusy])

  // 版本更新后自动弹出 What's New
  useEffect(() => {
    if (!isInitialized) return
    void (async () => {
      const version = await window.electronAPI?.getAppVersion?.() ?? __APP_VERSION__
      if (!version) return
      const lastSeen = localStorage.getItem('delive_last_seen_version')
      const majorVersion = version.replace(/-.*$/, '')
      if (lastSeen !== majorVersion && getWhatsNewForVersion(version)) {
        setWhatsNewOpen(true)
        setWhatsNewShowAll(false)
      }
      localStorage.setItem('delive_last_seen_version', majorVersion)
    })()
  }, [isInitialized])

  // 启动时自动检查更新（根据设置）
  useEffect(() => {
    if (!isInitialized) return
    
    const autoCheckUpdate = settings.autoCheckUpdate !== false
    const supportsAutoUpdate = !!window.electronAPI?.supportsAutoUpdate
    
    if (autoCheckUpdate && supportsAutoUpdate && window.electronAPI?.checkForUpdates) {
      const timer = setTimeout(() => {
        window.electronAPI?.checkForUpdates().catch((err) => {
          console.error('自动检查更新失败:', err)
        })
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [isInitialized, settings.autoCheckUpdate])

  // 监听 Electron 的源选择器请求
  useEffect(() => {
    if (window.electronAPI?.onShowSourcePicker) {
      const cleanup = window.electronAPI.onShowSourcePicker(() => {
        setShowSourcePicker(true)
      })
      return cleanup
    }
  }, [])

  useEffect(() => {
    const { settingsReturnFocus } = useUIStore.getState()
    if (currentView === 'settings' || !settingsReturnFocus) return
    const frame = requestAnimationFrame(() => {
      const controls = [...document.querySelectorAll<HTMLElement>('[data-settings-entry]')]
      const target = controls.find(control => control.dataset.settingsEntry === settingsReturnFocus && (control.getClientRects().length || control.closest('details')))
        ?? document.querySelector<HTMLElement>('[aria-current="page"]')
      if (target) {
        const details = target.closest('details')
        if (details) details.open = true
        target.focus()
      }
      useUIStore.setState({ settingsReturnFocus: undefined })
    })
    return () => cancelAnimationFrame(frame)
  }, [currentView])

  const isElectron = !!window.electronAPI?.isElectron

  if (storageError) return <div role="alert" className="p-8 space-y-4"><p>{storageError}</p><button onClick={() => window.location.reload()}>重新读取</button></div>
  if (!isInitialized) return <p role="status" className="p-8">正在读取会话…</p>

  const sidebarWidth = sidebarCollapsed ? 56 : 224

  if(restoreBusy)return <div role="alert" className="fixed inset-0 grid place-items-center bg-background"><div>正在恢复资料，请保持应用打开。若收尾失败，请重启应用继续。<button className="block text-primary" onClick={()=>window.location.reload()}>重新加载并恢复事务</button></div></div>

  return (
    <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
      <a
        href="#app-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      <TitleBar recordingState={recordingState} onClickRec={() => setView('live')} />
      <CommandPalette />

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        currentView={currentView}
        onNavigate={setView}
        recordingState={recordingState}
      />

      {/* Main content area */}
      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
        style={{
          marginLeft: sidebarWidth,
          marginTop: isElectron ? 32 : 0,
        }}
      >
        {/* Settings */}
        {currentView === 'settings' && (
          <div className="flex-1 overflow-hidden animate-view-enter">
            <ApiKeyConfig
              isOpen
              mode="view"
              onClose={returnFromSettings}
              onViewChangelog={() => { setWhatsNewShowAll(true); setWhatsNewOpen(true) }}
            />
          </div>
        )}

        {/* Review */}
        {currentView === 'review' && (
          <div className="flex-1 overflow-hidden animate-view-enter">
            <ReviewDeskView />
          </div>
        )}

        {/* Topics */}
        {currentView === 'topics' && (
          <div className="flex-1 overflow-hidden animate-view-enter">
            <TopicsView />
          </div>
        )}

        {/* File Transcription */}
        {currentView === 'file' && (
          <div className="flex-1 overflow-hidden animate-view-enter">
            <FileTranscriptionView />
          </div>
        )}

        {/* Live — always mounted, hidden when not active */}
        <main
          id="app-main"
          className={`flex-1 overflow-y-auto ${currentView === 'live' ? '' : 'hidden'}`}
        >
          <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
            <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t.nav.live}</h1>
            <div className="space-y-6">
              {isInitialized && recordingState === 'idle' && recoverySession && (
                <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-info/10 p-1.5 text-info">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium text-foreground">{t.session.recoveryTitle}</h3>
                      <p className="text-xs text-muted-foreground">{t.session.recoveryDesc(recoverySession.title)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { restoreRecoverySession(); addToast('success', t.session.recoveredToast) }}
                      className="inline-flex h-8 items-center rounded-md bg-info px-3 text-xs font-medium text-white hover:bg-info/90"
                    >
                      {t.session.restoreInterrupted}
                    </button>
                    <button
                      onClick={() => { dismissRecoverySession(); addToast('success', t.session.dismissedToast) }}
                      className="inline-flex h-8 items-center rounded-md border border-info/30 bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-info/10"
                    >
                      {t.session.dismissInterrupted}
                    </button>
                  </div>
                </div>
              )}

              {lastFinishedSessionId && recordingState === 'idle' && (
                <div className="rounded-xl border border-success/20 bg-success/5 p-5 flex flex-col sm:flex-row items-center gap-3 animate-reveal-up">
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-sm font-medium text-foreground">{t.live?.sessionSaved || 'Session saved'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { useUIStore.getState().openReview(lastFinishedSessionId); setLastFinishedSessionId(null) }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      {t.live?.viewDetails || 'View Details'}
                    </button>
                    <button
                      onClick={() => setLastFinishedSessionId(null)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      {t.live?.recordAgain || 'Record Again'}
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
                {recordingState === 'idle' && <div className="mb-3"><TopicPicker /></div>}
                <RecordingControls startRecording={startRecording} stopRecording={stopRecording} switchProvider={switchProvider} reconnectTranscription={reconnectTranscription} />
                <WaveformVisualizer getStream={getMediaStream} isActive={recordingState === 'recording'} barCount={48} height={40} className="mt-3 rounded-lg" />
              </div>
              {recordingState !== 'idle' && <TranscriptDisplay getRecordingTime={getRecordingTime} contentHeightClassName="h-[min(54vh,36rem)]" />}
            </div>
          </div>
        </main>
      </div>

      {window.electronAPI && (
        <SourcePicker
          isOpen={showSourcePicker}
          onSelect={async (sourceId) => {
            const success = await window.electronAPI?.selectSource(sourceId)
            setShowSourcePicker(false)
            if (!success) addToast('error', t.sourcePicker.selectFailed)
          }}
          onCancel={() => {
            window.electronAPI?.cancelSourceSelection()
            setShowSourcePicker(false)
          }}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />
      <UpdateNotification />
      <WhatsNewDialog
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        entry={getWhatsNewForVersion(__APP_VERSION__) ?? null}
        allEntries={getAllWhatsNew()}
        showAll={whatsNewShowAll}
      />
    </div>
  )
}

export default App
