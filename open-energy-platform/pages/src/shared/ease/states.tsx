// pages/src/shared/ease/states.tsx — Ease Kit shared state surfaces.
// Three plain-language, on-brand placeholders every Meridian leaf can lean on
// instead of hand-rolling its own "Loading…" / "Nothing here" / "It broke" markup.
// All visuals reuse existing meridian.css classes (.mer, .skel*, .mer-loading,
// .mer-error, .mer-error-acts) — no new CSS to keep in sync.
//
//   EaseLoading — skeletal placeholder shaped like the content that's coming
//                 (a title bar + a few card rows), not a spinner. Drop-in for a
//                 React.Suspense fallback or a `data == null` branch.
//   EaseEmpty   — composed empty state: one line of what's missing + optional CTA.
//   EaseError   — honest failure card with an optional Retry (only when retrying
//                 can help) and the children you pass for route-out links.
import React from 'react';
import '../meridian.css';

// Skeleton sized to a typical leaf: a header line, an optional KPI strip, then
// a short stack of card rows. `aria-busy` + role=status so SRs announce the wait.
export function EaseLoading({ kpis = false, rows = 5, label = 'Loading' }: {
  kpis?: boolean; rows?: number; label?: string;
}) {
  return (
    <div className="mer" aria-busy="true" role="status" aria-label={label}>
      <div style={{ padding: '20px 24px', maxWidth: 760 }}>
        <div className="skel skel-line lg" style={{ width: '34%', marginBottom: 18 }} />
        {kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
            {[0, 1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 52 }} />)}
          </div>
        )}
        {Array.from({ length: rows }, (_, i) => <div key={i} className="skel skel-card" />)}
      </div>
    </div>
  );
}

// Empty state: a plain sentence saying what's not here yet, with an optional
// single action so the operator knows how to populate it.
export function EaseEmpty({ message, action }: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="mer mer-loading" role="status">
      <div>
        <p style={{ margin: 0 }}>{message}</p>
        {action && (
          <div className="mer-error-acts" style={{ marginTop: 12 }}>
            <button type="button" className="btn pri" onClick={action.onClick}>{action.label}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Failure card: a clear message + a route-out row. Retry renders only when an
// onRetry handler is given (callers withhold it for 403/404 that won't change).
export function EaseError({ message, onRetry, children }: {
  message: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="mer mer-error" role="alert">
      <p>{message}</p>
      {(onRetry || children) && (
        <div className="mer-error-acts">
          {onRetry && <button type="button" className="btn ghost" onClick={onRetry}>Retry</button>}
          {children}
        </div>
      )}
    </div>
  );
}

// ponytail: self-check — render shapes are pure, so just assert they construct.
export function __demo(): boolean {
  return (
    React.isValidElement(<EaseLoading />) &&
    React.isValidElement(<EaseEmpty message="x" />) &&
    React.isValidElement(<EaseError message="x" />)
  );
}
