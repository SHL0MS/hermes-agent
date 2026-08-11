/**
 * Media Studio data layer. All requests ride `ctx.rest` — the plugin's own
 * `/api/plugins/media-studio/*` FastAPI router — through the desktop's
 * namespace-scoped REST door. React Query owns caching/polling; the events
 * socket just sharpens invalidation (polling stays as the fallback).
 */

import { type PluginRestOptions, queryClient } from '@hermes/plugin-sdk'

export interface ModelInfo {
  id: string
  display: string
  modality: 'image' | 'video'
  tier: string
  note?: string
  supports: Record<string, boolean>
  aspect_ratios?: string[]
  resolutions?: string[]
  durations?: number[]
}

export interface ProviderInfo {
  name: string
  display: string
  available: boolean
  hint: string
  models: ModelInfo[]
}

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired'

export interface MediaJob {
  id: string
  provider: string
  model: string
  modality: 'image' | 'video'
  params: Record<string, unknown>
  state: JobState
  progress?: null | string
  error?: null | string
  source: string
  result_paths: string[]
  thumb_paths: string[]
  created_at: number
  finished_at?: null | number
}

export interface SubmitBody {
  provider: string
  model: string
  modality: 'image' | 'video'
  params: Record<string, unknown>
}

type Rest = <T>(path: string, opts?: PluginRestOptions) => Promise<T>
type Socket = (path: string, onMessage: (data: unknown) => void) => () => void

let rest: null | Rest = null

export const PROVIDERS_KEY = ['media-studio', 'providers'] as const
export const JOBS_KEY = ['media-studio', 'jobs'] as const

export const TERMINAL_STATES: readonly JobState[] = ['done', 'failed', 'cancelled', 'expired']

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state)
}

/** Bind the plugin doors at register time; returns the disposer the host
 *  runs on unload/disable (socket closed, rest unbound). */
export function bindApi(r: Rest, socket: Socket): () => void {
  rest = r

  const close = socket('/events', data => {
    const events = (data as { events?: Array<{ job_id?: string }> })?.events

    if (events?.length) {
      void queryClient.invalidateQueries({ queryKey: JOBS_KEY })
    }
  })

  return () => {
    close()
    rest = null
  }
}

function call<T>(path: string, opts?: PluginRestOptions): Promise<T> {
  return rest ? rest<T>(path, opts) : Promise.reject(new Error('media-studio api not ready'))
}

export function fetchProviders(): Promise<{ providers: ProviderInfo[] }> {
  return call('/providers')
}

export function fetchJobs(): Promise<{ jobs: MediaJob[] }> {
  return call('/jobs?limit=400')
}

export function submitJob(body: SubmitBody): Promise<{ job: MediaJob }> {
  return call('/jobs', { body, method: 'POST' })
}

export function cancelJob(id: string): Promise<{ ok: boolean }> {
  return call(`/jobs/${id}/cancel`, { method: 'POST' })
}

export function deleteJob(id: string): Promise<{ ok: boolean }> {
  return call(`/jobs/${id}`, { method: 'DELETE' })
}

export function invalidateJobs(): void {
  void queryClient.invalidateQueries({ queryKey: JOBS_KEY })
}

// ---------------------------------------------------------------------------
// Media loading. <img>/<video> can't set auth headers, so results resolve
// through the Electron bridge as data URLs (same pattern as the chat's
// GeneratedImage). Small thumbs load eagerly; full media on lightbox open.
// ---------------------------------------------------------------------------

const dataUrlCache = new Map<string, Promise<string>>()

export function mediaDataUrl(path: string): Promise<string> {
  const bridge = window.hermesDesktop

  if (!bridge?.readFileDataUrl) {
    return Promise.reject(new Error('desktop bridge unavailable'))
  }

  let cached = dataUrlCache.get(path)

  if (!cached) {
    cached = bridge.readFileDataUrl(path).catch((error: unknown) => {
      dataUrlCache.delete(path)
      throw error
    })
    dataUrlCache.set(path, cached)
  }

  return cached
}

/** Streamed URL for video playback (Range support, no data-URL size cap). */
export function mediaVideoUrl(path: string): string {
  return `hermes-media://stream/${encodeURIComponent(path)}`
}
