import type { TranscriptSegment } from './index'
export interface RealtimeRecognition {
  id: string
  offsetMs: number
  status: 'streaming' | 'complete' | 'incomplete'
  revision: number
  sequence?: number
  text: string
  segments: TranscriptSegment[]
  response: { text: string; utterances: Array<{ text: string; start_time: number; end_time: number; definite: boolean; additions?: { speaker_id?: string; source?: string } }> }
  errorCode?: string
}
