// Per-role design tokens. Drives <RoleShell> CSS variables.
//
// Every role gets the SAME shell + signature components. Per [[feedback_role_ux_depth]]
// + 2026-05-25 user direction "each launchpad has a different colour they should all
// match siphos" — colour (accent/haze/chrome) is now unified to the admin theme so
// every persona launches into the same brand surface. Per-role personality lives in
// `workstationDensity` (Bloomberg vs cinematic) and `heroMotif` (motif on hero).

export type RoleKey =
  | 'admin'
  | 'trader'
  | 'ipp_developer'
  | 'wind_operator'
  | 'offtaker'
  | 'lender'
  | 'carbon_fund'
  | 'regulator'
  | 'grid_operator'
  | 'support';

export type Density = 'cinematic' | 'bloomberg';
export type Chrome = 'dark' | 'light' | 'warm';

export interface RoleTheme {
  key: RoleKey;
  label: string;
  workstationDensity: Density;
  chrome: Chrome;
  accent: string;
  accentSecondary?: string;
  accentSoft: string;
  haze: string;
  displayFont: 'inter-tight' | 'newsreader';
  heroMotif: string;
}

// Unified brand palette — the admin/Sipho colour. Every role inherits this.
const BRAND_ACCENT = '#7e57c2';
const BRAND_ACCENT_SECONDARY = '#5fa8e8';
const BRAND_ACCENT_SOFT = 'rgba(126, 87, 194, 0.22)';
const BRAND_HAZE =
  'radial-gradient(120% 80% at 30% 0%, rgba(126,87,194,0.28) 0%, rgba(15,28,46,0) 65%), linear-gradient(180deg, #0f1c2e 0%, #1a3a5c 100%)';
const BRAND_CHROME: Chrome = 'dark';

export const roleThemes: Record<RoleKey, RoleTheme> = {
  trader: {
    key: 'trader',
    label: 'Trading desk',
    workstationDensity: 'bloomberg',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'multi-tape-ticker',
  },
  grid_operator: {
    key: 'grid_operator',
    label: 'System operator',
    workstationDensity: 'bloomberg',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'sa-grid-map',
  },
  regulator: {
    key: 'regulator',
    label: 'Regulator',
    workstationDensity: 'bloomberg',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'newsreader',
    heroMotif: 'gazette-ledger',
  },
  support: {
    key: 'support',
    label: 'Support desk',
    workstationDensity: 'bloomberg',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'ticket-queue',
  },
  admin: {
    key: 'admin',
    label: 'Platform admin',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'tenant-constellation',
  },
  lender: {
    key: 'lender',
    label: 'Lender',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'newsreader',
    heroMotif: 'waterfall-ladder',
  },
  ipp_developer: {
    key: 'ipp_developer',
    label: 'IPP developer',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'milestone-road',
  },
  wind_operator: {
    key: 'wind_operator',
    label: 'Wind operator',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'kinetic-wind-field',
  },
  offtaker: {
    key: 'offtaker',
    label: 'Offtaker',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'inter-tight',
    heroMotif: 'site-heatmap',
  },
  carbon_fund: {
    key: 'carbon_fund',
    label: 'Carbon fund',
    workstationDensity: 'cinematic',
    chrome: BRAND_CHROME,
    accent: BRAND_ACCENT,
    accentSecondary: BRAND_ACCENT_SECONDARY,
    accentSoft: BRAND_ACCENT_SOFT,
    haze: BRAND_HAZE,
    displayFont: 'newsreader',
    heroMotif: 'vintage-stamp-wall',
  },
};

export function themeFor(role: string | undefined | null): RoleTheme {
  if (role && role in roleThemes) return roleThemes[role as RoleKey];
  return roleThemes.admin;
}
