/**
 * Content-addressed image store. Large images (imported artwork, photos, textures) live in
 * IndexedDB once, keyed by the SHA-256 of their data URL; scenes reference them with a short
 * `rlasset:<hash>` string instead of embedding megabytes of base64. This keeps templates and
 * live playout snapshots small enough for localStorage and for relay sync, and lets other
 * devices fetch each image once (verified against its hash) instead of with every update.
 */
import { useEffect, useState } from 'react'

export const ASSET_REF_PREFIX = 'rlasset:'
const DB_NAME = 'renderless-assets'
const DB_VERSION = 1
const STORE = 'assets'

const memory = new Map<string, string>()
const listeners = new Set<(hash: string) => void>()
const missingListeners = new Set<(hashes: string[]) => void>()
const pendingLoads = new Map<string, Promise<string | null>>()

const ASSET_REF_PATTERN = /^rlasset:[0-9a-f]{64}$/

export function isAssetRef(src: string | undefined | null): src is string {
  return typeof src === 'string' && ASSET_REF_PATTERN.test(src)
}

export function assetHashFromRef(ref: string): string {
  return ref.slice(ASSET_REF_PREFIX.length)
}

export function assetRefFromHash(hash: string): string {
  return `${ASSET_REF_PREFIX}${hash}`
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

let dbPromise: Promise<IDBDatabase | null> | null = null
function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null)
  }
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

async function idbGet(hash: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(hash)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbPut(hash: string, dataUrl: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(dataUrl, hash)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

function remember(hash: string, dataUrl: string) {
  const isNew = !memory.has(hash)
  memory.set(hash, dataUrl)
  if (isNew) listeners.forEach((listener) => listener(hash))
}

/** Stores an image data URL and returns its `rlasset:` reference. Data that is already a reference is returned as-is. */
export async function storeAsset(dataUrl: string): Promise<string> {
  if (isAssetRef(dataUrl)) return dataUrl
  const hash = await sha256Hex(dataUrl)
  remember(hash, dataUrl)
  await idbPut(hash, dataUrl)
  return assetRefFromHash(hash)
}

/** Accepts an image received from another device only if it matches its hash. */
export async function acceptRemoteAsset(hash: string, dataUrl: string): Promise<boolean> {
  if (memory.has(hash)) return true
  if ((await sha256Hex(dataUrl)) !== hash) return false
  remember(hash, dataUrl)
  await idbPut(hash, dataUrl)
  return true
}

export function getCachedAsset(src: string): string | null {
  return isAssetRef(src) ? (memory.get(assetHashFromRef(src)) ?? null) : src
}

/** Resolves a reference from memory or IndexedDB; reports it as missing (for relay fetch) if absent. */
export function loadAsset(ref: string): Promise<string | null> {
  const hash = assetHashFromRef(ref)
  const cached = memory.get(hash)
  if (cached) return Promise.resolve(cached)
  let pending = pendingLoads.get(hash)
  if (!pending) {
    pending = idbGet(hash).then((dataUrl) => {
      pendingLoads.delete(hash)
      if (dataUrl) {
        remember(hash, dataUrl)
        return dataUrl
      }
      missingListeners.forEach((listener) => listener([hash]))
      return null
    })
    pendingLoads.set(hash, pending)
  }
  return pending
}

export function onAssetAvailable(listener: (hash: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function onAssetMissing(listener: (hashes: string[]) => void): () => void {
  missingListeners.add(listener)
  return () => missingListeners.delete(listener)
}

/** Every asset hash referenced anywhere inside a value (scene, template, snapshot). */
export function collectAssetHashes(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (isAssetRef(value)) into.add(assetHashFromRef(value))
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectAssetHashes(entry, into))
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectAssetHashes(entry, into))
  }
  return into
}

/** Image source for rendering: plain URLs pass through; references resolve once loaded (empty until then). */
export function useAssetSrc(src: string): string {
  const [, setVersion] = useState(0)
  const resolved = getCachedAsset(src)

  useEffect(() => {
    if (!isAssetRef(src) || getCachedAsset(src)) return
    const hash = assetHashFromRef(src)
    const unsubscribe = onAssetAvailable((available) => {
      if (available === hash) setVersion((version) => version + 1)
    })
    void loadAsset(src)
    return unsubscribe
  }, [src])

  return resolved ?? ''
}
