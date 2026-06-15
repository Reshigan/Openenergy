// ════════════════════════════════════════════════════════════════════════
// EsumsOmPage — /esums role workbench.
//
// Bundles the cockpit + CRUD list tabs for the Asset Intelligence module.
// Built on SuitePage so it inherits the platform's tab chrome + AI brief
// panel.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { SuitePage, TabSpec } from '../SuitePage';

export function EsumsOmPage() {
  // E2.2 — all tabs migrated out of this SuitePage husk into the Meridian model:
  //   • chain widgets (smart_meter_asset, generation_revenue_assurance, bess_soh, soiling_audit,
  //     esg_disclosure, cyber_incident) → /ledger/:chainKey;
  //   • ProtectionRelayTestTab (no chain descriptor) + every non-chain tab → standalone Meridian
  //     surfaces registered under the `esco:` prefix in pages/src/meridian/surfaces.tsx and
  //     reached from Atlas (⌘K) via their esumsDomains feature keys.
  // The page is retained as an empty husk so the legacy /esums route still resolves.
  const tabs: TabSpec[] = [];

  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Esums"
      subtitle="Asset Intelligence & Operations — the operational brain that connects physical assets to commercial outcomes."
      tabs={tabs}
      initialTab="cockpit"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}

export default EsumsOmPage;
