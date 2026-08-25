import { Album as AlbumIcon, Disc3, ListMusic, Music2, Palette, Radio, Search, Settings, Shuffle, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences } from '../context/PreferencesContext'
import { coverUrl, getAlbum, getAlbums, searchLibrary } from '../lib/api'
import { withViewTransition } from '../lib/navigation'
import { showToast } from '../lib/toast'
import type { Album, Artist, Song } from '../lib/types'

type SearchResultsValue = { artists: Artist[]; albums: Album[]; songs: Song[] }

function narrowResults(results: SearchResultsValue, query: string): SearchResultsValue {
  const q = query.toLowerCase()
  return {
    artists: results.artists.filter((artist) => artist.name.toLowerCase().includes(q)),
    albums: results.albums.filter((album) => `${album.album || album.name || album.title || ''} ${album.artist || ''}`.toLowerCase().includes(q)),
    songs: results.songs.filter((song) => `${song.title} ${song.artist || ''} ${song.album || ''}`.toLowerCase().includes(q))
  }
}

export function SearchOverlay({ open, initialQuery = '', onClose, onOpenSettings }: { open: boolean; initialQuery?: string; onClose: () => void; onOpenSettings?: () => void }) {
  const navigate = useNavigate()
  const player = usePlayer()
  const { preferences, updatePreference } = usePreferences()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastCompleted = useRef<{ query: string; results: SearchResultsValue } | null>(null)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<SearchResultsValue | null>(null)
  const [loading, setLoading] = useState(false)
  const [slow, setSlow] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState(0)

  const go = (path: string) => {
    onClose()
    withViewTransition(() => navigate(path))
  }

  const commands = useMemo(() => [
    { label: 'Play a random album', hint: 'Choice paralysis solved', icon: Shuffle, run: async () => { const [album] = await getAlbums('random', 0, 1); if (!album) return; const full = await getAlbum(album.id); player.playQueue(full.song, 0); onClose(); showToast(`Playing ${album.album || album.name || album.title}`, 'success') } },
    { label: 'Go to queue', hint: 'Show what is playing next', icon: ListMusic, run: () => go('/now-playing?tab=queue') },
    { label: 'Now Playing', hint: 'Open the main player view', icon: Music2, run: () => go('/now-playing') },
    { label: 'Internet Radio', hint: 'Open your Navidrome stations', icon: Radio, run: () => go('/radio') },
    { label: preferences.colourMode === 'vivid' ? 'Use subtle colours' : 'Toggle vivid colours', hint: 'Change artwork-driven UI intensity', icon: Palette, run: () => { updatePreference('colourMode', preferences.colourMode === 'vivid' ? 'subtle' : 'vivid'); onClose() } },
    { label: 'Open settings', hint: 'Interface, audio and fullscreen options', icon: Settings, run: () => onOpenSettings?.() }
  ], [navigate, onClose, onOpenSettings, player, preferences.colourMode, updatePreference])

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setSelectedCommand(0)
    window.setTimeout(() => inputRef.current?.focus(), 20)
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    const clean = query.trim()
    if (!clean) { setResults(null); setLoading(false); setSlow(false); return }

    const previous = lastCompleted.current
    if (previous && clean.toLowerCase().startsWith(previous.query.toLowerCase())) setResults(narrowResults(previous.results, clean))
    else setResults(null)

    const controller = new AbortController()
    setLoading(true)
    setSlow(false)
    let slowTimer = 0
    const timer = window.setTimeout(() => {
      slowTimer = window.setTimeout(() => setSlow(true), 800)
      searchLibrary(clean, controller.signal, { artistCount: 6, albumCount: 8, songCount: 10 })
        .then((next) => { lastCompleted.current = { query: clean, results: next }; setResults(next) })
        .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setResults({ artists: [], albums: [], songs: [] }) })
        .finally(() => { if (!controller.signal.aborted) { setLoading(false); setSlow(false) } })
    }, 220)
    return () => { window.clearTimeout(timer); if (slowTimer) window.clearTimeout(slowTimer); controller.abort() }
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (!query.trim() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        setSelectedCommand((value) => (value + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) % commands.length)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose, query, commands.length])

  if (!open) return null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const clean = query.trim()
    if (!clean) { void commands[selectedCommand]?.run(); return }
    go(`/search?q=${encodeURIComponent(clean)}`)
  }

  return (
    <div className="search-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <div className="search-dialog command-dialog">
        <form className="search-dialog__input" onSubmit={submit}>
          <Search size={22} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search or run a command…" />
          <kbd>ESC</kbd><button type="button" onClick={onClose}><X size={18} /></button>
        </form>
        <div className="search-dialog__body">
          {!query.trim() && <div className="command-palette"><span className="quick-results__label">Quick actions</span>{commands.map((command, index) => { const Icon = command.icon; return <button key={command.label} className={selectedCommand === index ? 'is-selected' : ''} onMouseEnter={() => setSelectedCommand(index)} onClick={() => void command.run()}><span className="quick-icon"><Icon size={17} /></span><span><strong>{command.label}</strong><small>{command.hint}</small></span><kbd>{index === selectedCommand ? 'Enter' : ''}</kbd></button> })}<div className="command-hint">↑ ↓ choose · Enter run · start typing to search your library</div></div>}
          {loading && !results && query.trim() && <div className="search-loading"><span className="spinner" /> {slow ? 'Navidrome is still searching…' : 'Searching…'}</div>}
          {results && <>{loading && <div className="search-updating"><span className="spinner" /> {slow ? 'Still checking Navidrome…' : 'Updating results…'}</div>}<SearchResults results={results} query={query} go={go} /></>}
        </div>
      </div>
    </div>
  )
}

function SearchResults({ results, query, go }: { results: SearchResultsValue; query: string; go: (path: string) => void }) {
  const empty = !results.artists.length && !results.albums.length && !results.songs.length
  if (empty) return <div className="search-hint"><strong>No matches yet</strong><span>Hermitage will keep the current results visible while Navidrome finishes slower searches.</span></div>
  return <div className="quick-results">
    {!!results.artists.length && <section><span className="quick-results__label">Artists</span>{results.artists.slice(0, 4).map((artist) => <button key={artist.id} onClick={() => go(`/artist/${artist.id}`)}><span className="quick-icon"><UserRound size={17} /></span><span><strong>{artist.name}</strong><small>{artist.albumCount || 0} albums</small></span></button>)}</section>}
    {!!results.albums.length && <section><span className="quick-results__label">Albums</span>{results.albums.slice(0, 5).map((album) => <button key={album.id} onClick={() => go(`/album/${album.id}`)}>{album.coverArt ? <img src={coverUrl(album.coverArt, 90)} alt="" /> : <span className="quick-icon"><Disc3 size={17} /></span>}<span><strong>{album.album || album.name || album.title}</strong><small>{album.artist}{album.year ? ` · ${album.year}` : ''}</small></span></button>)}</section>}
    {!!results.songs.length && <section><span className="quick-results__label">Songs</span>{results.songs.slice(0, 5).map((song) => <button key={song.id} onClick={() => go(`/search?q=${encodeURIComponent(song.title)}`)}>{song.coverArt ? <img src={coverUrl(song.coverArt, 90)} alt="" /> : <span className="quick-icon"><Music2 size={17} /></span>}<span><strong>{song.title}</strong><small>{song.artist} · {song.album}</small></span></button>)}</section>}
    <button className="quick-results__all" onClick={() => go(`/search?q=${encodeURIComponent(query)}`)}><AlbumIcon size={16} /> Show full results</button>
  </div>
}
