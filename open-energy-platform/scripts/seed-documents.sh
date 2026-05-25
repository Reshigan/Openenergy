#!/usr/bin/env bash
# seed-documents.sh
#
# Generates 30+ realistic-looking PDFs (PPAs, LOIs, term sheets, NDAs,
# insurance certs, tax clearance, audited financials, EIA reports,
# NERSA licences, retirement certificates, drawdown packages, board
# resolutions, KYC packs), uploads them to local R2, and inserts the
# metadata rows linking via `contract_documents.r2_key`.
#
# Idempotent: re-running overwrites the R2 objects and uses
# `INSERT OR IGNORE` against stable doc IDs.
#
# Hard-coded to local D1; for prod, swap `wrangler ... --local` for
# `... --remote` and update the R2 binding accordingly.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/oe-doc-seed.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

# ─── 1. Build minimal-valid PDFs using a Python helper ───────────────────────
PDF_GEN="$TMP_DIR/gen_pdf.py"
cat > "$PDF_GEN" <<'PYEOF'
#!/usr/bin/env python3
"""Tiny PDF writer — single-page A4, no external deps.

Usage: gen_pdf.py <out.pdf> <title> <line1> [line2 ...]
"""
import sys, os

def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

def build_pdf(title: str, lines):
    # Build content stream
    cs = ['BT']
    cs.append('/F1 18 Tf 72 760 Td')
    cs.append(f'({esc(title)}) Tj')
    cs.append('/F1 11 Tf 0 -36 Td')
    for ln in lines:
        cs.append(f'({esc(ln)}) Tj 0 -16 Td')
    cs.append('ET')
    stream = '\n'.join(cs).encode('latin-1', errors='replace')

    objs = []
    objs.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    objs.append(b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
    objs.append(
        b'<< /Type /Page /Parent 2 0 R '
        b'/MediaBox [0 0 595 842] '
        b'/Resources << /Font << /F1 5 0 R >> >> '
        b'/Contents 4 0 R >>'
    )
    objs.append(
        b'<< /Length ' + str(len(stream)).encode() +
        b' >>\nstream\n' + stream + b'\nendstream'
    )
    objs.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    out = b'%PDF-1.4\n'
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref_pos = len(out)
    out += f'xref\n0 {len(objs)+1}\n'.encode()
    out += b'0000000000 65535 f \n'
    for off in offsets:
        out += f'{off:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF'.encode()
    return out

def main():
    args = sys.argv[1:]
    if len(args) < 2:
        sys.stderr.write('usage: gen_pdf.py out.pdf title [line ...]\n')
        sys.exit(2)
    out_path, title = args[0], args[1]
    lines = args[2:]
    data = build_pdf(title, lines)
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    with open(out_path, 'wb') as f:
        f.write(data)
    print(out_path)

if __name__ == '__main__':
    main()
PYEOF
chmod +x "$PDF_GEN"

# ─── 2. Define the corpus ────────────────────────────────────────────────────
# Format: ID|TYPE|TITLE|CREATOR|COUNTERPARTY|PROJECT|PHASE|R2_KEY|LINE1|LINE2|LINE3|LINE4|LINE5
#
# TYPE must match the contract_documents.document_type CHECK constraint.
# For document categories outside that constraint (insurance, KYC, EIA, NERSA
# certs, retirement certs, board resolutions, audited financials), we drop
# them into R2 only — the rows on the relevant tables (ipp_permits,
# carbon_retirements, etc.) already reference the r2 key paths via this script.

DOCS_CSV="$TMP_DIR/docs.tsv"
cat > "$DOCS_CSV" <<'CSV'
doc-vid-loi-01	loi	LOI — De Aar 75MW Solar PV PPA	demo_offtaker_001	demo_ipp_002	ip_004	loi	contracts/loi/de-aar-75mw-2026.pdf	Letter of Intent — 15-year solar PPA	Volume: 220 GWh/year baseload-equivalent	Price: ZAR 1,165/MWh CPI-escalated (cap 6%)	Conditions Precedent: NERSA + EIA + Financial Close	Signatories: Anchor Offtaker MD + Solar IPP 04 CEO
doc-vid-loi-02	loi	LOI — Gqeberha Port Wind + BESS Hybrid	demo_offtaker_001	demo_ipp_002	ip_007	loi	contracts/loi/gqeberha-wind-bess-2026.pdf	Letter of Intent — 20-year wind + storage PPA	Volume: 460 GWh/year + 40 MWh BESS	Price: ZAR 1,290/MWh blended	Ancillary services rights reserved by offtaker	Signed 2026-03-12 by both parties
doc-vid-loi-03	loi	LOI — Brits 25MW Rooftop Solar	demo_offtaker_001	demo_ipp_001	ip_003	draft	contracts/loi/brits-rooftop-25mw-2026.pdf	Draft LOI — 10-year distribution-level PPA	Volume: 48 GWh/year	Price: TBD CPI-linked	Subject to feasibility model finalisation	Status: DRAFT — internal review
doc-vid-ts-01	term_sheet	Term Sheet — Klerksdorp Refinancing	demo_lender_001	demo_ipp_001	ip_001	term_sheet	contracts/term-sheet/klerksdorp-refi-2026.pdf	Term Sheet — Refinancing Facility ZAR 480M	Tenor: 18 yrs	Rate: JIBAR + 425 bps	DSCR covenant: 1.20 floor (current 1.18 — workout)	Lender: Standard Bank + Nedbank Capital
doc-vid-ts-02	term_sheet	Term Sheet — De Aar Construction Facility	demo_lender_001	demo_ipp_002	ip_004	active	contracts/term-sheet/de-aar-construction-2025.pdf	Term Sheet — Construction Facility ZAR 680M	Tenor: 4 yrs (construction) + 14 yrs (term)	Rate: JIBAR + 480 bps	Drawdown: 8 tranches against milestone certificates	Lender consortium: Standard + EIB
doc-vid-ppa-01	ppa_btm	PPA — Klerksdorp 50MW Solar (executed)	demo_ipp_001	demo_offtaker_001	ip_001	active	contracts/ppa/klerksdorp-50mw-2024.pdf	Power Purchase Agreement	Project: Klerksdorp 50MW Solar PV	Term: 15 yrs from COD (2024-03-15)	Tariff: ZAR 1,180/MWh CPI-escalated	Counterparty: Anchor Offtaker — C&I Mining Group
doc-vid-ppa-02	ppa_wheeling	PPA — Mookgopong 40MW Wind (Wheeling)	demo_ipp_002	demo_offtaker_001	ip_002	active	contracts/ppa/mookgopong-40mw-2023.pdf	Power Purchase Agreement (Wheeling)	Project: Mookgopong 40MW Wind	Term: 18 yrs from COD	Tariff: ZAR 1,210/MWh CPI-escalated	Wheeling tariff per Eskom UoS schedule
doc-vid-ppa-03	ppa_wheeling	PPA — Jeffreys Bay 120MW Wind	demo_ipp_002	demo_offtaker_001	ip_005	active	contracts/ppa/jeffreys-bay-120mw-2022.pdf	Power Purchase Agreement	Project: Jeffreys Bay 120MW Wind	Term: 20 yrs from COD (2022-09)	Tariff: ZAR 1,175/MWh	Annual volume: 380 GWh
doc-vid-nda-01	nda	Mutual NDA — De Aar PPA Negotiation	demo_offtaker_001	demo_ipp_002	ip_004	active	contracts/nda/de-aar-nda-2025.pdf	Mutual Non-Disclosure Agreement	Term: 3 yrs	Scope: All commercial and technical info disclosed	Parties: Anchor Offtaker + Solar IPP 04	Governing law: South Africa
doc-vid-nda-02	nda	Mutual NDA — Gqeberha Hybrid Negotiation	demo_offtaker_001	demo_ipp_002	ip_007	active	contracts/nda/gqeberha-nda-2025.pdf	Mutual Non-Disclosure Agreement	Term: 5 yrs	Parties: Anchor Offtaker + Wind IPP 03	Governing law: South Africa	Standard ZA NDA template
doc-vid-epc-01	epc	EPC Contract — De Aar 75MW Solar	demo_ipp_002	demo_ipp_002	ip_004	active	contracts/epc/de-aar-epc-2025.pdf	Engineering Procurement and Construction	Contractor: Juwi Renewable Energy SA	Contract sum: ZAR 580M (turnkey)	Delivery: 18 months from NTP	LD: 0.5% per week of contract value
doc-vid-carb-01	carbon_purchase	ERPA — Klerksdorp REC sale	demo_ipp_001	demo_carbon_001	ip_001	active	contracts/erpa/klerksdorp-erpa-2025.pdf	Emission Reduction Purchase Agreement	Project: Klerksdorp 50MW Solar PV	Volume: 30,000 tCO2e/year	Price: ZAR 285/tCO2e	Vintage: 2025-2030
doc-vid-loi-04	loi	LOI — Jeffreys Bay PPA renewal	demo_offtaker_001	demo_ipp_002	ip_005	active	contracts/loi/jeffreys-bay-renewal-2026.pdf	LOI — PPA term extension	Original term ending 2042; extension requested	Proposed extension: 5 yrs at indexed tariff	Both parties signed 2026-03-12	Status: Active — proceeding to definitive PPA
CSV

# ─── 3. Generate PDFs for the contract_documents entries ────────────────────
generate_pdf() {
  local id=$1 title=$2 r2key=$3 l1=$4 l2=$5 l3=$6 l4=$7 l5=$8
  local out="$TMP_DIR/$(basename "$r2key")"
  python3 "$PDF_GEN" "$out" \
    "$title" \
    "$l1" \
    "$l2" \
    "$l3" \
    "$l4" \
    "$l5" \
    "" \
    "Document ID: $id" \
    "Issued: $(date +%Y-%m-%d)" \
    "Open Energy Platform — anonymised demo corpus" >/dev/null
  echo "$out"
}

echo "==> Generating contract_documents PDFs"
while IFS=$'\t' read -r id type title creator counterparty project phase r2key l1 l2 l3 l4 l5; do
  [ -z "$id" ] && continue
  pdf=$(generate_pdf "$id" "$title" "$r2key" "$l1" "$l2" "$l3" "$l4" "$l5")
  size=$(wc -c < "$pdf")
  echo "  $id  $r2key  ($size bytes)"
  wrangler r2 object put "open-energy-vault/$r2key" --file "$pdf" --local 2>&1 | tail -1 || true
done < "$DOCS_CSV"

# ─── 4. Insert/upsert contract_documents rows ────────────────────────────────
echo "==> Inserting contract_documents rows"
while IFS=$'\t' read -r id type title creator counterparty project phase r2key l1 l2 l3 l4 l5; do
  [ -z "$id" ] && continue
  wrangler d1 execute open-energy-db --local --command "
    INSERT OR IGNORE INTO contract_documents
      (id, title, document_type, phase, creator_id, counterparty_id, project_id, r2_key,
       integrity_seal, version, tenant_id, created_at, updated_at)
    VALUES
      ('$id', '$(echo "$title" | sed "s/'/''/g")', '$type', '$phase',
       '$creator', '$counterparty', '$project',
       '$r2key', 'sha256:demo-seed-$id', 'v1.0', 'default',
       datetime('now'), datetime('now'));
  " 2>&1 | tail -1 || true
done < "$DOCS_CSV"

# ─── 5. Generate companion docs (KYC, insurance, audited financials,
#       board resolutions, EIA, NERSA licences, retirement certs,
#       drawdown packages, tax clearance) — stored in R2 only ─────────────────
echo "==> Generating companion documents (R2-only)"

declare_doc() {
  local r2key=$1 title=$2 shift_n=2
  shift $shift_n
  local out="$TMP_DIR/$(echo "$r2key" | tr '/' '_')"
  python3 "$PDF_GEN" "$out" "$title" "$@" "" "Issued: $(date +%Y-%m-%d)" "Open Energy Platform — anonymised demo corpus" >/dev/null
  wrangler r2 object put "open-energy-vault/$r2key" --file "$out" --local 2>&1 | tail -1 || true
  echo "  $r2key"
}

# KYC packs
declare_doc "kyc/demo_ipp_001/kyc-pack-2026.pdf"  "KYC Pack — Solar IPP 01 (Pty) Ltd" "Company: Solar IPP 01 (Pty) Ltd" "CIPC: 2018/123456/07" "B-BBEE: Level 2" "Beneficial ownership: 4 entities identified" "PEP screening: clear (2026-04-12)"
declare_doc "kyc/demo_ipp_002/kyc-pack-2026.pdf"  "KYC Pack — Wind IPP 03 (Pty) Ltd" "Company: Wind IPP 03 (Pty) Ltd" "CIPC: 2019/345678/07" "B-BBEE: Level 1" "Beneficial ownership: 6 entities identified" "PEP screening: clear (2026-04-08)"
declare_doc "kyc/demo_offtaker_001/kyc-pack-2026.pdf" "KYC Pack — Anchor Offtaker C&I Mining Group" "Industry: Mining & Metals" "CIPC: 2002/098765/06" "JSE-listed (Main Board)" "Beneficial ownership: per JSE-SRL disclosure" "PEP screening: clear (2026-04-15)"

# Insurance certificates
declare_doc "insurance/demo_ipp_001/public-liability-2026.pdf" "Public Liability Insurance — Solar IPP 01" "Insurer: Santam Insurance Ltd" "Cover: ZAR 600,000,000" "Period: 2026-01-01 to 2026-12-31" "Broker: Aon South Africa" "Premium: ZAR 2,840,000 p.a."
declare_doc "insurance/demo_ipp_001/business-interruption-2026.pdf" "Business Interruption Insurance — Solar IPP 01" "Insurer: Hollard Insurance" "Cover: ZAR 320,000,000 (12-month indemnity)" "Period: 2026-01-01 to 2026-12-31" "Broker: Aon South Africa" "Deductible: ZAR 5,000,000"
declare_doc "insurance/demo_ipp_002/public-liability-2026.pdf" "Public Liability Insurance — Wind IPP 03" "Insurer: Bryte Insurance" "Cover: ZAR 500,000,000" "Period: 2026-01-01 to 2026-12-31" "Broker: Marsh South Africa" "Premium: ZAR 2,150,000 p.a."

# Tax clearance certificates
declare_doc "tax/demo_ipp_001/tcs-2026.pdf"  "SARS Tax Compliance Status — Solar IPP 01" "Income Tax Reference: 9876543210" "VAT Reference: 4123456789" "Compliance status: Compliant" "Issue date: 2026-05-01" "Expiry: 2026-08-01 (90 days)"
declare_doc "tax/demo_ipp_002/tcs-2026.pdf"  "SARS Tax Compliance Status — Wind IPP 03" "Income Tax Reference: 9876543220" "VAT Reference: 4123456790" "Compliance status: Compliant" "Issue date: 2026-04-22" "Expiry: 2026-07-22 (90 days)"
declare_doc "tax/demo_offtaker_001/tcs-2026.pdf" "SARS Tax Compliance Status — Anchor Offtaker" "Income Tax Reference: 9123456789" "VAT Reference: 4987654321" "Compliance status: Compliant" "Issue date: 2026-03-30" "Expiry: 2026-06-30 (90 days)"

# Audited financials
declare_doc "financials/demo_ipp_001/audited-fs-2024.pdf" "Audited Financial Statements — Solar IPP 01" "Auditor: PwC South Africa" "Period: FY ended 31 Dec 2024" "Revenue: ZAR 218.4M" "EBITDA: ZAR 142.6M (65.3%)" "Audit opinion: Unqualified"
declare_doc "financials/demo_ipp_002/audited-fs-2024.pdf" "Audited Financial Statements — Wind IPP 03" "Auditor: Deloitte SA" "Period: FY ended 31 Dec 2024" "Revenue: ZAR 462.8M" "EBITDA: ZAR 318.5M (68.8%)" "Audit opinion: Unqualified"
declare_doc "financials/demo_offtaker_001/audited-fs-2024.pdf" "Audited Financial Statements — Anchor Offtaker" "Auditor: EY South Africa" "Period: FY ended 30 Jun 2024" "Revenue: ZAR 12.4B" "EBITDA: ZAR 3.8B (30.6%)" "Audit opinion: Unqualified"

# Board resolutions
declare_doc "board/demo_ipp_001/board-resolution-refi-2026.pdf" "Board Resolution — Refinancing Facility Approval" "Resolution No: BR-2026-014" "Date: 2026-04-20" "Subject: Refinancing of FAC-2026-001 facility" "Authorised: Up to ZAR 480M facility" "Signed by: 5 of 5 directors"
declare_doc "board/demo_ipp_002/board-resolution-loi-2026.pdf" "Board Resolution — Gqeberha LOI Authorisation" "Resolution No: BR-2026-008" "Date: 2026-03-10" "Subject: Authorisation of LOI for Gqeberha hybrid PPA" "Authorised: Negotiation through to definitive PPA" "Signed by: 7 of 7 directors"

# EIA reports
declare_doc "permits/ip_004/eia-appeal.pdf" "EIA Appeal — De Aar 75MW Solar" "DFFE Reference: DFFE-EA-2025-NC-0211" "Status: Appealed (community SPV)" "Tribunal scheduled: 2026-08-15" "Lead consultant: SLR Consulting" "Appeal grounds: Land-use disagreement (in mediation)"
declare_doc "permits/ip_007/eia.pdf" "EIA Authorisation — Gqeberha Port Wind Cluster" "DFFE Reference: DFFE-EA-2025-EC-0156" "Status: Granted with conditions" "Marine impact assessment: complete" "Lead consultant: CES Africa" "Conditions: quarterly noise + bat monitoring"
declare_doc "permits/ip_001/eia.pdf" "EIA Authorisation — Klerksdorp 50MW Solar PV" "DFFE Reference: DFFE-EA-2022-NC-0078" "Status: Granted with conditions" "Validity: 30 yrs from 2022" "Lead consultant: Royal HaskoningDHV" "Annual avian monitoring required"

# NERSA generation licences
declare_doc "permits/ip_001/nersa-gl.pdf" "NERSA Generation Licence — Solar IPP 01" "Licence number: NERSA-GL-2023-0142" "Date granted: 2023-04-10" "Validity: 25 yrs" "Grid Code compliance: required" "Annual report to NERSA due 31 March"
declare_doc "permits/ip_002/nersa-gl.pdf" "NERSA Generation Licence — Wind IPP 03 (Mookgopong)" "Licence number: NERSA-GL-2022-0089" "Date granted: 2022-08-15" "Validity: 25 yrs" "Grid Code compliance: required" "Annual report to NERSA due 31 March"
declare_doc "permits/ip_004/nersa-gl.pdf" "NERSA Generation Licence — Solar IPP 04 (De Aar)" "Licence number: NERSA-GL-2025-0118" "Date granted: 2025-12-20" "Conditional: EIA RoD by 2026-12-31" "Validity: 25 yrs from COD" "EIA appeal pending — 2026-08-15"
declare_doc "permits/ip_005/nersa-gl.pdf" "NERSA Generation Licence — Wind IPP 03 (Jeffreys Bay)" "Licence number: NERSA-GL-2021-0067" "Date granted: 2021-06-12" "Validity: 25 yrs" "Grid Code: 2020 + 2024 amendments" "Annual compliance: filed 2026-03-30"
declare_doc "permits/ip_007/nersa-gl.pdf" "NERSA Generation Licence — Gqeberha Port Wind Cluster" "Licence number: NERSA-GL-2026-0007" "Date granted: 2026-03-25" "Conditional: ancillary services framework" "BESS dispatch rights: pending" "Validity: 25 yrs from COD"

# Retirement certificates
declare_doc "carbon/certificates/OE-cf3a91bd.pdf" "Carbon Retirement Certificate OE-cf3a91bd" "Project: Klerksdorp Solar PV (Verra VCS-1842)" "Quantity retired: 2,400 tCO2e" "Vintage: 2025" "Beneficiary: Anchor Offtaker — C&I Mining Group" "Retired: $(date -v-30d +%Y-%m-%d 2>/dev/null || date -d '30 days ago' +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)"
declare_doc "carbon/certificates/OE-a7d24f01.pdf" "Carbon Retirement Certificate OE-a7d24f01" "Project: Mookgopong Wind (Gold Standard GS-2156)" "Quantity retired: 1,800 tCO2e" "Vintage: 2024" "Beneficiary: Industrial Aluminium SA Ltd" "Statutory basis: Carbon Tax Act 17/2019 §13"
declare_doc "carbon/certificates/OE-91e6b85c.pdf" "Carbon Retirement Certificate OE-91e6b85c" "Project: Jeffreys Bay Wind (Verra VCS-1903)" "Quantity retired: 3,200 tCO2e" "Vintage: 2025" "Beneficiary: Republic of South Africa — National Treasury" "Sovereign net-zero retirement"
declare_doc "carbon/certificates/OE-d50f7c39.pdf" "Carbon Retirement Certificate OE-d50f7c39" "Project: Klerksdorp Solar PV (Verra VCS-1842)" "Quantity retired: 420 tCO2e" "Vintage: 2025" "Beneficiary: UNFCCC Secretariat" "Conference offset: UNFCCC COP-31"

# Drawdown packages
declare_doc "drawdowns/dr_pending_001.pdf" "Drawdown Request — FAC-2026-001 (pending)" "Reference: DR-2026-007" "Facility: FAC-2026-001" "Amount: ZAR 42,000,000" "Purpose: Construction milestone 4 (modules delivery)" "Status: Submitted to lender consortium 2026-05-24"
declare_doc "drawdowns/dr_completed_006.pdf" "Drawdown Certificate — DR-2026-006 (paid)" "Reference: DR-2026-006" "Facility: FAC-2026-001" "Amount: ZAR 28,500,000" "Purpose: Construction milestone 3 (civils 50%)" "Paid: 2026-05-12 to IPP nominated account"

# Audit / governance docs
declare_doc "governance/audit-committee-charter-2026.pdf" "Audit Committee Charter — Open Energy Platform" "Adopted: 2026-01-15" "Composition: 5 members (3 independent)" "Meeting cadence: quarterly + special" "Scope: financial reporting + internal controls" "Tenure: 3-year rotating"

echo
echo "==> Document seed complete."
wrangler d1 execute open-energy-db --local --command "SELECT COUNT(*) as n FROM contract_documents" --json 2>&1 | tail -10
echo
echo "Done. Generated PDFs in $TMP_DIR (will be cleaned up). R2 objects persisted to local bucket."
