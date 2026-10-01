export type OutputFollow = 'preview' | 'program'

export function normalizeOutputFollow(raw: string | null | undefined): OutputFollow {
  return raw === 'preview' ? 'preview' : 'program'
}

export function buildOutputPath(follow: OutputFollow): string {
  return `/output-feed?follow=${follow}&embed=1`
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

export function buildDefaultTransportWsUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8787'
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname || 'localhost'
  return `${protocol}//${host}:8787`
}
