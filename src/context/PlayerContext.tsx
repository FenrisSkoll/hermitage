import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { coverUrl, getAlbum, preloadCover, radioStreamUrl, scrobble, streamUrl } from '../lib/api'
import type { HistoryEntry, RadioStation, Song } from '../lib/types'
import { usePreferences } from './PreferencesContext'

type RepeatMode = 'off' | 'all' | 'one'
export type ScrobbleState = 'idle' | 'reporting' | 'now-playing' | 'scrobbled' | 'error'

type PersistedPlayer = {
  queue?: Song[]
  currentIndex?: number
  volume?: number
  shuffle?: boolean
  repeat?: RepeatMode
}

const playerStorageKey = 'hermitage-player-v3'
const legacyPlayerStorageKey = 'hermitage-player-v2'
const historyStorageKey = 'hermitage-history-v3'

function restorePlayer(): Required<PersistedPlayer> {
  try {
    const raw = localStorage.getItem(playerStorageKey) || localStorage.getItem(legacyPlayerStorageKey)
    const parsed = raw ? JSON.parse(raw) as PersistedPlayer : {}
    const queue = Array.isArray(parsed.queue) ? parsed.queue.slice(0, 2000) : []
    const index = Number.isInteger(parsed.currentIndex) ? Number(parsed.currentIndex) : -1
    return {
      queue,
      currentIndex: index >= 0 && index < queue.length ? index : -1,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : .8,
      shuffle: Boolean(parsed.shuffle),
      repeat: parsed.repeat === 'all' || parsed.repeat === 'one' ? parsed.repeat : 'off'
    }
  } catch {
    return { queue: [], currentIndex: -1, volume: .8, shuffle: false, repeat: 'off' }
  }
}

function restoreHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) || '[]')
    return Array.isArray(parsed) ? parsed.slice(0, 250) : []
  } catch {
    return []
  }
}

const restored = restorePlayer()

type PlayerContextValue = {
  current: Song | null
  queue: Song[]
  currentIndex: number
  playing: boolean
  playbackLoading: boolean
  playbackError: string
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  scrobbleState: ScrobbleState
  history: HistoryEntry[]
  replayGainDb: number
  playSong: (song: Song, queue?: Song[]) => void
  playQueue: (songs: Song[], index?: number) => void
  playRadio: (station: RadioStation) => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  seek: (seconds: number) => void
  seekRelative: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  removeFromQueue: (index: number) => void
  clearQueueAfterCurrent: () => void
  reorderQueue: (from: number, to: number) => void
  addNext: (song: Song) => void
  addToQueue: (song: Song) => void
  addManyToQueue: (songs: Song[]) => void
  retryPlayback: () => void
  clearHistory: () => void
  visualizerSupported: boolean
  visualizerReady: boolean
  prepareVisualizer: () => Promise<boolean>
  getVisualizerAnalyser: () => AnalyserNode | null
  getPlaybackTime: () => number
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

function replayGainForSong(song: Song | null, mode: 'off' | 'track' | 'album', preamp: number) {
  if (!song || song.streamKind === 'radio' || mode === 'off') return { db: 0, multiplier: 1 }
  const rg = song.replayGain
  if (!rg) return { db: 0, multiplier: 1 }
  const requested = mode === 'album' ? rg.albumGain : rg.trackGain
  const fallback = requested ?? rg.fallbackGain
  if (typeof fallback !== 'number' || !Number.isFinite(fallback)) return { db: 0, multiplier: 1 }
  const db = fallback + preamp
  let multiplier = Math.pow(10, db / 20)
  const peak = mode === 'album' ? rg.albumPeak : rg.trackPeak
  if (typeof peak === 'number' && peak > 0 && multiplier * peak > 1) multiplier = 1 / peak
  return { db, multiplier: Math.max(0, multiplier) }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const standbyRef = useRef<HTMLAudioElement | null>(null)
  const standbyTrackIdRef = useRef<string | null>(null)
  const promotedTrackIdRef = useRef<string | null>(null)
  const crossfadeTimerRef = useRef<number | null>(null)
  const crossfadeStartedRef = useRef(false)
  const pendingSeekRef = useRef(0)
  const wantPlayingRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const retryCountRef = useRef(0)
  const activeTrackIdRef = useRef<string | null>(null)
  const nowPlayingReportedRef = useRef<string | null>(null)
  const submittedTrackIdRef = useRef<string | null>(null)
  const historyReportedRef = useRef<string | null>(null)
  const nextRef = useRef<() => void>(() => undefined)
  const currentSongRef = useRef<Song | null>(null)
  const queueRef = useRef<Song[]>(restored.queue)
  const currentIndexRef = useRef(restored.currentIndex)
  const shuffleRef = useRef(restored.shuffle)
  const repeatRef = useRef<RepeatMode>(restored.repeat)
  const volumeRef = useRef(restored.volume)
  const mutedRef = useRef(false)
  const preferencesRef = useRef(preferences)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodesRef = useRef<MediaElementAudioSourceNode[]>([])

  const [queue, setQueue] = useState<Song[]>(restored.queue)
  const [currentIndex, setCurrentIndex] = useState(restored.currentIndex)
  const [playing, setPlaying] = useState(false)
  const [playbackLoading, setPlaybackLoading] = useState(false)
  const [playbackError, setPlaybackError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volumeState, setVolumeState] = useState(restored.volume)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(restored.shuffle)
  const [repeat, setRepeat] = useState<RepeatMode>(restored.repeat)
  const [reloadToken, setReloadToken] = useState(0)
  const [scrobbleState, setScrobbleState] = useState<ScrobbleState>('idle')
  const [history, setHistory] = useState<HistoryEntry[]>(restoreHistory)
  const [visualizerReady, setVisualizerReady] = useState(false)

  const current = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null
  const currentReplayGain = replayGainForSong(current, preferences.replayGainMode, preferences.replayGainPreamp)

  useEffect(() => { currentSongRef.current = current }, [current])
  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentIndexRef.current = currentIndex }, [currentIndex])
  useEffect(() => { shuffleRef.current = shuffle }, [shuffle])
  useEffect(() => { repeatRef.current = repeat }, [repeat])
  useEffect(() => { volumeRef.current = volumeState }, [volumeState])
  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { preferencesRef.current = preferences }, [preferences])

  useEffect(() => {
    localStorage.setItem(playerStorageKey, JSON.stringify({ queue, currentIndex, volume: volumeState, shuffle, repeat }))
  }, [queue, currentIndex, volumeState, shuffle, repeat])

  useEffect(() => {
    localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, 250)))
  }, [history])

  const effectiveVolume = useCallback((song: Song | null, scale = 1) => {
    if (mutedRef.current) return 0
    const gain = replayGainForSong(song, preferencesRef.current.replayGainMode, preferencesRef.current.replayGainPreamp).multiplier
    return Math.max(0, Math.min(1, volumeRef.current * gain * scale))
  }, [])

  const prepareVisualizer = useCallback(async () => {
    if (typeof window === 'undefined' || !('AudioContext' in window || 'webkitAudioContext' in window)) return false
    const active = audioRef.current
    const standby = standbyRef.current
    if (!active || !standby) return false

    try {
      let context = audioContextRef.current
      let analyser = analyserRef.current
      if (!context || !analyser) {
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextCtor) return false
        context = new AudioContextCtor()
        analyser = context.createAnalyser()
        analyser.fftSize = 4096
        analyser.smoothingTimeConstant = 0.84
        analyser.minDecibels = -92
        analyser.maxDecibels = -18

        analyser.connect(context.destination)
        const sources: MediaElementAudioSourceNode[] = []
        for (const audio of [active, standby]) {
          try {
            const source = context.createMediaElementSource(audio)
            source.connect(analyser)
            sources.push(source)
          } catch (error) {
            console.debug('A player audio element could not be attached to the visualizer', error)
          }
        }
        if (!sources.length) {
          analyser.disconnect()
          await context.close().catch(() => undefined)
          return false
        }
        audioContextRef.current = context
        analyserRef.current = analyser
        sourceNodesRef.current = sources
      }

      if (context.state === 'suspended') await context.resume()
      const ready = context.state === 'running'
      setVisualizerReady(ready)
      return ready
    } catch (error) {
      console.debug('Visualizer audio graph could not be initialised', error)
      setVisualizerReady(false)
      return false
    }
  }, [])

  const getVisualizerAnalyser = useCallback(() => analyserRef.current, [])
  const getPlaybackTime = useCallback(() => audioRef.current?.currentTime || 0, [])

  const cancelCrossfade = useCallback(() => {
    if (crossfadeTimerRef.current !== null) window.clearInterval(crossfadeTimerRef.current)
    crossfadeTimerRef.current = null
    crossfadeStartedRef.current = false
    const standby = standbyRef.current
    if (standby && standby !== audioRef.current) {
      standby.pause()
      standby.currentTime = 0
      standby.volume = effectiveVolume(null, 0)
    }
    if (audioRef.current) audioRef.current.volume = effectiveVolume(currentSongRef.current)
  }, [effectiveVolume])

  const sequentialNextIndex = useCallback(() => {
    const items = queueRef.current
    const index = currentIndexRef.current
    if (!items.length || index < 0 || shuffleRef.current || repeatRef.current === 'one') return -1
    if (index + 1 < items.length) return index + 1
    if (repeatRef.current === 'all') return 0
    return -1
  }, [])

  const reportSubmission = useCallback(async (song: Song) => {
    if (song.streamKind === 'radio' || submittedTrackIdRef.current === song.id) return
    submittedTrackIdRef.current = song.id
    setScrobbleState('reporting')
    try {
      await scrobble(song.id, true)
      const playedIso = new Date().toISOString()
      setQueue((items) => items.map((item) => item.id === song.id ? { ...item, playCount: (item.playCount || 0) + 1, played: playedIso } : item))
      if (currentSongRef.current?.id === song.id) setScrobbleState('scrobbled')
      setHistory((items) => {
        let marked = false
        return items.map((entry) => {
          if (!marked && entry.song.id === song.id) {
            marked = true
            return { ...entry, completed: true }
          }
          return entry
        })
      })
    } catch {
      if (currentSongRef.current?.id === song.id) setScrobbleState('error')
    }
  }, [])

  const promoteStandby = useCallback((nextIndex: number, crossfade = false) => {
    const nextSong = queueRef.current[nextIndex]
    const oldActive = audioRef.current
    const prepared = standbyRef.current
    if (!nextSong || !oldActive || !prepared || standbyTrackIdRef.current !== nextSong.id) return false

    if (!crossfade) {
      prepared.volume = effectiveVolume(nextSong)
      void prepared.play().catch(() => undefined)
    }

    audioRef.current = prepared
    standbyRef.current = oldActive
    standbyTrackIdRef.current = null
    promotedTrackIdRef.current = nextSong.id
    activeTrackIdRef.current = nextSong.id
    retryCountRef.current = 0
    submittedTrackIdRef.current = null
    nowPlayingReportedRef.current = null
    historyReportedRef.current = nextSong.id
    setScrobbleState('idle')
    setHistory((items) => [{ id: `${Date.now()}-${nextSong.id}`, song: { ...nextSong }, playedAt: Date.now(), completed: false }, ...items].slice(0, 250))
    oldActive.pause()
    oldActive.removeAttribute('src')
    oldActive.load()
    oldActive.volume = 0
    prepared.volume = effectiveVolume(nextSong)
    setCurrentIndex(nextIndex)
    setCurrentTime(prepared.currentTime || 0)
    setDuration(Number.isFinite(prepared.duration) ? prepared.duration : (nextSong.duration || 0))
    setPlaybackLoading(prepared.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
    setPlaybackError('')
    setPlaying(!prepared.paused)
    crossfadeStartedRef.current = false
    return true
  }, [effectiveVolume])

  const startCrossfade = useCallback(() => {
    if (crossfadeStartedRef.current) return
    const nextIndex = sequentialNextIndex()
    const nextSong = queueRef.current[nextIndex]
    const active = audioRef.current
    const standby = standbyRef.current
    const seconds = preferencesRef.current.crossfadeSeconds
    if (!nextSong || !active || !standby || standbyTrackIdRef.current !== nextSong.id || standby.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    crossfadeStartedRef.current = true
    standby.currentTime = 0
    standby.volume = 0
    void standby.play().then(() => {
      const started = performance.now()
      crossfadeTimerRef.current = window.setInterval(() => {
        const elapsed = (performance.now() - started) / 1000
        const progress = Math.max(0, Math.min(1, elapsed / seconds))
        active.volume = effectiveVolume(currentSongRef.current, 1 - progress)
        standby.volume = effectiveVolume(nextSong, progress)
        if (progress >= 1) {
          if (crossfadeTimerRef.current !== null) window.clearInterval(crossfadeTimerRef.current)
          crossfadeTimerRef.current = null
          void reportSubmission(currentSongRef.current!).finally(() => promoteStandby(nextIndex, true))
        }
      }, 50)
    }).catch(() => {
      crossfadeStartedRef.current = false
    })
  }, [effectiveVolume, promoteStandby, reportSubmission, sequentialNextIndex])

  useEffect(() => {
    const first = new Audio()
    const second = new Audio()
    for (const audio of [first, second]) {
      audio.preload = 'auto'
      audio.volume = volumeState
    }
    audioRef.current = first
    standbyRef.current = second

    const onTime = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current) return
      const time = audio.currentTime || 0
      setCurrentTime(time)
      const song = currentSongRef.current
      if (song && song.streamKind !== 'radio' && submittedTrackIdRef.current !== song.id) {
        const targetDuration = Number.isFinite(audio.duration) ? audio.duration : (song.duration || 0)
        const threshold = targetDuration > 0 ? Math.min(240, targetDuration / 2) : 240
        if (time >= threshold) void reportSubmission(song)
      }
      if (preferencesRef.current.playbackTransitionMode === 'crossfade' && wantPlayingRef.current && !shuffleRef.current && repeatRef.current !== 'one') {
        const remaining = (Number.isFinite(audio.duration) ? audio.duration : (song?.duration || 0)) - time
        if (remaining > 0 && remaining <= preferencesRef.current.crossfadeSeconds) startCrossfade()
      }
    }
    const onDuration = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current) return
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
      if (pendingSeekRef.current > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(pendingSeekRef.current, Math.max(0, audio.duration - 0.25))
        setCurrentTime(audio.currentTime)
        pendingSeekRef.current = 0
      }
    }
    const onPlay = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current) return
      setPlaying(true)
      setPlaybackError('')
    }
    const onPlaying = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current) return
      setPlaying(true)
      setPlaybackLoading(false)
      setPlaybackError('')
      const song = currentSongRef.current
      if (song && historyReportedRef.current !== song.id) {
        historyReportedRef.current = song.id
        setHistory((items) => [{ id: `${Date.now()}-${song.id}`, song: { ...song }, playedAt: Date.now(), completed: false }, ...items].slice(0, 250))
      }
    }
    const onPause = (event: Event) => {
      if (event.currentTarget === audioRef.current) setPlaying(false)
    }
    const onWaiting = (event: Event) => {
      if (event.currentTarget === audioRef.current && wantPlayingRef.current) setPlaybackLoading(true)
    }
    const onCanPlay = (event: Event) => {
      if (event.currentTarget === audioRef.current) setPlaybackLoading(false)
    }
    const onEnded = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current) return
      const song = currentSongRef.current
      if (song) void reportSubmission(song)
      const nextIndex = sequentialNextIndex()
      if (preferencesRef.current.playbackTransitionMode === 'preload' && nextIndex >= 0 && promoteStandby(nextIndex)) return
      nextRef.current()
    }
    const onError = (event: Event) => {
      const audio = event.currentTarget as HTMLAudioElement
      if (audio !== audioRef.current || !activeTrackIdRef.current) return
      const code = audio.error?.code
      const message = code === 3
        ? 'The browser could not decode this stream.'
        : code === 2
          ? 'The audio stream was interrupted.'
          : 'Could not load this track.'
      setPlaybackLoading(false)
      setPlaybackError(message)

      if (wantPlayingRef.current && retryCountRef.current < 2) {
        retryCountRef.current += 1
        window.setTimeout(() => setReloadToken((value) => value + 1), 450 * retryCountRef.current)
      }
    }

    const listeners: [keyof HTMLMediaElementEventMap, EventListener][] = [
      ['timeupdate', onTime as EventListener],
      ['durationchange', onDuration as EventListener],
      ['loadedmetadata', onDuration as EventListener],
      ['play', onPlay as EventListener],
      ['playing', onPlaying as EventListener],
      ['pause', onPause as EventListener],
      ['waiting', onWaiting as EventListener],
      ['stalled', onWaiting as EventListener],
      ['canplay', onCanPlay as EventListener],
      ['ended', onEnded as EventListener],
      ['error', onError as EventListener]
    ]
    for (const audio of [first, second]) for (const [name, handler] of listeners) audio.addEventListener(name, handler)

    return () => {
      cancelCrossfade()
      for (const audio of [first, second]) {
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        for (const [name, handler] of listeners) audio.removeEventListener(name, handler)
      }
      audioRef.current = null
      standbyRef.current = null
    }
  // Audio elements live for the provider lifetime. Runtime values are read from refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    const context = audioContextRef.current
    for (const source of sourceNodesRef.current) {
      try { source.disconnect() } catch { /* already disconnected */ }
    }
    sourceNodesRef.current = []
    analyserRef.current = null
    audioContextRef.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }, [])

  const chooseNextIndex = useCallback((direction: 1 | -1) => {
    if (!queue.length) return -1
    if (shuffle && queue.length > 1 && direction === 1) {
      let nextIndex = currentIndex
      while (nextIndex === currentIndex) nextIndex = Math.floor(Math.random() * queue.length)
      return nextIndex
    }
    const candidate = currentIndex + direction
    if (candidate >= 0 && candidate < queue.length) return candidate
    if (repeat === 'all') return direction === 1 ? 0 : queue.length - 1
    return -1
  }, [queue, currentIndex, shuffle, repeat])

  const startIndex = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return
    cancelCrossfade()
    wantPlayingRef.current = true
    setPlaybackError('')
    setCurrentIndex(index)
  }, [cancelCrossfade, queue.length])

  const next = useCallback(() => {
    cancelCrossfade()
    if (repeat === 'one' && audioRef.current) {
      wantPlayingRef.current = true
      audioRef.current.currentTime = 0
      void audioRef.current.play().catch(() => undefined)
      return
    }
    const index = chooseNextIndex(1)
    if (index >= 0) startIndex(index)
    else {
      wantPlayingRef.current = false
      audioRef.current?.pause()
      setPlaying(false)
    }
  }, [cancelCrossfade, chooseNextIndex, repeat, startIndex])

  const previous = useCallback(() => {
    cancelCrossfade()
    const audio = audioRef.current
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0
      return
    }
    const index = chooseNextIndex(-1)
    if (index >= 0) startIndex(index)
  }, [cancelCrossfade, chooseNextIndex, startIndex])

  useEffect(() => { nextRef.current = next }, [next])

  const playbackUrl = useCallback((song: Song, generation: number) => {
    if (song.streamKind === 'radio' && song.radioStationId) return radioStreamUrl(song.radioStationId)
    return streamUrl(song.id, generation, preferencesRef.current.transcodingBitrate)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current) {
      activeTrackIdRef.current = null
      return
    }

    if (promotedTrackIdRef.current === current.id && activeTrackIdRef.current === current.id) {
      promotedTrackIdRef.current = null
      setCurrentTime(audio.currentTime || 0)
      setDuration(Number.isFinite(audio.duration) ? audio.duration : (current.duration || 0))
      return
    }

    cancelCrossfade()
    const trackChanged = activeTrackIdRef.current !== current.id
    pendingSeekRef.current = trackChanged ? 0 : (audio.currentTime || 0)
    activeTrackIdRef.current = current.id
    if (trackChanged) {
      retryCountRef.current = 0
      submittedTrackIdRef.current = null
      nowPlayingReportedRef.current = null
      historyReportedRef.current = null
      setScrobbleState('idle')
    }

    const generation = ++loadGenerationRef.current
    setCurrentTime(0)
    setDuration(current.duration || 0)
    setPlaybackError('')
    setPlaybackLoading(wantPlayingRef.current)

    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    audio.src = playbackUrl(current, generation + reloadToken)
    audio.preload = 'auto'
    audio.volume = effectiveVolume(current)
    audio.load()

    preloadCover(current.coverArt, 900)
    const nextSong = queue[currentIndex + 1]
    preloadCover(nextSong?.coverArt, 420)

    if (wantPlayingRef.current) {
      void audio.play().catch((error: DOMException) => {
        if (generation !== loadGenerationRef.current) return
        if (error?.name === 'AbortError') return
        if (error?.name === 'NotAllowedError') {
          wantPlayingRef.current = false
          setPlaybackLoading(false)
          setPlaybackError('Playback needs another click because the browser blocked autoplay.')
          return
        }
        setPlaybackError(error?.message || 'Could not start playback.')
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, reloadToken, preferences.transcodingBitrate])

  // Prepare the next sequential track for the experimental seamless/crossfade modes.
  useEffect(() => {
    const standby = standbyRef.current
    if (!standby) return
    standby.pause()
    standby.removeAttribute('src')
    standby.load()
    standbyTrackIdRef.current = null
    if (!current || current.streamKind === 'radio' || preferences.playbackTransitionMode === 'standard' || shuffle || repeat === 'one') return
    const nextIndex = currentIndex + 1 < queue.length ? currentIndex + 1 : repeat === 'all' ? 0 : -1
    const nextSong = queue[nextIndex]
    if (!nextSong || nextSong.streamKind === 'radio') return
    standbyTrackIdRef.current = nextSong.id
    standby.src = streamUrl(nextSong.id, 900000 + loadGenerationRef.current, preferences.transcodingBitrate)
    standby.preload = 'auto'
    standby.volume = 0
    standby.load()
  }, [current?.id, currentIndex, queue, shuffle, repeat, preferences.playbackTransitionMode, preferences.transcodingBitrate])

  useEffect(() => {
    if (!current || current.coverArt || current.streamKind === 'radio') return
    const albumId = current.albumId || current.parent
    if (!albumId) return
    const controller = new AbortController()
    getAlbum(albumId, controller.signal).then((album) => {
      setQueue((items) => items.map((song) => song.id === current.id ? {
        ...song,
        albumId: song.albumId || album.id,
        album: song.album || album.album || album.name || album.title,
        artist: song.artist || album.artist,
        artistId: song.artistId || album.artistId,
        coverArt: song.coverArt || album.coverArt,
        year: song.year || album.year,
        genre: song.genre || album.genre
      } : song))
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) console.debug('Metadata hydration failed', error)
    })
    return () => controller.abort()
  }, [current?.id, current?.coverArt, current?.albumId, current?.parent, current?.streamKind])

  useEffect(() => {
    for (const audio of [audioRef.current, standbyRef.current]) {
      if (!audio) continue
      const song = audio === audioRef.current ? current : queue[sequentialNextIndex()] || null
      audio.muted = muted
      audio.volume = audio === audioRef.current ? effectiveVolume(song) : 0
    }
  }, [volumeState, muted, preferences.replayGainMode, preferences.replayGainPreamp, current, queue, effectiveVolume, sequentialNextIndex])

  useEffect(() => {
    if (!current || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || '',
      album: current.album || '',
      artwork: current.coverArt
        ? [
            { src: coverUrl(current.coverArt, 256), sizes: '256x256' },
            { src: coverUrl(current.coverArt, 512), sizes: '512x512' }
          ]
        : []
    })
  }, [current?.id, current?.title, current?.artist, current?.album, current?.coverArt])

  useEffect(() => {
    if (!playing || !current || current.streamKind === 'radio' || nowPlayingReportedRef.current === current.id) return
    nowPlayingReportedRef.current = current.id
    setScrobbleState('reporting')
    void scrobble(current.id, false)
      .then(() => { if (currentSongRef.current?.id === current.id && submittedTrackIdRef.current !== current.id) setScrobbleState('now-playing') })
      .catch(() => { if (currentSongRef.current?.id === current.id) setScrobbleState('error') })
  }, [playing, current])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const safe = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { navigator.mediaSession.setActionHandler(action, handler) } catch { /* unsupported */ }
    }
    safe('play', () => {
      wantPlayingRef.current = true
      if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume().then(() => setVisualizerReady(true)).catch(() => undefined)
      void audioRef.current?.play()
    })
    safe('pause', () => {
      wantPlayingRef.current = false
      audioRef.current?.pause()
    })
    safe('previoustrack', previous)
    safe('nexttrack', next)
    safe('seekbackward', (details) => {
      if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - (details.seekOffset || 10))
    })
    safe('seekforward', (details) => {
      if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration || Infinity, audioRef.current.currentTime + (details.seekOffset || 10))
    })
    safe('seekto', (details) => {
      if (audioRef.current && details.seekTime !== undefined) audioRef.current.currentTime = details.seekTime
    })
    return () => {
      for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'] as MediaSessionAction[]) safe(action, null)
    }
  }, [next, previous])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !current || !Number.isFinite(duration) || duration <= 0) return
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(currentTime, duration) }) } catch { /* browser may reject transient state */ }
  }, [current, currentTime, duration])

  const playQueue = useCallback((songs: Song[], index = 0) => {
    if (!songs.length) return
    cancelCrossfade()
    const safeIndex = Math.max(0, Math.min(index, songs.length - 1))
    wantPlayingRef.current = true
    setPlaybackError('')
    setQueue([...songs])
    setCurrentIndex(safeIndex)
    if (songs[safeIndex]?.id === current?.id) setReloadToken((value) => value + 1)
  }, [cancelCrossfade, current?.id])

  const playSong = useCallback((song: Song, sourceQueue?: Song[]) => {
    cancelCrossfade()
    wantPlayingRef.current = true
    setPlaybackError('')
    if (sourceQueue?.length) {
      const index = Math.max(0, sourceQueue.findIndex((item) => item.id === song.id))
      setQueue([...sourceQueue])
      setCurrentIndex(index)
      if (song.id === current?.id) setReloadToken((value) => value + 1)
      return
    }

    const existing = queue.findIndex((item) => item.id === song.id)
    if (existing >= 0) {
      setCurrentIndex(existing)
      if (song.id === current?.id) setReloadToken((value) => value + 1)
    } else {
      setQueue((items) => [...items, song])
      setCurrentIndex(queue.length)
    }
  }, [cancelCrossfade, queue, current?.id])

  const playRadio = useCallback((station: RadioStation) => {
    cancelCrossfade()
    const song: Song = {
      id: `radio:${station.id}`,
      title: station.name,
      artist: 'Internet Radio',
      album: 'Live stream',
      coverArt: station.coverArt,
      streamKind: 'radio',
      radioStationId: station.id,
      radioHomePageUrl: station.homePageUrl
    }
    wantPlayingRef.current = true
    setQueue([song])
    setCurrentIndex(0)
    if (current?.id === song.id) setReloadToken((value) => value + 1)
  }, [cancelCrossfade, current?.id])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !current) return
    if (audio.paused) {
      wantPlayingRef.current = true
      if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume().then(() => setVisualizerReady(true)).catch(() => undefined)
      setPlaybackLoading(audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)
      void audio.play().catch((error: DOMException) => {
        if (error?.name !== 'AbortError') setPlaybackError(error?.message || 'Could not start playback.')
      })
    } else {
      wantPlayingRef.current = false
      cancelCrossfade()
      audio.pause()
    }
  }, [cancelCrossfade, current])

  const seek = useCallback((seconds: number) => {
    cancelCrossfade()
    if (audioRef.current && Number.isFinite(seconds)) audioRef.current.currentTime = Math.max(0, seconds)
  }, [cancelCrossfade])

  const seekRelative = useCallback((seconds: number) => {
    cancelCrossfade()
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + seconds))
  }, [cancelCrossfade])

  const setVolume = useCallback((volume: number) => {
    const safe = Math.min(1, Math.max(0, volume))
    setVolumeState(safe)
    volumeRef.current = safe
    if (audioRef.current) {
      audioRef.current.muted = false
      setMuted(false)
      mutedRef.current = false
      audioRef.current.volume = effectiveVolume(currentSongRef.current)
    }
  }, [effectiveVolume])

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setMuted(nextMuted)
    for (const audio of [audioRef.current, standbyRef.current]) if (audio) audio.muted = nextMuted
  }, [])

  const toggleShuffle = useCallback(() => setShuffle((value) => !value), [])
  const cycleRepeat = useCallback(() => setRepeat((value) => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'), [])

  const removeFromQueue = useCallback((index: number) => {
    if (index === currentIndex) return
    setQueue((items) => items.filter((_, itemIndex) => itemIndex !== index))
    if (index < currentIndex) setCurrentIndex((value) => value - 1)
  }, [currentIndex])

  const clearQueueAfterCurrent = useCallback(() => {
    if (currentIndex >= 0) setQueue((items) => items.slice(0, currentIndex + 1))
  }, [currentIndex])

  const reorderQueue = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return
    setQueue((items) => {
      const nextItems = [...items]
      const [moved] = nextItems.splice(from, 1)
      nextItems.splice(to, 0, moved)
      return nextItems
    })
    setCurrentIndex((index) => {
      if (index === from) return to
      if (from < index && to >= index) return index - 1
      if (from > index && to <= index) return index + 1
      return index
    })
  }, [queue.length])

  const addNext = useCallback((song: Song) => {
    setQueue((items) => {
      if (currentIndex < 0) return [...items, song]
      const nextItems = [...items]
      nextItems.splice(currentIndex + 1, 0, song)
      return nextItems
    })
  }, [currentIndex])

  const addToQueue = useCallback((song: Song) => setQueue((items) => [...items, song]), [])
  const addManyToQueue = useCallback((songs: Song[]) => {
    if (!songs.length) return
    setQueue((items) => [...items, ...songs])
  }, [])

  const retryPlayback = useCallback(() => {
    if (!current) return
    cancelCrossfade()
    wantPlayingRef.current = true
    retryCountRef.current = 0
    setPlaybackError('')
    setReloadToken((value) => value + 1)
  }, [cancelCrossfade, current])

  const clearHistory = useCallback(() => setHistory([]), [])

  const value = useMemo(() => ({
    current,
    queue,
    currentIndex,
    playing,
    playbackLoading,
    playbackError,
    currentTime,
    duration,
    volume: volumeState,
    muted,
    shuffle,
    repeat,
    scrobbleState,
    history,
    replayGainDb: currentReplayGain.db,
    playSong,
    playQueue,
    playRadio,
    togglePlay,
    next,
    previous,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    removeFromQueue,
    clearQueueAfterCurrent,
    reorderQueue,
    addNext,
    addToQueue,
    addManyToQueue,
    retryPlayback,
    clearHistory,
    visualizerSupported: typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window),
    visualizerReady,
    prepareVisualizer,
    getVisualizerAnalyser,
    getPlaybackTime
  }), [current, queue, currentIndex, playing, playbackLoading, playbackError, currentTime, duration, volumeState, muted, shuffle, repeat, scrobbleState, history, currentReplayGain.db, playSong, playQueue, playRadio, togglePlay, next, previous, seek, seekRelative, setVolume, toggleMute, toggleShuffle, cycleRepeat, removeFromQueue, clearQueueAfterCurrent, reorderQueue, addNext, addToQueue, addManyToQueue, retryPlayback, clearHistory, visualizerReady, prepareVisualizer, getVisualizerAnalyser, getPlaybackTime])

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const value = useContext(PlayerContext)
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider')
  return value
}
