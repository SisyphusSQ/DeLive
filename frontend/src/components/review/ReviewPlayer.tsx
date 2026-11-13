import { Headphones, Pause, Play } from 'lucide-react'
import type { AudioTrack } from '../../../../shared/recording'
import type { useRecordingPlayback } from '../../hooks/useRecordingPlayback'
import { timestamp } from '../../utils/reviewVersions'
import { Button } from '../ui'
import { Select } from '../ui/Select'

const trackLabels: Record<AudioTrack, string> = { mix: '同步混音', system: '系统声音', microphone: '麦克风' }

export function ReviewPlayer({ playback }: { playback: ReturnType<typeof useRecordingPlayback> }) {
  const { manifest, loading, state, track } = playback
  const availableTracks = manifest
    ? (Object.keys(trackLabels) as AudioTrack[]).filter(value => manifest.blocks.some(block => block.tracks.includes(value)))
    : []

  return (
    <section aria-label="原音回放" className="z-10 shrink-0 border-t border-border/70 bg-card px-3 py-2 sm:px-6 sm:py-3">
      <div className="mx-auto max-w-[52rem]">
        {manifest ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              size="icon"
              className="shrink-0 !rounded-full"
              aria-label={state.playing ? '暂停' : '播放'}
              title={state.playing ? '暂停原音' : '播放原音'}
              onClick={() => state.playing ? playback.pause() : void playback.play()}
            >
              {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
                <span className="text-muted-foreground">原音回放</span>
                <span className="tabular-nums" data-playback-position={Math.round(state.positionMs)}>
                  {timestamp(state.positionMs)} <span className="text-muted-foreground">/ {timestamp(manifest.durationMs)}</span>
                </span>
              </div>
              <input
                aria-label="原音播放位置"
                className="block h-4 w-full cursor-pointer accent-primary"
                type="range"
                min={0}
                max={manifest.durationMs}
                step={10}
                value={state.positionMs}
                onChange={event => void playback.seek(Number(event.target.value), state.playing)}
              />
            </div>
            <Select
              aria-label="回放录音来源"
              className="h-8 w-24 shrink-0 rounded-md border border-border bg-background px-2 text-xs"
              value={track}
              onChange={event => playback.changeTrack(event.target.value as AudioTrack)}
            >
              {availableTracks.map(value => <option key={value} value={value}>{trackLabels[value]}</option>)}
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Headphones className="h-4 w-4 shrink-0" />
            {loading ? '正在读取原音索引…' : state.message}
          </div>
        )}
        {manifest && state.message && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span role="status">{state.message}</span>
            {state.nextMs !== undefined && (
              <button className="text-primary underline" onClick={() => void playback.seek(state.nextMs!, true)}>
                跳到下一段可用原音 {timestamp(state.nextMs)}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
