import type { TranscriptSession } from '../../types'
import type { FileTask, TranscriptVersion } from '../../../../shared/fileTranscription'
import type { RecordingManifest } from '../../../../shared/recording'
import { normalizeTranscriptSession } from '../../utils/sessionSchema'

const createdAt = new Date('2026-11-12T10:00:00+08:00').getTime()
export const durationMs = 26 * 60 * 1000
const lines = [
  ['林悦', 12, '我们今天先把会议回顾的阅读体验定下来。打开一场会议的时候，我希望先看到内容，能很自然地接着上一次的位置往下读。'],
  ['陈明', 38, '对，现在信息都在，但需要先经过好几层工具。我们可以把会议列表收紧一点，让正文像一页笔记，留出呼吸感。'],
  ['林悦', 65, '正文也不用每句话都放进一个框里。同一个人连续说的话可以在视觉上连起来，名字和时间放在旁边，想听的时候再点那一段。'],
  ['周宁', 102, '播放器最好一直看得见。比如我读到这里有点疑惑，点一下就能听原音，不需要再滚回页面顶部。'],
  ['陈明', 148, '还有校正版。平时阅读只需要知道有两处待确认，点击以后再展开对照。原稿和会后稿都保留，不能为了页面简洁就把这些信息藏没了。'],
  ['林悦', 196, '那我们先做一版回顾页的设计稿，周四一起看。色彩沿用现有主题，浅色和深色都能切换，用户不需要重新适应操作位置。'],
  ['周宁', 244, '我补充一点，切换稿件和采用稿件是两件事。正在看的版本可以改变，但导出和 AI 使用哪个版本，要有一个明确的说明。'],
  ['陈明', 310, '历史会议列表只放标题、日期和简短摘要就够了。长一点的摘要可以进入会议再读，这样找会议会轻松很多。'],
  ['林悦', 428, '图片仍然跟着会议时间保存。阅读正文时可以按需打开图片资料；切换稿件以后，图片的位置也不能跟着变化。'],
  ['周宁', 562, '遇到没有原音或没有逐句时间的历史记录，我们就明确告诉用户。文字还是可以读和导出，不要为了排版补一个并不存在的时间。'],
  ['陈明', 744, '我们用这次讨论作为合成示例。第一版先看布局和主题，确认方向后再接正式业务，这样每一步都能单独判断。'],
  ['林悦', 903, '好，今天就先按这个方向。页面里保留必要的状态和操作，把更多的空间交还给正文。'],
] as const

const speakers = ['林悦', '陈明', '周宁'].map((name, i) => ({ id: `demo:${i}`, label: `说话人 ${i + 1}`, displayName: name }))
const segments = lines.map(([name, seconds, text], i) => ({
  id: `line-${i}`, text, startMs: seconds * 1000, endMs: (seconds + 19) * 1000,
  speakerId: speakers.find(s => s.displayName === name)!.id, isFinal: true,
}))
const original: TranscriptVersion = {
  id: 'demo-live', kind: 'realtime', createdAt, speakers,
  segments: segments.map((s, i) => ({ ...s, text: i === 5 ? s.text.replace('周四', '周三') : i === 9 ? s.text.replace('可以读和导出', '可以读') : s.text })),
  text: '',
}
original.text = original.segments.map(s => s.text).join('\n')
export const post: TranscriptVersion = { id: 'demo-post', kind: 'post-meeting', createdAt: createdAt + 1800000, speakers, segments, text: segments.map(s => s.text).join('\n') }
export const corrected: TranscriptVersion = {
  ...post, id: 'demo-corrected', kind: 'reconciled', parentVersionId: original.id,
  editNote: '基于会后稿生成，仍有 2 处待确认',
  merge: {
    key: 'storybook-only', strategy: 1, baseVersionId: original.id, postVersionId: post.id, currentVersionId: original.id,
    groups: segments.map((s, i) => ({ id: `group-${i}`, baseIds: [s.id], postIds: [s.id], currentIds: [s.id], outputIds: [s.id], status: i === 5 || i === 9 ? 'pending' : 'automatic', reason: '请听原音确认此段' })),
  },
}

export const meeting = normalizeTranscriptSession({
  id: 'storybook-review', schemaVersion: 6, title: '让会议记录，更好读一点',
  date: '2026-11-12', time: '10:00', createdAt, updatedAt: createdAt,
  transcript: original.text, segments: original.segments, speakers, providerId: 'volc',
  duration: durationMs, status: 'completed', audioRecordingId: 'storybook-review',
  versions: [original, post, corrected], selectedVersionId: post.id,
  postProcess: { status: 'success', summary: '围绕回顾页的阅读体验，讨论正文布局、原音回放与校正流程。确定先完成笔记式设计，保留现有主题切换。', actionItems: ['整理回顾页参考与设计稿', '确认主题切换及窄窗口体验'], keywords: ['阅读体验', '原音回放', '设计评审'] },
})

export const meetings: TranscriptSession[] = [meeting, ...[
  ['产品周会 · 十一月第二周', '09:15', '确认本周重点和待跟进事项。'],
  ['一次关于留白的设计讨论', '16:30', '讨论信息密度、文字层级与阅读节奏。'],
  ['把这一周的进展理一理', '15:00', '回顾本周进展，整理下周计划。'],
].map(([title, time, transcript], i) => normalizeTranscriptSession({
  ...meeting, id: `storybook-meeting-${i}`, title, time, date: i === 0 ? '2026-11-12' : '2026-11-11',
  createdAt: createdAt - (i + 1) * 3600000, transcript, versions: undefined,
  selectedVersionId: undefined, postProcess: undefined, segments: [], audioRecordingId: undefined,
}))]

export const job: FileTask = {
  id: 'storybook-job', taskId: 'storybook-job', sessionId: meeting.id, recordingId: meeting.id,
  createdAt, updatedAt: createdAt, status: 'completed', durationMs, sizeBytes: 0, uploadedBytes: 0,
  objectKey: 'synthetic-only', ssdVersion: '300', enableDdc: false, cleanup: 'done', version: post,
}

export const manifest: RecordingManifest = {
  schemaVersion: 1, sessionId: meeting.id, createdAt, status: 'completed', durationMs, bytes: 0,
  blocks: Array.from({ length: durationMs / 10000 }, (_, index) => ({ index, startMs: index * 10000, frames: 160000, sampleRate: 16000, tracks: ['mix', 'system', 'microphone'], bytes: 320000 })),
  sources: [], events: [],
}

/** A short silent block exercises the real player without real meeting audio. */
export function silentBlock() {
  const buffer = new ArrayBuffer(320044), view = new DataView(buffer)
  for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  view.setUint32(4, 320036, true); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, 320000, true)
  return new Uint8Array(buffer)
}
