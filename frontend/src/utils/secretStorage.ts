import type { AppSettings } from '../types'
import { getSettings, saveSettings } from './settingsStorage'

export const SAFE_STORAGE_PLACEHOLDER = '{{SAFE_STORAGE}}'

function safeStorageKeyFor(path: string): string {
  return `provider_secret_${path}`
}

export async function migrateApiKeysToSafeStorage(source?: AppSettings): Promise<void> {
  const settings = source ? structuredClone(source) : getSettings()
  const migrationErrors: string[] = []
  let migratedRequiredSecrets = false
  const aiKey = settings.aiPostProcess?.apiKey
  if (aiKey && aiKey !== SAFE_STORAGE_PLACEHOLDER) {
    migratedRequiredSecrets = true
    try {
      settings.aiPostProcess = { ...settings.aiPostProcess, apiKey: await encryptApiKeyForStorage('ai_postprocess', aiKey) }
    } catch {
      settings.aiPostProcess = { ...settings.aiPostProcess, apiKey: '' }
      migrationErrors.push('AI 旧密钥无法加密：已移除磁盘明文，仅当前运行可用；请恢复系统安全存储后重新保存')
    }
  }
  const volc = settings.providerConfigs?.volc
  if (volc && ['apiKey', 'appKey', 'accessKey'].some(k => typeof volc[k] === 'string' && volc[k] && volc[k] !== SAFE_STORAGE_PLACEHOLDER)) {
    migratedRequiredSecrets = true
    try {
      await storeVolcSecrets(volc)
      for (const key of ['apiKey', 'appKey', 'accessKey']) if (volc[key]) volc[key] = SAFE_STORAGE_PLACEHOLDER
    } catch {
      for (const key of ['apiKey', 'appKey', 'accessKey']) if (volc[key] !== SAFE_STORAGE_PLACEHOLDER) volc[key] = ''
      migrationErrors.push('火山旧凭据无法加密：已移除磁盘明文，仅当前运行可用；请在系统安全存储恢复后重新保存配置')
    }
  }
  if (migratedRequiredSecrets) saveSettings(settings)
  if (migrationErrors.length) throw new Error(migrationErrors.join('；'))
  if (!window.electronAPI?.safeStorageAvailable) return
  const available = await window.electronAPI.safeStorageAvailable()
  if (!available) return

  let changed = false

  if (settings.apiKey && settings.apiKey !== SAFE_STORAGE_PLACEHOLDER) {
    const stored = await window.electronAPI.safeStorageSet(
      safeStorageKeyFor('legacy_apiKey'),
      settings.apiKey,
    )
    if (stored) {
      settings.apiKey = SAFE_STORAGE_PLACEHOLDER
      changed = true
    }
  }

  if (settings.providerConfigs) {
    for (const [vendorId, config] of Object.entries(settings.providerConfigs)) {
      if (
        config.apiKey
        && typeof config.apiKey === 'string'
        && config.apiKey !== SAFE_STORAGE_PLACEHOLDER
      ) {
        const stored = await window.electronAPI.safeStorageSet(
          safeStorageKeyFor(vendorId),
          config.apiKey,
        )
        if (stored) {
          config.apiKey = SAFE_STORAGE_PLACEHOLDER
          changed = true
        }
      }
    }
  }

  if (
    settings.cloudBackup?.s3?.secretAccessKey
    && typeof settings.cloudBackup.s3.secretAccessKey === 'string'
    && settings.cloudBackup.s3.secretAccessKey !== SAFE_STORAGE_PLACEHOLDER
  ) {
    const stored = await window.electronAPI.safeStorageSet(
      safeStorageKeyFor('cloud_backup_s3'),
      settings.cloudBackup.s3.secretAccessKey,
    )
    if (stored) {
      settings.cloudBackup = {
        ...settings.cloudBackup,
        s3: { ...settings.cloudBackup.s3, secretAccessKey: SAFE_STORAGE_PLACEHOLDER },
      }
      changed = true
    }
  }

  if (
    settings.cloudBackup?.webdav?.password
    && typeof settings.cloudBackup.webdav.password === 'string'
    && settings.cloudBackup.webdav.password !== SAFE_STORAGE_PLACEHOLDER
  ) {
    const stored = await window.electronAPI.safeStorageSet(
      safeStorageKeyFor('cloud_backup_webdav'),
      settings.cloudBackup.webdav.password,
    )
    if (stored) {
      settings.cloudBackup = {
        ...settings.cloudBackup,
        webdav: { ...settings.cloudBackup.webdav, password: SAFE_STORAGE_PLACEHOLDER },
      }
      changed = true
    }
  }

  if (changed) {
    saveSettings(settings)
  }
}

export async function resolveApiKeysFromSafeStorage(
  settings: AppSettings,
): Promise<AppSettings> {
  if (!window.electronAPI?.safeStorageGet) return settings

  const resolved = { ...settings }

  if (resolved.apiKey === SAFE_STORAGE_PLACEHOLDER) {
    const value = await window.electronAPI.safeStorageGet(safeStorageKeyFor('legacy_apiKey'))
    if (value) {
      resolved.apiKey = value
    }
  }

  if (resolved.providerConfigs) {
    resolved.providerConfigs = { ...resolved.providerConfigs }
    for (const [vendorId, config] of Object.entries(resolved.providerConfigs)) {
      if (config.apiKey === SAFE_STORAGE_PLACEHOLDER) {
        const value = await window.electronAPI.safeStorageGet(safeStorageKeyFor(vendorId))
        if (value || vendorId === 'volc') {
          resolved.providerConfigs[vendorId] = { ...config, apiKey: value || '' }
        }
      }
    }
  }

  if (resolved.aiPostProcess?.apiKey === SAFE_STORAGE_PLACEHOLDER) {
    const value = await window.electronAPI.safeStorageGet(safeStorageKeyFor('ai_postprocess'))
    if (value) {
      resolved.aiPostProcess = {
        ...resolved.aiPostProcess,
        apiKey: value,
      }
    }
  }

  if (resolved.cloudBackup?.s3?.secretAccessKey === SAFE_STORAGE_PLACEHOLDER) {
    const value = await window.electronAPI.safeStorageGet(safeStorageKeyFor('cloud_backup_s3'))
    if (value) {
      resolved.cloudBackup = {
        ...resolved.cloudBackup,
        s3: { ...resolved.cloudBackup.s3, secretAccessKey: value },
      }
    }
  }

  if (resolved.cloudBackup?.webdav?.password === SAFE_STORAGE_PLACEHOLDER) {
    const value = await window.electronAPI.safeStorageGet(safeStorageKeyFor('cloud_backup_webdav'))
    if (value) {
      resolved.cloudBackup = {
        ...resolved.cloudBackup,
        webdav: { ...resolved.cloudBackup.webdav, password: value },
      }
    }
  }

  const volc = resolved.providerConfigs?.volc
  if (volc) {
    const next = { ...volc }
    for (const key of ['appKey', 'accessKey'] as const) {
      if (next[key] === SAFE_STORAGE_PLACEHOLDER) next[key] = await window.electronAPI.safeStorageGet(safeStorageKeyFor('volc_' + key)) || ''
    }
    resolved.providerConfigs = { ...resolved.providerConfigs, volc: next }
  }
  return resolved
}

export async function encryptApiKeyForStorage(
  vendorId: string,
  apiKey: string,
): Promise<string> {
  if (!apiKey || apiKey === SAFE_STORAGE_PLACEHOLDER) return apiKey
  if (vendorId === 'ai_postprocess') {
    if (!window.electronAPI?.safeStorageSet || !await window.electronAPI.safeStorageAvailable()) throw new Error('系统安全存储不可用，AI 密钥未保存')
    if (!await window.electronAPI.safeStorageSet(safeStorageKeyFor(vendorId), apiKey)) throw new Error('AI 密钥加密保存失败')
    return SAFE_STORAGE_PLACEHOLDER
  }
  if (!window.electronAPI?.safeStorageSet) return apiKey

  const available = await window.electronAPI.safeStorageAvailable()
  if (!available) return apiKey

  const stored = await window.electronAPI.safeStorageSet(
    safeStorageKeyFor(vendorId),
    apiKey,
  )
  return stored ? SAFE_STORAGE_PLACEHOLDER : apiKey
}

export async function storeVolcSecrets(config: Record<string, unknown>): Promise<void> {
  const entries = ['apiKey', 'appKey', 'accessKey'].filter(key => typeof config[key] === 'string' && config[key] !== SAFE_STORAGE_PLACEHOLDER)
  if (!entries.length) return
  if (!window.electronAPI?.safeStorageSet || !await window.electronAPI.safeStorageAvailable()) throw new Error('系统安全存储不可用，火山凭据未保存')
  for (const key of entries) {
    if (!await window.electronAPI.safeStorageSet(safeStorageKeyFor(key === 'apiKey' ? 'volc' : 'volc_' + key), config[key] as string)) throw new Error('火山凭据加密保存失败，请重试')
  }
}
