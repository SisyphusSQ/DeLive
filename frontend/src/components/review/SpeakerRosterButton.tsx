import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import type { TranscriptSession } from '../../types'
import { useUIStore } from '../../stores/uiStore'
import { useReviewDraftStore } from '../../stores/reviewDraftStore'
import { SpeakerEditor, type SpeakerTarget } from './SpeakerEditor'

export function SpeakerRosterButton({ session, version, adopted, viewingTranscript }: {
  session: TranscriptSession
  version: TranscriptVersion
  adopted: boolean
  viewingTranscript: boolean
}) {
  const t = useUIStore(s => s.t.speakerEdit)
  const draft = useReviewDraftStore(s => s.drafts[session.id])
  const count = viewingTranscript && draft
    ? ('value' in draft ? draft.value : draft.source).speakers.length
    : version.speakers.length
  const [target, setTarget] = useState<SpeakerTarget>()
  const blocked = session.status === 'recording' ? t.recording : draft ? t.draft : ''
  return <>
    {count > 0 && <button type="button" aria-haspopup="dialog" disabled={!!blocked}
      title={blocked || (adopted ? t.adoptedTitle : t.historicalTitle)}
      onClick={() => setTarget({ kind: 'names', source: version, adopt: adopted })}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 font-medium text-foreground hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      <UsersRound size={14} aria-hidden="true" className="text-primary" />
      {t.editRoster.replace('{count}', String(count))}
    </button>}
    {target && <SpeakerEditor session={session} target={target}
      onClose={() => setTarget(undefined)} onSaved={(revision, adopted) => {
        const ui = useUIStore.getState()
        if ((adopted || !target.adopt) && ui.reviewSessionId === session.id && ui.reviewVersionId === target.source.id) {
          useUIStore.setState({ reviewVersionId: revision.id })
        }
        setTarget(undefined)
      }} />}
  </>
}
