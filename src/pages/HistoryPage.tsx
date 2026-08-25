import { History, Trash2 } from 'lucide-react'
import { SongList } from '../components/SongList'
import { usePlayer } from '../context/PlayerContext'

export function HistoryPage() {
  const player = usePlayer()
  const songs = player.history.map((entry) => ({ ...entry.song, played: new Date(entry.playedAt).toISOString() }))
  return (
    <div className="page history-page">
      <div className="page-heading page-heading--actions">
        <div><span className="eyebrow">Hermitage</span><h1>Recently Played</h1><p>{player.history.length ? `${player.history.length} recent plays recorded in this browser.` : 'Tracks you play in Hermitage will appear here.'}</p></div>
        {player.history.length ? <button className="secondary-button" onClick={player.clearHistory}><Trash2 size={16} /> Clear history</button> : null}
      </div>
      {songs.length ? <SongList songs={songs} showAlbum /> : <div className="empty-library"><History size={42} /><strong>No playback history yet</strong><span>Start an album or use Random and Hermitage will keep a local recent-history list.</span></div>}
    </div>
  )
}
