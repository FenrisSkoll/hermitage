import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from '../lib/api'

type AuthContextValue = {
  loading: boolean
  connected: boolean
  server?: string
  username?: string
  offline: boolean
  connect: (server: string, username: string, password: string) => Promise<void>
  disconnect: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const lastSessionKey = 'hermitage-last-session-v3'

function readLastSession() {
  try { return JSON.parse(localStorage.getItem(lastSessionKey) || 'null') as { server?: string; username?: string } | null } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [server, setServer] = useState<string>()
  const [username, setUsername] = useState<string>()
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const clearSessionState = () => {
      setConnected(false)
      setServer(undefined)
      setUsername(undefined)
      if ('serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage('CLEAR_HERMITAGE_CACHES')
    }
    const online = () => setOffline(false)
    const offlineHandler = () => setOffline(true)

    window.addEventListener('hermitage:session-expired', clearSessionState)
    window.addEventListener('online', online)
    window.addEventListener('offline', offlineHandler)
    api.getSession()
      .then((session) => {
        setConnected(session.connected)
        setServer(session.server)
        setUsername(session.username)
        if (session.connected) localStorage.setItem(lastSessionKey, JSON.stringify({ server: session.server, username: session.username }))
      })
      .catch(() => {
        const last = readLastSession()
        if (!navigator.onLine && last?.username) {
          setConnected(true)
          setServer(last.server)
          setUsername(last.username)
          setOffline(true)
        } else {
          clearSessionState()
        }
      })
      .finally(() => setLoading(false))

    return () => {
      window.removeEventListener('hermitage:session-expired', clearSessionState)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offlineHandler)
    }
  }, [])

  const connect = async (nextServer: string, nextUsername: string, password: string) => {
    const result = await api.login(nextServer, nextUsername, password)
    setConnected(result.connected)
    setServer(result.server)
    setUsername(nextUsername)
    setOffline(false)
    localStorage.setItem(lastSessionKey, JSON.stringify({ server: result.server, username: nextUsername }))
  }

  const disconnect = async () => {
    await api.logout()
    setConnected(false)
    setServer(undefined)
    setUsername(undefined)
    localStorage.removeItem(lastSessionKey)
    if ('serviceWorker' in navigator) navigator.serviceWorker.controller?.postMessage('CLEAR_HERMITAGE_CACHES')
  }

  const value = useMemo(() => ({ loading, connected, server, username, offline, connect, disconnect }), [loading, connected, server, username, offline])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
