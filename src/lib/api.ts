import type { Album, Artist, Playlist, RadioStation, Song, StructuredLyrics } from './types'

type FetchOptions = { signal?: AbortSignal; cacheMs?: number }

type CacheEntry = { expires: number; value: Record<string, any> }
const responseCache = new Map<string, CacheEntry>()

function makeCacheKey(method: string, params: Record<string, unknown>) {
  return `${method}:${JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))}`
}

async function readJson<T>(response: Response, notifySessionExpiry = true): Promise<T> {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && notifySessionExpiry && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hermitage:session-expired'))
    }
    throw new Error(data.error || `Request failed (${response.status})`)
  }
  return data as T
}


export type HermitageConfig = {
  version: string
  defaultServerUrl?: string
  lockServerUrl: boolean
  secureCookies: boolean
  serverSelection: 'locked' | 'prefilled' | 'user'
}

export async function getConfig() {
  return readJson<HermitageConfig>(await fetch('/api/config'), false)
}

export async function login(server: string, username: string, password: string) {
  const result = await readJson<{ connected: boolean; server: string; serverType?: string; serverVersion?: string }>(
    await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ server, username, password })
    }),
    false
  )
  responseCache.clear()
  return result
}

export async function logout() {
  responseCache.clear()
  return readJson(await fetch('/api/logout', { method: 'POST' }))
}

export async function getSession() {
  return readJson<{ connected: boolean; server?: string; username?: string }>(await fetch('/api/session'))
}

export async function subsonic(
  method: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: FetchOptions = {}
) {
  const cacheMs = options.cacheMs ?? 0
  const key = makeCacheKey(method, params)
  if (cacheMs > 0) {
    const cached = responseCache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
  }

  const qs = new URLSearchParams()
  for (const [keyName, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(keyName, String(value))
  }
  const response = await fetch(`/api/subsonic/${encodeURIComponent(method)}?${qs}`, { signal: options.signal })
  const data = await readJson<Record<string, any>>(response)
  if (cacheMs > 0) responseCache.set(key, { expires: Date.now() + cacheMs, value: data })
  return data
}

export async function subsonicAction(method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`/api/subsonic/${encodeURIComponent(method)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  const result = await readJson<Record<string, any>>(response)
  if (!['scrobble', 'savePlayQueue'].includes(method)) responseCache.clear()
  return result
}

export function coverUrl(id?: string, size = 600) {
  if (!id) return ''
  return `/api/cover/${encodeURIComponent(id)}?size=${size}`
}

export function streamUrl(id: string, generation?: number, maxBitRate = 0) {
  const qs = new URLSearchParams()
  if (generation !== undefined) qs.set('g', String(generation))
  if (maxBitRate > 0) qs.set('maxBitRate', String(maxBitRate))
  else qs.set('format', 'raw')
  return `/api/stream/${encodeURIComponent(id)}?${qs}`
}

export function radioStreamUrl(id: string) {
  return `/api/radio/${encodeURIComponent(id)}`
}

export function downloadUrl(id: string) {
  return `/api/download/${encodeURIComponent(id)}`
}

function normalizeSong(song: Song, album?: Album): Song {
  return {
    ...song,
    streamKind: song.streamKind || 'music',
    albumId: song.albumId || song.parent || album?.id,
    album: song.album || album?.album || album?.name || album?.title,
    artist: song.artist || album?.artist,
    artistId: song.artistId || album?.artistId,
    coverArt: song.coverArt || album?.coverArt,
    year: song.year || album?.year,
    genre: song.genre || album?.genre
  }
}

export async function getAlbums(type = 'alphabeticalByArtist', offset = 0, size = 100, signal?: AbortSignal): Promise<Album[]> {
  const data = await subsonic('getAlbumList2', { type, offset, size }, { signal, cacheMs: type === 'random' ? 0 : 30_000 })
  return data.albumList2?.album || []
}

export async function getAlbum(id: string, signal?: AbortSignal): Promise<Album & { song: Song[] }> {
  const data = await subsonic('getAlbum', { id }, { signal, cacheMs: 5 * 60_000 })
  const album = data.album || {}
  return { ...album, song: (album.song || []).map((song: Song) => normalizeSong(song, album)) }
}

export async function getSong(id: string, signal?: AbortSignal): Promise<Song> {
  const data = await subsonic('getSong', { id }, { signal, cacheMs: 5 * 60_000 })
  return normalizeSong(data.song || { id, title: 'Unknown track' })
}

export async function getArtists(signal?: AbortSignal): Promise<Artist[]> {
  const data = await subsonic('getArtists', {}, { signal, cacheMs: 5 * 60_000 })
  const indexes = data.artists?.index || []
  return indexes.flatMap((group: any) => group.artist || [])
}

export async function getArtist(id: string, signal?: AbortSignal): Promise<Artist & { album: Album[] }> {
  const data = await subsonic('getArtist', { id }, { signal, cacheMs: 5 * 60_000 })
  return { ...data.artist, album: data.artist?.album || [] }
}

export async function getPlaylists(signal?: AbortSignal): Promise<Playlist[]> {
  const data = await subsonic('getPlaylists', {}, { signal, cacheMs: 30_000 })
  return data.playlists?.playlist || []
}

export async function getPlaylist(id: string, signal?: AbortSignal): Promise<Playlist> {
  const data = await subsonic('getPlaylist', { id }, { signal, cacheMs: 15_000 })
  const playlist = data.playlist || {}
  return { ...playlist, entry: (playlist.entry || []).map((song: Song) => normalizeSong(song)) }
}

export async function createPlaylist(name: string, songs: Song[] = []) {
  const data = await subsonicAction('createPlaylist', { name, songId: songs.map((song) => song.id) })
  return data.playlist as Playlist | undefined
}

export async function replacePlaylist(playlistId: string, name: string, songs: Song[]) {
  return subsonicAction('createPlaylist', { playlistId, name, songId: songs.map((song) => song.id) })
}

export async function addSongToPlaylist(playlistId: string, songId: string) {
  return subsonicAction('updatePlaylist', { playlistId, songIdToAdd: songId })
}

export async function deletePlaylist(playlistId: string) {
  return subsonicAction('deletePlaylist', { id: playlistId })
}

export async function getStarredAlbums(signal?: AbortSignal): Promise<Album[]> {
  const data = await subsonic('getStarred2', {}, { signal, cacheMs: 15_000 })
  return data.starred2?.album || []
}

export async function setStar(target: { id?: string; albumId?: string; artistId?: string }, starred: boolean) {
  const method = starred ? 'star' : 'unstar'
  return subsonicAction(method, target)
}

export async function setRating(id: string, rating: number) {
  return subsonicAction('setRating', { id, rating: Math.max(0, Math.min(5, Math.round(rating))) })
}

export async function scrobble(id: string, submission: boolean) {
  return subsonicAction('scrobble', { id, submission, time: Date.now() })
}

export async function getLyricsForSong(song: Song, signal?: AbortSignal): Promise<StructuredLyrics | null> {
  for (const params of [{ id: song.id, enhanced: true }, { id: song.id }]) {
    try {
      const data = await subsonic('getLyricsBySongId', params, { signal, cacheMs: 5 * 60_000 })
      const candidates = (data.lyricsList?.structuredLyrics || []) as StructuredLyrics[]
      const main = candidates.find((entry: any) => !entry.kind || entry.kind === 'main') || candidates[0]
      if (main?.line?.length) return main
    } catch (error) {
      if (signal?.aborted) throw error
    }
  }

  try {
    const data = await subsonic('getLyrics', { artist: song.artist || '', title: song.title }, { signal, cacheMs: 5 * 60_000 })
    const value = data.lyrics?.value || data.lyrics?.lyrics || ''
    if (!value) return null
    return { synced: false, line: String(value).split(/\r?\n/).map((line) => ({ value: line })) }
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

export async function getInternetRadioStations(signal?: AbortSignal): Promise<RadioStation[]> {
  const data = await subsonic('getInternetRadioStations', {}, { signal, cacheMs: 60_000 })
  return data.internetRadioStations?.internetRadioStation || []
}

export async function searchLibrary(
  query: string,
  signal?: AbortSignal,
  counts: { artistCount?: number; albumCount?: number; songCount?: number } = {}
) {
  const data = await subsonic('search3', {
    query,
    artistCount: counts.artistCount ?? 8,
    albumCount: counts.albumCount ?? 12,
    songCount: counts.songCount ?? 20
  }, { signal, cacheMs: 15_000 })
  return {
    artists: (data.searchResult3?.artist || []) as Artist[],
    albums: (data.searchResult3?.album || []) as Album[],
    songs: (data.searchResult3?.song || []).map((song: Song) => normalizeSong(song)) as Song[]
  }
}

export function preloadCover(coverArt?: string, size = 900) {
  if (!coverArt) return
  const image = new Image()
  image.decoding = 'async'
  image.src = coverUrl(coverArt, size)
}
