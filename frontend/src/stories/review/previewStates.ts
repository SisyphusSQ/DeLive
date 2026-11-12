export const previewStates = {
  ready: '正常阅读', unconfigured: 'AI 未配置', generating: 'AI 生成中', failed: 'AI 生成失败', stale: '材料变化 · 内容过期',
  saveFailed: '保存失败 · 草稿保留', sourceMissing: '校正来源缺失', credentials: '火山凭据缺失', storage: '临时存储未配置',
  preparing: '任务 · 准备音频', uploading: '任务 · 上传中', submitting: '任务 · 提交中', unknown: '任务 · 结果未知', queued: '任务 · 排队中', processing: '任务 · 转写中',
  completed: '任务 · 已保存', awaitingSave: '任务 · 待保存', taskFailed: '任务 · 失败', cleanupFailed: '任务 · 清理未确认', cancelled: '任务 · 已停止', deletedSource: '任务 · 来源会议已删除', gap: '原音片段缺失',
} as const
export type PreviewState = keyof typeof previewStates
export const fileTaskStates = ['preparing', 'uploading', 'submitting', 'unknown', 'queued', 'processing', 'completed', 'awaitingSave', 'taskFailed', 'cleanupFailed', 'cancelled', 'deletedSource'] as const
export const activeFileTaskStates: PreviewState[] = ['preparing', 'uploading', 'submitting', 'unknown', 'queued', 'processing', 'awaitingSave']

// This preview keeps one cloud task. Keep its recovery actions until the task and cleanup settle.
export function blocksPreviewSubmission(state: PreviewState) {
  return activeFileTaskStates.includes(state) || state === 'cleanupFailed'
}
