export const AI_REQUEST_TIMEOUT_MS = 600_000

export interface AiConnection {
  provider?: 'openai-compatible' | 'openai' | 'codex'
  protocol?: 'chat-completions' | 'responses'
  baseUrl?: string
  apiKey?: string
  codexPath?: string
  visionModels?: string[]
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiImage {
  dataUrl: string
  label: string
}

export interface AiRequest {
  model: string
  messages: AiMessage[]
  images?: AiImage[]
  schema?: Record<string, unknown>
}

export interface CodexStatus {
  version: string
  authenticated: boolean
  models: Array<{ id: string; vision: boolean }>
}

export interface CodexAPI {
  inspect: (executable?: string) => Promise<CodexStatus>
  complete: (id: string, executable: string | undefined, request: AiRequest) => Promise<string>
  cancel: (id: string) => Promise<void>
  onDelta: (listener: (id: string, delta: string) => void) => () => void
}

export function aiBaseUrl(config: AiConnection): string {
  return (config.baseUrl?.trim() || (config.provider === 'openai'
    ? 'https://api.openai.com/v1' : 'http://127.0.0.1:11434/v1')).replace(/\/+$/, '')
}

export function aiUsesResponses(config: AiConnection): boolean {
  return config.provider === 'openai' || config.protocol === 'responses'
}

export function redactAiError(message: string, secret?: string): string {
  return (secret ? message.split(secret).join('[redacted]') : message)
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g, '$1?[redacted]')
}
