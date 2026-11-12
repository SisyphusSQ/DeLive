import { SAFE_STORAGE_PLACEHOLDER, storeVolcSecrets } from '../utils/secretStorage'
import { aiBaseUrl } from '../../../shared/ai'
import { create } from 'zustand'
import type {
  AiPostProcessConfig,
  AppSettings,
  CloudBackupConfig,
  OpenApiConfig,
  ProviderConfigData,
} from '../types'
import {
  encryptApiKeyForStorage,
  getSettings,
  saveSettings,
  resolveApiKeysFromSafeStorage,
  migrateApiKeysToSafeStorage,
} from '../utils/storage'
import { getDefaultSettings } from '../utils/storageShared'
import { providerRegistry } from '../providers'
import type { ASRProviderInfo, ASRVendor } from '../types/asr'
import { DEFAULT_ASR_VENDOR } from '../types/asr/common'
import { hasVolcCredentials } from '../utils/providerConfig'
import { withOpenApiToken } from '../utils/openApiToken'

export interface SettingsState {
  credentialError?: string
  volcCredentialsLoading: boolean
  volcCredentialsUnreadable: boolean
  settings: AppSettings
  loadSettings: () => Promise<void>
  updateSettings: (settings: Partial<AppSettings>) => void
  updateAiPostProcessConfig: (config: Partial<AiPostProcessConfig>) => Promise<void>
  updateOpenApiConfig: (config: Partial<OpenApiConfig>) => void
  updateCloudBackupConfig: (config: Partial<CloudBackupConfig>) => Promise<void>

  availableProviders: ASRProviderInfo[]
  setCurrentVendor: (vendorId: string) => void
  updateProviderConfig: (vendorId: string, config: Partial<ProviderConfigData>) => Promise<void>
  getProviderConfig: (vendorId: string) => ProviderConfigData | undefined
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  volcCredentialsLoading: true,
  volcCredentialsUnreadable: false,
  settings: {
    languageHints: ['zh', 'en'],
    currentVendor: DEFAULT_ASR_VENDOR,
    providerConfigs: {},
    aiPostProcess: getDefaultSettings().aiPostProcess,
  },
  loadSettings: async () => {
    const settings = getSettings()
    const defaultSettings = getDefaultSettings()
    const merged = {
      ...settings,
      currentVendor: providerRegistry.has(settings.currentVendor as ASRVendor)
        ? settings.currentVendor
        : DEFAULT_ASR_VENDOR,
      providerConfigs: Object.fromEntries(Object.entries(settings.providerConfigs ?? {})
        .filter(([id]) => providerRegistry.has(id as ASRVendor))),
      aiPostProcess: {
        ...defaultSettings.aiPostProcess,
        ...(settings.aiPostProcess || {}),
        baseUrl: aiBaseUrl(settings.aiPostProcess || {}),
      },
      openApi: {
        ...defaultSettings.openApi,
        ...(settings.openApi || {}),
      },
      cloudBackup: {
        ...defaultSettings.cloudBackup,
        ...(settings.cloudBackup || {}),
      },
    }

    if (merged.aiPostProcess.model && !merged.aiPostProcess.defaultModel) {
      merged.aiPostProcess.defaultModel = merged.aiPostProcess.model
    }

    // Older versions allowed the Open API to run without a token.
    const openApiWithToken = withOpenApiToken(merged.openApi)
    if (openApiWithToken !== merged.openApi) {
      merged.openApi = openApiWithToken
      saveSettings(merged)
    }

    set({ settings: merged, volcCredentialsLoading: true })

    if (window.electronAPI) {
      window.electronAPI.apiUpdateOpenApiConfig({
        enabled: !!merged.openApi?.enabled,
        token: merged.openApi?.token || '',
      })
    }

    const storedVolc = merged.providerConfigs.volc
    const hadStoredVolc = Object.values(storedVolc ?? {}).includes(SAFE_STORAGE_PLACEHOLDER)
    try {
      await migrateApiKeysToSafeStorage(merged)
    } catch (error) {
      set({ credentialError: (error as Error).message })
    }
    try {
      const resolved = await resolveApiKeysFromSafeStorage(merged)
      set({ settings: resolved, volcCredentialsUnreadable: hadStoredVolc && !hasVolcCredentials(resolved.providerConfigs?.volc) })
    } catch (error) {
      set({ credentialError: (error as Error).message, volcCredentialsUnreadable: hadStoredVolc })
    } finally {
      set({ volcCredentialsLoading: false })
    }
  },
  updateSettings: (newSettings) => {
    const settings = { ...get().settings, ...newSettings }
    saveSettings(settings)
    set({ settings })
  },
  updateAiPostProcessConfig: async (config) => {
    const { settings } = get()
    const currentConfig = settings.aiPostProcess || {}
    const nextConfig = { ...currentConfig, ...config }
    const encryptedApiKey = typeof nextConfig.apiKey === 'string'
      ? await encryptApiKeyForStorage('ai_postprocess', nextConfig.apiKey)
      : nextConfig.apiKey
    const inMemorySettings = { ...get().settings, aiPostProcess: nextConfig }

    saveSettings({
      ...inMemorySettings,
      aiPostProcess: {
        ...nextConfig,
        apiKey: encryptedApiKey,
      },
    })
    set({ settings: inMemorySettings })
  },
  updateOpenApiConfig: (config) => {
    const { settings } = get()
    const currentConfig = settings.openApi || {}
    const mergedConfig = { ...currentConfig, ...config }
    // Turning the API on without a token would leave it refusing every request.
    const nextConfig = config.enabled && !currentConfig.enabled
      ? withOpenApiToken(mergedConfig)
      : mergedConfig
    const newSettings = { ...settings, openApi: nextConfig }

    saveSettings(newSettings)
    set({ settings: newSettings })

    if (window.electronAPI) {
      window.electronAPI.apiUpdateOpenApiConfig({
        enabled: !!nextConfig.enabled,
        token: nextConfig.token || '',
      })
    }
  },
  updateCloudBackupConfig: async (config) => {
    const { settings } = get()
    const currentConfig = settings.cloudBackup || {}
    const nextConfig = { ...currentConfig, ...config }

    if (config.s3) {
      nextConfig.s3 = { ...(currentConfig.s3 || {}), ...config.s3 } as typeof nextConfig.s3
    }
    if (config.webdav) {
      nextConfig.webdav = { ...(currentConfig.webdav || {}), ...config.webdav } as typeof nextConfig.webdav
    }

    const inMemorySettings = { ...settings, cloudBackup: nextConfig }
    set({ settings: inMemorySettings })

    const storageConfig = { ...nextConfig }
    if (storageConfig.s3?.secretAccessKey) {
      const encrypted = await encryptApiKeyForStorage('cloud_backup_s3', storageConfig.s3.secretAccessKey)
      storageConfig.s3 = { ...storageConfig.s3, secretAccessKey: encrypted ?? '' }
    }
    if (storageConfig.webdav?.password) {
      const encrypted = await encryptApiKeyForStorage('cloud_backup_webdav', storageConfig.webdav.password)
      storageConfig.webdav = { ...storageConfig.webdav, password: encrypted ?? '' }
    }

    saveSettings({ ...inMemorySettings, cloudBackup: storageConfig })
  },

  availableProviders: providerRegistry.getAllProviders(),
  setCurrentVendor: (vendorId) => {
    if (!providerRegistry.has(vendorId as ASRVendor)) return
    const { settings } = get()
    const newSettings = { ...settings, currentVendor: vendorId }
    saveSettings(newSettings)
    set({ settings: newSettings })
  },
  updateProviderConfig: async (vendorId, config) => {
    if (!providerRegistry.has(vendorId as ASRVendor)) throw new Error('不支持此转写服务')
    if (vendorId === 'volc') await storeVolcSecrets(config)
    const { settings } = get()
    const currentConfig = settings.providerConfigs?.[vendorId] || { apiKey: '' }
    const newProviderConfigs = {
      ...settings.providerConfigs,
      [vendorId]: { ...currentConfig, ...config },
    }
    const newSettings = {
      ...settings,
      providerConfigs: newProviderConfigs,
    }
    saveSettings(newSettings)
    set({ settings: newSettings, ...(vendorId === 'volc' ? { volcCredentialsUnreadable: false } : {}) })
  },
  getProviderConfig: (vendorId) => {
    const { settings } = get()
    return settings.providerConfigs?.[vendorId]
  },
}))

export function getVolcCredentialIssue(state: SettingsState): string | undefined {
  if (state.volcCredentialsLoading) return '正在读取火山凭据'
  if (hasVolcCredentials(state.settings.providerConfigs?.volc)) return undefined
  return state.volcCredentialsUnreadable
    ? '已保存的火山凭据无法读取，请重新配置'
    : '请配置火山 API Key 或 APP ID + Access Token'
}
