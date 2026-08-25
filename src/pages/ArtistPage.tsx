import { Heart, LoaderCircle, Play, Shuffle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlbumGrid } from '../components/AlbumGrid'
import { pickLatestAlbumCover } from '../components/ArtistArtwork'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { usePlayer } from '../context/PlayerContext'
import { coverUrl, getAlbum, getArtist, setStar } from '../lib/api'
import type { Album, Artist, Song } from '../lib/types'

const artistPageCache = new Map<string, Artist & { album: Album[] }>()

export function ArtistPage() {
  const { id } = useParams()
  const player = usePlayer()
  const [artist, setArtist] = useState<(Artist & { album: Album[] }) | null>(() => id ? artistPageCache.get(id) || null : null)
  const [error, setError] = useState('')
  const [playLoading, setPlayLoading] = useState(false)
  const [, rerender] = useState(0)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const cached = artistPageCache.get(id)
    if (cached) setArtist(cached)
    setError('')
    getArtist(id, controller.signal)
      .then((loaded) => { artistPageCache.set(id, loaded); setArtist(loaded) })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message)
      })
    return () => controller.abort()
  }, [id])

  if (error) return <ErrorState message={error} />
  if (!artist) return <PageSkeleton kind="artist" />

  const playArtist = async (shuffle = false) => {
    if (playLoading) return
    setPlayLoading(true)
    try {
      // Load in parallel, but use cached album objects where we already visited them.
      const albums = await Promise.all(artist.album.slice(0, 20).map((album) => getAlbum(album.id)))
      let songs: Song[] = albums.flatMap((album) => album.song)
      if (shuffle) songs = songs.sort(() => Math.random() - 0.5)
      player.playQueue(songs, 0)
    } finally {
      setPlayLoading(false)
    }
  }

  const favourite = async () => {
    await setStar({ artistId: artist.id }, !artist.starred)
    artist.starred = artist.starred ? undefined : new Date().toISOString()
    rerender((value) => value + 1)
  }

  const heroCover = artist.coverArt || pickLatestAlbumCover(artist.album)

  return (
    <div className="page artist-page">
      <section className="artist-hero">
        <div className="artist-hero__avatar artist-hero__avatar--art">{heroCover ? <img src={coverUrl(heroCover, 620)} alt="" /> : <span>{artist.name.slice(0, 2).toUpperCase()}</span>}</div>
        <div><span className="eyebrow">Artist</span><h1>{artist.name}</h1><p>{artist.album.length} albums in your library</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => playArtist(false)} disabled={playLoading}>{playLoading ? <LoaderCircle className="spin" size={18} /> : <Play size={18} fill="currentColor" />} Play</button>
            <button className="secondary-button" onClick={() => playArtist(true)} disabled={playLoading}><Shuffle size={18} /> Shuffle</button>
            <button className={`circle-action ${artist.starred ? 'is-active' : ''}`} onClick={favourite}><Heart size={20} fill={artist.starred ? 'currentColor' : 'none'} /></button>
          </div>
        </div>
      </section>
      <section className="page-section"><div className="section-heading"><h2>Albums</h2></div><AlbumGrid albums={artist.album} /></section>
    </div>
  )
}
