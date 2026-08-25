import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type NowPlayingTab = 'album' | 'queue' | 'lyrics' | 'info'
export type ColourMode = 'static' | 'subtle' | 'vivid'
export type ReplayGainMode = 'off' | 'track' | 'album'
export type PlaybackTransitionMode = 'standard' | 'preload' | 'crossfade'
export type AlbumGridDensity = 'small' | 'medium' | 'large'
export type DesktopDensity = 'comfortable' | 'balanced' | 'compact' | 'ultrawide'
export type SpectrumStyle = 'spectrum' | 'wave' | 'minimal'
export type FocusPreset = 'artwork' | 'spectrum' | 'queue' | 'lyrics' | 'album'

export type Preferences = {
  compactSidebar: boolean
  animations: boolean
  ambientArtwork: boolean
  colourMode: ColourMode
  backdropStrength: number
  defaultNowPlayingTab: NowPlayingTab
  showQuality: boolean
  transcodingBitrate: number
  replayGainMode: ReplayGainMode
  replayGainPreamp: number
  playbackTransitionMode: PlaybackTransitionMode
  crossfadeSeconds: number
  fullscreenVisualizer: boolean
  fullscreenVisualizerDocked: boolean
  fullscreenVisualizerReflection: boolean
  albumGridDensity: AlbumGridDensity
  desktopDensity: DesktopDensity
  ambientBlur: number
  ambientSaturation: number
  spectrumStyle: SpectrumStyle
  focusPreset: FocusPreset
  miniPlayer: boolean
}

const defaults: Preferences = {
  compactSidebar: false,
  animations: true,
  ambientArtwork: true,
  colourMode: 'subtle',
  backdropStrength: 0.72,
  defaultNowPlayingTab: 'album',
  showQuality: true,
  transcodingBitrate: 0,
  replayGainMode: 'off',
  replayGainPreamp: 0,
  playbackTransitionMode: 'preload',
  crossfadeSeconds: 4,
  fullscreenVisualizer: true,
  fullscreenVisualizerDocked: true,
  fullscreenVisualizerReflection: true,
  albumGridDensity: 'medium',
  desktopDensity: 'balanced',
  ambientBlur: 100,
  ambientSaturation: 1.05,
  spectrumStyle: 'spectrum',
  focusPreset: 'spectrum',
  miniPlayer: false,
}

const storageKey = 'hermitage-preferences-v6'
const legacyStorageKeys = ['hermitage-preferences-v5', 'hermitage-preferences-v4', 'hermitage-preferences-v3']

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(storageKey) || legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    return {
      ...defaults,
      ...parsed,
      colourMode: parsed.colourMode === 'static' || parsed.colourMode === 'vivid' ? parsed.colourMode : 'subtle',
      replayGainMode: ['off', 'track', 'album'].includes(parsed.replayGainMode) ? parsed.replayGainMode : 'off',
      playbackTransitionMode: ['standard', 'preload', 'crossfade'].includes(parsed.playbackTransitionMode) ? parsed.playbackTransitionMode : 'preload',
      transcodingBitrate: Number(parsed.transcodingBitrate) || 0,
      replayGainPreamp: Math.max(-12, Math.min(12, Number(parsed.replayGainPreamp) || 0)),
      crossfadeSeconds: Math.max(1, Math.min(12, Number(parsed.crossfadeSeconds) || 4)),
      albumGridDensity: ['small', 'medium', 'large'].includes(parsed.albumGridDensity) ? parsed.albumGridDensity : 'medium',
      desktopDensity: ['comfortable', 'balanced', 'compact', 'ultrawide'].includes(parsed.desktopDensity) ? parsed.desktopDensity : 'balanced',
      ambientBlur: Math.max(45, Math.min(160, Number(parsed.ambientBlur) || 100)),
      ambientSaturation: Math.max(.2, Math.min(2, Number(parsed.ambientSaturation) || 1.05)),
      spectrumStyle: ['spectrum', 'wave', 'minimal'].includes(parsed.spectrumStyle) ? parsed.spectrumStyle : 'spectrum',
      focusPreset: ['artwork', 'spectrum', 'queue', 'lyrics', 'album'].includes(parsed.focusPreset) ? parsed.focusPreset : 'spectrum',
      miniPlayer: Boolean(parsed.miniPlayer)
    }
  } catch {
    return defaults
  }
}

type PreferencesContextValue = {
  preferences: Preferences
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
  resetPreferences: () => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(preferences))
    document.documentElement.dataset.motion = preferences.animations ? 'on' : 'off'
    document.documentElement.dataset.colourMode = preferences.colourMode
    document.documentElement.style.setProperty('--backdrop-strength', String(preferences.backdropStrength))
    document.documentElement.style.setProperty('--ambient-blur', `${preferences.ambientBlur}px`)
    document.documentElement.style.setProperty('--ambient-saturation', String(preferences.ambientSaturation))
    document.documentElement.style.setProperty('--ambient-saturation-vivid', String(preferences.ambientSaturation * 1.35))
    document.documentElement.style.setProperty('--ambient-saturation-static', String(preferences.ambientSaturation * .24))
    document.documentElement.dataset.albumDensity = preferences.albumGridDensity
    document.documentElement.dataset.desktopDensity = preferences.desktopDensity
  }, [preferences])

  const value = useMemo<PreferencesContextValue>(() => ({
    preferences,
    updatePreference: (key, value) => setPreferences((current) => ({ ...current, [key]: value })),
    resetPreferences: () => setPreferences(defaults)
  }), [preferences])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider')
  return value
}
