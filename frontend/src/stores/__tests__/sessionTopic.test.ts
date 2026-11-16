import { beforeEach, afterEach, expect, it, vi } from 'vitest'
// The store reads window/localStorage at import time; give it in-memory stand-ins.
vi.hoisted(() => {
  const memory = new Map<string, string>()
  const localStorageStub = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    key: () => null,
    length: 0,
    clear: () => memory.clear(),
  }
  const globals = globalThis as Record<string, unknown>
  globals.localStorage = localStorageStub
  globals.window = { localStorage: localStorageStub, addEventListener() {}, removeEventListener() {} }
})


import { useSessionStore } from '../sessionStore'
import { useTopicStore } from '../topicStore'
import * as storage from '../../utils/sessionStorage'
import { normalizeTranscriptSession } from '../../utils/sessionSchema'

beforeEach(async () => {
  localStorage.clear()
  await storage.saveSessions([normalizeTranscriptSession({
    id: 'meeting', title: '已有会议', date: '2026-11-16', time: '12:00', createdAt: 1, updatedAt: 1,
    status: 'completed', transcript: '保留原文', audioRecordingId: 'audio',
    versions: [{ id: 'original', kind: 'realtime', createdAt: 1, text: '保留原文', segments: [], speakers: [] }],
    selectedVersionId: 'original',
  })])
  await useSessionStore.getState().loadSessions()
})
afterEach(() => vi.restoreAllMocks())

it('加入、更换、移出后重载保留归属和同一份内容、音频与版本', async () => {
  const original = useSessionStore.getState().sessions[0]
  for (const topicId of ['topic-a', 'topic-b', undefined]) {
    await useSessionStore.getState().updateSessionTopic('meeting', topicId)
    await useSessionStore.getState().loadSessions()
    expect(useSessionStore.getState().sessions).toHaveLength(1)
    const current = useSessionStore.getState().sessions[0]
    expect(current.topicId).toBe(topicId)
    expect(current).toMatchObject({ id: original.id, transcript: original.transcript,
      audioRecordingId: original.audioRecordingId, versions: original.versions, selectedVersionId: original.selectedVersionId })
  }
})

it('保存失败时向调用方报告错误，内存和持久化保留原归属', async () => {
  await useSessionStore.getState().updateSessionTopic('meeting', 'topic-a')
  vi.spyOn(storage, 'upsertSession').mockRejectedValueOnce(new Error('磁盘写入失败'))
  await expect(useSessionStore.getState().updateSessionTopic('meeting', 'topic-b')).rejects.toThrow('磁盘写入失败')
  expect(useSessionStore.getState().sessions[0].topicId).toBe('topic-a')
  await useSessionStore.getState().loadSessions()
  expect(useSessionStore.getState().sessions[0].topicId).toBe('topic-a')
  await useSessionStore.getState().updateSessionTopic('meeting', 'topic-b')
  expect(useSessionStore.getState().sessions[0].topicId).toBe('topic-b')
})

it('删除主题后重载只解除归属并保留录音', async () => {
  const topic = useTopicStore.getState().addTopic('项目', '📝')
  await useSessionStore.getState().updateSessionTopic('meeting', topic.id)
  useTopicStore.getState().deleteTopic(topic.id)
  await useSessionStore.getState().loadSessions()
  expect(useSessionStore.getState().sessions).toHaveLength(1)
  expect(useSessionStore.getState().sessions[0]).toMatchObject({ id: 'meeting', topicId: undefined, audioRecordingId: 'audio', transcript: '保留原文' })
})
