/**
 * Multi-select helper for the library's mix workflow. Selection is a Set of
 * job ids with an order list (mix plays in join order, so order matters).
 * Pure functions so the panel logic is testable without mounting the page.
 */

export interface AudioSelection {
  ids: Set<string>
  order: string[]
}

export const EMPTY_SELECTION: AudioSelection = { ids: new Set(), order: [] }

export function toggleInSelection(sel: AudioSelection, jobId: string): AudioSelection {
  const ids = new Set(sel.ids)
  const order = sel.order.filter(id => id !== jobId)

  if (ids.has(jobId)) {
    ids.delete(jobId)

    return { ids, order }
  }

  ids.add(jobId)

  return { ids, order: [...order, jobId] }
}

export function addToSelection(sel: AudioSelection, jobId: string): AudioSelection {
  if (sel.ids.has(jobId)) {
    return sel
  }

  const ids = new Set(sel.ids)
  ids.add(jobId)

  return { ids, order: [...sel.order, jobId] }
}

export function removeFromSelection(sel: AudioSelection, jobId: string): AudioSelection {
  if (!sel.ids.has(jobId)) {
    return sel
  }

  const ids = new Set(sel.ids)
  ids.delete(jobId)

  return { ids, order: sel.order.filter(id => id !== jobId) }
}

export function clearSelection(_sel: AudioSelection): AudioSelection {
  return EMPTY_SELECTION
}

/** Job ids in the order the user picked them (mix join order). */
export function selectionToJobIds(sel: AudioSelection): string[] {
  return sel.order.filter(id => sel.ids.has(id))
}
