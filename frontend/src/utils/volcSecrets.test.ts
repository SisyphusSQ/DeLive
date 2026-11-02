import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../types'
const storage = vi.hoisted(() => ({ getSettings: vi.fn(), saveSettings: vi.fn() }))
vi.mock('./settingsStorage', () => storage)
import { migrateApiKeysToSafeStorage, resolveApiKeysFromSafeStorage, storeVolcSecrets } from './secretStorage'
import { withoutVolcCredentials } from './backupStorage'
describe('Volc secrets (synthetic credentials, safe-storage double)', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('encrypts every credential and exports none', async () => {
    const values = new Map<string,string>()
    vi.stubGlobal('window', { electronAPI: { safeStorageAvailable: async () => true,
      safeStorageSet: async (key: string, value: string) => { values.set(key,value); return true },
      safeStorageGet: async (key: string) => values.get(key) } })
    const settings = { providerConfigs: { volc: { apiKey:'fake-key',appKey:'fake-app',accessKey:'fake-token' } } } as unknown as AppSettings
    await migrateApiKeysToSafeStorage(settings)
    const saved = storage.saveSettings.mock.calls[0][0] as AppSettings
    expect(JSON.stringify(saved)).not.toContain('fake-')
    expect((await resolveApiKeysFromSafeStorage(saved)).providerConfigs?.volc).toEqual(settings.providerConfigs?.volc)
    expect(JSON.stringify(withoutVolcCredentials(settings))).not.toContain('fake-')
    vi.unstubAllGlobals()
  })
  it('refuses new plaintext fallback and clears legacy disk plaintext if encryption is unavailable', async () => {
    vi.stubGlobal('window', { electronAPI: { safeStorageAvailable: async () => false, safeStorageSet: vi.fn() } })
    await expect(storeVolcSecrets({ apiKey:'fake-key' })).rejects.toThrow('安全存储不可用')
    const settings = { providerConfigs: { volc: { appKey:'fake-app',accessKey:'fake-token' } } } as unknown as AppSettings
    await expect(migrateApiKeysToSafeStorage(settings)).rejects.toThrow('移除磁盘明文')
    expect(JSON.stringify(storage.saveSettings.mock.calls[0][0])).not.toContain('fake-')
    expect(settings.providerConfigs?.volc.accessKey).toBe('fake-token')
    vi.unstubAllGlobals()
  })
})
