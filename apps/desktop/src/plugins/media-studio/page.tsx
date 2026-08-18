/**
 * Media Studio page — create form + live queue + library grid.
 *
 * Layout: a single scrollable page. The create panel sits on top (provider →
 * model → params), the queue rail shows in-flight jobs, and the library grid
 * fills the rest. Media loads as data URLs through the Electron bridge
 * (auth headers don't attach to <img>); thumbs eagerly, full-res in the
 * lightbox only.
 */

import {
  Button,
  cn,
  Codicon,
  EmptyState,
  GlyphSpinner,
  host,
  Input,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  Tip,
  useMutation,
  useQuery,
  useQueryClient
} from '@hermes/plugin-sdk'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  canAttachToComposer,
  cancelJob,
  clearProviderKey,
  deleteJob,
  fetchJobs,
  fetchProviders,
  filesPresent,
  invalidateJobs,
  isTerminal,
  jobReference,
  JOBS_KEY,
  mediaDataUrl,
  type MediaJob,
  mediaVideoUrl,
  type ModelInfo,
  type ProviderInfo,
  PROVIDERS_KEY,
  setProviderKey,
  type SubmitBody,
  submitJob
} from './api'
import {
  ACCEPT_ATTR,
  cardDragPayload,
  clampThumb,
  droppedPath,
  loadThumbSize,
  modelAcceptsImage,
  saveThumbSize,
  startImageIssue,
  THUMB_MAX,
  THUMB_MIN
} from './attach'
import {
  type AudioSelection,
  toggleInSelection as audioSelectionToggle,
  clearSelection as clearAudioSelection,
  EMPTY_SELECTION
} from './audio-select'
import { AudioPanel } from './AudioPanel'
import { useStudio } from './i18n'
import { clampCount, jobParamEntries, jobPrompt, musicBriefParams, type ReuseState, reuseStateFromJob } from './job-params'
import { MiniAudioPlayer } from './MiniAudioPlayer'
import { MixBar } from './MixBar'
import { type ModalityFilter, reconcileSelection, visibleModels } from './model-choices'
import { type CoverDraft, CoverPanel, LyricsEditorTools } from './MusicActions'

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const ASPECT_DEFAULTS = ['1:1', '16:9', '9:16', '4:3', '3:4']

/** Providers the engine can re-run directly — retry/more-like-this eligibility.
 *  Agent rows (provider='agent') and local DSP derivations (provider='craft')
 *  aren't resubmittable jobs. */
const RESUBMITTABLE_PROVIDERS = ['fal', 'krea', 'minimax'] as const

function canResubmit(job: MediaJob): boolean {
  return (RESUBMITTABLE_PROVIDERS as readonly string[]).includes(job.provider)
}

function stateTone(state: MediaJob['state']): string {
  if (state === 'done') {
    return 'text-(--ui-text-secondary)'
  }

  if (state === 'failed' || state === 'expired') {
    return 'text-(--ui-danger, #e5484d)'
  }

  return 'text-(--ui-accent)'
}

function fmtDuration(s: unknown): string | null {
  const n = Number(s)

  if (!Number.isFinite(n) || n <= 0) {return null}
  const m = Math.floor(n / 60)
  const sec = Math.round(n - m * 60)

  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Async media <img> fed by the bridge data-URL cache. */
const Thumb: FC<{ alt: string; className?: string; path: string }> = ({ alt, className, path }) => {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    setSrc('')
    setFailed(false)
    mediaDataUrl(path)
      .then(url => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true))

    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-(--ui-bg-tertiary)', className)}>
        <Codicon className="text-(--ui-text-quaternary)" name="file-media" />
      </div>
    )
  }

  if (!src) {
    return <div className={cn('animate-pulse bg-(--ui-bg-tertiary)', className)} />
  }

  return <img alt={alt} className={className} draggable={false} src={src} />
}

// ---------------------------------------------------------------------------
// Create panel
// ---------------------------------------------------------------------------

interface CreateState {
  provider: string
  modelId: string
  prompt: string
  negativePrompt: string
  aspectRatio: string
  resolution: string
  duration: string
  seed: string
  audio: boolean
  startImage: string
  /** MiniMax music brief fields (audio modality only). */
  lyrics: string
  genre: string
  mood: string
  bpm: string
  musicKey: string
  vocal: string
  instrumentation: string
  instrumental: boolean
  iterations: string
}

const COUNT_PRESETS = [1, 2, 4] as const
const COUNT_CUSTOM = 'custom'
const MAX_COUNT = 50

/** BYOK: paste-a-key form shown when an unavailable provider declares a
 *  key_var. Saves through the plugin API (lands in ~/.hermes/.env), then
 *  refetches the catalog so the form flips to available in place. */
const ProviderKeyForm: FC<{ provider: ProviderInfo }> = ({ provider }) => {
  const k = useStudio()
  const queryClient = useQueryClient()
  const [key, setKey] = useState('')

  const save = useMutation({
    mutationFn: () => setProviderKey(provider.name, key.trim()),
    onError: (error: unknown) => {
      host.notify({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    },
    onSuccess: result => {
      setKey('')
      host.notify({ kind: result.available ? 'success' : 'warning', message: k.keySaved })
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY })
    }
  })

  // The provider hint carries the console URL (e.g. krea.ai/settings/api-tokens);
  // surface it as-is under the input.
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-(--ui-bg-tertiary) px-3 py-2">
      <span className="text-[0.6875rem] text-(--ui-text-secondary)">{provider.hint}</span>
      <div className="flex items-center gap-2">
        <Input
          className="h-8 flex-1"
          onChange={event => setKey(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && key.trim()) {
              event.preventDefault()
              save.mutate()
            }
          }}
          placeholder={k.keyPlaceholder}
          type="password"
          value={key}
        />
        <Button disabled={!key.trim() || save.isPending} onClick={() => save.mutate()} size="sm" variant="outline">
          {save.isPending ? <GlyphSpinner className="text-[0.75rem]" /> : k.keySave}
        </Button>
      </div>
    </div>
  )
}

/** Compact "key on file" row for an available BYOK provider — one action:
 *  remove (which flips the panel back to the paste form). */
const ProviderKeyStatus: FC<{ provider: ProviderInfo }> = ({ provider }) => {
  const k = useStudio()
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: () => clearProviderKey(provider.name),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY })
  })

  return (
    <div className="flex items-center gap-2 text-[0.6875rem] text-(--ui-text-quaternary)">
      <Codicon name="key" size="0.75rem" />
      <span className="min-w-0 flex-1 truncate">{provider.key_var}</span>
      <Button
        className="h-6 px-2 text-[0.625rem]"
        disabled={remove.isPending}
        onClick={() => remove.mutate()}
        size="sm"
        variant="ghost"
      >
        {k.keyRemove}
      </Button>
    </div>
  )
}

const CreatePanel: FC<{
  modalityFilter: ModalityFilter
  onProviderCatalog: (providers: ProviderInfo[]) => void
  reuse: ReuseState | null
  onReuseApplied: () => void
  startImage: string
  onClearStartImage: () => void
  onStartImage: (path: string) => void
}> = ({ modalityFilter, onClearStartImage, onProviderCatalog, onReuseApplied, onStartImage, reuse, startImage }) => {
  const k = useStudio()
  const { data } = useQuery({ queryFn: fetchProviders, queryKey: PROVIDERS_KEY, staleTime: 60_000 })
  const providers = useMemo(() => data?.providers ?? [], [data])

  useEffect(() => onProviderCatalog(providers), [onProviderCatalog, providers])

  // The Provider dropdown only offers providers that serve the active
  // modality — Music shouldn't list fal/Krea (no music models). On 'all'
  // every provider qualifies. A provider that became irrelevant after a
  // filter flip is still valid until reconcileSelection moves the pick.
  const providersForFilter = useMemo(
    () => providers.filter(p => visibleModels(p.models, modalityFilter).length > 0),
    [modalityFilter, providers]
  )

  const [state, setState] = useState<Omit<CreateState, 'startImage'>>({
    provider: '',
    modelId: '',
    prompt: '',
    negativePrompt: '',
    aspectRatio: '1:1',
    resolution: '',
    duration: '',
    seed: '',
    audio: true
    , lyrics: '', genre: '', mood: '', bpm: '', musicKey: '', vocal: '', instrumentation: '',
    instrumental: false, iterations: '2'
  })

  // Batch count: preset 1/2/4 or a free-typed custom N (fanned out server-side).
  const [countChoice, setCountChoice] = useState<string>('1')
  const [customCount, setCustomCount] = useState('8')
  // Drag-over highlight for the panel-wide start-image drop zone.
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const patch = useCallback((update: Partial<typeof state>) => setState(prev => ({ ...prev, ...update })), [])

  // Initial pick + reconciliation: the header's All/Image/Video mode governs
  // which models the dropdown offers, so a selection the filter excludes hops
  // to a sibling model (same provider first, then the first provider that
  // serves the modality).
  useEffect(() => {
    if (providers.length === 0) {
      return
    }

    if (!state.provider) {
      const first = providers.find(p => p.available) ?? providers[0]
      const models = visibleModels(first.models, modalityFilter)

      patch({ modelId: (models[0] ?? first.models[0])?.id ?? '', provider: first.name })

      return
    }

    const moved = reconcileSelection(providers, modalityFilter, {
      modelId: state.modelId,
      provider: state.provider
    })

    if (moved) {
      patch(moved)
    }
  }, [modalityFilter, patch, providers, state.modelId, state.provider])

  const provider = providers.find(p => p.name === state.provider)

  // A library card's "reuse settings" click lands here: restore the model,
  // prompt, and every recoverable parameter in one shot. Runs after the
  // reconciliation effect above so the restored pick isn't immediately moved
  // (StudioPage flips the modality filter to match before setting reuse).
  // The parent clears `reuse` via onReuseApplied right after we apply, so
  // this effect fires exactly once per click — no ref mirror needed.
  useEffect(() => {
    if (!reuse) {
      return
    }

    const { startImage: _startImage, ...fields } = reuse

    patch(fields)
    setCountChoice('1')
    onReuseApplied()
  }, [onReuseApplied, patch, reuse])

  const modelChoices = useMemo(
    () => visibleModels(provider?.models ?? [], modalityFilter),
    [modalityFilter, provider]
  )

  const model: ModelInfo | undefined = provider?.models.find(m => m.id === state.modelId)
  // When the modality filter excludes everything this provider serves, the
  // model dropdown is empty and `model` is stale — zero its supports so the
  // panel renders an honest "no X models on this provider" state instead of
  // the previous modality's controls (the image aspect-ratio row leaking
  // onto the Music tab was this).
  const providerHasFilterModels = modelChoices.length > 0

  const supports = useMemo(
    () => (providerHasFilterModels ? model?.supports ?? {} : {}),
    [model, providerHasFilterModels]
  )

  const aspectChoices = model?.aspect_ratios ?? ASPECT_DEFAULTS
  const modality = model?.modality ?? 'image'
  const acceptsImage = modelAcceptsImage(model)

  // A picked/dropped file lands here; rejections explain themselves.
  const takeStartImage = useCallback(
    (path: null | string) => {
      if (!path) {
        return
      }

      const issue = startImageIssue(model, path)

      if (issue === 'model') {
        host.notify({ kind: 'warning', message: k.attachNotSupported(model?.display ?? '') })

        return
      }

      if (issue === 'type') {
        host.notify({ kind: 'warning', message: k.attachBadType(path.split('/').pop() ?? path) })

        return
      }

      onStartImage(path)
    },
    [k, model, onStartImage]
  )

  // Model switch: drop params the new model doesn't support.
  useEffect(() => {
    if (!model) {
      return
    }

    const nextAspects = model.aspect_ratios ?? ASPECT_DEFAULTS

    setState(prev => ({
      ...prev,
      aspectRatio: nextAspects.includes(prev.aspectRatio) ? prev.aspectRatio : nextAspects[0],
      duration: model.durations?.length ? String(model.durations[0]) : '',
      resolution: model.resolutions?.includes(prev.resolution)
        ? prev.resolution
        : (model.resolutions?.[0] ?? '')
    }))
  }, [model])

  const submit = useMutation({
    mutationFn: (body: SubmitBody) => submitJob(body),
    onError: (error: unknown) => {
      host.notify({ kind: 'error', message: error instanceof Error ? error.message : k.errorSubmit })
    },
    onSuccess: () => invalidateJobs()
  })

  // Requirement deviations: some models make the prompt optional (upscaler,
  // Kling with a start image) or demand a start image (upscaler, i2v-only).
  const promptRequired = model?.requires?.prompt !== false
  const imageRequired = model?.requires?.image_url === true

  const inputsSatisfied =
    providerHasFilterModels &&
    (Boolean(state.prompt.trim()) || (!promptRequired && Boolean(startImage))) &&
    (!imageRequired || Boolean(startImage))

  const canSubmit = Boolean(inputsSatisfied && provider?.available && model) && !submit.isPending
  const count = countChoice === COUNT_CUSTOM ? clampCount(customCount, MAX_COUNT) : Number(countChoice)

  const onGenerate = () => {
    if (!canSubmit || !model || !provider) {
      return
    }

    const params: Record<string, unknown> = { prompt: state.prompt.trim() }

    if (supports.aspect_ratio) {
      params.aspect_ratio = state.aspectRatio
    }

    if (supports.resolution && state.resolution) {
      params.resolution = state.resolution
    }

    if (supports.duration && state.duration) {
      params.duration = Number(state.duration)
    }

    if (supports.negative_prompt && state.negativePrompt.trim()) {
      params.negative_prompt = state.negativePrompt.trim()
    }

    if (supports.audio) {
      params.audio = state.audio
    }

    if (supports.seed && state.seed.trim()) {
      params.seed = Number(state.seed)
    }

    if (supports.image_url && startImage) {
      params.image_url = startImage
    }

    if (model.modality === 'audio') {
      // Music brief: turn the structured fields into the craft loop's brief.
      // Instrumental mode drops vocal/lyrics — see musicBriefParams.
      Object.assign(params, musicBriefParams(state))
    }

    submit.mutate({ count, modality: model.modality, model: model.id, params, provider: provider.name })
  }

  if (providers.length === 0) {
    return null
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-(--ui-stroke-secondary) p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          {k.provider}
          <Select onValueChange={value => {
            const next = providersForFilter.find(p => p.name === value)
            const nextModels = visibleModels(next?.models ?? [], modalityFilter)

            patch({ modelId: (nextModels[0] ?? next?.models[0])?.id ?? '', provider: value })
          }} value={state.provider}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providersForFilter.map(p => (
                <SelectItem key={p.name} value={p.name}>
                  <span className="flex items-center gap-2">
                    {p.display}
                    {!p.available && (
                      <span className="text-[0.625rem] text-(--ui-text-quaternary)">{k.notConfigured}</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-56 flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          {k.model}
          <Select onValueChange={value => patch({ modelId: value })} value={state.modelId}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelChoices.length === 0 ? (
                <div className="px-2 py-1.5 text-[0.6875rem] text-(--ui-text-quaternary)">
                  No {modalityFilter} models on {provider?.display ?? 'this provider'} — switch provider or filter.
                </div>
              ) : (
                modelChoices.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <Codicon
                        className="text-(--ui-text-quaternary)"
                        name={m.modality === 'video' ? 'device-camera-video' : m.modality === 'audio' ? 'music' : 'file-media'}
                        size="0.75rem"
                      />
                      {m.display}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </label>
        {model?.note && <p className="pb-1.5 text-[0.6875rem] text-(--ui-text-quaternary)">{model.note}</p>}
      </div>

      {provider && !provider.available && (
        provider.key_var ? (
          <ProviderKeyForm provider={provider} />
        ) : (
          <p className="rounded-md bg-(--ui-bg-tertiary) px-3 py-2 text-[0.75rem] text-(--ui-text-secondary)">
            {provider.hint}
          </p>
        )
      )}
      {/* Available + keyable: show either the key-on-file row or the paste
          form. A provider can be available WITHOUT a key (managed gateway
          route) — the form must stay reachable there or a removed key could
          never be re-added. */}
      {provider?.available && provider.key_var && (
        provider.key_on_file ? <ProviderKeyStatus provider={provider} /> : <ProviderKeyForm provider={provider} />
      )}

      {/* Hidden OS file picker — the attach button's target. */}
      <input
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          const getPath = window.hermesDesktop?.getPathForFile

          takeStartImage(file && getPath ? getPath(file) || null : null)
          event.target.value = ''
        }}
        ref={fileInputRef}
        type="file"
      />

      {startImage && (
        <div className="flex items-center gap-2 rounded-md bg-(--ui-bg-tertiary) px-2 py-1.5">
          <Thumb alt={k.startImage} className="size-10 rounded object-cover" path={startImage} />
          <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.startImage}: {startImage.split('/').pop()}
          </span>
          <Tip label={k.clearStartImage}>
            <Button onClick={onClearStartImage} size="icon-sm" variant="ghost">
              <Codicon name="close" />
            </Button>
          </Tip>
        </div>
      )}

      {/* Prompt + attach: the textarea is also the start-image drop target
          (drag from Finder, the library grid below, or the project tree). */}
      <div
        className={cn(
          'relative rounded-md transition-shadow',
          dragOver && acceptsImage && 'ring-2 ring-(--dt-primary)'
        )}
        onDragLeave={() => setDragOver(false)}
        onDragOver={event => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDrop={event => {
          event.preventDefault()
          setDragOver(false)
          takeStartImage(droppedPath(event.dataTransfer, window.hermesDesktop?.getPathForFile))
        }}
      >
        <Textarea
          className="min-h-20 pr-9"
          onChange={event => patch({ prompt: event.target.value })}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              onGenerate()
            }
          }}
          placeholder={k.promptPlaceholder}
          value={state.prompt}
        />
        <div className="absolute bottom-1.5 right-1.5">
          <Tip label={acceptsImage ? k.attachImage : k.attachUnsupported}>
            {/* span keeps the tooltip alive over a disabled button */}
            <span className="inline-flex">
              <Button
                className="text-(--ui-text-quaternary) hover:text-foreground"
                disabled={!acceptsImage}
                onClick={() => fileInputRef.current?.click()}
                size="icon-sm"
                variant="ghost"
              >
                <Codicon name="attach" />
              </Button>
            </span>
          </Tip>
        </div>
      </div>

      {supports.negative_prompt && (
        <Input
          className="h-8"
          onChange={event => patch({ negativePrompt: event.target.value })}
          placeholder={k.negativePrompt}
          value={state.negativePrompt}
        />
      )}

      {/* Music brief: shown only for audio-modality models (MiniMax). The
           prompt textarea above doubles as the free-form description; these
           fields become the craft loop's structured brief. */}
      {model?.modality === 'audio' && (
        <div className="flex flex-col gap-2.5 rounded-md bg-(--ui-bg-tertiary) p-3">
          {/* brief row 1: genre + bpm + key + mood on one line, 4-col grid */}
          <div className="grid grid-cols-4 items-end gap-1.5">
            <label className="col-span-2 flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicGenre}
              <Input className="h-8" onChange={event => patch({ genre: event.target.value })} placeholder="dark synthpop" value={state.genre} />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicBpm}
              <Input className="h-8" inputMode="numeric" onChange={event => patch({ bpm: event.target.value.replace(/[^0-9]/g, '') })} placeholder="118" value={state.bpm} />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicKeySig}
              <Input className="h-8" onChange={event => patch({ musicKey: event.target.value })} placeholder="C minor" value={state.musicKey} />
            </label>
          </div>
          {/* brief row 2: mood + instruments + takes + instrumental switch */}
          <div className="grid grid-cols-4 items-end gap-1.5">
            <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicMood}
              <Input className="h-8" onChange={event => patch({ mood: event.target.value })} placeholder="bittersweet" value={state.mood} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicInstruments}
              <Input className="h-8" onChange={event => patch({ instrumentation: event.target.value })} placeholder="analog pads, 808" value={state.instrumentation} />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
              {k.musicTakes}
              <Input className="h-8" inputMode="numeric" onChange={event => patch({ iterations: event.target.value.replace(/[^1-4]/g, '') })} value={state.iterations} />
            </label>
          </div>
          {/* row 3: vocal + instrumental on one line; switch sits at the end */}
          <div className="flex items-end gap-2">
            {!state.instrumental && (
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                {k.musicVocal}
                <Input className="h-8" onChange={event => patch({ vocal: event.target.value })} placeholder="breathy female alto" value={state.vocal} />
              </label>
            )}
            <label className="ml-auto flex h-8 items-center gap-2 pb-0.5 text-[0.6875rem] text-(--ui-text-tertiary)">
              <Switch checked={state.instrumental} onCheckedChange={checked => patch({ instrumental: checked })} />
              {k.musicInstrumental}
            </label>
          </div>
          {/* row 4: lyrics side-by-side with edit panel; hides in instrumental */}
          {!state.instrumental && (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] items-start gap-1.5">
              <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                {k.musicLyrics}
                <Textarea
                  className="min-h-20 font-mono text-[0.6875rem]"
                  onChange={event => patch({ lyrics: event.target.value })}
                  placeholder="[Verse]&#10;...&#10;[Chorus]&#10;..."
                  value={state.lyrics}
                />
              </label>
              <div className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                <span>{k.musicLyricsEdit}</span>
                <div className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-2">
                  <LyricsEditorTools
                    compact
                    lyrics={state.lyrics}
                    onApplyLyrics={text => patch({ lyrics: text })}
                    onApplyTitle={() => undefined}
                  />
                </div>
                <p className="text-[0.625rem] leading-snug text-(--ui-text-quaternary)">
                  LLM edit (~$0.01): "darker chorus", "shorter verse 2"
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {supports.aspect_ratio && (
          <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.aspectRatio}
            <SegmentedControl
              onChange={id => patch({ aspectRatio: id })}
              options={aspectChoices.map(ratio => ({ id: ratio, label: ratio }))}
              value={state.aspectRatio}
            />
          </label>
        )}
        {supports.resolution && (model?.resolutions?.length ?? 0) > 0 && (
          <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.resolution}
            <SegmentedControl
              onChange={id => patch({ resolution: id })}
              options={(model?.resolutions ?? []).map(r => ({ id: r, label: r }))}
              value={state.resolution}
            />
          </label>
        )}
        {supports.duration && (model?.durations?.length ?? 0) > 0 && (
          <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.duration}
            <SegmentedControl
              onChange={id => patch({ duration: id })}
              options={(model?.durations ?? []).map(d => ({ id: String(d), label: k.seconds(d) }))}
              value={state.duration}
            />
          </label>
        )}
        {supports.seed && (
          <label className="flex w-28 flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {k.seed}
            <Input
              className="h-8"
              inputMode="numeric"
              onChange={event => patch({ seed: event.target.value.replace(/[^0-9]/g, '') })}
              placeholder={k.seedPlaceholder}
              value={state.seed}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          {k.count}
          <span className="flex items-center gap-1.5">
            <SegmentedControl
              onChange={setCountChoice}
              options={[
                ...COUNT_PRESETS.map(n => ({ id: String(n), label: String(n) })),
                { id: COUNT_CUSTOM, label: k.countCustom }
              ]}
              value={countChoice}
            />
            {countChoice === COUNT_CUSTOM && (
              <Input
                className="h-8 w-16"
                inputMode="numeric"
                onChange={event => setCustomCount(event.target.value.replace(/[^0-9]/g, ''))}
                value={customCount}
              />
            )}
          </span>
        </label>
        {supports.audio && (
          <label className="flex items-center gap-2 pb-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">
            <Switch checked={state.audio} onCheckedChange={checked => patch({ audio: checked })} />
            {k.audio}
          </label>
        )}
        <div className="ml-auto">
          <Button disabled={!canSubmit} onClick={onGenerate}>
            {submit.isPending ? (
              <span className="flex items-center gap-2">
                <GlyphSpinner className="text-[0.875rem]" />
                {k.generating}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Codicon name="sparkle" />
                {count > 1 ? `${k.generate} ×${count}` : k.generate}
                <kbd className="text-[0.625rem] text-(--ui-text-quaternary)">⌘⏎</kbd>
              </span>
            )}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Queue rail
// ---------------------------------------------------------------------------

const QueueRow: FC<{ job: MediaJob; label: string; onCancel: (id: string) => void }> = ({ job, label, onCancel }) => {
  const k = useStudio()

  return (
    <div className="flex items-center gap-3 rounded-md border border-(--ui-stroke-secondary) px-3 py-2">
      <GlyphSpinner className="text-[0.875rem]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.75rem]">{jobPrompt(job) || job.model.split('/').pop()}</p>
        <p className="text-[0.6875rem] text-(--ui-text-quaternary)">
          {job.provider} · {job.model.split('/').pop()}
          {job.progress ? ` · ${job.progress}` : ''}
        </p>
      </div>
      <span className={cn('text-[0.6875rem]', stateTone(job.state))}>{label}</span>
      <Tip label={k.cancel}>
        <Button onClick={() => onCancel(job.id)} size="icon-sm" variant="ghost">
          <Codicon name="stop-circle" />
        </Button>
      </Tip>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Library grid + lightbox
// ---------------------------------------------------------------------------

const Lightbox: FC<{
  job: MediaJob
  onClose: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onMoreLikeThis: ((job: MediaJob) => void) | null
  onReuseSettings: ((job: MediaJob) => void) | null
}> = ({ job, onClose, onMoreLikeThis, onNext, onPrev, onReuseSettings }) => {
  const k = useStudio()
  const [src, setSrc] = useState('')
  const [copied, setCopied] = useState(false)
  const path = job.result_paths[0]
  const isVideo = job.modality === 'video'
  const isAudio = job.modality === 'audio'
  const prompt = jobPrompt(job)
  const entries = jobParamEntries(job)
  // Provenance: agent rows (and agent-queued studio jobs) carry their
  // originating chat. Session routes are plain `/<id>` paths, so plugin
  // navigation reaches them without any new SDK surface.
  const originSession = job.session_id ?? null

  const paramLabel: Record<(typeof entries)[number]['key'], string> = {
    aspectRatio: k.aspectRatio,
    audio: k.audio,
    duration: k.duration,
    musicBpm: k.musicBpm,
    musicGenre: k.musicGenre,
    musicInstruments: k.musicInstruments,
    musicKeySig: k.musicKeySig,
    musicMood: k.musicMood,
    musicTakes: k.musicTakes,
    musicVocal: k.musicVocal,
    negativePrompt: k.negativePrompt,
    resolution: k.resolution,
    seed: k.seed,
    startImage: k.startImage
  }

  const copyPrompt = () => {
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  useEffect(() => {
    setSrc('')

    if (isVideo || !path) {
      return
    }

    let cancelled = false

    mediaDataUrl(path)
      .then(url => !cancelled && setSrc(url))
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [isVideo, path])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }

      // Arrows aimed at the video's own controls seek / adjust volume — don't
      // also navigate the lightbox. (Escape above stays universal.)
      const target = event.target as HTMLElement | null

      if (target && ['VIDEO', 'INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return
      }

      if (event.key === 'ArrowLeft' && onPrev) {
        onPrev()
      }

      if (event.key === 'ArrowRight' && onNext) {
        onNext()
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNext, onPrev])

  if (!path) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
      role="presentation"
    >
      {onPrev && (
        <Tip label={k.lightboxPrev}>
          <Button
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
            onClick={event => {
              event.stopPropagation()
              onPrev()
            }}
            size="icon"
            variant="ghost"
          >
            <Codicon name="chevron-left" size="1.25rem" />
          </Button>
        </Tip>
      )}
      {onNext && (
        <Tip label={k.lightboxNext}>
          <Button
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
            onClick={event => {
              event.stopPropagation()
              onNext()
            }}
            size="icon"
            variant="ghost"
          >
            <Codicon name="chevron-right" size="1.25rem" />
          </Button>
        </Tip>
      )}
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={event => event.stopPropagation()}
        role="presentation"
      >
        {isVideo ? (
          <video autoPlay className="min-h-0 max-w-full flex-1 rounded-lg" controls key={job.id} src={mediaVideoUrl(path)} />
        ) : isAudio ? (
          <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4">
            <MiniAudioPlayer src={mediaVideoUrl(path)} title={prompt || job.model.split('/').pop()} />
          </div>
        ) : src ? (
          <img alt={prompt} className="min-h-0 max-w-full flex-1 rounded-lg object-contain" key={job.id} src={src} />
        ) : (
          <GlyphSpinner className="text-[1.5rem]" />
        )}

        <div className="w-full max-w-2xl rounded-lg bg-black/70 p-3 text-white backdrop-blur">
          {prompt && (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-[0.75rem] leading-relaxed">{prompt}</p>
              {onMoreLikeThis && prompt && (
                <Tip label={k.moreLikeThis}>
                  <Button
                    className="shrink-0 text-white"
                    onClick={() => onMoreLikeThis(job)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Codicon name="sparkle" />
                  </Button>
                </Tip>
              )}
              {onReuseSettings && (
                <Tip label={k.reuseSettings}>
                  <Button
                    className="shrink-0 text-white"
                    onClick={() => onReuseSettings(job)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Codicon name="history" />
                  </Button>
                </Tip>
              )}
              <Tip label={copied ? k.copiedPrompt : k.copyPrompt}>
                <Button className="shrink-0 text-white" onClick={copyPrompt} size="icon-sm" variant="ghost">
                  <Codicon name={copied ? 'check' : 'copy'} />
                </Button>
              </Tip>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.625rem] text-white/70">
            <span className="rounded bg-white/10 px-1.5 py-0.5">
              {job.provider} · {job.model.split('/').pop()}
            </span>
            {entries.map(entry => (
              <span className="rounded bg-white/10 px-1.5 py-0.5" key={entry.key}>
                {paramLabel[entry.key]}: {entry.seconds !== undefined ? k.seconds(entry.seconds) : entry.value}
              </span>
            ))}
            {originSession && (
              <button
                className="cursor-pointer rounded bg-white/10 px-1.5 py-0.5 hover:bg-white/20"
                onClick={() => host.navigate(`/${encodeURIComponent(originSession)}`)}
                type="button"
              >
                {k.openOriginChat}
              </button>
            )}
            <span className="ml-auto text-white/50">{new Date(job.created_at * 1000).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const LibraryCard: FC<{
  job: MediaJob
  onOpen: (job: MediaJob) => void
  onSendToChat: null | ((job: MediaJob) => void)
  onUseAsInput: (job: MediaJob) => void
  onRemove: (id: string) => void
  onRetry: (job: MediaJob) => void
  onReuseSettings?: (job: MediaJob) => void
  onCoverThis?: (job: MediaJob) => void
  onEditAudio?: (job: MediaJob) => void
  mixSelected?: boolean
  onToggleMixSelect?: (job: MediaJob) => void
}> = ({ job, mixSelected, onCoverThis, onEditAudio, onOpen, onRemove, onRetry, onReuseSettings, onSendToChat, onToggleMixSelect, onUseAsInput }) => {
  const k = useStudio()
  const failed = job.state === 'failed' || job.state === 'expired'
  const missing = !failed && !filesPresent(job)
  const thumb = job.thumb_paths[0] ?? job.result_paths[0]
  const prompt = jobPrompt(job)

  // Reveal target: the result when it's on disk; otherwise the input image
  // (failed rows — e.g. a rejected edit — keep their source inspectable).
  const inputImagePath =
    typeof job.params.image_url === 'string' && job.params.image_url.startsWith('/') ? job.params.image_url : ''

  const revealTarget = (!missing && job.result_paths[0]) || inputImagePath

  const stateLabel: Record<MediaJob['state'], string> = {
    cancelled: k.stateCancelled,
    done: k.stateDone,
    expired: k.stateExpired,
    failed: k.stateFailed,
    queued: k.stateQueued,
    running: k.stateRunning
  }

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-(--ui-stroke-secondary)"
      draggable={!failed && !missing && Boolean(job.result_paths[0])}
      onDragStart={event => {
        const path = job.result_paths[0]

        if (!path || missing) {
          return
        }

        for (const [type, value] of cardDragPayload(path)) {
          event.dataTransfer.setData(type, value)
        }

        event.dataTransfer.effectAllowed = 'copy'
      }}
    >
      {failed ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 p-3 text-center">
          <Codicon className="text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
          <p className="line-clamp-3 text-[0.6875rem] text-(--ui-text-tertiary)" title={job.error ?? undefined}>{job.error}</p>
          {canResubmit(job) && (
            <Button onClick={() => onRetry(job)} size="sm" variant="outline">
              {k.retry}
            </Button>
          )}
        </div>
      ) : missing ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 p-3 text-center">
          <Codicon className="text-(--ui-text-quaternary)" name="file-media" size="1.25rem" />
          <p className="text-[0.6875rem] text-(--ui-text-tertiary)">{k.fileMissing}</p>
          {canResubmit(job) && jobPrompt(job) && (
            <Button onClick={() => onRetry(job)} size="sm" variant="outline">
              {k.regenerate}
            </Button>
          )}
        </div>
      ) : (
        <button className="block w-full cursor-zoom-in" onClick={() => onOpen(job)} type="button">
          {thumb ? (
            <Thumb alt={String(job.params.prompt ?? '')} className="aspect-square w-full object-cover" path={thumb} />
          ) : (
            <div className="flex aspect-square items-center justify-center bg-(--ui-bg-tertiary)">
              <Codicon className="text-(--ui-text-quaternary)" name="file-media" />
            </div>
          )}
        </button>
      )}

      {job.modality === 'video' && !failed && !missing && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white">
          <Codicon name="play" size="0.625rem" />
        </span>
      )}
      {job.modality === 'audio' && !failed && !missing && (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white">
          {fmtDuration(job.params.duration_s) ?? 'audio'}
        </span>
      )}
      {job.source === 'agent' && (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white">
          {k.agentSource}
        </span>
      )}

      {prompt && !failed && !missing && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-2 pb-6 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="line-clamp-2 text-[0.6875rem] leading-snug text-white/90">{prompt}</p>
        </div>
      )}

      {job.modality === 'audio' && !failed && !missing && onToggleMixSelect && (
        <button
          aria-checked={mixSelected}
          aria-label={mixSelected ? 'Remove from mix' : 'Add to mix'}
          className={`absolute left-2 top-2 flex size-5 items-center justify-center rounded border text-[0.625rem] transition-colors ${
            mixSelected
              ? 'border-violet-400 bg-violet-500 text-white'
              : 'border-white/40 bg-black/50 text-white/80 hover:border-white/70'
          }`}
          onClick={e => {
            e.stopPropagation()
            onToggleMixSelect(job)
          }}
          role="checkbox"
          type="button"
        >
          {mixSelected ? '✓' : ''}
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {!failed && !missing && job.result_paths[0] && (
          <>
            {onSendToChat && (
              <Tip label={k.sendToChat}>
                <Button className="text-white" onClick={() => onSendToChat(job)} size="icon-sm" variant="ghost">
                  <Codicon name="comment" />
                </Button>
              </Tip>
            )}
            {job.modality === 'image' && (
              <Tip label={k.useAsInput}>
                <Button className="text-white" onClick={() => onUseAsInput(job)} size="icon-sm" variant="ghost">
                  <Codicon name="arrow-right" />
                </Button>
              </Tip>
            )}
            {job.modality === 'audio' && !failed && onCoverThis && (
              <Tip label={k.audioCoverThis}>
                <Button
                  className="text-white"
                  onClick={event => {
                    event.stopPropagation()
                    onCoverThis(job)
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Codicon name="refresh" />
                </Button>
              </Tip>
            )}
            {job.modality === 'audio' && !failed && onEditAudio && (
              <Tip label={k.audioEditMaster}>
                <Button
                  className="text-white"
                  onClick={event => {
                    event.stopPropagation()
                    onEditAudio(job)
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Codicon name="tools" />
                </Button>
              </Tip>
            )}
          </>
        )}
        {/* Reuse settings: restore prompt + parameters + reference image into
            the create panel. Available on every resubmittable row — healthy,
            failed, and ghost alike (failed rows are where tweak-and-resubmit
            matters most). */}
        {onReuseSettings && canResubmit(job) && (
          <Tip label={k.reuseSettings}>
            <Button
              className="text-white"
              onClick={event => {
                event.stopPropagation()
                onReuseSettings(job)
              }}
              size="icon-sm"
              variant="ghost"
            >
              <Codicon name="history" />
            </Button>
          </Tip>
        )}
        {/* Reveal follows whatever is on disk: the result when present, else
            the input image (failed rows keep their source inspectable). */}
        {revealTarget && (
          <Tip label={k.revealFile}>
            <Button
              className="text-white"
              onClick={() => void window.hermesDesktop?.revealPath?.(revealTarget)}
              size="icon-sm"
              variant="ghost"
            >
              <Codicon name="folder-opened" />
            </Button>
          </Tip>
        )}
        <Tip label={k.remove}>
          <Button className="text-white" onClick={() => onRemove(job.id)} size="icon-sm" variant="ghost">
            <Codicon name="trash" />
          </Button>
        </Tip>
      </div>

      <span className="sr-only">{stateLabel[job.state]}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const MediaStudioPage: FC = () => {
  const k = useStudio()
  // One page-wide mode: gates BOTH the create panel's model dropdown and the
  // library grid.
  const [filter, setFilter] = useState<ModalityFilter>('all')
  const [lightbox, setLightbox] = useState<MediaJob | null>(null)
  const [startImage, setStartImage] = useState('')
  const [reuse, setReuse] = useState<ReuseState | null>(null)
  const [coverDraft, setCoverDraft] = useState<CoverDraft | null>(null)
  const [audioPanelJob, setAudioPanelJob] = useState<MediaJob | null>(null)
  const [mixSelection, setMixSelection] = useState<AudioSelection>(EMPTY_SELECTION)
  // Thumbnail edge length (px) for the library grid — persisted.
  const [thumbSize, setThumbSizeState] = useState(loadThumbSize)
  const providersRef = useRef<ProviderInfo[]>([])
  // The page owns its own scroller (overflow-y-auto below) — window.scrollTo
  // is a no-op here, so flows that reveal the create panel scroll this ref.
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ behavior: 'smooth', top: 0 })
  }, [])

  const setThumbSize = useCallback((value: number) => {
    setThumbSizeState(value)
    saveThumbSize(value)
  }, [])

  const { data } = useQuery({
    queryFn: fetchJobs,
    queryKey: JOBS_KEY,
    // The events socket invalidates on every transition; this interval is the
    // socketless fallback (OAuth remotes).
    refetchInterval: 5_000
  })

  const jobs = useMemo(() => data?.jobs ?? [], [data])

  // Deep link: /media?job=<id> (completion toast "View") opens the lightbox
  // on that job once it's in the list, then strips the param so refresh /
  // back don't re-trigger.
  useEffect(() => {
    const hash = window.location.hash
    const queryAt = hash.indexOf('?')

    if (queryAt < 0) {
      return
    }

    const wanted = new URLSearchParams(hash.slice(queryAt + 1)).get('job')

    if (!wanted) {
      return
    }

    const job = jobs.find((j: MediaJob) => j.id === wanted)

    if (job) {
      setLightbox(job)
      window.history.replaceState(null, '', hash.slice(0, queryAt))
    }
  }, [jobs])
  const active = jobs.filter(job => !isTerminal(job.state))
  const library = jobs.filter(job => isTerminal(job.state) && job.state !== 'cancelled')
  const filtered = filter === 'all' ? library : library.filter(job => job.modality === filter)

  // Lightbox prev/next walk the filtered grid in visual order, skipping rows
  // with nothing to show (failed/expired). Derived from the live list so the
  // open viewer tracks reality: the current row's fresh state renders (falling
  // back to the opening snapshot if the row vanished), and the arrows hide at
  // the ends.
  const viewable = filtered.filter(job => job.result_paths.length > 0 && filesPresent(job))
  const lightboxIndex = lightbox ? viewable.findIndex(job => job.id === lightbox.id) : -1
  const lightboxJob = lightboxIndex >= 0 ? viewable[lightboxIndex] : null
  const lightboxPrev = lightboxIndex > 0 ? viewable[lightboxIndex - 1] : null

  const lightboxNext =
    lightboxIndex >= 0 && lightboxIndex < viewable.length - 1 ? viewable[lightboxIndex + 1] : null

  const onCancel = useCallback((id: string) => {
    void cancelJob(id).then(invalidateJobs)
  }, [])

  const onRemove = useCallback((id: string) => {
    void deleteJob(id).then(invalidateJobs)
  }, [])

  const onRetry = useCallback((job: MediaJob) => {
    void submitJob({
      modality: job.modality,
      model: job.model,
      params: job.params,
      provider: job.provider
    }).then(invalidateJobs)
  }, [])

  // "More like this": 4 fresh variations of a finished job — same prompt,
  // model and params, seed unpinned so the server fans out random seeds.
  const onMoreLikeThis = useCallback((job: MediaJob) => {
    const { seed: _seed, ...params } = job.params

    void submitJob({
      count: 4,
      modality: job.modality,
      model: job.model,
      params,
      provider: job.provider
    }).then(invalidateJobs)
  }, [])

  const sendToChat = useCallback((job: MediaJob) => {
    const path = job.result_paths[0]

    if (!path) {
      return
    }

    void host.attachFileToComposer(path).then(attached => {
      if (attached) {
        host.navigate('/')
      }
    })
  }, [])

  // Hidden (not broken) on host apps that predate the SDK door.
  const onSendToChat = canAttachToComposer(host) ? sendToChat : null

  const onUseAsInput = useCallback((job: MediaJob) => {
    const path = job.result_paths[0]

    if (path) {
      setStartImage(path)
      scrollToTop()
    }
  }, [scrollToTop])

  // "Reuse settings": restore the whole brief — model, prompt, parameters,
  // and the reference image when its file still exists. The modality filter
  // flips to the job's modality first so CreatePanel's reconciliation keeps
  // the restored model instead of moving it.
  const onReuseSettings = useCallback((job: MediaJob) => {
    const snapshot = reuseStateFromJob(job)

    setFilter(job.modality)
    setStartImage(snapshot.startImage)
    setReuse(snapshot)
    setLightbox(null)
    scrollToTop()
  }, [scrollToTop])

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto p-4" ref={scrollRef}>
      <header className="flex items-center justify-between">
        <h1 className="text-[0.9375rem] font-medium">{k.title}</h1>
        <SegmentedControl
          onChange={setFilter}
          options={[
            { id: 'all' as const, label: k.all },
            { id: 'image' as const, label: k.image },
            { id: 'video' as const, label: k.video },
            { id: 'audio' as const, label: k.music }
          ]}
          value={filter}
        />
      </header>

      <CreatePanel
        modalityFilter={filter}
        onClearStartImage={() => setStartImage('')}
        onProviderCatalog={providers => {
          providersRef.current = providers
        }}
        onReuseApplied={() => setReuse(null)}
        onStartImage={setStartImage}
        reuse={reuse}
        startImage={startImage}
      />

      {coverDraft && (
        <CoverPanel
          draft={coverDraft}
          onClose={() => setCoverDraft(null)}
        />
      )}
      {audioPanelJob && (
        <AudioPanel
          job={audioPanelJob}
          onClose={() => setAudioPanelJob(null)}
        />
      )}

      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">
            {k.queue} · {k.jobCount(active.length)}
          </h2>
          {active.map(job => (
            <QueueRow
              job={job}
              key={job.id}
              label={job.state === 'queued' ? k.stateQueued : k.stateRunning}
              onCancel={onCancel}
            />
          ))}
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        {mixSelection.ids.size > 0 && (
          <MixBar
            jobs={filtered}
            onClear={() => setMixSelection(clearAudioSelection(EMPTY_SELECTION))}
            selection={mixSelection}
          />
        )}
        <div className="flex items-center justify-between">
          <h2 className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">{k.library}</h2>
          {/* Finder-style thumbnail size slider (persisted). */}
          <label className="flex items-center gap-1.5 text-(--ui-text-quaternary)">
            <Codicon name="screen-normal" size="0.7rem" />
            <input
              aria-label={k.thumbSize}
              className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary)"
              max={THUMB_MAX}
              min={THUMB_MIN}
              onChange={event => setThumbSize(clampThumb(Number(event.target.value)))}
              step={8}
              style={{ accentColor: 'var(--dt-primary)' }}
              type="range"
              value={thumbSize}
            />
            <Codicon name="screen-full" size="0.85rem" />
          </label>
        </div>
        {filtered.length === 0 ? (
          <EmptyState description={k.emptyLibraryHint} title={k.emptyLibrary} />
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}
          >
            {filtered.map(job => (
              <LibraryCard
                job={job}
                key={job.id}
                mixSelected={mixSelection.ids.has(job.id)}
                onCoverThis={job1 => {
                  setAudioPanelJob(null)
                  setCoverDraft({
                    reference: jobReference(job1.id),
                    sourceTitle: String(job1.params.prompt ?? 'track').slice(0, 60)
                  })
                  scrollToTop()
                }}
                onEditAudio={job1 => {
                  setCoverDraft(null)
                  setAudioPanelJob(job1)
                  scrollToTop()
                }}
                onOpen={setLightbox}
                onRemove={onRemove}
                onRetry={onRetry}
                onReuseSettings={onReuseSettings}
                onSendToChat={onSendToChat}
                onToggleMixSelect={job1 =>
                  setMixSelection(sel => audioSelectionToggle(sel, job1.id))
                }
                onUseAsInput={onUseAsInput}
              />
            ))}
          </div>
        )}
      </section>

      {lightbox && (
        <Lightbox
          job={lightboxJob ?? lightbox}
          onClose={() => setLightbox(null)}
          onMoreLikeThis={
            // Needs a resubmittable row: a studio provider + a prompt. Agent
            // rows carry provider='agent'/tool-name models the engine can't
            // re-run directly; craft derivations have no generation params.
            canResubmit(lightboxJob ?? lightbox) && jobPrompt(lightboxJob ?? lightbox)
              ? job => {
                  onMoreLikeThis(job)
                  setLightbox(null)
                }
              : null
          }
          onNext={lightboxNext ? () => setLightbox(lightboxNext) : null}
          onPrev={lightboxPrev ? () => setLightbox(lightboxPrev) : null}
          onReuseSettings={canResubmit(lightboxJob ?? lightbox) ? onReuseSettings : null}
        />
      )}
    </div>
  )
}
