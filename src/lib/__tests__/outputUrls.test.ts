import { afterEach, describe, expect, test } from 'vitest'
import {
  buildOutputPath,
  buildRelayRoomUrl,
  getRoomId,
  isOutputViewerLocation,
  normalizeRoomId,
} from '../outputUrls'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('relay rooms', () => {
  test('a browser keeps one persisted room code across calls', () => {
    const room = getRoomId()
    expect(normalizeRoomId(room)).toBe(room)
    expect(getRoomId()).toBe(room)
    expect(buildOutputPath('program')).toBe(`/output-feed?follow=program&embed=1&room=${room}`)
  })

  test('a ?room= in the URL wins over the persisted room without replacing it', () => {
    const persisted = getRoomId()
    window.history.replaceState(null, '', '/output-feed?follow=program&room=sharedroom42')
    expect(getRoomId()).toBe('sharedroom42')

    window.history.replaceState(null, '', '/control-room')
    expect(getRoomId()).toBe(persisted)
  })

  test('malformed room codes are rejected', () => {
    expect(normalizeRoomId('abc')).toBeNull()
    expect(normalizeRoomId('../../etc')).toBeNull()
    window.history.replaceState(null, '', '/output-feed?room=bad%20room')
    expect(getRoomId()).not.toBe('bad room')
  })

  test('relay URLs are scoped to the room path', () => {
    expect(buildRelayRoomUrl('wss://relay.example/', 'room123abc')).toBe('wss://relay.example/room/room123abc')
    expect(buildRelayRoomUrl('ws://localhost:8787', 'room123abc')).toBe('ws://localhost:8787/room/room123abc')
  })

  test('only output feed pages are receive-only viewers', () => {
    window.history.replaceState(null, '', '/renderless/output-feed?follow=program')
    expect(isOutputViewerLocation()).toBe(true)
    window.history.replaceState(null, '', '/control-room')
    expect(isOutputViewerLocation()).toBe(false)
  })
})
