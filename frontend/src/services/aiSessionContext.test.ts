import { describe, it, expect, vi, beforeEach } from 'vitest'
import { contextChunks, inputFingerprint, completeSessionAi, CONTEXT_MARKER } from './aiSessionContext'
import { imageDataUrl } from './sessionImages'
import { cancelAiTasks } from './aiTransport'
import type { TranscriptSession, AiPostProcessConfig } from '../types'
import type { SessionImage } from '../../../shared/sessionImages'
import { reviewVersions } from '../utils/reviewVersions'
import { normalizeTranscriptSession } from '../utils/sessionSchema'
vi.mock('./sessionImages', () => ({ imageDataUrl: vi.fn(async () => 'data:image/png;base64,AAAA') }))
const image: SessionImage = { id:'11111111-1111-1111-1111-111111111111', assetPath:'s/11111111-1111-1111-1111-111111111111.png', name:'chart.png', mimeType:'image/png', bytes:4, width:1,height:1,sha256:'a'.repeat(64),atMs:1500,caption:'收入图',createdAt:1 }
const session: TranscriptSession = { id:'s',title:'test',transcript:'one\ntwo',createdAt:1,updatedAt:1,date:'',time:'',segments:[{id:'1',text:'one',startMs:1000,endMs:1400},{id:'2',text:'two',startMs:2000,endMs:2400}],images:[image] }
const config: AiPostProcessConfig = { enabled:true,provider:'openai',model:'vision',visionModels:['vision'] }
const reply = (text: string) => new Response(JSON.stringify({ status:'completed',output:[{content:[{type:'output_text',text}]}] }))
beforeEach(()=>vi.unstubAllGlobals())
describe('AI image context',()=>{
  it('orders text and stable image anchors by audio time and keeps the complete tail',()=>{
    const chunks=contextChunks(session,'original')
    expect(chunks[0].text.indexOf('one')).toBeLessThan(chunks[0].text.indexOf('收入图'))
    expect(chunks[0].text.indexOf('收入图')).toBeLessThan(chunks[0].text.indexOf('two'))
    const long=contextChunks({...session,segments:[],transcript:'a'.repeat(49000)+'THE_END'},'original')
    expect(long.map(c=>c.text).join('')).toContain('THE_END')
    expect(long.flatMap(c=>c.images)).toHaveLength(1)
  })
  it('fingerprints all inputs but not output timestamps, including edits and version selection',async()=>{
    const base=await inputFingerprint(session,'original')
    expect(await inputFingerprint({...session,updatedAt:9,postProcess:{summary:'new'}},'original')).toBe(base)
    expect(await inputFingerprint({...session,images:[{...image,caption:'changed'}]},'original')).not.toBe(base)
    expect(await inputFingerprint({...session,images:[{...image,atMs:999}]},'original')).not.toBe(base)
    expect(await inputFingerprint({...session,images:[]},'original')).not.toBe(base)
    const version = {id:'edit',kind:'edited' as const,createdAt:2,text:'changed',segments:[],speakers:[]}
    expect(await inputFingerprint({...session,versions:[version],selectedVersionId:'edit'},'original')).not.toBe(base)
    expect(contextChunks({...session,versions:[version],selectedVersionId:'edit'},'original')[0].text).toContain('changed')
  })
  it('uses a new AI correction only after it is saved and adopted, while reading older corrections', async () => {
    const inputFingerprintValue = await inputFingerprint(session, 'original')
    const correction = { status: 'done' as const, mode: 'quick' as const, correctedText: 'AI correction' }
    const legacy = { ...session, correction: { ...correction, inputFingerprint: inputFingerprintValue } }
    expect(contextChunks(legacy, 'auto')[0].text).toContain('AI correction')
    expect(reviewVersions(legacy).some(version => version.text === 'AI correction')).toBe(true)

    const current = normalizeTranscriptSession({ ...legacy, correction: { ...legacy.correction, requiresAdoption: true } })
    expect(reviewVersions(current).some(version => version.text === 'AI correction')).toBe(false)
    expect(contextChunks(current, 'auto')[0].text).toContain('one')
    const revision = { id: 'saved', kind: 'edited' as const, createdAt: 2, text: 'AI correction', segments: [], speakers: [] }
    const saved = { ...current, versions: [revision] }
    expect(contextChunks(saved, 'auto')[0].text).toContain('one')
    expect(contextChunks({ ...saved, selectedVersionId: revision.id }, 'auto')[0].text).toContain('AI correction')
  })
  it('sends actual images and records the immutable starting input',async()=>{
    const expected=await inputFingerprint(session,'auto')
    const snapshot=structuredClone(session)
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>{snapshot.images![0].caption='changed during request';return reply('图片显示收入 [图片](#image-'+image.id+')')})
    vi.stubGlobal('fetch',fetch)
    const result=await completeSessionAi(snapshot,config,{model:'vision',messages:[{role:'user',content:CONTEXT_MARKER}]})
    const body=JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(JSON.stringify(body)).toContain('data:image/png;base64,AAAA')
    expect(result.inputFingerprint).toBe(expected)
  })
  it('rejects unavailable vision, oversized images and fabricated references',async()=>{
    const request={model:'vision',messages:[{role:'user' as const,content:CONTEXT_MARKER}]}
    await expect(completeSessionAi(session,{...config,visionModels:[]},request)).rejects.toThrow('视觉模型')
    expect(()=>contextChunks({...session,images:[{...image,bytes:13*1024*1024}]},'original')).toThrow('未忽略')
    vi.stubGlobal('fetch',vi.fn<typeof globalThis.fetch>(async()=>reply('[图片](#image-made-up)')))
    await expect(completeSessionAi(session,config,request)).rejects.toThrow('不存在的图片')
  })
  it('processes every chronological chunk and aggregates the final image evidence',async()=>{
    let count=0
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>reply(++count<3 ? `facts ${count} [图片](#image-${image.id})` : JSON.stringify({imageIds:[image.id],summary:'tail evidence'})))
    vi.stubGlobal('fetch',fetch)
    const result=await completeSessionAi({...session,transcript:'a'.repeat(25000)+'TAIL_FACT',segments:[]},config,{model:'vision',schema:{type:'object'},messages:[{role:'user',content:CONTEXT_MARKER}]})
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('TAIL_FACT')
    expect(String(fetch.mock.calls[1][1]?.body)).toContain('data:image/png')
    expect(String(fetch.mock.calls[2][1]?.body)).toContain('facts 2')
    expect(result.imageIds).toEqual([image.id])
  })
  it('reports missing assets before sending a request',async()=>{
    vi.mocked(imageDataUrl).mockRejectedValueOnce(new Error('missing image'))
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    await expect(completeSessionAi(session,config,{model:'vision',messages:[{role:'user',content:CONTEXT_MARKER}]})).rejects.toThrow('missing image')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('cancels the entire chunk pipeline, without starting aggregation',async()=>{
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>{cancelAiTasks('s');return reply('facts')})
    vi.stubGlobal('fetch',fetch)
    await expect(completeSessionAi({...session,transcript:'a'.repeat(25000),segments:[]},config,{model:'vision',messages:[{role:'user',content:CONTEXT_MARKER}]})).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
