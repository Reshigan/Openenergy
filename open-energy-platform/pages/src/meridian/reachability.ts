// Pure tile -> route resolution shared by AtlasPage and CommandPalette.
// No SURFACE_REGISTRY import here — callers inject `hasSurface` so this
// module stays out of the browser bundle's registry dependency.

export const surfaceRole = (r: string): string => (r === 'esums_owner' ? 'esco' : r);

export type Tile = { key: string; chainKey?: string; route?: string };

export function tileTarget(
  role: string,
  f: Tile,
  hasSurface: (k: string) => boolean,
): string | null {
  if (f.chainKey) return `/ledger/${f.chainKey}`;
  if (f.route) return f.route;
  return hasSurface(`${surfaceRole(role)}:${f.key}`) ? `/surface/${f.key}` : null;
}

export function isTileReachable(
  role: string,
  f: Tile,
  hasSurface: (k: string) => boolean,
): boolean {
  return tileTarget(role, f, hasSurface) !== null;
}
