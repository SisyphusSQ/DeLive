import { app, BrowserWindow, type IpcMain } from 'electron'
import { BackupEngine } from './backupEngine'
import { QuarkProvider, redactQuarkError } from './quarkProvider'
import path from 'node:path'
import { assertTrustedSender } from '../ipcSecurity'
import type { CloudBackupIpcConfig } from '../../shared/electronApi'
import { s3Test, s3Upload, s3Download, s3Delete } from './s3Provider'
import { webdavTest, webdavUpload, webdavDownload, webdavDelete } from './webdavProvider'

function requireS3Config(config: CloudBackupIpcConfig) {
  if (config.provider !== 's3' || !config.s3) {
    throw new Error('S3 configuration is required')
  }
  return config.s3
}

function requireWebDAVConfig(config: CloudBackupIpcConfig) {
  if (config.provider !== 'webdav' || !config.webdav) {
    throw new Error('WebDAV configuration is required')
  }
  return config.webdav
}

export function registerCloudBackupIpc(ipcMain: IpcMain, recording: ConstructorParameters<typeof BackupEngine>[1]): void {
  const engine = new BackupEngine(app.getPath('userData'), recording, progress => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('complete-backup-progress', progress)
  })
  const methods = ['build','upload','prepare','apply','settle','pendingRestore','prepareRollback','rollbacks','jobs','resume'] as const
  for (const method of methods) ipcMain.handle('complete-backup:' + method, (event, ...args) => {
    assertTrustedSender(event, 'complete-backup:' + method)
    return (engine[method] as (...values: never[]) => unknown).apply(engine, args as never[])
  })
  ipcMain.handle('cloud-backup-test', async (event, config: CloudBackupIpcConfig) => {
    assertTrustedSender(event, 'cloud-backup-test')

    if (config.provider === 'quark') {
      try { if (!config.quark) throw new Error('请配置夸克 CLI'); await new QuarkProvider(config.quark, path.join(app.getPath('userData'),'backups','cli-results')).inspect(); return {ok:true} } catch(error) {return {ok:false,error:redactQuarkError((error as Error).message)}}
    }
    if (config.provider === 's3') {
      return s3Test(requireS3Config(config))
    }
    if (config.provider === 'webdav') {
      return webdavTest(requireWebDAVConfig(config))
    }

    return { ok: false, error: `Unsupported provider: ${config.provider}` }
  })

  ipcMain.handle('cloud-backup-upload', async (event, config: CloudBackupIpcConfig, jsonData: string) => {
    assertTrustedSender(event, 'cloud-backup-upload')

    if (config.provider === 's3') {
      return s3Upload(requireS3Config(config), jsonData)
    }
    if (config.provider === 'webdav') {
      return webdavUpload(requireWebDAVConfig(config), jsonData)
    }

    return { ok: false, error: `Unsupported provider: ${config.provider}` }
  })

  ipcMain.handle('cloud-backup-list', async (event, config: CloudBackupIpcConfig) => {
    assertTrustedSender(event, 'cloud-backup-list')

    try { return {ok:true, files:await engine.list(config)} } catch(error) {return {ok:false,error:redactQuarkError((error as Error).message)}}
  })

  ipcMain.handle('cloud-backup-download', async (event, config: CloudBackupIpcConfig, key: string) => {
    assertTrustedSender(event, 'cloud-backup-download')

    if (config.provider === 's3') {
      return s3Download(requireS3Config(config), key)
    }
    if (config.provider === 'webdav') {
      return webdavDownload(requireWebDAVConfig(config), key)
    }

    return { ok: false, error: `Unsupported provider: ${config.provider}` }
  })

  ipcMain.handle('cloud-backup-delete', async (event, config: CloudBackupIpcConfig, key: string) => {
    assertTrustedSender(event, 'cloud-backup-delete')

    if (config.provider === 's3') {
      return s3Delete(requireS3Config(config), key)
    }
    if (config.provider === 'webdav') {
      return webdavDelete(requireWebDAVConfig(config), key)
    }

    return { ok: false, error: `Unsupported provider: ${config.provider}` }
  })
}
