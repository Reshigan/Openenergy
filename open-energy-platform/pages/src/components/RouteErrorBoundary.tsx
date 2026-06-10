// ════════════════════════════════════════════════════════════════════════
// RouteErrorBoundary — per-route fallback so a single broken page doesn't
// blow the whole app. Renders an inline error card while preserving the
// global chrome. The global ErrorBoundary in main.tsx remains the outer
// safety net for catastrophic failures.
// ════════════════════════════════════════════════════════════════════════

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  /** Stable identifier so retries reset state cleanly across route changes. */
  routeKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[RouteError]', this.props.routeKey || 'unknown', error, info);
    // Fire-and-forget telemetry — mirror what the global boundary does.
    try {
      void fetch('/api/telemetry/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route: window.location.pathname,
          route_key: this.props.routeKey || null,
          error_name: error.name,
          error_message: error.message,
          error_stack: (error.stack || '') + '\n\nComponent stack:' + (info.componentStack || ''),
          severity: 'warn',
        }),
      });
    } catch { /* swallow */ }
  }

  componentDidUpdate(prev: Props): void {
    if (prev.routeKey !== this.props.routeKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <div className="widget-card widget-tone-bad max-w-xl">
          <div className="p-5 flex gap-3">
            <AlertOctagon size={22} className="flex-none mt-0.5"/>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider opacity-80">Page error</div>
              <h2 className="font-display text-[16px] font-bold">This page failed to render</h2>
              <p className="text-[12px] mt-1">
                The rest of the platform is still usable — navigate elsewhere via the menu,
                or try reloading this view. The error has been logged.
              </p>
              <details className="text-[11px] mt-2 opacity-90">
                <summary className="cursor-pointer">Technical detail</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
                  {this.state.error.name}: {this.state.error.message}
                </pre>
              </details>
              <button type="button" onClick={this.retry}
                      className="mt-3 h-8 px-3 rounded bg-white/40 hover:bg-[#f8fafc]/60 text-[12px] font-semibold inline-flex items-center gap-1">
                <RefreshCw size={12}/> Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
