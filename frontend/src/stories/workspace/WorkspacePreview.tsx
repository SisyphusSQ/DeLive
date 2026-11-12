import { useEffect, useRef, useState, type ComponentProps } from 'react'
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
}

export function WorkspacePreview(props: Props) {
  const [reset, setReset] = useState(0)
  return <WorkspaceCanvas key={reset} {...props} reset={() => setReset(value => value + 1)} />
}

function WorkspaceCanvas({ initialView = 'live', initialCapture = 'ready', initialTask = 'ready', initialConfigured = false, initialSettings = 'provider', fileOnly = false, baseline = false, reset }: Props & { reset: () => void }) {
  const ui = useUIStore()
  const sidebar = useSidebarState()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [capture, setCapture] = useState<Capture>(initialCapture)
  const [localOnly, setLocalOnly] = useState(fileOnly)
  const [reviewFileOnly, setReviewFileOnly] = useState(fileOnly)
  const [reviewVersion, setReviewVersion] = useState(0)
  const [reviewSource, setReviewSource] = useState<ReviewSource>('meeting')
  const [openRequests, setOpenRequests] = useState<Partial<Record<ReviewSource, { versionId?: string }>>>({})
  const [images, setImages] = useState<PreviewImage[] | undefined>(fileOnly ? [] : undefined)
  const [engine, setEngine] = useState<Engine>(engines[0])
  const [fileEngine, setFileEngine] = useState<Engine>(engines[0])
  const [settingsEngine, setSettingsEngine] = useState<Engine>(engines[0])
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
  const [commands, setCommands] = useState(false)
  const [query, setQuery] = useState('')
  const [deletedSources, setDeletedSources] = useState<ReviewSource[]>([])
  const [reviewVisited, setReviewVisited] = useState<ReviewSource[]>(initialView === 'review' ? ['meeting'] : [])
  const focusOnReturn = useRef<SettingsSource>()
  const pages = useRef<HTMLDivElement>(null)
  const view = ui.currentView
  const recording = capture === 'recording' || capture === 'reconnecting'
  const openReview = (target: ReviewSource, request?: { versionId?: string }) => {
    if (request && deletedSources.includes(target)) return
    setReviewSource(target)
    setReviewVisited(previous => previous.includes(target) ? previous : [...previous, target])
    if (request) setOpenRequests(previous => ({ ...previous, [target]: request }))
    ui.setView('review')
  }
  const navigate = (next: WorkspaceView) => {
    if (next === view) return
    if (view === 'settings') {
      focusOnReturn.current = settingsSource?.view === next ? settingsSource : undefined
      setSettingsSource(undefined)
    }
    if (next === 'review') { openReview(reviewSource); return }
    ui.setView(next)
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
    if (target === 'meeting' && deletedSources.includes('meeting')) return
    if (target === 'import') startImport(target)
    setTaskSource(target)
    setTask('preparing')
  }
  const startRecording = () => {
    setCapture('recording')
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
      useSessionStore.setState(s => ({ recordingState: 'idle', sessions: s.sessions.map(item => item.id === meeting.id ? { ...item, topicId: sampleTopic.id } : item) }))
      useTopicStore.setState({ topics: [sampleTopic], activeTopicId: null, selectedTopicId: null })
      useUIStore.getState().setView(initialView)
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

  return <div className="workspace-preview">
    <div className="workspace-toolbar" aria-label="Storybook 预览工具">
      <strong>DeLive <span>设计预览</span></strong>
      <span className="workspace-toolbar-note">合成会议、音源和服务状态</span>
      {!baseline && view === 'live' && <Select aria-label="录制状态预览" value={capture} onChange={e => setCapture(e.target.value as Capture)}>{captureStates.map(value => <option key={value} value={value}>{captureLabels[value]}</option>)}</Select>}
      {!baseline && view === 'file' && <Select aria-label="任务状态预览" value={task} onChange={e => updateTask(e.target.value as PreviewState)}><option value="ready">暂无任务</option>{fileTaskStates.map(value => <option key={value} value={value}>{previewStates[value]}</option>)}</Select>}
      {!baseline && view === 'settings' && <label><input type="checkbox" checked={settingsSaveFails} onChange={e => setSettingsSaveFails(e.target.checked)} /> 模拟保存失败</label>}
      <button className="note-icon" aria-label="切换明暗模式" onClick={() => ui.setTheme(ui.resolvedTheme === 'light' ? 'dark' : 'light')}>{ui.resolvedTheme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
      <button className="note-icon" aria-label="重置预览" onClick={reset}><RotateCcw size={16} /></button>
    </div>
    {error ? <p role="alert">{error}</p> : !loaded ? <p role="status" className="p-6">正在准备合成工作台…</p> : <div className="workspace-stage">
      <Sidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} currentView={view} onNavigate={navigate} recordingState={recording ? 'recording' : 'idle'} />
      <div className="workspace-content" style={{ marginInlineStart: sidebar.collapsed ? 56 : 224 }}>
        <header className="workspace-topbar">
          <span>工作台 <span aria-hidden="true">/</span> {pageNames[view]}</span>
          <div className="workspace-row">
            {recording && view !== 'live' && <button className="note-text-button workspace-rec-indicator" onClick={() => navigate('live')}><AudioLines size={15} />录制中 · 返回录制</button>}
            <button className="note-text-button" onClick={() => { setQuery(''); setCommands(true) }}><Search size={15} />命令面板 <kbd>⌘ K</kbd></button>
          </div>
        </header>
        <div className="workspace-pages" ref={pages}>
          {baseline ? <WorkspaceBaseline view={view} /> : <>
            <section className="workspace-page" hidden={view !== 'live'} aria-label="录制工作台"><WorkspaceRecording capture={capture} setCapture={setCapture} engine={engine} setEngine={setEngine} localOnly={localOnly} setLocalOnly={setLocalOnly} ready={!!configuration[engine]} onConfigure={() => openSettings('provider', 'live')} onStart={startRecording} onReview={() => openReview('meeting', {})} onInsertImage={seconds => setImages(previous => [...(previous ?? []), { id: (previous?.length ?? 0) + 1, caption: '录制截图', seconds }])} /></section>
            <section className="workspace-page" hidden={view !== 'file'} aria-label="文件工作台"><WorkspaceFiles engine={fileEngine} setEngine={setFileEngine} source={source} setSource={setSource} sourceSelected={sourceSelected} setSourceSelected={setSourceSelected} configuration={configuration} task={task} taskSource={sourceNames[taskSource]} taskSourceDeleted={taskSourceDeleted} recordingAvailable={!deletedSources.includes('meeting')} setTask={updateTask} onSubmit={() => submit(source === 'import' ? 'import' : 'meeting')} onConfigure={next => openSettings(next, 'file')} onReview={() => openReview(taskSource, { versionId: taskSource === 'import' || reviewFileOnly ? post.id : corrected.id })} onCorrect={() => openReview('meeting', { versionId: corrected.id })} onLocalStart={() => startImport('local')} onLocalResult={() => openReview('local', { versionId: post.id })} localResultAvailable={!deletedSources.includes('local')} hasResult={hasResult} recordingOnly={reviewFileOnly} taskFileOnly={taskSource === 'import' || reviewFileOnly} /></section>
            <section className="workspace-page" hidden={view !== 'settings'} aria-label="设置工作台"><WorkspaceSettings section={section} setSection={setSection} engine={settingsEngine} setEngine={setSettingsEngine} configuration={configuration} onSave={key => {
              setConfiguration(previous => ({ ...previous, [key]: true }))
              if (key === 'ai') setReviewState('ready')
            }} onReturn={settingsSource ? () => navigate(settingsSource.view) : undefined} returnLabel={settingsSource && returnLabels[settingsSource.view]} saveFails={settingsSaveFails} storageLocked={blocksPreviewSubmission(task)} /></section>
            {reviewVisited.map(item => {
              const visible = view === 'review' && item === reviewSource
              const result = item === 'meeting' ? hasResult : item === 'import' ? importResult : true
              const onlyFile = item !== 'meeting' || reviewFileOnly
              const visibleTask = item === taskSource ? task : 'ready'
              return <section key={item} className="workspace-review" hidden={!visible} aria-label="回顾工作台">
                <NotebookReview key={item === 'meeting' ? reviewVersion : item} scenario={onlyFile ? 'fileOnly' : 'normal'}
                  state={reviewState === 'ready' && !configuration.ai ? 'unconfigured' : reviewState} onState={setReviewState}
                  workspace={{
                    task: visibleTask === 'ready' ? !configuration[engines[0]] ? 'credentials' : !configuration.storage ? 'storage' : visibleTask : visibleTask,
                    setTask: updateTask, images: item === 'meeting' ? images : [], title: sourceNames[item], visible,
                    audioAvailable: item !== 'local', sourceDeleted: deletedSources.includes(item), onDeleteSource: () => deleteSource(item), openRequest: openRequests[item],
                    taskWorkflow: {
                      fileOnly: onlyFile, hasResult: result, source: sourceNames[item], sourceDeleted: deletedSources.includes(item),
                      hideStart: item !== taskSource && blocksPreviewSubmission(task),
                      onConfigure: next => openSettings(next, 'review'),
                      onSubmit: () => { if (item !== 'local') submit(item) },
                    },
                    onConfigureAi: () => openSettings('ai', 'review'),
                  }} />
              </section>
            })}
            {view === 'topics' && <div className="workspace-topic"><TopicsView /></div>}
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
