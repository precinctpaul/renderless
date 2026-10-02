import { buildDefaultTransportWsUrl } from './outputUrls'

/** What the team library stores. */
export type LibraryKind = 'template' | 'asset' | 'font'

export interface LibraryItemMeta {
  kind: LibraryKind
  id: string
  updatedAt: number
  updatedBy: string
  deleted: boolean
  size: number
}

export class LibraryError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const PASSPHRASE_KEY = 'renderless.library.passphrase.v1'
const AUTHOR_KEY = 'renderless.library.author.v1'

function readSetting(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeSetting(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}

/** The team passphrase this browser uses (entered once in the Library dialog). */
export const getLibraryPassphrase = () => readSetting(PASSPHRASE_KEY)
export const setLibraryPassphrase = (value: string) => writeSetting(PASSPHRASE_KEY, value.trim())
/** The name shown on versions and changes ("Saved by Paul"). */
export const getLibraryAuthor = () => readSetting(AUTHOR_KEY)
export const setLibraryAuthor = (value: string) => writeSetting(AUTHOR_KEY, value.trim().slice(0, 60))

/** The library lives on the same Cloudflare relay as Output sync: wss://host -> https://host/library. */
export function libraryBaseUrl(): string {
  return `${buildDefaultTransportWsUrl().replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '')}/library`
}

async function request<T>(path: string, init: RequestInit = {}, passphrase = getLibraryPassphrase()): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${libraryBaseUrl()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${passphrase}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch {
    throw new LibraryError('Cannot reach the team library (offline?).', 0)
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new LibraryError(body.error ?? `Library error ${response.status}`, response.status)
  return body as T
}

const itemPath = (kind: LibraryKind, id: string) => `/items/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`

export const library = {
  /** Checks a passphrase without saving it. */
  ping: (passphrase?: string) => request<{ ok: true }>('/ping', {}, passphrase),
  listItems: () => request<{ items: LibraryItemMeta[] }>('/items').then((body) => body.items),
  getItem: <T>(kind: LibraryKind, id: string) => request<LibraryItemMeta & { data: T }>(itemPath(kind, id)),
  putItem: (kind: LibraryKind, id: string, updatedAt: number, data: unknown) =>
    request<{ ok: true }>(itemPath(kind, id), {
      method: 'PUT',
      body: JSON.stringify({ updatedAt, updatedBy: getLibraryAuthor(), data }),
    }),
  deleteItem: (kind: LibraryKind, id: string, updatedAt = Date.now()) =>
    request<{ ok: true }>(
      `${itemPath(kind, id)}?updatedAt=${updatedAt}&updatedBy=${encodeURIComponent(getLibraryAuthor())}`,
      { method: 'DELETE' },
    ),
}
