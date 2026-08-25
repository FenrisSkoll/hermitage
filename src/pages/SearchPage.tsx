import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlbumGrid } from '../components/AlbumGrid'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { SongList } from '../components/SongList'
import { searchLibrary } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import type { Album, Artist, Song } from '../lib/types'

export function SearchPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const query = params.get('q') || ''
  const [results, setResults] = useState<{ artists: Artist[]; albums: Album[]; songs: Song[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!query) return
    const controller = new AbortController()
    setResults(null)
    setError('')
    searchLibrary(query, controller.signal)
      .then(setResults)
      .catch((err) => { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message) })
    return () => controller.abort()
  }, [query])

  if (!query) return <div className="empty-state">Type something into search.</div>
  if (error) return <ErrorState message={error} />
  if (!results) return <PageSkeleton kind="grid" />

  const empty = !results.artists.length && !results.albums.length && !results.songs.length
  return (
    <div className="page search-page">
      <div className="page-heading"><div><span className="eyebrow">Search</span><h1>“{query}”</h1></div></div>
      {empty && <div className="empty-state">No matches.</div>}
      {!!results.artists.length && <section className="page-section"><div className="section-heading"><h2>Artists</h2></div><div className="search-artists">{results.artists.map((artist) => <button key={artist.id} onClick={() => withViewTransition(() => navigate(`/artist/${artist.id}`))}><span>{artist.name.slice(0, 2).toUpperCase()}</span><strong>{artist.name}</strong></button>)}</div></section>}
      {!!results.albums.length && <section className="page-section"><div className="section-heading"><h2>Albums</h2></div><AlbumGrid albums={results.albums} compact /></section>}
      {!!results.songs.length && <section className="page-section"><div className="section-heading"><h2>Songs</h2></div><SongList songs={results.songs} showAlbum /></section>}
    </div>
  )
}
