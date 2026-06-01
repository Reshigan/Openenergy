// NLCommandBar — the natural-language command bar that IS the workstation
// in the Command Lens direction.
//
// Parses simple imperative queries against the SCC dataset:
//   "revoke kakamas"          → revoke action on scc-016
//   "show breached"           → results filter
//   "show NERSA backbone"     → results filter
//   "open vereeniging"        → open action
//   "suspend sandton"         → suspend action
//
// The parser is deliberately simple substring + verb matching — no NLP.
// What sells the design is the immediate inline preview/result; the parse
// model can be upgraded later.

import React, { useEffect, useMemo, useRef } from 'react';
import { ChainRow, SAMPLE_CHAIN_DATA } from '../shared/SampleChainData';
import { PreviewedAction } from './ActionPreview';

export interface ParseResult {
  kind: 'idle' | 'preview' | 'list' | 'unknown';
  action?: PreviewedAction;
  list?: ChainRow[];
  listLabel?: string;
  message?: string;
}

const VERBS: Array<{ name: PreviewedAction['verb']; aliases: string[] }> = [
  { name: 'revoke',   aliases: ['revoke', 'revoking', 'revocation'] },
  { name: 'suspend',  aliases: ['suspend', 'pause', 'hold'] },
  { name: 'failover', aliases: ['failover', 'fail-over', 'switch'] },
  { name: 'open',     aliases: ['open', 'show', 'view', 'find', 'go'] },
];

const FILTER_KEYWORDS: Array<{ name: string; match: (r: ChainRow) => boolean; label: string }> = [
  { name: 'breached',  match: (r) => r.sla_breached, label: 'breached chains' },
  { name: 'imminent',  match: (r) => !r.sla_breached && r.sla_pct_remaining < 25 && r.sla_target_hours > 0, label: 'imminent chains' },
  { name: 'nersa',     match: (r) => r.regulator_relevant, label: 'NERSA-flagged chains' },
  { name: 'backbone',  match: (r) => r.tier === 'national_grid_backbone', label: 'national backbone connectors' },
  { name: 'pilot',     match: (r) => r.tier === 'pilot', label: 'pilot connectors' },
  { name: 'critical',  match: (r) => r.urgency === 'critical' || r.health === 'critical', label: 'critical chains' },
  { name: 'live',      match: (r) => r.status === 'live_operations', label: 'live chains' },
  { name: 'revoked',   match: (r) => r.status === 'revoked', label: 'revoked chains' },
  { name: 'disconnected', match: (r) => r.status === 'disconnected', label: 'disconnected chains' },
];

export function parseQuery(raw: string): ParseResult {
  const q = raw.trim().toLowerCase();
  if (!q) return { kind: 'idle' };

  // First — try verb detection.
  const tokens = q.split(/\s+/);
  const verbTok = tokens[0];
  const verb = VERBS.find((v) => v.aliases.includes(verbTok));

  // Verb-action paths
  if (verb && (verb.name === 'revoke' || verb.name === 'suspend' || verb.name === 'failover')) {
    const rest = tokens.slice(1).join(' ');
    const target = findTarget(rest);
    if (target) {
      return { kind: 'preview', action: { verb: verb.name, target } };
    }
    return { kind: 'unknown', message: `Could not match a target connector for "${verb.name} ${rest}".` };
  }
  if (verb && verb.name === 'open') {
    const rest = tokens.slice(1).join(' ');
    const target = findTarget(rest);
    if (target) {
      return { kind: 'preview', action: { verb: 'open', target } };
    }
  }

  // Otherwise — treat as a list query.
  // Combine all keyword matches (AND).
  const matchedKeywords = FILTER_KEYWORDS.filter((k) => q.includes(k.name));
  if (matchedKeywords.length > 0) {
    const rows = SAMPLE_CHAIN_DATA.filter((r) => matchedKeywords.every((k) => k.match(r)));
    return {
      kind: 'list',
      list: rows,
      listLabel: matchedKeywords.map((k) => k.label).join(' + '),
    };
  }

  // Substring match against substation/title.
  const rows = SAMPLE_CHAIN_DATA.filter((r) =>
    r.substation.toLowerCase().includes(q) ||
    r.title.toLowerCase().includes(q) ||
    r.number.toLowerCase().includes(q) ||
    r.id.toLowerCase().includes(q),
  );
  if (rows.length > 0) {
    return { kind: 'list', list: rows, listLabel: `containing "${q}"` };
  }

  return { kind: 'unknown', message: `Nothing matches "${raw}". Try: ${SUGGESTIONS.slice(0, 3).map((s) => `"${s}"`).join(', ')}.` };
}

function findTarget(q: string): ChainRow | undefined {
  const norm = q.trim().toLowerCase();
  if (!norm) return undefined;
  // First by id / number exact.
  const exact = SAMPLE_CHAIN_DATA.find((r) => r.id === norm || r.number.toLowerCase() === norm);
  if (exact) return exact;
  // Then by substring of substation name.
  return SAMPLE_CHAIN_DATA.find((r) =>
    r.substation.toLowerCase().includes(norm) ||
    r.title.toLowerCase().includes(norm),
  );
}

export const SUGGESTIONS = [
  'revoke kakamas',
  'show breached',
  'show NERSA backbone',
  'open vereeniging',
  'suspend sandton',
  'show imminent pilot',
  'failover bellville',
  'show critical',
];

export function NLCommandBar({
  value,
  onChange,
  onSubmit,
  onEscape,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onEscape: () => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <div
      style={{
        position: 'relative',
        background: '#fff',
        border: '2px solid #1a3a5c',
        borderRadius: 14,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 12px 36px rgba(15,28,46,0.10)',
      }}
    >
      <span
        className="oe-cmd-blink"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#0e6d68',
        }}
      />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onEscape();
          }
        }}
        placeholder='Try "revoke kakamas", "show breached", "open vereeniging" …'
        aria-label="Natural-language command"
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: 17,
          fontWeight: 500,
          color: '#0f1c2e',
          background: 'transparent',
        }}
      />
      <span style={{ fontSize: 11, color: '#6b7685', fontFamily: 'ui-monospace, monospace' }}>⏎</span>
    </div>
  );
}
