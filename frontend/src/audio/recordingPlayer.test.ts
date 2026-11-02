import {describe,it,expect,vi,afterEach} from 'vitest'
import {RecordingPlayer,playbackRange,type PlaybackState} from './recordingPlayer'
import type {RecordingManifest,AudioBlock} from '../../../shared/recording'
const block=(index:number,startMs:number,tracks:AudioBlock['tracks']=['mix','system']):AudioBlock=>({index,startMs,frames:16000,sampleRate:16000,tracks,bytes:32044})
const manifest=(blocks=[block(0,0),block(1,1000),block(2,3000,['mix'])]):RecordingManifest=>({schemaVersion:1,sessionId:'m',createdAt:1,status:'completed',durationMs:Math.max(...blocks.map(b=>b.startMs+1000)),bytes:100000,blocks,sources:[],events:[]})
function fixture(){
 const starts:Array<{when:number;offset:number}>=[]
 const ctx={currentTime:0,destination:{},resume:vi.fn(async()=>{}),close:vi.fn(async()=>{}),
 createBuffer:(_channels:number,frames:number)=>({getChannelData:()=>new Float32Array(frames)}),
 createBufferSource:()=>({buffer:null,onended:null,connect:vi.fn(),disconnect:vi.fn(),stop:vi.fn(),start:(when:number,offset:number)=>starts.push({when,offset})})}
 return {ctx,starts}
}
afterEach(()=>vi.useRealTimers())
describe('recording playback',()=>{
 it('identifies source-specific gaps instead of substituting another source',()=>{
  expect(playbackRange(manifest(),'system',3000).blocks).toEqual([])
  expect(playbackRange(manifest(),'mix',2200).nextMs).toBe(3000)
  expect(playbackRange(manifest(),'mix',100).endMs).toBe(2000)
 })
 it('seeks within a block using the audio clock, stops at a gap and offers the next segment',async()=>{
  vi.useFakeTimers();const {ctx,starts}=fixture(),states:PlaybackState[]=[]
  const player=new RecordingPlayer(manifest(),async()=>new Uint8Array(32044),s=>states.push(s),()=>ctx as unknown as AudioContext)
  await player.play(1250)
  expect(starts).toEqual([{when:0.08,offset:0.25}])
  ctx.currentTime=0.4;vi.advanceTimersByTime(50);expect(states[states.length-1]?.positionMs).toBeCloseTo(1570,5)
  ctx.currentTime=0.9;vi.advanceTimersByTime(50)
  expect(states[states.length-1]).toMatchObject({playing:false,positionMs:2000,nextMs:3000});expect(states[states.length-1]?.message).toContain('缺口')
  player.dispose()
 })
 it('bounds lookahead memory and schedules contiguous blocks without accumulating IPC delay',async()=>{
  const {ctx,starts}=fixture(),read=vi.fn(async()=>new Uint8Array(32044))
  const player=new RecordingPlayer(manifest(Array.from({length:100},(_,i)=>block(i,i*1000))),read,()=>{},()=>ctx as unknown as AudioContext)
  await player.play(100)
  expect(read.mock.calls.length).toBeLessThanOrEqual(5)
  expect(starts[0].offset).toBeCloseTo(0.1);expect(starts[1].when-starts[0].when).toBeCloseTo(0.9,6)
  player.dispose();expect(ctx.close).toHaveBeenCalledOnce()
 })
 it('does not start an old pending read after the user seeks away',async()=>{
  const {ctx,starts}=fixture(),states:PlaybackState[]=[]
  let resolve!:(bytes:Uint8Array)=>void
  const player=new RecordingPlayer(manifest(),()=>new Promise(r=>resolve=r),s=>states.push(s),()=>ctx as unknown as AudioContext)
  const old=player.play();await Promise.resolve();await player.seek(3000,false);resolve(new Uint8Array(32044));await old
  expect(starts).toHaveLength(0);expect(states[states.length-1]).toMatchObject({playing:false,positionMs:3000});player.dispose()
 })
 it('reports missing or damaged audio rather than claiming it is playing',async()=>{
  const {ctx}=fixture(),states:PlaybackState[]=[]
  const player=new RecordingPlayer(manifest(),async()=>new Uint8Array(1),s=>states.push(s),()=>ctx as unknown as AudioContext)
  await player.play();expect(states[states.length-1]?.playing).toBe(false);expect(states[states.length-1]?.message).toContain('损坏');player.dispose()
 })
})
