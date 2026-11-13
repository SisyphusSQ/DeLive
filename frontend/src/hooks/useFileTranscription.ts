import { useCallback } from 'react'
import { useFileTranscriptionStore } from '../stores/fileTranscriptionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { sessionRepository } from '../utils/sessionRepository'
import { createDraftSession } from '../utils/sessionLifecycle'
import { useUIStore } from '../stores/uiStore'
import { throwUserError, userErrorMessage } from '../utils/userErrors'
import type { FileTranscriptionConfig } from '../types/fileTranscription'
import type { TranscriptTokenData, TranscriptSegment, TranscriptSpeaker } from '../types'
import { importVolcFile } from '../utils/volcFileApi'
import {
  LOCAL_OPENAI_DEFAULT_BASE_URL,
  LOCAL_OPENAI_DEFAULT_MODEL,
} from '../types/asr/vendors/localOpenAI'
import { resolveSenseVoiceModel } from '../types/asr/vendors/sensevoice'
import {
  transcribeFile as whisperCppTranscribeFile,
  whisperCppResponseToResult,
} from '../utils/whisperCppFileApi'
import { decodeFileToMonoWav } from '../utils/audioFileToWav'
import { createBundledRuntimeManager } from '../utils/localRuntimeManager'
import { getFileTranscriptionConfigError } from '../utils/fileTranscriptionRouting'
import { buildProviderConnectConfig } from '../utils/providerConfig'
import type { ProviderConfigData } from '../types'

interface TranscriptionResult {
  transcript: string
  tokens: TranscriptTokenData[]
  segments: TranscriptSegment[]
  speakers: TranscriptSpeaker[]
  durationMs: number
}

async function executeLocalOpenAI(
  file: File,
  config: FileTranscriptionConfig,
  baseUrl: string,
  model: string,
  apiKey: string | undefined,
  jobId: string,
  updateJob: (id: string, u: Record<string, unknown>) => void,
  signal: AbortSignal,
): Promise<TranscriptionResult> {
  updateJob(jobId, { status: 'uploading', progress: 20 })

  const endpoint = `${baseUrl.replace(/\/+$/, '')}/v1/audio/transcriptions`

  updateJob(jobId, { status: 'transcribing', progress: 40 })

  const formData = new FormData()
  formData.append('file', file, file.name)
  formData.append('model', model)
  formData.append('response_format', 'verbose_json')

  const language = config.languageHints?.[0]
  if (language) {
    formData.append('language', language)
  }

  const headers: HeadersInit = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: formData,
    signal,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(details || userErrorMessage('openAiCompatibleServiceError', undefined, response.status))
  }

  updateJob(jobId, { progress: 80 })

  const result = await response.json() as {
    text?: string
    duration?: number
    segments?: Array<{
      text: string
      start: number
      end: number
    }>
    words?: Array<{
      word: string
      start: number
      end: number
    }>
  }

  const transcript = (result.text ?? '').trim()

  if (!transcript) {
    throwUserError('openAiCompatibleEmptyTranscript')
  }

  let tokens: TranscriptTokenData[]
  let segments: TranscriptSegment[]

  if (result.words && result.words.length > 0) {
    tokens = result.words.map((w) => ({
      text: w.word,
      isFinal: true,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }))
  } else {
    tokens = [{
      text: transcript,
      isFinal: true,
      startMs: 0,
      endMs: (result.duration ?? 0) * 1000,
    }]
  }

  if (result.segments && result.segments.length > 0) {
    segments = result.segments.map((seg) => ({
      text: seg.text.trim(),
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(seg.end * 1000),
      isFinal: true,
    }))
  } else {
    segments = [{
      text: transcript,
      startMs: 0,
      endMs: (result.duration ?? 0) * 1000,
      isFinal: true,
    }]
  }

  const durationMs = (result.duration ?? 0) * 1000

  return {
    transcript,
    tokens,
    segments,
    speakers: [],
    durationMs,
  }
}

async function executeWhisperCpp(
  file: File,
  config: FileTranscriptionConfig,
  providerConfig: ProviderConfigData,
  jobId: string,
  updateJob: (id: string, u: Record<string, unknown>) => void,
  signal: AbortSignal,
): Promise<TranscriptionResult> {
  updateJob(jobId, { status: 'uploading', progress: 10 })

  // Starts the bundled whisper-server, or reuses it if live capture already did.
  const snapshot = await createBundledRuntimeManager('whisper_cpp').start(providerConfig)
  if (signal.aborted) throw new Error('Transcription cancelled')

  updateJob(jobId, { progress: 25 })

  let decoded: { wav: Blob; durationMs: number }
  try {
    decoded = await decodeFileToMonoWav(file, 16000)
  } catch (err) {
    throwUserError('audioDecodeFailed', undefined, err instanceof Error ? err.message : String(err))
  }
  if (signal.aborted) throw new Error('Transcription cancelled')

  updateJob(jobId, { status: 'transcribing', progress: 40 })

  const response = await whisperCppTranscribeFile(
    snapshot.baseUrl,
    decoded.wav,
    { language: config.languageHints?.[0] },
    signal,
  )

  updateJob(jobId, { progress: 90 })

  const result = whisperCppResponseToResult(response, decoded.durationMs)
  if (!result.transcript) {
    throwUserError('whisperCppEmptyTranscript')
  }
  return result
}

const abortControllers = new Map<string, AbortController>()

export function useFileTranscription() {
  const { addJob, updateJob } = useFileTranscriptionStore()
  const jobs = useFileTranscriptionStore((s) => s.jobs)

  const submitFile = useCallback(async (file: File, config: FileTranscriptionConfig) => {
    const providerId = config.provider
    if (providerId === 'volc') return importVolcFile(file)
    const settingsState = useSettingsStore.getState()
    const providerConfig: ProviderConfigData = buildProviderConnectConfig(
      settingsState.getProviderConfig(providerId),
      settingsState.settings,
    )

    const jobId = addJob({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'audio/mpeg',
      provider: config.provider,
    })

    // Report config problems on the job itself so they show in the list,
    // instead of rejecting before a job exists (which the page only logged).
    const configError = getFileTranscriptionConfigError(providerId, providerConfig, {
      isElectron: Boolean(window.electronAPI?.isElectron),
    })
    if (configError) {
      updateJob(jobId, {
        status: 'error',
        error: userErrorMessage(configError.key, undefined, ...configError.args),
      })
      return jobId
    }

    const controller = new AbortController()
    abortControllers.set(jobId, controller)

    ;(async () => {
      try {
        let result: TranscriptionResult

        if (providerId === 'local_openai' || providerId === 'sensevoice') {
          const rawBaseUrl = providerConfig?.baseUrl as string | undefined
          const defaultBase = providerId === 'sensevoice' ? 'http://127.0.0.1:8000' : LOCAL_OPENAI_DEFAULT_BASE_URL
          const baseUrl = (rawBaseUrl?.trim() || defaultBase).replace(/\/+$/, '')
          const model = providerId === 'sensevoice'
            ? resolveSenseVoiceModel(providerConfig?.model)
            : (providerConfig?.model as string)?.trim() || LOCAL_OPENAI_DEFAULT_MODEL
          const localApiKey = (providerConfig?.apiKey as string)?.trim() || undefined
          result = await executeLocalOpenAI(file, config, baseUrl, model, localApiKey, jobId, updateJob, controller.signal)
        } else if (providerId === 'local_whisper_cpp') {
          result = await executeWhisperCpp(file, config, providerConfig, jobId, updateJob, controller.signal)
        } else {
          // Unreachable while FILE_TRANSCRIPTION_PROVIDER_IDS matches the
          // branches above; never fall back to another vendor's API (#17).
          throwUserError('fileTranscriptionUnsupported', undefined, providerId)
        }

        controller.signal.throwIfAborted()
        const now = Date.now()
        const session = createDraftSession({
          now,
          title: file.name.replace(/\.[^.]+$/, ''),
          providerId,
          sourceMeta: {
            captureMode: 'file',
            providerMode: 'unknown',
            platform: (window.electronAPI?.platform as 'win32' | 'darwin' | 'linux') || 'unknown',
          },
        })

        const completedSession = {
          ...session,
          transcript: result.transcript,
          tokens: result.tokens,
          segments: result.segments,
          speakers: result.speakers,
          duration: result.durationMs,
          status: 'completed' as const,
          updatedAt: now,
        }

        abortControllers.delete(jobId)
        updateJob(jobId, { status: 'saving' })
        const sessions = await sessionRepository.addCompletedSession(completedSession)
        useSessionStore.setState({ sessions })

        updateJob(jobId, {
          status: 'completed',
          progress: 100,
          sessionId: session.id,
          completedAt: Date.now(),
          audioDurationMs: result.durationMs,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (message !== 'Transcription cancelled' && !controller.signal.aborted) {
          updateJob(jobId, { status: 'error', error: message })
        }
      } finally {
        abortControllers.delete(jobId)
      }
    })()

    return jobId
  }, [addJob, updateJob])

  const cancelJob = useCallback((jobId: string) => {
    const controller = abortControllers.get(jobId)
    if (!controller) return
    controller.abort()
    abortControllers.delete(jobId)
    updateJob(jobId, { status: 'cancelled' })
  }, [updateJob])

  const openResult = useCallback((jobId: string) => {
    const job = useFileTranscriptionStore.getState().getJob(jobId)
    if (job?.sessionId) {
      useUIStore.getState().openReview(job.sessionId)
    }
  }, [])

  return { jobs, submitFile, cancelJob, openResult }
}
