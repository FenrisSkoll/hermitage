import { GripVertical, ListMusic, Pencil, Play, Save, Shuffle, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { SongList } from '../components/SongList'
import { usePlayer } from '../context/PlayerContext'
import { deletePlaylist, getPlaylist, replacePlaylist } from '../lib/api'
import { formatTime } from '../lib/format'
import { showToast } from '../lib/toast'
import type { Playlist, Song } from '../lib/types'

export function PlaylistPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const player = usePlayer()
  const [playlist, setPlaylist] = useState<Playlist | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftSongs, setDraftSongs] = useState<Song[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!id) return () => undefined
    const controller = new AbortController()
    setPlaylist(null)
    setError('')
    getPlaylist(id, controller.signal)
      .then((value) => {
        setPlaylist(value)
        setDraftName(value.name)
        setDraftSongs(value.entry || [])
      })
      .catch((err) => { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message) })
    return () => controller.abort()
  }

  useEffect(load, [id])

  const totalDuration = useMemo(() => draftSongs.reduce((sum, song) => sum + (song.duration || 0), 0), [draftSongs])

  if (error) return <ErrorState message={error} />
  if (!playlist) return <PageSkeleton kind="artist" />
  const songs = playlist.entry || []

  const resetDraft = () => {
    setDraftName(playlist.name)
    setDraftSongs(songs)
    setEditing(false)
  }

  const save = async () => {
    if (!id || !draftName.trim()) return
    setSaving(true)
    try {
      await replacePlaylist(id, draftName.trim(), draftSongs)
      const refreshed = await getPlaylist(id)
      setPlaylist(refreshed)
      setDraftName(refreshed.name)
      setDraftSongs(refreshed.entry || [])
      setEditing(false)
      window.dispatchEvent(new Event('hermitage:playlists-changed'))
      showToast('Playlist saved.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save playlist.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = (index: number) => setDraftSongs((items) => items.filter((_, itemIndex) => itemIndex !== index))
  const move = (from: number, to: number) => {
    if (from === to) return
    setDraftSongs((items) => {
      const next = [...items]
      const [song] = next.splice(from, 1)
      next.splice(to, 0, song)
      return next
    })
  }

  const removePlaylist = async () => {
    if (!id || !window.confirm(`Delete playlist “${playlist.name}”?`)) return
    try {
      await deletePlaylist(id)
      window.dispatchEvent(new Event('hermitage:playlists-changed'))
      navigate('/')
      showToast('Playlist deleted.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete playlist.', 'error')
    }
  }

  return (
    <div className="page playlist-page">
      <section className="playlist-hero">
        <div className="playlist-hero__icon"><ListMusic size={72} strokeWidth={1} /></div>
        <div className="playlist-hero__content"><span className="eyebrow">Playlist</span>
          {editing ? <input className="playlist-name-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Playlist name" /> : <h1>{playlist.name}</h1>}
          <p>{editing ? draftSongs.length : songs.length} songs · {formatTime(editing ? totalDuration : playlist.duration || songs.reduce((sum, song) => sum + (song.duration || 0), 0))}</p>
          <div className="hero-actions">
            {!editing ? <>
              <button className="primary-button" onClick={() => player.playQueue(songs, 0)} disabled={!songs.length}><Play size={18} fill="currentColor" /> Play</button>
              <button className="secondary-button" onClick={() => player.playQueue([...songs].sort(() => Math.random() - 0.5), 0)} disabled={!songs.length}><Shuffle size={18} /> Shuffle</button>
              <button className="secondary-button" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
            </> : <>
              <button className="primary-button" onClick={save} disabled={saving || !draftName.trim()}><Save size={17} /> {saving ? 'Saving…' : 'Save'}</button>
              <button className="secondary-button" onClick={resetDraft}><X size={17} /> Cancel</button>
              <button className="secondary-button danger-button" onClick={removePlaylist}><Trash2 size={16} /> Delete playlist</button>
            </>}
          </div>
        </div>
      </section>
      {!editing ? <SongList songs={songs} showAlbum /> : (
        <div className="playlist-editor">
          <div className="playlist-editor__hint">Drag tracks to reorder. Removing a row only changes the playlist after you press Save.</div>
          {draftSongs.map((song, index) => (
            <div
              key={`${song.id}-${index}`}
              className={`playlist-edit-row ${dragging === index ? 'is-dragging' : ''}`}
              draggable
              onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)) }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
              onDrop={(event) => { event.preventDefault(); if (dragging !== null) move(dragging, index); setDragging(null) }}
              onDragEnd={() => setDragging(null)}
            >
              <GripVertical size={16} className="playlist-edit-row__grip" />
              <span className="playlist-edit-row__number">{index + 1}</span>
              <span className="playlist-edit-row__title"><strong>{song.title}</strong><small>{song.artist}{song.album ? ` · ${song.album}` : ''}</small></span>
              <span>{formatTime(song.duration)}</span>
              <button className="icon-button" onClick={() => remove(index)} title="Remove from playlist"><X size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
