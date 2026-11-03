import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Upload } from '@aws-sdk/lib-storage'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import type { CloudBackupIpcConfig, CloudBackupIpcFileInfo } from '../../shared/electronApi'

function createS3Client(config: NonNullable<CloudBackupIpcConfig['s3']>): S3Client {
  return new S3Client({
    endpoint: config.endpoint || undefined,
    region: config.region || 'us-east-1',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  })
}

function resolveKey(prefix: string, filename: string): string {
  const p = prefix.replace(/\/+$/, '')
  return p ? `${p}/${filename}` : filename
}

export async function s3Test(
  config: NonNullable<CloudBackupIpcConfig['s3']>,
): Promise<{ ok: boolean; error?: string }> {
  const client = createS3Client(config)
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }))
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    client.destroy()
  }
}

export async function s3Upload(
  config: NonNullable<CloudBackupIpcConfig['s3']>,
  jsonData: string,
): Promise<{ ok: boolean; key?: string; error?: string }> {
  const client = createS3Client(config)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const key = resolveKey(config.prefix, `delive_backup_${timestamp}.json`)

  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: jsonData,
      ContentType: 'application/json; charset=utf-8',
    }))
    return { ok: true, key }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    client.destroy()
  }
}

export async function s3List(
  config: NonNullable<CloudBackupIpcConfig['s3']>,
): Promise<{ ok: boolean; files?: CloudBackupIpcFileInfo[]; error?: string }> {
  const client = createS3Client(config)
  const prefix = config.prefix.replace(/\/+$/, '')

  try {
    const allContents: { Key?: string; LastModified?: Date; Size?: number }[] = []
    let continuationToken: string | undefined

    do {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix ? `${prefix}/` : undefined,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }))

      if (response.Contents) {
        allContents.push(...response.Contents)
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    const files: CloudBackupIpcFileInfo[] = allContents
      .filter(obj => obj.Key?.endsWith('.json') || obj.Key?.endsWith('.delive'))
      .sort((a, b) => {
        const ta = a.LastModified?.getTime() ?? 0
        const tb = b.LastModified?.getTime() ?? 0
        return tb - ta
      })
      .map(obj => ({
        key: obj.Key!,
        lastModified: obj.LastModified?.toISOString() ?? '',
        size: obj.Size ?? 0,
      }))

    return { ok: true, files }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    client.destroy()
  }
}

export async function s3Download(
  config: NonNullable<CloudBackupIpcConfig['s3']>,
  key: string,
): Promise<{ ok: boolean; data?: string; error?: string }> {
  const client = createS3Client(config)

  try {
    const response = await client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }))

    const body = await response.Body?.transformToString('utf-8')
    if (!body) {
      return { ok: false, error: 'Empty response body' }
    }
    return { ok: true, data: body }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    client.destroy()
  }
}

export async function s3Delete(
  config: NonNullable<CloudBackupIpcConfig['s3']>,
  key: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = createS3Client(config)

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }))
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    client.destroy()
  }
}

export async function s3UploadArchive(config: NonNullable<CloudBackupIpcConfig['s3']>, file: string, name: string, progress: (completed: number, total: number)=>void): Promise<string> {
  const client=createS3Client(config),key=resolveKey(config.prefix,name),size=(await stat(file)).size
  try { const upload=new Upload({client,params:{Bucket:config.bucket,Key:key,Body:createReadStream(file),ContentLength:size,ContentType:'application/octet-stream'},queueSize:2,partSize:16*1024*1024,leavePartsOnError:false});upload.on('httpUploadProgress',p=>progress(p.loaded||0,size));await upload.done();return key }
  finally {client.destroy()}
}
export async function s3DownloadArchive(config: NonNullable<CloudBackupIpcConfig['s3']>, key: string, file: string): Promise<void> {
  const prefix=config.prefix.replace(/\/+$/,'')
  if(prefix&&!key.startsWith(prefix+'/'))throw new Error('备份对象不在配置目录')
  const client=createS3Client(config)
  try {const result=await client.send(new GetObjectCommand({Bucket:config.bucket,Key:key}));if(!result.Body)throw new Error('下载返回空文件');const input=result.Body instanceof Readable?result.Body:Readable.fromWeb(result.Body.transformToWebStream() as never);await pipeline(input,createWriteStream(file,{flags:'wx',mode:0o600}))}
  finally {client.destroy()}
}
