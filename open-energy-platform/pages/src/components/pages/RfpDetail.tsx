import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OEIcon } from '../OEIcon';
import { EntityFileShell } from '../file/EntityFileShell';
import { rfpFileTabs, rfpHero, type RfpFileData } from '../file/rfpFileConfig';

export function RfpDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <EntityFileShell<RfpFileData>
      endpoint={`/procurement/rfps/${id}/file`}
      entityKind="rfps"
      entityId={id}
      backHref="/procurement"
      backLabel="Procurement"
      heroFor={(data) => ({
        ...rfpHero(data),
        actions: (
          <>
            <button
              type="button"
              onClick={() => navigate('/procurement')}
              className="h-9 px-3 rounded-md text-white text-[12px] font-semibold inline-flex items-center gap-1"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.20)' }}
            >
              <OEIcon name="chevron-left" size={14} /> Procurement
            </button>
            {data.award?.linked_contract?.id && (
              <button
                type="button"
                onClick={() => navigate(`/contracts/${data.award.linked_contract.id}`)}
                className="h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1"
                style={{ background: '#fff', color: 'oklch(0.46 0.16 55)' }}
              >
                <OEIcon name="doc" size={14} /> Open contract file
              </button>
            )}
          </>
        ),
      })}
      summaryFor={(data) => data.summary}
      suggestionsFor={(data) => data.ai_suggestions}
      tabs={rfpFileTabs}
    />
  );
}

export default RfpDetail;
