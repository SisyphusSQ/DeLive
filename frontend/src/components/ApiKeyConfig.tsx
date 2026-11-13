import { useConfirmation } from '../hooks/useConfirmation'
import { DEFAULT_ASR_VENDOR } from '../types/asr/common'
import { FileStorageSettings } from './settings/FileStorageSettings'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Settings, Check, Volume2, Palette, Bot, Globe, Cloud, HardDrive, Info } from 'lucide-react'
import { Button } from './ui'
import { setSettingsLeaveGuard, useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { useTagStore } from '../stores/tagStore'
import { useTopicStore } from '../stores/topicStore'
import {
  exportAllData,
  getBackupValidationErrors,
  validateBackupData,
  importDataOverwrite,
  importDataMerge,
  type BackupData,
} from '../utils/storage'
import { ServiceSettingsPanel } from './settings/ServiceSettingsPanel'
import { AppearancePanel } from './settings/AppearancePanel'
import { AiPostProcessPanel } from './settings/AiPostProcessPanel'
import { OpenApiPanel } from './settings/OpenApiPanel'
import { CloudBackupPanel } from './settings/CloudBackupPanel'
import { DataManagementPanel } from './settings/DataManagementPanel'
import { AboutPanel } from './settings/AboutPanel'
import { ActionDialog } from './ActionDialog'
import type { ASRProviderInfo, ProviderConfigData } from '../types'
import { getMissingRequiredConfigLabels } from '../utils/providerConfig'
import {
  buildProviderConfigFromFormState,
  buildProviderFormState,
  formatStringArrayValue,
  type ProviderFormState,
} from '../utils/providerConfigForm'
import { testProviderConfig } from '../utils/providerConfigTest'
import { getDefaultSettings } from '../utils/storageShared'

type SettingsGroup = 'provider' | 'fileStorage' | 'appearance' | 'aiPostProcess' | 'openApi' | 'cloudBackup' | 'dataManagement' | 'about'

interface ApiKeyConfigProps {
  isOpen: boolean
  onClose: (saved?: boolean) => void
  mode?: 'modal' | 'view'
  onViewChangelog?: () => void
}

const NAV_ITEMS: { id: SettingsGroup; icon: typeof Settings; labelKey: string }[] = [
  { id: 'provider', icon: Volume2, labelKey: 'groupProvider' },
  { id: 'fileStorage', icon: Cloud, labelKey: '火山文件存储' },
  { id: 'aiPostProcess', icon: Bot, labelKey: 'groupAi' },
  { id: 'appearance', icon: Palette, labelKey: 'groupAppearance' },
  { id: 'openApi', icon: Globe, labelKey: 'groupOpenApi' },
  { id: 'cloudBackup', icon: Cloud, labelKey: 'groupCloudBackup' },
  { id: 'dataManagement', icon: HardDrive, labelKey: 'groupDataManagement' },
  { id: 'about', icon: Info, labelKey: 'groupAbout' },
]

export function ApiKeyConfig({ isOpen, onClose, mode = 'modal', onViewChangelog }: ApiKeyConfigProps) {
  const isViewMode = mode === 'view'
  const { t, language, setLanguage, colorTheme, setColorTheme, settingsOrigin, settingsProviderId, settingsSection } = useUIStore()
  const {
    settings,
    updateSettings,
    updateAiPostProcessConfig,
    updateOpenApiConfig,
    updateCloudBackupConfig,
    availableProviders,
    updateProviderConfig,
  } = useSettingsStore()
  const { loadSessions } = useSessionStore()
  const { loadTags } = useTagStore()
  const loadTopics = useTopicStore(state => state.loadTopics)

  const [storageDirty, setStorageDirty] = useState(false)
  const [storageSaving, setStorageSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const { confirm, dialog } = useConfirmation()
  const [activeGroup, setActiveGroup] = useState<SettingsGroup>(settingsSection)


  const savedVendor = settingsProviderId || settings.currentVendor || DEFAULT_ASR_VENDOR
  const makeCurrent = !settingsProviderId || settingsOrigin === 'live'
  const [currentVendor, selectVendor] = useState(savedVendor)
  const currentProvider = availableProviders.find(p => p.id === currentVendor)
  const currentStoredConfig = settings.providerConfigs?.[currentVendor]

  const [formState, setFormState] = useState<ProviderFormState>(() => (
    buildProviderFormState(currentProvider, currentStoredConfig, settings)
  ))
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({})
  const [languageHints, setLanguageHints] = useState(() => (
    formatStringArrayValue(currentStoredConfig?.languageHints, settings.languageHints || ['zh', 'en'])
  ))
  const [aiPostProcessConfig, setAiPostProcessConfig] = useState(
    settings.aiPostProcess || getDefaultSettings().aiPostProcess || {},
  )

  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pendingImportData, setPendingImportData] = useState<{ data: BackupData } | null>(null)
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'error'>('idle')
  const [appVersion, setAppVersion] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supportsAutoLaunch = !!window.electronAPI?.supportsAutoLaunch
  const supportsAutoUpdate = !!window.electronAPI?.supportsAutoUpdate

  const snapshotRef = useRef({ formState, languageHints, aiPostProcessConfig })

  useEffect(() => {
    const newFormState = buildProviderFormState(currentProvider, currentStoredConfig, settings)
    const newLanguageHints = formatStringArrayValue(currentStoredConfig?.languageHints, settings.languageHints || ['zh', 'en'])
    const newAiConfig = settings.aiPostProcess || getDefaultSettings().aiPostProcess || {}
    setFormState(newFormState)
    setLanguageHints(newLanguageHints)
    setAiPostProcessConfig(newAiConfig)
    setRevealedFields({})
    setTestStatus('idle')
    setTestMessage('')
    snapshotRef.current = { formState: newFormState, languageHints: newLanguageHints, aiPostProcessConfig: newAiConfig }
  }, [currentProvider, currentStoredConfig, settings])

  useEffect(() => {
    setActiveGroup(settingsSection)
    selectVendor(savedVendor)
    const saved = snapshotRef.current
    setFormState(saved.formState)
    setLanguageHints(saved.languageHints)
    setAiPostProcessConfig(saved.aiPostProcessConfig)
  }, [settingsSection, savedVendor])

  const snap = snapshotRef.current
  const fieldsDirty = JSON.stringify(formState) !== JSON.stringify(snap.formState) ||
    languageHints !== snap.languageHints ||
    JSON.stringify(aiPostProcessConfig) !== JSON.stringify(snap.aiPostProcessConfig)
  const isDirty = fieldsDirty || (makeCurrent && currentVendor !== savedVendor)

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      if (window.electronAPI.supportsAutoLaunch) {
        window.electronAPI.getAutoLaunch?.().then(setAutoLaunch).catch(() => {
          setAutoLaunch(false)
        })
      } else {
        setAutoLaunch(false)
      }
      window.electronAPI.getAppVersion?.().then(setAppVersion)
    }
  }, [isOpen])

  const handleAutoLaunchChange = async (enable: boolean) => {
    if (!window.electronAPI?.setAutoLaunch || !supportsAutoLaunch) return
    try {
      const result = await window.electronAPI.setAutoLaunch(enable)
      setAutoLaunch(result)
    } catch (error) {
      console.error('Failed to set auto launch:', error)
    }
  }

  useEffect(() => {
    const api = window.electronAPI
    if (!supportsAutoUpdate || !api) return
    const cleanups = [
      api.onUpdateAvailable(() => setUpdateStatus('available')),
      api.onUpdateNotAvailable(() => setUpdateStatus('not-available')),
      api.onUpdateError(() => setUpdateStatus('error')),
    ]
    return () => cleanups.forEach(cleanup => cleanup())
  }, [supportsAutoUpdate])

  const handleCheckUpdate = useCallback(async () => {
    if (!window.electronAPI?.checkForUpdates) return
    setUpdateStatus('checking')
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (result.error) setUpdateStatus('error')
    } catch { setUpdateStatus('error') }
  }, [])

  const updateFormField = (fieldKey: string, value: string | boolean) => {
    setFormState(prev => ({ ...prev, [fieldKey]: value }))
    if (testStatus !== 'idle' || testMessage) {
      setTestStatus('idle')
      setTestMessage('')
    }
  }

  const toggleFieldVisibility = (fieldKey: string) => {
    setRevealedFields(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))
  }

  const getStringFieldValue = (fieldKey: string): string => {
    const value = formState[fieldKey]
    return typeof value === 'string' ? value : ''
  }

  const getBooleanFieldValue = (fieldKey: string): boolean => {
    return Boolean(formState[fieldKey])
  }

  const buildEditableProviderConfig = (): ProviderConfigData => (
    buildProviderConfigFromFormState(currentProvider, formState, languageHints)
  )

  const getProviderConsoleUrl = (provider: ASRProviderInfo | undefined): string => {
    switch (provider?.id) {
      case 'volc': return 'https://console.volcengine.com/speech/app'
      case 'local_openai': return 'https://platform.openai.com/docs/api-reference/audio'
      default: return provider?.website || '#'
    }
  }

  const handleTestConfig = async () => {
    if (!currentProvider?.capabilities.supportsConfigTest) return
    setTestStatus('testing')
    setTestMessage('')
    try {
      const providerConfig = buildEditableProviderConfig()
      const missingLabels = getMissingRequiredConfigLabels(currentProvider, providerConfig)
      if (missingLabels.length > 0) {
        throw new Error(`Please fill: ${missingLabels.join(', ')}`)
      }
      await testProviderConfig(currentProvider, providerConfig)
      setTestStatus('success')
      setTestMessage(t.settings?.testSuccess || 'Configuration verified!')
      setTimeout(() => { setTestStatus('idle'); setTestMessage('') }, 3000)
    } catch (error) {
      setTestStatus('error')
      setTestMessage(error instanceof Error ? error.message : 'Verification failed')
    }
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setTestMessage('')
    try { await saveSection() } finally { setSaving(false) }
  }

  const saveSection = async () => {
    if (activeGroup === 'aiPostProcess') {
      try { await updateAiPostProcessConfig(aiPostProcessConfig); onClose(true) }
      catch (error) { setTestStatus('error'); setTestMessage((error as Error).message) }
      return
    }
    const providerConfig = buildEditableProviderConfig()
    const missingLabels = getMissingRequiredConfigLabels(currentProvider, providerConfig)
    if (missingLabels.length > 0) {
      setTestStatus('error')
      setTestMessage(`Please fill: ${missingLabels.join(', ')}`)
      return
    }
    try { await updateProviderConfig(currentVendor, providerConfig, makeCurrent) }
    catch (error) { setTestStatus('error'); setTestMessage((error as Error).message); return }
    onClose(true)
  }

  const handleExport = async () => {
    try {
      await exportAllData()
      setImportMessage({ type: 'success', text: t.settings.dataExported })
      setTimeout(() => setImportMessage(null), 3000)
    } catch {
      setImportMessage({ type: 'error', text: t.settings.importFailed })
    }
  }

  const handleImportClick = () => { fileInputRef.current?.click() }

  const handleExportDiagnostics = async () => {
    if (!window.electronAPI?.exportDiagnostics) return
    const settingsData = { ...settings } as Record<string, unknown>
    const localStorageKeys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) localStorageKeys.push(key)
    }
    const result = await window.electronAPI.exportDiagnostics({ settings: settingsData, localStorageKeys })
    if (result.success) {
      setImportMessage({ type: 'success', text: t.settings.diagnosticsExported })
      setTimeout(() => setImportMessage(null), 3000)
    } else if (result.reason !== 'cancelled') {
      setImportMessage({ type: 'error', text: `${t.settings.diagnosticsExportFailed}: ${result.reason}` })
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const validationErrors = getBackupValidationErrors(data)
      if (!validateBackupData(data)) {
        setImportMessage({
          type: 'error',
          text: validationErrors.length > 0
            ? `${t.settings.invalidBackupFile}: ${validationErrors[0]}`
            : t.settings.invalidBackupFile,
        })
        return
      }
      setPendingImportData({ data })
    } catch (error) {
      const message = error instanceof SyntaxError
        ? `${t.settings.invalidBackupFile}: invalid JSON`
        : error instanceof Error ? error.message : t.settings.importFailed
      setImportMessage({ type: 'error', text: message })
    }
    e.target.value = ''
  }

  const handleApplyImport = useCallback(async (importMode: 'overwrite' | 'merge') => {
    if (!pendingImportData) return
    try {
      if (importMode === 'overwrite') {
        const result = await importDataOverwrite(pendingImportData.data)
        setImportMessage({ type: 'success', text: t.settings.importedOverwrite(result.sessions, result.tags) })
      } else {
        const result = await importDataMerge(pendingImportData.data)
        setImportMessage({ type: 'success', text: t.settings.importedMerge(result.newSessions, result.newTags) })
      }
      await loadSessions()
      loadTags()
      loadTopics()
    } catch (error) {
      setImportMessage({ type: 'error', text: error instanceof Error ? error.message : t.settings.importFailed })
    } finally {
      setPendingImportData(null)
    }
  }, [loadSessions, loadTags, loadTopics, pendingImportData, t.settings])

  const askLeave = () => saving || storageSaving ? Promise.resolve(false) : isDirty || storageDirty
    ? confirm('放弃尚未保存的设置修改？') : Promise.resolve(true)

  useEffect(() => {
    if (isOpen && isViewMode) return setSettingsLeaveGuard(askLeave)
  })

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-modal="true"]:not([aria-labelledby="settings-dialog-title"])')) return
      if (isViewMode) onClose()
      else void askLeave().then(confirmed => { if (confirmed) onClose() })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  if (!isOpen && !isViewMode) return null

  const settingsContent = (
    <div className="settings-workspace flex h-full min-h-0 flex-col">
      {dialog}
      <header className="settings-page-heading app-page-heading">
        <div><h1 id={isViewMode ? undefined : "settings-dialog-title"}>{t.common.settings}</h1><p>{t.workspace.settingsHint}</p></div>
        {settingsOrigin && <Button variant="ghost" size="sm" onClick={() => onClose()}>{({ live: "返回录制", file: "返回文件转写", review: "返回会议继续", topics: "返回主题" })[settingsOrigin]}</Button>}
      </header>
      <div className="settings-workspace-layout flex min-h-0 flex-1">
      {/* Left navigation */}
      <nav aria-label={t.common.settings} className="settings-workspace-nav w-40 shrink-0 space-y-1 overflow-y-auto border-r border-border/40 p-2">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon
          const label = (t.settings as unknown as Record<string, string>)?.[item.labelKey] ?? item.labelKey
          const active = activeGroup === item.id
          return (
            <button
              key={item.id}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (activeGroup === item.id) return
                void askLeave().then(confirmed => {
                  if (!confirmed) return
                  if (isDirty) {
                    selectVendor(savedVendor)
                    setFormState(snapshotRef.current.formState)
                    setLanguageHints(snapshotRef.current.languageHints)
                    setAiPostProcessConfig(snapshotRef.current.aiPostProcessConfig)
                  }
                  useUIStore.setState({ settingsSection: item.id })
                  setActiveGroup(item.id)
                })
              }}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }
              `}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </nav>

      {/* Right content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div key={activeGroup} className="settings-page-scroll flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="settings-page-fields mx-auto space-y-6">
            {activeGroup === 'fileStorage' && <FileStorageSettings onDirty={setStorageDirty} onSaving={setStorageSaving} />}
            {activeGroup === 'provider' && (
              <ServiceSettingsPanel
                t={t}
                selectedVendor={currentVendor}
                onSelectProvider={vendorId => {
                  if (vendorId === currentVendor) return
                  if (!fieldsDirty) selectVendor(vendorId)
                  else void askLeave().then(confirmed => { if (confirmed) selectVendor(vendorId) })
                }}
                currentProvider={currentProvider}
                languageHints={languageHints}
                onLanguageHintsChange={(value) => {
                  setLanguageHints(value)
                  if (testStatus !== 'idle' || testMessage) {
                    setTestStatus('idle')
                    setTestMessage('')
                  }
                }}
                getProviderConsoleUrl={getProviderConsoleUrl}
                updateFormField={updateFormField}
                getStringFieldValue={getStringFieldValue}
                getBooleanFieldValue={getBooleanFieldValue}
                revealedFields={revealedFields}
                toggleFieldVisibility={toggleFieldVisibility}
                buildEditableProviderConfig={buildEditableProviderConfig}
                onRunConfigTest={handleTestConfig}
                testStatus={testStatus}
                testMessage={testMessage}
                onBundledRuntimePatch={(patch) => {
                  for (const [key, value] of Object.entries(patch)) {
                    if (typeof value === 'boolean') updateFormField(key, value)
                    else if (typeof value === 'number') updateFormField(key, String(value))
                    else if (typeof value === 'string') updateFormField(key, value)
                  }
                }}
              />
            )}

            {activeGroup === 'appearance' && (
              <AppearancePanel
                t={t}
                language={language}
                setLanguage={setLanguage}
                colorTheme={colorTheme}
                setColorTheme={setColorTheme}
              />
            )}


            {activeGroup === 'aiPostProcess' && (
              <AiPostProcessPanel
                t={t}
                language={language}
                aiPostProcessConfig={aiPostProcessConfig}
                updateAiPostProcessConfig={(patch) => {
                  setAiPostProcessConfig((prev) => ({ ...prev, ...patch }))
                }}
              />
            )}

            {activeGroup === 'openApi' && (
              <OpenApiPanel
                t={t}
                openApiConfig={settings.openApi || { enabled: false, token: '' }}
                updateOpenApiConfig={updateOpenApiConfig}
              />
            )}

            {activeGroup === 'cloudBackup' && (
              <CloudBackupPanel
                t={t}
                cloudBackupConfig={settings.cloudBackup || { enabled: false, provider: 's3' }}
                updateCloudBackupConfig={updateCloudBackupConfig}
              />
            )}

            {activeGroup === 'dataManagement' && (
              <DataManagementPanel
                t={t}
                handleExport={handleExport}
                handleImportClick={handleImportClick}
                fileInputRef={fileInputRef}
                handleFileChange={handleFileChange}
                importMessage={importMessage}
                handleExportDiagnostics={handleExportDiagnostics}
              />
            )}

            {activeGroup === 'about' && (
              <AboutPanel
                t={t}
                language={language}
                settings={settings}
                updateSettings={updateSettings}
                supportsAutoLaunch={supportsAutoLaunch}
                autoLaunch={autoLaunch}
                handleAutoLaunchChange={handleAutoLaunchChange}
                supportsAutoUpdate={supportsAutoUpdate}
                appVersion={appVersion}
                updateStatus={updateStatus}
                handleCheckUpdate={handleCheckUpdate}
                onViewChangelog={onViewChangelog}
              />
            )}
          </div>
        </div>

        {/* Save bar — only shown for groups that need manual save */}
        {(activeGroup === 'provider' || activeGroup === 'aiPostProcess') && (
          <div className="settings-save-bar flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/30 px-3 py-2 sm:px-6">
            {testStatus === 'error' && <p role="alert" className="mr-auto text-sm text-destructive">{testMessage}</p>}
            {isDirty && (
              <span className="mr-auto text-xs text-warning font-medium">
                {t.electron.unsavedChanges}
              </span>
            )}
            <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
              <Check className="w-4 h-4" />
              {t.common.save}
            </Button>
          </div>
        )}
      </div>

      </div>
      <ActionDialog
        open={pendingImportData !== null}
        title={t.electron.chooseImportMode}
        description={pendingImportData
          ? t.settings.importConfirm(pendingImportData.data.sessions.length, pendingImportData.data.tags.length)
          : ''
        }
        onClose={() => setPendingImportData(null)}
        actions={[
          { label: t.common.cancel, onClick: () => setPendingImportData(null), variant: 'secondary' },
          { label: t.electron.mergeImport, onClick: () => void handleApplyImport('merge'), variant: 'secondary' },
          { label: t.electron.overwriteImport, onClick: () => void handleApplyImport('overwrite'), variant: 'primary' },
        ]}
      />
    </div>
  )

  if (isViewMode) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-card text-card-foreground">
        {settingsContent}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/60 animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="mx-4 flex h-[min(92vh,58rem)] w-full max-w-[min(78rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl dark:ring-1 dark:ring-white/[0.08] animate-in zoom-in-95 duration-200"
      >
        {settingsContent}
      </div>
    </div>
  )
}
