import { useEffect, useRef, useState } from 'react'
import { coverUrl } from '../lib/api'

export function CrossfadeCover({
  coverArt,
  size,
  className = '',
  transitionName
}: {
  coverArt?: string
  size: number
  className?: string
  transitionName?: string
}) {
  const [displayed, setDisplayed] = useState(coverArt || '')
  const [previous, setPrevious] = useState('')
  const displayedRef = useRef(coverArt || '')

  useEffect(() => {
    const next = coverArt || ''
    if (next === displayedRef.current) return
    let cancelled = false
    let timer = 0

    const swap = () => {
      if (cancelled) return
      setPrevious(displayedRef.current)
      displayedRef.current = next
      setDisplayed(next)
      timer = window.setTimeout(() => {
        if (!cancelled) setPrevious('')
      }, 360)
    }

    if (!next) {
      swap()
    } else {
      const image = new Image()
      image.decoding = 'async'
      image.src = coverUrl(next, size)
      image.decode().catch(() => undefined).then(swap)
    }

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [coverArt, size])

  return (
    <div className={`crossfade-cover ${className}`} style={transitionName ? { viewTransitionName: transitionName } : undefined}>
      {previous ? <img className="crossfade-cover__previous" src={coverUrl(previous, size)} alt="" /> : null}
      {displayed ? <img key={displayed} className="crossfade-cover__current" src={coverUrl(displayed, size)} alt="" /> : <span className="art-placeholder" />}
    </div>
  )
}
