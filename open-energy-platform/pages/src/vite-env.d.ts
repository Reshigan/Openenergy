// Vite client types — adds ImportMeta.env, asset imports, and CSS side-
// effect imports to the global TS module graph. Required for tsc --noEmit
// because Vite injects these at build time, not via tsconfig.
/// <reference types="vite/client" />

declare module '*.css';
declare module '*.module.css';
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/inter-tight';
declare module '@fontsource-variable/newsreader';
declare module '@fontsource-variable/jetbrains-mono';

// Project icon module path — declared so Tile.tsx's deep import resolves
// even when the icon barrel re-exports from a sub-folder.
declare module '../../icons/ionex' {
  export const Eye: React.FC<{ size?: number; className?: string }>;
  // Catch-all for any other named export — keeps the SPA build green
  // without forcing us to enumerate every icon.
  const _default: Record<string, React.FC<{ size?: number; className?: string }>>;
  export default _default;
}
