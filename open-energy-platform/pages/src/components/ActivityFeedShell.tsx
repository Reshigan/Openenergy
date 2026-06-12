// ═══════════════════════════════════════════════════════════════════════════
// ActivityFeedShell — Unified platform shell for all roles.
// Data source: /api/feed reads oe_role_action_queue, populated by every
// fireCascade() call across all 76 state-machine waves.
//
// Design: mockup-b selected by user 2026-06-06. IBM Plex Sans / Mono,
// OKLCH color system, light mode, no side-stripe borders, tabular nums.
// ═══════════════════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';
import { OEIcon } from './OEIcon';

// ── Types ──────────────────────────────────────────────────────────────────

type Urgency   = 'urgent' | 'caution' | 'info';
type Category  = 'all' | 'construction' | 'procurement' | 'hse' | 'carbon' | 'licensing' | 'compliance' | 'finance' | 'trading' | 'grid';

interface CrossOption {
  action_label: string;
  target_route: string;
  prefill?: Record<string, unknown>;
}

interface FeedItem {
  id: string;
  urgency: Urgency;
  priority: string;
  title: string;
  body: Record<string, unknown>;
  source_event: string;
  source_chain_key: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  category: string;
  wave: number | null;
  sla_due_at: string | null;
  sla_remaining_ms: number | null;
  cross_option: CrossOption | null;
  status: string;
  created_at: string;
}

interface FeedCounts { urgent: number; caution: number; info: number; total: number }

interface FeedResponse {
  items: FeedItem[];
  counts: FeedCounts;
  next_cursor: string | null;
  role: string;
}

interface LaunchData {
  kpis?: Array<{ label: string; value: string | number; unit?: string; status?: string }>;
  projects?: Array<{ name: string; progress?: number; capacity?: string; value?: string }>;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Role config ────────────────────────────────────────────────────────────

const ROLES = [
  { key: 'ipp_developer', label: 'IPP Developer',  short: 'IPP'      },
  { key: 'trader',        label: 'Trader',          short: 'Trader'   },
  { key: 'lender',        label: 'Lender',          short: 'Lender'   },
  { key: 'offtaker',      label: 'Offtaker',        short: 'Offtaker' },
  { key: 'grid_operator', label: 'Grid Operator',   short: 'Grid'     },
  { key: 'carbon_fund',   label: 'Carbon Fund',     short: 'Carbon'   },
  { key: 'regulator',     label: 'Regulator',       short: 'NERSA'    },
  { key: 'esco',          label: 'O&M Operator',    short: 'O&M'      },
  { key: 'support',       label: 'Support',         short: 'Support'  },
  { key: 'admin',         label: 'Admin',           short: 'Admin'    },
] as const;

const ROLE_WORKSTATION_PATHS: Record<string, string> = {
  ipp_developer: '/ipp-lifecycle/workstation',
  trader:        '/trader-risk/workstation',
  lender:        '/lender-suite/workstation',
  offtaker:      '/offtaker-suite/workstation',
  grid_operator: '/grid-operator/workstation',
  carbon_fund:   '/carbon-registry/workstation',
  regulator:     '/regulator-suite/workstation',
  esco:          '/esco/workstation',
  support:       '/support/workstation',
  admin:         '/admin-platform/workstation',
};

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'all',          label: 'All'         },
  { key: 'construction', label: 'Construction' },
  { key: 'procurement',  label: 'Procurement'  },
  { key: 'hse',          label: 'HSE/SHEQ'    },
  { key: 'carbon',       label: 'Carbon'       },
  { key: 'licensing',    label: 'Licensing'    },
  { key: 'compliance',   label: 'Compliance'   },
  { key: 'finance',      label: 'Finance'      },
  { key: 'trading',      label: 'Trading'      },
  { key: 'grid',         label: 'Grid'         },
];

// ── Colours ────────────────────────────────────────────────────────────────

const C = {
  canvas:      'oklch(0.97 0.003 250)',
  surface:     'oklch(0.99 0.002 80)',
  border:      'oklch(0.88 0.006 250)',
  borderFaint: 'oklch(0.93 0.004 250)',
  text:        'oklch(0.20 0.025 250)',
  textMuted:   'oklch(0.45 0.015 250)',
  textFaint:   'oklch(0.60 0.008 250)',
  urgent:      { bg: 'oklch(0.97 0.015 25)',  border: 'oklch(0.75 0.15 25)', dot: 'oklch(0.55 0.22 25)', label: 'oklch(0.40 0.18 25)' },
  caution:     { bg: 'oklch(0.97 0.015 85)',  border: 'oklch(0.80 0.13 80)', dot: 'oklch(0.65 0.16 75)', label: 'oklch(0.40 0.14 80)' },
  info:        { bg: 'oklch(0.99 0.002 80)',  border: 'oklch(0.88 0.006 250)', dot: 'oklch(0.55 0.10 250)', label: 'oklch(0.45 0.015 250)' },
  primary:     'oklch(0.38 0.08 250)',
  badge:       { urgent: 'oklch(0.55 0.22 25)', caution: 'oklch(0.65 0.16 75)', info: 'oklch(0.55 0.10 250)' },
  pill:        { active: { bg: 'oklch(0.20 0.025 250)', text: '#fff' }, inactive: { bg: 'transparent', text: 'oklch(0.45 0.015 250)' } },
} as const;

// ── Utility ────────────────────────────────────────────────────────────────

function fmtSla(msRemaining: number | null): string {
  if (msRemaining === null) return '';
  if (msRemaining <= 0) return 'SLA breached';
  const h = Math.floor(msRemaining / 3_600_000);
  const m = Math.floor((msRemaining % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d remaining`;
  if (h >= 1)  return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function urgencyLabel(u: Urgency) {
  if (u === 'urgent')  return 'Urgent';
  if (u === 'caution') return 'Caution';
  return 'Today';
}

// ── Sub-components ─────────────────────────────────────────────────────────

function UrgencyDot({ urgency }: { urgency: Urgency }) {
  const col = urgency === 'urgent' ? C.urgent.dot : urgency === 'caution' ? C.caution.dot : C.info.dot;
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8, height: 8,
        borderRadius: '50%',
        background: col,
        flexShrink: 0,
        marginTop: 1,
      }}
    />
  );
}

function SlaChip({ item }: { item: FeedItem }) {
  if (!item.sla_remaining_ms && item.sla_remaining_ms !== 0) return null;
  const breached = item.sla_remaining_ms === 0;
  const bg    = breached ? C.urgent.bg    : item.urgency === 'urgent' ? 'oklch(0.96 0.020 25)' : 'oklch(0.97 0.012 80)';
  const color = breached ? C.urgent.label : item.urgency === 'urgent' ? C.urgent.label : C.caution.label;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontFamily: '"IBM Plex Mono", monospace',
        fontWeight: 600, letterSpacing: '0.02em',
        padding: '2px 7px', borderRadius: 4,
        background: bg, color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {fmtSla(item.sla_remaining_ms)}
    </span>
  );
}

function WaveTag({ wave }: { wave: number | null }) {
  if (!wave) return null;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        fontSize: 9, fontFamily: '"IBM Plex Mono", monospace',
        fontWeight: 500, letterSpacing: '0.06em',
        padding: '1px 6px', borderRadius: 3,
        background: 'oklch(0.94 0.004 250)',
        color: 'oklch(0.45 0.015 250)',
        textTransform: 'uppercase',
      }}
    >
      W{wave}
    </span>
  );
}

function FeedCard({
  item,
  onAcknowledge,
  onAction,
  onDismiss,
}: {
  item: FeedItem;
  onAcknowledge: (id: string) => void;
  onAction: (item: FeedItem) => void;
  onDismiss: (id: string) => void;
}) {
  const u = item.urgency;
  const palette = u === 'urgent' ? C.urgent : u === 'caution' ? C.caution : C.info;
  const acknowledged = item.status === 'acknowledged';

  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: '12px 14px',
        opacity: acknowledged ? 0.72 : 1,
        transition: 'opacity 120ms ease-out, box-shadow 120ms ease-out',
        boxShadow: u === 'urgent' ? '0 2px 8px oklch(0.55 0.22 25 / 0.10)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <UrgencyDot urgency={u} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <p
              style={{
                margin: 0, fontSize: 13, fontWeight: 600,
                lineHeight: 1.35, color: C.text,
                flex: 1, minWidth: 0,
              }}
            >
              {item.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <WaveTag wave={item.wave} />
              <SlaChip item={item} />
            </div>
          </div>

          {item.body?.detail && (
            <p
              style={{
                margin: '4px 0 0', fontSize: 12,
                color: C.textMuted, lineHeight: 1.5,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}
            >
              {String(item.body.detail)}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.cross_option && (
                <button
                  onClick={() => onAction(item)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 12px',
                    borderRadius: 5,
                    background: 'oklch(0.46 0.16 55)',
                    color: '#fff',
                    border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    transition: 'transform 100ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                  onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)'; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                >
                  {item.cross_option.action_label}
                </button>
              )}
              {!acknowledged && (
                <button
                  onClick={() => onAcknowledge(item.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 10px', borderRadius: 5,
                    background: 'transparent',
                    color: C.textMuted,
                    border: `1px solid ${C.border}`,
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    transition: 'background 120ms ease-out',
                  }}
                >
                  Acknowledge
                </button>
              )}
            </div>
            <button
              onClick={() => onDismiss(item.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.textFaint, fontSize: 12, padding: '2px 6px',
                borderRadius: 4,
              }}
              title="Dismiss"
              aria-label="Dismiss"
            >
              <OEIcon name="close" size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UrgencySection({
  urgency,
  items,
  onAcknowledge,
  onAction,
  onDismiss,
}: {
  urgency: Urgency;
  items: FeedItem[];
  onAcknowledge: (id: string) => void;
  onAction: (item: FeedItem) => void;
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const palette = urgency === 'urgent' ? C.urgent : urgency === 'caution' ? C.caution : C.info;
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: palette.label,
            fontFamily: '"IBM Plex Mono", monospace',
          }}
        >
          {urgencyLabel(urgency)}
        </span>
        <span
          style={{
            fontSize: 10, fontWeight: 700,
            fontFamily: '"IBM Plex Mono", monospace',
            fontVariantNumeric: 'tabular-nums',
            color: palette.dot,
            background: palette.bg,
            padding: '1px 7px', borderRadius: 12,
          }}
        >
          {items.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            onAcknowledge={onAcknowledge}
            onAction={onAction}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

function ContextPanel({ role, launchData }: { role: string; launchData: LaunchData | null }) {
  const kpis = launchData?.kpis ?? [];
  const projects = launchData?.projects ?? [];

  const roleLabel = ROLES.find((r) => r.key === role)?.label ?? role;

  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 68,
        maxHeight: 'calc(100vh - 88px)',
        overflowY: 'auto',
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: C.textFaint, fontFamily: '"IBM Plex Mono", monospace' }}>
          Context
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 600, color: C.text }}>
          {roleLabel} Portfolio
        </p>
      </div>

      {kpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {kpis.slice(0, 4).map((kpi, i) => (
            <div
              key={i}
              style={{
                background: C.canvas,
                borderRadius: 7,
                padding: '10px 12px',
                border: `1px solid ${C.borderFaint}`,
              }}
            >
              <p style={{ margin: 0, fontSize: 10, color: C.textFaint, fontFamily: '"IBM Plex Mono", monospace', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {kpi.label}
              </p>
              <p
                style={{
                  margin: '4px 0 0', fontSize: 18, fontWeight: 700,
                  color: kpi.status === 'warn' ? C.caution.label : kpi.status === 'bad' ? C.urgent.label : C.text,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1,
                }}
              >
                {kpi.value}{kpi.unit ? <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted }}> {kpi.unit}</span> : null}
              </p>
            </div>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: C.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: '"IBM Plex Mono", monospace' }}>
            Projects
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {projects.slice(0, 5).map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px',
                  background: C.canvas,
                  borderRadius: 6,
                  border: `1px solid ${C.borderFaint}`,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </p>
                  {p.capacity && (
                    <p style={{ margin: '1px 0 0', fontSize: 10, color: C.textFaint, fontFamily: '"IBM Plex Mono", monospace' }}>
                      {p.capacity}
                    </p>
                  )}
                </div>
                {p.progress !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ width: 40, height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${p.progress}%`,
                          background: p.progress < 50 ? C.caution.dot : C.info.dot,
                          borderRadius: 2,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums', color: C.textMuted }}>
                      {p.progress}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {kpis.length === 0 && projects.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: C.textFaint, fontStyle: 'italic' }}>
          No portfolio data loaded.
        </p>
      )}
    </div>
  );
}

// ── Main shell ─────────────────────────────────────────────────────────────

export function ActivityFeedShell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [feedData, setFeedData]       = useState<FeedResponse | null>(null);
  const [launchData, setLaunchData]   = useState<LaunchData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const currentRole = user?.role ?? 'ipp_developer';

  // Load feed + launch data in parallel
  const loadFeed = useCallback(async (cat: Category = activeCategory) => {
    const params = new URLSearchParams({ limit: '100' });
    if (cat !== 'all') params.set('category', cat);
    try {
      const [feedRes, launchRes] = await Promise.allSettled([
        api.get(`/feed?${params}`),
        api.get(`/launch/${currentRole}`),
      ]);
      if (feedRes.status === 'fulfilled') {
        setFeedData(feedRes.value.data?.data ?? null);
      }
      if (launchRes.status === 'fulfilled') {
        setLaunchData(launchRes.value.data?.data ?? null);
      }
    } catch { /* network error — silent */ }
    setLoading(false);
  }, [currentRole, activeCategory]);

  useEffect(() => {
    loadFeed();
    const t = setInterval(() => { loadFeed(); }, 30_000);
    return () => clearInterval(t);
  }, [loadFeed]);

  const handleCategoryChange = (cat: Category) => {
    setActiveCategory(cat);
    setLoading(true);
    loadFeed(cat);
  };

  const handleAcknowledge = async (id: string) => {
    await api.patch(`/feed/${id}/acknowledge`);
    setFeedData((prev) =>
      prev ? {
        ...prev,
        items: prev.items.map((i) => i.id === id ? { ...i, status: 'acknowledged' } : i),
      } : prev
    );
  };

  const handleAction = async (item: FeedItem) => {
    await api.patch(`/feed/${item.id}/action`).catch(() => {});
    if (item.cross_option?.target_route) {
      navigate(item.cross_option.target_route);
    }
  };

  const handleDismiss = async (id: string) => {
    await api.patch(`/feed/${id}/dismiss`);
    setFeedData((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev
    );
  };

  const q = searchQuery.trim().toLowerCase();
  const matchesQ = (i: FeedItem) =>
    !q || i.title.toLowerCase().includes(q) || String(i.body?.detail ?? '').toLowerCase().includes(q);
  const urgentItems  = (feedData?.items.filter((i) => i.urgency === 'urgent')  ?? []).filter(matchesQ);
  const cautionItems = (feedData?.items.filter((i) => i.urgency === 'caution') ?? []).filter(matchesQ);
  const infoItems    = (feedData?.items.filter((i) => i.urgency === 'info')    ?? []).filter(matchesQ);
  const counts       = feedData?.counts;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.canvas,
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        color: C.text,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 48,
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center',
          paddingLeft: 20, paddingRight: 20,
          gap: 12,
        }}
      >
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter feed…"
          style={{
            flex: 1, maxWidth: 480,
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.canvas,
            fontSize: 12,
            color: C.text,
            outline: 'none',
            fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          }}
        />

        {/* Count chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {counts && (
            <>
              {counts.urgent > 0 && (
                <span style={{ fontSize: 11, color: C.urgent.label, fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {counts.urgent} urgent
                </span>
              )}
              {counts.caution > 0 && (
                <span style={{ fontSize: 11, color: C.caution.label, fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                  {counts.caution} caution
                </span>
              )}
              <span style={{ fontSize: 11, color: C.textFaint, fontFamily: '"IBM Plex Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                {counts.total} total
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          maxWidth: 1240,
          margin: '0 auto',
          width: '100%',
          padding: '20px 20px 40px',
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
        }}
      >
        {/* Feed column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Category filter pills */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              flexWrap: 'wrap', marginBottom: 16,
            }}
          >
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => handleCategoryChange(cat.key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 100,
                    border: isActive ? 'none' : `1px solid ${C.border}`,
                    background: isActive ? C.pill.active.bg : C.pill.inactive.bg,
                    color: isActive ? C.pill.active.text : C.pill.inactive.text,
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 120ms cubic-bezier(0.23, 1, 0.32, 1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Feed groups */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  style={{
                    height: 80, borderRadius: 8,
                    background: 'oklch(0.93 0.004 250)',
                    animation: 'pulse 1.6s ease-in-out infinite',
                    opacity: 1 - n * 0.2,
                  }}
                />
              ))}
              <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
            </div>
          ) : (
            <>
              <UrgencySection
                urgency="urgent"
                items={urgentItems}
                onAcknowledge={handleAcknowledge}
                onAction={handleAction}
                onDismiss={handleDismiss}
              />
              <UrgencySection
                urgency="caution"
                items={cautionItems}
                onAcknowledge={handleAcknowledge}
                onAction={handleAction}
                onDismiss={handleDismiss}
              />
              <UrgencySection
                urgency="info"
                items={infoItems}
                onAcknowledge={handleAcknowledge}
                onAction={handleAction}
                onDismiss={handleDismiss}
              />
              {(urgentItems.length + cautionItems.length + infoItems.length) === 0 && (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: '64px 20px',
                    color: C.textFaint, gap: 12,
                  }}
                >
                  <span style={{ color: C.textFaint, display: 'flex' }}>
                    <OEIcon name="check-circle" size={32} />
                  </span>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>All clear</p>
                  <p style={{ margin: 0, fontSize: 12 }}>No pending actions for this filter.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Context panel */}
        <ContextPanel role={currentRole} launchData={launchData} />
      </div>
    </div>
  );
}
