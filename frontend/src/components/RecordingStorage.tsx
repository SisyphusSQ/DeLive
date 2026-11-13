import { useConfirmation } from '../hooks/useConfirmation'
import { Select } from './ui/Select'
import { useEffect, useState } from 'react'
import { useRecordingStore } from '../stores/recordingStore'
import { useSessionStore } from '../stores/sessionStore'
import type { RecordingManifest, RecordingSettings } from '../../../shared/recording'

export function RecordingStorage() {
  const { confirm, dialog } = useConfirmation()
  const capture = useRecordingStore()
  const idle = useSessionStore(s => s.recordingState === 'idle')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [storage, setStorage] = useState<RecordingSettings & { bytes?: number }>()
  const [archives, setArchives] = useState<RecordingManifest[]>([])
  const [expanded, setExpanded] = useState(false)
  const [quota, setQuota] = useState('0')
  const [error, setError] = useState('')
  async function refresh() {
    if (!window.electronAPI?.recording) return
    try {
      const [settings, list] = await Promise.all([window.electronAPI.recording.settings(), window.electronAPI.recording.list()])
      setStorage(settings); setQuota(String(settings.quotaBytes / 1024 ** 3)); setArchives(list)
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { void refresh() }, [idle])
  useEffect(() => {
    const refreshDevices = () => { void navigator.mediaDevices.enumerateDevices().then(d => setDevices(d.filter(x => x.kind === 'audioinput'))).catch(e => setError(e.message)) }
    refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [])
  async function configure(pick: boolean) {
    try {
      await window.electronAPI!.recording.configure(Math.round(Number(quota) * 1024 ** 3), pick)
      await refresh()
    } catch (e) { setError((e as Error).message) }
  }
  async function remove(id: string) {
    if (!await confirm('永久删除这条录音的本地原音？文字会话保留，此操作无法撤销。')) return
    try { await window.electronAPI!.recording.remove(id); await refresh() }
    catch (e) { setError((e as Error).message) }
  }
  return <section className="recording-sources rounded-xl border border-border p-4 space-y-3 text-sm" aria-label="录音来源与原音存储">
    {dialog}
    <div className="flex flex-wrap items-center gap-3">
      <label><input type="checkbox" checked={capture.system} disabled={!idle} onChange={e => capture.update({ system: e.target.checked })} /> 系统声音</label>
      <label><input type="checkbox" checked={capture.microphone} disabled={!idle} onChange={e => capture.update({ microphone: e.target.checked })} /> 麦克风</label>
      <label><input type="checkbox" checked={capture.localOnly} disabled={!idle} onChange={e => capture.update({ localOnly: e.target.checked })} /> 仅录音（无需密钥）</label>
      <Select aria-label="麦克风设备" value={capture.microphoneId} disabled={!idle || !capture.microphone} onChange={e => capture.update({ microphoneId: e.target.value })} className="bg-background border border-input rounded-md px-3 py-2">
        <option value="">系统默认麦克风</option>
        {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || '麦克风 ' + (i + 1)}</option>)}
      </Select>
    </div>
    <p className="text-xs text-muted-foreground">已选来源保存到本机。录音来源与稿件的说话人独立。</p>
    {capture.sources.map(source => <div key={source.source} className="flex gap-2 items-center">
      <span>{source.source === 'system' ? '系统声音' : '麦克风'}：{({ disabled: '未启用', requesting: '等待权限', active: '采集中', muted: '无数据／静音', ended: '来源已结束', denied: '权限拒绝', error: '采集失败' })[source.status]}</span>
      <span>{source.device}</span><meter aria-label={source.source + ' 音量'} min={0} max={1} value={source.level} />
    </div>)}
    {capture.asrStatus && <p role="status">{capture.asrStatus}</p>}
    {(error || capture.error) && <p role="alert" className="text-destructive">{error || capture.error}</p>}
    <button className="app-text-button" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); void refresh() }}>原音存储与恢复</button>
    {expanded && <div className="space-y-2">
      <p className="break-all">保存位置：{storage?.directory || '仅桌面应用支持'}</p>
      <p>当前目录占用：{((storage?.bytes || 0) / 1024 ** 2).toFixed(1)} MiB；保留策略：不自动删除。删除文字会话不会删除原音。</p>
      <label>配额（GiB，0 为不设配额） <input aria-label="原音磁盘配额" className="bg-background border rounded w-24" type="number" min="0" step="0.1" value={quota} disabled={!idle} onChange={e => setQuota(e.target.value)} /></label>
      <button disabled={!idle || !storage} className="border rounded px-2 mx-2" onClick={() => void configure(false)}>保存配额</button>
      <button disabled={!idle || !storage} className="border rounded px-2" onClick={() => void configure(true)}>选择保存目录</button>
      <p className="text-xs">更改目录只影响新录音，旧原音仍可访问；满额或写入失败会停止录音并保留完整分片。云端临时副本与这里独立。</p>
      {archives.map(a => <div key={a.sessionId} className="flex gap-3 flex-wrap">
        <span>{a.error ? a.error + ' · ' : ''}{new Date(a.createdAt).toLocaleString()} · {(a.durationMs / 1000).toFixed(1)} 秒 · {(a.bytes / 1024 ** 2).toFixed(1)} MiB · {a.status === 'interrupted' ? '中断：已恢复完整分片' : a.status === 'recording' ? '录制中' : '已保存'}</span>
        <button className="text-destructive underline" disabled={a.status === 'recording'} onClick={() => void remove(a.sessionId)}>删除原音</button>
      </div>)}
    </div>}
  </section>
}
