import { format } from 'date-fns'
import { getTranslations } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useTagStore } from '../../stores/tagStore'
import { useTopicStore } from '../../stores/topicStore'
import { useUIStore } from '../../stores/uiStore'
import { saveSessions } from '../../utils/sessionStorage'
import { sessionRepository } from '../../utils/sessionRepository'
import { historyMeetings, historyMetadata } from './historyFixtures'
import { installPreviewBridge } from '../product/previewBridge'

function daysBefore(date: Date, days: number) {
  const value = new Date(date)
  value.setDate(value.getDate() - days)
  return value
}

const older = [
  [7, '发版前检查与验收记录', '小程序', '上线准备'],
  [8, '转写任务失败恢复演练', '音频体验', '技术排障'],
  [11, '桌面工作台设计评审', '产品设计', '产品评审'],
  [13, '文件导入与导出流程走查', '产品设计', '产品评审'],
  [14, '小游戏更新内容确认', '小程序', '上线准备'],
  [17, '十月交付问题回访', '团队周会', '复盘'],
  [25, '十一月目标与排期', '团队周会', '产品评审'],
  [32, '收音设备切换与输入电平', '音频体验', '原音回放'],
  [32, '会议纪要模板讨论', '产品设计', '阅读体验'],
  [38, '小游戏首轮内部体验反馈', '小程序', '产品评审'],
  [54, '桌面端主题切换走查', '产品设计', '阅读体验'],
  [78, '录制与本地存储问题复盘', '音频体验', '复盘'],
] as const

export function createReviewHomeFixtures(today: Date) {
  const createdAt = today.getTime()
  const topics = [...new Set([...Object.values(historyMetadata).map(item => item.topic), ...older.map(item => item[2])])]
    .map((name, index) => ({ id: `home-topic-${index}`, name, emoji: '📁', createdAt, updatedAt: createdAt }))
  const tags = [...new Set([...Object.values(historyMetadata).flatMap(item => item.tags.split('，')), ...older.map(item => item[3])])]
    .map((name, index) => ({ id: `home-tag-${index}`, name, color: 'purple' }))
  const metadata = (age: number, time: string, topic: string, labels: string[]) => {
    const date = format(daysBefore(today, age), 'yyyy-MM-dd')
    const stamp = new Date(`${date}T${time}:00`).getTime()
    return { date, time, createdAt: stamp, updatedAt: stamp, topicId: topics.find(item => item.name === topic)?.id,
      tagIds: tags.filter(item => labels.includes(item.name)).map(item => item.id) }
  }
  const dates = [0, 0, 1, 1, 3, 5, 18]
  const sessions = historyMeetings.map((item, index) => {
    const { topic, tags: labels } = historyMetadata[item.id]
    const title = index === 1 ? '产品周会：小程序上线安排、审核反馈与录制工作台改版后的跨团队验收清单' : item.title
    return { ...structuredClone(item), title, ...metadata(dates[index], item.time, topic, labels.split('，')) }
  }).concat(older.map(([age, title, topic, label], index) => ({
    id: `home-meeting-${index}`, title, transcript: title + '。记录了本次讨论的要点和后续安排。',
    status: 'completed' as const, duration: (10 + index * 2) * 60_000,
    ...metadata(age, index % 2 ? '16:30' : '10:00', topic, [label]),
  })))

  return { sessions, topics, tags }
}

export async function prepareReviewHome(today: Date) {
  const { sessions, topics, tags } = createReviewHomeFixtures(today)
  installPreviewBridge()
  await saveSessions(sessions)
  const loaded = await sessionRepository.loadForLaunch()
  useSessionStore.setState({ sessions: loaded.sessions })
  useTopicStore.setState({ topics, activeTopicId: null, selectedTopicId: null })
  useTagStore.setState({ tags, selectedTagIds: [], searchQuery: '' })
  useUIStore.setState({ language: 'zh', t: getTranslations('zh') })
  const ui = useUIStore.getState()
  ui.initTheme()
  ui.setView('review')
}
