/**
 * Vendored lightweight components from @nous/design-language
 *
 * Excludes heavy dependencies: three.js, gsap, leva, nanostores,
 * @react-three/fiber, @observablehq/plot, next-view-transitions
 *
 * The Lens system is replaced with a static version that applies
 * color presets directly to CSS custom properties.
 */

// Utils
export { cn, clamp, polyRef, hexToRgb, rgbToHex, colorDodge, colorMix } from './utils'
export type { PolyProps, PolyRef, PolyComponent } from './utils'

// Lens (static)
export { LENS_DARK, LENS_LIGHT, applyLens } from './lens'
export type { LensConfig } from './lens'

// BlendMode (static)
export { blendColor, getBlendStyles } from './ui/blend-mode'

// Components
export { Grid, Cell } from './ui/grid'
export { Typography, H2, Small } from './ui/typography'
export type { TypographyProps } from './ui/typography'
export { HoverBg } from './ui/hover-bg'
// Blink is vendored but not re-exported — doesn't fit dense dashboard nav.
// Available via direct import: import { Blink } from '@/nous/ui/blink'
