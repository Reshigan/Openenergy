// ════════════════════════════════════════════════════════════════════════
// FundDetail — /funds/:id  (mockup-b layout)
//
// Two-column fixed-height shell. Left: tab content. Right: nav, KPIs,
// AI assists. All API calls, state, and handlers preserved from the
// original EntityFileShell + fundFileConfig composition.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { OEIcon } from '../OEIcon';
import { VaultPanel } from '../VaultPanel';
import { ThreadPanel } from '../ThreadPanel';
import { fundHero, type FundFileData } from '../file/fundFileConfig';
import { fmtZAR, fmtNum, fmtDate } from '../file/FileTable';

// ── Design tokens ─────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ── Status badge helper ───────────────────────────────────────────────────
function StatusBadge({ value }: { value: string }) {
  const v = (value || '').toLowerCase();
  const isGood = ['active', 'clean', 'passed', 'approved', 'accepted', 'completed', 'closed'].includes(v);
  const isBad  = ['breached', 'failed', 'rejected', 'cancelled', 'defaulted', 'overdue'].includes(v);
  const isWarn = ['pending', 'watch', 'warning', 'drawdown', 'in_review', 'escalated'].includes(v);
  const bg    = isGood ? GOOD_BG : isBad ? BAD_BG : isWarn ? WARN_BG : BG2;
  const color = isGood ? GOOD    : isBad ? BAD    : isWarn ? WARN    : TX2;
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
      {value}
    </span>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const valueColor = tone === 'good' ? GOOD : tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor, fontFamily: MONO, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────
function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: subtitle ? 2 : 12 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: TX3, marginBottom: 12 }}>{subtitle}</div>
      )}
      {children}
    </div>
  );
}

// ── Key-value row ─────────────────────────────────────────────────────────
function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 13, color: TX2 }}>{label}</span>
      <span style={{ fontSize: 13, color: TX1, fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

// ── Micro KPI (inside tab content) ───────────────────────────────────────
function MicroKpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const valueColor = tone === 'good' ? GOOD : tone === 'bad' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: valueColor, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ── Overview tab content (inlined here for styling consistency) ───────────
function OverviewTab({ data }: { data: FundFileData }) {
  const f = data.facility;
  const s = data.summary;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
      <SectionCard title="Facility facts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <KvRow label="Facility ID" value={<span style={{ fontFamily: MONO, fontSize: 12 }}>{f.id}</span>} />
          <KvRow label="Type" value={(f.facility_type || '').replace(/_/g, ' ') || '—'} />
          <KvRow label="Status" value={<StatusBadge value={f.status} />} />
          <KvRow label="Currency" value={f.currency || 'ZAR'} />
          <KvRow label="Interest rate" value={f.interest_rate_pct != null ? `${fmtNum(Number(f.interest_rate_pct), 2)}%` : '—'} />
          <KvRow label="Tenor" value={f.tenor_months ? `${f.tenor_months} months` : '—'} />
          <KvRow label="DSCR covenant" value={f.dscr_covenant ? fmtNum(Number(f.dscr_covenant), 2) : '—'} />
          <KvRow label="Created" value={fmtDate(f.created_at)} />
        </div>
      </SectionCard>

      <div>
        <SectionCard title="Capital snapshot">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <MicroKpi label="Committed" value={fmtZAR(Number(s.committed_zar || 0))} />
            <MicroKpi label="Drawn" value={fmtZAR(Number(s.drawn_zar || 0))} tone="good" />
            <MicroKpi label="Available" value={fmtZAR(Number(s.available_zar || 0))} />
            <MicroKpi
              label="Utilisation"
              value={s.utilisation_pct != null ? `${fmtNum(Number(s.utilisation_pct), 0)}%` : '—'}
              tone={s.utilisation_pct != null && Number(s.utilisation_pct) < 30 ? 'warn' : 'good'}
            />
            <MicroKpi
              label="Latest DSCR"
              value={s.latest_dscr_value != null ? fmtNum(Number(s.latest_dscr_value), 2) : '—'}
              tone={s.latest_dscr_value != null && Number(s.latest_dscr_value) < Number(s.dscr_covenant || 1.2) ? 'bad' : 'good'}
            />
            <MicroKpi
              label="Covenants breached"
              value={Number(s.covenants_breached || 0)}
              tone={Number(s.covenants_breached || 0) > 0 ? 'bad' : 'good'}
            />
            <MicroKpi
              label="Pending drawdowns"
              value={Number(s.pending_disbursements || 0)}
              tone={Number(s.pending_disbursements || 0) > 0 ? 'warn' : undefined}
            />
            <MicroKpi
              label="Months to maturity"
              value={s.months_to_maturity != null ? `${s.months_to_maturity}` : '—'}
              tone={s.months_to_maturity != null && Number(s.months_to_maturity) <= 18 ? 'warn' : undefined}
            />
          </div>
        </SectionCard>

        <SectionCard title="Linked project" subtitle="Construction or operating asset financed by this facility.">
          {data.project ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Project', value: <a href={`/projects/${data.project.id}`} style={{ color: ACC, fontWeight: 600, textDecoration: 'none' }}>{data.project.project_name || data.project.id}</a> },
                { label: 'Technology', value: (data.project.technology || '').replace(/_/g, ' ') || '—' },
                { label: 'Location', value: data.project.province || '—' },
                { label: 'Capacity', value: data.project.capacity_mw ? `${data.project.capacity_mw} MW` : '—' },
                { label: 'Status', value: <StatusBadge value={data.project.status} /> },
                { label: 'COD', value: fmtDate(data.project.cod_date) },
                { label: 'PPA price', value: data.project.tariff_zar_per_mwh ? `R${fmtNum(Number(data.project.tariff_zar_per_mwh), 0)}/MWh` : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 13, color: TX1, fontWeight: 500, marginTop: 4 }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 13, color: TX3, padding: '24px 0' }}>No project linked to this facility.</div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ── Parties tab ───────────────────────────────────────────────────────────
function PartiesTab({ data }: { data: FundFileData }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <SectionCard title="Lender">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <KvRow label="Name" value={data.parties.lender.name || '—'} />
          <KvRow label="Email" value={data.parties.lender.email || '—'} />
          <KvRow label="Participant ID" value={<span style={{ fontFamily: MONO, fontSize: 12 }}>{data.parties.lender.id}</span>} />
        </div>
      </SectionCard>
      <SectionCard title="Borrower">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <KvRow label="Name" value={data.parties.borrower?.name || '—'} />
          <KvRow label="Email" value={data.parties.borrower?.email || '—'} />
          <KvRow label="Participant ID" value={<span style={{ fontFamily: MONO, fontSize: 12 }}>{data.parties.borrower?.id || '—'}</span>} />
        </div>
      </SectionCard>
    </div>
  );
}

// ── Data table (mockup-b styled) ──────────────────────────────────────────
interface ColDef {
  key: string;
  label: string;
  mono?: boolean;
  align?: 'left' | 'right';
  render?: (row: any) => React.ReactNode;
}

function DataTable({ rows, columns, emptyMessage }: { rows: any[]; columns: ColDef[]; emptyMessage: string }) {
  if (!rows || rows.length === 0) {
    return <div style={{ textAlign: 'center', fontSize: 13, color: TX3, padding: '32px 0' }}>{emptyMessage}</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: (col.align || 'left') as 'left' | 'right',
                  padding: '8px 12px',
                  color: TX2,
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '10px 12px',
                    color: TX1,
                    fontFamily: col.mono ? MONO : undefined,
                    fontSize: col.mono ? 12 : 13,
                    textAlign: col.align || 'left',
                  }}
                >
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function FundDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<FundFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/funder/facilities/${id}/file`);
      setData((res.data?.data ?? null) as FundFileData | null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number }; message?: string };
      setError(
        err.response?.status === 404
          ? 'Record not found.'
          : err.message || 'Failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) refresh();
  }, [refresh, id]);

  const activeTabId = searchParams.get('tab') || 'overview';
  const setActiveTab = (tabId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  if (!id) return null;

  if (loading) {
    return (
      <div style={{ padding: '32px', background: BG, minHeight: 'calc(100vh - 50px)' }}>
        <Skeleton variant="card" rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '32px', background: BG, minHeight: 'calc(100vh - 50px)' }}>
        <ErrorBanner message={error || 'No data.'} onRetry={refresh} />
        <Link
          to="/funds"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: ACC, textDecoration: 'none', marginTop: 16 }}
        >
          <OEIcon name="chevron-left" size={14} /> All funds
        </Link>
      </div>
    );
  }

  const hero = fundHero(data);
  const s = data.summary;
  const suggestions = data.ai_suggestions || [];

  const breached     = Number(s.covenants_breached || 0);
  const utilisationPct = s.utilisation_pct != null ? Number(s.utilisation_pct) : null;
  const pendingDrawdowns = Number(s.pending_disbursements || 0);
  const pendingActions   = Number(s.pending_actions || 0);

  // Tab definitions for the right-panel badge counts
  const tabDefs = [
    { id: 'overview',       label: 'Overview',      badge: null },
    { id: 'parties',        label: 'Parties',        badge: null },
    { id: 'covenants',      label: 'Covenants',      badge: Number(s.covenants_breached || 0) || Number(s.covenants_total || 0) || null },
    { id: 'disbursements',  label: 'Drawdowns',      badge: pendingDrawdowns || null },
    { id: 'actions',        label: 'Action queue',   badge: pendingActions || null },
    { id: 'ai',             label: 'AI history',     badge: Number(s.ai_decisions || 0) || null },
    { id: 'audit',          label: 'Audit',          badge: Number(s.audit_events || 0) || null },
    { id: 'documents',      label: 'Documents',      badge: null },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link
              to="/funds"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: TX2, textDecoration: 'none', fontWeight: 500 }}
            >
              <OEIcon name="chevron-left" size={12} /> All funds
            </Link>
            <span style={{ color: TX3, fontSize: 12 }}>·</span>
            <span style={{ fontSize: 11, color: TX3, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Debt facility · {data.facility.status}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>
                {hero.title}
              </h1>
              {hero.subtitle && (
                <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>{hero.subtitle}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 4 }}>
              {data.project?.id && (
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${data.project.id}`)}
                  style={{ background: BG1, color: ACC, border: `1px solid ${ACC}`, padding: '7px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <OEIcon name="workflow" size={13} /> Open project file
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <KpiCard
            label="Committed"
            value={fmtZAR(Number(s.committed_zar || 0))}
          />
          <KpiCard
            label="Drawn"
            value={fmtZAR(Number(s.drawn_zar || 0))}
            tone={breached > 0 ? 'bad' : utilisationPct != null && utilisationPct < 30 ? 'warn' : 'good'}
          />
          <KpiCard
            label="Latest DSCR"
            value={s.latest_dscr_value != null ? fmtNum(Number(s.latest_dscr_value), 2) : '—'}
            tone={s.latest_dscr_value != null && Number(s.latest_dscr_value) < Number(s.dscr_covenant || 1.2) ? 'bad' : s.latest_dscr_value != null ? 'good' : undefined}
          />
          <KpiCard
            label="Months to maturity"
            value={s.months_to_maturity != null ? `${s.months_to_maturity}` : '—'}
            tone={s.months_to_maturity != null && Number(s.months_to_maturity) <= 18 ? 'warn' : undefined}
          />
        </div>

        {/* Tab strip */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          background: BG1,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: 4,
          marginBottom: 20,
        }}>
          {tabDefs.map((t) => {
            const active = t.id === activeTabId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: active ? ACC : 'transparent',
                  color: active ? '#fff' : TX2,
                  transition: 'background 0.12s',
                }}
              >
                {t.label}
                {t.badge !== null && t.badge !== undefined && t.badge > 0 && (
                  <span style={{
                    background: active ? 'rgba(255,255,255,0.25)' : BG2,
                    color: active ? '#fff' : TX2,
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontSize: 10,
                    fontFamily: MONO,
                    fontWeight: 700,
                  }}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div>
          {activeTabId === 'overview' && <OverviewTab data={data} />}

          {activeTabId === 'parties' && <PartiesTab data={data} />}

          {activeTabId === 'covenants' && (
            <SectionCard title="Loan covenants" subtitle="DSCR, LLCR, leverage and any bespoke triggers — sorted breached → watch → clean.">
              <DataTable
                rows={data.covenants}
                emptyMessage="No covenants on file."
                columns={[
                  { key: 'covenant_type', label: 'Type', render: (r) => (r.covenant_type || '').replace(/_/g, ' ') },
                  { key: 'threshold', label: 'Threshold', mono: true, align: 'right', render: (r) => r.threshold != null ? fmtNum(Number(r.threshold), 2) : '—' },
                  { key: 'last_value', label: 'Last value', mono: true, align: 'right', render: (r) => r.last_value != null ? fmtNum(Number(r.last_value), 2) : '—' },
                  { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                  { key: 'last_checked_at', label: 'Last checked', mono: true, render: (r) => fmtDate(r.last_checked_at) },
                  { key: 'notes', label: 'Notes' },
                ]}
              />
            </SectionCard>
          )}

          {activeTabId === 'disbursements' && (
            <SectionCard title="Disbursement requests" subtitle="Draw-down tranches against this facility, in chronological order.">
              <DataTable
                rows={data.disbursements}
                emptyMessage="No drawdown requests recorded."
                columns={[
                  { key: 'id', label: 'Request', mono: true },
                  { key: 'amount', label: 'Amount', align: 'right', mono: true, render: (r) => fmtZAR(Number(r.amount || 0)) },
                  { key: 'currency', label: 'Currency' },
                  { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                  { key: 'requested_by', label: 'Requested by', mono: true },
                  { key: 'approved_by', label: 'Approved by', mono: true },
                  { key: 'approved_at', label: 'Approved', mono: true, render: (r) => fmtDate(r.approved_at) },
                  { key: 'created_at', label: 'Requested', mono: true, render: (r) => fmtDate(r.created_at) },
                ]}
              />
            </SectionCard>
          )}

          {activeTabId === 'actions' && (
            <SectionCard title="Outstanding tasks" subtitle="All cascaded action items emitted by this facility, its covenants and drawdowns.">
              <DataTable
                rows={data.action_queue}
                emptyMessage="No action items in flight."
                columns={[
                  { key: 'action_type', label: 'Action', render: (r) => (r.action_type || '').replace(/_/g, ' ') },
                  { key: 'severity', label: 'Severity', render: (r) => <StatusBadge value={r.severity} /> },
                  { key: 'assigned_to', label: 'Assigned', mono: true },
                  { key: 'entity_type', label: 'On', mono: true },
                  { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
                  { key: 'due_at', label: 'Due', mono: true, render: (r) => fmtDate(r.due_at) },
                  { key: 'completed_at', label: 'Completed', mono: true, render: (r) => fmtDate(r.completed_at) },
                ]}
              />
            </SectionCard>
          )}

          {activeTabId === 'ai' && (
            <SectionCard title="AI decisions on this facility" subtitle="Cashflow forecasts, sensitivity sweeps, covenant triage — recorded for audit.">
              <DataTable
                rows={data.ai_decisions}
                emptyMessage="No AI activity recorded against this facility yet."
                columns={[
                  { key: 'surface', label: 'Surface', render: (r) => (r.surface || '').replace(/_/g, ' ') },
                  { key: 'intent', label: 'Intent', render: (r) => (r.intent || '').replace(/_/g, ' ') },
                  { key: 'model', label: 'Model', mono: true },
                  { key: 'accepted', label: 'Accepted', render: (r) => r.accepted === 1 ? 'Yes' : r.accepted === 0 ? 'Dismissed' : '—' },
                  { key: 'fallback', label: 'Fallback', render: (r) => r.fallback ? 'Yes' : 'No' },
                  { key: 'created_at', label: 'When', mono: true, render: (r) => fmtDate(r.created_at) },
                ]}
              />
            </SectionCard>
          )}

          {activeTabId === 'audit' && (
            <>
              <SectionCard title="Tamper-evident events" subtitle="Each event hash-anchors the previous one.">
                <DataTable
                  rows={data.audit.events}
                  emptyMessage="No tamper-evident events emitted yet."
                  columns={[
                    { key: 'event_type', label: 'Event', render: (r) => (r.event_type || '').replace(/_/g, ' ') },
                    { key: 'entity_type', label: 'On', mono: true },
                    { key: 'created_at', label: 'When', mono: true, render: (r) => fmtDate(r.created_at) },
                    { key: 'actor_id', label: 'Actor', mono: true },
                    { key: 'hash', label: 'Hash', mono: true, render: (r) => r.hash ? String(r.hash).slice(0, 12) + '…' : '—' },
                  ]}
                />
              </SectionCard>
              <SectionCard title="Activity log" subtitle="Free-form mutations recorded against this facility and its children.">
                <DataTable
                  rows={data.audit.logs}
                  emptyMessage="No activity recorded."
                  columns={[
                    { key: 'action', label: 'Action' },
                    { key: 'user_email', label: 'Actor' },
                    { key: 'resource_type', label: 'On', mono: true },
                    { key: 'timestamp', label: 'When', mono: true, render: (r) => fmtDate(r.timestamp) },
                    { key: 'status', label: 'Status' },
                  ]}
                />
              </SectionCard>
            </>
          )}

          {activeTabId === 'documents' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <VaultPanel entityType="facilities" entityId={id} title="Documents" />
              <ThreadPanel entityType="facilities" entityId={id} title="Discussion" />
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Facility identity */}
        <div style={{ background: BG2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Facility
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX1 }}>{hero.title}</div>
          <div style={{ fontSize: 12, color: TX2, marginTop: 2 }}>
            {(data.facility.facility_type || 'senior debt').replace(/_/g, ' ')}
          </div>
          <div style={{ marginTop: 8 }}>
            <StatusBadge value={data.facility.status} />
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Committed', value: fmtZAR(Number(s.committed_zar || 0)) },
              { label: 'Drawn', value: fmtZAR(Number(s.drawn_zar || 0)) },
              { label: 'Available', value: fmtZAR(Number(s.available_zar || 0)) },
              { label: 'Utilisation', value: utilisationPct != null ? `${fmtNum(utilisationPct, 0)}%` : '—' },
              { label: 'DSCR', value: s.latest_dscr_value != null ? fmtNum(Number(s.latest_dscr_value), 2) : '—' },
              { label: 'Covenants breached', value: String(breached) },
              { label: 'Pending drawdowns', value: String(pendingDrawdowns) },
              { label: 'Months to maturity', value: s.months_to_maturity != null ? `${s.months_to_maturity}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ color: TX2 }}>{label}</span>
                <span style={{ color: TX1, fontWeight: 600, fontFamily: MONO }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick nav */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Navigate
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {tabDefs.map((t) => {
              const active = t.id === activeTabId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    border: active ? `1px solid ${ACC}` : `1px solid transparent`,
                    background: active ? ACC_BG : 'transparent',
                    color: active ? ACC : TX1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {t.label}
                  {t.badge !== null && t.badge !== undefined && t.badge > 0 && (
                    <span style={{
                      background: active ? ACC : BAD_BG,
                      color: active ? '#fff' : BAD,
                      padding: '1px 7px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontFamily: MONO,
                      fontWeight: 700,
                    }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI insights */}
        {suggestions.length > 0 && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              AI insights
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.slice(0, 3).map((s: any) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => s.tab && setActiveTab(s.tab)}
                  style={{
                    textAlign: 'left',
                    background: 'oklch(0.97 0.012 250)',
                    border: '1px solid oklch(0.87 0.02 250)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: ACC, marginTop: 1 }}><OEIcon name="spark" size={13} /></span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: TX2, marginTop: 2 }}>{s.why}</div>
                      {s.accept && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: ACC, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {s.accept.label} <OEIcon name="chevron-right" size={11} />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lender / borrower quick reference */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Parties
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Lender</div>
              <div style={{ fontSize: 13, color: TX1, fontWeight: 500, marginTop: 2 }}>{data.parties.lender.name || '—'}</div>
              <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{data.parties.lender.email || ''}</div>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Borrower</div>
              <div style={{ fontSize: 13, color: TX1, fontWeight: 500, marginTop: 2 }}>{data.parties.borrower?.name || '—'}</div>
              <div style={{ fontSize: 11, color: TX3, fontFamily: MONO }}>{data.parties.borrower?.email || ''}</div>
            </div>
          </div>
        </div>

        {/* Facility meta */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Facility meta
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Interest rate', value: data.facility.interest_rate_pct != null ? `${fmtNum(Number(data.facility.interest_rate_pct), 2)}%` : '—' },
              { label: 'Tenor', value: data.facility.tenor_months ? `${data.facility.tenor_months} months` : '—' },
              { label: 'Currency', value: data.facility.currency || 'ZAR' },
              { label: 'DSCR covenant', value: data.facility.dscr_covenant ? fmtNum(Number(data.facility.dscr_covenant), 2) : '—' },
              { label: 'Created', value: fmtDate(data.facility.created_at) },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: TX2 }}>{label}</span>
                <span style={{ color: TX1, fontWeight: 500, fontFamily: MONO, fontSize: 11 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default FundDetail;
