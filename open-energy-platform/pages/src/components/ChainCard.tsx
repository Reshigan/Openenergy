// ════════════════════════════════════════════════════════════════════════
// ChainCard — shared card for any state-machine chain item.
//
// Usage: import in any chain tab to get a consistent experience:
//   <ChainCard item={row} allStates={ALGO_STATES} branchStates={ALGO_BRANCHES}
//     actions={getActions(row)} onAction={handleAction} cascadeTo={['regulator','admin']} />
//
// Cascade badges show which roles receive downstream events from this
// transition — sourced from the chain's fireCascade rules.
// ════════════════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle, XCircle, Zap } from 'lucide-react';
import { ChainStateBar } from './ChainStateBar';
import { ActionModal, type FieldSpec } from './launch/WorkstationShell';

// ─── Design tokens (mockup-b) ─────────────────────────────────────────
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BG3    = 'oklch(0.90 0.006 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const ACC_BG = 'oklch(0.96 0.05 55)';
const ACC_BDR= 'oklch(0.80 0.12 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const GOOD_BG= 'oklch(0.95 0.04 155)';
const BAD    = 'oklch(0.48 0.20 20)';
const BAD_BG = 'oklch(0.97 0.04 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const WARN_BG= 'oklch(0.96 0.05 55)';
const INFO   = 'oklch(0.42 0.16 240)';
const INFO_BG= 'oklch(0.95 0.04 240)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

// Cascade role display names
const CASCADE_ROLE_LABELS: Record<string, string> = {
  admin:         'Admin',
  regulator:     'NERSA',
  grid_operator: 'Grid',
  grid:          'Grid',
  ipp_developer: 'IPP',
  ipp:           'IPP',
  lender:        'Lender',
  offtaker:      'Offtaker',
  carbon_fund:   'Carbon',
  carbon:        'Carbon',
  trader:        'Trader',
  support:       'Support',
  esco:          'ESCO',
  epc:           'EPC',
};

const CASCADE_ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  regulator:     { bg: 'oklch(0.95 0.04 240)', color: 'oklch(0.35 0.14 240)' },
  grid_operator: { bg: 'oklch(0.95 0.06 155)', color: 'oklch(0.30 0.14 155)' },
  grid:          { bg: 'oklch(0.95 0.06 155)', color: 'oklch(0.30 0.14 155)' },
  ipp_developer: { bg: 'oklch(0.95 0.05 80)',  color: 'oklch(0.40 0.18 55)'  },
  ipp:           { bg: 'oklch(0.95 0.05 80)',  color: 'oklch(0.40 0.18 55)'  },
  lender:        { bg: 'oklch(0.95 0.04 280)', color: 'oklch(0.35 0.14 280)' },
  offtaker:      { bg: 'oklch(0.95 0.05 30)',  color: 'oklch(0.38 0.16 30)'  },
  carbon_fund:   { bg: 'oklch(0.95 0.04 155)', color: 'oklch(0.30 0.14 155)' },
  carbon:        { bg: 'oklch(0.95 0.04 155)', color: 'oklch(0.30 0.14 155)' },
  trader:        { bg: 'oklch(0.95 0.04 250)', color: 'oklch(0.35 0.12 250)' },
  admin:         { bg: BG2,                    color: TX2                     },
  support:       { bg: 'oklch(0.95 0.04 300)', color: 'oklch(0.38 0.14 300)' },
};

// ─── Types ────────────────────────────────────────────────────────────
export type ChainAction = {
  key: string;
  label: string;
  tone?: 'primary' | 'warn' | 'danger' | 'ghost' | 'good' | 'muted';
  fields?: FieldSpec[];
  cascadeTo?: string[];
  description?: string;
};

export type ChainEvent = {
  id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  actor_party?: string | null;
  actor_id?: string | null;
  notes?: string | null;
  payload?: string | null;
  created_at: string;
};

export type ChainCardProps = {
  /** The chain row object (must have id, chain_status, case_number, and optionally sla_deadline_at, sla_breached, escalation_level) */
  item: {
    id: string;
    chain_status: string;
    case_number?: string;
    sla_deadline_at?: string | null;
    sla_breached?: boolean | number;
    escalation_level?: number;
    is_terminal?: boolean;
    [k: string]: unknown;
  };
  /** All states in order on the main path */
  allStates: readonly string[];
  /** Off-path terminal/error states */
  branchStates?: readonly string[];
  /** Human-readable title for this item */
  title: string;
  /** Secondary metadata line (optional) */
  meta?: React.ReactNode;
  /** Available actions for current state/role */
  actions?: ChainAction[];
  /** Called with (action_key, form_values) when user confirms an action */
  onAction?: (key: string, values: Record<string, string>) => Promise<void> | void;
  /** Default cascade targets shown on all transitions (override per-action with action.cascadeTo) */
  cascadeTo?: string[];
  /** Expand by default */
  defaultOpen?: boolean;
  /** Compact single-line mode (no expand, no actions) — for embedded table cells */
  mode?: 'card' | 'row';
  /** Custom detail content rendered in expanded body between state bar and actions */
  detail?: React.ReactNode;
  /** Audit trail events loaded when item is expanded */
  events?: ChainEvent[];
  /** Called when card is first expanded — load events lazily */
  onExpand?: (id: string) => void;
};

// ─── SLA chip ─────────────────────────────────────────────────────────
function SlaChip({ deadline, breached, escalation }: { deadline?: string | null; breached?: boolean; escalation?: number }) {
  if (!deadline) return null;

  const now    = Date.now();
  const dlMs   = new Date(deadline).getTime();
  const diffMs = dlMs - now;
  const mins   = Math.round(diffMs / 60_000);
  const hours  = Math.round(diffMs / 3_600_000);
  const days   = Math.round(diffMs / 86_400_000);

  const label = breached
    ? 'SLA breached'
    : diffMs < 0
    ? 'Overdue'
    : mins < 60
    ? `${mins}m left`
    : hours < 48
    ? `${hours}h left`
    : `${days}d left`;

  const tone = breached || diffMs < 0 ? 'bad' : diffMs < 3_600_000 ? 'warn' : 'ok';
  const bg    = tone === 'bad' ? BAD_BG  : tone === 'warn' ? WARN_BG : GOOD_BG;
  const color = tone === 'bad' ? BAD     : tone === 'warn' ? WARN    : GOOD;
  const Icon  = tone === 'bad' ? AlertTriangle : tone === 'warn' ? Clock : Clock;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: bg, color, border: `1px solid ${color}30` }}
      title={new Date(deadline).toLocaleString()}
    >
      <Icon size={9} />
      {label}
      {(escalation ?? 0) > 0 && (
        <span style={{ marginLeft: 2 }}>· L{escalation}</span>
      )}
    </span>
  );
}

// ─── Cascade badges ───────────────────────────────────────────────────
function CascadeBadges({ roles }: { roles: string[] }) {
  if (!roles.length) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span style={{ fontSize: 9, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>→</span>
      {roles.map(r => {
        const label  = CASCADE_ROLE_LABELS[r] ?? r;
        const colors = CASCADE_ROLE_COLORS[r] ?? { bg: BG2, color: TX2 };
        return (
          <span
            key={r}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
            style={{ background: colors.bg, color: colors.color }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Status dot ───────────────────────────────────────────────────────
function StatusDot({ status, isTerminal, isBreach }: { status: string; isTerminal?: boolean; isBreach?: boolean }) {
  const terminal = isTerminal || ['rejected', 'cancelled', 'failed', 'decommissioned', 'withdrawn', 'write_off', 'closed'].some(t => status.includes(t));
  const final = ['settled', 'granted', 'issued', 'certified', 'completed', 'retired', 'activated', 'deployed', 'closed'].some(t => status.includes(t));
  const bg = isBreach ? BAD : terminal ? TX3 : final ? GOOD : ACC;
  return (
    <span
      className="flex-shrink-0 rounded-full"
      style={{ width: 8, height: 8, background: bg }}
      title={status}
    />
  );
}

// ─── Audit timeline ───────────────────────────────────────────────────
function EventTimeline({ events }: { events: ChainEvent[] }) {
  const fmtDate = (s: string) =>
    new Date(s).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });

  if (!events.length)
    return <div style={{ fontSize: 11, color: TX3 }}>No events yet.</div>;

  return (
    <ol className="space-y-2">
      {events.map(e => {
        const partyColors = CASCADE_ROLE_COLORS[e.actor_party ?? ''] ?? { bg: BG2, color: TX2 };
        return (
          <li key={e.id} className="rounded border px-3 py-2" style={{ background: BG1, borderColor: BORDER, fontSize: 11 }}>
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontWeight: 600, color: TX1 }}>{e.event_type.replace(/_/g, ' ')}</span>
              <span style={{ color: TX3, fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtDate(e.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {(e.from_status || e.to_status) && (
                <span style={{ color: TX2 }}>{e.from_status ?? '—'} → {e.to_status ?? '—'}</span>
              )}
              {e.actor_party && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: partyColors.bg, color: partyColors.color }}>
                  {e.actor_party}
                </span>
              )}
            </div>
            {e.notes && <div className="mt-1" style={{ color: TX2 }}>{e.notes}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── ChainCard ────────────────────────────────────────────────────────
export function ChainCard({
  item,
  allStates,
  branchStates = [],
  title,
  meta,
  actions = [],
  onAction,
  cascadeTo = [],
  defaultOpen = false,
  mode = 'card',
  detail,
  events,
  onExpand,
}: ChainCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [pendingAction, setPendingAction] = useState<ChainAction | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  const statusLabel = item.chain_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const isTerminal  = !!(item.is_terminal);
  const isBreach    = !!(item.sla_breached);

  // Compute which cascade targets apply to an action (merge per-action + default)
  const getTargets = (a: ChainAction) =>
    Array.from(new Set([...(a.cascadeTo ?? []), ...cascadeTo]));

  const handleAction = async (key: string, values: Record<string, string>) => {
    setPendingAction(null);
    setActioning(key);
    try { await onAction?.(key, values); }
    finally { setActioning(null); }
  };

  if (mode === 'row') {
    // Compact single-line — for use inside tables
    return (
      <div className="flex items-center gap-3">
        <StatusDot status={item.chain_status} isTerminal={isTerminal} isBreach={isBreach} />
        <ChainStateBar allStates={allStates} currentState={item.chain_status} branchStates={branchStates} variant="compact" />
        <span style={{ fontSize: 11, color: TX2 }}>{statusLabel}</span>
      </div>
    );
  }

  // ── Full card ──────────────────────────────────────────────────────
  return (
    <>
      <div
        className="rounded border overflow-hidden"
        style={{ background: BG1, borderColor: isBreach ? BAD : open ? ACC_BDR : BORDER }}
      >
        {/* Card header — always visible */}
        <div
          className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
          style={{ background: open ? ACC_BG : BG1 }}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next && onExpand) onExpand(item.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const next = !open;
              setOpen(next);
              if (next && onExpand) onExpand(item.id);
            }
          }}
          aria-expanded={open}
        >
          <StatusDot status={item.chain_status} isTerminal={isTerminal} isBreach={isBreach} />

          {/* Title + case number */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold truncate" style={{ color: TX1 }}>{title}</span>
              {item.case_number && (
                <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>{String(item.case_number)}</span>
              )}
            </div>
            {meta && <div className="mt-0.5 text-[11px]" style={{ color: TX2 }}>{meta}</div>}
          </div>

          {/* SLA chip */}
          <SlaChip deadline={item.sla_deadline_at} breached={isBreach} escalation={item.escalation_level} />

          {/* State bar (compact) */}
          <div className="hidden sm:block">
            <ChainStateBar allStates={allStates} currentState={item.chain_status} branchStates={branchStates} variant="compact" />
          </div>

          {/* Expand chevron */}
          {open ? <ChevronDown size={14} style={{ color: TX3, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: TX3, flexShrink: 0 }} />}
        </div>

        {/* Expanded body */}
        {open && (
          <div className="border-t px-4 py-3 space-y-4" style={{ borderColor: BORDER, background: BG1 }}>
            {/* Full state bar */}
            <div className="pb-1">
              <ChainStateBar allStates={allStates} currentState={item.chain_status} branchStates={branchStates} variant="full" />
            </div>

            {/* Custom detail content */}
            {detail && (
              <div className="rounded border px-3 py-3" style={{ background: BG2, borderColor: BORDER }}>
                {detail}
              </div>
            )}

            {/* Available actions */}
            {actions.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: TX3 }}>
                  Available transitions
                </div>
                <div className="flex flex-wrap gap-2">
                  {actions.map(a => {
                    const targets = getTargets(a);
                    const isCurrent = actioning === a.key;
                    const toneBg: Record<string, string> = {
                      primary: ACC,
                      warn:    WARN,
                      danger:  BAD,
                      ghost:   'transparent',
                      good:    GOOD,
                      muted:   'transparent',
                    };
                    const bg = toneBg[a.tone ?? 'ghost'] ?? 'transparent';
                    const textColor = (a.tone === 'ghost' || a.tone === 'muted') ? TX2 : '#fff';
                    return (
                      <div key={a.key} className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={!!actioning}
                          onClick={() => {
                            if (a.fields?.length) { setPendingAction(a); }
                            else { void handleAction(a.key, {}); }
                          }}
                          className="h-7 px-3 rounded text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            background: bg,
                            color: textColor,
                            border: a.tone === 'ghost' ? `1px solid ${BORDER}` : 'none',
                            transition: 'opacity 120ms, background 120ms',
                          }}
                          onMouseEnter={e => { if (a.tone === 'ghost') (e.currentTarget as HTMLButtonElement).style.background = BG2; }}
                          onMouseLeave={e => { if (a.tone === 'ghost') (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          {isCurrent ? '…' : a.label}
                        </button>
                        {/* Cascade badges per action */}
                        {targets.length > 0 && (
                          <div className="pl-0.5">
                            <CascadeBadges roles={targets} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Audit timeline */}
            {(events !== undefined) && (
              <div>
                <button
                  type="button"
                  className="text-[9px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1"
                  style={{ color: TX3, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  onClick={() => setShowEvents(s => !s)}
                >
                  Audit timeline
                  <span style={{ fontSize: 8 }}>{showEvents ? '▲' : '▼'}</span>
                </button>
                {showEvents && <EventTimeline events={events} />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ActionModal portal */}
      {pendingAction && (
        <ActionModal
          title={pendingAction.label}
          fields={pendingAction.fields ?? []}
          submitLabel={pendingAction.label}
          cta={pendingAction.tone === 'danger' ? 'danger' : 'primary'}
          onClose={() => setPendingAction(null)}
          onSubmit={values => handleAction(pendingAction.key, values) as Promise<void>}
        />
      )}
    </>
  );
}
