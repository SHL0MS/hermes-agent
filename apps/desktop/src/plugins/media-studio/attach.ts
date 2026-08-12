/**
 * Start-image attach plumbing: accepted types, per-model gating, and drag
 * payload parsing. Pure — the page wires it to DOM events.
 *
 * The internal drag MIME matches the app's composer
 * (application/x-hermes-paths), so library cards dragged onto the CHAT
 * composer attach there natively, and project-tree drags landing on the
 * studio parse the same way. Interop by convention, no core edit.
 */

import { type ModelInfo } from './api'

/** Mirrors the backend's _DATA_URI_MIME allow-list (providers.py). */
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const

export const ACCEPT_ATTR = IMAGE_EXTS.map(ext => `.${ext}`).join(',')

export const HERMES_PATHS_MIME = 'application/x-hermes-paths'

export function isAcceptedImagePath(path: string): boolean {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase() ?? ''

  return (IMAGE_EXTS as readonly string[]).includes(ext)
}

export function modelAcceptsImage(model: ModelInfo | null | undefined): boolean {
  return model?.supports?.image_url === true
}

/** Why a candidate file can't be the start image right now; null = fine. */
export function startImageIssue(
  model: ModelInfo | null | undefined,
  path: string
): 'model' | 'type' | null {
  if (!modelAcceptsImage(model)) {
    return 'model'
  }

  if (!isAcceptedImagePath(path)) {
    return 'type'
  }

  return null
}

interface DataTransferLike {
  getData: (type: string) => string
  files?: ArrayLike<File>
}

/** First usable path from a drop: in-app drags (internal MIME) win, then OS
 *  files via the preload path resolver. Returns null when nothing usable. */
export function droppedPath(
  transfer: DataTransferLike,
  getPathForFile: ((file: File) => string) | undefined
): null | string {
  try {
    const internal = transfer.getData(HERMES_PATHS_MIME)

    if (internal) {
      const parsed = JSON.parse(internal) as { path?: unknown }[]

      for (const entry of parsed) {
        if (entry && typeof entry.path === 'string' && entry.path) {
          return entry.path
        }
      }
    }
  } catch {
    // fall through to OS files
  }

  const files = transfer.files

  if (files && files.length > 0 && getPathForFile) {
    for (let index = 0; index < files.length; index++) {
      const path = getPathForFile(files[index])

      if (path) {
        return path
      }
    }
  }

  return null
}

/** Drag payload for a library card (internal MIME + plain-text fallback). */
export function cardDragPayload(path: string): Array<[string, string]> {
  return [
    [HERMES_PATHS_MIME, JSON.stringify([{ path }])],
    ['text/plain', path]
  ]
}

// Thumbnail size: bounded, persisted under the plugin storage namespace.
export const THUMB_MIN = 96
export const THUMB_MAX = 360
export const THUMB_DEFAULT = 176
const THUMB_KEY = 'hermes.plugin.media-studio.thumbSize'

export function clampThumb(value: number): number {
  if (!Number.isFinite(value)) {
    return THUMB_DEFAULT
  }

  return Math.min(THUMB_MAX, Math.max(THUMB_MIN, Math.round(value)))
}

export function loadThumbSize(): number {
  try {
    return clampThumb(Number(window.localStorage.getItem(THUMB_KEY) ?? THUMB_DEFAULT))
  } catch {
    return THUMB_DEFAULT
  }
}

export function saveThumbSize(value: number): void {
  try {
    window.localStorage.setItem(THUMB_KEY, String(clampThumb(value)))
  } catch {
    // storage unavailable — session-only sizing is fine
  }
}
