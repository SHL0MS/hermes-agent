/**
 * Media Studio — a generative media workspace as a bundled plugin: a full
 * `/media` page (create form + durable job queue + library of everything
 * generated, including the agent's own chat generations), a sidebar entry,
 * and a live in-flight count in the status bar.
 *
 * Backend: `plugins/media-studio/dashboard/plugin_api.py`, reached through
 * the namespace-scoped REST door (`/api/plugins/media-studio`). Providers:
 * fal (managed gateway or FAL_KEY) and Krea (KREA_API_KEY).
 */

import {
  Codicon,
  type HermesPlugin,
  host,
  type RouteContribution,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution,
  STATUSBAR_AREAS,
  Tip,
  useQuery
} from '@hermes/plugin-sdk'

import { bindApi, fetchJobs, isTerminal, JOBS_KEY } from './api'
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
    'Generative media workspace — generate images and video against portal providers (fal, Krea) with a durable job queue and a library of everything generated.',
  register(ctx) {
    ctx.i18n.register(STUDIO_LOCALES)
    ctx.onDispose(bindApi(ctx.rest, ctx.socket))

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
      }
    ])
  }
}

export default plugin
