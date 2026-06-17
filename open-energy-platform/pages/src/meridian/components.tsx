// pages/src/meridian/components.tsx — shared Meridian primitives (markup matches meridian.css,
// which is ported verbatim from mockups/meridian/01-horizon.html: fuse fill is `.fuse > i`,
// tile children are .ref / .title / .zar / .meta).
import { Link } from 'react-router-dom';
import { fmtZar, zarMagnitudeClass, fuseFraction, humanizeKey, type MerCase } from './lib';

export function FuseBar({ deadline }: { deadline: string | null }) {
  const f = fuseFraction(deadline);
  const cls = f === 0 ? 'fuse dead' : f < 0.25 ? 'fuse warn' : 'fuse';
  return (
    <div
      className={cls}
      role="img"
      aria-label={f === 0 ? 'SLA breached' : `${Math.round(f * 100)}% of SLA window remaining`}
    >
      <i style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function CaseTile({ c }: { c: MerCase }) {
  const breached = c.bucket === 'breached';
  return (
    <Link
      to={`/thread/${c.chain}/${c.id}`}
      className={breached ? 'tile breached' : 'tile'}
      data-bucket={c.bucket}
    >
      <div className="ref">{c.ref} · {humanizeKey(c.chain)}</div>
      <div className="title">{c.title}</div>
      {c.quantum_zar != null && (
        <div className={`zar ${zarMagnitudeClass(c.quantum_zar)}`}>{fmtZar(c.quantum_zar)}</div>
      )}
      <div className="meta">
        <span className={breached ? 'chip ox' : 'chip'}>{c.status.replace(/_/g, ' ').toUpperCase()}</span>
        {c.counterparty && <span>{c.counterparty}</span>}
      </div>
      <FuseBar deadline={c.deadline_at} />
    </Link>
  );
}
