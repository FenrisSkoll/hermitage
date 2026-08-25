import { Download, Expand, ExternalLink, GripVertical, Heart, Info, ListEnd, ListMusic, ListPlus, LoaderCircle, Maximize2, MoreHorizontal, Music2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArtworkBackdrop } from '../components/ArtworkBackdrop'
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu'
import { CrossfadeCover } from '../components/CrossfadeCover'
import { ImmersiveNowPlaying, type ImmersiveMode } from '../components/ImmersiveNowPlaying'
import { StarRating } from '../components/StarRating'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences, type NowPlayingTab } from '../context/PreferencesContext'
import { downloadUrl, getAlbum, getLyricsForSong, setRating, setStar } from '../lib/api'
import { formatBytes, formatTime } from '../lib/format'
import { withViewTransition } from '../lib/navigation'
import { showToast } from '../lib/toast'
import { usePrecisePlaybackTime } from '../hooks/usePrecisePlaybackTime'
import type { Album, Song, StructuredLyrics } from '../lib/types'

type Tab = NowPlayingTab

export function NowPlayingPage() {
  const player = usePlayer()
  const { preferences } = usePreferences()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as Tab | null
  const requestedImmersiveRaw = searchParams.get('immersive') as ImmersiveMode | null
  const requestedImmersive = requestedImmersiveRaw && ['art', 'album', 'queue', 'lyrics'].includes(requestedImmersiveRaw) ? requestedImmersiveRaw : null
  const requestedSpectrum = searchParams.get('spectrum')
  const validRequested = requestedTab && ['album', 'queue', 'lyrics', 'info'].includes(requestedTab)
  const [tab, setTab] = useState<Tab>(validRequested ? requestedTab : preferences.defaultNowPlayingTab)
  const [album, setAlbum] = useState<(Album & { song: Song[] }) | null>(null)
  const [albumLoading, setAlbumLoading] = useState(false)
  const [lyrics, setLyrics] = useState<StructuredLyrics | null>(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [immersiveMode, setImmersiveMode] = useState<ImmersiveMode | null>(requestedImmersive)
  const [immersiveVisualizerOverride, setImmersiveVisualizerOverride] = useState<boolean | undefined>(requestedSpectrum === '1' ? true : requestedSpectrum === '0' ? false : undefined)
  const nativeFullscreenRequested = useRef(false)
  const npCoverRef = useRef<HTMLDivElement | null>(null)
  const [, rerender] = useState(0)
  const current = player.current

  useEffect(() => {
    const albumId = current?.albumId || current?.parent
    if (!albumId || current?.streamKind === 'radio') {
      setAlbum(null)
      setAlbumLoading(false)
      return
    }
    const controller = new AbortController()
    setAlbum(null)
    setAlbumLoading(true)
    getAlbum(albumId, controller.signal)
      .then(setAlbum)
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setAlbum(null)
      })
      .finally(() => { if (!controller.signal.aborted) setAlbumLoading(false) })
    return () => controller.abort()
  }, [current?.albumId, current?.parent, current?.streamKind])

  useEffect(() => {
    if (validRequested && requestedTab) setTab(requestedTab)
  }, [requestedTab, validRequested])

  useEffect(() => {
    if (!requestedImmersive) return
    const override = requestedSpectrum === '1' ? true : requestedSpectrum === '0' ? false : undefined
    setImmersiveVisualizerOverride(override)
    if ((override ?? preferences.fullscreenVisualizer) && player.visualizerSupported) void player.prepareVisualizer()
    setImmersiveMode(requestedImmersive)
    const next = new URLSearchParams(searchParams)
    next.delete('immersive')
    next.delete('spectrum')
    setSearchParams(next, { replace: true })
  }, [requestedImmersive, requestedSpectrum])

  useEffect(() => {
    if ((tab !== 'lyrics' && immersiveMode !== 'lyrics') || !current || current.streamKind === 'radio') return
    const controller = new AbortController()
    setLyricsLoading(true)
    setLyrics(null)
    getLyricsForSong(current, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setLyrics(result) })
      .catch(() => { if (!controller.signal.aborted) setLyrics(null) })
      .finally(() => { if (!controller.signal.aborted) setLyricsLoading(false) })
    return () => controller.abort()
  }, [tab, immersiveMode, current?.id, current?.artist, current?.title, current?.streamKind])

  useEffect(() => {
    const onFullscreenChange = () => {
      if (immersiveMode && !document.fullscreenElement) {
        nativeFullscreenRequested.current = false
        setImmersiveMode(null)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [immersiveMode])

  const openImmersive = (mode: ImmersiveMode = 'art', visualizerOverride?: boolean) => {
    setImmersiveVisualizerOverride(visualizerOverride)
    if ((visualizerOverride ?? preferences.fullscreenVisualizer) && player.visualizerSupported) void player.prepareVisualizer()
    setImmersiveMode(mode)
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return
    nativeFullscreenRequested.current = true
    void document.documentElement.requestFullscreen().catch(() => {
      nativeFullscreenRequested.current = false
    })
  }

  const closeImmersive = () => {
    setImmersiveMode(null)
    setImmersiveVisualizerOverride(undefined)
    nativeFullscreenRequested.current = false
    if (document.fullscreenElement && document.exitFullscreen) void document.exitFullscreen().catch(() => undefined)
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = useMemo(() => [
    { id: 'album', label: 'Album', icon: Music2 },
    { id: 'queue', label: 'Queue', icon: ListMusic },
    { id: 'lyrics', label: 'Lyrics', icon: Music2 },
    { id: 'info', label: 'Info', icon: Info }
  ], [])

  if (!current) {
    return <div className="now-playing-empty"><Music2 size={70} strokeWidth={0.8} /><h1>Nothing playing</h1><p>Pick an album, hit Random, or choose a song from your library.</p></div>
  }

  const favourite = async () => {
    if (current.streamKind === 'radio') return
    await setStar({ id: current.id }, !current.starred)
    current.starred = current.starred ? undefined : new Date().toISOString()
    rerender((value) => value + 1)
    const nowStarred = Boolean(current.starred)
    showToast(nowStarred ? `${current.title} added to favourites` : `${current.title} removed from favourites`, 'success', { label: 'Undo', run: async () => { await setStar({ id: current.id }, !nowStarred); current.starred = nowStarred ? undefined : new Date().toISOString(); rerender((value) => value + 1) } })
  }

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setSearchParams(next === preferences.defaultNowPlayingTab ? {} : { tab: next }, { replace: true })
  }

  const goArtist = () => {
    if (!current.artistId) return
    withViewTransition(() => navigate(`/artist/${current.artistId}`))
  }

  const goAlbum = () => {
    const albumId = current.albumId || current.parent
    if (!albumId) return
    withViewTransition(() => navigate(`/album/${albumId}`))
  }

  const tiltNowPlayingArtwork = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!preferences.animations || event.pointerType === 'touch' || !npCoverRef.current) return
    const rect = npCoverRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))
    npCoverRef.current.style.setProperty('--tilt-x', `${(-ny * 2.25).toFixed(2)}deg`)
    npCoverRef.current.style.setProperty('--tilt-y', `${(nx * 2.6).toFixed(2)}deg`)
    npCoverRef.current.style.setProperty('--shine-x', `${(((nx + 1) / 2) * 100).toFixed(1)}%`)
    npCoverRef.current.style.setProperty('--shine-y', `${(((ny + 1) / 2) * 100).toFixed(1)}%`)
  }

  const resetNowPlayingArtwork = () => {
    if (!npCoverRef.current) return
    npCoverRef.current.style.setProperty('--tilt-x', '0deg')
    npCoverRef.current.style.setProperty('--tilt-y', '0deg')
    npCoverRef.current.style.setProperty('--shine-x', '50%')
    npCoverRef.current.style.setProperty('--shine-y', '45%')
  }

  const openFocusView = () => {
    const preset = preferences.focusPreset
    if (preset === 'queue' || preset === 'lyrics' || preset === 'album') openImmersive(preset)
    else openImmersive('art', preset === 'spectrum')
  }

  return (
    <div className="now-playing-page">
      {preferences.ambientArtwork && <ArtworkBackdrop coverArt={current.coverArt} className="np-artwork-backdrop" />}
      <section className="np-focus">
        <div className="np-cover-wrap">
          <div ref={npCoverRef} className="np-cover-interactive" onPointerMove={tiltNowPlayingArtwork} onPointerLeave={resetNowPlayingArtwork}>
            <CrossfadeCover coverArt={current.coverArt} size={1000} className="np-cover" transitionName="now-playing-artwork" />
            <div className="np-cover-matte" />
            <div className="np-cover-shine" />
          </div>
          {player.playbackLoading ? <div className="np-loading-badge"><LoaderCircle className="spin" size={17} /> Buffering</div> : null}
        </div>
        <div className="np-track-copy track-crossfade" key={`copy-${current.id}`}>
          <div>
            <span className="np-kicker">Now Playing</span>
            <h1>{current.title}</h1>
            <p className="np-byline">
              {current.artistId ? <button onClick={goArtist}>{current.artist || 'Unknown artist'}</button> : <span>{current.artist || 'Unknown artist'}</span>}
              <i>·</i>
              {(current.albumId || current.parent) ? <button onClick={goAlbum}>{current.album || 'Unknown album'}</button> : <span>{current.album || 'Unknown album'}</span>}
            </p>
          </div>
          <div className="np-track-actions">
            {current.streamKind !== 'radio' ? <button className={`np-heart ${current.starred ? 'is-active' : ''}`} onClick={favourite} title="Favourite"><Heart size={22} fill={current.starred ? 'currentColor' : 'none'} /></button> : null}
            <button className="np-heart np-fullscreen-launch" onClick={openFocusView} title="Fullscreen Now Playing"><Maximize2 size={21} /></button>
          </div>
        </div>
        {player.playbackError ? <button className="np-playback-error" onClick={player.retryPlayback}><RotateCcw size={15} /><span>{player.playbackError}</span><strong>Retry</strong></button> : null}
      </section>

      <aside className="np-panel">
        <div className="np-tabs">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => switchTab(id)}><Icon size={16} /><span>{label}</span></button>)}
        </div>
        <div className="np-panel__body">
          <div key={tab} className="np-panel__view">
            {tab === 'album' && <AlbumTab album={album} current={current} loading={albumLoading} />}
            {tab === 'queue' && <QueueTab />}
            {tab === 'lyrics' && <LyricsTab lyrics={lyrics} loading={lyricsLoading} currentTime={player.currentTime} onFullscreen={() => openImmersive('lyrics')} />}
            {tab === 'info' && <InfoTab song={current} />}
          </div>
        </div>
      </aside>

      {immersiveMode ? <ImmersiveNowPlaying mode={immersiveMode} onModeChange={setImmersiveMode} onClose={closeImmersive} album={album} albumLoading={albumLoading} lyrics={lyrics} lyricsLoading={lyricsLoading} visualizerOverride={immersiveVisualizerOverride} onVisualizerOverrideChange={setImmersiveVisualizerOverride} /> : null}
    </div>
  )
}

function AlbumTab({ album, current, loading }: { album: (Album & { song: Song[] }) | null; current: Song; loading: boolean }) {
  const player = usePlayer()
  const navigate = useNavigate()
  const [menu, setMenu] = useState<{ x: number; y: number; song: Song } | null>(null)
  if (loading) return <PanelSkeleton />
  if (!album) return <div className="panel-empty">Album details unavailable.</div>

  const items = (song: Song): ContextMenuItem[] => [
    { label: 'Play now', icon: <Play size={15} />, onClick: () => player.playSong(song, album.song) },
    { label: 'Play next', icon: <ListPlus size={15} />, onClick: () => { player.addNext(song); showToast(`${song.title} will play next`, 'success') } },
    { label: 'Add to queue', icon: <ListEnd size={15} />, onClick: () => { player.addToQueue(song); showToast(`${song.title} added to queue`, 'success') } },
    { label: 'Download original', icon: <Download size={15} />, onClick: () => { showToast(`Starting download: ${song.title}`, 'neutral'); window.location.assign(downloadUrl(song.id)) } }
  ]

  return (
    <div className="np-album-tab">
      <div className="np-panel-heading"><div><span>Playing from</span><button className="panel-heading-link" onClick={() => withViewTransition(() => navigate(`/album/${album.id}`))}>{album.album || album.name || album.title}</button><small>{album.artist}</small></div><span>{album.song.length} tracks</span></div>
      <div className="np-track-list">
        {album.song.map((song, index) => {
          const active = song.id === current.id
          return <button key={song.id} className={active ? 'is-active' : ''} onClick={() => player.playSong(song, album.song)} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, song }) }}>
            <span className="np-track-no">{active && player.playing ? <Pause size={13} fill="currentColor" /> : active ? <Play size={13} fill="currentColor" /> : song.track || index + 1}</span>
            <span className="np-track-title"><strong>{song.title}</strong><small>{song.artist}</small></span>
            <span>{formatTime(song.duration)}</span>
          </button>
        })}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items(menu.song)} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}

function QueueTab() {
  const player = usePlayer()
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; song: Song; index: number } | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const beforePositions = useRef(new Map<string, number>())

  const snapshot = () => {
    beforePositions.current = new Map(Array.from(rowRefs.current.entries()).map(([key, element]) => [key, element.getBoundingClientRect().top]))
  }

  useLayoutEffect(() => {
    if (!beforePositions.current.size || document.documentElement.dataset.motion === 'off') return
    for (const [key, element] of rowRefs.current.entries()) {
      const oldTop = beforePositions.current.get(key)
      if (oldTop === undefined) continue
      const delta = oldTop - element.getBoundingClientRect().top
      if (Math.abs(delta) > 1) element.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.75,.25,1)' })
    }
    beforePositions.current.clear()
  }, [player.queue, player.currentIndex])

  const dropAt = (to: number) => {
    if (dragging === null) return
    snapshot()
    player.reorderQueue(dragging, to)
    setDragging(null)
    setDragOver(null)
  }

  const items = (song: Song, index: number): ContextMenuItem[] => [
    { label: 'Play now', icon: <Play size={15} />, onClick: () => player.playSong(song, player.queue) },
    { label: 'Play next', icon: <ListPlus size={15} />, onClick: () => { player.addNext(song); showToast(`${song.title} will play next`, 'success') } },
    { label: 'Add another copy', icon: <ListEnd size={15} />, onClick: () => { player.addToQueue(song); showToast(`${song.title} added to queue`, 'success') } },
    ...(song.streamKind !== 'radio' ? [{ label: 'Download original', icon: <Download size={15} />, onClick: () => { showToast(`Starting download: ${song.title}`, 'neutral'); window.location.assign(downloadUrl(song.id)) } }] : []),
    { label: 'Remove from queue', icon: <X size={15} />, danger: true, disabled: index === player.currentIndex, onClick: () => { snapshot(); player.removeFromQueue(index) } }
  ]

  return (
    <div className="np-queue-tab">
      <div className="np-panel-heading"><div><span>Up next</span><strong>Play queue</strong><small>{player.queue.length} tracks · drag to reorder</small></div>{player.currentIndex >= 0 && player.queue.length > player.currentIndex + 1 ? <button className="text-button" onClick={player.clearQueueAfterCurrent}>Clear upcoming</button> : null}</div>
      <div className="np-track-list queue-list">
        {player.queue.map((song, index) => {
          const active = index === player.currentIndex
          const occurrence = player.queue.slice(0, index + 1).filter((item) => item.id === song.id).length
          const rowKey = `${song.id}:${occurrence}`
          return <div className="queue-entry-wrap" key={rowKey}>
            {index === player.currentIndex + 1 ? <div className="queue-next-divider"><span>Playing next</span></div> : null}
            <div
              ref={(element) => { if (element) rowRefs.current.set(rowKey, element); else rowRefs.current.delete(rowKey) }}
              className={`queue-row ${active ? 'is-active' : ''} ${dragging === index ? 'is-dragging' : ''} ${dragOver === index ? 'is-drag-over' : ''}`}
              draggable={!active}
              onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
              onDragOver={(event) => { event.preventDefault(); setDragOver(index); event.dataTransfer.dropEffect = 'move' }}
              onDragLeave={() => { if (dragOver === index) setDragOver(null) }}
              onDrop={(event) => { event.preventDefault(); dropAt(index) }}
              onDragEnd={() => { setDragging(null); setDragOver(null) }}
              onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, song, index }) }}
            >
              <span className="queue-grip">{!active ? <GripVertical size={14} /> : <span className="queue-now-dot" />}</span>
              <button className="queue-row__main" onClick={() => player.playSong(song, player.queue)}>
                <span className="np-track-no">{active && player.playing ? <Pause size={13} fill="currentColor" /> : index + 1}</span>
                <span className="np-track-title"><strong>{song.title}</strong><small>{song.artist}</small></span>
                <span>{formatTime(song.duration)}</span>
              </button>
              <div className="queue-row__actions">
                <button className="queue-more" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right, y: rect.bottom, song, index }) }} title="Queue actions"><MoreHorizontal size={15} /></button>
                {!active && <button className="queue-remove" onClick={() => { snapshot(); player.removeFromQueue(index) }} title="Remove from queue"><X size={15} /></button>}
              </div>
            </div>
          </div>
        })}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={items(menu.song, menu.index)} onClose={() => setMenu(null)} /> : null}
    </div>
  )
}

function PanelSkeleton() {
  return <div className="panel-skeleton"><span className="skeleton skeleton-line skeleton-line--medium" />{Array.from({ length: 9 }).map((_, index) => <span className="skeleton skeleton-song" key={index} />)}</div>
}

function activeLyricIndex(lyrics: StructuredLyrics | null, currentTime: number, userOffsetMs = 0) {
  if (!lyrics?.synced || !lyrics.line.length) return -1
  const timeMs = currentTime * 1000 - ((lyrics.offset || 0) + userOffsetMs)
  let active = -1
  for (let index = 0; index < lyrics.line.length; index++) {
    const start = lyrics.line[index].start
    if (typeof start !== 'number' || start > timeMs) break
    active = index
  }
  return active
}

function SyncedLyrics({ lyrics, currentTime, fullscreen = false }: { lyrics: StructuredLyrics; currentTime: number; fullscreen?: boolean }) {
  const { preferences } = usePreferences()
  const preciseTime = usePrecisePlaybackTime(Boolean(lyrics.synced), currentTime)
  const active = activeLyricIndex(lyrics, preciseTime, preferences.lyricsTimingOffsetMs)
  const activeRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    if (active < 0 || !activeRef.current) return
    activeRef.current.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth', block: 'center' })
  }, [active])

  return <div className={`lyrics-lines ${fullscreen ? 'lyrics-lines--fullscreen' : ''} ${lyrics.synced ? 'is-synced' : ''}`}>
    {lyrics.line.map((line, index) => <p key={`${line.start ?? 'u'}-${index}`} ref={index === active ? activeRef : undefined} className={index === active ? 'is-active' : index < active ? 'is-past' : ''}>{line.value || '\u00A0'}</p>)}
  </div>
}

function LyricsTab({ lyrics, loading, currentTime, onFullscreen }: { lyrics: StructuredLyrics | null; loading: boolean; currentTime: number; onFullscreen: () => void }) {
  if (loading) return <PanelSkeleton />
  if (!lyrics) return <div className="panel-empty"><Music2 size={30} /><strong>No lyrics found</strong><span>Embedded lyrics and LRC/SYLT lyrics are supported when Navidrome exposes them.</span></div>
  return <div className="lyrics-panel-wrap">
    <div className="lyrics-toolbar"><span>{lyrics.synced ? 'Synced lyrics' : 'Lyrics'}{lyrics.lang && lyrics.lang !== 'xxx' ? ` · ${lyrics.lang}` : ''}</span><button className="icon-button" onClick={onFullscreen} title="Fullscreen lyrics"><Expand size={17} /></button></div>
    <SyncedLyrics lyrics={lyrics} currentTime={currentTime} />
  </div>
}

function InfoTab({ song }: { song: Song }) {
  const player = usePlayer()
  const [, rerender] = useState(0)
  const changeRating = async (rating: number) => {
    if (song.streamKind === 'radio') return
    await setRating(song.id, rating)
    song.userRating = rating || undefined
    rerender((value) => value + 1)
    showToast(rating ? `Rated ${song.title} ${rating} star${rating === 1 ? '' : 's'}` : `Cleared rating for ${song.title}`, 'success')
  }

  if (song.streamKind === 'radio') {
    return <div className="info-tab-wrap"><div className="info-table"><div><span>Type</span><strong>Internet radio</strong></div><div><span>Station</span><strong>{song.title}</strong></div><div><span>Status</span><strong>Live stream</strong></div></div>{song.radioHomePageUrl ? <a className="info-download" href={song.radioHomePageUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Station website</a> : null}</div>
  }

  const rows = [
    ['Title', song.title],
    ['Artist', song.artist],
    ['Album', song.album],
    ['Year', song.year],
    ['Genre', song.genre],
    ['Codec', song.suffix?.toUpperCase() || song.contentType],
    ['Bitrate', song.bitRate ? `${song.bitRate} kbps` : undefined],
    ['Sample rate', song.samplingRate ? `${(song.samplingRate / 1000).toFixed(song.samplingRate % 1000 ? 1 : 0)} kHz` : undefined],
    ['Bit depth', song.bitDepth ? `${song.bitDepth}-bit` : undefined],
    ['Channels', song.channelCount],
    ['Duration', formatTime(song.duration)],
    ['File size', formatBytes(song.size)],
    ['Play count', song.playCount ?? 0],
    ['Last played', song.played ? new Date(song.played).toLocaleString() : undefined],
    ['Scrobble', player.scrobbleState.replace('-', ' ')],
    ['ReplayGain', player.replayGainDb ? `${player.replayGainDb > 0 ? '+' : ''}${player.replayGainDb.toFixed(2)} dB applied` : 'Off / unavailable']
  ].filter(([, value]) => value !== undefined && value !== null && value !== '')
  return <div className="info-tab-wrap">
    <div className="info-rating"><span>Rating</span><StarRating value={song.userRating || 0} onChange={changeRating} /></div>
    <div className="info-table">{rows.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}</div>
    <a className="info-download" href={downloadUrl(song.id)} download><Download size={16} /> Download original file</a>
  </div>
}
