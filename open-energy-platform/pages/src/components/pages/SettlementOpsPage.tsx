// ════════════════════════════════════════════════════════════════════════
// SettlementOpsPage — /settlement-ops
//
// Settlement-team console:
//   • Late-payment fees list + waive / charge
//   • Prime-rate register history + add new rate
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { CircleDollarSign, Percent, AlertCircle, CheckCircle2, RefreshCw, Plus } from 'lucide-react';
import { api } from '../../lib/api';

// ── Design tokens ────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type Fee = {
  id: string; invoice_id: string; participant_id: string; invoice_total: number;
  days_overdue: number; annual_rate_pct: number; fee_zar: number;
  computed_at: string; status: string; waived_by?: string; waiver_reason?: string;
};
type Rate = { effective_from: string; rate_pct: number; source: string | null; updated_by: string | null; updated_at: string };

type Tab = 'fees' | 'rates';

export function SettlementOpsPage() {
  const [tab, setTab] = useState<Tab>('fees');

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
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <CircleDollarSign size={16} style={{ color: ACC }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: TX3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Settlement · admin
            </span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Settlement ops console</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>Late-payment fee accrual + prime-rate register.</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${BORDER}`, marginBottom: 20 }}>
          {([
            ['fees', 'Late fees', CircleDollarSign],
            ['rates', 'Prime rate', Percent],
          ] as const).map(([k, label, Icon]) => (
            <button
              type="button"
              key={k}
              onClick={() => setTab(k)}
              style={{
                height: 36,
                padding: '0 14px',
                fontSize: 12,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: 'none',
                borderBottom: tab === k ? `2px solid ${TX1}` : '2px solid transparent',
                marginBottom: -2,
                background: 'transparent',
                color: tab === k ? TX1 : TX3,
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === 'fees' && <FeesMain />}
        {tab === 'rates' && <RatesMain />}
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
        {tab === 'fees' && <FeesPanel />}
        {tab === 'rates' && <RatesPanel />}
      </div>
    </div>
  );
}

// ── Shared state lifted via context pattern (simple prop-drilling via render) ──
// We use a composition pattern: main panel + side panel share a key to sync state.

function FeesMain() {
  const [rows, setRows] = useState<Fee[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiverTarget, setWaiverTarget] = useState<string | null>(null);
  const [waiverReason, setWaiverReason] = useState('');

  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/business-depth/late-fees', { params: status ? { status } : {} });
      if (r.data.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, [status]);

  const waive = async () => {
    if (!waiverTarget || !waiverReason.trim()) return;
    const id = waiverTarget;
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post(`/business-depth/late-fees/${encodeURIComponent(id)}/waive`, { reason: waiverReason });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Waived ${id}`);
      setWaiverTarget(null);
      setWaiverReason('');
      await load();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to waive.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  const charge = async (id: string) => {
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post(`/business-depth/late-fees/${encodeURIComponent(id)}/charge`);
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Charged ${id}`);
      await load();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  // KPI aggregates
  const pending = rows.filter(r => r.status === 'pending');
  const totalFees = rows.reduce((s, r) => s + Number(r.fee_zar), 0);
  const pendingFees = pending.reduce((s, r) => s + Number(r.fee_zar), 0);
  const avgDays = rows.length ? Math.round(rows.reduce((s, r) => s + r.days_overdue, 0) / rows.length) : 0;

  const statusColor = (s: string) => {
    if (s === 'charged') return { bg: GOOD_BG, color: GOOD };
    if (s === 'pending') return { bg: WARN_BG, color: WARN };
    if (s === 'waived') return { bg: ACC_BG, color: ACC };
    return { bg: BG2, color: TX2 };
  };

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total fees', value: `R${totalFees.toLocaleString('en-ZA')}` },
          { label: 'Pending fees', value: `R${pendingFees.toLocaleString('en-ZA')}` },
          { label: 'Pending count', value: String(pending.length) },
          { label: 'Avg days overdue', value: String(avgDays) },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '12px 16px', flex: 1, minWidth: 100,
          }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Status filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <select
          style={{
            height: 32, padding: '0 8px', borderRadius: 6, border: `1px solid ${BORDER}`,
            fontSize: 12, color: TX1, background: BG1, cursor: 'pointer',
          }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="charged">Charged</option>
          <option value="waived">Waived</option>
          <option value="settled">Settled</option>
        </select>
        <button
          type="button"
          onClick={load}
          style={{
            height: 32, padding: '0 10px', borderRadius: 6, border: `1px solid ${BORDER}`,
            fontSize: 12, color: TX2, background: BG1, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Feedback banners */}
      {err && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6,
          fontSize: 12, color: BAD, marginBottom: 12,
        }}>
          <AlertCircle size={13} /> {err}
        </div>
      )}
      {ack && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
          background: GOOD_BG, border: `1px solid ${GOOD}`, borderRadius: 6,
          fontSize: 12, color: GOOD, marginBottom: 12,
        }}>
          <CheckCircle2 size={13} /> {ack}
        </div>
      )}

      {/* Waiver inline form */}
      {waiverTarget && (
        <div style={{
          background: WARN_BG, border: `1px solid ${WARN}`, borderRadius: 8,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: WARN, marginBottom: 8 }}>
            Waive fee — {waiverTarget}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Waiver reason (required)"
              value={waiverReason}
              onChange={e => setWaiverReason(e.target.value)}
              style={{
                flex: 1, height: 32, padding: '0 10px', borderRadius: 6,
                border: `1px solid ${BORDER}`, fontSize: 12, color: TX1, background: BG1,
              }}
            />
            <button
              type="button"
              disabled={busy || !waiverReason.trim()}
              onClick={waive}
              style={{
                height: 32, padding: '0 14px', borderRadius: 6,
                background: ACC, color: '#fff', border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                opacity: busy || !waiverReason.trim() ? 0.5 : 1,
              }}
            >
              {busy ? 'Saving…' : 'Confirm waive'}
            </button>
            <button
              type="button"
              onClick={() => { setWaiverTarget(null); setWaiverReason(''); }}
              style={{
                height: 32, padding: '0 12px', borderRadius: 6,
                background: 'transparent', color: TX2, border: `1px solid ${BORDER}`,
                fontSize: 12, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Fees table */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
              {['Computed', 'Invoice', 'Party', 'Invoice total', 'Days', 'Rate', 'Fee (ZAR)', 'Status', ''].map((h, i) => (
                <th
                  key={h || i}
                  style={{
                    textAlign: i >= 3 && i <= 6 ? 'right' : 'left',
                    padding: '9px 12px',
                    color: TX2,
                    fontWeight: 600,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const sc = statusColor(f.status);
              return (
                <tr key={f.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                  <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX2, fontSize: 11 }}>
                    {new Date(f.computed_at).toLocaleDateString('en-ZA')}
                  </td>
                  <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX1, fontSize: 11 }}>{f.invoice_id}</td>
                  <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX1, fontSize: 11 }}>{f.participant_id}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, color: TX1 }}>
                    R{Number(f.invoice_total).toLocaleString('en-ZA')}
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, color: TX1 }}>{f.days_overdue}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, color: TX1 }}>
                    {Number(f.annual_rate_pct).toFixed(2)}%
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: TX1 }}>
                    R{Number(f.fee_zar).toLocaleString('en-ZA')}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      background: sc.bg, color: sc.color,
                      padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {f.status}
                    </span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {f.status === 'pending' && (
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setWaiverTarget(f.id); setWaiverReason(''); }}
                          style={{
                            fontSize: 11, color: TX2, background: 'transparent',
                            border: `1px solid ${BORDER}`, padding: '3px 8px', borderRadius: 4,
                            cursor: 'pointer', fontWeight: 600,
                          }}
                        >
                          Waive
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => charge(f.id)}
                          style={{
                            fontSize: 11, color: '#fff', background: ACC,
                            border: 'none', padding: '3px 8px', borderRadius: 4,
                            cursor: 'pointer', fontWeight: 600,
                          }}
                        >
                          Charge
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: '20px 12px', color: TX3, fontStyle: 'italic', textAlign: 'center', fontSize: 12 }}>
                  No fees for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeesPanel() {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Late fees
      </div>
      <p style={{ fontSize: 12, color: TX3, lineHeight: 1.6, margin: 0 }}>
        Filter by status in the main panel. Use <strong style={{ color: TX2 }}>Charge</strong> to post a fee or <strong style={{ color: TX2 }}>Waive</strong> to record a waiver with reason. Waiving requires step-up authorisation.
      </p>

      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Status key
        </div>
        {[
          { status: 'pending', label: 'Pending', desc: 'Computed, not yet posted' },
          { status: 'charged', label: 'Charged', desc: 'Posted to participant account' },
          { status: 'waived', label: 'Waived', desc: 'Approved waiver recorded' },
          { status: 'settled', label: 'Settled', desc: 'Payment received' },
        ].map(item => {
          const sc = item.status === 'charged'
            ? { bg: GOOD_BG, color: GOOD }
            : item.status === 'pending'
              ? { bg: WARN_BG, color: WARN }
              : item.status === 'waived'
                ? { bg: ACC_BG, color: ACC }
                : { bg: BG2, color: TX2 };
          return (
            <div key={item.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <span style={{
                background: sc.bg, color: sc.color,
                padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 1,
              }}>
                {item.label}
              </span>
              <span style={{ fontSize: 11, color: TX3, lineHeight: 1.5 }}>{item.desc}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RatesMain() {
  const [current, setCurrent] = useState<Rate | null>(null);
  const [history, setHistory] = useState<Rate[]>([]);
  const [form, setForm] = useState({ effective_from: new Date().toISOString().slice(0, 10), rate_pct: '', source: 'SARB' });
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setErr(null);
    try {
      const r = await api.get('/business-depth/prime-rate');
      if (r.data.success) {
        setCurrent(r.data.data.current);
        setHistory(r.data.data.history || []);
      }
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    setBusy(true); setAck(null); setErr(null);
    try {
      const r = await api.post('/business-depth/prime-rate', {
        effective_from: form.effective_from,
        rate_pct: Number(form.rate_pct),
        source: form.source,
      });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Recorded ${form.rate_pct}% effective ${form.effective_from}`);
      setForm({ ...form, rate_pct: '' });
      await load();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to update prime rate.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  return (
    <div>
      {/* KPI: current rate */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '12px 16px', flex: 1,
        }}>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Current prime rate
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
            {current ? `${Number(current.rate_pct).toFixed(2)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
            {current
              ? `Since ${current.effective_from} · ${current.source || 'unknown source'}`
              : 'No rate on record.'}
          </div>
        </div>
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '12px 16px', flex: 1,
        }}>
          <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            History entries
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
            {history.length}
          </div>
          <div style={{ fontSize: 11, color: TX3, marginTop: 2 }}>
            {history.length > 0
              ? `Last: ${history[0]?.effective_from ?? '—'}`
              : 'No history.'}
          </div>
        </div>
      </div>

      {/* Add new rate form */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /> Add new rate
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>
            Effective from
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              style={{
                display: 'block', marginTop: 4, width: '100%', height: 32,
                padding: '0 8px', borderRadius: 6, border: `1px solid ${BORDER}`,
                fontSize: 12, color: TX1, background: BG, boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>
            Rate (%)
            <input
              type="number"
              step="0.05"
              value={form.rate_pct}
              onChange={(e) => setForm({ ...form, rate_pct: e.target.value })}
              placeholder="e.g. 8.25"
              style={{
                display: 'block', marginTop: 4, width: '100%', height: 32,
                padding: '0 8px', borderRadius: 6, border: `1px solid ${BORDER}`,
                fontSize: 12, color: TX1, background: BG, fontFamily: MONO, boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: TX2 }}>
            Source
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              style={{
                display: 'block', marginTop: 4, width: '100%', height: 32,
                padding: '0 8px', borderRadius: 6, border: `1px solid ${BORDER}`,
                fontSize: 12, color: TX1, background: BG, boxSizing: 'border-box',
              }}
            />
          </label>
        </div>

        {err && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6,
            fontSize: 12, color: BAD, marginBottom: 10,
          }}>
            <AlertCircle size={13} /> {err}
          </div>
        )}
        {ack && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
            background: GOOD_BG, border: `1px solid ${GOOD}`, borderRadius: 6,
            fontSize: 12, color: GOOD, marginBottom: 10,
          }}>
            <CheckCircle2 size={13} /> {ack}
          </div>
        )}

        <button
          type="button"
          disabled={busy || !form.rate_pct}
          onClick={submit}
          style={{
            height: 32, padding: '0 16px', borderRadius: 6,
            background: ACC, color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: busy || !form.rate_pct ? 0.5 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Record rate'}
        </button>
      </div>

      {/* Rate history table */}
      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Rate history
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Effective from', 'Rate', 'Source', 'Recorded by', 'At'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i === 1 ? 'right' : 'left',
                    padding: '8px 12px',
                    color: TX2,
                    fontWeight: 600,
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.effective_from} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX1, fontSize: 12 }}>{h.effective_from}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: MONO, color: TX1, fontWeight: 700 }}>
                  {Number(h.rate_pct).toFixed(2)}%
                </td>
                <td style={{ padding: '9px 12px', color: TX2, fontSize: 12 }}>{h.source || '—'}</td>
                <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX2, fontSize: 11 }}>{h.updated_by || '—'}</td>
                <td style={{ padding: '9px 12px', fontFamily: MONO, color: TX2, fontSize: 11 }}>
                  {new Date(h.updated_at).toLocaleDateString('en-ZA')}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '20px 12px', color: TX3, fontStyle: 'italic', textAlign: 'center', fontSize: 12 }}>
                  No rate history.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RatesPanel() {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Prime rate
      </div>
      <p style={{ fontSize: 12, color: TX3, lineHeight: 1.6, margin: 0 }}>
        The prime rate is used to compute late-payment penalties. Record a new entry when SARB announces a change. All entries are stored with audit trail.
      </p>

      <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Source guidance
        </div>
        {[
          { label: 'SARB', desc: 'SA Reserve Bank — standard source' },
          { label: 'MPC', desc: 'Monetary Policy Committee decision' },
          { label: 'Manual', desc: 'Override — requires senior auth' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <span style={{
              background: ACC_BG, color: ACC,
              padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
              whiteSpace: 'nowrap', marginTop: 1,
            }}>
              {item.label}
            </span>
            <span style={{ fontSize: 11, color: TX3, lineHeight: 1.5 }}>{item.desc}</span>
          </div>
        ))}
      </div>

      <div style={{ background: WARN_BG, border: `1px solid ${WARN}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: WARN, marginBottom: 4 }}>Step-up required</div>
        <p style={{ fontSize: 11, color: TX2, margin: 0, lineHeight: 1.6 }}>
          Recording a new prime rate requires step-up authorisation. Ensure you have elevated access before submitting.
        </p>
      </div>
    </>
  );
}

export default SettlementOpsPage;
