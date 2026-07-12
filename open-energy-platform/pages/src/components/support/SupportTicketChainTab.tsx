// Wave 14 — Support ticket P6 chain tab.
//
// Priority-tiered ticket state machine surfaced as a P6 audit chain.
//
//   • KPI strip: total / open P1 / breached / escalated / awaiting user / resolved
//   • Filter pills by chain state + priority
//   • Listing with priority pill + SLA countdown
//   • Drill-down: timeline + per-state action buttons (8 actions)
//
// Roles: admin/support/regulator read; support/admin can act on every button;
// reporter can user_responded + reopen (gated server-side, surfaces 403).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type ChainStatus =
  | 'open' | 'triaged' | 'in_progress' | 'awaiting_user'
  | 'resolved' | 'closed' | 'escalated';

type Priority = 'urgent' | 'high' | 'normal' | 'low';

interface TicketRow {
  id: string;
  ticket_number: string;
  reporter_id: string;
  subject: string;
  category: string;
  priority: Priority;
  priority_label?: string;
  chain_status: ChainStatus;
  chain_status_label?: string;
  is_terminal?: boolean;
  has_sla_window?: boolean;
  sla_window?: 'triage' | 'first_response' | 'resolution' | null;
  sla_deadline_at?: string | null;
  minutes_until_sla?: number | null;
  sla_breached?: boolean;
  escalation_reason: string | null;
  triaged_at: string | null;
  first_responded_at: string | null;
  resolved_at: string | null;
  sla_breach_count: number;
  created_at: string;
}

interface TicketEvent {
  id: string;
  ticket_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  sla_window: string | null;
  actor_id: string | null;
  notes: string | null;
  payload_json: string | null;
  created_at: string;
}

const STATE_TONE: Record<ChainStatus, { bg: string; fg: string; label: string }> = {
  open:          { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Open (untriaged)' },
  triaged:       { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'Triaged' },
  in_progress:   { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'In progress' },
  awaiting_user: { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Awaiting user' },
  resolved:      { bg: 'color-mix(in oklab, var(--good) 15%, var(--s1))', fg: 'var(--good, #1f6b3a)', label: 'Resolved' },
  closed:        { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'Closed' },
  escalated:     { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'Escalated' },
};

const PRIORITY_TONE: Record<Priority, { bg: string; fg: string; label: string }> = {
  urgent: { bg: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', fg: 'var(--bad, #9b1f1f)', label: 'P1' },
  high:   { bg: 'color-mix(in oklab, var(--warn) 15%, var(--s1))', fg: 'var(--warn)', label: 'P2' },
  normal: { bg: 'color-mix(in oklab, var(--warn) 18%, var(--s1))', fg: 'var(--warn)', label: 'P3' },
  low:    { bg: 'var(--s2, #eef1f5)', fg: 'var(--ink-2)',    label: 'P4' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open_all',      label: 'Live (pre-close)' },
  { key: 'all',           label: 'All' },
  { key: 'open',          label: 'Untriaged' },
  { key: 'triaged',       label: 'Triaged' },
  { key: 'in_progress',   label: 'In progress' },
  { key: 'awaiting_user', label: 'Awaiting user' },
  { key: 'resolved',      label: 'Resolved' },
  { key: 'escalated',     label: 'Escalated' },
  { key: 'closed',        label: 'Closed' },
  { key: 'p1',            label: 'P1 only' },
  { key: 'breached',      label: 'SLA breached' },
];

const IN_OPEN = new Set<ChainStatus>(['open', 'triaged', 'in_progress', 'awaiting_user', 'resolved']);

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'var(--s1, #fff)', border: '1px solid var(--border-subtle, #e3e7ec)', borderRadius: 8, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink, #0f1c2e)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-2, #7a8a9a)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmtSla(m: number | null | undefined, breached: boolean | undefined): string {
  if (m == null) return '—';
  if (breached) {
    const overdue = -m;
    if (overdue >= 1440) return `${Math.floor(overdue / 1440)}d overdue`;
    if (overdue >= 60)   return `${Math.floor(overdue / 60)}h overdue`;
    return `${overdue}m overdue`;
  }
  if (m === 0) return 'due now';
  if (m < 0)   return `${-m}m overdue`;
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h left`;
  if (m >= 60)   return `${Math.floor(m / 60)}h ${m % 60}m left`;
  return `${m}m left`;
}

const WINDOW_LABEL: Record<string, string> = {
  triage:         'Triage SLA',
  first_response: 'First-response SLA',
  resolution:     'Resolution SLA',
};

export function SupportTicketChainTab() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState<string>('open_all');
  const [drill, setDrill] = useState<TicketRow | null>(null);
  const [drillEvents, setDrillEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: { items: TicketRow[] } }>('/support/ticket-chain');
      setRows(r.data?.data?.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all')      return rows;
    if (filter === 'open_all') return rows.filter((r) => IN_OPEN.has(r.chain_status));
    if (filter === 'p1')       return rows.filter((r) => r.priority === 'urgent');
    if (filter === 'breached') return rows.filter((r) => r.sla_breached);
    return rows.filter((r) => r.chain_status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total:     rows.length,
    open_p1:   rows.filter((r) => r.priority === 'urgent' && !['closed', 'escalated'].includes(r.chain_status)).length,
    breached:  rows.filter((r) => r.sla_breached).length,
    escalated: rows.filter((r) => r.chain_status === 'escalated').length,
    waiting:   rows.filter((r) => r.chain_status === 'awaiting_user').length,
    resolved:  rows.filter((r) => r.chain_status === 'resolved').length,
  }), [rows]);

  const openDrill = useCallback(async (row: TicketRow) => {
    setDrill(row); setDrillEvents([]);
    try {
      const r = await api.get<{ data: { ticket: TicketRow; events: TicketEvent[] } }>(`/support/ticket-chain/${row.id}`);
      setDrill(r.data?.data?.ticket || row);
      setDrillEvents(r.data?.data?.events || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (kind: string, payload: any, targetId: string) => {
    setError(null);
    try {
      await api.post(`/support/ticket-chain/${targetId}/${kind}`, payload);
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  return (
    <div data-testid="support-ticket-chain-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink, #0f1c2e)', marginTop: 0 }}>Support ticket chain</h2>
      <p style={{ fontSize: 13, color: '#557', marginTop: 4 }}>
        Priority-tiered ticket lifecycle: open → triaged → in progress → resolved → closed,
        with awaiting-user (clock paused), reopen, and escalation branches. SLA windows are
        per-priority (P1: 1h / 2h / 4h, scaling to P4: 8h / 24h / 15d). P1 + compliance
        breaches and escalations cross to the regulator inbox.
      </p>

      <div data-testid="support-ticket-chain-kpis" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Open P1" value={kpis.open_p1} sub="urgent + live" />
        <Kpi label="SLA breached" value={kpis.breached} sub="needs action" />
        <Kpi label="Escalated" value={kpis.escalated} sub="terminal" />
        <Kpi label="Awaiting user" value={kpis.waiting} sub="clock paused" />
        <Kpi label="Resolved" value={kpis.resolved} sub="awaiting close" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            data-testid={`support-ticket-chain-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid var(--border-subtle, #e3e7ec)',
              background: filter === f.key ? 'oklch(0.46 0.16 55)' : '#fff',
              color: filter === f.key ? '#fff' : 'var(--ink, #0f1c2e)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}
          >{f.label}</button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', color: 'var(--bad, #9b1f1f)', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div data-testid="support-ticket-chain-table" style={{ marginTop: 14, background: 'var(--s1, #fff)', border: '1px solid var(--border-subtle, #e3e7ec)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s1, #f6f8fb)', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Ticket</th>
              <th style={{ padding: '8px 12px' }}>Subject</th>
              <th style={{ padding: '8px 12px' }}>Category</th>
              <th style={{ padding: '8px 12px' }}>Priority</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA window</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-2, #7a8a9a)' }}>
                {loading ? 'Loading…' : 'No tickets in this view.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const stone = STATE_TONE[r.chain_status];
              const ptone = PRIORITY_TONE[r.priority];
              return (
                <tr
                  key={r.id}
                  data-testid={`support-ticket-chain-row-${r.id}`}
                  onClick={() => openDrill(r)}
                  style={{ borderTop: '1px solid var(--border-subtle, #eef1f5)', cursor: 'pointer' }}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{r.ticket_number}</td>
                  <td style={{ padding: '8px 12px', maxWidth: 360 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.subject}>
                      {r.subject}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{r.category.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: ptone.bg, color: ptone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      {ptone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: stone.bg, color: stone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {stone.label}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#557' }}>
                    {r.sla_window ? WINDOW_LABEL[r.sla_window] ?? r.sla_window : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? 'var(--bad, #9b1f1f)' : '#557' }}>
                    {fmtSla(r.minutes_until_sla, r.sla_breached)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div
          data-testid="support-ticket-chain-drill"
          style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 580, background: 'var(--s1, #fff)',
            borderLeft: '1px solid var(--border-subtle, #e3e7ec)', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
            zIndex: 50, padding: 20, overflowY: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setDrill(null)}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}
          >×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.ticket_number}</h3>
          <div style={{ fontSize: 12, color: '#557', marginTop: 2 }}>
            Reporter: <span style={{ fontFamily: 'monospace' }}>{drill.reporter_id}</span> · Category: {drill.category}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: 'var(--ink, #0f1c2e)', fontWeight: 600 }}>{drill.subject}</div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
            <div><span style={{ color: '#557' }}>Priority:</span> <strong>{PRIORITY_TONE[drill.priority].label}</strong></div>
            <div><span style={{ color: '#557' }}>State:</span> <strong>{STATE_TONE[drill.chain_status].label}</strong></div>
            {drill.sla_window && (
              <div><span style={{ color: '#557' }}>SLA window:</span> <strong>{WINDOW_LABEL[drill.sla_window] ?? drill.sla_window}</strong></div>
            )}
            {drill.sla_deadline_at && (
              <div><span style={{ color: '#557' }}>SLA due:</span> <strong>{drill.sla_deadline_at.replace('T', ' ').slice(0, 16)}</strong></div>
            )}
            <div><span style={{ color: '#557' }}>SLA breaches:</span> <strong>{drill.sla_breach_count}</strong></div>
          </div>

          {drill.escalation_reason && (
            <div style={{ marginTop: 10, padding: 10, background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', color: 'var(--bad, #9b1f1f)', borderRadius: 6, fontSize: 12 }}>
              <strong>Escalation reason:</strong> {drill.escalation_reason}
            </div>
          )}

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Chain timeline</h4>
          <div data-testid="support-ticket-chain-events" style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}>
            {drillEvents.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-2, #7a8a9a)' }}>No events recorded.</div>
            )}
            {drillEvents.map((ev) => (
              <div
                key={ev.id}
                data-testid={`support-ticket-chain-event-${ev.id}`}
                style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle, #eef1f5)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</div>
                  <span style={{ fontSize: 10, color: 'var(--ink-2, #7a8a9a)' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ marginTop: 2, fontSize: 12 }}>{ev.notes ?? ''}</div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#557', fontFamily: 'monospace' }}>
                  {ev.from_status ?? '∅'} → {ev.to_status ?? '∅'}
                  {ev.sla_window ? ` · ${ev.sla_window}` : ''}
                </div>
              </div>
            ))}
          </div>

          <div data-testid="support-ticket-chain-actions" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drill.chain_status === 'open' && (
              <>
                <button type="button" data-testid="support-ticket-chain-triage"
                  onClick={() => void act('triage', {}, drill.id)}
                  style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Triage</button>
                <button type="button" data-testid="support-ticket-chain-escalate"
                  onClick={() => {
                    const reason = prompt('Escalate — provide reason:');
                    if (reason) void act('escalate', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--bad, #9b1f1f)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Escalate</button>
              </>
            )}
            {drill.chain_status === 'triaged' && (
              <>
                <button type="button" data-testid="support-ticket-chain-pick-up"
                  onClick={() => void act('pick-up', {}, drill.id)}
                  style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Pick up</button>
                <button type="button" data-testid="support-ticket-chain-escalate"
                  onClick={() => {
                    const reason = prompt('Escalate — provide reason:');
                    if (reason) void act('escalate', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--bad, #9b1f1f)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Escalate</button>
              </>
            )}
            {drill.chain_status === 'in_progress' && (
              <>
                <button type="button" data-testid="support-ticket-chain-wait"
                  onClick={() => void act('wait-for-user', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#a06200', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Wait for user</button>
                <button type="button" data-testid="support-ticket-chain-resolve"
                  onClick={() => {
                    const resolution = prompt('Resolve — provide resolution (optional):');
                    void act('resolve', resolution ? { resolution } : {}, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--good, #1f6b3a)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Resolve</button>
                <button type="button" data-testid="support-ticket-chain-escalate"
                  onClick={() => {
                    const reason = prompt('Escalate — provide reason:');
                    if (reason) void act('escalate', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--bad, #9b1f1f)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Escalate</button>
              </>
            )}
            {drill.chain_status === 'awaiting_user' && (
              <>
                <button type="button" data-testid="support-ticket-chain-user-responded"
                  onClick={() => void act('user-responded', {}, drill.id)}
                  style={{ padding: '6px 12px', background: 'oklch(0.46 0.16 55)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >User responded</button>
                <button type="button" data-testid="support-ticket-chain-resolve"
                  onClick={() => {
                    const resolution = prompt('Resolve — provide resolution (optional):');
                    void act('resolve', resolution ? { resolution } : {}, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--good, #1f6b3a)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Resolve</button>
                <button type="button" data-testid="support-ticket-chain-escalate"
                  onClick={() => {
                    const reason = prompt('Escalate — provide reason:');
                    if (reason) void act('escalate', { reason }, drill.id);
                  }}
                  style={{ padding: '6px 12px', background: 'var(--bad, #9b1f1f)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Escalate</button>
              </>
            )}
            {drill.chain_status === 'resolved' && (
              <>
                <button type="button" data-testid="support-ticket-chain-close"
                  onClick={() => void act('close', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#557', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Close</button>
                <button type="button" data-testid="support-ticket-chain-reopen"
                  onClick={() => void act('reopen', {}, drill.id)}
                  style={{ padding: '6px 12px', background: '#a06200', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                >Reopen</button>
              </>
            )}
            {drill.chain_status === 'closed' && (
              <button type="button" data-testid="support-ticket-chain-reopen"
                onClick={() => void act('reopen', {}, drill.id)}
                style={{ padding: '6px 12px', background: '#a06200', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
              >Reopen</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
