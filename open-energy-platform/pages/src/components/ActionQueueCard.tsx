import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, FileSignature, CreditCard, Zap, CheckCircle2,
  AlertTriangle, ArrowRight, Clock,
} from 'lucide-react';
import { api } from '../lib/api';

type ActionItem = {
  id: string;
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  description?: string | null;
  status: string;
  due_date?: string | null;
  created_at: string;
};

const priorityColor: Record<string, { bg: string; text: string; dot: string }> = {
  urgent: { bg: '#fde7e9', text: '#bb0000', dot: '#bb0000' },
  high: { bg: '#fef3e6', text: '#b04e0f', dot: '#e9730c' },
  normal: { bg: '#e5f0fa', text: '#0a6ed1', dot: '#0a6ed1' },
  low: { bg: '#eef1f4', text: '#6a6d70', dot: '#8c8f94' },
};

function iconForType(type: string) {
  if (type.includes('sign') || type.includes('contract')) return FileSignature;
  if (type.includes('invoice') || type.includes('payment')) return CreditCard;
  if (type.includes('trade') || type.includes('delivery')) return Zap;
  if (type.includes('dispute')) return AlertTriangle;
  if (type.includes('disbursement')) return CreditCard;
  return Inbox;
}

function hrefForAction(entityType: string | null, entityId: string | null): string {
  if (entityType === 'contract_documents' && entityId) return `/contracts/${entityId}`;
  if (entityType === 'loi_drafts' && entityId) return `/lois/${entityId}`;
  switch (entityType) {
    case 'contract_documents': return '/contracts';
    case 'loi_drafts': return '/lois';
    case 'invoices': return entityId ? `/settlement?focus=${entityId}` : '/settlement';
    case 'trade_matches': return entityId ? `/trading?focus=${entityId}` : '/trading';
    case 'project_milestones': return entityId ? `/projects?focus=${entityId}` : '/projects';
    case 'settlement_disputes': return entityId ? `/settlement?focus=${entityId}` : '/settlement';
    case 'ona_faults': return entityId ? `/projects?focus=${entityId}` : '/projects';
    case 'disbursement_requests': return entityId ? `/funds?focus=${entityId}` : '/funds';
    case 'loan_covenants': return entityId ? `/funds?focus=${entityId}` : '/funds';
    default: return '/cockpit';
  }
}

export function ActionQueueCard() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/cockpit/actions?status=pending&limit=8');
      setItems((res.data?.data as ActionItem[]) || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const complete = async (id: string) => {
    try {
      await api.post(`/cockpit/actions/${id}/complete`, {});
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      /* no-op; surface via next refresh */
    }
  };

  return (
    <section
      className="rounded-xl border overflow-hidden"
      style={{
        background: '#ffffff',
        borderColor: '#e5e5e5',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(10,110,209,0.08)',
      }}
    >
      <header
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: '#f0f1f2' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg,#0a6ed1 0%,#5d36ff 100%)',
              color: '#fff',
            }}
          >
            <Inbox size={18} />
          </div>
          <div className="leading-tight">
            <h2 className="text-[15px] font-semibold" style={{ color: '#32363a' }}>
              Awaiting your action
            </h2>
            <p className="text-[12px]" style={{ color: '#6a6d70' }}>
              Items queued to you by the platform and counterparties
            </p>
          </div>
        </div>
        <div
          className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
          style={{ background: items.length ? '#e5f0fa' : '#eef1f4', color: items.length ? '#0a6ed1' : '#6a6d70' }}
        >
          {loading ? '…' : `${items.length} open`}
        </div>
      </header>

      <div className="divide-y" style={{ borderColor: '#f0f1f2' }}>
        {loading && (
          <div className="px-5 py-6 text-[13px]" style={{ color: '#6a6d70' }}>
            Loading your queue…
          </div>
        )}
        {!loading && error && (
          <div className="px-5 py-6 text-[13px]" style={{ color: '#bb0000' }}>
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-5 py-10 text-center">
            <div
              className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: '#e5f7ec', color: '#107e3e' }}
            >
              <CheckCircle2 size={22} />
            </div>
            <div className="text-[13px] font-semibold" style={{ color: '#32363a' }}>Inbox zero</div>
            <div className="text-[12px] mt-0.5" style={{ color: '#6a6d70' }}>
              Nothing is waiting on you right now.
            </div>
          </div>
        )}
        {!loading && !error && items.map((it) => {
          const Icon = iconForType(it.type);
          const p = priorityColor[it.priority] || priorityColor.normal;
          const href = hrefForAction(it.entity_type, it.entity_id);
          return (
            <div
              key={it.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-[#fafafa] transition-colors"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: p.bg, color: p.text }}
              >
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold truncate" style={{ color: '#32363a' }}>
                    {it.title}
                  </div>
                  <span
                    className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-[1px] rounded-full"
                    style={{ background: p.bg, color: p.text }}
                  >
                    {it.priority}
                  </span>
                </div>
                {it.description && (
                  <div className="text-[12px] mt-0.5 truncate" style={{ color: '#6a6d70' }}>
                    {it.description}
                  </div>
                )}
                {it.due_date && (
                  <div
                    className="text-[11px] mt-1 inline-flex items-center gap-1"
                    style={{ color: '#6a6d70' }}
                  >
                    <Clock size={11} /> Due {it.due_date}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => navigate(href)}
                  className="text-[12px] font-semibold px-2.5 h-8 rounded-md flex items-center gap-1 hover:bg-[#eff1f2]"
                  style={{ color: '#0a6ed1' }}
                >
                  Open <ArrowRight size={12} />
                </button>
                <button
                  onClick={() => complete(it.id)}
                  className="text-[12px] font-semibold px-2.5 h-8 rounded-md hover:bg-[#e5f7ec]"
                  style={{ color: '#107e3e' }}
                  title="Mark as done"
                >
                  Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
