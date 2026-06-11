// W7 — National Dashboard: Bloomberg-density operator view of the entire platform.
// Reads /api/national-dashboard — only ever touches pre-aggregated rollup tables.
// Admin-only. Surfaced at /dashboard.
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

// ─── Design tokens ────────────────────────────────────────────────────────────

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const WARN    = 'oklch(0.50 0.18 55)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Kpis {
  active_chains: number;
  events_24h: number;
  sla_breach_rate_pct: number;
  value_30d_zar: number;
  open_actions: number;
  regulator_crossings_30d: number;
}

interface DomainRollup {
  domain: string;
  chains_active: number;
  events_30d: number;
  breach_rate_pct: number;
  value_30d_zar: number;
}

interface ChainHealth {
  chain_key: string;
  open_count: number;
  breach_count: number;
  events_30d: number;
  value_30d_zar: number;
  sla_adherence_pct: number;
}

interface QueueDepth {
  role: string;
  pending: number;
}

interface EventPoint {
  date: string;
  events: number;
  value_zar: number;
}

interface DashboardData {
  kpis: Kpis;
  domain_rollups: DomainRollup[];
  chain_health: ChainHealth[];
  role_queue_depth: QueueDepth[];
  event_trend: EventPoint[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtZAR = (v: number) =>
  v >= 1_000_000_000
    ? `R${(v / 1_000_000_000).toFixed(1)}B`
    : v >= 1_000_000
    ? `R${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `R${(v / 1_000).toFixed(0)}K`
    : `R${v.toFixed(0)}`;

const fmtNum = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v);

const pct = (v: number) => `${v.toFixed(1)}%`;

// ─── Domain meta ─────────────────────────────────────────────────────────────

const DOMAIN_DOT: Record<string, string> = {
  trading:   'oklch(0.30 0.14 250)',
  carbon:    'oklch(0.40 0.16 155)',
  ipp:       'oklch(0.38 0.18 295)',
  lender:    'oklch(0.46 0.16 55)',
  offtaker:  'oklch(0.35 0.16 230)',
  grid:      'oklch(0.48 0.20 20)',
  regulator: 'oklch(0.36 0.14 185)',
  support:   'oklch(0.55 0.06 250)',
  esums:     'oklch(0.52 0.18 75)',
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return <div style={{ height: 32, width: '100%' }} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const H = 32;
  const W = 100;
  const step = W / (points.length - 1);
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 32, display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NationalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: DashboardData }>('/national-dashboard');
      setData(res.data.data);
      setLastUpdated(new Date().toLocaleTimeString('en-ZA'));
    } catch (e: unknown) {
      const axiosErr = e as { response?: { data?: { error?: string } }; message?: string };
      setError(axiosErr?.response?.data?.error ?? axiosErr?.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 380px',
        height: 'calc(100vh - 50px)',
        background: BG,
        overflow: 'hidden',
      }}>
        <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ height: 28, width: 240, background: BORDER, borderRadius: 6, marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ flex: 1, height: 72, background: BORDER, borderRadius: 8 }} />
            ))}
          </div>
          <div style={{ height: 320, background: BORDER, borderRadius: 8 }} />
        </div>
        <div style={{ borderLeft: `1px solid ${BORDER}`, background: BG1, padding: '24px 20px' }}>
          <div style={{ height: 200, background: BORDER, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: 24, background: BG, minHeight: 'calc(100vh - 50px)' }}>
        <div style={{
          background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8,
          padding: '12px 16px', color: BAD, fontSize: 13,
        }}>
          {error === 'Admin only' ? 'This page requires admin access.' : `Error: ${error}`}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const kpis = data.kpis;
  const eventVals = data.event_trend.map(p => p.events);
  const valueVals = data.event_trend.map(p => p.value_zar);
  const totalEvents = eventVals.reduce((a, b) => a + b, 0);
  const avgEvents = Math.round(totalEvents / Math.max(data.event_trend.length, 1));
  const totalValue = valueVals.reduce((a, b) => a + b, 0);
  const queueMax = Math.max(...data.role_queue_depth.map(r => r.pending), 1);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>

      {/* ── LEFT COLUMN ──────────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>
            National Platform Dashboard
          </h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Platform-wide aggregate metrics — yesterday&apos;s nightly rollup
            {lastUpdated && `. Loaded ${lastUpdated}.`}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'ACTIVE CHAINS', value: fmtNum(kpis.active_chains), sub: 'with open cases', alert: false },
            { label: 'EVENTS 24H', value: fmtNum(kpis.events_24h), sub: 'platform events today', alert: false },
            { label: 'SLA BREACH RATE', value: pct(kpis.sla_breach_rate_pct), sub: '30-day rolling', alert: kpis.sla_breach_rate_pct > 5 },
            { label: 'VALUE 30D', value: fmtZAR(kpis.value_30d_zar), sub: 'transactions + settlements', alert: false },
            { label: 'OPEN ACTIONS', value: fmtNum(kpis.open_actions), sub: 'across all roles', alert: false },
            { label: 'REG. CROSSINGS', value: fmtNum(kpis.regulator_crossings_30d), sub: '30-day', alert: false },
          ].map(k => (
            <div key={k.label} style={{
              background: k.alert ? BAD_BG : BG1,
              border: `1px solid ${k.alert ? BAD : BORDER}`,
              borderRadius: 8,
              padding: '12px 16px',
              flex: '1 1 120px',
              minWidth: 110,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.alert ? BAD : TX1, fontFamily: MONO, marginTop: 4 }}>
                {k.value}
              </div>
              <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Domain rollups */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            DOMAIN ROLLUPS — 30D
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {data.domain_rollups.map(d => {
              const dotColor = DOMAIN_DOT[d.domain] ?? TX2;
              const breachAlert = d.breach_rate_pct > 5;
              return (
                <div key={d.domain} style={{
                  background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: TX1, textTransform: 'capitalize' }}>{d.domain}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: TX3, fontFamily: MONO }}>{d.chains_active} active</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TX1, fontFamily: MONO }}>{fmtNum(d.events_30d)}</div>
                      <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>events</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: breachAlert ? BAD : TX1, fontFamily: MONO }}>{pct(d.breach_rate_pct)}</div>
                      <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>SLA breach</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TX1, fontFamily: MONO }}>{fmtZAR(d.value_30d_zar)}</div>
                      <div style={{ fontSize: 10, color: TX3, marginTop: 1 }}>value</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chain health table */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              TOP 20 CHAINS BY ACTIVITY
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['CHAIN', 'OPEN', 'BREACHES', 'EVENTS 30D', 'VALUE 30D', 'SLA %'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: '8px 12px',
                      color: TX2,
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.chain_health.map((r, i) => {
                  const slaAlert = r.sla_adherence_pct < 90;
                  return (
                    <tr key={r.chain_key} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '9px 12px', color: TX1, fontFamily: MONO, fontSize: 11 }}>{r.chain_key}</td>
                      <td style={{ padding: '9px 12px', color: TX1, textAlign: 'right', fontFamily: MONO }}>{r.open_count}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, color: r.breach_count > 0 ? BAD : TX1, fontWeight: r.breach_count > 0 ? 600 : 400 }}>
                        {r.breach_count}
                      </td>
                      <td style={{ padding: '9px 12px', color: TX1, textAlign: 'right', fontFamily: MONO }}>{fmtNum(r.events_30d)}</td>
                      <td style={{ padding: '9px 12px', color: TX1, textAlign: 'right', fontFamily: MONO }}>{fmtZAR(r.value_30d_zar)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: slaAlert ? BAD : GOOD }}>
                        {pct(r.sla_adherence_pct)}
                      </td>
                    </tr>
                  );
                })}
                {data.chain_health.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '16px 12px', textAlign: 'center', color: TX3, fontSize: 12 }}>
                      No chain data yet — metrics populate after first nightly rollup.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── RIGHT COLUMN ─────────────────────────────────────────────────────── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => void load()}
          style={{
            background: ACC, color: '#fff', border: 'none',
            padding: '8px 16px', borderRadius: 6, fontWeight: 600,
            cursor: 'pointer', fontSize: 13, width: '100%',
          }}
        >
          Refresh Data
        </button>

        {/* 14-day event trend */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            14-DAY EVENT TREND
          </div>
          {data.event_trend.length === 0 ? (
            <div style={{ fontSize: 12, color: TX3, padding: '8px 0' }}>
              No data yet — populates after first nightly rollup.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: TX3, marginBottom: 2 }}>Events / day</div>
                <Sparkline points={eventVals} color={TX1} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: TX3, marginTop: 2 }}>
                  <span>{data.event_trend[0]?.date?.slice(5)}</span>
                  <span>{data.event_trend[data.event_trend.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: TX3, marginBottom: 2 }}>Value ZAR / day</div>
                <Sparkline points={valueVals} color={GOOD} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>{fmtNum(totalEvents)}</div>
                  <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>total events</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>{fmtNum(avgEvents)}</div>
                  <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>avg/day</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: GOOD, fontFamily: MONO }}>{fmtZAR(totalValue)}</div>
                  <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>total value</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Role queue depth */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            ROLE QUEUE DEPTH
          </div>
          {data.role_queue_depth.length === 0 ? (
            <div style={{ fontSize: 12, color: TX3 }}>All queues empty.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.role_queue_depth.map(r => (
                <div key={r.role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 96, fontSize: 11, color: TX1, fontWeight: 500, textTransform: 'capitalize', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.role.replace(/_/g, ' ')}
                  </div>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: BORDER, overflow: 'hidden' }}>
                    <div
                      role="progressbar"
                      aria-label={`${r.role.replace(/_/g, ' ')} queue depth`}
                      aria-valuenow={r.pending}
                      aria-valuemin={0}
                      aria-valuemax={queueMax}
                      style={{
                        height: '100%',
                        borderRadius: 3,
                        background: ACC,
                        width: `${(r.pending / queueMax) * 100}%`,
                      }}
                    />
                  </div>
                  <div style={{ width: 28, textAlign: 'right', fontSize: 11, fontWeight: 600, color: TX1, fontFamily: MONO, flexShrink: 0 }}>
                    {r.pending}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary stats card */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            PLATFORM SUMMARY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Domains active', value: String(data.domain_rollups.length) },
              { label: 'Chains tracked', value: String(data.chain_health.length) },
              { label: 'Total queue depth', value: fmtNum(data.role_queue_depth.reduce((a, r) => a + r.pending, 0)) },
              { label: 'Trend window', value: `${data.event_trend.length}d` },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: TX2 }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: TX1, fontFamily: MONO }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SLA health badge */}
        <div style={{
          background: kpis.sla_breach_rate_pct > 5 ? BAD_BG : GOOD_BG,
          border: `1px solid ${kpis.sla_breach_rate_pct > 5 ? BAD : GOOD}`,
          borderRadius: 8,
          padding: '12px 16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: kpis.sla_breach_rate_pct > 5 ? BAD : GOOD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {kpis.sla_breach_rate_pct > 5 ? 'SLA BREACH ALERT' : 'SLA HEALTH OK'}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: kpis.sla_breach_rate_pct > 5 ? BAD : GOOD, fontFamily: MONO }}>
            {pct(kpis.sla_breach_rate_pct)}
          </div>
          <div style={{ fontSize: 11, color: kpis.sla_breach_rate_pct > 5 ? BAD : GOOD, marginTop: 2, opacity: 0.8 }}>
            breach rate · 30-day rolling
          </div>
        </div>

        {/* Regulator crossings */}
        <div style={{
          background: kpis.regulator_crossings_30d > 50 ? 'oklch(0.96 0.05 55)' : BG,
          border: `1px solid ${kpis.regulator_crossings_30d > 50 ? WARN : BORDER}`,
          borderRadius: 8,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            REGULATOR CROSSINGS
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: kpis.regulator_crossings_30d > 50 ? WARN : TX1, fontFamily: MONO }}>
            {fmtNum(kpis.regulator_crossings_30d)}
          </div>
          <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>events escalated · 30 days</div>
        </div>

      </div>
    </div>
  );
}

export default NationalDashboard;
