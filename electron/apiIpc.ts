import type { BrowserWindow, IpcMain } from 'electron'
import type {
  ReviewExportOptions,
  ReviewExportResult,
  ApiRecordingStatus,
  ApiTagData,
  ApiTopicData,
  SessionDetail,
  SessionSummary,
} from '../shared/electronApi'
import { createPendingRequests } from '../shared/pendingRequests'
import { broadcastSessionEvent } from './apiBroadcast'
import { isTrustedSender } from './ipcSecurity'

interface RegisterApiIpcOptions {
  ipcMain: IpcMain
  getMainWindow: () => BrowserWindow | null
}

let _getMainWindow: () => BrowserWindow | null = () => null

const IPC_TIMEOUT_MS = 5000

// Every request carries an id that the renderer echoes back, so concurrent
// API calls of the same kind each receive their own reply.
const pendingRequests = createPendingRequests(IPC_TIMEOUT_MS)

export class LibraryUnavailable extends Error {}

async function requestFromRenderer<T>(
  channel: string,
  responseChannel: string,
  ...args: unknown[]
): Promise<T> {
  const win = _getMainWindow()
  if (!win || win.isDestroyed()) throw new LibraryUnavailable('Meeting library is unavailable')

  const { id, promise } = pendingRequests.create<T | undefined>(responseChannel, undefined)
  win.webContents.send(channel, id, ...args)
  const result = await promise
  if (result === undefined) throw new LibraryUnavailable('Meeting library is unavailable')
  return result
}

export function requestSessions(): Promise<SessionSummary[]> {
  return requestFromRenderer<SessionSummary[]>('api-get-sessions', 'api-respond-sessions')
}

export function requestSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  return requestFromRenderer<SessionDetail | null>('api-get-session-detail', 'api-respond-session-detail', sessionId)
}

export function requestReviewExport(sessionId: string, options: ReviewExportOptions): Promise<ReviewExportResult> {
  return requestFromRenderer<ReviewExportResult>('api-review-export', 'api-respond-review-export',
    sessionId, options)
}

export function requestSearchSessions(query: string): Promise<SessionSummary[]> {
  return requestFromRenderer<SessionSummary[]>('api-search-sessions', 'api-respond-search-sessions', query)
}

export function requestTopics(): Promise<ApiTopicData[]> {
  return requestFromRenderer<ApiTopicData[]>('api-get-topics', 'api-respond-topics')
}

export function requestTags(): Promise<ApiTagData[]> {
  return requestFromRenderer<ApiTagData[]>('api-get-tags', 'api-respond-tags')
}

export function requestRecordingStatus(): Promise<ApiRecordingStatus> {
  return requestFromRenderer<ApiRecordingStatus>('api-get-recording-status', 'api-respond-recording-status')
}

const RESPONSE_CHANNELS = [
  'api-respond-review-export',
  'api-respond-sessions',
  'api-respond-session-detail',
  'api-respond-search-sessions',
  'api-respond-topics',
  'api-respond-tags',
  'api-respond-recording-status',
]

export function registerApiIpc({ ipcMain, getMainWindow }: RegisterApiIpcOptions): void {
  _getMainWindow = getMainWindow

  ipcMain.on('api-notify-session-start', (_event, sessionId: string) => {
    broadcastSessionEvent('session-start', sessionId)
  })

  ipcMain.on('api-notify-session-end', (_event, sessionId: string) => {
    broadcastSessionEvent('session-end', sessionId)
  })

  for (const channel of RESPONSE_CHANNELS) {
    ipcMain.on(channel, (event, requestId: number, value: unknown) => {
      if (!isTrustedSender(event)) return
      pendingRequests.resolve(channel, requestId, value)
    })
  }
}
