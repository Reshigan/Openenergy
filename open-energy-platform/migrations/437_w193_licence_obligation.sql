-- Wave 193: Licence Obligation Monitor
-- Tracks each individual condition attached to a generation licence (ERA 4/2006 ss.8-11)
-- with full state-machine compliance lifecycle per obligation per period.

CREATE TABLE IF NOT EXISTS oe_licence_obligations (
  id                    TEXT PRIMARY KEY,
  ipp_id                TEXT NOT NULL,
  licence_number        TEXT NOT NULL,
  obligation_ref        TEXT NOT NULL,
  obligation_class      TEXT NOT NULL CHECK (obligation_class IN (
                          'security_of_supply', 'environmental', 'financial',
                          'technical', 'administrative'
                        )),
  condition_description TEXT NOT NULL,
  compliance_period     TEXT NOT NULL,
  project_name          TEXT,
  chain_status          TEXT NOT NULL DEFAULT 'monitoring_active'
                          CHECK (chain_status IN (
                            'monitoring_active',
                            'assessment_due',
                            'evidence_gathered',
                            'evidence_submitted',
                            'under_review',
                            'query_raised',
                            'query_resolved',
                            'assessed_compliant',
                            'assessed_non_compliant',
                            'notice_issued',
                            'cure_active',
                            'cured',
                            'breached'
                          )),
  sla_deadline          TEXT,
  sla_breached          INTEGER NOT NULL DEFAULT 0,
  regulator_notified    INTEGER NOT NULL DEFAULT 0,
  actor_id              TEXT,
  reason                TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licence_obligations_status   ON oe_licence_obligations(chain_status);
CREATE INDEX IF NOT EXISTS idx_licence_obligations_class    ON oe_licence_obligations(obligation_class);
CREATE INDEX IF NOT EXISTS idx_licence_obligations_sla      ON oe_licence_obligations(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_licence_obligations_created  ON oe_licence_obligations(created_at);
CREATE INDEX IF NOT EXISTS idx_licence_obligations_actor    ON oe_licence_obligations(actor_id);
CREATE INDEX IF NOT EXISTS idx_licence_obligations_ipp      ON oe_licence_obligations(ipp_id);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, all 5 obligation classes,
-- mix of sla_breached and regulator_notified values

INSERT INTO oe_licence_obligations
  (id, ipp_id, licence_number, obligation_ref, obligation_class,
   condition_description, compliance_period, project_name,
   chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- 1. monitoring_active — administrative
('lice-001',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-001',
 'OBL-ADM-001',
 'administrative',
 'Annual submission of audited regulatory accounts and change-of-ownership notifications as required under ERA ss.8-11',
 '2025-Q4',
 'Goldrush Solar Farm Phase 1',
 'monitoring_active',
 '2026-02-14',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-01-01 08:00:00', '2026-01-01 08:00:00'),

-- 2. assessment_due — technical
('lice-002',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-001',
 'OBL-TECH-001',
 'technical',
 'Annual protective relay settings audit and fault-ride-through verification per NRS 097 and Grid Code Schedule D',
 '2025-Q4',
 'Goldrush Solar Farm Phase 1',
 'assessment_due',
 '2026-01-31',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-12-01 09:00:00', '2026-01-02 10:30:00'),

-- 3. evidence_gathered — financial
('lice-003',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-002',
 'OBL-FIN-001',
 'financial',
 'Submission of audited financial statements and confirmation of performance bond maintenance per ERA s.8(2)(c)',
 '2025-FY',
 'Goldrush Wind Energy Park',
 'evidence_gathered',
 '2026-02-21',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-01-15 11:00:00', '2026-01-20 14:00:00'),

-- 4. evidence_submitted — environmental
('lice-004',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-002',
 'OBL-ENV-001',
 'environmental',
 'Annual EMP compliance report covering waste management, noise monitoring, and biodiversity offset commitments per NEMA s.28',
 '2025-FY',
 'Goldrush Wind Energy Park',
 'evidence_submitted',
 '2026-01-29',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-01-05 08:00:00', '2026-01-17 16:00:00'),

-- 5. under_review — security_of_supply (SLA breached)
('lice-005',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-003',
 'OBL-SOS-001',
 'security_of_supply',
 'Quarterly dispatch availability reporting and emergency operating procedure certification per Grid Code CSC-1',
 '2025-Q3',
 'Goldrush Battery Storage',
 'under_review',
 '2025-10-07',
 1, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-09-30 09:00:00', '2025-10-10 11:00:00'),

-- 6. query_raised — technical
('lice-006',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-001',
 'OBL-TECH-002',
 'technical',
 'Grid Code Schedule F compliance verification for reactive power capability and voltage regulation at point of connection',
 '2025-H2',
 'Goldrush Solar Farm Phase 1',
 'query_raised',
 '2026-01-30',
 0, 0,
 'regulator@openenergy.co.za',
 'NERSA requests clarification on reactive power test methodology and verification equipment calibration records',
 '2025-12-15 10:00:00', '2026-01-12 14:30:00'),

-- 7. query_resolved — financial
('lice-007',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-002',
 'OBL-FIN-002',
 'financial',
 'Insurance maintenance confirmation for operational all-risks and public liability cover as required under licence schedule',
 '2025-FY',
 'Goldrush Wind Energy Park',
 'query_resolved',
 '2026-02-05',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Insurance renewal confirmation and updated certificate of insurance submitted to NERSA records office',
 '2025-12-20 09:00:00', '2026-01-18 15:00:00'),

-- 8. assessed_compliant — administrative (REST STATE)
('lice-008',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2024-001',
 'OBL-ADM-002',
 'administrative',
 'Annual submission of key personnel declarations and contact updates for NERSA licence register under ERA s.8(2)(a)',
 '2024-FY',
 'Goldrush Solar Farm Phase 1',
 'assessed_compliant',
 '2025-03-15',
 0, 0,
 'regulator@openenergy.co.za',
 'All administrative filings received within prescribed period and verified against NERSA register',
 '2025-01-01 08:00:00', '2025-03-10 09:00:00'),

-- 9. assessed_non_compliant — environmental (regulator_notified=1)
('lice-009',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-003',
 'OBL-ENV-002',
 'environmental',
 'Noise monitoring boundary compliance as required by DEA environmental authorisation condition 4.3 and municipal bylaw',
 '2025-Q2',
 'Goldrush Battery Storage',
 'assessed_non_compliant',
 '2025-08-14',
 1, 1,
 'regulator@openenergy.co.za',
 'Noise levels exceeded permitted boundary thresholds at two monitoring points; DFFE notified per NEMA s.30',
 '2025-07-01 09:00:00', '2025-08-20 14:00:00'),

-- 10. notice_issued — security_of_supply (regulator_notified=1, SLA breached)
('lice-010',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-003',
 'OBL-SOS-002',
 'security_of_supply',
 'Annual spinning reserve availability test and dispatch declaration under Grid Code C-2 and SOC standing instructions',
 '2025-Q1',
 'Goldrush Battery Storage',
 'notice_issued',
 '2025-04-07',
 1, 1,
 'regulator@openenergy.co.za',
 'NERSA formal non-compliance notice issued; plant failed spinning reserve availability test below 90 percent contracted level',
 '2025-03-01 08:00:00', '2025-04-15 10:00:00'),

-- 11. cure_active — financial
('lice-011',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2025-002',
 'OBL-FIN-003',
 'financial',
 'Performance bond maintenance at required coverage level per REIPPPP Implementation Agreement schedule 14',
 '2025-H1',
 'Goldrush Wind Energy Park',
 'cure_active',
 '2025-09-05',
 1, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'Licensee has commenced cure period; replacement performance bond being arranged with Standard Bank project finance desk',
 '2025-05-01 09:00:00', '2025-08-10 12:00:00'),

-- 12. cured — environmental (TERMINAL +)
('lice-012',
 'id_7c352b86da89907a85266a250e15db95',
 'GEN-NERSA-2024-002',
 'OBL-ENV-003',
 'environmental',
 'Biodiversity offset implementation verification for rehabilitation of disturbed land areas per environmental authorisation schedule 2',
 '2024-H2',
 'Goldrush Solar Farm Phase 2',
 'cured',
 '2025-02-14',
 0, 1,
 'regulator@openenergy.co.za',
 'Rehabilitation works verified by independent ecological specialist; NERSA and DFFE satisfied that non-compliance has been remediated',
 '2024-08-01 08:00:00', '2025-02-12 16:00:00');
