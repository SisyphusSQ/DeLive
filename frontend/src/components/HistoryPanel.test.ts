import { beforeEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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


import { getTranslations } from '../i18n'
import { HistoryPanel } from './HistoryPanel'
import { SummaryTab } from './review/SummaryTab'
import { useSessionStore } from '../stores/sessionStore'
import { useTopicStore } from '../stores/topicStore'
import { useTagStore } from '../stores/tagStore'
import { useUIStore } from '../stores/uiStore'
import { normalizeTranscriptSession } from '../utils/sessionSchema'

beforeEach(() => {
  const date = new Date().toISOString().split('T')[0]
  useSessionStore.setState({ sessions: [
    normalizeTranscriptSession({ id: 'a', title: '主题会议甲', topicId: 'topic-a', tagIds: ['tag-a'], date, time: '10:00', transcript: '原文甲', createdAt: 1, updatedAt: 1 }),
    normalizeTranscriptSession({ id: 'b', title: '主题会议乙', topicId: 'topic-a', date, time: '11:00', transcript: '原文乙', createdAt: 2, updatedAt: 2 }),
    normalizeTranscriptSession({ id: 'c', title: '自由会议', date, time: '12:00', transcript: '原文丙', createdAt: 3, updatedAt: 3 }),
  ] })
  useTopicStore.setState({ topics: [{ id: 'topic-a', name: '小程序', emoji: '📝', createdAt: 1, updatedAt: 1 }] })
  useTagStore.setState({ searchQuery: '', selectedTagIds: [], tags: [] })
  useUIStore.setState({ reviewSessionId: 'a', language: 'zh', t: getTranslations('zh') })
  // Server rendering reads Zustand's initial snapshots rather than subscribed state.
  for (const store of [useSessionStore, useTopicStore, useTagStore, useUIStore]) Object.assign(store.getInitialState(), store.getState())
})
it.each(['full', 'rail'] as const)('%s 列表包含所有主题和未分类记录，显示归属与真实总数', variant => {
  const html = renderToStaticMarkup(createElement(HistoryPanel, { variant }))
  for (const title of ['主题会议甲', '主题会议乙', '自由会议']) expect(html).toContain(`title="${title}"`)
  expect(html).toContain('小程序')
  expect(html).toContain('3 条')
})
it('搜索及标签筛选均能找到主题录音，并显示命中数／总数', () => {
  for (const filter of [{ searchQuery: '原文乙', selectedTagIds: [] }, { searchQuery: '', selectedTagIds: ['tag-a'] }]) {
    Object.assign(useTagStore.getInitialState(), filter)
    const html = renderToStaticMarkup(createElement(HistoryPanel))
    expect(html).toContain('1/3 条')
    expect(html).toContain(`title="${filter.searchQuery ? '主题会议乙' : '主题会议甲'}"`)
    expect(html).not.toContain('title="自由会议"')
  }
})

it.each([false, true])('主题入口移出摘要后，会话概览只在有说话人时出现：%s', hasSpeakers => {
  const session = { ...useSessionStore.getState().sessions[0], speakers: hasSpeakers ? [{ id: 'speaker-1', label: '说话人 1' }] : [] }
  const html = renderToStaticMarkup(createElement(SummaryTab, { session }))
  if (hasSpeakers) expect(html).toContain('会话概览')
  else expect(html).not.toContain('会话概览')
})
