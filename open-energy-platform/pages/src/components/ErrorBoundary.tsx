// ═══════════════════════════════════════════════════════════════════════════
// ErrorBoundary — global catch-all for React render errors.
// ═══════════════════════════════════════════════════════════════════════════
// Wraps the app shell. When a descendant throws during render / lifecycle,
// this component swaps in a friendly fallback page with a request-ID so
// Support can correlate with the server log / error_log table. It also
// POSTs the crash to /api/telemetry/error (fire-and-forget) so the server
// sees client crashes in the /admin/monitoring feed.
// ═══════════════════════════════════════════════════════════════════════════

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reportId: string | null;
}

function genLocalId(): string {
  return `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function postClientError(error: Error, errorInfo: ErrorInfo, localId: string): Promise<void> {
  try {
    await fetch('/api/telemetry/error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': localId,
      },
      // Don't send auth token via this call — the server picks it up from
      // cookies / the global axios interceptor state, and if the user
      // isn't logged in we still want the report.
      credentials: 'include',
      body: JSON.stringify({
        route: window.location.pathname,
        url: window.location.href,
        error_name: error.name,
        error_message: error.message,
        error_stack: (error.stack || '') + '\n\nComponent stack:' + (errorInfo.componentStack || ''),
        user_agent: navigator.userAgent,
        severity: 'error',
      }),
    });
  } catch {
    /* network errors swallowed — UI fallback still renders */
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null, reportId: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const localId = genLocalId();
    this.setState({ errorInfo, reportId: localId });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo);
    void postClientError(error, errorInfo, localId);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, reportId: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { error, reportId } = this.state;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f8fa',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            background: '#ffffff',
            borderRadius: 12,
            padding: '32px 28px',
            boxShadow: '0 6px 24px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: '#d4380d',
              fontWeight: 700,
            }}
          >
            Unexpected error
          </div>
          <h1 style={{ fontSize: 22, margin: '8px 0 12px', color: '#0f172a' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#475569', lineHeight: 1.5, margin: 0 }}>
            We were unable to render this page. The error has been recorded and our team
            will investigate. If you keep seeing this, please share the reference below
            with support.
          </p>
          {reportId && (
            <div
              style={{
                marginTop: 20,
                padding: '10px 14px',
                background: '#f1f5f9',
                borderRadius: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                color: '#0f172a',
              }}
            >
              Reference: {reportId}
            </div>
          )}
          {error?.message && (
            <details style={{ marginTop: 16, color: '#64748b', fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>Technical details</summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginTop: 8,
                  padding: 12,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 8,
                  maxHeight: 220,
                  overflow: 'auto',
                }}
              >
                {error.name}: {error.message}
              </pre>
            </details>
          )}
          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
