import type { TranscriptSession } from '../types'
import type { TranscriptVersion } from '../../../shared/fileTranscription'
import { reviewVersions } from './reviewVersions'
import { restoreFileStructure } from './versionSchema'

/** A new machine result is a new version, never a patch to edited text or confirmed names. */
export function addPostMeetingVersion(session: TranscriptSession, version: TranscriptVersion): TranscriptSession {
  const versions = [...(session.versions ?? [])]
  const existingIndex = versions.findIndex(item => item.id === version.id)
  if (existingIndex >= 0) {
    const existing = versions[existingIndex]
    const restored = restoreFileStructure(existing, version)
    if (restored === existing) return session
    versions[existingIndex] = restored
    return { ...session, versions }
  }
  const firstReadable = !!(version.text.trim() || version.segments.some(s => s.text.trim())) &&
    !session.transcript.trim() && !session.correction?.correctedText?.trim() &&
    !session.segments?.some(s => s.text.trim()) && !session.versions?.some(v =>
      v.kind === 'edited' || v.kind === 'reconciled' || v.text.trim() || v.segments.some(s => s.text.trim()))
  if (!versions.length && (session.transcript.trim() || session.segments?.some(s => s.text.trim()))) {
    versions.push({
      id: 'original-' + session.id, kind: session.realtime?.length ? 'realtime' : 'legacy',
      createdAt: session.createdAt, text: session.transcript, segments: structuredClone(session.segments ?? []),
      speakers: structuredClone(session.speakers ?? []),
    })
  } else if (!versions.length && !firstReadable && session.correction?.correctedText) {
    versions.push(...reviewVersions(session))
  }
  const previousReadable = versions.find(v => v.text.trim() || v.segments.some(s => s.text.trim()))
  versions.push(structuredClone(version))
  return { ...session, versions, selectedVersionId: firstReadable ? version.id : session.selectedVersionId ?? previousReadable?.id ?? versions[0].id,
    ...(firstReadable ? { transcript: version.text, segments: version.segments, speakers: version.speakers } : {}) }
}
