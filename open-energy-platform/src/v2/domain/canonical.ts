// Canonical JSON — the byte-level contract every hash in the platform depends
// on, and the one an external verifier must be able to re-implement from the
// exported verification_procedure alone:
//   - object keys sorted lexicographically (code-unit order)
//   - keys with undefined values omitted
//   - no whitespace
//   - strings/numbers serialised exactly as ECMA-404 JSON.stringify emits them
//   - non-finite numbers rejected
export function canonicalJson(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new Error('non-finite number is not canonicalizable');
      return JSON.stringify(v);
    case 'string':
      return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
      const rec = v as Record<string, unknown>;
      const keys = Object.keys(rec)
        .filter((k) => rec[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`cannot canonicalize value of type ${typeof v}`);
  }
}
