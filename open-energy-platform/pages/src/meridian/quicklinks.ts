// pages/src/meridian/quicklinks.ts — Meridian header quicklinks + role gating.
// Pure (no React / no api) so the gating logic can be unit-tested from the
// server vitest suite without dragging the SPA runtime (react, axios) into a
// node-only test install. MeridianHeader re-exports these for rendering.

// Header quicklinks. Deals / ESG / Reports are for every signed-in role; the
// last two are oversight surfaces that shouldn't show for an operator role
// (part of the "every role sees everything" complaint). Intelligence is an
// admin analytics console; National (/dashboard) is the regulator/grid/admin
// oversight board.
export const QUICKLINKS: { to: string; label: string }[] = [
  { to: '/deals', label: 'Deals' },
  { to: '/esg', label: 'ESG' },
  { to: '/reports', label: 'Reports' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/dashboard', label: 'National' },
];
export const QUICKLINK_ROLES: Record<string, string[]> = {
  '/intelligence': ['admin'],
  '/dashboard': ['admin', 'regulator', 'grid_operator', 'grid'],
};
// A quicklink with no role restriction is visible to all; a restricted one
// shows only for the listed roles (JWT-suffixed forms, e.g. grid_operator).
export function quicklinkVisible(role: string, to: string): boolean {
  const allowed = QUICKLINK_ROLES[to];
  return !allowed || allowed.includes(role);
}
