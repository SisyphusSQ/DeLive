import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TranscriptSession } from '../types'

const sessionStorageMock = vi.hoisted(() => ({
  getSessions: vi.fn<() => Promise<TranscriptSession[]>>(),
  saveSessions: vi.fn<(sessions: TranscriptSession[]) => Promise<void>>(),
  upsertSession: vi.fn<(session: TranscriptSession) => Promise<void>>(),
  upsertSessions: vi.fn<(sessions: TranscriptSession[]) => Promise<void>>(),
  deleteSessionById: vi.fn<(sessionId: string) => Promise<void>>(),
}))

vi.mock('./sessionStorage', () => sessionStorageMock)

function makeSession(overrides: Partial<TranscriptSession> = {}): TranscriptSession {
  return {
    id: 'session-1',
    title: 'Test Session',
    date: '2026-03-09',
    time: '12:00',
    createdAt: 1,
    updatedAt: 1,
    transcript: '',
    ...overrides,
  }
}

describe('sessionRepository persistence strategy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sessionStorageMock.getSessions.mockResolvedValue([])
    sessionStorageMock.saveSessions.mockResolvedValue(undefined)
    sessionStorageMock.upsertSession.mockResolvedValue(undefined)
    sessionStorageMock.upsertSessions.mockResolvedValue(undefined)
    sessionStorageMock.deleteSessionById.mockResolvedValue(undefined)
  })

  it('persists draft creation via single-session upsert', async () => {
    const { sessionRepository } = await import('./sessionRepository')
    const draft = makeSession({ id: 'draft-1' })

    const sessions = sessionRepository.createDraft(draft)

    expect(sessions[0].id).toBe('draft-1')
    await vi.waitFor(() => expect(sessionStorageMock.upsertSession).toHaveBeenCalledTimes(1))
    expect(sessionStorageMock.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'draft-1' }),
    )
    expect(sessionStorageMock.saveSessions).not.toHaveBeenCalled()
  })

  it('persists progress updates via single-session upsert', async () => {
    const { sessionRepository } = await import('./sessionRepository')
    const draft = makeSession({ id: 'draft-2' })

    sessionRepository.createDraft(draft)
    await vi.waitFor(() => expect(sessionStorageMock.upsertSession).toHaveBeenCalledTimes(1))
    sessionStorageMock.upsertSession.mockClear()

    const sessions = sessionRepository.saveProgress('draft-2', {
      transcript: 'hello world',
    })

    expect(sessions[0].transcript).toBe('hello world')
    await vi.waitFor(() => expect(sessionStorageMock.upsertSession).toHaveBeenCalledTimes(1))
    expect(sessionStorageMock.upsertSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'draft-2',
        transcript: 'hello world',
        status: 'recording',
      }),
    )
    expect(sessionStorageMock.saveSessions).not.toHaveBeenCalled()
  })

  it('marks interrupted sessions in batch on launch recovery', async () => {
    sessionStorageMock.getSessions.mockResolvedValue([
      makeSession({ id: 'recording-1', status: 'recording', transcript: 'alpha' }),
      makeSession({ id: 'completed-1', status: 'completed', transcript: 'beta' }),
      makeSession({ id: 'recording-2', status: 'recording', transcript: 'gamma' }),
    ])

    const { sessionRepository } = await import('./sessionRepository')
    const result = await sessionRepository.loadForLaunch()

    expect(result.sessions.filter((session) => session.status === 'interrupted')).toHaveLength(2)
    expect(sessionStorageMock.upsertSessions).toHaveBeenCalledTimes(1)
    const persistedSessions = sessionStorageMock.upsertSessions.mock.calls[0]?.[0] ?? []
    expect(persistedSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'recording-1', status: 'interrupted' }),
      expect.objectContaining({ id: 'recording-2', status: 'interrupted' }),
    ]))
    expect(sessionStorageMock.saveSessions).not.toHaveBeenCalled()
  })

  it('persists upgraded sessions on launch even without interruption', async () => {
    sessionStorageMock.getSessions.mockResolvedValue([
      makeSession({ id: 'legacy-1', schemaVersion: 1, tagIds: undefined }),
    ])

    const { sessionRepository } = await import('./sessionRepository')
    const result = await sessionRepository.loadForLaunch()

    expect(result.sessions[0]).toEqual(expect.objectContaining({
      id: 'legacy-1',
      schemaVersion: 5,
      tagIds: [],
    }))
    expect(sessionStorageMock.upsertSessions).toHaveBeenCalledTimes(1)
    expect(sessionStorageMock.upsertSessions).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'legacy-1', schemaVersion: 5 }),
    ])
  })

  it('serializes simultaneous revision and machine-result writes against the latest session', async () => {
    const { sessionRepository } = await import('./sessionRepository')
    sessionRepository.createDraft(makeSession({id:'concurrent'}))
    await vi.waitFor(() => expect(sessionStorageMock.upsertSession).toHaveBeenCalledTimes(1))
    let release!: () => void
    sessionStorageMock.upsertSession.mockImplementationOnce(() => new Promise<void>(resolve => {release=resolve}))
    const one=sessionRepository.mutateDurable('concurrent', current=>({tagIds:[...(current.tagIds??[]),'manual']}))
    await Promise.resolve();await Promise.resolve()
    sessionRepository.saveProgress('concurrent', { transcript: 'latest audio' })
    const two=sessionRepository.mutateDurable('concurrent', current=>({tagIds:[...(current.tagIds??[]),'machine']}))
    release();await one
    const saved = (await two)[0]
    expect(saved.tagIds).toEqual(['manual','machine'])
    expect(saved.transcript).toBe('latest audio')
    expect(sessionStorageMock.upsertSession.mock.lastCall?.[0]).toMatchObject({transcript:'latest audio',tagIds:['manual','machine']})
  })

  it('surfaces persistence failure without publishing a false saved state and permits retry', async () => {
    const { sessionRepository } = await import('./sessionRepository')
    sessionRepository.createDraft(makeSession({id:'failure',transcript:'original'}))
    await vi.waitFor(() => expect(sessionStorageMock.upsertSession).toHaveBeenCalledTimes(1))
    sessionStorageMock.upsertSession.mockRejectedValueOnce(new Error('disk full'))
    await expect(sessionRepository.updateMetadataDurable('failure',{transcript:'unsaved'})).rejects.toThrow('disk full')
    const saved=await sessionRepository.mutateDurable('failure', current=>({title:current.transcript}))
    expect(saved[0].title).toBe('original')
  })

  it('persists interrupted AI tasks without replacing completed results or reissuing requests', async () => {
    sessionStorageMock.getSessions.mockResolvedValue([makeSession({
      id: 'ai-interrupted', status: 'completed',
      postProcess: { status: 'pending', summary: 'partial' },
      mindMap: { status: 'pending', markdown: 'partial' },
      correction: { status: 'correcting', mode: 'quick' },
      askHistory: [
        { id: 'pending', question: 'question', createdAt: 1, status: 'pending' },
        { id: 'saved', question: 'old', answer: 'saved result', createdAt: 1, status: 'success' },
      ],
    })])
    const { sessionRepository } = await import('./sessionRepository')
    const { sessions } = await sessionRepository.loadForLaunch()
    expect(sessions[0].postProcess).toMatchObject({ status: 'error', error: expect.stringContaining('中断') })
    expect(sessions[0].mindMap?.status).toBe('error')
    expect(sessions[0].correction?.status).toBe('error')
    expect(sessions[0].askHistory?.map(turn => turn.status)).toEqual(['error', 'success'])
    expect(sessions[0].askHistory?.[1].answer).toBe('saved result')
    expect(sessionStorageMock.upsertSessions).toHaveBeenCalledWith([sessions[0]])
  })

  it('uses full replace only for replaceAllSessions', async () => {
    const { sessionRepository } = await import('./sessionRepository')
    const sessions = [
      makeSession({ id: 'session-a' }),
      makeSession({ id: 'session-b', createdAt: 2, updatedAt: 2 }),
    ]

    sessionRepository.replaceAllSessions(sessions)

    expect(sessionStorageMock.saveSessions).toHaveBeenCalledTimes(1)
    expect(sessionStorageMock.upsertSession).not.toHaveBeenCalled()
    expect(sessionStorageMock.upsertSessions).not.toHaveBeenCalled()
  })
})
