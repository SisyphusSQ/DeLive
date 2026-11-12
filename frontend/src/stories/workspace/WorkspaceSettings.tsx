import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AppearancePanel } from '../../components/settings/AppearancePanel'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { useUIStore } from '../../stores/uiStore'
import { engines, type Engine } from './workspaceFixtures'

const sections = {
  provider: '语音转写', storage: '火山文件存储', ai: 'AI 后处理', appearance: '外观',
  openApi: '开放 API', backup: '云端备份', data: '数据管理', about: '关于',
} as const
export type SettingsSection = keyof typeof sections
export type Configuration = Partial<Record<Engine | 'storage' | 'ai', boolean>>
type Field = { label: string; secret?: boolean; placeholder?: string }
const credentials: Field[] = [{ label: 'API Key', secret: true }]
const legacyCredentials: Field[] = [{ label: 'APP ID' }, { label: 'Access Token', secret: true }]
const storageFields: Field[] = [
  { label: 'HTTPS Endpoint', placeholder: 'https://storage.example' }, { label: '区域' },
  { label: '私有桶' }, { label: '专用前缀' }, { label: 'Access Key ID', secret: true }, { label: 'Secret Access Key', secret: true },
]
const localFields: Field[] = [{ label: '服务地址', placeholder: 'http://127.0.0.1:8000/v1' }, { label: '模型' }]
const runtimeFields: Field[] = [{ label: 'Runtime 路径' }, { label: '模型路径' }]
const aiProviders = ['OpenAI 兼容', 'OpenAI', '本机 Codex']
const aiFields: Field[] = [{ label: 'Base URL' }, { label: '默认模型' }, { label: 'AI API Key', secret: true }]
const features = ['摘要', '对话', '校对', '思维导图']
const defaults: Record<string, string> = {
  语言提示: 'zh, en', 语气词规整: 'false', 使用路径式桶地址: 'false',
  ...Object.fromEntries(features.map(feature => [feature + '模型', '默认模型'])),
}

interface Props {
  section: SettingsSection
  setSection: (section: SettingsSection) => void
  engine: Engine
  setEngine: (engine: Engine) => void
  configuration: Configuration
  onSave: (key: keyof Configuration) => void
  onReturn?: () => void
  returnLabel?: string
  saveFails: boolean
  storageLocked: boolean
}

export function WorkspaceSettings({ section, setSection, engine, setEngine, configuration, onSave, onReturn, returnLabel, saveFails, storageLocked }: Props) {
  const ui = useUIStore()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [savedFields, setSavedFields] = useState<Record<string, string>>({})
  const [legacy, setLegacy] = useState(false)
  const [aiProvider, setAiProvider] = useState(aiProviders[0])
  const [savedAiProvider, setSavedAiProvider] = useState(aiProviders[0])
  const [savedLegacy, setSavedLegacy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const [pending, setPending] = useState(false)
  const [exit, setExit] = useState<(() => void) | null>(null)

  const key = section === 'provider' ? engine : section === 'storage' || section === 'ai' ? section : null
  const configured = key && configuration[key]
    && (key !== 'ai' || aiProvider === savedAiProvider)
    && (key !== engines[0] || legacy === savedLegacy)
  const isVolc = engine === engines[0]
  const isRuntime = engine === engines[3]
  const formId = key === 'ai' ? aiProvider : key === engines[0] ? legacy ? 'VolcLegacy' : 'VolcKey' : key ?? section
  const prefix = formId + ':'
  const dirty = Object.keys(fields).some(name => name.startsWith(prefix) && fields[name] !== (savedFields[name] ?? defaults[name.slice(prefix.length)] ?? ''))
  const fieldValue = (label: string) => fields[prefix + label] ?? defaults[label] ?? ''
  const changeField = (label: string, value: string) => {
    setFields(previous => ({ ...previous, [prefix + label]: value }))
    setNotice(undefined)
  }
  const storageDisabled = section === 'storage' && storageLocked
  const displayedFields = section === 'provider'
    ? isVolc ? legacy ? legacyCredentials : credentials : isRuntime ? runtimeFields : localFields
    : section === 'storage' ? storageFields : aiProvider === '本机 Codex' ? [{ label: 'Codex 程序路径' }, { label: '默认模型' }] : aiFields
  const missing = displayedFields.filter(field => !fields[prefix + field.label]?.trim() && !configured && !(section === 'ai' && (field.label === 'AI API Key' || field.label === 'Codex 程序路径')))

  function leave(action: () => void) {
    if (dirty) setExit(() => action)
    else { setNotice(undefined); action() }
  }
  function validate() {
    if (!missing.length) return true
    setNotice({ error: true, text: `请补齐：${missing.map(field => field.label).join('、')}` })
    return false
  }
  function test() {
    if (!validate()) return
    setPending(true)
    setNotice(undefined)
    window.setTimeout(() => { setPending(false); setNotice({ text: '示例配置测试通过，可保存设置。' }) }, 400)
  }

  return <div className="workspace-flow">
    <header className="workspace-page-heading"><div><h1>设置</h1><p>管理转写、AI 和本机偏好。</p></div>{onReturn && <button className="note-text-button" onClick={() => leave(onReturn)}><ArrowLeft size={15} />{returnLabel}</button>}</header>
    <div className="workspace-settings">
      <nav className="workspace-settings-nav" aria-label="设置分组">{Object.entries(sections).map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} disabled={pending} onClick={() => { if (id !== section) leave(() => setSection(id as SettingsSection)) }}>{label}</button>)}</nav>
      <section className="workspace-section" aria-label={sections[section]}>
        <div className="workspace-section-heading"><h2>{sections[section]}</h2>{key && <span className="workspace-status">{configured ? '已配置' : '未配置'}</span>}</div>
        {section === 'provider' && <>
          <label className="workspace-field">语音识别服务 <Select aria-label="语音识别服务" value={engine} disabled={pending} onChange={e => { if (e.target.value !== engine) leave(() => setEngine(e.target.value as Engine)) }}>{engines.map(name => <option key={name}>{name}</option>)}</Select></label>
          {isVolc ? <><p>实时转写和标准文件转写共用火山凭据。标准文件转写还需要私有临时存储。</p><button className="note-text-button" disabled={pending} onClick={() => leave(() => setLegacy(value => !value))}>{legacy ? '使用 API Key' : '使用 APP ID + Access Token'}</button></> : <p>在本机完成识别。先准备本地服务或模型，再测试配置。</p>}
        </>}
        {section === 'storage' && <p>用于火山文件转写的临时音频副本。桶应保持私有，原音保存在本机。</p>}
        {storageDisabled && <p className="workspace-feedback" role="status">有活动任务或临时副本待清理，暂时无法更换存储位置。</p>}
        {section === 'ai' && <>
          <p>用于摘要、对话、文本校对和导图。</p>
          <label className="workspace-field">AI 接入方式 <Select aria-label="AI 接入方式" value={aiProvider} disabled={pending} onChange={e => { if (e.target.value !== aiProvider) leave(() => setAiProvider(e.target.value)) }}>{aiProviders.map(name => <option key={name}>{name}</option>)}</Select></label>
        </>}
        {key && <form className="workspace-flow" autoComplete="off" onSubmit={e => {
          e.preventDefault()
          if (!validate()) return
          if (saveFails) { setNotice({ text: '保存失败，输入已保留。请重试保存。', error: true }); return }
          if (key === 'ai') setSavedAiProvider(aiProvider)
          if (key === engines[0]) setSavedLegacy(legacy)
          onSave(key)
          setSavedFields(previous => ({ ...previous, ...Object.fromEntries(Object.entries(fields).filter(([name]) => name.startsWith(prefix))) }))
          setNotice({ text: '设置已保存，可以返回继续。' })
        }}>
          <div className="workspace-fields">{displayedFields.map(field => <label key={field.label} className="workspace-field">{field.label}<input className="workspace-input" type={field.secret ? 'password' : 'text'} placeholder={configured && field.secret ? '已保存，留空保留' : field.placeholder} disabled={storageDisabled || pending} autoComplete={field.secret ? 'new-password' : 'off'} value={fieldValue(field.label)} onChange={e => changeField(field.label, e.target.value)} /></label>)}</div>
          {section === 'provider' && <details className="workspace-disclosure"><summary>高级参数与本地模型</summary><div className="workspace-fields">
            <label className="workspace-field">语言提示<input className="workspace-input" value={fieldValue('语言提示')} onChange={e => changeField('语言提示', e.target.value)} /></label>
            {isVolc ? <label><input type="checkbox" checked={fieldValue('语气词规整') === 'true'} onChange={e => changeField('语气词规整', String(e.target.checked))} /> 语气词规整</label> : <button className="note-text-button" type="button" onClick={() => setNotice({ text: isRuntime ? '已选中示例 Runtime 与模型。' : '发现示例模型，可填写到模型字段。' })}>{isRuntime ? '选择 Runtime 与模型' : '发现本地服务与模型'}</button>}
          </div></details>}
          {section === 'storage' && <label><input type="checkbox" disabled={storageDisabled} checked={fieldValue('使用路径式桶地址') === 'true'} onChange={e => changeField('使用路径式桶地址', String(e.target.checked))} /> 使用路径式桶地址</label>}
          {section === 'ai' && <details className="workspace-disclosure"><summary>按功能分配模型</summary><div className="workspace-fields">{features.map(feature => <label key={feature} className="workspace-field">{feature}<Select aria-label={`${feature}模型`} value={fieldValue(feature + '模型')} onChange={e => changeField(feature + '模型', e.target.value)}><option>默认模型</option><option>示例长文模型</option><option>示例图文模型</option></Select></label>)}</div></details>}
          <div className="workspace-row"><button type="button" className="note-text-button" disabled={storageDisabled || pending} onClick={test}>{pending ? '正在测试…' : '测试配置'}</button><button type="submit" className="note-primary" disabled={storageDisabled || pending}>保存设置</button>{dirty && <span>有未保存修改</span>}</div>
        </form>}
        {section === 'appearance' && <div className="workspace-flow">
          <label className="workspace-field">明暗模式 <Select aria-label="明暗模式" value={ui.theme} onChange={e => ui.setTheme(e.target.value as typeof ui.theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></Select></label>
          <AppearancePanel t={ui.t} language={ui.language} setLanguage={ui.setLanguage} colorTheme={ui.colorTheme} setColorTheme={ui.setColorTheme} />
        </div>}
        {section === 'openApi' && <><label><input type="checkbox" /> 启用本机 REST API 和 WebSocket</label><label className="workspace-field">访问令牌<input className="workspace-input" type="password" placeholder="示例令牌" autoComplete="new-password" /></label><button className="note-text-button" onClick={() => setNotice({ text: '已预览生成令牌反馈。' })}>生成令牌</button></>}
        {section === 'backup' && <><label><input type="checkbox" /> 启用云端备份</label><p>备份位置、连接状态、立即备份和恢复入口集中显示。</p><div className="workspace-row">{['测试连接', '立即备份', '选择备份恢复'].map(label => <button className="note-text-button" key={label} onClick={() => setNotice({ text: `已打开「${label}」预览。` })}>{label}</button>)}</div></>}
        {section === 'data' && <><p>管理会议、设置和原音资料的本地导入与导出。</p><div className="workspace-row">{['导出会话数据', '导入备份'].map(label => <button className="note-text-button" key={label} onClick={() => setNotice({ text: `已打开「${label}」预览。` })}>{label}</button>)}</div></>}
        {section === 'about' && <><p>DeLive SQ 桌面转录工作台</p><label><input type="checkbox" /> 开机自启</label><div className="workspace-row">{['更新说明', '导出脱敏诊断'].map(label => <button className="note-text-button" key={label} onClick={() => setNotice({ text: `已打开「${label}」预览。` })}>{label}</button>)}</div></>}
        {notice && <p className="workspace-feedback" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      </section>
    </div>
    <ActionDialog open={exit !== null} title="放弃未保存的设置？" description="本次输入将丢弃，已经保存的配置继续可用。" onClose={() => setExit(null)} actions={[{ label: '继续编辑', onClick: () => setExit(null) }, { label: '放弃修改', variant: 'danger', onClick: () => {
      setFields(previous => Object.fromEntries([...Object.entries(previous).filter(([name]) => !name.startsWith(prefix)), ...Object.entries(savedFields).filter(([name]) => name.startsWith(prefix))]))
      setNotice(undefined); exit?.(); setExit(null)
    } }]} />
  </div>
}
