// ════════════════════════════════════════════════════════════════════════
// WorkstationShell — mockup-b two-column fixed-height layout
//
// grid: 1fr 380px, height: calc(100vh - var(--shell-height))
// Left : compact header + pill tab-nav (sticky) + scrollable tab content
// Right: role context panel — KPI 2×2 + panels + IncomingPanel + Insights
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState, ReactNode, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import IncomingPanel from './IncomingPanel';
import InsightsPanel from './InsightsPanel';
import CrossOptionModal from './CrossOptionModal';
import { type RoleAction } from '../../lib/roleActions';
import { ArrowLeft, RefreshCw, Search, HelpCircle, ChevronLeft, ChevronRight, Wand2, Map } from 'lucide-react';
import { api } from '../../lib/api';
// Ease kit — plain-language shared state surfaces (meridian.css classes only).
// Replaces the Skeleton/ErrorBanner/EmptyState early-returns in ListingTable so
// every leaf leans on one shared, on-brand loading/error/empty vocabulary.
import { EaseLoading, EaseError, EaseEmpty } from '../../shared/ease/states';
import { RoleShell, CommandRail, type CommandItem } from '../signature';
import { themeFor, type RoleKey } from '../../lib/role-themes';
import { useDensityPreference } from '../../lib/density';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from '../../lib/motion';
import { CapabilityPalette } from './CapabilityPalette';
import { WizardModal, WizardPicker, type WizardSpec } from './WizardModal';
import { ProductTour, type TourDef } from './ProductTour';
import { useTour } from '../../lib/useTour';

// ─── Design tokens — Substation palette ──────────────────────────────
// Repointed from the old amber/per-role-hue "mockup-b" palette to the Substation
// system (indigo --petrol primary, copper accent, cool neutrals, semantic
// amber/oxide/moss) so the shared surface primitives (Pill, ActionModal, ListingTable)
// match the .mer chrome. Values are literal (not var(--…)) on purpose: these
// components render both inside and outside a .mer ancestor, and .mer's tokens are
// scoped — literals stay correct everywhere. Mirror of meridian.css :root.
// v2 reskin: each literal is now var(--token, #lightFallback) — resolves to the
// dark .v2 token under a .v2 ancestor, falls back to the light hex on public
// pages. Tints use color-mix over the surface token so pills stay subtle on
// dark and light alike (fallback args keep them correct with no .v2 ancestor).
const BG     = 'var(--s0, #f4f6fa)';       // --paper (input/field surface)
const BG1    = 'var(--s1, #ffffff)';       // --raised (modal/card surface)
const BG2    = 'var(--s2, #eef1f7)';       // hover wash (between paper and line)
const BORDER = 'var(--border-subtle, #dde3ee)';                  // --line
const BORDERS= 'var(--border-strong, #c3cdde)';                  // stronger divider
const TX1    = 'var(--ink, #0e1726)';      // --ink
const TX2    = 'var(--ink-2, #3a4760)';    // --ink2
const TX3    = 'var(--ink-2, #5b6b85)';                  // --ink3 (WCAG-AA muted)
const ACC    = 'var(--accent, #1f3bb3)';   // --petrol (primary)
const ACC_BG = 'color-mix(in oklch, var(--accent, #1f3bb3) 15%, var(--s1, #e8ecfb))';   // --petrol-tint
const ACC_BDR= 'color-mix(in oklch, var(--accent, oklch(0.80 0.07 265)) 40%, var(--s1, #ffffff))';     // petrol-tinted border
const GOOD   = 'var(--good, oklch(0.46 0.085 165))';    // --moss-deep (AA text)
const GOOD_BG= 'color-mix(in oklch, var(--good, oklch(0.46 0.085 165)) 15%, var(--s1, #f2fbf6))';   // --moss-tint
const BAD    = 'var(--bad, oklch(0.42 0.17 30))';      // --oxide-deep (AA text)
const BAD_BG = 'color-mix(in oklch, var(--bad, oklch(0.42 0.17 30)) 15%, var(--s1, #fdf2f2))';      // --oxide-tint
const WARN   = 'var(--warn, oklch(0.45 0.12 50))';      // --amber-deep (AA text)
const WARN_BG= 'color-mix(in oklch, var(--warn, oklch(0.45 0.12 50)) 15%, var(--s1, #fdf6ec))';      // --amber-tint
const INFO   = 'var(--info, #18309a)';                  // --petrol-deep
const INFO_BG= 'color-mix(in oklch, var(--info, #18309a) 15%, var(--s1, #e8ecfb))';                  // --petrol-tint
const MONO   = '"IBM Plex Mono","Fira Code",monospace';
const EASE   = 'cubic-bezier(0.23, 1, 0.32, 1)';

// ─── Types ────────────────────────────────────────────────────────────
export type WorkstationTab = {
  key: string;
  label: string;
  group?: string;
  chainKey?: string;
  body: (props: { onRefresh: () => void }) => ReactNode;
};

export type WorkstationKpi = {
  label: string;
  value: string | number;
  caption?: string;
  tone?: 'up' | 'down' | 'warn';
};

export type WorkstationPanel = {
  title: string;
  countLabel?: string;
  rows: { id: string; lead?: ReactNode; text: ReactNode; meta?: ReactNode }[];
  emptyLabel?: string;
};

// Role display metadata
const ROLE_META: Record<string, { label: string; sub: string }> = {
  trader:        { label: 'Trading Desk',     sub: 'Orders · Risk · Settlement' },
  ipp_developer: { label: 'IPP Developer',    sub: 'Projects · Bonds · Milestones' },
  ipp:           { label: 'IPP Developer',    sub: 'Projects · Bonds · Milestones' },
  lender:        { label: 'Lender Portfolio', sub: 'Facilities · Drawdowns · Covenants' },
  offtaker:      { label: 'Offtaker',         sub: 'PPAs · Delivery · Billing' },
  carbon_fund:   { label: 'Carbon Fund',      sub: 'Credits · MRV · ERPA' },
  carbon:        { label: 'Carbon Fund',      sub: 'Credits · MRV · ERPA' },
  grid_operator: { label: 'Grid Operations',  sub: 'Dispatch · Curtailment · Wheeling' },
  grid:          { label: 'Grid Operations',  sub: 'Dispatch · Curtailment · Wheeling' },
  regulator:     { label: 'NERSA Regulator',  sub: 'Cases · Licences · Enforcement' },
  admin:         { label: 'Platform Admin',   sub: 'Users · System · Revenue' },
  support:       { label: 'Support Desk',     sub: 'Tickets · SLA · Escalations' },
  esco:          { label: 'ESCO / O&M',       sub: 'Sites · Alerts · Work Orders' },
  epc:           { label: 'EPC Contractor',   sub: 'Projects · Punch-lists · Handover' },
};

// Tab labels carry trailing "(W123)" build-tracking codes. Strip for display.
export function cleanTabLabel(label: string): string {
  return label.replace(/\s*\(W\d[^)]*\)\s*$/, '').trim() || label;
}

const ROLE_ACCENT_MAP: Record<string, { acc: string; accBg: string; accBdr: string }> = {
  ipp_developer:  { acc: 'oklch(0.46 0.16 55)',  accBg: 'oklch(0.96 0.05 55)',  accBdr: 'oklch(0.80 0.12 55)'  },
  ipp:            { acc: 'oklch(0.46 0.16 55)',  accBg: 'oklch(0.96 0.05 55)',  accBdr: 'oklch(0.80 0.12 55)'  },
  trader:         { acc: 'oklch(0.46 0.16 250)', accBg: 'oklch(0.96 0.04 250)', accBdr: 'oklch(0.80 0.10 250)' },
  lender:         { acc: 'oklch(0.46 0.16 280)', accBg: 'oklch(0.96 0.04 280)', accBdr: 'oklch(0.80 0.10 280)' },
  offtaker:       { acc: 'oklch(0.46 0.14 200)', accBg: 'oklch(0.96 0.04 200)', accBdr: 'oklch(0.80 0.09 200)' },
  carbon_fund:    { acc: 'oklch(0.46 0.16 145)', accBg: 'oklch(0.96 0.04 145)', accBdr: 'oklch(0.80 0.10 145)' },
  carbon:         { acc: 'oklch(0.46 0.16 145)', accBg: 'oklch(0.96 0.04 145)', accBdr: 'oklch(0.80 0.10 145)' },
  grid_operator:  { acc: 'oklch(0.46 0.14 220)', accBg: 'oklch(0.96 0.04 220)', accBdr: 'oklch(0.80 0.09 220)' },
  grid:           { acc: 'oklch(0.46 0.14 220)', accBg: 'oklch(0.96 0.04 220)', accBdr: 'oklch(0.80 0.09 220)' },
  regulator:      { acc: 'oklch(0.40 0.12 5)',   accBg: 'oklch(0.96 0.03 5)',   accBdr: 'oklch(0.80 0.08 5)'   },
  admin:          { acc: 'oklch(0.30 0.015 250)',accBg: 'oklch(0.95 0.004 250)',accBdr: 'oklch(0.78 0.006 250)' },
  support:        { acc: 'oklch(0.46 0.14 100)', accBg: 'oklch(0.96 0.04 100)', accBdr: 'oklch(0.80 0.09 100)' },
  esco:           { acc: 'oklch(0.46 0.14 30)',  accBg: 'oklch(0.96 0.04 30)',  accBdr: 'oklch(0.80 0.09 30)'  },
  epc:            { acc: 'oklch(0.46 0.14 10)',  accBg: 'oklch(0.96 0.04 10)',  accBdr: 'oklch(0.80 0.09 10)'  },
  epc_contractor: { acc: 'oklch(0.46 0.14 10)',  accBg: 'oklch(0.96 0.04 10)',  accBdr: 'oklch(0.80 0.09 10)'  },
};
const FALLBACK_ACCENT = { acc: ACC, accBg: ACC_BG, accBdr: ACC_BDR };

// ─── TabNav ───────────────────────────────────────────────────────────
// Horizontal pill-strip with group filter row and optional search.
function TabNav({
  tabs,
  activeTab,
  onSelect,
  hasGroups,
  allGroups,
  activeGroup,
  setActiveGroup,
  accent,
}: {
  tabs: WorkstationTab[];
  activeTab: string;
  onSelect: (key: string) => void;
  hasGroups: boolean;
  allGroups: string[];
  activeGroup: string | null;
  setActiveGroup: (g: string | null) => void;
  accent?: { acc: string; accBg: string; accBdr: string };
}) {
  const A = accent ?? FALLBACK_ACCENT;
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const showSearch = tabs.length > 8;
  const inputRef = useRef<HTMLInputElement>(null);

  const grouped = hasGroups && activeGroup != null ? tabs.filter(t => t.group === activeGroup) : tabs;
  const visible = query
    ? tabs.filter(t => cleanTabLabel(t.label).toLowerCase().includes(query))
    : grouped;

  const pick = (key: string) => { onSelect(key); if (query) setQ(''); };

  return (
    <div
      className="flex-shrink-0 border-b"
      style={{ background: BG1, borderColor: BORDER }}
    >
      {/* Group filter row */}
      {hasGroups && !query && (
        <div
          className="flex items-center gap-1 px-4 pt-2 pb-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <button
            type="button"
            onClick={() => setActiveGroup(null)}
            className="px-3 h-7 rounded text-[11px] font-semibold whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{
              background: activeGroup === null ? A.accBg : 'transparent',
              color: activeGroup === null ? A.acc : TX3,
              border: `1px solid ${activeGroup === null ? A.accBdr : 'transparent'}`,
            }}
          >
            All
          </button>
          {allGroups.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className="px-3 h-7 rounded text-[11px] font-semibold whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                background: activeGroup === g ? A.accBg : 'transparent',
                color: activeGroup === g ? A.acc : TX3,
                border: `1px solid ${activeGroup === g ? A.accBdr : 'transparent'}`,
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Tab pills + search */}
      <div className="flex items-center gap-0 px-3 py-1.5">
        {showSearch && (
          <div
            className="flex items-center gap-1.5 mr-3 flex-shrink-0 h-8 px-2 rounded"
            style={{ background: BG2, border: `1px solid ${BORDER}` }}
          >
            <Search size={11} style={{ color: TX3, flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setQ('');
                if (e.key === 'Enter' && visible.length > 0) pick(visible[0].key);
              }}
              placeholder={`${tabs.length} tabs…`}
              aria-label="Filter tabs"
              className="w-20 bg-transparent text-[11px] outline-none"
              style={{ color: TX1, fontFamily: MONO }}
            />
          </div>
        )}
        <div
          role="tablist"
          className="flex items-center gap-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {visible.length === 0 ? (
            <span className="text-[11px] italic px-2" style={{ color: TX3 }}>No tabs match.</span>
          ) : visible.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                id={`tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.key}`}
                onClick={() => pick(t.key)}
                className="h-8 px-3 rounded text-[12px] font-semibold whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                style={{
                  background:   isActive ? A.accBg  : 'transparent',
                  color:        isActive ? A.acc     : TX2,
                  border:       `1px solid ${isActive ? A.accBdr : 'transparent'}`,
                  transition:   `background-color 120ms ${EASE}, color 120ms ${EASE}, border-color 120ms ${EASE}`,
                }}
                onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = BG2; (e.currentTarget as HTMLButtonElement).style.color = TX1; } }}
                onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = TX2; } }}
              >
                {cleanTabLabel(t.label)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Context Panel (right 380px) ─────────────────────────────────────
function CtxPanel({
  role,
  title,
  subtitle,
  kpis,
  panels,
  children,
}: {
  role?: string;
  title: string;
  subtitle?: string;
  kpis?: WorkstationKpi[];
  panels?: WorkstationPanel[];
  children?: ReactNode;
}) {
  const meta = role ? (ROLE_META[role] ?? { label: title, sub: subtitle ?? '' }) : { label: title, sub: subtitle ?? '' };
  const toneColor: Record<string, string> = { up: GOOD, down: BAD, warn: WARN };
  const toneBg:    Record<string, string> = { up: GOOD_BG, down: BAD_BG, warn: WARN_BG };

  const kpi4  = (kpis ?? []).slice(0, 4);
  const kpiBar= (kpis ?? []).slice(4, 8);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG1 }}>
      {/* Role header */}
      <div
        className="flex-shrink-0 px-4 py-3 border-b"
        style={{ borderColor: BORDER }}
      >
        <div className="text-[14px] font-bold" style={{ color: TX1 }}>{meta.label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: TX3 }}>{meta.sub}</div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'thin', scrollbarColor: `${BORDERS} transparent` }}>

        {/* KPI 2×2 grid */}
        {kpi4.length > 0 && (
          <>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.10em] mb-2" style={{ color: TX3 }}>
              Key Metrics
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {kpi4.map((k, i) => (
                <div
                  key={i}
                  className="rounded p-2 border"
                  style={{ background: BG2, borderColor: BORDER }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-wide truncate" style={{ color: TX3 }}>{k.label}</div>
                  <div
                    className="mt-1 text-[18px] font-bold leading-none"
                    style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: k.tone ? toneColor[k.tone] : TX1 }}
                  >
                    {k.value}
                  </div>
                  {k.caption && <div className="mt-0.5 text-[9px]" style={{ color: TX3 }}>{k.caption}</div>}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Progress bar rows for kpis 5-8 */}
        {kpiBar.length > 0 && (
          <>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.10em] mb-2" style={{ color: TX3 }}>
              Utilisation
            </div>
            <div className="space-y-2 mb-3">
              {kpiBar.map((k, i) => {
                const numVal = typeof k.value === 'number' ? k.value : parseFloat(String(k.value));
                const pct = isNaN(numVal) ? 0 : Math.min(100, Math.max(0, numVal));
                const barColor = k.tone ? toneColor[k.tone] : ACC;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium" style={{ color: TX2 }}>{k.label}</span>
                      <span className="text-[10px] font-bold" style={{ fontFamily: MONO, color: TX1 }}>{k.value}{typeof k.value === 'number' ? '%' : ''}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: BG2, border: `1px solid ${BORDER}` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: barColor, transition: `width 400ms ${EASE}` }}
                      />
                    </div>
                    {k.caption && <div className="mt-0.5 text-[9px]" style={{ color: TX3 }}>{k.caption}</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Panels (open items) */}
        {panels && panels.length > 0 && panels.map((panel, i) => (
          <div key={i} className="mb-3">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.10em] mb-1.5" style={{ color: TX3 }}>
              {panel.title}{panel.countLabel ? ` (${panel.countLabel})` : ''}
            </div>
            <div className="rounded border overflow-hidden" style={{ borderColor: BORDER }}>
              {panel.rows.length === 0 ? (
                <div className="px-3 py-2 text-[11px] italic" style={{ color: TX3 }}>{panel.emptyLabel || 'Nothing open.'}</div>
              ) : panel.rows.slice(0, 5).map(row => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-b last:border-0 text-[11px]"
                  style={{ borderColor: BORDER, color: TX2 }}
                >
                  {row.lead}
                  <span className="flex-1 truncate">{row.text}</span>
                  {row.meta}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* IncomingPanel + InsightsPanel from children */}
        {children}
      </div>
    </div>
  );
}

// ─── WorkstationShell ─────────────────────────────────────────────────
export function WorkstationShell({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  tabs,
  role,
  commands,
  kpis,
  panels,
  wizards,
  tour,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  tabs: WorkstationTab[];
  role?: RoleKey | string;
  commands?: CommandItem[];
  kpis?: WorkstationKpi[];
  panels?: WorkstationPanel[];
  wizards?: WizardSpec[];
  tour?: TourDef;
}) {
  const resolvedBackHref  = backHref  ?? (role ? `/launch/${role}` : '/feed');
  const resolvedBackLabel = backLabel ?? 'Launchpad';
  const accent = ROLE_ACCENT_MAP[role ?? ''] ?? FALLBACK_ACCENT;

  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // Support deep-links from SubCockpitPage which may pass either the tab's key
  // (kebab-case) or its chainKey (snake_case, e.g. 'poslimit_case'). Try key first,
  // then chainKey fallback, then default to first tab.
  const rawTabParam = params.get('tab') ?? '';
  const resolvedTab = rawTabParam
    ? (tabs.find(t => t.key === rawTabParam)?.key
        ?? tabs.find(t => t.chainKey === rawTabParam)?.key
        ?? tabs[0]?.key)
    : tabs[0]?.key;
  const initialTab = resolvedTab ?? '';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [bump, setBump] = useState(0);

  const [active, setActive] = useState<RoleAction | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wizardPickerOpen, setWizardPickerOpen] = useState(false);
  const [activeWizard, setActiveWizard] = useState<WizardSpec | null>(null);

  const { active: tourActive, stepIndex: tourStep, setStepIndex: setTourStep, start: startTour, startForced: startTourForced, finish: finishTour } = useTour(tour?.id ?? '');

  useEffect(() => {
    if (tour) {
      const forceParam = new URLSearchParams(window.location.search).get('__tour');
      if (forceParam) { startTourForced(); } else { startTour(); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id]);

  const setTab = (k: string) => {
    setActiveTab(k);
    const next = new URLSearchParams(params);
    next.set('tab', k);
    setParams(next, { replace: true });
  };

  const refresh = () => setBump(n => n + 1);
  const current = tabs.find(t => t.key === activeTab) || tabs[0];

  const hasGroups = tabs.some(t => t.group);
  const allGroups: string[] = hasGroups
    ? Array.from(new Set(tabs.map(t => t.group).filter(Boolean) as string[]))
    : [];
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!hasGroups) return;
    const g = tabs.find(t => t.key === activeTab)?.group || null;
    setActiveGroup(g);
  }, [activeTab, hasGroups, tabs]);

  const roleTheme = themeFor(role ?? 'trader');
  const densityState = useDensityPreference(roleTheme);

  const activeChainKey = current?.chainKey;

  const rightChildren = (
    <>
      <IncomingPanel onAct={setActive} />
      {activeChainKey && (
        <InsightsPanel
          key={activeChainKey}
          chainKey={activeChainKey}
          label={current?.label}
        />
      )}
    </>
  );

  const crossOption = (
    <CrossOptionModal
      action={active}
      onClose={() => setActive(null)}
      onActioned={() => { setActive(null); refresh(); }}
    />
  );

  // ── Two-column grid layout ─────────────────────────────────────────
  const pageGrid = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        height: 'calc(100vh - var(--shell-height, 50px))',
        overflow: 'hidden',
        background: BG,
      }}
    >
      {/* ── LEFT: header + tab nav + content ── */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ borderRight: `1px solid ${BORDER}` }}
      >
        {/* Header strip */}
        <div
          data-tour="ws-header"
          className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b"
          style={{ background: BG1, borderColor: BORDER, minHeight: 52 }}
        >
          <div className="min-w-0">
            <div
              className="text-[10px] uppercase tracking-[0.10em] font-bold"
              style={{ fontFamily: MONO, color: TX3 }}
            >
              {eyebrow}
            </div>
            <h1
              className="text-[18px] font-bold leading-tight mt-0.5 truncate"
              style={{ color: TX1, letterSpacing: '-0.01em' }}
            >
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
            {resolvedBackHref && (
              <button
                type="button"
                onClick={() => navigate(resolvedBackHref!)}
                className="h-8 px-3 rounded text-[11px] font-semibold inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: TX2 }}
                onMouseEnter={e => (e.currentTarget.style.background = BG2)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ArrowLeft size={11} /> {resolvedBackLabel}
              </button>
            )}
            <button
              type="button"
              onClick={refresh}
              className="h-8 px-3 rounded text-[11px] font-semibold inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2"
              style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: TX2 }}
              onMouseEnter={e => (e.currentTarget.style.background = BG2)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <RefreshCw size={11} /> Refresh
            </button>
            {wizards && wizards.length > 0 && (
              <button
                type="button"
                data-tour="quick-start"
                onClick={() => setWizardPickerOpen(true)}
                className="h-8 px-3 rounded text-[11px] font-bold inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2"
                style={{ background: accent.acc, color: '#fff', border: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = accent.acc)}
                onMouseLeave={e => (e.currentTarget.style.background = accent.acc)}
              >
                <Wand2 size={11} /> Quick start
              </button>
            )}
            {tour && (
              <button
                type="button"
                onClick={startTourForced}
                className="h-8 px-3 rounded text-[11px] font-semibold inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: TX2 }}
                onMouseEnter={e => (e.currentTarget.style.background = BG2)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Map size={11} /> Tour
              </button>
            )}
            {role && (
              <button
                type="button"
                data-tour="capability-palette"
                onClick={() => setPaletteOpen(true)}
                className="h-8 px-3 rounded text-[11px] font-semibold inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: TX2 }}
                onMouseEnter={e => (e.currentTarget.style.background = BG2)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <HelpCircle size={11} /> Help
              </button>
            )}
          </div>
        </div>

        {/* KPI strip (if kpis provided) */}
        {kpis && kpis.length > 0 && (
          <div
            data-tour="kpi-row"
            className="flex-shrink-0 flex items-center gap-3 px-5 py-2 border-b overflow-x-auto"
            style={{ background: BG2, borderColor: BORDER, scrollbarWidth: 'none' }}
          >
            {kpis.slice(0, 8).map((k, i) => {
              const toneColor: Record<string, string> = { up: GOOD, down: BAD, warn: WARN };
              return (
                <div key={i} className="flex-shrink-0 min-w-[90px]">
                  <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color: TX3, fontFamily: MONO }}>{k.label}</div>
                  <div
                    className="mt-0.5 text-[16px] font-bold leading-none"
                    style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: k.tone ? toneColor[k.tone] : TX1 }}
                  >
                    {k.value}
                  </div>
                  {k.caption && <div className="text-[9px] mt-0.5" style={{ color: TX3 }}>{k.caption}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Tab nav */}
        <div data-tour="tab-nav">
          <TabNav
            tabs={tabs}
            activeTab={activeTab}
            onSelect={setTab}
            hasGroups={hasGroups}
            allGroups={allGroups}
            activeGroup={activeGroup}
            setActiveGroup={setActiveGroup}
            accent={accent}
          />
        </div>

        {/* Scrollable tab content */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ background: BG, scrollbarWidth: 'thin', scrollbarColor: `${BORDERS} transparent` }}
        >
          <div
            key={`${activeTab}-${bump}`}
            id={current ? `panel-${current.key}` : undefined}
            role="tabpanel"
            aria-labelledby={current ? `tab-${current.key}` : undefined}
            className="px-5 py-4"
          >
            {!current ? (
              <div className="flex items-center justify-center py-20 text-[13px]" style={{ color: TX3 }}>
                Select a tab to get started.
              </div>
            ) : current.body({ onRefresh: refresh })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: context panel ── */}
      <CtxPanel
        role={role}
        title={title}
        subtitle={subtitle}
        kpis={kpis}
        panels={panels}
      >
        {rightChildren}
      </CtxPanel>
    </div>
  );

  // ── Modals / overlays ─────────────────────────────────────────────
  const modals = (
    <>
      {crossOption}
      {role && (
        <CapabilityPalette
          role={role}
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {wizards && wizards.length > 0 && wizardPickerOpen && (
        <WizardPicker
          wizards={wizards}
          onSelect={w => { setWizardPickerOpen(false); setActiveWizard(w); }}
          onClose={() => setWizardPickerOpen(false)}
        />
      )}
      {activeWizard && (
        <WizardModal
          spec={activeWizard}
          onClose={() => setActiveWizard(null)}
        />
      )}
      {tour && tourActive && (
        <ProductTour
          def={tour}
          stepIndex={tourStep}
          onNext={() => {
            if (tourStep < tour.steps.length - 1) { setTourStep(tourStep + 1); }
            else { finishTour(); }
          }}
          onPrev={() => { if (tourStep > 0) setTourStep(tourStep - 1); }}
          onClose={finishTour}
        />
      )}
    </>
  );

  if (role) {
    return (
      <RoleShell role={role} density={densityState.density} chrome="light">
        {commands && commands.length > 0 ? <CommandRail items={commands} /> : null}
        {pageGrid}
        {modals}
      </RoleShell>
    );
  }

  return (
    <>
      {pageGrid}
      {modals}
    </>
  );
}

// ─── Generic listing table for a server endpoint ─────────────────────
export type Column = {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  align?: 'left' | 'right';
};

export function ListingTable({
  endpoint,
  columns,
  empty,
  rowKey,
  rowHref,
  rowOnClick,
  pageSize = 25,
  viz,
}: {
  endpoint: string;
  columns: Column[];
  empty?: { title: string; description: string };
  rowKey: (row: any) => string;
  rowHref?: (row: any) => string;
  rowOnClick?: (row: any) => void;
  pageSize?: number;
  // optional dataviz rendered ABOVE the table from the already-fetched rows (no extra fetch)
  viz?: (rows: any[]) => ReactNode;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await api.get(endpoint);
      const raw = res.data?.data;
      // Chain-style endpoints nest the list under a named key alongside aggregates
      // ({ data: { items|allocations: [...], ...counts } }); unwrap it to the rows array.
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const arr = Array.isArray(raw.items) ? raw.items
          : Array.isArray(raw.allocations) ? raw.allocations : [];
        setRows(arr as any[]);
      } else {
        setRows(Array.isArray(raw) ? raw : []);
      }
      setPage(0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <EaseLoading kpis rows={5} />;
  if (err) return <EaseError message={err} onRetry={() => void load()} />;
  if (rows.length === 0) {
    // EaseEmpty renders a single line; fold title + description together so the
    // operator still gets the "how to populate it" hint the old EmptyState carried.
    const msg = empty?.description
      ? `${empty?.title || 'No data'} — ${empty.description}`
      : (empty?.title || 'No data');
    return <EaseEmpty message={msg} />;
  }

  const totalPages = Math.ceil(rows.length / pageSize);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-2">
      {viz ? viz(rows) : null}
      <div
        className="rounded border overflow-x-auto"
        style={{ background: BG1, borderColor: BORDER }}
      >
        <table className="w-full text-[12px] min-w-[640px]">
          <thead style={{ background: BG2 }}>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: TX3, fontFamily: MONO, borderBottom: `1px solid ${BORDER}` }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => {
              const href = rowHref ? rowHref(r) : null;
              const clickHandler = (e: React.MouseEvent) => {
                if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
                if (href) nav(href);
                else if (rowOnClick) rowOnClick(r);
              };
              const clickable = !!(href || rowOnClick);
              return (
                <tr
                  key={rowKey(r)}
                  onClick={clickHandler}
                  onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickHandler(e as unknown as React.MouseEvent); } } : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  className={`border-t ${clickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset' : ''}`}
                  style={{ borderColor: BORDER }}
                  onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLTableRowElement).style.background = BG2; }}
                  onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : ''}`}
                      style={{ color: TX1 }}
                    >
                      {col.render ? col.render(r) : (r[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1" style={{ color: TX3, fontSize: 11 }}>
          <span style={{ fontFamily: MONO }}>{rows.length} records · page {page + 1}/{totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-accent/50"
              style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
              aria-label="Previous page"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oe-accent/50"
              style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}
              aria-label="Next page"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Pill = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'info'; children: ReactNode }) => {
  const styles: Record<string, { bg: string; color: string }> = {
    good:    { bg: GOOD_BG, color: GOOD },
    warn:    { bg: WARN_BG, color: WARN },
    bad:     { bg: BAD_BG,  color: BAD  },
    neutral: { bg: BG2,     color: TX2  },
    info:    { bg: INFO_BG, color: INFO },
  };
  const s = styles[tone] ?? styles.neutral;
  // Status values arrive as raw snake_case (e.g. "in_om"); tidy underscores so no
  // call site has to remember to. Non-string children (numbers, JSX) pass through.
  const tidy = typeof children === 'string' ? children.replace(/_/g, ' ') : children;
  return (
    <span
      className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color }}
    >
      {tidy}
    </span>
  );
};

// ─── Generic form modal for workflow transitions ────────────────────
export type FieldSpec = {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'lookup';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  helperText?: string;
  lookupEndpoint?: string;
  lookupAutoFill?: Record<string, string>;
};

export function ActionModal({
  title,
  fields,
  submitLabel = 'Submit',
  onClose,
  onSubmit,
  cta = 'primary',
}: {
  title: string;
  fields: FieldSpec[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  cta?: 'primary' | 'danger';
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.defaultValue || '';
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  type LookupOption = { value: string; label: string; [k: string]: unknown };
  const [lookupOpts, setLookupOpts] = useState<Record<string, LookupOption[]>>({});
  const [lookupLoading, setLookupLoading] = useState(false);

  useEffect(() => {
    const lookupFields = fields.filter(f => f.type === 'lookup' && f.lookupEndpoint);
    if (!lookupFields.length) return;
    setLookupLoading(true);
    const token = localStorage.getItem('token') || '';
    Promise.all(
      lookupFields.map(f =>
        fetch(f.lookupEndpoint!, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json() as Promise<{ data: LookupOption[] }>)
          .then(d => ({ key: f.key, opts: Array.isArray(d.data) ? d.data : [] }))
          .catch(() => ({ key: f.key, opts: [] as LookupOption[] }))
      )
    ).then(results => {
      const map: Record<string, LookupOption[]> = {};
      results.forEach(({ key, opts }) => { map[key] = opts; });
      setLookupOpts(map);
      setLookupLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (k: string, v: string) => {
    setValues(prev => {
      const next = { ...prev, [k]: v };
      const field = fields.find(f => f.key === k);
      if (field?.type === 'lookup' && field.lookupAutoFill && v) {
        const selected = (lookupOpts[k] || []).find(o => o.value === v);
        if (selected) {
          Object.entries(field.lookupAutoFill).forEach(([targetKey, sourceKey]) => {
            next[targetKey] = String(selected[sourceKey] ?? '');
          });
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return () => {};
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const els = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(el => !el.hasAttribute('disabled'));
    els()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const list = els();
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]) {
        setErr(`${f.label} is required.`); return;
      }
    }
    setSaving(true); setErr(null);
    try {
      await onSubmit(values);
      setSaved(true);
      setTimeout(() => onClose(), 600);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Failed'); setSaving(false); }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={motionTransition('snap')}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
        style={{ background: 'oklch(0.17 0.010 250 / 0.6)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={motionTransition('snap')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-modal-title"
          ref={dialogRef}
          className="rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
          style={{ background: BG1 }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="p-5 border-b flex items-center justify-between"
            style={{ borderColor: BORDER }}
          >
            <h3
              id="action-modal-title"
              className="text-[15px] font-bold"
              style={{ color: TX1 }}
            >
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
              style={{ color: TX3 }}
              onMouseEnter={e => (e.currentTarget.style.background = BG2)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              ×
            </button>
          </div>
          <div className="p-5 space-y-3">
            {cta === 'danger' && (
              <div
                role="alert"
                className="flex gap-2 items-start px-3 py-2.5 rounded border text-[12px]"
                style={{ background: BAD_BG, borderColor: BAD, color: BAD }}
              >
                <span className="shrink-0 mt-0.5" aria-hidden="true">⚠</span>
                <span>This action is irreversible. Review carefully before confirming.</span>
              </div>
            )}
            <div role="alert" aria-live="assertive" className="text-[12px] min-h-[1em]" style={{ color: BAD }}>
              {err ?? ''}
            </div>
            {fields.map(f => (
              <label key={f.key} className="block text-[13px]">
                <span style={{ color: TX2 }}>{cleanTabLabel(f.label)}{f.required && ' *'}</span>
                {f.type === 'textarea' ? (
                  <textarea
                    value={values[f.key]}
                    onChange={e => update(f.key, e.target.value)}
                    rows={4}
                    placeholder={f.placeholder}
                    className="mt-1 w-full px-3 py-2 rounded resize-none focus-visible:outline-none focus-visible:ring-2"
                    style={{ border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 13 }}
                  />
                ) : f.type === 'select' || f.type === 'lookup' ? (
                  <select
                    value={values[f.key]}
                    onChange={e => update(f.key, e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded focus-visible:outline-none focus-visible:ring-2"
                    style={{ border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 13 }}
                  >
                    <option value="">{f.type === 'lookup' && lookupLoading ? 'Loading…' : '— select —'}</option>
                    {(f.type === 'lookup'
                      ? (lookupOpts[f.key] || [])
                      : (f.options || [])
                    ).map(o => <option key={String(o.value)} value={String(o.value)}>{String(o.label)}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={values[f.key]}
                    onChange={e => update(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="mt-1 w-full px-3 py-2 rounded focus-visible:outline-none focus-visible:ring-2"
                    style={{ border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 13 }}
                  />
                )}
                {f.helperText && <span className="block mt-1 text-[10px]" style={{ color: TX3 }}>{f.helperText}</span>}
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2"
                style={{ border: `1px solid ${BORDER}`, background: 'transparent', color: TX2 }}
                onMouseEnter={e => (e.currentTarget.style.background = BG2)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || saved}
                className="px-4 py-2 rounded text-[13px] font-bold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
                style={{
                  background: saved ? GOOD : cta === 'danger' ? BAD : ACC,
                  color: '#fff',
                  border: 'none',
                  transition: `background-color 150ms ${EASE}`,
                }}
                onMouseEnter={e => { if (!saving && !saved) (e.currentTarget.style.background = cta === 'danger' ? 'oklch(0.36 0.17 30)' : '#18309a'); }}
                onMouseLeave={e => { if (!saving && !saved) (e.currentTarget.style.background = saved ? GOOD : cta === 'danger' ? BAD : ACC); }}
              >
                {saved ? '✓ Done' : saving ? 'Saving…' : submitLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
