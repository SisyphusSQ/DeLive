import { create } from 'zustand'
import type { SourceState } from '../../../shared/recording'
interface CaptureState {
  system: boolean
  microphone: boolean
  microphoneId: string
  localOnly: boolean
  sources: SourceState[]
  error: string
  asrStatus: string
  update: (patch: Partial<Omit<CaptureState, 'update'>>) => void
}
export const useRecordingStore = create<CaptureState>(set => ({
  system: true, microphone: true, microphoneId: '', localOnly: false,
  sources: [], error: '', asrStatus: '',
  update: patch => set(patch),
}))
