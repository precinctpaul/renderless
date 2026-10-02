import http from 'node:http'
import { WebSocketServer } from 'ws'
import { corsHeaders, createMemoryLibraryStore, handleLibraryRequest } from '../relay/src/library.js'

const port = Number(process.env.RENDERLESS_WS_PORT ?? 8787)
const host = process.env.RENDERLESS_WS_HOST ?? '0.0.0.0'
// Local development only: the hosted relay reads the real passphrase from a Cloudflare secret.
const libraryPassphrase = process.env.RENDERLESS_LIBRARY_PASSPHRASE ?? 'local-dev-library'
const libraryStore = createMemoryLibraryStore()

// Same team-library API as the hosted Worker, kept in memory (resets when the relay restarts).
const httpServer = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? ''
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (!url.pathname.startsWith('/library')) {
    res.writeHead(url.pathname === '/' || url.pathname === '/health' ? 200 : 404, { 'content-type': 'text/plain' })
    res.end('RenderLess relay OK')
    return
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    res.end()
    return
  }
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const request = new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body })
  const response = await handleLibraryRequest(request, libraryStore, libraryPassphrase)
  res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...corsHeaders(origin) })
  res.end(Buffer.from(await response.arrayBuffer()))
})

const server = new WebSocketServer({ server: httpServer })
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

httpServer.listen(port, host, () => {
  console.log(`[RenderLess relay] listening on ws://${host}:${port} (team library at http://${host}:${port}/library)`)
})

httpServer.on('error', (error) => {
  console.error(`[RenderLess relay] fatal error: ${error.message}`)
  process.exitCode = 1
})
