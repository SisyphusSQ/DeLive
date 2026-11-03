import { app, dialog, type IpcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { RecordingStore } from './recordingStore'
import { assertTrustedSender } from './ipcSecurity'
import type { AudioTrack, RecordingPacket, SourceState } from '../shared/recording'

export function registerRecordingIpc(ipc: IpcMain) {
  let stores: RecordingStore[] | undefined
  const configFile = () => path.join(app.getPath('userData'), 'recording-storage.json')
  function getStores() {
    if (!stores) {
      const config = fs.existsSync(configFile()) ? JSON.parse(fs.readFileSync(configFile(), 'utf8')) : { directories: [path.join(app.getPath('userData'), 'recordings')], quotaBytes: 0 }
      stores = (config.directories as string[]).map(d => new RecordingStore(d, config.quotaBytes))
    }
    return stores!
  }
  function owner(id: string) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid recording ID')
    const found = getStores().find(s => fs.existsSync(path.join(s.directory, id, 'index.json')))
    if (!found) throw new Error('找不到本地原音')
    return found
  }
  const watched = new Set<number>()
  const interrupt = () => stores?.forEach(s => {
    try { s.interruptAll() } catch (error) { console.error('[Recording] Failed to mark interruption', error) }
  })
  const handlers = {
    begin: (id: string) => { if(fs.existsSync(path.join(app.getPath('userData'),'backups','pending-restore.json'))) throw new Error('请先完成恢复事务'); return getStores()[0].begin(id) },
    append: (id: string, p: RecordingPacket) => owner(id).append(id, p),
    event: (id: string, e: { atMs: number; message: string; source?: SourceState }) => owner(id).event(id, e),
    finish: (id: string, interrupted?: boolean) => owner(id).finish(id, interrupted),
    list: () => getStores().flatMap(s => s.list()),
    read: (id: string) => owner(id).read(id),
    readBlock: (id: string, index: number, track: AudioTrack) => owner(id).readBlock(id, index, track),
    remove: (id: string) => owner(id).remove(id),
    settings: () => getStores()[0].settings(),
    configure: async (quotaBytes: number, chooseDirectory = false) => {
      if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0) throw new Error('无效磁盘配额')
      const all = getStores()
      if (all.some(s => s.list().some(m => m.status === 'recording'))) throw new Error('请停止录音后修改存储设置')
      if (chooseDirectory) {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
        if (!result.canceled) {
          const directory = path.join(result.filePaths[0], 'delive-recordings')
          stores = [new RecordingStore(directory, quotaBytes), ...all.filter(s => s.directory !== directory)]
        }
      }
      getStores().forEach(s => { s.quotaBytes = quotaBytes })
      const file = configFile()
      fs.writeFileSync(file + '.tmp', JSON.stringify({ directories: getStores().map(s => s.directory), quotaBytes }), { mode: 0o600 })
      fs.renameSync(file + '.tmp', file)
      return getStores()[0].settings()
    },
  }
  for (const [name, handler] of Object.entries(handlers)) {
    ipc.handle('recording:' + name, (event, ...args) => {
      assertTrustedSender(event, 'recording:' + name)
      if (name === 'begin' && !watched.has(event.sender.id)) {
        const sender = event.sender
        const senderId = sender.id
        watched.add(senderId)
        sender.on('render-process-gone', interrupt)
        sender.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
          if (isMainFrame && !isInPlace) interrupt()
        })
        sender.once('destroyed', () => { interrupt(); watched.delete(senderId) })
      }
      return (handler as (...args: never[]) => unknown)(...args as never[])
    })
  }
  app.on('before-quit', interrupt)
  return { owner,
    restoreDirectory: (id: string) => { try { return owner(id).directory } catch { return getStores()[0].directory } },
    assertIdle: () => { if (getStores().some(store => store.list().some(m=>m.status==='recording'))) throw new Error('请先停止录音') },
    refresh: () => { stores = undefined },
  }
}
