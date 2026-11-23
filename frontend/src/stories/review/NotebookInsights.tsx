import { useState } from 'react'
import { ArrowUpRight, FileText, ListChecks, ListTree, Paperclip, RotateCcw } from 'lucide-react'
import { PreviewCorrection } from './NotebookExtras'
import { NotebookMapEditor } from './NotebookMap'
import { InsightChat } from './InsightChat'
import { meetingTopics, imageTopics } from './insightFixtures'
import type { PreviewState } from './previewStates'
import '../../components/review/insight-pages.css'

export type ReviewTab = '转录文本' | '摘要' | '对话' | '思维导图'
const tasks = ['整理回顾页参考与设计稿', '检查浅色、深色及窄窗口的阅读体验', '评审通过后，确认正式页面的实现范围']
const stamp = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

type Props = {
  tab: ReviewTab
  available: boolean
  stale: boolean
  timed?: boolean
  imagesOnly?: boolean
  hasImages: boolean
  seedQuestion?: string
  state: PreviewState
  onState: (state: PreviewState) => void
  onApply: (suggestion: { title: string } | { tags: string[] }) => void
  onRevise: (text: string) => void
  onImage: () => void
  onJump: (seconds: number) => void
}

export function NotebookInsights({ tab, available, stale, onJump, timed = true, state, onState, onApply, onRevise, onImage, hasImages, seedQuestion = '', imagesOnly = false }: Props) {
  const [done, setDone] = useState<number[]>([])
  const topics = imagesOnly ? imageTopics : meetingTopics
  const blocked = state === 'unconfigured' || state === 'generating'
  const regenerate = () => onState('generating')
  const suggestedTitle = imagesOnly ? '回顾页布局草图' : '让回顾，像读一页笔记'
  const keywords = imagesOnly ? ['页面布局', '会议列表', '连续正文'] : ['阅读体验', '原音联动', '保留主题']
  const cite = (seconds: number) => <button key={seconds} className="ins-cite"
    aria-label={imagesOnly ? '查看引用图片' : `查看原文 ${timed ? stamp(seconds) : '文字段落'}`}
    onClick={() => imagesOnly ? onImage() : onJump(seconds)}>
    {imagesOnly ? '图片原图' : timed ? stamp(seconds) : '文字原文'}<ArrowUpRight size={12} />
  </button>

  return <>
    <section hidden={available || tab === '转录文本'} className="note-empty" aria-label={`${tab}暂无内容`}>
      <FileText size={26} /><h2>暂无{tab}内容</h2><p>这条会议记录还没有对应的示例结果。</p>
      <button className="note-text-button" onClick={() => onJump(0)}>查看会议资料<ArrowUpRight size={14} /></button>
    </section>
    <div className="ins-pages" hidden={!available || tab === '转录文本'}>
      <div className="ins-context">
        <span><Paperclip size={13} />{imagesOnly ? '草图' : timed ? '会后稿与图片' : '历史文字与图片'} · 合成示例</span>
        {stale && state !== 'stale' && <span role="status">采用稿或图片资料已改变，结果待更新</span>}
      </div>
      <section hidden={tab !== '摘要'} aria-label="会议摘要">
        <div className="ins-panel">
          <header className="ins-head">
            <h2><FileText size={16} />会议摘要</h2>
            <button className="ins-button" disabled={blocked} onClick={regenerate}><RotateCcw size={13} />重新生成摘要</button>
          </header>
          <div className="ins-overview">
            <p>{imagesOnly ? '草图把会议列表放在左侧，右侧以连续段落呈现正文。' : '回顾页优先展示会议正文，原音播放器始终可见，校对工具按需展开。先用设计稿确认阅读体验，再接入正式业务。'}</p>
            <div className="ins-keywords">{keywords.map(word => <span key={word}>{word}</span>)}</div>
          </div>
          <div className="ins-decisions">
            <h3>{imagesOnly ? '图中可见的信息' : '讨论要点'}</h3>
            <ul>{topics.map(topic => <li key={topic.title}>
              <div><h4>{topic.title}</h4><p>{topic.detail}</p></div>{cite(topic.seconds)}
            </li>)}</ul>
          </div>
        </div>
        {!imagesOnly && <div className="ins-panel">
          <header className="ins-head"><h2><ListChecks size={16} />行动项</h2><span className="ins-count" aria-live="polite">已完成 {done.length} / {tasks.length}</span></header>
          <div className="ins-checklist">{tasks.map((task, index) => <label key={task}>
            <input type="checkbox" checked={done.includes(index)} onChange={event => setDone(current => event.target.checked ? [...current, index] : current.filter(item => item !== index))} />
            <span>{task}</span>
          </label>)}</div>
        </div>}
        <div className="ins-panel ins-utilities">
          <header className="ins-head"><h2><ListTree size={16} />整理工具</h2></header>
          <details className="note-disclosure"><summary>会议信息建议<span>标题 · 标签 · 章节</span></summary>
            <div className="note-panel-content">
              <p>建议标题 · {suggestedTitle}</p>
              <div className="note-tools"><button className="ins-button" onClick={() => onApply({ title: suggestedTitle })}>应用建议标题</button><button className="ins-button" onClick={() => onApply({ tags: keywords })}>应用建议标签</button></div>
              <ol className="ins-chapters">{topics.map(topic => <li key={topic.title}>{topic.title}{cite(topic.seconds)}</li>)}</ol>
            </div>
          </details>
          <PreviewCorrection blocked={blocked || imagesOnly} saveFailed={state === 'saveFailed'} onSave={onRevise} />
          {imagesOnly && <p className="ins-caption">图片没有提供行动项。补充文字后可使用校对。</p>}
        </div>
      </section>
      <section hidden={tab !== '对话'} aria-label="会议对话">
        <InsightChat imagesOnly={imagesOnly} hasImages={hasImages} blocked={blocked} seedQuestion={seedQuestion} citation={cite} onImage={onImage} onRegenerate={regenerate} />
      </section>
      <section hidden={tab !== '思维导图'} aria-label="会议思维导图">
        <NotebookMapEditor visible={available && tab === '思维导图'} topics={topics} imagesOnly={imagesOnly} citation={cite} blocked={blocked} saveFailed={state === 'saveFailed'} onRegenerate={regenerate} />
      </section>
    </div>
  </>
}
