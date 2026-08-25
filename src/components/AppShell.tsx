import { LogOut, Menu, Search, Settings, UserCircle2, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences } from '../context/PreferencesContext'
import { getAlbums } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import { applyArtworkTheme } from '../lib/theme'
import { ArtworkBackdrop } from './ArtworkBackdrop'
import { PlayerBar } from './PlayerBar'
import { SearchOverlay } from './SearchOverlay'
import { SettingsPanel } from './SettingsPanel'
import { Sidebar } from './Sidebar'
import { ToastHost } from './ToastHost'

export function AppShell() {
  const auth = useAuth()
  const player = usePlayer()
  const { preferences } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [accountOpen, setAccountOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const contentRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void applyArtworkTheme(preferences.colourMode === 'static' ? undefined : (preferences.ambientArtwork ? player.current?.coverArt : undefined), controller.signal)
    return () => controller.abort()
  }, [player.current?.coverArt, preferences.ambientArtwork, preferences.colourMode])

  useEffect(() => {
    setAccountOpen(false)
    setMobileNavOpen(false)
  }, [location.pathname])

  const randomAlbum = useCallback(async () => {
    try {
      const [album] = await getAlbums('random', 0, 1)
      if (album) withViewTransition(() => navigate(`/album/${album.id}?random=1`))
    } catch { /* page will remain unchanged */ }
  }, [navigate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.body.dataset.immersive === 'true') return
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable
      const interactive = typing || target?.tagName === 'BUTTON' || target?.tagName === 'A'

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }
      if (interactive || event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.code === 'Space') {
        event.preventDefault()
        player.togglePlay()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        player.seekRelative(-10)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        player.seekRelative(10)
      } else if (event.key.toLowerCase() === 'm') {
        player.toggleMute()
      } else if (event.key.toLowerCase() === 'n') {
        withViewTransition(() => navigate('/now-playing'))
      } else if (event.key.toLowerCase() === 'q') {
        withViewTransition(() => navigate('/now-playing?tab=queue'))
      } else if (event.key.toLowerCase() === 'l') {
        withViewTransition(() => navigate('/now-playing?tab=lyrics'))
      } else if (event.key.toLowerCase() === 'r') {
        void randomAlbum()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, player.togglePlay, player.seekRelative, player.toggleMute, randomAlbum])


  useLayoutEffect(() => {
    const root = contentRef.current
    if (!root) return
    const key = `hermitage-scroll:${location.pathname}${location.search}`
    const saved = Number(sessionStorage.getItem(key) || 0)
    requestAnimationFrame(() => root.scrollTo({ top: saved, behavior: 'auto' }))
    return () => { sessionStorage.setItem(key, String(root.scrollTop)) }
  }, [location.pathname, location.search])

  const disconnect = async () => {
    await auth.disconnect()
    navigate('/login')
  }

  return (
    <div className={`app-shell colour-mode-${preferences.colourMode} ${player.current ? 'has-track' : ''} ${preferences.compactSidebar ? 'is-sidebar-compact' : ''} ${preferences.miniPlayer ? 'has-mini-player' : ''}`}>
      {preferences.ambientArtwork && <ArtworkBackdrop coverArt={player.current?.coverArt} className="global-artwork" />}
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      {mobileNavOpen && <button className="mobile-nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="search-box search-box--button" onClick={() => setSearchOpen(true)}>
            <Search size={17} /><span>Search your library</span><kbd>Ctrl K</kbd>
          </button>
          <div className="topbar__account">
            {auth.offline ? <span className="offline-badge"><WifiOff size={14} /> Offline</span> : null}
            <button className="topbar-settings icon-button" onClick={() => setSettingsOpen(true)} aria-label="Interface settings"><Settings size={18} /></button>
            <button className="account-button" onClick={() => setAccountOpen((value) => !value)}>
              <UserCircle2 size={21} /><span>{auth.username}</span>
            </button>
            {accountOpen && (
              <div className="account-popover">
                <strong>{auth.username}</strong>
                <small>{auth.server}</small>
                <button onClick={() => { setAccountOpen(false); setSettingsOpen(true) }}><Settings size={16} /> Interface settings</button>
                <button onClick={disconnect}><LogOut size={16} /> Disconnect</button>
              </div>
            )}
          </div>
        </header>
        <main ref={contentRef} className="content">
          <div key={location.pathname} className="route-stage"><Outlet /></div>
        </main>
      </div>
      <PlayerBar />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onOpenSettings={() => { setSearchOpen(false); setSettingsOpen(true) }} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ToastHost />
    </div>
  )
}
