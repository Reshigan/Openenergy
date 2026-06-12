// ════════════════════════════════════════════════════════════════════════
// VintageDetailPage — drill-in for /carbon-registry/vintages/:id
//
// Single vintage workflow record: current stage + retirement summary +
// related retirement certificates issued against this vintage.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ActionModal, FieldSpec } from '../launch/WorkstationShell';

const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 145)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const INFO    = 'oklch(0.40 0.12 250)';
const INFO_BG = 'oklch(0.95 0.04 250)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

function stageBadgeColors(stage: string): { bg: string; color: string } {
  if (stage === 'retired_full')    return { bg: GOOD_BG, color: GOOD };
  if (stage === 'retired_partial') return { bg: WARN_BG, color: WARN };
  if (stage === 'expired')         return { bg: BAD_BG, color: BAD };
  return { bg: INFO_BG, color: INFO };
}

function certStatusColors(status: string): { bg: string; color: string } {
  if (status === 'delivered') return { bg: GOOD_BG, color: GOOD };
  if (status === 'revoked')   return { bg: BAD_BG, color: BAD };
  return { bg: INFO_BG, color: INFO };
}

export function VintageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<any>(null);
  const [certs, setCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/carbon-registry/vintage-workflow');
      const all = (res.data?.data as any[]) || [];
      setRow(all.find(r => r.id === id) || null);
      const c = await api.get('/carbon-registry/retirement-certificates').catch(() => ({ data: { data: [] } }));
      const allCerts = (c.data?.data as any[]) || [];
      setCerts(allCerts.filter(rc => rc.retirement_id === (all.find(r => r.id === id)?.vintage_id)));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <Skeleton variant="card" rows={6} />
    </div>
  );
  if (err) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <ErrorBanner message={err} onRetry={() => void load()} />
    </div>
  );
  if (!row) return (
    <div style={{ padding: 24, background: BG, minHeight: '100vh' }}>
      <ErrorBanner message="Vintage workflow row not found" />
    </div>
  );

  const { bg: stageBg, color: stageColor } = stageBadgeColors(row.current_stage);
  const canAdvance = row.current_stage !== 'retired_full' && row.current_stage !== 'expired';

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

        {/* Breadcrumb + header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TX3, marginBottom: 8 }}>
            <Link
              to="/carbon-registry/workstation"
              style={{ color: TX3, textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
            >
              Carbon workstation
            </Link>
            <span>/</span>
            <span style={{ color: TX2, fontWeight: 600 }}>Vintage detail</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            Vintage
            <span style={{ fontSize: 15, fontFamily: MONO, color: TX2, fontWeight: 500 }}>
              {(row.vintage_id || '').slice(0, 16)}…
            </span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{
              background: stageBg, color: stageColor,
              padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
            }}>
              {row.current_stage.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 12, color: TX3 }}>
              · last updated {new Date(row.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Current Stage', value: row.current_stage.replace(/_/g, ' ') },
            { label: 'Retired tCO₂e', value: Number(row.retired_volume_tco2e || 0).toFixed(1) },
            { label: 'Outstanding tCO₂e', value: Number(row.outstanding_tco2e || 0).toFixed(1) },
            { label: 'Certificates', value: String(certs.length) },
          ].map(k => (
            <div key={k.label} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 110,
            }}>
              <div style={{ fontSize: 10, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {k.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {/* Notes */}
        {row.notes && (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '14px 18px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              NOTES
            </div>
            <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {row.notes}
            </div>
          </div>
        )}

        {/* Retirement certificates table */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Retirement Certificates ({certs.length})
          </div>

          {certs.length === 0 ? (
            <div style={{ fontSize: 13, color: TX3, padding: '12px 0' }}>
              No certificates issued for this vintage.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['Certificate', 'Beneficiary', 'tCO₂e', 'Status', 'Issued'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px',
                      color: TX2, fontWeight: 600, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certs.map((c, i) => {
                  const { bg: sBg, color: sColor } = certStatusColors(c.status);
                  return (
                    <tr key={c.id} style={{
                      borderBottom: `1px solid ${BORDER}`,
                      background: i % 2 === 1 ? BG2 : 'transparent',
                    }}>
                      <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO, fontSize: 11 }}>
                        {c.certificate_number}
                      </td>
                      <td style={{ padding: '10px 12px', color: TX1 }}>
                        {c.beneficiary_name || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: TX1, fontFamily: MONO }}>
                        {Number(c.retired_volume_tco2e || 0).toFixed(1)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: sBg, color: sColor,
                          padding: '2px 8px', borderRadius: 12,
                          fontSize: 11, fontWeight: 600,
                        }}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX3, fontSize: 12 }}>
                        {c.issued_at ? new Date(c.issued_at).toLocaleDateString() : '—'}
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
        {/* Navigation actions */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Navigation
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/carbon-registry/workstation')}
              style={{
                background: 'transparent', color: TX2,
                border: `1px solid ${BORDER}`,
                padding: '8px 14px', borderRadius: 6,
                fontWeight: 600, cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <ArrowLeft size={13} /> Back to workstation
            </button>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                background: 'transparent', color: TX2,
                border: `1px solid ${BORDER}`,
                padding: '8px 14px', borderRadius: 6,
                fontWeight: 600, cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {/* Stage actions */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Stage Actions
          </div>
          {canAdvance ? (
            <button
              type="button"
              onClick={() => setAdvancing(true)}
              style={{
                background: ACC, color: '#fff',
                border: 'none', padding: '9px 16px',
                borderRadius: 6, fontWeight: 600,
                cursor: 'pointer', fontSize: 13, width: '100%',
              }}
            >
              Advance stage
            </button>
          ) : (
            <div style={{ fontSize: 12, color: TX3, padding: '4px 0' }}>
              No further transitions available for <strong style={{ color: TX2 }}>{row.current_stage.replace(/_/g, ' ')}</strong>.
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{
          background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Vintage ID', value: (row.vintage_id || '').slice(0, 20) + '…', mono: true },
              { label: 'Workflow ID', value: (row.id || '').slice(0, 20) + '…', mono: true },
              { label: 'Stage', value: row.current_stage.replace(/_/g, ' '), mono: false },
              { label: 'Retired tCO₂e', value: Number(row.retired_volume_tco2e || 0).toFixed(2), mono: true },
              { label: 'Outstanding tCO₂e', value: Number(row.outstanding_tco2e || 0).toFixed(2), mono: true },
              { label: 'Certificates', value: String(certs.length), mono: true },
              { label: 'Last updated', value: new Date(row.updated_at).toLocaleDateString(), mono: false },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: TX3, flexShrink: 0 }}>{item.label}</span>
                <span style={{
                  fontSize: 12, color: TX1, fontWeight: 600, textAlign: 'right',
                  fontFamily: item.mono ? MONO : 'inherit',
                  wordBreak: 'break-all',
                }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Certificate status breakdown */}
        {certs.length > 0 && (() => {
          const delivered = certs.filter(c => c.status === 'delivered').length;
          const revoked   = certs.filter(c => c.status === 'revoked').length;
          const other     = certs.length - delivered - revoked;
          return (
            <div style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Certificate Status
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Delivered', count: delivered, bg: GOOD_BG, color: GOOD },
                  { label: 'Revoked',   count: revoked,   bg: BAD_BG,  color: BAD  },
                  { label: 'Other',     count: other,     bg: INFO_BG, color: INFO },
                ].filter(s => s.count > 0).map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      background: s.bg, color: s.color,
                      padding: '2px 8px', borderRadius: 12,
                      fontSize: 11, fontWeight: 600,
                    }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO }}>
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${row.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(false)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${id}/advance`, { to_stage: v.to_stage });
            setAdvancing(false); await load();
          }}
        />
      )}
    </div>
  );
}
