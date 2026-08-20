import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/hermes'

import { SidebarSessionsSection, VIRTUALIZE_THRESHOLD } from './sessions-section'
import type { VirtualSessionListProps } from './virtual-session-list'

afterEach(cleanup)

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      sidebar: {
        dateDivider: {
          earlierThisMonth: 'Earlier this month',
          lastMonth: 'Last month',
          lastWeek: 'Last week',
          older: 'Older',
          today: 'Today',
          yesterday: 'Yesterday'
        }
      }
    }
  })
}))

const mockVirtualListPropsHistory: VirtualSessionListProps[] = []

vi.mock('./virtual-session-list', () => ({
  VirtualSessionList: (props: VirtualSessionListProps) => {
    mockVirtualListPropsHistory.push(props)

    return <div data-testid="virtual-session-list">Virtual List ({props.rows.length} rows)</div>
  }
}))

vi.mock('./session-row', () => ({
  SidebarSessionRow: ({ session }: { session: SessionInfo }) => (
    <div data-testid={`session-row-${session.id}`}>{session.id}</div>
  )
}))

function makeSession(id: string, startedAt = 1000): SessionInfo {
  return {
    handoff_platform: null,
    handoff_state: null,
    id,
    last_active: startedAt,
    profile: 'default',
    started_at: startedAt
  } as unknown as SessionInfo
}

function generateSessions(count: number): SessionInfo[] {
  return Array.from({ length: count }, (_, i) => makeSession(`session-${i + 1}`, 10000 - i * 100))
}

const noop = () => {}

describe('SidebarSessionsSection memoization & virtualizer stability', () => {
  it('memoizes flatRows and passes the exact same rows array reference across parent re-renders', () => {
    mockVirtualListPropsHistory.length = 0

    const sessions = generateSessions(VIRTUALIZE_THRESHOLD + 5)

    const { rerender } = render(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        label="Sessions"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={false}
        sessions={sessions}
      />
    )

    expect(mockVirtualListPropsHistory.length).toBe(1)
    const initialRowsRef = mockVirtualListPropsHistory[0].rows
    expect(initialRowsRef.length).toBeGreaterThan(VIRTUALIZE_THRESHOLD)

    // Re-render parent with the exact same sessions array and props
    rerender(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        label="Sessions"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={false}
        sessions={sessions}
      />
    )

    expect(mockVirtualListPropsHistory.length).toBe(2)
    const nextRowsRef = mockVirtualListPropsHistory[1].rows

    // Confirm that the flatRows array reference remains strictly identical across renders (useMemo proof)
    expect(nextRowsRef).toBe(initialRowsRef)
  })

  it('re-computes flatRows reference when grouping or sessions change', () => {
    mockVirtualListPropsHistory.length = 0

    const initialSessions = generateSessions(VIRTUALIZE_THRESHOLD + 2)

    const { rerender } = render(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        grouping="none"
        label="Sessions"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={false}
        sessions={initialSessions}
      />
    )

    const firstRowsRef = mockVirtualListPropsHistory[0].rows

    // Switch on date dividers
    rerender(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        grouping="date"
        label="Sessions"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={false}
        sessions={initialSessions}
      />
    )

    const secondRowsRef = mockVirtualListPropsHistory[1].rows
    expect(secondRowsRef).not.toBe(firstRowsRef)

    // Change sessions array identity
    const updatedSessions = generateSessions(VIRTUALIZE_THRESHOLD + 4)
    rerender(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        grouping="date"
        label="Sessions"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={false}
        sessions={updatedSessions}
      />
    )

    const thirdRowsRef = mockVirtualListPropsHistory[2].rows
    expect(thirdRowsRef).not.toBe(secondRowsRef)
  })
})

describe('SidebarSectionHeader stickiness', () => {
  // The Pinned / messaging / cron sections scroll in the shared sidebar
  // scroller; without sticky positioning their headers ride out of view under
  // the search field while their own rows are still passing. The Sessions
  // section survived only because it owns an internal scroller. Pin the
  // contract here so a header class rework can't silently regress the
  // shared-scroller sections again.
  it('renders the section header sticky with an opaque fill masking rows that scroll beneath it', () => {
    render(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        label="Pinned"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={noop}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={true}
        sessions={generateSessions(3)}
      />
    )

    const header = screen.getByRole('button', { name: /Pinned/ }).parentElement as HTMLElement

    expect(header.className).toContain('sticky')
    expect(header.className).toContain('top-0')
    // A see-through stuck header reads as rows bleeding through the label:
    // it needs its own fill, and data-glass-opaque keeps that fill solid
    // when window glass makes the surface tokens transparent.
    expect(header.className).toContain('bg-(--ui-sidebar-surface-background)')
    expect(header.hasAttribute('data-glass-opaque')).toBe(true)
  })

  it('keeps the header toggle working and renders the static variant sticky too', () => {
    const onToggle = vi.fn()

    const { rerender } = render(
      <SidebarSessionsSection
        activeSessionId={null}
        emptyState={<div>Empty</div>}
        label="Pinned"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={onToggle}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={true}
        sessions={generateSessions(2)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Pinned/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    // Non-collapsible headers (entered-project view) share the same shell.
    rerender(
      <SidebarSessionsSection
        activeSessionId={null}
        collapsible={false}
        emptyState={<div>Empty</div>}
        label="Pinned"
        onArchiveSession={noop}
        onDeleteSession={noop}
        onResumeSession={noop}
        onToggle={onToggle}
        onTogglePin={noop}
        onToggleUnread={noop}
        open={true}
        pinned={true}
        sessions={generateSessions(2)}
      />
    )

    expect(screen.queryByRole('button', { name: /Pinned/ })).toBeNull()
    const staticHeader = screen.getByText('Pinned').closest('.group\\/section') as HTMLElement
    expect(staticHeader.className).toContain('sticky')
  })
})
