import { Select } from '../ui/Select'
import { useConfirmation } from '../../hooks/useConfirmation'
import { findReviewPassage } from '../../utils/reviewPassage'
import { selectedReviewVersion, timestamp } from '../../utils/reviewVersions'
import { resolveInputText } from '../../services/aiSessionContext'
import { AiStaleNotice } from './AiStaleNotice'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  MessageSquareQuote,
  MessageSquare,
  Loader2,
  Quote,
  ArrowUpRight,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  ChevronDown,
  Sparkles,
  ArrowUp,
} from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isAiPostProcessConfigured } from '../../services/aiPostProcess'
import { generateId } from '../../utils/storage'
import { TextSourceBanner } from './TextSourceBanner'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ChatTabProps {
  session: TranscriptSession
  onCitation?: (quote: string) => void
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:300ms]" />
    </div>
  )
}

function MessageActionButton({
  icon: Icon,
  label,
  onClick,
}: { icon: typeof Copy; label: string; onClick: () => void }) {
  return <button className="ins-icon" title={label} aria-label={label} onClick={onClick}><Icon size={13}/></button>
}

export function ChatTab({ session, onCitation }: ChatTabProps) {
  const { t } = useUIStore()
  const { confirm, dialog } = useConfirmation()
  const settings = useSettingsStore((state) => state.settings)
  const enableStreaming = settings.aiPostProcess?.enableStreaming !== false
  const askSessionQuestion = useSessionStore((state) => state.askSessionQuestion)
  const askSessionQuestionStreaming = useSessionStore((state) => state.askSessionQuestionStreaming)
  const deleteSessionConversation = useSessionStore((state) => state.deleteSessionConversation)
  const [questionDraft, setQuestionDraft] = useState('')
  const [activeConversationId, setActiveConversationId] = useState<string>('default')
  const [isNewThread, setIsNewThread] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const askMessagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const version = useMemo(() => selectedReviewVersion(session), [session])
  const [copyError, setCopyError] = useState('')
  const askHistory = useMemo(() => session.askHistory || [], [session.askHistory])
  const aiConfigured = isAiPostProcessConfigured(settings, 'chat')
  const askPending = askHistory.some((turn) => turn.status === 'pending')
  const hasInput = Boolean(resolveInputText(session, settings.aiPostProcess?.preferCorrectedText) || session.images?.length)
  const canAsk = aiConfigured && !askPending && hasInput
  const canSend = canAsk && Boolean(questionDraft.trim())

  useEffect(() => {
    setQuestionDraft('')
    setActiveConversationId('default')
    setIsNewThread(false)
  }, [session.id])

  const askConversations = useMemo(() => {
    const grouped = new Map<string, typeof askHistory>()
    for (const turn of askHistory) {
      const cid = turn.conversationId || 'default'
      const current = grouped.get(cid) || []
      current.push(turn)
      grouped.set(cid, current)
    }
    return Array.from(grouped.entries())
      .map(([id, turns]) => ({
        id,
        turns,
        firstTurn: turns[0],
        lastTurn: turns[turns.length - 1],
      }))
      .sort((a, b) => (b.lastTurn?.createdAt || 0) - (a.lastTurn?.createdAt || 0))
  }, [askHistory])

  const hasActiveConversation = askConversations.some((c) => c.id === activeConversationId)
  const displayedAskHistory = askHistory.filter(
    (turn) => (turn.conversationId || 'default') === activeConversationId,
  )
  const latestTurn = displayedAskHistory[displayedAskHistory.length - 1]
  const latestAskStatus = latestTurn?.status
  const latestAnswer = latestTurn?.answer

  useEffect(() => {
    if (isNewThread) return
    if (hasActiveConversation) return
    if (askConversations.length > 0) {
      setActiveConversationId(askConversations[0].id)
      return
    }
    setActiveConversationId('default')
  }, [activeConversationId, askConversations, hasActiveConversation, isNewThread])

  useEffect(() => {
    if (isNewThread && hasActiveConversation) {
      setIsNewThread(false)
    }
  }, [isNewThread, hasActiveConversation])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const log = messagesContainerRef.current
    if (log) log.scrollTo({ top: log.scrollHeight, behavior })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [displayedAskHistory.length, latestAskStatus, latestAnswer, activeConversationId, session.id, scrollToBottom])

  // Track scroll position for "scroll to bottom" button
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    setShowScrollBtn(!isNearBottom)
  }, [])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const maxHeight = 6 * 24 // ~6 lines
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [questionDraft, adjustTextareaHeight])

  const handleAskQuestion = async (question = questionDraft) => {
    if (!canAsk || !question.trim()) return
    setQuestionDraft('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    try {
      if (enableStreaming) {
        await askSessionQuestionStreaming(session.id, question, {
          conversationId: activeConversationId,
        })
      } else {
        await askSessionQuestion(session.id, question, {
          conversationId: activeConversationId,
        })
      }
    } catch (error) {
      console.error('[ChatTab] Session QA failed:', error)
    }
  }

  const handleStartNewConversation = () => {
    const newId = generateId()
    setActiveConversationId(newId)
    setIsNewThread(true)
    setQuestionDraft('')
  }

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    setIsNewThread(false)
  }, [])

  const handleDeleteConversation = async (conversationId: string) => {
    if (!await confirm(t.preview.deleteConversationConfirm)) return
    deleteSessionConversation(session.id, conversationId)
    if (activeConversationId === conversationId) {
      setActiveConversationId('default')
      setIsNewThread(false)
    }
  }

  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    setCopyError('')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(current => current === messageId ? null : current), 2000)
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleRegenerate = useCallback(async (question: string) => {
    if (!canAsk || !question.trim()) return
    try {
      if (enableStreaming) {
        await askSessionQuestionStreaming(session.id, question, {
          conversationId: activeConversationId,
        })
      } else {
        await askSessionQuestion(session.id, question, {
          conversationId: activeConversationId,
        })
      }
    } catch (error) {
      console.error('[ChatTab] Regenerate failed:', error)
    }
  }, [canAsk, session.id, activeConversationId, askSessionQuestion, askSessionQuestionStreaming, enableStreaming])

  const getConversationLabel = (
    conversationId: string,
    question: string | undefined,
    index: number,
  ) => {
    if (question?.trim()) {
      const trimmed = question.trim()
      return trimmed.length > 28 ? `${trimmed.slice(0, 28)}...` : trimmed
    }
    if (!askConversations.some((c) => c.id === conversationId)) {
      return t.preview.askNewConversationLabel
    }
    return `${t.preview.askConversation} ${index + 1}`
  }

  const askSuggestions = t.preview.askSuggestions || []
  const showNewThreadPill = isNewThread && !hasActiveConversation

  return <div className="review-pane-scroll"><div className="ins-pages review-pane review-chat-pane">
    {dialog}<div className="review-source"><TextSourceBanner session={session}/></div>
    <section className="ins-panel">
      <header className="ins-head"><h2><MessageSquare size={16}/>{t.preview.meetingChat}</h2><div className="ins-actions">
        <Select className="ins-select" aria-label={t.preview.askConversation} value={activeConversationId} onChange={e => handleSelectConversation(e.target.value)}>
          {(!askConversations.length || showNewThreadPill) && <option value={activeConversationId}>{t.preview.askNewConversationLabel}</option>}
          {askConversations.map((c,i) => <option key={c.id} value={c.id}>{getConversationLabel(c.id,c.firstTurn?.question,i)}</option>)}
        </Select>
        <button className="ins-button" disabled={!canAsk} onClick={handleStartNewConversation}><Plus size={14}/>{t.preview.askNewConversation}</button>
        <button className="ins-icon" disabled={!hasActiveConversation || askPending} aria-label={t.common.delete} title={t.common.delete} onClick={() => void handleDeleteConversation(activeConversationId)}><Trash2 size={14}/></button>
      </div></header>
      <div className="ins-chat-log" role="log" aria-label={t.preview.meetingChat} ref={messagesContainerRef} onScroll={handleScroll} tabIndex={0}>
        {!aiConfigured && <p className="review-hint">{t.preview.aiNotConfigured} <button data-settings-entry="review-ai" type="button" className="text-primary underline" onClick={() => useUIStore.getState().openSettings('aiPostProcess')}>{t.common.settings}</button></p>}
        {!hasInput && <p className="review-hint">{t.preview.askNoTranscript}</p>}
        {displayedAskHistory.map(turn => <article className="ins-exchange" key={turn.id}>
          <div className="ins-question"><p className="whitespace-pre-wrap">{turn.question}</p>
            <MessageActionButton icon={copiedMessageId === 'user-'+turn.id ? Check : Copy} label={t.preview.askCopy} onClick={() => handleCopyMessage('user-'+turn.id,turn.question)}/>
          </div>
          <div className="ins-answer"><div className="ins-author"><Sparkles size={14}/>{t.preview.assistant}</div>
            <AiStaleNotice session={session} result={turn}/>
            {turn.answer && <MarkdownRenderer content={turn.answer}/>}
            {turn.status === 'pending' && <div role="status" className="ins-actions"><ThinkingIndicator/>{t.preview.askThinking}</div>}
            {turn.status === 'error' && <p role="alert" className="text-destructive">{turn.error || t.preview.askErrorFallback}</p>}
            <div className="ins-answer-footer"><div className="ins-sources">
              {!!turn.citations?.length && <span>{t.preview.askReferences}</span>}
              {turn.citations?.map((citation, i) => {
                if (citation.source === 'image') {
                  return session.images?.some(image => image.id === citation.imageId)
                    ? <a key={i} className="ins-cite" href={'#image-' + citation.imageId} title={citation.quote}>{t.preview.imageSource} {i + 1}<ArrowUpRight size={12}/></a>
                    : <span key={i}>{t.preview.imageRemoved}</span>
                }
                const match = findReviewPassage(version, citation)
                const label = match?.startMs === undefined ? citation.speakerLabel || t.preview.quoteText : timestamp(match.startMs).slice(0, -4)
                return match && onCitation
                  ? <button key={i} className="ins-cite" title={citation.quote} onClick={() => onCitation(citation.quote)}>{label}<ArrowUpRight size={12}/></button>
                  : <span key={i} title={citation.quote}>{label}</span>
              })}
            </div><div className="ins-actions">{turn.status !== 'pending' && <>
              <MessageActionButton icon={copiedMessageId === 'ai-'+turn.id ? Check : Copy} label={t.preview.askCopy} onClick={() => handleCopyMessage('ai-'+turn.id,turn.answer || turn.error || '')}/>
              <button className="ins-icon" disabled={!canAsk} aria-label={t.preview.askRegenerate} title={t.preview.askRegenerate} onClick={() => void handleRegenerate(turn.question)}><RefreshCw size={13}/></button>
            </>}</div></div>
            {!!turn.citations?.length && <details className="review-citation-list"><summary><Quote size={12}/>{t.preview.quoteText}</summary>
              {turn.citations.map((item,i) => <blockquote key={i}><MarkdownRenderer content={item.quote}/></blockquote>)}</details>}
          </div>
        </article>)}
        {!displayedAskHistory.length && <div className="ins-chat-empty"><MessageSquareQuote size={20}/><p>{showNewThreadPill ? t.preview.askNewConversationHint : t.preview.askEmpty}</p></div>}
        <div ref={askMessagesEndRef}/>
      </div>
      {copyError && <p className="review-map-notice text-destructive" role="alert">{copyError}</p>}
      {showScrollBtn && <button className="ins-button mx-auto" onClick={() => scrollToBottom()}><ChevronDown size={14}/>{t.preview.askScrollToBottom}</button>}
      <div className="ins-chat-entry"><div className="ins-prompts">{askSuggestions.filter(q => q !== latestTurn?.question).map(q => <button key={q} disabled={!canAsk} onClick={() => void handleAskQuestion(q)}>{q}<ArrowUpRight size={12}/></button>)}</div>
      <form className="ins-compose" onSubmit={e => { e.preventDefault(); void handleAskQuestion() }}>
        <textarea aria-label={t.preview.askQuestion} ref={textareaRef} rows={2} value={questionDraft} placeholder={t.preview.askPlaceholder} onChange={e => setQuestionDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void handleAskQuestion() } }}/>
        <div><span>Enter {t.preview.askSend} · Shift+Enter ↵</span><button type="submit" disabled={!canSend} aria-label={t.preview.askSend}>{askPending ? <Loader2 size={15} className="animate-spin"/> : <ArrowUp size={16}/>}</button></div>
      </form></div>
    </section>
  </div></div>
}
