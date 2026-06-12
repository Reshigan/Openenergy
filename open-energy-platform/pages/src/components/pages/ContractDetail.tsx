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

const ACC    = 'oklch(0.46 0.12 230)';
const TX2    = 'oklch(0.40 0.009 250)';
const BORDER = 'oklch(0.87 0.006 250)';

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
              style={{
                height: 34, padding: '0 12px', borderRadius: 6,
                background: 'transparent', border: `1px solid ${BORDER}`,
                color: TX2, fontSize: 12, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                cursor: 'pointer',
              }}
            >
              <OEIcon name="chevron-left" size={13} /> All contracts
            </button>
            {data.linked.project && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${data.linked.project.id}`)}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 6,
                  background: ACC, border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  cursor: 'pointer',
                }}
              >
                <OEIcon name="flow" size={13} /> Open project file
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
