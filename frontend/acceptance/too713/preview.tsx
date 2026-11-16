import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import '../../src/index.css'
import { saveSessions, saveTopics, saveSettings, saveTags } from '../../src/utils/storage'
import { getDefaultSettings } from '../../src/utils/storageShared'
import { normalizeTranscriptSession } from '../../src/utils/sessionSchema'
import { useUIStore } from '../../src/stores/uiStore'
import { useSessionStore } from '../../src/stores/sessionStore'
import { useTopicStore } from '../../src/stores/topicStore'
import { sessionRepository } from '../../src/utils/sessionRepository'

if (window.electronAPI?.isElectron) throw new Error('验收页仅用于独立测试环境')
const now = new Date()
const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
if (!localStorage.getItem('too713-seeded')) {
  saveSettings({ ...getDefaultSettings(), currentVendor: 'volc', recordingMode: 'audio-only', autoCheckUpdate: false, aiPostProcess: { enabled: false } })
  saveTopics([
    { id: 'topic-a', name: '小程序', emoji: '📝', createdAt: 1, updatedAt: 1 },
    { id: 'topic-b', name: '产品与设计', emoji: '💡', createdAt: 1, updatedAt: 1 },
  ])
  saveTags([{ id: 'tag-a', name: '需求', color: 'blue', createdAt: 1 }])
  await saveSessions([
    ['meeting-a', '小程序发布讨论', 'topic-a', ['tag-a']],
    ['meeting-b', '产品设计复盘', 'topic-b', []],
    ['meeting-c', '未分类访谈', undefined, []],
  ].map(([id, title, topicId, tagIds], i) => normalizeTranscriptSession({
    id, title, topicId, tagIds, date, time: `1${i}:00`, createdAt: now.getTime()-i*1000, updatedAt: now.getTime(),
    transcript: '这是用于主题归属验收的合成会议。加入或更换主题不会复制或删除文字。', duration: 60000, status: 'completed',
  })))
  localStorage.setItem('delive_last_seen_version', '2.3.0')
  localStorage.setItem('too713-seeded', 'yes')
}
useUIStore.getState().setView('review')
document.title = 'TOO-713 · 正式组件隔离验收'

function Preview() {
  const ui = useUIStore()
  return <div className="h-screen flex flex-col"><style>{`.app-workspace { height: calc(100dvh - 32px); }`}</style><div className="relative z-50 flex h-8 shrink-0 flex-wrap gap-3 bg-muted p-2 text-xs text-foreground">
    <strong>TOO-713 隔离验收 · 合成数据</strong>
    <button onClick={() => ui.setTheme(ui.resolvedTheme === 'dark' ? 'light' : 'dark')}>切换明暗</button>
    <button onClick={() => void (async () => {
      const topicId = useTopicStore.getState().activeTopicId
      if (!topicId) throw new Error('先从主题页进入录制')
      const id = useSessionStore.getState().startNewSession()
      await useSessionStore.getState().updateSessionTopic(id, topicId)
      useSessionStore.getState().applyTranscriptEvent({ type: 'final-text', text: '合成录音完成后的文字，验证主题和回顾使用同一记录。' })
      useSessionStore.getState().endCurrentSession()
      await sessionRepository.waitForSessionWrite(id)
      ui.setView('review')
    })()}>模拟当前主题录音落盘</button>
  </div><div className="min-h-0 flex-1"><App /></div></div>
}
const root = createRoot(document.getElementById('root')!)
root.render(<Preview />)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
