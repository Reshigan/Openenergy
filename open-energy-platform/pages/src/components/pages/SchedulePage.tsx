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

const SOURCE_TONE: Record<string, string> = {
  overdue: 'bg-[#fde0db] text-[#c0392b] border-[#f4a39a]',
  soon: 'bg-[#fef3e6] text-[#b04e0f] border-[#f6c99a]',
  normal: 'bg-[#eef2f7] text-[#3d4756] border-[#dde4ec]',
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
        <div className="inline-flex items-center gap-1 bg-white border border-[#dde4ec] rounded-lg p-1">
          {[30, 60, 90, 180].map((n) => (
            <button type="button" key={n} onClick={() => setDays(n)}
              className={`h-8 px-3 rounded-md text-[12px] font-semibold ${days === n ? 'bg-[#c2873a] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'}`}>
              {n}d
            </button>
          ))}
        </div>
      }
    >
      {/* Source filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => setFilter('all')}
          className={`h-8 px-3 rounded-full text-[11px] font-semibold border ${filter === 'all' ? 'bg-[#c2873a] text-white border-[#1a3a5c]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>
          All <span className="opacity-70 ml-1">{counts.all || 0}</span>
        </button>
        {(Object.keys(SOURCE_LABEL) as Item['source'][]).map((s) => {
          if (!counts[s]) return null;
          const Icon = SOURCE_ICON[s];
          return (
            <button type="button" key={s} onClick={() => setFilter(s)}
              className={`h-8 px-3 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1 ${filter === s ? 'bg-[#c2873a] text-white border-[#1a3a5c]' : 'bg-white text-[#3d4756] border-[#dde4ec]'}`}>
              <Icon size={12} /> {SOURCE_LABEL[s]} <span className="opacity-70">{counts[s]}</span>
            </button>
          );
        })}
      </div>

      {err && <div className="text-[12px] text-red-700">{err}</div>}

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
              <section key={day} className="rounded-xl border border-[#dde4ec] bg-white overflow-hidden">
                <header className={`px-4 py-2 border-b border-[#eef2f7] flex items-center gap-3 ${isOverdue ? 'bg-[#fde0db]' : isToday ? 'bg-[#dbecfb]' : 'bg-[#f8fafc]'}`}>
                  <Calendar size={14} className={isOverdue ? 'text-[#c0392b]' : 'text-[#1a3a5c]'} />
                  <div className="text-[13px] font-semibold">
                    {d.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  <span className="text-[11px] text-[#6b7685]">{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>
                  {isOverdue && <span className="ml-auto text-[11px] font-semibold text-[#c0392b] inline-flex items-center gap-1"><AlertTriangle size={12} /> Overdue</span>}
                  {isToday && <span className="ml-auto text-[11px] font-semibold text-[#1a3a5c]">Today</span>}
                </header>
                <ul className="divide-y divide-[#eef2f7]">
                  {dayItems.map((it) => {
                    const Icon = SOURCE_ICON[it.source];
                    return (
                      <li key={`${it.source}-${it.id}`}>
                        <Link to={it.href} className="flex items-center gap-3 px-4 py-2 hover:bg-[#f8fafc] text-[13px]">
                          <Icon size={14} className="text-[#6b7685] flex-shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[#0f1c2e] truncate">{it.label}</span>
                            <span className="block text-[11px] text-[#6b7685] truncate">{SOURCE_LABEL[it.source]}{it.secondary ? ` · ${it.secondary}` : ''}</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border ${SOURCE_TONE[it.severity]}`}>
                            {it.severity}
                          </span>
                          <ArrowRight size={14} className="text-[#6b7685]" />
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
