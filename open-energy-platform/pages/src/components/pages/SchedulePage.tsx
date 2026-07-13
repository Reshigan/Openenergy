// ════════════════════════════════════════════════════════════════════════
// SchedulePage — /schedule
//
// Cross-entity calendar of things due in the next N days: invoices,
// milestones, insurance expiries, licence expiries, planned outages,
// tariff hearings. Filterable by source. Backed by /api/schedule.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Receipt, Briefcase, ShieldCheck, Zap, Gavel, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';
import { EmptyState } from '../EmptyState';
import { Skeleton } from '../Skeleton';

type Item = {
  source:
    | 'invoice_payable' | 'invoice_receivable' | 'milestone'
    | 'insurance' | 'licence' | 'outage' | 'tariff_hearing';
  id: string;
  label: string;
  secondary?: string;
  due_date: string;
  href: string;
  severity: 'overdue' | 'soon' | 'normal';
};

const SOURCE_LABEL: Record<Item['source'], string> = {
  invoice_payable: 'Invoice to pay',
  invoice_receivable: 'Invoice to receive',
  milestone: 'Project milestone',
  insurance: 'Insurance expiry',
  licence: 'Licence expiry',
  outage: 'Planned outage',
  tariff_hearing: 'Tariff hearing',
};

const SOURCE_ICON: Record<Item['source'], React.ComponentType<{ size?: number; className?: string }>> = {
  invoice_payable: Receipt,
  invoice_receivable: Receipt,
  milestone: Briefcase,
  insurance: ShieldCheck,
  licence: ShieldCheck,
  outage: Zap,
  tariff_hearing: Gavel,
};

const SEVERITY_STYLE: Record<string, React.CSSProperties> = {
  overdue: { background: 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, oklch(0.97 0.04 20)))', color: 'var(--bad, oklch(0.48 0.20 20))', border: '1px solid var(--bad, oklch(0.85 0.10 20))' },
  soon: { background: 'color-mix(in oklch, var(--warn, oklch(0.65 0.18 75)) 14%, var(--s1, oklch(0.97 0.04 55)))', color: 'var(--accent, oklch(0.46 0.16 55))', border: '1px solid var(--warn, oklch(0.85 0.10 55))' },
  normal: { background: 'var(--s2, oklch(0.94 0.004 250))', color: 'var(--ink-2, oklch(0.40 0.009 250))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' },
};

export function SchedulePage() {
  const [days, setDays] = useState(90);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Item['source'] | 'all'>('all');

  useEffect(() => {
    setLoading(true); setErr(null);
    api.get(`/schedule?days=${days}`)
      .then((r) => setItems((r.data?.data?.items || []) as Item[]))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setLoading(false));
  }, [days]);

  const visible = useMemo(
    () => filter === 'all' ? items : items.filter((i) => i.source === filter),
    [items, filter],
  );

  // Group by day for the agenda view.
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of visible) {
      const k = it.due_date;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.source] = (c[it.source] || 0) + 1;
    return c;
  }, [items]);

  return (
    <StitchPage
      eyebrowIcon={Calendar}
      eyebrowLabel="Schedule"
      title="Upcoming deadlines"
      subtitle={`Everything due across your portfolio in the next ${days} days — invoices, milestones, insurance, licences, outages, hearings.`}
      actions={
        <div className="inline-flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--s1, oklch(0.99 0.002 80))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
          {[30, 60, 90, 180].map((n) => (
            <button type="button" key={n} onClick={() => setDays(n)}
              className="h-8 px-3 rounded-md text-[12px] font-semibold"
              style={days === n
                ? { background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff' }
                : { color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
              {n}d
            </button>
          ))}
        </div>
      }
    >
      {/* Source filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => setFilter('all')}
          className="h-8 px-3 rounded-full text-[11px] font-semibold"
          style={filter === 'all'
            ? { background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff', border: '1px solid var(--accent, oklch(0.46 0.16 55))' }
            : { background: 'var(--s1, oklch(0.99 0.002 80))', color: 'var(--ink-2, oklch(0.40 0.009 250))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
          All <span className="opacity-70 ml-1">{counts.all || 0}</span>
        </button>
        {(Object.keys(SOURCE_LABEL) as Item['source'][]).map((s) => {
          if (!counts[s]) return null;
          const Icon = SOURCE_ICON[s];
          return (
            <button type="button" key={s} onClick={() => setFilter(s)}
              className="h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1"
              style={filter === s
                ? { background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff', border: '1px solid var(--accent, oklch(0.46 0.16 55))' }
                : { background: 'var(--s1, oklch(0.99 0.002 80))', color: 'var(--ink-2, oklch(0.40 0.009 250))', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}>
              <Icon size={12} /> {SOURCE_LABEL[s]} <span className="opacity-70">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      {err && <div className="text-[12px]" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>{err}</div>}

      {loading ? (
        <Skeleton variant="card" rows={8} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={`Nothing due in the next ${days} days`}
          description="When invoices, milestones, insurance renewals or licence expiries enter this window they'll appear here."
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, dayItems]) => {
            const d = new Date(day + 'T00:00:00');
            const todayStr = new Date().toISOString().slice(0, 10);
            const isOverdue = day < todayStr;
            const isToday = day === todayStr;
            return (
              <section key={day} className="overflow-hidden" style={{ borderRadius: '12px', border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', background: 'var(--s1, oklch(0.99 0.002 80))' }}>
                <header className="px-4 py-2 flex items-center gap-3"
                  style={{
                    borderBottom: '1px solid var(--border-subtle, oklch(0.91 0.005 250))',
                    background: isOverdue
                      ? 'color-mix(in oklch, var(--bad, oklch(0.55 0.22 25)) 14%, var(--s1, oklch(0.97 0.04 20)))'
                      : isToday
                        ? 'var(--s2, oklch(0.95 0.02 250))'
                        : 'var(--s1, oklch(0.97 0.003 250))',
                  }}>
                  <Calendar size={14} style={{ color: isOverdue ? 'var(--bad, oklch(0.48 0.20 20))' : 'var(--accent, oklch(0.46 0.16 55))' }} />
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>
                    {d.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <span className="text-[11px]" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>
                  {isOverdue && <span className="ml-auto text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertTriangle size={12} /> Overdue</span>}
                  {isToday && <span className="ml-auto text-[11px] font-semibold" style={{ color: 'var(--accent, oklch(0.46 0.16 55))' }}>Today</span>}
                </header>
                <ul>
                  {dayItems.map((it) => {
                    const Icon = SOURCE_ICON[it.source];
                    return (
                      <li key={`${it.source}-${it.id}`} style={{ borderTop: '1px solid var(--border-subtle, oklch(0.91 0.005 250))' }}>
                        <Link to={it.href} className="flex items-center gap-3 px-4 py-2 text-[13px]" style={{ color: 'inherit' }}>
                          <span className="flex-shrink-0" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))', display: 'flex' }}><Icon size={14} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>{it.label}</span>
                            <span className="block text-[11px] truncate" style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }}>{SOURCE_LABEL[it.source]}{it.secondary ? ` · ${it.secondary}` : ''}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold" style={SEVERITY_STYLE[it.severity]}>
                            {it.severity}
                          </span>
                          <ArrowRight size={14} style={{ color: 'var(--ink-2, oklch(0.60 0.007 250))' }} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </StitchPage>
  );
}
