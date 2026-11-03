import { app, nativeImage, type IpcMain } from 'electron'
import { mkdir, readFile, writeFile, rename, rm, lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { assertTrustedSender } from './ipcSecurity'
import { MAX_IMAGE_BYTES, validImagePath, type SessionImage } from '../shared/sessionImages'

export class SessionImageStore {
  constructor(readonly directory: string) {}
  private folder(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('无效的会话编号')
    return path.join(this.directory, id)
  }
  private async file(id: string, assetPath: string): Promise<string> {
    if (!validImagePath(id, assetPath)) throw new Error('无效的图片相对路径')
    if ((await lstat(this.folder(id))).isSymbolicLink()) throw new Error('图片目录不能是符号链接')
    const file = path.join(this.directory, assetPath)
    if ((await lstat(file)).isSymbolicLink()) throw new Error('图片不能是符号链接')
    return file
  }
  async cleanupUnreferenced(references: Record<string, string[]>): Promise<void> {
    if (!references || typeof references !== 'object' || Array.isArray(references)) throw new Error('图片引用清单无效')
    for (const [id, files] of Object.entries(references)) {
      this.folder(id)
      if (!Array.isArray(files) || files.some(file => typeof file !== 'string' || !validImagePath(id, file))) throw new Error('图片引用清单无效')
    }
    await mkdir(this.directory, { recursive: true })
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('素材根目录不能是符号链接')
    for (const folder of await readdir(this.directory, { withFileTypes: true })) {
      if (!folder.isDirectory() || !/^[a-zA-Z0-9_-]{1,128}$/.test(folder.name)) continue
      for (const file of await readdir(this.folder(folder.name), { withFileTypes: true })) {
        const relative = `${folder.name}/${file.name}`
        const original = relative.replace(/\.tmp$/, '')
        if (file.isFile() && validImagePath(folder.name, original) && !references[folder.name]?.includes(relative)) await rm(path.join(this.directory, relative))
      }
    }
  }
  async import(id: string, input: Uint8Array, name: string): Promise<Omit<SessionImage, 'atMs' | 'caption'>> {
    const folder = this.folder(id)
    if (!(input instanceof Uint8Array) || !input.byteLength || input.byteLength > MAX_IMAGE_BYTES) throw new Error('图片必须为 1 字节至 20 MiB')
    if (typeof name !== 'string' || name.length > 512) throw new Error('图片文件名无效')
    const bytes = Buffer.from(input)
    const extension = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : undefined
    if (!extension) throw new Error('仅支持 PNG、JPEG、WebP 图片')
    const decoded = nativeImage.createFromBuffer(bytes)
    if (decoded.isEmpty()) throw new Error('图片已损坏或无法解码')
    const { width, height } = decoded.getSize()
    if (width * height > 40_000_000) throw new Error('图片超过 4000 万像素，请缩小后导入')
    await mkdir(folder, { recursive: true })
    if ((await lstat(folder)).isSymbolicLink()) throw new Error('图片目录不能是符号链接')
    const imageId = randomUUID(), assetPath = `${id}/${imageId}.${extension}`, file = path.join(this.directory, assetPath)
    try {
      await writeFile(file + '.tmp', bytes, { flag: 'wx', mode: 0o600 })
      await rename(file + '.tmp', file)
    } catch (error) { await rm(file + '.tmp', { force: true }); throw error }
    return { id: imageId, assetPath, name: path.basename(name) || `图片.${extension}`, mimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
      bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width, height, createdAt: Date.now() }
  }
  async read(id: string, assetPath: string): Promise<Uint8Array> {
    const file = await this.file(id, assetPath)
    const stat = await lstat(file)
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error('图片文件无效或过大')
    return readFile(file)
  }
  async remove(id: string, assetPath: string): Promise<void> {
    try { await rm(await this.file(id, assetPath)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  async removeSession(id: string): Promise<void> {
    const folder = this.folder(id)
    try {
      if ((await lstat(folder)).isSymbolicLink()) throw new Error('图片目录不能是符号链接')
      await rm(folder, { recursive: true })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}

export function registerSessionImagesIpc(ipc: IpcMain): SessionImageStore {
  const store = new SessionImageStore(path.join(app.getPath('userData'), 'session-images'))
  ipc.handle('session-images:cleanup', (event, references) => { assertTrustedSender(event, 'session-images:cleanup'); return store.cleanupUnreferenced(references) })
  ipc.handle('session-images:import', (event, id, bytes, name) => { assertTrustedSender(event, 'session-images:import'); return store.import(id, bytes, name) })
  ipc.handle('session-images:read', (event, id, assetPath) => { assertTrustedSender(event, 'session-images:read'); return store.read(id, assetPath) })
  ipc.handle('session-images:remove', (event, id, assetPath) => { assertTrustedSender(event, 'session-images:remove'); return store.remove(id, assetPath) })
  ipc.handle('session-images:remove-session', (event, id) => { assertTrustedSender(event, 'session-images:remove-session'); return store.removeSession(id) })
  return store
}
