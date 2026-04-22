// ═══════════════════════════════════════════════════════════════════════════
// Monitoring — admin + support console for error_log + request_stats.
// ═══════════════════════════════════════════════════════════════════════════
// Reads from /api/admin/monitoring/{errors,stats,timeseries}. No writes.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

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

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 16,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 12,
  color: '#64748b',
  borderBottom: '1px solid #e5e7eb',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

const tdStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: 13,
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
};

function Tile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'error' | 'warn' | 'ok' }) {
  const color = tone === 'error' ? '#b91c1c' : tone === 'warn' ? '#a16207' : '#0f172a';
  return (
    <div style={{ ...cardStyle, padding: 14, minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: '#64748b' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

export function Monitoring(): JSX.Element {
  const [hours, setHours] = useState(24);
  const [source, setSource] = useState<'all' | 'server' | 'client'>('all');
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [selected, setSelected] = useState<ErrorRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [hours, source]);

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

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Monitoring</h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Structured errors + request stats from the past {hours} hour{hours === 1 ? '' : 's'}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value, 10))}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            aria-label="Time window"
          >
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
            aria-label="Error source"
          >
            <option value="all">All sources</option>
            <option value="server">Server</option>
            <option value="client">Client</option>
          </select>
        </div>
      </div>

      {err && (
        <div style={{ ...cardStyle, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Tile label="Requests" value={stats?.totals.total?.toLocaleString() ?? '—'} />
        <Tile label="5xx" value={stats?.totals.errors?.toLocaleString() ?? '—'} tone={stats && stats.totals.errors > 0 ? 'error' : undefined} />
        <Tile label="Error rate" value={`${errorRate}%`} tone={parseFloat(errorRate) > 1 ? 'error' : undefined} />
        <Tile label="Avg latency" value={`${avgLatency} ms`} tone={avgLatency > 500 ? 'warn' : undefined} />
        <Tile label="Slow req (>1s)" value={stats?.totals.slow?.toLocaleString() ?? '—'} tone={stats && stats.totals.slow > 0 ? 'warn' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 380px)', gap: 16 }}>
        <div style={{ ...cardStyle, padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
            Recent errors ({errors.length})
          </div>
          {loading ? (
            <div style={{ padding: 24, color: '#64748b' }}>Loading…</div>
          ) : errors.length === 0 ? (
            <div style={{ padding: 24, color: '#64748b' }}>
              No errors in the selected window. Nice.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>When</th>
                    <th style={thStyle}>Src</th>
                    <th style={thStyle}>Route</th>
                    <th style={thStyle}>Error</th>
                    <th style={thStyle}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => loadDetail(e)}
                      style={{
                        cursor: 'pointer',
                        background: selected?.id === e.id ? '#f1f5f9' : 'transparent',
                      }}
                    >
                      <td style={tdStyle}>{new Date(e.created_at).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            background: e.source === 'server' ? '#fee2e2' : '#fef3c7',
                            color: e.source === 'server' ? '#991b1b' : '#854d0e',
                          }}
                        >
                          {e.source}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                          {e.method || ''} {e.route || e.url || '—'}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{e.error_name || 'Error'}</div>
                        <div style={{ fontSize: 12, color: '#64748b', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.error_message}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#64748b' }}>
                          {e.participant_id || '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...cardStyle, padding: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
              Top routes by traffic
            </div>
            {stats && stats.by_route.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {stats.by_route.slice(0, 12).map((r) => {
                    const avg = r.total > 0 ? Math.round(r.latency_sum / r.total) : 0;
                    return (
                      <tr key={r.route}>
                        <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                          {r.route}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.total}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: avg > 500 ? '#a16207' : '#0f172a' }}>
                          {avg}ms
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: r.errors > 0 ? '#b91c1c' : '#64748b' }}>
                          {r.errors > 0 ? `${r.errors} err` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>No traffic recorded yet.</div>
            )}
          </div>

          {selected && (
            <div style={{ ...cardStyle, padding: 0 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600 }}>Error detail</div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div style={{ padding: 14, fontSize: 13 }}>
                <div><strong>req_id:</strong> <code>{selected.req_id}</code></div>
                <div><strong>When:</strong> {new Date(selected.created_at).toLocaleString()}</div>
                <div><strong>Route:</strong> <code>{selected.method || ''} {selected.route || selected.url}</code></div>
                <div><strong>Error:</strong> {selected.error_name}</div>
                <div style={{ color: '#991b1b', marginTop: 6 }}>{selected.error_message}</div>
                {selected.error_stack && (
                  <pre
                    style={{
                      marginTop: 10,
                      padding: 10,
                      background: '#0f172a',
                      color: '#e2e8f0',
                      borderRadius: 8,
                      fontSize: 11,
                      overflow: 'auto',
                      maxHeight: 260,
                    }}
                  >
                    {selected.error_stack}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Monitoring;
