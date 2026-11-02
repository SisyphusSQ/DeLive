import type { AudioBlock, AudioTrack, RecordingManifest } from '../../../shared/recording'
export interface PlaybackState { positionMs:number; playing:boolean; message:string; nextMs?:number }
const endOf=(b:AudioBlock)=>b.startMs+b.frames/b.sampleRate*1000
export function playbackRange(manifest:RecordingManifest,track:AudioTrack,at:number) {
  const index=manifest.blocks.findIndex(b=>b.startMs<=at && endOf(b)>at && b.tracks.includes(track))
  if(index<0) return {blocks:[] as AudioBlock[],endMs:at,nextMs:manifest.blocks.find(b=>b.startMs>at&&b.tracks.includes(track))?.startMs}
  const blocks=[manifest.blocks[index]]
  for(let i=index+1;i<manifest.blocks.length;i++){
    const b=manifest.blocks[i]
    if(!b.tracks.includes(track)||Math.abs(b.startMs-endOf(blocks[blocks.length-1]))>1)break
    blocks.push(b)
  }
  const endMs=endOf(blocks[blocks.length-1])
  return {blocks,endMs,nextMs:manifest.blocks.find(b=>b.startMs>=endMs&&b.tracks.includes(track))?.startMs}
}
/** Bounded look-ahead uses the audio clock; timestamps never accumulate IPC latency. */
export class RecordingPlayer {
  private context?:AudioContext
  private generation=0
  private nodes=new Set<AudioBufferSourceNode>()
  private timer?:ReturnType<typeof setInterval>
  private position=0
  private origin=0
  private anchor=0
  private playing=false
  private track:AudioTrack='mix'
  constructor(readonly manifest:RecordingManifest,private read:(index:number,track:AudioTrack)=>Promise<Uint8Array>,
    private onState:(state:PlaybackState)=>void,private createContext:()=>AudioContext=()=>new AudioContext()){}
  private current(){return this.playing?Math.min(this.manifest.durationMs,this.origin+Math.max(0,this.context!.currentTime-this.anchor)*1000):this.position}
  private emit(message='',nextMs?:number){this.onState({positionMs:this.current(),playing:this.playing,message,nextMs})}
  pause(){this.position=this.current();this.playing=false;this.generation++;if(this.timer)clearInterval(this.timer);this.timer=undefined
    for(const node of this.nodes){node.onended=null;try{node.stop()}catch{/* already ended */}node.disconnect()}this.nodes.clear();this.emit()}
  changeTrack(track:AudioTrack){this.pause();this.track=track;this.emit()}
  async seek(ms:number,play=this.playing){this.pause();this.position=Math.max(0,Math.min(ms,this.manifest.durationMs));this.emit();if(play)await this.play()}
  async play(at=this.position){
    this.pause();this.position=Math.max(0,Math.min(at,this.manifest.durationMs));const token=this.generation
    const range=playbackRange(this.manifest,this.track,this.position)
    if(!range.blocks.length){this.emit(this.position>=this.manifest.durationMs?'已到录音末尾':'此位置没有所选来源的音频，可能是来源结束或录音缺口',range.nextMs);return}
    const ctx=this.context??=this.createContext()
    try{
      await ctx.resume()
      let cursor=0,pumping=false
      const load=async(block:AudioBlock)=>{
        let bytes:Uint8Array
        try{bytes=await this.read(block.index,this.track)}catch{throw new Error('原音片段缺失或读取失败，请检查本地文件')}
        if(token!==this.generation)return null
        if(bytes.byteLength!==44+block.frames*2)throw new Error('原音片段已损坏')
        const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),audio=ctx.createBuffer(1,block.frames,block.sampleRate),samples=audio.getChannelData(0)
        for(let i=0;i<samples.length;i++)samples[i]=data.getInt16(44+i*2,true)/32768
        return audio
      }
      const first=await load(range.blocks[0]);if(!first || token!==this.generation)return
      this.origin=this.position;this.anchor=ctx.currentTime+0.08;this.playing=true
      const schedule=(block:AudioBlock,buffer:AudioBuffer)=>{
        const offset=Math.max(0,(this.origin-block.startMs)/1000),when=this.anchor+Math.max(0,(block.startMs-this.origin)/1000)
        if(when<ctx.currentTime-0.02)throw new Error('原音读取未跟上播放，已暂停；请重新定位播放')
        const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);this.nodes.add(source)
        source.onended=()=>{this.nodes.delete(source);source.disconnect()};source.start(Math.max(when,ctx.currentTime),offset)
      }
      schedule(range.blocks[cursor++],first)
      const fail=(error:unknown)=>{if(token!==this.generation)return;this.pause();this.emit((error as Error).message || '原音读取失败')}
      const pump=async()=>{
        if(pumping||token!==this.generation)return;pumping=true
        try{while(cursor<range.blocks.length&&range.blocks[cursor].startMs<this.current()+4000){
          const block=range.blocks[cursor++],audio=await load(block);if(!audio)return;schedule(block,audio)
        }}catch(error){fail(error)}finally{pumping=false}
      }
      this.timer=setInterval(()=>{
        if(this.current()>=range.endMs){this.pause();this.position=range.endMs;this.emit(range.endMs<this.manifest.durationMs?'后续存在音频缺口，已在缺口前暂停':'播放结束',range.nextMs);return}
        this.emit();void pump()
      },50)
      this.emit();await pump()
    }catch(error){if(token===this.generation){this.pause();this.emit((error as Error).message || '无法播放原音')}}
  }
  dispose(){this.pause();void this.context?.close();this.context=undefined}
}
