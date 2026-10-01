import { DurableObject } from 'cloudflare:workers'

const ROOM_PATH = /^\/room\/([A-Za-z0-9_-]{6,64})\/?$/
const LAST_PAYLOAD_KEY = 'lastPayload'

function isAllowedOrigin(origin, env) {
  // Non-browser clients (e.g. OBS on some platforms) may omit Origin; the room code still gates them.
  if (!origin) {
    return true
  }

  const allowed = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return allowed.includes(origin)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('RenderLess relay OK', { headers: { 'content-type': 'text/plain' } })
    }

    const match = url.pathname.match(ROOM_PATH)
    if (!match) {
      return new Response('Not found', { status: 404 })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    if (!isAllowedOrigin(request.headers.get('Origin'), env)) {
      return new Response('Origin not allowed', { status: 403 })
    }

    const room = env.RELAY_ROOM.get(env.RELAY_ROOM.idFromName(match[1]))
    return room.fetch(request)
  },
}

export class RelayRoom extends DurableObject {
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair()
    // Hibernation API: the object can be evicted between messages without dropping sockets.
    this.ctx.acceptWebSocket(server)

    const lastPayload = await this.ctx.storage.get(LAST_PAYLOAD_KEY)
    if (typeof lastPayload === 'string') {
      server.send(lastPayload)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket, message) {
    if (typeof message !== 'string') {
      return
    }

    let payload
    try {
      payload = JSON.parse(message)
    } catch {
      return
    }

    if (payload?.type === 'renderless-room-retire') {
      // A controller moved to a new room: forget the replay state and blank the remaining viewers.
      try {
        await this.ctx.storage.delete(LAST_PAYLOAD_KEY)
      } catch {
        // Nothing stored.
      }
      this.broadcast(socket, message)
      return
    }

    if (payload?.type !== 'renderless-playout-sync' || !payload?.snapshot) {
      return
    }

    this.broadcast(socket, message)

    try {
      // Persist so a viewer that connects later (or after eviction) gets the current program.
      await this.ctx.storage.put(LAST_PAYLOAD_KEY, message)
    } catch {
      // Oversized snapshots (e.g. large embedded images) still relay live; they just are not replayed.
    }
  }

  broadcast(sender, message) {
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === sender) {
        continue
      }

      try {
        peer.send(message)
      } catch {
        // A peer that cannot be written to will be cleaned up by its close event.
      }
    }
  }

  async webSocketClose(socket, code) {
    try {
      socket.close(code === 1005 || code === 1006 ? 1000 : code, 'closing')
    } catch {
      // Already closed.
    }
  }

  async webSocketError(socket) {
    try {
      socket.close(1011, 'error')
    } catch {
      // Already closed.
    }
  }
}
