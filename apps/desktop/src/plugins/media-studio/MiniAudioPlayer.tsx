/**
 * Proportional audio player with a real seek bar — the lightbox's default
 * <audio controls> is cramped on multi-minute renders. No extra deps: the
 * file still streams through the data-URL bridge like before.
 */

import { Button, Codicon, host } from '@hermes/plugin-sdk'
import { type FC, useEffect, useRef, useState } from 'react'

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) {return '0:00'}
 const m = Math.floor(s / 60)
  const sec = Math.floor(s - m * 60)

  return `${m}:${String(sec).padStart(2, '0')}`
}

export const MiniAudioPlayer: FC<{ src: string; title?: string }> = ({ src, title }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    const a = audioRef.current

    if (!a) {return undefined}

    // New source (lightbox prev/next): the element resets, so mirror that.
    setPlaying(false)
    setCur(0)
    setDur(0)

    const onTime = () => setCur(a.currentTime)
    const onMeta = () => setDur(Number.isFinite(a.duration) ? a.duration : 0)
    const onEnd = () => setPlaying(false)
    const onPause = () => setPlaying(false)
    const onPlay = () => setPlaying(true)

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    a.addEventListener('pause', onPause)
    a.addEventListener('play', onPlay)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('play', onPlay)
    }
  }, [src])

  const toggle = async () => {
    const a = audioRef.current

    if (!a) {return}

    if (playing) {
      a.pause()
    } else {
      try {
        await a.play()
      } catch (err) {
        host.notify({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const seek = (frac: number) => {
    const a = audioRef.current

    if (!a || !Number.isFinite(dur) || dur <= 0) {return}

    a.currentTime = Math.max(0, Math.min(dur, frac * dur))
    setCur(a.currentTime)
  }

  const pct = dur > 0 ? Math.min(1, cur / dur) : 0

  return (
    <div className="flex w-full items-center gap-2 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 py-1.5">
      <audio preload="metadata" ref={audioRef} src={src} />
      <Button aria-label={playing ? 'Pause' : 'Play'} onClick={() => void toggle()} size="icon-sm" variant="ghost">
        <Codicon name={playing ? 'debug-pause' : 'play'} />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[0.625rem] text-(--ui-text-quaternary)">
          <span className="tabular-nums">{fmt(cur)}</span>
          {title ? <span className="mx-2 truncate text-center">{title}</span> : null}
          <span className="tabular-nums">{fmt(dur)}</span>
        </div>
        <input
          aria-label="Seek"
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary)"
          max={1}
          min={0}
          onChange={event => seek(Number(event.target.value))}
          step={0.001}
          style={{
            background: `linear-gradient(to right, var(--dt-primary) ${pct * 100}%, var(--ui-stroke-tertiary) ${pct * 100}%)`
          }}
          type="range"
          value={pct}
        />
      </div>
    </div>
  )
}
