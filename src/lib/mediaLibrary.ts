export type MediaLibraryKind = 'asset' | 'font'

export interface MediaLibraryEntry {
  id: string
  kind: MediaLibraryKind
  name: string
  folder: string
  size: number
  mime: string
  modifiedAt: number
  dataUrl: string
  fontFamily?: string
  tags?: string[]
}

export const ASSET_STORAGE_KEY = 'renderless.dashboard.assets.v1'
export const FONT_STORAGE_KEY = 'renderless.dashboard.fonts.v1'
export const MEDIA_LIBRARY_UPDATED_EVENT = 'renderless-media-library-updated'
const MEDIA_DB_NAME = 'renderless.media.db.v1'
const MEDIA_DB_VERSION = 1
const MEDIA_STORE = 'entries'
const MEMORY_CACHE: Record<MediaLibraryKind, MediaLibraryEntry[] | null> = {
  asset: null,
  font: null,
}
const MEMORY_CACHE_SOURCE: Record<MediaLibraryKind, 'none' | 'local' | 'full'> = {
  asset: 'none',
  font: 'none',
}

const REGISTERED_FONT_FAMILIES = new Set<string>()

function storageKeyFor(kind: MediaLibraryKind): string {
  return kind === 'font' ? FONT_STORAGE_KEY : ASSET_STORAGE_KEY
}

function createEntryId(kind: MediaLibraryKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneEntries(entries: MediaLibraryEntry[]): MediaLibraryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    tags: Array.isArray(entry.tags) ? [...entry.tags] : undefined,
  }))
}

function inferMime(file: File, kind: MediaLibraryKind): string {
  if (file.type) {
    return file.type
  }

  if (kind !== 'font') {
    return 'application/octet-stream'
  }

  if (/\.woff2$/i.test(file.name)) return 'font/woff2'
  if (/\.woff$/i.test(file.name)) return 'font/woff'
  if (/\.otf$/i.test(file.name)) return 'font/otf'
  if (/\.ttf$/i.test(file.name)) return 'font/ttf'
  return 'font/ttf'
}

function toFontFamily(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const cleaned = withoutExtension.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || 'Custom Font'
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('File read failed'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('File read failed'))
        return
      }
      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function isFontFileName(fileName: string): boolean {
  return /\.(ttf|otf|woff|woff2)$/i.test(fileName)
}

function normalizeEntry(rawEntry: unknown, kind: MediaLibraryKind): MediaLibraryEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null
  }

  const record = rawEntry as Record<string, unknown>
  const id = typeof record.id === 'string' && record.id.trim().length > 0 ? record.id.trim() : null
  const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : null
  const folder = typeof record.folder === 'string' && record.folder.trim().length > 0 ? record.folder.trim() : null
  const size = Number(record.size)
  const modifiedAt = Number(record.modifiedAt)
  const tags =
    Array.isArray(record.tags)
      ? Array.from(
          new Set(
            record.tags
              .filter((entry): entry is string => typeof entry === 'string')
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          ),
        )
      : undefined

  if (!id || !name || !folder || !Number.isFinite(size) || !Number.isFinite(modifiedAt)) {
    return null
  }

  return {
    id,
    kind,
    name,
    folder,
    size: Math.max(0, Math.round(size)),
    mime: typeof record.mime === 'string' && record.mime.trim().length > 0 ? record.mime.trim() : 'application/octet-stream',
    modifiedAt: Math.max(0, Math.round(modifiedAt)),
    dataUrl: typeof record.dataUrl === 'string' ? record.dataUrl : '',
    fontFamily: typeof record.fontFamily === 'string' && record.fontFamily.trim().length > 0 ? record.fontFamily.trim() : undefined,
    tags,
  }
}

function entriesFromLocalStorage(kind: MediaLibraryKind): MediaLibraryEntry[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKeyFor(kind))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => normalizeEntry(entry, kind))
      .filter((entry): entry is MediaLibraryEntry => entry !== null)
  } catch {
    return []
  }
}

function manifestEntries(entries: MediaLibraryEntry[]): MediaLibraryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    dataUrl: '',
  }))
}

function hasInlineMediaData(entries: MediaLibraryEntry[]): boolean {
  return entries.some((entry) => typeof entry.dataUrl === 'string' && entry.dataUrl.length > 0)
}

export function invalidateMediaEntriesCache(kind?: MediaLibraryKind): void {
  if (kind) {
    MEMORY_CACHE[kind] = null
    MEMORY_CACHE_SOURCE[kind] = 'none'
    return
  }

  MEMORY_CACHE.asset = null
  MEMORY_CACHE.font = null
  MEMORY_CACHE_SOURCE.asset = 'none'
  MEMORY_CACHE_SOURCE.font = 'none'
}

function openMediaDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(MEDIA_DB_NAME, MEDIA_DB_VERSION)
    request.onerror = () => resolve(null)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(MEDIA_STORE)) {
        const store = database.createObjectStore(MEDIA_STORE, { keyPath: 'id' })
        store.createIndex('kind', 'kind', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

async function readEntriesFromIndexedDb(kind: MediaLibraryKind): Promise<MediaLibraryEntry[]> {
  const database = await openMediaDatabase()
  if (!database) {
    return []
  }

  return new Promise((resolve) => {
    const transaction = database.transaction(MEDIA_STORE, 'readonly')
    const store = transaction.objectStore(MEDIA_STORE)
    const index = store.index('kind')
    const request = index.getAll(kind)

    request.onerror = () => {
      database.close()
      resolve([])
    }

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : []
      const entries = rows
        .map((entry) => normalizeEntry(entry, kind))
        .filter((entry): entry is MediaLibraryEntry => entry !== null)
      database.close()
      resolve(entries)
    }
  })
}

async function persistEntriesToIndexedDb(kind: MediaLibraryKind, entries: MediaLibraryEntry[]): Promise<void> {
  const database = await openMediaDatabase()
  if (!database) {
    return
  }

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(MEDIA_STORE, 'readwrite')
    const store = transaction.objectStore(MEDIA_STORE)
    const index = store.index('kind')
    const request = index.getAll(kind)

    request.onerror = () => resolve()
    request.onsuccess = () => {
      const existingRows = Array.isArray(request.result) ? request.result : []
      const nextById = new Set(entries.map((entry) => entry.id))

      existingRows.forEach((row) => {
        const record = row as Record<string, unknown>
        const id = typeof record.id === 'string' ? record.id : ''
        if (id && !nextById.has(id)) {
          store.delete(id)
        }
      })

      entries.forEach((entry) => {
        store.put(entry)
      })
      resolve()
    }
  })

  database.close()
}

export function readMediaEntries(kind: MediaLibraryKind): MediaLibraryEntry[] {
  const cached = MEMORY_CACHE[kind]
  if (cached) {
    return cloneEntries(cached)
  }

  const fallback = entriesFromLocalStorage(kind)
  MEMORY_CACHE[kind] = fallback
  MEMORY_CACHE_SOURCE[kind] = hasInlineMediaData(fallback) ? 'full' : 'local'
  return cloneEntries(fallback)
}

export async function readMediaEntriesAsync(kind: MediaLibraryKind): Promise<MediaLibraryEntry[]> {
  const cached = MEMORY_CACHE[kind]
  if (cached && MEMORY_CACHE_SOURCE[kind] === 'full') {
    return cloneEntries(cached)
  }

  const localEntries = cached ?? entriesFromLocalStorage(kind)
  const indexedEntries = await readEntriesFromIndexedDb(kind)

  if (indexedEntries.length > 0) {
    MEMORY_CACHE[kind] = indexedEntries
    MEMORY_CACHE_SOURCE[kind] = 'full'
    // Keep manifest in localStorage lightweight.
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(manifestEntries(indexedEntries)))
      }
    } catch {
      // Ignore local manifest write failures.
    }
    return cloneEntries(indexedEntries)
  }

  // Legacy migration path: old payload may include inline data URLs in localStorage.
  if (hasInlineMediaData(localEntries)) {
    await persistEntriesToIndexedDb(kind, localEntries)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(manifestEntries(localEntries)))
      }
    } catch {
      // Ignore local manifest write failures.
    }
    MEMORY_CACHE[kind] = localEntries
    MEMORY_CACHE_SOURCE[kind] = 'full'
    return cloneEntries(localEntries)
  }

  MEMORY_CACHE[kind] = localEntries
  MEMORY_CACHE_SOURCE[kind] = 'local'
  return cloneEntries(localEntries)
}

export function persistMediaEntries(kind: MediaLibraryKind, entries: MediaLibraryEntry[]): { ok: boolean; error?: string } {
  const normalizedEntries = cloneEntries(entries)
  MEMORY_CACHE[kind] = normalizedEntries
  MEMORY_CACHE_SOURCE[kind] = 'full'

  if (typeof window === 'undefined') {
    void persistEntriesToIndexedDb(kind, normalizedEntries)
    return { ok: true }
  }

  let localStoragePersisted = false
  try {
    // Persist a lightweight manifest in localStorage to avoid quota blowups with base64 blobs.
    window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(manifestEntries(normalizedEntries)))
    localStoragePersisted = true
  } catch {
    localStoragePersisted = false
  }

  void persistEntriesToIndexedDb(kind, normalizedEntries)
    .then(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(MEDIA_LIBRARY_UPDATED_EVENT, {
            detail: { kind },
          }),
        )
      }
    })
    .catch(() => {
      // Ignore async persistence errors. Caller already has in-memory state.
    })

  if (localStoragePersisted) {
    window.dispatchEvent(
      new CustomEvent(MEDIA_LIBRARY_UPDATED_EVENT, {
        detail: { kind },
      }),
    )
    return { ok: true }
  }

  return {
    ok: true,
    error: 'Stored in memory/indexedDB; localStorage manifest unavailable.',
  }
}

export async function buildEntriesFromFiles(
  files: File[],
  kind: MediaLibraryKind,
  folder: string,
): Promise<{ entries: MediaLibraryEntry[]; rejectedFiles: string[] }> {
  const entries: MediaLibraryEntry[] = []
  const rejectedFiles: string[] = []

  for (const file of files) {
    if (kind === 'font' && !isFontFileName(file.name)) {
      rejectedFiles.push(file.name)
      continue
    }

    try {
      const dataUrl = await readDataUrl(file)
      const nextEntry: MediaLibraryEntry = {
        id: createEntryId(kind),
        kind,
        name: file.name,
        folder,
        size: file.size,
        mime: inferMime(file, kind),
        modifiedAt: Date.now(),
        dataUrl,
        fontFamily: kind === 'font' ? toFontFamily(file.name) : undefined,
        tags: [],
      }
      entries.push(nextEntry)
    } catch {
      rejectedFiles.push(file.name)
    }
  }

  return { entries, rejectedFiles }
}

async function registerFont(entry: MediaLibraryEntry): Promise<{ ok: boolean; family?: string; error?: string }> {
  if (entry.kind !== 'font') {
    return { ok: false, error: 'Not a font entry.' }
  }

  const family = entry.fontFamily?.trim() || toFontFamily(entry.name)
  if (REGISTERED_FONT_FAMILIES.has(family)) {
    return { ok: true, family }
  }

  if (typeof window === 'undefined' || typeof FontFace === 'undefined') {
    return { ok: false, error: 'FontFace API not available.' }
  }

  if (!entry.dataUrl) {
    return { ok: false, error: `Missing font data for ${entry.name}` }
  }

  try {
    const face = new FontFace(family, `url(${entry.dataUrl})`)
    const loadedFace = await face.load()
    document.fonts.add(loadedFace)
    REGISTERED_FONT_FAMILIES.add(family)
    return { ok: true, family }
  } catch {
    return { ok: false, error: `Failed to load font ${entry.name}` }
  }
}

export async function registerFontEntries(entries: MediaLibraryEntry[]): Promise<{
  entries: MediaLibraryEntry[]
  loaded: number
  failed: number
  errors: string[]
  changed: boolean
}> {
  let loaded = 0
  let failed = 0
  const errors: string[] = []
  let changed = false

  const nextEntries: MediaLibraryEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'font') {
      nextEntries.push(entry)
      continue
    }

    const result = await registerFont(entry)
    if (result.ok && result.family) {
      loaded += 1
      if (entry.fontFamily !== result.family) {
        changed = true
        nextEntries.push({
          ...entry,
          fontFamily: result.family,
        })
      } else {
        nextEntries.push(entry)
      }
      continue
    }

    failed += 1
    if (result.error) {
      errors.push(result.error)
    }
    nextEntries.push(entry)
  }

  return {
    entries: nextEntries,
    loaded,
    failed,
    errors,
    changed,
  }
}
