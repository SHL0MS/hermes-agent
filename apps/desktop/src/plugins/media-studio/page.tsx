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
  cancelJob,
  clearProviderKey,
  deleteJob,
  fetchJobs,
  fetchProviders,
  invalidateJobs,
  isTerminal,
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
import { useStudio } from './i18n'
import { clampCount, jobParamEntries, jobPrompt } from './job-params'
import { type ModalityFilter, reconcileSelection, visibleModels } from './model-choices'

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const ASPECT_DEFAULTS = ['1:1', '16:9', '9:16', '4:3', '3:4']

function stateTone(state: MediaJob['state']): string {
  if (state === 'done') {
    return 'text-(--ui-text-secondary)'
  }

  if (state === 'failed' || state === 'expired') {
    return 'text-(--ui-danger, #e5484d)'
  }

  return 'text-(--ui-accent)'
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
  startImage: string
  onClearStartImage: () => void
}> = ({ modalityFilter, onClearStartImage, onProviderCatalog, startImage }) => {
  const k = useStudio()
  const { data } = useQuery({ queryFn: fetchProviders, queryKey: PROVIDERS_KEY, staleTime: 60_000 })
  const providers = useMemo(() => data?.providers ?? [], [data])

  useEffect(() => onProviderCatalog(providers), [onProviderCatalog, providers])

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
  })

  // Batch count: preset 1/2/4 or a free-typed custom N (fanned out server-side).
  const [countChoice, setCountChoice] = useState<string>('1')
  const [customCount, setCustomCount] = useState('8')

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

  const modelChoices = useMemo(
    () => visibleModels(provider?.models ?? [], modalityFilter),
    [modalityFilter, provider]
  )

  const model: ModelInfo | undefined = provider?.models.find(m => m.id === state.modelId)
  const supports = useMemo(() => model?.supports ?? {}, [model])
  const aspectChoices = model?.aspect_ratios ?? ASPECT_DEFAULTS
  const modality = model?.modality ?? 'image'

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

  const canSubmit = Boolean(state.prompt.trim() && provider?.available && model) && !submit.isPending
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
            const next = providers.find(p => p.name === value)
            const nextModels = visibleModels(next?.models ?? [], modalityFilter)

            patch({ modelId: (nextModels[0] ?? next?.models[0])?.id ?? '', provider: value })
          }} value={state.provider}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map(p => (
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
              {modelChoices.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    <Codicon
                      className="text-(--ui-text-quaternary)"
                      name={m.modality === 'video' ? 'device-camera-video' : 'file-media'}
                      size="0.75rem"
                    />
                    {m.display}
                  </span>
                </SelectItem>
              ))}
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
      {provider?.available && provider.key_var && <ProviderKeyStatus provider={provider} />}

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

      <Textarea
        className="min-h-20"
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

      {supports.negative_prompt && (
        <Input
          className="h-8"
          onChange={event => patch({ negativePrompt: event.target.value })}
          placeholder={k.negativePrompt}
          value={state.negativePrompt}
        />
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
        <p className="truncate text-[0.75rem]">{String(job.params.prompt ?? '')}</p>
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

const Lightbox: FC<{ job: MediaJob; onClose: () => void }> = ({ job, onClose }) => {
  const k = useStudio()
  const [src, setSrc] = useState('')
  const [copied, setCopied] = useState(false)
  const path = job.result_paths[0]
  const isVideo = job.modality === 'video'
  const prompt = jobPrompt(job)
  const entries = jobParamEntries(job)

  const paramLabel: Record<(typeof entries)[number]['key'], string> = {
    aspectRatio: k.aspectRatio,
    audio: k.audio,
    duration: k.duration,
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
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!path) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full max-w-full flex-col items-center gap-3"
        onClick={event => event.stopPropagation()}
        role="presentation"
      >
        {isVideo ? (
          <video autoPlay className="min-h-0 max-w-full flex-1 rounded-lg" controls src={mediaVideoUrl(path)} />
        ) : src ? (
          <img alt={prompt} className="min-h-0 max-w-full flex-1 rounded-lg object-contain" src={src} />
        ) : (
          <GlyphSpinner className="text-[1.5rem]" />
        )}

        <div className="w-full max-w-2xl rounded-lg bg-black/70 p-3 text-white backdrop-blur">
          {prompt && (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap text-[0.75rem] leading-relaxed">{prompt}</p>
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
  onSendToChat: (job: MediaJob) => void
  onUseAsInput: (job: MediaJob) => void
  onRemove: (id: string) => void
  onRetry: (job: MediaJob) => void
}> = ({ job, onOpen, onRemove, onRetry, onSendToChat, onUseAsInput }) => {
  const k = useStudio()
  const failed = job.state === 'failed' || job.state === 'expired'
  const thumb = job.thumb_paths[0] ?? job.result_paths[0]
  const prompt = jobPrompt(job)

  const stateLabel: Record<MediaJob['state'], string> = {
    cancelled: k.stateCancelled,
    done: k.stateDone,
    expired: k.stateExpired,
    failed: k.stateFailed,
    queued: k.stateQueued,
    running: k.stateRunning
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-(--ui-stroke-secondary)">
      {failed ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 p-3 text-center">
          <Codicon className="text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
          <p className="line-clamp-3 text-[0.6875rem] text-(--ui-text-tertiary)">{job.error}</p>
          <Button onClick={() => onRetry(job)} size="sm" variant="outline">
            {k.retry}
          </Button>
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

      {job.modality === 'video' && !failed && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white">
          <Codicon name="play" size="0.625rem" />
        </span>
      )}
      {job.source === 'agent' && (
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[0.625rem] text-white">
          {k.agentSource}
        </span>
      )}

      {prompt && !failed && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-2 pb-6 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="line-clamp-2 text-[0.6875rem] leading-snug text-white/90">{prompt}</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {!failed && job.result_paths[0] && (
          <>
            <Tip label={k.sendToChat}>
              <Button className="text-white" onClick={() => onSendToChat(job)} size="icon-sm" variant="ghost">
                <Codicon name="comment" />
              </Button>
            </Tip>
            {job.modality === 'image' && (
              <Tip label={k.useAsInput}>
                <Button className="text-white" onClick={() => onUseAsInput(job)} size="icon-sm" variant="ghost">
                  <Codicon name="arrow-right" />
                </Button>
              </Tip>
            )}
            <Tip label={k.revealFile}>
              <Button
                className="text-white"
                onClick={() => void window.hermesDesktop?.revealPath?.(job.result_paths[0])}
                size="icon-sm"
                variant="ghost"
              >
                <Codicon name="folder-opened" />
              </Button>
            </Tip>
          </>
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
  const providersRef = useRef<ProviderInfo[]>([])

  const { data } = useQuery({
    queryFn: fetchJobs,
    queryKey: JOBS_KEY,
    // The events socket invalidates on every transition; this interval is the
    // socketless fallback (OAuth remotes).
    refetchInterval: 5_000
  })

  const jobs = useMemo(() => data?.jobs ?? [], [data])
  const active = jobs.filter(job => !isTerminal(job.state))
  const library = jobs.filter(job => isTerminal(job.state) && job.state !== 'cancelled')
  const filtered = filter === 'all' ? library : library.filter(job => job.modality === filter)

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

  const onSendToChat = useCallback((job: MediaJob) => {
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

  const onUseAsInput = useCallback((job: MediaJob) => {
    const path = job.result_paths[0]

    if (path) {
      setStartImage(path)
      window.scrollTo({ behavior: 'smooth', top: 0 })
    }
  }, [])

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[0.9375rem] font-medium">{k.title}</h1>
        <SegmentedControl
          onChange={setFilter}
          options={[
            { id: 'all' as const, label: k.all },
            { id: 'image' as const, label: k.image },
            { id: 'video' as const, label: k.video }
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
        startImage={startImage}
      />

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
        <h2 className="text-[0.6875rem] uppercase tracking-wide text-(--ui-text-quaternary)">{k.library}</h2>
        {filtered.length === 0 ? (
          <EmptyState description={k.emptyLibraryHint} title={k.emptyLibrary} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map(job => (
              <LibraryCard
                job={job}
                key={job.id}
                onOpen={setLightbox}
                onRemove={onRemove}
                onRetry={onRetry}
                onSendToChat={onSendToChat}
                onUseAsInput={onUseAsInput}
              />
            ))}
          </div>
        )}
      </section>

      {lightbox && <Lightbox job={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
