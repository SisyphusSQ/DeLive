import { useEffect, useState, type MutableRefObject } from 'react'
import { ArrowLeft } from 'lucide-react'
import { AppearancePanel } from '../../components/settings/AppearancePanel'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'
import { useUIStore } from '../../stores/uiStore'
import { engines, utilityDefaults, type Engine } from './workspaceFixtures'
import { WorkspaceUtilities, type UtilitySection } from './WorkspaceUtilities'
import { useSessionStore } from '../../stores/sessionStore'
import { meetings } from '../review/fixtures'
import { PreviewDialog } from '../review/NotebookExtras'

const settingsSections = {
  provider: '语音转写', storage: '火山文件存储', ai: 'AI 后处理', appearance: '外观',
  openApi: '开放 API', backup: '云端备份', data: '数据管理', about: '关于',
} as const
export type SettingsSection = keyof typeof settingsSections
export type Configuration = Partial<Record<Engine | 'storage' | 'ai' | 'aiEnabled', boolean>>
type Field = { label: string; secret?: boolean; placeholder?: string }
const credentials: Field[] = [{ label: 'API Key', secret: true }]
const legacyCredentials: Field[] = [{ label: 'APP ID' }, { label: 'Access Token', secret: true }]
const storageFields: Field[] = [
  { label: 'HTTPS Endpoint', placeholder: 'https://storage.example' }, { label: '区域' },
  { label: '私有桶' }, { label: '专用前缀' }, { label: 'Access Key ID', secret: true }, { label: 'Secret Access Key', secret: true },
]
const localFields: Field[] = [{ label: '服务地址', placeholder: 'http://127.0.0.1:8000/v1' }, { label: '模型' }, { label: '本地 API Key（可选）', secret: true }]
const runtimeFields: Field[] = [{ label: 'Runtime 路径' }, { label: '模型路径' }, { label: 'Runtime 端口', placeholder: '8080' }]
const aiProviders = ['OpenAI 兼容', 'OpenAI', '本机 Codex']
const aiFields: Field[] = [{ label: 'Base URL' }, { label: '默认模型' }, { label: 'AI API Key', secret: true }]
const features = ['摘要', '对话', '校对', '思维导图']
const defaults: Record<string, string> = {
  ...utilityDefaults, '启用 AI': 'true', '请求协议': 'Chat Completions', '推理强度': '模型默认值', '提示词语言': '中文', '文本来源': '自动选择', '流式输出': 'true', '校对模式': '逐项检测',
  语言提示: 'zh, en', 语气词规整: 'false', 使用路径式桶地址: 'false',
  ...Object.fromEntries(features.map(feature => [feature + '模型', '默认模型'])),
}

interface Props {
  section: SettingsSection
  setSection: (section: SettingsSection) => void
  engine: Engine
  setEngine: (engine: Engine) => void
  configuration: Configuration
  onSave: (key: keyof Configuration, ready?: boolean) => void
  onReturn?: () => void
  returnLabel?: string
  saveFails: boolean
  storageLocked: boolean
  operationFails: boolean
  leaveRef: MutableRefObject<((action: () => void) => void) | undefined>
}

export function WorkspaceSettings({ section, setSection, engine, setEngine, configuration, onSave, onReturn, returnLabel, saveFails, storageLocked, operationFails, leaveRef }: Props) {
  const ui = useUIStore()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [savedFields, setSavedFields] = useState<Record<string, string>>({})
  const [legacy, setLegacy] = useState(false)
  const [aiProvider, setAiProvider] = useState(aiProviders[0])
  const [savedAiProvider, setSavedAiProvider] = useState(aiProviders[0])
  const [savedLegacy, setSavedLegacy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const [pending, setPending] = useState(false)
  const [modelDialog, setModelDialog] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [runtimeDialog, setRuntimeDialog] = useState(false)
  const [runtimeBinary, setRuntimeBinary] = useState(false)
  const [runtimeModel, setRuntimeModel] = useState(false)
  const [runtimeRunning, setRuntimeRunning] = useState(false)
  const sessionCount = useSessionStore(s => s.sessions.length)
  const [exit, setExit] = useState<(() => void) | null>(null)

  const key = section === 'provider' ? engine : section === 'storage' || section === 'ai' ? section : null
  const configured = key && configuration[key]
    && (key !== 'ai' || aiProvider === savedAiProvider)
    && (key !== engines[0] || legacy === savedLegacy)
  const isVolc = engine === engines[0]
  const isRuntime = engine === engines[3]
  const formId = key === 'ai' ? aiProvider : key === engines[0] ? legacy ? 'VolcLegacy' : 'VolcKey' : key ?? section
  const prefix = formId + ':'
  const configuredDefaults: Record<string, string> = configured ? { 'Base URL': 'https://ai.example/v1', '默认模型': '示例长文模型', 'HTTPS Endpoint': 'https://storage.example', '区域': 'cn-example', '私有桶': 'meeting-audio', '专用前缀': 'temporary/' } : {}
  const dirty = Object.keys(fields).some(name => name.startsWith(prefix) && fields[name] !== (savedFields[name] ?? configuredDefaults[name.slice(prefix.length)] ?? defaults[name.slice(prefix.length)] ?? ''))
  const fieldValue = (label: string) => fields[prefix + label] ?? configuredDefaults[label] ?? defaults[label] ?? ''
  const changeField = (label: string, value: string) => {
    setFields(previous => ({ ...previous, [prefix + label]: value }))
    setNotice(undefined)
  }
  const storageDisabled = section === 'storage' && storageLocked
  const displayedFields = section === 'provider'
    ? isVolc ? legacy ? legacyCredentials : credentials : isRuntime ? runtimeFields : localFields
    : section === 'storage' ? storageFields : aiProvider === '本机 Codex' ? [{ label: 'Codex 程序路径' }, { label: '默认模型' }] : aiFields
  const missing = displayedFields.filter(field => !fieldValue(field.label).trim() && !(field.secret && configured) && !['本地 API Key（可选）', 'Runtime 端口'].includes(field.label) && !(section === 'ai' && (field.label === 'AI API Key' || field.label === 'Codex 程序路径')))

  function leave(action: () => void) {
    if (dirty) setExit(() => action)
    else { setNotice(undefined); action() }
  }
  useEffect(() => {
    leaveRef.current = leave
    return () => { leaveRef.current = undefined }
  })
  function saveSettings() {
    if (saveFails) { setNotice({ text: '保存失败，输入已保留。请重试保存。', error: true }); return false }
    setSavedFields(previous => ({ ...previous, ...Object.fromEntries(Object.entries(fields).filter(([name]) => name.startsWith(prefix))) }))
    setNotice({ text: '设置已保存，可以返回继续。' })
    return true
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
    window.setTimeout(() => { setPending(false); setNotice(operationFails ? { error: true, text: '示例连接失败，检查地址与凭据后重试；输入已保留。' } : { text: '示例配置测试通过，可保存设置。' }) }, 400)
  }

  return <div className="workspace-flow">
    <header className="workspace-page-heading"><div><span className="workspace-eyebrow">按你的习惯工作</span><h1>设置</h1><p>管理转写、AI 和本机偏好。</p></div>{onReturn && <button className="note-text-button" onClick={() => leave(onReturn)}><ArrowLeft size={15} />{returnLabel}</button>}</header>
    <div className="workspace-settings">
      <nav className="workspace-settings-nav" aria-label="设置分组">{Object.entries(settingsSections).map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} disabled={pending} onClick={() => { if (id !== section) leave(() => setSection(id as SettingsSection)) }}>{label}</button>)}</nav>
      <section className="workspace-section" aria-label={settingsSections[section]}>
        <div className="workspace-section-heading"><h2>{settingsSections[section]}</h2>{key && <span className="workspace-status">{configured ? key === 'ai' && fieldValue('启用 AI') === 'false' ? '已停用' : '已配置' : '未配置'}</span>}</div>
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
          if (!saveSettings()) return
          if (key === 'ai') setSavedAiProvider(aiProvider)
          if (key === engines[0]) setSavedLegacy(legacy)
          onSave(key)
          if (key === 'ai') onSave('aiEnabled', fieldValue('启用 AI') !== 'false')
        }}>
          <div className="workspace-fields">{displayedFields.map(field => <label key={field.label} className="workspace-field">{field.label}<input className="workspace-input" type={field.secret ? 'password' : 'text'} placeholder={configured && field.secret ? '已保存，留空保留' : field.placeholder} disabled={storageDisabled || pending} autoComplete={field.secret ? 'new-password' : 'off'} value={fieldValue(field.label)} onChange={e => changeField(field.label, e.target.value)} /></label>)}</div>
          {section === 'provider' && <details className="workspace-disclosure"><summary>高级参数与本地模型</summary><div className="workspace-fields">
            <label className="workspace-field">语言提示<input className="workspace-input" value={fieldValue('语言提示')} onChange={e => changeField('语言提示', e.target.value)} /></label>
            {isVolc ? <label><input type="checkbox" checked={fieldValue('语气词规整') === 'true'} onChange={e => changeField('语气词规整', String(e.target.checked))} /> 语气词规整</label> : <button className="note-text-button" type="button" onClick={() => setRuntimeDialog(true)}>{isRuntime ? '选择 Runtime 与模型' : '发现本地服务与模型'}</button>}
          </div></details>}
          {section === 'storage' && <label><input type="checkbox" disabled={storageDisabled} checked={fieldValue('使用路径式桶地址') === 'true'} onChange={e => changeField('使用路径式桶地址', String(e.target.checked))} /> 使用路径式桶地址</label>}
          {section === 'ai' && <><label className="workspace-setting-row"><span>启用 AI</span><input type="checkbox" checked={fieldValue('启用 AI') === 'true'} onChange={e => changeField('启用 AI', String(e.target.checked))} /></label><button className="note-text-button" type="button" onClick={() => { setModelSearch(''); setModelDialog(true) }}>获取与选择模型</button><div className="workspace-fields">{(aiProvider === '本机 Codex' ? [] : aiProvider === 'OpenAI' ? ['推理强度'] : ['请求协议', ...(fieldValue('请求协议') === 'Responses' ? ['推理强度'] : [])]).map(label => <label key={label} className="workspace-field">{label}<Select aria-label={label} value={fieldValue(label)} onChange={e => changeField(label, e.target.value)}>{(label === '请求协议' ? ['Chat Completions', 'Responses'] : ['模型默认值', 'low', 'medium', 'high', 'xhigh', 'max']).map(option => <option key={option}>{option}</option>)}</Select></label>)}</div></>}
          {section === 'ai' && <details className="workspace-disclosure"><summary>按功能分配模型</summary><div className="workspace-fields">{features.map(feature => <label key={feature} className="workspace-field">{feature}<Select aria-label={`${feature}模型`} value={fieldValue(feature + '模型')} onChange={e => changeField(feature + '模型', e.target.value)}><option>默认模型</option><option>示例长文模型</option><option>示例图文模型</option></Select></label>)}</div></details>}
          {section === 'ai' && <details className="workspace-disclosure"><summary>生成与校对偏好</summary><div className="workspace-fields">{Object.entries({ '提示词语言': ['中文', 'English', '한국어'], '文本来源': ['自动选择', '原始转录', '校正文本'], '校对模式': ['快速校正', '逐项检测'] }).map(([label, options]) => <label key={label} className="workspace-field">{label}<Select aria-label={label} value={fieldValue(label)} onChange={e => changeField(label, e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</Select></label>)}<label><input type="checkbox" checked={fieldValue('流式输出') === 'true'} onChange={e => changeField('流式输出', String(e.target.checked))} /> 流式输出</label></div></details>}
          <div className="workspace-row"><button type="button" className="note-text-button" disabled={storageDisabled || pending} onClick={test}>{pending ? '正在测试…' : '测试配置'}</button><button type="submit" className="note-primary" disabled={storageDisabled || pending}>保存设置</button>{dirty && <span>有未保存修改</span>}</div>
        </form>}
        {section === 'appearance' && <div className="workspace-flow">
          <label className="workspace-field">明暗模式 <Select aria-label="明暗模式" value={ui.theme} onChange={e => ui.setTheme(e.target.value as typeof ui.theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></Select></label>
          <AppearancePanel t={ui.t} language={ui.language} setLanguage={ui.setLanguage} colorTheme={ui.colorTheme} setColorTheme={ui.setColorTheme} />
        </div>}
        <div className="workspace-flow" hidden={!(['openApi', 'backup', 'data', 'about'] as string[]).includes(section)}><WorkspaceUtilities section={(['openApi', 'backup', 'data', 'about'] as string[]).includes(section) ? section as UtilitySection : 'about'} value={fieldValue} change={changeField} save={saveSettings} dirty={dirty} operationFails={operationFails} sessionCount={sessionCount} onImport={mode => {
          const existing = useSessionStore.getState().sessions
          const imported = meetings.slice(1, 3).map((item, index) => ({ ...item, id: `preview-json-${index}`, title: `导入 · ${item.title}`, topicId: undefined }))
          if (mode === 'overwrite') { useSessionStore.setState({ sessions: imported }); return imported.length }
          const added = imported.filter(item => !existing.some(session => session.id === item.id))
          useSessionStore.setState({ sessions: [...existing, ...added] })
          return added.length
        }} onBackup={() => leave(() => setSection('backup'))} /></div>
        {notice && <p className="workspace-feedback" role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
      </section>
    </div>
    <PreviewDialog open={modelDialog} title="选择 AI 模型" onClose={() => setModelDialog(false)}>
      <div className="workspace-flow"><p>选择默认模型，各功能也可以单独指定。</p><input className="workspace-input" aria-label="搜索 AI 模型" placeholder="搜索模型名称" value={modelSearch} onChange={e => setModelSearch(e.target.value)} />
        {operationFails ? <p role="alert">示例模型列表读取失败，已填写的默认模型保留。可以关闭后手动填写。</p> : ['示例长文模型', '示例图文模型'].filter(name => name.includes(modelSearch)).map(name => <button className="workspace-option" key={name} onClick={() => { changeField('默认模型', name); setModelDialog(false) }}>{name}</button>)}
        {!operationFails && !['示例长文模型', '示例图文模型'].some(name => name.includes(modelSearch)) && <p>没有匹配的模型，可返回手动填写。</p>}
      </div>
    </PreviewDialog>
    <PreviewDialog open={runtimeDialog} title="本地服务与模型" onClose={() => setRuntimeDialog(false)}><div className="workspace-flow">
      <p>{isRuntime ? '选择本机的运行程序和模型；也可使用内置运行时向导。' : '发现本地服务后，确认地址与模型再使用。'}</p>
      {isRuntime && <><ol className="workspace-runtime-steps"><li><div><strong>1 · 准备运行程序</strong><p>{runtimeBinary ? '示例程序已准备' : '使用内置程序或选择已有路径。'}</p></div><button className="note-text-button" onClick={() => setRuntimeBinary(true)}>准备示例程序</button></li><li><div><strong>2 · 准备模型</strong><p>{runtimeModel ? 'ggml-base.bin · 示例模型' : '模型在本机运行，不上传音频。'}</p></div><button className="note-text-button" onClick={() => setRuntimeModel(true)}>选择示例模型</button></li><li><div><strong>3 · 启动服务</strong><p role="status">{runtimeRunning ? '示例服务运行中 · 端口 8080' : '等待启动'}</p></div><button className="note-text-button" disabled={!runtimeBinary || !runtimeModel || operationFails} onClick={() => setRuntimeRunning(value => !value)}>{runtimeRunning ? '停止示例服务' : '启动示例服务'}</button></li></ol></>}
      {operationFails ? <p role="alert">示例服务不可用，请检查模型与程序路径后重试。</p> : <div className="workspace-feedback"><span>{isRuntime && !runtimeRunning ? '完成准备后再使用配置' : '示例运行环境就绪'}</span><button className="note-primary" disabled={isRuntime && !runtimeRunning} onClick={() => { if (isRuntime) { changeField('Runtime 路径', '/example/whisper-server'); changeField('模型路径', '/example/ggml-base.bin') } else { changeField('服务地址', 'http://127.0.0.1:8000/v1'); changeField('模型', '示例本地模型') } setRuntimeDialog(false) }}>使用示例配置</button></div>}
      <details className="workspace-disclosure"><summary>安装与启动说明</summary><ol><li>准备受支持的本地程序与模型。</li><li>选择路径或本地服务地址。</li><li>测试连接后保存，再返回录制或文件转写。</li></ol><p>预览不下载模型、不安装程序，也不启动本地服务。</p></details>
    </div></PreviewDialog>
    <ActionDialog open={exit !== null} title="放弃未保存的设置？" description="本次输入将丢弃，已经保存的配置继续可用。" onClose={() => setExit(null)} actions={[{ label: '继续编辑', onClick: () => setExit(null) }, { label: '放弃修改', variant: 'danger', onClick: () => {
      setFields(previous => Object.fromEntries([...Object.entries(previous).filter(([name]) => !name.startsWith(prefix)), ...Object.entries(savedFields).filter(([name]) => name.startsWith(prefix))]))
      setNotice(undefined); exit?.(); setExit(null)
    } }]} />
  </div>
}
