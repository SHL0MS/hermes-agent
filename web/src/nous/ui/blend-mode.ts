/**
 * Static BlendMode color computation from @nous/design-language.
 *
 * The canonical BlendMode reads live colors from nanostores atoms.
 * This static version computes blended colors against a known palette,
 * suitable for use in style props or CSS custom properties.
 *
 * Source: NousResearch/design-language/src/ui/components/blend-mode.tsx
 */

import { colorDodge, colorMix } from '../utils/color'
import { LENS_DARK, type LensConfig } from '../lens'

type Layer = 'bg' | 'mg' | 'fg'
type LayerSpec = `${Layer}/${number}` | Layer

const LAYER_KEYS: Record<Layer, keyof LensConfig> = {
  bg: 'bgColor',
  mg: 'mgColor',
  fg: 'fgColor',
}

function parseSpec(spec: LayerSpec): [Layer, number?] {
  const [layer, alpha] = spec.split('/') as [Layer, string?]
  return [layer, alpha ? parseFloat(alpha) : undefined]
}

/**
 * Compute a blended color for a given layer spec against a background layer.
 *
 * Examples:
 *   blendColor('mg')        → colorDodge(bgColor, mgColor)
 *   blendColor('mg/0.075')  → colorDodge(bgColor, mgColor) at 7.5% opacity
 *   blendColor('fg')        → colorDodge(bgColor, fgColor)
 */
export function blendColor(
  spec: LayerSpec,
  against: Layer = 'bg',
  lens: LensConfig = LENS_DARK,
): string {
  const [target, alpha] = parseSpec(spec)

  const againstColor = lens[LAYER_KEYS[against]]
  const targetColor = lens[LAYER_KEYS[target]]

  const result = colorDodge(againstColor as string, targetColor as string)

  return alpha != null ? colorMix(result, alpha) : result
}

/**
 * Get background + color for a component using the blend system.
 * Mirrors the useBlendMode hook from design-language.
 */
export function getBlendStyles(
  opts: { background?: LayerSpec; color?: LayerSpec; against?: Layer },
  lens: LensConfig = LENS_DARK,
): React.CSSProperties {
  const { against = 'bg', background, color } = opts
  return {
    ...(background ? { backgroundColor: blendColor(background, against, lens) } : {}),
    ...(color ? { color: blendColor(color, against, lens) } : {}),
  }
}
