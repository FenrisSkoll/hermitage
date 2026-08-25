import { ArrowRight, Shuffle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlbumGrid } from '../components/AlbumGrid'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { usePreferences } from '../context/PreferencesContext'
import { getAlbums } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import type { Album } from '../lib/types'

const HOME_FETCH_COUNT = 32
let homeCache: { newest: Album[]; recent: Album[] } | null = null

function gridMetrics(density: 'small' | 'medium' | 'large') {
  if (density === 'small') return { minCard: 132, gap: 14 }
  if (density === 'large') return { minCard: 220, gap: 22 }
  return { minCard: 170, gap: 19 }
}

export function HomePage() {
  const navigate = useNavigate()
  const { preferences } = usePreferences()
  const pageRef = useRef<HTMLDivElement>(null)
  const [newest, setNewest] = useState<Album[]>(() => homeCache?.newest || [])
  const [recent, setRecent] = useState<Album[]>(() => homeCache?.recent || [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!homeCache)
  const [rolling, setRolling] = useState(false)
  const [shelfCount, setShelfCount] = useState(8)

  useEffect(() => {
    const controller = new AbortController()
    if (!homeCache) setLoading(true)
    Promise.all([
      getAlbums('newest', 0, HOME_FETCH_COUNT, controller.signal),
      getAlbums('recent', 0, HOME_FETCH_COUNT, controller.signal)
    ])
      .then(([newestAlbums, recentAlbums]) => {
        setNewest(newestAlbums)
        setRecent(recentAlbums)
        homeCache = { newest: newestAlbums, recent: recentAlbums }
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const update = () => {
      const style = getComputedStyle(page)
      const usableWidth = Math.max(0, page.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0))
      if (usableWidth < 700) {
        setShelfCount(4)
        return
      }
      const { minCard, gap } = gridMetrics(preferences.albumGridDensity)
      const columns = Math.floor((usableWidth + gap) / (minCard + gap))
      setShelfCount(Math.max(2, Math.min(HOME_FETCH_COUNT, columns)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(page)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [preferences.albumGridDensity, preferences.desktopDensity])

  const random = async () => {
    setRolling(true)
    try {
      const [album] = await getAlbums('random', 0, 1)
      if (album) withViewTransition(() => navigate(`/album/${album.id}?random=1`))
    } finally {
      setRolling(false)
    }
  }

  if (loading) return <PageSkeleton kind="home" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="page home-page" ref={pageRef}>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">Good choice paralysis</span>
          <h1>What are we listening to?</h1>
          <p>Your collection, without recommendations getting in the way.</p>
        </div>
        <button className="random-hero" onClick={random} disabled={rolling}><Shuffle size={22} />{rolling ? 'Rolling…' : 'Pick an album for me'}</button>
      </section>

      <Section title="Recently added" to="/recently-added" albums={newest.slice(0, shelfCount)} navigate={navigate} />
      <Section title="Recently played" to="/recently-played" albums={recent.slice(0, shelfCount)} navigate={navigate} />
    </div>
  )
}

function Section({ title, to, albums, navigate }: { title: string; to: string; albums: Album[]; navigate: ReturnType<typeof useNavigate> }) {
  if (!albums.length) return null
  return (
    <section className="page-section home-shelf">
      <div className="section-heading"><h2>{title}</h2><button className="section-link" onClick={() => withViewTransition(() => navigate(to))}>See all <ArrowRight size={15} /></button></div>
      <AlbumGrid albums={albums} />
    </section>
  )
}
