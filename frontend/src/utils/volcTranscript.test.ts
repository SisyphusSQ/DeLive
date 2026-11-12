import { describe, it, expect } from 'vitest'
import { parseVolcSnapshot } from './volcTranscript'
import { applyTranscriptEvent, createEmptyTranscriptRuntimeState } from './transcriptState'
import { normalizeTranscriptSession } from './sessionSchema'
import { buildSessionSnapshot } from './sessionSnapshot'
import { buildRuntimeStateFromSession } from './sessionLifecycle'
const raw = (text: string, definite = false, speaker?: string) => ({ result: { text, utterances: [
  { text, start_time: 100, end_time: 900, definite, additions: { speaker_id: speaker, accessKey: 'must-not-persist' } },
] } })
describe('full snapshots and recognition-scoped identities', () => {
  it('replaces revisions and duplicates, preserves unknown/provisional state and raw allowlist', () => {
    let state = createEmptyTranscriptRuntimeState()
    for (const [revision, text] of ['你', '你好', '你好'].entries()) {
      state = applyTranscriptEvent(state, { type: 'realtime', snapshot: parseVolcSnapshot(raw(text), 'a', 2000, revision + 1, false) })
    }
    expect(state.currentTranscript).toBe('你好')
    expect(state.currentSegments).toHaveLength(1)
    expect(state.currentSegments[0]).toMatchObject({ startMs: 2100, endMs: 2900, isFinal: false })
    expect(state.currentSegments[0].speakerId).toBeUndefined()
    expect(JSON.stringify(state.realtime)).not.toContain('must-not-persist')
    state = applyTranscriptEvent(state, { type: 'realtime', snapshot: parseVolcSnapshot(raw('您好', true, '0'), 'a', 2000, 4, true) })
    expect(state.currentTranscript).toBe('您好')
    state = applyTranscriptEvent(state, { type: 'config-change', description: 'test switch' })
    state = applyTranscriptEvent(state, { type: 'realtime', snapshot: parseVolcSnapshot(raw('您好', true, '0'), 'a', 2000, 5, true) })
    expect(state.currentTranscript).toBe('您好')
    expect(state.realtime?.[0].status).toBe('complete')
  })
  it('never merges speaker 0 after reconnect and retains offsets across persistence/reopen', () => {
    let state = createEmptyTranscriptRuntimeState()
    for (const [id, offset] of [['a', 0], ['b', 12000]] as const) state = applyTranscriptEvent(state, {
      type: 'realtime', snapshot: parseVolcSnapshot(raw(id, true, '0'), id, offset, 1, true),
    })
    expect(state.currentTranscript).toBe('ab')
    expect(state.currentSpeakers).toHaveLength(2)
    expect(state.currentSpeakers[0].id).not.toBe(state.currentSpeakers[1].id)
    const saved = normalizeTranscriptSession({ id: 'session', ...buildSessionSnapshot({ runtimeState: state }) })
    const restored = buildRuntimeStateFromSession(saved)
    expect(restored.currentSegments[1].startMs).toBe(12100)
    expect(restored.realtime).toHaveLength(2)
    expect(restored.currentSegments[0].recognitionId).toBe('a')
  })
  it('does not invent timestamps or speaker labels from malformed responses', () => {
    expect(() => parseVolcSnapshot({ result: { text: 'x', utterances: [{ text: 'x' }] } }, 'a', 0, 1, false)).toThrow()
  })
  it('keeps confirmed text while a provisional utterance has no text, then accepts its next revision', () => {
    const first = { text: '第一段', start_time: 15622, end_time: 21452, definite: true }
    const pending = { start_time: 38821, end_time: 41301, definite: false }
    const snapshot = parseVolcSnapshot({ result: { text: '第一段', utterances: [first, pending] } }, 'a', 0, 1, false)
    expect(snapshot.text).toBe('第一段')
    expect(snapshot.segments).toHaveLength(1)
    expect(snapshot.segments[0]).toMatchObject({ id: 'a:0', text: '第一段', isFinal: true })
    expect(snapshot.response.utterances[1]).toMatchObject({ text: '', start_time: 38821, end_time: 41301, definite: false })
    const state = applyTranscriptEvent(createEmptyTranscriptRuntimeState(), { type: 'realtime', snapshot })
    const saved = normalizeTranscriptSession({ id: 'session', ...buildSessionSnapshot({ runtimeState: state }) })
    expect(buildRuntimeStateFromSession(saved).currentTranscript).toBe('第一段')
    const next = parseVolcSnapshot({ result: { text: '第一段第二段', utterances: [first, { ...pending, text: '第二段', end_time: 42411, definite: true }] } }, 'a', 0, 2, true)
    const updated = applyTranscriptEvent(state, { type: 'realtime', snapshot: next })
    expect(updated.currentTranscript).toBe('第一段第二段')
    expect(updated.currentSegments[1]).toMatchObject({ id: 'a:1', text: '第二段', isFinal: true })
    expect(updated.realtime?.[0].status).toBe('complete')
  })
  it.each([
    { definite: true }, { text: null, definite: false }, { text: 123, definite: false },
    { definite: false, end_time: 90 },
  ])('rejects malformed text or times instead of treating them as a pending utterance: %j', patch => {
    expect(() => parseVolcSnapshot({ result: { text: '第一段', utterances: [{ start_time: 100, end_time: 200, ...patch }] } }, 'a', 0, 1, false)).toThrow()
  })
  it('accepts omitted zero start_time from live reconnect but rejects invalid explicit times', () => {
    const utterance = { text: '元', end_time: 1199, definite: false, additions: { source: 'stream' } }
    const parse = (u: Record<string, unknown>) => parseVolcSnapshot({ result: { text: '元', utterances: [u] } }, 'reconnect', 9000, 1, false)
    expect(parse(utterance).segments[0]).toMatchObject({ startMs: 9000, endMs: 10199, isFinal: false })
    for (const start_time of [null, -1, '0', NaN, Infinity, 1200]) expect(() => parse({ ...utterance, start_time })).toThrow()
    expect(() => parse({ text: '元', definite: false })).toThrow()
  })
})
