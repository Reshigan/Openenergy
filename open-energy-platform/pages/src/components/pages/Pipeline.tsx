import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, ChevronRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
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

const formatZAR = (value: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value || 0);

const STATUS_COLOR: Record<DealStatus, string> = {
  active: ACC,
  won: GOOD,
  lost: BAD,
  cancelled: TX3,
};

function KpiTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? BAD : tone === 'warn' ? WARN : tone === 'ok' ? GOOD : TX1;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, background: BG1, padding: '8px 12px', minWidth: 80 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, color }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: DealStatus }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 10,
      fontWeight: 600,
      background: `color-mix(in oklch, ${STATUS_COLOR[status]} 12%, white)`,
      color: STATUS_COLOR[status],
      border: `1px solid color-mix(in oklch, ${STATUS_COLOR[status]} 25%, white)`,
      textTransform: 'capitalize',
    }}>{status}</span>
  );
}

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

  const recentDeals = useMemo(() =>
    [...deals].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 8),
    [deals]
  );

  const totalActive = deals.filter(d => d.status === 'active').length;

  return (
    <div style={{ background: BG, minHeight: 'calc(100vh - 50px)', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0 }}>
      {/* LEFT: main content */}
      <div style={{ overflowY: 'auto', padding: '20px 20px 20px 24px' }}>
        {/* Header */}
        <header style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: TX1, margin: 0 }}>Deal Pipeline</h1>
            <p style={{ fontSize: 12, color: TX2, margin: '4px 0 0' }}>Originated deals across the funnel.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={fetchData}
              style={{ height: 32, width: 32, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TX2 }}
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{ height: 32, padding: '0 12px', borderRadius: 6, background: ACC, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={13} /> New deal
            </button>
          </div>
        </header>

        {/* KPI strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <KpiTile label="Active pipeline" value={formatZAR(summary?.active_value_zar || 0)} />
          <KpiTile label="Weighted forecast" value={formatZAR(summary?.weighted_forecast_zar || 0)} />
          <KpiTile label="Closed won" value={formatZAR(summary?.closed_won_zar || 0)} tone="ok" />
          <KpiTile label="Closed lost" value={formatZAR(summary?.closed_lost_zar || 0)} tone="bad" />
          <KpiTile label="Active deals" value={String(totalActive)} />
        </div>

        {/* Stage filter pills */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>Stage</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {[{ key: 'all' as const, label: 'All' }, ...STAGES].map(s => (
              <button key={s.key} type="button" onClick={() => setStageFilter(s.key as Stage | 'all')}
                style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  background: stageFilter === s.key ? ACC : BG2, color: stageFilter === s.key ? '#fff' : TX2,
                  border: `1px solid ${stageFilter === s.key ? ACC : BORDER}` }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status filter pills */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TX3, marginBottom: 6 }}>Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['all', 'active', 'won', 'lost', 'cancelled'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize',
                  background: statusFilter === s ? ACC : BG2, color: statusFilter === s ? '#fff' : TX2,
                  border: `1px solid ${statusFilter === s ? ACC : BORDER}` }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading && <Skeleton variant="card" rows={4} />}
        {error && <ErrorBanner message={error} onRetry={fetchData} />}

        {!loading && !error && deals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: TX3, fontSize: 13 }}>
            No deals. Create one to get started.
          </div>
        )}

        {!loading && !error && deals.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {STAGES.map(s => (
              <div key={s.key} style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG1, padding: 12, minHeight: 100 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TX1 }}>{s.label}</span>
                  <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>
                    {dealsByStage[s.key]?.length || 0} · {formatZAR((summary?.by_stage as any)?.[s.key]?.value_zar || 0)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(dealsByStage[s.key] || []).map(d => (
                    <button
                      type="button"
                      key={d.id}
                      onClick={() => setSelected(d)}
                      style={{ textAlign: 'left', padding: '8px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, cursor: 'pointer', width: '100%' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.deal_name}</span>
                        <StatusPill status={d.status} />
                      </div>
                      <div style={{ fontSize: 10, color: TX3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                        {d.client_name || d.client_participant_id}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: TX1 }}>{formatZAR(Number(d.estimated_value || 0))}</span>
                        <span style={{ fontSize: 10, color: TX3 }}>{d.probability_percentage || 0}%</span>
                      </div>
                    </button>
                  ))}
                  {(dealsByStage[s.key] || []).length === 0 && (
                    <p style={{ fontSize: 10, color: TX3, fontStyle: 'italic', margin: 0 }}>No deals</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: 380px panel */}
      <div style={{ width: 380, borderLeft: `1px solid ${BORDER}`, background: BG1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* AI assist card */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>AI Assist</div>
          {summary ? (
            <>
              <p style={{ fontSize: 12, color: TX2, margin: '0 0 8px' }}>
                {summary.active_value_zar > 0
                  ? `Weighted forecast covers ${Math.round((summary.weighted_forecast_zar / summary.active_value_zar) * 100)}% of active pipeline — review deal probabilities in proposal and negotiation stages.`
                  : 'No active pipeline value. Add deals to generate forecasts.'}
              </p>
              {summary.closed_lost_zar > summary.closed_won_zar && (
                <p style={{ fontSize: 11, color: BAD, margin: 0 }}>Lost value exceeds won. Review qualification criteria.</p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 12, color: TX3, margin: 0 }}>Loading insights...</p>
          )}
        </div>

        {/* Stage breakdown */}
        {summary?.by_stage && (
          <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Stage Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STAGES.map(s => {
                const stageData = (summary.by_stage as any)[s.key];
                if (!stageData || stageData.count === 0) return null;
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: TX2 }}>{s.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: TX3, fontFamily: MONO }}>{stageData.count}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: TX1 }}>{formatZAR(stageData.value_zar)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, padding: 16, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Activity</div>
          {recentDeals.length === 0 ? (
            <p style={{ fontSize: 11, color: TX3, fontStyle: 'italic' }}>No recent deals.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentDeals.map(d => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setSelected(d)}
                  style={{ textAlign: 'left', padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 6, background: BG1, cursor: 'pointer', width: '100%' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>{d.deal_name}</span>
                    <StatusPill status={d.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: TX3, textTransform: 'capitalize' }}>{d.stage}</span>
                    <span style={{ fontSize: 10, color: TX3 }}>{new Date(d.updated_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <DealDetailModal deal={selected} onClose={() => setSelected(null)} onStageChange={changeStage} />
      )}

      {showCreate && (
        <CreateDealModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void fetchData(); }} />
      )}
    </div>
  );
}

function DealDetailModal({ deal, onClose, onStageChange }: {
  deal: Deal;
  onClose: () => void;
  onStageChange: (d: Deal, stage: Stage, status?: DealStatus, contractValue?: number) => void;
}) {
  useEscapeKey(onClose);
  const [targetStage, setTargetStage] = useState<Stage>(deal.stage);
  const [closeStatus, setCloseStatus] = useState<DealStatus>('won');
  const [contractValue, setContractValue] = useState<number>(deal.estimated_value || 0);

  const submit = () => {
    if (targetStage === 'closed') onStageChange(deal, targetStage, closeStatus, contractValue);
    else onStageChange(deal, targetStage);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: TX1, margin: 0 }}>{deal.deal_name}</h3>
            <p style={{ fontSize: 11, color: TX2, margin: '3px 0 0' }}>
              {deal.client_name || deal.client_participant_id} · Owner: {deal.owner_name || deal.created_by}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX3, padding: 2 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldRow label="Current stage" value={deal.stage} />
            <FieldRow label="Status" value={deal.status} />
            <FieldRow label="Deal type" value={deal.deal_type || '—'} />
            <FieldRow label="Probability" value={`${deal.probability_percentage || 0}%`} />
            <FieldRow label="Estimated value" value={formatZAR(Number(deal.estimated_value || 0))} mono />
            <FieldRow label="Contract value" value={formatZAR(Number(deal.contract_value || 0))} mono />
            <FieldRow label="Submission deadline" value={deal.submission_deadline ? new Date(deal.submission_deadline).toLocaleDateString() : '—'} />
            <FieldRow label="Award date" value={deal.award_date ? new Date(deal.award_date).toLocaleDateString() : '—'} />
          </div>

          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: TX1 }}>
              <ChevronRight size={14} /> Move stage
            </div>
            <select
              value={targetStage}
              onChange={e => setTargetStage(e.target.value as Stage)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 12 }}
            >
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {targetStage === 'closed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select
                  value={closeStatus}
                  onChange={e => setCloseStatus(e.target.value as DealStatus)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 12 }}
                >
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
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG, color: TX1, fontSize: 12, boxSizing: 'border-box' }}
                  />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={submit}
              style={{ width: '100%', padding: '8px 0', borderRadius: 6, background: ACC, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
            >
              Save change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: TX1, fontFamily: mono ? MONO : undefined, textTransform: 'capitalize' }}>{value}</div>
    </div>
  );
}

function CreateDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
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

  const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 6,
    border: `1px solid ${BORDER}`,
    background: BG,
    color: TX1,
    fontSize: 12,
    boxSizing: 'border-box' as const,
    marginTop: 4,
  };
  const labelStyle = { fontSize: 11, color: TX2, display: 'block' as const };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, border: `1px solid ${BORDER}`, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 480, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: TX1, margin: 0 }}>New deal</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: TX3 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {err && <ErrorBanner message={err} />}
          <label style={labelStyle}>
            Deal name *
            <input type="text" value={dealName} onChange={e => setDealName(e.target.value)} style={inputStyle} />
          </label>
          {clients.length > 0 ? (
            <label style={labelStyle}>
              Client
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
                <option value="">Select a client…</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.company_name ? ` · ${c.company_name}` : ''} ({c.role})</option>
                ))}
              </select>
            </label>
          ) : (
            <label style={labelStyle}>
              Client participant ID *
              <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle} />
            </label>
          )}
          <label style={labelStyle}>
            Deal type (optional)
            <input type="text" value={dealType} onChange={e => setDealType(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>
              Estimated value (ZAR)
              <input type="number" value={estimatedValue} onChange={e => setEstimatedValue(Number(e.target.value) || 0)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Probability (%)
              <input type="number" value={probability} onChange={e => setProbability(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} style={inputStyle} />
            </label>
          </div>
          <label style={labelStyle}>
            Initial stage
            <select value={stage} onChange={e => setStage(e.target.value as Stage)} style={inputStyle}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Submission deadline (optional)
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle} />
          </label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 32, padding: '0 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: BG2, color: TX2, fontSize: 12, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{ height: 32, padding: '0 14px', borderRadius: 6, border: 'none', background: ACC, color: '#fff', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Pipeline;
