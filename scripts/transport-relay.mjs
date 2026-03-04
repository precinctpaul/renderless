import { WebSocketServer } from 'ws'

const port = Number(process.env.RENDERLESS_WS_PORT ?? 8787)
const host = process.env.RENDERLESS_WS_HOST ?? '0.0.0.0'

const server = new WebSocketServer({ port, host })
const clients = new Set()
let lastPayload = null

function broadcast(payload, excludeClient = null) {
  const encoded = JSON.stringify(payload)
  clients.forEach((client) => {
    if (client === excludeClient || client.readyState !== client.OPEN) {
      return
    }

    try {
      client.send(encoded)
    } catch {
      // Ignore failed sends and keep relay alive.
    }
  })
}

server.on('connection', (socket) => {
  clients.add(socket)

  if (lastPayload) {
    try {
      socket.send(JSON.stringify(lastPayload))
    } catch {
      // Ignore bootstrap send failures.
    }
  }

  socket.on('message', (buffer) => {
    let payload
    try {
      payload = JSON.parse(buffer.toString())
    } catch {
      return
    }

    if (payload?.type !== 'renderless-playout-sync' || !payload?.snapshot) {
      return
    }

    lastPayload = payload
    broadcast(payload, socket)
  })

  socket.on('close', () => {
    clients.delete(socket)
  })

  socket.on('error', () => {
    clients.delete(socket)
  })
})

server.on('listening', () => {
  console.log(`[RenderLess relay] listening on ws://${host}:${port}`)
})

server.on('error', (error) => {
  console.error(`[RenderLess relay] fatal error: ${error.message}`)
  process.exitCode = 1
})
