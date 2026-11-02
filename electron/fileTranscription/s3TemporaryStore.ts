import fs from 'node:fs'
import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetBucketVersioningCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { FileTaskConfig } from '../../shared/fileTranscription'

export interface TemporaryAudioStore {
  upload(key: string, file: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<void>
  signedUrl(key: string, seconds: number): Promise<string>
  remove(key: string): Promise<void>
  close(): void
}
export class S3TemporaryAudioStore implements TemporaryAudioStore {
  private client: S3Client
  constructor(private config: FileTaskConfig) {
    this.client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
      maxAttempts: 1, requestHandler: { connectionTimeout: 10000, requestTimeout: 30000 }, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, sessionToken: config.sessionToken || undefined } })
  }
  async upload(key: string, file: string, signal: AbortSignal, progress: (bytes: number) => void) {
    const versioning = await this.client.send(new GetBucketVersioningCommand({ Bucket: this.config.bucket }), { abortSignal: signal })
    if (versioning.Status) throw new Error('临时桶必须从未启用版本控制，防止删除仅创建删除标记')
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) controller.abort()
    const body = fs.createReadStream(file)
    const upload = new Upload({ client: this.client, params: { Bucket: this.config.bucket, Key: key,
      Body: body, ContentLength: fs.statSync(file).size, ContentType: 'audio/wav' },
      abortController: controller, queueSize: 2, partSize: 8 * 1024 * 1024, leavePartsOnError: false })
    upload.on('httpUploadProgress', value => progress(value.loaded ?? 0))
    try { await upload.done() }
    finally { signal.removeEventListener('abort', abort); body.destroy() }
  }
  signedUrl(key: string, seconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn: seconds })
  }
  async remove(key: string) {
    // Recover incomplete multipart uploads left by process death. UUID keys belong to one task only.
    let keyMarker: string | undefined, uploadIdMarker: string | undefined
    do {
      const page = await this.client.send(new ListMultipartUploadsCommand({ Bucket: this.config.bucket, Prefix: key, KeyMarker: keyMarker, UploadIdMarker: uploadIdMarker }))
      for (const upload of page.Uploads ?? []) if (upload.Key === key && upload.UploadId) {
        await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.config.bucket, Key: key, UploadId: upload.UploadId }))
      }
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
      uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined
    } while (keyMarker)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })) }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return
      throw new Error('临时对象删除后无法确认状态')
    }
    throw new Error('临时对象仍然存在，清理未确认')
  }
  close() { this.client.destroy() }
}
