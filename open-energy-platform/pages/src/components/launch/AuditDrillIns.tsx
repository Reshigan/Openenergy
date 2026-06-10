// ════════════════════════════════════════════════════════════════════════
// AuditDrillIns — three shared modals invoked from AuditPanel rows
//
//   ReconBreaksModal   — drill into a recon run, list breaks, resolve them
//   AuditEventsModal   — paginated chain log (audit_events.payload_json)
//   ExportDetailModal  — manifest viewer + signed CSV download
//
// Each modal is feature-agnostic: pass the API prefix (e.g. `/trading`,
// `/settlement`) plus the row id. Same component renders for every L5
// surface — no per-feature duplication.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { Pill } from './WorkstationShell';

type BaseProps = { prefix: string; onClose: () => void; onChange?: () => void };

// ─── ReconBreaksModal ────────────────────────────────────────────────────

type Break = {
  id: string;
  break_type: 'missing_in_ours' | 'missing_in_theirs' | 'field_mismatch';
  external_ref: string | null;
  field: string | null;
  our_value: string | null;
  their_value: string | null;
  resolution: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};

export function ReconBreaksModal({
  prefix, runId, onClose, onChange,
}: BaseProps & { runId: string }) {
  const [rows, setRows] = useState<Break[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Break | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`${prefix}/audit/recon/${runId}/breaks`);
      setRows((r.data?.data || []) as Break[]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [runId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const counts = rows.reduce<Record<string, number>>((acc, b) => {
    acc[b.break_type] = (acc[b.break_type] || 0) + 1; return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Reconciliation breaks</h3>
            <div className="text-[12px] text-[#6b7685] mt-1 font-mono">{runId}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6b7685] hover:text-[#0f1c2e] text-[20px]">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {err && <div className="text-[12px] text-red-700 mb-3">{err}</div>}
          {loading ? (
            <div className="text-[13px] text-[#6b7685]">Loading breaks…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-[#6b7685] flex items-center gap-2">
              <ShieldCheck size={14} className="text-green-600" /> No breaks — perfect reconciliation.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
                {counts.missing_in_ours > 0 && <Pill tone="bad">{counts.missing_in_ours} missing in ours</Pill>}
                {counts.missing_in_theirs > 0 && <Pill tone="warn">{counts.missing_in_theirs} missing in theirs</Pill>}
                {counts.field_mismatch > 0 && <Pill tone="bad">{counts.field_mismatch} field mismatch</Pill>}
              </div>
              <div className="rounded-lg border border-[#dde4ec] divide-y divide-[#eef2f7]">
                {rows.map((b) => {
                  const isOpen = expanded.has(b.id);
                  return (
                    <div key={b.id}>
                      <button type="button" onClick={() => toggle(b.id)} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#f8fafc] text-left">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Pill tone={b.break_type === 'field_mismatch' ? 'bad' : b.break_type === 'missing_in_ours' ? 'bad' : 'warn'}>
                          {b.break_type.replace(/_/g, ' ')}
                        </Pill>
                        <span className="font-mono text-[11px] truncate flex-1">
                          {b.external_ref || '—'}
                        </span>
                        {b.field && <Pill tone="info">{b.field}</Pill>}
                        {b.resolution ? (
                          <Pill tone="good">{b.resolution.replace(/_/g, ' ')}</Pill>
                        ) : (
                          <span className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                            <AlertTriangle size={12} /> open
                          </span>
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 text-[12px] grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] uppercase text-[#6b7685] mb-1">Our value</div>
                            <pre className="bg-[#f8fafc] border border-[#dde4ec] rounded p-2 overflow-auto text-[11px]">{b.our_value || '(none)'}</pre>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-[#6b7685] mb-1">Their value</div>
                            <pre className="bg-[#f8fafc] border border-[#dde4ec] rounded p-2 overflow-auto text-[11px]">{b.their_value || '(none)'}</pre>
                          </div>
                          {!b.resolution && (
                            <div className="col-span-2 flex justify-end">
                              <button type="button" onClick={() => setResolving(b)} className="h-8 px-3 rounded bg-[#c2873a] text-white text-[12px] font-semibold">
                                Resolve
                              </button>
                            </div>
                          )}
                          {b.resolution_notes && (
                            <div className="col-span-2 text-[11px] text-[#6b7685]">
                              <span className="font-semibold">Notes:</span> {b.resolution_notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {resolving && (
        <ResolveBreakModal
          prefix={prefix}
          runId={runId}
          breakRow={resolving}
          onClose={() => setResolving(null)}
          onDone={() => { setResolving(null); void load(); onChange?.(); }}
        />
      )}
    </div>
  );
}

function ResolveBreakModal({
  prefix, runId, breakRow, onClose, onDone,
}: {
  prefix: string;
  runId: string;
  breakRow: Break;
  onClose: () => void;
  onDone: () => void;
}) {
  const [resolution, setResolution] = useState('accepted_ours');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      await api.post(`${prefix}/audit/recon/${runId}/breaks/${breakRow.id}/resolve`, {
        resolution, notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[#0f1c2e]">Resolve break</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6b7685] hover:text-[#0f1c2e] text-[20px]">×</button>
        </div>
        <div className="p-5 space-y-3 text-[13px]">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          <div className="text-[12px] text-[#6b7685]">
            <span className="font-mono">{breakRow.external_ref || breakRow.id}</span> · {breakRow.break_type.replace(/_/g, ' ')}
          </div>
          <label className="block">
            <span className="text-[#6b7685]">Resolution</span>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg">
              <option value="accepted_ours">Accepted ours — our record is correct</option>
              <option value="accepted_theirs">Accepted theirs — adjust our record</option>
              <option value="investigating">Investigating — needs more info</option>
              <option value="cancelled">Cancelled — neither party's record stands</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[#6b7685]">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 border border-[#dde4ec] rounded-lg resize-none" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-[#dde4ec] rounded-lg">Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className="px-4 py-2 bg-[#c2873a] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Resolve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AuditEventsModal ────────────────────────────────────────────────────

type AuditEvent = {
  id: string;
  entity_id: string | null;
  event_type: string;
  actor_id: string;
  sequence_no: number;
  content_hash: string;
  prev_hash: string;
  created_at: string;
  payload_json: string;
};

export function AuditEventsModal({ prefix, onClose }: BaseProps) {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`${prefix}/audit/events?limit=200`);
      setRows((r.data?.data || []) as AuditEvent[]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Audit chain — recent events</h3>
            <div className="text-[12px] text-[#6b7685] mt-1">Append-only · SHA-256 chained · most recent first</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6b7685] hover:text-[#0f1c2e] text-[20px]">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {err && <div className="text-[12px] text-red-700 mb-3">{err}</div>}
          {loading ? (
            <div className="text-[13px] text-[#6b7685]">Loading events…</div>
          ) : rows.length === 0 ? (
            <div className="text-[13px] text-[#6b7685]">No events on this chain yet.</div>
          ) : (
            <div className="rounded-lg border border-[#dde4ec] divide-y divide-[#eef2f7]">
              {rows.map((e) => {
                const isOpen = expanded.has(e.id);
                const toggle = () => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(e.id)) next.delete(e.id); else next.add(e.id);
                    return next;
                  });
                };
                let prettyPayload = '';
                try { prettyPayload = JSON.stringify(JSON.parse(e.payload_json), null, 2); } catch { prettyPayload = e.payload_json; }
                return (
                  <div key={e.id}>
                    <button type="button" onClick={toggle} className="w-full px-4 py-2 flex items-center gap-3 hover:bg-[#f8fafc] text-left text-[12px]">
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <span className="font-mono text-[11px] text-[#6b7685] w-12 text-right">#{e.sequence_no}</span>
                      <Pill tone="info">{e.event_type}</Pill>
                      <span className="font-mono text-[10px] text-[#6b7685] truncate flex-1">
                        {(e.entity_id || '').slice(0, 24)}{(e.entity_id || '').length > 24 ? '…' : ''}
                      </span>
                      <span className="text-[10px] text-[#6b7685]">{new Date(e.created_at).toLocaleString()}</span>
                      <span className="font-mono text-[10px] text-[#6b7685]" title={e.content_hash}>{e.content_hash.slice(0, 10)}…</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-3 text-[11px] grid grid-cols-1 gap-2">
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="text-[10px] uppercase text-[#6b7685]">Prev hash</div>
                            <div className="font-mono">{e.prev_hash}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-[#6b7685]">Content hash</div>
                            <div className="font-mono">{e.content_hash}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-[#6b7685] mb-1">Payload</div>
                          <pre className="bg-[#f8fafc] border border-[#dde4ec] rounded p-2 overflow-auto text-[10px] max-h-60">{prettyPayload}</pre>
                        </div>
                        <div className="text-[10px] text-[#6b7685]">Actor: <span className="font-mono">{e.actor_id}</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ExportDetailModal ───────────────────────────────────────────────────

export function ExportDetailModal({
  prefix, exportId, onClose,
}: BaseProps & { exportId: string }) {
  const [manifest, setManifest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get(`${prefix}/audit/exports/${exportId}/manifest`)
      .then((r) => setManifest(r.data?.data || null))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [prefix, exportId]);

  // Construct a CSV download URL the browser hits directly with the auth
  // header. api.get returns JSON; for CSV we need a raw response. Easiest
  // path: open a new tab with the API base + token query param... but we
  // don't expose tokens in URLs. So fetch + Blob.
  const downloadCsv = async () => {
    try {
      const r = await api.get(`${prefix}/audit/exports/${exportId}/csv`, { responseType: 'blob' });
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportId}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'download failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-[#e5ebf2] flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Certified export</h3>
            <div className="text-[12px] text-[#6b7685] mt-1 font-mono">{exportId}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#6b7685] hover:text-[#0f1c2e] text-[20px]">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          {err && <div className="text-[12px] text-red-700">{err}</div>}
          {loading ? (
            <div className="text-[13px] text-[#6b7685]">Loading manifest…</div>
          ) : manifest ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-lg border border-[#dde4ec] bg-white p-3">
                  <div className="text-[10px] uppercase text-[#6b7685]">Profile</div>
                  <div className="font-semibold mt-1">{manifest.format?.profile || '—'}</div>
                </div>
                <div className="rounded-lg border border-[#dde4ec] bg-white p-3">
                  <div className="text-[10px] uppercase text-[#6b7685]">Rows</div>
                  <div className="font-semibold mt-1">{manifest.row_count ?? '—'}</div>
                </div>
                <div className="rounded-lg border border-[#dde4ec] bg-white p-3">
                  <div className="text-[10px] uppercase text-[#6b7685]">Period</div>
                  <div className="font-semibold mt-1">{manifest.from} → {manifest.to}</div>
                </div>
                <div className="rounded-lg border border-[#dde4ec] bg-white p-3">
                  <div className="text-[10px] uppercase text-[#6b7685]">Generated</div>
                  <div className="font-semibold mt-1">{manifest.generated_at ? new Date(manifest.generated_at).toLocaleString() : '—'}</div>
                </div>
              </div>
              <div className="rounded-lg border border-[#dde4ec] bg-white p-3 text-[12px]">
                <div className="text-[10px] uppercase text-[#6b7685]">Chain head at export time</div>
                <div className="font-mono text-[11px] mt-1 break-all">{manifest.chain?.head_hash || '—'}</div>
                <div className="text-[10px] text-[#6b7685] mt-1">Sequence {manifest.chain?.head_sequence ?? '—'}</div>
              </div>
              <div className="rounded-lg border border-[#dde4ec] bg-white p-3 text-[12px]">
                <div className="text-[10px] uppercase text-[#6b7685]">CSV SHA-256</div>
                <div className="font-mono text-[10px] mt-1 break-all">{manifest.csv?.sha256 || '—'}</div>
                <div className="text-[10px] text-[#6b7685] mt-1">{manifest.csv?.bytes?.toLocaleString() || 0} bytes</div>
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
                  <Download size={14} /> Download CSV
                </button>
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[#6b7685]">No manifest data.</div>
          )}
        </div>
      </div>
    </div>
  );
}
