import { Disc3, LockKeyhole, Server, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'

export function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [server, setServer] = useState(localStorage.getItem('hermitage-server') || 'http://navidrome:4533')
  const [serverLocked, setServerLocked] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [username, setUsername] = useState(localStorage.getItem('hermitage-username') || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    api.getConfig()
      .then((config) => {
        if (!active) return
        if (config.defaultServerUrl) setServer(config.defaultServerUrl)
        setServerLocked(Boolean(config.lockServerUrl))
      })
      .catch(() => { /* Login still works with the editable fallback field. */ })
      .finally(() => { if (active) setConfigLoaded(true) })
    return () => { active = false }
  }, [])

  if (!auth.loading && auth.connected) return <Navigate to="/" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await auth.connect(server.trim(), username.trim(), password)
      if (!serverLocked) localStorage.setItem('hermitage-server', server.trim())
      localStorage.setItem('hermitage-username', username.trim())
      setPassword('')
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to Navidrome.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow login-glow--one" />
      <div className="login-glow login-glow--two" />
      <section className="login-card">
        <div className="login-brand"><span>H</span><div><strong>Hermitage</strong><small>Navidrome, reimagined.</small></div></div>
        <div className="login-art"><Disc3 size={110} strokeWidth={0.8} /></div>
        <h1>Your library. Nothing else.</h1>
        <p>Connect to Navidrome through Hermitage. Login credentials are kept server-side; persisted sessions encrypt the Navidrome password before it is written to Hermitage's data directory.</p>
        <form onSubmit={submit}>
          {serverLocked ? (
            <div className="login-locked-server"><span><Server size={16} /> Navidrome server</span><strong>Configured server</strong><small>The server address is managed by this Hermitage instance.</small></div>
          ) : (
            <label><span><Server size={16} /> Navidrome URL</span><input type="url" value={server} onChange={(event) => setServer(event.target.value)} placeholder="http://navidrome:4533" required /></label>
          )}
          <label><span><UserRound size={16} /> Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
          <label><span><LockKeyhole size={16} /> Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="login-error">{error}</div>}
          <button className="primary-button login-submit" disabled={busy || !configLoaded}>{busy ? 'Connecting…' : 'Enter Hermitage'}</button>
        </form>
        <small className="login-note">{serverLocked ? 'This installation is locked to its configured Navidrome server.' : 'The Navidrome URL must be reachable from the Hermitage server/container, not necessarily from your browser.'}</small>
      </section>
    </div>
  )
}
