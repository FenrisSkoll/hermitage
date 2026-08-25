import { Download, Heart, ListEnd, ListMusic, ListPlus, MoreHorizontal, Pause, Play } from 'lucide-react'
import { useState } from 'react'
import { usePlayer } from '../context/PlayerContext'
import { usePreferences } from '../context/PreferencesContext'
import { addSongToPlaylist, downloadUrl, getPlaylists, setStar } from '../lib/api'
import { formatTime } from '../lib/format'
import { showToast } from '../lib/toast'
import type { Song } from '../lib/types'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

export function SongList({ songs, showAlbum = false, dense = false }: { songs: Song[]; showAlbum?: boolean; dense?: boolean }) {
  const player = usePlayer()
  const { preferences } = usePreferences()
  const [, rerender] = useState(0)
  const [menu, setMenu] = useState<{ x: number; y: number; song: Song } | null>(null)

  const toggleStar = async (song: Song, event?: React.MouseEvent) => {
    event?.stopPropagation()
    await setStar({ id: song.id }, !song.starred)
    song.starred = song.starred ? undefined : new Date().toISOString()
    rerender((value) => value + 1)
    const nowStarred = Boolean(song.starred)
    showToast(nowStarred ? `${song.title} added to favourites` : `${song.title} removed from favourites`, 'success', { label: 'Undo', run: async () => { await setStar({ id: song.id }, !nowStarred); song.starred = nowStarred ? undefined : new Date().toISOString(); rerender((value) => value + 1) } })
  }

  const choosePlaylist = async (song: Song) => {
    const playlists = await getPlaylists()
    if (!playlists.length) throw new Error('No playlists are available yet.')
    const menuText = playlists.map((playlist, index) => `${index + 1}. ${playlist.name}`).join('\n')
    const answer = window.prompt(`Add “${song.title}” to which playlist?\n\n${menuText}\n\nEnter a number:`)
    if (!answer) return
    const index = Number(answer) - 1
    const playlist = playlists[index]
    if (!playlist) throw new Error('That playlist number is not valid.')
    await addSongToPlaylist(playlist.id, song.id)
    window.dispatchEvent(new Event('hermitage:playlists-changed'))
    showToast(`Added to ${playlist.name}.`, 'success')
  }

  const menuItems = (song: Song): ContextMenuItem[] => [
    { label: 'Play now', icon: <Play size={15} />, onClick: () => player.playSong(song, songs) },
    { label: 'Play next', icon: <ListPlus size={15} />, onClick: () => { player.addNext(song); showToast(`${song.title} will play next`, 'success') } },
    { label: 'Add to queue', icon: <ListEnd size={15} />, onClick: () => { player.addToQueue(song); showToast(`${song.title} added to queue`, 'success') } },
    { label: 'Add to playlist…', icon: <ListMusic size={15} />, onClick: () => choosePlaylist(song) },
    { label: song.starred ? 'Remove from favourites' : 'Add to favourites', icon: <Heart size={15} />, onClick: () => toggleStar(song) },
    { label: 'Download original', icon: <Download size={15} />, onClick: () => { showToast(`Starting download: ${song.title}`, 'neutral'); window.location.assign(downloadUrl(song.id)) } }
  ]

  return (
    <>
      <div className={`song-list ${dense ? 'song-list--dense' : ''} ${!preferences.showQuality ? 'hide-quality' : ''}`}>
        <div className="song-list__header">
          <span>#</span><span>Title</span>{showAlbum && <span>Album</span>}<span className="song-list__quality">Quality</span><span className="song-list__time">Time</span><span />
        </div>
        {songs.map((song, index) => {
          const active = player.current?.id === song.id
          return (
            <div
              key={`${song.id}-${index}`}
              className={`song-row ${active ? 'is-active' : ''}`}
              onClick={() => player.playSong(song, songs)}
              onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, song }) }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') player.playSong(song, songs) }}
              role="button"
              tabIndex={0}
            >
              <span className="song-row__index">
                <span className="song-row__number">{song.track || index + 1}</span>
                <span className="song-row__play">{active && player.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</span>
              </span>
              <span className="song-row__title-block">
                <strong>{song.title}</strong>
                <small>{song.artist || 'Unknown artist'}</small>
              </span>
              {showAlbum && <span className="song-row__album">{song.album || '—'}</span>}
              <span className="song-list__quality song-row__quality">{song.suffix?.toUpperCase() || song.contentType?.split('/').pop()?.toUpperCase() || '—'}{song.bitRate ? ` · ${song.bitRate}k` : ''}{song.samplingRate ? ` · ${(song.samplingRate / 1000).toFixed(1)}kHz` : ''}</span>
              <span className="song-list__time">{formatTime(song.duration)}</span>
              <span className="song-row__actions" onClick={(event) => event.stopPropagation()}>
                <button className={song.starred ? 'is-active' : ''} onClick={(event) => toggleStar(song, event)} aria-label="Favourite song"><Heart size={16} fill={song.starred ? 'currentColor' : 'none'} /></button>
                <button className="song-row__more" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setMenu({ x: rect.right, y: rect.bottom, song }) }} aria-label="Song actions"><MoreHorizontal size={16} /></button>
              </span>
            </div>
          )
        })}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.song)} onClose={() => setMenu(null)} /> : null}
    </>
  )
}
