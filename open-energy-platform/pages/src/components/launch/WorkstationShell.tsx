// ════════════════════════════════════════════════════════════════════════
// WorkstationShell — shared primitive for each role's L4 workstation page
//
// Single-file pattern reused by Carbon / Grid / Regulator / Admin / Support
// workstations. Each role wraps the shell with its own list of tabs.
// Tab body either is custom JSX (when the workflow needs file/transition
// actions) or a generic listing table over a server endpoint.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import IncomingPanel from './IncomingPanel';
import InsightsPanel from './InsightsPanel';
import CrossOptionModal from './CrossOptionModal';
import { type RoleAction } from '../../lib/roleActions';
import { ArrowLeft, RefreshCw, Search, HelpCircle, ChevronLeft, ChevronRight, Wand2, Map } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { RoleShell, CommandRail, DensityToggle, type CommandItem } from '../signature';
import { themeFor, type RoleKey } from '../../lib/role-themes';
import { useDensityPreference } from '../../lib/density';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from '../../lib/motion';
import { CapabilityPalette } from './CapabilityPalette';
import { WizardModal, WizardPicker, type WizardSpec } from './WizardModal';
import { ProductTour, type TourDef } from './ProductTour';
import { useTour } from '../../lib/useTour';

export type WorkstationTab = {
  key: string;
  label: string;
  group?: string;
  /** Layer-D chain_key — when set, this tab shows a per-chain InsightsPanel rail. */
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

// Tab labels carry a trailing build-tracking code by team convention
// (e.g. "FSCA conduct reports (W216)"). That code is engineering bookkeeping
// with no meaning to the operator at the desk. Strip it at render time so the
// convention can stay in source while the workstation stays in the operator's
// language. Only a trailing "(W<digit>…)" is removed — "(VaR)", "(WACC)" etc.
// are left intact.
function cleanTabLabel(label: string): string {
  return label.replace(/\s*\(W\d[^)]*\)\s*$/, '').trim() || label;
}

// Shared tab navigation. Extracted from the two render branches below so the
// group filter, the quick-jump search, and label cleaning live in one place.
// A workstation can accumulate dozens of tabs; once it passes the recognition
// threshold a search box lets the operator jump straight to a tab by name
// across every group instead of scanning four rows of pills.
function TabNav({
  tabs,
  activeTab,
  onSelect,
  hasGroups,
  allGroups,
  activeGroup,
  setActiveGroup,
}: {
  tabs: WorkstationTab[];
  activeTab: string;
  onSelect: (key: string) => void;
  hasGroups: boolean;
  allGroups: string[];
  activeGroup: string | null;
  setActiveGroup: (g: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const showSearch = tabs.length > 8;

  // While searching, span every group so the operator finds the tab wherever
  // it lives; otherwise honour the active group filter.
  const grouped = hasGroups && activeGroup != null ? tabs.filter(t => t.group === activeGroup) : tabs;
  const visible = query
    ? tabs.filter(t => cleanTabLabel(t.label).toLowerCase().includes(query))
    : grouped;

  const pick = (key: string) => { onSelect(key); if (query) setQ(''); };

  return (
    <nav className="bg-white border border-[var(--oe-surface-container-high)] rounded-lg p-1.5 w-full">
      {showSearch && (
        <div className="flex items-center gap-2 px-1.5 pb-2 mb-2 border-b border-[var(--oe-surface-container-low)]">
          <Search size={13} className="text-[#9aa6b5] shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setQ('');
              if (e.key === 'Enter' && visible.length > 0) pick(visible[0].key);
            }}
            placeholder={`Jump to any of ${tabs.length} tabs…`}
            aria-label="Filter workstation tabs"
            className="flex-1 h-7 bg-transparent text-[12px] text-[var(--oe-on-surface)] placeholder:text-[#9aa6b5] rounded px-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--oe-primary)]"
          />
          {q && (
            <button type="button"
              onClick={() => setQ('')}
              aria-label="Clear tab filter"
              className="text-[11px] font-medium text-[var(--oe-outline)] hover:text-[var(--oe-on-surface)] shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:rounded"
            >
              clear
            </button>
          )}
        </div>
      )}
      {hasGroups && !query && (
        <div className="flex flex-wrap items-center gap-1 pb-2 border-b border-[var(--oe-surface-container-low)] mb-2">
          <button type="button"
            onClick={() => setActiveGroup(null)}
            className={`h-7 px-2 rounded text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              activeGroup === null ? 'bg-[var(--oe-primary)] text-white focus-visible:ring-white/80' : 'text-[var(--oe-outline)] hover:bg-gray-50 focus-visible:ring-[var(--oe-primary)]'
            }`}
          >
            All
          </button>
          {allGroups.map(g => (
            <button type="button"
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`h-7 px-2 rounded text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                activeGroup === g ? 'bg-[var(--oe-primary)] text-white focus-visible:ring-white/80' : 'text-[var(--oe-outline)] hover:bg-gray-50 focus-visible:ring-[var(--oe-primary)]'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <div role="tablist" className="flex flex-wrap items-center gap-1">
        {visible.length === 0 ? (
          <span className="px-2 py-1.5 text-[12px] text-[var(--oe-outline)] italic">No tabs match “{q}”.</span>
        ) : (
          visible.map(t => {
            const isActive = activeTab === t.key;
            return (
              <button type="button"
                key={t.key}
                id={`tab-${t.key}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.key}`}
                onClick={() => pick(t.key)}
                className={`h-9 px-3 rounded-md text-[13px] font-semibold inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  isActive ? 'bg-[var(--oe-primary)] text-white focus-visible:ring-white/80' : 'text-[var(--oe-on-surface-variant)] hover:bg-[var(--oe-surface-container-low)] focus-visible:ring-[var(--oe-primary)]'
                }`}
              >
                {cleanTabLabel(t.label)}
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}

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
  /** Role key from role-themes. When provided, the workstation is wrapped in
   *  RoleShell at the role's workstationDensity (bloomberg for ops, cinematic
   *  for others) and chrome adopts signature tokens. */
  role?: RoleKey | string;
  /** Optional hotkey-driven command rail. Only rendered when role is given. */
  commands?: CommandItem[];
  /** Top KPI row, Esums-detail style. Renders above the tabs on every tab. */
  kpis?: WorkstationKpi[];
  /** Optional summary panels (open items, exceptions). Render above tabs. */
  panels?: WorkstationPanel[];
  /** Guided multi-step wizards surfaced via the "Quick start" header button. */
  wizards?: WizardSpec[];
  /** Product tour shown on first visit to this workstation. */
  tour?: TourDef;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = params.get('tab') || tabs[0]?.key;
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [bump, setBump] = useState(0);

  // Layer-C cross-role inbox: the action the operator chose to act on (drives CrossOptionModal).
  const [active, setActive] = useState<RoleAction | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wizardPickerOpen, setWizardPickerOpen] = useState(false);
  const [activeWizard, setActiveWizard] = useState<WizardSpec | null>(null);

  // Product tour
  const { active: tourActive, stepIndex: tourStep, setStepIndex: setTourStep, start: startTour, startForced: startTourForced, finish: finishTour } = useTour(tour?.id ?? '');

  // Auto-trigger tour on first visit
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

  // Group-aware tab navigation
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

  // KPI tone helpers
  const toneArrow: Record<string, string> = { up: '↑', down: '↓', warn: '⚠' };
  const toneColor: Record<string, string> = { up: '#22c55e', down: '#ef4444', warn: '#f59e0b' };

  // Density preference hook MUST be called unconditionally; for non-role
  // workstations we just don't read it. We pass the fallback 'trader' theme
  // in that case — it's discarded.
  const roleTheme = themeFor(role ?? 'trader');
  const densityState = useDensityPreference(roleTheme);

  const incomingRail = (
    <IncomingPanel className="hidden xl:block xl:w-80 shrink-0" onAct={setActive} />
  );

  // Layer-D per-feature insight rail — only when the active tab is chain-backed.
  // `current` (the active tab) is resolved above; remount on chainKey change so
  // the panel re-fetches cleanly for the newly selected chain.
  const activeChainKey = current?.chainKey;
  const insightsRail = activeChainKey ? (
    <InsightsPanel
      key={activeChainKey}
      chainKey={activeChainKey}
      label={current?.label}
      className="hidden xl:block xl:w-80 shrink-0"
    />
  ) : null;

  // Layer-C cross-role next-step sheet (self-guards to null when there's nothing to suggest).
  const crossOption = (
    <CrossOptionModal
      action={active}
      onClose={() => setActive(null)}
      onActioned={() => { setActive(null); refresh(); }}
    />
  );

  if (role) {
    const effectiveDensity = densityState.density;
    return (
      <RoleShell role={role} density={effectiveDensity} chrome="light">
        {commands && commands.length > 0 ? <CommandRail items={commands} /> : null}
        <div className="p-6 lg:p-10 space-y-5 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
          <section
            data-tour="ws-header"
            className="rounded-xl text-white p-5 shadow-md"
            style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a3a5c 60%, #0b1c30 100%)' }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-white/70">{eyebrow}</div>
                <h1
                  className="font-display font-bold tracking-tight mt-1"
                  style={{
                    fontFamily: 'var(--oe-display-font)',
                    fontSize: 24,
                    letterSpacing: '-0.02em',
                    color: '#ffffff',
                  }}
                >
                  {title}
                </h1>
                <p className="text-[12px] text-white/70 mt-1 max-w-2xl">{subtitle}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {densityState.canToggle ? (
                  <DensityToggle
                    density={densityState.density}
                    onChange={densityState.setDensity}
                  />
                ) : null}
                {backHref && (
                  <button type="button"
                    onClick={() => navigate(backHref)}
                    className="h-8 px-3 rounded border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  >
                    <ArrowLeft size={12} /> {backLabel || 'Back'}
                  </button>
                )}
                <button type="button"
                  onClick={refresh}
                  className="h-8 px-3 rounded border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  <RefreshCw size={12} /> Refresh
                </button>
                {wizards && wizards.length > 0 && (
                  <button type="button"
                    data-tour="quick-start"
                    onClick={() => setWizardPickerOpen(true)}
                    className="h-8 px-3 rounded border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label="Open guided wizards"
                  >
                    <Wand2 size={12} /> Quick start
                  </button>
                )}
                {tour && (
                  <button type="button"
                    onClick={startTourForced}
                    className="h-8 px-3 rounded border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label="Take the workstation tour"
                  >
                    <Map size={12} /> Tour
                  </button>
                )}
                {role && (
                  <button type="button"
                    data-tour="capability-palette"
                    onClick={() => setPaletteOpen(true)}
                    className="h-8 px-3 rounded border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    aria-label="What can I do here"
                  >
                    <HelpCircle size={12} /> What can I do?
                  </button>
                )}
              </div>
            </div>
            {kpis && kpis.length > 0 && (
              <div data-tour="kpi-row" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
                {kpis.map((k, i) => (
                  <div key={i} className="rounded-lg bg-white/15 p-3 border border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-white/75">{k.label}</div>
                    <div
                      className="mt-1 font-mono text-[20px] font-bold leading-tight"
                      style={{ fontVariantNumeric: 'tabular-nums', color: '#ffffff' }}
                    >
                      {k.value}
                      {k.tone && (
                        <span style={{ fontSize: 13, marginLeft: 4, color: toneColor[k.tone] }}>
                          {toneArrow[k.tone]}
                        </span>
                      )}
                    </div>
                    {k.caption && <div className="text-[10px] text-white/60 mt-0.5">{k.caption}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {panels && panels.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {panels.map((panel, i) => (
                <section key={i} className="rounded-xl border border-[var(--oe-surface-container-high)] bg-white">
                  <header className="px-4 py-2.5 border-b border-[var(--oe-surface-container-low)]">
                    <div className="font-display font-semibold text-[14px] text-[var(--oe-on-surface)]">
                      {panel.title}{panel.countLabel ? ` (${panel.countLabel})` : ''}
                    </div>
                  </header>
                  <ul className="divide-y divide-[var(--oe-surface-container-low)] text-[12px]">
                    {panel.rows.length === 0 ? (
                      <li className="px-4 py-3 text-[12px] text-[var(--oe-outline)] italic">{panel.emptyLabel || 'Nothing open.'}</li>
                    ) : panel.rows.slice(0, 6).map((row) => (
                      <li key={row.id} className="px-4 py-2 flex items-center gap-3 text-[var(--oe-on-surface)]">
                        {row.lead}
                        <span className="flex-1 truncate">{row.text}</span>
                        {row.meta}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="flex gap-5 items-start">
            <div className="min-w-0 flex-1 space-y-5">
              <div data-tour="tab-nav">
                <TabNav
                  tabs={tabs}
                  activeTab={activeTab}
                  onSelect={setTab}
                  hasGroups={hasGroups}
                  allGroups={allGroups}
                  activeGroup={activeGroup}
                  setActiveGroup={setActiveGroup}
                />
              </div>

              <div
                key={`${activeTab}-${bump}`}
                id={current ? `panel-${current.key}` : undefined}
                role="tabpanel"
                aria-labelledby={current ? `tab-${current.key}` : undefined}
              >
                {!current ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[13px] text-[var(--oe-outline)]">
                    <p>Select a tab to get started.</p>
                  </div>
                ) : current.body({ onRefresh: refresh })}
              </div>
            </div>
            <div data-tour="incoming-panel" className="hidden xl:flex xl:flex-col gap-5 shrink-0">
              {incomingRail}
              {insightsRail}
            </div>
          </div>
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
        </div>
      </RoleShell>
    );
  }

  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <section
        className="rounded-xl text-white p-5 shadow-md"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a3a5c 60%, #0b1c30 100%)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-white/70">{eyebrow}</div>
            <h1 className="mt-1 font-display text-[24px] font-bold tracking-tight" style={{ color: '#ffffff' }}>{title}</h1>
            <p className="text-[12px] text-white/70 mt-1 max-w-2xl">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {backHref && (
              <button type="button" onClick={() => navigate(backHref)} className="h-9 px-3 rounded-md border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
                <ArrowLeft size={12} /> {backLabel || 'Back'}
              </button>
            )}
            <button type="button" onClick={refresh} className="h-9 px-3 rounded-md border border-white/20 bg-white/10 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>
        {kpis && kpis.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
            {kpis.map((k, i) => (
              <div key={i} className="rounded-lg bg-white/15 p-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-white/75">{k.label}</div>
                <div className="mt-1 font-mono text-[20px] font-bold leading-tight" style={{ fontVariantNumeric: 'tabular-nums', color: '#ffffff' }}>
                  {k.value}
                  {k.tone && (
                    <span style={{ fontSize: 13, marginLeft: 4, color: toneColor[k.tone] }}>
                      {toneArrow[k.tone]}
                    </span>
                  )}
                </div>
                {k.caption && <div className="text-[10px] text-white/60 mt-0.5">{k.caption}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex gap-5 items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <TabNav
            tabs={tabs}
            activeTab={activeTab}
            onSelect={setTab}
            hasGroups={hasGroups}
            allGroups={allGroups}
            activeGroup={activeGroup}
            setActiveGroup={setActiveGroup}
          />

          <div
            key={`${activeTab}-${bump}`}
            id={current ? `panel-${current.key}` : undefined}
            role="tabpanel"
            aria-labelledby={current ? `tab-${current.key}` : undefined}
          >
            {!current ? (
              <div className="flex flex-col items-center justify-center py-16 text-[13px] text-[var(--oe-outline)]">
                <p>Select a tab to get started.</p>
              </div>
            ) : current.body({ onRefresh: refresh })}
          </div>
        </div>
        <div className="hidden xl:flex xl:flex-col gap-5 shrink-0">
          {incomingRail}
          {insightsRail}
        </div>
      </div>
      {crossOption}
    </div>
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
}: {
  endpoint: string;
  columns: Column[];
  empty?: { title: string; description: string };
  rowKey: (row: any) => string;
  rowHref?: (row: any) => string;
  /** Alternative to rowHref: fire a callback (e.g. open a modal). The
   *  click handler still ignores clicks on buttons/inputs inside the row. */
  rowOnClick?: (row: any) => void;
  pageSize?: number;
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
      // Some endpoints return { allocations, unallocated } shape — flatten
      // to a single array for rendering when that pattern is detected.
      const raw = res.data?.data;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.allocations)) {
        setRows(raw.allocations as any[]);
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

  if (loading) return <Skeleton variant="card" rows={4} />;
  if (err) return <ErrorBanner message={err} onRetry={() => void load()} />;
  if (rows.length === 0) {
    return <EmptyState title={empty?.title || 'No data'} description={empty?.description || ''} />;
  }

  const totalPages = Math.ceil(rows.length / pageSize);
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-[var(--oe-surface-container-high)] bg-white overflow-x-auto text-[var(--oe-on-surface)]">
        <table className="w-full text-[13px] min-w-[640px]">
          <thead className="bg-[var(--oe-surface-container-lowest)] text-left text-[10px] uppercase tracking-wide text-[var(--oe-outline)]">
            <tr>{columns.map(col => <th key={col.key} scope="col" className="px-4 py-2">{col.label}</th>)}</tr>
          </thead>
          <tbody>
            {pageRows.map(r => {
              const href = rowHref ? rowHref(r) : null;
              const clickHandler = (e: React.MouseEvent) => {
                // Only navigate when the click was on the row chrome — let
                // buttons / links inside the row keep their own handlers.
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
                  className={`border-t border-[var(--oe-surface-container)] hover:bg-[var(--oe-surface-container-lowest)] ${clickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oe-primary)]' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className={`px-4 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
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
        <div className="flex items-center justify-between px-1 text-[12px] text-[var(--oe-outline)]">
          <span>{rows.length} records · page {page + 1} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-[var(--oe-surface-container-lowest)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 rounded hover:bg-[var(--oe-surface-container-lowest)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Pill = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'info'; children: ReactNode }) => {
  const bg: Record<string, string> = {
    good: 'bg-green-100 text-green-700',
    warn: 'bg-amber-100 text-amber-800',
    bad: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${bg[tone]}`}>{children}</span>;
};

// ─── Generic form modal for workflow transitions ────────────────────
//
// Every workstation needs to POST to a transition / create endpoint
// with a small handful of fields. Rather than building a bespoke modal
// per action, this generic component accepts a field schema and a
// submit handler.

export type FieldSpec = {
  key: string;
  label: string;
  /** 'lookup' fetches options from lookupEndpoint at modal open time. */
  type?: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'lookup';
  required?: boolean;
  /** Static options for type: 'select'. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  defaultValue?: string;
  helperText?: string;
  /** For type: 'lookup' — relative API path, e.g. '/api/lookup/sites' */
  lookupEndpoint?: string;
  /**
   * Auto-fill sibling fields when a lookup value is chosen.
   * Keys are target field keys; values are property names on the selected
   * lookup row (beyond value/label). E.g. { technology: 'technology', capacity: 'capacity_kwp' }
   */
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

  // Lookup options — keyed by field.key → full row objects for auto-fill
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
      // Auto-fill sibling fields from lookup row metadata
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

  // Focus management: trap Tab inside the modal; Esc closes
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return () => {};
    const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const els = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(el => !el.hasAttribute('disabled'));
    // Move initial focus to first element
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
  const btnCls = cta === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--oe-primary)] hover:bg-[var(--oe-on-surface)]';
  return (
    <AnimatePresence>
    <motion.div
      key="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionTransition('snap')}
      className="fixed inset-0 z-50 bg-[var(--oe-on-surface)]/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
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
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[var(--oe-surface-container)] flex items-center justify-between">
          <h3 id="action-modal-title" className="text-[16px] font-semibold text-[var(--oe-on-surface)]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--oe-outline)] hover:text-[var(--oe-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:rounded">×</button>
        </div>
        <div className="p-5 space-y-3">
          {cta === 'danger' && (
            <div role="alert" className="flex gap-2 items-start px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-800">
              <span className="shrink-0 mt-0.5" aria-hidden="true">⚠</span>
              <span>This action is irreversible. Review carefully before confirming.</span>
            </div>
          )}
          <div role="alert" aria-live="assertive" className="text-[12px] text-red-700 min-h-[1em]">
            {err ?? ''}
          </div>
          {fields.map(f => (
            <label key={f.key} className="block text-[13px]">
              <span className="text-[var(--oe-outline)]">{cleanTabLabel(f.label)}{f.required && ' *'}</span>
              {f.type === 'textarea' ? (
                <textarea value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} rows={4} placeholder={f.placeholder} className="mt-1 w-full px-3 py-2 border border-[var(--oe-surface-container-high)] rounded-lg resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]" />
              ) : f.type === 'select' ? (
                <select value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--oe-surface-container-high)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]">
                  <option value="">— select —</option>
                  {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'lookup' ? (
                <select value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} className="mt-1 w-full px-3 py-2 border border-[var(--oe-surface-container-high)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]">
                  <option value="">{lookupLoading ? 'Loading…' : '— select —'}</option>
                  {(lookupOpts[f.key] || []).map(o => <option key={String(o.value)} value={String(o.value)}>{String(o.label)}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={values[f.key]} onChange={(e) => update(f.key, e.target.value)} placeholder={f.placeholder} className="mt-1 w-full px-3 py-2 border border-[var(--oe-surface-container-high)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]" />
              )}
              {f.helperText && <span className="block mt-1 text-[10px] text-[var(--oe-outline)]">{f.helperText}</span>}
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[var(--oe-surface-container-high)] rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]">Cancel</button>
            <button type="button" onClick={submit} disabled={saving || saved} className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--oe-primary)] transition-colors ${saved ? 'bg-green-600' : btnCls}`}>
              {saved ? '✓ Done' : saving ? 'Saving…' : submitLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    </AnimatePresence>
  );
}
