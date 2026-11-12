import { Select } from '../ui/Select'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Key,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
} from 'lucide-react'
import { Button, Switch } from '../ui'
import type { Translations } from '../../i18n'
import type { AiFeatureKey, AiPostProcessConfig } from '../../types'
import { fetchAvailableModels } from '../../services/aiPostProcess'
import { aiBaseUrl, aiUsesResponses, redactAiError } from '../../../../shared/ai'

interface AiPostProcessPanelProps {
  t: Translations
  language: string
  aiPostProcessConfig: AiPostProcessConfig
  updateAiPostProcessConfig: (config: Partial<AiPostProcessConfig>) => void
}

type Pick = (zh: string, en: string, ko: string) => string

const PROMPT_LANGUAGE_OPTIONS: { id: 'zh' | 'en' | 'ko'; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
  { id: 'ko', label: '한국어' },
]

const AI_FEATURES: { key: AiFeatureKey; labelZh: string; labelEn: string; labelKo: string }[] = [
  { key: 'briefing', labelZh: 'AI 摘要', labelEn: 'AI Briefing', labelKo: 'AI 요약' },
  { key: 'chat', labelZh: 'AI 对话', labelEn: 'AI Chat', labelKo: 'AI 대화' },
  { key: 'mindmap', labelZh: 'AI 思维导图', labelEn: 'AI Mind Map', labelKo: 'AI 마인드맵' },
  { key: 'correction', labelZh: 'AI 纠错', labelEn: 'AI Correction', labelKo: 'AI 교정' },
]

export function AiPostProcessPanel({
  t,
  language,
  aiPostProcessConfig,
  updateAiPostProcessConfig,
}: AiPostProcessPanelProps) {
  const cfg = aiPostProcessConfig
  const pick: Pick = useCallback((zh, en, ko) => (language === 'ko' ? ko : language === 'zh' ? zh : en), [language])
  const [showApiKey, setShowApiKey] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [fetchError, setFetchError] = useState('')
  const [connectionInfo, setConnectionInfo] = useState('')
  const [manualModel, setManualModel] = useState('')
  const [modelSearch, setModelSearch] = useState('')

  const effectiveDefault = cfg.defaultModel?.trim() || cfg.model?.trim() || cfg.selectedModels?.find(model => model.trim())?.trim() || ''
  const selected = cfg.selectedModels ?? []

  const filteredModels = useMemo(() => {
    const all = cfg.availableModels ?? []
    const q = modelSearch.trim().toLowerCase()
    if (!q) return all
    return all.filter((m) => m.toLowerCase().includes(q))
  }, [cfg.availableModels, modelSearch])

  const handleFetchModels = useCallback(async () => {
    setFetchStatus('loading')
    setFetchError('')
    setConnectionInfo('')
    try {
      if (cfg.provider === 'codex') {
        if (!window.electronAPI?.codex) throw new Error('本机 Codex 需要桌面应用')
        const status = await window.electronAPI.codex.inspect(cfg.codexPath)
        if (!status.authenticated) throw new Error('Codex 尚未认证，请先在 CLI 登录或配置服务')
        updateAiPostProcessConfig({ availableModels: status.models.map(m => m.id), visionModels: status.models.filter(m => m.vision).map(m => m.id) })
        setConnectionInfo(`Codex ${status.version} · ${pick('认证可用，复用默认 CODEX_HOME', 'Authenticated · default CODEX_HOME', '인증됨 · 기본 CODEX_HOME')}`)
      } else {
        const models = await fetchAvailableModels(aiBaseUrl(cfg), cfg.apiKey)
        updateAiPostProcessConfig({ availableModels: cfg.provider === 'openai' ? models.filter(model => /^gpt-6(?:\.1)?-/.test(model)) : models })
      }
      setFetchStatus('success')
    } catch (err) {
      setFetchError(redactAiError(err instanceof Error ? err.message : String(err), cfg.apiKey))
      setFetchStatus('error')
    }
  }, [cfg, updateAiPostProcessConfig, pick])

  const toggleModelSelected = useCallback(
    (modelId: string) => {
      const next = selected.includes(modelId)
        ? selected.filter((m) => m !== modelId)
        : [...selected, modelId]
      const patch: Partial<AiPostProcessConfig> = { selectedModels: next }
      if (!effectiveDefault || (effectiveDefault === modelId && !next.includes(modelId))) {
        patch.defaultModel = next[0] || ''
        patch.model = patch.defaultModel
      }
      updateAiPostProcessConfig(patch)
    },
    [selected, effectiveDefault, updateAiPostProcessConfig],
  )

  const setDefaultModel = useCallback(
    (modelId: string) => {
      const patch: Partial<AiPostProcessConfig> = { defaultModel: modelId, model: modelId }
      if (!selected.includes(modelId)) {
        patch.selectedModels = [...selected, modelId]
      }
      updateAiPostProcessConfig(patch)
    },
    [selected, updateAiPostProcessConfig],
  )

  const setFeatureModel = useCallback(
    (feature: AiFeatureKey, modelId: string) => {
      updateAiPostProcessConfig({
        modelAssignment: {
          ...(cfg.modelAssignment || {}),
          [feature]: modelId || undefined,
        },
      })
    },
    [cfg.modelAssignment, updateAiPostProcessConfig],
  )

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <section className="workspace-panel-muted p-4 space-y-3">
        <label className="text-sm font-medium leading-none flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          {t.settings.aiPostProcessTitle}
        </label>
        <p className="text-xs text-muted-foreground">{t.settings.aiPostProcessDesc}</p>

        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm font-medium">{t.settings.aiPostProcessEnable}</p>
            <p className="text-xs text-muted-foreground">{t.settings.aiPostProcessEnableDesc}</p>
          </div>
          <Switch
            checked={!!cfg.enabled}
            onChange={(val) => updateAiPostProcessConfig({ enabled: val })}
            aria-label={t.settings.aiPostProcessEnable}
          />
        </div>
      </section>

      {/* API connection */}
      <fieldset disabled={fetchStatus === 'loading'} className="workspace-panel-muted p-4 space-y-3">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="ai-provider">{pick('AI 接入方式', 'AI provider', 'AI 공급자')}</label>
        <Select id="ai-provider" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={cfg.provider || 'openai-compatible'} onChange={event => {
          const provider = event.target.value as AiPostProcessConfig['provider']
          updateAiPostProcessConfig({ provider, model: '', defaultModel: '', selectedModels: [], availableModels: [], modelAssignment: {}, visionModels: [], apiKey: '',
            baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : 'http://127.0.0.1:11434/v1' })
          setFetchStatus('idle'); setFetchError(''); setConnectionInfo('')
        }}>
          <option value="openai-compatible">OpenAI-compatible</option>
          <option value="openai">OpenAI API (Responses)</option>
          <option value="codex">{pick('本机 Codex', 'Local Codex', '로컬 Codex')}</option>
        </Select>
        <p className="text-xs text-muted-foreground">{pick('切换接入方式后请重新选择模型并填写所需密钥；不会自动切换服务。', 'Select models and credentials after switching providers. No automatic fallback.', '공급자 변경 후 모델과 인증 정보를 설정하세요. 자동 대체 없음.')}</p>
        {cfg.provider === 'codex' ? <>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="codex-path">{pick('Codex 程序路径（留空自动探测）', 'Codex executable (blank: auto-detect)', 'Codex 경로 (비우면 자동 탐지)')}</label>
          <input id="codex-path" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono" value={cfg.codexPath || ''} onChange={e => updateAiPostProcessConfig({ codexPath: e.target.value })} placeholder="/opt/homebrew/bin/codex" />
          <p className="text-xs text-muted-foreground">{pick('复用默认 CODEX_HOME 中的认证和服务配置，不修改全局配置。当前支持 Codex 0.156.x。', 'Uses default CODEX_HOME auth and provider settings without editing global config. Supports Codex 0.156.x.', '기본 CODEX_HOME 인증 및 설정 사용. 전역 설정 변경 없음. Codex 0.156.x 지원.')}</p>
        </> : <>
        <label className="text-sm font-medium leading-none flex items-center gap-2">
          <Key className="w-3.5 h-3.5 text-muted-foreground" />
          {pick('API 连接', 'API Connection', 'API 연결')}
        </label>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">{t.settings.aiBaseUrl}</label>
          <input
            type="text"
            value={cfg.baseUrl || ''}
            onChange={(e) => updateAiPostProcessConfig({ baseUrl: e.target.value })}
            placeholder="http://127.0.0.1:11434/v1"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Key className="w-3.5 h-3.5" />
            {t.settings.aiApiKey}
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={cfg.apiKey || ''}
              onChange={(e) => updateAiPostProcessConfig({ apiKey: e.target.value })}
              placeholder={t.settings.aiApiKeyPlaceholder}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 pr-10 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t.settings.aiApiKeyDesc}</p>
        </div>
        {cfg.provider !== 'openai' && <>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="ai-protocol">{pick('请求协议', 'Protocol', '프로토콜')}</label>
          <Select id="ai-protocol" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={cfg.protocol || 'chat-completions'} onChange={e => updateAiPostProcessConfig({ protocol: e.target.value as AiPostProcessConfig['protocol'] })}>
            <option value="chat-completions">Chat Completions</option><option value="responses">Responses</option>
          </Select>
        </>}
        </>}

        {cfg.provider !== 'codex' && aiUsesResponses(cfg) && <>
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="ai-reasoning-effort">{pick('推理强度（Effort）', 'Reasoning effort', '추론 강도')}</label>
          <Select id="ai-reasoning-effort" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={cfg.reasoningEffort || ''}
            onChange={e => updateAiPostProcessConfig({ reasoningEffort: (e.target.value || undefined) as AiPostProcessConfig['reasoningEffort'] })}>
            <option value="">{pick('使用模型默认值', 'Model default', '모델 기본값')}</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="xhigh">xhigh</option>
            <option value="max">max</option>
          </Select>
          <p className="text-xs text-muted-foreground">{pick('应用于所有 AI 功能的 Responses 请求。GPT-6.1 Sol 支持以上五档；其他模型请按服务支持选择，不支持推理的模型请使用默认值。强度越高，通常耗时和费用越高。', 'Applies to Responses requests for all AI features. GPT-6.1 Sol supports all five levels; choose model default for models without reasoning support. Higher effort usually increases latency and cost.', '모든 AI 기능의 Responses 요청에 적용됩니다. GPT-6.1 Sol은 다섯 단계를 지원합니다. 추론 미지원 모델은 기본값을 선택하세요. 높은 강도는 보통 시간과 비용을 늘립니다.')}</p>
        </>}

        <button
          onClick={() => void handleFetchModels()}
          disabled={fetchStatus === 'loading'}
          className={`inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-md transition-colors w-full
            ${fetchStatus === 'loading'
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : fetchStatus === 'success'
                ? 'bg-success/10 text-success border border-success/50'
                : fetchStatus === 'error'
                  ? 'bg-destructive/10 text-destructive border border-destructive/50'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
        >
          {fetchStatus === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : fetchStatus === 'success' ? (
            <Check className="w-4 h-4" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {pick('获取模型列表', 'Fetch Model List', '모델 목록 가져오기')}
        </button>

        {fetchStatus === 'error' && fetchError && (
          <p className="text-xs text-destructive">{fetchError}</p>
        )}
        {connectionInfo && <p role="status" className="text-xs text-muted-foreground">{connectionInfo}</p>}
        <label htmlFor="ai-manual-model" className="block text-xs font-medium text-muted-foreground">{pick('手动添加模型', 'Add model manually', '모델 직접 추가')}</label>
        <div className="flex gap-2"><input id="ai-manual-model" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-w-0 flex-1 font-mono" value={manualModel} onChange={e => setManualModel(e.target.value)} />
          <Button variant="secondary" size="lg" disabled={!manualModel.trim()} onClick={() => {
            const model = manualModel.trim()
            updateAiPostProcessConfig({ availableModels: [...new Set([...(cfg.availableModels || []), model])], selectedModels: [...new Set([...selected, model])], ...(!effectiveDefault ? { defaultModel: model, model } : {}) })
            setManualModel('')
          }}>{pick('添加', 'Add', '추가')}</Button></div>
        <label htmlFor="ai-vision-models" className="block text-xs font-medium text-muted-foreground">{pick('已确认支持图片的模型（逗号分隔）', 'Confirmed vision models (comma separated)', '이미지 지원 확인 모델 (쉼표 구분)')}</label>
        <input id="ai-vision-models" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono" key={`${cfg.provider}:${(cfg.visionModels || []).join(',')}`} defaultValue={(cfg.visionModels || []).join(', ')} onBlur={e => updateAiPostProcessConfig({ visionModels: [...new Set(e.target.value.split(',').map(m => m.trim()).filter(Boolean))] })} />
        <p className="text-xs text-muted-foreground">{pick('Codex 根据模型能力填充；API 模型请根据服务说明确认。读取模型列表不代表已通过图文调用。', 'Codex supplies model capabilities; confirm API vision support with your provider. A model list is not an image test.', 'Codex 기능은 자동 입력됩니다. API 이미지 지원은 공급자에 확인하세요.')}</p>
      </fieldset>

      {/* Model list */}
      {(cfg.availableModels?.length ?? 0) > 0 && (
        <section className="workspace-panel-muted p-4 space-y-3">
          <label className="text-sm font-medium leading-none flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            {pick('可用模型', 'Available Models', '사용 가능한 모델')}
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {selected.length}/{cfg.availableModels!.length} {pick('已选', 'selected', '선택됨')}
            </span>
          </label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder={pick('搜索模型...', 'Search models...', '모델 검색...')}
              className="flex h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-input divide-y divide-border">
            {filteredModels.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {pick('无匹配模型', 'No matching models', '일치하는 모델 없음')}
              </div>
            )}
            {filteredModels.map((modelId) => {
              const isSelected = selected.includes(modelId)
              const isDefault = effectiveDefault === modelId
              return (
                <div
                  key={modelId}
                  className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-muted/50 ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => toggleModelSelected(modelId)}
                >
                  <div
                    className={`flex-shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>

                  <span className={`flex-1 truncate font-mono text-xs ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {modelId}
                  </span>

                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDefaultModel(modelId)
                      }}
                      title={pick('设为默认模型', 'Set as default', '기본 모델로 지정')}
                      className={`flex-shrink-0 p-1 rounded transition-colors ${
                        isDefault
                          ? 'text-yellow-500'
                          : 'text-muted-foreground/40 hover:text-yellow-500'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {effectiveDefault && (
            <p className="text-xs text-muted-foreground">
              {pick('默认模型：', 'Default: ', '기본 모델: ')}
              <span className="font-mono text-foreground">{effectiveDefault}</span>
            </p>
          )}
        </section>
      )}

      {/* Feature model assignment */}
      {selected.length > 0 && (
        <section className="workspace-panel-muted p-4 space-y-3">
          <label className="text-sm font-medium leading-none flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            {pick('功能模型分配', 'Model Assignment', '기능별 모델 지정')}
          </label>
          <p className="text-xs text-muted-foreground">
            {pick(
              '为每个 AI 功能指定模型，留空则使用默认模型',
              'Assign a model per feature, or leave empty to use default',
              'AI 기능별로 모델을 지정하세요. 비워 두면 기본 모델을 사용합니다',
            )}
          </p>

          <div className="space-y-2">
            {AI_FEATURES.map(({ key, labelZh, labelEn, labelKo }) => {
              const assigned = cfg.modelAssignment?.[key] || ''
              return (
                <div key={key} className="p-3 rounded-lg bg-muted/50 space-y-2">
                  <span className="text-sm font-medium">
                    {pick(labelZh, labelEn, labelKo)}
                  </span>
                  <ModelDropdown
                    value={assigned}
                    onChange={(v) => setFeatureModel(key, v)}
                    models={selected}
                    defaultModel={effectiveDefault}
                    pick={pick}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Prompt language */}
      <section className="workspace-panel-muted p-4 space-y-3">
        <label className="text-xs font-medium text-muted-foreground">{t.settings.aiPromptLanguage}</label>
        <div className="flex gap-2">
          {PROMPT_LANGUAGE_OPTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => updateAiPostProcessConfig({ promptLanguage: id })}
              className={`flex-1 h-9 px-3 text-sm font-medium rounded-md transition-all ${
                (cfg.promptLanguage || 'zh') === id
                  ? 'bg-primary/10 text-primary border-2 border-primary ring-2 ring-primary/20'
                  : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Text source preference */}
      <section className="workspace-panel-muted p-4 space-y-3">
        <label className="text-sm font-medium leading-none flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          {t.settings.aiTextSourceTitle}
        </label>
        <p className="text-xs text-muted-foreground">{t.settings.aiTextSourceDesc}</p>
        <div className="flex gap-2">
          {(['auto', 'original', 'corrected'] as const).map((opt) => {
            const labels = {
              auto: { label: t.settings.aiTextSourceAuto, desc: t.settings.aiTextSourceAutoDesc },
              original: { label: t.settings.aiTextSourceOriginal, desc: t.settings.aiTextSourceOriginalDesc },
              corrected: { label: t.settings.aiTextSourceCorrected, desc: t.settings.aiTextSourceCorrectedDesc },
            }
            const active = (cfg.preferCorrectedText || 'auto') === opt
            return (
              <button
                key={opt}
                onClick={() => updateAiPostProcessConfig({ preferCorrectedText: opt })}
                className={`flex-1 h-9 px-3 text-sm font-medium rounded-md transition-all ${
                  active
                    ? 'bg-primary/10 text-primary border-2 border-primary ring-2 ring-primary/20'
                    : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                }`}
                title={labels[opt].desc}
              >
                {labels[opt].label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Streaming mode */}
      <section className="workspace-panel-muted p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium leading-none flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            {pick('AI 流式输出', 'AI Streaming Output', 'AI 스트리밍 출력')}
          </label>
          <Switch
            checked={cfg.enableStreaming !== false}
            onChange={(enableStreaming) => updateAiPostProcessConfig({ enableStreaming })}
            aria-label={pick('AI 流式输出', 'AI Streaming Output', 'AI 스트리밍 출력')}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {pick(
            '启用后 AI 对话回复将逐字显示，体验更流畅。关闭后等待完整回复后一次性显示。',
            'When enabled, AI chat responses stream in token by token for a smoother experience. When disabled, the full response is shown at once.',
            '켜면 AI 대화 답변이 한 글자씩 표시되어 더 자연스럽습니다. 끄면 답변이 완성된 뒤 한 번에 표시됩니다.',
          )}
        </p>
      </section>

      {/* Correction mode */}
      <section className="workspace-panel-muted p-4 space-y-3">
        <label className="text-sm font-medium leading-none flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          {pick('AI 纠错模式', 'AI Correction Mode', 'AI 교정 방식')}
        </label>
        <p className="text-xs text-muted-foreground">
          {pick(
            '选择 AI 纠错的工作方式。直接纠错会一次性输出修改后全文；先检测后纠错会先列出问题清单供你确认。',
            'Choose how AI correction works. Quick mode outputs corrected text directly; Review mode lists issues for confirmation first.',
            'AI 교정 방식을 선택하세요. 바로 교정은 수정된 전문을 한 번에 출력하고, 검토 후 교정은 문제 목록을 먼저 보여 줍니다.',
          )}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => updateAiPostProcessConfig({ correctionMode: 'quick' })}
            className={`flex-1 h-9 px-3 text-sm font-medium rounded-md transition-all ${
              (cfg.correctionMode || 'quick') === 'quick'
                ? 'bg-primary/10 text-primary border-2 border-primary ring-2 ring-primary/20'
                : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {pick('直接纠错', 'Quick Fix', '바로 교정')}
          </button>
          <button
            onClick={() => updateAiPostProcessConfig({ correctionMode: 'review' })}
            className={`flex-1 h-9 px-3 text-sm font-medium rounded-md transition-all ${
              (cfg.correctionMode || 'quick') === 'review'
                ? 'bg-primary/10 text-primary border-2 border-primary ring-2 ring-primary/20'
                : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {pick('先检测后纠错', 'Review & Fix', '검토 후 교정')}
          </button>
        </div>
      </section>
    </div>
  )
}

function ModelDropdown({
  value,
  onChange,
  models,
  defaultModel,
  pick,
}: {
  value: string
  onChange: (v: string) => void
  models: string[]
  defaultModel: string
  pick: Pick
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const displayText = value
    ? value
    : pick(
        `使用默认${defaultModel ? ` · ${defaultModel}` : ''}`,
        `Use default${defaultModel ? ` · ${defaultModel}` : ''}`,
        `기본값 사용${defaultModel ? ` · ${defaultModel}` : ''}`,
      )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 h-9 rounded-md border px-3 text-sm transition-colors ${
          open
            ? 'border-ring ring-2 ring-ring/20 bg-background'
            : 'border-input bg-background hover:bg-accent/50'
        }`}
      >
        <span className={`truncate ${value ? 'font-mono text-foreground' : 'text-muted-foreground'}`}>
          {displayText}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                !value ? 'bg-primary/5 text-primary' : 'text-foreground'
              }`}
            >
              <Check className={`w-3.5 h-3.5 shrink-0 ${!value ? 'opacity-100' : 'opacity-0'}`} />
              <span className="truncate">
                {pick('使用默认模型', 'Use default model', '기본 모델 사용')}
                {defaultModel && (
                  <span className="text-muted-foreground font-mono ml-1 text-xs">({defaultModel})</span>
                )}
              </span>
            </button>

            <div className="mx-2 my-1 border-t border-border" />

            {models.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(m); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-mono transition-colors hover:bg-accent ${
                  value === m ? 'bg-primary/5 text-primary' : 'text-foreground'
                }`}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${value === m ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{m}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
