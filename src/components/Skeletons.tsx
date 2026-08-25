export function AlbumGridSkeleton({ count = 12, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <div className={`album-grid ${compact ? 'album-grid--compact' : ''}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="album-card skeleton-card" key={index}>
          <div className="album-card__art-wrap skeleton" />
          <span className="skeleton skeleton-line skeleton-line--title" />
          <span className="skeleton skeleton-line skeleton-line--meta" />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton({ kind = 'grid' }: { kind?: 'grid' | 'album' | 'artist' | 'home' }) {
  if (kind === 'album') {
    return <div className="album-page skeleton-page"><div className="album-hero"><div className="album-hero__content"><div className="album-hero__cover skeleton" /><div className="album-hero__text skeleton-copy"><span className="skeleton skeleton-line skeleton-line--tiny" /><span className="skeleton skeleton-line skeleton-line--hero" /><span className="skeleton skeleton-line skeleton-line--medium" /><span className="skeleton skeleton-pill" /></div></div></div><div className="album-tracks skeleton-song-stack">{Array.from({ length: 8 }).map((_, i) => <span className="skeleton skeleton-song" key={i} />)}</div></div>
  }
  if (kind === 'artist') {
    return <div className="page"><div className="artist-hero"><div className="artist-hero__avatar skeleton" /><div className="skeleton-copy"><span className="skeleton skeleton-line skeleton-line--tiny" /><span className="skeleton skeleton-line skeleton-line--hero" /><span className="skeleton skeleton-pill" /></div></div><section className="page-section"><AlbumGridSkeleton /></section></div>
  }
  if (kind === 'home') {
    return <div className="page"><div className="welcome-panel skeleton" /><section className="page-section"><span className="skeleton skeleton-line skeleton-line--medium" /><AlbumGridSkeleton count={8} compact /></section><section className="page-section"><span className="skeleton skeleton-line skeleton-line--medium" /><AlbumGridSkeleton count={8} compact /></section></div>
  }
  return <div className="page"><div className="page-heading"><div className="skeleton-copy"><span className="skeleton skeleton-line skeleton-line--tiny" /><span className="skeleton skeleton-line skeleton-line--hero" /></div></div><AlbumGridSkeleton /></div>
}
