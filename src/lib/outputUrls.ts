export type OutputFollow = 'preview' | 'program'

export const ROOM_STORAGE_KEY = 'renderless.transport.room.v1'
const ROOM_PATTERN = /^[A-Za-z0-9_-]{6,64}$/
const ROOM_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const ROOM_LENGTH = 12

// Hosted builds (e.g. GitHub Pages) point at a deployed relay; local dev falls back to <host>:8787.
const CONFIGURED_RELAY_URL = String(import.meta.env.VITE_RELAY_URL ?? '').trim()

let fallbackRoomId: string | null = null

export function normalizeOutputFollow(raw: string | null | undefined): OutputFollow {
  return raw === 'preview' ? 'preview' : 'program'
}

export function normalizeRoomId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? ''
  return ROOM_PATTERN.test(trimmed) ? trimmed : null
}

function generateRoomId(): string {
  const bytes = new Uint8Array(ROOM_LENGTH)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
}

/**
 * The room scopes relay traffic so only screens sharing a code see each other.
 * Output URLs carry it as ?room=; otherwise each browser keeps its own persisted room.
 */
export function getRoomId(): string {
  if (typeof window === 'undefined') {
    return fallbackRoomId ?? (fallbackRoomId = generateRoomId())
  }

  const fromUrl = normalizeRoomId(new URLSearchParams(window.location.search).get('room'))
  if (fromUrl) {
    return fromUrl
  }

  try {
    const stored = normalizeRoomId(window.localStorage.getItem(ROOM_STORAGE_KEY))
    if (stored) {
      return stored
    }

    const created = generateRoomId()
    window.localStorage.setItem(ROOM_STORAGE_KEY, created)
    return created
  } catch {
    return fallbackRoomId ?? (fallbackRoomId = generateRoomId())
  }
}

/**
 * Replaces this browser's room with a fresh code. Every existing Output link points at the
 * old room, so they stop receiving updates; links must be copied again.
 */
export function rotateRoomId(): string {
  const next = generateRoomId()
  fallbackRoomId = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ROOM_STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the in-memory fallback keeps this tab on the new room.
    }
  }
  return next
}

function readStoredRoomId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return normalizeRoomId(window.localStorage.getItem(ROOM_STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * True for an Output page whose ?room= no longer matches this browser's current room
 * (e.g. after New Room). Same-browser sync (BroadcastChannel/localStorage) is not
 * room-scoped, so such pages must ignore it and rely on the relay only.
 */
export function isViewingOtherRoom(): boolean {
  if (!isOutputViewerLocation()) {
    return false
  }

  const viewedRoom = normalizeRoomId(new URLSearchParams(window.location.search).get('room'))
  const storedRoom = readStoredRoomId()
  return Boolean(viewedRoom && storedRoom && viewedRoom !== storedRoom)
}

/** Output feed pages only mirror what a controller publishes; they never publish state themselves. */
export function isOutputViewerLocation(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.pathname.replace(/\/+$/, '').endsWith('/output-feed')
}

export function buildOutputPath(follow: OutputFollow): string {
  return `/output-feed?follow=${follow}&embed=1&room=${encodeURIComponent(getRoomId())}`
}

export function withBasePath(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`
}

export function buildOutputUrl(follow: OutputFollow): string {
  const path = withBasePath(buildOutputPath(follow))

  if (typeof window === 'undefined') {
    return path
  }

  return `${window.location.origin}${path}`
}

export function hasConfiguredRelay(): boolean {
  return CONFIGURED_RELAY_URL.length > 0
}

export function buildHostRelayUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8787'
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname || 'localhost'
  return `${protocol}//${host}:8787`
}

export function buildDefaultTransportWsUrl(): string {
  return CONFIGURED_RELAY_URL || buildHostRelayUrl()
}

export function buildRelayRoomUrl(baseUrl: string, roomId: string = getRoomId()): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/room/${encodeURIComponent(roomId)}`
}
