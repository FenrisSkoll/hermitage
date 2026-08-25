import { useEffect, useRef, useState } from 'react'
import { coverUrl, getArtist } from '../lib/api'
import type { Album, Artist } from '../lib/types'

const coverCache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | undefined>>()
const workQueue: Array<() => void> = []
let active = 0
const maxConcurrent = 4

function pump() {
  while (active < maxConcurrent && workQueue.length) {
    active += 1
    workQueue.shift()?.()
  }
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    workQueue.push(() => {
      work().then(resolve, reject).finally(() => {
        active -= 1
        pump()
      })
    })
    pump()
  })
}

export function pickLatestAlbumCover(albums: Album[] = []) {
  const withArt = albums.filter((album) => album.coverArt)
  if (!withArt.length) return undefined
  return [...withArt].sort((a, b) => {
    const yearDelta = (b.year || 0) - (a.year || 0)
    if (yearDelta) return yearDelta
    const bCreated = b.created ? Date.parse(b.created) || 0 : 0
    const aCreated = a.created ? Date.parse(a.created) || 0 : 0
    return bCreated - aCreated
  })[0]?.coverArt
}

async function resolveArtistCover(artist: Artist) {
  if (artist.coverArt) return artist.coverArt
  const cached = coverCache.get(artist.id)
  if (cached !== undefined) return cached || undefined
  const existing = pending.get(artist.id)
  if (existing) return existing

  const request = enqueue(async () => {
    try {
      const full = await getArtist(artist.id)
      const cover = pickLatestAlbumCover(full.album)
      coverCache.set(artist.id, cover || null)
      return cover
    } catch {
      coverCache.set(artist.id, null)
      return undefined
    } finally {
      pending.delete(artist.id)
    }
  })
  pending.set(artist.id, request)
  return request
}

export function ArtistArtwork({ artist, className = '', size = 360 }: { artist: Artist; className?: string; size?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [cover, setCover] = useState<string | undefined>(() => artist.coverArt || coverCache.get(artist.id) || undefined)

  useEffect(() => {
    setCover(artist.coverArt || coverCache.get(artist.id) || undefined)
    if (artist.coverArt || coverCache.has(artist.id)) return
    let cancelled = false
    const load = () => void resolveArtistCover(artist).then((value) => { if (!cancelled) setCover(value) })
    const host = hostRef.current
    if (!host || !('IntersectionObserver' in window)) {
      load()
      return () => { cancelled = true }
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      load()
    }, { rootMargin: '450px' })
    observer.observe(host)
    return () => { cancelled = true; observer.disconnect() }
  }, [artist.id, artist.coverArt])

  const initials = artist.name.slice(0, 2).toUpperCase()
  return (
    <div ref={hostRef} className={`artist-artwork ${className}`} aria-hidden="true">
      {cover ? <img src={coverUrl(cover, size)} alt="" loading="lazy" onError={() => setCover(undefined)} /> : <span>{initials}</span>}
    </div>
  )
}
