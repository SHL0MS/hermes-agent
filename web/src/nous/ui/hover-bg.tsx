/**
 * HoverBg from @nous/design-language
 * Source: NousResearch/design-language/src/ui/components/hover-bg.tsx
 */

import { createElement } from 'react'

import { cn, polyRef } from '../utils'

export const HoverBg = polyRef<'span'>(({ as, className, ...rest }, ref) =>
  createElement((as ?? 'span') as React.ElementType, {
    ...rest,
    className: cn(
      'absolute inset-1 bg-midground pointer-events-none',
      'opacity-0 transition-opacity duration-250 group-hover:opacity-5 group-hover:duration-0',
      className
    ),
    ref,
  })
)
