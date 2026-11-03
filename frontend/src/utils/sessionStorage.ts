import type { TranscriptSession } from '../types'
import {
  createTransaction,
  getMetaValue,
  META_KEY_SESSIONS_MIGRATED,
  openAppDatabase,
  removeLocalStorageItem,
  SESSION_STORE,
  SESSION_UPDATED_AT_INDEX,
  setMetaValue,
  STORAGE_KEYS,
  supportsIndexedDb,
} from './storageShared'

function getLegacySessionsFromLocalStorage(): TranscriptSession[] {
  const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]')
  if (!Array.isArray(value)) throw new Error('会话存储格式无效，原数据未修改')
  return value
}

function saveLegacySessionsToLocalStorage(sessions: TranscriptSession[]): void {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions))
}

function clearLegacySessionsFromLocalStorage(): void {
  removeLocalStorageItem(
    STORAGE_KEYS.SESSIONS,
    'Failed to clear sessions from localStorage:',
  )
}

function upsertLegacySessionInLocalStorage(session: TranscriptSession): void {
  const sessions = getLegacySessionsFromLocalStorage()
  const index = sessions.findIndex((item) => item.id === session.id)

  if (index === -1) {
    sessions.unshift(session)
  } else {
    sessions[index] = session
  }

  saveLegacySessionsToLocalStorage(sortSessions(sessions))
}

function deleteLegacySessionFromLocalStorage(id: string): void {
  saveLegacySessionsToLocalStorage(
    sortSessions(getLegacySessionsFromLocalStorage().filter((session) => session.id !== id)),
  )
}

function sortSessions(sessions: TranscriptSession[]): TranscriptSession[] {
  return [...sessions].sort((left, right) => {
    const leftTs = Math.max(left.createdAt || 0, left.updatedAt || 0)
    const rightTs = Math.max(right.createdAt || 0, right.updatedAt || 0)
    return rightTs - leftTs
  })
}

async function readSessionsFromIndexedDb(): Promise<TranscriptSession[]> {
  const db = await openAppDatabase()
  return createTransaction<TranscriptSession[]>(db, SESSION_STORE, 'readonly', (store, resolve, reject) => {
    const sessions: TranscriptSession[] = []
    const source = store.indexNames.contains(SESSION_UPDATED_AT_INDEX)
      ? store.index(SESSION_UPDATED_AT_INDEX)
      : store
    const request = source.openCursor(null, 'prev')

    request.onerror = () => reject(request.error ?? new Error('Failed to read sessions from IndexedDB'))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(source === store ? sortSessions(sessions) : sessions)
        return
      }

      sessions.push(cursor.value as TranscriptSession)
      cursor.continue()
    }
  })
}

async function replaceSessionsInIndexedDb(sessions: TranscriptSession[]): Promise<void> {
  const db = await openAppDatabase()
  const sortedSessions = sortSessions(sessions)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, 'readwrite')
    const store = transaction.objectStore(SESSION_STORE)
    const clearRequest = store.clear()

    clearRequest.onerror = () => reject(clearRequest.error ?? new Error('Failed to clear IndexedDB sessions'))
    clearRequest.onsuccess = () => {
      for (const session of sortedSessions) {
        store.put(session)
      }
    }

    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to replace IndexedDB sessions'))
    transaction.oncomplete = () => resolve()
  })
}

async function upsertSessionInIndexedDb(session: TranscriptSession): Promise<void> {
  const db = await openAppDatabase()
  await createTransaction<void>(db, SESSION_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.put(session)
    request.onerror = () => reject(request.error ?? new Error('Failed to upsert session in IndexedDB'))
    request.onsuccess = () => resolve()
  })
}

async function upsertSessionsInIndexedDb(sessions: TranscriptSession[]): Promise<void> {
  if (sessions.length === 0) {
    return
  }

  const db = await openAppDatabase()
  const sortedSessions = sortSessions(sessions)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, 'readwrite')
    const store = transaction.objectStore(SESSION_STORE)

    for (const session of sortedSessions) {
      store.put(session)
    }

    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to upsert sessions in IndexedDB'))
    transaction.oncomplete = () => resolve()
  })
}

async function deleteSessionFromIndexedDb(id: string): Promise<void> {
  const db = await openAppDatabase()
  await createTransaction<void>(db, SESSION_STORE, 'readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onerror = () => reject(request.error ?? new Error('Failed to delete session from IndexedDB'))
    request.onsuccess = () => resolve()
  })
}

async function ensureSessionMigration(): Promise<void> {
  if (!supportsIndexedDb()) {
    return
  }

  const migrated = await getMetaValue<boolean>(META_KEY_SESSIONS_MIGRATED)
  if (migrated) {
    return
  }

  const legacySessions = getLegacySessionsFromLocalStorage()
  if (legacySessions.length > 0) {
    await replaceSessionsInIndexedDb(legacySessions)
    clearLegacySessionsFromLocalStorage()
  }

  await setMetaValue(META_KEY_SESSIONS_MIGRATED, true)
}

export async function getSessions(): Promise<TranscriptSession[]> {
  if (!supportsIndexedDb()) return getLegacySessionsFromLocalStorage()
  await ensureSessionMigration()
  return readSessionsFromIndexedDb()
}

export async function saveSessions(sessions: TranscriptSession[]): Promise<void> {
  const sorted = sortSessions(sessions)
  if (!supportsIndexedDb()) { saveLegacySessionsToLocalStorage(sorted); return }
  await ensureSessionMigration()
  await replaceSessionsInIndexedDb(sorted)
}

export async function upsertSession(session: TranscriptSession): Promise<void> {
  if (!supportsIndexedDb()) { upsertLegacySessionInLocalStorage(session); return }
  await ensureSessionMigration()
  await upsertSessionInIndexedDb(session)
}

export async function upsertSessions(sessions: TranscriptSession[]): Promise<void> {
  if (!supportsIndexedDb()) {
    const current = getLegacySessionsFromLocalStorage(), ids = new Set(sessions.map(s=>s.id))
    saveLegacySessionsToLocalStorage(sortSessions([...current.filter(s=>!ids.has(s.id)), ...sessions])); return
  }
  await ensureSessionMigration()
  await upsertSessionsInIndexedDb(sessions)
}

export async function deleteSessionById(id: string): Promise<void> {
  if (!supportsIndexedDb()) { deleteLegacySessionFromLocalStorage(id); return }
  await ensureSessionMigration()
  await deleteSessionFromIndexedDb(id)
}

export async function addSession(session: TranscriptSession): Promise<void> {
  await upsertSession(session)
}

export async function updateSession(
  id: string,
  updates: Partial<TranscriptSession>,
): Promise<void> {
  const sessions = await getSessions()
  const index = sessions.findIndex((session) => session.id === id)
  if (index !== -1) {
    await upsertSession({ ...sessions[index], ...updates, updatedAt: Date.now() })
  }
}

export async function deleteSession(id: string): Promise<void> {
  await deleteSessionById(id)
}
