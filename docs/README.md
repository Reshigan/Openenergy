# Docs

Repo documentation, grouped by purpose. Code-level guidance lives in the root
[CLAUDE.md](../CLAUDE.md); the product pitch lives in the root [README.md](../README.md).

## architecture/
Platform design, data, and build plans.
- [DATABASE_INFRASTRUCTURE_GUIDE.md](architecture/DATABASE_INFRASTRUCTURE_GUIDE.md) — sharded D1, R2 vault, KV TTLs, migration discipline
- [ECOSYSTEM_REBUILD_BLUEPRINT.md](architecture/ECOSYSTEM_REBUILD_BLUEPRINT.md) — additive cascade / commercial / cross-role layers
- [CROSS_ROLE_DEAL_ENGINE_PLAN.md](architecture/CROSS_ROLE_DEAL_ENGINE_PLAN.md) — cross-role deal engine
- [ROLE_FEATURE_IMPLEMENTATION_GUIDE.md](architecture/ROLE_FEATURE_IMPLEMENTATION_GUIDE.md) — per-role feature build guide
- [PRODUCT.md](architecture/PRODUCT.md) — product scope

## design/
UX, frontend, and journey work.
- [DESIGN.md](design/DESIGN.md)
- [MERIDIAN_REDESIGN.md](design/MERIDIAN_REDESIGN.md)
- [MERIDIAN_IMPLEMENTATION_PLAN.md](design/MERIDIAN_IMPLEMENTATION_PLAN.md)
- [MERIDIAN_EXECUTION_PROCESS.md](design/MERIDIAN_EXECUTION_PROCESS.md)
- [FRONTEND_REDESIGN_PLAN.md](design/FRONTEND_REDESIGN_PLAN.md)
- [UI_DESIGN_IMPROVEMENT_PLAN.md](design/UI_DESIGN_IMPROVEMENT_PLAN.md)
- [USER_JOURNEYS.md](design/USER_JOURNEYS.md)
- [JOURNEY_AUDIT.md](design/JOURNEY_AUDIT.md)

## operations/
Go-live, readiness, national rollout, UAT. The transition-to-support material.
- [GO_LIVE_READINESS.md](operations/GO_LIVE_READINESS.md) — go-live ledger
- [GO_LIVE_FINAL_ACTIONS.md](operations/GO_LIVE_FINAL_ACTIONS.md)
- [GO_LIVE_FIX_LOOP_REPORT_2026_06.md](operations/GO_LIVE_FIX_LOOP_REPORT_2026_06.md)
- [PROD_LIVE_SIM_FINDINGS.md](operations/PROD_LIVE_SIM_FINDINGS.md)
- [NATIONAL_DEPLOYMENT_EVALUATION.md](operations/NATIONAL_DEPLOYMENT_EVALUATION.md)
- [TESTING_VALIDATION_CHECKLIST.md](operations/TESTING_VALIDATION_CHECKLIST.md)

## commercial/
Investor and due-diligence collateral. Not tracked in git (see `.gitignore`).
- CEC_INVESTEC_DD_TECHNICAL_REGULATORY.md / .pdf — Investec Section 4.1 responses
- CEC_PLATFORM_DUE_DILIGENCE_NTT.md
