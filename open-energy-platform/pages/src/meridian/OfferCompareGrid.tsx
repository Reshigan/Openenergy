// pages/src/meridian/OfferCompareGrid.tsx — scored offer-compare cards for the Deal Desk.
// Options arrive PRE-SORTED best-first (est_value_zar desc) from GET /deals/:type/options;
// the first card wears the petrol spine (.ocard.best) as the recommended pick. Content styling
// is verbatim from meridian.css (.ocard / .metric / .est / .sweet / .why / .chip / .btn). The
// "▸ sweeteners" expander toggles a wrapper class and animates grid-rows/opacity via the
// .sweet-reveal rules in meridian.css, eased with var(--ease) — never JS.
import React from 'react';
import { fmtZar, zarMagnitudeClass, type ScoredOption } from './lib';

// A ZAR-looking primary_metric (large rand figure) renders through fmtZar; otherwise the raw
// number carries an optional unit hint scraped from secondary (e.g. R/MWh, %, MW).
function unitHint(opt: ScoredOption): string {
  const u = opt.secondary?.unit ?? opt.secondary?.uom ?? opt.secondary?.units;
  return typeof u === 'string' ? ` ${u}` : '';
}
function looksZar(v: number): boolean {
  return Math.abs(v) >= 1000; // sub-1k metrics are rates/percentages, not money
}

function OfferCard({ opt, best, onAccept }: { opt: ScoredOption; best: boolean; onAccept: (o: ScoredOption) => void }) {
  const [open, setOpen] = React.useState(false);
  const est = opt.est_value_zar;
  const metric = opt.primary_metric;
  return (
    <div className={best ? 'ocard best' : 'ocard'}
         aria-label={best ? `Recommended: ${opt.title}` : opt.title}>
      <div className="ocard-top">
        <b>{opt.title}</b>
        {best && <span className="chip best-chip">Recommended</span>}
        {opt.price_basis === 'indicative' && <span className="chip">indicative</span>}
      </div>
      {metric != null && (
        <div className="metric">{looksZar(metric) ? fmtZar(metric) : `${metric}${unitHint(opt)}`}</div>
      )}
      {est != null && (
        <div className="est">est value <span className={`zar ${zarMagnitudeClass(est)}`}>{fmtZar(est)}</span></div>
      )}
      {opt.sweetener_value_zar > 0 && (
        <>
          <button type="button" className="sweet-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? '▾' : '▸'} sweeteners
          </button>
          <div className={open ? 'sweet-reveal open' : 'sweet-reveal'}>
            <div className="sweet">+ {fmtZar(opt.sweetener_value_zar)} in sweeteners</div>
          </div>
        </>
      )}
      {opt.rationale && <div className="why">{opt.rationale}</div>}
      <button type="button" className="btn pri" onClick={() => onAccept(opt)}>Accept</button>
    </div>
  );
}

export function OfferCompareGrid({ options, dealType, requestId, onAccept }: {
  options: ScoredOption[]; dealType: string; requestId: string; onAccept: (opt: ScoredOption) => void;
}) {
  return (
    <div className="ocard-grid" data-deal-type={dealType} data-request={requestId}>
      {options.length === 0
        ? <div className="ocard-empty">No matching offers yet.</div>
        : options.map((opt, i) => (
            <OfferCard key={opt.option_id} opt={opt} best={i === 0} onAccept={onAccept} />
          ))}
    </div>
  );
}
