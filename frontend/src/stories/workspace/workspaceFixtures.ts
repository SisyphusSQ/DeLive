export const engines = ['火山引擎', '本地 OpenAI 兼容', '本地 FunASR / SenseVoice', '本地 whisper.cpp'] as const
export type Engine = typeof engines[number]
export const captureStates = ['ready', 'starting', 'recording', 'reconnecting', 'stopping', 'saved', 'saveFailed', 'interrupted'] as const
export type Capture = typeof captureStates[number]
export const sampleFile = '产品周会录音.m4a'

export const utilityDefaults: Record<string, string> = {
  '启用开放 API': 'false', '访问令牌': 'preview-only-not-a-real-token', '启用云端备份': 'true',
  '备份服务': 'S3', '备份 Endpoint': 'https://storage.example', '备份区域': 'cn-example', '备份桶': 'meeting-backups',
  '备份前缀': 'delive/', '备份 Access Key ID': 'preview-key', '备份 Secret Access Key': 'preview-secret',
  'WebDAV 地址': 'https://dav.example', 'WebDAV 用户名': 'preview', 'WebDAV 密码': 'preview-secret', 'WebDAV 目录': '/delive/',
  '夸克 CLI 入口': '/example/quark-runtime.mjs', '夸克备份目录': 'ai-agent/coding/delive/backups/',
  '包含原音': 'true', '使用路径式地址': 'true', '完成后自动备份': 'false', '开机自启': 'false', '启动时检查更新': 'true',
}
