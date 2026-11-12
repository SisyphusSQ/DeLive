import type { ProviderConfigData } from '../types'
import type { ASRProviderInfo, ASRVendor } from '../types/asr'
import { createBundledRuntimeManager } from './localRuntimeManager'
import { SENSEVOICE_DEFAULT_BASE_URL, resolveSenseVoiceModel } from '../types/asr/vendors/sensevoice'
import { throwUserError, userErrorMessage } from './userErrors'

type ProviderConfigTester = (config: ProviderConfigData) => Promise<void>

function createSilentWavBlob(durationMs = 500, sampleRate = 16000): Blob {
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationMs / 1000))
  const pcmSize = sampleCount * 2
  const buffer = new ArrayBuffer(44 + pcmSize)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcmSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcmSize, true)

  return new Blob([buffer], { type: 'audio/wav' })
}

const providerConfigTesters: Partial<Record<ASRVendor, ProviderConfigTester>> = {
  volc: async (config) => {
    const { VolcProvider } = await import('../providers/implementations/VolcProvider')
    const provider = new VolcProvider()
    let failure: string | undefined
    provider.on('onError', error => { failure = error.message })
    try {
      await provider.connect(config)
      await provider.disconnect()
      if (failure) throw new Error(failure)
    } finally { await provider.disconnect(); provider.removeAllListeners() }
  },
  local_openai: async (config) => {
    const rawBaseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
    const model = typeof config.model === 'string' ? config.model.trim() : ''

    if (!rawBaseUrl) {
      throwUserError('enterBaseUrl')
    }
    if (!model) {
      throwUserError('enterModelName')
    }

    let url: URL
    try {
      url = new URL(rawBaseUrl.replace(/\/+$/, ''))
    } catch {
      throwUserError('invalidBaseUrl')
    }

    const headers: HeadersInit = {}
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : ''
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }

    const response = await fetch(`${url.toString().replace(/\/+$/, '')}/v1/models`, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw new Error(details || userErrorMessage('serviceReturnedError', undefined, response.status))
    }
  },
  sensevoice: async (config) => {
    const rawBaseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : ''
    const baseUrl = (rawBaseUrl || SENSEVOICE_DEFAULT_BASE_URL).replace(/\/+$/, '')

    try {
      new URL(baseUrl)
    } catch {
      throwUserError('invalidServiceUrl')
    }

    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    }).catch((err: Error) => {
      throwUserError('funasrConnectFailed', undefined, baseUrl, err instanceof Error ? err.message : String(err))
    })

    if (!healthRes.ok) {
      throwUserError('funasrHealthCheckFailed', undefined, healthRes.status)
    }

    const model = resolveSenseVoiceModel(config.model)

    const wavBlob = createSilentWavBlob()
    const formData = new FormData()
    formData.append('file', wavBlob, 'test.wav')
    formData.append('model', model)
    formData.append('response_format', 'json')

    const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw new Error(details || userErrorMessage('funasrTranscriptionTestFailed', undefined, response.status))
    }
  },
  local_whisper_cpp: async (config) => {
    if (!window.electronAPI?.isElectron) {
      throwUserError('notElectronWhisperTest')
    }

    const manager = createBundledRuntimeManager('whisper_cpp')
    const before = await manager.getSnapshot(config)
    const shouldStopAfterTest = before.status !== 'running'

    try {
      const snapshot = await manager.start(config)
      if (snapshot.status !== 'running') {
        throw new Error(snapshot.message || userErrorMessage('whisperRuntimeStartFailed'))
      }

      const formData = new FormData()
      formData.append('file', createSilentWavBlob(), 'test.wav')
      formData.append('response_format', 'json')

      const response = await fetch(`${snapshot.baseUrl.replace(/\/+$/, '')}/inference`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(details || userErrorMessage('whisperInferenceError', undefined, response.status))
      }
    } finally {
      if (shouldStopAfterTest) {
        await manager.stop(config).catch(() => undefined)
      }
    }
  },
}

export async function testProviderConfig(
  provider: ASRProviderInfo | undefined,
  config: ProviderConfigData
): Promise<void> {
  if (!provider?.capabilities.supportsConfigTest) {
    return
  }

  const tester = providerConfigTesters[provider.id]
  if (!tester) {
    throwUserError('providerConfigTestNotImplemented')
  }

  await tester(config)
}
