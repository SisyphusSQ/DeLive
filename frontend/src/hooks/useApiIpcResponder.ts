import { reviewVersions, selectedReviewVersion, reviewExport, canExportTimed } from '../utils/reviewVersions'
import { useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { getTags, getTopics } from '../utils/settingsStorage'
import type {
  SessionSummary,
  SessionDetail,
  ApiRecordingStatus,
} from '../../../shared/electronApi'
import type { TranscriptSession } from '../types'

export function toSessionSummary(session: TranscriptSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    date: session.date,
    time: session.time,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    duration: session.duration,
    status: session.status,
    topicId: session.topicId,
    tagIds: session.tagIds,
    providerId: session.providerId,
    hasSummary: Boolean(session.postProcess?.summary),
    hasMindMap: Boolean(session.mindMap?.markdown),
    transcriptLength: session.transcript?.length ?? 0,
  }
}

export function toSessionDetail(session: TranscriptSession): SessionDetail {
  const versions = reviewVersions(session)
  return {
    adoptedVersionId: selectedReviewVersion(session, versions).id,
    versions: versions.map(({ id, kind, createdAt }) => ({ id, kind, createdAt })),
    images: session.images ?? [],
    id: session.id,
    title: session.title,
    date: session.date,
    time: session.time,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    duration: session.duration,
    status: session.status,
    topicId: session.topicId,
    tagIds: session.tagIds,
    providerId: session.providerId,
    transcript: session.transcript ?? '',
    tokens: session.tokens?.map(t => ({
      text: t.text,
      isFinal: t.isFinal,
      startMs: t.startMs,
      endMs: t.endMs,
      speaker: t.speaker,
    })),
    speakers: session.speakers?.map(s => ({
      id: s.id,
      label: s.label,
      displayName: s.displayName,
    })),
    segments: session.segments?.map(s => ({
      text: s.text,
      startMs: s.startMs,
      endMs: s.endMs,
      speakerId: s.speakerId,
    })),
    postProcess: session.postProcess
      ? {
          summary: session.postProcess.summary,
          actionItems: session.postProcess.actionItems,
          keywords: session.postProcess.keywords,
          titleSuggestion: session.postProcess.titleSuggestion,
          tagSuggestions: session.postProcess.tagSuggestions,
          generatedAt: session.postProcess.generatedAt,
          status: session.postProcess.status,
        }
      : undefined,
    mindMap: session.mindMap
      ? {
          markdown: session.mindMap.markdown,
          title: session.mindMap.title,
          generatedAt: session.mindMap.generatedAt,
          status: session.mindMap.status,
        }
      : undefined,
    askHistory: session.askHistory?.map(turn => ({
      id: turn.id,
      question: turn.question,
      answer: turn.answer,
      createdAt: turn.createdAt,
      status: turn.status,
    })),
    correction: session.correction?.correctedText
      ? {
          correctedText: session.correction.correctedText,
          status: session.correction.status,
          mode: session.correction.mode,
        }
      : undefined,
  }
}

export function useApiIpcResponder(ready: boolean): void {
  useEffect(() => {
    const api = window.electronAPI
    if (!api || !ready) return

    const store = useSessionStore
    let prevSessionId = store.getState().currentSessionId

    const unsubscribeStore = store.subscribe((state) => {
      const currentId = state.currentSessionId
      if (currentId !== prevSessionId) {
        if (prevSessionId && !currentId) {
          api.apiNotifySessionEnd(prevSessionId)
        } else if (currentId && !prevSessionId) {
          api.apiNotifySessionStart(currentId)
        }
        prevSessionId = currentId
      }
    })

    const cleanups: Array<() => void> = [unsubscribeStore]

    cleanups.push(
      api.onApiGetSessions((_event, requestId) => {
        const sessions = useSessionStore.getState().sessions
        api.apiRespondSessions(requestId, sessions.map(toSessionSummary))
      }),
    )

    cleanups.push(api.onApiReviewExport((requestId, sessionId, options) => {
      const session = store.getState().sessions.find(item => item.id === sessionId)
      if (!session) return api.apiRespondReviewExport(requestId, { status: 404, error: 'Session not found' })
      const version = selectedReviewVersion(session)
      if (!options.allowPending && version.merge?.groups.some(group => group.status === 'pending')) {
        return api.apiRespondReviewExport(requestId, { status: 409, error: 'Review has pending sections. Pass --allow-pending to export them.' })
      }
      if ((options.format === 'srt' || options.format === 'vtt') && !canExportTimed(version)) {
        return api.apiRespondReviewExport(requestId, { status: 422, error: 'Subtitle export requires valid timestamps for every segment.' })
      }
      const content = reviewExport(session, options.format, options.purpose)
      api.apiRespondReviewExport(requestId, { status: 200, content })
    }))

    cleanups.push(
      api.onApiGetSessionDetail((_event, requestId, sessionId) => {
        const session = useSessionStore.getState().sessions.find(s => s.id === sessionId)
        api.apiRespondSessionDetail(requestId, session ? toSessionDetail(session) : null)
      }),
    )

    cleanups.push(
      api.onApiSearchSessions((_event, requestId, query) => {
        const lowerQuery = query.toLowerCase()
        const sessions = useSessionStore.getState().sessions.filter(s =>
          s.title.toLowerCase().includes(lowerQuery)
          || (s.transcript ?? '').toLowerCase().includes(lowerQuery),
        )
        api.apiRespondSearchSessions(requestId, sessions.map(toSessionSummary))
      }),
    )

    cleanups.push(
      api.onApiGetTopics((_event, requestId) => {
        api.apiRespondTopics(requestId, getTopics())
      }),
    )

    cleanups.push(
      api.onApiGetTags((_event, requestId) => {
        api.apiRespondTags(requestId, getTags())
      }),
    )

    cleanups.push(
      api.onApiGetRecordingStatus((_event, requestId) => {
        const { recordingState, currentSessionId } = useSessionStore.getState()
        const status: ApiRecordingStatus = {
          isRecording: recordingState === 'recording',
          currentSessionId,
          recordingState,
        }
        api.apiRespondRecordingStatus(requestId, status)
      }),
    )

    return () => {
      cleanups.forEach(fn => fn())
    }
  }, [ready])
}
