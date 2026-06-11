import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap, Activity, AlertTriangle, RefreshCw, MapPin, Plus, X, CheckCircle2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';
const BAD    = 'oklch(0.48 0.20 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type Tab = 'connections' | 'wheeling' | 'constraints' | 'imbalance';

interface Connection {
  id: string;
  project_id: string;
  project_name?: string | null;
  developer_id?: string | null;
  connection_point: string;
  voltage_kv: number;
  export_capacity_mw: number;
  import_capacity_mw: number;
  status: string;
  connected_date?: string | null;
  created_at: string;
}

interface Wheeling {
  id: string;
  host_participant_id: string;
  wheeling_participant_id: string;
  injection_point: string;
  offtake_point: string;
  capacity_mw: number;
  wheeling_rate_per_kwh: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
}

interface Constraint {
  id: string;
  constraint_type: 'transmission' | 'distribution' | 'generation' | 'demand';
  location: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  available_capacity_mw?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  status: string;
  created_at: string;
}

interface Imbalance {
  id: string;
  participant_id: string;
  participant_name?: string | null;
  period_start: string;
  period_end: string;
  scheduled_kwh: number;
  actual_kwh: number;
  imbalance_kwh: number;
  settlement_price_per_kwh: number | null;
  created_at: string;
}

function sevColor(severity: string): string {
  if (severity === 'critical') return BAD;
  if (severity === 'high') return WARN;
  if (severity === 'medium') return 'oklch(0.52 0.14 60)';
  return TX3;
}

function statusColor(status: string): string {
  if (status === 'active') return GOOD;
  if (status === 'pending' || status === 'forecast') return WARN;
  if (status === 'expired' || status === 'resolved') return TX3;
  return TX3;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 10, fontWeight: 600, textTransform: 'capitalize' as const,
      background: `color-mix(in oklch, ${color} 14%, ${BG1})`,
      color,
      border: `1px solid color-mix(in oklch, ${color} 30%, ${BORDER})`,
    }}>{label}</span>
  );
}

function KpiTile({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 90 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: TX3, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
      borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: TX2,
    }}>
      {children}
    </div>
  );
}

function Col({ children, w, mono }: { children: React.ReactNode; w?: number | string; mono?: boolean }) {
  return (
    <div style={{ flex: w ? `0 0 ${w}` : 1, minWidth: 0, fontFamily: mono ? MONO : undefined }}>
      {children}
    </div>
  );
}

function TableHead({ cols }: { cols: Array<{ label: string; w?: number | string }> }) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '6px 12px',
      background: BG2, borderBottom: `1px solid ${BORDER}`,
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3,
    }}>
      {cols.map(c => (
        <div key={c.label} style={{ flex: c.w ? `0 0 ${c.w}` : 1, minWidth: 0 }}>{c.label}</div>
      ))}
    </div>
  );
}

function ActionBtn({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      height: 24, padding: '0 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
      background: color || GOOD, color: '#fff', border: 'none',
    }}>{label}</button>
  );
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'connections', label: 'Connections' },
  { key: 'wheeling', label: 'Wheeling' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'imbalance', label: 'Imbalance' },
];

export function Grid() {
  const { user } = useAuth();
  const isOperator = user?.role === 'admin' || user?.role === 'grid_operator' || user?.role === 'regulator';

  const [tab, setTab] = useState<Tab>('connections');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [wheeling, setWheeling] = useState<Wheeling[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [imbalance, setImbalance] = useState<Imbalance[]>([]);

  const [allConnections, setAllConnections] = useState<Connection[]>([]);
  const [allWheeling, setAllWheeling] = useState<Wheeling[]>([]);
  const [allConstraints, setAllConstraints] = useState<Constraint[]>([]);
  const [allImbalance, setAllImbalance] = useState<Imbalance[]>([]);

  const [showConstraintModal, setShowConstraintModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const [c, w, cn, im] = await Promise.all([
        api.get('/grid/connections'),
        api.get('/grid/wheeling'),
        api.get('/grid/constraints'),
        api.get('/grid/imbalance'),
      ]);
      setAllConnections(c.data?.data || []);
      setAllWheeling(w.data?.data || []);
      setAllConstraints(cn.data?.data || []);
      setAllImbalance(im.data?.data || []);
    } catch {
      // tiles silently degrade to 0
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'connections') {
        const res = await api.get('/grid/connections');
        setConnections(res.data?.data || []);
      } else if (tab === 'wheeling') {
        const res = await api.get('/grid/wheeling');
        setWheeling(res.data?.data || []);
      } else if (tab === 'constraints') {
        const res = await api.get('/grid/constraints');
        setConstraints(res.data?.data || []);
      } else {
        const res = await api.get('/grid/imbalance');
        setImbalance(res.data?.data || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load grid data');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchData(), fetchSummary()]);
  }, [fetchData, fetchSummary]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const commissionConnection = async (id: string) => {
    setActionError(null);
    try {
      await api.post(`/grid/connections/${id}/commission`, {});
      await refreshAll();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to commission');
    }
  };

  const activateWheeling = async (id: string) => {
    setActionError(null);
    try {
      await api.post(`/grid/wheeling/${id}/activate`, {});
      await refreshAll();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to activate');
    }
  };

  const clearConstraint = async (id: string) => {
    setActionError(null);
    try {
      await api.post(`/grid/constraints/${id}/clear`, {});
      await refreshAll();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to clear constraint');
    }
  };

  const criticalCount = useMemo(() => allConstraints.filter(x => x.severity === 'critical' || x.severity === 'high').length, [allConstraints]);

  const activeConnections = allConnections.filter(c => c.status === 'active').length;
  const activeWheeling = allWheeling.filter(w => w.status === 'active').length;

  const recentActivity = useMemo(() => {
    const items: Array<{ id: string; label: string; sub: string; color: string }> = [];
    allConstraints.slice(0, 3).forEach(k => items.push({ id: k.id, label: k.location, sub: `${k.severity} constraint · ${k.constraint_type}`, color: sevColor(k.severity) }));
    allConnections.slice(0, 3).forEach(c => items.push({ id: c.id, label: c.connection_point, sub: `${c.status} · ${c.voltage_kv} kV`, color: statusColor(c.status) }));
    return items.slice(0, 8);
  }, [allConstraints, allConnections]);

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>
        <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={18} style={{ color: ACC }} /> Grid Operations
            </h1>
            <p style={{ fontSize: 12, color: TX2, margin: '4px 0 0' }}>Connections, wheeling, constraints and imbalance — live from /api/grid</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {tab === 'constraints' && isOperator && (
              <button type="button" onClick={() => setShowConstraintModal(true)} style={{
                height: 30, padding: '0 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: ACC, color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Plus size={12} /> Publish constraint
              </button>
            )}
            <button type="button" onClick={refreshAll} style={{
              height: 30, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: BG2, color: TX2, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <KpiTile label="Connections" value={allConnections.length} hint={`${activeConnections} active`} />
          <KpiTile label="Wheeling" value={allWheeling.length} hint={`${activeWheeling} active`} />
          <KpiTile label="High/Critical" value={criticalCount} hint={`${allConstraints.length} total constraints`} tone={criticalCount > 0 ? 'warn' : 'ok'} />
          <KpiTile label="Imbalance events" value={allImbalance.length} hint="last 200" />
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: tab === t.key ? ACC : BG2, color: tab === t.key ? '#fff' : TX2,
                border: `1px solid ${tab === t.key ? ACC : BORDER}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {actionError && (
          <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: `color-mix(in oklch, ${BAD} 10%, ${BG1})`, border: `1px solid ${BAD}`, color: BAD, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            {actionError}
            <button type="button" onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: BAD, padding: 0 }}><X size={12} /></button>
          </div>
        )}

        {/* Content */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 20 }}><Skeleton variant="card" rows={5} /></div>
          ) : error ? (
            <div style={{ padding: 20 }}><ErrorBanner message={error} onRetry={refreshAll} /></div>
          ) : (
            <>
              {tab === 'connections' && (
                connections.length === 0
                  ? <div style={{ padding: 40 }}><EmptyState icon={<Activity className="w-8 h-8" />} title="No connections" description={isOperator ? 'Grid operators can register developer connection applications.' : 'Connection applications you file will appear here.'} /></div>
                  : <>
                    <TableHead cols={[
                      { label: 'Connection point', w: '28%' },
                      { label: 'Project' },
                      { label: 'Voltage', w: 70 },
                      { label: 'Export MW', w: 80 },
                      { label: 'Import MW', w: 80 },
                      { label: 'Status', w: 90 },
                      { label: 'Action', w: 90 },
                    ]} />
                    {connections.map(c => (
                      <Row key={c.id}>
                        <Col w="28%"><div style={{ fontWeight: 600, color: TX1, fontSize: 12 }}>{c.connection_point}</div><div style={{ fontSize: 10, color: TX3 }}>{c.id.slice(0, 12)}…</div></Col>
                        <Col><span style={{ fontSize: 12, color: TX2 }}>{c.project_name || c.project_id}</span></Col>
                        <Col w={70} mono><span style={{ color: TX1 }}>{c.voltage_kv} kV</span></Col>
                        <Col w={80} mono>{c.export_capacity_mw.toFixed(1)}</Col>
                        <Col w={80} mono>{c.import_capacity_mw.toFixed(1)}</Col>
                        <Col w={90}><Pill label={c.status} color={statusColor(c.status)} /></Col>
                        <Col w={90}>{isOperator && c.status !== 'active' ? <ActionBtn label="Commission" onClick={() => commissionConnection(c.id)} color={GOOD} /> : <span style={{ color: TX3 }}>—</span>}</Col>
                      </Row>
                    ))}
                  </>
              )}

              {tab === 'wheeling' && (
                wheeling.length === 0
                  ? <div style={{ padding: 40 }}><EmptyState icon={<MapPin className="w-8 h-8" />} title="No wheeling agreements" description="Wheeling agreements you are party to will appear here." /></div>
                  : <>
                    <TableHead cols={[
                      { label: 'Injection → offtake', w: '32%' },
                      { label: 'Capacity', w: 90 },
                      { label: 'Rate ZAR/kWh', w: 100 },
                      { label: 'Period' },
                      { label: 'Status', w: 90 },
                      { label: 'Action', w: 80 },
                    ]} />
                    {wheeling.map(w => (
                      <Row key={w.id}>
                        <Col w="32%"><div style={{ fontWeight: 600, color: TX1, fontSize: 12 }}>{w.injection_point}</div><div style={{ fontSize: 10, color: TX3 }}>→ {w.offtake_point}</div></Col>
                        <Col w={90} mono>{w.capacity_mw.toFixed(1)} MW</Col>
                        <Col w={100} mono>R{Number(w.wheeling_rate_per_kwh || 0).toFixed(3)}</Col>
                        <Col><span style={{ fontSize: 11, color: TX3 }}>{w.start_date} → {w.end_date}</span></Col>
                        <Col w={90}><Pill label={w.status} color={statusColor(w.status)} /></Col>
                        <Col w={80}>{isOperator && w.status === 'pending' ? <ActionBtn label="Activate" onClick={() => activateWheeling(w.id)} color={GOOD} /> : <span style={{ color: TX3 }}>—</span>}</Col>
                      </Row>
                    ))}
                  </>
              )}

              {tab === 'constraints' && (
                constraints.length === 0
                  ? <div style={{ padding: 40 }}><EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No active constraints" description={isOperator ? 'Publish a transmission/distribution constraint to advise market participants.' : 'Active grid constraints published by operators will appear here.'} /></div>
                  : <>
                    <TableHead cols={[
                      { label: 'Location', w: '26%' },
                      { label: 'Type', w: 90 },
                      { label: 'Severity', w: 80 },
                      { label: 'Avail MW', w: 80 },
                      { label: 'Period' },
                      { label: 'Description' },
                      { label: 'Action', w: 70 },
                    ]} />
                    {constraints.map(k => (
                      <Row key={k.id}>
                        <Col w="26%"><div style={{ fontWeight: 600, color: TX1, fontSize: 12 }}>{k.location}</div><div style={{ fontSize: 10, color: TX3 }}>{k.id.slice(0, 12)}…</div></Col>
                        <Col w={90}><span style={{ fontSize: 11, color: TX2, textTransform: 'capitalize' }}>{k.constraint_type}</span></Col>
                        <Col w={80}><Pill label={k.severity} color={sevColor(k.severity)} /></Col>
                        <Col w={80} mono>{k.available_capacity_mw != null ? `${k.available_capacity_mw}` : '—'}</Col>
                        <Col><span style={{ fontSize: 11, color: TX3 }}>{k.start_date || '—'} → {k.end_date || 'ongoing'}</span></Col>
                        <Col><div style={{ fontSize: 11, color: TX2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }} title={k.description || ''}>{k.description || '—'}</div></Col>
                        <Col w={70}>{isOperator && k.status === 'active' ? <ActionBtn label="Clear" onClick={() => clearConstraint(k.id)} color={TX2} /> : <span style={{ color: TX3 }}>—</span>}</Col>
                      </Row>
                    ))}
                  </>
              )}

              {tab === 'imbalance' && (
                imbalance.length === 0
                  ? <div style={{ padding: 40 }}><EmptyState icon={<Activity className="w-8 h-8" />} title="No imbalance records" description="Imbalance settlement periods you are party to will appear here." /></div>
                  : <>
                    <TableHead cols={[
                      { label: 'Participant', w: '18%' },
                      { label: 'Period' },
                      { label: 'Scheduled kWh', w: 110 },
                      { label: 'Actual kWh', w: 100 },
                      { label: 'Imbalance kWh', w: 110 },
                      { label: 'Rate', w: 80 },
                      { label: 'Settlement', w: 90 },
                    ]} />
                    {imbalance.map(i => {
                      const sign = i.imbalance_kwh > 0 ? '+' : '';
                      const imbalColor = i.imbalance_kwh > 0 ? GOOD : i.imbalance_kwh < 0 ? BAD : TX2;
                      const settlement = (i.settlement_price_per_kwh || 0) * Math.abs(i.imbalance_kwh);
                      return (
                        <Row key={i.id}>
                          <Col w="18%"><span style={{ fontWeight: 600, color: TX1, fontSize: 12 }}>{i.participant_name || i.participant_id}</span></Col>
                          <Col><span style={{ fontSize: 11, color: TX3 }}>{new Date(i.period_start).toLocaleString()} → {new Date(i.period_end).toLocaleString()}</span></Col>
                          <Col w={110} mono>{Number(i.scheduled_kwh || 0).toLocaleString()}</Col>
                          <Col w={100} mono>{Number(i.actual_kwh || 0).toLocaleString()}</Col>
                          <Col w={110} mono><span style={{ color: imbalColor }}>{sign}{Number(i.imbalance_kwh || 0).toLocaleString()}</span></Col>
                          <Col w={80} mono>{i.settlement_price_per_kwh != null ? `R${i.settlement_price_per_kwh.toFixed(3)}` : '—'}</Col>
                          <Col w={90} mono>R{settlement.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</Col>
                        </Row>
                      );
                    })}
                  </>
              )}
            </>
          )}
        </div>
      </div>

      {/* RIGHT panel */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI Assist */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>AI Assist</div>
          {criticalCount > 0 ? (
            <p style={{ fontSize: 12, color: TX2, margin: 0 }}>
              <strong style={{ color: BAD }}>{criticalCount} high/critical constraint{criticalCount > 1 ? 's' : ''}</strong> active on the grid.
              Review affected zones and advise dispatch adjustments to avoid over-loading the transmission network.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: TX2, margin: 0 }}>
              Grid is clear of high/critical constraints. Monitor wheeling utilisation — {activeWheeling} agreement{activeWheeling !== 1 ? 's' : ''} active against {allWheeling.length} total. Consider optimising injection/offtake routing.
            </p>
          )}
        </div>

        {/* Summary stats */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Portfolio Summary</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Active connections', value: activeConnections, total: allConnections.length },
              { label: 'Active wheeling', value: activeWheeling, total: allWheeling.length },
              { label: 'Critical/high constraints', value: criticalCount, total: allConstraints.length, warn: criticalCount > 0 },
              { label: 'Imbalance events', value: allImbalance.length, total: null },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: TX2 }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: item.warn ? BAD : TX1 }}>
                  {item.value}{item.total !== null ? ` / ${item.total}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Activity</div>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: 12, color: TX3 }}>No recent events.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentActivity.map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 99, background: item.color, marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: TX1 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: TX3 }}>{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Constraint severity breakdown */}
        {allConstraints.length > 0 && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Constraint Severity</div>
            {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
              const count = allConstraints.filter(c => c.severity === sev).length;
              if (count === 0) return null;
              return (
                <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Pill label={sev} color={sevColor(sev)} />
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: BG2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: sevColor(sev), width: `${(count / allConstraints.length) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: TX2, width: 16, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showConstraintModal && (
        <ConstraintModal
          onClose={() => setShowConstraintModal(false)}
          onCreated={() => { setShowConstraintModal(false); void refreshAll(); }}
        />
      )}
    </div>
  );
}

function ConstraintModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [constraintType, setConstraintType] = useState<'transmission' | 'distribution' | 'generation' | 'demand'>('transmission');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [availableMw, setAvailableMw] = useState<string>('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px',
    fontSize: 12, color: TX1, background: BG, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: TX2, display: 'block', marginBottom: 4 };

  const submit = async () => {
    if (!location.trim()) { setFormError('Location is required'); return; }
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/grid/constraints', {
        constraint_type: constraintType,
        location: location.trim(),
        severity,
        available_capacity_mw: availableMw ? Number(availableMw) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        description: description || undefined,
      });
      onCreated();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || 'Failed to publish constraint');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} role="dialog" aria-modal="true">
      <div style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: TX1, margin: 0 }}>Publish grid constraint</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX2, padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {formError && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: `color-mix(in oklch, ${BAD} 10%, ${BG1})`, border: `1px solid ${BAD}`, color: BAD, fontSize: 12 }}>{formError}</div>
          )}
          <label><span style={labelStyle}>Constraint type</span>
            <select value={constraintType} onChange={e => setConstraintType(e.target.value as typeof constraintType)} style={inputStyle}>
              <option value="transmission">Transmission</option>
              <option value="distribution">Distribution</option>
              <option value="generation">Generation</option>
              <option value="demand">Demand</option>
            </select>
          </label>
          <label><span style={labelStyle}>Location *</span>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Mookgopong–Phalaborwa 400kV line" style={inputStyle} />
          </label>
          <label><span style={labelStyle}>Severity</span>
            <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)} style={inputStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label><span style={labelStyle}>Available capacity (MW)</span>
            <input type="number" value={availableMw} onChange={e => setAvailableMw(e.target.value)} placeholder="e.g. 120" style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label><span style={labelStyle}>Start date</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </label>
            <label><span style={labelStyle}>End date</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
            </label>
          </div>
          <label><span style={labelStyle}>Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Planned outage, forecasted congestion, or rating limitation" style={{ ...inputStyle, resize: 'vertical' }} />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: `1px solid ${BORDER}` }}>
          <button type="button" onClick={onClose} style={{ height: 32, padding: '0 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: BG2, color: TX2, border: `1px solid ${BORDER}` }}>Cancel</button>
          <button type="button" onClick={submit} disabled={submitting} style={{ height: 32, padding: '0 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: ACC, color: '#fff', border: 'none', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Grid;
