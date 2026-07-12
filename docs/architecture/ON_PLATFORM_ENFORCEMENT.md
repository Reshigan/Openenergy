# On-Platform Enforcement

How the Open Energy Platform keeps transactions *on* the venue instead of leaking
to phone/email/spreadsheet side-deals. There is no single switch — enforcement is
four independent layers, each with its own failure mode covered by the next.

The design principle: **the cheapest, safest, most defensible way to transact must
also be the on-platform way.** We do not police participants; we make off-platform
the expensive, exposed, non-compliant path.

---

## Layer 1 — Economic moat (make on-platform the cheapest path)

Off-platform trades forfeit everything the venue clears for free:

| On-platform | Off-platform equivalent |
|---|---|
| Netted settlement (`close_out_netting`, ISDA s6(e)) — one net figure per counterparty | Gross bilateral cash movements, full credit exposure per trade |
| Certified REC / carbon issuance + registry transfer (`carbon_issuance`, `carbon_registry_transfer`, `rec_issuance`) | Un-serialised claims a buyer cannot resell or retire |
| Automatic imbalance / VWAP marks + margin (`counterparty_margin`, VWAP cron) | Manual mark disputes, no margin protection |
| Regulator-ready certified exports (NERSA/FSCA/SARB packs) | Build your own audit file per filing |

A participant who trades off-platform pays gross settlement, holds full per-trade
credit risk, gets an un-resellable certificate, and still has to hand-build every
regulatory export. The moat is the netting + custody + certification stack — it is
worth more than the spread saved by going around it.

## Layer 2 — Regulatory capture (make off-platform non-compliant)

SA energy trading already *requires* reporting. The platform is the reporting path,
so on-platform is the compliant path by construction:

- **`trade_reporting`** — FMA-style trade-repository ack gate. Every executed trade
  carries a reporting obligation the venue discharges automatically; an off-platform
  trade leaves the participant personally on the hook to report it, correctly, on time.
- **`fsca_conduct_report`** — conduct reporting the venue pre-populates.
- **Nightly reconciliation sweeps** (STRATE/SWIFT, SAP/Oracle ERP, CIPC/SARS/NERSA
  government-filing deadline sweep) reconcile venue records against external systems.
  A trade that exists in a counterparty's ERP but not on the venue surfaces as a
  **reconciliation break** — i.e. off-platform activity is *detectable*, not invisible.

Off-platform doesn't dodge the regulator; it just moves the compliance burden (and
the penalty for getting it wrong) back onto the participant.

## Layer 3 — Contractual (make off-platform a breach)

The framework chains carry the on-venue obligation in their own terms:

- **`contract_execution`** / **`isda_agreement`** / **`ppa_contract`** — the executed
  master agreement includes an on-venue exclusivity / all-trades-cleared clause for
  the covered product. Trading the same product off-venue is then a contractual breach,
  independently actionable, with **`dispute_resolution`** (Arbitration Act 2017) as the
  on-platform remedy path.
- Membership / participation terms (see `docs/legal` ToS) condition venue access on
  clearing covered transactions through the venue.

Because the contract itself is a chain (`settles:false` framework record), the
exclusivity term is executed, e-signed, and audit-chained on the platform — the same
tamper-evident log that would evidence a breach.

## Layer 4 — Structural (remove the off-platform capability)

The endgame: make off-platform mechanically impossible for the parts that matter.

- **Custody** — value and certificates settle against platform-held custody, not free
  bilateral transfer. You cannot deliver a REC/carbon unit you don't structurally
  control; the registry transfer *is* the platform (`carbon_registry_transfer`,
  `certificate_bundle`, export-custody invariants).
- **Settlement rails** — `virtual_ppa_settlement`, `settlement_fail` (buy-in gate) and
  the imbalance/margin cycle mean the money movement is a platform primitive. A future
  Escrow/Payment Durable Object (see CLAUDE.md §Durable Objects — not yet implemented)
  closes this fully: no custody DO today means settlement writes ledger rows against no
  payment rail, so Layer 4 is currently **partial** and Layers 1–3 carry the load.

---

## Honest status

| Layer | State |
|---|---|
| 1 Economic moat | **Live** — netting, certification, certified exports all shipping |
| 2 Regulatory | **Live** — trade_reporting + reconciliation sweeps detect breaks |
| 3 Contractual | **Live** — exclusivity clause rides executed framework chains |
| 4 Structural custody | **Partial** — registry custody live; payment-rail Escrow DO not yet built |

Enforcement today rests on 1–3 (economic + regulatory + contractual), with structural
custody live for certificates and pending for cash settlement. That ordering is
deliberate: the moat holds even before the walls are finished.
