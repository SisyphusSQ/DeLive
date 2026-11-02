import { randomUUID } from 'node:crypto'
import { WebSocket as NodeWebSocket, type WebSocketServer } from 'ws'
import { getWsProxyAgent } from './proxyAgent'
import { decodeVolcFrame, volcClientFrame, volcHeaders, volcRequest, VOLC_REALTIME_ENDPOINT, type VolcCredentials } from './volcProtocol'

export function attachVolcProxyServer(wss: WebSocketServer): void {
  wss.on('connection', client => {
    let upstream: NodeWebSocket | undefined
    let ready = false, ended = false
    const send = (value: unknown) => { if (client.readyState === NodeWebSocket.OPEN) client.send(JSON.stringify(value)) }
    const fail = (code: string | number, message: string) => {
      send({ type: 'error', code, message })
      client.close(4002, 'Transcription failed')
      upstream?.close()
    }
    const authTimer = setTimeout(() => fail('AUTH_TIMEOUT', '本地代理等待鉴权超时'), 15000)
    client.on('message', (data, binary) => {
      try {
        if (!upstream) {
          if (binary) throw new Error('需要先发送鉴权配置')
          const message = JSON.parse(data.toString())
          if (message.type !== 'start') throw new Error('需要先发送鉴权配置')
          const c = message.config as VolcCredentials
          const headers = volcHeaders(c, randomUUID())
          clearTimeout(authTimer)
          upstream = new NodeWebSocket(VOLC_REALTIME_ENDPOINT, {
            headers, agent: getWsProxyAgent(), handshakeTimeout: 15000, maxPayload: 16 * 1024 * 1024,
          })
          upstream.on('open', () => {
            upstream!.send(volcClientFrame(1, Buffer.from(JSON.stringify(volcRequest(c)))))
            ready = true
            send({ type: 'ready' })
          })
          upstream.on('message', bytes => {
            try {
              const decoded = decodeVolcFrame(Buffer.from(bytes as Buffer))
              if (decoded.errorCode !== undefined) {
                fail(decoded.errorCode, '火山拒绝识别请求，请检查产品权限、凭据或剩余额度（错误码见前缀）')
              } else {
                send({ type: 'snapshot', ...decoded })
              }
            } catch { fail('PROTOCOL_ERROR', '无法解析火山响应，转写已停止，原音继续保存') }
          })
          upstream.on('unexpected-response', (_request, response) => {
            response.resume()
            fail('HTTP_' + response.statusCode, '火山握手失败，请检查产品权限、凭据、额度与网络')
          })
          upstream.on('error', () => fail('NETWORK_ERROR', '火山连接失败，请检查网络、代理与产品权限'))
          upstream.on('close', () => { if (client.readyState === NodeWebSocket.OPEN) client.close(1000, 'Upstream closed') })
          return
        }
        if (!ready) throw new Error('转写连接尚未就绪')
        if (!binary) {
          if (JSON.parse(data.toString()).type !== 'audio_end') throw new Error('未知的控制消息')
          if (!ended) { ended = true; upstream.send(volcClientFrame(2, new Uint8Array(), true)) }
          return
        }
        if (ended) throw new Error('结束后不能继续发送音频')
        if (upstream.bufferedAmount > 1024 * 1024) throw new Error('转写网络积压，已停止发送')
        upstream.send(volcClientFrame(2, Buffer.from(data as Buffer)))
      } catch { fail('CLIENT_PROTOCOL_ERROR', '转写请求格式错误或网络积压，请重新连接') }
    })
    const cleanup = () => { clearTimeout(authTimer); upstream?.close() }
    client.on('close', cleanup)
    client.on('error', cleanup)
  })
}
