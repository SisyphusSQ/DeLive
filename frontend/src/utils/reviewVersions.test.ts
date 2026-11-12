import { describe,it,expect } from 'vitest'
import { reviewVersions,selectedReviewVersion,editedVersion,appendRevision,mapSpeakers,reviewExport,canExportTimed } from './reviewVersions'
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
