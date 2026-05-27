-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 8 — Grid/Wheeling P6 seed
--
-- One demo wheeling agreement + four monthly charges spanning every state in
-- the lifecycle (paid, disputed, open, escalated). One resolved dispute on
-- the paid charge and one open dispute on the disputed charge.
-- ═══════════════════════════════════════════════════════════════════════════

-- Demo agreement (idempotent on id).
INSERT OR IGNORE INTO oe_wheeling_agreements
  (id, generator_id, offtaker_id, injection_point, withdrawal_point,
   contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh,
   status, dispute_window_days, effective_from, notes)
VALUES
  ('whl_demo_001',
   'ipp-developer-user', 'offtaker-user',
   'Mookgophong 132kV', 'Sandton 132kV',
   30, 4.5, 175,
   'active', 14, '2026-01-01',
   'Wave 8 demo wheeling: 30 MW solar, 4.5% loss factor, R175/MWh');

-- February charge — paid in full after one disputed-and-resolved cycle.
INSERT OR IGNORE INTO oe_grid_wheeling_charges
  (id, agreement_id, period_month, issued_by, issued_at,
   transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
   loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
   status, dispute_deadline_at, paid_at, paid_by, paid_amount_zar, notes)
VALUES
  ('chg_demo_1', 'whl_demo_001', '2026-02', 'grid-operator-user',
   '2026-03-01T08:00:00Z',
   18000, 175, 4.5,
   810, 3150000, 141750, 25000, 3316750,
   'paid', '2026-03-15T08:00:00Z',
   '2026-03-20T11:00:00Z', 'offtaker-user', 3290000,
   'Disputed on transmission MWh; offtaker accepted resolution at R3.29M.');

-- March charge — actively disputed, deadline still in future.
INSERT OR IGNORE INTO oe_grid_wheeling_charges
  (id, agreement_id, period_month, issued_by, issued_at,
   transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
   loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
   status, dispute_deadline_at, notes)
VALUES
  ('chg_demo_2', 'whl_demo_001', '2026-03', 'grid-operator-user',
   '2026-04-01T08:00:00Z',
   19500, 175, 4.5,
   877.5, 3412500, 153562.50, 28000, 3594062.50,
   'disputed', '2026-06-05T08:00:00Z',
   'Offtaker disputed ancillaries line — meter reconciliation in progress.');

-- April charge — newly issued, awaiting offtaker confirmation.
INSERT OR IGNORE INTO oe_grid_wheeling_charges
  (id, agreement_id, period_month, issued_by, issued_at,
   transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
   loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
   status, dispute_deadline_at, notes)
VALUES
  ('chg_demo_3', 'whl_demo_001', '2026-04', 'grid-operator-user',
   '2026-05-25T08:00:00Z',
   17800, 175, 4.5,
   801, 3115000, 140175, 22500, 3277675,
   'open', '2026-06-08T08:00:00Z',
   'Standard monthly charge; awaiting payment.');

-- January charge — escalated to regulator after dispute deadline expired
-- without resolution.
INSERT OR IGNORE INTO oe_grid_wheeling_charges
  (id, agreement_id, period_month, issued_by, issued_at,
   transmission_mwh, tariff_zar_per_mwh, loss_factor_pct,
   loss_mwh, gross_zar, loss_zar, ancillaries_zar, total_zar,
   status, dispute_deadline_at, escalated_at, escalated_to, notes)
VALUES
  ('chg_demo_4', 'whl_demo_001', '2026-01', 'grid-operator-user',
   '2026-02-01T08:00:00Z',
   16500, 175, 4.5,
   742.5, 2887500, 129937.50, 24000, 3041437.50,
   'escalated', '2026-02-15T08:00:00Z',
   '2026-02-15T08:00:01Z', 'regulator',
   'Escalated to NERSA after deadline lapsed; dispute reason: loss factor calc.');

-- Resolved dispute against the paid Feb charge.
INSERT OR IGNORE INTO oe_grid_wheeling_disputes
  (id, charge_id, agreement_id, raised_by, raised_at, dispute_reason,
   claimed_amount_zar, status, resolved_by, resolved_at,
   resolution_amount_zar, resolution_notes)
VALUES
  ('dsp_demo_1', 'chg_demo_1', 'whl_demo_001',
   'offtaker-user', '2026-03-05T10:00:00Z',
   'Disputed transmission MWh — claimed 17 900 not 18 000.',
   3290000, 'resolved', 'grid-operator-user', '2026-03-18T14:00:00Z',
   3290000, 'Meter audit confirmed 17 900 MWh; charge reduced.');

-- Open dispute against the March charge.
INSERT OR IGNORE INTO oe_grid_wheeling_disputes
  (id, charge_id, agreement_id, raised_by, raised_at, dispute_reason,
   claimed_amount_zar, status)
VALUES
  ('dsp_demo_2', 'chg_demo_2', 'whl_demo_001',
   'offtaker-user', '2026-04-10T11:00:00Z',
   'Ancillaries line item appears double-counted with separate Sept invoice.',
   3566062.50, 'open');
