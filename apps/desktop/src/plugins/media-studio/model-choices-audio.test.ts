/**
 * Contract: on the Music filter, a provider with no audio models leaves the
 * dropdown empty and reconcileSelection prefers the audio-capable provider;
 * the panel must not inherit the stale model's supports (the aspect-ratio
 * row leaking onto Music was the failure this guards).
 */

import { describe, expect, it } from 'vitest'

import type { ModelInfo, ProviderInfo } from './api'
import { reconcileSelection, visibleModels } from './model-choices'

const model = (id: string, modality: 'image' | 'video' | 'audio'): ModelInfo => ({
  display: id,
  id,
  modality,
  supports: {},
  tier: 'launch'
})

const provider = (name: string, models: ModelInfo[]): ProviderInfo => ({
  available: true,
  display: name,
  hint: '',
  models,
  name
})

const fal = provider('fal', [model('fal/img-a', 'image'), model('fal/vid-a', 'video')])
const minimax = provider('minimax', [model('music-3.0', 'audio')])

describe('audio modality filter', () => {
  it('strips non-audio models on audio', () => {
    expect(visibleModels(fal.models, 'audio')).toHaveLength(0)
    expect(visibleModels(minimax.models, 'audio').map(m => m.id)).toEqual(['music-3.0'])
  })

  it('hops from an image-only provider to the audio one', () => {
    expect(
      reconcileSelection([fal, minimax], 'audio', { modelId: 'fal/img-a', provider: 'fal' })
    ).toEqual({ modelId: 'music-3.0', provider: 'minimax' })
  })

  it('returns null when no provider serves audio (panel zeros supports)', () => {
    expect(reconcileSelection([fal], 'audio', { modelId: 'fal/img-a', provider: 'fal' })).toBeNull()
  })
})
