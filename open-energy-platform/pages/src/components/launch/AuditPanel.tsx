// ════════════════════════════════════════════════════════════════════════
// AuditPanel — shared L5 audit/export/recon UI primitive.
//
// Every L5 feature surface gets the same three-section panel:
//   1. Chain status (head sequence, head hash, last verified)
//   2. Certified export (button + recent-exports listing)
//   3. External reconciliation (CSV paste + run history)
//
// Caller wires it to a feature by passing the endpoint prefix and the
// expected CSV-column hint for reconciliation. The endpoint contract:
//   GET  {prefix}/audit/head             → { data: { head_hash, head_sequence, last_verified_at } }
//   POST {prefix}/audit/verify           → { data: { ok, scanned, head_hash, first_divergence_seq, duration_ms } }
//   POST {prefix}/audit/export {from,to} → { data: { export_id, row_count } }
//   GET  {prefix}/audit/exports          → list
//   POST {prefix}/audit/recon {source,csv} → { data: { run_id, row_count, matched_count, break_count } }
//   GET  {prefix}/audit/recon            → list
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { ListingTable, Pill } from './WorkstationShell';
import { ErrorBanner } from '../ErrorBanner';
import { api } from '../../lib/api';
import { ReconBreaksModal, AuditEventsModal, ExportDetailModal } from './AuditDrillIns';
import { ListTree } from 'lucide-react';

type ChainHead = {
  entity_type: string;
  head_hash: string;
  head_sequence: number;
  updated_at: string;
  last_verified_at: string | null;
  last_verified_seq: number | null;
};

type VerifyResult = {
  ok: boolean;
  scanned: number;
  head_hash: string | null;
  head_sequence: number;
  first_divergence_seq: number | null;
  duration_ms: number;
};

export function AuditPanel({
  prefix,
  reconHint,
  reconSourceOptions = ['counterparty', 'bank', 'verra', 'eskom'],
  onChange,
}: {
  prefix: string;
  reconHint: string;
  reconSourceOptions?: string[];
  onChange?: () => void;
}) {
  const [head, setHead] = useState<ChainHead | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reconCsv, setReconCsv] = useState('');
  const [reconSource, setReconSource] = useState(reconSourceOptions[0]);
  const [reconResult, setReconResult] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  const [showEvents, setShowEvents] = useState(false);
  const [openReconRun, setOpenReconRun] = useState<string | null>(null);
  const [openExport, setOpenExport] = useState<string | null>(null);

  const reload = () => { setBump((n) => n + 1); onChange?.(); };

  useEffect(() => {
    api.get(`${prefix}/audit/head`)
      .then((r) => setHead((r.data?.data || null) as ChainHead | null))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'));
  }, [prefix, bump]);

  const runVerify = async () => {
    setVerifying(true); setVerifyResult(null); setErr(null);
    try {
      const r = await api.post(`${prefix}/audit/verify`, {});
      setVerifyResult(r.data?.data as VerifyResult);
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'verify failed');
    } finally { setVerifying(false); }
  };

  const runExport = async () => {
    setExporting(true); setErr(null);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
      await api.post(`${prefix}/audit/export`, { from, to });
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'export failed');
    } finally { setExporting(false); }
  };

  const runRecon = async () => {
    if (!reconCsv || reconCsv.trim().length < 10) { setErr('Paste a CSV first'); return; }
    setReconResult(null); setErr(null);
    try {
      const r = await api.post(`${prefix}/audit/recon`, { source: reconSource, csv: reconCsv });
      setReconResult(r.data?.data || null);
      reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'recon failed');
    }
  };

  return (
    <div className="space-y-4">
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Chain head (sequence)</div>
          <div className="text-[20px] font-semibold text-[var(--ink, #0f1c2e)] mt-1">{head?.head_sequence ?? 0}</div>
          <div className="text-[10px] text-[var(--ink-2, #6b7685)] mt-1 font-mono">{(head?.head_hash || '—').slice(0, 16)}…</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Last verified</div>
          <div className="text-[15px] font-semibold text-[var(--ink, #0f1c2e)] mt-1">
            {head?.last_verified_at ? new Date(head.last_verified_at).toLocaleString() : '—'}
          </div>
          <div className="text-[10px] text-[var(--ink-2, #6b7685)] mt-1">at seq {head?.last_verified_seq ?? '—'}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-2, #6b7685)]">Chain updated</div>
          <div className="text-[15px] font-semibold text-[var(--ink, #0f1c2e)] mt-1">
            {head?.updated_at ? new Date(head.updated_at).toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={runVerify} disabled={verifying}
          className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold disabled:opacity-50">
          {verifying ? 'Verifying…' : 'Verify chain integrity'}
        </button>
        <button type="button" onClick={runExport} disabled={exporting}
          className="h-9 px-3 rounded-md bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] text-[12px] font-semibold disabled:opacity-50">
          {exporting ? 'Generating…' : 'Generate certified export (last 90 days)'}
        </button>
        <button type="button" onClick={() => setShowEvents(true)}
          className="h-9 px-3 rounded-md bg-surface-v2 border border-[var(--border-subtle, #dde4ec)] text-[12px] font-semibold inline-flex items-center gap-2">
          <ListTree size={14} /> View chain events
        </button>
      </div>

      {verifyResult && (
        <div className={`rounded-xl border p-4 text-[13px] ${verifyResult.ok ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="font-semibold mb-1">
            {verifyResult.ok
              ? `Chain verified: ${verifyResult.scanned} events, ${verifyResult.duration_ms} ms`
              : `Divergence detected at seq ${verifyResult.first_divergence_seq}`}
          </div>
          <div className="text-[11px] font-mono text-[var(--ink-2, #6b7685)]">head: {(verifyResult.head_hash || '').slice(0, 32)}…</div>
        </div>
      )}

      <section key={`exports-${bump}`}>
        <h3 className="text-[13px] font-semibold text-[var(--ink-2, #3d4756)] mb-2">Recent certified exports</h3>
        <ListingTable
          endpoint={`${prefix}/audit/exports`}
          rowKey={(r) => r.id}
          rowOnClick={(r) => setOpenExport(r.id)}
          empty={{ title: 'No exports yet', description: 'Click “Generate certified export” to create a regulator-shape register backed by the audit chain head.' }}
          columns={[
            { key: 'generated_at', label: 'When', render: (r) => new Date(r.generated_at).toLocaleString() },
            { key: 'from_ts', label: 'Period', render: (r) => `${r.from_ts} → ${r.to_ts}` },
            { key: 'row_count', label: 'Rows', align: 'right' },
            { key: 'chain_head_hash', label: 'Chain head', render: (r) => <span className="font-mono text-[10px]">{(r.chain_head_hash || '').slice(0, 12)}…</span> },
            { key: 'csv_r2_key', label: 'R2 key', render: (r) => <span className="font-mono text-[10px]">{r.csv_r2_key}</span> },
          ]}
        />
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-[var(--ink-2, #3d4756)] mb-2">External reconciliation</h3>
        <div className="rounded-xl border border-[var(--border-subtle, #dde4ec)] bg-surface-v2 p-4 space-y-3">
          <p className="text-[12px] text-[var(--ink-2, #6b7685)]">
            Paste a CSV from an external source. Required columns: <span className="font-mono">{reconHint}</span>.
          </p>
          <div className="flex items-end gap-3">
            <label className="block text-[13px]">
              <span className="text-[var(--ink-2, #6b7685)]">Source</span>
              <select value={reconSource} onChange={(e) => setReconSource(e.target.value)}
                className="mt-1 h-9 px-3 border border-[var(--border-subtle, #dde4ec)] rounded-md text-[13px]">
                {reconSourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <textarea value={reconCsv} onChange={(e) => setReconCsv(e.target.value)} rows={5}
            className="w-full px-3 py-2 border border-[var(--border-subtle, #dde4ec)] rounded-lg text-[12px] font-mono"
            placeholder={reconHint} />
          <button type="button" onClick={runRecon} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
            Run reconciliation
          </button>
          {reconResult && (
            <div className="text-[12px] mt-2">
              Run <span className="font-mono">{reconResult.run_id}</span>: {reconResult.matched_count}/{reconResult.row_count} matched, <span className="text-red-700">{reconResult.break_count} breaks</span>
            </div>
          )}
        </div>
        <div className="mt-3" key={`recon-${bump}`}>
          <ListingTable
            endpoint={`${prefix}/audit/recon`}
            rowKey={(r) => r.id}
            rowOnClick={(r) => setOpenReconRun(r.id)}
            empty={{ title: 'No reconciliation runs', description: 'Upload an external CSV to compare their view against ours.' }}
            columns={[
              { key: 'started_at', label: 'When', render: (r) => new Date(r.started_at).toLocaleString() },
              { key: 'source', label: 'Source', render: (r) => <Pill tone="info">{r.source}</Pill> },
              { key: 'row_count', label: 'Rows', align: 'right' },
              { key: 'matched_count', label: 'Matched', align: 'right' },
              { key: 'break_count', label: 'Breaks', align: 'right', render: (r) => <Pill tone={r.break_count > 0 ? 'bad' : 'good'}>{r.break_count}</Pill> },
              { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'complete' ? 'good' : 'warn'}>{r.status}</Pill> },
            ]}
          />
        </div>
      </section>

      {showEvents && (
        <AuditEventsModal prefix={prefix} onClose={() => setShowEvents(false)} />
      )}
      {openReconRun && (
        <ReconBreaksModal
          prefix={prefix}
          runId={openReconRun}
          onClose={() => setOpenReconRun(null)}
          onChange={reload}
        />
      )}
      {openExport && (
        <ExportDetailModal prefix={prefix} exportId={openExport} onClose={() => setOpenExport(null)} />
      )}
    </div>
  );
}
