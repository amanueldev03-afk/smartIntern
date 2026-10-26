import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoHome = () => {
    window.location.href = '/'
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#09090b]">
          <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl text-center space-y-5 animate-fade-in">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-error-50 dark:bg-error-950/50 text-error-600 dark:text-error-400 flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                Something went wrong
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                An unexpected interface error occurred. You can reload the page or return to the home screen.
              </p>
              {this.state.error && (
                <div className="p-3 mt-3 text-left rounded-xl bg-neutral-100 dark:bg-neutral-800/80 text-[11px] font-mono text-neutral-700 dark:text-neutral-300 max-h-32 overflow-y-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="flex-1 rounded-2xl text-xs font-bold"
              >
                <Home className="w-4 h-4 mr-2" /> Home
              </Button>
              <Button
                onClick={this.handleReload}
                className="flex-1 rounded-2xl text-xs font-bold shadow-glow"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Reload
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
