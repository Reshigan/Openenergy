import React from 'react';
import { Link } from 'react-router-dom';
import { OEIcon, IconName } from './OEIcon';

/* ════════════════════════════════════════════════════════════════════════
 * EntityLink — uniform pill for cross-feature entity references
 *
 * Replaces the previous emoji-icon variant. Each entity type maps to:
 *   - a custom OE SVG glyph (no emoji, no stock library)
 *   - a colour pair drawn from the OE palette (navy/blue/teal/sky/amber/green/plum)
 *   - the canonical detail route (e.g. project_id → /projects/:id)
 *
 * Usage:
 *   <EntityLink id="proj_abc" type="project" />
 *   <EntityLink id="cc_123" type="carbon" label="VCS-22 batch" />
 * ═══════════════════════════════════════════════════════════════════════ */

type EntityType =
  | 'participant'
  | 'contract'
  | 'loi'
  | 'trade'
  | 'project'
  | 'invoice'
  | 'carbon'
  | 'rfp'
  | 'site'
  | 'fault'
  | 'generic';

interface EntityLinkProps {
  id: string;
  type: EntityType;
  /** Optional human-readable override; defaults to a short fingerprint of id. */
  label?: string;
  /** Explicit href — skips the type-derived default route. */
  href?: string;
  onClick?: () => void;
}

const TYPE_STYLE: Record<EntityType, { icon: IconName; bg: string; fg: string; route?: (id: string) => string }> = {
  participant: { icon: 'user',         bg: 'oklch(0.94 0.02 250)', fg: '#1a5d97', route: (id) => `/admin?participant=${encodeURIComponent(id)}` },
  contract:    { icon: 'contract',     bg: '#ece4f5', fg: '#5d3a7e', route: (id) => `/contracts/${encodeURIComponent(id)}` },
  loi:         { icon: 'loi',          bg: '#d4e7f6', fg: '#1a5d97', route: (id) => `/lois/${encodeURIComponent(id)}` },
  trade:       { icon: 'bolt',         bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', route: (id) => `/trading?id=${encodeURIComponent(id)}` },
  project:     { icon: 'building',     bg: '#fce5c4', fg: '#c97a14', route: (id) => `/projects/${encodeURIComponent(id)}` },
  invoice:     { icon: 'invoice',      bg: '#fde0db', fg: '#c0392b', route: (id) => `/settlement?invoice=${encodeURIComponent(id)}` },
  carbon:      { icon: 'leaf',         bg: '#b8eae6', fg: '#0e6d68', route: (id) => `/carbon?credit=${encodeURIComponent(id)}` },
  rfp:         { icon: 'doc-stack',    bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)', route: (id) => `/procurement?rfp=${encodeURIComponent(id)}` },
  site:        { icon: 'factory',      bg: '#b8eae6', fg: '#1f9b95', route: (id) => `/om?site=${encodeURIComponent(id)}` },
  fault:       { icon: 'alert',        bg: '#fde0db', fg: '#c0392b', route: (id) => `/om?fault=${encodeURIComponent(id)}` },
  generic:     { icon: 'connection',   bg: '#eef2f7', fg: '#3d4756' },
};

function shortId(id: string): string {
  if (!id) return '—';
  if (id.length <= 14) return id;
  // Most entity ids look like `prefix_xxxxxxxxxxxx`; keep the prefix + 6 chars.
  const m = id.match(/^([a-z]+_)(.+)$/i);
  if (m) return `${m[1]}${m[2].slice(0, 6)}…`;
  return id.slice(0, 8) + '…';
}

export function EntityLink({ id, type, label, href, onClick }: EntityLinkProps) {
  const cfg = TYPE_STYLE[type] || TYPE_STYLE.generic;
  const text = label || shortId(id);
  const target = href || cfg.route?.(id);

  const inner = (
    <span
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full font-mono text-[11px] transition-colors hover:brightness-95"
      style={{ background: cfg.bg, color: cfg.fg, cursor: target || onClick ? 'pointer' : 'default' }}
      title={id}
    >
      <OEIcon name={cfg.icon} size={12} />
      <span className="truncate max-w-[160px]">{text}</span>
    </span>
  );

  if (target) {
    return <Link to={target} className="no-underline">{inner}</Link>;
  }
  return inner;
}

export default EntityLink;
