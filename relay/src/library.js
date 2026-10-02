// RenderLess team library: shared templates, media and fonts (version history travels inside each template).
// Storage-agnostic request handler used by the Cloudflare Worker (SQLite Durable Object) and by
// the local dev relay (in memory). Every request must carry the team passphrase:
//   Authorization: Bearer <passphrase>
// The passphrase lives only in the Worker secret LIBRARY_PASSPHRASE, never in code.

export const LIBRARY_KINDS = new Set(['template', 'asset', 'font'])
const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/
const MAX_ITEM_CHARS = 30_000_000

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Constant-time string compare, so response timing doesn't leak the passphrase. */
function safeEqual(a, b) {
  const left = String(a)
  const right = String(b)
  let diff = left.length ^ right.length
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return diff === 0
}

export function corsHeaders(origin) {
  return origin
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '86400',
        vary: 'origin',
      }
    : {}
}

function cleanAuthor(value) {
  return String(value ?? '').trim().slice(0, 60) || 'Someone'
}

/**
 * Handles /library/* requests. `store` implements:
 *   listItems() -> meta[]    getItem(kind, id) -> { meta, data } | null    putItem(meta, data)
 */
export async function handleLibraryRequest(request, store, passphrase) {
  if (!passphrase) {
    return json({ error: 'Team library is not set up yet (no passphrase configured).' }, 503)
  }

  const auth = request.headers.get('authorization') ?? ''
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!supplied || !safeEqual(supplied, passphrase)) {
    return json({ error: 'Wrong team passphrase.' }, 401)
  }

  const url = new URL(request.url)
  const parts = url.pathname.replace(/^\/library\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const method = request.method

  if (parts[0] === 'ping' && method === 'GET') {
    return json({ ok: true })
  }

  if (parts[0] === 'items') {
    if (parts.length === 1 && method === 'GET') {
      return json({ items: await store.listItems() })
    }

    const [, kind, id] = parts
    if (parts.length !== 3 || !LIBRARY_KINDS.has(kind) || !ID_PATTERN.test(id)) {
      return json({ error: 'Bad item path.' }, 400)
    }

    if (method === 'GET') {
      const item = await store.getItem(kind, id)
      if (!item || item.meta.deleted) return json({ error: 'Not found.' }, 404)
      return json({ ...item.meta, data: JSON.parse(item.data) })
    }

    if (method === 'PUT' || method === 'DELETE') {
      const body = method === 'PUT' ? await request.json().catch(() => null) : null
      const updatedAt = Number(method === 'PUT' ? body?.updatedAt : url.searchParams.get('updatedAt')) || Date.now()
      const updatedBy = cleanAuthor(method === 'PUT' ? body?.updatedBy : url.searchParams.get('updatedBy'))
      const existing = await store.getItem(kind, id)
      // Last writer wins, but never let an older copy overwrite a newer one.
      if (existing && existing.meta.updatedAt > updatedAt) {
        return json({ error: 'A newer copy exists.', current: existing.meta }, 409)
      }

      if (method === 'DELETE') {
        await store.putItem({ kind, id, updatedAt, updatedBy, deleted: true, size: 0 }, 'null')
        return json({ ok: true, updatedAt })
      }

      if (!body || body.data === undefined) return json({ error: 'Missing data.' }, 400)
      const data = JSON.stringify(body.data)
      if (data.length > MAX_ITEM_CHARS) return json({ error: 'Item is too large (30 MB max).' }, 413)
      await store.putItem({ kind, id, updatedAt, updatedBy, deleted: false, size: data.length }, data)
      return json({ ok: true, updatedAt })
    }
  }

  return json({ error: 'Not found.' }, 404)
}

/** In-memory store (local dev relay and tests). */
export function createMemoryLibraryStore() {
  const items = new Map()
  return {
    async listItems() {
      return [...items.values()].map((entry) => entry.meta)
    },
    async getItem(kind, id) {
      return items.get(`${kind}:${id}`) ?? null
    },
    async putItem(meta, data) {
      items.set(`${meta.kind}:${meta.id}`, { meta, data })
    },
  }
}
