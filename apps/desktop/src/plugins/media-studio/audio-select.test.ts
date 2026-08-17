/**
 * Multi-select helper for the library's mix workflow. Selection is a Set of
 * job ids with an order list (mix plays in join order, so order matters).
 * Pure functions so the panel logic is testable without mounting the page.
 */

import { describe, expect, it } from 'vitest'

import {
  addToSelection,
  clearSelection,
  removeFromSelection,
  selectionToJobIds,
  toggleInSelection
} from './audio-select'

describe('audio multi-select for mix', () => {
  it('toggles ids in and out', () => {
    let s = toggleInSelection({ ids: new Set(), order: [] }, 'a')
    expect(s.ids.has('a')).toBe(true)
    expect(s.order).toEqual(['a'])
    s = toggleInSelection(s, 'b')
    expect([...s.ids]).toEqual(['a', 'b'])
    s = toggleInSelection(s, 'a')
    expect(s.ids.has('a')).toBe(false)
    expect(s.order).toEqual(['b'])
  })

  it('explicit add/remove keeps order', () => {
    let s = addToSelection({ ids: new Set(), order: [] }, 'x')
    s = addToSelection(s, 'y')
    s = removeFromSelection(s, 'x')
    expect(s.order).toEqual(['y'])
    expect(selectionToJobIds(s)).toEqual(['y'])
  })

  it('clearSelection empties everything', () => {
    const s = clearSelection({ ids: new Set(['a', 'b']), order: ['a', 'b'] })
    expect(s.ids.size).toBe(0)
    expect(s.order).toEqual([])
  })
})
