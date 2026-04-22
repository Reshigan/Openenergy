import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap, Activity, AlertTriangle, RefreshCw, MapPin, Plus, X, CheckCircle2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';

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

const SEV_PILL: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  resolved: 'bg-gray-100 text-gray-700',
  forecast: 'bg-blue-100 text-blue-800',
  expired: 'bg-gray-100 text-gray-700',
};

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

  // Summary tiles render over the full unfiltered dataset independent of the active tab,
  // so counts stay accurate when the user has only loaded one tab's rows.
  const [allConnections, setAllConnections] = useState<Connection[]>([]);
  const [allWheeling, setAllWheeling] = useState<Wheeling[]>([]);
  const [allConstraints, setAllConstraints] = useState<Constraint[]>([]);
  const [allImbalance, setAllImbalance] = useState<Imbalance[]>([]);

  const [showConstraintModal, setShowConstraintModal] = useState(false);

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
      // tiles silently degrade to 0; tab-specific fetch surfaces the real error
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
    try {
      await api.post(`/grid/connections/${id}/commission`, {});
      await refreshAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to commission');
    }
  };

  const activateWheeling = async (id: string) => {
    try {
      await api.post(`/grid/wheeling/${id}/activate`, {});
      await refreshAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to activate');
    }
  };

  const clearConstraint = async (id: string) => {
    try {
      await api.post(`/grid/constraints/${id}/clear`, {});
      await refreshAll();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to clear constraint');
    }
  };

  const criticalCount = useMemo(() => allConstraints.filter(x => x.severity === 'critical' || x.severity === 'high').length, [allConstraints]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap size={22} className="text-ionex-brand" /> Grid Operations</h1>
          <p className="text-ionex-text-mute">Connections, wheeling agreements, constraints, imbalance — wired to /api/grid</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'constraints' && isOperator && (
            <button onClick={() => setShowConstraintModal(true)} className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand/90">
              <Plus size={14} /> Publish constraint
            </button>
          )}
          <button onClick={refreshAll} className="flex items-center gap-2 px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tile icon={<Activity size={18} />} label="Connections" value={allConnections.length} hint={`${allConnections.filter(c => c.status === 'active').length} active`} />
        <Tile icon={<MapPin size={18} />} label="Wheeling" value={allWheeling.length} hint={`${allWheeling.filter(w => w.status === 'active').length} active`} />
        <Tile icon={<AlertTriangle size={18} />} label="High/critical constraints" value={criticalCount} hint={`${allConstraints.length} total`} tone={criticalCount > 0 ? 'warn' : 'ok'} />
        <Tile icon={<Zap size={18} />} label="Imbalance events" value={allImbalance.length} hint="last 200" />
      </div>

      <div className="flex gap-1 border-b border-ionex-border-100">
        {(['connections', 'wheeling', 'constraints', 'imbalance'] as const).map(t => (
          <TabBtn key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {loading ? <Skeleton variant="card" rows={5} />
        : error ? <ErrorBanner message={error} onRetry={refreshAll} />
          : (
            <>
              {tab === 'connections' && (
                connections.length === 0 ? <EmptyState icon={<Activity className="w-8 h-8" />} title="No connections" description={isOperator ? 'Grid operators can register developer connection applications.' : 'Connection applications you file will appear here.'} />
                  : <Table headers={['Connection point', 'Project', 'Voltage', 'Export MW', 'Import MW', 'Status', 'Actions']}>
                    {connections.map(c => (
                      <tr key={c.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                        <Td><div className="font-medium">{c.connection_point}</div><div className="text-xs text-ionex-text-mute">{c.id}</div></Td>
                        <Td>{c.project_name || c.project_id}</Td>
                        <Td>{c.voltage_kv} kV</Td>
                        <Td>{c.export_capacity_mw.toFixed(1)}</Td>
                        <Td>{c.import_capacity_mw.toFixed(1)}</Td>
                        <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[c.status] || 'bg-gray-100'}`}>{c.status}</span></Td>
                        <Td>{isOperator && c.status !== 'active' ? <button onClick={() => commissionConnection(c.id)} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> Commission</button> : <span className="text-xs text-ionex-text-mute">—</span>}</Td>
                      </tr>
                    ))}
                  </Table>
              )}

              {tab === 'wheeling' && (
                wheeling.length === 0 ? <EmptyState icon={<MapPin className="w-8 h-8" />} title="No wheeling agreements" description="Wheeling agreements you are party to will appear here." />
                  : <Table headers={['Injection → offtake', 'Capacity', 'Rate (ZAR/kWh)', 'Period', 'Status', 'Actions']}>
                    {wheeling.map(w => (
                      <tr key={w.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                        <Td><div className="font-medium">{w.injection_point}</div><div className="text-xs text-ionex-text-mute">→ {w.offtake_point}</div></Td>
                        <Td>{w.capacity_mw.toFixed(1)} MW</Td>
                        <Td>R{Number(w.wheeling_rate_per_kwh || 0).toFixed(3)}</Td>
                        <Td className="text-xs">{w.start_date} → {w.end_date}</Td>
                        <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[w.status] || 'bg-gray-100'}`}>{w.status}</span></Td>
                        <Td>{isOperator && w.status === 'pending' ? <button onClick={() => activateWheeling(w.id)} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"><CheckCircle2 size={12} /> Activate</button> : <span className="text-xs text-ionex-text-mute">—</span>}</Td>
                      </tr>
                    ))}
                  </Table>
              )}

              {tab === 'constraints' && (
                constraints.length === 0 ? <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No active constraints" description={isOperator ? 'Publish a transmission/distribution constraint to advise market participants.' : 'Active grid constraints published by operators will appear here.'} />
                  : <Table headers={['Location', 'Type', 'Severity', 'Available MW', 'Period', 'Description', 'Actions']}>
                    {constraints.map(k => (
                      <tr key={k.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                        <Td><div className="font-medium">{k.location}</div><div className="text-xs text-ionex-text-mute">{k.id}</div></Td>
                        <Td className="capitalize">{k.constraint_type}</Td>
                        <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${SEV_PILL[k.severity]}`}>{k.severity}</span></Td>
                        <Td>{k.available_capacity_mw != null ? `${k.available_capacity_mw} MW` : '—'}</Td>
                        <Td className="text-xs">{k.start_date || '—'} → {k.end_date || 'ongoing'}</Td>
                        <Td className="max-w-xs"><div className="truncate text-xs" title={k.description || ''}>{k.description || '—'}</div></Td>
                        <Td>{isOperator && k.status === 'active' ? <button onClick={() => clearConstraint(k.id)} className="text-xs px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-800">Clear</button> : <span className="text-xs text-ionex-text-mute">—</span>}</Td>
                      </tr>
                    ))}
                  </Table>
              )}

              {tab === 'imbalance' && (
                imbalance.length === 0 ? <EmptyState icon={<Activity className="w-8 h-8" />} title="No imbalance records" description="Imbalance settlement periods you are party to will appear here." />
                  : <Table headers={['Participant', 'Period', 'Scheduled kWh', 'Actual kWh', 'Imbalance kWh', 'Rate', 'Settlement']}>
                    {imbalance.map(i => {
                      const sign = i.imbalance_kwh > 0 ? '+' : i.imbalance_kwh < 0 ? '' : '';
                      const tone = i.imbalance_kwh > 0 ? 'text-green-700' : i.imbalance_kwh < 0 ? 'text-red-700' : '';
                      const settlement = (i.settlement_price_per_kwh || 0) * Math.abs(i.imbalance_kwh);
                      return (
                        <tr key={i.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                          <Td>{i.participant_name || i.participant_id}</Td>
                          <Td className="text-xs">{new Date(i.period_start).toLocaleString()} → {new Date(i.period_end).toLocaleString()}</Td>
                          <Td>{Number(i.scheduled_kwh || 0).toLocaleString()}</Td>
                          <Td>{Number(i.actual_kwh || 0).toLocaleString()}</Td>
                          <Td className={tone}>{sign}{Number(i.imbalance_kwh || 0).toLocaleString()}</Td>
                          <Td>{i.settlement_price_per_kwh != null ? `R${i.settlement_price_per_kwh.toFixed(3)}` : '—'}</Td>
                          <Td>R{settlement.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</Td>
                        </tr>
                      );
                    })}
                  </Table>
              )}
            </>
          )}

      {showConstraintModal && <ConstraintModal onClose={() => setShowConstraintModal(false)} onCreated={() => { setShowConstraintModal(false); void refreshAll(); }} />}
    </div>
  );
}

function ConstraintModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [constraintType, setConstraintType] = useState<'transmission' | 'distribution' | 'generation' | 'demand'>('transmission');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [availableMw, setAvailableMw] = useState<string>('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!location.trim()) { alert('Location is required'); return; }
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
      alert(err?.response?.data?.error || 'Failed to publish constraint');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-ionex-border-100">
          <h2 className="text-lg font-semibold">Publish grid constraint</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block"><span className="text-sm text-ionex-text-sub">Constraint type</span>
            <select value={constraintType} onChange={e => setConstraintType(e.target.value as typeof constraintType)} className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm">
              <option value="transmission">Transmission</option>
              <option value="distribution">Distribution</option>
              <option value="generation">Generation</option>
              <option value="demand">Demand</option>
            </select>
          </label>
          <label className="block"><span className="text-sm text-ionex-text-sub">Location *</span>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Mookgopong–Phalaborwa 400kV line" className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block"><span className="text-sm text-ionex-text-sub">Severity</span>
            <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)} className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="block"><span className="text-sm text-ionex-text-sub">Available capacity (MW)</span>
            <input type="number" value={availableMw} onChange={e => setAvailableMw(e.target.value)} placeholder="e.g. 120" className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm text-ionex-text-sub">Start date</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block"><span className="text-sm text-ionex-text-sub">End date</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block"><span className="text-sm text-ionex-text-sub">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Planned outage, forecasted congestion, or rating limitation" className="w-full border border-ionex-border-200 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-ionex-border-100">
          <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg">Cancel</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand/90 disabled:opacity-50">{submitting ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: number | string; hint?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`rounded-xl border p-4 bg-white ${tone === 'warn' ? 'border-red-200 bg-red-50/50' : 'border-ionex-border-100'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-ionex-text-mute">{label}</span>
        <span className={tone === 'warn' ? 'text-red-600' : 'text-ionex-brand'}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-ionex-text-mute mt-1">{hint}</div>}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${active ? 'border-ionex-brand text-ionex-brand' : 'border-transparent text-ionex-text-sub hover:text-ionex-text'}`}>{label}</button>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ionex-border-100 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-ionex-text-mute">
          <tr>{headers.map(h => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
