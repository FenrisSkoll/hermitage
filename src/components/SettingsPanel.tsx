import { RotateCcw, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePreferences, type AlbumGridDensity, type ColourMode, type DesktopDensity, type FocusPreset, type NowPlayingTab, type PlaybackTransitionMode, type ReplayGainMode, type SpectrumStyle } from '../context/PreferencesContext'

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { preferences, updatePreference, resetPreferences } = usePreferences()
  const auth = useAuth()
  if (!open) return null

  return (
    <div className="settings-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <aside className="settings-panel">
        <div className="settings-heading"><div><span className="eyebrow">Hermitage v0.6.2</span><h2>Settings</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>

        <div className="settings-section">
          <span className="settings-section__title">Interface</span>
          <Toggle label="Animations & transitions" description="Shared artwork, page and queue motion." checked={preferences.animations} onChange={(value) => updatePreference('animations', value)} />
          <Toggle label="Artwork ambience" description="Blend the current cover into the background." checked={preferences.ambientArtwork} onChange={(value) => updatePreference('ambientArtwork', value)} />
          <Toggle label="Compact sidebar" description="Keep navigation icon-first on large screens." checked={preferences.compactSidebar} onChange={(value) => updatePreference('compactSidebar', value)} />
          <Toggle label="Show quality" description="Show codec and bitrate columns where available." checked={preferences.showQuality} onChange={(value) => updatePreference('showQuality', value)} />
          <label className="settings-field"><span><strong>Album grid size</strong><small>Choose how much artwork fits across your library.</small></span><select value={preferences.albumGridDensity} onChange={(event) => updatePreference('albumGridDensity', event.target.value as AlbumGridDensity)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
          <label className="settings-field"><span><strong>Desktop density</strong><small>Adjust margins, panel widths and information density for your display.</small></span><select value={preferences.desktopDensity} onChange={(event) => updatePreference('desktopDensity', event.target.value as DesktopDensity)}><option value="comfortable">Comfortable</option><option value="balanced">Balanced</option><option value="compact">Compact</option><option value="ultrawide">Ultrawide</option></select></label>
          <Toggle label="Compact / floating player" description="Turn the bottom player into a floating mini-player while browsing." checked={preferences.miniPlayer} onChange={(value) => updatePreference('miniPlayer', value)} />
          <Toggle label="Fullscreen spectrum visualizer" description="After the fullscreen controls fade, reveal an artwork-coloured 20 Hz–20 kHz spectrum." checked={preferences.fullscreenVisualizer} onChange={(value) => updatePreference('fullscreenVisualizer', value)} />
          {preferences.fullscreenVisualizer ? <Toggle label="Dock spectrum to bottom" description="Keep the spectrum against the bottom edge and let the artwork remain larger on wide displays." checked={preferences.fullscreenVisualizerDocked} onChange={(value) => updatePreference('fullscreenVisualizerDocked', value)} /> : null}
          {preferences.fullscreenVisualizer ? <Toggle label="Spectrum reflection" description="Add a subtle mirrored reflection when the spectrum is raised from the bottom (Dock spectrum to bottom off)." checked={preferences.fullscreenVisualizerReflection} onChange={(value) => updatePreference('fullscreenVisualizerReflection', value)} /> : null}
          {preferences.fullscreenVisualizer ? <label className="settings-field"><span><strong>Visualizer style</strong><small>Different renderings of the same live analyser.</small></span><select value={preferences.spectrumStyle} onChange={(event) => updatePreference('spectrumStyle', event.target.value as SpectrumStyle)}><option value="spectrum">Spectrum</option><option value="wave">Wave</option><option value="minimal">Minimal</option></select></label> : null}
          <label className="settings-field"><span><strong>Focus View preset</strong><small>Which fullscreen composition opens from the player button.</small></span><select value={preferences.focusPreset} onChange={(event) => updatePreference('focusPreset', event.target.value as FocusPreset)}><option value="artwork">Artwork</option><option value="spectrum">Artwork + Spectrum</option><option value="queue">Artwork + Queue</option><option value="lyrics">Artwork + Lyrics</option><option value="album">Artwork + Album</option></select></label>
        </div>

        <div className="settings-section">
          <span className="settings-section__title">Appearance</span>
          <label className="settings-field"><span><strong>UI colour response</strong><small>Static dark, subtle artwork tint, or vivid album-driven colour.</small></span><select value={preferences.colourMode} onChange={(event) => updatePreference('colourMode', event.target.value as ColourMode)}><option value="static">Static dark</option><option value="subtle">Subtle</option><option value="vivid">Vivid</option></select></label>
          <label className="settings-field"><span><strong>Backdrop strength</strong><small>How strongly album artwork bleeds into the player.</small></span><input type="range" min="0" max="1" step="0.05" value={preferences.backdropStrength} onChange={(event) => updatePreference('backdropStrength', Number(event.target.value))} /></label>
          <label className="settings-field"><span><strong>Ambient blur</strong><small>{preferences.ambientBlur.toFixed(0)} px</small></span><input type="range" min="45" max="160" step="5" value={preferences.ambientBlur} onChange={(event) => updatePreference('ambientBlur', Number(event.target.value))} /></label>
          <label className="settings-field"><span><strong>Ambient saturation</strong><small>{preferences.ambientSaturation.toFixed(2)}×</small></span><input type="range" min="0.2" max="2" step="0.05" value={preferences.ambientSaturation} onChange={(event) => updatePreference('ambientSaturation', Number(event.target.value))} /></label>
          <label className="settings-field"><span><strong>Default Now Playing panel</strong><small>Which right-hand panel opens first.</small></span><select value={preferences.defaultNowPlayingTab} onChange={(event) => updatePreference('defaultNowPlayingTab', event.target.value as NowPlayingTab)}><option value="album">Album</option><option value="queue">Queue</option><option value="lyrics">Lyrics</option><option value="info">Info</option></select></label>
        </div>

        <div className="settings-section">
          <span className="settings-section__title">Audio</span>
          <label className="settings-field"><span><strong>Streaming quality</strong><small>Original keeps the source codec. Other choices ask Navidrome to transcode/downsample.</small></span><select value={preferences.transcodingBitrate} onChange={(event) => updatePreference('transcodingBitrate', Number(event.target.value))}><option value={0}>Original / lossless</option><option value={320}>320 kbps</option><option value={256}>256 kbps</option><option value={192}>192 kbps</option><option value={128}>128 kbps</option><option value={96}>96 kbps</option></select></label>
          <label className="settings-field"><span><strong>ReplayGain</strong><small>Applies gain in the browser when Navidrome exposes ReplayGain metadata.</small></span><select value={preferences.replayGainMode} onChange={(event) => updatePreference('replayGainMode', event.target.value as ReplayGainMode)}><option value="off">Off</option><option value="track">Track gain</option><option value="album">Album gain</option></select></label>
          <label className="settings-field"><span><strong>ReplayGain preamp</strong><small>{preferences.replayGainPreamp > 0 ? '+' : ''}{preferences.replayGainPreamp.toFixed(1)} dB</small></span><input type="range" min="-12" max="12" step="0.5" value={preferences.replayGainPreamp} onChange={(event) => updatePreference('replayGainPreamp', Number(event.target.value))} /></label>
          <label className="settings-field"><span><strong>Lyrics timing offset</strong><small>{preferences.lyricsTimingOffsetMs > 0 ? '+' : ''}{preferences.lyricsTimingOffsetMs} ms · negative shows lyrics earlier</small></span><input type="range" min="-2000" max="2000" step="50" value={preferences.lyricsTimingOffsetMs} onChange={(event) => updatePreference('lyricsTimingOffsetMs', Number(event.target.value))} /></label>
          <label className="settings-field"><span><strong>Track transitions</strong><small>Preload is the safe default. Crossfade uses two browser audio streams and remains experimental.</small></span><select value={preferences.playbackTransitionMode} onChange={(event) => updatePreference('playbackTransitionMode', event.target.value as PlaybackTransitionMode)}><option value="standard">Standard</option><option value="preload">Preload next / gapless assist</option><option value="crossfade">Crossfade (experimental)</option></select></label>
          {preferences.playbackTransitionMode === 'crossfade' ? <label className="settings-field"><span><strong>Crossfade length</strong><small>{preferences.crossfadeSeconds.toFixed(0)} seconds</small></span><input type="range" min="1" max="12" step="1" value={preferences.crossfadeSeconds} onChange={(event) => updatePreference('crossfadeSeconds', Number(event.target.value))} /></label> : null}
        </div>

        <div className="settings-shortcuts">
          <span className="eyebrow">Keyboard</span>
          <div><kbd>Space</kbd><span>Play / pause</span></div>
          <div><kbd>← / →</kbd><span>Seek 10 seconds</span></div>
          <div><kbd>Ctrl K</kbd><span>Command palette / search</span></div>
          <div><kbd>N</kbd><span>Now Playing</span></div>
          <div><kbd>Q</kbd><span>Queue / add focused album</span></div>
          <div><kbd>L</kbd><span>Lyrics</span></div>
          <div><kbd>R</kbd><span>Random album</span></div>
          <div><kbd>F</kbd><span>Favourite focused album</span></div>
          <div><kbd>M</kbd><span>Mute</span></div>
        </div>

        <div className="settings-section settings-about">
          <span className="settings-section__title">About</span>
          <div className="settings-about__row"><span><strong>Hermitage</strong><small>Release</small></span><b>v0.6.2</b></div>
          <div className="settings-about__row"><span><strong>Navidrome server</strong><small>Current session</small></span><b>{auth.server || 'Not connected'}</b></div>
          <div className="settings-about__row"><span><strong>User</strong><small>Current session</small></span><b>{auth.username || '—'}</b></div>
          <a className="settings-about__health" href="/api/health" target="_blank" rel="noreferrer">Open health endpoint</a>
        </div>
        <button className="settings-reset" onClick={resetPreferences}><RotateCcw size={16} /> Reset preferences</button>
      </aside>
    </div>
  )
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>
}
