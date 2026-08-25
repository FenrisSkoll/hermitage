export function formatTime(value?: number) {
  if (!value || !Number.isFinite(value)) return '0:00'
  const seconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatBytes(value?: number) {
  if (!value) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = value
  let index = 0
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024
    index++
  }
  return `${n.toFixed(index >= 2 ? 1 : 0)} ${units[index]}`
}
