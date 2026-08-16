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

  return out
}

/** The prompt for display; empty string when absent (agent-imported rows). */
export function jobPrompt(job: MediaJob): string {
  const prompt = job.params.prompt

  return typeof prompt === 'string' ? prompt : ''
}

/** Clamp a custom batch-count field to the API's accepted range. */
export function clampCount(raw: string, max = 50): number {
  const parsed = Number.parseInt(raw, 10)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1
  }

  return Math.min(parsed, max)
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
