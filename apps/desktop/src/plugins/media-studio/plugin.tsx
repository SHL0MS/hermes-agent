/**
 * Media Studio — a generative media workspace as a bundled plugin: a full
 * `/media` page (create form + durable job queue + library of everything
 * generated, including the agent's own chat generations), a sidebar entry,
 * a live in-flight count in the status bar, and the agentic-workflow seams:
 *
 *  - composer "+" menu row → attach the latest finished generation
 *  - command palette entries (open studio / attach latest)
 *  - keybind (mod+alt+g) → jump to the studio
 *  - completion notifications with a View action while you work elsewhere
 *
 * Backend: `plugins/media-studio/dashboard/plugin_api.py`, reached through
 * the namespace-scoped REST door (`/api/plugins/media-studio`). Providers:
 * fal (managed gateway or FAL_KEY) and Krea (KREA_API_KEY).
 */

import {
  Codicon,
  COMPOSER_AREAS,
  type ComposerAttachmentProvider,
  type HermesPlugin,
  host,
  type KeybindContribution,
  KEYBINDS_AREA,
  PALETTE_AREA,
  type PaletteContribution,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution,
  STATUSBAR_AREAS,
  Tip,
  useQuery
} from '@hermes/plugin-sdk'

import {
  bindApi,
  canAttachToComposer,
  fetchJob,
  fetchJobs,
  isTerminal,
  JOBS_KEY,
  latestResult,
  onJobTerminal
} from './api'
import { STUDIO_LOCALES, useStudio } from './i18n'
import { MediaStudioPage } from './page'

/** Live "N generating" pill — hidden when idle, clicks through to the page.
 *  Shares the jobs query (one cache, one poll) with the page. */
function StudioCount() {
  const k = useStudio()

  const { data } = useQuery({
    queryFn: fetchJobs,
    queryKey: JOBS_KEY,
    refetchInterval: 60_000
  })

  const active = (data?.jobs ?? []).filter(job => !isTerminal(job.state)).length

  if (active === 0) {
    return null
  }

  return (
    <Tip label={k.jobCount(active)}>
      <button
        className="inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground"
        onClick={() => host.navigate('/media')}
        type="button"
      >
        <Codicon name="sparkle" size="0.7rem" />
        <span>{active}</span>
      </button>
    </Tip>
  )
}

const plugin: HermesPlugin = {
  id: 'media-studio',
  name: 'Media Studio',
  description:
    'Generative media workspace — generate images, video, and music against portal providers (fal, Krea, MiniMax) with a durable job queue and a library of everything generated.',
  register(ctx) {
    ctx.i18n.register(STUDIO_LOCALES)
    ctx.onDispose(bindApi(ctx.rest, ctx.socket))

    const t = (key: string) => ctx.i18n.t(key)

    const openStudio = () => host.navigate('/media')
    // Older host apps predate the attachFileToComposer SDK door — hide the
    // send-to-chat affordances there instead of throwing at click time.
    const hasComposerDoor = canAttachToComposer(host)

    /** Stage the newest finished generation onto the chat composer. */
    const attachLatest = async () => {
      try {
        const job = await latestResult()
        const path = job?.result_paths[0]

        if (!path) {
          host.notify({ kind: 'info', message: t('attachLatestEmpty') })

          return
        }

        await host.attachFileToComposer(path)
      } catch (error) {
        host.notifyError(error, 'Media Studio')
      }
    }

    // Completion toasts: only for STUDIO-submitted jobs (agent chat output
    // already renders inline; import-indexer rows never transition live), and
    // only while the user is elsewhere — on /media the queue rail IS the
    // feedback. The socket starts at the live seq, so these are real-time
    // transitions, never history replay.
    ctx.onDispose(
      onJobTerminal((jobId, state) => {
        if (window.location.hash.startsWith('#/media')) {
          return
        }

        void fetchJob(jobId)
          .then(({ job }) => {
            if (job.source !== 'studio') {
              return
            }

            const prompt = String(job.params.prompt ?? '')
            const label = prompt.length > 64 ? `${prompt.slice(0, 64)}…` : prompt

            host.notify({
              // Deep-link: land on /media with the finished item's lightbox
              // already open (the page reads ?job= on mount).
              action: {
                label: t('notifView'),
                onClick: () => host.navigate(`/media?job=${encodeURIComponent(jobId)}`)
              },
              kind: state === 'done' ? 'success' : 'error',
              message: label || job.model,
              title: state === 'done' ? t('notifDone') : t('notifFailed')
            })
          })
          .catch(() => undefined)
      })
    )

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/media' } satisfies RouteContribution,
        render: () => <MediaStudioPage />
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 55,
        data: { codicon: 'sparkle', label: 'Media', path: '/media' } satisfies SidebarNavContribution
      },
      {
        id: 'count',
        area: STATUSBAR_AREAS.right,
        order: 30,
        render: () => <StudioCount />
      },
      ...(hasComposerDoor
        ? [
            {
              id: 'attach-latest',
              area: COMPOSER_AREAS.attachments,
              data: {
                icon: 'sparkle',
                label: t('attachMenuLatest'),
                run: () => void attachLatest()
              } satisfies ComposerAttachmentProvider
            }
          ]
        : []),
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'media-studio.open',
          action: 'media-studio.open',
          keywords: ['media', 'studio', 'generate', 'image', 'video', 'music', 'fal', 'krea', 'minimax'],
          label: t('paletteOpen'),
          run: openStudio
        } satisfies PaletteContribution
      },
      ...(hasComposerDoor
        ? [
            {
              id: 'attach-latest-palette',
              area: PALETTE_AREA,
              data: {
                id: 'media-studio.attachLatest',
                keywords: ['media', 'attach', 'generation', 'chat', 'image', 'video'],
                label: t('paletteAttachLatest'),
                run: () => void attachLatest()
              } satisfies PaletteContribution
            }
          ]
        : []),
      {
        id: 'open-keybind',
        area: KEYBINDS_AREA,
        data: {
          id: 'media-studio.open',
          category: 'view',
          defaults: ['mod+alt+g'],
          label: t('paletteOpen'),
          run: openStudio
        } satisfies KeybindContribution
      }
    ])
  }
}

export default plugin
