import { useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowUpRight, Copy, Image, MessageSquare, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { ActionDialog } from '../../components/ActionDialog'
import { Select } from '../../components/ui/Select'

const questions = ['这次讨论决定了什么？', '接下来要做哪些事？', '稿件切换有什么需要注意的？']
const answers = [
  { text: '先做一版舒适的笔记式回顾页：正文成为主角，播放器持续可达，校正内容按需展开。现有配色与明暗切换继续保留，设计评审通过后再进入正式开发。', refs: [38, 148, 196] },
  { text: '接下来先整理回顾页设计稿，检查主题切换和窄窗口下的阅读体验，再一起评审布局。会议没有为每项工作明确负责人，因此这里不补写负责人。', refs: [196, 744] },
  { text: '“查看”与“采用”是两件事。切换正在阅读的版本，不应改变导出和 AI 使用的稿件；采用时需要明确提示。原稿继续保留，图片仍沿会议原音时间保存。', refs: [244, 428] },
]
type Message = { question: string; text: string; refs: number[] }
type Conversation = { id: number; title: string; messages: Message[] }

type ChatProps = {
  imagesOnly: boolean
  hasImages: boolean
  blocked: boolean
  seedQuestion: string
  citation: (seconds: number) => ReactNode
  onImage: () => void
  onRegenerate: () => void
}

export function InsightChat({ imagesOnly, hasImages, blocked, seedQuestion, citation, onImage, onRegenerate }: ChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>(() => [{
    id: 1, title: imagesOnly ? '布局草图' : '回顾页设计决策',
    messages: [imagesOnly
      ? { question: '这张图片表达了什么？', text: '草图左侧是会议列表，右侧是连续排版的正文。图中没有标注负责人或截止时间。', refs: [] }
      : { question: questions[0], ...answers[0] }],
  }])
  const [activeId, setActiveId] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [question, setQuestion] = useState(seedQuestion)
  const [previousSeed, setPreviousSeed] = useState(seedQuestion)
  if (previousSeed !== seedQuestion) { setPreviousSeed(seedQuestion); setQuestion(seedQuestion) }
  const conversation = conversations.find(item => item.id === activeId)!
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const examples = imagesOnly ? ['这张图片表达了什么？', '图里有哪些待确认的信息？'] : questions
  const suggestions = examples.filter(text => text !== conversation.messages[conversation.messages.length - 1]?.question)

  function selectConversation(id: number) {
    setActiveId(id)
    setQuestion('')
    setFeedback('')
    if (log.current) log.current.scrollTop = 0
  }
  function newChat() {
    const id = Date.now()
    setConversations(all => [...all, { id, title: '新对话', messages: [] }])
    selectConversation(id)
    input.current?.focus()
  }
  function removeChat() {
    const remaining = conversations.filter(item => item.id !== activeId)
    if (!remaining.length) remaining.push({ id: Date.now(), title: '新对话', messages: [] })
    setConversations(remaining)
    selectConversation(remaining[0].id)
    setConfirmDelete(false)
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setFeedback('已复制消息') }
    catch { setFeedback('复制失败，可选择文字复制') }
  }
  function send(text: string) {
    const prompt = text.trim()
    if (!prompt || blocked) return
    const answer = imagesOnly
      ? { text: '草图画出了左侧会议列表和右侧正文。具体决策、负责人和时间仍需要文字资料确认。', refs: [] }
      : answers[questions.indexOf(prompt)] ?? { text: '这是本地设计预览，暂时不能回答新的问题。可以点选下方的示例问题查看回答与原文引用。', refs: [] }
    setConversations(all => all.map(item => item.id === activeId ? {
      ...item, title: item.messages.length ? item.title : prompt,
      messages: [...item.messages, { question: prompt, ...answer }],
    } : item))
    setQuestion('')
    setFeedback('')
    requestAnimationFrame(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight })
  }

  return <div className="ins-panel">
    <header className="ins-head">
      <h2><MessageSquare size={16} />会议对话</h2>
      <div className="ins-actions">
        <Select aria-label="历史对话" className="ins-select" value={String(activeId)} onChange={event => selectConversation(Number(event.target.value))}>
          {conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
        <button className="ins-button" disabled={blocked} onClick={newChat}><Plus size={14} />新建对话</button>
        <button className="ins-icon" aria-label="删除此对话" title="删除此对话" disabled={blocked} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
      </div>
    </header>
    <div className="ins-chat-log" role="log" aria-label="对话记录" ref={log} tabIndex={0}>
      {conversation.messages.map((message, i) => <article className="ins-exchange" key={i}>
        <div className="ins-question">
          <span>你</span><p>{message.question}</p>
          <button className="ins-icon" aria-label={`复制第 ${i + 1} 个问题`} title="复制问题" onClick={() => void copy(message.question)}><Copy size={13} /></button>
        </div>
        <div className="ins-answer">
          <div className="ins-author"><Sparkles size={14} />会议助手</div>
          <p>{message.text}</p>
          <div className="ins-answer-footer">
            <div className="ins-sources">
              {(message.refs.length > 0 || hasImages) && <span>来源</span>}
              {message.refs.map(citation)}
              {hasImages && <button className="ins-cite" onClick={onImage}><Image size={12} />布局草图</button>}
            </div>
            <div className="ins-actions">
              <button className="ins-icon" aria-label="复制回答" title="复制回答" onClick={() => void copy(message.text)}><Copy size={13} /></button>
              <button className="ins-icon" aria-label="重新生成此回答" title="重新生成此回答" disabled={blocked} onClick={onRegenerate}><RotateCcw size={13} /></button>
            </div>
          </div>
        </div>
      </article>)}
      {!conversation.messages.length && <p className="ins-chat-empty">可以直接提问，或从下方选择一个问题。</p>}
    </div>
    <div className="ins-chat-entry">
      <div className="ins-prompts" aria-label="示例问题">{suggestions.map(text => <button key={text} disabled={blocked} onClick={() => send(text)}>{text}<ArrowUpRight size={12} /></button>)}</div>
      <form className="ins-compose" onSubmit={event => { event.preventDefault(); send(question) }}>
        <textarea ref={input} aria-label="向会议提问" placeholder="问问这场会议…" rows={2} maxLength={600} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(question) }
        }} />
        <div><span>Enter 发送 · Shift+Enter 换行</span><button aria-label="发送问题" type="submit" disabled={blocked || !question.trim()}><ArrowUp size={16} /></button></div>
      </form>
      {feedback && <p role="status" className="ins-caption">{feedback}</p>}
    </div>
    <ActionDialog open={confirmDelete} title="删除此对话？" description="删除当前会话中的问答。会议资料和其他会话会保留。" onClose={() => setConfirmDelete(false)} actions={[{ label: '取消', onClick: () => setConfirmDelete(false) }, { label: '删除对话', variant: 'danger', onClick: removeChat }]} />
  </div>
}
