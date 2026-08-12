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
  /** Env var this provider's BYOK key lands in; null → not keyable here. */
  key_var?: null | string
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
  /** Fan out N identical jobs (server steps a pinned seed per job). */
  count?: number
}

type Rest = <T>(path: string, opts?: PluginRestOptions) => Promise<T>
type Socket = (path: string, onMessage: (data: unknown) => void) => () => void

let rest: null | Rest = null

/** Terminal transitions observed on the live events socket. Socket frames
 *  start at the store's current seq (no history replay), so every callback
 *  invocation is a job finishing NOW — safe to surface as a notification. */
type TerminalListener = (jobId: string, state: 'done' | 'failed') => void

const terminalListeners = new Set<TerminalListener>()

export function onJobTerminal(listener: TerminalListener): () => void {
  terminalListeners.add(listener)

  return () => terminalListeners.delete(listener)
}

export const PROVIDERS_KEY = ['media-studio', 'providers'] as const
export const JOBS_KEY = ['media-studio', 'jobs'] as const

export const TERMINAL_STATES: readonly JobState[] = ['done', 'failed', 'cancelled', 'expired']

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state)
}

/** Whether the host app ships the `host.attachFileToComposer` SDK door
 *  (NousResearch/hermes-agent#84209). On older apps the send-to-chat
 *  affordances hide; everything else works. */
export function canAttachToComposer(hostLike: unknown): boolean {
  return typeof (hostLike as { attachFileToComposer?: unknown })?.attachFileToComposer === 'function'
}

/** Bind the plugin doors at register time; returns the disposer the host
 *  runs on unload/disable (socket closed, rest unbound). */
export function bindApi(r: Rest, socket: Socket): () => void {
  rest = r

  const close = socket('/events', data => {
    const events = (data as { events?: Array<{ job_id?: string; payload?: { state?: string } }> })?.events

    if (!events?.length) {
      return
    }

    void queryClient.invalidateQueries({ queryKey: JOBS_KEY })

    for (const event of events) {
      const state = event.payload?.state

      if (event.job_id && (state === 'done' || state === 'failed')) {
        for (const listener of terminalListeners) {
          listener(event.job_id, state)
        }
      }
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

export function setProviderKey(provider: string, key: string): Promise<{ ok: boolean; available: boolean }> {
  return call(`/providers/${encodeURIComponent(provider)}/key`, { body: { key }, method: 'PUT' })
}

export function clearProviderKey(provider: string): Promise<{ ok: boolean; available: boolean }> {
  return call(`/providers/${encodeURIComponent(provider)}/key`, { method: 'DELETE' })
}

export function fetchJobs(): Promise<{ jobs: MediaJob[] }> {
  return call('/jobs?limit=400')
}

export function fetchJob(id: string): Promise<{ job: MediaJob }> {
  return call(`/jobs/${encodeURIComponent(id)}`)
}

/** Newest completed generation with a materialized file, newest first.
 *  Optionally constrained to one modality. */
export async function latestResult(modality?: 'image' | 'video'): Promise<MediaJob | null> {
  const { jobs } = await fetchJobs()

  return (
    jobs
      .filter(job => job.state === 'done' && job.result_paths.length > 0)
      .filter(job => !modality || job.modality === modality)
      .sort((a, b) => b.created_at - a.created_at)[0] ?? null
  )
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
