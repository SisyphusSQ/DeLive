import { useEffect, useRef, useState } from 'react'
import { Check, Clipboard, Cloud, Download, RefreshCw, ShieldCheck } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { PreviewDialog } from '../review/NotebookExtras'

const backupFields: Record<string, string[]> = {
  S3: ['备份 Endpoint', '备份区域', '备份桶', '备份前缀', '备份 Access Key ID', '备份 Secret Access Key'],
  WebDAV: ['WebDAV 地址', 'WebDAV 用户名', 'WebDAV 密码', 'WebDAV 目录'],
  '夸克 CLI': ['夸克 CLI 入口', '夸克备份目录'],
}
type Backup = { id: string; name: string; detail: string; audio: boolean; legacy?: boolean }
const initialBackups: Backup[] = [
  { id: 'backup-full', name: '设计讨论 · 完整备份', detail: '2026-11-12 18:30 · 148 MB · 4 场会议', audio: true },
  { id: 'backup-text', name: '每周整理 · 不含原音', detail: '2026-11-11 19:00 · 2.4 MB · 3 场会议', audio: false },
  { id: 'backup-legacy', name: '历史会话 · 旧版仅文字', detail: '2026-11-09 09:00 · 36 KB · 2 场会议', audio: false, legacy: true },
]
export type UtilitySection = 'openApi' | 'backup' | 'data' | 'about'
export function WorkspaceUtilities({ section, value, change, save, dirty, operationFails, onBackup, sessionCount, onImport }: {
  section: UtilitySection
  value: (label: string) => string
  change: (label: string, value: string) => void
  save: () => boolean
  dirty: boolean
  operationFails: boolean
  onBackup: () => void
  sessionCount: number
  onImport: (mode: 'merge' | 'overwrite') => number
}) {
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const [backups, setBackups] = useState(initialBackups)
  const [selected, setSelected] = useState<Backup | null>(null)
  const [dialog, setDialog] = useState('')
  const [unknown, setUnknown] = useState(false)
  const [rollback, setRollback] = useState(false)
  const [update, setUpdate] = useState('idle')
  const [showToken, setShowToken] = useState(false)
  const [importReady, setImportReady] = useState(false)
  const [exportKind, setExportKind] = useState('')
  const [connectionTarget, setConnectionTarget] = useState('')
  const [connected, setConnected] = useState(false)
  const timer = useRef<number>()
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => { setNotice(undefined) }, [section])
  const run = (label: string, done: () => void, failure = '示例服务暂时不可用，原有资料与输入保留。') => {
    setBusy(label); setNotice(undefined)
    timer.current = window.setTimeout(() => {
      setBusy('')
      if (operationFails) setNotice({ error: true, text: failure })
      else done()
    }, 500)
  }
  const toggle = (label: string) => <label className="workspace-setting-row"><span>{label}</span><input type="checkbox" disabled={section === 'backup' && (!!busy || unknown)} checked={value(label) === 'true'} onChange={e => { change(label, String(e.target.checked)); setConnected(false) }} /></label>
  const field = (label: string) => <label className="workspace-field" key={label}>{label}<input className="workspace-input" type={/密码|Secret|Access Key/.test(label) ? 'password' : 'text'} value={value(label)} onChange={e => { change(label, e.target.value); setConnected(false) }} autoComplete="off" /></label>
  const saveConfig = () => {
    const required = section === 'backup' && value('启用云端备份') === 'true' ? backupFields[value('备份服务')] : section === 'openApi' && value('启用开放 API') === 'true' ? ['访问令牌'] : []
    if (required.some(label => !value(label).trim())) { setNotice({ error: true, text: '请补齐配置中的必填项。' }); return false }
    if (!save()) return false
    setNotice({ text: '偏好已保存在本次预览。' }); return true
  }
  const provider = value('备份服务')
  const configurationSaved = !dirty
  return <div className="workspace-flow workspace-utilities">
    {section === 'openApi' && <>
      <p>让本机工具读取会议资料、接收实时转写。启用后需携带访问令牌。</p>
      {toggle('启用开放 API')}
      {value('启用开放 API') === 'true' && <>
        <label className="workspace-field">访问令牌<div className="workspace-row"><input aria-label="访问令牌" className="workspace-input workspace-grow" type={showToken ? 'text' : 'password'} value={value('访问令牌')} onChange={e => change('访问令牌', e.target.value)} autoComplete="off" /><button className="note-text-button" onClick={() => setShowToken(v => !v)}>{showToken ? '隐藏令牌' : '显示令牌'}</button><button className="note-text-button" onClick={() => setDialog('token')}>重新生成</button></div></label>
        <p>更换令牌后，已连接的客户端需要更新配置。</p>
        <div className="workspace-endpoints"><div><small>REST API</small><code>http://localhost:23456/api/v1/</code></div><div><small>WebSocket</small><code>ws://localhost:23456/ws/live</code></div></div>
        <details className="workspace-disclosure"><summary>客户端接入示例</summary><p>在客户端配置上述地址与 Bearer Token。这里的令牌仅用于设计示例，不会开放本机端口。</p><pre className="workspace-code">Authorization: Bearer &lt;访问令牌&gt;</pre><button className="note-text-button" onClick={() => {
          void navigator.clipboard.writeText('Authorization: Bearer <访问令牌>').then(() => setNotice({ text: '已复制接入模板，不含真实令牌。' })).catch(() => setNotice({ error: true, text: '无法访问剪贴板，请手动选择模板复制。' }))
        }}><Clipboard size={14} />复制接入模板</button></details>
      </>}
      <div className="workspace-row"><button className="note-primary" onClick={saveConfig}>保存 API 设置</button><span className="workspace-muted">{dirty ? '有未保存修改' : value('启用开放 API') === 'true' ? '示例：已启用' : '当前关闭'}</span></div>
    </>}
    {section === 'backup' && <>
      <p>备份会议、图片与原音。临时转写存储与这里的长期备份独立配置。</p>
      {toggle('启用云端备份')}
      {value('启用云端备份') === 'true' && <>
        <label className="workspace-field">备份服务<Select aria-label="备份服务" value={provider} disabled={!!busy || unknown} onChange={e => { change('备份服务', e.target.value); setConnected(false) }}>{Object.keys(backupFields).map(name => <option key={name}>{name}</option>)}</Select></label>
        <fieldset className="workspace-fields" disabled={!!busy || unknown}>{backupFields[provider].map(field)}</fieldset>
        {provider === 'S3' && toggle('使用路径式地址')}
        {provider === '夸克 CLI' && <p>使用本机已登录的 CLI。首次备份时创建目录，不在应用内登录或安装。</p>}
        {toggle('包含原音')}{toggle('完成后自动备份')}
        <div className="workspace-row"><button className="note-primary" disabled={!!busy || unknown} onClick={saveConfig}>保存备份设置</button><button className="note-text-button" disabled={!!busy || !configurationSaved || unknown} onClick={() => run('正在测试备份连接…', () => { setConnected(true); setConnectionTarget(provider); setNotice({ text: '示例连接可用，可以备份。' }) })}>测试连接</button><span className="workspace-muted">{dirty ? '请先保存修改' : connected && connectionTarget === provider ? '连接可用' : '尚未测试连接'}</span></div>
        <div className="workspace-divider" />
        <div className="workspace-section-heading"><div><h3>备份记录</h3><p>{value('包含原音') === 'true' ? '下一份备份包含原音、图片和文字。' : '下一份备份不含原音；图片与文字仍会备份。'}</p></div><div className="workspace-row"><button className="note-text-button" disabled={!!busy || !configurationSaved || unknown} onClick={() => run('正在刷新备份列表…', () => setNotice({ text: '备份列表已更新。' }))}><RefreshCw size={14} />刷新列表</button><button className="note-primary" disabled={!!busy || !configurationSaved || unknown} onClick={() => setDialog('backup')}><Cloud size={15} />立即备份</button></div></div>
        {unknown && <div className="workspace-feedback" role="status"><div><strong>上传结果尚未确认</strong><p>先检查原任务，避免重复创建备份。</p></div><button className="note-text-button" disabled={!!busy} onClick={() => run('正在检查原备份任务…', () => { setUnknown(false); setNotice({ text: '原任务已确认完成。备份记录已更新。' }); setBackups(items => [{ id: 'backup-new', name: '本次会议备份', detail: '刚刚 · 4 场会议', audio: value('包含原音') === 'true' }, ...items.filter(item => item.id !== 'backup-new')]) })}>检查 / 继续原任务</button></div>}
        <div className="workspace-backup-list">{backups.map(item => <article key={item.id} className="workspace-setting-row"><div><strong>{item.name}</strong><p>{item.detail}</p><small>{item.legacy ? '仅文字和元数据' : item.audio ? '含文字、图片、原音' : '含文字、图片，不含原音'}</small></div><div className="workspace-row"><button className="note-text-button" disabled={!!busy || dirty || unknown} onClick={() => { setSelected(item); run('正在校验恢复材料…', () => setDialog('restore'), '备份材料校验失败，未修改本机资料。请重新选择备份或重试。') }}>恢复</button>{provider !== '夸克 CLI' && <button className="note-text-button workspace-danger" disabled={!!busy || unknown || dirty} onClick={() => { setSelected(item); setDialog('deleteBackup') }}>删除</button>}</div></article>)}</div>
        {!backups.length && <p className="workspace-empty">尚无备份，点击「立即备份」保存第一份。</p>}
        {rollback && <div className="workspace-feedback"><div><strong>本地恢复回退包</strong><p>恢复前的 4 场会议与素材已保留。</p></div><button className="note-text-button" onClick={() => setDialog('rollback')}>恢复到操作前</button></div>}
      </>}
      {value('启用云端备份') !== 'true' && <><p>关闭后不会自动备份，已保存的云端备份不会被删除。</p><button className="note-primary" onClick={saveConfig}>保存备份设置</button></>}
    </>}
    {section === 'data' && <>
      <div className="workspace-setting-row"><div><h3>会话数据</h3><p>JSON 仅包含文字与元数据，不含图片、原音实体。</p></div><span className="workspace-status">{sessionCount} 场示例会议</span></div>
      <div className="workspace-row"><button className="note-primary" onClick={() => { setExportKind('会话 JSON'); setDialog('export') }}><Download size={15} />导出会话数据</button><button className="note-text-button" onClick={() => { setImportReady(false); setDialog('import') }}>导入会话 JSON</button><button className="note-text-button" onClick={onBackup}>完整素材备份与恢复</button></div>
      <div className="workspace-divider" />
      <div className="workspace-setting-row"><div><h3>诊断资料</h3><p>导出脱敏状态与错误线索，便于定位问题。</p></div><ShieldCheck size={23} /></div>
      <button className="note-text-button" onClick={() => { setExportKind('脱敏诊断'); setDialog('export') }}>查看并导出诊断</button>
    </>}
    {section === 'about' && <>
      <div className="workspace-about"><span className="workspace-app-mark">D</span><div><h3>DeLive SQ</h3><p>把每一场讨论，留下来。</p><small>当前版本 {__APP_VERSION__}</small></div></div>
      {toggle('开机自启')}{toggle('启动时检查更新')}
      <button className="note-primary" onClick={saveConfig}>保存启动偏好</button>
      <div className="workspace-divider" />
      <div className="workspace-setting-row"><div><h3>版本更新</h3><p>{update === 'available' ? '发现示例更新，可查看内容。' : update === 'downloaded' ? '示例更新已准备好。' : '手动检查新的版本。'}</p></div><button className="note-text-button" disabled={!!busy} onClick={() => run('正在检查更新…', () => setUpdate('available'))}><RefreshCw size={15} />检查更新</button></div>
      {update !== 'idle' && <div className="workspace-feedback"><span>{update === 'downloaded' ? '下载完成（模拟）' : '设计预览版 · 示例更新'}</span><button className="note-text-button" disabled={!!busy} onClick={() => update === 'downloaded' ? setDialog('restart') : run('正在下载示例更新…', () => setUpdate('downloaded'))}>{update === 'downloaded' ? '重启并安装' : '下载更新'}</button></div>}
      <button className="note-text-button" onClick={() => setDialog('changelog')}>查看更新说明</button>
    </>}
    {busy && <p className="workspace-feedback" role="status">{busy}</p>}
    {notice && <p className="workspace-feedback" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    <ActionDialog open={['token', 'backup', 'deleteBackup', 'overwrite', 'overwriteImport', 'rollback', 'restart'].includes(dialog)} title={{ token: '重新生成访问令牌？', backup: '创建一份备份？', deleteBackup: '删除云端备份？', overwrite: '覆盖本机资料？', overwriteImport: '覆盖导入会话数据？', rollback: '恢复到操作前？', restart: '重启并安装更新？' }[dialog] ?? ''} description={{ token: '原令牌将在保存后失效，请同步更新客户端配置。', backup: `将备份 4 场示例会议及图片${value('包含原音') === 'true' ? '、原音' : '，不包含原音'}。`, deleteBackup: `「${selected?.name}」将从备份列表移除，本机会议不受影响。`, overwrite: `使用「${selected?.name}」替换本机资料。恢复前保留本地回退包。`, overwriteImport: '将以示例 JSON 替换当前预览中的会话和标签。JSON 不含图片和原音实体；覆盖前应先备份现有资料。', rollback: '使用恢复前的本地回退包还原资料。', restart: '正式应用会退出并安装更新。预览只展示操作反馈，不会重启。' }[dialog] ?? ''} onClose={() => setDialog('')} actions={[{ label: '取消', onClick: () => setDialog('') }, { label: ({ token: '生成新令牌', backup: '确认备份', deleteBackup: '确认删除备份', overwrite: '确认覆盖恢复', overwriteImport: '确认覆盖导入', rollback: '确认回退', restart: '确认重启' } as Record<string, string>)[dialog] ?? '确认', variant: ['deleteBackup', 'overwrite', 'overwriteImport'].includes(dialog) ? 'danger' : 'primary', onClick: () => {
      const action = dialog; setDialog('')
      if (action === 'token') { change('访问令牌', `preview-only-${Date.now()}`); setNotice({ text: '新示例令牌已生成，保存后生效。' }) }
      if (action === 'backup') { setBusy('正在打包并上传备份…'); timer.current = window.setTimeout(() => { setBusy(''); if (operationFails) setNotice({ error: true, text: '备份打包失败，尚未上传；本机资料保留。可重试备份。' }); else setUnknown(true) }, 600) }
      if (action === 'deleteBackup') run('正在删除备份…', () => { setBackups(items => items.filter(item => item.id !== selected?.id)); setNotice({ text: '示例备份已删除，本机资料保留。' }) })
      if (action === 'overwrite' || action === 'rollback') run('正在恢复资料…', () => { setRollback(action === 'overwrite'); setNotice({ text: action === 'overwrite' ? '覆盖恢复完成（模拟），操作前资料保留在回退包。' : '已恢复到操作前（模拟）。' }) })
      if (action === 'overwriteImport') run('正在校验并覆盖导入…', () => setNotice({ text: `覆盖导入完成（模拟）：现有列表替换为 ${onImport('overwrite')} 场示例会议。` }), '文件校验失败，现有资料保留。')
      if (action === 'restart') setNotice({ text: '已预览重启安装确认，当前应用没有退出。' })
    } }]} />
    <PreviewDialog open={['restore', 'import', 'export', 'changelog'].includes(dialog)} title={{ restore: '恢复备份', import: '导入会话数据', export: `导出${exportKind}`, changelog: '更新说明' }[dialog] ?? ''} onClose={() => setDialog('')}>
      <div className="workspace-flow">
        {dialog === 'restore' && <><div className="workspace-feedback"><Check size={18} /><strong>恢复材料已校验（示例）</strong></div><h3>{selected?.name}</h3><p>{selected?.detail}</p><p>{selected?.legacy ? '旧版仅包含文字与元数据，无法恢复图片和原音。' : selected?.audio ? '包含文字、图片和原音。' : '包含文字和图片，不含原音。'}</p><p>合并时同 ID 保留本机资料；覆盖会替换本机资料，并先创建回退包。</p><div className="workspace-row"><button className="note-primary" onClick={() => { setDialog(''); run('正在合并资料…', () => { setRollback(true); setNotice({ text: '合并完成（模拟），同 ID 保留本机资料。' }) }) }}>合并（同 ID 保留本地）</button><button className="note-text-button workspace-danger" onClick={() => setDialog('overwrite')}>覆盖恢复</button></div></>}
        {dialog === 'import' && <><p>仅导入文字与元数据。选择后先校验内容，再确认合并。</p><button className="workspace-drop" onClick={() => setImportReady(true)}>选择示例 JSON</button>{importReady && <><p>delive-sessions.json · 2 场会议 · 仅文字与元数据</p><p>同 ID 的已有会议保留，不覆盖本机资料。</p><button className="note-primary" onClick={() => { setDialog(''); run('正在校验并导入…', () => setNotice({ text: `导入完成（模拟）：新增 ${onImport('merge')} 场会议，同 ID 会议保留。` }), '文件校验失败，未导入任何资料。请检查文件格式后重新选择。') }}>确认导入示例</button><button className="note-text-button workspace-danger" onClick={() => setDialog('overwriteImport')}>覆盖导入</button></>}</>}
        {dialog === 'export' && <><p>{exportKind === '会话 JSON' ? `导出 ${sessionCount} 场会议的文字、标签和主题关系；不含原音与图片实体。` : '包括应用版本、任务状态与脱敏错误线索；不包含会议正文或密钥。'}</p><pre className="workspace-code">{exportKind === '会话 JSON' ? JSON.stringify({ sessions: sessionCount, includesAudio: false, includesImages: false }, null, 2) : '应用：DeLive SQ\n状态：示例运行环境\n凭据：[已脱敏]\n会议正文：[不包含]'}</pre><button className="note-primary" onClick={() => { setDialog(''); run('正在准备导出…', () => setNotice({ text: `${exportKind} 导出流程完成（模拟），未写出文件。` })) }}>确认导出</button></>}
        {dialog === 'changelog' && <><span className="workspace-eyebrow">设计预览 · 非已发布版本</span><h3>统一工作台体验</h3><ul><li>保留录制、文件、回顾、主题和设置导航。</li><li>补齐主题整理、备份恢复与配置流程。</li><li>统一阅读排版、明暗主题和窄窗口操作。</li></ul><p>正式版本内容以发布时的更新说明为准。</p></>}
      </div>
    </PreviewDialog>
  </div>
}
