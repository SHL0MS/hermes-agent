/**
 * Contract: the Provider dropdown filters by active modality — Music shows
 * only providers that serve audio, so fal/Krea never appear there.
 */

import { describe, expect, it } from 'vitest'

import type { ModelInfo, ProviderInfo } from './api'
import { visibleModels } from './model-choices'

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

const providers = [
  provider('fal', [model('fal/img', 'image'), model('fal/vid', 'video')]),
  provider('krea', [model('krea/img', 'image')]),
  provider('minimax', [model('music-3.0', 'audio')])
]

/** Mirror of the page's providersForFilter memo. */
function providersForFilter(all: ProviderInfo[], filter: 'all' | 'image' | 'video' | 'audio') {
  return all.filter(p => visibleModels(p.models, filter).length > 0)
}

describe('provider dropdown scoping by modality', () => {
  it('Music lists only audio-capable providers', () => {
    expect(providersForFilter(providers, 'audio').map(p => p.name)).toEqual(['minimax'])
  })

  it('Image lists image-capable providers (not audio-only ones)', () => {
    expect(providersForFilter(providers, 'image').map(p => p.name)).toEqual(['fal', 'krea'])
  })

  it('All lists every provider', () => {
    expect(providersForFilter(providers, 'all')).toHaveLength(3)
  })
})
