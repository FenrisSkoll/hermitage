export function withViewTransition(update: () => void) {
  const documentWithTransitions = document as Document & {
    startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> }
  }

  if (document.documentElement.dataset.motion === 'off' || !documentWithTransitions.startViewTransition) {
    update()
    return
  }

  documentWithTransitions.startViewTransition(update)
}
