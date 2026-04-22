import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, RefreshCw, ChevronRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useEscapeKey } from '../../hooks/useEscapeKey';

type Stage = 'identification' | 'qualification' | 'proposal' | 'negotiation' | 'contracting' | 'closed';
type DealStatus = 'active' | 'won' | 'lost' | 'cancelled';

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: 'identification', label: 'Identification' },
  { key: 'qualification', label: 'Qualification' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'contracting', label: 'Contracting' },
  { key: 'closed', label: 'Closed' },
];

interface Deal {
  id: string;
  deal_name: string;
  client_participant_id: string;
  client_name?: string;
  created_by: string;
  owner_name?: string;
  deal_type?: string;
  estimated_value?: number;
  contract_value?: number;
  probability_percentage?: number;
  stage: Stage;
  status: DealStatus;
  submission_deadline?: string;
  award_date?: string;
  created_at: string;
  updated_at: string;
}

interface Summary {
  by_stage: Record<string, { count: number; value_zar: number; weighted_zar: number }>;
  active_value_zar: number;
  weighted_forecast_zar: number;
  closed_won_zar: number;
  closed_lost_zar: number;
}

interface ParticipantLite {
  id: string;
  name: string;
  company_name?: string;
  role: string;
}

const formatZAR = (value: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0);

const STATUS_PILL: Record<DealStatus, string> = {
  active: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-700',
};

export function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DealStatus | 'all'>('active');
  const [selected, setSelected] = useState<Deal | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [listRes, sumRes] = await Promise.all([
        api.get(`/pipeline?${params.toString()}`),
        api.get('/pipeline/summary'),
      ]);
      setDeals(listRes.data?.data || []);
      setSummary(sumRes.data?.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [stageFilter, statusFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const changeStage = useCallback(async (deal: Deal, nextStage: Stage, nextStatus?: DealStatus, contractValue?: number) => {
    try {
      await api.put(`/pipeline/deals/${deal.id}/stage`, {
        stage: nextStage,
        status: nextStatus,
        contract_value: contractValue,
      });
      setSelected(null);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to change stage');
    }
  }, [fetchData]);

  const dealsByStage = useMemo(() => {
    const map: Record<Stage, Deal[]> = {
      identification: [], qualification: [], proposal: [], negotiation: [], contracting: [], closed: [],
    };
    for (const d of deals) map[d.stage]?.push(d);
    return map;
  }, [deals]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deal Pipeline</h1>
          <p className="text-ionex-text-mute">Originated deals across the funnel.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light flex items-center gap-2">
            <Plus className="w-4 h-4" /> New deal
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tile label="Active pipeline" value={formatZAR(summary?.active_value_zar || 0)} />
        <Tile label="Weighted forecast" value={formatZAR(summary?.weighted_forecast_zar || 0)} />
        <Tile label="Closed won" value={formatZAR(summary?.closed_won_zar || 0)} accent="text-green-700" />
        <Tile label="Closed lost" value={formatZAR(summary?.closed_lost_zar || 0)} accent="text-red-600" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm text-ionex-text-mute">Stage:</span>
        <button onClick={() => setStageFilter('all')} className={`px-3 py-1 rounded-full text-xs ${stageFilter === 'all' ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>All</button>
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setStageFilter(s.key)} className={`px-3 py-1 rounded-full text-xs ${stageFilter === s.key ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s.label}</button>
        ))}
        <span className="text-sm text-ionex-text-mute ml-4">Status:</span>
        {(['all', 'active', 'won', 'lost', 'cancelled'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-full text-xs capitalize ${statusFilter === s ? 'bg-ionex-brand text-white' : 'bg-white border border-ionex-border-200'}`}>{s}</button>
        ))}
      </div>

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {!loading && !error && deals.length === 0 && (
        <EmptyState icon={<Briefcase className="w-8 h-8" />} title="No deals" description="Create a deal to get started." />
      )}

      {!loading && !error && deals.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {STAGES.map(s => (
            <div key={s.key} className="bg-gray-50 rounded-xl p-3 min-h-[160px]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{s.label}</h3>
                <span className="text-xs text-ionex-text-mute">
                  {dealsByStage[s.key]?.length || 0} · {formatZAR((summary?.by_stage as any)?.[s.key]?.value_zar || 0)}
                </span>
              </div>
              <div className="space-y-2">
                {(dealsByStage[s.key] || []).map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d)}
                    className="w-full text-left p-3 bg-white border border-ionex-border-100 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm text-gray-900 truncate">{d.deal_name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${STATUS_PILL[d.status]}`}>{d.status}</span>
                    </div>
                    <p className="text-xs text-ionex-text-mute mt-1 truncate">{d.client_name || d.client_participant_id}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs font-semibold">{formatZAR(Number(d.estimated_value || 0))}</span>
                      <span className="text-xs text-ionex-text-mute">{d.probability_percentage || 0}%</span>
                    </div>
                  </button>
                ))}
                {(dealsByStage[s.key] || []).length === 0 && (
                  <p className="text-xs text-ionex-text-mute italic px-1">No deals</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DealDetailModal deal={selected} onClose={() => setSelected(null)} onStageChange={changeStage} />
      )}

      {showCreate && (
        <CreateDealModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void fetchData(); }} />
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-4 bg-white border border-ionex-border-100 rounded-xl">
      <p className="text-xs uppercase tracking-wide text-ionex-text-mute">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function DealDetailModal({ deal, onClose, onStageChange }: {
  deal: Deal;
  onClose: () => void;
  onStageChange: (d: Deal, stage: Stage, status?: DealStatus, contractValue?: number) => void;
}) {
  const [targetStage, setTargetStage] = useState<Stage>(deal.stage);
  const [closeStatus, setCloseStatus] = useState<DealStatus>('won');
  const [contractValue, setContractValue] = useState<number>(deal.estimated_value || 0);

  const submit = () => {
    if (targetStage === 'closed') onStageChange(deal, targetStage, closeStatus, contractValue);
    else onStageChange(deal, targetStage);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{deal.deal_name}</h3>
            <p className="text-sm text-ionex-text-mute">{deal.client_name || deal.client_participant_id} · Owner: {deal.owner_name || deal.created_by}</p>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Current stage" value={deal.stage} />
            <Field label="Status" value={deal.status} />
            <Field label="Deal type" value={deal.deal_type || '—'} />
            <Field label="Probability" value={`${deal.probability_percentage || 0}%`} />
            <Field label="Estimated value" value={formatZAR(Number(deal.estimated_value || 0))} />
            <Field label="Contract value" value={formatZAR(Number(deal.contract_value || 0))} />
            <Field label="Submission deadline" value={deal.submission_deadline ? new Date(deal.submission_deadline).toLocaleDateString() : '—'} />
            <Field label="Award date" value={deal.award_date ? new Date(deal.award_date).toLocaleDateString() : '—'} />
          </div>

          <div className="border-t border-ionex-border-100 pt-4 space-y-3">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2"><ChevronRight className="w-4 h-4" /> Move stage</h4>
            <select value={targetStage} onChange={e => setTargetStage(e.target.value as Stage)} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {targetStage === 'closed' && (
              <div className="space-y-2">
                <select value={closeStatus} onChange={e => setCloseStatus(e.target.value as DealStatus)} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {closeStatus === 'won' && (
                  <input
                    type="number"
                    value={contractValue}
                    onChange={e => setContractValue(Number(e.target.value))}
                    placeholder="Contract value (ZAR)"
                    className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg"
                  />
                )}
              </div>
            )}
            <button onClick={submit} className="w-full py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
              Save change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ionex-text-mute">{label}</p>
      <p className="font-medium text-gray-900 capitalize">{value}</p>
    </div>
  );
}

function CreateDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [dealName, setDealName] = useState('');
  const [clients, setClients] = useState<ParticipantLite[]>([]);
  const [clientId, setClientId] = useState('');
  const [dealType, setDealType] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<number>(0);
  const [probability, setProbability] = useState<number>(25);
  const [stage, setStage] = useState<Stage>('identification');
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Best-effort participant lookup; falls back to a text input if admin-only
    api.get('/admin/users').then(r => {
      setClients(r.data?.data || []);
    }).catch(() => {
      // non-admin: fall through to free-text client id
    });
  }, []);

  const submit = async () => {
    if (!dealName.trim() || !clientId.trim()) {
      setErr('Deal name and client are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.post('/pipeline/deals', {
        deal_name: dealName,
        client_participant_id: clientId,
        deal_type: dealType || undefined,
        estimated_value: estimatedValue || undefined,
        probability_percentage: probability,
        stage,
        submission_deadline: deadline || undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to create deal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">New deal</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          {err && <ErrorBanner message={err} />}
          <Input label="Deal name" value={dealName} onChange={setDealName} required />
          {clients.length > 0 ? (
            <label className="block text-sm">
              <span className="text-ionex-text-mute">Client</span>
              <select value={clientId} onChange={e => setClientId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
                <option value="">Select a client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` · ${c.company_name}` : ''} ({c.role})</option>)}
              </select>
            </label>
          ) : (
            <Input label="Client participant ID" value={clientId} onChange={setClientId} required />
          )}
          <Input label="Deal type (optional)" value={dealType} onChange={setDealType} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Estimated value (ZAR)" value={estimatedValue} onChange={v => setEstimatedValue(Number(v) || 0)} type="number" />
            <Input label="Probability (%)" value={probability} onChange={v => setProbability(Math.max(0, Math.min(100, Number(v) || 0)))} type="number" />
          </div>
          <label className="block text-sm">
            <span className="text-ionex-text-mute">Initial stage</span>
            <select value={stage} onChange={e => setStage(e.target.value as Stage)} className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <Input label="Submission deadline (optional)" value={deadline} onChange={setDeadline} type="date" />
        </div>
        <div className="p-5 border-t border-ionex-border-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50">
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="text-ionex-text-mute">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full px-3 py-2 border border-ionex-border-200 rounded-lg"
      />
    </label>
  );
}
