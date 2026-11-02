import { fileHeaders, fileRequest, VOLC_FILE_SUBMIT, VOLC_FILE_QUERY } from '../../shared/volcFileContract'
import type { VolcCredentials } from '../../shared/volcProtocol'
export interface FileServiceReply { code: string; taskId?: string; raw?: unknown }
export interface FileService {
  submit(id: string, url: string, durationMs: number, enableDdc: boolean, credentials: VolcCredentials): Promise<FileServiceReply>
  query(id: string, credentials: VolcCredentials): Promise<FileServiceReply>
}
export class VolcFileService implements FileService {
  constructor(private request: typeof fetch = fetch) {}
  private async call(endpoint: string, headers: Record<string, string>, body: unknown): Promise<FileServiceReply> {
    // No retries and no redirect: submit may already have been billed when a response is lost.
    const response = await this.request(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000), redirect: 'error' })
    if ([401,403,429,413].includes(response.status)) return { code: 'HTTP_' + response.status }
    const code = response.headers.get('X-Api-Status-Code')
    if (!response.ok || !code) throw new Error('文件转写 HTTP 响应未知，请保留任务 ID 查询确认')
    let raw: unknown
    const text = await response.text()
    if (text.trim()) raw = JSON.parse(text)
    const taskId = (raw as { task_id?: unknown })?.task_id
    return { code, taskId: typeof taskId === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(taskId) ? taskId : undefined, raw }
  }
  submit(id: string, url: string, durationMs: number, enableDdc: boolean, credentials: VolcCredentials) {
    return this.call(VOLC_FILE_SUBMIT, fileHeaders(credentials, id, true), fileRequest(url, durationMs, enableDdc))
  }
  query(id: string, credentials: VolcCredentials) { return this.call(VOLC_FILE_QUERY, fileHeaders(credentials, id), {}) }
}
