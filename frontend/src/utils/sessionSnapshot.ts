import type {
  TranscriptPostProcess,
  TranscriptSourceMeta,
  TranscriptSpeaker,
  TranscriptTokenData,
  TranscriptSegment,
} from '../types'
import type { TranscriptToken } from '../types/asr'
import { hasPostProcessContent, type TranscriptRuntimeState } from './transcriptState'

export interface TranscriptPersistenceSnapshot {
  realtime?: import('../types/realtime').RealtimeRecognition[]
  transcript: string
  tokens?: TranscriptTokenData[]
  providerId?: string
  speakers?: TranscriptSpeaker[]
  segments?: TranscriptSegment[]
  sourceMeta?: TranscriptSourceMeta
  postProcess?: TranscriptPostProcess
}

export function hasPersistenceSnapshotContent(snapshot: TranscriptPersistenceSnapshot): boolean {
  return Boolean(
    snapshot.realtime?.length
    || snapshot.transcript
    || snapshot.tokens?.length
    || hasPostProcessContent(snapshot.postProcess),
  )
}

export function mapTokensForStorage(tokens: TranscriptToken[]): TranscriptTokenData[] {
  return tokens.map((token) => ({
    text: token.text,
    isFinal: token.isFinal,
    startMs: token.startMs,
    endMs: token.endMs,
    speaker: token.speaker,
    language: token.language,
    confidence: token.confidence,
  }))
}

export function restoreStoredTokens(tokens: TranscriptTokenData[]): TranscriptToken[] {
  return tokens.map((token) => ({
    text: token.text,
    isFinal: token.isFinal !== false,
    startMs: token.startMs,
    endMs: token.endMs,
    speaker: token.speaker,
    language: token.language,
    confidence: token.confidence,
  }))
}

export function buildTranscriptFromState(
  finalTranscript: string,
  nonFinalTranscript: string,
  currentTranscript: string,
): string {
  return currentTranscript || finalTranscript || nonFinalTranscript
}

export function buildSourceMeta(options: {
  providerId?: string
  providerMode?: TranscriptSourceMeta['providerMode']
  platform?: TranscriptSourceMeta['platform']
  captureMode?: TranscriptSourceMeta['captureMode']
}): TranscriptSourceMeta | undefined {
  if (!options.providerId) {
    return undefined
  }

  return {
    captureMode: options.captureMode ?? 'system-audio',
    platform: options.platform ?? 'unknown',
    providerMode: options.providerMode ?? 'unknown',
  }
}

export function buildSessionSnapshot(options: {
  runtimeState: TranscriptRuntimeState
  providerId?: string
  providerMode?: TranscriptSourceMeta['providerMode']
  platform?: TranscriptSourceMeta['platform']
  captureMode?: TranscriptSourceMeta['captureMode']
}): TranscriptPersistenceSnapshot {
  const {
    runtimeState,
    providerId,
    providerMode,
    platform,
    captureMode,
  } = options

  const transcript = buildTranscriptFromState(
    runtimeState.finalTranscript,
    runtimeState.nonFinalTranscript,
    runtimeState.currentTranscript,
  )
  return {
    transcript,
    realtime: runtimeState.realtime,
    tokens: runtimeState.finalTokens.length > 0
      ? mapTokensForStorage(runtimeState.finalTokens)
      : undefined,
    providerId,
    speakers: runtimeState.currentSpeakers,
    segments: runtimeState.currentSegments,
    sourceMeta: buildSourceMeta({
      providerId,
      providerMode,
      platform,
      captureMode,
    }),
    postProcess: runtimeState.currentPostProcess,
  }
}
