import { DEFAULT_ASR_VENDOR } from '../types/asr/common'
import { Select } from './ui/Select'
import { RecordingStorage } from './RecordingStorage'
import { useEffect, useState } from 'react'
import { useConfirmation } from '../hooks/useConfirmation'
import { fileTaskApi } from '../utils/volcFileApi'
import { getVolcCredentialIssue } from '../stores/settingsStore'
import { FileTaskRow } from './FileTaskRow'
import { useFileTaskStore } from '../stores/fileTaskStore'
import { Mic, Square, Loader2, Settings2, RefreshCw } from 'lucide-react'
import { useRecordingStore } from '../stores/recordingStore'
import { useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { buildProviderConnectConfig, isProviderConfigured } from '../utils/providerConfig'
import { getProviderName } from '../utils/providerI18n'
import { StatusIndicator } from './ui'
import type { ASRVendor } from '../types/asr'

interface RecordingControlsProps {
  reconnectTranscription?: () => Promise<void>
  startRecording: () => void
  stopRecording: () => void
  switchProvider?: (newVendorId: ASRVendor) => Promise<void>
}

export function RecordingControls({ startRecording, stopRecording, switchProvider, reconnectTranscription }: RecordingControlsProps) {
  const { t, openSettings } = useUIStore()
  const hasSource = useRecordingStore(state => state.system || state.microphone)
  const settingsState = useSettingsStore()
  const { settings, availableProviders, updateSettings } = settingsState
  const localOnly = settings.recordingMode === 'audio-only'
  const { confirm, dialog } = useConfirmation()
  const [fileReady, setFileReady] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const jobs = useFileTaskStore(state => state.jobs)
  const lastSession = useSessionStore(state => state.sessions[0])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => fileTaskApi().settings()).then(value => { if (active) setFileReady(value.configured) }).catch(() => { if (active) setFileReady(false) })
    return () => { active = false }
  }, [settings])
  const { recordingState, currentTranscript } = useSessionStore()
  const [showQuickSettings, setShowQuickSettings] = useState(false)

  const currentVendor = settings.currentVendor || DEFAULT_ASR_VENDOR
  const currentProvider = availableProviders.find(p => p.id === currentVendor)
  const currentConfig = settings.providerConfigs?.[currentVendor]
  const normalizedConfig = buildProviderConnectConfig(currentConfig, settings)
  const hasApiKey = isProviderConfigured(currentProvider, normalizedConfig)

  const isIdle = recordingState === 'idle'
  const isRecording = recordingState === 'recording'
  const isStarting = recordingState === 'starting'
  const isStopping = recordingState === 'stopping'
  const isSwitching = recordingState === 'switching'
  const isLoading = isStarting || isStopping || isSwitching


  const configuredProviders = availableProviders.filter(p => {
    const cfg = settings.providerConfigs?.[p.id]
    return isProviderConfigured(p, buildProviderConnectConfig(cfg, settings))
  })
  const canSwitchProvider = configuredProviders.length > 1


  const handleClick = () => {
    if (isIdle) {
      if (!localOnly && !hasApiKey) { openSettings('provider', currentVendor); return }
      startRecording()
    } else if (isRecording) {
      stopRecording()
    }
  }

  return (
    <div className="space-y-3">
      {dialog}
      <fieldset disabled={!isIdle} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">录制模式</legend>
        <div className="flex flex-wrap gap-3">
          {(['audio-only', 'realtime'] as const).map(mode => <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="recording-mode" checked={localOnly === (mode === 'audio-only')} onChange={() => {
              try { updateSettings({ recordingMode: mode }); setPreferenceError('') } catch (error) { setPreferenceError((error as Error).message) }
            }} />{mode === 'audio-only' ? '只录音' : '录音并实时转录'}
          </label>)}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.autoTranscribeAfterRecording === true} onChange={event => {
          const enabled = event.target.checked
          void (async () => {
            if (enabled && !await confirm('启用结束后自动转写？今后正常停止并保存录音后，会将同步混音的临时副本上传至火山标准文件转写，可能计费；完成后清理临时副本，本地原音保留。')) return
            try { updateSettings({ autoTranscribeAfterRecording: enabled }); setPreferenceError('') } catch (error) { setPreferenceError((error as Error).message) }
          })()
        }} />录音结束后自动转写</label>
      </fieldset>
      <p className="text-xs text-muted-foreground">{localOnly ? '只保存原音，不连接实时识别。' : '实时识别失败时，仍继续保存本地原音。'} 会后服务：火山标准文件转写 · {fileReady && !getVolcCredentialIssue(settingsState) ? '已就绪' : '待配置（不影响只录音）'}。</p>
      {settings.autoTranscribeAfterRecording && (!fileReady || getVolcCredentialIssue(settingsState)) && <p className="text-xs text-warning">结束后若配置仍未就绪，将保留原音；可在回顾页补配置后手动转写。</p>}
      {preferenceError && <p role="alert" className="text-sm text-destructive">{preferenceError}</p>}
      {isRecording && !localOnly && reconnectTranscription && <button type="button" className="text-sm underline" onClick={() => void reconnectTranscription()}>重新连接转写（原音继续保存）</button>}
      <RecordingStorage />
      <div className={`flex ${isIdle ? 'flex-col items-center gap-3' : 'items-center gap-5'}`}>
        <div className="flex items-center gap-2">
          <button
            data-settings-entry="recording-provider"
            onClick={handleClick}
            disabled={isLoading || (isIdle && !hasSource)}
            className={`
              relative flex shrink-0 items-center gap-2.5 rounded-full px-6 py-3
              text-sm font-semibold tracking-wide shadow-md
              transition-all duration-200
              disabled:opacity-80 disabled:cursor-not-allowed
              active:scale-[0.97]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              ${isRecording || isSwitching
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 ring-2 ring-destructive/20 animate-glow-pulse-destructive'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 ring-2 ring-primary/20 animate-glow-pulse'
              }
            `}
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
                <span>{t.recording.starting}</span>
              </>
            ) : isStopping ? (
              <>
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
                <span>{t.recording.stopping}</span>
              </>
            ) : isSwitching ? (
              <>
                <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                <span>{t.recording?.switching || 'Switching...'}</span>
              </>
            ) : isRecording ? (
              <>
                <Square className="h-4 w-4 fill-current" />
                <span>{t.recording.stopRecording}</span>
              </>
            ) : (
              <>
                <Mic className="h-4.5 w-4.5" />
                <span>{!localOnly && !hasApiKey ? t.live.goToSettings : t.recording.startRecording}</span>
              </>
            )}
          </button>

          {!localOnly && (isRecording || isSwitching) && canSwitchProvider && (
            <button
              onClick={() => setShowQuickSettings(prev => !prev)}
              disabled={isSwitching}
              className={`
                p-2.5 rounded-full transition-all
                ${showQuickSettings
                  ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              aria-label={t.recording?.quickSettings || 'Quick Settings'}
            >
              <Settings2 className="h-4.5 w-4.5" />
            </button>
          )}
        </div>

        <div className={`text-sm ${isIdle ? 'text-center' : 'min-w-0 flex-1'}`}>
          {isStarting && (
            <p className="flex items-center gap-2 text-warning">
              <StatusIndicator status="starting" />
              {t.recording.selectSource}
            </p>
          )}
          {isSwitching && (
            <p className="flex items-center gap-2 text-info">
              <StatusIndicator status="starting" />
              <span className="font-medium">{t.recording?.switching || 'Switching config...'}</span>
            </p>
          )}
          {isRecording && (
            <div className="flex items-center gap-2 text-success">
              <StatusIndicator status="recording" />
              <span className="font-medium">{t.recording.capturingAudio}</span>
              {!localOnly && !currentTranscript && (
                <span className="text-xs text-muted-foreground">{t.recording.waitingForAudio}</span>
              )}
            </div>
          )}
          {isIdle && !hasSource && <p className="text-warning">请选择至少一个录音来源。</p>}
          {isIdle && hasSource && !localOnly && !hasApiKey && (
            <p className="text-muted-foreground">实时转写需要配置所选服务。仅录音可以直接开始。</p>
          )}
        </div>
      </div>

      {/* Config summary tags (idle state) */}
      {!localOnly && isIdle && hasApiKey && canSwitchProvider && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>{currentProvider ? getProviderName(currentProvider, t) : currentVendor}</span>
        </div>
      )}

      {/* Quick settings panel (recording state) */}
      {!localOnly && showQuickSettings && (isRecording || isSwitching) && (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {t.recording?.quickSettings || 'Quick Settings'}
            </h4>
            <span className="text-xs text-muted-foreground">
              {currentProvider ? getProviderName(currentProvider, t) : currentVendor}
            </span>
          </div>

          {canSwitchProvider && switchProvider && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-foreground shrink-0">
                Provider
              </label>
              <Select
                value={currentVendor}
                onChange={(e) => void switchProvider(e.target.value as ASRVendor)}
                disabled={isSwitching}
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {configuredProviders.map(p => (
                  <option key={p.id} value={p.id}>{getProviderName(p, t)}</option>
                ))}
              </Select>
            </div>
          )}

        </div>
      )}
      {isIdle && jobs.filter(job => job.sessionId === lastSession?.id).map(job => <FileTaskRow key={job.id} job={job} compact />)}
    </div>
  )
}
