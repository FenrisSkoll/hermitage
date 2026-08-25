import { ExternalLink, LoaderCircle, Play, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorState } from '../components/Loading'
import { usePlayer } from '../context/PlayerContext'
import { coverUrl, getInternetRadioStations } from '../lib/api'
import type { RadioStation } from '../lib/types'

export function RadioPage() {
  const player = usePlayer()
  const [stations, setStations] = useState<RadioStation[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    getInternetRadioStations(controller.signal)
      .then(setStations)
      .catch((err) => { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err.message) })
    return () => controller.abort()
  }, [])

  if (error) return <ErrorState message={error} />
  if (!stations) return <div className="page radio-page"><div className="page-heading"><span className="eyebrow">Live</span><h1>Internet Radio</h1></div><div className="radio-loading"><LoaderCircle className="spin" /> Loading stations…</div></div>

  return (
    <div className="page radio-page">
      <div className="page-heading"><span className="eyebrow">Live</span><h1>Internet Radio</h1><p>{stations.length} station{stations.length === 1 ? '' : 's'} from Navidrome.</p></div>
      {stations.length ? <div className="radio-grid">{stations.map((station) => (
        <article className="radio-card" key={station.id}>
          <div className="radio-card__art">{station.coverArt ? <img src={coverUrl(station.coverArt, 360)} alt="" loading="lazy" /> : <Radio size={44} strokeWidth={1} />}</div>
          <div className="radio-card__copy"><strong>{station.name}</strong><span>Live stream</span></div>
          <button className="radio-play" onClick={() => player.playRadio(station)} title={`Play ${station.name}`}><Play size={18} fill="currentColor" /></button>
          {station.homePageUrl ? <a className="radio-home" href={station.homePageUrl} target="_blank" rel="noreferrer" title="Station website"><ExternalLink size={15} /></a> : null}
        </article>
      ))}</div> : <div className="empty-library"><Radio size={42} /><strong>No stations configured</strong><span>Add Internet Radio stations in Navidrome and they will appear here.</span></div>}
    </div>
  )
}
