-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 21 seed — 10 drawdown requests spanning every chain state × tier.
-- Mirrors realistic lender book: senior R1bn+ syndicated, mezz R100-500m,
-- equity injections <R100m. References cod_chain projects from Wave 20.
-- ═══════════════════════════════════════════════════════════════════════════

-- dd_001: requested / senior — Kathu II Solar 150MW construction loan tranche 1
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, sla_deadline_at, created_by
) VALUES (
  'dd_001', 'DD-2026-0001', 'fac_kathu_ii_senior', 'proj_kathu_ii', 'p_kathu_ii_ipp', 'p_lender_standard_bank',
  'Kathu II Solar 150MW', 'Kathu II Senior Term Loan R1.45bn', 'tranche_1_25pct_mobilisation', 362500000, 'senior', 'requested',
  '2026-05-25T08:00:00Z', '2026-05-28T08:00:00Z', 'system_seed'
);

-- dd_002: documents_submitted / senior — Jeffreys Bay 138T Extension 350MW tranche 1
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, sla_deadline_at, created_by
) VALUES (
  'dd_002', 'DD-2026-0002', 'fac_jeffreys_138t', 'proj_jeffreys_138t', 'p_globaleleq_ipp', 'p_lender_rmb_syndicate',
  'Jeffreys Bay 138T Extension 350MW', 'Globaleleq Senior Construction Facility R5.2bn', 'tranche_1_15pct_epc_mob', 780000000, 'senior', 'documents_submitted',
  '2026-05-20T09:00:00Z', '2026-05-22T16:30:00Z', '2026-05-24T16:30:00Z', 'system_seed'
);

-- dd_003: ie_review / senior — De Aar 200MWh BESS tranche 2 (Tesla Megapack)
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, ie_certifier, sla_deadline_at, created_by
) VALUES (
  'dd_003', 'DD-2026-0003', 'fac_de_aar_bess', 'proj_de_aar_bess', 'p_de_aar_bess_ipp', 'p_lender_nedbank',
  'De Aar 200MWh BESS', 'De Aar BESS Senior Facility R2.1bn', 'tranche_2_30pct_megapack_delivery', 630000000, 'senior', 'ie_review',
  '2026-05-01T08:00:00Z', '2026-05-04T11:00:00Z', '2026-05-06T09:00:00Z', 'Mott MacDonald (IE)', '2026-06-05T09:00:00Z', 'system_seed'
);

-- dd_004: cp_checklist / mezz — Loeriesfontein Extension 60MW (Murray & Roberts) tranche 3
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, cp_started_at, ie_certifier, ie_cert_doc_ref, sla_deadline_at, created_by
) VALUES (
  'dd_004', 'DD-2026-0004', 'fac_loeries_ext_mezz', 'proj_loeries_ext', 'p_mainstream_ipp', 'p_lender_absa',
  'Loeriesfontein Extension 60MW', 'Mainstream Mezz Facility R350m', 'tranche_3_40pct_mech_complete', 140000000, 'mezz', 'cp_checklist',
  '2026-05-10T08:00:00Z', '2026-05-11T14:00:00Z', '2026-05-13T09:00:00Z', '2026-05-22T16:00:00Z', 'Aurecon (IE)', 'IE-CERT-2026-LOER-0017', '2026-05-27T16:00:00Z', 'system_seed'
);

-- dd_005: on_hold / senior — Xina Solar One CSP 100MW (Sener) — IE query on receiver outage data
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, on_hold_at, ie_certifier, query_notes, sla_deadline_at, created_by
) VALUES (
  'dd_005', 'DD-2026-0005', 'fac_xina_solar_one', 'proj_xina_solar_one', 'p_acwa_xina_ipp', 'p_lender_dbsa',
  'Xina Solar One CSP 100MW', 'DBSA Senior Tranche R4.8bn', 'tranche_4_25pct_cold_commission', 1200000000, 'senior', 'on_hold',
  '2026-04-15T07:00:00Z', '2026-04-18T15:00:00Z', '2026-04-22T08:00:00Z', '2026-05-18T11:00:00Z', 'Mott MacDonald (IE)',
  'IE query: receiver outage telemetry incomplete — request 30-day continuous data export prior to cold-commission sign-off.',
  '2026-06-01T11:00:00Z', 'system_seed'
);

-- dd_006: approved / senior — Roggeveld 147MW Wind (Nordex Acciona) tranche 5 — CROSSES TO SARB
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, cp_started_at, approved_at,
  ie_certifier, ie_cert_doc_ref, cp_evidence_ref, sarb_disclosure_ref, sla_deadline_at, created_by
) VALUES (
  'dd_006', 'DD-2026-0006', 'fac_roggeveld_senior', 'proj_roggeveld_wind', 'p_red_rocket_ipp', 'p_lender_ifc_syndicate',
  'Roggeveld 147MW Wind', 'IFC/RMB Senior Construction R3.8bn', 'tranche_5_20pct_grid_sync', 760000000, 'senior', 'approved',
  '2026-04-01T08:00:00Z', '2026-04-03T16:00:00Z', '2026-04-05T08:00:00Z', '2026-05-05T16:00:00Z', '2026-05-15T14:30:00Z',
  'Mott MacDonald (IE)', 'IE-CERT-2026-ROGG-0048', 'CP-EVID-ROGG-0048', 'SARB-LEX-2026-Q2-0017', '2026-05-17T14:30:00Z', 'system_seed'
);

-- dd_007: funded / senior — Garob 145MW Solar (Acwa Power) reliability run tranche — funded last week
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, cp_started_at, approved_at, funded_at,
  ie_certifier, ie_cert_doc_ref, cp_evidence_ref, sarb_disclosure_ref, funding_account_ref, sla_deadline_at, created_by
) VALUES (
  'dd_007', 'DD-2026-0007', 'fac_garob_senior', 'proj_garob', 'p_acwa_garob_ipp', 'p_lender_standard_bank',
  'Garob 145MW Solar', 'Standard Bank Senior Term Loan R2.95bn', 'tranche_6_15pct_reliability_run', 442500000, 'senior', 'funded',
  '2026-04-10T08:00:00Z', '2026-04-12T16:00:00Z', '2026-04-15T08:00:00Z', '2026-05-08T16:00:00Z', '2026-05-18T14:30:00Z', '2026-05-20T10:00:00Z',
  'Mott MacDonald (IE)', 'IE-CERT-2026-GARB-0061', 'CP-EVID-GARB-0061', 'SARB-LEX-2026-Q2-0021', 'WIRE-REF-SBSA-20260520-0442500000', '2026-05-25T10:00:00Z', 'system_seed'
);

-- dd_008: closed / medium-mezz — Touwsrivier CPV 36MW post-COD operations conversion (medium project)
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, cp_started_at, approved_at, funded_at, closed_at,
  ie_certifier, ie_cert_doc_ref, cp_evidence_ref, funding_account_ref, created_by
) VALUES (
  'dd_008', 'DD-2026-0008', 'fac_touwsrivier_mezz', 'proj_touwsrivier_cpv', 'p_soitec_touws_ipp', 'p_lender_dbsa',
  'Touwsrivier CPV 36MW', 'DBSA Mezz Facility R380m', 'tranche_final_post_cod_conversion', 152000000, 'mezz', 'closed',
  '2026-04-20T08:00:00Z', '2026-04-22T16:00:00Z', '2026-04-25T08:00:00Z', '2026-05-02T16:00:00Z', '2026-05-08T14:30:00Z', '2026-05-10T10:00:00Z', '2026-05-18T16:00:00Z',
  'Mott MacDonald (IE)', 'IE-CERT-2026-TOUW-0042', 'CP-EVID-TOUW-0042', 'WIRE-REF-DBSA-20260510-0152000000', 'system_seed'
);

-- dd_009: rejected / mezz — Kangnas BoP 75MW (Group Five Energy) — IE flagged latent defects post-NTP
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, ie_review_at, ie_certifier, rejection_reason, created_by
) VALUES (
  'dd_009', 'DD-2026-0009', 'fac_kangnas_mezz', 'proj_kangnas', 'p_globaleleq_kangnas_ipp', 'p_lender_absa',
  'Kangnas BoP 75MW', 'Absa Mezzanine Facility R420m', 'tranche_2_post_ntp', 168000000, 'mezz', 'rejected',
  '2026-04-05T08:00:00Z', '2026-04-08T16:00:00Z', '2026-04-12T08:00:00Z',
  'Aurecon (IE)',
  'IE identified latent structural-foundation defects on Group Five BoP work — drawdown rejected pending remediation. IPP must resubmit after independent re-inspection.',
  'system_seed'
);

-- dd_010: cancelled / senior — Vredendal 110MW Solar (Black Rhino) — PPA collapse, drawdown surrendered
INSERT OR IGNORE INTO oe_drawdown_chain (
  id, drawdown_number, facility_id, project_id, participant_id, lender_id,
  project_name, facility_name, tranche_label, amount_zar, tranche_tier, chain_status,
  requested_at, documents_at, cancellation_reason, created_by
) VALUES (
  'dd_010', 'DD-2026-0010', 'fac_vredendal_senior', 'proj_vredendal', 'p_blackrhino_ipp', 'p_lender_rmb_syndicate',
  'Vredendal 110MW Solar', 'RMB Senior Facility R2.4bn', 'tranche_1_planned_mob', 600000000, 'senior', 'cancelled',
  '2026-03-15T08:00:00Z', '2026-03-18T16:00:00Z',
  'PPA renegotiation collapsed (Eskom price-discovery dispute) — IPP voluntarily surrendered bid-window allocation to DMRE. Construction loan tranche cancelled; bond claw-back triggered.',
  'system_seed'
);

-- ─── Audit events: per-row state-transition history ─────────────────────────

-- dd_001 (requested) — only the create event
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_001', 'dd_001', 'created', NULL, 'requested', 'system_seed', 'Drawdown request created — Kathu II senior tranche 1 (25% mobilisation milestone)', '{}', '2026-05-25T08:00:00Z');

-- dd_002 (documents_submitted)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_002', 'dd_002', 'created', NULL, 'requested', 'system_seed', 'Globaleleq Jeffreys Bay 350MW senior tranche 1', '{}', '2026-05-20T09:00:00Z'),
('dd_evt_003', 'dd_002', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'EPC certificate of progress + insurance proof submitted', '{}', '2026-05-22T16:30:00Z');

-- dd_003 (ie_review)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_004', 'dd_003', 'created', NULL, 'requested', 'system_seed', 'De Aar BESS senior tranche 2 (Tesla Megapack delivery)', '{}', '2026-05-01T08:00:00Z'),
('dd_evt_005', 'dd_003', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Megapack delivery POD + Tesla warranty bundle', '{}', '2026-05-04T11:00:00Z'),
('dd_evt_006', 'dd_003', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Mott MacDonald engaged for BESS commissioning diligence', '{"ie_certifier":"Mott MacDonald (IE)"}', '2026-05-06T09:00:00Z');

-- dd_004 (cp_checklist)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_007', 'dd_004', 'created', NULL, 'requested', 'system_seed', 'Mainstream Loeriesfontein Ext mezz tranche 3', '{}', '2026-05-10T08:00:00Z'),
('dd_evt_008', 'dd_004', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Murray & Roberts mech-completion certificate + 12-turbine punch list', '{}', '2026-05-11T14:00:00Z'),
('dd_evt_009', 'dd_004', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Aurecon engaged', '{"ie_certifier":"Aurecon (IE)"}', '2026-05-13T09:00:00Z'),
('dd_evt_010', 'dd_004', 'cp_passed', 'ie_review', 'cp_checklist', 'system_seed', 'IE sign-off + CP bundle entering checklist review', '{"ie_cert_doc_ref":"IE-CERT-2026-LOER-0017"}', '2026-05-22T16:00:00Z');

-- dd_005 (on_hold)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_011', 'dd_005', 'created', NULL, 'requested', 'system_seed', 'Acwa Power Xina Solar One CSP senior tranche 4 (cold-commission milestone)', '{}', '2026-04-15T07:00:00Z'),
('dd_evt_012', 'dd_005', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Sener cold-commission test logs submitted', '{}', '2026-04-18T15:00:00Z'),
('dd_evt_013', 'dd_005', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Mott MacDonald engaged', '{"ie_certifier":"Mott MacDonald (IE)"}', '2026-04-22T08:00:00Z'),
('dd_evt_014', 'dd_005', 'queried', 'ie_review', 'on_hold', 'system_seed', 'IE query: receiver outage telemetry incomplete', '{"query_notes":"IE query: receiver outage telemetry incomplete — request 30-day continuous data export prior to cold-commission sign-off."}', '2026-05-18T11:00:00Z');

-- dd_006 (approved — CROSSED to regulator: SARB-LEX-2026-Q2-0017)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_015', 'dd_006', 'created', NULL, 'requested', 'system_seed', 'Red Rocket Roggeveld 147MW senior tranche 5 (grid-sync milestone)', '{}', '2026-04-01T08:00:00Z'),
('dd_evt_016', 'dd_006', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Nordex Acciona sync-point report + 47-turbine perf curves', '{}', '2026-04-03T16:00:00Z'),
('dd_evt_017', 'dd_006', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Mott MacDonald engaged', '{"ie_certifier":"Mott MacDonald (IE)"}', '2026-04-05T08:00:00Z'),
('dd_evt_018', 'dd_006', 'cp_passed', 'ie_review', 'cp_checklist', 'system_seed', 'IE sign-off — entering CP review', '{"ie_cert_doc_ref":"IE-CERT-2026-ROGG-0048"}', '2026-05-05T16:00:00Z'),
('dd_evt_019', 'dd_006', 'approved', 'cp_checklist', 'approved', 'system_seed', 'Lender credit committee approved; SARB large-exposure disclosure filed', '{"amount_zar":760000000,"sarb_disclosure_ref":"SARB-LEX-2026-Q2-0017","crosses_to_regulator":true}', '2026-05-15T14:30:00Z');

-- dd_007 (funded — CROSSED at approval too)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_020', 'dd_007', 'created', NULL, 'requested', 'system_seed', 'Acwa Garob 145MW senior tranche 6 (reliability run)', '{}', '2026-04-10T08:00:00Z'),
('dd_evt_021', 'dd_007', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Reliability run start cert + 47-turbine perf logs', '{}', '2026-04-12T16:00:00Z'),
('dd_evt_022', 'dd_007', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Mott MacDonald engaged', '{"ie_certifier":"Mott MacDonald (IE)"}', '2026-04-15T08:00:00Z'),
('dd_evt_023', 'dd_007', 'cp_passed', 'ie_review', 'cp_checklist', 'system_seed', 'IE sign-off', '{"ie_cert_doc_ref":"IE-CERT-2026-GARB-0061"}', '2026-05-08T16:00:00Z'),
('dd_evt_024', 'dd_007', 'approved', 'cp_checklist', 'approved', 'system_seed', 'SBSA credit committee approved; SARB disclosure filed', '{"amount_zar":442500000,"sarb_disclosure_ref":"SARB-LEX-2026-Q2-0021","crosses_to_regulator":true}', '2026-05-18T14:30:00Z'),
('dd_evt_025', 'dd_007', 'funded', 'approved', 'funded', 'system_seed', 'Treasury wire executed', '{"funding_account_ref":"WIRE-REF-SBSA-20260520-0442500000"}', '2026-05-20T10:00:00Z');

-- dd_008 (closed)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_026', 'dd_008', 'created', NULL, 'requested', 'system_seed', 'Soitec Touwsrivier CPV final tranche (post-COD operations conversion)', '{}', '2026-04-20T08:00:00Z'),
('dd_evt_027', 'dd_008', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'COD certificate + final IE sign-off', '{}', '2026-04-22T16:00:00Z'),
('dd_evt_028', 'dd_008', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Mott MacDonald post-COD review', '{"ie_certifier":"Mott MacDonald (IE)"}', '2026-04-25T08:00:00Z'),
('dd_evt_029', 'dd_008', 'cp_passed', 'ie_review', 'cp_checklist', 'system_seed', 'IE sign-off', '{"ie_cert_doc_ref":"IE-CERT-2026-TOUW-0042"}', '2026-05-02T16:00:00Z'),
('dd_evt_030', 'dd_008', 'approved', 'cp_checklist', 'approved', 'system_seed', 'DBSA committee approved final tranche', '{"amount_zar":152000000}', '2026-05-08T14:30:00Z'),
('dd_evt_031', 'dd_008', 'funded', 'approved', 'funded', 'system_seed', 'Treasury wire executed', '{"funding_account_ref":"WIRE-REF-DBSA-20260510-0152000000"}', '2026-05-10T10:00:00Z'),
('dd_evt_032', 'dd_008', 'closed', 'funded', 'closed', 'system_seed', 'Post-funding compliance complete; facility moves to operations', '{}', '2026-05-18T16:00:00Z');

-- dd_009 (rejected at ie_review)
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_033', 'dd_009', 'created', NULL, 'requested', 'system_seed', 'Globaleleq Kangnas BoP mezz tranche 2 (post-NTP)', '{}', '2026-04-05T08:00:00Z'),
('dd_evt_034', 'dd_009', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Group Five Energy BoP completion certs', '{}', '2026-04-08T16:00:00Z'),
('dd_evt_035', 'dd_009', 'ie_review_started', 'documents_submitted', 'ie_review', 'system_seed', 'Aurecon engaged', '{"ie_certifier":"Aurecon (IE)"}', '2026-04-12T08:00:00Z'),
('dd_evt_036', 'dd_009', 'rejected', 'ie_review', 'rejected', 'system_seed', 'IE identified latent structural defects — drawdown rejected', '{"rejection_reason":"IE identified latent structural-foundation defects on Group Five BoP work — drawdown rejected pending remediation. IPP must resubmit after independent re-inspection."}', '2026-05-02T15:30:00Z');

-- dd_010 (cancelled at documents_submitted — CROSSES to regulator (senior cancel))
INSERT OR IGNORE INTO oe_drawdown_chain_events (id, drawdown_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
('dd_evt_037', 'dd_010', 'created', NULL, 'requested', 'system_seed', 'Black Rhino Vredendal 110MW senior tranche 1 (planned mob)', '{}', '2026-03-15T08:00:00Z'),
('dd_evt_038', 'dd_010', 'documents_submitted', 'requested', 'documents_submitted', 'system_seed', 'Planned mobilisation cost stack submitted', '{}', '2026-03-18T16:00:00Z'),
('dd_evt_039', 'dd_010', 'cancelled', 'documents_submitted', 'cancelled', 'system_seed', 'PPA renegotiation collapsed; bid-window allocation surrendered', '{"cancellation_reason":"PPA renegotiation collapsed (Eskom price-discovery dispute) — IPP voluntarily surrendered bid-window allocation to DMRE. Construction loan tranche cancelled; bond claw-back triggered."}', '2026-04-08T10:00:00Z');
