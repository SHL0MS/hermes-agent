/**
 * MixBar — shown above the library whenever ≥1 audio card is multi-selected.
 * One action: submit those jobs to `audioMix` (backend beatmatches +
 * crossfades them into one continuous track, returns a new library row).
 */

import { Button, Codicon, GlyphSpinner, host } from '@hermes/plugin-sdk'
import { type FC, useState } from 'react'

import { audioMix, invalidateJobs, type MediaJob } from './api'
import {
  type AudioSelection,
  selectionToJobIds
} from './audio-select'
import { useStudio } from './i18n'

export const MixBar: FC<{
  jobs: MediaJob[]
  selection: AudioSelection
  onClear: () => void
}> = ({ jobs, onClear, selection }) => {
  const k = useStudio()
  const [bars, setBars] = useState('8')
  const [busy, setBusy] = useState(false)
  // Join order = the order the user picked the cards (not grid order); drop
  // ids whose jobs vanished (deleted rows).
  const known = new Set(jobs.map(j => j.id))
  const orderedIds = selectionToJobIds(selection).filter(id => known.has(id))

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border border-(--ui-stroke-primary) bg-violet-600/90 px-3 py-2 text-white">
      <Codicon name="checklist" size="0.875rem" />
      <span className="text-[0.75rem] font-medium">{k.mixBarForMix(selection.ids.size)}</span>
      <label className="ml-1 flex items-center gap-1 text-[0.6875rem]">
        {k.mixBarBars}
        <input
          aria-label="Bars per track"
          className="h-6 w-11 rounded bg-black/25 px-1.5 text-[0.75rem] text-white"
          inputMode="numeric"
          onChange={e => setBars(e.target.value.replace(/[^0-9]/g, ''))}
          value={bars}
        />
      </label>
      <Button
        className="ml-auto h-7 bg-white/95 text-violet-700 hover:bg-white"
        disabled={orderedIds.length < 2 || busy}
        onClick={async () => {
          setBusy(true)

          try {
            await audioMix(orderedIds, Number(bars) || 8)
            invalidateJobs()
            onClear()
            host.notify({ kind: 'success', message: k.mixBarSubmitted })
          } catch (err) {
            host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
          } finally {
            setBusy(false)
          }
        }}
        size="sm"
        title={orderedIds.length < 2 ? k.mixBarNeedTwo : undefined}
      >
        {busy ? <GlyphSpinner className="text-[0.875rem]" /> : k.mixBarMix}
      </Button>
      <Button
        className="h-7 text-white/90 hover:text-white"
        onClick={onClear}
        size="icon-sm"
        variant="ghost"
      >
        <Codicon name="close" />
      </Button>
    </div>
  )
}
