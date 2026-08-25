import {
  Album as AlbumIcon,
  Clock3,
  Disc3,
  Heart,
  History,
  Home,
  ListMusic,
  Music2,
  Plus,
  Radio,
  Shuffle,
  Sparkles,
  UserRound,
  UsersRound,
  X
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { createPlaylist, getAlbums, getPlaylists } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import { showToast } from '../lib/toast'
import type { Playlist } from '../lib/types'

function NavItem({ to, icon: Icon, children, onNavigate }: { to: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode; onNavigate?: () => void }) {
  const navigate = useNavigate()
  return (
    <NavLink
      className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}
      to={to}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
        withViewTransition(() => navigate(to))
      }}
    >
      <Icon size={18} /> <span>{children}</span>
    </NavLink>
  )
}

export function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const navigate = useNavigate()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [rolling, setRolling] = useState(false)

  const refreshPlaylists = useCallback(() => {
    const controller = new AbortController()
    getPlaylists(controller.signal).then(setPlaylists).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setPlaylists([])
    })
    return controller
  }, [])

  useEffect(() => {
    let controller = refreshPlaylists()
    const changed = () => { controller.abort(); controller = refreshPlaylists() }
    window.addEventListener('hermitage:playlists-changed', changed)
    return () => { controller.abort(); window.removeEventListener('hermitage:playlists-changed', changed) }
  }, [refreshPlaylists])

  const randomAlbum = async () => {
    if (rolling) return
    setRolling(true)
    try {
      const [album] = await getAlbums('random', 0, 1)
      if (album) {
        onClose?.()
        withViewTransition(() => navigate(`/album/${album.id}?random=1`))
      }
    } finally {
      setRolling(false)
    }
  }

  const navigatePlaylist = (event: React.MouseEvent, id: string) => {
    event.preventDefault()
    onClose?.()
    withViewTransition(() => navigate(`/playlist/${id}`))
  }

  const newPlaylist = async () => {
    const name = window.prompt('New playlist name')?.trim()
    if (!name) return
    try {
      const playlist = await createPlaylist(name)
      window.dispatchEvent(new Event('hermitage:playlists-changed'))
      if (playlist?.id) withViewTransition(() => navigate(`/playlist/${playlist.id}`))
      else showToast('Playlist created. Refreshing the sidebar…', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not create playlist.', 'error')
    }
  }

  const goHome = () => {
    onClose?.()
    withViewTransition(() => navigate('/'))
  }

  return (
    <aside className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <button className="brand brand--button" onClick={goHome} title="Home">
        <span className="brand__mark">H</span><span>Hermitage</span><small>v0.6.0</small>
        <span className="sidebar-close icon-button" onClick={(event) => { event.stopPropagation(); onClose?.() }}><X size={19} /></span>
      </button>

      <nav className="sidebar__nav">
        <div className="nav-section">
          <span className="nav-label">Discover</span>
          <NavItem to="/" icon={Home} onNavigate={onClose}>Home</NavItem>
          <button className={`side-link random-link ${rolling ? 'is-rolling' : ''}`} onClick={randomAlbum}>
            <Shuffle size={18} /><span>{rolling ? 'Rolling…' : 'Random'}</span><Sparkles className="random-spark" size={13} />
          </button>
          <NavItem to="/recently-added" icon={Sparkles} onNavigate={onClose}>Recently Added</NavItem>
          <NavItem to="/recently-played" icon={History} onNavigate={onClose}>Recently Played</NavItem>
          <NavItem to="/most-played" icon={Clock3} onNavigate={onClose}>Most Played</NavItem>
          <NavItem to="/radio" icon={Radio} onNavigate={onClose}>Internet Radio</NavItem>
        </div>

        <div className="nav-section">
          <span className="nav-label">Library</span>
          <NavItem to="/albums" icon={Disc3} onNavigate={onClose}>Albums</NavItem>
          <NavItem to="/artists" icon={UsersRound} onNavigate={onClose}>Artists</NavItem>
          <NavItem to="/songs" icon={Music2} onNavigate={onClose}>Songs</NavItem>
          <NavItem to="/favourites" icon={Heart} onNavigate={onClose}>Favourites</NavItem>
        </div>

        <div className="nav-section nav-section--playlists">
          <div className="nav-label-row"><span className="nav-label">Playlists</span><button className="nav-add-playlist" onClick={newPlaylist} title="Create playlist"><Plus size={14} /></button></div>
          {playlists.length ? playlists.map((playlist) => (
            <NavLink key={playlist.id} className={({ isActive }) => `side-link playlist-link ${isActive ? 'is-active' : ''}`} to={`/playlist/${playlist.id}`} onClick={(event) => navigatePlaylist(event, playlist.id)}>
              <AlbumIcon size={16} /><span>{playlist.name}</span>
            </NavLink>
          )) : <span className="nav-empty">No playlists</span>}
        </div>
      </nav>

      <div className="sidebar__footer">
        <NavItem to="/now-playing" icon={Radio} onNavigate={onClose}>Now Playing</NavItem>
        <NavItem to="/artists" icon={UserRound} onNavigate={onClose}>Browse artists</NavItem>
      </div>
    </aside>
  )
}
