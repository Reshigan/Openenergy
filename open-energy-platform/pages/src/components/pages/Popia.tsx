import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Download, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useEscapeKey } from '../../hooks/useEscapeKey';

type Tab = 'consent' | 'dsar' | 'erasure';

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

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-200 text-gray-700',
};

export function Popia() {
  const [tab, setTab] = useState<Tab>('consent');
  const [consent, setConsent] = useState<Consent | null>(null);
  const [dsars, setDsars] = useState<DsarRequest[]>([]);
  const [erasures, setErasures] = useState<ErasureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [showErasure, setShowErasure] = useState(false);

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
      } else {
        const r = await api.get('/popia/erasure');
        setErasures(r.data?.data || []);
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
      // Prefer server-authoritative updated_at; fall back to local now() if absent.
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6" /> POPIA (Act 4 of 2013)
          </h1>
          <p className="text-ionex-text-mute">Consent, data-subject access and right-to-erasure — Sections 23 and 24.</p>
        </div>
        <button onClick={fetchData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="border-b border-ionex-border-100 flex gap-6">
        {([
          { k: 'consent', label: 'Consent' },
          { k: 'dsar', label: 'DSAR (Section 23)' },
          { k: 'erasure', label: 'Erasure (Section 24)' },
        ] as Array<{ k: Tab; label: string }>).map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`pb-3 border-b-2 transition-colors ${tab === t.k ? 'border-ionex-brand text-ionex-brand font-semibold' : 'border-transparent text-ionex-text-mute hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <Skeleton variant="card" rows={3} />}
      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {!loading && !error && tab === 'consent' && consent && (
        <div className="bg-white border border-ionex-border-100 rounded-xl p-5 space-y-4 max-w-2xl">
          <p className="text-sm text-ionex-text-mute">
            Under POPIA, you may withdraw consent to any processing activity. Analytics is required for core platform
            functionality and logging. Last updated: {consent.updated_at ? new Date(consent.updated_at).toLocaleString() : 'never'}.
          </p>
          {([
            { key: 'marketing' as const, label: 'Marketing communications', hint: 'Product updates, event invitations, newsletters.' },
            { key: 'data_sharing' as const, label: 'Data sharing with counterparties', hint: 'Share contract + trading metadata with verified counterparties.' },
            { key: 'third_party' as const, label: 'Third-party integrations', hint: 'Allow data flow to connected KYC, payment, or registry providers.' },
            { key: 'analytics' as const, label: 'Platform analytics (required)', hint: 'Required for login audit, fraud detection, and service improvement.' },
          ]).map(row => (
            <div key={row.key} className="flex items-start justify-between gap-4 border-t border-ionex-border-100 pt-3 first:border-t-0 first:pt-0">
              <div>
                <p className="font-medium text-gray-900">{row.label}</p>
                <p className="text-xs text-ionex-text-mute mt-0.5">{row.hint}</p>
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

      {!loading && !error && tab === 'dsar' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={requestDsar} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
              Request my data (Section 23)
            </button>
            <p className="text-sm text-ionex-text-mute">A copy of your profile, consents, contracts, invoices, notifications and audit trail.</p>
          </div>
          {dsars.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No DSAR requests" description="Click 'Request my data' to submit a Section 23 DSAR." />
          ) : (
            <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
                  <tr><Th>ID</Th><Th>Scope</Th><Th>Status</Th><Th>Requested</Th><Th>Processed</Th><Th>Action</Th></tr>
                </thead>
                <tbody>
                  {dsars.map(r => (
                    <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                      <Td className="font-mono text-xs">{r.id}</Td>
                      <Td>{r.scope}</Td>
                      <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[r.status] || 'bg-gray-100'}`}>{r.status}</span></Td>
                      <Td>{new Date(r.requested_at).toLocaleDateString()}</Td>
                      <Td>{r.processed_at ? new Date(r.processed_at).toLocaleDateString() : '—'}</Td>
                      <Td>
                        <button onClick={() => exportDsar(r.id)} className="px-2 py-1 text-xs bg-ionex-brand text-white rounded flex items-center gap-1">
                          <Download className="w-3 h-3" /> Export
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!loading && !error && tab === 'erasure' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowErasure(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Request erasure (Section 24)
            </button>
            <p className="text-sm text-ionex-text-mute">Submit for DPO review. Regulatory retention periods may prevent immediate deletion.</p>
          </div>
          {erasures.length === 0 ? (
            <EmptyState icon={<Trash2 className="w-8 h-8" />} title="No erasure requests" description="Submit a Section 24 request if you want to delete your data." />
          ) : (
            <div className="bg-white border border-ionex-border-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-ionex-text-mute">
                  <tr><Th>ID</Th><Th>Reason</Th><Th>Status</Th><Th>Requested</Th></tr>
                </thead>
                <tbody>
                  {erasures.map(r => (
                    <tr key={r.id} className="border-t border-ionex-border-100 hover:bg-gray-50">
                      <Td className="font-mono text-xs">{r.id}</Td>
                      <Td className="max-w-md"><div className="truncate" title={r.reason}>{r.reason}</div></Td>
                      <Td><span className={`px-2 py-0.5 rounded-full text-[10px] capitalize ${STATUS_PILL[r.status] || 'bg-gray-100'}`}>{r.status}</span></Td>
                      <Td>{new Date(r.requested_at).toLocaleDateString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showErasure && (
        <ErasureModal onClose={() => setShowErasure(false)} onSubmitted={() => { setShowErasure(false); void fetchData(); }} />
      )}
    </div>
  );
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-ionex-brand' : 'bg-gray-300'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-2">{children}</th>; }
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={`px-4 py-2 ${className}`}>{children}</td>; }

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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Request erasure (Section 24)</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <ErrorBanner message={err} />}
          <p className="text-sm text-gray-700">
            Submitting this request will be reviewed by the Data Protection Officer. Retention obligations under FIC,
            Companies Act, Tax Administration Act and NERSA licensing may prevent immediate deletion; in that case
            data will be anonymised and retained only as legally required.
          </p>
          <label className="block text-sm">
            <span className="text-ionex-text-mute">Reason (optional)</span>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg resize-none" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} className="mt-0.5" />
            <span>I understand that retention obligations may delay or prevent erasure, and I confirm I want to submit this request.</span>
          </label>
        </div>
        <div className="p-5 border-t border-ionex-border-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving || !confirmation} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
}
