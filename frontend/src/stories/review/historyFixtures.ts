import { normalizeTranscriptSession } from '../../utils/sessionSchema'
import { meeting, meetings } from './fixtures'

// Relative groups use the fixture meeting's date so this preview stays reproducible.
const earlierMeetings = [
  { date: '2026-11-09', time: '14:30', title: '原音回放与转录对齐', transcript: '检查播放进度，核对原音中断后保存的时间戳。', topic: '音频体验', tags: '原音回放，技术排障' },
  { date: '2026-11-07', time: '11:00', title: '小程序上线前走查', transcript: '复核本次上线的页面、提审资料和发布安排。', topic: '小程序', tags: '上线准备，产品评审' },
  { date: '2026-10-29', time: '16:00', title: '十月迭代复盘', transcript: '从本月交付的问题清单里整理下一轮改进。', topic: '团队周会', tags: '复盘' },
]
const extraSessions = earlierMeetings.map((item, index) => {
  const createdAt = new Date(item.date + 'T' + item.time + ':00+08:00').getTime()
  return normalizeTranscriptSession({ id: 'history-example-' + index, title: item.title, date: item.date, time: item.time,
    createdAt, updatedAt: createdAt, status: 'completed', transcript: item.transcript })
})
export const historyMeetings = [
  meeting, { ...meetings[1], title: '产品周会：小程序上线安排与本周评审清单' },
  ...meetings.slice(2), ...extraSessions,
]
export const historyMetadata: Record<string, { topic: string; tags: string }> = {
  [meeting.id]: { topic: '产品设计', tags: '阅读体验，产品评审，原音回放' },
  [meetings[1].id]: { topic: '团队周会', tags: '上线准备，产品评审' },
  [meetings[2].id]: { topic: '产品设计', tags: '阅读体验' },
  [meetings[3].id]: { topic: '团队周会', tags: '复盘' },
  ...Object.fromEntries(extraSessions.map((item, index) => [item.id, { topic: earlierMeetings[index].topic, tags: earlierMeetings[index].tags }])),
}
export const historyTopics = [...new Set(Object.values(historyMetadata).map(item => item.topic))]
