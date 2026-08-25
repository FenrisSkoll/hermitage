import { AlertCircle, Heart, ListMusic, LoaderCircle, Maximize2, Minimize2, PanelBottomClose, PanelBottomOpen, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences } from '../context/PreferencesContext'
import { setStar } from '../lib/api'
import { formatTime } from '../lib/format'
import { withViewTransition } from '../lib/navigation'
import { showToast } from '../lib/toast'
import type { Song } from '../lib/types'
import { CrossfadeCover } from './CrossfadeCover'

function qualityLabel(song?: Song | null) {
  if (!song) return ''
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

export function PlayerBar() {
  const player = usePlayer()
  const { preferences, updatePreference } = usePreferences()
  const navigate = useNavigate()
  const location = useLocation()
  const [, rerender] = useState(0)
  const [nativeFullscreen, setNativeFullscreen] = useState(Boolean(document.fullscreenElement))
  const track = player.current
  const quality = qualityLabel(track)
  const queueActive = location.pathname === '/now-playing' && new URLSearchParams(location.search).get('tab') === 'queue'

  useEffect(() => {
    const update = () => setNativeFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const favourite = async () => {
    if (!track) return
    await setStar({ id: track.id }, !track.starred)
    track.starred = track.starred ? undefined : new Date().toISOString()
    rerender((value) => value + 1)
    const nowStarred = Boolean(track.starred)
    showToast(nowStarred ? `${track.title} added to favourites` : `${track.title} removed from favourites`, 'success', { label: 'Undo', run: async () => { await setStar({ id: track.id }, !nowStarred); track.starred = nowStarred ? undefined : new Date().toISOString(); rerender((value) => value + 1) } })
  }

  const openNowPlaying = (tab?: 'queue') => {
    if (!track) return
    withViewTransition(() => navigate(tab ? `/now-playing?tab=${tab}` : '/now-playing'))
  }

  const openFullscreenNowPlaying = async () => {
    if (!track) return
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => undefined)
    }
    const preset = preferences.focusPreset
    const mode = preset === 'queue' || preset === 'lyrics' || preset === 'album' ? preset : 'art'
    const spectrum = preset === 'spectrum' ? '1' : preset === 'artwork' ? '0' : undefined
    const query = new URLSearchParams({ immersive: mode })
    if (spectrum !== undefined) query.set('spectrum', spectrum)
    navigate(`/now-playing?${query.toString()}`)
  }

  return (
    <footer className={`player-bar ${preferences.miniPlayer ? 'is-mini-player' : ''}`}>
      <div className="player-bar__track">
        <button className="mini-cover" disabled={!track} onClick={() => openNowPlaying()}>
          <CrossfadeCover coverArt={track?.coverArt} size={180} transitionName={location.pathname === '/now-playing' ? undefined : 'now-playing-artwork'} />
          {player.playbackLoading && track ? <i className="mini-cover__loading"><LoaderCircle size={17} /></i> : null}
        </button>
        <div className="mini-track-text">
          <strong>{track?.title || 'Nothing playing'}</strong>
          <span>{track ? `${track.artist || 'Unknown artist'}${track.album ? ` · ${track.album}` : ''}` : 'Choose something from your library'}</span>
          {quality ? <small className="player-quality-inline">{quality}</small> : null}
          {player.playbackError && track ? <button className="player-error" onClick={player.retryPlayback}><AlertCircle size={12} /> {player.playbackError} Retry</button> : null}
        </div>
        <button className={`icon-button heart-button ${track?.starred ? 'is-active' : ''}`} disabled={!track} onClick={favourite}><Heart size={19} fill={track?.starred ? 'currentColor' : 'none'} /></button>
      </div>

      {preferences.miniPlayer ? <div className="mini-transport"><button className="icon-button" onClick={player.previous} disabled={!track} title="Previous"><SkipBack size={17} fill="currentColor" /></button><button className="mini-play" onClick={player.togglePlay} disabled={!track}>{player.playbackLoading ? <LoaderCircle className="spin" size={17} /> : player.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button><button className="icon-button" onClick={player.next} disabled={!track} title="Next"><SkipForward size={17} fill="currentColor" /></button></div> : null}

      <div className="player-bar__centre">
        <div className="transport">
          <button className={`icon-button ${player.shuffle ? 'is-active' : ''}`} onClick={player.toggleShuffle} title="Shuffle"><Shuffle size={17} /></button>
          <button className="icon-button" onClick={player.previous} disabled={!track} title="Previous"><SkipBack size={20} fill="currentColor" /></button>
          <button className="play-button" onClick={player.togglePlay} disabled={!track} title={player.playing ? 'Pause' : 'Play'}>
            {player.playbackLoading ? <LoaderCircle className="spin" size={19} /> : player.playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="icon-button" onClick={player.next} disabled={!track} title="Next"><SkipForward size={20} fill="currentColor" /></button>
          <button className={`icon-button ${player.repeat !== 'off' ? 'is-active' : ''}`} onClick={player.cycleRepeat} title={`Repeat: ${player.repeat}`}>{player.repeat === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}</button>
        </div>
        <div className="seek-row">
          <span>{formatTime(player.currentTime)}</span>
          <input className="range" type="range" min="0" max={Math.max(player.duration, 1)} step="1" value={Math.min(player.currentTime, Math.max(player.duration, 1))} onChange={(event) => player.seek(Number(event.target.value))} disabled={!track} />
          <span>{formatTime(player.duration || track?.duration)}</span>
        </div>
      </div>

      <div className="player-bar__tools">
        {!preferences.miniPlayer && quality ? <span className="player-quality-badge">{quality}</span> : null}
        <button className={`icon-button player-fullscreen-button ${nativeFullscreen ? 'is-active' : ''}`} disabled={!track} onClick={() => void openFullscreenNowPlaying()} title="Fullscreen Now Playing"><Maximize2 size={18} /></button>
        <button className={`icon-button ${queueActive ? 'is-active' : ''}`} disabled={!track} onClick={() => openNowPlaying('queue')} title="Queue"><ListMusic size={18} /></button>
        <button className="icon-button mini-player-toggle" onClick={() => updatePreference('miniPlayer', !preferences.miniPlayer)} title={preferences.miniPlayer ? 'Restore full player' : 'Compact floating player'}>{preferences.miniPlayer ? <PanelBottomOpen size={18} /> : <PanelBottomClose size={18} />}</button>
        <button className="icon-button" onClick={player.toggleMute} title={player.muted ? 'Unmute' : 'Mute'}>{player.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <input className="range volume" type="range" min="0" max="1" step="0.01" value={player.muted ? 0 : player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} />
      </div>

      {preferences.miniPlayer ? <button className="mini-player-expand" onClick={() => updatePreference('miniPlayer', false)} title="Restore full player"><Minimize2 size={15} /></button> : null}
    </footer>
  )
}
