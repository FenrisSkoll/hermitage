import { ArrowLeft, ChevronRight, Heart, MoreHorizontal, Play, Shuffle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { SongList } from '../components/SongList'
import { StarRating } from '../components/StarRating'
import { usePlayer } from '../context/PlayerContext'
import { coverUrl, getAlbum, getAlbums, setRating, setStar } from '../lib/api'
import { formatTime } from '../lib/format'
import { withViewTransition } from '../lib/navigation'
import { applyArtworkTheme } from '../lib/theme'
import { showToast } from '../lib/toast'
import type { Album, Song } from '../lib/types'

const albumPageCache = new Map<string, Album & { song: Song[] }>()

export function AlbumPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const player = usePlayer()
  const heroRef = useRef<HTMLElement | null>(null)
  const currentCoverRef = useRef(player.current?.coverArt)
  const [album, setAlbum] = useState<(Album & { song: Song[] }) | null>(() => id ? albumPageCache.get(id) || null : null)
  const [error, setError] = useState('')
  const [rolling, setRolling] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [, rerender] = useState(0)

  useEffect(() => { currentCoverRef.current = player.current?.coverArt }, [player.current?.coverArt])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const cached = albumPageCache.get(id)
    if (cached) setAlbum(cached)
    setError('')
    setCollapsed(false)
    getAlbum(id, controller.signal)
      .then((loaded) => {
        albumPageCache.set(id, loaded)
        setAlbum(loaded)
        void applyArtworkTheme(loaded.coverArt, controller.signal)
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message)
      })
    return () => {
      controller.abort()
      void applyArtworkTheme(currentCoverRef.current)
    }
  }, [id]) // player theme is intentionally restored only when leaving/changing the album

  useEffect(() => {
    const hero = heroRef.current
    const root = document.querySelector('.content')
    if (!hero || !root) return
    const observer = new IntersectionObserver(([entry]) => setCollapsed(entry.intersectionRatio < .18), { root, threshold: [.12, .18, .25] })
    observer.observe(hero)
    return () => observer.disconnect()
  }, [album?.id])

  if (error) return <ErrorState message={error} />
  if (!album) return <PageSkeleton kind="album" />

  const title = album.album || album.name || album.title || 'Untitled album'
  const play = (shuffle = false) => {
    const songs = shuffle ? [...album.song].sort(() => Math.random() - 0.5) : album.song
    player.playQueue(songs, 0)
  }

  const favourite = async () => {
    await setStar({ albumId: album.id }, !album.starred)
    album.starred = album.starred ? undefined : new Date().toISOString()
    rerender((value) => value + 1)
    const nowStarred = Boolean(album.starred)
    showToast(nowStarred ? `${title} added to favourites` : `${title} removed from favourites`, 'success', { label: 'Undo', run: async () => { await setStar({ albumId: album.id }, !nowStarred); album.starred = nowStarred ? undefined : new Date().toISOString(); rerender((value) => value + 1) } })
  }

  const rateAlbum = async (rating: number) => {
    await setRating(album.id, rating)
    album.userRating = rating || undefined
    rerender((value) => value + 1)
    showToast(rating ? `Rated ${title} ${rating} star${rating === 1 ? '' : 's'}` : `Cleared rating for ${title}`, 'success')
  }

  const rollAgain = async () => {
    setRolling(true)
    try {
      const [next] = await getAlbums('random', 0, 1)
      if (next) withViewTransition(() => navigate(`/album/${next.id}?random=1`))
    } finally {
      setRolling(false)
    }
  }

  const contextItems: ContextMenuItem[] = [
    { label: 'Play album', icon: <Play size={15} />, onClick: () => play(false) },
    { label: 'Shuffle album', icon: <Shuffle size={15} />, onClick: () => play(true) },
    { label: album.starred ? 'Remove from favourites' : 'Add to favourites', icon: <Heart size={15} />, onClick: favourite }
  ]

  return (
    <div className="album-page">
      <div className={`album-sticky ${collapsed ? 'is-visible' : ''}`}>
        {album.coverArt ? <img src={coverUrl(album.coverArt, 96)} alt="" /> : <span className="art-placeholder art-placeholder--monogram">{title.slice(0,2).toUpperCase()}</span>}
        <div><strong>{title}</strong><small>{album.artist || 'Unknown artist'}</small></div>
        <div className="album-sticky__actions">
          <button className="sticky-icon" onClick={() => play(true)} title="Shuffle album"><Shuffle size={14} /></button>
          <button className={`sticky-icon ${album.starred ? 'is-active' : ''}`} onClick={favourite} title="Favourite album"><Heart size={14} fill={album.starred ? 'currentColor' : 'none'} /></button>
          <button className="sticky-play" onClick={() => play(false)}><Play size={15} fill="currentColor" /> Play</button>
        </div>
      </div>
      <nav className="album-breadcrumb" aria-label="Breadcrumb"><button onClick={() => navigate(-1)} title="Back"><ArrowLeft size={14} /></button>{album.artistId ? <><button onClick={() => withViewTransition(() => navigate(`/artist/${album.artistId}`))}>{album.artist || 'Artist'}</button><ChevronRight size={13} /></> : null}<span>{title}</span></nav>
      <section className="album-hero" ref={heroRef} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }) }}>
        <div className="album-hero__backdrop" style={album.coverArt ? { backgroundImage: `url(${coverUrl(album.coverArt, 1000)})` } : undefined} />
        <div className="album-hero__content">
          <div className="album-hero__cover">{album.coverArt ? <img src={coverUrl(album.coverArt, 760)} alt="" /> : <div className="art-placeholder" />}</div>
          <div className="album-hero__text">
            <span className="eyebrow">Album</span>
            <h1>{title}</h1>
            <button className="artist-link" onClick={() => album.artistId && withViewTransition(() => navigate(`/artist/${album.artistId}`))}>{album.artist || 'Unknown artist'}</button>
            <p>{[album.year, album.genre, `${album.song.length} songs`, formatTime(album.duration || album.song.reduce((sum, song) => sum + (song.duration || 0), 0)), album.playCount !== undefined ? `${album.playCount} plays` : undefined].filter(Boolean).join(' · ')}</p>
            <StarRating value={album.userRating || 0} onChange={rateAlbum} label={`${title} rating`} />
            <div className="hero-actions">
              <button className="primary-button" onClick={() => play(false)} disabled={!album.song.length}><Play size={18} fill="currentColor" /> Play</button>
              <button className="secondary-button" onClick={() => play(true)} disabled={!album.song.length}><Shuffle size={18} /> Shuffle</button>
              <button className={`circle-action ${album.starred ? 'is-active' : ''}`} onClick={favourite}><Heart size={21} fill={album.starred ? 'currentColor' : 'none'} /></button>
              <button className="circle-action" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right, y: rect.bottom }) }}><MoreHorizontal size={21} /></button>
            </div>
            {searchParams.get('random') === '1' && <button className="roll-again" onClick={rollAgain} disabled={rolling}><Shuffle size={16} /> {rolling ? 'Rolling…' : 'Not feeling it? Roll again'}</button>}
          </div>
        </div>
      </section>
      <section className="album-tracks"><SongList songs={album.song} /></section>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={contextItems} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}
