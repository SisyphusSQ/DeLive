import { afterEach, expect, it, vi } from 'vitest'
import type { AppSettings } from '../types'
import { encryptApiKeyForStorage, migrateApiKeysToSafeStorage } from './secretStorage'
import { withoutCredentials } from './backupStorage'
const storage = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn() }))
vi.mock('./settingsStorage', () => storage)
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('never falls back to plaintext AI key storage', async () => {
  vi.stubGlobal('window', {})
  await expect(encryptApiKeyForStorage('ai_postprocess', 'test-secret')).rejects.toThrow('安全存储不可用')
  vi.stubGlobal('window', { electronAPI: { safeStorageAvailable: async () => true, safeStorageSet: async () => false } })
  await expect(encryptApiKeyForStorage('ai_postprocess', 'test-secret')).rejects.toThrow('保存失败')
})

it('removes legacy plaintext when the keychain is unavailable and keeps the in-memory input', async () => {
  vi.stubGlobal('window', {})
  const settings = { aiPostProcess: { apiKey: 'test-secret' } } as AppSettings
  await expect(migrateApiKeysToSafeStorage(settings)).rejects.toThrow('移除磁盘明文')
  expect(settings.aiPostProcess?.apiKey).toBe('test-secret')
  expect(storage.saveSettings.mock.calls[0][0].aiPostProcess.apiKey).toBe('')
})

it('encrypts keys and excludes AI credentials and executable paths from exports', async () => {
  const safeStorageSet = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('window', { electronAPI: { safeStorageAvailable: async () => true, safeStorageSet } })
  expect(await encryptApiKeyForStorage('ai_postprocess', 'test-secret')).toBe('{{SAFE_STORAGE}}')
  expect(safeStorageSet).toHaveBeenCalledWith('provider_secret_ai_postprocess', 'test-secret')
  const settings = { aiPostProcess: { apiKey: 'test-secret', codexPath: '/private/codex', model: 'chosen' } } as AppSettings
  expect(withoutCredentials(settings).aiPostProcess).toEqual({ model: 'chosen' })
  expect(settings.aiPostProcess?.apiKey).toBe('test-secret')
})

it('does not lose another provider credential when AI encryption fails during migration', async () => {
  const safeStorageSet = vi.fn(async (key: string) => key !== 'provider_secret_ai_postprocess')
  vi.stubGlobal('window', { electronAPI: { safeStorageAvailable: async () => true, safeStorageSet } })
  const settings = { apiKey: '', languageHints: ['zh'], aiPostProcess: { apiKey: 'test-ai' }, providerConfigs: { volc: { apiKey: 'test-volc' } } } as AppSettings
  await expect(migrateApiKeysToSafeStorage(settings)).rejects.toThrow('AI 旧密钥')
  expect(safeStorageSet).toHaveBeenCalledWith('provider_secret_volc', 'test-volc')
  expect(storage.saveSettings.mock.calls[0][0]).toMatchObject({ aiPostProcess: { apiKey: '' }, providerConfigs: { volc: { apiKey: '{{SAFE_STORAGE}}' } } })
})
