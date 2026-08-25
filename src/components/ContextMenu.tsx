import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { showToast } from '../lib/toast'

export type ContextMenuItem = {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void | Promise<void>
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const [busyIndex, setBusyIndex] = useState<number | null>(null)

  useEffect(() => {
    const close = () => { if (busyIndex === null) onClose() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && busyIndex === null) onClose() }
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose, busyIndex])

  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - Math.max(90, items.length * 39 + 16))

  const runItem = async (item: ContextMenuItem, index: number) => {
    if (busyIndex !== null || item.disabled) return
    setBusyIndex(index)
    try {
      await item.onClick()
      onClose()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That action failed.', 'error')
      setBusyIndex(null)
    }
  }

  return (
    <div className="context-menu" style={{ left, top }} onPointerDown={(event) => event.stopPropagation()}>
      {items.map((item, index) => (
        <button key={`${item.label}-${index}`} className={item.danger ? 'is-danger' : ''} disabled={item.disabled || busyIndex !== null} onClick={() => void runItem(item, index)}>
          <span>{busyIndex === index ? <LoaderCircle className="spin" size={15} /> : item.icon}</span><strong>{item.label}</strong>
        </button>
      ))}
    </div>
  )
}
