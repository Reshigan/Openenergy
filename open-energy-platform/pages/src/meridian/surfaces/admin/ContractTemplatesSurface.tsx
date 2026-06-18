// pages/src/meridian/surfaces/admin/ContractTemplatesSurface.tsx
//
// Meridian surface — "Contract templates" (admin role). Read library over
// GET /api/contracts/templates (the SA-law contract template registry: PPAs, GCAs, EPC,
// facility agreements …) with client-driven category / document_type filters that re-point
// the ListingTable endpoint (?category=&document_type=) and remount via key. Bucket B read
// surface. Registered as `admin:contracts_admin` in surfaces.tsx, reached from Atlas (⌘K)
// via the roleData feature key `contracts_admin`.
import React, { useState } from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

const CATEGORY_OPTS = [
  { value: '', label: 'All categories' },
  { value: 'power_purchase', label: 'Power purchase' },
  { value: 'grid_connection', label: 'Grid connection' },
  { value: 'construction', label: 'Construction / EPC' },
  { value: 'finance', label: 'Finance' },
  { value: 'offtake', label: 'Offtake' },
  { value: 'service', label: 'Service / O&M' },
];
const DOCTYPE_OPTS = [
  { value: '', label: 'All document types' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'term_sheet', label: 'Term sheet' },
  { value: 'guarantee', label: 'Guarantee' },
  { value: 'notice', label: 'Notice' },
];

export default function ContractTemplatesSurface(_props: { role: string }) {
  const [category, setCategory] = useState('');
  const [docType, setDocType] = useState('');

  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (docType) qs.set('document_type', docType);
  const endpoint = `/contracts/templates${qs.toString() ? `?${qs.toString()}` : ''}`;

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 px-2 rounded-md border border-slate-300 text-[12px] bg-white">
          {CATEGORY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={docType} onChange={(e) => setDocType(e.target.value)} className="h-9 px-2 rounded-md border border-slate-300 text-[12px] bg-white">
          {DOCTYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <ListingTable
        key={endpoint}
        endpoint={endpoint}
        rowKey={(r) => r.id ?? r.code}
        empty={{ title: 'No templates', description: 'No contract templates match the current filters.' }}
        columns={[
          { key: 'name', label: 'Template', render: (r) => (
            <div className="leading-tight">
              <div className="font-medium">{r.name}</div>
              <div className="text-[10px] text-slate-500 font-mono">{r.code}{r.version ? ` · v${r.version}` : ''}</div>
            </div>
          ) },
          { key: 'category', label: 'Category', render: (r) => <Pill tone="info">{(r.category || '—').replace(/_/g, ' ')}</Pill> },
          { key: 'document_type', label: 'Type', render: (r) => <span className="text-[11px] capitalize">{(r.document_type || '—').replace(/_/g, ' ')}</span> },
          { key: 'jurisdiction', label: 'Jurisdiction', render: (r) => r.jurisdiction || 'ZA' },
          { key: 'governing_law', label: 'Governing law', render: (r) => r.governing_law || '—' },
          { key: 'sa_law_references', label: 'SA-law refs', render: (r) => (
            <span className="text-[10px] text-slate-500">{Array.isArray(r.sa_law_references) ? r.sa_law_references.join(', ') : (r.sa_law_references || '—')}</span>
          ) },
        ]}
      />
    </div>
  );
}
