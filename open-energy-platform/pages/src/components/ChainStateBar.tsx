// ChainStateBar — shared progress indicator for state-machine chains.
// Shows how far along a workflow is, with a filled track, node marker, and step counter.
// Used by chain tab components: IppIssuesTab, IppRiskTab, StageGateTab, etc.

import React from 'react';

export type ChainStateBarProps = {
  /** All states in the chain, in order (main path). */
  allStates: readonly string[];
  /** The current state value. */
  currentState: string;
  /** States that are off the main path (terminal branches, error states, etc.). */
  branchStates?: readonly string[];
  /** Display label for the current state. If omitted, underscores are replaced with spaces. */
  stateLabel?: string;
  /**
   * 'full' — track + node + label + step counter (default).
   * 'compact' — mini bar only, no text. Suitable for table cells.
   */
  variant?: 'full' | 'compact';
};

/** Replace underscores with spaces and title-case each word. */
function formatState(state: string): string {
  return state
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const BRAND_PURPLE = '#7e57c2';
const TRACK_BG = '#e2d9f3';
const NODE_BORDER = '#ffffff';

export function ChainStateBar({
  allStates,
  currentState,
  branchStates = [],
  stateLabel,
  variant = 'full',
}: ChainStateBarProps) {
  const mainStates = allStates.filter((s) => !branchStates.includes(s));

  // Index within mainStates (fall back to searching full list)
  const indexInMain = mainStates.indexOf(currentState);
  const indexInAll = allStates.indexOf(currentState);
  const isBranch = branchStates.includes(currentState);

  // Use main-path index when possible; for branch states show as end of main path
  const effectiveIndex = indexInMain >= 0 ? indexInMain : indexInAll >= 0 ? indexInAll : 0;
  const total = mainStates.length > 0 ? mainStates.length : allStates.length;

  // Fraction 0→1 representing progress along the main path
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
          position: 'relative',
          width: 60,
          height: 4,
          borderRadius: 2,
          backgroundColor: TRACK_BG,
          overflow: 'hidden',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${Math.min(100, fraction * 100)}%`,
            backgroundColor: BRAND_PURPLE,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    );
  }

  // ── Full variant ─────────────────────────────────────────────────────────────
  const trackHeight = 6;
  const nodeSize = 12;

  // Node position as % across the track
  const nodePct = Math.min(100, Math.max(0, fraction * 100));

  const hasBranches = branchStates.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
      {/* Track + node */}
      <div
        role="progressbar"
        aria-valuenow={effectiveIndex}
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-label={`${displayLabel} — step ${stepN} of ${stepM}`}
        style={{
          position: 'relative',
          height: trackHeight,
          backgroundColor: TRACK_BG,
          borderRadius: trackHeight / 2,
          overflow: 'visible',
        }}
      >
        {/* Filled portion */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${Math.min(100, fraction * 100)}%`,
            backgroundColor: BRAND_PURPLE,
            borderRadius: trackHeight / 2,
            transition: 'width 0.3s ease',
          }}
        />

        {/* Node marker */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${nodePct}%`,
            transform: 'translate(-50%, -50%)',
            width: nodeSize,
            height: nodeSize,
            borderRadius: '50%',
            backgroundColor: isBranch ? '#d97706' : BRAND_PURPLE,
            border: `2px solid ${NODE_BORDER}`,
            boxShadow: `0 0 0 2px ${isBranch ? '#d97706' : BRAND_PURPLE}`,
            zIndex: 1,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Label + step counter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#4c3d8f',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 160,
          }}
          title={displayLabel}
        >
          {displayLabel}
        </span>
        <span
          style={{
            fontSize: 11,
            color: '#9ca3af',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {stepN} / {stepM}
        </span>
      </div>

      {/* Branch indicator */}
      {hasBranches && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#9ca3af',
          }}
        >
          <span style={{ fontSize: 10 }}>⬊</span>
          <span>
            {branchStates.length === 1
              ? `1 branch state`
              : `${branchStates.length} branch states`}
          </span>
        </div>
      )}
    </div>
  );
}

export default ChainStateBar;
