import { queueImageRemoval, flushImageRemovals } from './imageCleanup'
import type { SessionImage } from '../../../shared/sessionImages'
import { MAX_IMAGE_BYTES } from '../../../shared/sessionImages'
import { sessionRepository } from '../utils/sessionRepository'
import { useSessionStore } from '../stores/sessionStore'

export async function imageDataUrl(sessionId: string, image: SessionImage): Promise<string> {
  const api = window.electronAPI?.sessionImages
  if (!api) throw new Error('图片素材需要桌面应用')
  const bytes = new Uint8Array(await api.read(sessionId, image.assetPath))
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(n => n.toString(16).padStart(2, '0')).join('')
  if (bytes.length !== image.bytes || hash !== image.sha256) throw new Error(`图片“${image.name}”已损坏，校验不匹配`)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(new Blob([bytes], { type: image.mimeType }))
  })
}

export async function importSessionImages(sessionId: string, files: File[], atMs: number): Promise<void> {
  const api = window.electronAPI?.sessionImages
  if (!api) throw new Error('导入图片需要桌面应用')
  if (!Number.isFinite(atMs) || atMs < 0) throw new Error('图片时间无效')
  if (files.some(file => !file.size || file.size > MAX_IMAGE_BYTES)) throw new Error('每张图片必须为 1 字节至 20 MiB')
  const imported: SessionImage[] = []
  try {
    for (const file of files) imported.push({ ...await api.import(sessionId, new Uint8Array(await file.arrayBuffer()), file.name), atMs, caption: '' })
    const sessions = await sessionRepository.mutateDurable(sessionId, current => ({ images: [...(current.images || []), ...imported] }))
    useSessionStore.setState({ sessions })
  } catch (error) {
    for (const image of imported) queueImageRemoval({ sessionId, assetPath: image.assetPath })
    const cleanup = await Promise.allSettled([flushImageRemovals(useSessionStore.getState().sessions)])
    if (cleanup.some(result => result.status === 'rejected')) throw new Error(`${(error as Error).message}；部分未保存图片清理失败，请重试清理会话素材`)
    throw error
  }
}

export async function editSessionImage(sessionId: string, imageId: string, patch: { atMs: number; caption: string }): Promise<void> {
  if (!Number.isFinite(patch.atMs) || patch.atMs < 0) throw new Error('图片时间必须为非负秒数')
  const sessions = await sessionRepository.mutateDurable(sessionId, current => ({ images: current.images?.map(image => image.id === imageId ? { ...image, ...patch } : image) }))
  useSessionStore.setState({ sessions })
}

export async function deleteSessionImage(sessionId: string, image: SessionImage): Promise<void> {
  queueImageRemoval({ sessionId, assetPath: image.assetPath })
  const sessions = await sessionRepository.mutateDurable(sessionId, current => ({ images: current.images?.filter(item => item.id !== image.id) }))
  useSessionStore.setState({ sessions })
  try { await flushImageRemovals(sessions) } catch (error) { throw new Error(`图片已从时间轴移除，素材清理待重试：${(error as Error).message}`) }
}
