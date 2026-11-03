import { useState, useCallback, useEffect } from 'react'
import { buildIpcConfig, uploadCompleteBackup, restoreCompleteBackup } from '../../services/completeBackup'
import type { PreparedRestore, CloudJob, BackupArtifact, BackupProgress } from '../../../../shared/backup'
import {
  Cloud,
  Check,
  Loader2,
  Trash2,
  DownloadCloud,
  UploadCloud,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { Switch } from '../ui'
import type { Translations } from '../../i18n'
import type {
  CloudBackupConfig,
  CloudBackupProviderType,
  S3BackupConfig,
  WebDAVBackupConfig,
} from '../../types'
import type { CloudBackupIpcFileInfo } from '../../../../shared/electronApi'
interface CloudBackupPanelProps {
  t: Translations
  cloudBackupConfig: CloudBackupConfig
  updateCloudBackupConfig: (config: Partial<CloudBackupConfig>) => Promise<void>
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString()
  } catch {
    return isoStr
  }
}

export function CloudBackupPanel({
  t,
  cloudBackupConfig,
  updateCloudBackupConfig,
}: CloudBackupPanelProps) {
  const ts = t.settings
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [uploadError, setUploadError] = useState('')
  const [files, setFiles] = useState<CloudBackupIpcFileInfo[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null)

  const [prepared, setPrepared] = useState<PreparedRestore | null>(null)
  const [jobs, setJobs] = useState<CloudJob[]>([])
  const [rollbacks, setRollbacks] = useState<BackupArtifact[]>([])
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const refreshTasks = useCallback(async () => { const api=window.electronAPI?.completeBackup; if(api){setJobs(await api.jobs());setRollbacks(await api.rollbacks())} }, [])
  useEffect(() => { void refreshTasks().catch(error=>setUploadError(error.message)); return window.electronAPI?.completeBackup?.onProgress(setProgress) }, [refreshTasks])

  const provider = cloudBackupConfig.provider || 's3'
  const s3 = cloudBackupConfig.s3 || {} as Partial<S3BackupConfig>
  const webdav = cloudBackupConfig.webdav || {} as Partial<WebDAVBackupConfig>

  const updateS3 = useCallback((updates: Partial<S3BackupConfig>) => {
    return updateCloudBackupConfig({
      s3: { ...s3, ...updates } as S3BackupConfig,
    })
  }, [s3, updateCloudBackupConfig])

  const updateWebdav = useCallback((updates: Partial<WebDAVBackupConfig>) => {
    return updateCloudBackupConfig({
      webdav: { ...webdav, ...updates } as WebDAVBackupConfig,
    })
  }, [webdav, updateCloudBackupConfig])

  const handleTest = useCallback(async () => {
    if (!window.electronAPI) return
    setTestStatus('testing')
    setTestError('')

    const result = await window.electronAPI.cloudBackupTest(buildIpcConfig(cloudBackupConfig))
    if (result.ok) {
      setTestStatus('success')
      setTimeout(() => setTestStatus('idle'), 3000)
    } else {
      setTestStatus('error')
      setTestError(result.error || 'Unknown error')
    }
  }, [cloudBackupConfig])

  const handleUpload = async () => {
    if (!window.electronAPI) return
    setUploadStatus('uploading')
    setUploadError('')

    try {
      await uploadCompleteBackup(cloudBackupConfig)
      setUploadStatus('success')
      await refreshTasks()
      void handleLoadFiles()
    } catch (err) {
      setUploadStatus('error')
      setUploadError(err instanceof Error ? err.message : String(err))
      await refreshTasks()
    }
  }

  const handleLoadFiles = useCallback(async () => {
    if (!window.electronAPI) return
    setLoadingFiles(true)
    const result = await window.electronAPI.cloudBackupList(buildIpcConfig(cloudBackupConfig))
    if (result.ok && result.files) {
      setFiles(result.files)
    }
    else setUploadError(result.error || '读取备份列表失败')
    setLoadingFiles(false)
  }, [cloudBackupConfig])

  const handleRestore = useCallback(async (key: string) => {
    if (!window.electronAPI) return
    setRestoreStatus(key)
    try { setPrepared(await window.electronAPI.completeBackup.prepare(buildIpcConfig(cloudBackupConfig),key)) }
    catch(error) { setUploadError((error as Error).message) }
    finally { setRestoreStatus(null) }
  }, [cloudBackupConfig])

  const applyRestore = async (mode:'merge'|'overwrite') => {
    if(!prepared)return
    try { if(await restoreCompleteBackup(prepared,mode))setPrepared(null) }
    catch(error){setUploadError((error as Error).message)}
  }

  const handleDelete = useCallback(async (key: string) => {
    if (!window.electronAPI) return
    if (!confirm(ts.cloudBackupDeleteConfirm)) return

    const result = await window.electronAPI.cloudBackupDelete(buildIpcConfig(cloudBackupConfig), key)
    if (result.ok) {
      setFiles(prev => prev.filter(f => f.key !== key))
    } else {
      alert(result.error || 'Delete failed')
    }
  }, [cloudBackupConfig, ts])

  const hasElectronApi = typeof window !== 'undefined' && !!window.electronAPI

  if (!hasElectronApi) return null

  return (
    <section className="workspace-panel-muted p-4 space-y-3">
      <label className="text-sm font-medium leading-none flex items-center gap-2">
        <Cloud className="w-3.5 h-3.5 text-muted-foreground" />
        {ts.cloudBackupTitle}
      </label>
      <p className="text-xs text-muted-foreground">{ts.cloudBackupDesc}</p>

      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
        <div>
          <p className="text-sm font-medium">{ts.cloudBackupEnable}</p>
        </div>
        <Switch
          checked={!!cloudBackupConfig.enabled}
          onChange={(val) => void updateCloudBackupConfig({ enabled: val })}
          aria-label={ts.cloudBackupEnable}
        />
      </div>

      {cloudBackupConfig.enabled && (
        <>
          {/* Provider selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">{ts.cloudBackupProvider}</label>
            <div className="flex gap-2">
              {(['s3', 'webdav', 'quark'] as CloudBackupProviderType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void updateCloudBackupConfig({ provider: p })}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    provider === p
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {p === 'quark' ? '夸克 CLI' : p === 's3' ? ts.cloudBackupS3 : ts.cloudBackupWebDAV}
                </button>
              ))}
            </div>
          </div>

          {provider === 'quark' && <div className="space-y-2">
            <label className="block text-xs">本机受限 CLI 入口（绝对路径）
              <input aria-label="夸克 CLI 入口" className="w-full p-2 rounded border bg-background" value={cloudBackupConfig.quark?.runtimeScript||''} onChange={e=>void updateCloudBackupConfig({quark:{directory:'ai-agent/coding/delive/backups/',...cloudBackupConfig.quark,runtimeScript:e.target.value}})} />
            </label>
            <label className="block text-xs">云端目录
              <input aria-label="夸克备份目录" className="w-full p-2 rounded border bg-background" value={cloudBackupConfig.quark?.directory||'ai-agent/coding/delive/backups/'} onChange={e=>void updateCloudBackupConfig({quark:{runtimeScript:'',...cloudBackupConfig.quark,directory:e.target.value}})} />
            </label>
            <p className="text-xs text-muted-foreground">复用本机 CLI 登录。应用不登录、不读取凭据、不安装升级。支持受限 runtimeScript 入口的 status / run 协议；首次备份才创建云目录。</p>
          </div>}
          {/* S3 config */}
          {provider === 's3' && (
            <div className="space-y-2">
              <input
                type="text"
                value={s3.endpoint || ''}
                onChange={(e) => void updateS3({ endpoint: e.target.value })}
                placeholder={ts.cloudBackupEndpointPlaceholder}
                className="w-full px-3 py-2 text-xs rounded-md bg-background border border-input"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={s3.region || ''}
                  onChange={(e) => void updateS3({ region: e.target.value })}
                  placeholder={ts.cloudBackupRegionPlaceholder}
                  className="px-3 py-2 text-xs rounded-md bg-background border border-input"
                />
                <input
                  type="text"
                  value={s3.bucket || ''}
                  onChange={(e) => void updateS3({ bucket: e.target.value })}
                  placeholder={ts.cloudBackupBucketPlaceholder}
                  className="px-3 py-2 text-xs rounded-md bg-background border border-input"
                />
              </div>
              <input
                type="text"
                value={s3.prefix || ''}
                onChange={(e) => void updateS3({ prefix: e.target.value })}
                placeholder={ts.cloudBackupPrefixPlaceholder}
                className="w-full px-3 py-2 text-xs rounded-md bg-background border border-input"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={s3.accessKeyId || ''}
                  onChange={(e) => void updateS3({ accessKeyId: e.target.value })}
                  placeholder={ts.cloudBackupAccessKeyId}
                  className="px-3 py-2 text-xs rounded-md bg-background border border-input"
                />
                <input
                  type="password"
                  value={s3.secretAccessKey || ''}
                  onChange={(e) => void updateS3({ secretAccessKey: e.target.value })}
                  placeholder={ts.cloudBackupSecretAccessKey}
                  className="px-3 py-2 text-xs rounded-md bg-background border border-input"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={s3.forcePathStyle ?? true}
                  onChange={(e) => void updateS3({ forcePathStyle: e.target.checked })}
                  className="rounded"
                />
                {ts.cloudBackupForcePathStyle}
              </label>
            </div>
          )}

          {/* WebDAV config */}
          {provider === 'webdav' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">{ts.cloudBackupWebdavUrl}</label>
                <input
                  type="text"
                  value={webdav.url || ''}
                  onChange={(e) => void updateWebdav({ url: e.target.value })}
                  placeholder={ts.cloudBackupWebdavUrlPlaceholder}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">{ts.cloudBackupWebdavUsername}</label>
                  <input
                    type="text"
                    value={webdav.username || ''}
                    onChange={(e) => void updateWebdav({ username: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">{ts.cloudBackupWebdavPassword}</label>
                  <input
                    type="password"
                    value={webdav.password || ''}
                    onChange={(e) => void updateWebdav({ password: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{ts.cloudBackupWebdavBasePath}</label>
                <input
                  type="text"
                  value={webdav.basePath || ''}
                  onChange={(e) => void updateWebdav({ basePath: e.target.value })}
                  placeholder={ts.cloudBackupWebdavBasePathPlaceholder}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}

          <label className="flex gap-2 text-xs"><input type="checkbox" checked={cloudBackupConfig.includeAudio!==false} onChange={e=>void updateCloudBackupConfig({includeAudio:e.target.checked})} />包含原音（默认）；取消后备份明确标为“不含原音”</label>
          {/* Auto backup toggle */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={!!cloudBackupConfig.autoBackupOnComplete}
              onChange={(e) => void updateCloudBackupConfig({ autoBackupOnComplete: e.target.checked })}
              className="rounded"
            />
            {ts.cloudBackupAutoBackup}
          </label>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              {testStatus === 'testing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : testStatus === 'success' ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : testStatus === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {testStatus === 'testing' ? ts.cloudBackupTesting
                : testStatus === 'success' ? ts.cloudBackupTestSuccess
                : testStatus === 'error' ? ts.cloudBackupTestFailed
                : ts.cloudBackupTestConnection}
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploadStatus === 'uploading'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploadStatus === 'uploading' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : uploadStatus === 'success' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              {uploadStatus === 'uploading' ? ts.cloudBackupUploading
                : uploadStatus === 'success' ? ts.cloudBackupUploadSuccess
                : ts.cloudBackupNow}
            </button>
          </div>

          {testStatus === 'error' && testError && (
            <p className="text-xs text-destructive">{testError}</p>
          )}
          {uploadError && (
            <p className="text-xs text-destructive">{uploadError}</p>
          )}

          {progress && <p role="status" className="text-xs">{progress.message}{progress.total ? ` · ${Math.round((progress.completed||0)/progress.total*100)}%` : ''}</p>}
          {prepared && <div className="p-3 border rounded space-x-3 text-sm">
            <p>已校验恢复材料：{JSON.parse(prepared.metadataJson).sessions.length} 个会话，{prepared.files} 个素材文件。{prepared.legacy?'旧版仅文字':prepared.includeAudio?'含原音':'不含原音'}</p>
            <button onClick={()=>void applyRestore('merge')}>合并（同 ID 保留本地）</button><button onClick={()=>void applyRestore('overwrite')}>覆盖恢复</button><button onClick={()=>setPrepared(null)}>取消</button>
          </div>}
          {jobs.filter(j=>j.state!=='complete').map(job=><div key={job.id} className="text-xs p-2 border rounded"><p>{job.artifact.name} · {job.state} · {job.error}</p><button className="text-primary" onClick={()=>{void window.electronAPI!.completeBackup.resume(buildIpcConfig(cloudBackupConfig),job.id).then(refreshTasks).catch(error=>setUploadError(error.message))}}>检查 / 继续原任务</button></div>)}
          {rollbacks.length>0 && <div className="text-xs space-y-1"><p>本地恢复回退包</p>{rollbacks.map(item=><button key={item.id} className="block text-primary" onClick={()=>{void window.electronAPI!.completeBackup.prepareRollback(item.id).then(setPrepared).catch(error=>setUploadError(error.message))}}>恢复回退包 {item.name}（{item.sessions} 个会话）</button>)}</div>}
          {/* Backup history */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">{ts.cloudBackupHistory}</label>
              <button
                type="button"
                onClick={handleLoadFiles}
                disabled={loadingFiles}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                {loadingFiles ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {loadingFiles ? ts.cloudBackupLoading : ts.cloudBackupHistory}
              </button>
            </div>

            {files.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {files.map((file) => (
                  <div key={file.key} className="flex items-center justify-between p-2 rounded-md bg-background text-xs">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{file.name||file.key.split('/').pop()} · {file.legacy?'旧版：仅文字':file.includeAudio===false?'不含原音':'完整备份'}</p>
                      <p className="text-muted-foreground">
                        {formatDate(file.lastModified)} · {formatFileSize(file.size)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleRestore(file.key)}
                        disabled={restoreStatus === file.key}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={ts.cloudBackupRestore}
                      >
                        {restoreStatus === file.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <DownloadCloud className="w-3.5 h-3.5 text-primary" />
                        )}
                      </button>
                      {provider !== 'quark' && <button
                        type="button"
                        onClick={() => void handleDelete(file.key)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={ts.cloudBackupDelete}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>}
                    </div>
                  </div>
                ))}
              </div>
            ) : files.length === 0 && !loadingFiles ? (
              <p className="text-xs text-muted-foreground text-center py-2">{ts.cloudBackupNoFiles}</p>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
