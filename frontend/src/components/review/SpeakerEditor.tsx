import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import type { TranscriptSession } from '../../types'
import { useReviewDraftStore } from '../../stores/reviewDraftStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useUIStore } from '../../stores/uiStore'
import { sessionRepository } from '../../utils/sessionRepository'
import { appendRevision, editedVersion, legacySpeakerNames, reviewVersions, revisionPatch, selectedReviewVersion, timestamp, versionLabel } from '../../utils/reviewVersions'
import { Button } from '../ui'
import { Select } from '../ui/Select'

export type SpeakerTarget = {
  source: TranscriptVersion
  adopt: boolean
} & ({ kind: 'names'; speakerId?: string } | { kind: 'sentence'; indices: number[] })

const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function SpeakerEditor({ session, target, onClose, onSaved }: {
  session: TranscriptSession
  target: SpeakerTarget
  onClose: () => void
  onSaved: (revision: TranscriptVersion, adopted: boolean) => void
}) {
  const { source } = target
  const { speakerEdit: t, common } = useUIStore(s => s.t)
  const hasDraft = useReviewDraftStore(s => !!s.drafts[session.id])
  const historicalNames = useMemo(() => legacySpeakerNames(session, source), [session, source])
  const speakers = source.speakers.filter(s => target.kind === 'names' && (!target.speakerId || s.id === target.speakerId))
  const [names, setNames] = useState(() => new Map(speakers.map(s => {
    const current = s.displayName
    // An explicitly cleared name keeps the anonymous label when another speaker is edited later.
    if (current !== undefined && current !== s.id && current !== s.label) return [s.id, current]
    return [s.id, historicalNames.get(s.id) ?? current ?? '']
  })))
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const s of source.segments) if (s.speakerId && s.text.trim()) result.set(s.speakerId, (result.get(s.speakerId) ?? 0) + 1)
    return result
  }, [source])
  const [newId] = useState(() => 'manual-' + crypto.randomUUID())
  const [index, setIndex] = useState(target.kind === 'sentence' ? target.indices[0] : 0)
  const segment = source.segments[index]
  const knownAssignment = (id?: string) => id && source.speakers.some(s => s.id === id) ? id : ''
  const [assignment, setAssignment] = useState(knownAssignment(segment?.speakerId))
  const [newName, setNewName] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    element.querySelector<HTMLElement>('input[type="text"], [role="combobox"]')?.focus()
    return () => { element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  const currentId = useMemo(() => selectedReviewVersion(session).id, [session])
  const sourceChanged = useMemo(() => {
    const latest = reviewVersions(session).find(v => v.id === source.id)
    return latest !== source && JSON.stringify(latest) !== JSON.stringify(source)
  }, [session, source])
  const adopt = target.adopt && source.id === currentId && !sourceChanged
  const pending = adopt ? source.merge?.groups.filter(g => g.status === 'pending').length ?? 0 : 0
  const revisedSpeakers = target.kind === 'names' ? source.speakers.map(s => {
    const input = names.get(s.id)?.trim()
    if (input === undefined) return s
    // An explicit anonymous choice must survive reopening even when an older name is available.
    const name = input === s.label && historicalNames.has(s.id) ? '' : input
    if (name === s.displayName || (!name && !s.displayName && !historicalNames.has(s.id))) return s
    return { ...s, displayName: name }
  }) : source.speakers
  const changed = target.kind === 'sentence'
    ? assignment === newId ? !!newName.trim() : assignment !== knownAssignment(segment.speakerId)
    : revisedSpeakers.some((s, i) => s !== source.speakers[i])
  const blocked = session.status === 'recording' ? t.recording : hasDraft ? t.draft : ''
  const save = async () => {
    if (!changed || busy || blocked || (pending && !acknowledged)) return
    setBusy(true)
    setError('')
    try {
      let draft: TranscriptVersion
      if (target.kind === 'names') {
        draft = { ...source, speakers: revisedSpeakers }
      } else {
        const nextSpeakers = assignment === newId
          ? [...source.speakers, { id: newId, label: t.speaker + ' ' + (source.speakers.length + 1), displayName: newName.trim() }]
          : source.speakers
        draft = { ...source, speakers: nextSpeakers, segments: source.segments.map((s, i) => i === index ? { ...s, speakerId: assignment || undefined } : s) }
      }
      const revision = editedVersion(source, draft, target.kind === 'names' ? '修改说话人姓名' : '修改单句说话人归属')
      const sessions = await sessionRepository.mutateDurable(session.id, current => {
        if (current.status === 'recording') throw new Error(t.recording)
        if (useReviewDraftStore.getState().drafts[current.id]) throw new Error(t.draft)
        if (sourceChanged) return { versions: appendRevision(current, revision, source).versions }
        return revisionPatch(current, revision, source, adopt)
      })
      useSessionStore.setState({ sessions })
      onSaved(revision, adopt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const title = target.kind === 'sentence' ? t.assign : target.speakerId ? t.rename : adopt ? t.adoptedTitle : t.historicalTitle
  return <dialog ref={dialog} aria-modal="true" aria-labelledby="speaker-edit-title"
    className="m-auto max-h-[90dvh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <form onSubmit={e => { e.preventDefault(); void save() }}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 id="speaker-edit-title" className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{versionLabel(source)}</p></div>
        <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={common.close} onClick={onClose}><X size={16}/></Button>
      </header>
      <fieldset disabled={busy} className="min-w-0 space-y-4 p-5">
        {speakers.map(s => {
          const previous = historicalNames.get(s.id)
          return <div key={s.id} className="space-y-1">
            <label className="block space-y-1.5">
              <span className="flex items-baseline justify-between gap-3"><span className="text-sm font-medium">{s.label}</span>
                <span className="text-xs text-muted-foreground">{t.count.replace('{count}', String(counts.get(s.id) ?? 0))}</span></span>
              <input className={field} type="text" placeholder={s.label} value={names.get(s.id) ?? ''}
                onChange={e => setNames(new Map(names).set(s.id, e.target.value))}/>
            </label>
            {previous && previous !== s.displayName && (names.get(s.id) === previous
              ? <span className="text-xs text-muted-foreground">{t.prefilled}</span>
              : <button type="button" className="text-xs text-primary underline" onClick={() => setNames(new Map(names).set(s.id, previous))}>{t.usePrevious.replace('{name}', previous)}</button>)}
          </div>
        })}
        {target.kind === 'sentence' && <>
          {target.indices.length > 1 && <Select aria-label={t.sentence} className={field} value={index} onChange={e => {
            const next = Number(e.target.value)
            setIndex(next); setAssignment(knownAssignment(source.segments[next].speakerId))
          }}>{target.indices.map(i => <option key={i} value={i}>{i + 1} · {source.segments[i].text}</option>)}</Select>}
          <blockquote className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-r-md border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm">
            {segment.startMs !== undefined && <span className="mb-1 block text-xs text-muted-foreground">{timestamp(segment.startMs)}</span>}{segment.text}
          </blockquote>
          <label className="block space-y-1.5 text-sm"><span>{t.speaker}</span>
            <Select className={field} aria-label={t.speaker} value={assignment} onChange={e => setAssignment(e.target.value)}>
              <option value="">{t.unknown}</option>
              {source.speakers.map(s => <option key={s.id} value={s.id}>{s.displayName && s.displayName !== s.label ? s.displayName + ' · ' + s.label : s.label}</option>)}
              <option value={newId}>{t.newSpeaker}</option>
            </Select></label>
          {assignment === newId && <label className="block space-y-1.5 text-sm"><span>{t.name}</span>
            <input type="text" className={field} value={newName} onChange={e => setNewName(e.target.value)} required /></label>}
        </>}
        {pending > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />{t.pending.replace('{count}', String(pending))}</label>}
        {(sourceChanged || (target.adopt && !adopt)) && <p role="status" className="text-sm text-warning">{t.changed}</p>}
        {(blocked || error) && <p role="alert" className="text-sm text-destructive">{blocked || error}</p>}
      </fieldset>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{common.cancel}</Button>
        <Button type="submit" loading={busy} disabled={!changed || !!blocked || (!!pending && !acknowledged)}>{adopt ? t.adopt : t.revision}</Button>
      </footer>
    </form>
  </dialog>
}
