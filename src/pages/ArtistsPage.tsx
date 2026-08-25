import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArtistArtwork } from '../components/ArtistArtwork'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { getArtists } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import type { Artist } from '../lib/types'

export function ArtistsPage() {
  const navigate = useNavigate()
  const [artists, setArtists] = useState<Artist[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    getArtists(controller.signal)
      .then(setArtists)
      .catch((err) => { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? artists.filter((artist) => artist.name.toLowerCase().includes(q)) : artists
  }, [artists, filter])

  if (loading) return <PageSkeleton kind="grid" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="page">
      <div className="page-heading page-heading--with-filter">
        <div><span className="eyebrow">Your library</span><h1>Artists</h1><p>{artists.length.toLocaleString()} artists</p></div>
        <input className="inline-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter artists" />
      </div>
      <div className="artist-grid">
        {filtered.map((artist) => (
          <button className="artist-card" key={artist.id} onClick={() => withViewTransition(() => navigate(`/artist/${artist.id}`))}>
            <ArtistArtwork artist={artist} className="artist-card__avatar" />
            <strong>{artist.name}</strong><span>{artist.albumCount || 0} albums</span>
          </button>
        ))}
      </div>
    </div>
  )
}
