import { describe, expect, it } from 'vitest'

import { type ModelInfo } from './api'
import {
  ACCEPT_ATTR,
  cardDragPayload,
  clampThumb,
  droppedPath,
  HERMES_PATHS_MIME,
  isAcceptedImagePath,
  startImageIssue,
  THUMB_DEFAULT,
  THUMB_MAX,
  THUMB_MIN
} from './attach'

const model = (supports: Record<string, boolean>): ModelInfo => ({
  display: 'M',
  id: 'm',
  modality: 'image',
  supports,
  tier: 'fast'
})

describe('start-image gating', () => {
  it('accepts only backend-supported image extensions', () => {
    expect(isAcceptedImagePath('/a/b.png')).toBe(true)
    expect(isAcceptedImagePath('/a/b.JPEG')).toBe(true)
    expect(isAcceptedImagePath('/a/b.webp')).toBe(true)
    expect(isAcceptedImagePath('/a/clip.mp4')).toBe(false)
    expect(isAcceptedImagePath('/a/doc.pdf')).toBe(false)
    expect(ACCEPT_ATTR).toContain('.png')
  })

  it('reports the model issue before the type issue', () => {
    expect(startImageIssue(model({}), '/x.png')).toBe('model')
    expect(startImageIssue(model({ image_url: true }), '/x.pdf')).toBe('type')
    expect(startImageIssue(model({ image_url: true }), '/x.png')).toBeNull()
    expect(startImageIssue(null, '/x.png')).toBe('model')
  })
})

describe('droppedPath', () => {
  it('prefers the internal MIME payload over OS files', () => {
    const transfer = {
      files: [new File([''], 'os.png')],
      getData: (type: string) =>
        type === HERMES_PATHS_MIME ? JSON.stringify([{ path: '/internal.png' }]) : ''
    }

    expect(droppedPath(transfer, () => '/os.png')).toBe('/internal.png')
  })

  it('falls back to OS files through the path resolver', () => {
    const transfer = { files: [new File([''], 'shot.png')], getData: () => '' }

    expect(droppedPath(transfer, () => '/Users/s/shot.png')).toBe('/Users/s/shot.png')
    // No resolver (non-Electron) -> null, never a fake path.
    expect(droppedPath(transfer, undefined)).toBeNull()
  })

  it('survives malformed internal payloads', () => {
    const transfer = { files: [], getData: () => '{not json' }

    expect(droppedPath(transfer, undefined)).toBeNull()
  })
})

describe('card drag payload', () => {
  it('round-trips through droppedPath', () => {
    const payload = new Map(cardDragPayload('/lib/item.png'))
    const transfer = { files: [], getData: (type: string) => payload.get(type) ?? '' }

    expect(droppedPath(transfer, undefined)).toBe('/lib/item.png')
  })
})

describe('thumb size', () => {
  it('clamps to bounds and defaults on garbage', () => {
    expect(clampThumb(10)).toBe(THUMB_MIN)
    expect(clampThumb(10_000)).toBe(THUMB_MAX)
    expect(clampThumb(Number.NaN)).toBe(THUMB_DEFAULT)
    expect(clampThumb(200)).toBe(200)
  })
})
