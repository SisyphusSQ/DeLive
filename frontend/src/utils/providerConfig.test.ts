import { describe, it, expect } from 'vitest'
import {
  buildProviderConnectConfig,
  getMissingRequiredConfigKeys,
  getMissingRequiredConfigLabels,
  isProviderConfigured,
} from './providerConfig'
import type { ASRProviderInfo } from '../types/asr'

function makeProviderInfo(overrides: Partial<ASRProviderInfo> = {}): ASRProviderInfo {
  return {
    id: 'local_openai' as ASRProviderInfo['id'],
    name: 'Local OpenAI',
    description: '',
    type: 'local',
    supportsStreaming: true,
    capabilities: {
      audioInputMode: 'media-recorder',
      transport: { type: 'realtime' },
    },
    requiredConfigKeys: ['apiKey'],
    supportedLanguages: ['en', 'zh'],
    website: '',
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'model', label: 'Model', type: 'text', required: false },
    ],
    ...overrides,
  }
}

describe('buildProviderConnectConfig', () => {
  it('only uses the API key belonging to the selected provider', () => {
    const settings = { apiKey: 'retired-key', languageHints: ['en'] }
    expect(buildProviderConnectConfig(undefined, settings)).toEqual({ languageHints: ['en'] })
    expect(buildProviderConnectConfig({ apiKey: 'local-key', languageHints: ['zh'] }, settings))
      .toEqual({ apiKey: 'local-key', languageHints: ['zh'] })
  })
})

describe('getMissingRequiredConfigKeys', () => {
  it('returns empty for undefined provider', () => {
    expect(getMissingRequiredConfigKeys(undefined, {})).toEqual([])
  })

  it('returns missing keys when config is empty', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey', 'model'] })
    expect(getMissingRequiredConfigKeys(provider, {})).toEqual(['apiKey', 'model'])
  })

  it('returns empty when all required keys are present', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey'] })
    expect(getMissingRequiredConfigKeys(provider, { apiKey: 'key' })).toEqual([])
  })

  it('treats empty string as missing', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey'] })
    expect(getMissingRequiredConfigKeys(provider, { apiKey: '  ' })).toEqual(['apiKey'])
  })
})

describe('getMissingRequiredConfigLabels', () => {
  it('returns labels for missing keys', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey'] })
    expect(getMissingRequiredConfigLabels(provider, {})).toEqual(['API Key'])
  })

  it('falls back to key name when label not found', () => {
    const provider = makeProviderInfo({
      requiredConfigKeys: ['unknownField'],
      configFields: [],
    })
    expect(getMissingRequiredConfigLabels(provider, {})).toEqual(['unknownField'])
  })
})

describe('isProviderConfigured', () => {
  it('returns false for undefined provider', () => {
    expect(isProviderConfigured(undefined, {})).toBe(false)
  })

  it('returns true when all required keys present', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey'] })
    expect(isProviderConfigured(provider, { apiKey: 'key' })).toBe(true)
  })

  it('returns false when required key missing', () => {
    const provider = makeProviderInfo({ requiredConfigKeys: ['apiKey'] })
    expect(isProviderConfigured(provider, {})).toBe(false)
  })

  it('returns true for local-runtime providers that require modelPath instead of apiKey', () => {
    const provider = makeProviderInfo({
      type: 'local',
      requiredConfigKeys: ['modelPath'],
      configFields: [
        { key: 'modelPath', label: '模型文件路径', type: 'text', required: true },
      ],
    })
    expect(isProviderConfigured(provider, { modelPath: '/models/ggml-base.bin' })).toBe(true)
    expect(isProviderConfigured(provider, {})).toBe(false)
    expect(isProviderConfigured(provider, { apiKey: 'should-not-matter' })).toBe(false)
  })

  it('requires readable Volcengine credentials', () => {
    const provider = makeProviderInfo({
      id: 'volc' as ASRProviderInfo['id'],
      requiredConfigKeys: [],
    })
    expect(isProviderConfigured(provider, { apiKey: 'new-key' })).toBe(true)
    expect(isProviderConfigured(provider, { apiKey: '{{SAFE_STORAGE}}' })).toBe(false)
    expect(isProviderConfigured(provider, { appKey: 'app-id' })).toBe(false)
    expect(isProviderConfigured(provider, { appKey: 'app-id', accessKey: 'access-token' })).toBe(true)
  })
})
