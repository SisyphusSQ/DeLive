import { useMemo } from 'react'
import { selectedReviewVersion, timestamp } from '../../utils/reviewVersions'
import { findReviewPassage, type ReviewCitation } from '../../utils/reviewPassage'
import { CorrectionTab } from './CorrectionTab'
import { resolveInputText } from '../../services/aiSessionContext'
import { MarkdownRenderer } from './MarkdownRenderer'
import { AiStaleNotice } from './AiStaleNotice'
import {
  Sparkles,
  Loader2,
  FileText,
  ListTodo,
  ArrowUpRight,
  ListTree,
} from 'lucide-react'
import type { TranscriptSession } from '../../types'
import { useUIStore } from '../../stores/uiStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTagStore } from '../../stores/tagStore'
import { isAiPostProcessConfigured } from '../../services/aiPostProcess'
import { TextSourceBanner } from './TextSourceBanner'

interface AiTabProps {
  session: TranscriptSession
  onCitation?: (source: ReviewCitation) => void
}

export function AiTab({ session, onCitation }: AiTabProps) {
  const { t } = useUIStore()
  const settings = useSettingsStore((state) => state.settings)
  const generateSessionPostProcess = useSessionStore((state) => state.generateSessionPostProcess)
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle)
  const updateSessionTags = useSessionStore((state) => state.updateSessionTags)
  const tags = useTagStore((state) => state.tags)
  const addTag = useTagStore((state) => state.addTag)

  const postProcess = session.postProcess
  const aiConfigured = isAiPostProcessConfigured(settings)
  const aiGenerating = postProcess?.status === 'pending'
  const hasAiContent = Boolean(
    postProcess?.summary?.trim()
    || postProcess?.actionItems?.length
    || postProcess?.keywords?.length
    || postProcess?.chapters?.length,
  )

  const handleGenerateAiBriefing = async () => {
    if (!session || aiGenerating) return
    try {
      await generateSessionPostProcess(session.id)
    } catch (error) {
      console.error('[AiTab] AI post-process failed:', error)
    }
  }

  const handleApplySuggestedTitle = () => {
    if (!session || !postProcess?.titleSuggestion?.trim()) return
    updateSessionTitle(session.id, postProcess.titleSuggestion.trim())
  }

  const handleApplySuggestedTags = () => {
    if (!session || !postProcess?.tagSuggestions?.length) return
    const nextTagIds = new Set(session.tagIds || [])
    const normalizeTagName = (value: string) => value.trim().toLowerCase()
    for (const suggestion of postProcess.tagSuggestions) {
      const name = suggestion.trim()
      if (!name) continue
      const existing = tags.find((tag) => normalizeTagName(tag.name) === normalizeTagName(name))
      const tagId = existing?.id || addTag(name, 'blue').id
      nextTagIds.add(tagId)
    }
    updateSessionTags(session.id, Array.from(nextTagIds))
  }

  const adopted = useMemo(() => selectedReviewVersion(session), [session])
  const actions = postProcess?.actionItems ?? []
  const done = postProcess?.completedActionItems ?? []
  function toggleAction(item: string) {
    const store = useSessionStore.getState()
    const current = store.sessions.find(s => s.id === session.id)?.postProcess
    if (!current?.actionItems?.includes(item)) return
    const checked = current.completedActionItems ?? []
    store.updateSessionPostProcess(session.id, { completedActionItems: checked.includes(item) ? checked.filter(text => text !== item) : [...checked, item] })
  }
  return <div className="review-pane-scroll"><div className="ins-pages review-pane">
    <div className="review-source"><TextSourceBanner session={session}/><AiStaleNotice session={session} result={postProcess}/></div>
    <section className="ins-panel">
      <header className="ins-head"><h2><FileText size={16}/>{t.preview.aiSummary}</h2>
        <button className="ins-button" onClick={() => void handleGenerateAiBriefing()} disabled={!aiConfigured || aiGenerating || !(resolveInputText(session,'auto') || session.images?.length)}>
          {aiGenerating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
          {aiGenerating ? t.preview.aiGenerating : hasAiContent ? t.preview.aiRegenerate : t.preview.aiGenerate}
        </button>
      </header>
      <div className="ins-overview">
        {!aiConfigured && <p className="review-hint">{t.preview.aiNotConfigured} <button data-settings-entry="review-ai" className="text-primary underline" onClick={() => useUIStore.getState().openSettings('aiPostProcess')}>{t.common.settings}</button></p>}
        {postProcess?.status === 'error' && <p role="alert" className="text-destructive">{postProcess.error}</p>}
        {postProcess?.summary ? <MarkdownRenderer content={postProcess.summary}/> : !hasAiContent && <p className="review-hint">{t.preview.noSummary}</p>}
        {!!postProcess?.keywords?.length && <div className="ins-keywords">{postProcess.keywords.map(word => <span key={word}>{word}</span>)}</div>}
      </div>
      {!!postProcess?.chapters?.length && <div className="ins-decisions"><h3>{t.preview.discussionPoints}</h3><ul>{postProcess.chapters.map((chapter,i) => {
        const ref = { quote: chapter.summary || chapter.title, startMs: chapter.startMs }
        const primaryMatch = findReviewPassage(adopted, ref)
        const source = primaryMatch ? ref : { quote: chapter.title }
        const match = primaryMatch ?? findReviewPassage(adopted, source)
        return <li key={i}><div><h4>{chapter.title}</h4>{chapter.summary && <MarkdownRenderer content={chapter.summary}/>}</div>
          {onCitation && match && <button className="ins-cite" onClick={() => onCitation(source)}>{match.startMs === undefined ? t.preview.viewPassage : timestamp(match.startMs).slice(0,-4)}<ArrowUpRight size={12}/></button>}
        </li>
      })}</ul></div>}
    </section>
    {!!actions.length && <section className="ins-panel"><header className="ins-head"><h2><ListTodo size={16}/>{t.preview.aiActionItems}</h2><span className="ins-count" aria-live="polite">{t.preview.itemsDone} {actions.filter(item => done.includes(item)).length} / {actions.length}</span></header>
      <div className="ins-checklist">{actions.map((item,i) => <div className="review-task-item" key={i}><input type="checkbox" aria-label={item} checked={done.includes(item)} disabled={aiGenerating} onChange={() => toggleAction(item)}/><MarkdownRenderer content={item}/></div>)}</div>
    </section>}
    <section className="ins-panel ins-utilities"><header className="ins-head"><h2><ListTree size={16}/>{t.preview.organizeTools}</h2></header>
      {(postProcess?.titleSuggestion || postProcess?.tagSuggestions?.length) ? <details><summary>{t.preview.meetingSuggestions}</summary><div className="review-utility-body">
        {postProcess.titleSuggestion && <div><strong>{t.preview.aiTitleSuggestion}</strong><p>{postProcess.titleSuggestion}</p><button className="ins-button" onClick={handleApplySuggestedTitle} disabled={postProcess.titleSuggestion.trim() === session.title.trim()}>{t.preview.aiApplyTitle}</button></div>}
        {!!postProcess.tagSuggestions?.length && <div><strong>{t.preview.aiTagSuggestions}</strong><p>{postProcess.tagSuggestions.join(' · ')}</p><button className="ins-button" onClick={handleApplySuggestedTags}>{t.preview.aiApplyTags}</button></div>}
      </div></details> : null}
      <details><summary>{t.preview.summarySectionCorrection}</summary><CorrectionTab session={session}/></details>
    </section>
  </div></div>
}
