export type AudioSource = 'system' | 'microphone'
export type AudioTrack = AudioSource | 'mix'
export interface SourceState {
  source: AudioSource
  status: 'disabled' | 'requesting' | 'active' | 'muted' | 'ended' | 'denied' | 'error'
  device?: string
  level: number
  atMs: number
}
export interface AudioBlock {
  index: number
  startMs: number
  frames: number
  sampleRate: number
  tracks: AudioTrack[]
  bytes: number
}
export interface RecordingManifest {
  error?: string
  schemaVersion: 1
  sessionId: string
  createdAt: number
  status: 'recording' | 'completed' | 'interrupted'
  durationMs: number
  bytes: number
  blocks: AudioBlock[]
  sources: SourceState[]
  events: Array<{ atMs: number; message: string }>
}
export interface RecordingSettings {
  directory: string
  quotaBytes: number
  retention: 'manual'
}
export interface RecordingPacket {
  startMs: number
  sampleRate: number
  tracks: Partial<Record<AudioTrack, ArrayBuffer>>
}
export interface RecordingAPI {
  begin(sessionId: string): Promise<RecordingManifest>
  append(sessionId: string, packet: RecordingPacket): Promise<AudioBlock>
  event(sessionId: string, event: { atMs: number; message: string; source?: SourceState }): Promise<void>
  finish(sessionId: string, interrupted?: boolean): Promise<RecordingManifest>
  list(): Promise<RecordingManifest[]>
  read(sessionId: string): Promise<RecordingManifest>
  readBlock(sessionId: string, index: number, track: AudioTrack): Promise<Uint8Array>
  remove(sessionId: string): Promise<void>
  settings(): Promise<RecordingSettings & { bytes: number }>
  configure(quotaBytes: number, chooseDirectory?: boolean): Promise<RecordingSettings>
}
