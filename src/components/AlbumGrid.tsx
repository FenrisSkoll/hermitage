import { Heart, ListPlus, LoaderCircle, MoreHorizontal, Play, Shuffle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { coverUrl, getAlbum, searchLibrary, setStar } from '../lib/api'
import { formatTime } from '../lib/format'
import { withViewTransition } from '../lib/navigation'
import { showToast } from '../lib/toast'
import type { Album } from '../lib/types'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

export function AlbumGrid({ albums, compact = false, onChanged }: { albums: Album[]; compact?: boolean; onChanged?: () => void }) {
  const navigate = useNavigate()
  return (
    <div className={`album-grid ${compact ? 'album-grid--compact' : ''}`}>
      {albums.map((album) => <AlbumCard key={album.id} album={album} imageSize={compact ? 300 : 420} onChanged={onChanged} onOpen={() => withViewTransition(() => navigate(`/album/${album.id}`))} onArtist={async () => { if (album.artistId) { withViewTransition(() => navigate(`/artist/${album.artistId}`)); return }; if (!album.artist) return; try { const result = await searchLibrary(album.artist, undefined, { artistCount: 8, albumCount: 0, songCount: 0 }); const artist = result.artists.find((item) => item.name.toLowerCase() === album.artist?.toLowerCase()) || result.artists[0]; if (artist) withViewTransition(() => navigate(`/artist/${artist.id}`)) } catch { /* keep album card usable */ } }} />)}
    </div>
  )
}

function AlbumCard({ album, imageSize, onOpen, onArtist, onChanged }: { album: Album; imageSize: number; onOpen: () => void; onArtist: () => void | Promise<void>; onChanged?: () => void }) {
  const player = usePlayer()
  const [busy, setBusy] = useState(false)
  const [playBusy, setPlayBusy] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const title = album.album || album.name || album.title || 'Untitled album'

  const toggleStar = async (event?: React.MouseEvent) => {
    event?.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      await setStar({ albumId: album.id }, !album.starred)
      album.starred = album.starred ? undefined : new Date().toISOString()
      onChanged?.()
      const nowStarred = Boolean(album.starred)
      showToast(nowStarred ? `${title} added to favourites` : `${title} removed from favourites`, 'success', { label: 'Undo', run: async () => { await setStar({ albumId: album.id }, !nowStarred); album.starred = nowStarred ? undefined : new Date().toISOString(); onChanged?.() } })
    } finally {
      setBusy(false)
    }
  }

  const loadAndPlay = async (shuffle = false) => {
    if (playBusy) return
    setPlayBusy(true)
    try {
      const full = await getAlbum(album.id)
      const songs = shuffle ? [...full.song].sort(() => Math.random() - .5) : full.song
      player.playQueue(songs, 0)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load that album.', 'error')
    } finally {
      setPlayBusy(false)
    }
  }

  const addAlbumToQueue = async () => {
    try {
      const full = await getAlbum(album.id)
      player.addManyToQueue(full.song)
      showToast(`${title} added to queue`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not add that album to the queue.', 'error')
    }
  }

  const items: ContextMenuItem[] = [
    { label: 'Open album', icon: <Play size={15} />, onClick: onOpen },
    { label: 'Play album', icon: <Play size={15} />, onClick: () => loadAndPlay(false) },
    { label: 'Shuffle album', icon: <Shuffle size={15} />, onClick: () => loadAndPlay(true) },
    { label: album.starred ? 'Remove from favourites' : 'Add to favourites', icon: <Heart size={15} />, onClick: () => toggleStar() },
    { label: 'Add album to queue', icon: <ListPlus size={15} />, onClick: addAlbumToQueue }
  ]

  return (
    <>
      <div
        className="album-card"
        onClick={onOpen}
        onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY }) }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); onOpen(); return }
          if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); void loadAndPlay(false); return }
          if (event.key.toLowerCase() === 'q') { event.preventDefault(); event.stopPropagation(); void addAlbumToQueue(); return }
          if (event.key.toLowerCase() === 'f') { event.preventDefault(); event.stopPropagation(); void toggleStar(); return }
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const cards = Array.from(event.currentTarget.parentElement?.querySelectorAll('.album-card') || []) as HTMLElement[]
            const current = cards.indexOf(event.currentTarget)
            if (current < 0) return
            const columns = Math.max(1, Math.round((event.currentTarget.parentElement?.clientWidth || event.currentTarget.clientWidth) / Math.max(1, event.currentTarget.offsetWidth)))
            const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns
            cards[Math.max(0, Math.min(cards.length - 1, current + delta))]?.focus()
          }
        }}
        role="button"
        tabIndex={0}
        data-album-id={album.id}
        title={`${title} — ${album.artist || 'Unknown artist'}`}
      >
        <div className="album-card__art-wrap">
          {album.coverArt ? <img className={`album-card__art ${imageLoaded ? 'is-loaded' : ''}`} src={coverUrl(album.coverArt, imageSize)} alt="" loading="lazy" onLoad={() => setImageLoaded(true)} /> : <div className="art-placeholder art-placeholder--monogram"><span>{title.split(/\s+/).slice(0,2).map((part) => part[0]).join('').toUpperCase()}</span></div>}
          {!imageLoaded && album.coverArt ? <div className="art-loading skeleton" /> : null}
          <div className="album-card__overlay">
            <button
              className="round-play"
              onClick={(event) => { event.stopPropagation(); void loadAndPlay(false) }}
              aria-label={`Play ${title}`}
              title={`Play ${title}`}
              disabled={playBusy}
            >
              {playBusy ? <LoaderCircle className="spin" size={21} /> : <Play size={22} fill="currentColor" />}
            </button>
          </div>
          <div className="album-card__corner-actions">
            <button className={`album-card__heart ${album.starred ? 'is-active' : ''}`} onClick={toggleStar} aria-label="Favourite album">
              <Heart size={18} fill={album.starred ? 'currentColor' : 'none'} />
            </button>
            <button className="album-card__more" onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right, y: rect.bottom }) }} aria-label="Album actions"><MoreHorizontal size={18} /></button>
          </div>
        </div>
        <span className="album-card__title">{title}</span>
        <span className="album-card__meta">{album.artist ? <button className="album-card__artist" onClick={(event) => { event.stopPropagation(); void onArtist() }}>{album.artist}</button> : <span>Unknown artist</span>}{album.year ? <span> · {album.year}</span> : null}</span>
        {album.duration ? <span className="album-card__duration">{formatTime(album.duration)}</span> : null}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} /> : null}
    </>
  )
}
