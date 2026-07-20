// pages/src/meridian/surfaces/offtaker/CreditSupportSurface.tsx
//
// Meridian surface — "Credit support" (offtaker role). The register of payment-security /
// credit-support instruments backing the offtake book — guarantees, letters of credit, PCGs and
// cash collateral — read from GET /api/payment-security/chain (rows under data.items). Distinct
// from the ppa_payment_security chain Ledger/Thread (which drives an instrument through its
// lifecycle): this is the portfolio register showing cover ratio, issuer rating and expiry/SLA
// across every instrument. Read-only Bucket B surface. Registered as `offtaker:credit_support`,
// reached via the roleData feature key `credit_support`.
import React from 'react';
import { AutoTable } from '../lender/_AutoTable';

export default function CreditSupportSurface(_props: { role: string }) {
  return (
    <div>
      <div className="rounded-lg border border-[var(--line)] bg-[var(--raised)] px-4 py-3 mb-3 text-[12px] text-[var(--ink2)]">
        Payment-security instruments backing your PPAs (guarantees, letters of credit, parent-company
        guarantees, cash collateral). Cover months below 1.0 or an instrument near expiry should be
        repapered before the next billing cycle.
      </div>
      <AutoTable
        endpoint="/payment-security/chain"
        empty="No credit-support instruments on record."
        prefer={['security_number', 'instrument_type', 'instrument_name', 'issuer_name', 'issuer_rating',
          'secured_amount_zar_m', 'required_amount_zar_m', 'cover_months', 'ppa_reference', 'project_name',
          'expiry_date', 'chain_status', 'sla_deadline_at', 'sla_breached']}
      />
    </div>
  );
}
