// ════════════════════════════════════════════════════════════════════════
// SAST clock — South African Standard Time (UTC+2, Africa/Johannesburg).
//
// The platform's primary regulator (NERSA), SARS-facing exports, NERSA
// gazette publications, and PAIA filings all operate in SAST. A regulator
// viewing an audit-chain export from London should see SAST timestamps,
// not Europe/London. Same for a trader on a corporate VPN in Frankfurt.
//
// Rather than touching 162 toLocale* call sites across the SPA, this
// module patches the Date.prototype methods + Intl.DateTimeFormat at app
// boot so every existing format call defaults to Africa/Johannesburg
// when the caller hasn't explicitly specified a timeZone. Explicit
// timeZone overrides are honoured — useful for the rare regulator export
// where multi-jurisdiction display is needed.
//
// Safety properties:
//   • only injects timeZone when none is provided (never overrides explicit)
//   • idempotent — re-importing is a no-op
//   • preserves all other Intl options (date style, numbering, etc.)
//   • zero overhead at runtime; same Intl machinery
// ════════════════════════════════════════════════════════════════════════

const SAST_TZ = 'Africa/Johannesburg';

let installed = false;

export function installSastClock(): void {
  if (installed) return;
  installed = true;

  // ─── Intl.DateTimeFormat — inject timeZone default on construction ──
  // Capture the original constructor before patching.
  const OriginalDTF = Intl.DateTimeFormat;
  function PatchedDTF(this: unknown, locales?: any, options?: any) {
    const opts: Intl.DateTimeFormatOptions = { ...(options || {}) };
    if (!opts.timeZone) opts.timeZone = SAST_TZ;
    // Support both `new Intl.DateTimeFormat()` and `Intl.DateTimeFormat()`
    // (the spec allows both — the former when used as constructor).
    if (this instanceof PatchedDTF) {
      return new OriginalDTF(locales, opts);
    }
    return OriginalDTF(locales, opts);
  }
  // Copy static methods + prototype chain so `instanceof` and
  // `supportedLocalesOf` still work.
  PatchedDTF.prototype = OriginalDTF.prototype;
  (PatchedDTF as any).supportedLocalesOf = OriginalDTF.supportedLocalesOf;
  // @ts-expect-error — global patch
  Intl.DateTimeFormat = PatchedDTF;

  // ─── Date.prototype.toLocaleString family — inject timeZone default ──
  // These call into Intl.DateTimeFormat under the hood on modern engines,
  // but on older engines or when the runtime caches a pre-patched
  // formatter the timeZone defaulting can be skipped. Wrap explicitly
  // to be sure.
  const wrap = <K extends 'toLocaleString' | 'toLocaleDateString' | 'toLocaleTimeString'>(
    key: K,
  ) => {
    const original = Date.prototype[key];
    Date.prototype[key] = function (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      const opts: Intl.DateTimeFormatOptions = { ...(options || {}) };
      if (!opts.timeZone) opts.timeZone = SAST_TZ;
      return original.call(this, locales, opts);
    };
  };
  wrap('toLocaleString');
  wrap('toLocaleDateString');
  wrap('toLocaleTimeString');
}

/** Format a Date or ISO string as SAST date+time. */
export function fmtSAST(d: Date | string | number | null | undefined): string {
  if (d == null) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-ZA', {
    timeZone: SAST_TZ,
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Format a Date or ISO string as SAST date only. */
export function fmtSASTDate(d: Date | string | number | null | undefined): string {
  if (d == null) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-ZA', {
    timeZone: SAST_TZ,
    year: 'numeric', month: 'short', day: '2-digit',
  });
}

/** The configured timezone identifier — useful for badge UIs. */
export const SAST_TIMEZONE = SAST_TZ;
