export const engines = ['火山引擎', '本地 OpenAI 兼容', '本地 FunASR / SenseVoice', '本地 whisper.cpp'] as const
export type Engine = typeof engines[number]
export const captureStates = ['ready', 'starting', 'recording', 'reconnecting', 'stopping', 'saved', 'saveFailed', 'interrupted'] as const
export type Capture = typeof captureStates[number]
export const sampleFile = '产品周会录音.m4a'
