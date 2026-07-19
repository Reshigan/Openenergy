// ═══════════════════════════════════════════════════════════════════════════
// v2 Surface host (/v2/s/:key) — renders a registered MANAGEMENT surface (the
// non-chain master-data / analytics / connector / report screens) inside the v2
// chrome instead of the legacy Meridian frame. Same SURFACE_REGISTRY component,
// same `role:key` lookup as MeridianSurfacePage — only the wrapper changes: v2
// <Shell> + a `.v2-surface` skin (surface-skin.css) that re-skins the shared
// WorkstationShell primitives onto the dark v2 system. This is how the ~118
// legacy surfaces become part of v2 without being rebuilt one by one.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { SURFACE_REGISTRY } from '../meridian/surfaces';
import { SurfaceBoundary } from '../meridian/MeridianSurfacePage';
import { humanizeKey } from '../shared/lib';
import { EaseLoading } from '../shared/ease/states';
import './surface-skin.css';

export default function Surface() {
  const { key = '' } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  // esums_owner shares ESCO's surfaces; the registry only carries esco:* keys.
  const role = (user?.role === 'esums_owner' ? 'esco' : user?.role) ?? '';

  // Accept both bare keys (/v2/s/metering) and already-qualified ones
  // (/v2/s/offtaker:metering) — same rule as MeridianSurfacePage.
  const lookupKey = key.includes(':') ? key : `${role}:${key}`;
  const Comp = SURFACE_REGISTRY[lookupKey];
  const title = humanizeKey(key, true);

  if (!Comp) {
    return (
      <Shell>
        <div className="v2-surface">
          <div className="v2-empty">
            This surface isn’t available for your role.
            <div style={{ marginTop: 'var(--sp-4)' }}>
              <button type="button" className="v2-btn v2-btn-secondary" onClick={() => nav('/v2')}>
                Back to your work queue
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="v2-surface">
        <div className="v2-surface-head">
          <h1>{title}</h1>
        </div>
        <SurfaceBoundary>
          <React.Suspense fallback={<EaseLoading kpis rows={4} />}>
            <Comp role={role} />
          </React.Suspense>
        </SurfaceBoundary>
      </div>
    </Shell>
  );
}
