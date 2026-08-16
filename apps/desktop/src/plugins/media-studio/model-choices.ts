/**
 * Model-choice math for the create panel. The header's All/Image/Video
 * control is a page-wide mode, not just a library filter: on 'image' the
 * model dropdown offers only image models, on 'video' only video models.
 * Pure functions so the reconciliation is testable without mounting the page.
 */

import type { ModelInfo, ProviderInfo } from './api'

export type ModalityFilter = 'all' | 'image' | 'video' | 'audio'

/** Models a provider may offer under the active modality filter. */
export function visibleModels(models: ModelInfo[], filter: ModalityFilter): ModelInfo[] {
  if (filter === 'all') {
    return models
  }

  return models.filter(model => model.modality === filter)
}

export interface ModelSelection {
  provider: string
  modelId: string
}

/**
 * Reconcile the current provider/model selection against the filter.
 *
 * Keeps the selection when it's still offered. Otherwise prefers a sibling
 * model on the SAME provider, then hops to the first provider (available
 * first) that offers the modality. Returns null when nothing changed, so
 * callers can skip a state write.
 */
export function reconcileSelection(
  providers: ProviderInfo[],
  filter: ModalityFilter,
  current: ModelSelection
): ModelSelection | null {
  if (providers.length === 0) {
    return null
  }

  const currentProvider = providers.find(p => p.name === current.provider)
  const offered = currentProvider ? visibleModels(currentProvider.models, filter) : []

  if (offered.some(model => model.id === current.modelId)) {
    return null
  }

  if (offered.length > 0) {
    return { modelId: offered[0].id, provider: current.provider }
  }

  const ranked = [...providers.filter(p => p.available), ...providers.filter(p => !p.available)]

  for (const candidate of ranked) {
    const models = visibleModels(candidate.models, filter)

    if (models.length > 0) {
      return { modelId: models[0].id, provider: candidate.name }
    }
  }

  return null
}
