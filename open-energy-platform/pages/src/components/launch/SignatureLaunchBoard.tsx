import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { RoleShell } from '../signature';
import type { LaunchPayload, Kpi, Workflow, AiSuggestion } from './LaunchBoardShell';
import type { RoleKey } from '../../lib/role-themes';

// ── Design tokens (mockup-b) ─────────────────────────────────────────────────
const BG       = 'oklch(0.96 0.003 250)';
const BG1      = 'oklch(0.99 0.002 80)';
const BG2      = 'oklch(0.93 0.004 250)';
const BG3      = 'oklch(0.90 0.006 250)';
const BORDER   = 'oklch(0.87 0.006 250)';
const BORDER_S = 'oklch(0.78 0.008 250)';
const TX1      = 'oklch(0.17 0.010 250)';
const TX2      = 'oklch(0.40 0.009 250)';
const TX3      = 'oklch(0.60 0.007 250)';
const ACC      = 'oklch(0.46 0.16 55)';
const ACC_BG   = 'oklch(0.96 0.05 55)';
const ACC_BDR  = 'oklch(0.80 0.12 55)';
const BAD      = 'oklch(0.48 0.20 20)';
const BAD_BG   = 'oklch(0.97 0.04 20)';
const WARN     = 'oklch(0.50 0.18 55)';
const WARN_BG  = 'oklch(0.96 0.05 55)';
const GOOD     = 'oklch(0.40 0.16 155)';
const INFO     = 'oklch(0.42 0.16 240)';
const INFO_BG  = 'oklch(0.95 0.04 240)';
const MONO     = '"IBM Plex Mono","Fira Code",monospace';
const EASE     = 'cubic-bezier(0.23, 1, 0.32, 1)';

type ActionItem = {
  id: string;
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
  created_at: string;
};

type FeedItem =
  | { kind: 'action'; item: ActionItem }
  | { kind: 'ai'; suggestion: AiSuggestion };

// ── Helpers ──────────────────────────────────────────────────────────────────
function priorityColors(p: string) {
  switch (p) {
    case 'urgent': return { dot: BAD,  tagBg: BAD_BG,  tag: BAD  };
    case 'high':   return { dot: WARN, tagBg: WARN_BG, tag: WARN };
    case 'normal': return { dot: INFO, tagBg: INFO_BG, tag: INFO };
    default:       return { dot: TX3,  tagBg: BG2,     tag: TX3  };
  }
}

function timeAgo(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function fmtSla(s?: string | null): { label: string; color: string } {
  if (!s) return { label: '', color: TX3 };
  const diff = (new Date(s).getTime() - Date.now()) / 1000;
  if (diff < 0)       return { label: 'SLA breached', color: BAD };
  if (diff < 3600)    return { label: `SLA: ${Math.round(diff / 60)}m`, color: BAD };
  if (diff < 86400)   return { label: `SLA: ${Math.round(diff / 3600)}h`, color: WARN };
  const d = Math.round(diff / 86400);
  return { label: `Due: ${d}d`, color: d <= 2 ? WARN : TX3 };
}

function hrefFor(et: string | null, ei: string | null): string {
  switch (et) {
    case 'trade_matches':       return ei ? `/trading?focus=${ei}` : '/trading';
    case 'invoices':            return ei ? `/settlement?focus=${ei}` : '/settlement';
    case 'project_milestones':  return ei ? `/projects?focus=${ei}` : '/projects';
    case 'settlement_disputes': return ei ? `/settlement?focus=${ei}` : '/settlement';
    case 'loan_covenants':      return ei ? `/funds?focus=${ei}` : '/funds';
    case 'disbursement_requests': return ei ? `/funds?focus=${ei}` : '/funds';
    case 'ona_faults':          return '/projects';
    case 'contract_documents':  return ei ? `/contracts/${ei}` : '/contracts';
    case 'loi_drafts':          return '/lois';
    default:                    return '/';
  }
}

const ROLE_PILLS: Record<string, string[]> = {
  ipp_developer: ['Milestones', 'Finance', 'Procurement', 'HSE/SHEQ'],
  trader:        ['Orders', 'Risk', 'Settlement', 'Compliance'],
  lender:        ['Facilities', 'Covenants', 'Drawdowns', 'Default'],
  offtaker:      ['PPA', 'Take-or-pay', 'Curtailment', 'RECs'],
  grid_operator: ['Dispatch', 'Ancillary', 'Outages', 'Capacity'],
  carbon_fund:   ['MRV', 'Registration', 'Retirements', 'Article 6'],
  regulator:     ['Inbox', 'Licensing', 'Enforcement', 'Tariffs'],
  admin:         ['Platform', 'KYC', 'Audit', 'DLQ'],
  support:       ['Tickets', 'ITIL', 'OEM', 'Security'],
};

// ── ActionCard ────────────────────────────────────────────────────────────────
function ActionCard({ item, onComplete }: { item: ActionItem; onComplete: (id: string) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const c = priorityColors(item.priority);
  const sla = fmtSla(item.due_date);
  const href = hrefFor(item.entity_type, item.entity_id);

  return (
    <div
      style={{
        background: BG1,
        border: `1px solid ${hover || open ? BORDER_S : BORDER}`,
        borderRadius: 6, marginBottom: 8, overflow: 'hidden', cursor: 'pointer',
        transition: `border-color 120ms ${EASE}, box-shadow 120ms ${EASE}`,
        boxShadow: hover ? '0 1px 6px oklch(0.40 0.008 250 / .08)' : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div onClick={() => setOpen(v => !v)} style={{ padding: '12px 14px', display: 'flex', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '2px 7px', borderRadius: 3, background: c.tagBg, color: c.tag,
            }}>
              {item.type.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).slice(0, 22)}
            </span>
            {item.entity_type && (
              <span style={{ fontSize: 9, color: TX3, fontFamily: MONO }}>
                {item.entity_type.replace(/_/g, ' ')}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 2 }}>{item.title}</div>
          {item.description && (
            <div style={{ fontSize: 11, color: TX2, lineHeight: 1.4 }}>
              {item.description.length > 110 ? item.description.slice(0, 107) + '…' : item.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>{timeAgo(item.created_at)}</span>
            {sla.label && (
              <span style={{ fontSize: 10, fontFamily: MONO, fontWeight: 600, color: sla.color }}>{sla.label}</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: TX3, transition: `transform 150ms ${EASE}`, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
          </div>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12, background: BG2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(href); }}
            style={{
              padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', border: 'none', background: ACC, color: '#fff', minHeight: 32,
              transition: `background-color 120ms ${EASE}, transform 100ms ${EASE}`,
            }}
            onMouseDown={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)')}
            onMouseUp={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)')}
          >
            Open ↗
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onComplete(item.id); }}
            style={{
              padding: '6px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', background: BG1, color: TX2, border: `1px solid ${BORDER}`, minHeight: 32,
            }}
          >
            Mark done
          </button>
        </div>
      )}
    </div>
  );
}

// ── AiFeedCard ────────────────────────────────────────────────────────────────
function AiFeedCard({ role, s, onDismiss }: { role: string; s: AiSuggestion; onDismiss: (k: string) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    try { await api.post(`/launch/${role}/ai/${s.key}/accept`, { title: s.title, confidence: s.confidence }); }
    catch { /* non-blocking */ }
    if (s.accept?.href) navigate(s.accept.href);
    setBusy(false);
  };

  return (
    <div style={{
      background: 'oklch(0.98 0.02 60)', border: '1px solid oklch(0.86 0.06 60)',
      borderRadius: 6, padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 10,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 11, background: 'oklch(0.56 0.18 65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0,
      }}>AI</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'oklch(0.50 0.12 60)', marginBottom: 3 }}>
          AI suggests
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 3 }}>{s.title}</div>
        <div style={{ fontSize: 12, color: TX2, lineHeight: 1.5 }}>{s.why}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {s.accept && (
            <button type="button" disabled={busy} onClick={accept} style={{
              padding: '4px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', background: 'oklch(0.56 0.18 65)', border: 'none', color: '#fff',
              opacity: busy ? 0.6 : 1, minHeight: 28,
            }}>
              {busy ? 'Working…' : s.accept.label}
            </button>
          )}
          {s.dismiss && (
            <button type="button" onClick={() => onDismiss(s.key)} style={{
              padding: '4px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', border: '1px solid oklch(0.78 0.12 60)',
              background: 'transparent', color: 'oklch(0.44 0.14 60)', minHeight: 28,
            }}>
              {s.dismiss.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CtxKpi ────────────────────────────────────────────────────────────────────
function CtxKpi({ kpi }: { kpi: Kpi }) {
  const navigate = useNavigate();
  const vc = kpi.tone === 'good' ? GOOD : kpi.tone === 'bad' ? BAD : kpi.tone === 'warn' ? WARN : TX1;
  return (
    <div
      onClick={kpi.href ? () => navigate(kpi.href!) : undefined}
      style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '8px 10px', cursor: kpi.href ? 'pointer' : 'default' }}
    >
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, fontWeight: 700, marginBottom: 3 }}>
        {kpi.label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: vc, lineHeight: 1 }}>
        {kpi.value}
        {kpi.unit ? <span style={{ fontSize: 11, fontWeight: 400, color: TX3, marginLeft: 3 }}>{kpi.unit}</span> : null}
      </div>
      {kpi.trend_value && (
        <div style={{ fontSize: 9, color: TX3, fontFamily: MONO, marginTop: 2 }}>{kpi.trend_value}</div>
      )}
    </div>
  );
}

// ── CtxWorkflowRow ────────────────────────────────────────────────────────────
function CtxWorkflowRow({ wf }: { wf: Workflow }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const dc = wf.metric?.tone === 'bad' ? BAD : wf.metric?.tone === 'warn' ? WARN : GOOD;
  return (
    <div
      onClick={() => navigate(wf.href)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
        background: BG2, border: `1px solid ${hover ? BORDER_S : BORDER}`, borderRadius: 4, cursor: 'pointer',
        transition: `border-color 120ms ${EASE}`,
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: 4, background: dc, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: TX1, flex: 1 }}>
        {wf.title.length > 30 ? wf.title.slice(0, 27) + '…' : wf.title}
      </span>
      {wf.metric && (
        <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>
          {wf.metric.value} {wf.metric.label}
        </span>
      )}
    </div>
  );
}

// ── FeedGroupHdr ──────────────────────────────────────────────────────────────
function FeedGroupHdr({ label, count, countBg, countColor, mt = 0 }: {
  label: string; count: number; countBg: string; countColor: string; mt?: number;
}) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: TX3, marginBottom: 8, marginTop: mt, display: 'flex', alignItems: 'center', gap: 8 }}>
      {label}
      <span style={{ background: countBg, color: countColor, padding: '1px 6px', borderRadius: 8, fontWeight: 700, fontSize: 9 }}>
        {count}
      </span>
    </div>
  );
}

// ── PillBtn ───────────────────────────────────────────────────────────────────
function PillBtn({ label, active, onClick, badge }: {
  label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px', borderRadius: 15, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
        border: `1px solid ${active ? ACC_BDR : BORDER}`,
        color: active ? ACC : TX2,
        background: active ? ACC_BG : BG1,
        transition: `background-color 120ms ${EASE}, border-color 120ms ${EASE}`,
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ background: BAD, color: '#fff', padding: '0 5px', borderRadius: 8, fontSize: 9, fontFamily: MONO, fontWeight: 800 }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── SignatureLaunchBoard ──────────────────────────────────────────────────────
export function SignatureLaunchBoard({ role }: { role: string }) {
  const [payload, setPayload]           = useState<LaunchPayload | null>(null);
  const [actions, setActions]           = useState<ActionItem[]>([]);
  const [loadingPayload, setLoadingPayload] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [err, setErr]                   = useState<string | null>(null);
  const [dismissed, setDismissed]       = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState('All');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingPayload(true);
      setErr(null);
      try {
        const res = await api.get(`/launch/${role}/kpis`);
        if (alive) setPayload(res.data?.data || null);
      } catch (e: any) {
        if (alive) setErr(e?.response?.data?.error || e.message || 'Failed to load');
      } finally {
        if (alive) setLoadingPayload(false);
      }
    })();
    return () => { alive = false; };
  }, [role]);

  const loadActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const res = await api.get('/cockpit/actions?status=pending&limit=20');
      setActions((res.data?.data as ActionItem[]) || []);
    } catch { /* swallow */ }
    finally { setLoadingActions(false); }
  }, []);

  useEffect(() => {
    loadActions();
    const t = setInterval(loadActions, 30_000);
    return () => clearInterval(t);
  }, [loadActions]);

  const dismissSuggestion = useCallback((key: string) => setDismissed(p => new Set(p).add(key)), []);
  const completeAction    = useCallback(async (id: string) => {
    try { await api.post(`/cockpit/actions/${id}/complete`, {}); }
    catch { /* swallow */ }
    setActions(p => p.filter(a => a.id !== id));
  }, []);

  // All hooks must be above early returns
  const visibleSuggestions = useMemo(
    () => (payload?.ai_suggestions ?? []).filter(s => !dismissed.has(s.key)),
    [payload, dismissed],
  );

  const allFeedItems = useMemo<FeedItem[]>(() => [
    ...actions.map((item): FeedItem => ({ kind: 'action', item })),
    ...visibleSuggestions.map((suggestion): FeedItem => ({ kind: 'ai', suggestion })),
  ], [actions, visibleSuggestions]);

  const filteredItems = useMemo<FeedItem[]>(() => {
    if (activeFilter === 'Urgent')      return allFeedItems.filter(f => f.kind === 'action' && (f.item.priority === 'urgent' || f.item.priority === 'high'));
    if (activeFilter === 'AI suggests') return allFeedItems.filter(f => f.kind === 'ai');
    if (activeFilter === 'All')         return allFeedItems;
    return allFeedItems; // role-specific pills: could refine later
  }, [activeFilter, allFeedItems]);

  if (loadingPayload) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton variant="card" rows={3} />
      </div>
    );
  }
  if (err)      return <ErrorBanner message={err} onRetry={() => window.location.reload()} />;
  if (!payload) return <ErrorBanner message="No data" />;

  const urgentItems  = filteredItems.filter(f => f.kind === 'action' && f.item.priority === 'urgent');
  const highItems    = filteredItems.filter(f => f.kind === 'action' && f.item.priority === 'high');
  const aiItems      = filteredItems.filter(f => f.kind === 'ai');
  const normalItems  = filteredItems.filter(f => f.kind === 'action' && (f.item.priority === 'normal' || f.item.priority === 'low'));

  const urgentCount  = actions.filter(a => a.priority === 'urgent').length;
  const aiCount      = visibleSuggestions.length;
  const ctxKpis      = payload.kpis.slice(0, 4);
  const progressKpis = payload.kpis.slice(4, 8);
  const ctxWorkflows = payload.workflows.slice(0, 8);
  const rolePills    = ROLE_PILLS[role] ?? [];

  let groupOffset = 0;

  return (
    <RoleShell role={role as RoleKey}>
      <div style={{
        height: 'calc(100vh - var(--shell-height))',
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        overflow: 'hidden',
      }}>

        {/* ── LEFT: Feed ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${BORDER}`, background: BG }}>

          {/* Feed bar */}
          <div style={{
            padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            background: BG1, overflowX: 'auto',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TX1, marginRight: 4, flexShrink: 0 }}>Activity</span>
            <PillBtn label="Urgent" active={activeFilter === 'Urgent'} onClick={() => setActiveFilter(f => f === 'Urgent' ? 'All' : 'Urgent')} badge={urgentCount} />
            {aiCount > 0 && (
              <PillBtn label="AI suggests" active={activeFilter === 'AI suggests'} onClick={() => setActiveFilter(f => f === 'AI suggests' ? 'All' : 'AI suggests')} />
            )}
            {rolePills.map(p => (
              <PillBtn key={p} label={p} active={activeFilter === p} onClick={() => setActiveFilter(f => f === p ? 'All' : p)} />
            ))}
            <PillBtn label="All" active={activeFilter === 'All'} onClick={() => setActiveFilter('All')} />
            <span style={{ marginLeft: 'auto', fontSize: 11, color: TX3, fontFamily: MONO, flexShrink: 0 }}>
              {filteredItems.length}
            </span>
          </div>

          {/* Scrollable feed */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {loadingActions && actions.length === 0 && <Skeleton variant="card" rows={3} />}

            {urgentItems.length > 0 && (() => { const mt = groupOffset; groupOffset = 16; return (
              <>
                <FeedGroupHdr label="Urgent" count={urgentItems.length} countBg={BAD_BG} countColor={BAD} mt={mt} />
                {urgentItems.map(f => f.kind === 'action' ? <ActionCard key={f.item.id} item={f.item} onComplete={completeAction} /> : null)}
              </>
            ); })()}

            {aiItems.length > 0 && (() => { const mt = groupOffset; groupOffset = 16; return (
              <>
                <FeedGroupHdr label="AI suggests" count={aiItems.length} countBg={ACC_BG} countColor={ACC} mt={mt} />
                {aiItems.map(f => f.kind === 'ai' ? <AiFeedCard key={f.suggestion.key} role={role} s={f.suggestion} onDismiss={dismissSuggestion} /> : null)}
              </>
            ); })()}

            {highItems.length > 0 && (() => { const mt = groupOffset; groupOffset = 16; return (
              <>
                <FeedGroupHdr label="High priority" count={highItems.length} countBg={WARN_BG} countColor={WARN} mt={mt} />
                {highItems.map(f => f.kind === 'action' ? <ActionCard key={f.item.id} item={f.item} onComplete={completeAction} /> : null)}
              </>
            ); })()}

            {normalItems.length > 0 && (() => { const mt = groupOffset; groupOffset = 16; return (
              <>
                <FeedGroupHdr label="Today" count={normalItems.length} countBg={BG2} countColor={TX3} mt={mt} />
                {normalItems.map(f => f.kind === 'action' ? <ActionCard key={f.item.id} item={f.item} onComplete={completeAction} /> : null)}
              </>
            ); })()}

            {filteredItems.length === 0 && !loadingActions && (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: 'oklch(0.93 0.04 155)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>All clear</div>
                <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>Nothing queued for this filter.</div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Context panel ─────────────────────────────────── */}
        <div style={{ background: BG1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: TX1, margin: 0, marginBottom: 2 }}>{payload.hero.title}</h2>
            <div style={{ fontSize: 11, color: TX3 }}>{payload.hero.subtitle}</div>
          </div>

          {/* Scrollable context */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>

            {/* KPI 2×2 grid */}
            {ctxKpis.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: TX3, marginBottom: 8 }}>
                  At a glance
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
                  {ctxKpis.map(k => <CtxKpi key={k.key} kpi={k} />)}
                </div>
              </>
            )}

            {/* Progress bars (KPIs 5–8) */}
            {progressKpis.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: TX3, marginBottom: 8 }}>
                  Progress
                </div>
                <div style={{ marginBottom: 16 }}>
                  {progressKpis.map(k => {
                    const n = typeof k.value === 'number' ? k.value : parseFloat(String(k.value).replace(/[^0-9.]/g, '')) || 0;
                    const pct = Math.min(100, Math.max(0, n));
                    const fill = k.tone === 'good' ? GOOD : k.tone === 'bad' ? BAD : k.tone === 'warn' ? WARN : INFO;
                    return (
                      <div key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: TX2, width: 108, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {k.label}
                        </div>
                        <div style={{ flex: 1, height: 5, background: BG3, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: fill, width: `${pct}%` }} />
                        </div>
                        <div style={{ fontSize: 10, fontFamily: MONO, color: TX3, minWidth: 32, textAlign: 'right' }}>
                          {k.value}{k.unit ?? ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Workflow list */}
            {ctxWorkflows.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: TX3, marginBottom: 8 }}>
                  Workflows
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                  {ctxWorkflows.map(wf => <CtxWorkflowRow key={wf.key} wf={wf} />)}
                </div>
              </>
            )}

            {/* Primary CTA */}
            {payload.hero.primary_cta && (
              <a
                href={payload.hero.primary_cta.href}
                style={{
                  display: 'block', textAlign: 'center', padding: '8px 16px',
                  borderRadius: 4, fontSize: 12, fontWeight: 700,
                  background: ACC, color: '#fff', textDecoration: 'none',
                  transition: `background-color 120ms ${EASE}`,
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.background = 'oklch(0.38 0.18 55)')}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.background = ACC)}
              >
                {payload.hero.primary_cta.label} →
              </a>
            )}
          </div>
        </div>
      </div>
    </RoleShell>
  );
}
