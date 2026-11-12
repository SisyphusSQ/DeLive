import type { SessionImage } from './sessionImages'
export const BACKUP_FORMAT = 1
export interface BackupMetadata {
  version: string
  schemaVersion: number
  exportedAt: string
  sessions: Array<{ id: string; status?: string; audioRecordingId?: string; images?: SessionImage[]; [key: string]: unknown }>
  tags: Array<{ id: string; [key: string]: unknown }>
  topics?: Array<{ id: string; [key: string]: unknown }>
  settings: Record<string, unknown>
}
export interface BackupFile { path: string; bytes: number; sha256: string }
export interface BackupManifest { format: 1; createdAt: string; includeAudio: boolean; metadata: BackupMetadata; files: BackupFile[] }
export interface BackupArtifact { id: string; name: string; bytes: number; sha256: string; includeAudio: boolean; sessions: number }
export interface PreparedRestore { id: string; metadataJson: string; includeAudio: boolean; legacy: boolean; files: number }
export interface BackupProgress { stage: string; message: string; completed?: number; total?: number; taskId?: string }
export interface QuarkConfig { runtimeScript: string; directory: string; pythonPath?: string }
export interface CloudJob { targetHash: string; id: string; artifact: BackupArtifact; provider: 's3'|'webdav'|'quark'; state: 'uploading'|'unknown'|'failed'|'complete'; taskId?: string; cloudFid?: string; key?: string; parentFid?: string; error?: string; createdAt: string }
export interface CompleteBackupAPI {
  upload(config: import('./electronApi').CloudBackupIpcConfig, artifactId: string): Promise<CloudJob>
  build(metadataJson: string, includeAudio: boolean): Promise<BackupArtifact>
  prepare(config: import('./electronApi').CloudBackupIpcConfig, key: string): Promise<PreparedRestore>
  apply(stageId: string, sessionIds: string[], rollbackId: string): Promise<string>
  settle(token: string, committed: boolean): Promise<void>
  pendingRestore(): Promise<{ token: string } | null>
  prepareRollback(id: string): Promise<PreparedRestore>
  rollbacks(): Promise<BackupArtifact[]>
  jobs(): Promise<CloudJob[]>
  resume(config: import('./electronApi').CloudBackupIpcConfig, jobId: string): Promise<CloudJob>
  onProgress(callback: (progress: BackupProgress) => void): () => void
}

export function portableSettings(value: unknown): Record<string, unknown> {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const output: Record<string, unknown> = {}
  for (const key of ['currentVendor','colorTheme']) if (typeof input[key] === 'string') output[key] = input[key]
  if (typeof input.autoCheckUpdate === 'boolean') output.autoCheckUpdate=input.autoCheckUpdate
  if (Array.isArray(input.languageHints)) output.languageHints=input.languageHints.filter(v=>typeof v==='string')
  if (input.aiPostProcess && typeof input.aiPostProcess === 'object') {
    const ai = input.aiPostProcess as Record<string, unknown>, result: Record<string, unknown> = {}
    for (const key of ['enabled','provider','protocol','defaultModel','preferCorrectedText','correctionMode','enableStreaming','model','promptLanguage']) if (['string','boolean'].includes(typeof ai[key])) result[key] = ai[key]
    for(const key of ['visionModels','selectedModels','availableModels'])if(Array.isArray(ai[key]))result[key]=(ai[key] as unknown[]).filter(v=>typeof v==='string')
    if(ai.modelAssignment&&typeof ai.modelAssignment==='object')result.modelAssignment=Object.fromEntries(Object.entries(ai.modelAssignment).filter(([key,value])=>['briefing','chat','mindmap','correction'].includes(key)&&typeof value==='string'))
    if (typeof ai.baseUrl === 'string') { try { const url = new URL(ai.baseUrl); if (['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) result.baseUrl = url.href } catch { /* Invalid connection addresses are not portable. */ } }
    output.aiPostProcess = result
  }
  return output
}
