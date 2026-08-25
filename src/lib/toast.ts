export type ToastTone = 'neutral' | 'success' | 'error'
export type ToastAction = { label: string; run: () => void | Promise<void> }

export function showToast(message: string, tone: ToastTone = 'neutral', action?: ToastAction) {
  window.dispatchEvent(new CustomEvent('hermitage:toast', { detail: { message, tone, action } }))
}
