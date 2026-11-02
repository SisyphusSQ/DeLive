import type { TranscriptSession } from '../types'
import type { TranscriptVersion } from '../../../shared/fileTranscription'

/** A new machine result is a new version, never a patch to edited text or confirmed names. */
export function addPostMeetingVersion(session: TranscriptSession, version: TranscriptVersion): TranscriptSession {
  const versions = [...(session.versions ?? [])]
  if (versions.some(item => item.id === version.id)) return session
  if (!versions.length && (session.transcript || session.segments?.length)) versions.push({
    id: 'original-' + session.id, kind: session.realtime?.length ? 'realtime' : 'legacy',
    createdAt: session.createdAt, text: session.transcript, segments: structuredClone(session.segments ?? []),
    speakers: structuredClone(session.speakers ?? []),
  })
  versions.push(structuredClone(version))
  const emptyOriginal = !session.transcript && !session.correction?.correctedText && !(session.versions?.length)
  return { ...session, versions, selectedVersionId: session.selectedVersionId ?? versions[0].id,
    ...(emptyOriginal ? { transcript: version.text, segments: version.segments, speakers: version.speakers } : {}) }
}
