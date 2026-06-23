// pages/src/meridian/quicklinks.ts — Meridian header quicklinks + role gating.
// Pure (no React / no api) so the gating logic can be unit-tested from the
// server vitest suite without dragging the SPA runtime (react, axios) into a
// node-only test install. MeridianHeader re-exports these for rendering.

// Header quicklinks. Every link is role-gated to the roles that actually use the
// surface — answering the "why do all the roles have Deals / ESG at the top?"
// complaint. Reports stays universal (every role files/reads reports). Deals is
// for commercial originators; ESG for sustainability/disclosure roles;
// Intelligence is the admin analytics console; National (/dashboard) is the
// regulator/grid/admin oversight board.
export const QUICKLINKS: { to: string; label: string }[] = [
  { to: '/deals', label: 'Deals' },
  { to: '/esg', label: 'ESG' },
  { to: '/reports', label: 'Reports' },
  { to: '/intelligence', label: 'Intelligence' },
  { to: '/dashboard', label: 'National' },
];
// JWT roles are suffixed (grid_operator, ipp_developer, carbon_fund); include the
// short forms too so gating holds whichever shape the token carries.
export const QUICKLINK_ROLES: Record<string, string[]> = {
  '/deals': ['admin', 'trader', 'ipp_developer', 'ipp', 'offtaker', 'carbon_fund', 'carbon', 'lender'],
  '/esg': ['admin', 'offtaker', 'carbon_fund', 'carbon', 'ipp_developer', 'ipp', 'regulator'],
  '/intelligence': ['admin'],
  '/dashboard': ['admin', 'regulator', 'grid_operator', 'grid'],
};
// A quicklink with no role restriction is visible to all; a restricted one
// shows only for the listed roles (JWT-suffixed forms, e.g. grid_operator).
export function quicklinkVisible(role: string, to: string): boolean {
  const allowed = QUICKLINK_ROLES[to];
  return !allowed || allowed.includes(role);
}
