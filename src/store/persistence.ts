/** Browser storage for settings, data fields and the loaded spreadsheet. */

import type { DataSheet } from '../lib/dataSheet'
import type { PackageSigningState, TransportConfigState, TransportMode } from './types'
import type { PlayoutStore } from './playoutStore'
import type { StoryFieldDef } from '../data/storySchema'
import type { StoryState } from '../types/scene'
import type { TemplatePackageSigningConfig } from '../lib/templatePackages'
import { buildDefaultTransportWsUrl, buildHostRelayUrl, hasConfiguredRelay } from '../lib/outputUrls'
import { DEFAULT_FIELD_VALUES, fieldDefsFor } from '../data/storySchema'

export const TRANSPORT_STORAGE_KEY = 'renderless.playout.transport.v1'

export const PACKAGE_SIGNING_STORAGE_KEY = 'renderless.templates.signing.v1'

export const DATA_SHEET_STORAGE_KEY = 'renderless.data.sheet.v1'

export function cloneStory(story: StoryState): StoryState {
  return { bindings: { ...(story.bindings ?? {}) } }
}

// Values left over from the old sports demo are dropped when an old snapshot loads.
export const LEGACY_FIELD_KEYS = new Set(['homeScore', 'awayScore', 'clock', 'possession', 'period', 'shotClock', 'homeFouls', 'awayFouls'])
export const LEGACY_FIELD_PREFIX = /^(Game|Teams|Players|Context|Analytics|Graphics|Stories|RecentEvents)\./

// Text the old basketball simulation wrote into fields that still exist (e.g. headline "Defensive rebound").
const LEGACY_VALUE = /rebound|simulation live|momentum currently|hot streak|defensive pressure|pace indicators|record watch|shot clock|turnover|fast break|hits a [23] from|free throw|timeout called|[A-Z]{2,4} [0-9]{1,3} - [A-Z]{2,4} [0-9]{1,3}/i

export function withoutLegacyFields(values: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => !LEGACY_FIELD_KEYS.has(key) && !LEGACY_FIELD_PREFIX.test(key))
      .map(([key, value]) =>
        typeof value === 'string' && LEGACY_VALUE.test(value) ? [key, DEFAULT_FIELD_VALUES[key] ?? ''] : [key, value],
      ),
  )
}

export function readDataSheet(): DataSheet | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DATA_SHEET_STORAGE_KEY) ?? 'null') as DataSheet | null
    return parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows) ? parsed : null
  } catch {
    return null
  }
}

export function persistDataSheet(sheet: DataSheet | null) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (sheet) window.localStorage.setItem(DATA_SHEET_STORAGE_KEY, JSON.stringify(sheet))
    else window.localStorage.removeItem(DATA_SHEET_STORAGE_KEY)
  } catch {
    // Large sheets may not fit in storage; they still work for this session.
  }
}

/** Field catalog for pickers: built-in fields, spreadsheet columns, and any key with a value. */
export function buildFieldCatalog(values: Record<string, string | number | boolean | null>, sheet: DataSheet | null): StoryFieldDef[] {
  const sheetFields: StoryFieldDef[] = (sheet?.columns ?? []).map((column) => ({
    key: column.key,
    label: column.label,
    group: 'Spreadsheet',
    kind: 'string',
    quickControl: false,
  }))
  return fieldDefsFor(values, sheetFields)
}

export function readTransportConfig(): TransportConfigState {
  const defaultWsUrl = buildDefaultTransportWsUrl()
  // With a hosted relay configured, cross-device sync is the default; otherwise stay browser-local.
  const defaultMode: TransportMode = hasConfiguredRelay() ? 'ws' : 'local'

  if (typeof window === 'undefined') {
    return {
      mode: defaultMode,
      wsUrl: defaultWsUrl,
    }
  }

  try {
    const raw = window.localStorage.getItem(TRANSPORT_STORAGE_KEY)
    if (!raw) {
      return {
        mode: defaultMode,
        wsUrl: defaultWsUrl,
      }
    }

    const parsed = JSON.parse(raw) as Partial<TransportConfigState>
    const mode = parsed.mode === 'ws' ? 'ws' : 'local'
    const storedWsUrl = typeof parsed.wsUrl === 'string' ? parsed.wsUrl.trim() : ''
    // Older builds persisted <host>:8787, which never exists on a hosted origin; upgrade it to the relay.
    const wsUrl =
      storedWsUrl.length === 0 || (hasConfiguredRelay() && storedWsUrl === buildHostRelayUrl())
        ? defaultWsUrl
        : storedWsUrl

    return {
      mode,
      wsUrl,
    }
  } catch {
    return {
      mode: defaultMode,
      wsUrl: defaultWsUrl,
    }
  }
}

export function persistTransportConfig(config: TransportConfigState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(TRANSPORT_STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage failures and continue with in-memory config.
  }
}

export function readPackageSigningState(): PackageSigningState {
  if (typeof window === 'undefined') {
    return {
      enabled: false,
      keyId: 'renderless-local',
      secret: '',
    }
  }

  try {
    const raw = window.localStorage.getItem(PACKAGE_SIGNING_STORAGE_KEY)
    if (!raw) {
      return {
        enabled: false,
        keyId: 'renderless-local',
        secret: '',
      }
    }

    const parsed = JSON.parse(raw) as Partial<PackageSigningState>
    const keyId = typeof parsed.keyId === 'string' && parsed.keyId.trim().length > 0 ? parsed.keyId.trim() : 'renderless-local'
    const secret = typeof parsed.secret === 'string' ? parsed.secret : ''
    return {
      enabled: Boolean(parsed.enabled),
      keyId,
      secret,
    }
  } catch {
    return {
      enabled: false,
      keyId: 'renderless-local',
      secret: '',
    }
  }
}

export function persistPackageSigningState(state: PackageSigningState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(PACKAGE_SIGNING_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures and continue with in-memory config.
  }
}

export function primitiveFromUnknown(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  return null
}

export function normalizeBindingMap(rawBindingMap: unknown): Record<string, string | number | boolean | null> {
  if (!rawBindingMap || typeof rawBindingMap !== 'object') {
    return {}
  }

  return Object.entries(rawBindingMap as Record<string, unknown>).reduce<Record<string, string | number | boolean | null>>(
    (accumulator, [key, value]) => {
      if (typeof key !== 'string' || key.trim().length === 0) {
        return accumulator
      }

      accumulator[key] = primitiveFromUnknown(value)
      return accumulator
    },
    {},
  )
}

export function getSigningConfigFromState(state: Pick<PlayoutStore, 'packageSigningEnabled' | 'packageSigningKeyId' | 'packageSigningSecret'>): TemplatePackageSigningConfig | null {
  if (!state.packageSigningEnabled) {
    return null
  }

  const keyId = state.packageSigningKeyId.trim()
  const secret = state.packageSigningSecret.trim()
  if (!keyId || !secret) {
    return null
  }

  return {
    keyId,
    secret,
  }
}
