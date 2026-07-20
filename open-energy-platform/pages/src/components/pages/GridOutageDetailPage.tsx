// ════════════════════════════════════════════════════════════════════════
// GridOutageDetailPage — drill-in for /grid-operator/outages/:id
//
// Per-outage response timeline. Pulls the existing outage-responses
// list filtered by outage_id and renders the response history with
// inline "Log response" modal so the operator can drive the incident
// to restored / closed from one screen.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { OutageImpact } from '../widgets/OutageImpact';

const BG     = 'var(--s0, oklch(0.96 0.003 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG2    = 'var(--s2, oklch(0.93 0.004 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX2    = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';
const GOOD   = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG= 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const BAD    = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const WARN   = 'var(--accent, oklch(0.50 0.18 55))';
const WARN_BG= 'color-mix(in oklab, var(--warn) 15%, var(--s1))';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

type Response = {
  id: string;
  outage_id: string;
  responder_id: string;
  response_type:
    | 'acknowledged' | 'dispatched_crew' | 'rerouted' | 'restored' | 'escalated' | 'closed';
  notes: string | null;
  eta_minutes: number | null;
  responded_at: string;
};

function responseColor(type: Response['response_type']) {
  if (type === 'restored' || type === 'closed') return { bg: GOOD_BG, fg: GOOD };
  if (type === 'escalated') return { bg: BAD_BG, fg: BAD };
  return { bg: WARN_BG, fg: WARN };
}

export function GridOutageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [responses, setResponses] = useState<Response[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get(`/grid-operator/outage-responses?outage_id=${encodeURIComponent(id)}`);
      setResponses((res.data?.data as Response[]) || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const sorted = [...responses].sort((a, b) =>
    new Date(b.responded_at).getTime() - new Date(a.responded_at).getTime(),
  );
  const isClosed = responses.some(r => r.response_type === 'closed');
  const isRestored = !isClosed && responses.some(r => r.response_type === 'restored');
  const latestState = isClosed ? 'closed' : isRestored ? 'restored' : (sorted[0]?.response_type || 'open');
  const firstResponse = [...responses].sort((a, b) =>
    new Date(a.responded_at).getTime() - new Date(b.responded_at).getTime(),
  )[0];

  const durationHours =
    firstResponse && (isRestored || isClosed)
      ? Math.max(
          0.5,
          (new Date(sorted[0].responded_at).getTime() - new Date(firstResponse.responded_at).getTime()) / 3_600_000,
        )
      : undefined;

  const stateColors = isClosed || isRestored
    ? { bg: GOOD_BG, fg: GOOD }
    : latestState === 'escalated'
    ? { bg: BAD_BG, fg: BAD }
    : { bg: WARN_BG, fg: WARN };

  const countByType = responses.reduce<Record<string, number>>((acc, r) => {
    acc[r.response_type] = (acc[r.response_type] || 0) + 1;
    return acc;
  }, {});

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
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TX3, marginBottom: 8 }}>
          <Link to="/v2" style={{ color: TX3, textDecoration: 'none' }}>
            Grid ops workstation
          </Link>
          <span>/</span>
          <span style={{ color: TX2, fontWeight: 600 }}>Outage detail</span>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>
            Outage&nbsp;
            <span style={{ fontFamily: MONO, fontSize: 18, color: TX2 }}>
              {(id || '').slice(0, 16)}…
            </span>
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span style={{
              background: stateColors.bg,
              color: stateColors.fg,
              padding: '2px 10px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {latestState.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 13, color: TX2 }}>
              {responses.length} response{responses.length === 1 ? '' : 's'} logged
            </span>
            {firstResponse && (
              <span style={{ fontSize: 12, color: TX3 }}>
                · first at {new Date(firstResponse.responded_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '12px 16px', flex: 1, minWidth: 120,
          }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              TOTAL RESPONSES
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
              {responses.length}
            </div>
          </div>
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '12px 16px', flex: 1, minWidth: 120,
          }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              STATUS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: stateColors.fg, fontFamily: MONO, marginTop: 4, textTransform: 'capitalize' }}>
              {latestState.replace(/_/g, ' ')}
            </div>
          </div>
          {durationHours !== undefined && (
            <div style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                DURATION
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                {durationHours.toFixed(1)}h
              </div>
            </div>
          )}
          {firstResponse && (
            <div style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                FIRST RESPONSE
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                {new Date(firstResponse.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}
        </div>

        {loading && <Skeleton variant="card" rows={4} />}
        {err && <ErrorBanner message={err} onRetry={() => void load()} />}

        {!loading && !err && (
          <OutageImpact durationHours={durationHours} />
        )}

        {!loading && !err && responses.length === 0 && (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '32px 24px', textAlign: 'center', marginTop: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TX1 }}>No responses logged</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 6 }}>
              Log the first response (acknowledged / dispatched crew / etc.) to start the incident timeline.
            </div>
          </div>
        )}

        {!loading && !err && responses.length > 0 && (
          <div style={{
            background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
            padding: '16px 20px', marginTop: 16,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              RESPONSE TIMELINE (NEWEST FIRST)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    TYPE
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    RESPONDER
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ETA
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    NOTES
                  </th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', color: TX2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    TIMESTAMP
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const rc = responseColor(r.response_type);
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          background: rc.bg,
                          color: rc.fg,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          whiteSpace: 'nowrap',
                        }}>
                          {r.response_type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>
                        {r.responder_id.slice(0, 14)}…
                      </td>
                      <td style={{ padding: '10px 12px', color: TX2, fontFamily: MONO, fontSize: 12 }}>
                        {r.eta_minutes != null ? `${r.eta_minutes} min` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: TX1, fontSize: 12, maxWidth: 260 }}>
                        {r.notes
                          ? <span style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</span>
                          : <span style={{ color: TX3 }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', color: TX3, fontFamily: MONO, fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {new Date(r.responded_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        {/* Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate('/v2')}
            style={{
              background: 'transparent',
              color: ACC,
              border: `1px solid ${ACC}`,
              padding: '8px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={14} /> Workstation
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: 'transparent',
              color: ACC,
              border: `1px solid ${ACC}`,
              padding: '8px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {!isClosed && (
            <button
              type="button"
              onClick={() => setLogging(true)}
              style={{
                background: ACC,
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              + Log Response
            </button>
          )}
        </div>

        {/* Outage summary */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            OUTAGE ID
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: TX1, wordBreak: 'break-all' }}>
            {id}
          </div>
        </div>

        {/* Response type breakdown */}
        {responses.length > 0 && (
          <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              RESPONSE BREAKDOWN
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(countByType).map(([type, count]) => {
                const rc = responseColor(type as Response['response_type']);
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      background: rc.bg,
                      color: rc.fg,
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}>
                      {type.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TX1 }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current status card */}
        <div style={{ background: stateColors.bg, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            CURRENT STATUS
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: stateColors.fg, textTransform: 'capitalize' }}>
            {latestState.replace(/_/g, ' ')}
          </div>
          {isClosed && (
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>Incident closed.</div>
          )}
          {isRestored && !isClosed && (
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>Service restored — pending closure.</div>
          )}
          {!isClosed && !isRestored && responses.length > 0 && (
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>Incident in progress.</div>
          )}
          {responses.length === 0 && (
            <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>No responses yet.</div>
          )}
        </div>
      </div>

      {logging && (
        <ActionModal
          title="Log outage response"
          submitLabel="Log"
          fields={[
            { key: 'response_type', label: 'Response type', type: 'select', required: true, options: [
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'dispatched_crew', label: 'Dispatched crew' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'restored', label: 'Restored' },
              { value: 'escalated', label: 'Escalated' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'eta_minutes', label: 'ETA (minutes)', type: 'number' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setLogging(false)}
          onSubmit={async (v) => {
            const body: any = { outage_id: id, response_type: v.response_type, notes: v.notes };
            if (v.eta_minutes) body.eta_minutes = Number(v.eta_minutes);
            await api.post('/grid-operator/outage-responses', body);
            setLogging(false); await load();
          }}
        />
      )}
    </div>
  );
}
