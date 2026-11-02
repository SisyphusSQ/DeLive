export interface FileTaskConfig {
  endpoint: string
  region: string
  bucket: string
  prefix: string
  forcePathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  urlTtlSeconds: number
}
export interface TranscriptVersion {
  id: string
  kind: 'realtime' | 'post-meeting' | 'edited' | 'legacy'
  createdAt: number
  text: string
  segments: Array<{ id?: string; text: string; startMs?: number; endMs?: number; speakerId?: string; isFinal?: boolean }>
  speakers: Array<{ id: string; label: string; displayName?: string }>
  parentVersionId?: string
  sourceJobId?: string
  resource?: string
  ssdVersion?: '200' | '300'
  response?: FileRecognitionResult
  speakerMapping?: { sourceVersionId: string; confirmedAt: number; pairs: Record<string, string> }
}
export interface FileRecognitionResult {
  text: string
  durationMs: number
  utterances: Array<{ text: string; startMs: number; endMs: number; speaker?: string; words?: Array<{ text: string; startMs: number; endMs: number }> }>
}
export type FileTaskStatus = 'preparing' | 'uploading' | 'submitting' | 'submission-unknown' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
export interface FileTask {
  id: string
  taskId: string
  sessionId: string
  recordingId: string
  createdAt: number
  updatedAt: number
  status: FileTaskStatus
  durationMs: number
  sizeBytes: number
  uploadedBytes: number
  objectKey: string
  expiresAt?: number
  ssdVersion: '200' | '300'
  enableDdc: boolean
  cleanup: 'none' | 'pending' | 'done' | 'failed'
  error?: { code: string; message: string }
  cleanupError?: string
  version?: TranscriptVersion
}
export interface FileTasksAPI {
  settings(): Promise<Omit<FileTaskConfig, 'accessKeyId' | 'secretAccessKey' | 'sessionToken'> & { configured: boolean }>
  configure(config: Partial<FileTaskConfig>): Promise<void>
  list(): Promise<FileTask[]>
  start(sessionId: string, recordingId: string, credentials: { apiKey?: string; appKey?: string; accessKey?: string }, enableDdc?: boolean): Promise<FileTask>
  query(id: string, credentials: { apiKey?: string; appKey?: string; accessKey?: string }): Promise<FileTask>
  cleanup(id: string): Promise<FileTask>
  cancel(id: string): Promise<FileTask>
}
