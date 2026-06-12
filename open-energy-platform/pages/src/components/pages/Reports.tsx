import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Printer, Sparkles, Filter, Download, Table as TableIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { NarrativeText } from '../NarrativeText';

type Period = '30d' | '90d' | '12m' | 'ytd';

type AiReportPayload = {
  period: string;
  role: string;
  kpis: Record<string, unknown>;
  narrative: { text: string; fallback: boolean };
};

type DetailedReport = {
  role: string;
  generated_at: string;
  summary: Record<string, string | number>;
  sections: Array<{ key: string; label: string; rows: Array<Record<string, string | number | null>> }>;
};

const ROLE_TITLES: Record<string, string> = {
  admin: 'Platform operations report',
  support: 'Support console report',
  trader: 'Trading desk report',
  ipp_developer: 'IPP portfolio report',
  offtaker: 'Offtaker energy & savings report',
  carbon_fund: 'Carbon fund performance report',
  lender: 'Lender credit & cashflow report',
  grid_operator: 'Grid operator balancing report',
  regulator: 'Regulator compliance report',
};

const ROLE_KPI_LAYOUT: Record<string, Array<{ key: string; label: string; format?: (v: unknown) => string }>> = {
  admin: [
    { key: 'participants.c', label: 'Active participants' },
    { key: 'contracts.c', label: 'Contracts in vault' },
    { key: 'trades.c', label: 'Trades in period' },
    { key: 'trades.gmv', label: 'GMV (ZAR)', format: zar },
    { key: 'invoices.c', label: 'Invoices in period' },
    { key: 'invoices.total', label: 'Invoice total (ZAR)', format: zar },
  ],
  trader: [
    { key: 'orders.c', label: 'Orders placed' },
    { key: 'orders.vol', label: 'Volume ordered (MWh)', format: num },
    { key: 'matches.c', label: 'Matches' },
    { key: 'matches.value', label: 'P&L value (ZAR)', format: zar },
  ],
  ipp_developer: [
    { key: 'projects.length', label: 'Projects' },
    { key: 'milestones.length', label: 'Milestones (open)' },
  ],
  offtaker: [
    { key: 'bills.length', label: 'Bills uploaded' },
    { key: 'lois.length', label: 'LOIs drafted' },
    { key: 'invoices.c', label: 'Invoices received' },
    { key: 'invoices.total', label: 'Spend (ZAR)', format: zar },
  ],
  carbon_fund: [
    { key: 'retirements.c', label: 'Retirement events' },
    { key: 'retirements.q', label: 'tCO₂e retired', format: num },
    { key: 'holdings.length', label: 'Methodologies held' },
  ],
  lender: [
    { key: 'disbursements.c', label: 'Disbursements in period' },
    { key: 'disbursements.total', label: 'Disbursed (ZAR)', format: zar },
    { key: 'projects.length', label: 'Portfolio projects' },
  ],
  grid_operator: [
    { key: 'connections.c', label: 'Grid connections' },
    { key: 'nominations.c', label: 'Nominations in period' },
    { key: 'nominations.v', label: 'Volume (MWh)', format: num },
  ],
  regulator: [
    { key: 'audit.length', label: 'Distinct event types' },
  ],
  support: [
    { key: 'tickets.c', label: 'Tickets in period' },
    { key: 'tickets.open', label: 'Open tickets' },
    { key: 'tickets.closed', label: 'Closed tickets' },
  ],
};

const SELECTABLE_ROLES: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'Admin / platform' },
  { value: 'trader', label: 'Trader' },
  { value: 'ipp_developer', label: 'IPP developer' },
  { value: 'offtaker', label: 'Offtaker' },
  { value: 'lender', label: 'Lender' },
  { value: 'carbon_fund', label: 'Carbon fund' },
  { value: 'grid_operator', label: 'Grid operator' },
  { value: 'regulator', label: 'Regulator' },
];

function zar(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
}
function num(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return Math.abs(v) >= 1000 ? num(v) : String(v);
  }
  return String(v);
}
function readPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') {
      const a = acc as Record<string, unknown>;
      if (k === 'length' && Array.isArray(acc)) return acc.length;
      return a[k];
    }
    return undefined;
  }, obj);
}

// Design tokens
const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.12 230)';
const ACC_BG = 'oklch(0.96 0.05 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const BAD_BG = 'oklch(0.97 0.04 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const WARN_BG= 'oklch(0.96 0.05 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const GOOD_BG= 'oklch(0.95 0.04 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

export function Reports() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('90d');
  const [aiData, setAiData] = useState<AiReportPayload | null>(null);
  const [detailed, setDetailed] = useState<DetailedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailedLoading, setDetailedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState<string | null>(null);

  const isAdminLike = user?.role === 'admin' || user?.role === 'support';
  const [selectedRole, setSelectedRole] = useState<string>('');

  useEffect(() => {
    if (user?.role && !selectedRole) setSelectedRole(user.role);
  }, [user?.role, selectedRole]);

  const role = isAdminLike ? (selectedRole || user?.role || '') : (user?.role || '');
  const layout = ROLE_KPI_LAYOUT[role] || [];
  const title = ROLE_TITLES[role] || 'Operations report';

  const loadAi = useCallback(async () => {
    if (!role) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/ai/reports/${role}?period=${period}`);
      setAiData(resp.data?.data as AiReportPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [role, period]);

  const loadDetailed = useCallback(async () => {
    if (!role) return;
    setDetailedLoading(true);
    setDetailedError(null);
    try {
      const resp = await api.get(`/reports/${role}`);
      setDetailed(resp.data?.data as DetailedReport);
    } catch (e) {
      setDetailedError(e instanceof Error ? e.message : 'Failed to load detailed tables');
    } finally {
      setDetailedLoading(false);
    }
  }, [role]);

  useEffect(() => { if (role) void loadAi(); }, [loadAi, role]);
  useEffect(() => { if (role) void loadDetailed(); }, [loadDetailed, role]);

  const kpis = useMemo(() => {
    if (!aiData?.kpis) return [];
    return layout.map((l) => {
      const raw = readPath(aiData.kpis as Record<string, unknown>, l.key);
      return { label: l.label, value: l.format ? l.format(raw) : num(raw) };
    });
  }, [aiData, layout]);

  const downloadCsv = useCallback(async (sectionKey: string) => {
    setCsvBusy(sectionKey);
    try {
      const resp = await api.get(`/reports/${role}/csv?section=${encodeURIComponent(sectionKey)}`, { responseType: 'blob' });
      const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${role}-${sectionKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setDetailedError(e instanceof Error ? e.message : 'CSV download failed');
    } finally {
      setCsvBusy(null);
    }
  }, [role]);

  const summaryEntries = detailed ? Object.entries(detailed.summary) : [];
  const totalRows = detailed
    ? detailed.sections.reduce((acc, s) => acc + s.rows.length, 0)
    : 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FileText size={16} style={{ color: TX3 }} />
            <span style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {role.replace('_', ' ')} — deep reporting
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>{title}</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            AI-narrated executive summary, detailed tables and CSV export — grounded in live platform data.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6,
            padding: '8px 14px', fontSize: 13, color: BAD, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* KPI strip — from AI report */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {loading && layout.map((l) => (
            <div key={l.key} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: '1 1 120px', minWidth: 120, minHeight: 72,
              opacity: 0.5,
            }} />
          ))}
          {!loading && kpis.map((k) => (
            <div key={k.label} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: '1 1 120px', minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Key metrics from /reports/:role */}
        {!detailedLoading && detailed && summaryEntries.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <TableIcon size={13} style={{ color: TX3 }} />
              <span style={{ fontSize: 11, color: TX2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Key metrics
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {summaryEntries.map(([k, v]) => (
                <div key={k} style={{
                  background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '12px 16px', flex: '1 1 120px', minWidth: 120,
                }}>
                  <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {k.replace(/_/g, ' ')}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                    {typeof v === 'number' ? num(v) : String(v)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Executive summary */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          overflow: 'hidden', marginBottom: 20,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
            background: ACC_BG,
          }}>
            <Sparkles size={15} style={{ color: ACC }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: TX1 }}>Executive summary</span>
            {aiData?.narrative?.fallback && (
              <span style={{
                marginLeft: 'auto', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.05em', color: WARN, background: WARN_BG,
                borderRadius: 4, padding: '2px 8px',
              }}>
                Deterministic fallback
              </span>
            )}
          </div>
          <div style={{ padding: '16px 20px' }}>
            {loading ? (
              <div style={{ fontSize: 13, color: TX2, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Generating executive summary…
              </div>
            ) : (
              <NarrativeText
                text={aiData?.narrative?.text}
                emptyLabel="No narrative generated."
              />
            )}
          </div>
        </div>

        {/* Detailed error */}
        {detailedError && (
          <div style={{
            background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6,
            padding: '8px 14px', fontSize: 13, color: BAD, marginBottom: 16,
          }}>
            {detailedError}
          </div>
        )}

        {/* Detailed sections loading */}
        {detailedLoading && (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '20px', fontSize: 13, color: TX2,
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading detailed tables…
          </div>
        )}

        {/* Detailed sections */}
        {!detailedLoading && detailed && detailed.sections.map((section) => (
          <div key={section.key} style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            overflow: 'hidden', marginBottom: 16,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
            }}>
              <TableIcon size={13} style={{ color: TX3 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TX1 }}>{section.label}</span>
              <span style={{ fontSize: 11, color: TX3, marginLeft: 2 }}>({section.rows.length} rows)</span>
              <button
                type="button"
                onClick={() => downloadCsv(section.key)}
                disabled={csvBusy === section.key || section.rows.length === 0}
                aria-label={`Download ${section.label} as CSV`}
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  height: 28, padding: '0 10px', borderRadius: 6,
                  border: `1px solid ${BORDER}`, background: 'transparent',
                  fontSize: 12, color: TX2, cursor: 'pointer',
                  opacity: (csvBusy === section.key || section.rows.length === 0) ? 0.4 : 1,
                }}
              >
                {csvBusy === section.key
                  ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Download size={12} />}
                CSV
              </button>
            </div>
            {section.rows.length === 0 ? (
              <div style={{ padding: '16px 20px', fontSize: 13, color: TX3 }}>No data for this period.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${BORDER}`, background: BG2 }}>
                      {Object.keys(section.rows[0]).map((col) => (
                        <th key={col} style={{
                          textAlign: 'left', padding: '8px 12px', color: TX2,
                          fontWeight: 600, fontSize: 10, textTransform: 'uppercase',
                          letterSpacing: '0.05em', position: 'sticky', top: 0, background: BG2,
                        }}>
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.slice(0, 200).map((row, i) => (
                      <tr key={i} style={{
                        borderBottom: `1px solid ${BORDER}`,
                        background: i % 2 === 1 ? BG2 : 'transparent',
                      }}>
                        {Object.keys(section.rows[0]).map((col) => (
                          <td key={col} style={{
                            padding: '8px 12px', color: TX1,
                            whiteSpace: 'nowrap', fontFamily: typeof row[col] === 'number' ? MONO : 'inherit',
                          }}>
                            {formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {section.rows.length > 200 && (
                  <div style={{
                    padding: '8px 12px', fontSize: 11, color: TX3,
                    background: BG2, borderTop: `1px solid ${BORDER}`,
                  }}>
                    Showing first 200 rows — download CSV for the full set.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Raw KPI payload */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          overflow: 'hidden', marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderBottom: `1px solid ${BORDER}`,
          }}>
            <Filter size={13} style={{ color: TX3 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: TX1 }}>Raw AI KPI payload</span>
          </div>
          <pre style={{
            padding: '16px 20px', fontSize: 11, lineHeight: 1.7, color: TX2,
            maxHeight: 320, overflowY: 'auto', background: BG2,
            fontFamily: MONO, margin: 0,
          }}>
            {aiData ? JSON.stringify(aiData.kpis, null, 2) : ''}
          </pre>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Role selector (admin/support only) */}
        {isAdminLike && (
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Report role
            </div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              aria-label="Select role to report on"
              style={{
                width: '100%', height: 34, padding: '0 10px', borderRadius: 6,
                border: `1px solid ${BORDER}`, background: BG1, fontSize: 13,
                color: TX1, outline: 'none',
              }}
            >
              {SELECTABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Period selector */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Period
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(['30d', '90d', '12m', 'ytd'] as Period[]).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  height: 34, borderRadius: 6, border: period === p ? 'none' : `1px solid ${BORDER}`,
                  background: period === p ? ACC : 'transparent',
                  color: period === p ? '#fff' : TX2,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                height: 36, borderRadius: 6, border: `1px solid ${ACC}`,
                background: 'transparent', color: ACC,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Printer size={13} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Report summary stats */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Report summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Role</span>
              <span style={{ color: TX1, fontWeight: 600, textTransform: 'capitalize' }}>
                {role.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Period</span>
              <span style={{ color: TX1, fontFamily: MONO, fontWeight: 600 }}>{period.toUpperCase()}</span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: TX2 }}>KPI tiles</span>
              <span style={{ color: TX1, fontFamily: MONO, fontWeight: 600 }}>{kpis.length}</span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Sections</span>
              <span style={{ color: TX1, fontFamily: MONO, fontWeight: 600 }}>
                {detailed ? detailed.sections.length : '—'}
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
              <span style={{ color: TX2 }}>Total rows</span>
              <span style={{ color: TX1, fontFamily: MONO, fontWeight: 600 }}>
                {detailed ? totalRows.toLocaleString() : '—'}
              </span>
            </div>
            {detailed?.generated_at && (
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: TX3 }}>Generated</span>
                <span style={{ color: TX3, fontFamily: MONO }}>
                  {new Date(detailed.generated_at).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* AI narrative status */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Sparkles size={13} style={{ color: ACC }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              AI narrative
            </span>
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: TX3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Generating…
            </div>
          ) : aiData?.narrative?.text ? (
            <div style={{ fontSize: 12, color: TX2 }}>
              <span style={{
                display: 'inline-block',
                background: aiData.narrative.fallback ? WARN_BG : GOOD_BG,
                color: aiData.narrative.fallback ? WARN : GOOD,
                borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600,
              }}>
                {aiData.narrative.fallback ? 'Deterministic fallback' : 'AI generated'}
              </span>
              <div style={{ marginTop: 6, color: TX3, lineHeight: 1.5 }}>
                {aiData.narrative.text.slice(0, 120)}{aiData.narrative.text.length > 120 ? '…' : ''}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: TX3 }}>No narrative available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Reports;
