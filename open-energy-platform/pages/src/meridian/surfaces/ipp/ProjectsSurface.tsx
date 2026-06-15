// pages/src/meridian/surfaces/ipp/ProjectsSurface.tsx — IPP "My projects" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `projects` tab body
// (a non-chain ListingTable over /projects). Self-contained `{ role }` body.
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

export default function ProjectsSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/projects"
      rowKey={(r) => r.id}
      rowHref={(r) => `/projects/${r.id}`}
      empty={{ title: 'No projects', description: 'Register your first project from the IPP lifecycle page.' }}
      columns={[
        { key: 'project_name', label: 'Project', render: (r) => r.project_name || r.name },
        { key: 'project_type', label: 'Type', render: (r) => <Pill tone="info">{r.project_type || r.energy_type || '—'}</Pill> },
        { key: 'capacity_mw', label: 'Capacity', align: 'right', render: (r) => r.capacity_mw != null ? `${Number(r.capacity_mw).toFixed(1)} MW` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : 'neutral'}>{(r.lifecycle_stage || r.status || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'cod_target', label: 'COD target', render: (r) => r.cod_target || r.target_cod_date || '—' },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}
