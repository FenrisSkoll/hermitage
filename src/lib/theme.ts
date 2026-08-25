import { coverUrl } from './api'

export type ArtworkPalette = {
  base: [number, number, number]
  accent: [number, number, number]
  secondary: [number, number, number]
}

const fallback: ArtworkPalette = {
  base: [73, 84, 99],
  accent: [154, 170, 190],
  secondary: [92, 77, 86]
}

const cache = new Map<string, ArtworkPalette>()

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, value))
}

function safeAccent(channel: number) {
  return clamp(channel * 1.12 + 16)
}

function perceivedLuminance(rgb: [number, number, number]) {
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}

function readableAccent(rgb: [number, number, number]): [number, number, number] {
  const lum = perceivedLuminance(rgb)
  if (lum < 92) {
    const amount = Math.min(.58, (112 - lum) / 150)
    return rgb.map((value) => clamp(value + (245 - value) * amount)) as [number, number, number]
  }
  if (lum > 228) return rgb.map((value) => clamp(value * .88)) as [number, number, number]
  return rgb
}

export async function extractArtworkPalette(coverArt?: string, signal?: AbortSignal): Promise<ArtworkPalette> {
  if (!coverArt) return fallback
  const cached = cache.get(coverArt)
  if (cached) return cached

  const image = new Image()
  image.decoding = 'async'
  image.crossOrigin = 'anonymous'
  image.src = coverUrl(coverArt, 128)

  await Promise.race([
    image.decode(),
    new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
  ])

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const canvas = document.createElement('canvas')
  canvas.width = 56
  canvas.height = 56
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return fallback
  context.drawImage(image, 0, 0, 56, 56)
  const pixels = context.getImageData(0, 0, 56, 56).data

  let total = 0
  let r = 0
  let g = 0
  let b = 0
  let vividTotal = 0
  let vr = 0
  let vg = 0
  let vb = 0
  let altTotal = 0
  let ar = 0
  let ag = 0
  let ab = 0

  for (let i = 0; i < pixels.length; i += 16) {
    const pr = pixels[i]
    const pg = pixels[i + 1]
    const pb = pixels[i + 2]
    const max = Math.max(pr, pg, pb)
    const min = Math.min(pr, pg, pb)
    const saturation = max - min
    const luminance = (pr * .2126) + (pg * .7152) + (pb * .0722)
    if (luminance < 12 || luminance > 246) continue

    const baseWeight = .22 + saturation / 230
    r += pr * baseWeight
    g += pg * baseWeight
    b += pb * baseWeight
    total += baseWeight

    if (luminance > 45 && luminance < 225 && saturation > 16) {
      const vividWeight = .55 + saturation / 95
      vr += pr * vividWeight
      vg += pg * vividWeight
      vb += pb * vividWeight
      vividTotal += vividWeight
    }

    if (luminance > 28 && luminance < 205) {
      const altWeight = .3 + Math.abs(pr - pb) / 180 + saturation / 300
      ar += pr * altWeight
      ag += pg * altWeight
      ab += pb * altWeight
      altTotal += altWeight
    }
  }

  if (!total) return fallback
  const base = [r / total, g / total, b / total].map((value) => clamp(value)) as [number, number, number]
  const accent = vividTotal
    ? [vr / vividTotal, vg / vividTotal, vb / vividTotal].map((value) => clamp(value)) as [number, number, number]
    : base.map(safeAccent) as [number, number, number]
  const secondary = altTotal
    ? [ar / altTotal, ag / altTotal, ab / altTotal].map((value) => clamp(value)) as [number, number, number]
    : [base[2], base[0], base[1]] as [number, number, number]

  const palette = { base, accent: readableAccent(accent), secondary }
  cache.set(coverArt, palette)
  return palette
}

export async function applyArtworkTheme(coverArt?: string, signal?: AbortSignal) {
  try {
    const palette = await extractArtworkPalette(coverArt, signal)
    if (signal?.aborted) return
    const root = document.documentElement
    root.style.setProperty('--art-rgb', palette.base.map(Math.round).join(' '))
    root.style.setProperty('--accent-rgb', palette.accent.map(Math.round).join(' '))
    root.style.setProperty('--secondary-rgb', palette.secondary.map(Math.round).join(' '))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const root = document.documentElement
    root.style.setProperty('--art-rgb', fallback.base.join(' '))
    root.style.setProperty('--accent-rgb', fallback.accent.join(' '))
    root.style.setProperty('--secondary-rgb', fallback.secondary.join(' '))
  }
}
