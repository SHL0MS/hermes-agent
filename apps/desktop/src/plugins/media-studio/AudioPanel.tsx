/**
 * AudioPanel — the editing & mastering deck for one audio library job.
 * Everything here is local DSP through hermes-music-craft routes (free; no
 * provider credits): sections analysis, seamless loop export, hook export,
 * non-destructive edits (crop/fade/speed/reverse), platform loudness master,
 * and clip mix-down. The panel opens under the create form from an audio
 * card's "Edit" action (or the lightbox).
 *
 * No native dialogs: window.prompt/alert/confirm throw in Electron renderers,
 * so the crop/fade/speed parameters are inline mini-forms.
 */

import {
  Button,
  Codicon,
  GlyphSpinner,
  host,
  useMutation
} from '@hermes/plugin-sdk'
import { type FC, useEffect, useState } from 'react'

import {
  audioEdit,
  audioHook,
  audioLoop,
  audioMaster,
  audioStructure,
  invalidateJobs,
  type MediaJob
} from './api'
import { useStudio } from './i18n'
import { jobPrompt } from './job-params'

type BusyKey = 'structure' | 'loop' | 'hook' | 'edit' | 'master' | null
type EditOp = 'crop' | 'fade' | 'speed' | 'reverse'

const MASTER_PRESETS = [
  { id: 'spotify', label: 'Spotify (-14 LUFS)' },
  { id: 'apple', label: 'Apple (-16)' },
  { id: 'club', label: 'Club (-8, hot)' },
  { id: 'broadcast', label: 'Broadcast (-23)' }
] as const

export const AudioPanel: FC<{
  job: MediaJob
  onClose: () => void
}> = ({ job, onClose }) => {
  const k = useStudio()
  const [busy, setBusy] = useState<BusyKey>(null)
  const [bars, setBars] = useState('8')
  const [hookSeconds, setHookSeconds] = useState('30')
  const [preset, setPreset] = useState<string>('spotify')
  // Inline edit-op params (native prompt dialogs don't exist in Electron).
  const [activeOp, setActiveOp] = useState<Exclude<EditOp, 'reverse'> | null>(null)
  const [cropStart, setCropStart] = useState('0')
  const [cropEnd, setCropEnd] = useState('')
  const [fadeIn, setFadeIn] = useState('0.25')
  const [fadeOut, setFadeOut] = useState('0.5')
  const [speedFactor, setSpeedFactor] = useState('1.25')

  const [structure, setStructure] = useState<{
    bpm?: number
    duration?: number
    downbeats?: number[]
    sections?: Array<{ index: number; start_s: number; end_s: number }>
  } | null>(null)

  // Reset per-job analysis whenever the card changes — carrying the previous
  // track's structure/results into a new job was confusing.
  useEffect(() => {
    setStructure(null)
    setBusy(null)
    setActiveOp(null)
    setCropStart('0')
    setCropEnd('')
  }, [job.id])

  // Escape closes the deck (unless typing in one of its fields).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const target = event.target as HTMLElement | null

      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
        return
      }

      onClose()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = useMutation({
    mutationFn: async (kind: Exclude<BusyKey, null | 'edit'>) => {
      if (kind === 'structure') {
        return audioStructure(job.id)
      }

      if (kind === 'loop') {
        return audioLoop(job.id, Number(bars) || 8)
      }

      if (kind === 'hook') {
        return audioHook(job.id, Number(hookSeconds) || 30)
      }

      return audioMaster(job.id, preset, true)
    },
    onError: (err: unknown) => {
      setBusy(null)
      host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    },
    onMutate: kind => setBusy(kind as BusyKey),
    onSuccess: (result, kind) => {
      setBusy(null)

      if (kind === 'structure') {
        const report = result as typeof structure

        setStructure(report)

        // Analysis feeds the crop form a real end bound.
        if (report?.duration && !cropEnd) {
          setCropEnd(report.duration.toFixed(1))
        }
      } else {
        invalidateJobs()

        const out = typeof result === 'object' && result && 'out' in result ? String((result as { out?: unknown }).out ?? '') : ''

        host.notify({ kind: 'success', message: out ? k.audioSaved(out.split('/').pop() ?? '') : k.audioDone })
      }
    }
  })

  const editOp = useMutation({
    mutationFn: ([op, opts]: [EditOp, Parameters<typeof audioEdit>[2]]) => audioEdit(job.id, op, opts),
    onError: (err: unknown) => {
      setBusy(null)
      host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    },
    onMutate: () => setBusy('edit'),
    onSuccess: () => {
      setBusy(null)
      invalidateJobs()
      host.notify({ kind: 'success', message: k.audioEditSaved })
    }
  })

  const applyActiveOp = () => {
    if (activeOp === 'crop') {
      const start = Number(cropStart) || 0
      const end = Number(cropEnd)

      if (!Number.isFinite(end) || end <= start) {
        host.notify({ kind: 'warning', message: k.audioCropInvalid })

        return
      }

      editOp.mutate(['crop', { end_s: end, start_s: start }])

      return
    }

    if (activeOp === 'fade') {
      const i = Number(fadeIn) || 0
      const o = Number(fadeOut) || 0

      if (i <= 0 && o <= 0) {
        return
      }

      editOp.mutate(['fade', { fade_in: i, fade_out: o }])

      return
    }

    if (activeOp === 'speed') {
      const f = Number(speedFactor)

      if (!Number.isFinite(f) || f <= 0) {
        host.notify({ kind: 'warning', message: k.audioSpeedInvalid })

        return
      }

      editOp.mutate(['speed', { factor: f }])
    }
  }

  const title = jobPrompt(job) || job.model || job.id
  const subtitle = [`${k.audioJob} ${job.id}`, job.model, k.audioFreeLocal].filter(Boolean).join(' · ')

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-(--ui-stroke-secondary) p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[0.8125rem] font-medium">{k.audioEdit} — {title.slice(0, 50)}</h2>
          <p className="text-[0.625rem] text-(--ui-text-quaternary)">{subtitle}</p>
        </div>
        <Button onClick={onClose} size="icon-sm" variant="ghost">
          <Codicon name="close" />
        </Button>
      </div>

      {/* structure analysis strip */}
      <div className="flex items-center gap-2 rounded-md bg-(--ui-bg-tertiary) p-2">
        <Button disabled={busy !== null} onClick={() => run.mutate('structure')} size="sm" variant="outline">
          {busy === 'structure' ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioAnalyze}
        </Button>
        {structure && (
          <div className="grid grid-cols-3 gap-4 text-[0.6875rem] text-(--ui-text-tertiary)">
            <div><span className="text-(--ui-text-quaternary)">{k.audioTempo}</span><br />{structure.bpm ?? '?'} BPM</div>
            <div><span className="text-(--ui-text-quaternary)">{k.audioLength}</span><br />{structure.duration ? `${structure.duration.toFixed(1)}s` : '?'}</div>
            <div><span className="text-(--ui-text-quaternary)">{k.audioSectionsCount}</span><br />{structure.sections?.length ?? 0}</div>
          </div>
        )}
      </div>
      {structure && (structure.sections?.length ?? 0) > 0 && structure.duration && (
        <div className="flex h-5 w-full overflow-hidden rounded">
          {structure.sections!.map((s, i) => {
            const pct = ((s.end_s - s.start_s) / structure.duration!) * 100

            return (
              <div
                className="flex h-full items-center justify-center overflow-hidden bg-violet-500/25 text-[0.55rem] text-violet-200"
                key={i}
                style={{ borderRight: '1px solid rgba(0,0,0,0.4)', width: `${Math.max(3, pct)}%` }}
                title={`${s.start_s.toFixed(1)}s – ${s.end_s.toFixed(1)}s`}
              >
                {pct > 5 ? i + 1 : ''}
              </div>
            )
          })}
        </div>
      )}

      {/* loop / hook export */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-end gap-1.5 rounded-md border border-(--ui-stroke-secondary) p-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.audioLoopBars}
            <input
              className="h-7 w-full rounded bg-(--ui-bg-secondary) px-2 text-[0.75rem]"
              inputMode="numeric"
              onChange={e => setBars(e.target.value.replace(/[^0-9]/g, ''))}
              value={bars}
            />
          </label>
          <Button disabled={busy !== null} onClick={() => run.mutate('loop')} size="sm">
            {busy === 'loop' ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioExportLoop}
          </Button>
        </div>
        <div className="flex items-end gap-1.5 rounded-md border border-(--ui-stroke-secondary) p-2">
          <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.audioHookSeconds}
            <input
              className="h-7 w-full rounded bg-(--ui-bg-secondary) px-2 text-[0.75rem]"
              inputMode="numeric"
              onChange={e => setHookSeconds(e.target.value.replace(/[^0-9.]/g, ''))}
              value={hookSeconds}
            />
          </label>
          <Button disabled={busy !== null} onClick={() => run.mutate('hook')} size="sm">
            {busy === 'hook' ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioExportHook}
          </Button>
        </div>
      </div>

      {/* master */}
      <div className="flex items-end gap-2 rounded-md border border-(--ui-stroke-secondary) p-2">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
          {k.audioMasterPreset}
          <select
            className="h-7 rounded bg-(--ui-bg-secondary) px-2 text-[0.75rem]"
            onChange={e => setPreset(e.target.value)}
            value={preset}
          >
            {MASTER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <Button disabled={busy !== null} onClick={() => run.mutate('master')} size="sm">
          {busy === 'master' ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioSmartMaster}
        </Button>
      </div>

      {/* non-destructive edits — inline params, no native dialogs */}
      <div className="flex flex-col gap-2 rounded-md border border-(--ui-stroke-secondary) p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <OpChip
            active={activeOp === 'crop'}
            disabled={busy !== null}
            label={k.audioEditCrop}
            onClick={() => setActiveOp(op => (op === 'crop' ? null : 'crop'))}
          />
          <OpChip
            active={activeOp === 'fade'}
            disabled={busy !== null}
            label={k.audioEditFade}
            onClick={() => setActiveOp(op => (op === 'fade' ? null : 'fade'))}
          />
          <OpChip
            active={activeOp === 'speed'}
            disabled={busy !== null}
            label={k.audioEditSpeed}
            onClick={() => setActiveOp(op => (op === 'speed' ? null : 'speed'))}
          />
          <Button
            disabled={busy !== null}
            onClick={() => editOp.mutate(['reverse', {}])}
            size="sm"
            variant="outline"
          >
            {busy === 'edit' && !activeOp ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioEditReverse}
          </Button>
        </div>

        {activeOp && (
          <div className="flex flex-wrap items-end gap-1.5">
            {activeOp === 'crop' && (
              <>
                <NumField label={k.audioStartS} onChange={setCropStart} value={cropStart} />
                <NumField label={k.audioEndS} onChange={setCropEnd} placeholder={structure?.duration ? structure.duration.toFixed(1) : ''} value={cropEnd} />
              </>
            )}
            {activeOp === 'fade' && (
              <>
                <NumField label={k.audioFadeInS} onChange={setFadeIn} value={fadeIn} />
                <NumField label={k.audioFadeOutS} onChange={setFadeOut} value={fadeOut} />
              </>
            )}
            {activeOp === 'speed' && (
              <NumField label={k.audioSpeedFactor} onChange={setSpeedFactor} value={speedFactor} />
            )}
            <Button disabled={busy !== null} onClick={applyActiveOp} size="sm">
              {busy === 'edit' ? <GlyphSpinner className="text-[0.75rem]" /> : k.audioApply}
            </Button>
          </div>
        )}
      </div>

      <p className="text-[0.625rem] leading-snug text-(--ui-text-quaternary)">
        {k.audioPanelFootnote}
      </p>
    </section>
  )
}

const OpChip: FC<{ active: boolean; disabled: boolean; label: string; onClick: () => void }> = ({ active, disabled, label, onClick }) => (
  <Button
    disabled={disabled}
    onClick={onClick}
    size="sm"
    variant={active ? 'default' : 'outline'}
  >
    {label}
  </Button>
)

const NumField: FC<{
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}> = ({ label, onChange, placeholder, value }) => (
  <label className="flex w-24 flex-col gap-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
    {label}
    <input
      className="h-7 w-full rounded bg-(--ui-bg-secondary) px-2 text-[0.75rem]"
      inputMode="decimal"
      onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
      placeholder={placeholder}
      value={value}
    />
  </label>
)
