import { describe, expect, it } from 'vitest'

import type { MediaJob } from './api'
import { clampCount, jobParamEntries, jobPrompt, musicBriefParams } from './job-params'

function job(params: Record<string, unknown>): MediaJob {
  return {
    id: 'j1',
    provider: 'fal',
    model: 'fal-ai/flux-2/klein/9b',
    modality: 'image',
    params,
    state: 'done',
    source: 'studio',
    result_paths: ['/tmp/x.png'],
    thumb_paths: [],
    created_at: 1_754_900_000
  }
}

describe('jobParamEntries', () => {
  it('orders and formats the known params, dropping unknowns', () => {
    const entries = jobParamEntries(
      job({
        prompt: 'a sphere',
        aspect_ratio: '16:9',
        resolution: '2K',
        duration: 8,
        seed: 42,
        internal_junk: { nested: true }
      })
    )

    expect(entries.map(e => e.key)).toEqual(['aspectRatio', 'resolution', 'duration', 'seed'])
    expect(entries.find(e => e.key === 'duration')).toMatchObject({ seconds: 8 })
    expect(entries.find(e => e.key === 'seed')).toMatchObject({ value: '42' })
  })

  it('only chips audio when it is off (non-default)', () => {
    expect(jobParamEntries(job({ audio: true }))).toHaveLength(0)
    expect(jobParamEntries(job({ audio: false }))).toMatchObject([{ key: 'audio', value: 'off' }])
  })

  it('truncates long negative prompts and names start images', () => {
    const entries = jobParamEntries(
      job({
        negative_prompt: 'x'.repeat(200),
        image_url: '/Users/s/.hermes/cache/images/studio_fal_seed.png'
      })
    )

    const negative = entries.find(e => e.key === 'negativePrompt')

    expect(negative?.value.length).toBeLessThanOrEqual(81)
    expect(negative?.value.endsWith('…')).toBe(true)
    expect(entries.find(e => e.key === 'startImage')?.value).toBe('studio_fal_seed.png')
  })

  it('labels data-URI start images without dumping the payload', () => {
    const entries = jobParamEntries(job({ image_url: `data:image/png;base64,${'A'.repeat(5000)}` }))

    expect(entries.find(e => e.key === 'startImage')?.value).toBe('image')
  })

  it('returns no entries for agent-imported rows with empty params', () => {
    expect(jobParamEntries(job({}))).toHaveLength(0)
    expect(jobPrompt(job({}))).toBe('')
  })
})

describe('clampCount', () => {
  it('clamps to [1, max] and defaults junk to 1', () => {
    expect(clampCount('8')).toBe(8)
    expect(clampCount('0')).toBe(1)
    expect(clampCount('-3')).toBe(1)
    expect(clampCount('')).toBe(1)
    expect(clampCount('junk')).toBe(1)
    expect(clampCount('999')).toBe(50)
    expect(clampCount('7', 4)).toBe(4)
  })
})

describe('musicBriefParams', () => {
  const brief = {
    genre: 'dark synthpop',
    mood: 'bittersweet',
    instrumentation: 'analog pads, 808 kick',
    vocal: 'breathy female alto',
    musicKey: 'C minor',
    lyrics: '[Verse]\nrain on glass',
    bpm: '118',
    instrumental: false,
    iterations: '2'
  }

  it('forwards the full brief with vocals on', () => {
    expect(musicBriefParams(brief)).toEqual({
      genre: 'dark synthpop',
      mood: 'bittersweet',
      instrumentation: 'analog pads, 808 kick',
      vocal: 'breathy female alto',
      key: 'C minor',
      lyrics: '[Verse]\nrain on glass',
      bpm: 118,
      iterations: 2
    })
  })

  it('drops vocal and lyrics entirely in instrumental mode', () => {
    const params = musicBriefParams({ ...brief, instrumental: true })

    expect(params.mode).toBe('instrumental')
    expect(params).not.toHaveProperty('vocal')
    expect(params).not.toHaveProperty('lyrics')
    // The rest of the brief still flows.
    expect(params.genre).toBe('dark synthpop')
    expect(params.bpm).toBe(118)
  })

  it('omits blank fields and clamps takes into [1, 4] with a default of 2', () => {
    const params = musicBriefParams({
      ...brief,
      bpm: '',
      genre: '  ',
      iterations: 'junk',
      lyrics: '',
      mood: '',
      vocal: ''
    })

    expect(params).toEqual({ instrumentation: 'analog pads, 808 kick', key: 'C minor', iterations: 2 })
    expect(musicBriefParams({ ...brief, iterations: '9' }).iterations).toBe(4)
    expect(musicBriefParams({ ...brief, iterations: '0' }).iterations).toBe(1)
  })
})
