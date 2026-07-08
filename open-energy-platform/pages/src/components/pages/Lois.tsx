import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send, Inbox, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

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

const statusMeta: Record<string, { bg: string; color: string; label: string }> = {
  drafted:   { bg: BG2,     color: TX2,  label: 'Drafted' },
  sent:      { bg: 'oklch(0.93 0.04 240)', color: 'oklch(0.35 0.14 240)', label: 'Awaiting response' },
  signed:    { bg: GOOD_BG, color: GOOD, label: 'Accepted' },
  withdrawn: { bg: BAD_BG,  color: BAD,  label: 'Declined' },
  expired:   { bg: WARN_BG, color: WARN, label: 'Expired' },
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Mail size={18} color={TX2} />
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Letters of Intent</h1>
          </div>
          <p style={{ fontSize: 13, color: TX2, margin: 0 }}>
            Non-binding indications of offtake / supply. Accept to spawn a draft Term Sheet on your contracts list.
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <KpiCard label="TOTAL" value={counts.all} icon={<Inbox size={13} color={TX3} />} />
          <KpiCard label="SENT BY ME" value={counts.sent} icon={<Send size={13} color={TX3} />} />
          <KpiCard label="RECEIVED" value={counts.received} icon={<Mail size={13} color={TX3} />} />
          <KpiCard label="ACCEPTED" value={counts.accepted} icon={<ArrowRight size={13} color={GOOD} />} good />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 6,
            padding: '8px 14px', fontSize: 13, color: BAD, marginBottom: 16,
          }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {/* Table card */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{ padding: '24px 20px', fontSize: 13, color: TX2, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading LOIs…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: TX1, margin: '0 0 6px' }}>No Letters of Intent yet</p>
              <p style={{ fontSize: 12, color: TX2, margin: 0 }}>
                {user?.role === 'offtaker'
                  ? 'Use the Offtaker AI copilot on your cockpit to upload a bill and generate LOIs from the optimal mix.'
                  : user?.role === 'ipp_developer'
                    ? 'Simulate a project in the O&M hub and run batch LOI outreach to offtakers.'
                    : 'Once LOIs are drafted by offtakers or IPPs, they will appear here.'}
              </p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['FROM → TO', 'PROJECT', 'MWh/yr', 'R/MWh', 'HORIZON', 'STATUS', 'CREATED', ''].map((col, i) => (
                    <th key={i} style={{
                      textAlign: i >= 2 && i <= 4 ? 'right' : 'left',
                      padding: '8px 12px',
                      color: TX2,
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const meta = statusMeta[r.status] || statusMeta.drafted;
                  return (
                    <tr key={r.id} style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: i % 2 === 1 ? BG2 : 'transparent',
                    }}>
                      <td style={{ padding: '10px 12px', color: TX1 }}>
                        <span style={{ fontWeight: 600 }}>{r.from_name || '—'}</span>
                        <span style={{ color: TX3 }}> → </span>
                        <span style={{ fontWeight: 600 }}>{r.to_name || '—'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX1 }}>{r.project_name || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: TX1, fontFamily: MONO }}>
                        {r.annual_mwh ? Math.round(r.annual_mwh).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: TX1, fontFamily: MONO }}>
                        {r.blended_price ? `R${Number(r.blended_price).toFixed(0)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: TX1, fontFamily: MONO }}>
                        {r.horizon_years ? `${r.horizon_years}y` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: meta.bg,
                          color: meta.color,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX3, fontFamily: MONO, fontSize: 12 }}>
                        {new Date(r.created_at).toLocaleDateString('en-ZA')}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <Link
                          to={`/lois/${r.id}`}
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: ACC,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
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
        {/* Direction filter */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            DIRECTION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['all', 'received', 'sent'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                style={{
                  background: direction === d ? ACC : 'transparent',
                  color: direction === d ? '#fff' : TX2,
                  border: `1px solid ${direction === d ? ACC : BORDER}`,
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {d === 'all' ? <Inbox size={14} /> : d === 'sent' ? <Send size={14} /> : <Mail size={14} />}
                {d === 'all' ? 'All LOIs' : d === 'received' ? 'Received' : 'Sent by me'}
                <span style={{
                  marginLeft: 'auto',
                  background: direction === d ? 'rgba(255,255,255,0.25)' : BG2,
                  color: direction === d ? '#fff' : TX3,
                  borderRadius: 10,
                  padding: '1px 7px',
                  fontSize: 11,
                  fontFamily: MONO,
                }}>
                  {d === 'all' ? counts.all : d === 'sent' ? counts.sent : counts.received}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            SUMMARY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <StatRow label="Pending response" value={counts.pending} />
            <StatRow label="Accepted" value={counts.accepted} accent={GOOD} />
            <StatRow
              label="Declined / Expired"
              value={rows.filter(r => r.status === 'withdrawn' || r.status === 'expired').length}
              accent={BAD}
            />
          </div>
        </div>

        {/* Status legend */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            STATUS GUIDE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(statusMeta).map(([key, meta]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: meta.bg, color: meta.color,
                  padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 12, color: TX3 }}>
                  {key === 'drafted' && 'Not yet sent'}
                  {key === 'sent' && 'Waiting on counterparty'}
                  {key === 'signed' && 'Term sheet spawned'}
                  {key === 'withdrawn' && 'Counterparty declined'}
                  {key === 'expired' && 'Past validity window'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Context hint */}
        <div style={{
          background: 'oklch(0.93 0.04 240)', border: '1px solid oklch(0.85 0.06 240)', borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.35 0.14 240)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            HOW IT WORKS
          </div>
          <p style={{ fontSize: 12, color: 'oklch(0.30 0.10 240)', margin: 0, lineHeight: 1.6 }}>
            An accepted LOI automatically spawns a draft Term Sheet in your contracts list. Accepting is non-binding until the Term Sheet is countersigned.
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, good }: { label: string; value: number; icon: React.ReactNode; good?: boolean }) {
  return (
    <div style={{
      background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '12px 16px', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: good ? GOOD : TX1, fontFamily: MONO, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: TX2 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: accent || TX1, fontFamily: MONO }}>{value}</span>
    </div>
  );
}
