// ════════════════════════════════════════════════════════════════════════
// DocumentsPage — /documents
//
// Three tabs:
//   • Templates  — browse + raise a new envelope from a published template
//   • Envelopes  — my envelopes (raised or signing role) + status
//   • Detail     — selected envelope: rendered body, signatories, sign
//
// Signing uses /api/polish/signatures with the envelope's document_hash,
// then POSTs /api/documents/envelopes/:id/mark-signed.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { FileSignature, FileText, Send, CheckCircle2, AlertCircle, Inbox, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Template = {
  id: string; template_key: string; display_name: string; category: string;
  jurisdiction: string | null; version: number; status: string;
  variables_json: string; required_signatories_json: string;
};
type TemplateDetail = Template & { body_md: string };
type Envelope = {
  id: string; template_id: string; raised_by: string; raised_at: string;
  body_rendered: string; signatories_json: string; status: string;
  document_hash: string; completed_at: string | null;
};
type Sig = { id: string; signer_id: string; signer_role: string | null; signed_at: string; signing_method: string };

type Tab = 'templates' | 'envelopes';

export function DocumentsPage() {
  const [tab, setTab] = useState<Tab>('envelopes');
  return (
    <StitchPage
      eyebrowIcon={FileSignature}
      eyebrowLabel="Documents · contracts & signing"
      title="Document templates & envelopes"
      subtitle="Issue parameterised contracts, route them for signature, and verify completed envelopes."
    >
      <div className="flex flex-wrap gap-1 mb-3 border-b" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
        {([
          ['envelopes', 'Envelopes', Inbox],
          ['templates', 'Templates', FileText],
        ] as const).map(([k, label, Icon]) => (
          <button type="button" key={k} onClick={() => setTab(k)}
            className="h-9 px-3 text-[12px] font-semibold inline-flex items-center gap-1.5 border-b-2 -mb-px"
            style={tab === k
              ? { borderColor: 'oklch(0.46 0.16 55)', color: 'oklch(0.46 0.16 55)' }
              : { borderColor: 'transparent', color: 'oklch(0.60 0.007 250)' }}>
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>
      {tab === 'envelopes' && <EnvelopesTab/>}
      {tab === 'templates' && <TemplatesTab/>}
    </StitchPage>
  );
}

// ─── Templates tab ──────────────────────────────────────────────────────
function TemplatesTab() {
  const [rows, setRows] = useState<Template[]>([]);
  const [raising, setRaising] = useState<Template | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get('/documents/templates');
      if (r.data?.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-3">
      <div className="text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{rows.length} published templates</div>
      {err && <div className="text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}>{err}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((t) => (
          <div key={t.id} className="widget-card p-4">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'oklch(0.60 0.007 250)' }}>{t.category}{t.jurisdiction ? ` · ${t.jurisdiction}` : ''}</div>
            <div className="font-semibold text-[14px]" style={{ color: 'oklch(0.17 0.010 250)' }}>{t.display_name}</div>
            <div className="text-[11px] font-mono" style={{ color: 'oklch(0.60 0.007 250)' }}>{t.template_key} · v{t.version}</div>
            <button type="button" onClick={() => setRaising(t)}
              className="mt-3 h-8 px-3 rounded text-white text-[11px] font-semibold inline-flex items-center gap-1"
              style={{ background: 'oklch(0.46 0.16 55)' }}>
              <Plus size={12}/> Raise envelope
            </button>
          </div>
        ))}
        {rows.length === 0 && <div className="md:col-span-3 p-6 text-center text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>No templates published yet.</div>}
      </div>
      {raising && <RaiseEnvelopeModal template={raising} onClose={() => setRaising(null)} onCreated={() => { setRaising(null); }}/>}
    </section>
  );
}

function RaiseEnvelopeModal({ template, onClose, onCreated }: { template: Template; onClose: () => void; onCreated: () => void }) {
  const variables = useMemo(() => {
    try { return JSON.parse(template.variables_json) as Array<{ key: string; desc?: string }>; }
    catch { return []; }
  }, [template]);
  const sigs = useMemo(() => {
    try { return JSON.parse(template.required_signatories_json) as Array<{ role: string; label: string }>; }
    catch { return []; }
  }, [template]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [signatories, setSignatories] = useState<string[]>(sigs.map(() => ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null); setAck(null);
    try {
      const r = await api.post('/documents/envelopes', {
        template_id: template.id,
        variables: vals,
        signatories: signatories.map((id) => ({ participant_id: id })),
      });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Envelope ${r.data.data.id} created`);
      onCreated();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'failed'); }
    finally { setBusy(false); }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'oklch(0.99 0.002 80)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <div>
            <div className="text-[11px] uppercase" style={{ color: 'oklch(0.60 0.007 250)' }}>Raise envelope</div>
            <div className="font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{template.display_name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-[12px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Variables</div>
          {variables.map((v) => (
            <label key={v.key} className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>
              {v.key}
              {v.desc && <span className="font-normal ml-1" style={{ color: 'oklch(0.60 0.007 250)' }}>— {v.desc}</span>}
              <input className="mt-1 w-full h-8 px-2 rounded border text-[12px]"
                     style={{ borderColor: 'oklch(0.87 0.006 250)' }}
                     value={vals[v.key] || ''}
                     onChange={(e) => setVals({ ...vals, [v.key]: e.target.value })}/>
            </label>
          ))}
          <div className="text-[12px] font-semibold mt-3" style={{ color: 'oklch(0.17 0.010 250)' }}>Signatories ({sigs.length})</div>
          {sigs.map((s, i) => (
            <label key={i} className="block text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>
              {s.label} <span className="font-normal" style={{ color: 'oklch(0.60 0.007 250)' }}>({s.role})</span>
              <input placeholder="participant_id" className="mt-1 w-full h-8 px-2 rounded border text-[12px] font-mono"
                     style={{ borderColor: 'oklch(0.87 0.006 250)' }}
                     value={signatories[i] || ''}
                     onChange={(e) => {
                       const next = [...signatories]; next[i] = e.target.value; setSignatories(next);
                     }}/>
            </label>
          ))}
          {err && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.48 0.20 20)' }}><AlertCircle size={13}/> {err}</div>}
          {ack && <div className="text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.45 0.15 150)' }}><CheckCircle2 size={13}/> {ack}</div>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <button type="button" onClick={onClose} className="h-8 px-3 text-[12px]" style={{ color: 'oklch(0.40 0.009 250)' }}>Cancel</button>
          <button type="button" disabled={busy} onClick={submit}
                  className="h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-50"
                  style={{ background: 'oklch(0.46 0.16 55)' }}>
            {busy ? 'Creating…' : 'Create envelope'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Envelopes tab ──────────────────────────────────────────────────────
function EnvelopesTab() {
  const [rows, setRows] = useState<Envelope[]>([]);
  const [selected, setSelected] = useState<Envelope | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get('/documents/envelopes');
      if (r.data?.success) setRows(r.data.data || []);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'load failed'); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="space-y-3">
      <div className="text-[12px]" style={{ color: 'oklch(0.60 0.007 250)' }}>{rows.length} envelopes visible to you</div>
      {err && <div className="text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}>{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left border-b" style={{ color: 'oklch(0.60 0.007 250)', borderColor: 'oklch(0.87 0.006 250)' }}>
              <th className="py-1.5">Raised</th>
              <th className="py-1.5">ID</th>
              <th className="py-1.5">Status</th>
              <th className="py-1.5">Signatories</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              let sigCount = 0; let signed = 0;
              try {
                const s = JSON.parse(e.signatories_json) as Array<{ signed_at: string | null }>;
                sigCount = s.length; signed = s.filter((x) => x.signed_at).length;
              } catch { /* empty */ }
              return (
                <tr key={e.id} className="border-b" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
                  <td className="py-1.5 font-mono">{new Date(e.raised_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</td>
                  <td className="py-1.5 font-mono">{e.id}</td>
                  <td className="py-1.5"><span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{ background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)' }}>{e.status}</span></td>
                  <td className="py-1.5">{signed}/{sigCount}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => setSelected(e)} className="text-[11px] underline" style={{ color: 'oklch(0.46 0.16 55)' }}>Open</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="py-2 italic" style={{ color: 'oklch(0.60 0.007 250)' }}>No envelopes yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && <EnvelopeDetail envelope={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); void load(); }}/>}
    </section>
  );
}

function EnvelopeDetail({ envelope, onClose, onChanged }: { envelope: Envelope; onClose: () => void; onChanged: () => void }) {
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await api.get(`/documents/envelopes/${encodeURIComponent(envelope.id)}`);
      if (r.data?.success) setSigs(r.data.data.signatures || []);
    } catch { /* ignore */ }
  };
  useEffect(() => { void load(); }, [envelope.id]);

  const sign = async () => {
    setBusy(true); setErr(null); setAck(null);
    try {
      // 1) record Ed25519 signature against the envelope hash
      const sigR = await api.post('/polish/signatures', {
        document_kind: 'envelope',
        document_ref: envelope.id,
        document_hash: envelope.document_hash,
      });
      if (!sigR.data.success) throw new Error(sigR.data.error || 'signature failed');
      // 2) tell the envelope router that this caller has signed
      const mR = await api.post(`/documents/envelopes/${encodeURIComponent(envelope.id)}/mark-signed`);
      if (!mR.data.success) throw new Error(mR.data.error || 'mark failed');
      setAck(mR.data.data?.all_signed ? 'Final signature — envelope completed' : 'Signature recorded');
      onChanged();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to sign.');
      else setErr(data?.error || e?.message || 'sign failed');
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    const reason = window.prompt('Cancellation reason?');
    if (!reason) return;
    setBusy(true);
    try {
      await api.post(`/documents/envelopes/${encodeURIComponent(envelope.id)}/cancel`, { reason });
      onChanged();
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'cancel failed'); }
    finally { setBusy(false); }
  };

  let signatoryList: Array<{ label: string; role: string; participant_id: string; signed_at: string | null }> = [];
  try { signatoryList = JSON.parse(envelope.signatories_json); } catch { /* empty */ }

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto" style={{ background: 'oklch(0.99 0.002 80)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <div>
            <div className="text-[11px] uppercase" style={{ color: 'oklch(0.60 0.007 250)' }}>Envelope · {envelope.status}</div>
            <div className="font-mono text-[12px]" style={{ color: 'oklch(0.17 0.010 250)' }}>{envelope.id}</div>
            <div className="text-[10px] font-mono break-all" style={{ color: 'oklch(0.60 0.007 250)' }}>hash: {envelope.document_hash}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16}/></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <div className="text-[12px] font-semibold mb-1" style={{ color: 'oklch(0.17 0.010 250)' }}>Rendered document</div>
            <pre className="rounded p-3 text-[11px] whitespace-pre-wrap max-h-72 overflow-y-auto border"
                 style={{ background: 'oklch(0.96 0.003 250)', borderColor: 'oklch(0.87 0.006 250)' }}>{envelope.body_rendered}</pre>
          </div>
          <div>
            <div className="text-[12px] font-semibold mb-1" style={{ color: 'oklch(0.17 0.010 250)' }}>Signatories</div>
            <ul className="text-[12px]" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
              {signatoryList.map((s, i) => (
                <li key={i} className="py-2 flex items-center gap-2 border-t" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
                  <span className="font-semibold">{s.label}</span>
                  <span style={{ color: 'oklch(0.60 0.007 250)' }}>({s.role})</span>
                  <span className="font-mono text-[11px] ml-2">{s.participant_id || '—'}</span>
                  {s.signed_at
                    ? <span className="ml-auto text-[11px] inline-flex items-center gap-1" style={{ color: 'oklch(0.45 0.15 150)' }}><CheckCircle2 size={12}/> {new Date(s.signed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</span>
                    : <span className="ml-auto text-[11px]" style={{ color: 'oklch(0.60 0.007 250)' }}>pending</span>}
                </li>
              ))}
            </ul>
          </div>
          {sigs.length > 0 && (
            <details className="text-[11px]">
              <summary className="cursor-pointer" style={{ color: 'oklch(0.60 0.007 250)' }}>Cryptographic signatures ({sigs.length})</summary>
              <ul className="mt-2">
                {sigs.map((s) => (
                  <li key={s.id} className="py-1 font-mono border-t" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
                    {s.signer_id} · {s.signing_method} · {new Date(s.signed_at).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {err && <div className="text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
          {ack && <div className="text-[12px]" style={{ color: 'oklch(0.45 0.15 150)' }}><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
          <button type="button" onClick={cancel} className="h-8 px-3 text-[12px]" style={{ color: 'oklch(0.48 0.20 20)' }}>Cancel envelope</button>
          <button type="button" disabled={busy || envelope.status === 'completed' || envelope.status === 'cancelled'} onClick={sign}
                  className="h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                  style={{ background: 'oklch(0.46 0.16 55)' }}>
            <Send size={12}/> {busy ? 'Signing…' : 'Sign'}
          </button>
        </div>
      </div>
    </div>
  );
}
