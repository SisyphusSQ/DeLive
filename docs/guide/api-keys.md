# Volcengine ASR Credentials

1. Enable the realtime or standard file transcription service you need in the Volcengine speech console.
2. Under **Settings → Transcription Service → Volcengine**, enter the API Key or the APP ID and Access Token. The desktop app encrypts the credentials.
3. For file transcription, also configure a private S3-compatible object store under **File Storage**. Realtime recording does not require that store.

See the [realtime](../zh/development/volc-realtime) and [standard file transcription](../zh/development/volc-file) guides for details. For local recognition, see [ASR Providers](./providers).
