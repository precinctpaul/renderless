import { create } from 'zustand'
import { usePlayoutStore } from '../store/playoutStore'
import { buildTemplatePackage, parseTemplatePackage, templateFromPackage } from './templatePackages'
import {
  MEDIA_LIBRARY_UPDATED_EVENT,
  persistMediaEntries,
  readMediaEntriesAsync,
  registerFontEntries,
  type MediaLibraryEntry,
  type MediaLibraryKind,
} from './mediaLibrary'
import { getLibraryPassphrase, library, LibraryError, type LibraryItemMeta, type LibraryKind } from './sharedLibrary'
import type { TemplateDefinition } from '../types/scene'

/**
 * Keeps this browser's custom templates, media and fonts in step with the shared team library.
 * Last writer wins per item; changes go up shortly after they happen and come down every
 * POLL_MS and whenever the tab regains focus.
 */

export type LibraryStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'locked' | 'unavailable' | 'error'

interface LibraryStatusState {
  status: LibraryStatus
  message: string
  lastSyncedAt: number | null
}

export const useLibraryStatus = create<LibraryStatusState>(() => ({ status: 'off', message: '', lastSyncedAt: null }))

const KNOWN_KEY = 'renderless.library.known.v1'
const POLL_MS = 20_000
const PUSH_DEBOUNCE_MS = 800
/** A sync pass that would delete more than this many items is treated as a local reset, not intent. */
const MAX_DELETES_PER_PASS = 5

type KnownMap = Record<string, number>

function readKnown(): KnownMap {
  try {
    return JSON.parse(window.localStorage.getItem(KNOWN_KEY) ?? '{}') as KnownMap
  } catch {
    return {}
  }
}

function writeKnown(known: KnownMap) {
  try {
    window.localStorage.setItem(KNOWN_KEY, JSON.stringify(known))
  } catch {
    // Without this map the next pass simply re-checks everything.
  }
}

const keyOf = (kind: LibraryKind, id: string) => `${kind}:${id}`

interface LocalItem {
  kind: LibraryKind
  id: string
  updatedAt: number
  payload: () => unknown
}

function localTemplates(): LocalItem[] {
  return usePlayoutStore
    .getState()
    .templates.filter((template) => !template.builtIn)
    .map((template) => ({
      kind: 'template' as const,
      id: template.id,
      updatedAt: template.updatedAt ?? 0,
      payload: () => buildTemplatePackage(template),
    }))
}

async function localMedia(kind: MediaLibraryKind): Promise<MediaLibraryEntry[]> {
  return (await readMediaEntriesAsync(kind)).filter((entry) => Boolean(entry.dataUrl))
}

const mediaToLocal = (kind: 'asset' | 'font', entries: MediaLibraryEntry[]): LocalItem[] =>
  entries.map((entry) => ({ kind, id: entry.id, updatedAt: entry.modifiedAt, payload: () => entry }))

let running = false
let rerun = false
let applyingRemote = false

async function syncOnce() {
  if (!getLibraryPassphrase()) {
    useLibraryStatus.setState({ status: 'off', message: 'Not connected to the team library.' })
    return
  }
  if (running) {
    rerun = true
    return
  }
  running = true
  useLibraryStatus.setState({ status: 'syncing', message: 'Syncing…' })

  try {
    const remote = await library.listItems()
    const remoteByKey = new Map(remote.map((meta) => [keyOf(meta.kind, meta.id), meta]))
    const known = readKnown()
    const assets = await localMedia('asset')
    const fonts = await localMedia('font')
    const locals = [...localTemplates(), ...mediaToLocal('asset', assets), ...mediaToLocal('font', fonts)]
    const localByKey = new Map(locals.map((item) => [keyOf(item.kind, item.id), item]))

    // 1. Pull: remote items newer than what this browser last synced.
    const templateUpserts: TemplateDefinition[] = []
    const templateRemovals: string[] = []
    const mediaChanges: Record<MediaLibraryKind, { upserts: MediaLibraryEntry[]; removals: Set<string> }> = {
      asset: { upserts: [], removals: new Set() },
      font: { upserts: [], removals: new Set() },
    }
    for (const meta of remote) {
      const key = keyOf(meta.kind, meta.id)
      const local = localByKey.get(key)
      const isNewerThanKnown = meta.updatedAt > (known[key] ?? -1)
      const isNewerThanLocal = !local || meta.updatedAt > local.updatedAt
      if (!isNewerThanKnown || !isNewerThanLocal) continue

      if (meta.deleted) {
        if (local) {
          if (meta.kind === 'template') templateRemovals.push(meta.id)
          else mediaChanges[meta.kind].removals.add(meta.id)
        }
        known[key] = meta.updatedAt
        continue
      }

      const item = await library.getItem<unknown>(meta.kind, meta.id)
      if (meta.kind === 'template') {
        const parsed = parseTemplatePackage(item.data)
        if (parsed.ok) templateUpserts.push({ ...templateFromPackage(parsed.value), updatedAt: meta.updatedAt, updatedBy: meta.updatedBy })
      } else {
        mediaChanges[meta.kind].upserts.push(item.data as MediaLibraryEntry)
      }
      known[key] = meta.updatedAt
    }

    applyingRemote = true
    try {
      usePlayoutStore.getState().mergeLibraryTemplates(templateUpserts, templateRemovals)
      for (const kind of ['asset', 'font'] as const) {
        const { upserts, removals } = mediaChanges[kind]
        if (upserts.length === 0 && removals.size === 0) continue
        const current = kind === 'asset' ? assets : fonts
        const byId = new Map(current.filter((entry) => !removals.has(entry.id)).map((entry) => [entry.id, entry]))
        upserts.forEach((entry) => byId.set(entry.id, entry))
        let next = [...byId.values()]
        if (kind === 'font' && upserts.length > 0) next = (await registerFontEntries(next)).entries
        persistMediaEntries(kind, next)
        upserts.forEach((entry) => localByKey.set(keyOf(kind, entry.id), { kind, id: entry.id, updatedAt: entry.modifiedAt, payload: () => entry }))
        removals.forEach((id) => localByKey.delete(keyOf(kind, id)))
      }
    } finally {
      applyingRemote = false
    }
    templateUpserts.forEach((template) =>
      localByKey.set(keyOf('template', template.id), { kind: 'template', id: template.id, updatedAt: template.updatedAt ?? 0, payload: () => null }),
    )
    templateRemovals.forEach((id) => localByKey.delete(keyOf('template', id)))

    // 2. Push: local items that are new or changed since the last sync.
    for (const item of localByKey.values()) {
      const key = keyOf(item.kind, item.id)
      const remoteMeta = remoteByKey.get(key)
      if (item.updatedAt <= (known[key] ?? -1) && remoteMeta && !remoteMeta.deleted) continue
      if (remoteMeta && remoteMeta.updatedAt >= item.updatedAt && !remoteMeta.deleted) {
        known[key] = Math.max(known[key] ?? 0, remoteMeta.updatedAt)
        continue
      }
      if (remoteMeta?.deleted && remoteMeta.updatedAt >= item.updatedAt) continue
      try {
        await library.putItem(item.kind, item.id, item.updatedAt, item.payload())
        known[key] = item.updatedAt
      } catch (error) {
        if (!(error instanceof LibraryError) || error.status !== 409) throw error
      }
    }

    // 3. Deletions: things this browser had synced before and no longer has.
    const deletions = remote.filter(
      (meta: LibraryItemMeta) => !meta.deleted && known[keyOf(meta.kind, meta.id)] !== undefined && !localByKey.has(keyOf(meta.kind, meta.id)),
    )
    let warning = ''
    if (deletions.length > MAX_DELETES_PER_PASS) {
      // Most likely a cleared browser or "Reset uploads": restore from the library instead.
      deletions.forEach((meta) => delete known[keyOf(meta.kind, meta.id)])
      warning = ` ${deletions.length} items were missing here, so they were kept in the library (not deleted).`
      rerun = true
    } else {
      for (const meta of deletions) {
        await library.deleteItem(meta.kind, meta.id)
        delete known[keyOf(meta.kind, meta.id)]
      }
    }

    writeKnown(known)
    useLibraryStatus.setState({ status: 'synced', message: `Team library up to date.${warning}`, lastSyncedAt: Date.now() })
  } catch (error) {
    if (error instanceof LibraryError && error.status === 401) {
      useLibraryStatus.setState({ status: 'locked', message: 'Wrong team passphrase. Re-enter it in Library.' })
    } else if (error instanceof LibraryError && error.status === 503) {
      useLibraryStatus.setState({ status: 'unavailable', message: error.message })
    } else if (error instanceof LibraryError && error.status === 0) {
      useLibraryStatus.setState({ status: 'offline', message: error.message })
    } else {
      useLibraryStatus.setState({ status: 'error', message: error instanceof Error ? error.message : 'Sync failed.' })
    }
  } finally {
    running = false
    if (rerun) {
      rerun = false
      window.setTimeout(() => void syncOnce(), 0)
    }
  }
}

let pushHandle: number | null = null
function schedulePush() {
  if (applyingRemote) return
  if (pushHandle !== null) window.clearTimeout(pushHandle)
  pushHandle = window.setTimeout(() => {
    pushHandle = null
    void syncOnce()
  }, PUSH_DEBOUNCE_MS)
}

let started = false

/** Starts background sync (safe to call more than once). */
export function startLibrarySync() {
  if (started || typeof window === 'undefined') return
  started = true
  void syncOnce()
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncOnce()
  }, POLL_MS)
  window.addEventListener('focus', () => void syncOnce())
  window.addEventListener(MEDIA_LIBRARY_UPDATED_EVENT, schedulePush)
  usePlayoutStore.subscribe((state, previous) => {
    if (state.templates !== previous.templates) schedulePush()
  })
}

/** Run a sync now (e.g. right after entering the passphrase). */
export const syncLibraryNow = () => syncOnce()
