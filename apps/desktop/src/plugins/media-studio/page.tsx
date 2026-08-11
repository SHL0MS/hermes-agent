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
  useQuery
} from '@hermes/plugin-sdk'
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  cancelJob,
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
  type SubmitBody,
  submitJob
} from './api'
import { useStudio } from './i18n'

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

const CreatePanel: FC<{
  onProviderCatalog: (providers: ProviderInfo[]) => void
  startImage: string
  onClearStartImage: () => void
}> = ({ onClearStartImage, onProviderCatalog, startImage }) => {
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

  const patch = useCallback((update: Partial<typeof state>) => setState(prev => ({ ...prev, ...update })), [])

  // First available provider/model become the initial selection.
  useEffect(() => {
    if (state.provider || providers.length === 0) {
      return
    }

    const first = providers.find(p => p.available) ?? providers[0]

    patch({ modelId: first.models[0]?.id ?? '', provider: first.name })
  }, [patch, providers, state.provider])

  const provider = providers.find(p => p.name === state.provider)
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

    submit.mutate({ modality: model.modality, model: model.id, params, provider: provider.name })
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

            patch({ modelId: next?.models[0]?.id ?? '', provider: value })
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
              {(provider?.models ?? []).map(m => (
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
        <p className="rounded-md bg-(--ui-bg-tertiary) px-3 py-2 text-[0.75rem] text-(--ui-text-secondary)">
          {provider.hint}
        </p>
      )}

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
                {k.generate}
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
  const [src, setSrc] = useState('')
  const path = job.result_paths[0]
  const isVideo = job.modality === 'video'

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
      {isVideo ? (
        <video autoPlay className="max-h-full max-w-full rounded-lg" controls src={mediaVideoUrl(path)} />
      ) : src ? (
        <img alt={String(job.params.prompt ?? '')} className="max-h-full max-w-full rounded-lg object-contain" src={src} />
      ) : (
        <GlyphSpinner className="text-[1.5rem]" />
      )}
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

type LibraryFilter = 'all' | 'image' | 'video'

export const MediaStudioPage: FC = () => {
  const k = useStudio()
  const [filter, setFilter] = useState<LibraryFilter>('all')
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
