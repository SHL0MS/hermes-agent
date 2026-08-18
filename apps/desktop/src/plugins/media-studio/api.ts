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
  modality: 'image' | 'video' | 'audio'
  tier: string
  note?: string
  /** Action-launched rows (e.g. the cover renderer) — valid submit targets,
   *  hidden from the create panel's picker. */
  hidden?: boolean
  supports: Record<string, boolean> & {
    /** MiniMax music brief fields; presence = the create panel shows them. */
    lyrics?: boolean
    genre?: boolean
    mood?: boolean
    bpm?: boolean
    key?: boolean
    vocal?: boolean
    instrumental?: boolean
    instrumentation?: boolean
    iterations?: boolean
    mode?: boolean
    reference_audio_url?: boolean
  }
  /** Deviations from the defaults (prompt required, image optional). */
  requires?: { prompt?: boolean; image_url?: boolean }
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
  /** Whether that key is actually on file (managed routes are available
   *  without one, so `available` can't answer this). */
  key_on_file?: boolean
}

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired'

export interface MediaJob {
  id: string
  provider: string
  model: string
  modality: 'image' | 'video' | 'audio'
  params: Record<string, unknown>
  state: JobState
  /** Originating chat session (provenance) — set on agent rows and on studio
   *  jobs queued by the agent tool. */
  session_id?: null | string
  progress?: null | string
  error?: null | string
  source: string
  result_paths: string[]
  thumb_paths: string[]
  /** Server-checked: every result file still exists on disk. Absent on older
   *  backends → treat as present (no degraded affordances). */
  files_present?: boolean
  /** User-starred. SQLite int (0/1) on the wire; absent on older backends. */
  favorite?: number
  created_at: number
  finished_at?: null | number
}

export interface SubmitBody {
  provider: string
  model: string
  modality: 'image' | 'video' | 'audio'
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

/** Whether a job's result files are actually on disk (server-checked; absent
 *  field = older backend = assume present). */
export function filesPresent(job: MediaJob): boolean {
  return job.files_present !== false
}

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
export async function latestResult(modality?: 'image' | 'video' | 'audio'): Promise<MediaJob | null> {
  const { jobs } = await fetchJobs()

  return (
    jobs
      .filter(job => job.state === 'done' && job.result_paths.length > 0 && job.files_present !== false)
      .filter(job => !modality || job.modality === modality)
      .sort((a, b) => b.created_at - a.created_at)[0] ?? null
  )
}

export function submitJob(body: SubmitBody): Promise<{ job: MediaJob }> {
  return call('/jobs', { body, method: 'POST' })
}

// ---------------------------------------------------------------------------
// Music interactive (non-job) endpoints
// ---------------------------------------------------------------------------

export interface LyricsResult {
  song_title: string
  style_tags: string
  lyrics: string
}

export function musicLyrics(body: {
  prompt: string
  mode?: 'write_full_song' | 'edit'
  lyrics?: string
  title?: string
}): Promise<LyricsResult> {
  return call('/music/lyrics', { body, method: 'POST' })
}

export interface StructureSegment {
  start: number
  end: number
  label: string
}

export interface CoverPreprocessResult {
  cover_feature_id: string
  formatted_lyrics: string
  structure: { segments?: StructureSegment[]; num_segments?: number }
  audio_duration?: number
  trace_id?: string
}

export function coverPreprocess(reference: string): Promise<CoverPreprocessResult> {
  return call('/music/cover/preprocess', { body: { reference }, method: 'POST' })
}

/** Reference shorthand: a library job's result as a cover/derive source. */
export function jobReference(jobId: string): string {
  return `job:${jobId}`
}

// ---------------------------------------------------------------------------
// DSP audio routes (local, hermes-music-craft; no provider credits)
// ---------------------------------------------------------------------------

export interface AudioStructure {
  bpm?: number
  duration?: number
  downbeats?: number[]
  sections?: Array<{ index: number; start_s: number; end_s: number }>
}

export interface DerivedAudio {
  job_id: string
  out: string
  start_s?: number
  bars?: number
  seconds?: number
  bpm?: number
  op?: string
  preset?: string
  measured_before?: { lufs?: number; true_peak_db?: number; lra?: number }
  moves?: string[]
}

export function audioStructure(jobId: string): Promise<AudioStructure> {
  return call(`/audio/structure?job_id=${encodeURIComponent(jobId)}`)
}

export function audioLoop(jobId: string, bars = 8): Promise<DerivedAudio> {
  return call('/audio/loop', { body: { job_id: jobId, op: 'loop', bars }, method: 'POST' })
}

export function audioHook(jobId: string, seconds = 30): Promise<DerivedAudio> {
  return call('/audio/hook', { body: { job_id: jobId, op: 'hook', seconds }, method: 'POST' })
}

export function audioEdit(
  jobId: string,
  op: 'crop' | 'fade' | 'speed' | 'reverse',
  opts: { start_s?: number; end_s?: number; fade_in?: number; fade_out?: number; factor?: number } = {}
): Promise<DerivedAudio> {
  return call('/audio/edit', { body: { job_id: jobId, op, ...opts }, method: 'POST' })
}

export function audioMaster(jobId: string, preset = 'spotify', smart = true): Promise<DerivedAudio> {
  return call('/audio/master', { body: { job_id: jobId, preset, smart }, method: 'POST' })
}

export function audioMix(jobIds: string[], barsEach = 8, targetBpm?: number): Promise<DerivedAudio & { total_s: number; segments: unknown[] }> {
  return call('/audio/mix', { body: { job_ids: jobIds, bars_each: barsEach, target_bpm: targetBpm }, method: 'POST' })
}

export function cancelJob(id: string): Promise<{ ok: boolean }> {
  return call(`/jobs/${id}/cancel`, { method: 'POST' })
}

export function setJobFavorite(id: string, favorite: boolean): Promise<{ favorite: boolean; ok: boolean }> {
  return call(`/jobs/${id}/favorite`, { body: { favorite }, method: 'POST' })
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

// Data-URL cache with a byte budget. Unbounded caching held every thumb AND
// every full video/audio ever viewed for the session's lifetime — after a
// scroll through a large library the renderer sat on hundreds of MB and the
// whole app got sluggish. LRU keyed on access; oversized single entries
// (lightbox videos) are served but never retained.
const DATA_URL_BUDGET = 48 * 1024 * 1024
const DATA_URL_MAX_ENTRY = 24 * 1024 * 1024

interface CacheEntry {
  promise: Promise<string>
  bytes: number
}

const dataUrlCache = new Map<string, CacheEntry>()
let dataUrlBytes = 0

function evictUntil(budget: number): void {
  for (const [key, entry] of dataUrlCache) {
    if (dataUrlBytes <= budget) {
      return
    }

    dataUrlCache.delete(key)
    dataUrlBytes -= entry.bytes
  }
}

export function mediaDataUrl(path: string): Promise<string> {
  const bridge = window.hermesDesktop

  if (!bridge?.readFileDataUrl) {
    return Promise.reject(new Error('desktop bridge unavailable'))
  }

  const cached = dataUrlCache.get(path)

  if (cached) {
    // LRU: re-insert on access so hot thumbs outlive one-off full reads.
    dataUrlCache.delete(path)
    dataUrlCache.set(path, cached)

    return cached.promise
  }

  const entry: CacheEntry = { bytes: 0, promise: Promise.resolve('') }

  entry.promise = bridge.readFileDataUrl(path).then(
    url => {
      entry.bytes = url.length

      if (url.length > DATA_URL_MAX_ENTRY) {
        // Too big to retain: hand it to the caller, drop it from the cache.
        dataUrlCache.delete(path)
      } else {
        dataUrlBytes += entry.bytes
        evictUntil(DATA_URL_BUDGET)
      }

      return url
    },
    (error: unknown) => {
      dataUrlCache.delete(path)
      throw error
    }
  )
  dataUrlCache.set(path, entry)

  return entry.promise
}

/** Streamed URL for video playback (Range support, no data-URL size cap). */
export function mediaVideoUrl(path: string): string {
  return `hermes-media://stream/${encodeURIComponent(path)}`
}
