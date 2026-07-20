// Offtaker PPA obligations queue — Wave 7 P6-grade delivery loop.
//
// Lives on the Offtaker suite as a tab. Surfaces:
//   • Monthly contracted vs delivered MWh per PPA
//   • Shortfall rows with cure deadlines + countdown
//   • Take-or-pay liability in ZAR for expired rows
//   • Inline reading verification queue (Submit → Verify | Reject)
//
// Server-side enforcement: offtakers only see their own rows; IPP counterparty
// only sees obligations against their assets.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ChainCard, type ChainAction, type ChainEvent } from '../ChainCard';

// ── design tokens (mockup-b) ─────────────────────────────────────────────
const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type Status = 'pending' | 'delivered' | 'shortfall' | 'cured' | 'take_or_pay';
type VerifyStatus = 'submitted' | 'verified' | 'rejected' | 'reversed';

interface ObligationRow {
  [key: string]: unknown;
  id: string;
  ppa_id: string;
  participant_id: string;
  counterparty_id: string | null;
  period_month: string;
  contracted_mwh: number;
  delivered_mwh: number;
  threshold_pct: number;
  cure_deadline_at: string | null;
  status: Status;
  take_or_pay_amount_zar: number;
  cured_at: string | null;
  escalated_at: string | null;
  notes: string | null;
}

interface VerificationRow {
  id: string;
  obligation_id: string;
  reading_mwh: number;
  submitted_by: string;
  submitted_at: string;
  status: VerifyStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

// ── state machine ─────────────────────────────────────────────────────────
// Obligation status is a status field (not a full chain), but we model it
// as an ordered progression for the ChainCard state bar.
const ALL_STATES: readonly string[] = [
  'pending',
  'shortfall',
  'cured',
  'delivered',
];
const BRANCH_STATES: readonly string[] = [
  'take_or_pay',
];

// ── filters ───────────────────────────────────────────────────────────────
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'all', label: 'All' },
  { key: 'shortfall', label: 'Shortfall' },
  { key: 'take_or_pay', label: 'Take-or-pay' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cured', label: 'Cured' },
];

// ── helpers ───────────────────────────────────────────────────────────────
function msAgo(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

function cureCountdown(deadline: string | null): { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' } {
  if (!deadline) return { label: '—', tone: 'neutral' };
  const due = new Date(deadline).getTime();
  const now = Date.now();
  if (due < now) return { label: `Overdue ${msAgo(now - due)}`, tone: 'bad' };
  return { label: `In ${msAgo(due - now)}`, tone: 'ok' };
}

function getActions(
  row: ObligationRow,
  verifications: VerificationRow[],
  onVerify: (dvId: string) => void,
  onReject: (dvId: string) => void,
): ChainAction[] {
  const actions: ChainAction[] = [];

  // Cure action — only available in shortfall
  if (row.status === 'shortfall') {
    actions.push({
      key: 'cure',
      label: 'Cure (with evidence)',
      tone: 'primary',
      fields: [
        {
          key: 'evidence_r2_key',
          label: 'R2 evidence key (signed remediation plan)',
          type: 'text',
          required: true,
          placeholder: 'e.g. remediation-plan-2024-01.pdf',
        },
      ],
      cascadeTo: ['regulator'],
      description: 'Submit a signed remediation plan to cure the shortfall.',
    });
  }

  // Verification sub-row actions — inline for submitted readings
  // These are surfaced as secondary ChainActions per submitted reading
  verifications
    .filter(dv => dv.status === 'submitted')
    .forEach(dv => {
      actions.push({
        key: `verify__${dv.id}`,
        label: `Verify reading ${Math.round(dv.reading_mwh)} MWh (${dv.submitted_at?.slice(0, 10)})`,
        tone: 'primary',
        fields: [],
        cascadeTo: [],
        description: 'Confirm this meter reading as accurate.',
      });
      actions.push({
        key: `reject__${dv.id}`,
        label: `Reject reading ${Math.round(dv.reading_mwh)} MWh (${dv.submitted_at?.slice(0, 10)})`,
        tone: 'danger',
        fields: [
          {
            key: 'reason',
            label: 'Rejection reason',
            type: 'textarea',
            required: true,
            placeholder: 'Explain why this reading is being rejected',
          },
        ],
        cascadeTo: [],
        description: 'Reject this meter reading with a reason.',
      });
    });

  return actions;
}

function renderDetail(row: ObligationRow, verifications: VerificationRow[]): React.ReactNode {
  const pct = row.contracted_mwh > 0 ? Math.round((row.delivered_mwh / row.contracted_mwh) * 1000) / 10 : 0;
  const cure = cureCountdown(row.cure_deadline_at);

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <DetailPair label="PPA ID" value={row.ppa_id} />
        <DetailPair label="Period" value={row.period_month} />
        <DetailPair label="Contracted MWh" value={`${Math.round(row.contracted_mwh).toLocaleString()} MWh`} />
        <DetailPair label="Delivered MWh" value={`${Math.round(row.delivered_mwh).toLocaleString()} MWh`} />
        <DetailPair label="% of contracted" value={`${pct}%`} />
        <DetailPair label="Threshold" value={`${row.threshold_pct}%`} />
        {row.cure_deadline_at && (
          <DetailPair label="Cure window" value={cure.label} />
        )}
        {row.take_or_pay_amount_zar > 0 && (
          <DetailPair label="Take-or-pay (ZAR)" value={`R${Math.round(row.take_or_pay_amount_zar).toLocaleString()}`} />
        )}
        {row.cured_at && (
          <DetailPair label="Cured at" value={row.cured_at.slice(0, 16)} />
        )}
        {row.escalated_at && (
          <DetailPair label="Escalated at" value={row.escalated_at.slice(0, 16)} />
        )}
      </div>
      {row.notes && (
        <div className="col-span-2 rounded border px-2 py-1.5 mt-2" style={{ background: BG1, borderColor: BORDER }}>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>Notes</div>
          <div style={{ color: TX2 }}>{row.notes}</div>
        </div>
      )}
      {verifications.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TX3 }}>Delivery readings</div>
          <div className="space-y-1">
            {verifications.map(dv => (
              <div key={dv.id} className="flex items-center gap-2 text-[11px] rounded px-2 py-1.5 border"
                   style={{ background: BG1, borderColor: BORDER }}>
                <span style={{ color: TX3, minWidth: 90 }}>{dv.submitted_at?.slice(0, 10)}</span>
                <span style={{ color: TX1, fontFamily: MONO, minWidth: 80 }}>{Math.round(dv.reading_mwh)} MWh</span>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{
                  background: dv.status === 'verified' ? 'color-mix(in oklab, var(--good) 15%, var(--s1))' : dv.status === 'rejected' ? 'color-mix(in oklab, var(--bad) 15%, var(--s1))' : 'color-mix(in oklab, var(--warn) 15%, var(--s1))',
                  color: dv.status === 'verified' ? GOOD : dv.status === 'rejected' ? BAD : WARN,
                }}>{dv.status}</span>
                <span style={{ color: TX3, flex: 1 }}>{dv.rejection_reason || dv.notes || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────
export function ObligationsTab() {
  const [rows, setRows] = useState<ObligationRow[]>([]);
  const [filter, setFilter] = useState<string>('open');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, ChainEvent[]>>({});
  const [verificationsByObligation, setVerificationsByObligation] = useState<Record<string, VerificationRow[]>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get<{ data: ObligationRow[] }>('/offtaker/obligations');
      setRows(r.data?.data || []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err?.response?.data?.error || err?.message || 'Failed to load obligations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleExpand = useCallback(async (id: string) => {
    if (verificationsByObligation[id]) return;
    try {
      const r = await api.get<{ data: { obligation: ObligationRow; verifications: VerificationRow[] } }>(`/offtaker/obligations/${id}`);
      setVerificationsByObligation(prev => ({ ...prev, [id]: r.data?.data?.verifications || [] }));
      setExpandedEvents(prev => ({ ...prev, [id]: [] }));
    } catch { /* silent */ }
  }, [verificationsByObligation]);

  const handleAction = useCallback(async (rowId: string, key: string, values: Record<string, string>) => {
    setErr(null);
    try {
      // Detect if this is a reading action (verify__<dvId> or reject__<dvId>)
      if (key.startsWith('verify__')) {
        const dvId = key.replace('verify__', '');
        await api.post(`/offtaker/obligations/readings/${dvId}/verify`, {});
      } else if (key.startsWith('reject__')) {
        const dvId = key.replace('reject__', '');
        await api.post(`/offtaker/obligations/readings/${dvId}/reject`, values);
      } else if (key === 'cure') {
        await api.post(`/offtaker/obligations/${rowId}/cure`, values);
      }
      await load();
      // Reload verifications for this row if expanded
      if (verificationsByObligation[rowId]) {
        try {
          const r = await api.get<{ data: { obligation: ObligationRow; verifications: VerificationRow[] } }>(`/offtaker/obligations/${rowId}`);
          setVerificationsByObligation(prev => ({ ...prev, [rowId]: r.data?.data?.verifications || [] }));
        } catch { /* silent */ }
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err?.response?.data?.error || err?.message || `Failed to ${key}.`);
    }
  }, [load, verificationsByObligation]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter(r => r.status === 'shortfall' || r.status === 'take_or_pay' || r.status === 'pending');
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  const kpis = useMemo(() => ({
    total: rows.length,
    contracted: rows.reduce((acc, r) => acc + Number(r.contracted_mwh || 0), 0),
    delivered: rows.reduce((acc, r) => acc + Number(r.delivered_mwh || 0), 0),
    shortfall: rows.filter(r => r.status === 'shortfall').length,
    take_or_pay: rows.filter(r => r.status === 'take_or_pay').length,
    take_or_pay_zar: rows.reduce((acc, r) => acc + Number(r.take_or_pay_amount_zar || 0), 0),
  }), [rows]);

  return (
    <div data-testid="offtaker-obligations-tab" className="p-5" style={{ background: BG }}>
      <header className="mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>PPA delivery obligations</h2>
        <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
          Monthly contracted-vs-delivered tracking. Shortfalls open a 14-day cure window; expired
          rows flip to take-or-pay and feed the regulator inbox automatically.
        </p>
      </header>

      {/* KPI strip */}
      <div data-testid="offtaker-obligations-kpis" className="mb-4 flex flex-wrap gap-2">
        <KpiTile label="Total periods" value={kpis.total} />
        <KpiTile label="Contracted (MWh)" value={Math.round(kpis.contracted).toLocaleString()} />
        <KpiTile label="Delivered (MWh)" value={Math.round(kpis.delivered).toLocaleString()} />
        <KpiTile label="Open shortfalls" value={kpis.shortfall} tone={kpis.shortfall > 0 ? 'warn' : undefined} />
        <KpiTile label="Take-or-pay (count)" value={kpis.take_or_pay} tone={kpis.take_or_pay > 0 ? 'bad' : undefined} />
        <KpiTile label="Take-or-pay (ZAR)" value={`R${Math.round(kpis.take_or_pay_zar).toLocaleString()}`} tone={kpis.take_or_pay_zar > 0 ? 'bad' : undefined} />
      </div>

      {/* Filter pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} type="button"
            data-testid={`offtaker-obligations-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className="h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
            style={{ background: filter === f.key ? ACC : BG2, color: filter === f.key ? '#fff' : TX2, border: `1px solid ${filter === f.key ? ACC : BORDER}` }}>
            {f.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded border px-3 py-2 text-[11px]"
             style={{ background: 'color-mix(in oklab, var(--bad) 15%, var(--s1))', borderColor: BAD, color: BAD }}>{err}</div>
      )}

      {loading ? (
        <div className="rounded border px-4 py-6 text-center text-[12px]"
             style={{ background: BG1, borderColor: BORDER, color: TX3 }}>Loading...</div>
      ) : (
        <div data-testid="offtaker-obligations-table" className="space-y-2">
          {filtered.map(row => {
            const verifications = verificationsByObligation[row.id] ?? [];
            const cure = cureCountdown(row.cure_deadline_at);
            const pct = row.contracted_mwh > 0 ? Math.round((row.delivered_mwh / row.contracted_mwh) * 1000) / 10 : 0;
            const isTerminal = row.status === 'delivered' || row.status === 'cured' || row.status === 'take_or_pay';

            const chainItem = {
              id: row.id,
              chain_status: row.status,
              sla_deadline_at: row.cure_deadline_at ?? null,
              sla_breached: row.cure_deadline_at ? new Date(row.cure_deadline_at).getTime() < Date.now() : false,
              is_terminal: isTerminal,
            };

            const meta = (
              <span style={{ color: TX3, fontSize: 11 }}>
                {row.ppa_id}
                {' · '}
                {Math.round(row.contracted_mwh).toLocaleString()} MWh contracted
                {' · '}
                {pct}% delivered
                {row.cure_deadline_at ? ` · Cure: ${cure.label}` : ''}
                {row.take_or_pay_amount_zar > 0 ? ` · R${Math.round(row.take_or_pay_amount_zar).toLocaleString()} ToP` : ''}
              </span>
            );

            return (
              <ChainCard
                key={row.id}
                item={chainItem}
                allStates={ALL_STATES}
                branchStates={BRANCH_STATES}
                title={`${row.period_month} · ${row.ppa_id}`}
                meta={meta}
                actions={getActions(row, verifications, () => {}, () => {})}
                onAction={(key, values) => handleAction(row.id, key, values)}
                cascadeTo={[]}
                detail={renderDetail(row, verifications)}
                events={expandedEvents[row.id]}
                onExpand={handleExpand}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded border px-4 py-6 text-center text-[12px]"
                 style={{ background: BG1, borderColor: BORDER, color: TX3 }}>No obligations match this filter.</div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div className="rounded border px-3 py-2 min-w-[100px]" style={{ background: BG1, borderColor: BORDER }}>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: TX3 }}>{label}</div>
      <div className="text-[18px] font-bold tabular-nums" style={{ color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: TX3 }}>{label}</div>
      <div style={{ color: TX1 }}>{value}</div>
    </div>
  );
}

export default ObligationsTab;
