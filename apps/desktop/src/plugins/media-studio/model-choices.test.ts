/**
 * Contract: the Image/Video mode gates the model dropdown — image models
 * never surface under 'video' and vice versa — and a filtered-out selection
 * hops to the same provider's sibling first, then to a provider that serves
 * the modality, preferring available ones. No-op reconciliations return null
 * so the panel never enters a setState loop.
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

const provider = (name: string, available: boolean, models: ModelInfo[]): ProviderInfo => ({
  available,
  display: name,
  hint: '',
  models,
  name
})

const fal = provider('fal', true, [
  model('fal/image-a', 'image'),
  model('fal/image-b', 'image'),
  model('fal/video-a', 'video')
])

const krea = provider('krea', false, [model('krea/image-a', 'image'), model('krea/video-a', 'video')])
const videoOnly = provider('veo', true, [model('veo/video-a', 'video')])

describe('visibleModels', () => {
  it('passes everything through on all', () => {
    expect(visibleModels(fal.models, 'all')).toHaveLength(3)
  })

  it('strips the other modality on image and video', () => {
    expect(visibleModels(fal.models, 'image').map(m => m.id)).toEqual(['fal/image-a', 'fal/image-b'])
    expect(visibleModels(fal.models, 'video').map(m => m.id)).toEqual(['fal/video-a'])
  })

  it('never offers hidden (action-launched) models, on any filter', () => {
    const withHidden = [...fal.models, { ...model('fal/cover', 'audio'), hidden: true }]

    expect(visibleModels(withHidden, 'all').map(m => m.id)).not.toContain('fal/cover')
    expect(visibleModels(withHidden, 'audio')).toHaveLength(0)
  })
})

describe('reconcileSelection', () => {
  it('keeps a selection the filter still offers', () => {
    expect(
      reconcileSelection([fal, krea], 'image', { modelId: 'fal/image-b', provider: 'fal' })
    ).toBeNull()
    expect(reconcileSelection([fal, krea], 'all', { modelId: 'fal/video-a', provider: 'fal' })).toBeNull()
  })

  it('hops to a sibling on the same provider first', () => {
    expect(reconcileSelection([fal, krea], 'video', { modelId: 'fal/image-a', provider: 'fal' })).toEqual({
      modelId: 'fal/video-a',
      provider: 'fal'
    })
  })

  it('hops providers when the current one lacks the modality, preferring available', () => {
    const imageOnly = provider('img', false, [model('img/a', 'image')])

    expect(
      reconcileSelection([imageOnly, krea, videoOnly], 'video', { modelId: 'img/a', provider: 'img' })
    ).toEqual({ modelId: 'veo/video-a', provider: 'veo' })
  })

  it('falls back to an unavailable provider rather than stranding the picker', () => {
    const imageOnly = provider('img', true, [model('img/a', 'image')])

    expect(reconcileSelection([imageOnly, krea], 'video', { modelId: 'img/a', provider: 'img' })).toEqual({
      modelId: 'krea/video-a',
      provider: 'krea'
    })
  })

  it('returns null when no provider serves the modality (nothing sane to move to)', () => {
    const imageOnly = provider('img', true, [model('img/a', 'image')])

    expect(reconcileSelection([imageOnly], 'video', { modelId: 'img/a', provider: 'img' })).toBeNull()
    expect(reconcileSelection([], 'video', { modelId: 'x', provider: 'y' })).toBeNull()
  })
})
