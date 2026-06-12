// ════════════════════════════════════════════════════════════════════════
// LicenceActionDetailPage — drill-in for /regulator/licence-actions/:id
//
// Single licence action workflow record: action type + current status +
// initiated/decided/executed timestamps + transition history (derived
// from the row's timestamps) + transition action button.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, FileText, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { ActionModal, FieldSpec } from '../launch/WorkstationShell';

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BG2    = 'oklch(0.93 0.004 250)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.40 0.12 5)';
const BAD    = 'oklch(0.48 0.20 20)';
const BAD_BG = 'oklch(0.97 0.04 20)';
const WARN   = 'oklch(0.50 0.18 55)';
const WARN_BG= 'oklch(0.96 0.05 55)';
const GOOD   = 'oklch(0.40 0.16 155)';
const GOOD_BG= 'oklch(0.95 0.04 155)';
const INFO   = 'oklch(0.40 0.12 250)';
const INFO_BG= 'oklch(0.95 0.03 250)';
const MONO   = '"IBM Plex Mono","Fira Code",monospace';

const LICENCE_TRANSITIONS = [
  { value: 'pending_hearing', label: 'Schedule hearing' },
  { value: 'decided', label: 'Decide' },
  { value: 'executed', label: 'Execute' },
  { value: 'appealed', label: 'Appeal' },
  { value: 'reversed', label: 'Reverse' },
];

function StatusBadge({ status }: { status: string }) {
  const isGood = status === 'executed' || status === 'decided';
  const isBad  = status === 'reversed';
  const isWarn = status === 'appealed' || status === 'pending_hearing';
  const bg    = isGood ? GOOD_BG : isBad ? BAD_BG : isWarn ? WARN_BG : INFO_BG;
  const color = isGood ? GOOD   : isBad ? BAD    : isWarn ? WARN    : INFO;
  return (
    <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ToneBadge({ tone, label }: { tone: 'info' | 'good' | 'bad' | 'warn'; label: string }) {
  const map = {
    info: { bg: INFO_BG, color: INFO },
    good: { bg: GOOD_BG, color: GOOD },
    bad:  { bg: BAD_BG,  color: BAD  },
    warn: { bg: WARN_BG, color: WARN },
  };
  const { bg, color } = map[tone];
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

export function LicenceActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErr(null);
    try {
      const res = await api.get('/regulator/licence-actions');
      const all = (res.data?.data as any[]) || [];
      setRow(all.find(r => r.id === id) || null);
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
      <ErrorBanner message="Licence action not found" />
    </div>
  );

  type Tone = 'info' | 'good' | 'bad' | 'warn';
  const timelineRaw: Array<{ ts: string | null; label: string; tone: Tone }> = [
    { ts: row.initiated_at, label: 'Initiated', tone: 'info' },
    { ts: row.decided_at, label: 'Decided', tone: 'good' },
    { ts: row.status === 'executed' ? row.updated_at : null, label: 'Executed', tone: 'good' },
    { ts: row.status === 'appealed' ? row.updated_at : null, label: 'Appealed', tone: 'bad' },
    { ts: row.status === 'reversed' ? row.updated_at : null, label: 'Reversed', tone: 'bad' },
  ];
  const timeline = timelineRaw.filter((t): t is { ts: string; label: string; tone: Tone } => t.ts != null);

  const isClosed = row.status === 'executed' || row.status === 'reversed';

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TX3, marginBottom: 16 }}>
          <Link to="/regulator-suite/workstation" style={{ color: TX3, textDecoration: 'none' }}>
            Regulator workstation
          </Link>
          <span>/</span>
          <span style={{ color: TX2, fontWeight: 600 }}>Licence action</span>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0, textTransform: 'capitalize' }}>
              {row.action_type}
            </h1>
            <StatusBadge status={row.status} />
          </div>
          <p style={{ fontSize: 13, color: TX2, margin: '6px 0 0', fontFamily: MONO }}>
            {row.licence_id && <>Licence: {row.licence_id.slice(0, 14)}…</>}
            {row.licence_id && row.application_id && <span style={{ margin: '0 8px', color: TX3 }}>·</span>}
            {row.application_id && <>Application: {row.application_id.slice(0, 14)}…</>}
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Status</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TX1, marginTop: 6, textTransform: 'capitalize' }}>
              {row.status.replace(/_/g, ' ')}
            </div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Initiated</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 6 }}>
              {row.initiated_at ? new Date(row.initiated_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Decided</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 6 }}>
              {row.decided_at ? new Date(row.decided_at).toLocaleDateString() : '—'}
            </div>
          </div>
          {row.appeal_deadline && (
            <div style={{ background: WARN_BG, border: `1px solid ${WARN}`, borderRadius: 8, padding: '12px 16px', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: WARN, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Appeal deadline</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: WARN, fontFamily: MONO, marginTop: 6 }}>
                {new Date(row.appeal_deadline).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} style={{ color: TX3 }} /> Timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {timeline.map((t, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <ToneBadge tone={t.tone} label={t.label} />
                <span style={{ color: TX2, fontFamily: MONO, fontSize: 12 }}>
                  {new Date(t.ts).toLocaleString()}
                </span>
              </div>
            ))}
            {row.appeal_deadline && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                <ToneBadge tone="warn" label="Appeal deadline" />
                <span style={{ color: TX2, fontFamily: MONO, fontSize: 12 }}>
                  {new Date(row.appeal_deadline).toLocaleDateString()}
                </span>
              </div>
            )}
            {timeline.length === 0 && !row.appeal_deadline && (
              <div style={{ color: TX3, fontSize: 13 }}>No timeline events recorded.</div>
            )}
          </div>
        </div>

        {/* Decision rationale */}
        {row.decision_rationale && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={13} style={{ color: TX3 }} /> Decision rationale
            </div>
            <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {row.decision_rationale}
            </div>
          </div>
        )}

        {/* Notes */}
        {row.notes && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={13} style={{ color: TX3 }} /> Notes
            </div>
            <div style={{ fontSize: 13, color: TX1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {row.notes}
            </div>
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
        {/* Actions */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!isClosed && (
              <button
                type="button"
                onClick={() => setTransitioning(true)}
                style={{ background: ACC, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, textAlign: 'left' }}
              >
                Transition
              </button>
            )}
            <button
              type="button"
              onClick={() => void load()}
              style={{ background: 'transparent', color: ACC, border: `1px solid ${ACC}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/regulator-suite/workstation?tab=licences')}
              style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={13} /> Workstation
            </button>
          </div>
        </div>

        {/* Record details */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
            Record details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Action type', value: row.action_type },
              { label: 'Status', value: row.status.replace(/_/g, ' ') },
              { label: 'Licence ID', value: row.licence_id ? row.licence_id.slice(0, 18) + '…' : '—', mono: true },
              { label: 'Application ID', value: row.application_id ? row.application_id.slice(0, 18) + '…' : '—', mono: true },
            ].map(({ label, value, mono }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: TX3, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, color: TX1, fontWeight: 600, textAlign: 'right', fontFamily: mono ? MONO : undefined, textTransform: mono ? undefined : 'capitalize' }}>
                  {value || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status indicator */}
        {isClosed && (
          <div style={{ background: GOOD_BG, border: `1px solid ${GOOD}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <CheckCircle size={14} style={{ color: GOOD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: GOOD, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Closed</span>
            </div>
            <div style={{ fontSize: 12, color: TX2 }}>
              This licence action has reached a terminal state and cannot be transitioned further.
            </div>
          </div>
        )}

        {row.status === 'appealed' && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AlertTriangle size={14} style={{ color: BAD }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: BAD, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Under appeal</span>
            </div>
            <div style={{ fontSize: 12, color: TX2 }}>
              This action is currently under appeal. Review and transition as appropriate.
            </div>
          </div>
        )}
      </div>

      {transitioning && (
        <ActionModal
          title={`Transition licence action · current: ${row.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: LICENCE_TRANSITIONS },
            { key: 'rationale', label: 'Decision rationale', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(false)}
          onSubmit={async (v) => {
            await api.post(`/regulator/licence-actions/${id}/transition`, v);
            setTransitioning(false); await load();
          }}
        />
      )}
    </div>
  );
}
