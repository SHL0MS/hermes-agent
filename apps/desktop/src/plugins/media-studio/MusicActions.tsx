/**
 * Interactive music actions — the cover & lyric-edit workflows. Opened from
 * an audio library card (or the lightbox) as a panel above the create form,
 * it owns both flows end-to-end:
 *
 *   coverThis(job)      → POST /music/cover/preprocess (feature id + ASR
 *                         lyrics + timestamped sections) → edit lyrics →
 *                         submit a music-cover job (engine re-renders).
 *   editLyrics(lyrics)  → POST /music/lyrics?mode=edit with a direction
 *                         prompt → result text lands in the create form's
 *                         Lyrics field for the next render.
 *
 * Every MiniMax call in here is either FREE (preprocess) or ~$0.01 (lyrics),
 * so no job-queue entries — the paid render is still the engine's music-cover
 * job (visible in the queue rail + library).
 */

import {
  Button,
  Codicon,
  GlyphSpinner,
  host,
  Input,
  Textarea,
  useMutation
} from '@hermes/plugin-sdk'
import { type FC, useEffect, useMemo, useState } from 'react'

import {
  coverPreprocess,
  type CoverPreprocessResult,
  invalidateJobs,
  musicLyrics,
  type StructureSegment,
  submitJob
} from './api'
import { useStudio } from './i18n'

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

const SECTION_TONES: Record<string, string> = {
  intro: 'bg-indigo-500/35 text-indigo-200',
  verse: 'bg-violet-500/30 text-violet-200',
  chorus: 'bg-purple-400/45 text-purple-100',
  'pre-chorus': 'bg-violet-400/40 text-violet-100',
  bridge: 'bg-fuchsia-500/30 text-fuchsia-200',
  outro: 'bg-slate-500/35 text-slate-200',
  inst: 'bg-sky-500/25 text-sky-200',
  silence: 'bg-zinc-600/30 text-zinc-300'
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s - m * 60)

  return `${m}:${String(sec).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Cover panel
// ---------------------------------------------------------------------------

export interface CoverDraft {
  /** Reference as the backend expects it (job:<id> | https url | /abs/path) */
  reference: string
  /** What the user is trying to make, for provenance in the submitted job. */
  sourceTitle?: string
}

export const CoverPanel: FC<{
  draft: CoverDraft
  onClose: () => void
}> = ({ draft, onClose }) => {
  const k = useStudio()
  const [prep, setPrep] = useState<CoverPreprocessResult | null>(null)
  const [lyrics, setLyrics] = useState('')
  const [stylePrompt, setStylePrompt] = useState('cinematic orchestral, heavier drums, brighter mix')

  const analyze = useMutation({
    mutationFn: () => coverPreprocess(draft.reference),
    onError: (err: unknown) => {
      host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    },
    onSuccess: result => {
      setPrep(result)
      setLyrics(result.formatted_lyrics || '')
    }
  })

  useEffect(() => {
    analyze.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.reference])

  // Escape closes the panel (unless typing in one of its fields).
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

  const segments: StructureSegment[] = useMemo(
    () => (prep?.structure?.segments ?? []).filter(s => s.label !== 'silence'),
    [prep]
  )

  const maxEnd = useMemo(
    () => segments.reduce((acc, s) => Math.max(acc, s.end), prep?.audio_duration ?? 0),
    [segments, prep]
  )

  const submit = useMutation({
    mutationFn: () =>
      submitJob({
        provider: 'minimax',
        model: 'music-cover',
        modality: 'audio',
        params: {
          mode: 'cover',
          cover_feature_id: prep?.cover_feature_id,
          lyrics,
          prompt: stylePrompt,
          ...(draft.sourceTitle ? { title: `${draft.sourceTitle} (cover)` } : {}),
          reference: draft.reference
        }
      }),
    onError: (err: unknown) => {
      host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    },
    onSuccess: () => {
      host.notify({ kind: 'success', message: 'Cover rendering in the queue' })
      invalidateJobs()
      onClose()
    }
  })

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-(--ui-stroke-secondary) p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.8125rem] font-medium">{k.audioCoverThis}</h2>
        <Button onClick={onClose} size="icon-sm" variant="ghost">
          <Codicon name="close" />
        </Button>
      </div>

      {analyze.isPending && (
        <div className="flex items-center gap-2 text-[0.75rem] text-(--ui-text-tertiary)">
          <GlyphSpinner className="text-[0.875rem]" /> {k.coverAnalyzing}
        </div>
      )}

      {prep && (
        <>
          {/* Structure timeline */}
          <div className="flex flex-col gap-1">
            <span className="text-[0.6875rem] text-(--ui-text-quaternary)">
              {k.audioStructureLine} · {prep.audio_duration ? fmtTime(prep.audio_duration) : '?'}
            </span>
            <div className="flex h-6 w-full overflow-hidden rounded">
              {segments.map((seg, i) => {
                const widthPct = maxEnd > 0 ? ((seg.end - seg.start) / maxEnd) * 100 : 0
                const tone = SECTION_TONES[seg.label] ?? SECTION_TONES.inst

                return (
                  <div
                    className={`flex h-full items-center justify-center overflow-hidden text-[0.55rem] ${tone}`}
                    key={`${seg.label}-${i}`}
                    style={{ width: `${Math.max(4, widthPct)}%` }}
                    title={`${seg.label} ${fmtTime(seg.start)}–${fmtTime(seg.end)}`}
                  >
                    {widthPct > 6 ? seg.label : ''}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ASR lyrics → editable */}
          <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.coverLyrics}
            <Textarea
              className="min-h-32 font-mono text-[0.6875rem] leading-relaxed"
              onChange={e => setLyrics(e.target.value)}
              value={lyrics}
            />
          </label>

          <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.coverDirection}
            <Input
              className="h-8"
              onChange={e => setStylePrompt(e.target.value)}
              value={stylePrompt}
            />
          </label>

          <div className="flex items-center justify-between">
            <span className="text-[0.625rem] text-(--ui-text-quaternary)">
              feature id {prep.cover_feature_id.slice(0, 8)}… (24h) · {k.coverRenderCost}
            </span>
            <Button
              disabled={!lyrics.trim() || !stylePrompt.trim() || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? (
                <span className="flex items-center gap-2">
                  <GlyphSpinner className="text-[0.875rem]" /> Rendering…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Codicon name="music" /> {k.coverRender}
                </span>
              )}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Lyric edit — inline in the music create panel
// ---------------------------------------------------------------------------

export const LyricsEditorTools: FC<{
  lyrics: string
  onApplyLyrics: (text: string) => void
  onApplyTitle?: (title: string) => void
  onApplyTags?: (tags: string) => void
  /** compact variant for the create-panel slot (tighter rows). */
  compact?: boolean
}> = ({ compact: _compact, lyrics, onApplyLyrics, onApplyTags, onApplyTitle }) => {
  const k = useStudio()
  const [direction, setDirection] = useState('')

  const edit = useMutation({
    mutationFn: () => musicLyrics({ prompt: direction, mode: 'edit', lyrics }),
    onError: (err: unknown) => {
      host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    },
    onSuccess: result => {
      if (result.lyrics) {onApplyLyrics(result.lyrics)}

      if (result.song_title && onApplyTitle) {onApplyTitle(result.song_title)}

      if (result.style_tags && onApplyTags) {onApplyTags(result.style_tags)}
    }
  })

  const disabled = !lyrics.trim() || !direction.trim() || edit.isPending

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-8 flex-1"
        onChange={e => setDirection(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !disabled) {
            e.preventDefault()
            edit.mutate()
          }
        }}
        placeholder={k.lyricsEditPlaceholder}
        value={direction}
      />
      <Button disabled={disabled} onClick={() => edit.mutate()} size="sm" variant="outline">
        {edit.isPending ? <GlyphSpinner className="text-[0.75rem]" /> : k.musicLyricsEdit}
      </Button>
    </div>
  )
}
