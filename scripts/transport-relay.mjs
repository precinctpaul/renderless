import { WebSocketServer } from 'ws'

const port = Number(process.env.RENDERLESS_WS_PORT ?? 8787)
const host = process.env.RENDERLESS_WS_HOST ?? '0.0.0.0'

const server = new WebSocketServer({ port, host })
// Mirrors the hosted relay (relay/src/index.js): traffic is scoped per room, keyed by the
// request path (/room/<id>). Clients connecting to any other path share a default room.
const rooms = new Map()

function roomKeyFor(request) {
  const pathname = new URL(request.url ?? '/', 'http://relay.local').pathname
  const match = pathname.match(/^\/room\/([A-Za-z0-9_-]{6,64})\/?$/)
  return match ? match[1] : '__default__'
}

function getRoom(key) {
  let room = rooms.get(key)
  if (!room) {
    room = { clients: new Set(), lastPayload: null }
    rooms.set(key, room)
  }
  return room
}

function broadcast(room, encoded, excludeClient = null) {
  room.clients.forEach((client) => {
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

server.on('connection', (socket, request) => {
  const roomKey = roomKeyFor(request)
  const room = getRoom(roomKey)
  room.clients.add(socket)

  if (room.lastPayload) {
    try {
      socket.send(room.lastPayload)
    } catch {
      // Ignore bootstrap send failures.
    }
  }

  socket.on('message', (buffer) => {
    const encoded = buffer.toString()
    let payload
    try {
      payload = JSON.parse(encoded)
    } catch {
      return
    }

    if (payload?.type === 'renderless-room-retire') {
      room.lastPayload = null
      broadcast(room, encoded, socket)
      return
    }

    if (payload?.type !== 'renderless-playout-sync' || !payload?.snapshot) {
      return
    }

    room.lastPayload = encoded
    broadcast(room, encoded, socket)
  })

  const leave = () => {
    room.clients.delete(socket)
    if (room.clients.size === 0 && !room.lastPayload) {
      rooms.delete(roomKey)
    }
  }

  socket.on('close', leave)
  socket.on('error', leave)
})

server.on('listening', () => {
  console.log(`[RenderLess relay] listening on ws://${host}:${port}`)
})

server.on('error', (error) => {
  console.error(`[RenderLess relay] fatal error: ${error.message}`)
  process.exitCode = 1
})
