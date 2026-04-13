/**
 * Lightweight utilities from @nous/design-language
 * Excludes hexToVec3 (requires three.js) and stripWpStyles (requires sanitize-html)
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export { polyRef } from './poly'
export type { PolyComponent, PolyProps, PolyRef } from './poly'
export { hexToRgb, rgbToHex, colorDodge, colorMix } from './color'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const clamp = (v: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min))
