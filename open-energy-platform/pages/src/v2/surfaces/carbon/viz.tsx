// pages/src/meridian/surfaces/carbon/viz.tsx
//
// Dataviz for the carbon-registry ListingTable surfaces. Each export is a
// `ListingTable.viz` — it receives the already-fetched rows and renders charts
// ABOVE the table (no extra fetch). Reuses the esumsom O&M primitives.
import React from 'react';
import { Grid2, Panel, NumBars, CountBars, GOOD } from '../esumsom/viz';

// ── Retirement certificates: retired volume by beneficiary + status funnel ───
export function certificatesViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Retired tCO₂e by beneficiary" subtitle="Volume retired on behalf of · top 8">
        <NumBars rows={rows} groupKey="beneficiary_name" metric="retired_volume_tco2e" fill={GOOD} />
      </Panel>
      <Panel title="Certificates by status" subtitle="Delivered → revoked lifecycle">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
    </Grid2>
  );
}

// ── Vintage workflow: retired + outstanding volume by stage ──────────────────
export function vintagesViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Retired tCO₂e by stage" subtitle="Volume retired at each workflow stage">
        <NumBars rows={rows} groupKey="current_stage" metric="retired_volume_tco2e" fill={GOOD} />
      </Panel>
      <Panel title="Outstanding tCO₂e by stage" subtitle="Volume still to be retired · where the backlog sits">
        <NumBars rows={rows} groupKey="current_stage" metric="outstanding_tco2e" />
      </Panel>
    </Grid2>
  );
}

// ── MRV submissions: reduction by project + verification status ──────────────
export function mrvViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Reduction tCO₂e by project" subtitle="Claimed reductions · top 8 projects">
        <NumBars rows={rows} groupKey="project_id" metric="reduction_tco2e" fill={GOOD} />
      </Panel>
      <Panel title="Submissions by status" subtitle="Submitted → verified → published lifecycle">
        <CountBars rows={rows} groupKey="status" colorByStatus />
      </Panel>
    </Grid2>
  );
}
