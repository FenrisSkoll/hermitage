import {
  Activity,
  Disc,
  Heart,
  ListMusic,
  LoaderCircle,
  Minimize2,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences } from '../context/PreferencesContext'
import { setStar } from '../lib/api'
import { formatTime } from '../lib/format'
import { usePrecisePlaybackTime } from '../hooks/usePrecisePlaybackTime'
import type { Album, Song, StructuredLyrics } from '../lib/types'
import { ArtworkBackdrop } from './ArtworkBackdrop'
import { CrossfadeCover } from './CrossfadeCover'
import { FullscreenSpectrum } from './FullscreenSpectrum'

export type ImmersiveMode = 'art' | 'album' | 'queue' | 'lyrics'

function activeLyricIndex(lyrics: StructuredLyrics, currentTime: number, userOffsetMs = 0) {
  if (!lyrics.synced) return -1
  const currentMs = Math.max(0, currentTime * 1000 - ((lyrics.offset || 0) + userOffsetMs))
  let active = -1
  for (let index = 0; index < lyrics.line.length; index += 1) {
    const start = lyrics.line[index]?.start
    if (typeof start !== 'number' || start > currentMs) break
    active = index
  }
  return active
}

function ImmersiveLyrics({ lyrics, currentTime }: { lyrics: StructuredLyrics; currentTime: number }) {
  const { preferences } = usePreferences()
  const preciseTime = usePrecisePlaybackTime(Boolean(lyrics.synced), currentTime)
  const active = activeLyricIndex(lyrics, preciseTime, preferences.lyricsTimingOffsetMs)
  const activeRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    if (active < 0 || !activeRef.current) return
    activeRef.current.scrollIntoView({
      behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth',
      block: 'center'
    })
  }, [active])

  return (
    <div className={`immersive-lyrics-lines ${lyrics.synced ? 'is-synced' : ''}`}>
      {lyrics.line.map((line, index) => (
        <p
          key={`${line.start ?? 'u'}-${index}`}
          ref={index === active ? activeRef : undefined}
          className={index === active ? 'is-active' : index < active ? 'is-past' : ''}
        >
          {line.value || '\u00A0'}
        </p>
      ))}
    </div>
  )
}

function qualityLabel(song: Song) {
  const parts: string[] = []
  if (song.bitDepth) parts.push(`${song.bitDepth}-bit`)
  if (song.samplingRate) {
    const khz = song.samplingRate / 1000
    parts.push(`${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`)
  }
  if (!parts.length && song.bitRate) parts.push(`${song.bitRate} kbps`)
  if (!parts.length && song.suffix) parts.push(song.suffix.toUpperCase())
  return parts.join(' · ')
}

function ImmersiveListRow({
  song,
  index,
  active,
  onPlay
}: {
  song: Song
  index: number
  active: boolean
  onPlay: () => void
}) {
  return (
    <button className={`immersive-list-row ${active ? 'is-active' : ''}`} onClick={onPlay}>
      <span className="immersive-list-index">{active ? <Play size={13} fill="currentColor" /> : index + 1}</span>
      <span className="immersive-list-copy"><strong>{song.title}</strong><small>{song.artist || 'Unknown artist'}</small></span>
      <span className="immersive-list-time">{formatTime(song.duration)}</span>
    </button>
  )
}

export function ImmersiveNowPlaying({
  mode,
  onModeChange,
  onClose,
  album,
  albumLoading,
  lyrics,
  lyricsLoading,
  visualizerOverride,
  onVisualizerOverrideChange
}: {
  mode: ImmersiveMode
  onModeChange: (mode: ImmersiveMode) => void
  onClose: () => void
  album: (Album & { song: Song[] }) | null
  albumLoading: boolean
  lyrics: StructuredLyrics | null
  lyricsLoading: boolean
  visualizerOverride?: boolean
  onVisualizerOverrideChange?: (value: boolean | undefined) => void
}) {
  const player = usePlayer()
  const { preferences, updatePreference } = usePreferences()
  const song = player.current
  const visualizerEnabled = visualizerOverride ?? preferences.fullscreenVisualizer
  const coverRef = useRef<HTMLDivElement | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [starred, setStarred] = useState(Boolean(song?.starred))

  useEffect(() => setStarred(Boolean(song?.starred)), [song?.id, song?.starred])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.dataset.immersive = 'true'
    document.body.style.overflow = 'hidden'
    return () => {
      delete document.body.dataset.immersive
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const wakeChrome = () => {
    setChromeVisible(true)
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), 2600)
  }

  useEffect(() => {
    wakeChrome()
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }
    // Run once for the immersive session. Mode changes explicitly wake the chrome below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => wakeChrome(), [mode, song?.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isEditing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      wakeChrome()
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (isEditing) return
      if (event.code === 'Space') {
        event.preventDefault()
        player.togglePlay()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        player.seekRelative(-10)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        player.seekRelative(10)
      } else if (event.key.toLowerCase() === 'l') {
        onModeChange(mode === 'lyrics' ? 'art' : 'lyrics')
      } else if (event.key.toLowerCase() === 'q') {
        onModeChange(mode === 'queue' ? 'art' : 'queue')
      } else if (event.key.toLowerCase() === 'a') {
        if (album) onModeChange(mode === 'album' ? 'art' : 'album')
      } else if (event.key.toLowerCase() === 'v' && player.visualizerSupported) {
        const next = !visualizerEnabled
        if (!next) { if (visualizerOverride !== undefined) onVisualizerOverrideChange?.(false); else updatePreference('fullscreenVisualizer', false) }
        else void player.prepareVisualizer().then((ready) => { if (ready) { if (visualizerOverride !== undefined) onVisualizerOverrideChange?.(true); else updatePreference('fullscreenVisualizer', true) } })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [album, mode, onClose, onModeChange, player, visualizerEnabled, visualizerOverride, onVisualizerOverrideChange, updatePreference])

  useEffect(() => {
    if (mode !== 'queue' && mode !== 'album') return
    const timer = window.setTimeout(() => {
      document.querySelector('.immersive-panel .immersive-list-row.is-active')?.scrollIntoView({
        behavior: document.documentElement.dataset.motion === 'off' ? 'auto' : 'smooth',
        block: 'center'
      })
    }, 80)
    return () => window.clearTimeout(timer)
  }, [mode, song?.id])

  if (!song) return null

  const splitMode = mode !== 'art'
  const upcoming = player.currentIndex >= 0 ? player.queue.slice(player.currentIndex + 1) : player.queue
  const quality = qualityLabel(song)

  const tiltArtwork = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Fullscreen deliberately tracks the whole viewport (the v0.4.5 behaviour).
    // Using the moving cover's own bounding box here creates a feedback loop while the
    // idle/spectrum layout is animating, which can look like a small vibration.
    wakeChrome()
    if (!preferences.animations || event.pointerType === 'touch' || !coverRef.current) return
    const nx = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1))
    const rotateX = -ny * 2.8
    const rotateY = nx * 3.2
    const shineX = ((nx + 1) / 2) * 100
    const shineY = ((ny + 1) / 2) * 100
    coverRef.current.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`)
    coverRef.current.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`)
    coverRef.current.style.setProperty('--shine-x', `${shineX.toFixed(1)}%`)
    coverRef.current.style.setProperty('--shine-y', `${shineY.toFixed(1)}%`)
  }

  const resetTilt = () => {
    if (!coverRef.current) return
    coverRef.current.style.setProperty('--tilt-x', '0deg')
    coverRef.current.style.setProperty('--tilt-y', '0deg')
    coverRef.current.style.setProperty('--shine-x', '50%')
    coverRef.current.style.setProperty('--shine-y', '45%')
  }

  const toggleVisualizer = async () => {
    const next = !visualizerEnabled
    if (!next) {
      if (visualizerOverride !== undefined) onVisualizerOverrideChange?.(false)
      else updatePreference('fullscreenVisualizer', false)
      return
    }
    if (await player.prepareVisualizer()) {
      if (visualizerOverride !== undefined) onVisualizerOverrideChange?.(true)
      else updatePreference('fullscreenVisualizer', true)
    }
  }

  const favourite = async () => {
    if (song.streamKind === 'radio') return
    const next = !starred
    setStarred(next)
    try {
      await setStar({ id: song.id }, next)
      song.starred = next ? new Date().toISOString() : undefined
    } catch {
      setStarred(!next)
    }
  }

  const panel = (() => {
    if (mode === 'lyrics') {
      return (
        <div className="immersive-panel__inner immersive-panel__lyrics">
          {lyricsLoading ? <div className="immersive-panel-state"><LoaderCircle className="spin" size={25} /> Loading lyrics…</div> : lyrics ? <ImmersiveLyrics lyrics={lyrics} currentTime={player.currentTime} /> : <div className="immersive-panel-state"><Music2 size={35} /><strong>No lyrics found</strong><span>Embedded or synced lyrics will appear here when Navidrome exposes them.</span></div>}
        </div>
      )
    }

    if (mode === 'album') {
      return (
        <div className="immersive-panel__inner">
          <div className="immersive-panel-heading"><span>Playing from</span><strong>{album?.album || album?.name || album?.title || song.album || 'Album'}</strong><small>{album?.artist || song.artist}</small></div>
          {albumLoading ? <div className="immersive-panel-state"><LoaderCircle className="spin" size={25} /> Loading album…</div> : album ? <div className="immersive-list">{album.song.map((item, index) => <ImmersiveListRow key={item.id} song={item} index={index} active={item.id === song.id} onPlay={() => player.playSong(item, album.song)} />)}</div> : <div className="immersive-panel-state"><Disc size={34} /><strong>Album unavailable</strong></div>}
        </div>
      )
    }

    if (mode === 'queue') {
      return (
        <div className="immersive-panel__inner">
          <div className="immersive-panel-heading"><span>Play queue</span><strong>Up next</strong><small>{upcoming.length ? `${upcoming.length} track${upcoming.length === 1 ? '' : 's'} remaining` : 'Nothing queued after this track'}</small></div>
          <div className="immersive-list">
            <ImmersiveListRow song={song} index={Math.max(0, player.currentIndex)} active onPlay={player.togglePlay} />
            {upcoming.map((item, offset) => {
              const absolute = player.currentIndex + 1 + offset
              return <ImmersiveListRow key={`${item.id}-${absolute}`} song={item} index={absolute} active={false} onPlay={() => player.playSong(item, player.queue)} />
            })}
          </div>
        </div>
      )
    }

    return null
  })()

  return createPortal(
    <div
      className={`immersive-now-playing mode-${mode} colour-mode-${preferences.colourMode} ${splitMode ? 'is-split' : 'is-art-only'} ${chromeVisible ? 'is-awake' : 'is-idle'} ${visualizerEnabled && player.visualizerReady ? 'has-visualizer' : ''} ${preferences.fullscreenVisualizerDocked ? 'visualizer-docked' : 'visualizer-floating'} ${preferences.fullscreenVisualizerReflection ? 'visualizer-reflection' : ''}`}
      onPointerMove={tiltArtwork}
      onPointerDown={wakeChrome}
      onPointerLeave={() => { resetTilt(); wakeChrome() }}
    >
      {preferences.ambientArtwork ? <ArtworkBackdrop coverArt={song.coverArt} className="immersive-backdrop" /> : null}
      <div className="immersive-vignette" />
      {visualizerEnabled && player.visualizerSupported ? <FullscreenSpectrum active={mode === 'art' && !chromeVisible} paletteKey={song.coverArt || song.id} docked={preferences.fullscreenVisualizerDocked} reflection={preferences.fullscreenVisualizerReflection} style={preferences.spectrumStyle} /> : null}

      <div className="immersive-topbar immersive-chrome">
        <div className="immersive-topbar__spacer" />
        <nav className="immersive-modes" aria-label="Fullscreen Now Playing views">
          <button className={mode === 'album' ? 'is-active' : ''} disabled={!album && !albumLoading} onClick={() => onModeChange(mode === 'album' ? 'art' : 'album')}><Disc size={15} /><span>Album</span></button>
          <button className={mode === 'queue' ? 'is-active' : ''} onClick={() => onModeChange(mode === 'queue' ? 'art' : 'queue')}><ListMusic size={15} /><span>Queue</span></button>
          <button className={mode === 'lyrics' ? 'is-active' : ''} onClick={() => onModeChange(mode === 'lyrics' ? 'art' : 'lyrics')}><Music2 size={15} /><span>Lyrics</span></button>
          {player.visualizerSupported ? <button className={visualizerEnabled ? 'is-active' : ''} onClick={() => void toggleVisualizer()} title="Spectrum visualizer (V)"><Activity size={15} /><span>Spectrum</span></button> : null}
        </nav>
        <button className="immersive-exit" onClick={onClose} title="Exit fullscreen"><Minimize2 size={19} /><span>Exit</span></button>
      </div>

      <main className="immersive-stage">
        <section className="immersive-art-column">
          <div className="immersive-art-perspective">
            <div ref={coverRef} className="immersive-art-card">
              <CrossfadeCover coverArt={song.coverArt} size={1400} className="immersive-cover" />
              <div className="immersive-art-matte" />
              <div className="immersive-art-shine" />
            </div>
          </div>
        </section>
        {splitMode ? <aside className="immersive-panel">{panel}</aside> : null}
      </main>

      <div className="immersive-bottom immersive-chrome">
        <div className="immersive-track-meta">
          <strong>{song.title}</strong>
          <span>{song.artist || 'Unknown artist'}{song.album ? ` · ${song.album}` : ''}</span>
        </div>

        <div className="immersive-controls">
          <div className="immersive-transport">
            <button className={player.shuffle ? 'is-active' : ''} onClick={player.toggleShuffle} title="Shuffle"><Shuffle size={19} /></button>
            <button onClick={player.previous} title="Previous"><SkipBack size={22} fill="currentColor" /></button>
            <button className="immersive-play" onClick={player.togglePlay} title={player.playing ? 'Pause' : 'Play'}>{player.playbackLoading ? <LoaderCircle className="spin" size={23} /> : player.playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button>
            <button onClick={player.next} title="Next"><SkipForward size={22} fill="currentColor" /></button>
            <button className={player.repeat !== 'off' ? 'is-active' : ''} onClick={player.cycleRepeat} title={`Repeat: ${player.repeat}`}>{player.repeat === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}</button>
          </div>
          <div className="immersive-seek">
            <span>{formatTime(player.currentTime)}</span>
            <input type="range" min="0" max={Math.max(player.duration, 1)} step="1" value={Math.min(player.currentTime, Math.max(player.duration, 1))} onChange={(event) => player.seek(Number(event.target.value))} />
            <span>{formatTime(player.duration || song.duration)}</span>
          </div>
        </div>

        <div className="immersive-tools">
          {song.streamKind !== 'radio' ? <button className={starred ? 'is-active' : ''} onClick={favourite} title="Favourite"><Heart size={19} fill={starred ? 'currentColor' : 'none'} /></button> : null}
          <button onClick={player.toggleMute} title={player.muted ? 'Unmute' : 'Mute'}>{player.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
          <input className="immersive-volume" type="range" min="0" max="1" step="0.01" value={player.muted ? 0 : player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} />
          {quality ? <span className="immersive-quality">{quality}</span> : null}
        </div>
      </div>

      <div className="immersive-idle-hint">Move the pointer for controls</div>
    </div>,
    document.body
  )
}
