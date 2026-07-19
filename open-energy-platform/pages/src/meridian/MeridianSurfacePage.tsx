// pages/src/meridian/MeridianSurfacePage.tsx — the ONE parametric Meridian surface route.
// Phase E retires the `*WorkstationPage.tsx` husks: non-chain workstation tabs (master-data
// CRUD, settings, analytics/reports/ML panels, connectors) become standalone full-canvas
// Meridian surfaces reachable from Atlas (⌘K). Rather than ~98 hand-written routes, App.tsx
// mounts /surface/:key here; this page resolves SURFACE_REGISTRY[`${role}:${key}`] and renders
// the registered body inside a MeridianFrame (which supplies the .mer chrome + meridian.css).
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { MeridianFrame } from './MeridianFrame';
import { SURFACE_REGISTRY } from './surfaces';
import { humanizeKey } from '../shared/lib';
import { EaseLoading, EaseError } from './ease/states';

// Every leaf inherits graceful failure: a surface that throws renders the shared
// EaseError card (with retry + an Atlas escape) instead of blanking the app.
export class SurfaceBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <EaseError message="This surface hit an error and couldn't render." onRetry={() => this.setState({ failed: false })}>
          <Link to="/cockpit" className="btn ghost">Back to your cockpit</Link>
        </EaseError>
      );
    }
    return this.props.children;
  }
}

export default function MeridianSurfacePage() {
  const { key = '' } = useParams();
  // ProtectedRoute guarantees a user before this page mounts (AtlasPage idiom).
  const { user } = useAuth();
  // esums_owner is a legacy registerable role sharing ESCO's surfaces; the registry
  // only carries `esco:*` keys, so resolve it to esco for lookup (AtlasPage idiom).
  const role = (user?.role === 'esums_owner' ? 'esco' : user?.role) ?? '';

  // Atlas/CommandPalette emit bare-key links (/surface/metering) and rely on the
  // role prefix being added here. The Horizon KPI band emits already-qualified
  // links (/surface/offtaker:metering). Accept both: a key that already carries a
  // `role:` prefix is used verbatim, otherwise the resolved role is prepended.
  const lookupKey = key.includes(':') ? key : `${role}:${key}`;
  const Comp = SURFACE_REGISTRY[lookupKey];

  if (!Comp) {
    return (
      <MeridianFrame ctx={<b>Surface</b>}>
        <div className="mer-deadend" role="alert">
          <span className="mer-deadend-glyph" aria-hidden="true">⌁</span>
          <p className="mer-deadend-ttl">This surface isn’t available for your role.</p>
          <p className="mer-deadend-sub">Press <kbd>⌘K</kbd> to search everything you can reach.</p>
          <div className="mer-error-acts">
            <Link to="/cockpit" className="btn ghost">Back to your cockpit</Link>
          </div>
        </div>
      </MeridianFrame>
    );
  }

  return (
    <MeridianFrame ctx={<b>{humanizeKey(key, true)}</b>}>
      {/* Every leaf inherits a skeletal load shape (not a bare "Loading…") while
          its lazy chunk + first fetch resolve — the platform-wide ease floor. */}
      <SurfaceBoundary>
        <React.Suspense fallback={<EaseLoading kpis rows={4} />}>
          <Comp role={role} />
        </React.Suspense>
      </SurfaceBoundary>
    </MeridianFrame>
  );
}
