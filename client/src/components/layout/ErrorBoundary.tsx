import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
    children: ReactNode
}

interface State {
    error: Error | null
}

/**
 * There was no error boundary anywhere in this app before this — a render
 * exception in ANY component, anywhere, unmounted the entire React tree
 * (React's default behavior with no boundary), leaving a totally blank
 * white page with no visible error, no stack trace, nothing to act on.
 * That's exactly what "the admin users page is just a white screen" looks
 * like from the outside, and it could be any component in the crashed
 * page's tree, not necessarily the page itself.
 *
 * Wraps <Router/> (not the whole <AppShell/>) so Header/Footer/nav stay up
 * even when a single page's content crashes — the rest of the site keeps
 * working and the visitor isn't stranded with no way to navigate away.
 *
 * Class component is required here — componentDidCatch/getDerivedStateFromError
 * have no hook equivalent; this is the one place React still requires one.
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Real production data hitting an edge case some component didn't
        // guard against - this is exactly the signal needed to find and fix
        // it, instead of a silent blank page with nothing to go on.
        console.error('[ErrorBoundary] Caught a render error:', error, info.componentStack)
    }

    render() {
        if (this.state.error) {
            return (
                <div className="container mx-auto px-6 py-16 text-center">
                    <h1 className="text-2xl font-display font-medium text-foreground mb-3">
                        Something went wrong loading this page
                    </h1>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                        This one page hit an error — the rest of the site is unaffected. Try reloading; if it keeps
                        happening, this has already been logged.
                    </p>
                    {/* Visible in prod too, deliberately - this is an internal admin/site
                        tool, not a consumer app where a raw error string would be
                        alarming; seeing the real message beats guessing. */}
                    <pre className="mx-auto max-w-lg overflow-x-auto rounded-lg bg-secondary p-4 text-left text-xs text-muted-foreground mb-6">
                        {this.state.error.message}
                    </pre>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Reload page
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}
