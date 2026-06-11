// ════════════════════════════════════════════════════════════════════════
// EsumsOmFieldWosPage — /esums/field/wos
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
// Pulls /esums/work-orders?assigned_to=me + transition + photo APIs.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Camera, Check, ChevronRight, MapPin, Navigation, Phone,
  RefreshCw, Wrench, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { enqueueMutation, flushQueue, offlineFirstFetch, listPending } from '../../lib/offlineQueue';

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
  critical: '',
  high:     '',
  medium:   '',
  low:      '',
};

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  critical: { background: 'oklch(0.97 0.04 20)', color: 'oklch(0.48 0.20 20)', borderColor: 'oklch(0.85 0.08 20)' },
  high:     { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.46 0.16 55)', borderColor: 'oklch(0.87 0.006 250)' },
  medium:   { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.17 0.010 250)', borderColor: 'oklch(0.87 0.006 250)' },
  low:      { background: 'oklch(0.96 0.003 250)', color: 'oklch(0.60 0.007 250)', borderColor: 'oklch(0.87 0.006 250)' },
};

export function EsumsOmFieldWosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WoRow[]>([]);
  const [active, setActive] = useState<WoRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();

  // Online / offline indicator + queue badge
  useEffect(() => {
    const update = () => { setOffline(!navigator.onLine); void listPending().then((p) => setPendingCount(p.length)); };
    update();
    const onOnline  = () => { update(); void flushQueue().then(update); };
    const onOffline = () => update();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const tick = setInterval(update, 15_000);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); clearInterval(tick); };
  }, []);

  // Offline-first load — try network, cache to IndexedDB, on failure
  // read from cache. The detail screen still renders fully.
  useEffect(() => {
    const url = `/api/esums/work-orders${user?.id ? `?assigned_to=${user.id}` : ''}`;
    void offlineFirstFetch(url, undefined, { cacheKey: `wos:${user?.id || 'all'}`, ttlSeconds: 24 * 3600 })
      .then(({ data }) => {
        const arr = (data?.data || []) as WoRow[];
        setRows(arr.filter((w) => !['completed', 'verified', 'closed', 'cancelled'].includes(w.status)));
      });
  }, [user?.id, refresh]);

  const transition = async (wo: WoRow, to: string, extra?: Record<string, any>) => {
    setBusy(true);
    // Optimistic UI — flip status locally now, even if offline
    setRows((rs) => rs.map((r) => r.id === wo.id ? { ...r, status: to } : r));
    setActive((cur) => cur && cur.id === wo.id ? { ...cur, status: to } : cur);
    try {
      if (navigator.onLine) {
        await api.post(`/esums/work-orders/${wo.id}/transition`, { to, ...(extra || {}) });
      } else {
        await enqueueMutation({
          url: `/api/esums/work-orders/${wo.id}/transition`,
          method: 'POST',
          body: { to, ...(extra || {}) },
        });
        void listPending().then((p) => setPendingCount(p.length));
      }
      setRefresh((n) => n + 1);
    } catch (e) {
      // Network blip even though `navigator.onLine` reported true — queue it
      await enqueueMutation({
        url: `/api/esums/work-orders/${wo.id}/transition`,
        method: 'POST',
        body: { to, ...(extra || {}) },
      });
      void listPending().then((p) => setPendingCount(p.length));
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
      if (navigator.onLine) {
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
          await api.post(`/esums/work-orders/${wo.id}/photo`, { r2_key: j.data.r2_key, label });
        }
      } else {
        // Offline — queue the multipart upload; the blob is held in IDB
        await enqueueMutation({
          url: '/api/vault/upload-direct',
          method: 'POST',
          formData: { file, fields: { entity_type: 'om_work_orders', entity_id: wo.id } },
        });
        void listPending().then((p) => setPendingCount(p.length));
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
    <div className="pb-20" style={{ minHeight: 'calc(100vh - 50px)', background: 'oklch(0.96 0.003 250)' }}>
      <header className="text-white px-4 py-3 sticky top-0 z-10 flex items-center justify-between shadow"
              style={{ background: 'oklch(0.46 0.16 55)' }}>
        <button type="button" onClick={() => navigate('/esums')} className="p-1.5 -ml-1.5"><ArrowLeft size={20} /></button>
        <div className="text-center flex-1">
          <div className="text-[10px] uppercase tracking-wider opacity-80 inline-flex items-center gap-1">
            {offline ? <>OFFLINE · {pendingCount} queued</> : <>Esums O&amp;M · Field{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}</>}
          </div>
          <div className="text-[15px] font-semibold">My work orders</div>
        </div>
        <button type="button" onClick={() => setRefresh((n) => n + 1)} className="p-1.5 -mr-1.5"><RefreshCw size={18} /></button>
      </header>

      <div className="p-3 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-lg border p-6 text-center"
               style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
            <Wrench size={28} className="mx-auto" style={{ color: 'oklch(0.60 0.007 250)' }} />
            <div className="mt-2 text-[14px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>No assigned WOs</div>
            <div className="text-[12px] mt-1" style={{ color: 'oklch(0.60 0.007 250)' }}>You're caught up. Pull to refresh.</div>
          </div>
        ) : rows.map((w) => {
          const minsLeft = Math.round((new Date(w.sla_deadline).getTime() - Date.now()) / 60_000);
          const slaColor = minsLeft < 0 ? 'oklch(0.48 0.20 20)' : minsLeft < 60 ? 'oklch(0.46 0.16 55)' : 'oklch(0.45 0.15 150)';
          return (
            <button type="button" key={w.id} onClick={() => setActive(w)} className="w-full text-left block">
              <div className="rounded-lg border p-3 shadow-sm"
                   style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] font-bold" style={{ color: 'oklch(0.17 0.010 250)' }}>{w.wo_number}</span>
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                        style={PRIORITY_STYLE[w.priority]}>
                    {w.priority}
                  </span>
                </div>
                <div className="mt-1 text-[14px] font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{w.title}</div>
                <div className="mt-1 text-[12px] inline-flex items-center gap-1" style={{ color: 'oklch(0.40 0.009 250)' }}>
                  <MapPin size={11} /> {w.site_name}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="capitalize" style={{ color: 'oklch(0.60 0.007 250)' }}>{w.status.replace(/_/g, ' ')}</span>
                  <span className="font-mono font-semibold" style={{ color: slaColor }}>
                    {minsLeft < 0 ? `⚠ ${Math.abs(minsLeft)}m over SLA` : `SLA ${minsLeft}m`}
                  </span>
                  <ChevronRight size={14} style={{ color: 'oklch(0.60 0.007 250)' }} />
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
    <div className="pb-32" style={{ minHeight: 'calc(100vh - 50px)', background: 'oklch(0.96 0.003 250)' }}>
      <header className="text-white px-4 py-3 sticky top-0 z-10 flex items-center gap-2 shadow"
              style={{ background: 'oklch(0.46 0.16 55)' }}>
        <button type="button" onClick={onBack} className="p-1.5 -ml-1.5"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-80">{wo.site_name}</div>
          <div className="font-mono text-[14px] font-semibold truncate">{wo.wo_number}</div>
        </div>
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
              style={PRIORITY_STYLE[wo.priority]}>{wo.priority}</span>
      </header>

      <div className="p-3 space-y-3">
        <section className="rounded-lg border p-4 shadow-sm"
                 style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
          <div className="text-[16px] font-semibold leading-tight" style={{ color: 'oklch(0.17 0.010 250)' }}>{wo.title}</div>
          {wo.description && <p className="mt-1 text-[13px] leading-snug" style={{ color: 'oklch(0.40 0.009 250)' }}>{wo.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
            <Stat label="State" value={wo.status.replace(/_/g, ' ')} />
            <Stat label="SLA" tone={minsLeft < 0 ? 'bad' : minsLeft < 60 ? 'warn' : 'good'}
                  value={minsLeft < 0 ? `${Math.abs(minsLeft)}m over` : `${minsLeft}m left`} />
          </div>
        </section>

        <section className="rounded-lg border p-3 shadow-sm"
                 style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
          <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'oklch(0.60 0.007 250)' }}>Photo evidence</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <PhotoButton label="Before" onChoose={(f) => onPhoto(f, 'before')} />
            <PhotoButton label="During" onChoose={(f) => onPhoto(f, 'during')} />
            <PhotoButton label="After"  onChoose={(f) => onPhoto(f, 'after')}  />
          </div>
        </section>

        <section className="rounded-lg border p-3 shadow-sm space-y-2"
                 style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
          <div className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'oklch(0.60 0.007 250)' }}>Quick actions</div>
          <a href={`tel:`} className="flex items-center gap-2 px-3 py-2.5 rounded border text-[13px]"
             style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
            <Phone size={14} /> Call site contact
          </a>
          <a href={`geo:0,0?q=${encodeURIComponent(wo.site_name)}`}
             className="flex items-center gap-2 px-3 py-2.5 rounded border text-[13px]"
             style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
            <Navigation size={14} /> Navigate to site
          </a>
        </section>
      </div>

      {/* Sticky bottom action bar */}
      {next && (
        <div className="fixed bottom-0 left-0 right-0 border-t px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] flex gap-2"
             style={{ background: 'oklch(0.99 0.002 80)', borderColor: 'oklch(0.87 0.006 250)' }}>
          {wo.status === 'en_route' ? (
            <button type="button"
              disabled={busy}
              onClick={onOnSite}
              className="flex-1 h-12 rounded-lg text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'oklch(0.46 0.16 55)' }}>
              <MapPin size={16} /> Arrived (check-in)
            </button>
          ) : (
            <button type="button"
              disabled={busy}
              onClick={() => onTransition(wo, next.to)}
              className="flex-1 h-12 rounded-lg text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'oklch(0.46 0.16 55)' }}>
              <Check size={16} /> {next.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  const toneColor = tone === 'bad' ? 'oklch(0.48 0.20 20)' : tone === 'warn' ? 'oklch(0.46 0.16 55)' : tone === 'good' ? 'oklch(0.45 0.15 150)' : 'oklch(0.17 0.010 250)';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'oklch(0.60 0.007 250)' }}>{label}</div>
      <div className="text-[14px] font-semibold capitalize" style={{ color: toneColor }}>{value}</div>
    </div>
  );
}

function PhotoButton({ label, onChoose }: { label: string; onChoose: (file: File) => Promise<void> }) {
  const id = `photo-${label.toLowerCase()}`;
  return (
    <label htmlFor={id} className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-4 cursor-pointer"
           style={{ borderColor: 'oklch(0.87 0.006 250)' }}>
      <Camera size={20} style={{ color: 'oklch(0.46 0.16 55)' }} />
      <span className="mt-1 text-[11px] font-semibold" style={{ color: 'oklch(0.40 0.009 250)' }}>{label}</span>
      <input id={id} type="file" accept="image/*" capture="environment" className="hidden"
             onChange={(e) => { const f = e.target.files?.[0]; if (f) void onChoose(f); e.currentTarget.value = ''; }} />
    </label>
  );
}

export default EsumsOmFieldWosPage;
