export type SubsonicResponse = Record<string, any>

export interface ReplayGainInfo {
  trackGain?: number
  albumGain?: number
  trackPeak?: number
  albumPeak?: number
  baseGain?: number
  fallbackGain?: number
}

export interface Album {
  id: string
  album?: string
  title?: string
  name?: string
  artist?: string
  artistId?: string
  coverArt?: string
  songCount?: number
  duration?: number
  created?: string
  starred?: string
  playCount?: number
  year?: number
  genre?: string
  userRating?: number
  averageRating?: number
  played?: string
}

export interface Song {
  id: string
  parent?: string
  title: string
  album?: string
  artist?: string
  artistId?: string
  albumId?: string
  coverArt?: string
  duration?: number
  track?: number
  discNumber?: number
  suffix?: string
  contentType?: string
  bitRate?: number
  bitDepth?: number
  samplingRate?: number
  channelCount?: number
  size?: number
  starred?: string
  year?: number
  genre?: string
  playCount?: number
  played?: string
  created?: string
  userRating?: number
  averageRating?: number
  replayGain?: ReplayGainInfo
  streamKind?: 'music' | 'radio'
  radioStationId?: string
  radioHomePageUrl?: string
}

export interface Artist {
  id: string
  name: string
  coverArt?: string
  albumCount?: number
  starred?: string
  userRating?: number
  averageRating?: number
}

export interface Playlist {
  id: string
  name: string
  songCount?: number
  duration?: number
  created?: string
  changed?: string
  coverArt?: string
  owner?: string
  public?: boolean
  comment?: string
  entry?: Song[]
}

export interface StructuredLyricLine {
  start?: number
  value: string
}

export interface StructuredLyrics {
  displayArtist?: string
  displayTitle?: string
  lang?: string
  synced?: boolean
  offset?: number
  line: StructuredLyricLine[]
}

export interface RadioStation {
  id: string
  name: string
  streamUrl: string
  homePageUrl?: string
  coverArt?: string
}

export interface HistoryEntry {
  id: string
  song: Song
  playedAt: number
  completed?: boolean
}
