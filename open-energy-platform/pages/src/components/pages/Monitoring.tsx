// ═══════════════════════════════════════════════════════════════════════════
// Monitoring — admin + support console for error_log + request_stats.
// ═══════════════════════════════════════════════════════════════════════════
// Reads from /api/admin/monitoring/{errors,stats,timeseries}. No writes.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// ── Color tokens ────────────────────────────────────────────────────────────
const BG      = 'var(--s0, oklch(0.96 0.003 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BG2     = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3     = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC     = 'var(--accent, oklch(0.46 0.12 230))';
const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const WARN    = 'var(--accent, oklch(0.50 0.18 55))';
const WARN_BG = 'color-mix(in oklab, var(--warn) 15%, var(--s1))';
const GOOD    = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG = 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ── Interfaces ───────────────────────────────────────────────────────────────
interface ErrorRow {
  id: string;
  req_id: string;
  source: 'server' | 'client';
  severity: string;
  route: string | null;
  method: string | null;
  status: number | null;
  participant_id: string | null;
  tenant_id: string | null;
  error_name: string | null;
  error_message: string | null;
  error_stack?: string | null;
  user_agent: string | null;
  url: string | null;
  created_at: string;
}

interface RouteStatRow {
  route: string;
  total: number;
  latency_sum: number;
  latency_max: number;
  slow: number;
  errors: number;
}

interface StatusClassRow {
  status_class: '2xx' | '3xx' | '4xx' | '5xx' | string;
  total: number;
  slow: number;
}

interface StatsResp {
  since: string;
  hours: number;
  totals: { total: number; latency_sum: number; slow: number; errors: number };
  by_route: RouteStatRow[];
  by_status_class: StatusClassRow[];
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'error' | 'warn' | 'ok' }) {
  const valueColor = tone === 'error' ? BAD : tone === 'warn' ? WARN : TX1;
  return (
    <div style={{
      background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '12px 16px', flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: valueColor, fontFamily: MONO, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Monitoring(): React.JSX.Element {
  const [hours, setHours] = useState(24);
  const [source, setSource] = useState<'all' | 'server' | 'client'>('all');
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setLoading(true);
      setErr(null);
      try {
        const since = new Date(Date.now() - hours * 3600_000).toISOString();
        const errQuery = source === 'all' ? `since=${since}` : `since=${since}&source=${source}`;
        const [eRes, sRes] = await Promise.all([
          api.get<{ success: true; items: ErrorRow[] }>(`/api/admin/monitoring/errors?${errQuery}`),
          api.get<{ success: true } & StatsResp>(`/api/admin/monitoring/stats?hours=${hours}`),
        ]);
        if (cancelled) return;
        setErrors(eRes.data.items || []);
        setStats(sRes.data);
      } catch (e: unknown) {
        if (!cancelled) setErr((e as Error).message || 'Failed to load monitoring data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [hours, source, retryCount]);

  async function loadDetail(row: ErrorRow): Promise<void> {
    try {
      const res = await api.get<{ success: true; item: ErrorRow }>(`/api/admin/monitoring/errors/${row.id}`);
      setSelected(res.data.item);
    } catch {
      setSelected(row);
    }
  }

  const avgLatency =
    stats && stats.totals.total > 0 ? Math.round(stats.totals.latency_sum / stats.totals.total) : 0;
  const errorRate =
    stats && stats.totals.total > 0 ? ((stats.totals.errors / stats.totals.total) * 100).toFixed(2) : '0.00';

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px',
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: BG1,
    color: TX1,
    fontSize: 13,
    cursor: 'pointer',
    width: '100%',
  };

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
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Monitoring</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Structured errors + request stats from the past {hours} hour{hours === 1 ? '' : 's'}.
          </p>
        </div>

        {/* Error banner */}
        {err && (
          <div style={{
            background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8,
            color: BAD, padding: '12px 16px', marginBottom: 20, fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <span>{err}</span>
            <button
              onClick={() => setRetryCount(n => n + 1)}
              style={{ flexShrink: 0, padding: '4px 12px', borderRadius: 5, border: `1px solid ${BAD}`, background: 'transparent', color: BAD, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
            >Retry</button>
          </div>
        )}

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <KpiCard label="Requests" value={stats?.totals.total?.toLocaleString() ?? '—'} />
          <KpiCard
            label="5xx Errors"
            value={stats?.totals.errors?.toLocaleString() ?? '—'}
            tone={stats && stats.totals.errors > 0 ? 'error' : undefined}
          />
          <KpiCard
            label="Error Rate"
            value={`${errorRate}%`}
            tone={parseFloat(errorRate) > 1 ? 'error' : undefined}
          />
          <KpiCard
            label="Avg Latency"
            value={`${avgLatency}ms`}
            tone={avgLatency > 500 ? 'warn' : undefined}
          />
          <KpiCard
            label="Slow (>1s)"
            value={stats?.totals.slow?.toLocaleString() ?? '—'}
            tone={stats && stats.totals.slow > 0 ? 'warn' : undefined}
          />
        </div>

        {/* Error log table */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          overflow: 'hidden', marginBottom: 20,
        }}>
          <div style={{
            padding: '14px 20px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recent Errors
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: TX3,
              background: BG2, padding: '2px 8px', borderRadius: 12, fontFamily: MONO,
            }}>
              {errors.length}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, color: TX3, fontSize: 13 }}>Loading…</div>
          ) : errors.length === 0 ? (
            <div style={{ padding: 24, color: TX3, fontSize: 13 }}>No errors in the selected window.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>When</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Route</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Error</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr
                      key={e.id}
                      onClick={() => loadDetail(e)}
                      style={{
                        borderBottom: `1px solid ${BORDER}`,
                        background: selected?.id === e.id
                          ? 'oklch(0.94 0.03 250)'
                          : i % 2 === 1 ? BG2 : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '10px 12px', color: TX2, fontSize: 12, fontFamily: MONO, whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: e.source === 'server' ? BAD_BG : WARN_BG,
                          color: e.source === 'server' ? BAD : WARN,
                        }}>
                          {e.source}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: TX1 }}>
                        {e.method ? <span style={{ color: ACC, fontWeight: 600 }}>{e.method} </span> : null}
                        {e.route || e.url || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: BAD, fontSize: 12 }}>{e.error_name || 'Error'}</div>
                        <div style={{ fontSize: 11, color: TX3, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.error_message}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX3 }}>
                        {e.participant_id || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Error detail (shown inline below the table when a row is selected) */}
        {selected && (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{
              padding: '12px 20px', borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Error Detail
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  background: 'transparent', border: `1px solid ${BORDER}`,
                  color: TX2, cursor: 'pointer', borderRadius: 6,
                  padding: '2px 10px', fontSize: 12, fontWeight: 600,
                }}
                aria-label="Close"
              >
                ✕ Close
              </button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Request ID</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: TX1 }}>{selected.req_id}</div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Timestamp</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: TX1 }}>{new Date(selected.created_at).toLocaleString()}</div>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Route</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: TX1 }}>
                    {selected.method ? <span style={{ color: ACC, fontWeight: 600 }}>{selected.method} </span> : null}
                    {selected.route || selected.url}
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: TX3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Error</div>
                <div style={{ fontWeight: 700, color: BAD, fontSize: 13 }}>{selected.error_name}</div>
                <div style={{ color: TX2, fontSize: 13, marginTop: 4 }}>{selected.error_message}</div>
              </div>
              {selected.error_stack && (
                <pre style={{
                  marginTop: 8, padding: '12px 16px',
                  background: 'var(--ink, oklch(0.13 0.012 250))',
                  color: 'var(--border-subtle, oklch(0.88 0.008 250))',
                  borderRadius: 8, fontSize: 11,
                  overflow: 'auto', maxHeight: 260,
                  fontFamily: MONO, lineHeight: 1.6,
                }}>
                  {selected.error_stack}
                </pre>
              )}
            </div>
          </div>
        )}
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
        {/* Filters */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Filters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, marginBottom: 4 }}>TIME WINDOW</div>
              <select
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value, 10))}
                style={selectStyle}
                aria-label="Time window"
              >
                <option value={1}>Last 1 hour</option>
                <option value={6}>Last 6 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={72}>Last 3 days</option>
                <option value={168}>Last 7 days</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, marginBottom: 4 }}>ERROR SOURCE</div>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
                style={selectStyle}
                aria-label="Error source"
              >
                <option value="all">All sources</option>
                <option value="server">Server only</option>
                <option value="client">Client only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Status class breakdown */}
        {stats && stats.by_status_class.length > 0 && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Status Classes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.by_status_class.map((sc) => {
                const isError = sc.status_class === '5xx';
                const isWarn = sc.status_class === '4xx';
                const isGood = sc.status_class === '2xx';
                const bgColor = isError ? BAD_BG : isWarn ? WARN_BG : isGood ? GOOD_BG : 'var(--s2, oklch(0.94 0.003 250))';
                const textColor = isError ? BAD : isWarn ? WARN : isGood ? GOOD : TX2;
                return (
                  <div key={sc.status_class} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: 6, background: bgColor,
                  }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: textColor }}>
                      {sc.status_class}
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: textColor }}>
                        {sc.total.toLocaleString()}
                      </span>
                      {sc.slow > 0 && (
                        <div style={{ fontSize: 10, color: WARN, fontFamily: MONO }}>{sc.slow} slow</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top routes */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Top Routes
            </div>
          </div>
          {stats && stats.by_route.length ? (
            <div style={{ padding: '8px 0' }}>
              {stats.by_route.slice(0, 12).map((r, i) => {
                const avg = r.total > 0 ? Math.round(r.latency_sum / r.total) : 0;
                return (
                  <div key={r.route} style={{
                    padding: '8px 20px',
                    borderBottom: i < Math.min(stats.by_route.length, 12) - 1 ? `1px solid ${BORDER}` : 'none',
                    background: i % 2 === 1 ? 'var(--s1, oklch(0.97 0.002 250))' : 'transparent',
                  }}>
                    <div style={{
                      fontFamily: MONO, fontSize: 11, color: TX1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 4,
                    }}>
                      {r.route}
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span style={{ color: TX2, fontFamily: MONO }}>{r.total.toLocaleString()} req</span>
                      <span style={{ color: avg > 500 ? WARN : TX3, fontFamily: MONO }}>{avg}ms avg</span>
                      {r.errors > 0 && (
                        <span style={{ color: BAD, fontFamily: MONO, fontWeight: 700 }}>{r.errors} err</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '16px 20px', color: TX3, fontSize: 13 }}>No traffic recorded yet.</div>
          )}
        </div>

        {/* Loading state indicator */}
        {loading && (
          <div style={{
            padding: '10px 16px', borderRadius: 8,
            background: 'color-mix(in oklab, var(--accent) 15%, var(--s1))',
            border: `1px solid ${BORDER}`,
            fontSize: 12, color: TX2, textAlign: 'center', fontWeight: 600,
          }}>
            Refreshing data…
          </div>
        )}
      </div>
    </div>
  );
}

export default Monitoring;
