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
import { humanizeKey } from './lib';

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
        <div className="mer mer-error" role="alert">
          Surface not available. <Link to="/atlas">Open Atlas</Link>
        </div>
      </MeridianFrame>
    );
  }

  return (
    <MeridianFrame ctx={<b>{humanizeKey(key, true)}</b>}>
      <React.Suspense fallback={<div className="mer mer-loading" aria-busy="true">Loading…</div>}>
        <Comp role={role} />
      </React.Suspense>
    </MeridianFrame>
  );
}
