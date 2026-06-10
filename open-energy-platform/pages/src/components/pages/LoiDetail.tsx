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
        <div className="mx-auto mt-4 max-w-[1400px] rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-2 text-[13px] text-[#c0392b]">
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
                  className="h-9 px-3 rounded-md bg-white/15 border border-white/20 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/25"
                >
                  <OEIcon name="chevron-left" size={14} /> LOIs
                </button>
                {data.contract?.record?.id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/contracts/${data.contract!.record.id}`)}
                    className="h-9 px-3 rounded-md bg-white text-[#3a1f5d] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/90"
                  >
                    <OEIcon name="doc" size={14} /> Open contract file
                  </button>
                )}
                {data.project?.id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${data.project.id}`)}
                    className="h-9 px-3 rounded-md bg-white text-[#3a1f5d] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/90"
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
                      className="h-9 px-3 rounded-md bg-[#1a8a5b] text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#0b6430] disabled:opacity-60"
                    >
                      <OEIcon name="check" size={14} /> {busy === 'accept' ? 'Accepting…' : 'Accept & sign'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDecline(true)}
                      disabled={busy !== null}
                      className="h-9 px-3 rounded-md bg-white/15 border border-white/30 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/25 disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-[#dde4ec] shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#eef2f7]">
              <h3 className="text-[15px] font-semibold text-[#0f1c2e]">Decline LOI</h3>
              <p className="text-[12px] text-[#6b7685] mt-1">
                The sender will be notified. Provide a clear reason so they can counter-offer.
              </p>
            </div>
            <div className="p-5 space-y-3">
              <label className="text-[12px] font-semibold text-[#6b7685]">Reason</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={4}
                placeholder="e.g. Volume exceeds our current offtake envelope; revisit in Q3 post-budget."
                className="w-full rounded-lg border border-[#d0d5dd] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#3b82c4]"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowDecline(false); setDeclineReason(''); }}
                  className="h-9 px-3 rounded-md border border-[#d0d5dd] text-[12px] text-[#6b7685] hover:bg-[#f5f6fa]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={decline}
                  disabled={busy !== null || !declineReason.trim()}
                  className="h-9 px-3 rounded-md bg-[#c0392b] text-white text-[12px] font-semibold hover:bg-[#9a0000] disabled:opacity-60"
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
