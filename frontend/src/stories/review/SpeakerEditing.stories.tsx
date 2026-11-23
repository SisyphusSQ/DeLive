import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import App from '../../App'
import { fileVersion } from '../../../../shared/volcFileContract'
import { getTranslations } from '../../i18n'
import { inputFingerprint } from '../../services/aiSessionContext'
import { useUIStore } from '../../stores/uiStore'
import { normalizeTranscriptSession } from '../../utils/sessionSchema'
import { getSessions, upsertSessions } from '../../utils/sessionStorage'
import { getTopics, saveTopics } from '../../utils/settingsStorage'
import { installPreviewBridge } from '../product/previewBridge'
import { durationMs, manifest, meetings } from './fixtures'

const sessionId = 'storybook-speaker-review'
const topicId = 'storybook-speaker-topic'
const createdAt = new Date('2026-11-22T20:59:00+08:00').getTime()
const dialogue = [
  ['1', 12, '听得到吗？我们先看一下这周的发布安排。'],
  ['1', 15, '先把周四要提审的内容过一遍。'],
  ['2', 20, '可以，我把清单打开。'],
  ['1', 27, '首页的两个入口都已经改好了。今天还要确认一下，新用户第一次打开时能不能直接找到活动页。'],
  ['2', 40, '我用新的账号走了一遍，入口现在能看到。'],
  ['1', 48, '好，那剩下的就是文案和截图。'],
  ['2', 58, '截图我来整理，整理好发到评审里。'],
  ['1', 73, '发布说明我来写。周四上午再一起确认一次。'],
  ['2', 88, '行，提审的时间就按这个来。'],
] as const
const post = fileVersion('storybook-release-review', {
  text: dialogue.map(([, , text]) => text).join(''), durationMs,
  utterances: dialogue.map(([speaker, seconds, text]) => ({ speaker, text, startMs: seconds * 1000, endMs: (seconds + 3) * 1000 })),
}, '200')
post.createdAt = createdAt + durationMs
const session = normalizeTranscriptSession({
  id: sessionId, title: '转录 20:59', date: '2026-11-22', time: '20:59', createdAt, updatedAt: post.createdAt,
  status: 'completed', topicId, audioRecordingId: sessionId, duration: durationMs,
  transcript: post.text, segments: post.segments, versions: [post], selectedVersionId: post.id,
  speakers: post.speakers.map((s, i) => ({ ...s, displayName: i ? '小周' : '小林' })),
  postProcess: { status: 'success', summary: '确认周四提审安排。首页活动入口已核对，小周整理截图，小林准备发布说明，周四上午一起复查。' },
})

const earlierMeeting = normalizeTranscriptSession({
  id: 'storybook-release-checklist', title: '提审清单走查', date: session.date, time: '10:00',
  createdAt: createdAt - (10 * 60 + 59) * 60000, topicId, status: 'completed',
  transcript: '确认测试账号、审核截图和版本说明的准备进度，下午补齐剩余材料。',
})

const meta = {
  id: 'delive-speaker-editing', title: 'DeLive/说话人编辑', component: App,
  parameters: { layout: 'fullscreen' },
  beforeEach: async () => {
    const previousLang = document.documentElement.lang
    const restore = installPreviewBridge({ desktop: true, jobs: [], recording: { ...manifest, sessionId, createdAt } })
    try {
      const existing = await getSessions()
      const missing = [earlierMeeting, ...meetings].filter(item => !existing.some(saved => saved.id === item.id))
      if (!existing.some(saved => saved.id === sessionId)) {
        const fingerprint = await inputFingerprint(session, 'auto')
        missing.push({ ...session, postProcess: { ...session.postProcess, inputFingerprint: fingerprint } })
      }
      if (missing.length) await upsertSessions(missing)
      const topics = getTopics()
      if (!topics.some(topic => topic.id === topicId)) {
        saveTopics([...topics, { id: topicId, name: '小程序', emoji: '📝', description: '', createdAt, updatedAt: createdAt }])
      }
      document.documentElement.lang = 'zh-CN'
      useUIStore.setState({ language: 'zh', t: getTranslations('zh') })
      localStorage.setItem('sidebar-collapsed', 'true')
      localStorage.setItem('delive_last_seen_version', __APP_VERSION__.split('-')[0])
      useUIStore.getState().openReview(sessionId)
    } catch (error) {
      document.documentElement.lang = previousLang
      restore()
      throw error
    }
    return () => {
      document.documentElement.lang = previousLang
      restore()
    }
  },
} satisfies Meta<typeof App>
export default meta
type Story = StoryObj<typeof meta>

export const Reading: Story = {
  name: '逐字稿 · 完整流程',
  play: async ({ canvas }) => {
    const history = await canvas.findByRole('complementary', { name: '会议列表' }, { timeout: 10000 })
    await waitFor(() => expect(history).toBeVisible())
    await expect(canvas.getByRole('button', { name: /^编辑说话人（\d+人）$/ })).toBeVisible()
  },
}
export const Names: Story = {
  name: '采用稿说话人 · 批量改名',
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /^编辑说话人（\d+人）$/ }, { timeout: 10000 }))
    const dialog = await canvas.findByRole('dialog', { name: '编辑采用稿说话人' })
    await expect(getComputedStyle(dialog).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await expect(within(dialog).getByRole('button', { name: '保存并采用' })).toBeVisible()
  },
}
export const Sentence: Story = {
  name: '单句归属 · 合并段落',
  play: async ({ canvas }) => {
    const actions = await canvas.findAllByRole('button', { name: '更改本句说话人' }, { timeout: 10000 })
    await userEvent.click(actions[0])
    await expect(await canvas.findByRole('dialog', { name: '更改本句说话人' })).toBeVisible()
  },
}
