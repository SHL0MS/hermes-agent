/**
 * Pure helpers for displaying a job's generation parameters in the library.
 * Kept out of page.tsx so the selection/formatting rules are unit-testable.
 */

import type { MediaJob } from './api'

/** Keys into the studio i18n bundle used as chip labels. */
export type ParamLabelKey =
  | 'aspectRatio'
  | 'audio'
  | 'duration'
  | 'musicBpm'
  | 'musicGenre'
  | 'musicInstruments'
  | 'musicKeySig'
  | 'musicMood'
  | 'musicTakes'
  | 'musicVocal'
  | 'negativePrompt'
  | 'resolution'
  | 'seed'
  | 'startImage'

export interface ParamEntry {
  key: ParamLabelKey
  value: string
  /** Duration renders through the locale's seconds() formatter. */
  seconds?: number
}

const MAX_NEGATIVE_PROMPT = 80

function basename(value: string): string {
  return value.split('/').pop() ?? value
}

/** Ordered, display-ready parameter entries for one job. Prompt is excluded —
 *  it renders as its own text block, not a chip. Unknown/irrelevant params
 *  are dropped rather than dumped raw. */
export function jobParamEntries(job: MediaJob): ParamEntry[] {
  const params = job.params
  const out: ParamEntry[] = []

  const aspect = params.aspect_ratio

  if (typeof aspect === 'string' && aspect) {
    out.push({ key: 'aspectRatio', value: aspect })
  }

  const resolution = params.resolution

  if (typeof resolution === 'string' && resolution) {
    out.push({ key: 'resolution', value: resolution })
  }

  const duration = params.duration

  if (typeof duration === 'number' && Number.isFinite(duration)) {
    out.push({ key: 'duration', seconds: duration, value: `${duration}s` })
  }

  const seed = params.seed

  if (typeof seed === 'number' || (typeof seed === 'string' && seed !== '')) {
    out.push({ key: 'seed', value: String(seed) })
  }

  if (params.audio === false) {
    // Only the non-default is worth a chip.
    out.push({ key: 'audio', value: 'off' })
  }

  const negative = params.negative_prompt

  if (typeof negative === 'string' && negative.trim()) {
    const trimmed = negative.trim()

    out.push({
      key: 'negativePrompt',
      value: trimmed.length > MAX_NEGATIVE_PROMPT ? `${trimmed.slice(0, MAX_NEGATIVE_PROMPT)}…` : trimmed
    })
  }

  const image = params.image_url

  if (typeof image === 'string' && image) {
    out.push({ key: 'startImage', value: image.startsWith('data:') ? 'image' : basename(image) })
  }

  // Music brief chips — present on MiniMax music rows. Lyrics stay out of the
  // chip row (long text renders as the prompt block already).
  const music: Array<[ParamLabelKey, unknown]> = [
    ['musicGenre', params.genre],
    ['musicMood', params.mood],
    ['musicBpm', params.bpm],
    ['musicKeySig', params.key],
    ['musicVocal', params.vocal],
    ['musicInstruments', params.instrumentation]
  ]

  for (const [key, value] of music) {
    if (typeof value === 'string' && value.trim()) {
      out.push({ key, value: value.trim() })
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out.push({ key, value: String(value) })
    }
  }

  const takes = params.iterations

  if (typeof takes === 'number' && takes > 1) {
    out.push({ key: 'musicTakes', value: String(takes) })
  }

  // Rendered audio length (set at import/completion), mm:ss.
  const durationS = Number(params.duration_s)

  if (Number.isFinite(durationS) && durationS > 0 && params.duration === undefined) {
    const m = Math.floor(durationS / 60)
    const sec = Math.round(durationS - m * 60)

    out.push({ key: 'duration', value: `${m}:${String(sec).padStart(2, '0')}` })
  }

  return out
}

/** The prompt for display; empty string when absent (agent-imported rows). */
export function jobPrompt(job: MediaJob): string {
  const prompt = job.params.prompt

  return typeof prompt === 'string' ? prompt : ''
}

/** Library sort modes. 'newest' is the default (matches the server order). */
export type SortMode = 'model' | 'newest' | 'oldest' | 'prompt'

export const SORT_MODES: readonly SortMode[] = ['newest', 'oldest', 'prompt', 'model']

/** Sort a job list for the library grid. Pure — returns a new array.
 *  Ties inside prompt/model groups fall back to newest-first so the grid
 *  stays deterministic. Promptless rows (agent imports, DSP derivations)
 *  sort after prompted ones in prompt mode. */
export function sortJobs(jobs: readonly MediaJob[], mode: SortMode): MediaJob[] {
  const byNewest = (a: MediaJob, b: MediaJob) => b.created_at - a.created_at

  const compare: Record<SortMode, (a: MediaJob, b: MediaJob) => number> = {
    model: (a, b) => a.model.localeCompare(b.model) || byNewest(a, b),
    newest: byNewest,
    oldest: (a, b) => a.created_at - b.created_at,
    prompt: (a, b) => {
      const pa = jobPrompt(a).trim().toLowerCase()
      const pb = jobPrompt(b).trim().toLowerCase()

      if (!pa || !pb) {
        return Number(!pa) - Number(!pb) || byNewest(a, b)
      }

      return pa.localeCompare(pb) || byNewest(a, b)
    }
  }

  return [...jobs].sort(compare[mode])
}

/** Clamp a custom batch-count field to the API's accepted range. */
export function clampCount(raw: string, max = 50): number {
  const parsed = Number.parseInt(raw, 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }

  return Math.min(parsed, max)
}

/** Create-form fields recoverable from a finished job (reuse settings). */
export interface ReuseState {
  provider: string
  modelId: string
  prompt: string
  negativePrompt: string
  aspectRatio: string
  resolution: string
  duration: string
  seed: string
  audio: boolean
  startImages: string[]
  lyrics: string
  genre: string
  mood: string
  bpm: string
  musicKey: string
  vocal: string
  instrumentation: string
  instrumental: boolean
  iterations: string
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')

/** Rebuild the create panel's state from a library row so one click restores
 *  prompt, model, every parameter, and the reference image(s). image_url may
 *  be a string or an array (multi-reference edits). Data-URI entries (no file
 *  on disk to re-attach) and craft-internal fields are dropped; everything
 *  else maps 1:1 onto CreateState. */
export function reuseStateFromJob(job: MediaJob): ReuseState {
  const p = job.params
  const rawImages = Array.isArray(p.image_url) ? p.image_url : [p.image_url]
  const images = rawImages.filter((v): v is string => typeof v === 'string' && v.startsWith('/'))

  return {
    provider: job.provider,
    modelId: job.model,
    prompt: jobPrompt(job),
    negativePrompt: asStr(p.negative_prompt),
    aspectRatio: asStr(p.aspect_ratio),
    resolution: asStr(p.resolution),
    duration: typeof p.duration === 'number' && Number.isFinite(p.duration) ? String(p.duration) : '',
    seed: asStr(p.seed),
    audio: p.audio !== false,
    startImages: images,
    lyrics: asStr(p.lyrics),
    genre: asStr(p.genre),
    mood: asStr(p.mood),
    bpm: asStr(p.bpm),
    musicKey: asStr(p.key),
    vocal: asStr(p.vocal),
    instrumentation: asStr(p.instrumentation),
    instrumental: p.mode === 'instrumental',
    iterations: typeof p.iterations === 'number' && Number.isFinite(p.iterations) ? String(p.iterations) : '2'
  }
}

/** The music create-form fields that feed the craft loop's brief. */
export interface MusicBrief {
  genre: string
  mood: string
  instrumentation: string
  vocal: string
  musicKey: string
  lyrics: string
  bpm: string
  instrumental: boolean
  iterations: string
}

/** Submit params for a music brief. Instrumental mode drops the vocal and
 *  lyrics fields entirely — sending them alongside `mode: 'instrumental'`
 *  hands the model contradictory directions. */
export function musicBriefParams(brief: MusicBrief): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  if (brief.genre.trim()) {params.genre = brief.genre.trim()}

  if (brief.mood.trim()) {params.mood = brief.mood.trim()}

  if (brief.instrumentation.trim()) {params.instrumentation = brief.instrumentation.trim()}

  if (brief.musicKey.trim()) {params.key = brief.musicKey.trim()}

  if (brief.bpm.trim()) {
    const bpm = Number(brief.bpm)

    if (Number.isFinite(bpm) && bpm > 0) {params.bpm = bpm}
  }

  if (brief.instrumental) {
    params.mode = 'instrumental'
  } else {
    if (brief.vocal.trim()) {params.vocal = brief.vocal.trim()}

    if (brief.lyrics.trim()) {params.lyrics = brief.lyrics.trim()}
  }

  const it = Number(brief.iterations)

  params.iterations = Number.isFinite(it) ? Math.max(1, Math.min(4, it)) : 2

  return params
}
