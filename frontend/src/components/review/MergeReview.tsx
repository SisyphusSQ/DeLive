import { useRef, useState } from 'react'
import type { TranscriptVersion } from '../../../../shared/fileTranscription'
import type { MergeGroupDraft } from '../../stores/reviewDraftStore'
import { confirmRemainingGroups, editMergeGroup, resolveMergeGroup, versionSegments } from '../../utils/transcriptMerge'
import { timestamp, versionLabel } from '../../utils/reviewVersions'
import { useConfirmation } from '../../hooks/useConfirmation'

export function MergeReview({ version, versions, busy, draft, onDraft, onSave, onSeek, onCompare, onEdit }: {
  version: TranscriptVersion
  versions: TranscriptVersion[]
  busy: boolean
  draft?: MergeGroupDraft
  onDraft: (draft: MergeGroupDraft | undefined) => void
  onSave: (next: TranscriptVersion) => Promise<void>
  onSeek?: (ms: number, endMs?: number) => void
  onCompare: (id: string) => void
  onEdit: () => void
}) {
  const [selected, setSelected] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)
  const [error, setError] = useState('')
  const { confirm, dialog } = useConfirmation()
  const saving = useRef(false)
  const merge=version.merge
  if(!merge)return version.kind==='reconciled'?<p role="alert" className="text-sm text-destructive">校正来源记录不完整，请保留此稿并重新生成校正版。</p>:null
  const pending=merge.groups.filter(g=>g.status==='pending')
  const groups=merge.strategy===1&&onlyPending&&!draft?pending:merge.groups
  const group = groups.find(g => g.id === (draft?.id ?? selected)) ?? groups[0]
  const index = group ? groups.indexOf(group) : -1
  const original=versions.find(v=>v.id===merge.currentVersionId),post=versions.find(v=>v.id===merge.postVersionId)
  const current=group&&original?versionSegments(original).filter(s=>group.currentIds.includes(s.id!)):[]
  const incoming=group&&post?versionSegments(post).filter(s=>group.postIds.includes(s.id!)):[]
  const output=group?version.segments.filter(s=>group.outputIds.includes(s.id!)):[]
  const at=output[0]?.startMs??current[0]?.startMs??incoming[0]?.startMs
  const ends = [...output, ...current, ...incoming].flatMap(segment => segment.endMs === undefined ? [] : [segment.endMs])
  const end = ends.length ? Math.max(...ends) : undefined
  const batchCount = merge.groups.filter(group => group.decision === 'keep-current').length
  const button='rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40'
  const save = async (choice: 'original' | 'incoming' | 'edited' | 'reviewed') => {
    if (!group || saving.current) return
    saving.current = true
    setError('')
    try {
      if (choice === 'edited' && draft?.id !== group.id) return
      const next = choice === 'edited' ? editMergeGroup(version, group.id, draft!.text)
        : resolveMergeGroup(version, group.id, choice, versions)
      await onSave(next)
      setSelected('')
    } catch (e) {
      setError((e as Error).message)
    } finally { saving.current = false }
  }
  return <section aria-label="逐句校正审阅" className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 space-y-3">
    {dialog}
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{pending.length?`${pending.length} 处待确认`:batchCount?'待确认项已处理':'校正审阅已完成'} <span className="font-normal text-muted-foreground">· 原稿保留</span></h3>
      {merge.strategy===1&&<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={onlyPending} disabled={!!draft || busy} onChange={e=>setOnlyPending(e.target.checked)}/>只看待确认</label>}</div>
    <button className={button} disabled={!pending.length || !!draft || busy} onClick={() => void (async () => {
      if (saving.current) return
      saving.current = true
      setError('')
      try {
        if (!await confirm(`${versionLabel(version)}：将剩余 ${pending.length} 处全部确认，保留当前正文并另存一份修订。不会替换为会后候选，也不代表逐句回听。`)) return
        await onSave(confirmRemainingGroups(version))
      } catch (error) { setError((error as Error).message) }
      finally { saving.current = false }
    })()}>全部确认（剩余 {pending.length} 处）</button>
    {!!batchCount && <p className="text-xs text-muted-foreground">{batchCount} 处批量确认，保留当前正文；未标记为逐句核听。</p>}
    {group&&<>
      {!group.comparisonOnly&&<div className="flex flex-wrap items-center gap-2"><button className={button} disabled={index<=0||busy||!!draft} onClick={()=>setSelected(groups[index-1].id)}>上一处</button><span className="text-xs text-muted-foreground">{index+1} / {groups.length}</span><button className={button} disabled={index>=groups.length-1||busy||!!draft} onClick={()=>setSelected(groups[index+1].id)}>下一处</button>
        {at!==undefined&&<button className={button} disabled={!onSeek} onClick={()=>onSeek?.(Math.max(0, at - 3000), end === undefined ? undefined : end + 3000)}>听原音（含前后文）{timestamp(at)}</button>}
        {(at === undefined || !onSeek) && <span className="text-xs text-muted-foreground">缺少有效时间或原音，无法定位播放</span>}
        <span className="text-xs text-muted-foreground">{group.reason??'时间对应明确，已采用会后稿文字；可对照修改'}</span>
      </div>}
      {group.comparisonOnly ? <div className="space-y-2 text-sm">
        <p>{original ? '当前正文使用会后稿的分句。请对照历史全文，在对应句子中补回需要保留的修改。' : '历史稿件来源缺失，当前正文仍可阅读和回放。'}</p>
        {original&&<div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy} onClick={()=>onCompare(original.id)}>对照历史全文</button>
          <button className={button} disabled={busy} onClick={onEdit}>编辑恢复稿</button>
          {group.status==='pending'&&<button className={button} disabled={busy} onClick={()=>void save('reviewed')}>已核对，保留当前正文</button>}
        </div>}
      </div> : <>
        <div className="grid gap-4 md:grid-cols-2 text-sm leading-6"><div><h4 className="mb-1 text-xs font-medium text-muted-foreground">原稿 / 已保存修改</h4><p className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{current.map(s=>s.text).join('\n')||'无原文（或已人工删除）'}</p></div><div><h4 className="mb-1 text-xs font-medium text-muted-foreground">会后稿建议</h4><p className="max-h-56 overflow-auto whitespace-pre-wrap break-words">{incoming.map(s=>s.text).join('\n')||'未对应到会后稿，不能据此删除原文'}</p></div></div>
        {draft&&<label className="block text-xs text-muted-foreground">手动修改（留空表示删除此区段；多句合改不会虚构时间）<textarea aria-label="校正区段文字" disabled={busy} className="mt-2 min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm text-foreground" value={draft.text} onChange={e=>onDraft({...draft,text:e.target.value})}/></label>}
        <div className="flex flex-wrap gap-2">
          {draft ? <>
            <button className={button} disabled={busy} onClick={()=>void save('edited')}>保存本处修改</button>
            <button className={button} disabled={busy} onClick={()=>onDraft(undefined)}>放弃本处修改</button>
          </> : <>
            <button className={button} disabled={busy||!incoming.length} onClick={()=>void save('incoming')}>采用会后稿</button>
            <button className={button} disabled={busy||!original} onClick={()=>void save('original')}>保留原文</button>
            <button className={button} disabled={busy} onClick={()=>onDraft({id:group.id,text:output.map(s=>s.text).join('\n')})}>手动修改</button>
            <button className={button} disabled={busy || groups.length < 2} onClick={() => setSelected(groups[(index + 1) % groups.length].id)}>暂不处理</button>
          </>}
        </div>
      </>}
    </>}
    <p className="text-xs text-muted-foreground">每次确认另存审阅进度。采用为当前稿后，导出和 AI 使用该版本；机器合并不代表逐字正确。</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}
