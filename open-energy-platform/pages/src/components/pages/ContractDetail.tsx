import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Download, FileSignature, ShieldCheck, AlertTriangle,
  CheckCircle2, Clock, Scale, FileText, Loader2, Send,
} from 'lucide-react';
import { api } from '../../lib/api';
import jsPDF from 'jspdf';

type Contract = {
  id: string;
  title: string;
  document_type: string;
  phase: string;
  creator_id: string;
  counterparty_id: string;
  creator_name?: string | null;
  creator_company?: string | null;
  counterparty_name?: string | null;
  counterparty_company?: string | null;
  project_id?: string | null;
  commercial_terms?: string | null;
  version?: string;
  created_at?: string;
  updated_at?: string;
};

type Template = {
  id: string;
  code: string;
  name: string;
  category: string;
  document_type: string;
  description?: string | null;
  jurisdiction?: string | null;
  governing_law?: string | null;
  sa_law_references?: string | null;
  version?: string | null;
};

type Signatory = {
  id: string;
  document_id: string;
  participant_id: string;
  signatory_name?: string | null;
  signatory_designation?: string | null;
  signed: number;
  signed_at?: string | null;
  document_hash_at_signing?: string | null;
  participant_name?: string | null;
  participant_company?: string | null;
};

type RenderedResponse = {
  contract: Contract;
  template: Template | null;
  commercial_terms: Record<string, unknown>;
  rendered_body: string;
  signatories: Signatory[];
  current_user_id: string;
  can_sign: boolean;
};

const phaseColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  loi: 'bg-blue-100 text-blue-700',
  term_sheet: 'bg-indigo-100 text-indigo-700',
  hoa: 'bg-purple-100 text-purple-700',
  draft_agreement: 'bg-violet-100 text-violet-700',
  legal_review: 'bg-orange-100 text-orange-700',
  statutory_check: 'bg-amber-100 text-amber-700',
  execution: 'bg-teal-100 text-teal-700',
  active: 'bg-green-100 text-green-700',
  amended: 'bg-cyan-100 text-cyan-700',
  terminated: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-600',
};

function renderMarkdownLite(src: string): React.ReactNode[] {
  // Minimal markdown renderer for: headings (# ## ###), bold (**x**), lists (- ), blank lines.
  const blocks = src.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const b = block.trim();
    if (/^#\s/.test(b)) {
      return (
        <h1 key={i} className="text-[22px] font-bold text-gray-900 mt-6 mb-3 tracking-tight">
          {renderInline(b.replace(/^#\s+/, ''))}
        </h1>
      );
    }
    if (/^##\s/.test(b)) {
      return (
        <h2 key={i} className="text-[17px] font-bold text-gray-900 mt-5 mb-2">
          {renderInline(b.replace(/^##\s+/, ''))}
        </h2>
      );
    }
    if (/^###\s/.test(b)) {
      return (
        <h3 key={i} className="text-[15px] font-semibold text-gray-900 mt-4 mb-2">
          {renderInline(b.replace(/^###\s+/, ''))}
        </h3>
      );
    }
    if (/^(-|\*)\s/.test(b)) {
      const items = b.split(/\n/).filter(Boolean).map((l) => l.replace(/^(-|\*)\s+/, ''));
      return (
        <ul key={i} className="list-disc pl-6 text-[13.5px] leading-[1.6] text-gray-800 my-3 space-y-1">
          {items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}
        </ul>
      );
    }
    return (
      <p key={i} className="text-[13.5px] leading-[1.7] text-gray-800 my-3 whitespace-pre-wrap">
        {renderInline(b)}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Bold **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<RenderedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [agree, setAgree] = useState(false);
  const [phaseChanging, setPhaseChanging] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/contracts/${id}/rendered`);
      setData(res.data?.data as RenderedResponse);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Failed to load contract');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const mySignatory = useMemo(() => {
    if (!data) return null;
    return data.signatories.find((s) => s.participant_id === data.current_user_id) || null;
  }, [data]);

  const allSigned = useMemo(() => {
    if (!data || !data.signatories.length) return false;
    return data.signatories.every((s) => s.signed === 1);
  }, [data]);

  const sign = async () => {
    if (!id || !typedName.trim() || !agree) return;
    setSigning(true);
    try {
      // Compute a simple hash for integrity demo
      const payload = `${id}:${typedName}:${Date.now()}`;
      const hash = Array.from(new TextEncoder().encode(payload))
        .reduce((h, b) => (h * 31 + b) >>> 0, 0x811c9dc5)
        .toString(16);
      await api.post(`/contracts/${id}/sign`, {
        document_hash: `sha256:${hash}`,
        signature_r2_key: `signatures/${id}/${typedName.replace(/\s+/g, '_')}.png`,
      });
      setSignOpen(false);
      setTypedName('');
      setAgree(false);
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Sign failed');
    } finally {
      setSigning(false);
    }
  };

  const advancePhase = async (nextPhase: string) => {
    if (!id) return;
    setPhaseChanging(true);
    try {
      await api.post(`/contracts/${id}/phase`, { phase: nextPhase });
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || 'Phase change failed');
    } finally {
      setPhaseChanging(false);
    }
  };

  const downloadPdf = () => {
    if (!data) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 56;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineWidth = pageWidth - margin * 2;

    // Header band
    doc.setFillColor(10, 110, 209);
    doc.rect(0, 0, pageWidth, 48, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('OPEN ENERGY PLATFORM — CONTRACT', margin, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`ID ${data.contract.id}  ·  v${data.contract.version || 'v1.0'}  ·  ${data.contract.phase.toUpperCase()}`, pageWidth - margin, 30, { align: 'right' });

    doc.setTextColor(20, 20, 20);
    let y = 84;
    const writeLine = (text: string, opts?: { bold?: boolean; size?: number; spaceAfter?: number }) => {
      const size = opts?.size ?? 10;
      doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const wrapped = doc.splitTextToSize(text, lineWidth);
      for (const line of wrapped) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += size * 1.35;
      }
      y += opts?.spaceAfter ?? 4;
    };

    writeLine(data.contract.title, { bold: true, size: 16, spaceAfter: 8 });
    if (data.template) {
      writeLine(`Template: ${data.template.name} (${data.template.code})`, { size: 9, spaceAfter: 2 });
      writeLine(`Governing law: ${data.template.governing_law || 'Laws of the Republic of South Africa'}`, { size: 9, spaceAfter: 2 });
      if (data.template.sa_law_references) {
        writeLine(`Statutory references: ${data.template.sa_law_references}`, { size: 9, spaceAfter: 8 });
      }
    }

    writeLine(`Parties: ${data.contract.creator_company || data.contract.creator_name} (Seller) and ${data.contract.counterparty_company || data.contract.counterparty_name} (Buyer).`, { size: 10, spaceAfter: 10 });

    // Body
    const body = data.rendered_body;
    const paragraphs = body.split(/\n{2,}/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const cleaned = trimmed
        .replace(/^#\s+/, '')
        .replace(/^##\s+/, '')
        .replace(/^###\s+/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1');
      const isHeading = /^#+\s/.test(trimmed);
      writeLine(cleaned, { bold: isHeading, size: isHeading ? 12 : 10, spaceAfter: isHeading ? 6 : 6 });
    }

    // Signatures block
    y += 10;
    if (y > pageHeight - 200) { doc.addPage(); y = margin; }
    writeLine('SIGNATURES', { bold: true, size: 12, spaceAfter: 8 });
    for (const s of data.signatories) {
      const who = s.participant_company || s.participant_name || s.signatory_name || s.participant_id;
      if (s.signed) {
        writeLine(`✓ Signed by ${who} — ${s.signatory_designation || 'Authorised signatory'} on ${s.signed_at?.slice(0, 10)}`, { bold: true, size: 10, spaceAfter: 2 });
        writeLine(`   Integrity hash at signing: ${s.document_hash_at_signing || s.id}`, { size: 8, spaceAfter: 6 });
      } else {
        writeLine(`[ ] ${who} — ${s.signatory_designation || 'Authorised signatory'}`, { size: 10, spaceAfter: 6 });
      }
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated by Open Energy Platform · ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC · Jurisdiction: ${data.template?.jurisdiction || 'South Africa'}`, margin, pageHeight - 24);

    doc.save(`${data.contract.id}-${data.contract.title.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.pdf`);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading contract…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/contracts')} className="text-sm text-blue-600 flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to contracts
        </button>
        <div className="rounded-xl border p-6 bg-red-50 border-red-200 text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5" />
          <div>
            <div className="font-semibold">Unable to load contract</div>
            <div className="text-sm mt-1">{error || 'Unknown error'}</div>
          </div>
        </div>
      </div>
    );
  }

  const { contract, template, signatories } = data;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/contracts')} className="text-sm text-blue-600 flex items-center gap-1 hover:underline">
          <ArrowLeft className="w-4 h-4" /> All contracts
        </button>
        <div className="flex items-center gap-2">
          <button onClick={downloadPdf} className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm hover:bg-gray-50">
            <Download className="w-4 h-4" /> Download PDF
          </button>
          {mySignatory && !mySignatory.signed && data.can_sign && (
            <button onClick={() => setSignOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-[#0a6ed1] text-white rounded-md text-sm hover:bg-[#0854a0]">
              <FileSignature className="w-4 h-4" /> Sign now
            </button>
          )}
        </div>
      </div>

      {/* Object page header */}
      <section
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: '#e5e5e5', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)', color: '#fff' }}
            >
              <FileText className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-2 mb-1">
                <h1 className="text-[22px] font-bold text-gray-900 truncate">{contract.title}</h1>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${phaseColors[contract.phase] || 'bg-gray-100 text-gray-700'}`}>
                  {contract.phase.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>ID: <span className="font-mono text-xs">{contract.id}</span></span>
                <span>Type: {contract.document_type.replace(/_/g, ' ')}</span>
                {template && <span>Template: {template.code}</span>}
                <span>Version: {contract.version || 'v1.0'}</span>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Seller" value={contract.creator_company || contract.creator_name || '—'} />
            <KpiTile label="Buyer" value={contract.counterparty_company || contract.counterparty_name || '—'} />
            <KpiTile label="Signatories signed" value={`${signatories.filter((s) => s.signed).length} / ${signatories.length}`} />
            <KpiTile label="Jurisdiction" value={template?.jurisdiction || 'South Africa'} />
          </div>

          {/* Status alerts */}
          {allSigned && (
            <div className="mt-4 flex items-start gap-3 rounded-md p-3 border" style={{ background: '#e5f7ec', borderColor: '#bde5cb', color: '#0a5a28' }}>
              <CheckCircle2 className="w-5 h-5 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">Fully executed</div>
                <div className="text-xs mt-0.5">All signatories have signed. Downstream cascade events (invoicing, action queue) have been fired.</div>
              </div>
            </div>
          )}
          {mySignatory && !mySignatory.signed && (
            <div className="mt-4 flex items-start gap-3 rounded-md p-3 border" style={{ background: '#fef3e6', borderColor: '#f6c99a', color: '#7a3f05' }}>
              <FileSignature className="w-5 h-5 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sm">You are a signatory on this contract</div>
                <div className="text-xs mt-0.5">Review the document below and use "Sign now" when you're ready.</div>
              </div>
              <button onClick={() => setSignOpen(true)} className="text-xs font-semibold px-2.5 py-1 bg-[#e9730c] text-white rounded hover:bg-[#c75f08]">
                Sign now
              </button>
            </div>
          )}
        </div>

        {/* Template info strip */}
        {template && (
          <div className="px-5 sm:px-6 py-3 border-t bg-gray-50" style={{ borderColor: '#ebebeb' }}>
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-xs text-gray-700">
              <div className="flex items-start gap-2"><Scale className="w-4 h-4 mt-0.5 text-[#0a6ed1]" /><span><span className="font-semibold">Governing law:</span> {template.governing_law || 'Laws of the Republic of South Africa'}</span></div>
              {template.sa_law_references && (
                <div className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 mt-0.5 text-[#107e3e]" /><span><span className="font-semibold">SA references:</span> {template.sa_law_references}</span></div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Signatory roster */}
      <section className="rounded-xl border bg-white p-5 sm:p-6" style={{ borderColor: '#e5e5e5' }}>
        <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Signatories</h2>
        {signatories.length === 0 ? (
          <p className="text-sm text-gray-500">No signatories registered for this contract yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: '#f0f1f2' }}>
            {signatories.map((s) => (
              <li key={s.id} className="py-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: s.signed ? '#e5f7ec' : '#eef1f4',
                    color: s.signed ? '#107e3e' : '#6a6d70',
                  }}
                >
                  {s.signed ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">
                    {s.signatory_name || s.participant_name || s.participant_id}
                  </div>
                  <div className="text-xs text-gray-600">
                    {s.signatory_designation || 'Authorised signatory'}
                    {s.participant_company ? ` · ${s.participant_company}` : ''}
                  </div>
                </div>
                <div className="text-xs text-right shrink-0">
                  {s.signed ? (
                    <>
                      <div className="font-semibold text-[#107e3e]">Signed</div>
                      <div className="text-gray-500">{s.signed_at?.slice(0, 10)}</div>
                    </>
                  ) : (
                    <div className="text-[#b04e0f] font-semibold">Awaiting</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Document body */}
      <section className="rounded-xl border bg-white p-6 sm:p-8" style={{ borderColor: '#e5e5e5' }}>
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Document body</div>
        <article className="prose prose-sm max-w-none">
          {renderMarkdownLite(data.rendered_body)}
        </article>
      </section>

      {/* Phase advance actions */}
      {data.can_sign && !allSigned && (
        <section className="rounded-xl border bg-white p-5 sm:p-6" style={{ borderColor: '#e5e5e5' }}>
          <h3 className="text-[14px] font-semibold text-gray-900 mb-3">Lifecycle actions</h3>
          <div className="flex flex-wrap gap-2">
            {['legal_review', 'statutory_check', 'execution', 'active'].filter((p) => p !== contract.phase).map((p) => (
              <button
                key={p}
                onClick={() => advancePhase(p)}
                disabled={phaseChanging}
                className="text-xs font-semibold px-3 py-1.5 rounded-md border hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: '#ccc', color: '#32363a' }}
              >
                <Send className="w-3 h-3 inline mr-1" /> Move to {p.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">Moving phase fires a cascade event and notifies the counterparty.</p>
        </section>
      )}

      {/* Sign modal */}
      {signOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Sign this contract</h3>
            <p className="text-xs text-gray-600 mb-4">
              By signing you confirm you are authorised to bind {data.contract.counterparty_company || data.contract.counterparty_name} or {data.contract.creator_company || data.contract.creator_name} (as applicable) and that you have read the document in full.
            </p>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Type your full name to sign</label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="First Last"
              className="w-full px-3 py-2 border rounded-md text-sm font-serif italic"
              style={{ borderColor: '#ccc' }}
            />
            <label className="flex items-start gap-2 mt-3 text-xs text-gray-700">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              <span>I confirm this electronic signature constitutes a legally binding signature under the Electronic Communications and Transactions Act 25 of 2002, and that an integrity hash will be stored alongside this signature.</span>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setSignOpen(false); setTypedName(''); setAgree(false); }} className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={sign}
                disabled={!typedName.trim() || !agree || signing}
                className="px-4 py-1.5 bg-[#0a6ed1] text-white rounded-md text-sm font-semibold flex items-center gap-2 disabled:opacity-50 hover:bg-[#0854a0]"
              >
                {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                {signing ? 'Signing…' : 'Sign contract'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: '#e5e5e5', background: '#fafbfc' }}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className="text-[13px] font-semibold text-gray-900 mt-1 break-words">{value}</div>
    </div>
  );
}

export default ContractDetail;
