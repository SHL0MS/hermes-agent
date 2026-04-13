/**
 * Static Lens system — applies @nous/design-language color presets
 * without nanostores/leva/gsap dependencies.
 *
 * The canonical Lens system uses nanostores atoms + useSmoothControls
 * to animate between presets. This static version applies presets
 * directly to CSS custom properties on <html>.
 *
 * Presets from: NousResearch/design-language/src/ui/components/overlays/index.tsx
 */

import { colorMix } from './utils/color'

export interface LensConfig {
  bgColor: string
  bgOpacity: number
  mgColor: string
  mgOpacity: number
  fgColor: string
  fgOpacity: number
}

/** Dark mode — LENS_0 from design-language */
export const LENS_DARK: LensConfig = {
  bgColor: '#041C1C',
  bgOpacity: 1,
  mgColor: '#ffe6cb',
  mgOpacity: 1,
  fgColor: '#FFFFFF',
  fgOpacity: 0,
}

/** Light mode — LENS_5I from design-language */
export const LENS_LIGHT: LensConfig = {
  bgColor: '#170d02',
  bgOpacity: 1,
  mgColor: '#FFAC02',
  mgOpacity: 1,
  fgColor: '#FFFFFF',
  fgOpacity: 1,
}

/**
 * Apply a lens preset by setting CSS custom properties on <html>.
 * These are the same vars that design-language's globals.css reads:
 *   --background, --background-base, --background-alpha
 *   --midground, --midground-base, --midground-alpha
 *   --foreground, --foreground-base, --foreground-alpha
 */
export function applyLens(config: LensConfig) {
  const s = document.documentElement.style

  for (const [name, color, alpha] of [
    ['foreground', config.fgColor, config.fgOpacity],
    ['midground', config.mgColor, config.mgOpacity],
    ['background', config.bgColor, config.bgOpacity],
  ] as [string, string, number][]) {
    s.setProperty(`--${name}`, colorMix(color, alpha))
    s.setProperty(`--${name}-base`, color)
    s.setProperty(`--${name}-alpha`, `${alpha}`)
  }
}
