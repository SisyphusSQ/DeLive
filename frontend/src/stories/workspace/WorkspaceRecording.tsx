import { useEffect, useRef, useState } from 'react'
import { AppWindow, ImagePlus, Mic, Monitor, Square } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { PreviewDialog } from '../review/NotebookExtras'
import { meeting, post } from '../review/fixtures'

import { engines, type Capture, type Engine } from './workspaceFixtures'

const labels: Record<Capture, string> = {
  ready: '准备录制', starting: '正在准备音源', recording: '正在保存原音', reconnecting: '转写中断，原音继续保存',
  stopping: '正在收尾并保存', saved: '会议已保存', saveFailed: '原音保存失败，完整分片已保留', interrupted: '上次录制中断，可恢复已保存的分片',
}

interface Props {
  capture: Capture
  setCapture: (value: Capture) => void
  engine: Engine
  setEngine: (value: Engine) => void
  localOnly: boolean
  setLocalOnly: (value: boolean) => void
  ready: boolean
  onConfigure: () => void
  onStart: () => void
  onReview: () => void
  onInsertImage: (seconds: number) => void
}

export function WorkspaceRecording({ capture, setCapture, engine, setEngine, localOnly, setLocalOnly, ready, onConfigure, onStart, onReview, onInsertImage }: Props) {
  const [system, setSystem] = useState(true)
  const [microphone, setMicrophone] = useState(true)
  const [device, setDevice] = useState('default')
  const [topic, setTopic] = useState('')
  const [source, setSource] = useState('')
  const [sourceState, setSourceState] = useState('ready')
  const [images, setImages] = useState<number[]>([])
  const [image, setImage] = useState<number>()
  const [quota, setQuota] = useState(8)
  const [savedQuota, setSavedQuota] = useState(8)
  const [storageNotice, setStorageNotice] = useState('')
  const [deleteAudio, setDeleteAudio] = useState(false)
  const [audioRemoved, setAudioRemoved] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const active = capture === 'recording' || capture === 'reconnecting'
  const setup = capture === 'ready' || capture === 'starting'
  const stop = useRef<HTMLButtonElement>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const [restoreFocus, setRestoreFocus] = useState(false)
  useEffect(() => { if (restoreFocus && capture === 'ready') { startButton.current?.focus(); setRestoreFocus(false) } }, [restoreFocus, capture])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [active])

  useEffect(() => {
    if (active) stop.current?.focus()
    if (capture !== 'stopping') return
    const timer = window.setTimeout(() => setCapture('saved'), 500)
    return () => window.clearTimeout(timer)
  }, [active, capture, setCapture])

  const start = () => {
    setElapsed(0)
    setImages([])
    setAudioRemoved(false)
    onStart()
  }
  const chooseSource = () => {
    setSource('')
    setSourceState('ready')
    if (system) setCapture('starting')
    else start()
  }
  const time = (seconds: number) => [Math.floor(seconds / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':')

  return <div className="workspace-flow">
    <header className="workspace-page-heading">
      <div><h1 tabIndex={-1}>录制</h1><p>{setup ? '选择音源，再开始记录这场会议。' : localOnly ? '仅录音 · 原音保存在本机' : `实时转写 · ${engine}`}</p></div>
      {!setup && <span className={`workspace-status ${active ? 'is-live' : ''}`} role="status">{labels[capture]}</span>}
    </header>
    {setup && <section className="workspace-section">
      <h2>音源与录制方式</h2>
      <div className="workspace-row">
        <label><input type="checkbox" checked={system} onChange={e => setSystem(e.target.checked)} /> 系统声音</label>
        <label><input type="checkbox" checked={microphone} onChange={e => setMicrophone(e.target.checked)} /> 麦克风</label>
        <Select aria-label="麦克风设备" value={device} disabled={!microphone} onChange={e => setDevice(e.target.value)}><option value="default">系统默认麦克风</option><option value="headset">会议耳机</option></Select>
      </div>
      <div className="workspace-row">
        <label><input type="radio" name="capture-mode" checked={!localOnly} onChange={() => setLocalOnly(false)} /> 录音并实时转写</label>
        <label><input type="radio" name="capture-mode" checked={localOnly} onChange={() => setLocalOnly(true)} /> 仅录音</label>
      </div>
      <div className="workspace-row">
        {!localOnly && <Select aria-label="实时转写服务" value={engine} onChange={e => setEngine(e.target.value as Engine)}>{engines.map(name => <option key={name}>{name}</option>)}</Select>}
        <Select aria-label="录制专题" value={topic} onChange={e => setTopic(e.target.value)}><option value="">不归入专题</option><option>产品设计</option><option>团队周会</option></Select>
      </div>
      {!localOnly && !ready && <div className="workspace-feedback" role="status"><span>{engine === engines[0] ? '火山转写凭据未配置' : '本地识别服务未就绪'}</span><button className="note-text-button" onClick={onConfigure}>配置转写服务</button></div>}
      {!system && !microphone && <p role="status">请选择至少一个音源。</p>}
      <button className="note-primary" ref={startButton} data-settings-return-focus disabled={(!system && !microphone) || (!localOnly && !ready)} onClick={chooseSource}><Mic size={16} />开始录制</button>
    </section>}
    {active && <>
      <section className="workspace-section workspace-capture-controls" aria-label="录制状态">
        <div className="workspace-row">
          <time className="workspace-elapsed" aria-label="录制时长">{time(elapsed)}</time>
          {system && <label>系统声音 · 采集中 <meter min={0} max={1} value={0.64} /></label>}
          {microphone && <label>麦克风 · 采集中 <meter min={0} max={1} value={0.3} /></label>}
        </div>
        <div className="workspace-row">
          <button className="note-primary workspace-stop" ref={stop} onClick={() => setCapture('stopping')}><Square size={14} />停止录制</button>
          {capture === 'reconnecting' && <button className="note-text-button" onClick={() => setCapture('recording')}>重新连接转写</button>}
          <button className="note-text-button" onClick={() => { setImages(previous => [...previous, elapsed]); onInsertImage(elapsed) }}><ImagePlus size={16} />插入图片</button>
        </div>
      </section>
      <section className="workspace-section workspace-live-text" aria-label="实时稿">
        <h2>{localOnly ? '仅录音' : '实时稿'}</h2>
        {localOnly ? <p>停止并保存后，可以在回顾中手动发起会后转写。</p> : <>
          {post.segments.slice(0, 3).map(line => <article key={line.id}><small>{post.speakers.find(speaker => speaker.id === line.speakerId)?.label} · {time((line.startMs ?? 0) / 1000)} · 已稳定</small><p>{line.text}</p></article>)}
          {capture === 'recording' && <article><small>临时文本</small><p>那我们先把这一段标记下来……</p></article>}
        </>}
        {!!images.length && <div className="workspace-row" aria-label="录制图片时间轴">{images.map((seconds, index) => <button key={index} className="note-text-button" onClick={() => setImage(seconds)}>图片 {index + 1} · {time(seconds)}</button>)}</div>}
      </section>
    </>}
    {['saved', 'saveFailed', 'interrupted'].includes(capture) && <section className="workspace-section">
      <h2>{meeting.title}</h2>
      <p>{capture === 'saved' ? '可以打开会议，查看稿件或处理会后转写。' : '已写入的原音分片会保留，可以恢复后继续处理。'}</p>
      <div className="workspace-row">
        {capture === 'saved' ? <button className="note-primary" onClick={onReview}>打开已保存会议</button> : <button className="note-primary" onClick={() => setCapture('saved')}>{capture === 'interrupted' ? '恢复录音' : '重试保存'}</button>}
        <button className="note-text-button" onClick={() => setCapture('ready')}>{capture === 'interrupted' ? '暂不恢复' : '返回录制准备'}</button>
      </div>
    </section>}
    {!active && <details className="workspace-section">
      <summary>原音存储与恢复</summary>
      <p>本机原音目录 · 已用 146 MB · 配额 {savedQuota || '不限'} {savedQuota ? 'GiB' : ''}</p>
      <div className="workspace-row">
        <label>磁盘配额（GiB） <input className="workspace-input w-24" type="number" min={0} value={quota} onChange={e => setQuota(Number(e.target.value))} /></label>
        <button className="note-text-button" disabled={quota < 0} onClick={() => { setSavedQuota(quota); setStorageNotice('已更新预览配额') }}>保存配额</button>
        <button className="note-text-button" onClick={() => setStorageNotice('已选择示例目录，仅影响后续录音')}>选择保存目录</button>
        {!audioRemoved && <button className="note-text-button" onClick={() => setDeleteAudio(true)}>删除示例原音</button>}
      </div>
      {storageNotice && <p role="status">{storageNotice}</p>}
    </details>}
    <PreviewDialog open={capture === 'starting'} title="选择系统声音来源" onClose={() => { setCapture('ready'); setRestoreFocus(true) }}>
      <div className="workspace-flow">
        {sourceState === 'ready' ? <div className="workspace-source-list">{['主显示器', '会议窗口'].map((name, index) => <button className="workspace-option" key={name} aria-pressed={source === name} onClick={() => setSource(name)}>{index ? <AppWindow size={18} /> : <Monitor size={18} />}{name}</button>)}</div> : <p role={sourceState === 'denied' ? 'alert' : 'status'}>{sourceState === 'denied' ? '系统声音权限未授予。授权后刷新，或返回选择麦克风。' : sourceState === 'loading' ? '正在读取屏幕和窗口…' : '未找到可共享的屏幕或窗口。'}</p>}
        <div className="workspace-row">
          <button className="note-primary" disabled={!source || sourceState !== 'ready'} onClick={start}>使用此来源并录制</button>
          <button className="note-text-button" onClick={() => { setCapture('ready'); setRestoreFocus(true) }}>取消选择</button>
          <button className="note-text-button" onClick={() => { setSourceState('loading'); window.setTimeout(() => setSourceState('ready'), 400) }}>刷新来源</button>
        </div>
        <details className="workspace-disclosure"><summary>来源状态预览</summary><div className="workspace-row">
          {Object.entries({ ready: '可选择', loading: '读取中', empty: '无可用来源', denied: '权限拒绝' }).map(([value, label]) => <button key={value} className="workspace-option" aria-pressed={sourceState === value} onClick={() => { setSource(''); setSourceState(value) }}>{label}</button>)}
        </div></details>
      </div>
    </PreviewDialog>
    <ActionDialog open={deleteAudio} title="删除本地原音？" description="文字稿继续保留。删除后无法再通过原音回听或提交会后转写。" onClose={() => setDeleteAudio(false)} actions={[{ label: '取消', onClick: () => setDeleteAudio(false) }, { label: '删除原音', variant: 'danger', onClick: () => { setDeleteAudio(false); setAudioRemoved(true); setStorageNotice('示例原音已移除') } }]} />
    <PreviewDialog open={image !== undefined} title="录制图片" onClose={() => setImage(undefined)}><p>合成截图 · {time(image ?? 0)}</p><div className="workspace-image" role="img" aria-label="合成会议截图"><Monitor size={40} /></div></PreviewDialog>
  </div>
}
