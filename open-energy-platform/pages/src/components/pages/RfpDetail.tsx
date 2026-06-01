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
              className="h-9 px-3 rounded-md bg-white/15 border border-white/20 text-white text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/25"
            >
              <OEIcon name="chevron-left" size={14} /> Procurement
            </button>
            {data.award?.linked_contract?.id && (
              <button
                type="button"
                onClick={() => navigate(`/contracts/${data.award.linked_contract.id}`)}
                className="h-9 px-3 rounded-md bg-white text-[#143d35] text-[12px] font-semibold inline-flex items-center gap-1 hover:bg-white/90"
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
