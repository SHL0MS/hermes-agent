/**
 * Media Studio api-layer contract: door binding, terminal-state math, and
 * the data-URL cache's failure eviction (a failed read must not poison the
 * cache for a later retry).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindApi, fetchJobs, isTerminal, mediaDataUrl, submitJob } from './api'

// The real preload bridge has ~95 members; tests swap in just the door under
// test, so route the assignment through unknown.
const bridgeWindow = window as unknown as {
  hermesDesktop?: { readFileDataUrl?: (path: string) => Promise<string> }
}

describe('media-studio api', () => {
  const originalBridge = bridgeWindow.hermesDesktop

  beforeEach(() => {
    bridgeWindow.hermesDesktop = undefined
  })

  afterEach(() => {
    bridgeWindow.hermesDesktop = originalBridge
  })

  it('rejects calls before the door is bound', async () => {
    await expect(fetchJobs()).rejects.toThrow('media-studio api not ready')
  })

  it('routes calls through the bound rest door and unbinds on dispose', async () => {
    const rest = vi.fn().mockResolvedValue({ jobs: [] })
    const socket = vi.fn().mockReturnValue(() => undefined)
    const dispose = bindApi(rest as never, socket as never)

    await fetchJobs()
    expect(rest).toHaveBeenCalledWith('/jobs?limit=400', undefined)

    await submitJob({ modality: 'image', model: 'm', params: { prompt: 'p' }, provider: 'fal' })
    expect(rest).toHaveBeenCalledWith('/jobs', {
      body: { modality: 'image', model: 'm', params: { prompt: 'p' }, provider: 'fal' },
      method: 'POST'
    })

    expect(socket).toHaveBeenCalledWith('/events', expect.any(Function))

    dispose()
    await expect(fetchJobs()).rejects.toThrow('media-studio api not ready')
  })

  it('classifies terminal states', () => {
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('expired')).toBe(true)
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('running')).toBe(false)
  })

  it('rejects media loads without the desktop bridge', async () => {
    await expect(mediaDataUrl('/tmp/x.png')).rejects.toThrow('desktop bridge unavailable')
  })

  it('caches media data URLs per path and evicts failed reads for retry', async () => {
    const readFileDataUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk hiccup'))
      .mockResolvedValue('data:image/png;base64,ok')

    bridgeWindow.hermesDesktop = { readFileDataUrl }

    await expect(mediaDataUrl('/tmp/retry.png')).rejects.toThrow('disk hiccup')
    // Failed promise was evicted — the retry hits the bridge again and caches.
    await expect(mediaDataUrl('/tmp/retry.png')).resolves.toBe('data:image/png;base64,ok')
    await expect(mediaDataUrl('/tmp/retry.png')).resolves.toBe('data:image/png;base64,ok')
    expect(readFileDataUrl).toHaveBeenCalledTimes(2)
  })
})
