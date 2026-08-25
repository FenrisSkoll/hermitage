export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-state"><span className="spinner" /><span>{label}</span></div>
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error-state"><strong>Something went wrong</strong><p>{message}</p></div>
}
