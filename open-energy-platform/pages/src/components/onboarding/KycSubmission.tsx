// pages/src/components/onboarding/KycSubmission.tsx - user-facing KYC submission
// surface, mounted at the live Meridian /kyc route (App.tsx) inside MeridianFrame.
//
// Binds the caller-only KYC backend (src/routes/onboarding-kyc.ts, Task 3.2):
//   GET  /onboarding/kyc            -> { kyc_status, documents }
//   POST /onboarding/kyc/evidence   -> { id, document_type, status:'pending' }
//   POST /onboarding/kyc/submit     -> { kyc_status:'in_review' }
//
// L4 depth (not a level-2 CRUD form):
//   • State-distinct status timeline (pending -> in_review -> approved/rejected),
//     where rejected reads as a terminal rejection and approved as terminal success.
//   • One upload slot per static document type, each with label-above / helper /
//     already-submitted list / error-below, posting base64 evidence.
//   • Exactly one primary CTA ("Submit for verification"), hidden once the pack is
//     in review or approved.
//   • Skeleton (never a spinner) on load and on slow per-slot uploads.
//   • Inline error + retry on a failed read; no toast-only paths.
//
// Security: document_type sent to the backend comes ONLY from the static
// KYC_DOC_TYPES literal below, never from free user input. Every request acts on
// the caller - no participant_id / tenant ever sent.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { statusLabel } from '../../meridian/ease/statusLabel';
import '../../meridian/meridian.css';

// Accept only the document formats the reviewers can open, and cap pre-upload size
// so a too-large file fails with a clear message instead of a silent backend 413.
const KYC_ACCEPT = 'image/*,application/pdf';
const MAX_KYC_BYTES = 10 * 1024 * 1024; // 10 MB

// Source of truth - mirrors the backend allow-list (onboarding-kyc.ts). The only
// values ever sent as document_type. Order drives the rendered slot order.
const KYC_DOC_TYPES = [
  'id_document',
  'proof_of_address',
  'company_registration',
  'tax_clearance',
  'bank_confirmation',
  'nersa_licence',
] as const;
type KycDocType = (typeof KYC_DOC_TYPES)[number];

type KycStatus = 'pending' | 'in_review' | 'approved' | 'rejected';

type SubmittedDoc = {
  id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  submitted_at: string;
};
type DocumentsMap = Partial<Record<KycDocType, SubmittedDoc[]>>;

type KycState = {
  kyc_status: KycStatus;
  documents: DocumentsMap;
};

// Human label + a one-line helper per document type. Labels are hand-cased (not
// a naive title-case) so acronyms read correctly ("ID document", "NERSA licence").
const DOC_META: Record<KycDocType, { label: string; helper: string }> = {
  id_document: { label: 'ID document', helper: 'A clear copy of a director or signatory ID or passport.' },
  proof_of_address: { label: 'Proof of address', helper: 'A utility bill or bank statement under 3 months old.' },
  company_registration: { label: 'Company registration', helper: 'CIPC registration certificate (CoR14.3 or equivalent).' },
  tax_clearance: { label: 'Tax clearance', helper: 'A valid SARS tax compliance status PIN or certificate.' },
  bank_confirmation: { label: 'Bank confirmation', helper: 'A bank-stamped confirmation of the settlement account.' },
  nersa_licence: { label: 'NERSA licence', helper: 'Your NERSA generation or trading licence, if applicable.' },
};

// The four timeline states in order. approved / rejected are mutually-exclusive
// terminals: only one of the pair ever renders, depending on kyc_status.
type TimelineStep = { key: KycStatus; label: string };
const BASE_STEPS: TimelineStep[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_review', label: 'In review' },
];

// Where the current status sits on the timeline, for past/current/future styling.
function statusIndex(status: KycStatus): number {
  if (status === 'pending') return 0;
  if (status === 'in_review') return 1;
  return 2; // approved or rejected - the terminal slot
}

function readPayload(res: { data?: { data?: unknown } }): KycState | null {
  const d = res?.data?.data as Partial<KycState> | undefined;
  if (!d || typeof d.kyc_status !== 'string') return null;
  return {
    kyc_status: d.kyc_status as KycStatus,
    documents: (d.documents as DocumentsMap) || {},
  };
}

// Read a File as raw base64 (the data:...;base64, prefix stripped) so the body
// matches the backend's content_base64 contract.
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function KycSubmission() {
  const navigate = useNavigate();

  const [state, setState] = React.useState<KycState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // Per-slot transient flags: a slow-upload skeleton and a per-slot error line.
  const [slotBusy, setSlotBusy] = React.useState<Partial<Record<KycDocType, boolean>>>({});
  const [slotError, setSlotError] = React.useState<Partial<Record<KycDocType, string>>>({});

  // The slow-upload skeleton replaces a slot's file input, which would silently
  // drop keyboard focus to the body. We keep a ref per input and the doc type
  // whose focus must be restored once the skeleton clears, so a keyboard user
  // lands back on the same control instead of nowhere.
  const inputRefs = React.useRef<Partial<Record<KycDocType, HTMLInputElement | null>>>({});
  const refocusSlot = React.useRef<KycDocType | null>(null);
  React.useEffect(() => {
    const dt = refocusSlot.current;
    if (dt && !slotBusy[dt]) {
      inputRefs.current[dt]?.focus();
      refocusSlot.current = null;
    }
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get('/onboarding/kyc');
      const payload = readPayload(res);
      if (!payload) throw new Error('malformed response');
      setState(payload);
    } catch {
      setLoadError('We could not load your verification status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const status: KycStatus = state?.kyc_status ?? 'pending';
  const idx = statusIndex(status);
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  // Submit is available only while the pack is still being assembled. Once it is
  // in review or approved there is nothing more for the caller to submit. A
  // rejected pack can be resubmitted, so the CTA stays available there.
  const canSubmit = status === 'pending' || status === 'rejected';

  const upload = React.useCallback(async (docType: KycDocType, file: File) => {
    setSlotError((m) => ({ ...m, [docType]: undefined }));
    if (file.size > MAX_KYC_BYTES) {
      setSlotError((m) => ({ ...m, [docType]: 'File is over 10 MB. Please upload a smaller copy.' }));
      return;
    }
    // Show a skeleton on the slot only if the upload is slow (>300ms), never a spinner.
    // Record the slot so focus is restored to its input once the skeleton clears
    // (the skeleton unmounts the focused input; only mark it when it actually shows).
    const slowTimer = setTimeout(() => {
      refocusSlot.current = docType;
      setSlotBusy((m) => ({ ...m, [docType]: true }));
    }, 300);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await api.post('/onboarding/kyc/evidence', {
        document_type: docType, // from the static literal only
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        content_base64: contentBase64,
      });
      const created = res?.data?.data as { id: string; status: string } | undefined;
      if (!created?.id) throw new Error('upload failed');
      // Optimistically push the new pending row so the slot updates immediately,
      // then reconcile with a fresh GET in the background.
      setState((prev) => {
        const base: KycState = prev ?? { kyc_status: status, documents: {} };
        const existing = base.documents[docType] ?? [];
        return {
          ...base,
          documents: {
            ...base.documents,
            [docType]: [
              ...existing,
              {
                id: created.id,
                file_name: file.name,
                mime_type: file.type || null,
                size_bytes: file.size,
                status: created.status || 'pending',
                submitted_at: new Date().toISOString(),
              },
            ],
          },
        };
      });
      void load();
    } catch {
      setSlotError((m) => ({ ...m, [docType]: 'Upload failed. Check the file and try again.' }));
    } finally {
      clearTimeout(slowTimer);
      setSlotBusy((m) => ({ ...m, [docType]: false }));
    }
  }, [load, status]);

  const onSubmit = React.useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post('/onboarding/kyc/submit');
      const next = (res?.data?.data?.kyc_status as KycStatus | undefined) ?? 'in_review';
      setState((prev) => ({ kyc_status: next, documents: prev?.documents ?? {} }));
    } catch {
      setSubmitError('We could not submit your pack for verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, []);

  // ── Loading: skeleton, not a spinner ──────────────────────────────────────
  if (loading) {
    return (
      <div className="mer-kyc">
        <header className="mer-kyc-head">
          <h1 className="mer-kyc-title">Verify your account</h1>
        </header>
        <div className="skel skel-card" aria-hidden="true" />
        <div className="mer-kyc-slots" aria-hidden="true">
          {KYC_DOC_TYPES.slice(0, 3).map((t) => (
            <div className="mer-kyc-slot" key={t}>
              <div className="skel skel-line lg" style={{ width: '40%' }} />
              <div className="skel skel-line" style={{ width: '70%' }} />
              <div className="skel skel-card" />
            </div>
          ))}
        </div>
        <span className="mer-kyc-sr">Loading your verification status</span>
      </div>
    );
  }

  // ── Read failure: inline error + retry ─────────────────────────────────────
  if (loadError) {
    return (
      <div className="mer-kyc">
        <header className="mer-kyc-head">
          <h1 className="mer-kyc-title">Verify your account</h1>
        </header>
        <div className="mer-kyc-banner bad" role="alert">
          <span>{loadError}</span>
          <button type="button" className="mer-kyc-retry" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }

  // The terminal step label depends on the outcome so a rejected status reads as
  // a clear terminal rejection and an approved status as terminal success.
  const terminalLabel = isRejected ? 'Rejected' : 'Approved';
  const steps: TimelineStep[] = [...BASE_STEPS, { key: isRejected ? 'rejected' : 'approved', label: terminalLabel }];

  return (
    <div className="mer-kyc">
      <header className="mer-kyc-head">
        <h1 className="mer-kyc-title">Verify your account</h1>
        <p className="mer-kyc-sub">
          Submit your KYC pack so the team can verify you. Verification unlocks full trading.
        </p>
      </header>

      {/* ── Status timeline ─────────────────────────────────────────────────
          A horizontal stepper. Each step is state-distinct by glyph (✓ / ○) and
          weight, never colour alone. aria-current marks the live step; the
          terminal step renders as approved (success) or rejected (failure). */}
      <ol
        className={`mer-kyc-timeline${isRejected ? ' rejected' : ''}${isApproved ? ' approved' : ''}`}
        aria-label={`Verification status: ${statusLabel(status).text}`}
      >
        {steps.map((step, i) => {
          const isCurrent = i === idx;
          const isPast = i < idx;
          const isTerminal = i === 2;
          let cls = 'mer-kyc-step';
          if (isPast) cls += ' past';
          if (isCurrent) cls += ' current';
          if (isTerminal && isCurrent && isRejected) cls += ' rejected';
          if (isTerminal && isCurrent && isApproved) cls += ' approved';
          const glyph = isPast || (isCurrent && isApproved) ? '✓' : isCurrent && isRejected ? '×' : '○';
          return (
            <li className={cls} key={step.key} aria-current={isCurrent ? 'step' : undefined}>
              <span className="mer-kyc-step-glyph" aria-hidden="true">{glyph}</span>
              <span className="mer-kyc-step-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      {isApproved && (
        <div className="mer-kyc-banner good" role="status">
          <span className="mer-kyc-step-glyph" aria-hidden="true">✓</span>
          <span>You are verified. Your account can transact across the platform.</span>
        </div>
      )}
      {isRejected && (
        <div className="mer-kyc-banner bad" role="status">
          <span>Your verification was not approved. Re-upload the flagged documents and submit again.</span>
        </div>
      )}
      {status === 'in_review' && (
        <div className="mer-kyc-banner info" role="status">
          <span>Your pack is in review. We will update this page when a decision is made.</span>
        </div>
      )}

      {/* ── Per-document-type upload slots ──────────────────────────────────
          Hidden when approved (nothing left to do). Otherwise one slot per
          static document type, each: label ABOVE input, helper, already-submitted
          list, error BELOW input. */}
      {!isApproved && (
        <div className="mer-kyc-slots">
          {KYC_DOC_TYPES.map((docType) => {
            const meta = DOC_META[docType];
            const submitted = state?.documents[docType] ?? [];
            const busy = !!slotBusy[docType];
            const err = slotError[docType];
            const inputId = `mer-kyc-file-${docType}`;
            return (
              <section className="mer-kyc-slot" key={docType}>
                <label className="mer-kyc-slot-label" htmlFor={inputId}>{meta.label}</label>
                <p className="mer-kyc-slot-helper">{meta.helper}</p>

                {submitted.length > 0 && (
                  <ul className="mer-kyc-files">
                    {submitted.map((d) => (
                      <li className="mer-kyc-file" key={d.id}>
                        <span className="mer-kyc-file-name">{d.file_name || 'Uploaded document'}</span>
                        <span className={`mer-kyc-file-status ${d.status}`}>{statusLabel(d.status).text}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {busy ? (
                  <div className="skel skel-card mer-kyc-slot-skel" aria-label={`Uploading ${meta.label}`} />
                ) : (
                  <input
                    id={inputId}
                    ref={(el) => { inputRefs.current[docType] = el; }}
                    className="mer-kyc-file-input"
                    type="file"
                    accept={KYC_ACCEPT}
                    aria-describedby={err ? `${inputId}-err` : undefined}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(docType, file);
                      // Reset so re-selecting the same file fires onChange again.
                      e.target.value = '';
                    }}
                  />
                )}

                {err && <p className="mer-kyc-slot-err" id={`${inputId}-err`} role="alert">{err}</p>}
              </section>
            );
          })}
        </div>
      )}

      {/* ── Single primary CTA ──────────────────────────────────────────────
          Exactly one primary action on the surface. Hidden once the pack is in
          review or approved (nothing more to submit). */}
      {canSubmit && (
        <div className="mer-kyc-foot">
          {submitError && <p className="mer-kyc-slot-err" role="alert">{submitError}</p>}
          <button
            type="button"
            className="mer-kyc-cta"
            onClick={() => void onSubmit()}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit for verification'}
          </button>
          <p className="mer-kyc-foot-note">
            Upload what you have, then submit. The team will review and follow up if anything is missing.
          </p>
        </div>
      )}

      {/* Returning users land here from the Getting-Started gate; offer a way back. */}
      <button type="button" className="mer-kyc-back" onClick={() => navigate('/cockpit')}>
        Back to workspace
      </button>
    </div>
  );
}
