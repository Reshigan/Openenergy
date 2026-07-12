// ════════════════════════════════════════════════════════════════════════
// LoiDetail — /lois/:id
//
// Thin EntityFileShell wrapper. The shell fetches /lois/:id/file and lays
// out tabs/hero/KPIs. Accept + decline actions live in the hero buttons —
// recipients see them when the LOI is still drafted/sent. Decline asks for
// a reason via a small inline overlay that posts to /lois/:id/decline.
// Accept posts to /lois/:id/accept and navigates straight to the resulting
// contract file.
// ════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OEIcon } from '../OEIcon';
import { EntityFileShell } from '../file/EntityFileShell';
import { loiFileTabs, loiHero, type LoiFileData } from '../file/loiFileConfig';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

const BAD     = 'var(--bad, oklch(0.48 0.20 20))';
const BAD_BG  = 'color-mix(in oklab, var(--bad) 15%, var(--s1))';
const BORDER  = 'var(--border-subtle, oklch(0.87 0.006 250))';
const TX1     = 'var(--ink, oklch(0.17 0.010 250))';
const TX2     = 'var(--ink-2, oklch(0.40 0.009 250))';
const TX3     = 'var(--ink-2, oklch(0.60 0.007 250))';
const BG1     = 'var(--s1, oklch(0.99 0.002 80))';
const BG2     = 'var(--s2, oklch(0.93 0.004 250))';
const GOOD    = 'var(--good, oklch(0.40 0.16 155))';
const GOOD_BG = 'color-mix(in oklab, var(--good) 15%, var(--s1))';
const ACC     = 'var(--accent, oklch(0.46 0.12 230))';

export function LoiDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  if (!id) return null;

  const accept = async () => {
    setBusy('accept');
    setError(null);
    try {
      const resp = await api.post(`/lois/${id}/accept`, {});
      const docId = resp.data?.data?.contract_document_id as string | undefined;
      if (docId) {
        navigate(`/contracts/${docId}`);
        return;
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept LOI');
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    if (!declineReason.trim()) {
      setError('Please add a brief reason for declining.');
      return;
    }
    setBusy('decline');
    setError(null);
    try {
      await api.post(`/lois/${id}/decline`, { reason: declineReason.trim() });
      setShowDecline(false);
      setDeclineReason('');
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decline LOI');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && (
        <div style={{
          maxWidth: 1400,
          margin: '16px auto 0',
          borderRadius: 8,
          border: `1px solid ${BAD}`,
          background: BAD_BG,
          padding: '8px 16px',
          fontSize: 13,
          color: BAD,
        }}>
          {error}
        </div>
      )}

      <EntityFileShell<LoiFileData>
        key={reloadKey}
        endpoint={`/lois/${id}/file`}
        entityKind="lois"
        entityId={id}
        backHref="/lois"
        backLabel="All LOIs"
        heroFor={(data) => {
          const canRespond =
            user?.id === data.loi.to_participant_id &&
            (data.loi.status === 'drafted' || data.loi.status === 'sent');
          return {
            ...loiHero(data),
            actions: (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/lois')}
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(255,255,255,0.20)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <OEIcon name="chevron-left" size={14} /> LOIs
                </button>
                {data.contract?.record?.id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/contracts/${data.contract!.record.id}`)}
                    style={{
                      height: 36,
                      padding: '0 12px',
                      borderRadius: 6,
                      background: 'var(--s1, #fff)',
                      border: 'none',
                      color: '#3a1f5d',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <OEIcon name="doc" size={14} /> Open contract file
                  </button>
                )}
                {data.project?.id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${data.project.id}`)}
                    style={{
                      height: 36,
                      padding: '0 12px',
                      borderRadius: 6,
                      background: 'var(--s1, #fff)',
                      border: 'none',
                      color: '#3a1f5d',
                      fontSize: 12,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <OEIcon name="workflow" size={14} /> Open project file
                  </button>
                )}
                {canRespond && (
                  <>
                    <button
                      type="button"
                      onClick={accept}
                      disabled={busy !== null}
                      style={{
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 6,
                        background: GOOD,
                        border: 'none',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: busy !== null ? 'not-allowed' : 'pointer',
                        opacity: busy !== null ? 0.6 : 1,
                      }}
                    >
                      <OEIcon name="check" size={14} /> {busy === 'accept' ? 'Accepting…' : 'Accept & sign'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDecline(true)}
                      disabled={busy !== null}
                      style={{
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.15)',
                        border: '1px solid rgba(255,255,255,0.30)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: busy !== null ? 'not-allowed' : 'pointer',
                        opacity: busy !== null ? 0.6 : 1,
                      }}
                    >
                      <OEIcon name="close" size={14} /> Decline
                    </button>
                  </>
                )}
              </>
            ),
          };
        }}
        summaryFor={(data) => data.summary}
        suggestionsFor={(data) => data.ai_suggestions}
        tabs={loiFileTabs}
      />

      {showDecline && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          background: 'rgba(0,0,0,0.40)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
        }}>
          <div style={{
            width: '100%',
            maxWidth: 440,
            borderRadius: 12,
            background: BG1,
            border: `1px solid ${BORDER}`,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${BORDER}`,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: TX1 }}>Decline LOI</div>
              <div style={{ fontSize: 12, color: TX3, marginTop: 4 }}>
                The sender will be notified. Provide a clear reason so they can counter-offer.
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: TX2 }}>Reason</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
                placeholder="e.g. Volume exceeds our current offtake envelope; revisit in Q3 post-budget."
                style={{
                  width: '100%',
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  padding: '8px 12px',
                  fontSize: 13,
                  color: TX1,
                  background: BG2,
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setShowDecline(false); setDeclineReason(''); }}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 6,
                    background: 'transparent',
                    border: `1px solid ${BORDER}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: TX2,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={decline}
                  disabled={busy !== null || !declineReason.trim()}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 6,
                    background: BAD,
                    border: 'none',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: (busy !== null || !declineReason.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (busy !== null || !declineReason.trim()) ? 0.6 : 1,
                  }}
                >
                  {busy === 'decline' ? 'Declining…' : 'Confirm decline'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default LoiDetail;
