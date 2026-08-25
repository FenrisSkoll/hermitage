import { useCallback, useEffect, useRef, useState } from 'react'
import { AlbumGrid } from '../components/AlbumGrid'
import { ErrorState } from '../components/Loading'
import { PageSkeleton } from '../components/Skeletons'
import { getAlbums, getStarredAlbums } from '../lib/api'
import type { Album } from '../lib/types'

export function AlbumCollectionPage({ title, type, favourites = false }: { title: string; type?: string; favourites?: boolean }) {
  const [albums, setAlbums] = useState<Album[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [hasMore, setHasMore] = useState(!favourites)
  const [error, setError] = useState('')
  const activeController = useRef<AbortController | null>(null)
  const pageSize = 100

  const load = useCallback(async (nextOffset = 0, append = false) => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    append ? setMoreLoading(true) : setLoading(true)
    setError('')
    try {
      const result = favourites ? await getStarredAlbums(controller.signal) : await getAlbums(type || 'alphabeticalByArtist', nextOffset, pageSize, controller.signal)
      if (controller.signal.aborted) return
      setAlbums((items) => append ? [...items, ...result] : result)
      setOffset(nextOffset + result.length)
      setHasMore(!favourites && result.length === pageSize)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : 'Could not load albums.')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setMoreLoading(false)
      }
    }
  }, [favourites, type])

  useEffect(() => {
    void load(0, false)
    return () => activeController.current?.abort()
  }, [load])

  if (loading) return <PageSkeleton kind="grid" />
  if (error && !albums.length) return <ErrorState message={error} />

  return (
    <div className="page">
      <div className="page-heading"><div><span className="eyebrow">Your library</span><h1>{title}</h1><p>{albums.length.toLocaleString()} album{albums.length === 1 ? '' : 's'} loaded</p></div></div>
      {albums.length ? <AlbumGrid albums={albums} onChanged={() => favourites && void load(0, false)} /> : <div className="empty-state">Nothing here yet.</div>}
      {hasMore && <div className="load-more"><button className="secondary-button" onClick={() => load(offset, true)} disabled={moreLoading}>{moreLoading ? 'Loading…' : 'Load more'}</button></div>}
    </div>
  )
}
