// ════════════════════════════════════════════════════════════════════════
// ContractDetail — /contracts/:id
//
// One screen, nine tabs, every related entity in scope. Composes the
// generic EntityFileShell with the contract-specific hero + tab map.
// The shell handles fetching, hero, KPI strip, AI suggestion strip, tab
// state (?tab=…) and the documents/discussion panel.
//
// The signing flow has moved into the Document tab (rendered body +
// signatories table). The Settlement tab is the holder for invoices,
// payments, disputes; the Variations tab is the holder for change orders
// and liquidated damages. See contractFileConfig.tsx for the tab map.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OEIcon } from '../OEIcon';
import { EntityFileShell } from '../file/EntityFileShell';
import { contractFileTabs, contractHero, type ContractFileData } from '../file/contractFileConfig';

export function ContractDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <EntityFileShell<ContractFileData>
      endpoint={`/contracts/${id}/file`}
      entityKind="contracts"
      entityId={id}
      backHref="/contracts"
      backLabel="All contracts"
      heroFor={(data) => ({
        ...contractHero(data),
        actions: (
          <>
            <button
              type="button"
              onClick={() => navigate('/contracts')}
              className="h-9 px-3 rounded-md bg-white/15 border border-white/20 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/25"
            >
              <OEIcon name="chevron-left" size={14} /> All contracts
            </button>
            {data.linked.project && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${data.linked.project.id}`)}
                className="h-9 px-3 rounded-md bg-white text-[#1a3a5c] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-[#f8fafc]/90"
              >
                <OEIcon name="flow" size={14} /> Open project file
              </button>
            )}
          </>
        ),
      })}
      summaryFor={(data) => data.summary}
      suggestionsFor={(data) => data.ai_suggestions}
      tabs={contractFileTabs}
    />
  );
}

export default ContractDetail;
