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
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';

// ── design tokens ────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

type Hit = {
  type: 'project' | 'contract' | 'invoice' | 'participant' | 'loi' | 'listing' | 'licence' | 'ticket';
  id: string;
  label: string;
  secondary?: string;
  href: string;
};

const ICONS: Record<Hit['type'], React.ComponentType<{ size?: number; color?: string }>> = {
  project:     Briefcase,
  contract:    FileText,
  invoice:     Receipt,
  participant: Users,
  loi:         Send,
  listing:     Tag,
  licence:     ShieldCheck,
  ticket:      LifeBuoy,
};

const TYPE_LABEL: Record<Hit['type'], string> = {
  project:     'Project',
  contract:    'Contract',
  invoice:     'Invoice',
  participant: 'Participant',
  loi:         'Letter of Intent',
  listing:     'Marketplace listing',
  licence:     'Regulator licence',
  ticket:      'Support ticket',
};

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [rows, setRows] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const totalHits = rows.length;
  const typeCount = Object.keys(grouped).length;

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
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Search</h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Find any project, contract, invoice, LOI, listing, licence, ticket or participant across the platform.
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Results</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{totalHits}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Entity types</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>{typeCount}</div>
          </div>
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', flex: 1 }}>
            <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Query</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: q ? TX1 : TX3, fontFamily: MONO, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {q || '—'}
            </div>
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{ background: BAD_BG, border: `1px solid ${BAD}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: BAD }}>
            {err}
          </div>
        )}

        {/* Results area */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {(Object.keys(grouped) as Array<Hit['type']>).map((type) => {
              const Icon = ICONS[type];
              const items = grouped[type] || [];
              return (
                <div key={type} style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px',
                    borderBottom: `1px solid ${BORDER}`,
                    background: BG2,
                  }}>
                    <Icon size={14} color={TX2} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {TYPE_LABEL[type]}
                    </span>
                    <span style={{
                      background: ACC_BG, color: ACC,
                      padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      marginLeft: 4,
                    }}>
                      {items.length}
                    </span>
                  </div>

                  {/* Rows */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {items.map((r, i) => (
                        <tr
                          key={r.id}
                          style={{ borderBottom: i < items.length - 1 ? `1px solid ${BORDER}` : 'none', background: i % 2 === 1 ? BG2 : 'transparent' }}
                        >
                          <td style={{ padding: '10px 16px' }}>
                            <Link
                              to={r.href}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
                            >
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', color: TX1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.label || r.id}
                                </span>
                                <span style={{ display: 'block', fontSize: 11, color: TX3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.secondary ? `${r.secondary} · ` : ''}
                                  <span style={{ fontFamily: MONO }}>{r.id}</span>
                                </span>
                              </span>
                              <ArrowRight size={14} color={TX3} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
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
        {/* Search form */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Search
          </div>
          <form onSubmit={submit}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TX3, pointerEvents: 'none' }} />
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Project · Contract · Invoice · LOI…"
                style={{
                  width: '100%',
                  height: 38,
                  paddingLeft: 34,
                  paddingRight: 12,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  background: BG,
                  fontSize: 13,
                  color: TX1,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                marginTop: 10,
                width: '100%',
                background: ACC,
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Search
            </button>
            <div style={{ marginTop: 8, fontSize: 11, color: TX3 }}>
              Press Enter or click Search. Click a result to navigate.
            </div>
          </form>
        </div>

        {/* Entity type summary */}
        {rows.length > 0 && (
          <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.keys(grouped) as Array<Hit['type']>).map((type) => {
                const Icon = ICONS[type];
                const count = grouped[type]?.length || 0;
                const pct = totalHits > 0 ? Math.round((count / totalHits) * 100) : 0;
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={13} color={TX3} />
                    <span style={{ flex: 1, fontSize: 12, color: TX2 }}>{TYPE_LABEL[type]}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: TX1, fontWeight: 600 }}>{count}</span>
                    <span style={{ fontSize: 11, color: TX3, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scope hint */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Scope
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(Object.keys(TYPE_LABEL) as Array<Hit['type']>).map((type) => {
              const Icon = ICONS[type];
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={12} color={TX3} />
                  <span style={{ fontSize: 12, color: TX3 }}>{TYPE_LABEL[type]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchPage;
