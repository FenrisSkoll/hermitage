import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../context/PlayerContext'

/**
 * Keeps synced-lyrics timing close to the media element without forcing the
 * whole player context to re-render at animation-frame frequency.
 */
export function usePrecisePlaybackTime(enabled: boolean, fallback: number) {
  const player = usePlayer()
  const [time, setTime] = useState(fallback)
  const fallbackRef = useRef(fallback)

  useEffect(() => { fallbackRef.current = fallback }, [fallback])

  useEffect(() => {
    if (!enabled || !player.playing) {
      setTime(enabled ? player.getPlaybackTime() : fallbackRef.current)
      return
    }

    let frame = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      // ~20 Hz is more than enough for line-level LRC timing, while avoiding a
      // 60 fps React render loop on long lyrics pages.
      if (now - lastUpdate >= 50) {
        setTime(player.getPlaybackTime())
        lastUpdate = now
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [enabled, player.current?.id, player.playing, player.getPlaybackTime])

  useEffect(() => {
    if (!enabled) setTime(fallback)
  }, [enabled, fallback])

  return time
}
