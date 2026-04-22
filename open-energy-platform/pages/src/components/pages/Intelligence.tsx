import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, Scan, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';
import { useEscapeKey } from '../../hooks/useEscapeKey';

type Severity = 'info' | 'warning' | 'critical';

interface IntelItem {
  id: string;
  participant_id: string | null;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  action_required: string | null;
  resolved: 0 | 1;
  resolved_at?: string | null;
  resolved_by?: string | null;
  created_at: string;
}

interface Summary {
  unresolved_count: number;
  by_severity: Array<{ severity: Severity; c: number }>;
  by_type: Array<{ type: string; c: number }>;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SEVERITY_ICON: Record<Severity, React.ReactNode> = {
  critical: <AlertTriangle className="w-4 h-4" />,
  warning: <AlertTriangle className="w-4 h-4" />,
  info: <Activity className="w-4 h-4" />,
};

export function Intelligence() {
  const { user } = useAuth();
  const [items, setItems] = useState<IntelItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [resolvedFilter, setResolvedFilter] = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [selected, setSelected] = useState<IntelItem | null>(null);

  const canScan = user?.role === 'admin' || user?.role === 'regulator';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (resolvedFilter === 'unresolved') params.set('resolved', '0');
      else if (resolvedFilter === 'resolved') params.set('resolved', '1');
      const [listRes, sumRes] = await Promise.all([
        api.get(`/intelligence?${params.toString()}`),
        api.get('/intelligence/summary'),
      ]);
      setItems(listRes.data?.data || []);
      setSummary(sumRes.data?.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load intelligence');
    } finally {
      setLoading(false);
    }
  }, [severityFilter, typeFilter, resolvedFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      await api.post('/intelligence/scan', {});
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to run scan');
    } finally {
      setScanning(false);
    }
  }, [fetchData]);

  const resolveItem = useCallback(async (item: IntelItem) => {
    try {
      await api.post(`/intelligence/${item.id}/resolve`, {});
      setSelected(null);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to resolve');
    }
  }, [fetchData]);

  const types = useMemo(() => {
    const set = new Set(summary?.by_type?.map(t => t.type) || []);
    for (const it of items) set.add(it.type);
    return Array.from(set).sort();
  }, [items, summary]);

  const counts = useMemo(() => {
    const map: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
    for (const entry of summary?.by_severity || []) map[entry.severity] = entry.c;
    return map;
  }, [summary]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intelligence feed</h1>
          <p className="text-ionex-text-mute">Operational, financial, regulatory and market signals.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canScan && (
            <button
              onClick={runScan}
              disabled={scanning}
              className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50 flex items-center gap-2"
            >
              <Scan className={`w-4 h-4 ${scanning ? 'animate-pulse' : ''}`} />
              {scanning ? 'Scanning…' : 'Run scan'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Unresolved" value={summary?.unresolved_count ?? 0} />
        <Tile label="Critical" value={counts.critical} accent="text-red-600" />
        <Tile label="Warnings" value={counts.warning} accent="text-amber-600" />
        <Tile label="Info" value={counts.info} accent="text-blue-600" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm text-ionex-text-mute">Severity:</span>
        {(['all', 'critical', 'warning', 'info'] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${severityFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s}</button>
        ))}
        <span className="text-sm text-ionex-text-mute ml-3">Status:</span>
        {(['unresolved', 'resolved', 'all'] as const).map(s => (
          <button key={s} onClick={() => setResolvedFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${resolvedFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s}</button>
        ))}
        <span className="text-sm text-ionex-text-mute ml-3">Type:</span>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1 border border-ionex-border-200 rounded-full text-xs"
        >
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Activity className="w-8 h-8" />}
          title="No intelligence items"
          description={canScan ? "Click 'Run scan' to sweep the platform for signals." : "No signals right now."}
        />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(it => (
            <button
              key={it.id}
              onClick={() => setSelected(it)}
              className={`text-left p-4 bg-white border rounded-xl hover:shadow-md transition-shadow ${it.resolved ? 'opacity-70 border-ionex-border-100' : SEVERITY_STYLE[it.severity]}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {it.resolved ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : SEVERITY_ICON[it.severity]}
                  <span className="text-[10px] uppercase tracking-wide font-semibold">{it.type}</span>
                </div>
                <span className="text-[10px] text-ionex-text-mute">{new Date(it.created_at).toLocaleDateString()}</span>
              </div>
              <h3 className="font-semibold text-sm text-gray-900 mb-1">{it.title}</h3>
              <p className="text-xs text-ionex-text-mute line-clamp-3">{it.description}</p>
              {it.action_required && !it.resolved && (
                <p className="mt-2 text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> {it.action_required}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          item={selected}
          canResolve={!selected.resolved}
          onClose={() => setSelected(null)}
          onResolve={() => resolveItem(selected)}
        />
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="p-4 bg-white border border-ionex-border-100 rounded-xl">
      <p className="text-xs uppercase tracking-wide text-ionex-text-mute">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function DetailModal({ item, canResolve, onClose, onResolve }: {
  item: IntelItem;
  canResolve: boolean;
  onClose: () => void;
  onResolve: () => void;
}) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[10px] border ${SEVERITY_STYLE[item.severity]}`}>
              {item.severity}
            </span>
            <span className="text-xs text-ionex-text-mute uppercase">{item.type}</span>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
          {item.action_required && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs uppercase text-amber-700 font-semibold mb-1">Action required</p>
              <p className="text-sm text-amber-900">{item.action_required}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs pt-3 border-t border-ionex-border-100">
            <div>
              <p className="text-ionex-text-mute">Raised</p>
              <p className="font-medium">{new Date(item.created_at).toLocaleString()}</p>
            </div>
            {item.entity_type && (
              <div>
                <p className="text-ionex-text-mute">Entity</p>
                <p className="font-medium">{item.entity_type}{item.entity_id ? `#${item.entity_id.slice(0, 12)}` : ''}</p>
              </div>
            )}
            {item.resolved === 1 && item.resolved_at && (
              <div className="col-span-2">
                <p className="text-ionex-text-mute">Resolved</p>
                <p className="font-medium">{new Date(item.resolved_at).toLocaleString()} by {item.resolved_by || 'system'}</p>
              </div>
            )}
          </div>
        </div>
        {canResolve && (
          <div className="p-5 border-t border-ionex-border-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Close</button>
            <button onClick={onResolve} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Mark resolved
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
