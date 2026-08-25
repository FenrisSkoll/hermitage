import { Check, CircleAlert, Info, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ToastAction, ToastTone } from '../lib/toast'

type Toast = { id: string; message: string; tone: ToastTone; action?: ToastAction }

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; tone?: ToastTone; action?: ToastAction }>).detail
      if (!detail?.message) return
      const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const toast: Toast = { id, message: detail.message, tone: detail.tone || 'neutral', action: detail.action }
      setToasts((items) => [...items.slice(-2), toast])
      window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== toast.id)), detail.action ? 4300 : 2800)
    }
    window.addEventListener('hermitage:toast', onToast)
    return () => window.removeEventListener('hermitage:toast', onToast)
  }, [])

  if (!toasts.length) return null
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === 'success' ? Check : toast.tone === 'error' ? CircleAlert : Info
        return <div key={toast.id} className={`toast toast--${toast.tone}`}><Icon size={15} /><span>{toast.message}</span>{toast.action ? <button className="toast__action" onClick={() => { void toast.action?.run(); setToasts((items) => items.filter((item) => item.id !== toast.id)) }}>{toast.action.label}</button> : null}<button onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}><X size={14} /></button></div>
      })}
    </div>
  )
}
