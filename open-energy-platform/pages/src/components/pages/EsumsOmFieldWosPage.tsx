// ════════════════════════════════════════════════════════════════════════
// EsumsOmFieldWosPage — /esums-om/field/wos
//
// Mobile-optimised field-tech work order screen. Designed for one-handed
// use on a phone in the field:
//   • Large touch targets, single-column layout, sticky action bar
//   • One screen per WO with state-machine "next action" button
//   • GPS check-in on On-site transition (uses navigator.geolocation if
//     permitted; gracefully degrades to manual)
//   • Photo evidence via the device camera (input[type=file capture])
//   • Works as a PWA shortcut for techs ("Field tech: my work orders")
//
// Pulls /esums-om/work-orders?assigned_to=me + transition + photo APIs.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Camera, Check, ChevronRight, MapPin, Navigation, Phone,
  RefreshCw, Wrench, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';

type WoRow = {
  id: string;
  wo_number: string;
  site_id: string;
  site_name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  title: string;
  description?: string;
  assigned_to: string | null;
  technician_name: string | null;
  sla_deadline: string;
};

const NEXT_ACTION: Record<string, { to: string; label: string }> = {
  assigned:     { to: 'acknowledged', label: 'Acknowledge' },
  acknowledged: { to: 'en_route',     label: 'Mark en route' },
  en_route:     { to: 'on_site',      label: 'Arrived on site' },
  on_site:      { to: 'diagnosing',   label: 'Start diagnosis' },
  diagnosing:   { to: 'repairing',    label: 'Start repair' },
  repairing:    { to: 'testing',      label: 'Start testing' },
  testing:      { to: 'completed',    label: 'Mark completed' },
};

const PRIORITY_TONE: Record<string, string> = {
  critical: 'bg-[#fde0db] text-[#c0392b] border-[#c0392b]',
  high:     'bg-[#fef3e6] text-[#b04e0f] border-[#b04e0f]',
  medium:   'bg-[#eef2f7] text-[#1a3a5c] border-[#1a3a5c]',
  low:      'bg-[#eef2f7] text-[#6b7685] border-[#dde4ec]',
};

export function EsumsOmFieldWosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WoRow[]>([]);
  const [active, setActive] = useState<WoRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/esums-om/work-orders${user?.id ? `?assigned_to=${user.id}` : ''}`)
      .then((r) => setRows((r.data?.data || []).filter((w: WoRow) =>
        !['completed', 'verified', 'closed', 'cancelled'].includes(w.status))))
      .catch(() => setRows([]));
  }, [user?.id, refresh]);

  const transition = async (wo: WoRow, to: string, extra?: Record<string, any>) => {
    setBusy(true);
    try {
      await api.post(`/esums-om/work-orders/${wo.id}/transition`, { to, ...(extra || {}) });
      setRefresh((n) => n + 1);
      setActive((cur) => cur && cur.id === wo.id ? { ...cur, status: to } : cur);
    } finally { setBusy(false); }
  };

  const onSiteWithGps = async (wo: WoRow) => {
    setBusy(true);
    let payload: Record<string, any> = {};
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10_000, maximumAge: 60_000 }));
      payload.gps_lat = pos.coords.latitude;
      payload.gps_lon = pos.coords.longitude;
      payload.gps_accuracy_m = pos.coords.accuracy;
    } catch {
      // permission denied or unavailable — still allow the transition
    }
    await transition(wo, 'on_site', payload);
  };

  const uploadPhoto = async (wo: WoRow, file: File, label: string) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'om_work_orders');
      fd.append('entity_id', wo.id);
      const up = await fetch('/api/vault/upload-direct', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: fd,
      });
      const j = await up.json();
      if (j?.success && j?.data?.r2_key) {
        await api.post(`/esums-om/work-orders/${wo.id}/photo`, { r2_key: j.data.r2_key, label });
      }
    } finally { setBusy(false); }
  };

  // ─── Detail view ───
  if (active) return (
    <FieldWoDetail
      wo={active}
      busy={busy}
      onBack={() => setActive(null)}
      onTransition={transition}
      onOnSite={() => onSiteWithGps(active)}
      onPhoto={(file, label) => uploadPhoto(active, file, label)}
    />
  );

  // ─── List view ───
  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      <header className="bg-[#1a3a5c] text-white px-4 py-3 sticky top-0 z-10 flex items-center justify-between shadow">
        <button onClick={() => navigate('/esums-om')} className="p-1.5 -ml-1.5"><ArrowLeft size={20} /></button>
        <div className="text-center flex-1">
          <div className="text-[10px] uppercase tracking-wider opacity-80">Esums O&amp;M · Field</div>
          <div className="text-[15px] font-semibold">My work orders</div>
        </div>
        <button onClick={() => setRefresh((n) => n + 1)} className="p-1.5 -mr-1.5"><RefreshCw size={18} /></button>
      </header>

      <div className="p-3 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-white border border-[#e2e8f0] p-6 text-center">
            <Wrench size={28} className="mx-auto text-[#6b7685]" />
            <div className="mt-2 text-[14px] font-semibold text-[#0f1c2e]">No assigned WOs</div>
            <div className="text-[12px] text-[#6b7685] mt-1">You're caught up. Pull to refresh.</div>
          </div>
        ) : rows.map((w) => {
          const minsLeft = Math.round((new Date(w.sla_deadline).getTime() - Date.now()) / 60_000);
          const slaTone = minsLeft < 0 ? 'text-[#c0392b]' : minsLeft < 60 ? 'text-[#b04e0f]' : 'text-[#1a8a5b]';
          return (
            <button key={w.id} onClick={() => setActive(w)} className="w-full text-left block">
              <div className="rounded-lg bg-white border border-[#e2e8f0] p-3 shadow-sm active:bg-[#fafbfd]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-bold text-[#0f1c2e]">{w.wo_number}</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${PRIORITY_TONE[w.priority]}`}>
                    {w.priority}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-semibold text-[#0f1c2e]">{w.title}</div>
                <div className="mt-1 text-[12px] text-[#3d4756] inline-flex items-center gap-1">
                  <MapPin size={11} /> {w.site_name}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="capitalize text-[#6b7685]">{w.status.replace(/_/g, ' ')}</span>
                  <span className={`font-mono font-semibold ${slaTone}`}>
                    {minsLeft < 0 ? `⚠ ${Math.abs(minsLeft)}m over SLA` : `SLA ${minsLeft}m`}
                  </span>
                  <ChevronRight size={14} className="text-[#6b7685]" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FieldWoDetail({
  wo, busy, onBack, onTransition, onOnSite, onPhoto,
}: {
  wo: WoRow; busy: boolean;
  onBack: () => void;
  onTransition: (wo: WoRow, to: string) => Promise<void>;
  onOnSite: () => Promise<void>;
  onPhoto: (file: File, label: string) => Promise<void>;
}) {
  const minsLeft = Math.round((new Date(wo.sla_deadline).getTime() - Date.now()) / 60_000);
  const next = NEXT_ACTION[wo.status];

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-32">
      <header className="bg-[#1a3a5c] text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-2 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-80">{wo.site_name}</div>
          <div className="font-mono text-[14px] font-semibold truncate">{wo.wo_number}</div>
        </div>
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${PRIORITY_TONE[wo.priority]}`}>{wo.priority}</span>
      </header>

      <div className="p-3 space-y-3">
        <section className="rounded-lg bg-white border border-[#e2e8f0] p-4 shadow-sm">
          <div className="text-[16px] font-semibold text-[#0f1c2e] leading-tight">{wo.title}</div>
          {wo.description && <p className="mt-1 text-[13px] text-[#3d4756] leading-snug">{wo.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <Stat label="State" value={wo.status.replace(/_/g, ' ')} />
            <Stat label="SLA" tone={minsLeft < 0 ? 'bad' : minsLeft < 60 ? 'warn' : 'good'}
                  value={minsLeft < 0 ? `${Math.abs(minsLeft)}m over` : `${minsLeft}m left`} />
          </div>
        </section>

        <section className="rounded-lg bg-white border border-[#e2e8f0] p-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7685] font-bold">Photo evidence</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <PhotoButton label="Before" onChoose={(f) => onPhoto(f, 'before')} />
            <PhotoButton label="During" onChoose={(f) => onPhoto(f, 'during')} />
            <PhotoButton label="After"  onChoose={(f) => onPhoto(f, 'after')}  />
          </div>
        </section>

        <section className="rounded-lg bg-white border border-[#e2e8f0] p-3 shadow-sm space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-[#6b7685] font-bold">Quick actions</div>
          <a href={`tel:`} className="flex items-center gap-2 px-3 py-2.5 rounded border border-[#e2e8f0] text-[13px]">
            <Phone size={14} /> Call site contact
          </a>
          <a href={`geo:0,0?q=${encodeURIComponent(wo.site_name)}`}
             className="flex items-center gap-2 px-3 py-2.5 rounded border border-[#e2e8f0] text-[13px]">
            <Navigation size={14} /> Navigate to site
          </a>
        </section>
      </div>

      {/* Sticky bottom action bar */}
      {next && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#dde4ec] px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] flex gap-2">
          {wo.status === 'en_route' ? (
            <button
              disabled={busy}
              onClick={onOnSite}
              className="flex-1 h-12 rounded-lg bg-[#1a3a5c] text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <MapPin size={16} /> Arrived (check-in)
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => onTransition(wo, next.to)}
              className="flex-1 h-12 rounded-lg bg-[#1a3a5c] text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 disabled:opacity-50">
              <Check size={16} /> {next.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const toneCls = tone === 'bad' ? 'text-[#c0392b]' : tone === 'warn' ? 'text-[#b04e0f]' : tone === 'good' ? 'text-[#1a8a5b]' : 'text-[#0f1c2e]';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[#6b7685] font-bold">{label}</div>
      <div className={`text-[14px] font-semibold capitalize ${toneCls}`}>{value}</div>
    </div>
  );
}

function PhotoButton({ label, onChoose }: { label: string; onChoose: (file: File) => Promise<void> }) {
  const id = `photo-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#dde4ec] py-4 active:bg-[#fafbfd] cursor-pointer">
      <Camera size={20} className="text-[#3b82c4]" />
      <span className="mt-1 text-[11px] font-semibold text-[#3d4756]">{label}</span>
      <input id={id} type="file" accept="image/*" capture="environment" className="hidden"
             onChange={(e) => { const f = e.target.files?.[0]; if (f) void onChoose(f); e.currentTarget.value = ''; }} />
    </label>
  );
}

export default EsumsOmFieldWosPage;
