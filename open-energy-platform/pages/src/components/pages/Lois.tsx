import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, Inbox, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type LoiRow = {
  id: string;
  from_participant_id: string;
  to_participant_id: string | null;
  project_id: string | null;
  status: 'drafted' | 'sent' | 'signed' | 'withdrawn' | 'expired';
  horizon_years: number | null;
  annual_mwh: number | null;
  blended_price: number | null;
  resulting_contract_document_id: string | null;
  created_at: string;
  from_name?: string;
  to_name?: string;
  project_name?: string;
};

const statusPill: Record<string, { bg: string; text: string; label: string }> = {
  drafted:  { bg: '#eef1f4', text: '#6a6d70', label: 'Drafted' },
  sent:     { bg: '#e5f0fa', text: '#0a6ed1', label: 'Awaiting response' },
  signed:   { bg: '#e7f4ea', text: '#107e3e', label: 'Accepted' },
  withdrawn:{ bg: '#fde7e9', text: '#bb0000', label: 'Declined' },
  expired:  { bg: '#fef3e6', text: '#b04e0f', label: 'Expired' },
};

export function Lois() {
  const { user } = useAuth();
  const [direction, setDirection] = useState<'all' | 'sent' | 'received'>('all');
  const [rows, setRows] = useState<LoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await api.get(`/lois?direction=${direction}`);
      setRows((resp.data?.data as LoiRow[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load LOIs');
    } finally {
      setLoading(false);
    }
  }, [direction]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const out = { all: rows.length, sent: 0, received: 0, pending: 0, accepted: 0 };
    rows.forEach((r) => {
      if (r.from_participant_id === user?.id) out.sent += 1;
      if (r.to_participant_id === user?.id) out.received += 1;
      if (r.status === 'drafted' || r.status === 'sent') out.pending += 1;
      if (r.status === 'signed') out.accepted += 1;
    });
    return out;
  }, [rows, user?.id]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#32363a]">Letters of Intent</h1>
          <p className="text-[13px] text-[#6a6d70] mt-1">
            Non-binding indications of offtake / supply. Accept to spawn a draft Term Sheet on your contracts list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'received', 'sent'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`h-8 px-3 rounded-md text-[12px] font-semibold border transition-colors ${
                direction === d
                  ? 'bg-[#0a6ed1] text-white border-[#0a6ed1]'
                  : 'bg-white text-[#6a6d70] border-[#d0d5dd] hover:bg-[#f5f6fa]'
              }`}
            >
              {d === 'all' ? 'All' : d === 'received' ? 'Received' : 'Sent'}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<Inbox size={16} />} label="Total" value={counts.all} />
        <Kpi icon={<Send size={16} />} label="Sent by me" value={counts.sent} />
        <Kpi icon={<Mail size={16} />} label="Received" value={counts.received} />
        <Kpi icon={<ArrowRight size={16} />} label="Accepted" value={counts.accepted} tone="good" />
      </div>

      {error && (
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-2 text-[13px] text-[#bb0000] inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-[13px] text-[#6a6d70] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading LOIs…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-[#6a6d70]">
            <p className="text-[14px] font-semibold text-[#32363a]">No Letters of Intent yet</p>
            <p className="text-[12px] mt-1">
              {user?.role === 'offtaker'
                ? 'Use the Offtaker AI copilot on your cockpit to upload a bill and generate LOIs from the optimal mix.'
                : user?.role === 'ipp_developer'
                  ? 'Simulate a project in the O&M hub and run batch LOI outreach to offtakers.'
                  : 'Once LOIs are drafted by offtakers or IPPs, they will appear here.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa] text-[#6a6d70]">
              <tr className="border-b border-[#f0f0f0]">
                <th className="text-left px-4 py-2.5 font-semibold">From → To</th>
                <th className="text-left px-4 py-2.5 font-semibold">Project</th>
                <th className="text-right px-4 py-2.5 font-semibold">MWh/yr</th>
                <th className="text-right px-4 py-2.5 font-semibold">R/MWh</th>
                <th className="text-right px-4 py-2.5 font-semibold">Horizon</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold">Created</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pill = statusPill[r.status] || statusPill.drafted;
                return (
                  <tr key={r.id} className="border-b border-[#f0f0f0] hover:bg-[#fafbfd]">
                    <td className="px-4 py-2.5 text-[#32363a]">
                      <span className="font-medium">{r.from_name || '—'}</span>
                      <span className="text-[#6a6d70]"> → </span>
                      <span className="font-medium">{r.to_name || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#32363a]">{r.project_name || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.annual_mwh ? Math.round(r.annual_mwh).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.blended_price ? `R${Number(r.blended_price).toFixed(0)}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.horizon_years ? `${r.horizon_years}y` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: pill.bg, color: pill.text }}
                      >
                        {pill.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#6a6d70]">
                      {new Date(r.created_at).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/lois/${r.id}`}
                        className="text-[12px] font-semibold text-[#0a6ed1] hover:underline inline-flex items-center gap-1"
                      >
                        Open <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: 'good' }) {
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[#6a6d70] inline-flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className={`text-[22px] font-semibold mt-1 ${tone === 'good' ? 'text-[#107e3e]' : 'text-[#32363a]'}`}>
        {value}
      </div>
    </div>
  );
}
