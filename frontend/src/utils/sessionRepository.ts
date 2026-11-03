import type { TranscriptSession } from '../types'
import {
  deleteSessionById,
  getSessions,
  saveSessions,
  upsertSession,
  upsertSessions,
} from './sessionStorage'
import {
  normalizeTranscriptSession,
  upgradeTranscriptSessions,
} from './sessionSchema'
import type { TranscriptPersistenceSnapshot } from './sessionSnapshot'
import { hasPostProcessContent } from './transcriptState'

export type SessionProgressSnapshot = TranscriptPersistenceSnapshot

export interface SessionLaunchState {
  sessions: TranscriptSession[]
  recoverableSession: TranscriptSession | null
}

let cachedSessions: TranscriptSession[] = []
let cacheReady = false
const pendingWrites = new Set<Promise<unknown>>()
function trackWrite<T>(operation: Promise<T>): Promise<T> { pendingWrites.add(operation); void operation.finally(() => pendingWrites.delete(operation)).catch(() => {}); return operation }
const durableWrites = new Map<string, Promise<TranscriptSession[]>>()

function normalizeSession(session: TranscriptSession): TranscriptSession {
  return normalizeTranscriptSession(session)
}

function getCachedSessions(): TranscriptSession[] {
  return cachedSessions.map(normalizeSession)
}

function updateCachedSessions(sessions: TranscriptSession[]): TranscriptSession[] {
  cachedSessions = sessions.map(normalizeSession)
  cacheReady = true
  return cachedSessions
}

function persistSessions(sessions: TranscriptSession[]): TranscriptSession[] {
  const nextSessions = updateCachedSessions(sessions)

  void trackWrite(saveSessions(nextSessions)).catch((error) => {
    console.error('[sessionRepository] Failed to persist sessions:', error)
  })

  return nextSessions
}

function persistSingleSession(sessionId: string, sessions: TranscriptSession[]): TranscriptSession[] {
  const nextSessions = updateCachedSessions(sessions)
  const previous = durableWrites.get(sessionId) ?? Promise.resolve([])
  const operation = previous.catch(() => []).then(async () => {
    const target = getCachedSessions().find(session => session.id === sessionId)
    if (target) await upsertSession(target)
    return getCachedSessions()
  })
  durableWrites.set(sessionId, operation)
  void operation.catch((error) => {
    console.error('[sessionRepository] Failed to persist session:', error)
  }).finally(() => {
    if (durableWrites.get(sessionId) === operation) durableWrites.delete(sessionId)
  })

  return nextSessions
}

function persistSessionBatch(sessionIds: string[], sessions: TranscriptSession[]): TranscriptSession[] {
  const nextSessions = updateCachedSessions(sessions)
  const targets = nextSessions.filter((session) => sessionIds.includes(session.id))

  if (targets.length === 0) {
    return nextSessions
  }

  void trackWrite(upsertSessions(targets)).catch((error) => {
    console.error('[sessionRepository] Failed to persist session batch:', error)
  })

  return nextSessions
}

function persistSessionDeletion(sessionId: string, sessions: TranscriptSession[]): TranscriptSession[] {
  const nextSessions = updateCachedSessions(sessions)

  void trackWrite(deleteSessionById(sessionId)).catch((error) => {
    console.error('[sessionRepository] Failed to delete session:', error)
  })

  return nextSessions
}

function updateSessionCollection(
  sessions: TranscriptSession[],
  sessionId: string,
  updates: Partial<TranscriptSession>
): TranscriptSession[] {
  const now = Date.now()

  return sessions.map((session) => {
    if (session.id !== sessionId) {
      return session
    }

    return {
      ...session,
      ...updates,
      updatedAt: now,
      lastPersistedAt: updates.lastPersistedAt ?? session.lastPersistedAt ?? now,
    }
  })
}

export const sessionRepository = {
  async snapshot(): Promise<TranscriptSession[]> {
    await Promise.all([...pendingWrites, ...durableWrites.values()])
    const sessions = cacheReady ? getCachedSessions() : await getSessions()
    // Persist the complete current cache so earlier reported write failures cannot be hidden in a backup.
    await saveSessions(sessions)
    return structuredClone(sessions)
  },
  async loadForLaunch(): Promise<SessionLaunchState> {
    const loadedSessions = await getSessions()
    const upgraded = upgradeTranscriptSessions(loadedSessions)
    let sessions = upgraded.sessions.map(normalizeSession)
    cachedSessions = sessions
    cacheReady = true
    const interruptedSessionIds: string[] = []
    const now = Date.now()

    sessions = sessions.map((session) => {
      const error = 'AI 任务因应用退出而中断，请手动重新生成'
      const interruptedAi = session.postProcess?.status === 'pending' || session.mindMap?.status === 'pending'
        || session.askHistory?.some(turn => turn.status === 'pending')
        || ['detecting', 'correcting'].includes(session.correction?.status || '')
      if (interruptedAi) {
        interruptedSessionIds.push(session.id)
        session = { ...session,
          postProcess: session.postProcess?.status === 'pending' ? { ...session.postProcess, status: 'error', error } : session.postProcess,
          mindMap: session.mindMap?.status === 'pending' ? { ...session.mindMap, status: 'error', error } : session.mindMap,
          askHistory: session.askHistory?.map(turn => turn.status === 'pending' ? { ...turn, status: 'error', error } : turn),
          correction: session.correction && ['detecting', 'correcting'].includes(session.correction.status)
            ? { ...session.correction, status: 'error', error } : session.correction,
        }
      }
      if (session.status !== 'recording') {
        return session
      }

      interruptedSessionIds.push(session.id)
      return {
        ...session,
        realtime: session.realtime?.map(r => r.status === 'streaming' ? { ...r, status: 'incomplete' as const, errorCode: 'APP_INTERRUPTED' } : r),
        status: 'interrupted',
        wasInterrupted: true,
        updatedAt: now,
        lastPersistedAt: session.lastPersistedAt ?? now,
      }
    })

    const sessionIdsToPersist = upgraded.changed
      ? Array.from(new Set([
        ...sessions.map((session) => session.id),
        ...interruptedSessionIds,
      ]))
      : interruptedSessionIds

    if (sessionIdsToPersist.length > 0) {
      sessions = persistSessionBatch(sessionIdsToPersist, sessions)
    }

    const recoverableSession = sessions.find((session) => {
      if (session.status !== 'interrupted') {
        return false
      }

      return Boolean(
        session.transcript
        || session.audioRecordingId
        || session.tokens?.length
        || session.translatedTranscript?.text
        || hasPostProcessContent(session.postProcess),
      )
    }) || null

    return { sessions, recoverableSession }
  },

  createDraft(session: TranscriptSession): TranscriptSession[] {
    const now = Date.now()
    const draftSession = normalizeSession({
      ...session,
      status: 'recording',
      lastPersistedAt: now,
      updatedAt: now,
    })

    const baseSessions = cacheReady ? getCachedSessions() : []
    const sessions = [draftSession, ...baseSessions]
    return persistSingleSession(draftSession.id, sessions)
  },

  updateMetadata(sessionId: string, updates: Partial<TranscriptSession>): TranscriptSession[] {
    const sessions = updateSessionCollection(getCachedSessions(), sessionId, updates)
    return persistSingleSession(sessionId, sessions)
  },

  async mutateDurable(sessionId: string, update: (current: TranscriptSession) => Partial<TranscriptSession>): Promise<TranscriptSession[]> {
    const previous = durableWrites.get(sessionId) ?? Promise.resolve([])
    const operation = previous.catch(() => []).then(async () => {
      const current = getCachedSessions().find(session => session.id === sessionId)
      if (!current) throw new Error('会话不存在')
      const patch = { ...update(current), updatedAt: Date.now() }
      await upsertSession(normalizeSession({ ...current, ...patch }))
      return updateCachedSessions(getCachedSessions().map(session => session.id === sessionId ? { ...session, ...patch } : session))
    })
    durableWrites.set(sessionId, operation)
    try { return await operation } finally { if (durableWrites.get(sessionId) === operation) durableWrites.delete(sessionId) }
  },

  async updateMetadataDurable(sessionId: string, updates: Partial<TranscriptSession>): Promise<TranscriptSession[]> {
    return this.mutateDurable(sessionId, () => updates)
  },

  saveProgress(sessionId: string, snapshot: SessionProgressSnapshot): TranscriptSession[] {
    const now = Date.now()
    const sessions = updateSessionCollection(getCachedSessions(), sessionId, {
      realtime: snapshot.realtime,
      transcript: snapshot.transcript,
      tokens: snapshot.tokens,
      providerId: snapshot.providerId,
      speakers: snapshot.speakers,
      segments: snapshot.segments,
      sourceMeta: snapshot.sourceMeta,
      translatedTranscript: snapshot.translatedTranscript,
      postProcess: snapshot.postProcess,
      status: 'recording',
      lastPersistedAt: now,
    })

    return persistSingleSession(sessionId, sessions)
  },

  completeSession(sessionId: string, snapshot: SessionProgressSnapshot): TranscriptSession[] {
    const now = Date.now()
    const sessions = updateSessionCollection(getCachedSessions(), sessionId, {
      realtime: snapshot.realtime,
      transcript: snapshot.transcript,
      tokens: snapshot.tokens,
      providerId: snapshot.providerId,
      speakers: snapshot.speakers,
      segments: snapshot.segments,
      sourceMeta: snapshot.sourceMeta,
      translatedTranscript: snapshot.translatedTranscript,
      postProcess: snapshot.postProcess,
      status: 'completed',
      lastPersistedAt: now,
    })

    return persistSingleSession(sessionId, sessions)
  },

  acknowledgeInterrupted(sessionId: string): TranscriptSession[] {
    const sessions = updateSessionCollection(getCachedSessions(), sessionId, {
      status: 'completed',
    })

    return persistSingleSession(sessionId, sessions)
  },

  replaceAllSessions(sessions: TranscriptSession[]): TranscriptSession[] {
    return persistSessions(sessions)
  },

  deleteSession(sessionId: string): TranscriptSession[] {
    const sessions = getCachedSessions().filter((session) => session.id !== sessionId)
    return persistSessionDeletion(sessionId, sessions)
  },

  async deleteSessionDurable(sessionId: string): Promise<TranscriptSession[]> {
    const previous = durableWrites.get(sessionId) ?? Promise.resolve([])
    const operation = previous.catch(() => []).then(async () => {
      await deleteSessionById(sessionId)
      return updateCachedSessions(getCachedSessions().filter(session => session.id !== sessionId))
    })
    durableWrites.set(sessionId, operation)
    try { return await operation } finally { if (durableWrites.get(sessionId) === operation) durableWrites.delete(sessionId) }
  },
}
