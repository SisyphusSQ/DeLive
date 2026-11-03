export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export interface SessionImage {
  id: string
  assetPath: string
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  bytes: number
  sha256: string
  width: number
  height: number
  atMs: number
  caption: string
  createdAt: number
}
export interface SessionImagesAPI {
  cleanupUnreferenced(references: Record<string, string[]>): Promise<void>
  import(sessionId: string, bytes: Uint8Array, name: string): Promise<Omit<SessionImage, 'atMs' | 'caption'>>
  read(sessionId: string, assetPath: string): Promise<Uint8Array>
  remove(sessionId: string, assetPath: string): Promise<void>
  removeSession(sessionId: string): Promise<void>
}

export function validImagePath(sessionId: string, assetPath: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)
    && new RegExp(`^${sessionId}/[a-f0-9-]{36}\\.(png|jpg|webp)$`).test(assetPath)
}

export function validateSessionImages(value: unknown, sessionId: string): SessionImage[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('图片清单格式无效')
  const ids = new Set<string>()
  for (const image of value) {
    if (!image || typeof image.id !== 'string' || ids.has(image.id)
      || typeof image.assetPath !== 'string' || !validImagePath(sessionId, image.assetPath)
      || image.assetPath.split('/')[1].split('.')[0] !== image.id
      || typeof image.name !== 'string' || typeof image.caption !== 'string'
      || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)
      || !Number.isSafeInteger(image.bytes) || image.bytes <= 0 || image.bytes > MAX_IMAGE_BYTES
      || !Number.isSafeInteger(image.width) || image.width <= 0 || !Number.isSafeInteger(image.height) || image.height <= 0
      || !/^[a-f0-9]{64}$/.test(image.sha256) || !Number.isFinite(image.atMs) || image.atMs < 0
      || !Number.isFinite(image.createdAt)) throw new Error('图片素材元数据无效，原数据未修改')
    ids.add(image.id)
  }
  return value.map(image => ({ ...image })).sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id))
}
