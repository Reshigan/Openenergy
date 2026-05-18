import React, { useEffect, useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { api } from '../../lib/api';

export function TraderWorkstationPage() {
  return (
    <WorkstationShell
      eyebrow="Trader · Workstation"
      title="Trader workstation"
      subtitle="Open orders · Rejections · Exceptions · Margin calls · Audit. Every workflow a trader needs after the order is placed."
      backHref="/trader-risk"
      backLabel="Trader risk"
      tabs={[
        { key: 'orders', label: 'Open orders', body: ({ onRefresh }) => <OrdersTab onRefresh={onRefresh} /> },
        { key: 'rejections', label: 'Rejections', body: () => <RejectionsTab /> },
        { key: 'exceptions', label: 'Post-trade exceptions', body: ({ onRefresh }) => <ExceptionsTab onRefresh={onRefresh} /> },
        { key: 'margin', label: 'Margin calls', body: ({ onRefresh }) => <MarginTab onRefresh={onRefresh} /> },
        { key: 'audit', label: 'Audit & compliance', body: ({ onRefresh }) => <AuditTab onRefresh={onRefresh} /> },
      ]}
    />
  );
}

function OrdersTab({ onRefresh }: { onRefresh: () => void }) {
  const [cancelling, setCancelling] = useState<any | null>(null);
  const [amending, setAmending] = useState<any | null>(null);
  return (
    <div>
      <ListingTable
        endpoint="/trading/orders"
        rowKey={(r) => r.id}
        rowHref={(r) => `/trading/orders/${r.id}`}
        empty={{ title: 'No orders', description: 'Orders you place will appear here. Use the trading desk to submit.' }}
        columns={[
          { key: 'id', label: 'Order', render: (r) => <span className="font-mono text-[11px]">{(r.id || '').slice(0, 12)}…</span> },
          { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
          { key: 'energy_type', label: 'Energy' },
          { key: 'volume_mwh', label: 'Vol (MWh)', align: 'right', render: (r) => `${Number(r.remaining_volume_mwh ?? r.volume_mwh).toFixed(1)} / ${Number(r.volume_mwh).toFixed(1)}` },
          { key: 'price', label: 'Price', align: 'right', render: (r) => r.price != null ? Number(r.price).toFixed(2) : '—' },
          { key: 'delivery_date', label: 'Delivery', render: (r) => r.delivery_date || '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'filled' ? 'good' : r.status === 'cancelled' ? 'bad' : 'warn'}>{(r.status || '').replace(/_/g, ' ')}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            (r.status === 'open' || r.status === 'partially_filled') ? (
              <div className="flex gap-1">
                <button onClick={() => setAmending(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Amend</button>
                <button onClick={() => setCancelling(r)} className="px-2 py-1 text-[11px] bg-red-600 text-white rounded">Cancel</button>
              </div>
            ) : null
          ) },
        ]}
      />
      {cancelling && (
        <ActionModal
          title={`Cancel order ${(cancelling.id || '').slice(0, 12)}…`}
          submitLabel="Cancel order"
          cta="danger"
          fields={[
            { key: 'reason', label: 'Cancellation reason', type: 'textarea', required: true, helperText: 'Audited — keep it specific.' },
          ] as FieldSpec[]}
          onClose={() => setCancelling(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/orders/${cancelling.id}/cancel`, { reason: v.reason });
            setCancelling(null); onRefresh();
          }}
        />
      )}
      {amending && (
        <ActionModal
          title={`Amend order ${(amending.id || '').slice(0, 12)}…`}
          submitLabel="Submit amendment"
          fields={[
            { key: 'price', label: 'New price (blank = keep)', type: 'number', placeholder: String(amending.price ?? '') },
            { key: 'volume_mwh', label: 'New volume MWh (blank = keep)', type: 'number', placeholder: String(amending.volume_mwh ?? '') },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true, helperText: 'Audited — amendments are tracked in order_amendments.' },
          ] as FieldSpec[]}
          onClose={() => setAmending(null)}
          onSubmit={async (v) => {
            const body: any = { reason: v.reason };
            if (v.price) body.price = Number(v.price);
            if (v.volume_mwh) body.volume_mwh = Number(v.volume_mwh);
            await api.post(`/trading/orders/${amending.id}/amend`, body);
            setAmending(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function RejectionsTab() {
  return (
    <ListingTable
      endpoint="/trading/rejections"
      rowKey={(r) => r.id}
      empty={{ title: 'No rejections', description: 'Pre-trade rejections (insufficient credit, halt, stale mark, etc.) land here for review.' }}
      columns={[
        { key: 'attempted_at', label: 'When', render: (r) => new Date(r.attempted_at).toLocaleString() },
        { key: 'side', label: 'Side', render: (r) => <Pill tone={r.side === 'buy' ? 'info' : 'neutral'}>{r.side}</Pill> },
        { key: 'energy_type', label: 'Energy' },
        { key: 'volume_mwh', label: 'Vol', align: 'right', render: (r) => Number(r.volume_mwh).toFixed(1) },
        { key: 'price_zar_mwh', label: 'Price', align: 'right', render: (r) => r.price_zar_mwh != null ? Number(r.price_zar_mwh).toFixed(2) : '—' },
        { key: 'reason_code', label: 'Reason', render: (r) => <Pill tone="bad">{(r.reason_code || '').replace(/_/g, ' ')}</Pill> },
        { key: '_explain', label: '', render: (r) => <ExplainButton id={r.id} /> },
      ]}
    />
  );
}

function ExplainButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/trading/rejections/${id}/explain`);
      setData(r.data?.data || null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally { setLoading(false); }
  };
  return (
    <>
      <button onClick={() => { setOpen(true); if (!data) void load(); }} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">AI: why?</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-[#e5ebf2]">
              <h3 className="text-[16px] font-semibold text-[#0f1c2e]">Why was this rejected?</h3>
            </div>
            <div className="p-5 text-[13px] space-y-3">
              {loading && <div className="text-[#6b7685]">Loading…</div>}
              {err && <div className="text-red-700">{err}</div>}
              {data && (
                <>
                  <p className="leading-relaxed">{data.explanation || data.summary || '—'}</p>
                  {Array.isArray(data.remediations) && data.remediations.length > 0 && (
                    <div className="rounded-lg bg-[#f8fafc] p-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-[#6b7685]">Suggested next steps</div>
                      {data.remediations.map((rem: any, i: number) => (
                        <div key={i} className="text-[12px]">• {rem.label || rem.title || rem}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExceptionsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setFiling(true)} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + File exception
        </button>
      </div>
      <ListingTable
        endpoint="/trading/exceptions"
        rowKey={(r) => r.id}
        empty={{ title: 'No exceptions', description: 'Post-trade mismatches (price, volume, settlement) appear here for triage.' }}
        columns={[
          { key: 'reported_at', label: 'When', render: (r) => new Date(r.reported_at).toLocaleString() },
          { key: 'match_id', label: 'Match', render: (r) => <span className="font-mono text-[11px]">{(r.match_id || '').slice(0, 12)}…</span> },
          { key: 'exception_type', label: 'Type', render: (r) => <Pill tone="info">{(r.exception_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'critical' ? 'bad' : r.severity === 'high' ? 'warn' : 'neutral'}>{r.severity}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'resolved' && r.status !== 'rejected' ? (
              <button onClick={() => setTransitioning(r)} className="px-2 py-1 text-[11px] bg-[#1a3a5c] text-white rounded">Transition</button>
            ) : null
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File post-trade exception"
          submitLabel="File"
          fields={[
            { key: 'match_id', label: 'Match ID', required: true, placeholder: 'match_…' },
            { key: 'exception_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'price_mismatch', label: 'Price mismatch' },
              { value: 'volume_mismatch', label: 'Volume mismatch' },
              { value: 'settlement_dispute', label: 'Settlement dispute' },
              { value: 'unmatched', label: 'Unmatched' },
              { value: 'duplicate', label: 'Duplicate' },
              { value: 'other', label: 'Other' },
            ] },
            { key: 'severity', label: 'Severity', type: 'select', required: true, options: [
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
            { key: 'expected_value', label: 'Expected value (optional)' },
            { key: 'actual_value', label: 'Actual value (optional)' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/trading/exceptions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Exception transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: [
              { value: 'investigating', label: 'Investigating' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'rejected', label: 'Rejected' },
            ] },
            { key: 'outcome', label: 'Outcome (resolved/rejected)', type: 'select', options: [
              { value: 'adjusted', label: 'Adjusted' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'no_action', label: 'No action' },
            ] },
            { key: 'notes', label: 'Notes (≥3 chars on terminal transitions)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/exceptions/${transitioning.id}/transition`, v);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MarginTab({ onRefresh }: { onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const runScan = async () => {
    setRunning(true);
    try {
      await api.post('/trader-risk/margin-calls/run', {});
      onRefresh();
    } catch {
      // Best-effort — non-risk-officer roles get a 403 and that's fine.
    } finally { setRunning(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={runScan} disabled={running} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
          {running ? 'Running…' : 'Run margin scan'}
        </button>
      </div>
      <ListingTable
        endpoint="/trader-risk/margin-calls"
        rowKey={(r) => r.id}
        empty={{ title: 'No margin calls', description: 'When exposure exceeds posted collateral, calls land here with a due-by timestamp.' }}
        columns={[
          { key: 'as_of', label: 'As of', render: (r) => new Date(r.as_of).toLocaleString() },
          { key: 'exposure_zar', label: 'Exposure', align: 'right', render: (r) => Number(r.exposure_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'initial_margin_zar', label: 'IM', align: 'right', render: (r) => Number(r.initial_margin_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'posted_collateral_zar', label: 'Posted', align: 'right', render: (r) => Number(r.posted_collateral_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'shortfall_zar', label: 'Shortfall', align: 'right', render: (r) => <span className="text-red-700 font-semibold">{Number(r.shortfall_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span> },
          { key: 'due_by', label: 'Due by', render: (r) => r.due_by ? new Date(r.due_by).toLocaleString() : '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'met' ? 'good' : r.status === 'defaulted' ? 'bad' : 'warn'}>{r.status}</Pill> },
        ]}
      />
    </div>
  );
}

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

function AuditTab({ onRefresh }: { onRefresh: () => void }) {
  const [head, setHead] = useState<ChainHead | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [recon, setRecon] = useState<string | null>(null);
  const [reconResult, setReconResult] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get("/trading/audit/head")
      .then((r) => setHead((r.data?.data || null) as ChainHead | null))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "failed"));
  }, [onRefresh]);

  const runVerify = async () => {
    setVerifying(true); setVerifyResult(null); setErr(null);
    try {
      const r = await api.post("/trading/audit/verify", {});
      setVerifyResult(r.data?.data as VerifyResult);
      const headR = await api.get("/trading/audit/head");
      setHead((headR.data?.data || null) as ChainHead | null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "verify failed");
    } finally { setVerifying(false); }
  };

  const runExport = async () => {
    setExporting(true); setErr(null);
    try {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
      await api.post("/trading/audit/export", { from, to });
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "export failed");
    } finally { setExporting(false); }
  };

  const runRecon = async () => {
    if (!recon || recon.trim().length < 10) { setErr("Paste a CSV first"); return; }
    setReconResult(null); setErr(null);
    try {
      const r = await api.post("/trading/audit/recon", { source: "counterparty", csv: recon });
      setReconResult(r.data?.data || null);
      onRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "recon failed");
    }
  };

  return (
    <div className="space-y-4">
      {err && <div className="text-[12px] text-red-700">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Chain head (sequence)</div>
          <div className="text-[20px] font-semibold text-[#0f1c2e] mt-1">{head?.head_sequence ?? 0}</div>
          <div className="text-[10px] text-[#6b7685] mt-1 font-mono">{(head?.head_hash || "—").slice(0, 16)}...</div>
        </div>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Last verified</div>
          <div className="text-[15px] font-semibold text-[#0f1c2e] mt-1">
            {head?.last_verified_at ? new Date(head.last_verified_at).toLocaleString() : "—"}
          </div>
          <div className="text-[10px] text-[#6b7685] mt-1">at seq {head?.last_verified_seq ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Chain updated</div>
          <div className="text-[15px] font-semibold text-[#0f1c2e] mt-1">
            {head?.updated_at ? new Date(head.updated_at).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={runVerify} disabled={verifying}
          className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-50">
          {verifying ? "Verifying..." : "Verify chain integrity"}
        </button>
        <button onClick={runExport} disabled={exporting}
          className="h-9 px-3 rounded-md bg-white border border-[#dde4ec] text-[12px] font-semibold disabled:opacity-50">
          {exporting ? "Generating..." : "Generate certified export (last 90 days)"}
        </button>
      </div>

      {verifyResult && (
        <div className={`rounded-xl border p-4 text-[13px] ${verifyResult.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <div className="font-semibold mb-1">
            {verifyResult.ok
              ? `Chain verified: ${verifyResult.scanned} events, ${verifyResult.duration_ms} ms`
              : `Divergence detected at seq ${verifyResult.first_divergence_seq}`}
          </div>
          <div className="text-[11px] font-mono text-[#6b7685]">head: {(verifyResult.head_hash || "").slice(0, 32)}...</div>
        </div>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Recent certified exports</h3>
        <ListingTable
          endpoint="/trading/audit/exports"
          rowKey={(r) => r.id}
          empty={{ title: "No exports yet", description: "Click “Generate certified export” to create a NERSA-shape trade register backed by the audit chain head." }}
          columns={[
            { key: "generated_at", label: "When", render: (r) => new Date(r.generated_at).toLocaleString() },
            { key: "from_ts", label: "Period", render: (r) => `${r.from_ts} → ${r.to_ts}` },
            { key: "row_count", label: "Rows", align: "right" },
            { key: "chain_head_hash", label: "Chain head", render: (r) => <span className="font-mono text-[10px]">{(r.chain_head_hash || "").slice(0, 12)}…</span> },
            { key: "csv_r2_key", label: "R2 key", render: (r) => <span className="font-mono text-[10px]">{r.csv_r2_key}</span> },
          ]}
        />
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Counterparty reconciliation</h3>
        <div className="rounded-xl border border-[#dde4ec] bg-white p-4 space-y-3">
          <p className="text-[12px] text-[#6b7685]">
            Paste a CSV of the counterparty’s trades against us. Required columns:
            <span className="font-mono"> external_ref, matched_at, energy_type, volume_mwh, price_zar_mwh</span>.
          </p>
          <textarea value={recon || ""} onChange={(e) => setRecon(e.target.value)} rows={5}
            className="w-full px-3 py-2 border border-[#dde4ec] rounded-lg text-[12px] font-mono"
            placeholder="external_ref,matched_at,energy_type,volume_mwh,price_zar_mwh
ABC123,2026-05-17T12:00:00Z,solar,1.5,985.00" />
          <button onClick={runRecon} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
            Run reconciliation
          </button>
          {reconResult && (
            <div className="text-[12px] mt-2">
              Run <span className="font-mono">{reconResult.run_id}</span>: {reconResult.matched_count}/{reconResult.row_count} matched, <span className="text-red-700">{reconResult.break_count} breaks</span>
            </div>
          )}
        </div>
        <div className="mt-3">
          <ListingTable
            endpoint="/trading/audit/recon"
            rowKey={(r) => r.id}
            empty={{ title: "No reconciliation runs", description: "Upload a counterparty CSV to compare their view of trades against ours." }}
            columns={[
              { key: "started_at", label: "When", render: (r) => new Date(r.started_at).toLocaleString() },
              { key: "source", label: "Source", render: (r) => <Pill tone="info">{r.source}</Pill> },
              { key: "row_count", label: "Rows", align: "right" },
              { key: "matched_count", label: "Matched", align: "right" },
              { key: "break_count", label: "Breaks", align: "right", render: (r) => <Pill tone={r.break_count > 0 ? "bad" : "good"}>{r.break_count}</Pill> },
              { key: "status", label: "Status", render: (r) => <Pill tone={r.status === "complete" ? "good" : "warn"}>{r.status}</Pill> },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
