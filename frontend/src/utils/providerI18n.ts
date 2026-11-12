import type { Translations } from '../i18n'
import type { ASRProviderInfo, ProviderConfigField } from '../types/asr'

type ProviderStrings = Translations['provider']

export function getProviderName(provider: ASRProviderInfo, t: Translations): string {
  const p = t.provider as ProviderStrings & Record<string, unknown>
  return (p[provider.id as keyof typeof p] as string) || provider.name
}

export function getProviderDescription(provider: ASRProviderInfo, t: Translations): string {
  const p = t.provider as ProviderStrings & Record<string, unknown>
  const key = `${provider.id}Desc` as keyof typeof p
  return (p[key] as string) || provider.description
}

const FIELD_LABEL_MAP: Record<string, Record<string, keyof ProviderStrings>> = {
  sensevoice: {
    baseUrl: 'fieldSenseVoiceBaseUrl',
    model: 'fieldModel',
    languageHints: 'fieldLanguageHints',
  },
  volc: {
    apiKey: 'fieldApiKey',
    enableDdc: 'fieldVolcDdc',
    appKey: 'fieldVolcAppId',
    accessKey: 'fieldVolcAccessToken',
    languageHints: 'fieldLanguageHints',
  },
  local_openai: {
    baseUrl: 'fieldBaseUrl',
    model: 'fieldModel',
    apiKey: 'fieldApiKeyOptional',
    languageHints: 'fieldLanguageHints',
  },
  local_whisper_cpp: {
    binaryPath: 'fieldBinaryPath',
    modelPath: 'fieldModelPath',
    port: 'fieldRuntimePort',
    languageHints: 'fieldLanguageHints',
  },
}

const FIELD_DESC_MAP: Record<string, Record<string, keyof ProviderStrings>> = {
  sensevoice: {
    baseUrl: 'fieldSenseVoiceBaseUrlDesc',
    model: 'fieldSenseVoiceModelDesc',
    languageHints: 'fieldLanguageHintsDesc',
  },
  volc: {
    apiKey: 'fieldVolcApiKeyDesc',
    enableDdc: 'fieldVolcDdcDesc',
    appKey: 'fieldVolcAppIdDesc',
    accessKey: 'fieldVolcAccessTokenDesc',
    languageHints: 'fieldLanguageHintsDescVolc',
  },
  local_openai: {
    baseUrl: 'fieldBaseUrlDesc',
    model: 'fieldModelDesc',
    languageHints: 'fieldLanguageHintsDesc',
  },
  local_whisper_cpp: {
    binaryPath: 'fieldBinaryPathDesc',
    modelPath: 'fieldModelPathDesc',
    port: 'fieldRuntimePortDesc',
    languageHints: 'fieldLanguageHintsDesc',
  },
}

const FIELD_PLACEHOLDER_MAP: Record<string, Record<string, keyof ProviderStrings>> = {
  volc: {
    appKey: 'fieldVolcAppIdPlaceholder',
    accessKey: 'fieldVolcAccessTokenPlaceholder',
  },
  sensevoice: { baseUrl: 'fieldBaseUrlPlaceholder' },
  local_openai: {
    baseUrl: 'fieldBaseUrlPlaceholder',
    model: 'fieldModelPlaceholder',
    apiKey: 'fieldApiKeyLocalPlaceholder',
  },
  local_whisper_cpp: {
    binaryPath: 'fieldBinaryPathPlaceholder',
    modelPath: 'fieldModelPathPlaceholder',
  },
}

const LANG_LABEL_MAP: Record<string, keyof ProviderStrings> = {
  zh: 'langZh',
  en: 'langEn',
  ja: 'langJa',
  ko: 'langKo',
  es: 'langEs',
  fr: 'langFr',
  de: 'langDe',
  vi: 'langVi',
}

/**
 * Select options whose values are not language codes. Without this they fall
 * through to the raw label baked into the provider definition, which is
 * Chinese regardless of the chosen interface language.
 */
const FIELD_OPTION_MAP: Record<string, Record<string, Record<string, keyof ProviderStrings>>> = {
  sensevoice: {
    model: {
      sensevoice: 'optSenseVoice',
      paraformer: 'optParaformer',
      'fun-asr-nano': 'optFunAsrNano',
    },
  },
}

function lookup(p: ProviderStrings, key: keyof ProviderStrings | undefined): string | undefined {
  if (!key) return undefined
  return (p as Record<string, unknown>)[key as string] as string | undefined
}

export function translateConfigField(
  providerId: string,
  field: ProviderConfigField,
  t: Translations,
): ProviderConfigField {
  const p = t.provider
  const labelKey = FIELD_LABEL_MAP[providerId]?.[field.key]
  const descKey = FIELD_DESC_MAP[providerId]?.[field.key]
  const placeholderKey = FIELD_PLACEHOLDER_MAP[providerId]?.[field.key]

  const optionKeys = FIELD_OPTION_MAP[providerId]?.[field.key]
  const translatedOptions = field.options?.map(opt => {
    const key = optionKeys?.[opt.value] ?? LANG_LABEL_MAP[opt.value]
    const translated = key ? lookup(p, key) : undefined
    return translated ? { ...opt, label: translated } : opt
  })

  return {
    ...field,
    label: lookup(p, labelKey) || field.label,
    description: lookup(p, descKey) || field.description,
    placeholder: lookup(p, placeholderKey) || field.placeholder,
    ...(translatedOptions ? { options: translatedOptions } : {}),
  }
}
