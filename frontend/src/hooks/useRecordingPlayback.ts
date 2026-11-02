import { useEffect, useRef, useState } from 'react'
import type { AudioTrack, RecordingManifest } from '../../../shared/recording'
import { RecordingPlayer, type PlaybackState } from '../audio/recordingPlayer'
export function useRecordingPlayback(recordingId?:string) {
  const player=useRef<RecordingPlayer>(),[manifest,setManifest]=useState<RecordingManifest>(),[track,setTrack]=useState<AudioTrack>('mix')
  const [state,setState]=useState<PlaybackState>({positionMs:0,playing:false,message:''})
  const [loading,setLoading]=useState(false)
  useEffect(()=>{
    let mounted=true
    setManifest(undefined);setTrack('mix');setState({positionMs:0,playing:false,message:recordingId?'':'此历史会话没有原音，仍可校对文字和导出'})
    if(!recordingId)return
    const api=window.electronAPI?.recording
    if(!api){setState({positionMs:0,playing:false,message:'原音回放需要桌面客户端'});return}
    setLoading(true)
    void api.read(recordingId).then(value=>{
      if(!mounted)return
      if(value.error || !value.blocks.length)throw new Error(value.error || '原音没有可播放片段')
      setManifest(value);player.current=new RecordingPlayer(value,(index,source)=>api.readBlock(recordingId,index,source),value=>{if(mounted)setState(value)})
    }).catch(()=>{if(mounted)setState({positionMs:0,playing:false,message:'原音缺失、已删除或无法读取；文字和版本仍保留'})}).finally(()=>{if(mounted)setLoading(false)})
    return ()=>{mounted=false;player.current?.dispose();player.current=undefined}
  },[recordingId])
  return {manifest,track,state,loading,seek:(ms:number,play=false)=>player.current?.seek(ms,play),
    play:()=>player.current?.play(),pause:()=>player.current?.pause(),
    changeTrack:(value:AudioTrack)=>{setTrack(value);player.current?.changeTrack(value)}}
}
