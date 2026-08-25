import { useEffect, useRef, useState } from 'react'
import { coverUrl } from '../lib/api'

export function ArtworkBackdrop({ coverArt, className = '' }: { coverArt?: string; className?: string }) {
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
      }, 820)
    }

    if (!next) {
      swap()
    } else {
      const image = new Image()
      image.decoding = 'async'
      image.src = coverUrl(next, 1200)
      image.decode().catch(() => undefined).then(swap)
    }

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [coverArt])

  return (
    <div className={`artwork-backdrop ${className}`} aria-hidden="true">
      {previous ? <div className="artwork-backdrop__layer artwork-backdrop__layer--back" style={{ backgroundImage: `url(${coverUrl(previous, 1200)})` }} /> : null}
      {displayed ? <div key={displayed} className="artwork-backdrop__layer artwork-backdrop__layer--front" style={{ backgroundImage: `url(${coverUrl(displayed, 1200)})` }} /> : null}
      <div className="artwork-backdrop__veil" />
    </div>
  )
}
