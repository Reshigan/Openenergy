// ════════════════════════════════════════════════════════════════════════
// PublicAuditPage — /audit (public, no auth)
//
// Tamper-evident audit transparency:
//   • Published Merkle roots — one per (entity_type, day)
//   • Generate an inclusion proof for any audit event ID
//   • Verify a leaf hash + proof against an expected root client-side
//
// Built against the /api/public/audit/* pub router exposed by audit-l5.ts.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Hash, FileSearch, CheckCircle2, AlertCircle, Search } from 'lucide-react';

type Root = {
  entity_type: string; day: string; event_count: number;
  merkle_root: string; platform_signature?: string | null;
  attestor_id?: string | null; attestor_signature?: string | null;
};
type Proof = {
  event: { id: string; entity_type: string; sequence_no: number; day: string; content_hash: string };
  proof_path: Array<{ sibling: string; side: 'L' | 'R' }>;
  computed_root: string;
  published_root: string | null;
  platform_signature: string | null;
  matches: boolean;
};

export function PublicAuditPage() {
  const [roots, setRoots] = useState<Root[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [tab, setTab] = useState<'roots' | 'proof' | 'verify'>('roots');

  useEffect(() => {
    void fetch('/api/public/audit/merkle/roots?days=60')
      .then((r) => r.json())
      .then((j) => j.success && setRoots(j.data || []))
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return roots;
    const q = filter.toLowerCase();
    return roots.filter((r) => r.entity_type.toLowerCase().includes(q) || r.day.includes(q));
  }, [roots, filter]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="p-6 lg:p-10 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1 mb-2">
            <ShieldCheck size={12} /> Transparency · public audit
          </div>
          <h1 className="font-display text-[28px] font-bold tracking-tight leading-tight" style={{ color: 'var(--oe-on-surface)' }}>
            Public audit transparency
          </h1>
          <p className="text-[13px] text-[#3d4756] mt-1 max-w-3xl">
            Hash-chained, Ed25519-signed Merkle roots, optionally co-signed by independent attestors. Generate and verify inclusion proofs without trusting the platform.
          </p>
        </div>
      </header>

      <nav className="bg-white border-b border-[#dde4ec]">
        <div className="max-w-5xl mx-auto px-6 lg:px-10 flex flex-wrap gap-1 py-2">
          {([
            ['roots', 'Published roots', Hash],
            ['proof', 'Generate proof', FileSearch],
            ['verify', 'Verify proof', CheckCircle2],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5 ${
                tab === key ? 'bg-[#1a3a5c] text-white' : 'text-[#0f1c2e] hover:bg-[#eef2f7]'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-6 lg:p-10 space-y-4">
        {tab === 'roots' && <RootsTable rows={filtered} filter={filter} setFilter={setFilter} />}
        {tab === 'proof' && <ProofPanel />}
        {tab === 'verify' && <VerifyPanel />}

        <footer className="text-center text-[11px] text-[#6b7685] pt-2">
          Consolidated Energy Cockpit · transparency log · oe.vantax.co.za
        </footer>
      </main>
    </div>
  );
}

function RootsTable({ rows, filter, setFilter }: { rows: Root[]; filter: string; setFilter: (v: string) => void }) {
  return (
    <section className="widget-card">
      <header className="widget-card-header flex items-center gap-2">
        <div className="widget-card-title">Published Merkle roots</div>
        <span className="text-[11px] text-[#6b7685]">— last 60 days</span>
        <div className="ml-auto inline-flex items-center gap-1 h-8 px-2 rounded border border-[#dde4ec] bg-white">
          <Search size={12} className="text-[#6b7685]"/>
          <input className="text-[11px] outline-none w-40" placeholder="entity or YYYY-MM-DD" value={filter} onChange={(e) => setFilter(e.target.value)}/>
        </div>
      </header>
      <div className="p-3 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#6b7685]">
              <th className="py-1">Day</th>
              <th className="py-1">Entity</th>
              <th className="py-1 text-right">Events</th>
              <th className="py-1">Merkle root</th>
              <th className="py-1 text-center">Signed</th>
              <th className="py-1 text-center">Attested</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-2 italic text-[#6b7685]">No roots published yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={`${r.day}/${r.entity_type}`} className="border-t border-[#eef2f7]">
                <td className="py-2 font-mono">{r.day}</td>
                <td className="py-2 font-mono">{r.entity_type}</td>
                <td className="py-2 text-right font-mono">{r.event_count}</td>
                <td className="py-2 font-mono text-[10px] break-all max-w-md">{r.merkle_root}</td>
                <td className="py-2 text-center">{r.platform_signature ? <CheckCircle2 size={13} className="inline text-[#1a8a5b]"/> : <span className="text-[#c0392b]">—</span>}</td>
                <td className="py-2 text-center">{r.attestor_signature ? <CheckCircle2 size={13} className="inline text-[#1a8a5b]"/> : <span className="text-[#6b7685]">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProofPanel() {
  const [evtId, setEvtId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [proof, setProof] = useState<Proof | null>(null);

  const run = async () => {
    if (!evtId) return;
    setBusy(true); setErr(null); setProof(null);
    try {
      const r = await fetch(`/api/public/audit/proof/${encodeURIComponent(evtId)}`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'proof failed');
      setProof(j.data);
    } catch (e: any) {
      setErr(e?.message || 'proof failed');
    } finally { setBusy(false); }
  };

  return (
    <section className="widget-card p-4 space-y-3">
      <div className="text-[13px] font-semibold text-[#0f1c2e]">Generate inclusion proof</div>
      <p className="text-[12px] text-[#3a4658]">
        Provide the audit event ID returned by any platform mutation. The proof path lets a third party verify the event
        was included in the day's published Merkle root, without trusting the platform.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-semibold text-[#3a4658]">
          Event ID
          <input className="mt-1 block w-96 max-w-full h-9 px-2 rounded border border-[#dde4ec] text-[12px] font-mono"
                 placeholder="audit_xxxxxxxxxx"
                 value={evtId} onChange={(e) => setEvtId(e.target.value)}/>
        </label>
        <button disabled={!evtId || busy} onClick={run}
                className="h-9 px-4 rounded bg-[#0f1c2e] text-white text-[12px] font-semibold disabled:opacity-50">
          {busy ? 'Computing…' : 'Generate proof'}
        </button>
      </div>
      {err && <div className="text-[12px] flex items-center gap-1 text-[#c0392b]"><AlertCircle size={14}/> {err}</div>}
      {proof && (
        <div className="space-y-2 text-[12px]">
          <div className="rounded bg-[#f8fafc] border border-[#eef2f7] p-3">
            <div className="text-[11px] uppercase text-[#6b7685]">Event</div>
            <div className="font-mono break-all">{proof.event.id}</div>
            <div className="text-[11px] text-[#6b7685] mt-1">entity={proof.event.entity_type} · seq={proof.event.sequence_no} · day={proof.event.day}</div>
            <div className="text-[11px] text-[#6b7685] mt-1">leaf hash:</div>
            <div className="font-mono text-[10px] break-all">{proof.event.content_hash}</div>
          </div>
          <div className="rounded bg-[#f8fafc] border border-[#eef2f7] p-3">
            <div className="text-[11px] uppercase text-[#6b7685]">Computed root</div>
            <div className="font-mono text-[10px] break-all">{proof.computed_root}</div>
            <div className="text-[11px] uppercase text-[#6b7685] mt-2">Published root</div>
            <div className="font-mono text-[10px] break-all">{proof.published_root || '— not yet published'}</div>
            <div className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold ${proof.matches ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
              {proof.matches ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
              {proof.matches ? 'Computed root matches published root' : 'Mismatch — published root may not be available yet'}
            </div>
          </div>
          <details className="rounded bg-[#f8fafc] border border-[#eef2f7] p-3">
            <summary className="cursor-pointer text-[12px] font-semibold">Proof path ({proof.proof_path.length} siblings)</summary>
            <pre className="text-[10px] mt-2 whitespace-pre-wrap break-all">{JSON.stringify(proof.proof_path, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}

function VerifyPanel() {
  const [leaf, setLeaf] = useState('');
  const [root, setRoot] = useState('');
  const [pathJson, setPathJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ matches: boolean; signature_valid: boolean | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null); setOut(null);
    try {
      const parsed = JSON.parse(pathJson || '[]');
      const r = await fetch('/api/public/audit/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaf_hash: leaf, proof_path: parsed, expected_root: root }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'verify failed');
      setOut(j.data);
    } catch (e: any) {
      setErr(e?.message || 'verify failed');
    } finally { setBusy(false); }
  };

  return (
    <section className="widget-card p-4 space-y-3">
      <div className="text-[13px] font-semibold text-[#0f1c2e]">Verify a proof</div>
      <p className="text-[12px] text-[#3a4658]">
        Paste a leaf hash, proof path, and expected root. The platform recomputes the path purely from inputs — useful
        if you've cached an earlier proof and want to confirm it still matches the published root.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[11px] font-semibold text-[#3a4658] md:col-span-2">
          Leaf hash
          <input className="mt-1 w-full h-9 px-2 rounded border border-[#dde4ec] text-[11px] font-mono"
                 value={leaf} onChange={(e) => setLeaf(e.target.value)}/>
        </label>
        <label className="text-[11px] font-semibold text-[#3a4658] md:col-span-2">
          Expected root
          <input className="mt-1 w-full h-9 px-2 rounded border border-[#dde4ec] text-[11px] font-mono"
                 value={root} onChange={(e) => setRoot(e.target.value)}/>
        </label>
        <label className="text-[11px] font-semibold text-[#3a4658] md:col-span-2">
          Proof path (JSON)
          <textarea rows={6} className="mt-1 w-full p-2 rounded border border-[#dde4ec] text-[11px] font-mono"
                 placeholder='[{"sibling": "...", "side": "R"}]'
                 value={pathJson} onChange={(e) => setPathJson(e.target.value)}/>
        </label>
      </div>
      {err && <div className="text-[12px] flex items-center gap-1 text-[#c0392b]"><AlertCircle size={14}/> {err}</div>}
      {out && (
        <div className={`rounded p-3 text-[12px] ${out.matches ? 'bg-[#e6f5ee] border border-[#bde7d2]' : 'bg-[#fbe9e6] border border-[#f5c4bb]'}`}>
          <div className={`inline-flex items-center gap-1 font-semibold ${out.matches ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
            {out.matches ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
            {out.matches ? 'Proof valid' : 'Proof invalid'}
          </div>
          {out.signature_valid != null && (
            <div className={`mt-1 inline-flex items-center gap-1 text-[11px] ${out.signature_valid ? 'text-[#1a8a5b]' : 'text-[#c0392b]'}`}>
              {out.signature_valid ? 'Platform signature OK' : 'Platform signature invalid'}
            </div>
          )}
        </div>
      )}
      <button disabled={!leaf || !root || !pathJson || busy} onClick={run}
              className="h-9 px-4 rounded bg-[#0f1c2e] text-white text-[12px] font-semibold disabled:opacity-50">
        {busy ? 'Verifying…' : 'Verify'}
      </button>
    </section>
  );
}
