import { describe,it,expect } from 'vitest'
import { reviewVersions,selectedReviewVersion,editedVersion,appendRevision,mapSpeakers,reviewExport,canExportTimed,legacySpeakerNames,revisionPatch } from './reviewVersions'
import { normalizeTranscriptSession } from './sessionSchema'
import { addPostMeetingVersion } from './transcriptVersions'
import { fileVersion } from '../../../shared/volcFileContract'
const base=()=>normalizeTranscriptSession({id:'meeting',title:'Meeting',transcript:'A B ?',segments:[
  {id:'a',text:'A',startMs:100,endMs:800,speakerId:'live:0',isFinal:true,recognitionId:'live'},
  {id:'b',text:'B',startMs:1200,endMs:1800,speakerId:'live:1',isFinal:true},
  {id:'c',text:'?',startMs:1900,endMs:2200,isFinal:false},
],speakers:[{id:'live:0',label:'说话人 1'},{id:'live:1',label:'说话人 2'}],status:'completed'})
const post=()=>fileVersion('job',{text:'C D',durationMs:2200,utterances:[{text:'C',startMs:100,endMs:800,speaker:'1'},{text:'D',startMs:1200,endMs:1800,speaker:'0'}]},'200')
describe('review versions',()=>{
 it('saves immutable names, text and attribution; later reordered machine results preserve selection',()=>{
  let session=base();const source=selectedReviewVersion(session),draft=structuredClone(source)
  draft.speakers[0].displayName='小甲';draft.segments[0].text='校对 A';draft.segments[1].speakerId='live:0'
  const edit=editedVersion(source,draft,'校对')
  session=normalizeTranscriptSession(appendRevision(session,edit,source))
  const arriving=normalizeTranscriptSession(addPostMeetingVersion(session,post()))
  expect(arriving.selectedVersionId).toBe(edit.id);expect(selectedReviewVersion(arriving).segments[0].text).toBe('校对 A')
  expect(selectedReviewVersion(arriving).speakers[0].displayName).toBe('小甲')
  expect(arriving.transcript).toBe('A B ?');expect(arriving.versions?.find(v=>v.id===source.id)?.speakers[0].displayName).toBeUndefined()
  expect(reviewVersions(arriving)).toHaveLength(3) // no phantom originals after normalization
  expect(arriving.versions?.find(v=>v.kind==='post-meeting')?.speakers[0].displayName).toBeUndefined()
 })
 it('requires explicit mapping, preserves scoped IDs and records confirmation in a new revision',()=>{
  const source=selectedReviewVersion(base());source.speakers[0].displayName='小甲'
  const target=post(),mapped=mapSpeakers(target,source,{[target.speakers[1].id]:source.speakers[0].id})
  expect(mapped.id).not.toBe(target.id);expect(mapped.parentVersionId).toBe(target.id)
  expect(mapped.speakers[1].id).toBe('file-job:speaker:0');expect(mapped.speakers[1].displayName).toBe('小甲')
  expect(mapped.speakerMapping?.pairs[target.speakers[1].id]).toBe('live:0')
  expect(target.speakers[1].displayName).toBeUndefined()
  expect(()=>mapSpeakers(target,source,{'missing':'live:0'})).toThrow()
  expect(()=>mapSpeakers(target,source,{})).toThrow()
 })
 it('exports only the selected revision with exact times, labels and unknown/provisional text',()=>{
  const source=selectedReviewVersion(base()),draft=structuredClone(source)
  draft.speakers[0].displayName='小甲';draft.segments[0].text='人工稿'
  const edit=editedVersion(source,draft,'校对'),session=appendRevision(base(),edit,source)
  Object.assign(session,{secret:'SECRET',audioUrl:'https://private/?signature=SECRET'})
  const txt=reviewExport(session,'txt'),md=reviewExport(session,'md'),srt=reviewExport(session,'srt')
  expect(txt).toContain('[00:00:00.100] [小甲] 人工稿');expect(txt).toContain('[临时片段] ?')
  expect(md).toContain('# Meeting');expect(srt).toContain('00:00:00,100 --> 00:00:00,800\n[小甲] 人工稿')
  expect(srt).toContain('[未知说话人] ?');expect(txt+md+srt).not.toMatch(/SECRET|signature|live:0/)
 })
 it('keeps text-only history editable and refuses fabricated subtitle timing',()=>{
  const session=normalizeTranscriptSession({id:'legacy',title:'Legacy',transcript:'旧文字',correction:{status:'done',mode:'quick',correctedText:'旧校对'}})
  expect(reviewVersions(session)).toHaveLength(2);expect(reviewExport(session,'txt')).toContain('旧文字')
  expect(canExportTimed(selectedReviewVersion(session))).toBe(false)
  expect(()=>reviewExport(session,'srt')).toThrow('时间')
  const source=selectedReviewVersion(session),draft={...source,text:'已编辑旧文字'}
  const next=normalizeTranscriptSession(appendRevision(session,editedVersion(source,draft,'旧稿校对'),source))
  expect(reviewExport(next,'md')).toContain('已编辑旧文字');expect(next.transcript).toBe('旧文字')
 })
 it('preserves an editing source snapshot if a machine update replaces the current base',()=>{
  const session=base(),source=selectedReviewVersion(session),draft=structuredClone(source)
  draft.segments[0].text='人工保留'
  const changed={...session,transcript:'new',segments:[{text:'new'}],speakers:[]}
  const next=appendRevision(changed,editedVersion(source,draft,'校对'),source)
  const edit=selectedReviewVersion(next),parent=next.versions?.find(v=>v.id===edit.parentVersionId)
  expect(parent?.text).toBe('A B ?');expect(edit.segments[0].text).toBe('人工保留');expect(next.transcript).toBe('new')
 })
 it('rejects invalid times or unknown assignment and retains deliberate overlap',()=>{
  const source=selectedReviewVersion(base()),draft=structuredClone(source)
  draft.segments[0].endMs=99;expect(()=>editedVersion(source,draft,'x')).toThrow('时间')
  draft.segments[0].endMs=1400;expect(editedVersion(source,draft,'x').segments[0].endMs).toBe(1400)
  draft.segments[0].speakerId='missing';expect(()=>editedVersion(source,draft,'x')).toThrow('说话人')
 })
})


it('阅读分段不跨身份、未知归属、重叠或长间隔，导出不删文字', async () => {
  const { readingParagraphs } = await import('./reviewVersions')
  const version = { id:'read',kind:'post-meeting' as const,createdAt:1,text:'',speakers:[{id:'a',label:'说话人 1 · 会后稿'},{id:'b',label:'说话人 1 · 实时稿'}],segments:[
    {text:'第一句',speakerId:'a',startMs:0,endMs:1000}, {text:'第二句',speakerId:'a',startMs:1000,endMs:2000},
    {text:'重叠',speakerId:'a',startMs:1500,endMs:2500}, {text:'另一身份',speakerId:'b',startMs:2500,endMs:3000},
    {text:'未知一',startMs:3000,endMs:4000}, {text:'未知二',startMs:4000,endMs:5000},
    {text:'稍后',speakerId:'b',startMs:9000,endMs:10000},
  ] }
  expect(readingParagraphs(version).map(p => p.length)).toEqual([2,1,1,1,1,1])
  const session = normalizeTranscriptSession({ id:'s',versions:[version],selectedVersionId:'read' })
  const output = reviewExport(session, 'md', 'reading')
  for (const segment of version.segments) expect(output).toContain(segment.text)
  expect(output).toContain('[00:00:00]')
  expect(reviewExport(session, 'srt')).toContain('00:00:01,000')
})

describe('说话人快捷修订', () => {
  it.each([':text', ':0'])('纯文字校对草稿 %s 只改姓名时保留原分句结构，显式归属时保留新分句', suffix => {
    const source = { ...post(), segments: [], text: '第一段。　第二段。' }
    const row = { id: source.id + suffix, text: source.text }
    const speakers = source.speakers.map(s => ({ ...s, displayName: '新姓名' }))
    const rename = editedVersion(source, { ...source, segments: [row], speakers }, '校对姓名')
    expect(rename.segments).toEqual([])
    expect(rename.text).toBe(source.text)
    const assigned = { ...row, speakerId: speakers[0].id }
    expect(editedVersion(source, { ...source, segments: [assigned] }, '修改归属').segments).toEqual([assigned])
  })

  it('按完整识别来源恢复旧摘要姓名，采用后正文与所有分句逐项保留', () => {
    const source = post()
    const named = source.speakers.map((s, i) => ({ ...s, displayName: i ? '小周' : '小林' }))
    const session = normalizeTranscriptSession({ ...base(), speakers: named, versions: [source], selectedVersionId: source.id })
    const version = selectedReviewVersion(session)
    const previous = legacySpeakerNames(session, version)
    expect([...previous.values()]).toEqual(['小林', '小周'])
    expect(legacySpeakerNames(session, { ...version, speakers: [{ id: 'other:speaker:1', label: '说话人 1' }] }).size).toBe(0)
    expect(legacySpeakerNames({ ...session, versions: [] }, version).size).toBe(0)
    const rename = editedVersion(version, { ...version, speakers: named }, '改名')
    expect(rename.text).toBe(version.text)
    expect(rename.segments).toEqual(version.segments)
    expect(mapSpeakers(version, { ...version, id: 'named', speakers: named }, { [named[0].id]: named[0].id }).text).toBe(version.text)
    const adopted = normalizeTranscriptSession({ ...session, ...revisionPatch(session, rename, version, true) })
    for (const format of ['txt', 'md', 'srt', 'vtt'] as const) expect(reviewExport(adopted, format)).toContain('小林')
    expect(selectedReviewVersion(adopted).id).toBe(rename.id)
    expect(adopted.versions?.find(v => v.id === version.id)?.speakers[0].displayName).toBeUndefined()
    expect(() => revisionPatch(adopted, rename, version, true)).toThrow('采用稿已切换')
    expect(revisionPatch(adopted, rename, version)).not.toHaveProperty('selectedVersionId')
  })

  it('旧稿含未登记身份时允许改名，仍拒绝新写入的无效归属', () => {
    const source = post()
    source.segments[1].speakerId = 'legacy-unknown'
    const speakers = source.speakers.map(s => ({ ...s, displayName: '新姓名' }))
    expect(editedVersion(source, { ...source, speakers }, '改名').segments).toEqual(source.segments)
    const segments = source.segments.map(s => ({ ...s, speakerId: 'legacy-unknown' }))
    expect(() => editedVersion(source, { ...source, segments }, '归属')).toThrow('说话人')
  })

  it('纠正一句的归属保留正文、时间与待确认记录', () => {
    const source = post(), [a, b] = source.segments
    source.merge = { strategy: 1, key: 'k', baseVersionId: 'b', currentVersionId: 'b', postVersionId: source.id,
      groups: [{ id: 'g', status: 'pending', reason: '听原音', baseIds: [], postIds: [], currentIds: [], outputIds: [b.id!] }] }
    const revision = editedVersion(source, { ...source, segments: [a, { ...b, speakerId: a.speakerId }] }, '归属')
    expect(revision.text).toBe(source.text)
    expect(revision.segments).toEqual([a, { ...b, speakerId: a.speakerId }])
    expect(revision.merge).toEqual(source.merge)
    expect(source.segments[1].speakerId).not.toBe(a.speakerId)
  })
})

it('仅修改长会的两个姓名，保留空分句和 23,371 字的原始排版', () => {
  const ids = Array.from({ length: 1357 }, (_, i) => i < 821 ? '1' : '2')
  const utterances = ids.map((speaker, i) => ({
    speaker, startMs: i * 1000, endMs: (i + 1) * 1000,
    text: i < 9 ? '' : '字'.repeat(i < 9 + 455 ? 18 : 17),
  }))
  const text = utterances.map(s => s.text).join('')
  expect(text).toHaveLength(23371)
  const v = fileVersion('long', { durationMs: 1357000, text, utterances }, '200')
  const names = v.speakers.map((s, i) => ({ ...s, displayName: i ? '乙' : '甲' }))
  const result = editedVersion(v, { ...v, speakers: names }, '改名')
  expect(result.text).toBe(text)
  expect(result.segments).toEqual(v.segments)
  expect(names.map(s => result.segments.filter(p => p.speakerId === s.id && p.text).length)).toEqual([812, 536])
})
