import { useEffect, useRef, useState, type CSSProperties, type ComponentProps } from 'react'
import { AudioLines, Moon, RotateCcw, Search, Sun } from 'lucide-react'
import { Sidebar } from '../../components/Sidebar'
import { Select } from '../../components/ui/Select'
import { ApiKeyConfig } from '../../components/ApiKeyConfig'
import { RecordingControls } from '../../components/RecordingControls'
import { TranscriptDisplay } from '../../components/TranscriptDisplay'
import { FileTranscriptionView } from '../../components/FileTranscriptionView'
import { ReviewDeskView } from '../../components/ReviewDeskView'
import { TopicsView } from '../../components/TopicsView'
import { useUIStore, type WorkspaceView } from '../../stores/uiStore'
import { useTopicStore } from '../../stores/topicStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSidebarState } from '../../hooks/useSidebarState'
import { corrected, meeting, post } from '../review/fixtures'
import { preparePreview } from '../review/preparePreview'
import { NotebookReview } from '../review/NotebookReview'
import { PreviewDialog, type PreviewImage } from '../review/NotebookExtras'
import { blocksPreviewSubmission, fileTaskStates, previewStates, type PreviewState } from '../review/previewStates'
import { WorkspaceRecording } from './WorkspaceRecording'
import { captureStates, engines, sampleFile, type Capture, type Engine } from './workspaceFixtures'
import { WorkspaceFiles, type FileSource } from './WorkspaceFiles'
import { WorkspaceTopics } from './WorkspaceTopics'
import { WorkspaceSettings, type Configuration, type SettingsSection } from './WorkspaceSettings'
import '../review/review-design.css'
import './workspace-design.css'

const pageNames: Record<WorkspaceView, string> = { live: '录制', file: '文件', review: '回顾', topics: '主题', settings: '设置' }
const returnLabels: Partial<Record<WorkspaceView, string>> = { live: '返回录制', file: '返回所选音频', review: '返回当前会议' }
const captureLabels: Record<Capture, string> = {
  ready: '准备录制', starting: '选择来源', recording: '录制中', reconnecting: '转写中断', stopping: '正在收尾',
  saved: '已保存', saveFailed: '保存失败', interrupted: '中断待恢复',
}
const progression: Partial<Record<PreviewState, PreviewState>> = { preparing: 'uploading', uploading: 'submitting', submitting: 'unknown' }
type ReviewSource = 'meeting' | 'import' | 'local'
type SettingsSource = { view: WorkspaceView; trigger: HTMLElement | null }
const sourceNames: Record<ReviewSource, string> = { meeting: meeting.title, import: sampleFile, local: sampleFile }
const sampleTopic = { id: 'storybook-topic', name: '产品设计', emoji: '📝', description: '记录会议回顾和桌面工作台的设计讨论。', createdAt: meeting.createdAt, updatedAt: meeting.updatedAt }

interface Props {
  initialView?: WorkspaceView
  initialCapture?: Capture
  initialTask?: PreviewState
  initialConfigured?: boolean
  initialSettings?: SettingsSection
  fileOnly?: boolean
  baseline?: boolean
  initialTopic?: string
  initialEngine?: Engine
  initialShell?: 'ready' | 'loading' | 'loadFailed' | 'restoring' | 'restoreFailed'
  initialOperationFails?: boolean
}

export function WorkspacePreview(props: Props) {
  const [reset, setReset] = useState(0)
  return <WorkspaceCanvas key={reset} {...props} reset={() => setReset(value => value + 1)} />
}

function WorkspaceCanvas({ initialView = 'live', initialCapture = 'ready', initialTask = 'ready', initialConfigured = false, initialSettings = 'provider', fileOnly = false, baseline = false, initialTopic, initialOperationFails = false, initialEngine = engines[0], initialShell = 'ready', reset }: Props & { reset: () => void }) {
  const ui = useUIStore()
  const sidebar = useSidebarState()
  const sessions = useSessionStore(s => s.sessions)
  const topics = useTopicStore(s => s.topics)
  const leaveSettings = useRef<(action: () => void) => void>()
  const [topicOrigin, setTopicOrigin] = useState(false)
  const [shell, setShell] = useState(initialShell)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [capture, setCapture] = useState<Capture>(initialCapture)
  const [localOnly, setLocalOnly] = useState(fileOnly)
  const [reviewFileOnly, setReviewFileOnly] = useState(fileOnly)
  const [reviewVersion, setReviewVersion] = useState(0)
  const [reviewSource, setReviewSource] = useState<ReviewSource>('meeting')
  const [openRequests, setOpenRequests] = useState<Partial<Record<ReviewSource, { versionId?: string; sessionId?: string }>>>({})
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [images, setImages] = useState<PreviewImage[] | undefined>(fileOnly ? [] : undefined)
  const [engine, setEngine] = useState<Engine>(initialEngine)
  const [fileEngine, setFileEngine] = useState<Engine>(initialEngine)
  const [settingsEngine, setSettingsEngine] = useState<Engine>(initialEngine)
  const [configuration, setConfiguration] = useState<Configuration>(initialConfigured ? { [engines[0]]: true, storage: true, ai: true } : {})
  const [section, setSection] = useState<SettingsSection>(initialSettings)
  const [settingsSource, setSettingsSource] = useState<SettingsSource>()
  const [source, setSource] = useState<FileSource>('recording')
  const [sourceSelected, setSourceSelected] = useState(false)
  const [task, setTask] = useState<PreviewState>(initialTask)
  const [taskSource, setTaskSource] = useState<Exclude<ReviewSource, 'local'>>('meeting')
  const [hasResult, setHasResult] = useState(!fileOnly || initialTask === 'completed' || initialTask === 'cleanupFailed')
  const [importResult, setImportResult] = useState(false)
  const [reviewState, setReviewState] = useState<PreviewState>('ready')
  const [settingsSaveFails, setSettingsSaveFails] = useState(false)
  const [operationFails, setOperationFails] = useState(initialOperationFails)
  const [commands, setCommands] = useState(false)
  const [query, setQuery] = useState('')
  const [deletedSources, setDeletedSources] = useState<ReviewSource[]>([])
  const [reviewVisited, setReviewVisited] = useState<ReviewSource[]>(initialView === 'review' ? ['meeting'] : [])
  const focusOnReturn = useRef<SettingsSource>()
  const pages = useRef<HTMLDivElement>(null)
  const view = ui.currentView
  const recording = capture === 'recording' || capture === 'reconnecting'
  const openReview = (target: ReviewSource, request?: { versionId?: string; sessionId?: string }) => {
    if (request && deletedSources.includes(target)) return
    setReviewSource(target)
    setReviewVisited(previous => previous.includes(target) ? previous : [...previous, target])
    if (request) setOpenRequests(previous => ({ ...previous, [target]: request }))
    ui.setView('review')
  }
  const changeView = (next: WorkspaceView) => {
    if (next === view) return
    if (view === 'settings') {
      focusOnReturn.current = settingsSource?.view === next ? settingsSource : undefined
      setSettingsSource(undefined)
    }
    if (next === 'review') { openReview(reviewSource); return }
    ui.setView(next)
  }
  const navigate = (next: WorkspaceView) => {
    if (next === view) return
    if (view === 'settings' && leaveSettings.current) leaveSettings.current(() => changeView(next))
    else changeView(next)
  }
  const openSettings = (next: SettingsSection, from: WorkspaceView) => {
    setSettingsSource({ view: from, trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null })
    setSection(next)
    setSettingsEngine(from === 'file' ? fileEngine : from === 'review' ? engines[0] : engine)
    ui.setView('settings')
  }
  const taskSourceDeleted = deletedSources.includes(taskSource)
  const updateTask = (value: PreviewState) => {
    if (taskSourceDeleted && (value === 'awaitingSave' || value === 'completed')) {
      setTask('deletedSource')
      return
    }
    setTask(value)
    if (!taskSourceDeleted && (value === 'completed' || value === 'cleanupFailed')) {
      if (taskSource === 'import') setImportResult(true)
      else setHasResult(true)
    }
  }
  const deleteSource = (target: ReviewSource) => {
    setDeletedSources(previous => [...previous, target])
    if (target === 'meeting' && source === 'recording') setSourceSelected(false)
    if (target === taskSource && (task === 'completed' || task === 'awaitingSave')) setTask('deletedSource')
  }
  const startImport = (target: 'import' | 'local') => {
    if (!deletedSources.includes(target)) return
    setDeletedSources(previous => previous.filter(item => item !== target))
    setReviewVisited(previous => previous.filter(item => item !== target))
    if (target === 'import') setImportResult(false)
  }
  const submit = (target: Exclude<ReviewSource, 'local'>) => {
    if (blocksPreviewSubmission(task) || !configuration[engines[0]] || !configuration.storage) return
    if (target === 'meeting' && (deletedSources.includes('meeting') || !audioAvailable)) return
    if (target === 'import') startImport(target)
    setTaskSource(target)
    setTask('preparing')
  }
  const startRecording = () => {
    setCapture('recording')
    setAudioAvailable(true)
    useSessionStore.setState(s => {
      const recording = { ...meeting, topicId: useTopicStore.getState().activeTopicId ?? undefined }
      return { sessions: s.sessions.some(item => item.id === meeting.id) ? s.sessions.map(item => item.id === meeting.id ? recording : item) : [recording, ...s.sessions] }
    })
    setReviewVersion(value => value + 1)
    setDeletedSources(previous => previous.filter(item => item !== 'meeting'))
    setReviewFileOnly(localOnly)
    setHasResult(false)
    setImages([])
    setReviewState('ready')
    setSource('recording')
    setSourceSelected(false)
  }

  useEffect(() => {
    let active = true
    void preparePreview().then(() => {
      if (!active) return
      useSessionStore.setState(s => ({ recordingState: 'idle', sessions: s.sessions.map(item => ({ ...item, topicId: item.id === meeting.id || item.id === 'storybook-meeting-1' ? sampleTopic.id : 'storybook-weekly' })) }))
      useTopicStore.setState({ topics: [sampleTopic, { ...sampleTopic, id: 'storybook-weekly', name: '团队周会', emoji: '💼', description: '把每周的进展、决定和待办连起来。' }, { ...sampleTopic, id: 'storybook-learning', name: '学习与灵感', emoji: '🌱', description: '收集值得反复回听的思考。' }], activeTopicId: null, selectedTopicId: null })
      useUIStore.getState().setView(initialView)
      document.title = 'DeLive · 全页面设计预览'
      setLoaded(true)
    }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [initialView])
  useEffect(() => {
    const next = progression[task]
    if (!next) return
    const timer = window.setTimeout(() => setTask(next), 700)
    return () => window.clearTimeout(timer)
  }, [task])
  useEffect(() => {
    const target = focusOnReturn.current
    if (target?.view === view) {
      const trigger = target.trigger
      const original = trigger?.getClientRects().length && !trigger.matches(':disabled') ? trigger : null
      const currentPage = pages.current?.querySelector('.workspace-page:not([hidden]), .workspace-review:not([hidden])')
      const fallback = currentPage?.querySelector<HTMLElement>('[data-settings-return-focus]:not(:disabled), .note-version-select:not(:disabled)')
        ?? currentPage?.querySelector<HTMLElement>('h1[tabindex]')
      const nextFocus = original ?? fallback
      nextFocus?.focus()
      focusOnReturn.current = undefined
    }
  }, [view])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setQuery('')
        setCommands(value => !value)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])

  if (shell !== 'ready') return <div className="workspace-preview workspace-shell-state"><section className="workspace-shell-message"><span className="workspace-app-mark">D</span><span className="workspace-eyebrow">DeLive · 启动状态预览</span><h1>{{ loading: '正在读取会议资料', loadFailed: '暂时无法读取资料', restoring: '正在恢复备份', restoreFailed: '恢复尚未完成' }[shell]}</h1><p role={shell.endsWith('Failed') ? 'alert' : 'status'}>{{ loading: '会议、稿件与偏好准备完成后进入工作台。', loadFailed: '示例错误：存储暂时不可访问。已有资料保留，恢复访问后可以重新读取。', restoring: '正在整理会议与素材，请保持应用打开。完成前暂不能录制或编辑。', restoreFailed: '恢复事务尚未收尾。已有回退材料保留，可重新加载继续恢复。' }[shell]}</p><button className="note-primary" onClick={() => setShell('ready')}>{shell === 'loadFailed' ? '重新读取' : shell === 'restoreFailed' ? '重新加载并继续恢复' : '查看完成后的工作台'}</button><small>仅切换合成状态，不读取或恢复真实资料。</small></section></div>

  return <div className="workspace-preview">
    <div className="workspace-toolbar" aria-label="Storybook 预览工具">
      <strong>DeLive <span>设计预览</span></strong>
      <span className="workspace-toolbar-note">合成资料 · 不连接真实服务 · 刷新可重置</span>
      {!baseline && view === 'live' && <Select aria-label="录制状态预览" value={capture} onChange={e => setCapture(e.target.value as Capture)}>{captureStates.map(value => <option key={value} value={value}>{captureLabels[value]}</option>)}</Select>}
      {!baseline && view === 'file' && <Select aria-label="任务状态预览" value={task} onChange={e => updateTask(e.target.value as PreviewState)}><option value="ready">暂无任务</option>{fileTaskStates.map(value => <option key={value} value={value}>{previewStates[value]}</option>)}</Select>}
      {!baseline && (view === 'settings' || view === 'topics') && <label><input type="checkbox" checked={settingsSaveFails} onChange={e => setSettingsSaveFails(e.target.checked)} /> 模拟保存失败</label>}
      {!baseline && view === 'settings' && <label><input type="checkbox" checked={operationFails} onChange={e => setOperationFails(e.target.checked)} /> 模拟操作失败</label>}
      {!baseline && view === 'review' && <Select aria-label="回顾状态预览" value={reviewState} onChange={e => setReviewState(e.target.value as PreviewState)}>{['ready', 'unconfigured', 'generating', 'failed', 'stale', 'saveFailed', 'sourceMissing'].map(value => <option key={value} value={value}>{previewStates[value as PreviewState]}</option>)}</Select>}
      <button className="note-icon" aria-label="切换明暗模式" onClick={() => ui.setTheme(ui.resolvedTheme === 'light' ? 'dark' : 'light')}>{ui.resolvedTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
      <button className="note-icon" aria-label="重置预览" onClick={reset}><RotateCcw size={16} /></button>
    </div>
    {error ? <p role="alert">{error}</p> : !loaded ? <p role="status" className="p-6">正在准备合成工作台…</p> : <div className="workspace-stage" style={{ '--workspace-sidebar': `${sidebar.collapsed ? 56 : 224}px` } as CSSProperties}>
      <Sidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} currentView={view} onNavigate={navigate} recordingState={recording ? 'recording' : 'idle'} />
      <div className="workspace-content" style={{ marginInlineStart: sidebar.collapsed ? 56 : 224 }}>
        <header className="workspace-topbar">
          <span>工作台 <span aria-hidden="true">/</span> {pageNames[view]}</span>
          <div className="workspace-row">
            {topicOrigin && view === 'review' && <button className="note-text-button" onClick={() => navigate('topics')}>返回主题资料</button>}
            {recording && view !== 'live' && <button className="note-text-button workspace-rec-indicator" onClick={() => navigate('live')}><AudioLines size={15} />录制中 · 返回录制</button>}
            <button className="note-text-button" onClick={() => { setQuery(''); setCommands(true) }}><Search size={15} />命令面板 <kbd>⌘ K</kbd></button>
          </div>
        </header>
        <div className="workspace-pages" ref={pages}>
          {baseline ? <WorkspaceBaseline view={view} /> : <>
            <section className="workspace-page" hidden={view !== 'live'} aria-label="录制工作台"><WorkspaceRecording capture={capture} setCapture={setCapture} engine={engine} setEngine={setEngine} localOnly={localOnly} setLocalOnly={setLocalOnly} ready={!!configuration[engine]} onConfigure={() => openSettings('provider', 'live')} onStart={startRecording} onReview={() => openReview('meeting', {})} onRemoveAudio={() => { setAudioAvailable(false); setSourceSelected(false) }} onInsertImage={seconds => setImages(previous => [...(previous ?? []), { id: (previous?.length ?? 0) + 1, caption: '录制截图', seconds }])} /></section>
            <section className="workspace-page" hidden={view !== 'file'} aria-label="文件工作台"><WorkspaceFiles engine={fileEngine} setEngine={setFileEngine} source={source} setSource={setSource} sourceSelected={sourceSelected} setSourceSelected={setSourceSelected} configuration={configuration} task={task} taskSource={sourceNames[taskSource]} taskSourceDeleted={taskSourceDeleted} recordingAvailable={audioAvailable && sessions.some(session => session.id === meeting.id) && !deletedSources.includes('meeting')} setTask={updateTask} onSubmit={() => submit(source === 'import' ? 'import' : 'meeting')} onConfigure={next => openSettings(next, 'file')} onReview={() => openReview(taskSource, { versionId: taskSource === 'import' || reviewFileOnly ? post.id : corrected.id })} onCorrect={() => openReview('meeting', { versionId: corrected.id })} onLocalStart={() => startImport('local')} onLocalResult={() => openReview('local', { versionId: post.id })} localResultAvailable={!deletedSources.includes('local')} hasResult={hasResult} recordingOnly={reviewFileOnly} taskFileOnly={taskSource === 'import' || reviewFileOnly} /></section>
            <section className="workspace-page" hidden={view !== 'settings'} aria-label="设置工作台"><WorkspaceSettings section={section} setSection={setSection} engine={settingsEngine} setEngine={setSettingsEngine} configuration={configuration} onSave={(key, ready = true) => {
              setConfiguration(previous => ({ ...previous, [key]: ready }))
              if (key === 'ai') setReviewState('ready')
            }} onReturn={settingsSource ? () => changeView(settingsSource.view) : undefined} returnLabel={settingsSource && returnLabels[settingsSource.view]} saveFails={settingsSaveFails} storageLocked={blocksPreviewSubmission(task)} operationFails={operationFails} leaveRef={leaveSettings} /></section>
            {reviewVisited.map(item => {
              const visible = view === 'review' && item === reviewSource
              const result = item === 'meeting' ? hasResult : item === 'import' ? importResult : true
              const onlyFile = item !== 'meeting' || reviewFileOnly
              const visibleTask = item === taskSource ? task : 'ready'
              return <section key={item} className="workspace-review" hidden={!visible} aria-label="回顾工作台">
                <NotebookReview key={item === 'meeting' ? reviewVersion : item} scenario={onlyFile ? 'fileOnly' : 'normal'}
                  state={reviewState === 'ready' && (!configuration.ai || configuration.aiEnabled === false) ? 'unconfigured' : reviewState} onState={setReviewState}
                  workspace={{
                    task: visibleTask === 'ready' ? !configuration[engines[0]] ? 'credentials' : !configuration.storage ? 'storage' : visibleTask : visibleTask,
                    sessions: item === 'meeting' ? sessions : undefined, topics, onDeleteMeeting: id => useSessionStore.setState(s => ({ sessions: s.sessions.filter(session => session.id !== id) })), onUpdateMetadata: (id, data) => useSessionStore.setState(s => ({ sessions: s.sessions.map(session => session.id === id ? { ...session, title: data.title, topicId: topics.find(topic => topic.name === data.topic)?.id } : session) })),
                    setTask: updateTask, images: item === 'meeting' ? images : [], title: item === 'meeting' ? sessions.find(session => session.id === meeting.id)?.title : sourceNames[item], visible,
                    audioAvailable: item === 'meeting' ? audioAvailable : item !== 'local', sourceDeleted: deletedSources.includes(item), onDeleteSource: () => { deleteSource(item); if (item === 'meeting') useSessionStore.setState(s => ({ sessions: s.sessions.filter(session => session.id !== meeting.id) })) }, openRequest: openRequests[item],
                    taskWorkflow: {
                      fileOnly: onlyFile, hasResult: result, source: sourceNames[item], sourceDeleted: deletedSources.includes(item),
                      hideStart: (item === 'meeting' && !audioAvailable) || (item !== taskSource && blocksPreviewSubmission(task)),
                      onConfigure: next => openSettings(next, 'review'),
                      onSubmit: () => { if (item !== 'local') submit(item) },
                    },
                    onConfigureAi: () => openSettings('ai', 'review'),
                  }} />
              </section>
            })}
            <section className="workspace-page" hidden={view !== 'topics'} aria-label="主题工作台"><WorkspaceTopics initialTopic={initialTopic} saveFails={settingsSaveFails} onReview={id => { setTopicOrigin(true); openReview('meeting', { sessionId: id }) }} onRecord={id => { useTopicStore.setState({ activeTopicId: id }); navigate('live') }} /></section>
          </>}
        </div>
      </div>
    </div>}
    <PreviewDialog open={commands} title="命令面板" onClose={() => setCommands(false)}>
      <div className="workspace-flow"><input className="workspace-input" autoFocus aria-label="搜索工作台页面" placeholder="输入页面名称" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="workspace-source-list">{Object.entries(pageNames).filter(([, name]) => name.includes(query.trim())).map(([id, name]) => <button className="workspace-option" key={id} onClick={() => { setCommands(false); navigate(id as WorkspaceView) }}>{name}</button>)}</div>
        {!Object.values(pageNames).some(name => name.includes(query.trim())) && <p role="status">没有匹配的页面。</p>}
      </div>
    </PreviewDialog>
  </div>
}

const noAction: ComponentProps<typeof RecordingControls>['startRecording'] = () => {}
function WorkspaceBaseline({ view }: { view: WorkspaceView }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (view !== 'live') return
    const devices = navigator.mediaDevices
    const original = devices.enumerateDevices
    devices.enumerateDevices = async () => []
    setReady(true)
    return () => { devices.enumerateDevices = original; setReady(false) }
  }, [view])
  return <div className="workspace-page">
    <p className="workspace-baseline-note">现有正式组件 · 合成资料 · 布局对照</p>
    <div ref={node => { if (node) node.inert = true }} className={view === 'settings' ? 'min-h-[540px] h-[calc(100%-44px)]' : 'space-y-4'}>
      {view === 'live' && ready && <><TranscriptDisplay /><RecordingControls startRecording={noAction} stopRecording={noAction} /></>}
      {view === 'file' && <FileTranscriptionView />}
      {view === 'review' && <ReviewDeskView />}
      {view === 'topics' && <TopicsView />}
      {view === 'settings' && <ApiKeyConfig isOpen mode="view" onClose={noAction} />}
    </div>
  </div>
}
