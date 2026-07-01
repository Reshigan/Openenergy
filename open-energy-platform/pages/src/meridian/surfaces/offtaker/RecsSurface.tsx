// pages/src/meridian/surfaces/offtaker/RecsSurface.tsx
//
// Meridian surface — "RECs portfolio" (offtaker role). Extracted verbatim from the inline
// `RecsTab` body of the OfftakerWorkstationPage husk (E2.6). Self-contained: REC portfolio
// summary cards + transfer/retire ActionModals against /offtaker-suite/recs/*. Registered as
// `offtaker:rec_retirement` in surfaces.tsx, reached from Atlas (⌘K) via the existing roleData
// feature key `rec_retirement` (no chainKey). Non-chain master-data surface (Bucket B). The local
// `Card` summary tile from the husk is inlined here.
import React, { useEffect, useState } from 'react';
import { ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

type RecsPortfolio = {
  participant_id: string;
  active_certificates: number;
  active_mwh: number;
  retirements: number;
  retired_mwh: number;
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

export default function RecsSurface(_props: { role: string }) {
  const [portfolio, setPortfolio] = useState<RecsPortfolio | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  useEffect(() => {
    api.get('/offtaker-suite/recs/portfolio')
      .then((r) => setPortfolio((r.data?.data || null) as RecsPortfolio | null))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'failed'));
  }, [refreshKey]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setTransferring(true)} className="btn ghost">Transfer certificate</button>
        <button type="button" onClick={() => setRetiring(true)} className="btn pri">Retire certificate</button>
      </div>
      {err && <div className="text-[12px] text-[var(--oxide-deep)]">{err}</div>}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Active certificates" value={portfolio.active_certificates} />
          <Card label="Active MWh" value={portfolio.active_mwh} unit="MWh" />
          <Card label="Retirements" value={portfolio.retirements} />
          <Card label="Retired MWh" value={portfolio.retired_mwh} unit="MWh" />
        </div>
      )}
      {transferring && (
        <ActionModal
          title="Transfer REC certificate"
          submitLabel="Transfer"
          fields={[
            { key: 'certificate_id', label: 'Certificate ID', required: true, placeholder: 'rec_…' },
            { key: 'to_participant_id', label: 'New owner participant', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/participants' },
          ] as FieldSpec[]}
          onClose={() => setTransferring(false)}
          onSubmit={async (v) => {
            await api.post(`/offtaker-suite/recs/certificates/${v.certificate_id}/transfer`, { to_participant_id: v.to_participant_id });
            setTransferring(false); refresh();
          }}
        />
      )}
      {retiring && (
        <ActionModal
          title="Retire REC certificate"
          submitLabel="Retire"
          fields={[
            { key: 'certificate_id', label: 'Certificate ID', required: true, placeholder: 'rec_…' },
            { key: 'retirement_purpose', label: 'Retirement purpose', required: true, placeholder: 'e.g. Voluntary Scope 2 disclosure 2025' },
            { key: 'retirement_certificate_number', label: 'Retirement certificate #', required: true },
            { key: 'consumption_period_start', label: 'Consumption period start', type: 'date' },
            { key: 'consumption_period_end', label: 'Consumption period end', type: 'date' },
            { key: 'consumption_mwh', label: 'Consumption MWh', type: 'number' },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_statement', label: 'Beneficiary statement', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setRetiring(false)}
          onSubmit={async (v) => {
            const body: any = {
              retirement_purpose: v.retirement_purpose,
              retirement_certificate_number: v.retirement_certificate_number,
            };
            for (const k of ['consumption_period_start','consumption_period_end','beneficiary_name','beneficiary_statement']) {
              if (v[k]) body[k] = v[k];
            }
            if (v.consumption_mwh) body.consumption_mwh = Number(v.consumption_mwh);
            await api.post(`/offtaker-suite/recs/certificates/${v.certificate_id}/retire`, body);
            setRetiring(false); refresh();
          }}
        />
      )}
    </div>
  );
}
