import { useEffect, useState } from 'react'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { SongList } from '../components/SongList'
import { subsonic } from '../lib/api'
import type { Song } from '../lib/types'

export function SongsPage() {
  const [songs, setSongs] = useState<Song[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const data = await subsonic('search3', { query: '', artistCount: 0, albumCount: 0, songCount: 500 }, { signal: controller.signal, cacheMs: 60_000 })
        if (!controller.signal.aborted) setSongs(data.searchResult3?.song || [])
      } catch (firstError) {
        if (controller.signal.aborted) return
        try {
          const data = await subsonic('getRandomSongs', { size: 500 }, { signal: controller.signal })
          if (!controller.signal.aborted) setSongs(data.randomSongs?.song || [])
        } catch (err) {
          if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load songs.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  if (loading) return <PageSkeleton kind="grid" />
  if (error) return <ErrorState message={error} />

  return <div className="page"><div className="page-heading"><div><span className="eyebrow">Your library</span><h1>Songs</h1><p>Up to 500 tracks in this view</p></div></div><SongList songs={songs} showAlbum /></div>
}
