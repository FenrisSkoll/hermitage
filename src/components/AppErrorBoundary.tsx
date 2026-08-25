import { Component, type ErrorInfo, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Hermitage UI error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="fatal-error">
        <div className="fatal-error__card">
          <span className="eyebrow">Hermitage recovered the page</span>
          <h1>Something went wrong.</h1>
          <p>{this.state.error.message || 'An unexpected interface error occurred.'}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Reload Hermitage</button>
        </div>
      </main>
    )
  }
}
