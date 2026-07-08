// pages/src/meridian/surfaces/ipp/viz.tsx
//
// Dataviz for the IPP ListingTable surfaces. Each export is a `ListingTable.viz`
// — it receives the already-fetched rows and renders charts ABOVE the table
// (no extra fetch). Reuses the primitives from the esumsom O&M template.
import React from 'react';
import { Grid2, Panel, NumBars, CountBars } from '../esumsom/viz';

// ── GTIA: capacity by network operator + count by tier/status ────────────────
export function gtiaViz(rows: Record<string, unknown>[]): React.ReactNode {
  return (
    <Grid2>
      <Panel title="Installed capacity by network operator" subtitle="MW under grid-tie · top 8 operators">
        <NumBars rows={rows} groupKey="network_operator_name" metric="installed_capacity_mw" />
      </Panel>
      <Panel title="Applications by tier" subtitle="GTIA tier distribution across the pipeline">
        <CountBars rows={rows} groupKey="gtia_tier" />
      </Panel>
    </Grid2>
  );
}
