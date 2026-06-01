// ════════════════════════════════════════════════════════════════════════
// FundDetail — /funds/:id
//
// One screen, every related entity for a loan facility (fund) in scope.
// Composes the generic EntityFileShell with the fund-specific hero + tabs.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OEIcon } from '../OEIcon';
import { EntityFileShell } from '../file/EntityFileShell';
import { fundFileTabs, fundHero, type FundFileData } from '../file/fundFileConfig';

export function FundDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <EntityFileShell<FundFileData>
      endpoint={`/funder/facilities/${id}/file`}
      entityKind="facilities"
      entityId={id}
      backHref="/funds"
      backLabel="All funds"
      heroFor={(data) => ({
        ...fundHero(data),
        actions: (
          <>
            <button
              type="button"
              onClick={() => navigate('/funds')}
              className="h-9 px-3 rounded-md bg-white/15 border border-white/20 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/25"
            >
              <OEIcon name="chevron-left" size={14} /> Funds
            </button>
            {data.project?.id && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${data.project.id}`)}
                className="h-9 px-3 rounded-md bg-white text-[#0e3b6e] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/90"
              >
                <OEIcon name="workflow" size={14} /> Open project file
              </button>
            )}
          </>
        ),
      })}
      summaryFor={(data) => data.summary}
      suggestionsFor={(data) => data.ai_suggestions}
      tabs={fundFileTabs}
    />
  );
}

export default FundDetail;
