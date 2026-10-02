import { DurableObject } from 'cloudflare:workers'
import { corsHeaders, handleLibraryRequest } from './library.js'

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

    if (url.pathname === '/library' || url.pathname.startsWith('/library/')) {
      const origin = request.headers.get('Origin')
      if (!isAllowedOrigin(origin, env)) {
        return new Response('Origin not allowed', { status: 403 })
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) })
      }
      // One shared library for the whole team.
      const library = env.TEAM_LIBRARY.get(env.TEAM_LIBRARY.idFromName('team'))
      const response = await library.fetch(request)
      const headers = new Headers(response.headers)
      Object.entries(corsHeaders(origin)).forEach(([key, value]) => headers.set(key, value))
      return new Response(response.body, { status: response.status, headers })
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

// Large items are split across rows so no single SQLite value gets near the 2 MB row limit.
const CHUNK_CHARS = 500_000

/** Team library storage (SQLite-backed Durable Object; see library.js for the API). */
export class TeamLibrary extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (
      kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL,
      deleted INTEGER NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, PRIMARY KEY (kind, id))`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chunks (owner TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (owner, idx))`)
  }

  async fetch(request) {
    return handleLibraryRequest(request, this, this.env.LIBRARY_PASSPHRASE)
  }

  writeChunks(owner, data) {
    this.sql.exec('DELETE FROM chunks WHERE owner = ?', owner)
    let count = 0
    for (let offset = 0; offset < data.length || count === 0; offset += CHUNK_CHARS) {
      this.sql.exec('INSERT INTO chunks (owner, idx, data) VALUES (?, ?, ?)', owner, count, data.slice(offset, offset + CHUNK_CHARS))
      count += 1
    }
    return count
  }

  readChunks(owner) {
    return this.sql
      .exec('SELECT data FROM chunks WHERE owner = ? ORDER BY idx', owner)
      .toArray()
      .map((row) => row.data)
      .join('')
  }

  async listItems() {
    return this.sql
      .exec('SELECT kind, id, updated_at, updated_by, deleted, size FROM items')
      .toArray()
      .map((row) => ({ kind: row.kind, id: row.id, updatedAt: row.updated_at, updatedBy: row.updated_by, deleted: Boolean(row.deleted), size: row.size }))
  }

  async getItem(kind, id) {
    const row = this.sql.exec('SELECT * FROM items WHERE kind = ? AND id = ?', kind, id).toArray()[0]
    if (!row) return null
    return {
      meta: { kind, id, updatedAt: row.updated_at, updatedBy: row.updated_by, deleted: Boolean(row.deleted), size: row.size },
      data: row.deleted ? 'null' : this.readChunks(`item:${kind}:${id}`),
    }
  }

  async putItem(meta, data) {
    const owner = `item:${meta.kind}:${meta.id}`
    const chunks = meta.deleted ? (this.sql.exec('DELETE FROM chunks WHERE owner = ?', owner), 0) : this.writeChunks(owner, data)
    this.sql.exec(
      'INSERT OR REPLACE INTO items (kind, id, updated_at, updated_by, deleted, size, chunks) VALUES (?, ?, ?, ?, ?, ?, ?)',
      meta.kind, meta.id, meta.updatedAt, meta.updatedBy, meta.deleted ? 1 : 0, meta.size, chunks,
    )
  }
}
