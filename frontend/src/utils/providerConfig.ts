import type { AppSettings, ProviderConfigData } from '../types'
import type { ASRProviderInfo, ProviderConfig } from '../types/asr'

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0 && value !== '{{SAFE_STORAGE}}'
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return value !== undefined && value !== null
}

export function buildProviderConnectConfig(
  providerConfig: ProviderConfigData | undefined,
  settings: Pick<AppSettings, 'languageHints'>,
): ProviderConfig {
  return {
    ...providerConfig,
    languageHints: hasConfiguredValue(providerConfig?.languageHints)
      ? providerConfig?.languageHints
      : settings.languageHints,
  }
}

export function hasVolcCredentials(config: ProviderConfigData | undefined): boolean {
  const hasCredential = (value: unknown) => typeof value === 'string' && hasConfiguredValue(value)
  return hasCredential(config?.apiKey) || (hasCredential(config?.appKey) && hasCredential(config?.accessKey))
}

export function getMissingRequiredConfigKeys(
  provider: ASRProviderInfo | undefined,
  providerConfig: ProviderConfigData | undefined
): string[] {
  if (!provider) return []
  if (provider.id === 'volc') return hasVolcCredentials(providerConfig) ? [] : ['apiKey']
  return provider.requiredConfigKeys.filter((key) => !hasConfiguredValue(providerConfig?.[key]))
}

export function getMissingRequiredConfigLabels(
  provider: ASRProviderInfo | undefined,
  providerConfig: ProviderConfigData | undefined
): string[] {
  if (!provider) return []

  const missingKeys = getMissingRequiredConfigKeys(provider, providerConfig)
  return missingKeys.map((key) => {
    const field = provider.configFields.find((item) => item.key === key)
    return field?.label || key
  })
}

export function isProviderConfigured(
  provider: ASRProviderInfo | undefined,
  providerConfig: ProviderConfigData | undefined
): boolean {
  if (!provider) return false
  return getMissingRequiredConfigKeys(provider, providerConfig).length === 0
}
