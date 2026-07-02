// pages/src/meridian/surfaces/offtaker/BillsSurface.tsx
//
// Meridian surface — "Bill upload & AI" (offtaker role). Extracted verbatim from the inline
// `BillUploadTab` body of the OfftakerWorkstationPage husk (E2.6), together with every helper it
// depended on (Card, OptionGroup, RiskCard, BarRow, pct, touTone, sampleBillText) and its types.
// Self-contained AI bill-analyser: paste/upload an Eskom/municipal bill → server AI extracts the
// consumption profile → recommends a PPA mix + matched procurement options → drafts LOIs / sends
// inquiries. Registered as `offtaker:bills` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `bills` (added in E2.6). Non-chain analytics/AI surface (Bucket D/E).
import React, { useCallback, useEffect, useState } from 'react';
import { Pill } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../ease/statusLabel';
import { api } from '../../../lib/api';

type BillProfile = {
  annual_kwh?: number;
  peak_pct?: number;
  standard_pct?: number;
  offpeak_pct?: number;
  avg_tariff_zar_per_kwh?: number;
  demand_charge_zar_per_kva?: number;
  tou_risk?: 'low' | 'medium' | 'high' | string;
};

type BillRow = {
  id: string;
  source: string | null;
  created_at: string;
  meta: { site?: string; period?: string } & Record<string, unknown>;
  profile: BillProfile;
};

type MixItem = {
  project_id: string;
  project_name: string;
  share_pct: number;
  mwh_per_year: number;
  blended_price: number;
  rationale?: string;
};

type MixResult = {
  mix: MixItem[];
  savings_pct?: number;
  carbon_tco2e?: number;
  warnings?: string[];
};

type OfftakerOption = {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  annual_mwh: number;
  price_basis: 'listed' | 'indicative' | 'contact_seller';
  // null ⇒ withheld (contact_seller); cost/saving null in lockstep.
  blended_price_zar_per_mwh: number | null;
  est_annual_cost_zar: number | null;
  est_saving_zar: number | null;
  est_saving_pct: number | null;
  co2_avoided_tco2e: number;
  rationale: string;
};

type OfftakerOptions = {
  available_now: OfftakerOption[];
  upcoming_projects: OfftakerOption[];
};

function Card({ label, value, unit }: { label: string; value: number | null | undefined; unit?: string }) {
  const formatted = value != null ? `${Number(value).toLocaleString()}${unit ? ' ' + unit : ''}` : '—';
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink3)]">{label}</div>
      <div className="text-[20px] font-semibold text-[var(--ink)] mt-1">{formatted}</div>
    </div>
  );
}

function OptionGroup({
  title, options, actionLabel, onAct, busyId,
}: {
  title: string;
  options: OfftakerOption[];
  actionLabel: string;
  onAct: (opt: OfftakerOption) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[var(--ink3)] mb-2">{title}</div>
      <div className="rounded-lg border border-[var(--line)] bg-white overflow-x-auto text-[var(--ink)]">
        <table className="w-full text-[12px]">
          <thead className="bg-[var(--raised)] text-[var(--ink3)]">
            <tr>
              <th className="text-left p-2">Option</th>
              <th className="text-right p-2">MWh / yr</th>
              <th className="text-right p-2">R/MWh</th>
              <th className="text-right p-2">Est. saving / yr</th>
              <th className="text-right p-2">CO₂ avoided</th>
              <th className="text-left p-2">When</th>
              <th className="text-right p-2" aria-label="action" />
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.option_id} className="border-t border-[var(--raised)]">
                <td className="p-2 font-semibold">{o.title}</td>
                <td className="p-2 text-right">{Number(o.annual_mwh || 0).toLocaleString()}</td>
                <td className="p-2 text-right">
                  {o.blended_price_zar_per_mwh == null
                    ? <span className="text-[var(--ink3)]">Contact seller</span>
                    : `${o.price_basis === 'indicative' ? '~R ' : 'R '}${Number(o.blended_price_zar_per_mwh).toLocaleString()}`}
                </td>
                <td className="p-2 text-right">
                  {o.est_saving_zar == null
                    ? <span className="text-[var(--ink3)]">—</span>
                    : `R ${Number(o.est_saving_zar).toLocaleString()} (${Number(o.est_saving_pct ?? 0)}%)`}
                </td>
                <td className="p-2 text-right">{Number(o.co2_avoided_tco2e || 0).toLocaleString()} t</td>
                <td className="p-2">{o.availability === 'now' ? 'Now' : (o.cod_estimate || 'Upcoming')}</td>
                <td className="p-2 text-right">
                  <button type="button"
                    onClick={() => onAct(o)}
                    disabled={busyId !== null}
                    className="btn pri"
                  >
                    {busyId === o.option_id ? '…' : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pct(v: number | undefined): number {
  if (v == null) return 0;
  return v > 1 ? v : v * 100;
}

function touTone(risk: string | undefined): 'good' | 'warn' | 'bad' | 'neutral' {
  if (!risk) return 'neutral';
  const r = String(risk).toLowerCase();
  if (r === 'high') return 'bad';
  if (r === 'medium') return 'warn';
  if (r === 'low') return 'good';
  return 'neutral';
}

function RiskCard({ risk }: { risk: string | undefined }) {
  const tone = touTone(risk);
  const bg = tone === 'bad' ? 'var(--oxide-tint)' : tone === 'warn' ? 'var(--amber-tint)' : tone === 'good' ? 'var(--moss-tint)' : 'var(--raised)';
  const fg = tone === 'bad' ? 'var(--oxide-deep)' : tone === 'warn' ? 'var(--amber-deep)' : tone === 'good' ? 'var(--moss-deep)' : 'var(--ink)';
  return (
    <div className="rounded-lg border border-[var(--line)] p-4" style={{ background: bg }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--ink3)]">TOU exposure</div>
      <div className="text-[20px] font-semibold mt-1" style={{ color: fg }}>{statusLabel(risk || 'unknown').text}</div>
    </div>
  );
}

function BarRow({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'var(--oxide-deep)' : tone === 'warn' ? 'var(--amber-deep)' : 'var(--moss-deep)';
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-3">
      <div className="flex justify-between items-baseline">
        <span className="text-[11px] uppercase tracking-wider text-[var(--ink3)]">{label}</span>
        <span className="text-[13px] font-semibold text-[var(--ink)]">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[var(--raised)] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );
}

function sampleBillText(site: string, period: string): string {
  return `ESKOM MEGAFLEX — ${site} — period ${period}
Notified maximum demand      2,500 kVA   R 535,500.00
Demand charge                              R 535,500.00
Energy charge (peak)          180,000 kWh  R 1,140,300.00
Energy charge (standard)      540,000 kWh  R 1,118,400.00
Energy charge (off-peak)      280,000 kWh  R   316,400.00
Total energy                1,000,000 kWh  R 2,575,100.00
Network access charge                       R   125,000.00
Service & administration                    R    18,500.00
Environmental levy            1,000,000 kWh R   3,500.00
Affordability subsidy charge  1,000,000 kWh R     950.00
Total billed (excl VAT)                     R 3,258,550.00`;
}

export default function BillsSurface(_props: { role: string }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [siteName, setSiteName] = useState<string>('Sandton head office');
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [content, setContent] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [latest, setLatest] = useState<{ id: string; profile: BillProfile } | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [mix, setMix] = useState<MixResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<OfftakerOptions | null>(null);
  const [loiBusy, setLoiBusy] = useState<string | null>(null); // option_id, or '__mix__' for the whole-mix draft
  const [loiMsg, setLoiMsg] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    try {
      const r = await api.get('/ai/offtaker/bills');
      const rows = (r.data?.data || []) as BillRow[];
      setBills(rows);
      if (!latest && rows.length > 0) {
        setLatest({ id: rows[0].id, profile: rows[0].profile });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load bills');
    }
  }, [latest]);

  useEffect(() => { loadBills(); }, [loadBills]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setContent(text);
  };

  const upload = async () => {
    setUploading(true);
    setErr(null);
    try {
      const body = {
        source: 'text',
        content: content || sampleBillText(siteName, period),
        meta: { site: siteName, period },
      };
      const r = await api.post('/ai/offtaker/bills', body);
      const data = r.data?.data || {};
      setLatest({ id: data.bill_id, profile: (data.structured || {}) as BillProfile });
      setMix(null);
      setOptions(null);
      setLoiMsg(null);
      await loadBills();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  };

  const loadOptions = useCallback(async (billId: string) => {
    try {
      const r = await api.get('/offtaker/options', { params: { bill_id: billId } });
      setOptions((r.data?.data || { available_now: [], upcoming_projects: [] }) as OfftakerOptions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load options');
    }
  }, []);

  const optimize = async () => {
    if (!latest) return;
    setOptimizing(true);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/optimize', {
        bill_id: latest.id,
        horizon_years: 15,
      });
      const structured = (r.data?.data?.structured || {}) as MixResult;
      setMix(structured);
      await loadOptions(latest.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  const draftFromMix = async () => {
    if (!mix?.mix?.length) return;
    setLoiBusy('__mix__');
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', { mix: mix.mix, horizon_years: 15 });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(`${n} Letter${n === 1 ? '' : 's'} of Intent drafted — each developer has been notified. Open "Letters of Intent" to send.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOIs');
    } finally {
      setLoiBusy(null);
    }
  };

  const draftOne = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', {
        mix: [{ project_id: opt.option_id, share_pct: 100, mwh_per_year: opt.annual_mwh, blended_price: opt.blended_price_zar_per_mwh ?? null }],
        horizon_years: 15,
      });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(n > 0
        ? `LOI drafted for ${opt.title} — the developer has been notified.`
        : `No LOI drafted for ${opt.title} (the developer may be in another tenant).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOI');
    } finally {
      setLoiBusy(null);
    }
  };

  const inquire = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      await api.post(`/marketplace/listings/${opt.option_id}/inquire`, {
        message: `Interested in ${opt.title} — approx ${opt.annual_mwh.toLocaleString()} MWh/yr.`,
      });
      setLoiMsg(`Inquiry sent for ${opt.title} — the seller has been notified.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to send inquiry');
    } finally {
      setLoiBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {err && <div className="text-[12px] text-[var(--oxide-deep)]">{err}</div>}

      {/* AI assist banner — "why" + 1-click */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--moss-tint)] p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-[var(--petrol)] text-white text-[12px] font-semibold flex items-center justify-center">AI</div>
        <div className="flex-1 text-[13px] text-[var(--ink)]">
          <div className="font-semibold mb-1">Bill analyser</div>
          <div className="text-[var(--ink2)]">
            Paste an Eskom or municipal utility bill below. The platform extracts your annual consumption,
            TOU split, demand charges and tariff exposure — then recommends a fixed-price PPA mix
            from operating + under-construction projects. Why this matters: every 1% improvement in
            blended tariff translates to ZAR 24k/yr per GWh of consumption.
          </div>
        </div>
      </div>

      {/* Upload form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Site</span>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="mt-1 h-9 w-full px-3 border border-[var(--line)] rounded-md text-[13px] bg-white" />
        </label>
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Billing period (YYYY-MM)</span>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 h-9 w-full px-3 border border-[var(--line)] rounded-md text-[13px] bg-white" />
        </label>
        <label className="block text-[13px]">
          <span className="text-[var(--ink3)]">Upload .txt / .csv extract</span>
          <input type="file" accept=".txt,.csv,.json,text/plain,text/csv" onChange={handleFileChange} className="mt-1 h-9 w-full text-[12px]" />
        </label>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Paste extracted bill text here, e.g.:\n\nESKOM MEGAFLEX — period ${period}\nDemand charge       2,500 kVA   R 535,500\nEnergy (peak)     180,000 kWh   R 1,140,300\nEnergy (standard) 540,000 kWh   R 1,118,400\nEnergy (off-peak) 280,000 kWh   R   316,400\nTotal energy    1,000,000 kWh\n\nOr leave blank to use the sample profile for ${siteName}.`}
        className="w-full h-32 px-3 py-2 border border-[var(--line)] rounded-md text-[12px] font-mono bg-white text-[var(--ink)]"
      />
      <div className="flex justify-end gap-2">
        <button type="button"
          onClick={upload}
          disabled={uploading}
          className="btn pri"
        >
          {uploading ? 'Analysing…' : 'Analyse bill'}
        </button>
        <button type="button"
          onClick={optimize}
          disabled={!latest || optimizing}
          className="btn pri"
        >
          {optimizing ? 'Optimising…' : 'Optimise PPA mix'}
        </button>
      </div>

      {/* Latest profile */}
      {latest && (
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--ink2)] mb-2">Latest analysed profile</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Annual kWh" value={latest.profile.annual_kwh} unit="kWh" />
            <Card label="Avg tariff" value={latest.profile.avg_tariff_zar_per_kwh} unit="R/kWh" />
            <Card label="Demand charge" value={latest.profile.demand_charge_zar_per_kva} unit="R/kVA" />
            <RiskCard risk={latest.profile.tou_risk} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <BarRow label="Peak"     value={pct(latest.profile.peak_pct)} tone="bad" />
            <BarRow label="Standard" value={pct(latest.profile.standard_pct)} tone="warn" />
            <BarRow label="Off-peak" value={pct(latest.profile.offpeak_pct)} tone="good" />
          </div>
        </div>
      )}

      {/* AI mix recommendation */}
      {mix && mix.mix && mix.mix.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--ink2)] mb-2">Recommended PPA mix · 15 yr horizon</h3>
          <div className="rounded-lg border border-[var(--line)] bg-white overflow-x-auto text-[var(--ink)]">
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--raised)] text-[var(--ink3)]">
                <tr>
                  <th className="text-left p-2">Project</th>
                  <th className="text-right p-2">Share</th>
                  <th className="text-right p-2">MWh / yr</th>
                  <th className="text-right p-2">Blended R/MWh</th>
                  <th className="text-left p-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {mix.mix.map((m, idx) => (
                  <tr key={idx} className="border-t border-[var(--raised)]">
                    <td className="p-2 font-semibold">{m.project_name}</td>
                    <td className="p-2 text-right">{Number(m.share_pct || 0).toFixed(1)}%</td>
                    <td className="p-2 text-right">{Number(m.mwh_per_year || 0).toLocaleString()}</td>
                    <td className="p-2 text-right">R {Number(m.blended_price || 0).toLocaleString()}</td>
                    <td className="p-2 text-[var(--ink2)]">{m.rationale || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            <Card label="Estimated savings" value={mix.savings_pct} unit="%" />
            <Card label="Annual CO₂ avoided" value={mix.carbon_tco2e} unit="tCO₂e" />
            <div className="rounded-lg border border-[var(--line)] bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink3)]">Next step</div>
                <div className="text-[13px] mt-1 text-[var(--ink)]">Draft an LOI to every developer in this mix. Each one lands in the developer's action queue.</div>
              </div>
              <button type="button"
                onClick={draftFromMix}
                disabled={loiBusy !== null}
                className="btn pri mt-3"
              >
                {loiBusy === '__mix__' ? 'Drafting…' : 'Draft LOIs from this mix'}
              </button>
            </div>
          </div>
          {loiMsg && <div className="mt-2 text-[12px] text-[var(--moss-deep)]">{loiMsg}</div>}
          {mix.warnings && mix.warnings.length > 0 && (
            <ul className="mt-2 text-[12px] text-[var(--amber-deep)] list-disc pl-5">
              {mix.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Procurement options — available now + upcoming, each scored vs the bill */}
      {options && (options.available_now.length > 0 || options.upcoming_projects.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-[13px] font-semibold text-[var(--ink2)]">Procurement options matched to this bill</h3>
          {loiMsg && <div className="text-[12px] text-[var(--moss-deep)]">{loiMsg}</div>}
          {options.available_now.length > 0 && (
            <OptionGroup title="Available now · marketplace" options={options.available_now} actionLabel="Send inquiry" onAct={inquire} busyId={loiBusy} />
          )}
          {options.upcoming_projects.length > 0 && (
            <OptionGroup title="Upcoming projects" options={options.upcoming_projects} actionLabel="Draft LOI" onAct={draftOne} busyId={loiBusy} />
          )}
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--ink2)] mb-2">Recent analyses</h3>
        {bills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--line)] p-6 text-center text-[12px] text-[var(--ink3)]">
            No bills analysed yet — paste one above to start.
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--line)] bg-white overflow-x-auto text-[var(--ink)]">
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--raised)] text-[var(--ink3)]">
                <tr>
                  <th className="text-left p-2">Uploaded</th>
                  <th className="text-left p-2">Site</th>
                  <th className="text-left p-2">Period</th>
                  <th className="text-right p-2">Annual kWh</th>
                  <th className="text-right p-2">R/kWh</th>
                  <th className="text-left p-2">TOU risk</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-[var(--raised)] hover:bg-[var(--raised)] cursor-pointer"
                    onClick={() => setLatest({ id: b.id, profile: b.profile })}
                  >
                    <td className="p-2">{new Date(b.created_at).toLocaleDateString()}</td>
                    <td className="p-2">{b.meta?.site || '—'}</td>
                    <td className="p-2">{b.meta?.period || '—'}</td>
                    <td className="p-2 text-right">{b.profile?.annual_kwh ? Number(b.profile.annual_kwh).toLocaleString() : '—'}</td>
                    <td className="p-2 text-right">{b.profile?.avg_tariff_zar_per_kwh ? Number(b.profile.avg_tariff_zar_per_kwh).toFixed(2) : '—'}</td>
                    <td className="p-2"><Pill tone={touTone(b.profile?.tou_risk)}>{b.profile?.tou_risk || 'unknown'}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
