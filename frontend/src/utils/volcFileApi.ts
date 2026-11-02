import type { FileTask } from '../../../shared/fileTranscription'
import { MAX_FILE_BYTES, validateFileLimits } from '../../../shared/volcFileContract'
import { decodeFileToMonoWav } from './audioFileToWav'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { sessionRepository } from './sessionRepository'
import { createDraftSession } from './sessionLifecycle'
import { addPostMeetingVersion } from './transcriptVersions'

export function volcFileCredentials() {
  const config = useSettingsStore.getState().settings.providerConfigs?.volc
  return { apiKey: typeof config?.apiKey === 'string' ? config.apiKey : undefined,
    appKey: typeof config?.appKey === 'string' ? config.appKey : undefined,
    accessKey: typeof config?.accessKey === 'string' ? config.accessKey : undefined }
}
export function fileTaskApi() {
  const api = window.electronAPI?.fileTasks
  if (!api) throw new Error('标准文件转写需要桌面客户端，以保存任务与管理私有音频副本')
  return api
}
export async function startRecordingFileTask(sessionId: string, recordingId: string): Promise<FileTask> {
  return fileTaskApi().start(sessionId, recordingId, volcFileCredentials(), useSettingsStore.getState().settings.providerConfigs?.volc?.enableDdc === true)
}
let ingestion: Promise<void> = Promise.resolve()
export function ingestFileTasks(jobs: FileTask[]): Promise<void> {
  ingestion = ingestion.catch(() => {}).then(async () => {
  for (const job of jobs) {
    if (!job.version) continue
    const session = useSessionStore.getState().sessions.find(item => item.id === job.sessionId)
    if (!session) continue // Do not recreate a session the user deleted.
    const next = addPostMeetingVersion(session, job.version)
    if (next === session) continue
    const sessions = await sessionRepository.mutateDurable(session.id, current => {
      const updated = addPostMeetingVersion(current, job.version!)
      return { versions: updated.versions, selectedVersionId: updated.selectedVersionId, transcript: updated.transcript,
        segments: updated.segments, speakers: updated.speakers }
    })
    useSessionStore.setState({ sessions })
  }
  })
  return ingestion
}
async function readDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file), audio = new Audio()
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => { audio.removeAttribute('src'); reject(new Error('无法读取音频时长')) }, 15000)
      audio.onloadedmetadata = () => { clearTimeout(timer); resolve(audio.duration * 1000) }
      audio.onerror = () => { clearTimeout(timer); reject(new Error('音频格式无法解码')) }
      audio.preload = 'metadata'; audio.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
export async function importVolcFile(file: File): Promise<string> {
  const api = fileTaskApi()
  if (!(await api.settings()).configured) throw new Error('请先配置会后转写的私有对象存储')
  if (file.size >= MAX_FILE_BYTES) throw new Error('文件达到 512 MB 限制，未上传')
  const duration = await readDuration(file)
  validateFileLimits(44 + Math.ceil(duration * 16) * 2, duration)
  const decoded = await decodeFileToMonoWav(file)
  const buffer = await decoded.wav.arrayBuffer()
  validateFileLimits(buffer.byteLength, decoded.durationMs)
  const draft = createDraftSession({ title: file.name.replace(/\.[^.]+$/, ''), providerId: 'volc',
    sourceMeta: { captureMode: 'file', providerMode: 'full-session-retranscription', platform: window.electronAPI!.platform } })
  useSessionStore.setState({ sessions: sessionRepository.createDraft(draft) })
  const recording = window.electronAPI!.recording
  await recording.begin(draft.id)
  let failed = true
  try {
    for (let offset = 44; offset < buffer.byteLength; offset += 64000) {
      await recording.append(draft.id, { sampleRate: 16000, startMs: (offset - 44) / 32,
        tracks: { mix: buffer.slice(offset, Math.min(offset + 64000, buffer.byteLength)) } })
    }
    failed = false
  } finally {
    const manifest = await recording.finish(draft.id, failed)
    useSessionStore.setState({ sessions: sessionRepository.updateMetadata(draft.id, { audioRecordingId: draft.id,
      duration: manifest.durationMs, status: failed ? 'interrupted' : 'completed', wasInterrupted: failed }) })
  }
  const job = await startRecordingFileTask(draft.id, draft.id)
  return job.id
}
