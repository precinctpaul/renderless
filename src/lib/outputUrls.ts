export type OutputFollow = 'preview' | 'program'

export function normalizeOutputFollow(raw: string | null | undefined): OutputFollow {
  return raw === 'preview' ? 'preview' : 'program'
}

export function buildOutputPath(follow: OutputFollow): string {
  return `/output-feed?follow=${follow}&embed=1`
}

export function buildOutputUrl(follow: OutputFollow): string {
  const path = buildOutputPath(follow)

  if (typeof window === 'undefined') {
    return path
  }

  return `${window.location.origin}${path}`
}
