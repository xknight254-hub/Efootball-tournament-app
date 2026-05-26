import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary — catches any render crash and shows a fallback UI
 * instead of a white screen. Wraps the entire app + individual pages.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--color-bg)' }}
        >
          <div
            className="rounded-2xl p-8 max-w-md text-center"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="text-5xl mb-4">💥</div>
            <h2 className="text-xl font-bold text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-[var(--color-text-muted)] text-sm mb-1">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {this.state.error && (
              <p
                className="text-xs mb-4 font-mono"
                style={{ color: '#f87171' }}
              >
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
