// pages/src/meridian/surfaces/lender/IeCertificationsSurface.tsx
//
// Meridian surface — "IE certifications" (lender role). Independent-Engineer certification
// register (GET /api/lender/ie-certifications), with two write paths: issue a new certificate
// (POST /api/lender/ie-certifications) and record the IE decision (POST
// /api/lender/ie-certifications/:id/decide). These certs gate drawdowns (W21) and disbursements
// (W30), so this is the lender's evidence ledger for IE sign-off. Bucket B / L4. Registered as
// `lender:ie_certifications`, reached from Atlas via the roleData feature key `ie_certifications`.
import React, { useState } from 'react';
import { ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { AutoTable } from './_AutoTable';

const CERT_TYPES = [
  { value: 'construction_milestone', label: 'Construction milestone' },
  { value: 'cod', label: 'Commercial operation date' },
  { value: 'performance_test', label: 'Performance test' },
  { value: 'physical_completion', label: 'Physical completion' },
  { value: 'final_acceptance', label: 'Final acceptance' },
];

export default function IeCertificationsSurface(_props: { role: string }) {
  const [issuing, setIssuing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div>
      <div className="flex items-center justify-end mb-3 gap-2">
        <button type="button" onClick={() => setIssuing(true)} className="btn pri">+ Issue certificate</button>
        <button type="button" onClick={() => setDeciding(true)} className="btn ghost">Record decision</button>
      </div>

      <AutoTable
        refreshKey={refreshKey}
        endpoint="/lender/ie-certifications"
        empty="No IE certifications on file."
        prefer={['cert_number', 'project_name', 'cert_type', 'cert_issue_date', 'status']}
      />

      {issuing && (
        <ActionModal
          title="Issue IE certificate"
          submitLabel="Issue"
          fields={[
            { key: 'cert_number', label: 'Certificate number', required: true, placeholder: 'IE-2026-001' },
            { key: 'project_id', label: 'Project', type: 'lookup', required: true, lookupEndpoint: '/projects' },
            { key: 'cert_type', label: 'Certificate type', type: 'select', required: true, options: CERT_TYPES },
            { key: 'cert_issue_date', label: 'Issue date', type: 'date', required: true },
          ] as FieldSpec[]}
          onClose={() => setIssuing(false)}
          onSubmit={async (v) => { await api.post('/lender/ie-certifications', v); setIssuing(false); refresh(); }}
        />
      )}
      {deciding && (
        <ActionModal
          title="Record IE decision"
          submitLabel="Record"
          cta="primary"
          fields={[
            { key: 'cert_id', label: 'Certificate ID', required: true },
            { key: 'status', label: 'Decision', type: 'select', required: true, options: [
              { value: 'certified', label: 'Certified' }, { value: 'qualified', label: 'Qualified (conditions)' }, { value: 'rejected', label: 'Rejected' },
            ] },
          ] as FieldSpec[]}
          onClose={() => setDeciding(false)}
          onSubmit={async (v) => {
            const { cert_id, ...body } = v;
            await api.post(`/lender/ie-certifications/${cert_id}/decide`, body);
            setDeciding(false); refresh();
          }}
        />
      )}
    </div>
  );
}
