import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, Scan, X } from 'lucide-react';
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

function sevColor(sev: Severity): string {
  if (sev === 'critical') return BAD;
  if (sev === 'warning') return WARN;
  return 'oklch(0.46 0.15 250)';
}

function sevBg(sev: Severity): string {
  if (sev === 'critical') return 'oklch(0.96 0.04 20)';
  if (sev === 'warning') return 'oklch(0.97 0.04 55)';
  return 'oklch(0.96 0.03 250)';
}

function sevBorder(sev: Severity): string {
  if (sev === 'critical') return 'oklch(0.85 0.10 20)';
  if (sev === 'warning') return 'oklch(0.85 0.10 55)';
  return 'oklch(0.85 0.06 250)';
}

function KpiTile({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'warn' | 'bad' | 'info' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : tone === 'info' ? 'oklch(0.46 0.15 250)' : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

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

  const recentResolved = useMemo(() => items.filter(i => i.resolved === 1).slice(0, 8), [items]);

  const aiInsight = useMemo(() => {
    if (!summary) return 'Loading intelligence summary…';
    const total = summary.unresolved_count;
    if (counts.critical > 0) return `${counts.critical} critical signal${counts.critical > 1 ? 's' : ''} require immediate attention. Review and resolve before market open.`;
    if (total > 10) return `${total} unresolved items detected. Prioritise warnings to reduce operational exposure.`;
    if (total === 0) return 'No active signals. Platform health is nominal across all monitored dimensions.';
    return `${total} unresolved item${total > 1 ? 's' : ''} pending review. ${counts.warning} warning${counts.warning !== 1 ? 's' : ''} and ${counts.info} info signal${counts.info !== 1 ? 's' : ''}.`;
  }, [summary, counts]);

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
      {/* LEFT */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>
        {/* Header */}
        <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} style={{ color: ACC }} />
              Intelligence Feed
            </h1>
            <p style={{ fontSize: 12, color: TX2, margin: '4px 0 0' }}>Operational, financial, regulatory and market signals</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={fetchData}
              style={{ height: 32, width: 32, borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TX2 }}
              aria-label="Refresh">
              <RefreshCw size={14} />
            </button>
            {canScan && (
              <button type="button" onClick={runScan} disabled={scanning}
                style={{ height: 32, padding: '0 12px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 12, fontWeight: 600, cursor: scanning ? 'not-allowed' : 'pointer', opacity: scanning ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Scan size={13} style={{ animation: scanning ? 'pulse 1s infinite' : 'none' }} />
                {scanning ? 'Scanning…' : 'Run scan'}
              </button>
            )}
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <KpiTile label="Unresolved" value={summary?.unresolved_count ?? 0} />
          <KpiTile label="Critical" value={counts.critical} tone="bad" />
          <KpiTile label="Warnings" value={counts.warning} tone="warn" />
          <KpiTile label="Info" value={counts.info} tone="info" />
        </div>

        {/* Filter strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: TX3, fontWeight: 600 }}>Severity:</span>
          {(['all', 'critical', 'warning', 'info'] as const).map(s => (
            <button key={s} type="button" onClick={() => setSeverityFilter(s)}
              style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 11, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
                background: severityFilter === s ? ACC : BG2,
                color: severityFilter === s ? '#fff' : TX2,
                border: `1px solid ${severityFilter === s ? ACC : BORDER}` }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: TX3, fontWeight: 600 }}>Status:</span>
          {(['unresolved', 'resolved', 'all'] as const).map(s => (
            <button key={s} type="button" onClick={() => setResolvedFilter(s)}
              style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 11, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
                background: resolvedFilter === s ? ACC : BG2,
                color: resolvedFilter === s ? '#fff' : TX2,
                border: `1px solid ${resolvedFilter === s ? ACC : BORDER}` }}>
              {s}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: TX3, fontWeight: 600 }}>Type:</span>
          <button key="all-types" type="button" onClick={() => setTypeFilter('all')}
            style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: typeFilter === 'all' ? ACC : BG2,
              color: typeFilter === 'all' ? '#fff' : TX2,
              border: `1px solid ${typeFilter === 'all' ? ACC : BORDER}` }}>
            All types
          </button>
          {types.map(t => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)}
              style={{ height: 26, padding: '0 10px', borderRadius: 13, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                background: typeFilter === t ? ACC : BG2,
                color: typeFilter === t ? '#fff' : TX2,
                border: `1px solid ${typeFilter === t ? ACC : BORDER}` }}>
              {t}
            </button>
          ))}
        </div>

        {loading && <Skeleton variant="card" rows={4} />}
        {error && <ErrorBanner message={error} onRetry={fetchData} />}

        {!loading && !error && items.length === 0 && (
          <EmptyState
            icon={<Activity size={32} />}
            title="No intelligence items"
            description={canScan ? "Click 'Run scan' to sweep the platform for signals." : 'No signals right now.'}
          />
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(it => (
              <button type="button" key={it.id} onClick={() => setSelected(it)}
                style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                  background: it.resolved ? BG1 : sevBg(it.severity),
                  border: `1px solid ${it.resolved ? BORDER : sevBorder(it.severity)}`,
                  opacity: it.resolved ? 0.75 : 1, transition: 'box-shadow 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.resolved
                      ? <CheckCircle2 size={14} style={{ color: GOOD }} />
                      : <AlertTriangle size={14} style={{ color: sevColor(it.severity) }} />}
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: it.resolved ? TX3 : sevColor(it.severity) }}>{it.severity}</span>
                    <span style={{ fontSize: 10, color: TX3, marginLeft: 4 }}>·</span>
                    <span style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{it.type}</span>
                  </div>
                  <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>{new Date(it.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX1, marginBottom: 4 }}>{it.title}</div>
                <div style={{ fontSize: 12, color: TX2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{it.description}</div>
                {it.action_required && !it.resolved && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: WARN }}>
                    <Clock size={11} /> {it.action_required}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT panel */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI Assist */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>AI Assist</div>
          <p style={{ fontSize: 12, color: TX2, lineHeight: 1.6, margin: 0 }}>{aiInsight}</p>
          {counts.critical > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'oklch(0.96 0.04 20)', border: `1px solid oklch(0.85 0.10 20)`, fontSize: 11, color: BAD, fontWeight: 600 }}>
              {counts.critical} critical signal{counts.critical > 1 ? 's' : ''} — immediate resolution recommended
            </div>
          )}
        </div>

        {/* Severity breakdown */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Severity Breakdown</div>
          {(['critical', 'warning', 'info'] as Severity[]).map(sev => {
            const c = counts[sev];
            const total = (counts.critical + counts.warning + counts.info) || 1;
            const pct = Math.round((c / total) * 100);
            return (
              <div key={sev} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, textTransform: 'capitalize', color: sevColor(sev), fontWeight: 600 }}>{sev}</span>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: TX2 }}>{c}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: BG2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: sevColor(sev), transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Type breakdown */}
        {summary?.by_type && summary.by_type.length > 0 && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>By Type</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {summary.by_type.slice(0, 8).map(({ type, c }) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{type}</span>
                  <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 700, color: TX1 }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recently resolved */}
        {recentResolved.length > 0 && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recently Resolved</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentResolved.map(it => (
                <button key={it.id} type="button" onClick={() => setSelected(it)}
                  style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: BG2, border: `1px solid ${BORDER}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                    <CheckCircle2 size={11} style={{ color: GOOD }} />
                    <span style={{ fontSize: 10, color: GOOD, fontWeight: 700 }}>resolved</span>
                    <span style={{ fontSize: 10, color: TX3, marginLeft: 'auto', fontFamily: MONO }}>{new Date(it.created_at).toLocaleDateString()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: TX2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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

function DetailModal({ item, canResolve, onClose, onResolve }: {
  item: IntelItem;
  canResolve: boolean;
  onClose: () => void;
  onResolve: () => void;
}) {
  useEscapeKey(onClose);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose} role="dialog" aria-modal="true">
      <div style={{ background: BG1, borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${BORDER}` }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
              background: item.resolved ? BG2 : sevBg(item.severity),
              color: item.resolved ? TX3 : sevColor(item.severity),
              border: `1px solid ${item.resolved ? BORDER : sevBorder(item.severity)}` }}>
              {item.severity}
            </span>
            <span style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX3, padding: 4, borderRadius: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: '0 0 10px' }}>{item.title}</h2>
          <p style={{ fontSize: 13, color: TX2, lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{item.description}</p>

          {item.action_required && (
            <div style={{ padding: '10px 12px', background: 'oklch(0.97 0.04 55)', border: `1px solid oklch(0.85 0.10 55)`, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', color: WARN, fontWeight: 700, marginBottom: 4, letterSpacing: '0.07em' }}>Action required</div>
              <div style={{ fontSize: 13, color: TX1 }}>{item.action_required}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Raised</div>
              <div style={{ fontSize: 12, color: TX1, fontFamily: MONO }}>{new Date(item.created_at).toLocaleString()}</div>
            </div>
            {item.entity_type && (
              <div>
                <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Entity</div>
                <div style={{ fontSize: 12, color: TX1, fontFamily: MONO }}>{item.entity_type}{item.entity_id ? `#${item.entity_id.slice(0, 12)}` : ''}</div>
              </div>
            )}
            {item.resolved === 1 && item.resolved_at && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Resolved</div>
                <div style={{ fontSize: 12, color: GOOD, fontFamily: MONO }}>{new Date(item.resolved_at).toLocaleString()} by {item.resolved_by || 'system'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose}
            style={{ height: 34, padding: '0 14px', borderRadius: 7, border: `1px solid ${BORDER}`, background: BG2, color: TX2, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Close
          </button>
          {canResolve && (
            <button type="button" onClick={onResolve}
              style={{ height: 34, padding: '0 14px', borderRadius: 7, border: 'none', background: GOOD, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} /> Mark resolved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Intelligence;
