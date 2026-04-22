import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Building2, User, Zap, Calendar,
  Loader2, AlertTriangle, FileSignature,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type Loi = {
  id: string;
  from_participant_id: string;
  to_participant_id: string | null;
  project_id: string | null;
  mix_json: string | null;
  body_md: string | null;
  status: 'drafted' | 'sent' | 'signed' | 'withdrawn' | 'expired';
  horizon_years: number | null;
  annual_mwh: number | null;
  blended_price: number | null;
  notes: string | null;
  decline_reason: string | null;
  resulting_contract_document_id: string | null;
  sent_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string | null;
  from_name?: string;
  from_email?: string;
  from_role?: string;
  to_name?: string;
  to_email?: string;
  to_role?: string;
  project_name?: string;
  project_technology?: string;
  project_capacity_mw?: number;
};

const statusPill: Record<string, { bg: string; text: string; label: string }> = {
  drafted:  { bg: '#eef1f4', text: '#6a6d70', label: 'Drafted' },
  sent:     { bg: '#e5f0fa', text: '#0a6ed1', label: 'Awaiting response' },
  signed:   { bg: '#e7f4ea', text: '#107e3e', label: 'Accepted' },
  withdrawn:{ bg: '#fde7e9', text: '#bb0000', label: 'Declined / withdrawn' },
  expired:  { bg: '#fef3e6', text: '#b04e0f', label: 'Expired' },
};

export function LoiDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loi, setLoi] = useState<Loi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/lois/${id}`);
      setLoi(resp.data?.data as Loi);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load LOI');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const isRecipient = loi && user?.id === loi.to_participant_id;
  const canRespond = Boolean(
    isRecipient && (loi?.status === 'drafted' || loi?.status === 'sent'),
  );

  const mix = useMemo(() => {
    if (!loi?.mix_json) return null;
    try { return JSON.parse(loi.mix_json); } catch { return null; }
  }, [loi]);

  const accept = async () => {
    if (!id || !loi) return;
    setBusy('accept');
    setError(null);
    try {
      const resp = await api.post(`/lois/${id}/accept`, {});
      const docId = resp.data?.data?.contract_document_id as string | undefined;
      if (docId) {
        navigate(`/contracts/${docId}`);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept LOI');
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!id || !loi) return;
    if (!declineReason.trim()) { setError('Please add a brief reason for declining'); return; }
    setBusy('decline');
    setError(null);
    try {
      await api.post(`/lois/${id}/decline`, { reason: declineReason.trim() });
      setShowDeclineForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline LOI');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-[13px] text-[#6a6d70] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Loading LOI…
      </div>
    );
  }

  if (error && !loi) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-3 text-[13px] text-[#bb0000] inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
        <button onClick={() => navigate('/lois')} className="mt-4 text-[13px] text-[#0a6ed1] hover:underline">
          Back to LOIs
        </button>
      </div>
    );
  }

  if (!loi) return null;

  const pill = statusPill[loi.status] || statusPill.drafted;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <button
        onClick={() => navigate('/lois')}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#6a6d70] hover:text-[#0a6ed1]"
      >
        <ArrowLeft size={14} /> All LOIs
      </button>

      <header className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 bg-gradient-to-r from-[#f5f6fa] to-[#eaf0ff] border-b border-[#f0f0f0]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6a6d70]">Letter of Intent</span>
              <span
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: pill.bg, color: pill.text }}
              >
                {pill.label}
              </span>
            </div>
            <h1 className="text-[22px] font-semibold text-[#32363a]">
              {loi.project_name || 'Indicative offtake proposal'}
            </h1>
            <p className="text-[13px] text-[#6a6d70] mt-1">
              From <strong>{loi.from_name || '—'}</strong> → <strong>{loi.to_name || '—'}</strong> · drafted {new Date(loi.created_at).toLocaleDateString('en-ZA')}
            </p>
          </div>
          {loi.status === 'signed' && loi.resulting_contract_document_id && (
            <Link
              to={`/contracts/${loi.resulting_contract_document_id}`}
              className="h-9 px-4 rounded-lg bg-[#0a6ed1] text-white text-[13px] font-semibold hover:bg-[#085bab] inline-flex items-center gap-2"
            >
              <FileSignature size={14} /> Open contract
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#f0f0f0] border-b border-[#f0f0f0]">
          <Fact label="Annual volume" value={loi.annual_mwh ? `${Math.round(loi.annual_mwh).toLocaleString()} MWh/yr` : '—'} icon={<Zap size={14} />} />
          <Fact label="Indicative price" value={loi.blended_price ? `R${Number(loi.blended_price).toFixed(0)} / MWh` : '—'} icon={<Building2 size={14} />} />
          <Fact label="Horizon" value={loi.horizon_years ? `${loi.horizon_years} years` : '—'} icon={<Calendar size={14} />} />
          <Fact label="Project" value={loi.project_name || '—'} icon={<User size={14} />} />
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-2 text-[13px] text-[#bb0000] inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
          <h2 className="text-[13px] font-semibold text-[#32363a]">LOI body</h2>
          <span className="text-[11px] text-[#6a6d70]">Non-binding · subject to due diligence</span>
        </header>
        <pre className="p-5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#32363a] bg-white max-h-[480px] overflow-auto">
          {loi.body_md || '(No body text attached to this LOI)'}
        </pre>
      </section>

      {mix && typeof mix === 'object' && 'project_id' in mix && (
        <section className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
          <header className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
            <h2 className="text-[13px] font-semibold text-[#32363a]">Mix item</h2>
          </header>
          <dl className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#f0f0f0]">
            {Object.entries(mix as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-[#6a6d70]">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-[13px] text-[#32363a] mt-0.5 break-all">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {loi.decline_reason && (
        <section className="rounded-xl border border-[#ffcdd2] bg-[#fff8f8] px-5 py-4">
          <h3 className="text-[13px] font-semibold text-[#bb0000] inline-flex items-center gap-2">
            <XCircle size={14} /> Declined
          </h3>
          <p className="text-[13px] text-[#32363a] mt-1">{loi.decline_reason}</p>
          {loi.resolved_at && (
            <p className="text-[11px] text-[#6a6d70] mt-1">
              {new Date(loi.resolved_at).toLocaleString('en-ZA')}
            </p>
          )}
        </section>
      )}

      {canRespond && (
        <section className="rounded-xl border border-[#0a6ed1]/30 bg-[#f4f9ff] px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileSignature size={16} className="text-[#0a6ed1]" />
            <h3 className="text-[14px] font-semibold text-[#32363a]">Respond to this LOI</h3>
          </div>
          <p className="text-[12px] text-[#6a6d70]">
            Accepting creates a draft Term Sheet on your Contracts page (phase: term_sheet) that you and the counterparty can progress to full PPA.
          </p>
          {!showDeclineForm ? (
            <div className="flex items-center gap-3">
              <button
                onClick={accept}
                disabled={busy !== null}
                className="h-10 px-5 rounded-lg bg-[#107e3e] text-white text-[13px] font-semibold hover:bg-[#0b6430] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {busy === 'accept' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Accept &amp; create term sheet
              </button>
              <button
                onClick={() => setShowDeclineForm(true)}
                disabled={busy !== null}
                className="h-10 px-4 rounded-lg border border-[#bb0000] text-[#bb0000] text-[13px] font-semibold hover:bg-[#fef3f3] disabled:opacity-50 inline-flex items-center gap-2"
              >
                <XCircle size={14} /> Decline
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-[#6a6d70]">Reason for declining</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="e.g. Volume exceeds our current offtake envelope; revisit in Q3 post-budget."
                className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#0a6ed1]"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={decline}
                  disabled={busy !== null || !declineReason.trim()}
                  className="h-9 px-4 rounded-lg bg-[#bb0000] text-white text-[13px] font-semibold hover:bg-[#9a0000] disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {busy === 'decline' ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                  Confirm decline
                </button>
                <button
                  onClick={() => { setShowDeclineForm(false); setDeclineReason(''); }}
                  className="h-9 px-4 rounded-lg border border-[#d0d5dd] text-[13px] text-[#6a6d70] hover:bg-[#f5f6fa]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#6a6d70] inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-[14px] font-semibold text-[#32363a] mt-0.5 truncate">{value}</div>
    </div>
  );
}
