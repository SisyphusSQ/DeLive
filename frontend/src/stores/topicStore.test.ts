import { beforeEach, expect, it, vi } from 'vitest'
const persistence = vi.hoisted(() => ({ saveTopics: vi.fn(), replaceAllSessions: vi.fn() }))
vi.mock('../utils/storage', () => ({ getTopics: () => [], saveTopics: persistence.saveTopics }))
vi.mock('./sessionStore', () => ({ useSessionStore: { getState: () => ({ sessions: [{ id: 'meeting-a', topicId: 'topic-a', transcript: '保留文字', audioRecordingId: 'recording-a' }], replaceAllSessions: persistence.replaceAllSessions }) } }))
import { useTopicStore } from './topicStore'
beforeEach(() => { vi.clearAllMocks(); persistence.saveTopics.mockReset(); useTopicStore.setState({ topics: [{ id: 'topic-a', name: '原主题', emoji: '📝', createdAt: 1, updatedAt: 1 }], selectedTopicId: 'topic-a', activeTopicId: 'topic-a' }) })
it('does not report a failed edit as saved', () => {
  persistence.saveTopics.mockImplementation(() => { throw new Error('磁盘写入失败') })
  expect(() => useTopicStore.getState().updateTopic('topic-a', { name: '新名称' })).toThrow('磁盘写入失败')
  expect(useTopicStore.getState().topics[0].name).toBe('原主题')
})
it('removes only the grouping and clears selected/recording topic references', () => {
  useTopicStore.getState().deleteTopic('topic-a')
  expect(persistence.replaceAllSessions).toHaveBeenCalledWith([{ id: 'meeting-a', topicId: undefined, transcript: '保留文字', audioRecordingId: 'recording-a' }])
  expect(useTopicStore.getState()).toMatchObject({ topics: [], selectedTopicId: null, activeTopicId: null })
})
