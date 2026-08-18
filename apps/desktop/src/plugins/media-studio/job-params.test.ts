import { describe, expect, it } from 'vitest'

import type { MediaJob } from './api'
import { clampCount, jobParamEntries, jobPrompt, musicBriefParams, reuseStateFromJob, sortJobs } from './job-params'

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

  it('chips the music brief (genre/mood/bpm/key/vocal/instruments/takes) and mm:ss length', () => {
    const entries = jobParamEntries(
      job({
        bpm: 118,
        duration_s: 129.4,
        genre: 'dark synthpop',
        instrumentation: 'analog pads',
        iterations: 2,
        key: 'C minor',
        lyrics: '[Verse]\nnever a chip',
        mood: 'bittersweet',
        prompt: 'a song',
        vocal: 'alto'
      })
    )

    const byKey = Object.fromEntries(entries.map(e => [e.key, e.value]))

    expect(byKey.musicGenre).toBe('dark synthpop')
    expect(byKey.musicBpm).toBe('118')
    expect(byKey.musicKeySig).toBe('C minor')
    expect(byKey.musicVocal).toBe('alto')
    expect(byKey.musicTakes).toBe('2')
    expect(byKey.duration).toBe('2:09')
    // Lyrics are long text, never a chip.
    expect(entries.some(e => e.value.includes('never a chip'))).toBe(false)
  })

  it('skips takes chip at 1 and duration chip when an explicit duration param exists', () => {
    expect(jobParamEntries(job({ iterations: 1 })).some(e => e.key === 'musicTakes')).toBe(false)

    const entries = jobParamEntries(job({ duration: 8, duration_s: 8.2 }))

    expect(entries.filter(e => e.key === 'duration')).toHaveLength(1)
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

describe('reuseStateFromJob', () => {
  it('restores model, prompt, params, and a local reference image', () => {
    const state = reuseStateFromJob(
      job({
        prompt: 'flying robots assembling a tower',
        negative_prompt: 'blurry',
        aspect_ratio: '16:9',
        resolution: '1080p',
        duration: 8,
        seed: 42,
        audio: false,
        image_url: '/Users/x/pic.png'
      })
    )

    expect(state).toMatchObject({
      provider: 'fal',
      modelId: 'fal-ai/flux-2/klein/9b',
      prompt: 'flying robots assembling a tower',
      negativePrompt: 'blurry',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: '8',
      seed: '42',
      audio: false,
      startImage: '/Users/x/pic.png'
    })
  })

  it('drops data-URI reference images (no file to re-attach) and defaults cleanly', () => {
    const state = reuseStateFromJob(job({ prompt: 'p', image_url: 'data:image/png;base64,xxx' }))

    expect(state.startImage).toBe('')
    expect(state.audio).toBe(true)
    expect(state.seed).toBe('')
    expect(state.instrumental).toBe(false)
    expect(state.iterations).toBe('2')
  })

  it('recovers the music brief including instrumental mode', () => {
    const state = reuseStateFromJob(
      job({
        genre: 'dark synthpop',
        mood: 'brooding',
        bpm: 118,
        key: 'C minor',
        instrumentation: 'analog pads',
        mode: 'instrumental',
        iterations: 3
      })
    )

    expect(state).toMatchObject({
      genre: 'dark synthpop',
      mood: 'brooding',
      bpm: '118',
      musicKey: 'C minor',
      instrumentation: 'analog pads',
      instrumental: true,
      iterations: '3',
      lyrics: '',
      vocal: ''
    })
  })
})

describe('sortJobs', () => {
  const mk = (id: string, created: number, prompt: string, model = 'fal-ai/x'): MediaJob => ({
    ...job({ prompt }),
    id,
    created_at: created,
    model
  })

  const rows = [
    mk('a', 100, 'zebra'),
    mk('b', 300, 'apple'),
    mk('c', 200, '', 'bytedance/z'),
    mk('d', 400, 'apple', 'alibaba/a')
  ]

  it('never mutates the input and defaults stay newest-first', () => {
    const input = [...rows]

    expect(sortJobs(input, 'newest').map(j => j.id)).toEqual(['d', 'b', 'c', 'a'])
    expect(input.map(j => j.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('oldest inverts newest', () => {
    expect(sortJobs(rows, 'oldest').map(j => j.id)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('prompt groups alphabetically, promptless rows last, ties newest-first', () => {
    expect(sortJobs(rows, 'prompt').map(j => j.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('model sorts by model id with newest-first ties', () => {
    expect(sortJobs(rows, 'model').map(j => j.id)).toEqual(['d', 'c', 'b', 'a'])
  })
})
