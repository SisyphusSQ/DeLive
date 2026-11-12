import { useEffect, useRef, useState } from 'react'
import { AudioLines, FileAudio, Upload } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { PreviewTasks } from '../review/NotebookExtras'
import { activeFileTaskStates, blocksPreviewSubmission, type PreviewState } from '../review/previewStates'
import { meeting } from '../review/fixtures'
import { engines, sampleFile, type Engine } from './workspaceFixtures'
import type { Configuration } from './WorkspaceSettings'

export type FileSource = 'recording' | 'import'
type Filter = 'all' | 'active' | 'completed' | 'attention'
interface Props {
  engine: Engine
  setEngine: (value: Engine) => void
  source: FileSource
  setSource: (value: FileSource) => void
  sourceSelected: boolean
  setSourceSelected: (value: boolean) => void
  configuration: Configuration
  task: PreviewState
  taskSource: string
  taskSourceDeleted: boolean
  recordingAvailable: boolean
  setTask: (value: PreviewState) => void
  onSubmit: () => void
  onConfigure: (section: 'provider' | 'storage') => void
  onReview: () => void
  onCorrect: () => void
  onLocalStart: () => void
  onLocalResult: () => void
  localResultAvailable: boolean
  hasResult: boolean
  recordingOnly: boolean
  taskFileOnly: boolean
}

export function WorkspaceFiles({ engine, setEngine, source, setSource, sourceSelected, setSourceSelected, configuration, task, taskSource, taskSourceDeleted, recordingAvailable, setTask, onSubmit, onConfigure, onReview, onCorrect, onLocalStart, onLocalResult, localResultAvailable, hasResult, recordingOnly, taskFileOnly }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const taskHeading = useRef<HTMLHeadingElement>(null)
  const [confirm, setConfirm] = useState(false)
  const [localTask, setLocalTask] = useState<'idle' | 'processing' | 'completed'>('idle')
  const cloud = engine === engines[0]
  const configured = configuration[engine]
  const storageReady = configuration.storage
  const localProcessing = localTask === 'processing'
  const canSubmit = configured && (cloud ? storageReady && !blocksPreviewSubmission(task) && (source !== 'recording' || recordingAvailable) : !localProcessing)
  const candidate = source === 'recording' && cloud ? meeting.title : sampleFile
  const taskVisible = filter === 'all' || (filter === 'active' && activeFileTaskStates.includes(task))
    || (filter === 'completed' && ['completed', 'cleanupFailed', 'deletedSource'].includes(task))
    || (filter === 'attention' && ['unknown', 'awaitingSave', 'taskFailed', 'cleanupFailed', 'deletedSource'].includes(task))

  useEffect(() => {
    if (!localProcessing) return
    const timer = window.setTimeout(() => setLocalTask('completed'), 900)
    return () => window.clearTimeout(timer)
  }, [localProcessing])

  return <div className="workspace-flow">
    <header className="workspace-page-heading"><div><h1 tabIndex={-1}>文件转写</h1><p>选择音频来源，完成后从任务打开稿件。</p></div><Select aria-label="文件转写服务" value={engine} onChange={e => {
      const next = e.target.value as Engine
      setEngine(next)
      if (next !== engines[0] && source === 'recording') { setSource('import'); setSourceSelected(false) }
    }}>{engines.map(name => <option key={name}>{name}</option>)}</Select></header>
    <section className="workspace-section" aria-label="音频来源和配置">
      <div className="workspace-section-heading"><h2>音频来源</h2><div className="workspace-row">
        {cloud && <button className="workspace-option" aria-pressed={source === 'recording'} onClick={() => { if (source !== 'recording') { setSource('recording'); setSourceSelected(false) } }}><AudioLines size={15} />已有会议原音</button>}
        <button className="workspace-option" aria-pressed={source === 'import'} onClick={() => { if (source !== 'import') { setSource('import'); setSourceSelected(false) } }}><FileAudio size={15} />导入文件</button>
      </div></div>
      {cloud && source === 'recording'
        ? <Select aria-label="选择会议原音" value={sourceSelected ? meeting.id : ''} onChange={e => setSourceSelected(!!e.target.value)}><option value="">选择已保存的会议原音</option>{recordingAvailable && <option value={meeting.id}>{meeting.title} · 26 分钟</option>}</Select>
        : <button className="workspace-drop" onClick={() => setSourceSelected(true)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setSourceSelected(true) }}><Upload size={20} />{sourceSelected ? sampleFile : '选择或拖入文件体验导入'}<small>{sourceSelected ? '26 分钟 · 合成音频' : '预览使用合成音频，不读取拖入的文件。'}</small></button>}
      <div className="workspace-readiness">
        <div><span>{cloud ? '火山识别凭据' : '本地识别服务'}</span><strong>{configured ? '已配置' : '未配置'}</strong>{!configured && <button className="note-text-button" data-settings-return-focus onClick={() => onConfigure('provider')}>配置转写服务</button>}</div>
        {cloud && <div><span>私有临时存储</span><strong>{storageReady ? '已配置' : '未配置'}</strong>{!storageReady && <button className="note-text-button" data-settings-return-focus onClick={() => onConfigure('storage')}>配置私有存储</button>}</div>}
      </div>
      <div className="workspace-row">
        <button className="note-primary" data-settings-return-focus disabled={!sourceSelected || !canSubmit} onClick={() => { if (cloud) setConfirm(true); else { onLocalStart(); setLocalTask('processing') } }}>{cloud ? '提交会后转写' : '开始本地转写'}</button>
        {cloud && source === 'recording' && sourceSelected && hasResult && !recordingOnly && <button className="note-text-button" onClick={onCorrect}>用现有稿生成校正版</button>}
        {cloud && blocksPreviewSubmission(task) && <button className="note-text-button" onClick={() => {
          setFilter(task === 'cleanupFailed' ? 'attention' : 'active')
          taskHeading.current?.scrollIntoView({ block: 'start' })
          taskHeading.current?.focus({ preventScroll: true })
        }}>查看待处理任务</button>}
      </div>
    </section>
    <section className="workspace-section" aria-label="任务列表">
      <div className="workspace-section-heading"><h2 ref={taskHeading} tabIndex={-1}>任务列表</h2><Select aria-label="筛选任务" value={filter} onChange={e => setFilter(e.target.value as Filter)}><option value="all">全部</option><option value="active">进行中</option><option value="completed">已完成</option><option value="attention">需处理</option></Select></div>
      {task === 'ready' && localTask === 'idle' ? <p>暂无任务。选择音频来源后可以开始转写。</p> : <>
        {task !== 'ready' && taskVisible && <PreviewTasks state={task} onState={setTask} onCorrect={onReview} workflow={{ hasResult: false, fileOnly: taskFileOnly, taskList: true, hideStart: true, source: taskSource, sourceDeleted: taskSourceDeleted, onOpen: onReview }} />}
        {localTask === 'processing' && ['all', 'active'].includes(filter) && <p role="status">正在本地转写 · {sampleFile}</p>}
        {localTask === 'completed' && ['all', 'completed'].includes(filter) && <div className="workspace-row"><span>本地稿已保存 · {sampleFile}</span>{localResultAvailable ? <button className="note-text-button" onClick={onLocalResult}>打开本地稿</button> : <span>来源会议已删除</span>}</div>}
        {!(task !== 'ready' && taskVisible) && !(localTask === 'processing' && ['all', 'active'].includes(filter)) && !(localTask === 'completed' && ['all', 'completed'].includes(filter)) && <p>没有符合筛选条件的任务。</p>}
      </>}
    </section>
    <ActionDialog open={confirm} title="确认提交会后转写？" description={`${candidate} · 26 分钟。火山标准文件转写需要上传临时副本，可能计费。完成后保存稿件，原始音频保留。`} onClose={() => setConfirm(false)} actions={[{ label: '取消', onClick: () => setConfirm(false) }, { label: '确认提交（可能计费）', variant: 'primary', onClick: () => { onSubmit(); setConfirm(false) } }]} />
  </div>
}
