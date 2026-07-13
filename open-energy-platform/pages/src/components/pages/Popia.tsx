import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Download, Trash2, X, Ban, FileEdit, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useAuth } from '../../lib/useAuth';

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

type Tab = 'consent' | 'dsar' | 'erasure' | 'objection' | 'correction' | 'breach';

type ObjectionStatus = 'pending' | 'upheld' | 'rejected' | 'withdrawn';
type CorrectionStatus = 'pending' | 'applied' | 'rejected' | 'withdrawn';
type BreachStatus = 'open' | 'contained' | 'closed';
type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ObjectionRequest {
  id: string;
  participant_id: string;
  processing_purpose: string;
  grounds: string | null;
  status: ObjectionStatus;
  requested_at: string;
}

interface CorrectionRequest {
  id: string;
  participant_id: string;
  field_name: string;
  current_value: string | null;
  requested_value: string;
  reason: string | null;
  status: CorrectionStatus;
  requested_at: string;
}

interface BreachRecord {
  id: string;
  discovered_at: string;
  severity: BreachSeverity;
  category: string;
  description: string;
  affected_subjects_count: number | null;
  status: BreachStatus;
  regulator_notified_at: string | null;
  subjects_notified_at: string | null;
  created_at: string;
}

interface Consent {
  marketing: boolean;
  data_sharing: boolean;
  third_party: boolean;
  analytics: boolean;
  updated_at: string | null;
}

interface DsarRequest {
  id: string;
  participant_id: string;
  scope: string;
  status: 'pending' | 'completed' | 'rejected';
  requested_at: string;
  processed_at?: string | null;
  processed_by?: string | null;
}

interface ErasureRequest {
  id: string;
  participant_id: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requested_at: string;
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'completed' || status === 'approved' || status === 'applied' || status === 'upheld') {
    return { background: GOOD_BG, color: GOOD };
  }
  if (status === 'pending' || status === 'contained') {
    return { background: WARN_BG, color: WARN };
  }
  if (status === 'open') {
    return { background: BAD_BG, color: BAD };
  }
  return { background: BG2, color: TX2 };
}

function severityStyle(severity: string): React.CSSProperties {
  if (severity === 'critical') return { background: BAD_BG, color: BAD };
  if (severity === 'high') return { background: 'color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, oklch(0.97 0.05 35)))', color: 'var(--warn, oklch(0.42 0.18 35))' };
  if (severity === 'medium') return { background: WARN_BG, color: WARN };
  return { background: BG2, color: TX2 };
}

const TABS: { k: Tab; label: string; privileged?: boolean }[] = [
  { k: 'consent', label: 'Consent' },
  { k: 'dsar', label: 'DSAR (§23)' },
  { k: 'correction', label: 'Correction (§24)' },
  { k: 'erasure', label: 'Erasure (§24)' },
  { k: 'objection', label: 'Objection (§11(3))' },
  { k: 'breach', label: 'Breach Register (§22)', privileged: true },
];

export function Popia() {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'regulator' || user?.role === 'support';
  const [tab, setTab] = useState<Tab>('consent');
  const [consent, setConsent] = useState<Consent | null>(null);
  const [dsars, setDsars] = useState<DsarRequest[]>([]);
  const [erasures, setErasures] = useState<ErasureRequest[]>([]);
  const [objections, setObjections] = useState<ObjectionRequest[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [breaches, setBreaches] = useState<BreachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [showErasure, setShowErasure] = useState(false);
  const [showObjection, setShowObjection] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showBreach, setShowBreach] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'consent') {
        const r = await api.get('/popia/consent');
        setConsent(r.data?.data || null);
      } else if (tab === 'dsar') {
        const r = await api.get('/popia/dsar');
        setDsars(r.data?.data || []);
      } else if (tab === 'erasure') {
        const r = await api.get('/popia/erasure');
        setErasures(r.data?.data || []);
      } else if (tab === 'objection') {
        const r = await api.get('/popia/objection');
        setObjections(r.data?.data || []);
      } else if (tab === 'correction') {
        const r = await api.get('/popia/correction');
        setCorrections(r.data?.data || []);
      } else if (tab === 'breach') {
        const r = await api.get('/popia/breach');
        setBreaches(r.data?.data || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load POPIA data');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const saveConsent = useCallback(async (next: Partial<Consent>) => {
    if (!consent) return;
    setSavingConsent(true);
    try {
      const merged = { ...consent, ...next };
      const res = await api.post('/popia/consent', {
        marketing: merged.marketing,
        data_sharing: merged.data_sharing,
        third_party: merged.third_party,
        analytics: merged.analytics,
      });
      const updatedAt = res?.data?.data?.updated_at || new Date().toISOString();
      setConsent({ ...merged, updated_at: updatedAt });
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to update consent');
    } finally {
      setSavingConsent(false);
    }
  }, [consent]);

  const requestDsar = useCallback(async () => {
    try {
      await api.post('/popia/dsar', { scope: 'all' });
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to request DSAR');
    }
  }, [fetchData]);

  const exportDsar = useCallback(async (id: string) => {
    try {
      const r = await api.get(`/popia/dsar/${id}/export`);
      const blob = new Blob([JSON.stringify(r.data?.data || {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `popia-dsar-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to export DSAR');
    }
  }, [fetchData]);

  const visibleTabs = TABS.filter(t => !t.privileged || isPrivileged);

  // KPI counts derived from current tab data
  const kpiCount = tab === 'dsar' ? dsars.length
    : tab === 'erasure' ? erasures.length
    : tab === 'objection' ? objections.length
    : tab === 'correction' ? corrections.length
    : tab === 'breach' ? breaches.length
    : 0;

  const pendingCount = tab === 'dsar' ? dsars.filter(d => d.status === 'pending').length
    : tab === 'erasure' ? erasures.filter(d => d.status === 'pending').length
    : tab === 'objection' ? objections.filter(d => d.status === 'pending').length
    : tab === 'correction' ? corrections.filter(d => d.status === 'pending').length
    : tab === 'breach' ? breaches.filter(d => d.status === 'open').length
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
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <ShieldCheck size={16} style={{ color: TX2 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: TX3, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              POPIA (Act 4 of 2013)
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Data Privacy</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Consent, data-subject access and right-to-erasure — Sections 23 and 24.
          </p>
        </div>

        {/* KPI strip — shown for list tabs */}
        {tab !== 'consent' && !loading && !error && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{kpiCount}</div>
            </div>
            <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {tab === 'breach' ? 'Open' : 'Pending'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: pendingCount > 0 ? WARN : TX1, fontFamily: MONO, marginTop: 4 }}>
                {pendingCount}
              </div>
            </div>
            {tab === 'dsar' && (
              <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Completed</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                  {dsars.filter(d => d.status === 'completed').length}
                </div>
              </div>
            )}
            {tab === 'breach' && (
              <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
                <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Critical</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: breaches.filter(b => b.severity === 'critical').length > 0 ? BAD : TX1, fontFamily: MONO, marginTop: 4 }}>
                  {breaches.filter(b => b.severity === 'critical').length}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}`, marginBottom: 20 }}>
          {visibleTabs.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: tab === t.k ? 700 : 500,
                color: tab === t.k ? ACC : TX2,
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.k ? `2px solid ${ACC}` : '2px solid transparent',
                marginBottom: -2,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && <Skeleton variant="card" rows={3} />}
        {error && <ErrorBanner message={error} onRetry={fetchData} />}

        {/* CONSENT TAB */}
        {!loading && !error && tab === 'consent' && consent && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', maxWidth: 640 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Processing Consents
            </div>
            <p style={{ fontSize: 13, color: TX2, marginBottom: 16, lineHeight: 1.5 }}>
              Under POPIA, you may withdraw consent to any processing activity. Analytics is required for core platform
              functionality and logging. Last updated:{' '}
              <span style={{ fontFamily: MONO, fontSize: 12 }}>
                {consent.updated_at ? new Date(consent.updated_at).toLocaleString() : 'never'}
              </span>
            </p>
            {([
              { key: 'marketing' as const, label: 'Marketing communications', hint: 'Product updates, event invitations, newsletters.' },
              { key: 'data_sharing' as const, label: 'Data sharing with counterparties', hint: 'Share contract + trading metadata with verified counterparties.' },
              { key: 'third_party' as const, label: 'Third-party integrations', hint: 'Allow data flow to connected KYC, payment, or registry providers.' },
              { key: 'analytics' as const, label: 'Platform analytics (required)', hint: 'Required for login audit, fraud detection, and service improvement.' },
            ]).map((row, i) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingTop: i === 0 ? 0 : 14,
                  marginTop: i === 0 ? 0 : 14,
                  borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>{row.label}</div>
                  <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>{row.hint}</div>
                </div>
                <Toggle
                  enabled={consent[row.key]}
                  disabled={savingConsent || row.key === 'analytics'}
                  onChange={val => saveConsent({ [row.key]: val } as Partial<Consent>)}
                />
              </div>
            ))}
          </div>
        )}

        {/* DSAR TAB */}
        {!loading && !error && tab === 'dsar' && (
          dsars.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No DSAR requests" description="Use 'Request my data' in the panel to submit a Section 23 DSAR." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['ID', 'Scope', 'Status', 'Requested', 'Processed', 'Action'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dsars.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.id}</td>
                    <td style={{ padding: '10px 12px', color: TX1 }}>{r.scope}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...statusStyle(r.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{new Date(r.requested_at).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{r.processed_at ? new Date(r.processed_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        type="button"
                        onClick={() => exportDsar(r.id)}
                        style={{ background: ACC, color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 5, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Download size={12} /> Export
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* ERASURE TAB */}
        {!loading && !error && tab === 'erasure' && (
          erasures.length === 0 ? (
            <EmptyState icon={<Trash2 className="w-8 h-8" />} title="No erasure requests" description="Submit a Section 24 request if you want to delete your data." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['ID', 'Reason', 'Status', 'Requested'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {erasures.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.id}</td>
                    <td style={{ padding: '10px 12px', color: TX1, maxWidth: 320 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>{r.reason}</div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...statusStyle(r.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{new Date(r.requested_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* OBJECTION TAB */}
        {!loading && !error && tab === 'objection' && (
          objections.length === 0 ? (
            <EmptyState icon={<Ban className="w-8 h-8" />} title="No objections on file" description="Raise one if you want to opt out of a specific processing purpose." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['ID', 'Purpose', 'Status', 'Requested'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {objections.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.id}</td>
                    <td style={{ padding: '10px 12px', color: TX1, maxWidth: 320 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.processing_purpose}>{r.processing_purpose}</div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...statusStyle(r.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{new Date(r.requested_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* CORRECTION TAB */}
        {!loading && !error && tab === 'correction' && (
          corrections.length === 0 ? (
            <EmptyState icon={<FileEdit className="w-8 h-8" />} title="No correction requests" description="Submit one to update an inaccurate field on your profile." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['ID', 'Field', 'Current', 'Requested', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corrections.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.id}</td>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 12, color: TX1 }}>{r.field_name}</td>
                    <td style={{ padding: '10px 12px', color: TX2, maxWidth: 160 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.current_value || ''}>{r.current_value || '—'}</div></td>
                    <td style={{ padding: '10px 12px', color: TX1, maxWidth: 160 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.requested_value}>{r.requested_value}</div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...statusStyle(r.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {/* BREACH TAB */}
        {!loading && !error && tab === 'breach' && isPrivileged && (
          breaches.length === 0 ? (
            <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="No breaches recorded" description="Clean register — nothing to notify." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['ID', 'Severity', 'Category', 'Affected', 'Status', 'Discovered', 'Regulator notified'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breaches.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                    <td style={{ padding: '10px 12px', fontFamily: MONO, fontSize: 11, color: TX2 }}>{r.id}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...severityStyle(r.severity), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.severity}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX1, fontSize: 12 }}>{r.category}</td>
                    <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, fontSize: 12 }}>{r.affected_subjects_count ?? 0}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...statusStyle(r.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{new Date(r.discovered_at).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>{r.regulator_notified_at ? new Date(r.regulator_notified_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
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
        {/* Header + refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</span>
          <button
            type="button"
            onClick={fetchData}
            aria-label="Refresh"
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: TX2, display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Tab-specific quick actions */}
        {tab === 'dsar' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Request Access</div>
            <p style={{ fontSize: 12, color: TX3, marginBottom: 12, lineHeight: 1.5 }}>
              A copy of your profile, consents, contracts, invoices, notifications and audit trail.
            </p>
            <button
              type="button"
              onClick={requestDsar}
              style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, width: '100%' }}
            >
              Request my data (Section 23)
            </button>
          </div>
        )}

        {tab === 'erasure' && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BAD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Erasure Request</div>
            <p style={{ fontSize: 12, color: TX2, marginBottom: 12, lineHeight: 1.5 }}>
              Submit for DPO review. Regulatory retention periods may prevent immediate deletion.
            </p>
            <button
              type="button"
              onClick={() => setShowErasure(true)}
              style={{ background: BAD, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Trash2 size={14} /> Request erasure (Section 24)
            </button>
          </div>
        )}

        {tab === 'objection' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Raise Objection</div>
            <p style={{ fontSize: 12, color: TX3, marginBottom: 12, lineHeight: 1.5 }}>
              Object to a specific processing purpose. Reviewed by the DPO within 30 days.
            </p>
            <button
              type="button"
              onClick={() => setShowObjection(true)}
              style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Ban size={14} /> Raise objection (Section 11(3))
            </button>
          </div>
        )}

        {tab === 'correction' && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Request Correction</div>
            <p style={{ fontSize: 12, color: TX3, marginBottom: 12, lineHeight: 1.5 }}>
              Name, company or email corrections with DPO audit trail.
            </p>
            <button
              type="button"
              onClick={() => setShowCorrection(true)}
              style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <FileEdit size={14} /> Request correction (Section 24)
            </button>
          </div>
        )}

        {tab === 'breach' && isPrivileged && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BAD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Record Breach</div>
            <p style={{ fontSize: 12, color: TX2, marginBottom: 12, lineHeight: 1.5 }}>
              Notifications to the Information Regulator are required without undue delay.
            </p>
            <button
              type="button"
              onClick={() => setShowBreach(true)}
              style={{ background: BAD, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <AlertTriangle size={14} /> Record breach (Section 22)
            </button>
          </div>
        )}

        {/* Regulatory reference card */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Regulatory Reference
          </div>
          {[
            { section: '§11(3)', title: 'Right to object', desc: 'Object to specific processing purposes' },
            { section: '§22', title: 'Breach notification', desc: 'Notify Information Regulator without undue delay' },
            { section: '§23', title: 'Data subject access', desc: 'Request a copy of your personal information' },
            { section: '§24', title: 'Correction & erasure', desc: 'Correct inaccurate or request deletion of data' },
          ].map((ref, i) => (
            <div key={ref.section} style={{ display: 'flex', gap: 10, paddingTop: i === 0 ? 0 : 10, marginTop: i === 0 ? 0 : 10, borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ACC, minWidth: 40, paddingTop: 1 }}>{ref.section}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: TX1 }}>{ref.title}</div>
                <div style={{ fontSize: 11, color: TX3 }}>{ref.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Consent summary — only on consent tab */}
        {tab === 'consent' && consent && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Consent Summary
            </div>
            {([
              { key: 'marketing' as const, label: 'Marketing' },
              { key: 'data_sharing' as const, label: 'Data sharing' },
              { key: 'third_party' as const, label: 'Third-party' },
              { key: 'analytics' as const, label: 'Analytics' },
            ]).map((row, i) => (
              <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: i === 0 ? 0 : 8, marginTop: i === 0 ? 0 : 8, borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 12, color: TX2 }}>{row.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: consent[row.key] ? GOOD_BG : BG2,
                  color: consent[row.key] ? GOOD : TX3,
                }}>
                  {consent[row.key] ? 'Granted' : 'Withheld'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showErasure && (
        <ErasureModal onClose={() => setShowErasure(false)} onSubmitted={() => { setShowErasure(false); void fetchData(); }} />
      )}
      {showObjection && (
        <ObjectionModal onClose={() => setShowObjection(false)} onSubmitted={() => { setShowObjection(false); void fetchData(); }} />
      )}
      {showCorrection && (
        <CorrectionModal onClose={() => setShowCorrection(false)} onSubmitted={() => { setShowCorrection(false); void fetchData(); }} />
      )}
      {showBreach && (
        <BreachModal onClose={() => setShowBreach(false)} onSubmitted={() => { setShowBreach(false); void fetchData(); }} />
      )}
    </div>
  );
}

export default Popia;

// ── Shared modal styles ──────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 13,
  color: TX1,
  background: BG,
  boxSizing: 'border-box',
  outline: 'none',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: TX2,
  marginBottom: 0,
};

function ModalShell({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 540, width: '100%', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: TX1, margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TX2, padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        height: 24,
        width: 44,
        alignItems: 'center',
        borderRadius: 12,
        border: 'none',
        background: enabled ? ACC : 'oklch(0.78 0.004 250)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        display: 'inline-block',
        height: 18,
        width: 18,
        borderRadius: '50%',
        background: 'var(--s1, #fff)',
        transform: enabled ? 'translateX(22px)' : 'translateX(3px)',
        transition: 'transform 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function ErasureModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  useEscapeKey(onClose);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!confirmation) { setErr('You must confirm the request.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/popia/erasure', { reason: reason || 'User requested', confirmation: true });
      onSubmitted();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to submit request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Request erasure (Section 24)"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !confirmation} style={{ background: BAD, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving || !confirmation ? 0.5 : 1 }}>
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <p style={{ fontSize: 13, color: TX2, lineHeight: 1.5, margin: 0 }}>
        Submitting this request will be reviewed by the Data Protection Officer. Retention obligations under FIC,
        Companies Act, Tax Administration Act and NERSA licensing may prevent immediate deletion; in that case
        data will be anonymised and retained only as legally required.
      </p>
      <label style={LABEL_STYLE}>
        Reason (optional)
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          style={{ ...INPUT_STYLE, resize: 'none' }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: TX1, cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} style={{ marginTop: 2 }} />
        <span>I understand that retention obligations may delay or prevent erasure, and I confirm I want to submit this request.</span>
      </label>
    </ModalShell>
  );
}

function ObjectionModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  useEscapeKey(onClose);
  const [processingPurpose, setProcessingPurpose] = useState('');
  const [grounds, setGrounds] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!processingPurpose.trim()) { setErr('Processing purpose is required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/popia/objection', {
        processing_purpose: processingPurpose.trim(),
        grounds: grounds.trim() || undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to submit objection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Raise objection (Section 11(3))"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !processingPurpose.trim()} style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving || !processingPurpose.trim() ? 0.5 : 1 }}>
            {saving ? 'Submitting…' : 'Submit objection'}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <p style={{ fontSize: 13, color: TX2, lineHeight: 1.5, margin: 0 }}>
        You may object to a specific processing purpose. The Data Protection Officer will review and respond
        within 30 days as required by POPIA 4 of 2013 Section 11(3).
      </p>
      <label style={LABEL_STYLE}>
        Processing purpose
        <input
          value={processingPurpose}
          onChange={e => setProcessingPurpose(e.target.value)}
          placeholder="e.g. Direct marketing, Cross-participant data sharing"
          style={INPUT_STYLE}
        />
      </label>
      <label style={LABEL_STYLE}>
        Grounds (optional)
        <textarea
          value={grounds}
          onChange={e => setGrounds(e.target.value)}
          rows={3}
          style={{ ...INPUT_STYLE, resize: 'none' }}
        />
      </label>
    </ModalShell>
  );
}

function CorrectionModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  useEscapeKey(onClose);
  const [fieldName, setFieldName] = useState<'name' | 'company_name' | 'email'>('name');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!requestedValue.trim()) { setErr('Requested value is required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/popia/correction', {
        field_name: fieldName,
        requested_value: requestedValue.trim(),
        reason: reason.trim() || undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to submit correction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Request correction (Section 24)"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !requestedValue.trim()} style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving || !requestedValue.trim() ? 0.5 : 1 }}>
            {saving ? 'Submitting…' : 'Submit correction'}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <p style={{ fontSize: 13, color: TX2, lineHeight: 1.5, margin: 0 }}>
        Request correction of inaccurate personal information on your profile. The DPO will review and apply the
        change once confirmed.
      </p>
      <label style={LABEL_STYLE}>
        Field
        <select
          value={fieldName}
          onChange={e => setFieldName(e.target.value as 'name' | 'company_name' | 'email')}
          style={INPUT_STYLE}
        >
          <option value="name">Name</option>
          <option value="company_name">Company name</option>
          <option value="email">Email</option>
        </select>
      </label>
      <label style={LABEL_STYLE}>
        Requested value
        <input
          value={requestedValue}
          onChange={e => setRequestedValue(e.target.value)}
          style={INPUT_STYLE}
        />
      </label>
      <label style={LABEL_STYLE}>
        Reason (optional)
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          style={{ ...INPUT_STYLE, resize: 'none' }}
        />
      </label>
    </ModalShell>
  );
}

function toLocalDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BreachModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  useEscapeKey(onClose);
  const [discoveredAt, setDiscoveredAt] = useState(() => toLocalDateTimeValue(new Date()));
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [category, setCategory] = useState('unauthorised_access');
  const [description, setDescription] = useState('');
  const [affectedCount, setAffectedCount] = useState('0');
  const [containmentActions, setContainmentActions] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!description.trim()) { setErr('Description is required.'); return; }
    if (!discoveredAt) { setErr('Discovered-at timestamp is required.'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/popia/breach', {
        discovered_at: new Date(discoveredAt).toISOString(),
        severity,
        category,
        description: description.trim(),
        affected_subjects_count: Number(affectedCount) || 0,
        containment_actions: containmentActions.trim() || undefined,
      });
      onSubmitted();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to record breach');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Record breach (Section 22)"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || !description.trim()} style={{ background: BAD, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, opacity: saving || !description.trim() ? 0.5 : 1 }}>
            {saving ? 'Recording…' : 'Record breach'}
          </button>
        </>
      }
    >
      {err && <ErrorBanner message={err} />}
      <p style={{ fontSize: 13, color: TX2, lineHeight: 1.5, margin: 0 }}>
        Security compromises must be reported to the Information Regulator and affected data subjects without
        undue delay (POPIA 4 of 2013 Section 22). Complete initial details now; notification timestamps can be
        updated later as the incident progresses.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={LABEL_STYLE}>
          Discovered at
          <input
            type="datetime-local"
            value={discoveredAt}
            onChange={e => setDiscoveredAt(e.target.value)}
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          Severity
          <select value={severity} onChange={e => setSeverity(e.target.value as 'low' | 'medium' | 'high' | 'critical')} style={INPUT_STYLE}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>
      <label style={LABEL_STYLE}>
        Category
        <select value={category} onChange={e => setCategory(e.target.value)} style={INPUT_STYLE}>
          <option value="unauthorised_access">Unauthorised access</option>
          <option value="data_loss">Data loss</option>
          <option value="malware">Malware</option>
          <option value="misdelivery">Misdelivery / wrong recipient</option>
          <option value="insider">Insider misuse</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label style={LABEL_STYLE}>
        Description
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          style={{ ...INPUT_STYLE, resize: 'none' }}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={LABEL_STYLE}>
          Affected subjects
          <input
            type="number"
            min="0"
            value={affectedCount}
            onChange={e => setAffectedCount(e.target.value)}
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          Containment actions
          <input
            value={containmentActions}
            onChange={e => setContainmentActions(e.target.value)}
            placeholder="e.g. Rotated tokens, isolated host"
            style={INPUT_STYLE}
          />
        </label>
      </div>
    </ModalShell>
  );
}
