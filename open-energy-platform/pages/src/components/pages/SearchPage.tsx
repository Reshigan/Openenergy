// ════════════════════════════════════════════════════════════════════════
// SearchPage — global cross-entity search results
//
// Wired to GET /api/search?q=… (src/routes/search.ts). Shell bar
// submits here, query lives in URL so deep-linking + browser back work.
// Result rows route by `href` returned by the backend.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Search, Briefcase, FileText, Receipt, Users, Send, Tag, ShieldCheck, LifeBuoy, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';

type Hit = {
  type: 'project' | 'contract' | 'invoice' | 'participant' | 'loi' | 'listing' | 'licence' | 'ticket';
  id: string;
  label: string;
  secondary?: string;
  href: string;
};

const ICONS: Record<Hit['type'], React.ComponentType<{ size?: number }>> = {
  project: Briefcase,
  contract: FileText,
  invoice: Receipt,
  participant: Users,
  loi: Send,
  listing: Tag,
  licence: ShieldCheck,
  ticket: LifeBuoy,
};

const TYPE_LABEL: Record<Hit['type'], string> = {
  project: 'Project',
  contract: 'Contract',
  invoice: 'Invoice',
  participant: 'Participant',
  loi: 'Letter of Intent',
  listing: 'Marketplace listing',
  licence: 'Regulator licence',
  ticket: 'Support ticket',
};

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  // Re-fetch whenever the URL `q` changes. Debounced fetch from the
  // input live-search comes via the form submit (avoids hammering the
  // backend on every keystroke).
  useEffect(() => {
    if (!q || q.length < 2) { setRows([]); return; }
    setLoading(true); setErr(null);
    api.get(`/search?q=${encodeURIComponent(q)}`)
      .then((r) => setRows((r.data?.data?.results || []) as Hit[]))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'search failed'))
      .finally(() => setLoading(false));
  }, [q]);

  const grouped = useMemo(() => {
    const out: Record<string, Hit[]> = {};
    for (const r of rows) {
      (out[r.type] = out[r.type] || []).push(r);
    }
    return out;
  }, [rows]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: input.trim() }, { replace: true });
  };

  return (
    <StitchPage
      eyebrowIcon={Search}
      eyebrowLabel="Search"
      title="Search"
      subtitle="Find any project, contract, invoice, LOI, listing, licence, ticket or participant across the platform."
    >
      <form onSubmit={submit} className="rounded-xl border border-[#dde4ec] bg-white p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7685]" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Project name · Contract title · Invoice number · LOI · Licence · Participant…"
            className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#dde4ec] text-[14px] focus:outline-none focus:border-[#3b82c4]"
          />
        </div>
        <div className="mt-2 text-[11px] text-[#6b7685]">Submit (or press Enter) to search. Click a result to jump.</div>
      </form>

      {err && <div className="text-[12px] text-red-700">{err}</div>}

      {!q ? (
        <EmptyState
          title="Type a query and press Enter"
          description="Search runs against projects, contracts, invoices, LOIs, marketplace listings, regulator licences and (for support/admin) participants + tickets."
        />
      ) : loading ? (
        <Skeleton variant="card" rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No matches for "${q}"`}
          description="Try a shorter substring, an ID, or check that you're authorised to see this entity."
        />
      ) : (
        <div className="space-y-4">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((type) => {
            const Icon = ICONS[type as Hit['type']];
            const items = grouped[type] || [];
            return (
              <section key={String(type)} className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
                <header className="px-4 py-2 border-b border-[#eef2f7] flex items-center gap-2 bg-[#f8fafc]">
                  <Icon size={14} />
                  <h3 className="text-[12px] font-semibold text-[#0f1c2e]">{TYPE_LABEL[type as Hit['type']]}</h3>
                  <span className="text-[10px] text-[#6b7685]">{items.length}</span>
                </header>
                <ul className="divide-y divide-[#eef2f7]">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={r.href}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-[#f8fafc] text-[13px]"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[#0f1c2e] truncate">{r.label || r.id}</span>
                          <span className="block text-[11px] text-[#6b7685] truncate">
                            {r.secondary || ''} · <span className="font-mono">{r.id}</span>
                          </span>
                        </span>
                        <ArrowRight size={14} className="text-[#6b7685]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </StitchPage>
  );
}
