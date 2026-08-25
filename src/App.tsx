import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Loading } from './components/Loading'
import { useAuth } from './context/AuthContext'
import { AlbumCollectionPage } from './pages/AlbumCollectionPage'
import { AlbumPage } from './pages/AlbumPage'
import { ArtistPage } from './pages/ArtistPage'
import { ArtistsPage } from './pages/ArtistsPage'
import { HistoryPage } from './pages/HistoryPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { NowPlayingPage } from './pages/NowPlayingPage'
import { PlaylistPage } from './pages/PlaylistPage'
import { RadioPage } from './pages/RadioPage'
import { SearchPage } from './pages/SearchPage'
import { SongsPage } from './pages/SongsPage'

function ProtectedShell() {
  const auth = useAuth()
  if (auth.loading) return <div className="boot-screen"><Loading label="Opening Hermitage…" /></div>
  if (!auth.connected) return <Navigate to="/login" replace />
  return <AppShell />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/albums" element={<AlbumCollectionPage title="Albums" type="alphabeticalByArtist" />} />
        <Route path="/recently-added" element={<AlbumCollectionPage title="Recently Added" type="newest" />} />
        <Route path="/recently-played" element={<HistoryPage />} />
        <Route path="/most-played" element={<AlbumCollectionPage title="Most Played" type="frequent" />} />
        <Route path="/favourites" element={<AlbumCollectionPage title="Favourites" favourites />} />
        <Route path="/album/:id" element={<AlbumPage />} />
        <Route path="/artists" element={<ArtistsPage />} />
        <Route path="/artist/:id" element={<ArtistPage />} />
        <Route path="/songs" element={<SongsPage />} />
        <Route path="/playlist/:id" element={<PlaylistPage />} />
        <Route path="/radio" element={<RadioPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/now-playing" element={<NowPlayingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
