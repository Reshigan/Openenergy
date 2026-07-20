// pages/src/meridian/surfaces/esumsom/ProjectsSurface.tsx
//
// Meridian surface — "Projects" (esco / esums_owner O&M role). Extracted verbatim from the
// `projects` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill, rowActions) is preserved identically. Registered as `esco:projects`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `projects`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { projectsViz } from './viz';

export default function ProjectsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'projects',
      label: 'Projects',
      endpoint: '/esums/projects',
      description: 'Portfolio-level project grouping. A project is either linked to an existing IPP project (operational O&M layer on top of a tracked development) or standalone (asset-owner / behind-the-meter / community solar with no IPP lifecycle). If you have no projects yet, a standalone default is created automatically on first open.',
      viz: projectsViz,
      columns: [
        { key: 'name',             label: 'Project' },
        { key: 'project_type',     label: 'Type', render: (r) => (
            <StatusPill status={r.project_type === 'ipp' ? 'ipp' : 'standalone'} />
          )},
        { key: 'ipp_project_name', label: 'IPP link' },
        { key: 'site_count',       label: 'Sites',    align: 'right', number: true },
        { key: 'total_capacity_kw', label: 'kW',      align: 'right', number: true },
        { key: 'shard_key',        label: 'DB shard' },
        { key: 'status',           label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'created_at',       label: 'Created', date: true },
      ],
      rowActions: [
        {
          label: 'Link IPP project',
          tone: 'primary' as const,
          method: 'PUT' as const,
          endpoint: '/esums/projects/{id}',
          form: {
            title: 'Link to IPP project',
            endpoint: '',
            fields: [
              { name: 'project_type', label: 'Type', type: 'select', required: true,
                options: [
                  { value: 'ipp',        label: 'IPP project (link to tracked development)' },
                  { value: 'standalone', label: 'Standalone (no IPP link)' },
                ]},
              { name: 'ipp_project_id', label: 'IPP project ID', type: 'text' },
            ],
          },
        },
        {
          label: 'Archive',
          tone: 'default' as const,
          method: 'PUT' as const,
          endpoint: '/esums/projects/{id}',
          form: {
            title: 'Archive project',
            endpoint: '',
            fields: [
              { name: 'status', label: 'Status', type: 'select', required: true,
                options: [{ value: 'archived', label: 'Archive' }, { value: 'active', label: 'Restore' }]},
            ],
          },
        },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Projects"
      subtitle="Portfolio-level project grouping."
      tabs={tabs}
      initialTab="projects"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
