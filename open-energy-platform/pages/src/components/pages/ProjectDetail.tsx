// ════════════════════════════════════════════════════════════════════════
// ProjectDetail — /projects/:id
//
// One screen, eight tabs, every related entity in scope. Composes the
// generic EntityFileShell with the project-specific hero + tab map. The
// shell does fetching, hero rendering, KPI strip, AI suggestion strip,
// tab state via ?tab=, and the documents/discussion panel.
//
// To replicate this pattern on contracts / RFPs / LOIs / funds, build a
// matching ${entity}FileConfig.tsx (hero + tabs) and pass it to the
// EntityFileShell.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OEIcon } from '../OEIcon';
import { EntityFileShell } from '../file/EntityFileShell';
import { projectFileTabs, projectHero, type ProjectFileData } from '../file/projectFileConfig';

export function ProjectDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <EntityFileShell<ProjectFileData>
      endpoint={`/projects/${id}/file`}
      entityKind="projects"
      entityId={id}
      backHref="/projects"
      backLabel="All projects"
      heroFor={(data) => ({
        ...projectHero(data),
        actions: (
          <>
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="h-9 px-3 rounded-md bg-white/15 border border-white/20 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/25"
            >
              <OEIcon name="chevron-left" size={14} /> Projects
            </button>
            <button
              type="button"
              onClick={() => navigate(`/projects/${id}/lifecycle`)}
              className="h-9 px-3 rounded-md bg-white text-[#1a3a5c] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/90"
            >
              <OEIcon name="flow" size={14} /> Lifecycle timeline
            </button>
          </>
        ),
      })}
      summaryFor={(data) => data.summary}
      suggestionsFor={(data) => data.ai_suggestions}
      tabs={projectFileTabs}
    />
  );
}

export default ProjectDetail;
