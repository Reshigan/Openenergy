// ─────────────────────────────────────────────────────────────────────────
// Wave 114 — IPP Document Control & Drawing Register chain.
//
// THIRD Phase-A IPP wave (sibling of W112 WBS & Gantt schedule and W113
// Cost & EVM). Owns the DRAWING REGISTER + DOCUMENT CONTROL discipline:
// upload → metadata indexing → revision open → IDC assignment → transmit
// to reviewer → review → comment → revise → approve → issue-for-
// construction → as-built finalised → archived. W112 owns the schedule.
// W113 owns the cost book. W114 owns "where is every drawing right now,
// is it under review, has it been transmitted to the engineer of record,
// is anyone holding up an IFC-blocker, do we have a clean as-built record
// at archive time?".
//
// Beats Aconex / Procore Documents / Bluebeam Studio / Newforma / Asite
// cmBuilder / Oracle Aconex / Bentley ProjectWise / Autodesk Construction
// Cloud Docs / SharePoint AECOM / e-Builder — each surfaces docs as a
// folder + a transmittal PDF; W114 turns it into a 12-state P6 doc-
// control chain with URGENT SLA polarity stored in HOURS, FLOOR-AT-
// SAFETY-CRITICAL on 5 contextual flags (hv_electrical / commissioning_
// critical_path / safety_signoff_required / ifc_blocking / regulatory_
// submittal), 3-step authority ladder (doc_controller →
// engineer_of_record → IPP_CEO), 20-field LIVE document-control
// battery (latest revision / IDC status / revisions count / authority /
// completeness / hash chain pre-stage / merkle root pre-stage / bridges
// to W112, W113, W19, W20, W18), and the SIGNATURE DOCUMENT-REJECT-
// CRITICAL EVERY-tier hard line.
//
// Standards: ISO 19650-1/2/3 (BIM/CDE) + AECOOEM ED2-2024 transmittal
// protocol + REIPPPP Schedule 2 document hand-over + DMRE site-records
// discipline + IEC 61355 (Classification & designation of documents for
// power plants) + ENAA EPC doc-control + FIDIC Silver Book §6.
//
// Forward path (clean drawing):
//   draft_uploaded → metadata_indexed → revision_open → IDC_assigned
//     → transmitted → reviewed → commented → revised → approved
//     → issued_for_construction → as_built_finalised → archived
//
// Branches:
//   any non-terminal → rejected   (TERMINAL — superseded by new revision)
//   any non-terminal → withdrawn  (TERMINAL — issuer pulled drawing
//                                  before approval)
//   review states    → hold       (SOFT PAUSE — can resume to reviewed)
//
// Tier RE-DERIVED on every transition from document_class with
// FLOOR-AT-SAFETY-CRITICAL on 5 contextual flags:
//   - hv_electrical                  (HV electrical SLDs, breakers,
//                                      transformer protection)
//   - commissioning_critical_path    (drawing gates commissioning step)
//   - safety_signoff_required        (must be reviewed + signed by SHEQ
//                                      authority before construction)
//   - ifc_blocking                   (other workfronts blocked until
//                                      this drawing is IFC'd)
//   - regulatory_submittal           (drawing forms part of NERSA / IPPO
//                                      / DMRE submittal package)
//
// 4 tiers (URGENT polarity — higher discipline-criticality = TIGHTER):
//   civil       : civil engineering, geotech, drainage
//   mechanical  : mechanical, BOP piping, valve schedule
//   electrical  : LV electrical, control & instrumentation
//   safety_critical : HV electrical SLDs, protection coordination,
//                     commissioning critical path, regulator submittals,
//                     any flag-triggered floor
//
// URGENT SLA polarity stored as HOURS. Anchor on transmitted (the moment
// the engineer of record has the drawing in their inbox, the IDC clock
// starts):
//   safety_critical × transmitted = 24  hrs (HV SLDs etc.)
//   electrical      × transmitted = 72  hrs
//   mechanical      × transmitted = 120 hrs
//   civil           × transmitted = 168 hrs (7 days)
// URGENT because the higher the discipline-criticality, the more an IFC
// delay propagates downstream — HV protection delay stalls commissioning,
// civil drainage redline can absorb a week.
//
// SIGNATURE Phase-A IPP regulator crossings (ISO 19650 + IEC 61355 +
// REIPPPP + DMRE + FIDIC Silver §6):
//   reject   → EVERY tier when safety_critical OR ifc_blocking
//               (W114 SIGNATURE DOCUMENT-REJECT-CRITICAL hard line —
//                rejecting a safety/IFC-blocking drawing creates an as-
//                built mismatch reportable to IE / IPPO; sister of W104-
//                W113 critical-action lines)
//   withdraw → EVERY tier when issued_for_construction state was reached
//               (post-IFC withdrawal = construction-record void)
//   approve  → safety_critical only when hv_electrical OR commissioning_
//               critical_path
//   archive  → no regulator
//   sla_breached → safety_critical + electrical only
//
// Write {admin, ipp_developer}. READ all 9 personas. actor_party split:
//   doc_controller       : upload_drawing, index_metadata, open_revision,
//                          assign_IDC, transmit, hold, resume, archive
//   engineer_of_record   : start_review, comment, revise, approve,
//                          issue_for_construction, finalise_as_built,
//                          reject
//   IPP_CEO              : withdraw
//
// Event prefix: `ipp_doc_control_evt_`. AUDIT_PREFIX_MAP entry:
//   ipp_doc_control: 'ipp'
//
// Two crons:
//   - */15 * * * *   SLA sweep (existing pattern)
//   - 25 0 * * *     NEW nightly IDC matrix recompute (refresh
//                     IDC_status_live without auto-transitioning)
// ─────────────────────────────────────────────────────────────────────────

export type IpdStatus =
  | 'draft_uploaded'
  | 'metadata_indexed'
  | 'revision_open'
  | 'IDC_assigned'
  | 'transmitted'
  | 'reviewed'
  | 'commented'
  | 'revised'
  | 'approved'
  | 'issued_for_construction'
  | 'as_built_finalised'
  | 'archived'
  | 'rejected'
  | 'withdrawn'
  | 'hold';

export type IpdAction =
  | 'upload_drawing'
  | 'index_metadata'
  | 'open_revision'
  | 'assign_IDC'
  | 'transmit'
  | 'start_review'
  | 'comment'
  | 'revise'
  | 'approve'
  | 'issue_for_construction'
  | 'finalise_as_built'
  | 'archive'
  | 'reject'
  | 'withdraw'
  | 'hold'
  | 'resume';

export type IpdTier =
  | 'civil'
  | 'mechanical'
  | 'electrical'
  | 'safety_critical';

export type IpdParty =
  | 'doc_controller'
  | 'engineer_of_record'
  | 'IPP_CEO';

export type IpdEvent =
  | 'ipp_doc_control_uploaded'
  | 'ipp_doc_control_indexed'
  | 'ipp_doc_control_revision_open'
  | 'ipp_doc_control_idc_assigned'
  | 'ipp_doc_control_transmitted'
  | 'ipp_doc_control_review_started'
  | 'ipp_doc_control_commented'
  | 'ipp_doc_control_revised'
  | 'ipp_doc_control_approved'
  | 'ipp_doc_control_issued_for_construction'
  | 'ipp_doc_control_as_built_finalised'
  | 'ipp_doc_control_archived'
  | 'ipp_doc_control_rejected'
  | 'ipp_doc_control_withdrawn'
  | 'ipp_doc_control_held'
  | 'ipp_doc_control_resumed'
  | 'ipp_doc_control_sla_breached';

// archived is HARD terminal (record finalised). rejected + withdrawn are
// soft-terminals (lifecycle of THIS revision ends; a new revision can be
// uploaded as a fresh chain). hold is a soft pause.
const HARD_TERMINALS = new Set<IpdStatus>([
  'archived',
]);

const UI_TERMINALS = new Set<IpdStatus>([
  'archived',
  'rejected',
  'withdrawn',
]);

export function isTerminal(s: IpdStatus): boolean {
  return UI_TERMINALS.has(s);
}

export function isHardTerminal(s: IpdStatus): boolean {
  return HARD_TERMINALS.has(s);
}

// All non-terminal states (used by cancel-like and hold-like fan-outs).
const ALL_NON_TERMINAL: IpdStatus[] = [
  'draft_uploaded',
  'metadata_indexed',
  'revision_open',
  'IDC_assigned',
  'transmitted',
  'reviewed',
  'commented',
  'revised',
  'approved',
  'issued_for_construction',
  'as_built_finalised',
  'hold',
];

// States from which hold can be entered — only review-touch states.
const HOLD_FROM: IpdStatus[] = [
  'transmitted',
  'reviewed',
  'commented',
  'revised',
];

// States from which a revision can be opened after a previous IFC
// (engineering change requests).
const REVISION_OPEN_FROM: IpdStatus[] = [
  'metadata_indexed',
  'issued_for_construction',
  'as_built_finalised',
];

export const TRANSITIONS: Record<IpdAction, { from: IpdStatus[]; to: IpdStatus }> = {
  upload_drawing:          { from: ['draft_uploaded'],                                       to: 'draft_uploaded' },
  index_metadata:          { from: ['draft_uploaded', 'metadata_indexed'],                   to: 'metadata_indexed' },
  open_revision:           { from: REVISION_OPEN_FROM,                                       to: 'revision_open' },
  assign_IDC:              { from: ['metadata_indexed', 'revision_open', 'IDC_assigned'],    to: 'IDC_assigned' },
  transmit:                { from: ['IDC_assigned', 'transmitted'],                          to: 'transmitted' },
  start_review:            { from: ['transmitted', 'reviewed'],                              to: 'reviewed' },
  comment:                 { from: ['reviewed', 'commented'],                                to: 'commented' },
  revise:                  { from: ['commented', 'revised'],                                 to: 'revised' },
  approve:                 { from: ['reviewed', 'commented', 'revised'],                     to: 'approved' },
  issue_for_construction:  { from: ['approved', 'issued_for_construction'],                  to: 'issued_for_construction' },
  finalise_as_built:       { from: ['issued_for_construction', 'as_built_finalised'],        to: 'as_built_finalised' },
  archive:                 { from: ['as_built_finalised'],                                   to: 'archived' },
  reject:                  { from: ALL_NON_TERMINAL,                                         to: 'rejected' },
  withdraw:                { from: ALL_NON_TERMINAL,                                         to: 'withdrawn' },
  hold:                    { from: HOLD_FROM,                                                to: 'hold' },
  resume:                  { from: ['hold'],                                                 to: 'reviewed' },
};

export function nextStatus(current: IpdStatus, action: IpdAction): IpdStatus | null {
  if (HARD_TERMINALS.has(current)) return null;
  if (action === 'upload_drawing' && current !== 'draft_uploaded') return null;
  const t = TRANSITIONS[action];
  if (!t) return null;
  if (!t.from.includes(current)) return null;
  return t.to;
}

export function allowedActions(current: IpdStatus): IpdAction[] {
  if (HARD_TERMINALS.has(current)) return [];
  const acts: IpdAction[] = [];
  for (const [a, t] of Object.entries(TRANSITIONS) as [IpdAction, typeof TRANSITIONS[IpdAction]][]) {
    if (a === 'upload_drawing') continue; // create-only
    if (t.from.includes(current)) acts.push(a);
  }
  return acts;
}

// URGENT SLA polarity stored as HOURS. 0 == no SLA. Higher discipline
// criticality (safety_critical) gets the TIGHTEST window — because an
// HV protection drawing delay propagates straight into commissioning.
const HOUR = 1;
const DAY = 24 * HOUR;

export const SLA_HOURS: Record<IpdStatus, Record<IpdTier, number>> = {
  draft_uploaded:           { safety_critical: 12,  electrical: 24,  mechanical: 48,  civil: 72 },
  metadata_indexed:         { safety_critical: 12,  electrical: 24,  mechanical: 48,  civil: 72 },
  revision_open:            { safety_critical: 12,  electrical: 24,  mechanical: 48,  civil: 72 },
  IDC_assigned:             { safety_critical: 12,  electrical: 24,  mechanical: 48,  civil: 72 },
  transmitted:              { safety_critical: 24,  electrical: 72,  mechanical: 120, civil: 168 }, // ANCHOR
  reviewed:                 { safety_critical: 24,  electrical: 48,  mechanical: 72,  civil: 96 },
  commented:                { safety_critical: 24,  electrical: 48,  mechanical: 72,  civil: 96 },
  revised:                  { safety_critical: 24,  electrical: 48,  mechanical: 72,  civil: 96 },
  approved:                 { safety_critical: 12,  electrical: 24,  mechanical: 48,  civil: 72 },
  issued_for_construction:  { safety_critical: 24,  electrical: 72,  mechanical: 120, civil: 168 },
  as_built_finalised:       { safety_critical: 48,  electrical: 96,  mechanical: 7 * DAY, civil: 10 * DAY },
  hold:                     { safety_critical: 48,  electrical: 96,  mechanical: 7 * DAY, civil: 10 * DAY },
  archived:                 { safety_critical: 0,   electrical: 0,   mechanical: 0,   civil: 0 },
  rejected:                 { safety_critical: 0,   electrical: 0,   mechanical: 0,   civil: 0 },
  withdrawn:                { safety_critical: 0,   electrical: 0,   mechanical: 0,   civil: 0 },
};

export function slaWindowHours(status: IpdStatus, tier: IpdTier): number {
  return SLA_HOURS[status]?.[tier] ?? 0;
}

export function slaDeadlineFor(status: IpdStatus, tier: IpdTier, enteredAt: Date): Date | null {
  const hrs = SLA_HOURS[status]?.[tier];
  if (!hrs) return null;
  return new Date(enteredAt.getTime() + hrs * 3600 * 1000);
}

// Tier RE-DERIVED from document_class.
export function tierForDocumentClass(documentClass: string | null | undefined): IpdTier {
  const cls = (documentClass || '').toLowerCase();
  if (cls === 'safety_critical' || cls === 'hv_electrical' || cls === 'protection') return 'safety_critical';
  if (cls === 'electrical' || cls === 'lv_electrical' || cls === 'controls' || cls === 'instrumentation') return 'electrical';
  if (cls === 'mechanical' || cls === 'bop' || cls === 'piping') return 'mechanical';
  return 'civil';
}

export interface IpdFloorFlags {
  hv_electrical?: boolean | number | null;
  commissioning_critical_path?: boolean | number | null;
  safety_signoff_required?: boolean | number | null;
  ifc_blocking?: boolean | number | null;
  regulatory_submittal?: boolean | number | null;
}

export function countFloorFlags(args: IpdFloorFlags): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  return (
    t(args.hv_electrical) +
    t(args.commissioning_critical_path) +
    t(args.safety_signoff_required) +
    t(args.ifc_blocking) +
    t(args.regulatory_submittal)
  );
}

// FLOOR-AT-SAFETY-CRITICAL on ANY one of the 5 contextual flags.
export function floorAtSafetyCritical(args: IpdFloorFlags): boolean {
  return countFloorFlags(args) >= 1;
}

export function effectiveTier(
  rawTier: IpdTier,
  flags: IpdFloorFlags,
): IpdTier {
  if (floorAtSafetyCritical(flags)) return 'safety_critical';
  return rawTier;
}

// Heavy tiers — safety_critical + electrical. SLA-breach reportability
// + signature crossings attach where not on universal hard lines.
const HEAVY_TIERS = new Set<IpdTier>(['safety_critical', 'electrical']);

export function isHeavyTier(tier: IpdTier): boolean {
  return HEAVY_TIERS.has(tier);
}

export function isReportable(tier: IpdTier): boolean {
  return tier === 'safety_critical';
}

// ─── SIGNATURE regulator crossings ──────────────────────────────────────
export function crossesIntoRegulator(
  action: IpdAction,
  tier: IpdTier,
  args: {
    flags?: IpdFloorFlags;
    reached_ifc?: boolean | null;
  },
): boolean {
  const flags = args.flags ?? {};
  const hvElec = !!flags.hv_electrical;
  const ccp = !!flags.commissioning_critical_path;
  const ifcBlocking = !!flags.ifc_blocking;
  const reachedIfc = !!args.reached_ifc;

  // W114 SIGNATURE: reject crosses regulator EVERY tier when
  // safety_critical OR ifc_blocking flag set (rejecting a safety/IFC-
  // blocking drawing creates an as-built mismatch reportable to IE/IPPO).
  if (action === 'reject') {
    return tier === 'safety_critical' || ifcBlocking;
  }

  // withdraw crosses regulator EVERY tier when issued_for_construction
  // was reached (post-IFC withdrawal = construction-record void).
  if (action === 'withdraw') {
    return reachedIfc;
  }

  // approve crosses regulator safety_critical only when hv_electrical
  // OR commissioning_critical_path.
  if (action === 'approve') {
    if (tier !== 'safety_critical') return false;
    return hvElec || ccp;
  }

  // archive does not cross regulator.
  return false;
}

export function slaBreachCrossesIntoRegulator(tier: IpdTier): boolean {
  return HEAVY_TIERS.has(tier);
}

// ─── Party + event names ────────────────────────────────────────────────
const ACTION_PARTY: Record<IpdAction, IpdParty> = {
  upload_drawing:          'doc_controller',
  index_metadata:          'doc_controller',
  open_revision:           'doc_controller',
  assign_IDC:              'doc_controller',
  transmit:                'doc_controller',
  hold:                    'doc_controller',
  resume:                  'doc_controller',
  archive:                 'doc_controller',
  start_review:            'engineer_of_record',
  comment:                 'engineer_of_record',
  revise:                  'engineer_of_record',
  approve:                 'engineer_of_record',
  issue_for_construction:  'engineer_of_record',
  finalise_as_built:       'engineer_of_record',
  reject:                  'engineer_of_record',
  withdraw:                'IPP_CEO',
};

export function partyForAction(action: IpdAction): IpdParty {
  return ACTION_PARTY[action];
}

export function eventTypeFor(action: IpdAction): IpdEvent | null {
  switch (action) {
    case 'upload_drawing':         return 'ipp_doc_control_uploaded';
    case 'index_metadata':         return 'ipp_doc_control_indexed';
    case 'open_revision':          return 'ipp_doc_control_revision_open';
    case 'assign_IDC':             return 'ipp_doc_control_idc_assigned';
    case 'transmit':               return 'ipp_doc_control_transmitted';
    case 'start_review':           return 'ipp_doc_control_review_started';
    case 'comment':                return 'ipp_doc_control_commented';
    case 'revise':                 return 'ipp_doc_control_revised';
    case 'approve':                return 'ipp_doc_control_approved';
    case 'issue_for_construction': return 'ipp_doc_control_issued_for_construction';
    case 'finalise_as_built':      return 'ipp_doc_control_as_built_finalised';
    case 'archive':                return 'ipp_doc_control_archived';
    case 'reject':                 return 'ipp_doc_control_rejected';
    case 'withdraw':               return 'ipp_doc_control_withdrawn';
    case 'hold':                   return 'ipp_doc_control_held';
    case 'resume':                 return 'ipp_doc_control_resumed';
  }
}

// ─── LIVE battery (~20 fields) ──────────────────────────────────────────

export function slaHoursRemaining(
  status: IpdStatus,
  tier: IpdTier,
  enteredAt: Date | null,
  now: Date,
): number {
  if (!enteredAt) return 0;
  const deadline = slaDeadlineFor(status, tier, enteredAt);
  if (!deadline) return 0;
  const remainingMs = deadline.getTime() - now.getTime();
  return Math.round(remainingMs / (3600 * 1000));
}

export type IpdUrgency = 'critical' | 'high' | 'medium' | 'low';

// URGENT polarity: safety_critical has the TIGHTEST urgency thresholds
// (less runway). Civil has LOOSEST.
export function urgencyBand(
  tier: IpdTier,
  slaHoursLeft: number,
): IpdUrgency {
  if (slaHoursLeft < 0) return 'critical';
  if (tier === 'safety_critical') {
    if (slaHoursLeft < 4)   return 'critical';
    if (slaHoursLeft < 8)   return 'high';
    if (slaHoursLeft < 16)  return 'medium';
    return 'low';
  }
  if (tier === 'electrical') {
    if (slaHoursLeft < 8)   return 'critical';
    if (slaHoursLeft < 24)  return 'high';
    if (slaHoursLeft < 48)  return 'medium';
    return 'low';
  }
  if (tier === 'mechanical') {
    if (slaHoursLeft < 12)  return 'critical';
    if (slaHoursLeft < 36)  return 'high';
    if (slaHoursLeft < 72)  return 'medium';
    return 'low';
  }
  // civil
  if (slaHoursLeft < 24)    return 'critical';
  if (slaHoursLeft < 72)    return 'high';
  if (slaHoursLeft < 120)   return 'medium';
  return 'low';
}

// 3-step authority ladder: doc_controller → engineer_of_record →
// IPP_CEO.
export type IpdAuthority =
  | 'doc_controller'
  | 'engineer_of_record'
  | 'IPP_CEO';

export function authorityRequired(tier: IpdTier): IpdAuthority {
  if (tier === 'safety_critical') return 'IPP_CEO';
  if (tier === 'electrical' || tier === 'mechanical') return 'engineer_of_record';
  return 'doc_controller';
}

// Regulator filing window hours — how fast a regulator-crossing event
// must be filed. URGENT polarity — safety_critical gets the shortest
// filing window.
export function regulatorFilingWindowHours(tier: IpdTier): number {
  if (tier === 'safety_critical') return 24;
  if (tier === 'electrical')      return 48;
  if (tier === 'mechanical')      return 72;
  return 168;
}

// ─── IDC matrix status (live) ───────────────────────────────────────────
//   open    : no IDC assignment OR assignment without a transmit
//   review  : IDC assigned + transmitted, awaiting reviewer comments
//   approved: drawing approved + ready for IFC
//   closed  : as-built finalised + archived
export type IdcStatus = 'open' | 'review' | 'approved' | 'closed';

export function idcStatusFor(status: IpdStatus): IdcStatus {
  if (status === 'archived' || status === 'as_built_finalised') return 'closed';
  if (status === 'approved' || status === 'issued_for_construction') return 'approved';
  if (status === 'transmitted' || status === 'reviewed' ||
      status === 'commented' || status === 'revised' ||
      status === 'hold') return 'review';
  return 'open';
}

// ─── 5-bridge architecture ──────────────────────────────────────────────
// W112 schedule (drawing IFC dates anchor activity windows), W113 EVM
// (CR-driven drawings flow back into cost book), W19 procurement (BOQ
// rolls up from latest IFC set), W20 COD (every IFC closes a construction
// gate), W18 planned outage (commissioning drawings gate outage release).
export function bridgesToScheduleChain(scheduleRef: string | null | undefined): boolean {
  return !!scheduleRef;
}
export function bridgesToEvmChain(evmRef: string | null | undefined): boolean {
  return !!evmRef;
}
export function bridgesToProcurementChain(procurementRef: string | null | undefined): boolean {
  return !!procurementRef;
}
export function bridgesToCodChain(codRef: string | null | undefined): boolean {
  return !!codRef;
}
export function bridgesToPlannedOutageChain(plannedOutageRef: string | null | undefined): boolean {
  return !!plannedOutageRef;
}

// ─── Document completeness index 0-130 ──────────────────────────────────
// Tracks how many lifecycle milestones are stamped + bonus for clean
// archive without rejection/withdrawal.
export function documentCompletenessIndex(args: {
  draft_uploaded?: boolean | number | null;
  metadata_indexed?: boolean | number | null;
  revision_open?: boolean | number | null;
  IDC_assigned?: boolean | number | null;
  transmitted?: boolean | number | null;
  reviewed?: boolean | number | null;
  commented?: boolean | number | null;
  revised?: boolean | number | null;
  approved?: boolean | number | null;
  issued_for_construction?: boolean | number | null;
  as_built_finalised?: boolean | number | null;
  archived?: boolean | number | null;
  clean_archive_bonus?: boolean | number | null;
}): number {
  const t = (v: boolean | number | null | undefined): number => (v ? 1 : 0);
  let score = 0;
  score += t(args.draft_uploaded)          * 8;
  score += t(args.metadata_indexed)        * 8;
  score += t(args.revision_open)           * 8;
  score += t(args.IDC_assigned)            * 8;
  score += t(args.transmitted)             * 8;
  score += t(args.reviewed)                * 8;
  score += t(args.commented)               * 8;
  score += t(args.revised)                 * 8;
  score += t(args.approved)                * 10;
  score += t(args.issued_for_construction) * 12;
  score += t(args.as_built_finalised)      * 12;
  score += t(args.archived)                * 12;
  score += t(args.clean_archive_bonus)     * 20;
  if (score > 130) score = 130;
  return score;
}

// ─── Hash-chain pre-stage for W118 ──────────────────────────────────────
// W118 will deliver tamper-evident hash-chain + merkle anchoring across
// every doc-control event. W114 stamps an incrementing hash_chain_
// position + a placeholder merkle_root_segment so W118 can backfill
// without a migration. Today these are inert placeholders.
export function hashChainPositionFor(currentPosition: number | null | undefined): number {
  const p = Number(currentPosition ?? 0);
  if (!isFinite(p) || p < 0) return 1;
  return p + 1;
}

export function placeholderMerkleSegment(documentId: string, position: number): string {
  // Deterministic 64-char hex placeholder. NOT cryptographic — W118
  // delivers the real hash chain. Stable shape so SPA + dashboards can
  // render the column today.
  const seed = `${documentId}:${position}`;
  let h = 0n;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 1315423911n) ^ BigInt(seed.charCodeAt(i));
    h = h & 0xffffffffffffffffn;
  }
  const hex = h.toString(16).padStart(16, '0');
  // Compose a 64-char hex segment by tiling the 16-char hash 4x.
  return (hex + hex + hex + hex).slice(0, 64);
}
