import type { TranscriptMergeGroup, TranscriptVersion } from '../../../shared/fileTranscription'
import type { TranscriptSession } from '../types'
import { reviewVersions, selectedReviewVersion } from './reviewVersions'

type Segment = TranscriptVersion['segments'][number]
export function versionSegments(version: TranscriptVersion): Segment[] {
  const segments = version.segments.length ? version.segments : version.text ? [{ text: version.text }] : []
  return segments.map((s, i) => ({ ...s, id: s.id || version.id + ':' + i }))
}
const timed = (s: Segment) => s.startMs !== undefined && s.endMs !== undefined &&
  Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.startMs >= 0 && s.endMs > s.startMs
const content = (s: Segment) => JSON.stringify([s.text, s.startMs, s.endMs, s.speakerId, s.isFinal])
const plain = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
const ids = (segments: Segment[]) => segments.map(s => s.id!)

export function needsTranscriptRecovery(version: TranscriptVersion): boolean {
  return version.kind !== 'post-meeting' && !version.editNote?.startsWith('历史译文') &&
    !!version.text.trim() && !version.segments.some(s => timed(s) && s.text.trim())
}

export function transcriptRecoverySources(versions: TranscriptVersion[], original: TranscriptVersion): TranscriptVersion[] {
  const posts = versions.filter(v => v.kind === 'post-meeting' && v.segments.some(s => timed(s) && s.text.trim()))
  const recordedSource = posts.find(v => v.id === original.merge?.postVersionId)
  return recordedSource ? [recordedSource] : posts
}

const recoveryKey = (original: TranscriptVersion, post: TranscriptVersion) => JSON.stringify([2, original.id, post.id])

function recoveredTranscript(original: TranscriptVersion, post: TranscriptVersion, baseId = original.id): TranscriptVersion {
  const id = 'merge-' + crypto.randomUUID()
  const group: TranscriptMergeGroup = {
    id: id + ':comparison', baseIds: [], postIds: [], currentIds: ids(versionSegments(original)), outputIds: [],
    comparisonOnly: true, status: 'pending', reason: '历史文字未逐句对齐，请对照旧稿，按需补回人工修改',
  }
  const segments = versionSegments(post).sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity))
  return {
    id, kind: 'reconciled', createdAt: Date.now(), parentVersionId: original.id,
    text: segments.map(s => s.text).join('\n'), segments, speakers: structuredClone(post.speakers),
    editNote: '从已有会后稿恢复分句、说话人和时间。历史全文保留供核对。',
    merge: { key: recoveryKey(original, post), strategy: 2, baseVersionId: baseId,
      postVersionId: post.id, currentVersionId: original.id, groups: [group] },
  }
}

export function recoverTranscript(session: TranscriptSession, originalId: string, postId: string) {
  const versions = reviewVersions(session)
  const original = versions.find(v => v.id === originalId)
  if (!original || !needsTranscriptRecovery(original)) throw new Error('待恢复的历史稿件已变化，请重新查看')
  const post = transcriptRecoverySources(versions, original).find(v => v.id === postId)
  if (!post) throw new Error('没有可用的结构化会后稿，历史全文已保留')
  const key = recoveryKey(original, post)
  const existing = versions.filter(v => v.merge?.key === key).slice(-1)[0]
  if (existing) return { session, versionId: existing.id }
  const version = recoveredTranscript(original, post, original.merge?.baseVersionId)
  return { session: { ...session, versions: [...versions, version] }, versionId: version.id }
}

export function reconciliationBase(session: TranscriptSession): TranscriptVersion {
  const versions = reviewVersions(session)
  let version = selectedReviewVersion(session)
  const seen = new Set<string>()
  while (version.parentVersionId && !seen.has(version.id)) {
    seen.add(version.id)
    const parent = versions.find(v => v.id === version.parentVersionId)
    if (!parent) break
    version = parent
  }
  if (version.kind === 'realtime' || version.kind === 'legacy') return version
  const original = versions.find(v => v.kind === 'realtime' || (v.kind === 'legacy' && !v.editNote?.startsWith('历史译文')))
  if (!original) throw new Error('没有可校正的实时原稿；可以直接使用会后稿')
  return original
}

export function descendsFrom(current: TranscriptVersion, base: TranscriptVersion, versions: TranscriptVersion[]): boolean {
  const seen = new Set<string>()
  while (current.id !== base.id && current.parentVersionId && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = versions.find(v => v.id === current.parentVersionId)
    if (!parent) return false
    current = parent
  }
  return current.id === base.id
}

function overlapping(segments: Segment[]): boolean {
  const sorted = [...segments].sort((a, b) => a.startMs! - b.startMs!)
  return sorted.some((s, i) => i > 0 && s.startMs! < sorted[i - 1].endMs!)
}

/** Time windows bound alignment; ambiguous timing and manual changes stay reviewable. */
export function reconcileTranscript(base: TranscriptVersion, post: TranscriptVersion, current: TranscriptVersion, versions: TranscriptVersion[]): TranscriptVersion {
  if (!post.text.trim()) throw new Error('会后稿没有文字，保留原稿，不生成空校正版')
  if (needsTranscriptRecovery(current)) {
    if (!post.segments.some(s => timed(s) && s.text.trim())) throw new Error('会后稿没有有效的逐句时间，无法恢复历史稿')
    return recoveredTranscript(current, post, base.id)
  }
  const id = 'merge-' + crypto.randomUUID()
  const key = JSON.stringify([1, base.id, post.id, current.id])
  const b = versionSegments(base), p = versionSegments(post), c = versionSegments(current)
  const groups: TranscriptMergeGroup[] = [], output: Segment[] = []
  const changedSpeakers = new Set(current.speakers.filter(s => {
    const old = base.speakers.find(v => v.id === s.id)
    return !old || old.label !== s.label || old.displayName !== s.displayName
  }).map(s => s.id))
  const add = (original: Segment[], incoming: Segment[], baseline: Segment[], chosen: Segment[], status: TranscriptMergeGroup['status'], reason?: string) => {
    const groupId = id + ':group:' + groups.length
    const segments = chosen.map((s, i) => ({ ...s, id: groupId + ':' + i }))
    groups.push({ id: groupId, baseIds: ids(baseline), postIds: ids(incoming), currentIds: ids(original), outputIds: ids(segments), status, reason })
    output.push(...segments)
  }
  const baseIds = new Set(b.map(s => s.id))
  const hasUntrackedEdits = !descendsFrom(current, base, versions) || c.some(s => !baseIds.has(s.id))
  if (hasUntrackedEdits) {
    add(c, p, b, c, 'pending', '人工稿结构或来源已变化，请对照确认')
  } else {
    const currentById = new Map(c.map(s => [s.id, s]))
    const untimedBase = b.filter(s=>!timed(s)), untimedPost = p.filter(s=>!timed(s))
    if (untimedBase.length || untimedPost.length) {
      const original = untimedBase.flatMap(s=>currentById.has(s.id)?[currentById.get(s.id)!]:[])
      add(original, untimedPost, untimedBase, original, 'pending', '缺少可靠时间，保留原文并等待人工对照')
    }
    const deleted = b.filter(s=>!currentById.has(s.id!))
    const items = [...b.filter(timed).map(s => ({ s, source: 'base' })), ...p.filter(timed).map(s => ({ s, source: 'post' }))]
      .sort((a, z) => a.s.startMs! - z.s.startMs! || a.s.endMs! - z.s.endMs!)
    let cursor = 0
    while (cursor < items.length) {
      const cluster = [items[cursor++]], start = cluster[0].s.startMs!
      let end = cluster[0].s.endMs!
      while (cursor < items.length && items[cursor].s.startMs! < end) {
        end = Math.max(end, items[cursor].s.endMs!)
        cluster.push(items[cursor++])
      }
      const baseline = cluster.filter(x => x.source === 'base').map(x => x.s)
      const incoming = cluster.filter(x => x.source === 'post').map(x => x.s)
      const original = baseline.flatMap(s => currentById.has(s.id) ? [currentById.get(s.id)!] : [])
      const protectedEdit = baseline.some(s => {
        const edited = currentById.get(s.id)
        return !edited || content(s) !== content(edited) || (s.speakerId && changedSpeakers.has(s.speakerId))
      })
      if (protectedEdit) {
        add(original, incoming, baseline, original, incoming.length ? 'pending' : 'manual', '保留人工文字、姓名、时间、归属或删除；请确认会后建议')
      } else if (!incoming.length) {
        add(original, [], baseline, original, 'pending', '会后稿未对应此段，保留原文')
      } else if (!baseline.length) {
        const nearDeleted = deleted.some(s => s.startMs! <= end + 750 && s.endMs! >= start - 750)
        const ambiguous = overlapping(incoming) || nearDeleted || untimedBase.length>0
        add([], incoming, [], ambiguous ? [] : incoming, ambiguous ? 'pending' : 'added', nearDeleted ? '邻近人工删除区段，请确认是否补入' : untimedBase.length ? '原稿含无时间片段，新增内容可能重复，请确认' : ambiguous ? '新增区段包含重叠发言，请确认' : '补入实时稿缺失区段')
      } else {
        const bStart = Math.min(...baseline.map(s => s.startMs!)), bEnd = Math.max(...baseline.map(s => s.endMs!))
        const pStart = Math.min(...incoming.map(s => s.startMs!)), pEnd = Math.max(...incoming.map(s => s.endMs!))
        const sameText = plain(baseline.map(s => s.text).join('')) === plain(incoming.map(s => s.text).join(''))
        // shortcut: 750ms / 60% bounds are conservative alignment gates, recalibrate with labelled meeting samples.
        const bounded = Math.abs(bStart - pStart) <= 750 && Math.abs(bEnd - pEnd) <= 750 &&
          (Math.min(bEnd, pEnd) - Math.max(bStart, pStart)) / (end - start) >= 0.6
        const ambiguous = overlapping(baseline) || overlapping(incoming) || (!sameText && !bounded)
        add(original, incoming, baseline, ambiguous ? original : incoming, ambiguous ? 'pending' : 'automatic', ambiguous ? '时间对应或重叠归属不明确，请听原音确认' : undefined)
      }
    }
  }
  output.sort((a, z) => (a.startMs ?? Infinity) - (z.startMs ?? Infinity))
  const speakers = new Map([...base.speakers, ...post.speakers, ...current.speakers].map(s => [s.id, structuredClone(s)]))
  return { id, kind: 'reconciled', createdAt: Date.now(), parentVersionId: current.id,
    text: output.map(s => s.text).join('\n'), segments: output, speakers: [...speakers.values()],
    editNote: '基于原音重识别自动校正；原稿保留，待确认项需人工核对',
    merge: { key, strategy: 1, baseVersionId: base.id, postVersionId: post.id, currentVersionId: current.id, groups } }
}

export function addReconciledVersion(session: TranscriptSession, postId: string, baseId: string): TranscriptSession {
  const versions = reviewVersions(session), post = versions.find(v => v.id === postId), base = versions.find(v => v.id === baseId)
  if (!post || !base) throw new Error('合并来源版本不存在，请重新选择')
  let current = selectedReviewVersion(session)
  if (current.kind === 'post-meeting' || current.id === base.id) {
    current = versions.filter(v => v.kind === 'edited' && descendsFrom(v, base, versions)).sort((a,b)=>b.createdAt-a.createdAt)[0] ?? base
  }
  current = versions.filter(v=>v.kind==='edited' && v.createdAt>current.createdAt && descendsFrom(v,current,versions)).sort((a,b)=>b.createdAt-a.createdAt)[0] ?? current
  const existing = versions.find(v => v.id === current.id && v.merge?.postVersionId === postId && !needsTranscriptRecovery(v)) ??
    versions.find(v => v.merge?.baseVersionId === baseId && v.merge.postVersionId === postId &&
      v.merge.currentVersionId === current.id && (!needsTranscriptRecovery(current) || v.merge.strategy === 2))
  if (existing) return session
  const version = reconcileTranscript(base, post, current, versions)
  return { ...session, versions: [...versions, version] }
}

export function editMergeGroup(version: TranscriptVersion, groupId: string, text: string): TranscriptVersion {
  const merge = version.merge, group = merge?.groups.find(g=>g.id===groupId)
  if (!merge || !group) throw new Error('校对区段不存在')
  if (group.comparisonOnly) throw new Error('请在对应分句中补回人工修改')
  const old = version.segments.filter(s=>group.outputIds.includes(s.id!))
  const chosen: Segment[] = text.trim() ? [{ ...(old.length === 1 ? old[0] : {}), id: group.id + ':edited', text, isFinal: true }] : []
  const segments = [...version.segments.filter(s=>!group.outputIds.includes(s.id!)), ...chosen]
    .sort((a,b)=>(a.startMs ?? Infinity)-(b.startMs ?? Infinity))
  return { ...version, segments, text: segments.map(s=>s.text).join('\n'), merge: { ...merge, groups: merge.groups.map(g=>g.id===groupId ? {...g, outputIds:ids(chosen), status:'confirmed', decision:'edited'} : g) } }
}

export function resolveMergeGroup(version: TranscriptVersion, groupId: string, decision: 'original' | 'incoming' | 'reviewed', versions: TranscriptVersion[]): TranscriptVersion {
  const merge = version.merge, group = merge?.groups.find(g => g.id === groupId)
  if (!merge || !group) throw new Error('校对区段不存在')
  if (group.comparisonOnly) {
    if (decision !== 'reviewed' || !versions.some(v => v.id === merge.currentVersionId)) throw new Error('请先对照完整的历史稿件')
    return { ...version, merge: { ...merge, groups: merge.groups.map(g =>
      g.id === groupId ? { ...g, status: 'confirmed', decision } : g) } }
  }
  if (decision === 'reviewed') throw new Error('请选择本区段的校正处理方式')
  const source = versions.find(v => v.id === (decision === 'incoming' ? merge.postVersionId : merge.currentVersionId))
  if (!source) throw new Error('来源稿件已缺失，不能应用建议')
  const wanted = new Set(decision === 'incoming' ? group.postIds : group.currentIds)
  const chosen = versionSegments(source).filter(s => wanted.has(s.id!)).map((s, i) => ({ ...s, id: group.id + ':resolved:' + i }))
  if (chosen.length !== wanted.size) throw new Error('来源片段缺失，不能应用建议')
  const remove = new Set(group.outputIds)
  const segments = [...version.segments.filter(s => !remove.has(s.id!)), ...chosen].sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity))
  return { ...version, segments, text: segments.map(s => s.text).join('\n'), merge: { ...merge, groups: merge.groups.map(g => g.id === groupId ? { ...g, outputIds: ids(chosen), status: 'confirmed', decision } : g) } }
}
