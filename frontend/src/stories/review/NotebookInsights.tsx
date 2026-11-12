import { useRef, useState } from 'react'
import { ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronRight, FileText, List, Network, Sparkles } from 'lucide-react'
import { post } from './fixtures'
import { Select } from '../../components/ui/Select'
import { ActionDialog } from '../../components/ActionDialog'
import { PreviewCorrection, type PreviewState } from './NotebookExtras'
import { NotebookMapEditor } from './NotebookMap'

export type ReviewTab = '转录文本' | '摘要' | '对话' | '思维导图'
const meetingTopics = [
  { title: '把空间交还给正文', detail: '收紧会议列表，减少重复面板。说话人与时间轻轻标注，让阅读自然地往下走。', seconds: 38, leafTimes: [38, 65], leaves: ['紧凑的会议列表', '连续、舒适的正文'] },
  { title: '让原音与文字靠近', detail: '播放器持续可达，点击段落即可定位。待确认内容按需展开，原稿和会后稿始终保留。', seconds: 148, leafTimes: [102, 148], leaves: ['随时回听原音', '按需展开校正'] },
  { title: '保留熟悉的使用习惯', detail: '延续现有八种配色和明暗切换。查看稿件与采用稿件分开表达，先看设计，再接正式业务。', seconds: 196, leafTimes: [196, 744], leaves: ['配色与明暗切换', '先评审，再开发'] },
]
const tasks = ['整理回顾页参考与设计稿', '检查浅色、深色及窄窗口的阅读体验', '评审通过后，确认正式页面的实现范围']
const questions = ['这次讨论决定了什么？', '接下来要做哪些事？', '稿件切换有什么需要注意的？']
const answers = [
  { text: '先做一版舒适的笔记式回顾页：正文成为主角，播放器持续可达，校正内容按需展开。现有配色与明暗切换继续保留，设计评审通过后再进入正式开发。', refs: [38, 148, 196] },
  { text: '接下来先整理回顾页设计稿，检查主题切换和窄窗口下的阅读体验，再一起评审布局。会议没有为每项工作明确负责人，因此这里不补写负责人。', refs: [196, 744] },
  { text: '“查看”与“采用”是两件事。切换正在阅读的版本，不应改变导出和 AI 使用的稿件；采用时需要明确提示。原稿继续保留，图片仍沿会议原音时间保存。', refs: [244, 428] },
]
const stamp = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export function NotebookInsights({ tab, available, stale, onJump, timed = true, state, onState, onApply, onRevise, onImage, hasImages, seedQuestion = '', imagesOnly = false }: { tab: ReviewTab; available: boolean; stale: boolean; onJump: (seconds: number) => void; timed?: boolean; state: PreviewState; onState: (state: PreviewState) => void; onApply: (kind: 'title' | 'tags') => void; onRevise: (text: string) => void; onImage: () => void; hasImages: boolean; seedQuestion?: string; imagesOnly?: boolean }) {
  const topics = imagesOnly ? [
    { title: '左侧是会议列表', detail: '草图用窄列组织会议入口，右侧留给正文。', seconds: 0, leafTimes: [0, 1], leaves: ['紧凑列表', '阅读正文'] },
    { title: '内容按行展开', detail: '草图中正文以连续行呈现，没有给每段添加独立卡片。', seconds: 0, leafTimes: [2, 3], leaves: ['连续排版', '轻量分隔'] },
    { title: '尚待补充的资料', detail: '图片没有提供决策、负责人、截止时间或说话人，不能据此推断。', seconds: 0, leafTimes: [4, 5], leaves: ['补充文字说明', '确认设计细节'] },
  ] : meetingTopics
  const [done, setDone] = useState<number[]>([])
  const [conversations, setConversations] = useState([{ id: 1, title: '回顾页设计决策', messages: [imagesOnly ? { question: '这张图片表达了什么？', text: '这张合成草图展示了左侧会议列表和右侧连续正文。图片没有明确负责人、截止时间或会议决定，不能从图中补写这些信息。', refs: [] } : { question: questions[0], ...answers[0] }] }])
  const [conversationId, setConversationId] = useState(1), [deleteChat, setDeleteChat] = useState(false), [feedback, setFeedback] = useState('')
  const conversation = conversations.find(c => c.id === conversationId)!
  const messages = conversation.messages
  const setMessages = (update: (current: typeof messages) => typeof messages) => setConversations(current => current.map(c => c.id === conversationId ? { ...c, messages: update(c.messages) } : c))
  const blocked = state === 'unconfigured' || state === 'generating'
  const [generated, setGenerated] = useState(false)
  const [inputSeed, setInputSeed] = useState(seedQuestion)
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setFeedback('已复制消息') } catch { setFeedback('复制失败，可直接选择文字复制') } }
  const newChat = () => { const id = Date.now(); setConversations(c => [...c, { id, title: `新对话 ${c.length + 1}`, messages: [] }]); setConversationId(id); setQuestion('') }
  const [question, setQuestion] = useState(seedQuestion)
  if (seedQuestion !== inputSeed) { setInputSeed(seedQuestion); setQuestion(seedQuestion) }
  const [outline, setOutline] = useState(false), [folded, setFolded] = useState<number[]>([]), [selectedSource, setSelectedSource] = useState<number | null>(null)
  const replyEnd = useRef<HTMLDivElement>(null)
  const send = (text: string) => {
    if (!text.trim() || blocked) return
    const index = questions.indexOf(text.trim())
    // shortcut: answers are fixed design fixtures; replace only when real AI integration is authorized.
    const answer = imagesOnly ? { text: '当前只有布局草图，能确认左侧列表和右侧正文结构；无法据此回答会议决定或稿件规则。请补充相关文字资料。', refs: [] } : answers[index] ?? { text: '这是本地设计预览，暂时不能回答新的问题。可以试试下方的三个示例问题，体验回答与原文引用。', refs: [] }
    setMessages(current => [...current, { question: text.trim(), ...answer }])
    setQuestion('')
    requestAnimationFrame(() => replyEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  const citation = (seconds: number) => <button key={seconds} className="insight-citation" aria-label={imagesOnly ? '查看引用图片' : `查看原文 ${timed ? stamp(seconds) : '文字段落'}`} onClick={() => imagesOnly ? onImage() : onJump(seconds)}><FileText size={12} />{imagesOnly ? '图片原图' : timed ? stamp(seconds) : '文字原文'}<ArrowUpRight size={12} /></button>
  return <><section hidden={available || tab === '转录文本'} className="note-empty" aria-label={`${tab}暂无内容`}><FileText size={28} /><h2>还没有可整理的资料</h2><p>已有文字或图片即可使用 AI，无需逐句时间。<br />这条记录尚无对应的合成结果。</p><button className="note-text-button" onClick={() => onJump(0)}>查看会议资料<ArrowUpRight size={14} /></button></section><div hidden={!available || tab === '转录文本'} className="notebook-insights">
    <div className="insight-provenance"><span><Sparkles size={12} />{imagesOnly ? '结果来源：合成布局草图 · 仅图片' : timed ? '结果来源：会后稿与图片示例' : '基于已有文字与图片 · 无时间定位'}</span><span>合成结果 · 未调用 AI</span></div>
    <div className="note-tools insight-actions"><button className="note-text-button" disabled={blocked} onClick={() => { setGenerated(true); onState('generating') }}>{generated ? '重新生成' : `重新生成${tab === '对话' ? '回答' : tab}`}</button>{state === 'generating' && <button className="note-text-button" onClick={() => { onState('ready'); setFeedback('生成已停止，原有内容保留') }}>停止</button>}<span>来源与结果独立保存</span></div>
    {stale && state !== 'stale' && <p className="insight-stale" role="status">采用稿或图片资料已改变；以下仍是基于此前资料的示例内容，尚未重新生成。</p>}
    <section hidden={tab !== '摘要'} aria-label="会议摘要" className="insight-summary">
      <div className="insight-section-title"><span className="note-eyebrow">一页读懂这场会议</span><span className="insight-reading-time">约 1 分钟</span></div>
      <h2>{imagesOnly ? '从一张草图开始回顾' : '让回顾，像读一页笔记'}</h2>
      <p className="insight-lead">{imagesOnly ? '这张图片展示了会议列表与正文的布局关系。以下仅描述可见内容，不推断未记录的会议决定。' : '这次讨论围绕一个共同目标：减少阅读之前的操作，让内容、原音和校正之间的关系更清楚。'}</p>
      <div className="insight-keywords"><span>阅读体验</span><span>{imagesOnly ? '连续正文' : '原音联动'}</span><span>{imagesOnly ? '页面布局' : '保留主题'}</span></div>
      <details className="note-disclosure"><summary>会议信息建议<span>标题 · 标签 · 章节</span></summary><div className="note-panel-content"><p>建议标题：{imagesOnly ? '回顾页布局草图' : '让回顾，像读一页笔记'}</p><div className="note-tools"><button className="note-text-button" onClick={() => onApply('title')}>应用建议标题</button><button className="note-text-button" onClick={() => onApply('tags')}>应用建议标签</button></div><ol className="note-chapters">{topics.map((topic, i) => <li key={topic.title}><strong>0{i + 1} · {topic.title}</strong><p>{topic.detail}</p>{citation(topic.seconds)}</li>)}</ol></div></details>
      {imagesOnly && <p className="insight-footnote">暂无文字可校对；可继续基于图片整理摘要和提问。</p>}
      <PreviewCorrection blocked={blocked || imagesOnly} saveFailed={state === 'saveFailed'} onSave={onRevise} />
      <h3 className="insight-heading">{imagesOnly ? '图中可见的信息' : '达成的共识'}<span>03</span></h3>
      <ol className="insight-decisions">{topics.map((topic, i) => <li key={topic.title}><span className="insight-number">0{i + 1}</span><div><h4>{topic.title}</h4><p>{topic.detail}</p>{citation(topic.seconds)}</div></li>)}</ol>
      <h3 className="insight-heading" hidden={imagesOnly}>接下来要做的事<span aria-live="polite">{done.length} / {tasks.length}</span></h3>
      <div className="insight-tasks" hidden={imagesOnly}>{tasks.map((task, i) => <label key={task} className={done.includes(i) ? 'is-done' : ''}><input type="checkbox" checked={done.includes(i)} onChange={() => setDone(current => current.includes(i) ? current.filter(n => n !== i) : [...current, i])} /><span>{task}</span></label>)}</div>
      <p className="insight-footnote">{imagesOnly ? '图片未提供待办、负责人或截止时间，不生成待办。' : '勾选仅保留在本次预览中 · 会议未明确逐项负责人和截止时间'}</p>
      <div className="insight-closing" hidden={imagesOnly}><Check size={16} /><p>先确认阅读体验，再进入正式开发。</p>{citation(744)}</div>
    </section>
    <section hidden={tab !== '对话'} aria-label="会议对话" className="insight-chat">
      <div className="insight-section-title"><span className="note-eyebrow">从会议里找到答案</span><button className="note-text-button" disabled={blocked} onClick={newChat}>新建对话</button></div>
      <div className="note-tools"><Select aria-label="历史对话" value={String(conversationId)} onChange={e => { setConversationId(Number(e.target.value)); setQuestion('') }}>{conversations.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</Select><button className="note-text-button" disabled={blocked} onClick={() => setDeleteChat(true)}>删除此对话</button></div>
      <h2>再问问这场会议</h2><p className="insight-lead">把想法接着聊下去，重要的回答可以回到原文。</p>
      <div className="insight-messages" aria-live="polite">{messages.map((message, i) => <article className="insight-exchange" key={i}>
        <div className="insight-question"><span>你</span><p>{message.question}</p><button className="note-text-button" aria-label={`复制第 ${i + 1} 个问题`} onClick={() => void copy(message.question)}>复制</button></div>
        <div className="insight-answer"><span className="insight-assistant"><Sparkles size={14} />会议助手<small>示例回答</small></span><p>{message.text}</p>{(message.refs.length > 0 || hasImages) && <div className="insight-answer-sources"><span>参考原文</span>{message.refs.map(citation)}{hasImages ? <button className="insight-citation" onClick={onImage}>图片 · 阅读布局草图</button> : <span>原引用图片已移除</span>}</div>}<div className="note-tools"><button className="note-text-button" onClick={() => void copy(message.text)}>复制回答</button><button className="note-text-button" disabled={blocked} onClick={() => { onState('generating'); setFeedback('正在重新生成此回答，旧回答保留') }}>重新生成此回答</button></div></div>
      </article>)}{!messages.length && <p className="insight-chat-empty">从下面选一个问题，开始回顾。</p>}<div ref={replyEnd} /></div>
      <div className="insight-suggestions" aria-label="示例问题">{questions.map(text => <button key={text} disabled={blocked} onClick={() => send(text)}>{text}<ArrowUpRight size={12} /></button>)}</div>
      <form className="insight-composer" onSubmit={event => { event.preventDefault(); send(question) }}>
        <textarea aria-label="向会议提问" placeholder="关于这场会议，你还想了解什么？" maxLength={600} rows={2} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(question) } }} />
        <div><span>Enter 发送 · Shift+Enter 换行 · 本地示例</span><button type="submit" className="note-primary" aria-label="发送问题" disabled={blocked || !question.trim()}><ArrowUp size={16} /></button></div>
      </form>
    </section>
    <section hidden={tab !== '思维导图'} aria-label="会议思维导图" className="insight-mindmap">
      <div className="insight-section-title"><span className="note-eyebrow">把讨论串起来</span><div className="insight-view-switch" aria-label="导图视图"><button aria-pressed={!outline} onClick={() => setOutline(false)}><Network size={13} />导图</button><button aria-pressed={outline} onClick={() => setOutline(true)}><List size={13} />大纲</button></div></div>
      <h2>一个目标，三个方向</h2><p className="insight-lead">从阅读、校对到使用习惯，沿着分支回看讨论。</p>
      <NotebookMapEditor visible={available && tab === '思维导图'} outline={outline} initialMarkdown={imagesOnly ? "# 回顾页布局草图\n## 左侧列表\n- 紧凑会议入口\n## 右侧正文\n- 连续阅读\n## 待补充\n- 决策与负责人未知" : undefined} saveFailed={state === 'saveFailed'}><div className={outline ? 'insight-map is-outline' : 'insight-map'}>
        <div className="insight-map-root"><span className="note-dot" /><strong>更舒适的<br />会议回顾</strong></div>
        <ul className="insight-map-branches">{topics.map((topic, i) => <li key={topic.title}>
          <button className="insight-branch-title" aria-expanded={!folded.includes(i)} onClick={() => setFolded(current => current.includes(i) ? current.filter(n => n !== i) : [...current, i])}>{folded.includes(i) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<span>{topic.title}</span><small>2</small></button>
          {!folded.includes(i) && <ul className="insight-map-leaves">{topic.leaves.map((leaf, leafIndex) => <li key={leaf}><button aria-pressed={selectedSource === topic.leafTimes[leafIndex]} onClick={() => setSelectedSource(topic.leafTimes[leafIndex])}>{leaf}<ArrowUpRight size={11} /></button></li>)}</ul>}
        </li>)}</ul>
      </div>
      </NotebookMapEditor>{selectedSource === null ? <p className="insight-footnote">点击主题收起分支，点击末级节点查看对应原文。</p> : <aside className="insight-source-detail" aria-label="导图原文引用"><div className="insight-section-title"><strong>{topics.find(topic => topic.leafTimes.includes(selectedSource))?.title}</strong>{citation(selectedSource)}</div><p>{imagesOnly ? '合成布局草图，不包含逐句文字。' : post.segments.find(s => s.startMs === selectedSource * 1000)?.text}</p></aside>}
    </section>
    {feedback && <p className="insight-footnote" role="status">{feedback}</p>}
    <ActionDialog open={deleteChat} title="删除此对话？" description="仅删除本次预览中的这段会话，会议文字、图片和其他对话保留。" onClose={() => setDeleteChat(false)} actions={[{ label: '取消', onClick: () => setDeleteChat(false) }, { label: '删除对话', variant: 'danger', onClick: () => { const next = conversations.filter(c => c.id !== conversationId); const fallback = { id: Date.now(), title: '新对话', messages: [] }; setConversations(next.length ? next : [fallback]); setConversationId(next[0]?.id ?? fallback.id); setDeleteChat(false) } }]} />
  </div></>
}
