// Outbound compliance notices — Wave 5 regulator portal.
// Tracks notices to licensees (information requests / warnings / remediation /
// suspensions / penalty / revocation). Auto-flagged 'overdue' when their
// remedy_deadline_at passes (cron sweep).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type NoticeStatus = 'issued' | 'acknowledged' | 'satisfied' | 'overdue' | 'escalated' | 'withdrawn';
type NoticeType = 'remediation' | 'warning' | 'penalty' | 'suspension' | 'revocation' | 'information_request';

interface Notice {
  id: string;
  licensee_user_id: string;
  source_case_id: string | null;
  source_inbox_id: string | null;
  notice_type: NoticeType;
  title: string;
  body: string;
  remedy_deadline_at: string | null;
  status: NoticeStatus;
  acknowledged_at: string | null;
  satisfied_at: string | null;
  satisfied_evidence: string | null;
  overdue_flagged_at: string | null;
  issued_by: string;
  created_at: string;
  updated_at: string;
}

const STATUS_TONE: Record<NoticeStatus, { bg: string; fg: string }> = {
  issued: { bg: '#fff4d6', fg: '#a06200' },
  acknowledged: { bg: 'oklch(0.94 0.02 250)', fg: 'oklch(0.46 0.16 55)' },
  satisfied: { bg: '#daf5e2', fg: '#1f6b3a' },
  overdue: { bg: '#fde0e0', fg: '#9b1f1f' },
  escalated: { bg: '#fde0e0', fg: '#9b1f1f' },
  withdrawn: { bg: '#f0f3f7', fg: '#445566' },
};

const TYPE_TONE: Record<NoticeType, { bg: string; fg: string }> = {
  information_request: { bg: '#f0f3f7', fg: '#445566' },
  remediation: { bg: '#fff4d6', fg: '#a06200' },
  warning: { bg: '#ffe5cc', fg: '#a04200' },
  penalty: { bg: '#fde0e0', fg: '#9b1f1f' },
  suspension: { bg: '#fde0e0', fg: '#9b1f1f' },
  revocation: { bg: '#fde0e0', fg: '#9b1f1f' },
};

export function NoticesTab() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [filter, setFilter] = useState<NoticeStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get<{ data: Notice[] }>('/regulator/inbox/compliance-notices');
      setRows(r.data?.data || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load compliance notices.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const drillRow = useMemo(() => rows.find((r) => r.id === drillId) || null, [rows, drillId]);
  const filtered = useMemo(() => filter === 'all' ? rows : rows.filter((r) => r.status === filter), [rows, filter]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const open = rows.filter((r) => r.status === 'issued' || r.status === 'acknowledged').length;
    const overdue = rows.filter((r) => r.status === 'overdue').length;
    const satisfied = rows.filter((r) => r.status === 'satisfied').length;
    return { total, open, overdue, satisfied };
  }, [rows]);

  async function satisfy() {
    if (!drillRow) return;
    setBusy(true);
    try {
      await api.post(`/regulator/inbox/compliance-notices/${drillRow.id}/satisfy`, { satisfied_evidence: evidence });
      setEvidence('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    } finally { setBusy(false); }
  }

  async function withdraw() {
    if (!drillRow) return;
    setBusy(true);
    try {
      await api.post(`/regulator/inbox/compliance-notices/${drillRow.id}/withdraw`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    } finally { setBusy(false); }
  }

  return (
    <div data-testid="regulator-notices-tab" className="space-y-4">
      <div data-testid="regulator-notices-kpis" className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Total" value={kpis.total} />
        <Kpi label="Open" value={kpis.open} tone={kpis.open > 0 ? 'warn' : 'good'} />
        <Kpi label="Overdue" value={kpis.overdue} tone={kpis.overdue > 0 ? 'bad' : 'good'} />
        <Kpi label="Satisfied" value={kpis.satisfied} tone="good" />
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'issued', 'acknowledged', 'overdue', 'satisfied', 'withdrawn'] as const).map((s) => (
          <button type="button"
            key={s}
            data-testid={`regulator-notices-filter-${s}`}
            onClick={() => setFilter(s)}
            className={`h-7 px-3 rounded-full text-[11px] font-semibold border ${filter === s ? 'bg-[#c2873a] text-white border-[oklch(0.46_0.16_55)]' : 'bg-white text-[#445566] border-[#d8dee6]'}`}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
        <button type="button"
          data-testid="regulator-notices-create"
          onClick={() => setCreating(true)}
          className="h-7 px-3 rounded-full text-[11px] font-semibold bg-[#c2873a] text-white ml-auto"
        >
          + Issue notice
        </button>
        <button type="button" onClick={load} className="h-7 px-3 rounded-full text-[11px] font-semibold border border-[#d8dee6] bg-white text-[oklch(0.46_0.16_55)]">
          Refresh
        </button>
      </div>

      {error && <div className="rounded-md border border-[#f0c2c0] bg-[#fcebea] text-[#9b1f1f] text-[12px] px-3 py-2">{error}</div>}
      {loading && <div className="text-[12px] text-[#6b7685]">Loading…</div>}

      <div data-testid="regulator-notices-table" className="border border-[#e5e9ee] rounded-md overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_140px_140px_130px] gap-2 px-3 py-2 bg-[#f7f9fb] text-[11px] uppercase font-bold text-[#6b7685]">
          <div>Type</div>
          <div>Title</div>
          <div>Status</div>
          <div>Deadline</div>
          <div>Licensee</div>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="px-3 py-6 text-center text-[12px] text-[#6b7685]">
            No compliance notices match this filter.
          </div>
        )}
        {filtered.map((r) => {
          const tt = TYPE_TONE[r.notice_type];
          const st = STATUS_TONE[r.status];
          return (
            <button type="button"
              key={r.id}
              data-testid={`regulator-notice-row-${r.id}`}
              onClick={() => setDrillId(r.id)}
              className="w-full grid grid-cols-[140px_1fr_140px_140px_130px] gap-2 px-3 py-2 border-t border-[#e5e9ee] text-left text-[12px] hover:bg-[#f7f9fb]"
            >
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: tt.bg, color: tt.fg }}>
                  {r.notice_type.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="truncate" title={r.title}>{r.title}</div>
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: st.bg, color: st.fg }}>
                  {r.status}
                </span>
              </div>
              <div className="font-mono text-[10px] text-[#6b7685]">
                {r.remedy_deadline_at ? new Date(r.remedy_deadline_at).toLocaleDateString() : '—'}
              </div>
              <div className="font-mono text-[10px] text-[#6b7685]">{r.licensee_user_id}</div>
            </button>
          );
        })}
      </div>

      {creating && <CreateNoticeForm onClose={() => { setCreating(false); load(); }} />}

      {drillRow && (
        <div data-testid="regulator-notice-drill" className="border border-[oklch(0.46_0.16_55)] rounded-md p-4 bg-[#f7f9fb] space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[11px] uppercase font-bold text-[#6b7685]">
                {drillRow.notice_type.replace(/_/g, ' ')} · to {drillRow.licensee_user_id}
              </div>
              <div className="text-[14px] font-bold text-[oklch(0.46_0.16_55)]">{drillRow.title}</div>
            </div>
            <button type="button" onClick={() => setDrillId(null)} className="text-[11px] text-[#6b7685] hover:text-[oklch(0.46_0.16_55)]">Close ×</button>
          </div>
          <div className="text-[12px] whitespace-pre-wrap text-[#2a3a4a]">{drillRow.body}</div>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <Field label="Status" value={drillRow.status} />
            <Field label="Issued by" value={drillRow.issued_by} />
            <Field label="Deadline" value={drillRow.remedy_deadline_at ? new Date(drillRow.remedy_deadline_at).toLocaleString() : '—'} />
            <Field label="Created" value={new Date(drillRow.created_at).toLocaleString()} />
            {drillRow.acknowledged_at && <Field label="Acknowledged" value={new Date(drillRow.acknowledged_at).toLocaleString()} />}
            {drillRow.satisfied_at && <Field label="Satisfied" value={new Date(drillRow.satisfied_at).toLocaleString()} />}
            {drillRow.overdue_flagged_at && <Field label="Overdue flagged" value={new Date(drillRow.overdue_flagged_at).toLocaleString()} />}
          </div>
          {drillRow.satisfied_evidence && <Field label="Evidence" value={drillRow.satisfied_evidence} />}
          {(drillRow.status === 'issued' || drillRow.status === 'acknowledged' || drillRow.status === 'overdue') && (
            <div className="border-t border-[#d8dee6] pt-3 space-y-2" data-testid="regulator-notice-actions">
              <input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Evidence URL or note (required for satisfy)"
                className="w-full h-9 px-3 rounded border border-[#d8dee6] text-[12px]"
              />
              <div className="flex gap-2 flex-wrap">
                <button type="button"
                  data-testid="regulator-notice-satisfy"
                  disabled={busy}
                  onClick={satisfy}
                  className="h-8 px-3 rounded bg-[#1f6b3a] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  Mark satisfied
                </button>
                <button type="button"
                  data-testid="regulator-notice-withdraw"
                  disabled={busy}
                  onClick={withdraw}
                  className="h-8 px-3 rounded border border-[#d8dee6] bg-white text-[#445566] text-[11px] font-semibold disabled:opacity-50"
                >
                  Withdraw
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateNoticeForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    licensee_user_id: '',
    notice_type: 'information_request' as NoticeType,
    title: '',
    body: '',
    remedy_deadline_at: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await api.post('/regulator/inbox/compliance-notices', {
        ...form,
        remedy_deadline_at: form.remedy_deadline_at || null,
      });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || 'Failed.');
    } finally { setBusy(false); }
  }

  return (
    <div data-testid="regulator-notice-form" className="border border-[oklch(0.46_0.16_55)] rounded-md p-4 bg-white space-y-3">
      <div className="text-[14px] font-bold text-[oklch(0.46_0.16_55)]">Issue compliance notice</div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Licensee user_id" value={form.licensee_user_id} onChange={(v) => setForm({ ...form, licensee_user_id: v })} />
        <div>
          <div className="text-[10px] uppercase font-bold text-[#6b7685]">Type</div>
          <select
            value={form.notice_type}
            onChange={(e) => setForm({ ...form, notice_type: e.target.value as NoticeType })}
            className="w-full h-9 px-2 rounded border border-[#d8dee6] text-[12px]"
          >
            {(['information_request', 'remediation', 'warning', 'penalty', 'suspension', 'revocation'] as NoticeType[]).map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <Input label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} fullWidth />
        <div className="col-span-2">
          <div className="text-[10px] uppercase font-bold text-[#6b7685]">Body</div>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={4}
            className="w-full px-2 py-1 rounded border border-[#d8dee6] text-[12px]"
          />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold text-[#6b7685]">Remedy deadline</div>
          <input
            type="datetime-local"
            value={form.remedy_deadline_at}
            onChange={(e) => setForm({ ...form, remedy_deadline_at: e.target.value })}
            className="w-full h-9 px-2 rounded border border-[#d8dee6] text-[12px]"
          />
        </div>
      </div>
      {err && <div className="text-[12px] text-[#9b1f1f]">{err}</div>}
      <div className="flex gap-2">
        <button type="button"
          data-testid="regulator-notice-form-submit"
          disabled={busy}
          onClick={submit}
          className="h-8 px-3 rounded bg-[#c2873a] text-white text-[11px] font-semibold disabled:opacity-50"
        >
          Issue notice
        </button>
        <button type="button"
          onClick={onClose}
          className="h-8 px-3 rounded border border-[#d8dee6] bg-white text-[#445566] text-[11px] font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, fullWidth }: { label: string; value: string; onChange: (v: string) => void; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase font-bold text-[#6b7685]">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-2 rounded border border-[#d8dee6] text-[12px]"
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? '#9b1f1f' : tone === 'warn' ? '#a06200' : tone === 'good' ? '#1f6b3a' : 'oklch(0.46 0.16 55)';
  return (
    <div className="bg-white border border-[#e5e9ee] rounded-md p-3">
      <div className="text-[10px] uppercase font-bold text-[#6b7685]">{label}</div>
      <div className="text-[20px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-[#6b7685]">{label}</div>
      <div className="text-[12px] text-[oklch(0.46_0.16_55)]">{value}</div>
    </div>
  );
}
