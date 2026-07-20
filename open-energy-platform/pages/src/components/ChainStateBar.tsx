// ChainStateBar — shared progress indicator for state-machine chains.
// mockup-b design tokens: amber accent, OKLCH palette.
// Used by all chain tab components.

import React from 'react';

export type ChainStateBarProps = {
  allStates: readonly string[];
  currentState: string;
  branchStates?: readonly string[];
  stateLabel?: string;
  /**
   * 'full'    — track + node + label + step counter (default).
   * 'compact' — mini bar only, no text. Suitable for table cells.
   */
  variant?: 'full' | 'compact';
};

function formatState(state: string): string {
  return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// mockup-b tokens
const ACC      = 'oklch(0.46 0.12 230)';   // amber
const ACC_BG   = 'oklch(0.96 0.02 230)';
const ACC_BDR  = 'oklch(0.80 0.06 230)';
const BAD      = 'oklch(0.48 0.20 20)';   // red for branch/terminal
const TRACK_BG = 'var(--s2, oklch(0.93 0.004 250))';
const TX3      = 'var(--ink-2, oklch(0.60 0.007 250))';
const TX2      = 'var(--ink-2, oklch(0.40 0.009 250))';

export function ChainStateBar({
  allStates,
  currentState,
  branchStates = [],
  stateLabel,
  variant = 'full',
}: ChainStateBarProps) {
  const mainStates = allStates.filter(s => !branchStates.includes(s));
  const indexInMain = mainStates.indexOf(currentState);
  const indexInAll  = allStates.indexOf(currentState);
  const isBranch    = branchStates.includes(currentState);
  const effectiveIndex = indexInMain >= 0 ? indexInMain : (indexInAll >= 0 ? indexInAll : 0);
  const total = mainStates.length > 0 ? mainStates.length : allStates.length;
  const fraction = total <= 1 ? 1 : effectiveIndex / (total - 1);
  const displayLabel = stateLabel ?? formatState(currentState);
  const stepN = effectiveIndex + 1;
  const stepM = total;

  if (variant === 'compact') {
    return (
      <div
        role="progressbar"
        aria-valuenow={effectiveIndex}
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-label={`${displayLabel} — step ${stepN} of ${stepM}`}
        style={{
          position: 'relative', width: 56, height: 4, borderRadius: 2,
          background: TRACK_BG, overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle',
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${Math.min(100, fraction * 100)}%`,
          background: isBranch ? BAD : ACC,
          borderRadius: 2, transition: 'width 0.3s cubic-bezier(0.23,1,0.32,1)',
        }} />
      </div>
    );
  }

  const trackH = 5;
  const nodeSize = 11;
  const nodePct = Math.min(100, Math.max(0, fraction * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 110 }}>
      {/* Track + node */}
      <div
        role="progressbar"
        aria-valuenow={effectiveIndex}
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-label={`${displayLabel} — step ${stepN} of ${stepM}`}
        style={{ position: 'relative', height: trackH, background: TRACK_BG, borderRadius: trackH / 2, overflow: 'visible' }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${Math.min(100, fraction * 100)}%`,
          background: isBranch ? BAD : ACC, borderRadius: trackH / 2,
          transition: 'width 0.3s cubic-bezier(0.23,1,0.32,1)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${nodePct}%`,
          transform: 'translate(-50%, -50%)',
          width: nodeSize, height: nodeSize, borderRadius: '50%',
          background: isBranch ? BAD : ACC,
          border: '2px solid white',
          boxShadow: `0 0 0 2px ${isBranch ? BAD : ACC_BDR}`,
          zIndex: 1,
        }} />
      </div>

      {/* Label + step counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span
          style={{ fontSize: 11, fontWeight: 600, color: TX2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}
          title={displayLabel}
        >
          {displayLabel}
        </span>
        <span style={{ fontSize: 10, color: TX3, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: '"IBM Plex Mono","Fira Code",monospace' }}>
          {stepN}/{stepM}
        </span>
      </div>

      {/* Branch indicator */}
      {branchStates.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3, background: 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, oklch(0.97 0.04 20)))', color: BAD, border: `1px solid var(--bad, oklch(0.88 0.08 20))` }}>
            {branchStates.length === 1 ? '1 branch' : `${branchStates.length} branches`}
          </span>
        </div>
      )}
    </div>
  );
}

export default ChainStateBar;
