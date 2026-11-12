import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { createVolcProxyServer } from './volcProxy.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 23456

const server = createServer(app)

const volcWss = new WebSocketServer({ noServer: true })
createVolcProxyServer(volcWss)

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`)

  if (pathname === '/ws/volc') {
    volcWss.handleUpgrade(request, socket, head, (ws) => {
      volcWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

// 中间件
app.use(cors())
app.use(express.json())

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 生产环境下提供静态文件
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist')
  app.use(express.static(frontendPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'))
  })
}

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`🔌 WebSocket proxy for Volcengine available at ws://localhost:${PORT}/ws/volc`)
})
