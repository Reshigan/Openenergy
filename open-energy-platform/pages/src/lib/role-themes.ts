// Per-role design tokens. Drives <RoleShell> CSS variables.
//
// Every role gets the SAME shell + signature components — personality lives
// here, in a single table. To add a role, add a row.

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

export const roleThemes: Record<RoleKey, RoleTheme> = {
  trader: {
    key: 'trader',
    label: 'Trading desk',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#f5b800',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(245, 184, 0, 0.18)',
    haze: 'radial-gradient(120% 80% at 20% 0%, rgba(245,184,0,0.22) 0%, rgba(10,22,34,0) 60%), linear-gradient(180deg, #0a1622 0%, #0f2540 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'multi-tape-ticker',
  },
  grid_operator: {
    key: 'grid_operator',
    label: 'System operator',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#5fa8e8',
    accentSecondary: '#c0392b',
    accentSoft: 'rgba(95, 168, 232, 0.18)',
    haze: 'radial-gradient(120% 80% at 80% 0%, rgba(95,168,232,0.25) 0%, rgba(10,28,48,0) 60%), linear-gradient(180deg, #0a1c30 0%, #0f2540 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'sa-grid-map',
  },
  regulator: {
    key: 'regulator',
    label: 'Regulator',
    workstationDensity: 'bloomberg',
    chrome: 'warm',
    accent: '#b8a07a',
    accentSecondary: '#1a3a5c',
    accentSoft: 'rgba(184, 160, 122, 0.22)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(184,160,122,0.28) 0%, rgba(247,243,236,0) 65%), linear-gradient(180deg, #f7f3ec 0%, #ede3d0 100%)',
    displayFont: 'newsreader',
    heroMotif: 'gazette-ledger',
  },
  support: {
    key: 'support',
    label: 'Support desk',
    workstationDensity: 'bloomberg',
    chrome: 'dark',
    accent: '#5fa8e8',
    accentSecondary: '#6b7685',
    accentSoft: 'rgba(95, 168, 232, 0.18)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(95,168,232,0.22) 0%, rgba(15,28,46,0) 60%), linear-gradient(180deg, #0f1c2e 0%, #1a2a3e 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'ticket-queue',
  },
  admin: {
    key: 'admin',
    label: 'Platform admin',
    workstationDensity: 'cinematic',
    chrome: 'dark',
    accent: '#7e57c2',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(126, 87, 194, 0.22)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(126,87,194,0.28) 0%, rgba(15,28,46,0) 65%), linear-gradient(180deg, #0f1c2e 0%, #1a3a5c 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'tenant-constellation',
  },
  lender: {
    key: 'lender',
    label: 'Lender',
    workstationDensity: 'cinematic',
    chrome: 'dark',
    accent: '#c9a049',
    accentSecondary: '#1a3a5c',
    accentSoft: 'rgba(201, 160, 73, 0.22)',
    haze: 'radial-gradient(120% 80% at 70% 0%, rgba(201,160,73,0.24) 0%, rgba(10,28,48,0) 60%), linear-gradient(180deg, #0f2540 0%, #0a1c30 100%)',
    displayFont: 'newsreader',
    heroMotif: 'waterfall-ladder',
  },
  ipp_developer: {
    key: 'ipp_developer',
    label: 'IPP developer',
    workstationDensity: 'cinematic',
    chrome: 'warm',
    accent: '#c97a14',
    accentSecondary: '#6b7685',
    accentSoft: 'rgba(201, 122, 20, 0.20)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(201,122,20,0.24) 0%, rgba(252,247,238,0) 65%), linear-gradient(180deg, #fcf7ee 0%, #f5ebd6 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'milestone-road',
  },
  wind_operator: {
    key: 'wind_operator',
    label: 'Wind operator',
    workstationDensity: 'cinematic',
    chrome: 'light',
    accent: '#1f9b95',
    accentSecondary: '#5fa8e8',
    accentSoft: 'rgba(31, 155, 149, 0.20)',
    haze: 'radial-gradient(120% 80% at 60% 0%, rgba(31,155,149,0.26) 0%, rgba(245,250,253,0) 65%), linear-gradient(180deg, #f5fafd 0%, #dfeef5 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'kinetic-wind-field',
  },
  offtaker: {
    key: 'offtaker',
    label: 'Offtaker',
    workstationDensity: 'cinematic',
    chrome: 'warm',
    accent: '#f5b800',
    accentSecondary: '#b8a07a',
    accentSoft: 'rgba(245, 184, 0, 0.20)',
    haze: 'radial-gradient(120% 80% at 50% 0%, rgba(245,184,0,0.22) 0%, rgba(253,249,242,0) 65%), linear-gradient(180deg, #fdf9f2 0%, #f5ecd5 100%)',
    displayFont: 'inter-tight',
    heroMotif: 'site-heatmap',
  },
  carbon_fund: {
    key: 'carbon_fund',
    label: 'Carbon fund',
    workstationDensity: 'cinematic',
    chrome: 'light',
    accent: '#1a8a5b',
    accentSecondary: '#c9a049',
    accentSoft: 'rgba(26, 138, 91, 0.20)',
    haze: 'radial-gradient(120% 80% at 30% 0%, rgba(26,138,91,0.24) 0%, rgba(250,248,242,0) 65%), linear-gradient(180deg, #faf8f2 0%, #e8efe1 100%)',
    displayFont: 'newsreader',
    heroMotif: 'vintage-stamp-wall',
  },
};

export function themeFor(role: string | undefined | null): RoleTheme {
  if (role && role in roleThemes) return roleThemes[role as RoleKey];
  return roleThemes.trader;
}
