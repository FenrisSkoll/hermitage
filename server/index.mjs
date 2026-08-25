import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const port = Number(process.env.PORT || 3001)
const secureCookies = String(process.env.HERMITAGE_SECURE_COOKIES || '').toLowerCase() === 'true'
const allowedHosts = String(process.env.HERMITAGE_ALLOWED_HOSTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
const defaultServerUrl = String(process.env.HERMITAGE_DEFAULT_SERVER_URL || '').trim()
const lockServerUrl = String(process.env.HERMITAGE_LOCK_SERVER_URL || '').toLowerCase() === 'true'
const trustProxyRaw = String(process.env.HERMITAGE_TRUST_PROXY ?? '1').trim().toLowerCase()
const loginWindowMs = 5 * 60 * 1000
const loginMaxAttempts = Math.max(3, Number(process.env.HERMITAGE_LOGIN_RATE_LIMIT || 10))
const sessionTtlDays = Math.max(1, Number(process.env.HERMITAGE_SESSION_TTL_DAYS || 30))
const sessionTtlMs = 1000 * 60 * 60 * 24 * sessionTtlDays
const sessionPersistTouchMs = 1000 * 60 * 5
const dataDir = process.env.HERMITAGE_DATA_DIR || path.join(rootDir, '.hermitage-data')
const sessionsFile = path.join(dataDir, 'sessions.json')
const sessionKeyFile = path.join(dataDir, 'session.key')

const app = express()
app.disable('x-powered-by')
if (trustProxyRaw === 'false' || trustProxyRaw === '0' || trustProxyRaw === 'off') app.set('trust proxy', false)
else if (/^\d+$/.test(trustProxyRaw)) app.set('trust proxy', Number(trustProxyRaw))
else app.set('trust proxy', trustProxyRaw || 1)

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  next()
})
app.use(express.json({ limit: '1mb' }))

/** @type {Map<string, {count:number, resetAt:number}>} */
const loginAttempts = new Map()

function loginRateKey(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown')
}

function checkLoginRate(req) {
  const now = Date.now()
  const key = loginRateKey(req)
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + loginWindowMs })
    return { allowed: true, key, remaining: loginMaxAttempts }
  }
  if (current.count >= loginMaxAttempts) return { allowed: false, key, retryAfterMs: current.resetAt - now }
  return { allowed: true, key, remaining: loginMaxAttempts - current.count }
}

function recordLoginFailure(key) {
  const now = Date.now()
  const current = loginAttempts.get(key)
  if (!current || current.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs })
  else current.count += 1
}

function clearLoginFailures(key) {
  loginAttempts.delete(key)
}

/** @type {Map<string, {server:string, username:string, password:string, createdAt:number, touchedAt:number, persistedTouchedAt:number}>} */
const sessions = new Map()
let sessionsDirty = false

// Small in-process artwork cache. It removes a lot of repeated upstream cover requests
// while moving quickly between Home, Album and Now Playing.
const coverCache = new Map()
const coverCacheLimit = Math.max(24, Number(process.env.HERMITAGE_COVER_CACHE_ITEMS || 160))

function cacheCover(key, entry) {
  if (coverCache.has(key)) coverCache.delete(key)
  coverCache.set(key, entry)
  while (coverCache.size > coverCacheLimit) coverCache.delete(coverCache.keys().next().value)
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true })
}

function getSessionKey() {
  const configured = String(process.env.HERMITAGE_SESSION_SECRET || '')
  if (configured) return crypto.createHash('sha256').update(configured, 'utf8').digest()

  ensureDataDir()
  try {
    const existing = fs.readFileSync(sessionKeyFile, 'utf8').trim()
    const key = Buffer.from(existing, 'base64url')
    if (key.length === 32) return key
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read ${sessionKeyFile}: ${error.message}`)
  }

  const key = crypto.randomBytes(32)
  fs.writeFileSync(sessionKeyFile, key.toString('base64url'), { mode: 0o600 })
  return key
}

const sessionKey = getSessionKey()

function sessionLookupKey(id) {
  return crypto.createHash('sha256').update(id, 'utf8').digest('hex')
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}

function decryptPassword(value) {
  const [version, ivText, tagText, ciphertextText] = String(value || '').split(':')
  if (version !== 'v1' || !ivText || !tagText || ciphertextText === undefined) {
    throw new Error('Unsupported persisted session format.')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final()
  ]).toString('utf8')
}

function persistSessions() {
  if (!sessionsDirty) return
  try {
    ensureDataDir()
    const payload = {
      version: 1,
      savedAt: Date.now(),
      sessions: Object.fromEntries([...sessions.entries()].map(([lookupKey, session]) => [lookupKey, {
        server: session.server,
        username: session.username,
        password: encryptPassword(session.password),
        createdAt: session.createdAt,
        touchedAt: session.touchedAt
      }]))
    }
    const tempFile = `${sessionsFile}.${process.pid}.tmp`
    fs.writeFileSync(tempFile, JSON.stringify(payload), { mode: 0o600 })
    fs.renameSync(tempFile, sessionsFile)
    sessionsDirty = false
    for (const session of sessions.values()) session.persistedTouchedAt = session.touchedAt
  } catch (error) {
    console.error(`Could not persist Hermitage sessions: ${error.message}`)
  }
}

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'))
    const now = Date.now()
    let loaded = 0
    for (const [lookupKey, stored] of Object.entries(raw.sessions || {})) {
      if (!stored?.server || !stored?.username || !stored?.password) continue
      if (now - Number(stored.touchedAt || 0) > sessionTtlMs) continue
      try {
        const touchedAt = Number(stored.touchedAt || now)
        sessions.set(lookupKey, {
          server: String(stored.server),
          username: String(stored.username),
          password: decryptPassword(stored.password),
          createdAt: Number(stored.createdAt || touchedAt),
          touchedAt,
          persistedTouchedAt: touchedAt
        })
        loaded++
      } catch (error) {
        console.warn(`Skipping an unreadable persisted session: ${error.message}`)
      }
    }
    if (loaded) console.log(`Restored ${loaded} Hermitage session${loaded === 1 ? '' : 's'} from disk.`)
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not load persisted Hermitage sessions: ${error.message}`)
  }
}

loadSessions()

const allowedReads = new Set([
  'ping',
  'getAlbumList2',
  'getAlbum',
  'getArtist',
  'getArtists',
  'getPlaylists',
  'getPlaylist',
  'getStarred2',
  'getRandomSongs',
  'getGenres',
  'getSong',
  'getOpenSubsonicExtensions',
  'getLyrics',
  'getLyricsBySongId',
  'getInternetRadioStations',
  'search3'
])

const allowedActions = new Set([
  'star',
  'unstar',
  'setRating',
  'scrobble',
  'savePlayQueue',
  'createPlaylist',
  'updatePlaylist',
  'deletePlaylist'
])

function parseCookies(header = '') {
  const cookies = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

function setSessionCookie(res, id) {
  const attrs = [
    `hermitage_session=${encodeURIComponent(id)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${Math.floor(sessionTtlMs / 1000)}`
  ]
  if (secureCookies) attrs.push('Secure')
  res.setHeader('Set-Cookie', attrs.join('; '))
}

function clearSessionCookie(res) {
  const attrs = [
    'hermitage_session=',
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=0'
  ]
  if (secureCookies) attrs.push('Secure')
  res.setHeader('Set-Cookie', attrs.join('; '))
}

function getSession(req) {
  const id = parseCookies(req.headers.cookie).hermitage_session
  if (!id) return null
  const lookupKey = sessionLookupKey(id)
  const session = sessions.get(lookupKey)
  if (!session) return null
  const now = Date.now()
  if (now - session.touchedAt > sessionTtlMs) {
    sessions.delete(lookupKey)
    sessionsDirty = true
    persistSessions()
    return null
  }
  session.touchedAt = now
  if (now - session.persistedTouchedAt >= sessionPersistTouchMs) sessionsDirty = true
  return { id, lookupKey, ...session }
}

function requireSession(req, res, next) {
  const session = getSession(req)
  if (!session) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Not connected to Navidrome.' })
  }
  // Sliding cookie lifetime: active users stay signed in for the configured TTL.
  setSessionCookie(res, session.id)
  req.hermitageSession = session
  next()
}

function requireMediaSession(req, res, next) {
  const session = getSession(req)
  if (!session) return res.status(401).end()
  req.hermitageSession = session
  next()
}

function normalizeServer(input) {
  const parsed = new URL(String(input || '').trim())
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Server URL must use http:// or https://')
  if (allowedHosts.length && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`This Hermitage instance only allows Navidrome hosts: ${allowedHosts.join(', ')}`)
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

function makeAuthParams(session) {
  const salt = crypto.randomBytes(8).toString('hex')
  const token = crypto.createHash('md5').update(`${session.password}${salt}`, 'utf8').digest('hex')
  return {
    u: session.username,
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'Hermitage',
    f: 'json'
  }
}

function appendParams(searchParams, object) {
  for (const [key, value] of Object.entries(object || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, String(item))
    } else {
      searchParams.append(key, String(value))
    }
  }
}

function buildUrl(session, method, extra = {}, format = 'json') {
  const url = new URL(`${session.server}/rest/${method}.view`)
  const auth = makeAuthParams(session)
  if (format !== 'json') delete auth.f
  appendParams(url.searchParams, auth)
  appendParams(url.searchParams, extra)
  return url
}

async function navFetch(session, method, extra = {}, options = {}, format = 'json') {
  const url = buildUrl(session, method, extra, format)
  return fetch(url, { redirect: 'follow', ...options })
}

async function parseSubsonicJson(response) {
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Navidrome returned HTTP ${response.status} with a non-JSON response.`)
  }
  const payload = json['subsonic-response']
  if (!payload) throw new Error('Unexpected response from Navidrome.')
  if (payload.status !== 'ok') {
    const message = payload.error?.message || `Navidrome API error ${payload.error?.code || ''}`.trim()
    const error = new Error(message)
    error.code = payload.error?.code
    throw error
  }
  return payload
}

let normalizedDefaultServerUrl = ''
if (defaultServerUrl) {
  try {
    normalizedDefaultServerUrl = normalizeServer(defaultServerUrl)
  } catch (error) {
    console.error(`Invalid HERMITAGE_DEFAULT_SERVER_URL: ${error.message}`)
    process.exit(1)
  }
}
if (lockServerUrl && !normalizedDefaultServerUrl) {
  console.error('HERMITAGE_LOCK_SERVER_URL=true requires HERMITAGE_DEFAULT_SERVER_URL to be set.')
  process.exit(1)
}

app.get('/api/config', (_req, res) => {
  res.json({
    version: '0.6.0',
    defaultServerUrl: lockServerUrl ? undefined : (normalizedDefaultServerUrl || undefined),
    lockServerUrl,
    secureCookies,
    serverSelection: lockServerUrl ? 'locked' : (normalizedDefaultServerUrl ? 'prefilled' : 'user')
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.6.0', uptimeSeconds: Math.round(process.uptime()), sessionTtlDays, persistentSessions: true, coverCacheItems: coverCache.size, serverSelection: lockServerUrl ? 'locked' : (normalizedDefaultServerUrl ? 'prefilled' : 'user') })
})

app.post('/api/login', async (req, res) => {
  const rate = checkLoginRate(req)
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))))
    return res.status(429).json({ error: 'Too many connection attempts. Please try again in a few minutes.' })
  }

  const { server, username, password } = req.body || {}
  const requestedServer = lockServerUrl ? normalizedDefaultServerUrl : (server || normalizedDefaultServerUrl)
  if (!requestedServer || !username || !password) {
    return res.status(400).json({ error: lockServerUrl ? 'Username and password are required.' : 'Server, username and password are required.' })
  }

  let normalizedServer
  try {
    normalizedServer = normalizeServer(requestedServer)
    if (lockServerUrl && normalizedServer !== normalizedDefaultServerUrl) throw new Error('This Hermitage instance is locked to its configured Navidrome server.')
  } catch (error) {
    recordLoginFailure(rate.key)
    return res.status(400).json({ error: error.message })
  }

  const provisional = {
    server: normalizedServer,
    username: String(username),
    password: String(password),
    createdAt: Date.now(),
    touchedAt: Date.now(),
    persistedTouchedAt: Date.now()
  }

  try {
    const response = await navFetch(provisional, 'ping', {}, { signal: AbortSignal.timeout(10000) })
    const payload = await parseSubsonicJson(response)
    const id = crypto.randomBytes(32).toString('base64url')
    sessions.set(sessionLookupKey(id), provisional)
    sessionsDirty = true
    persistSessions()
    clearLoginFailures(rate.key)
    setSessionCookie(res, id)
    res.json({
      connected: true,
      server: normalizedServer,
      serverType: payload.type || 'Navidrome',
      serverVersion: payload.serverVersion || payload.version || ''
    })
  } catch (error) {
    recordLoginFailure(rate.key)
    res.status(401).json({ error: `Could not connect: ${error.message}` })
  }
})

app.get('/api/session', (req, res) => {
  const session = getSession(req)
  if (!session) return res.json({ connected: false })
  setSessionCookie(res, session.id)
  res.json({ connected: true, server: session.server, username: session.username })
})

app.post('/api/logout', (req, res) => {
  const id = parseCookies(req.headers.cookie).hermitage_session
  if (id) {
    sessions.delete(sessionLookupKey(id))
    sessionsDirty = true
    persistSessions()
  }
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/subsonic/:method', requireSession, async (req, res) => {
  const { method } = req.params
  if (!allowedReads.has(method)) return res.status(404).json({ error: 'Unsupported API method.' })
  try {
    const response = await navFetch(req.hermitageSession, method, req.query, { signal: AbortSignal.timeout(20000) })
    const payload = await parseSubsonicJson(response)
    res.json(payload)
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code })
  }
})

app.post('/api/subsonic/:method', requireSession, async (req, res) => {
  const { method } = req.params
  if (!allowedActions.has(method)) return res.status(404).json({ error: 'Unsupported API action.' })
  try {
    const response = await navFetch(req.hermitageSession, method, req.body || {}, { signal: AbortSignal.timeout(20000) })
    const payload = await parseSubsonicJson(response)
    res.json(payload)
  } catch (error) {
    res.status(502).json({ error: error.message, code: error.code })
  }
})

app.get('/api/cover/:id', requireMediaSession, async (req, res) => {
  const size = Math.max(32, Math.min(1600, Number(req.query.size || 600)))
  const cacheKey = `${req.hermitageSession.server}|${req.params.id}|${size}`
  const cached = coverCache.get(cacheKey)
  if (cached) {
    // Refresh LRU order.
    coverCache.delete(cacheKey)
    coverCache.set(cacheKey, cached)
    res.setHeader('Content-Type', cached.contentType)
    res.setHeader('Cache-Control', 'private, max-age=604800')
    res.setHeader('ETag', cached.etag)
    if (req.headers['if-none-match'] === cached.etag) return res.status(304).end()
    return res.send(cached.buffer)
  }

  try {
    const response = await navFetch(
      req.hermitageSession,
      'getCoverArt',
      { id: req.params.id, size },
      { signal: AbortSignal.timeout(30000) },
      'binary'
    )
    if (!response.ok) return res.status(response.status).end()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())
    const etag = `"${crypto.createHash('sha1').update(buffer).digest('hex')}"`
    cacheCover(cacheKey, { buffer, contentType, etag })
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=604800')
    res.setHeader('ETag', etag)
    res.send(buffer)
  } catch (error) {
    res.status(502).json({ error: error.message })
  }
})

app.get('/api/stream/:id', requireMediaSession, async (req, res) => {
  const abortController = new AbortController()
  let upstreamStarted = false

  const abortIfDisconnected = () => {
    if (!res.writableEnded && upstreamStarted) abortController.abort()
  }
  req.on('aborted', abortIfDisconnected)
  res.on('close', abortIfDisconnected)

  try {
    const headers = {
      'Accept-Encoding': 'identity'
    }
    if (req.headers.range) headers.Range = req.headers.range

    const response = await navFetch(
      req.hermitageSession,
      'stream',
      { id: req.params.id, maxBitRate: req.query.maxBitRate, format: req.query.format },
      { headers, signal: abortController.signal },
      'binary'
    )
    upstreamStarted = true

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn(`Stream ${req.params.id} failed: HTTP ${response.status} ${detail.slice(0, 180)}`)
      return res.status(response.status).end()
    }

    // A Subsonic error may be returned as JSON/XML even with HTTP 200. Do not feed
    // that to the browser's audio decoder as though it were a FLAC/MP3 stream.
    if (/json|xml/i.test(contentType)) {
      const detail = await response.text().catch(() => '')
      console.warn(`Stream ${req.params.id} returned ${contentType}: ${detail.slice(0, 220)}`)
      return res.status(502).json({ error: 'Navidrome returned an API error instead of audio.' })
    }

    res.status(response.status)
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = response.headers.get(header)
      if (value) res.setHeader(header, value)
    }
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Content-Disposition', 'inline')

    if (!response.body) return res.end()
    await pipeline(Readable.fromWeb(response.body), res)
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') return
    console.error(`Stream ${req.params.id} proxy error: ${error.message}`)
    if (!res.headersSent) res.status(502).json({ error: error.message })
    else if (!res.writableEnded) res.end()
  } finally {
    req.removeListener('aborted', abortIfDisconnected)
    res.removeListener('close', abortIfDisconnected)
  }
})


app.get('/api/download/:id', requireMediaSession, async (req, res) => {
  const abortController = new AbortController()
  const abort = () => abortController.abort()
  req.on('aborted', abort)
  res.on('close', abort)
  try {
    const response = await navFetch(
      req.hermitageSession,
      'download',
      { id: req.params.id },
      { headers: { 'Accept-Encoding': 'identity' }, signal: abortController.signal },
      'binary'
    )
    if (!response.ok) return res.status(response.status).end()
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (/json|xml/i.test(contentType)) {
      const detail = await response.text().catch(() => '')
      console.warn(`Download ${req.params.id} returned ${contentType}: ${detail.slice(0, 220)}`)
      return res.status(502).json({ error: 'Navidrome returned an API error instead of media.' })
    }
    for (const header of ['content-type', 'content-length', 'etag', 'last-modified']) {
      const value = response.headers.get(header)
      if (value) res.setHeader(header, value)
    }
    let filename = `track-${req.params.id}`
    try {
      const songResponse = await navFetch(req.hermitageSession, 'getSong', { id: req.params.id }, { signal: AbortSignal.timeout(8000) })
      const payload = await parseSubsonicJson(songResponse)
      const song = payload.song
      if (song?.title) {
        const safeTitle = String(song.title).replace(/[\\/:*?"<>|\r\n]+/g, '_').trim().slice(0, 140) || filename
        filename = song.suffix ? `${safeTitle}.${song.suffix}` : safeTitle
      }
    } catch { /* filename fallback is fine */ }
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    if (!response.body) return res.end()
    await pipeline(Readable.fromWeb(response.body), res)
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') return
    if (!res.headersSent) res.status(502).json({ error: error.message })
  } finally {
    req.removeListener('aborted', abort)
    res.removeListener('close', abort)
  }
})

app.get('/api/radio/:id', requireMediaSession, async (req, res) => {
  const abortController = new AbortController()
  const abort = () => abortController.abort()
  req.on('aborted', abort)
  res.on('close', abort)
  try {
    const stationsResponse = await navFetch(req.hermitageSession, 'getInternetRadioStations', {}, { signal: AbortSignal.timeout(10000) })
    const stationsPayload = await parseSubsonicJson(stationsResponse)
    const stations = stationsPayload.internetRadioStations?.internetRadioStation || []
    const station = stations.find((item) => String(item.id) === String(req.params.id))
    if (!station?.streamUrl) return res.status(404).json({ error: 'Radio station not found.' })

    const response = await fetch(station.streamUrl, {
      redirect: 'follow',
      headers: {
        'Accept': 'audio/*,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'User-Agent': 'Hermitage/0.6.0'
      },
      signal: abortController.signal
    })
    if (!response.ok) return res.status(response.status).end()
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg')
    for (const header of ['icy-name', 'icy-description', 'icy-genre', 'icy-br', 'icy-metaint']) {
      const value = response.headers.get(header)
      if (value) res.setHeader(header, value)
    }
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    if (!response.body) return res.end()
    await pipeline(Readable.fromWeb(response.body), res)
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ERR_STREAM_PREMATURE_CLOSE') return
    console.error(`Radio ${req.params.id} proxy error: ${error.message}`)
    if (!res.headersSent) res.status(502).json({ error: error.message })
  } finally {
    req.removeListener('aborted', abort)
    res.removeListener('close', abort)
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: '1h', setHeaders: (res, filePath) => { if (path.basename(filePath) === 'sw.js' || path.basename(filePath) === 'manifest.webmanifest') res.setHeader('Cache-Control', 'no-cache') } }))
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

setInterval(() => {
  const cutoff = Date.now() - sessionTtlMs
  for (const [lookupKey, session] of sessions.entries()) {
    if (session.touchedAt < cutoff) {
      sessions.delete(lookupKey)
      sessionsDirty = true
    }
  }
  persistSessions()
}, 1000 * 60).unref()

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    sessionsDirty = true
    persistSessions()
    process.exit(0)
  })
}

app.listen(port, () => {
  console.log(`Hermitage v0.6.0 listening on http://0.0.0.0:${port}`)
  console.log(`Session persistence: ${sessionsFile} (${sessionTtlDays}-day sliding TTL)`)
  console.log(`Server selection: ${lockServerUrl ? `locked to ${normalizedDefaultServerUrl}` : (normalizedDefaultServerUrl ? `prefilled with ${normalizedDefaultServerUrl}` : 'user supplied')}`)
})
