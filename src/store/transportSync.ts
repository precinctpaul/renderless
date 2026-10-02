/** Live sync between tabs (BroadcastChannel) and devices (relay WebSocket) for the playout store. */

import { CLEAR_SCENE, cloneScene } from '../data/templates'
import {
  CLEAR_TEMPLATE_ID,
  TEMPLATE_STORAGE_KEY,
  buildTemplateCatalog,
  findTemplateById,
  resolveSceneForTemplate,
} from './templateCatalog'
import {
  DATA_SHEET_STORAGE_KEY,
  PACKAGE_SIGNING_STORAGE_KEY,
  TRANSPORT_STORAGE_KEY,
  buildFieldCatalog,
  cloneStory,
  readDataSheet,
  readPackageSigningState,
  readTransportConfig,
} from './persistence'
import type { PersistedPlayoutSnapshot, RoomRetirePayload, TransportSyncPayload } from './types'
import {
  ROOM_STORAGE_KEY,
  buildRelayRoomUrl,
  getRoomId,
  isOutputViewerLocation,
  isViewingOtherRoom,
} from '../lib/outputUrls'
import { STORAGE_KEY, normalizeSnapshot, toSnapshot } from './snapshot'
import { usePlayoutStore } from './playoutStore'

const CHANNEL_KEY = 'renderless.playout.sync.v1'
const INSTANCE_ID = `renderless-${Math.random().toString(36).slice(2)}`

/** Set by the sync layer so store actions can reach the live relay connection. */
export const transportHooks: { retireActiveRelayRoom: (() => void) | null; reconcileTransportNow: (() => void) | null } = {
  retireActiveRelayRoom: null,
  reconcileTransportNow: null,
}

/** Starts syncing (browser only). Safe across hot reloads: a previous install is cleaned up first. */
export function installTransportSync() {
  if (typeof window === 'undefined') {
    return
  }

  window.__renderlessSyncCleanup?.()

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_KEY) : null
  let isApplyingExternalSnapshot = false
  let isCleaningUp = false
  let websocket: WebSocket | null = null
  let websocketUrl = ''
  let reconnectHandle: number | null = null
  let reconnectAttempt = 0
  let lastPublishedSnapshotJson = ''

  const publishPayloadToWebSocket = (payload: TransportSyncPayload) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      websocket.send(JSON.stringify(payload))
    } catch {
      usePlayoutStore.getState().setTransportStatus('error', 'Failed to publish websocket payload.')
    }
  }

  const closeWebSocket = () => {
    if (!websocket) {
      return
    }

    try {
      websocket.close()
    } catch {
      // Ignore close failures.
    } finally {
      websocket = null
    }
  }

  const clearReconnect = () => {
    if (reconnectHandle !== null) {
      window.clearTimeout(reconnectHandle)
      reconnectHandle = null
    }
  }

  const applyExternalSnapshot = (incomingSnapshot: Partial<PersistedPlayoutSnapshot>, fromRelay = false) => {
    // Same-browser sync is not room-scoped: an Output on a retired room listens to the relay only.
    if (!fromRelay && isViewingOtherRoom()) {
      return
    }

    const state = usePlayoutStore.getState()
    const defaultId = state.templates[0]?.id ?? ''
    const normalized = normalizeSnapshot(incomingSnapshot, state.templates, defaultId)
    // Viewers always mirror the controller: a freshly opened viewer has a newer local timestamp,
    // and device clocks differ, so timestamp ordering only applies between controllers.
    if (!isOutputViewerLocation() && normalized.updatedAt <= state.updatedAt) {
      return
    }

    isApplyingExternalSnapshot = true
    usePlayoutStore.setState({
      previewTemplateId: normalized.previewTemplateId,
      programTemplateId: normalized.programTemplateId,
      previewScene: cloneScene(normalized.previewScene),
      programScene:
        normalized.programTemplateId === CLEAR_TEMPLATE_ID
          ? cloneScene(CLEAR_SCENE)
          : cloneScene(normalized.programScene),
      transitionType: normalized.transitionType,
      transitionDurationMs: normalized.transitionDurationMs,
      transitionInProgress: normalized.transitionInProgress,
      programTransition: normalized.programTransition,
      story: cloneStory(normalized.story),
      onAir: normalized.onAir,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
      updatedAt: normalized.updatedAt,
    })
    isApplyingExternalSnapshot = false
  }

  // A viewer whose room was retired drops whatever it was showing.
  const blankRetiredRoomViewer = () => {
    isApplyingExternalSnapshot = true
    usePlayoutStore.setState({
      programTemplateId: CLEAR_TEMPLATE_ID,
      programScene: cloneScene(CLEAR_SCENE),
      previewScene: cloneScene(CLEAR_SCENE),
      onAir: false,
      transitionInProgress: false,
      programTransition: null,
    })
    isApplyingExternalSnapshot = false
  }

  const scheduleReconnect = () => {
    if (isCleaningUp || reconnectHandle !== null) {
      return
    }

    const state = usePlayoutStore.getState()
    if (state.transportMode !== 'ws') {
      return
    }

    const delayMs = Math.min(1000 * (2 ** reconnectAttempt), 10_000)
    reconnectAttempt += 1

    reconnectHandle = window.setTimeout(() => {
      reconnectHandle = null
      reconcileWebSocketTransport()
    }, delayMs)
  }

  const reconcileWebSocketTransport = () => {
    if (isCleaningUp) {
      return
    }

    const state = usePlayoutStore.getState()

    if (state.transportMode !== 'ws') {
      clearReconnect()
      reconnectAttempt = 0
      closeWebSocket()
      state.setTransportStatus('offline')
      return
    }

    const baseUrl = state.transportWsUrl.trim()
    if (!/^wss?:\/\//i.test(baseUrl)) {
      clearReconnect()
      closeWebSocket()
      state.setTransportStatus('error', 'WebSocket URL must start with ws:// or wss://')
      return
    }

    const nextUrl = buildRelayRoomUrl(baseUrl)
    if (websocket && websocketUrl === nextUrl && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
      return
    }

    clearReconnect()
    closeWebSocket()
    websocketUrl = nextUrl
    state.setTransportStatus('connecting')

    try {
      const nextSocket = new WebSocket(nextUrl)
      websocket = nextSocket

      nextSocket.addEventListener('open', () => {
        if (websocket !== nextSocket) {
          return
        }

        reconnectAttempt = 0
        usePlayoutStore.getState().setTransportStatus('online')
        if (isOutputViewerLocation()) {
          return
        }

        const snapshot = toSnapshot(usePlayoutStore.getState())
        publishPayloadToWebSocket({
          type: 'renderless-playout-sync',
          source: INSTANCE_ID,
          snapshot,
        })
      })

      nextSocket.addEventListener('message', (event) => {
        if (websocket !== nextSocket || typeof event.data !== 'string') {
          return
        }

        try {
          const message = JSON.parse(event.data) as Partial<TransportSyncPayload> | Partial<RoomRetirePayload>
          if (message.type === 'renderless-room-retire') {
            if (message.source !== INSTANCE_ID && isOutputViewerLocation()) {
              blankRetiredRoomViewer()
            }
            return
          }

          const payload = message as Partial<TransportSyncPayload>
          if (payload.type !== 'renderless-playout-sync' || payload.source === INSTANCE_ID || !payload.snapshot) {
            return
          }

          applyExternalSnapshot(payload.snapshot, true)
        } catch {
          // Ignore malformed websocket messages.
        }
      })

      nextSocket.addEventListener('close', () => {
        if (websocket === nextSocket) {
          websocket = null
        }

        if (isCleaningUp) {
          return
        }

        const currentState = usePlayoutStore.getState()
        currentState.setTransportStatus('offline')
        if (currentState.transportMode === 'ws') {
          scheduleReconnect()
        }
      })

      nextSocket.addEventListener('error', () => {
        if (websocket !== nextSocket) {
          return
        }

        usePlayoutStore.getState().setTransportStatus('error', 'WebSocket transport error.')
      })
    } catch {
      state.setTransportStatus('error', 'WebSocket connection failed to initialize.')
      scheduleReconnect()
    }
  }

  const unsubscribe = usePlayoutStore.subscribe((state) => {
    if (isApplyingExternalSnapshot || isOutputViewerLocation()) {
      return
    }

    const snapshot = toSnapshot(state)
    const serializedSnapshot = JSON.stringify(snapshot)
    if (serializedSnapshot === lastPublishedSnapshotJson) {
      return
    }

    lastPublishedSnapshotJson = serializedSnapshot
    const payload: TransportSyncPayload = {
      type: 'renderless-playout-sync',
      source: INSTANCE_ID,
      snapshot,
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, serializedSnapshot)
    } catch {
      // Ignore storage failures and continue with in-memory state.
    }

    channel?.postMessage(payload)
    publishPayloadToWebSocket(payload)
  })

  const onChannelMessage = (event: MessageEvent) => {
    const payload = event.data as Partial<TransportSyncPayload> | undefined

    if (!payload || payload.type !== 'renderless-playout-sync') {
      return
    }

    if (payload.source === INSTANCE_ID || !payload.snapshot) {
      return
    }

    applyExternalSnapshot(payload.snapshot)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const snapshot = JSON.parse(event.newValue) as Partial<PersistedPlayoutSnapshot>
        applyExternalSnapshot(snapshot)
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    }

    if (event.key === TEMPLATE_STORAGE_KEY) {
      const nextTemplates = buildTemplateCatalog()

      usePlayoutStore.setState((state) => {
        const fallbackTemplateId = nextTemplates[0]?.id ?? ''
        const previewTemplateId =
          findTemplateById(nextTemplates, state.previewTemplateId)?.id ?? fallbackTemplateId

        const programTemplateId =
          findTemplateById(nextTemplates, state.programTemplateId)?.id ?? CLEAR_TEMPLATE_ID

        return {
          templates: nextTemplates,
          previewTemplateId,
          programTemplateId,
          previewScene:
            previewTemplateId && previewTemplateId !== state.previewTemplateId
              ? resolveSceneForTemplate(nextTemplates, previewTemplateId)
              : state.previewScene,
          programScene:
            programTemplateId === CLEAR_TEMPLATE_ID
              ? cloneScene(CLEAR_SCENE)
              : programTemplateId && programTemplateId !== state.programTemplateId
                ? resolveSceneForTemplate(nextTemplates, programTemplateId)
                : state.programScene,
          onAir: programTemplateId !== CLEAR_TEMPLATE_ID && state.onAir,
        }
      })
    }

    if (event.key === TRANSPORT_STORAGE_KEY) {
      const transportConfig = readTransportConfig()
      usePlayoutStore.setState(() => ({
        transportMode: transportConfig.mode,
        transportWsUrl: transportConfig.wsUrl,
      }))
      reconcileWebSocketTransport()
    }

    if (event.key === ROOM_STORAGE_KEY) {
      // Another tab rotated the room; follow it (the socket moves on the next reconcile).
      usePlayoutStore.setState(() => ({ transportRoomId: getRoomId() }))
      reconcileWebSocketTransport()
    }

    if (event.key === PACKAGE_SIGNING_STORAGE_KEY) {
      const signingState = readPackageSigningState()
      usePlayoutStore.setState(() => ({
        packageSigningEnabled: signingState.enabled,
        packageSigningKeyId: signingState.keyId,
        packageSigningSecret: signingState.secret,
      }))
    }

    if (event.key === DATA_SHEET_STORAGE_KEY) {
      const sheet = readDataSheet()
      usePlayoutStore.setState((state) => ({ dataSheet: sheet, bindingFields: buildFieldCatalog(state.story.bindings, sheet) }))
    }
  }

  const recoveryPollHandle = window.setInterval(() => {
    try {
      const rawSnapshot = window.localStorage.getItem(STORAGE_KEY)
      if (!rawSnapshot) {
        return
      }

      const parsedSnapshot = JSON.parse(rawSnapshot) as Partial<PersistedPlayoutSnapshot>
      applyExternalSnapshot(parsedSnapshot)
    } catch {
      // Ignore malformed snapshots during periodic recovery checks.
    }
  }, 1000)

  const transportPollHandle = window.setInterval(() => {
    reconcileWebSocketTransport()
  }, 1000)

  transportHooks.retireActiveRelayRoom = () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return
    }

    try {
      const retire: RoomRetirePayload = { type: 'renderless-room-retire', source: INSTANCE_ID }
      websocket.send(JSON.stringify(retire))
    } catch {
      // The old room simply keeps its last state if the retire message cannot be sent.
    }
  }
  transportHooks.reconcileTransportNow = reconcileWebSocketTransport

  channel?.addEventListener('message', onChannelMessage)
  window.addEventListener('storage', onStorage)
  reconcileWebSocketTransport()

  window.__renderlessSyncCleanup = () => {
    isCleaningUp = true
    transportHooks.retireActiveRelayRoom = null
    transportHooks.reconcileTransportNow = null
    clearReconnect()
    unsubscribe()
    window.removeEventListener('storage', onStorage)
    window.clearInterval(recoveryPollHandle)
    window.clearInterval(transportPollHandle)
    closeWebSocket()
    if (channel) {
      channel.removeEventListener('message', onChannelMessage)
      channel.close()
    }
  }
}
