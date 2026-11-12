import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useASR } from './useASR'

const fixture = vi.hoisted(() => ({
  state: { recordingState: 'recording', realtime: [{ status: 'complete' }], currentTranscript: '',
    applyTranscriptEvent: vi.fn(), setRecordingState: vi.fn(), startNewSession: vi.fn(), endCurrentSession: vi.fn() },
  provider: { id: 'volc', isConnected: true },
  credentialIssue: vi.fn(), acquireStream: vi.fn(),
  stop: vi.fn(), disconnect: vi.fn(), update: vi.fn(),
}))
vi.mock('react', () => ({ useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }), useEffect: vi.fn() }))
vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: { currentVendor: 'volc' } }) },
  getVolcCredentialIssue: fixture.credentialIssue,
}))
vi.mock('../stores/sessionStore', () => ({ useSessionStore: Object.assign(() => fixture.state, { getState: () => fixture.state, setState: vi.fn() }) }))
vi.mock('../stores/recordingStore', () => ({ useRecordingStore: { getState: () => ({ update: fixture.update }) } }))
vi.mock('../stores/topicStore', () => ({ useTopicStore: {} }))
vi.mock('../utils/sessionRepository', () => ({ sessionRepository: { updateMetadata: vi.fn() } }))
vi.mock('../services/captureManager', () => ({ CaptureManager: class { stop = fixture.stop; acquireStream = fixture.acquireStream } }))
vi.mock('../services/providerSession', () => ({ ProviderSessionManager: class { currentProvider = fixture.provider; disconnect = fixture.disconnect } }))

describe('recording stop outcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fixture.state.recordingState = 'recording'
    fixture.state.realtime = [{ status: 'complete' }]
    fixture.state.currentTranscript = ''
    fixture.provider.id = 'volc'; fixture.provider.isConnected = true
    fixture.stop.mockResolvedValue({ sessionId: 'recording', status: 'completed', durationMs: 2000 })
    fixture.disconnect.mockResolvedValue(undefined)
  })
  it('announces no speech only after the final response and original audio are complete', async () => {
    fixture.state.realtime = [{ status: 'streaming' }]
    fixture.disconnect.mockImplementation(async () => { fixture.state.realtime = [{ status: 'complete' }] })
    await useASR().stopRecording()
    expect(fixture.update).toHaveBeenCalledWith({ asrStatus: '未识别到语音；原音已保留' })
    expect(fixture.state.endCurrentSession).toHaveBeenCalledOnce()
  })
  it('does not call a spoken recording silent', async () => {
    fixture.state.currentTranscript = '已有识别文字'
    await useASR().stopRecording()
    expect(fixture.update).toHaveBeenCalledWith({ asrStatus: '转写完成；原音已保留' })
  })
  it.each(['incomplete', 'interrupted', 'save-error', 'disconnected', 'other-provider'])('preserves failure or unrelated provider status: %s', async scenario => {
    if (scenario === 'incomplete') fixture.state.realtime.push({ status: 'incomplete' })
    if (scenario === 'interrupted') fixture.stop.mockResolvedValue({ status: 'interrupted' })
    if (scenario === 'save-error') fixture.stop.mockRejectedValue(new Error('disk full'))
    if (scenario === 'disconnected') fixture.provider.isConnected = false
    if (scenario === 'other-provider') fixture.provider.id = 'sensevoice'
    const onError = vi.fn()
    await useASR({ onError }).stopRecording()
    expect(fixture.update).not.toHaveBeenCalled()
    if (scenario === 'save-error') expect(onError).toHaveBeenCalledWith('原音保存失败：disk full')
  })
})

it('reports unavailable Volc credentials before acquiring audio or creating a session', async () => {
  vi.clearAllMocks()
  fixture.state.recordingState = 'idle'
  fixture.credentialIssue.mockReturnValue('已保存的火山凭据无法读取，请重新配置')
  const onError = vi.fn()
  await useASR({ onError }).startRecording()
  expect(onError).toHaveBeenCalledExactlyOnceWith('已保存的火山凭据无法读取，请重新配置')
  expect(fixture.acquireStream).not.toHaveBeenCalled()
  expect(fixture.state.startNewSession).not.toHaveBeenCalled()
  expect(fixture.state.setRecordingState).not.toHaveBeenCalled()
})
