// pages/src/meridian/DealDeskPage.tsx — Meridian Deal Desk: author/track surface.
// Full-canvas Meridian page (self-chromed, no Layout/AppShell) following the .mer /
// .mer-head pattern from AtlasPage. AUTHOR bar publishes requests/offers via the schema-
// driven DealOfferComposer; MY REQUESTS / MY OFFERS lanes track what the user has on the
// desk. Compare → accept dispatches the matched deal into a chain thread (the TRACK handoff).
// Deal endpoints return RAW bodies (no {success,data} envelope) — see ./lib.
import React from 'react';
import './meridian.css';
import { Link } from 'react-router-dom';
import {
  fetchMyDeals, fetchDealTypes, fetchDealOptions,
  publishDealRequest, publishDealOffer, acceptDealOffer,
  dealLabel, dealStage, fmtZar,
  type MyDeals, type DealTypeInfo, type DealRequestSummary, type DealOfferSummary,
  type ScoredOption, type DealKind,
} from './lib';
import { DealProcessRail } from './DealProcessRail';
import { OfferCompareGrid } from './OfferCompareGrid';
import { DealOfferComposer } from './DealOfferComposer';

// Active composer veil: which deal type, and offer vs request.
interface ComposeState { info: DealTypeInfo; mode: 'offer' | 'request' }
// Active compare veil: the request being shopped + its loaded scored options.
interface CompareState { req: DealRequestSummary; options: ScoredOption[] }

export default function DealDeskPage() {
  const [deals, setDeals] = React.useState<MyDeals>({ requests: [], offers: [] });
  const [types, setTypes] = React.useState<DealTypeInfo[]>([]);
  const [compose, setCompose] = React.useState<ComposeState | null>(null);
  const [compare, setCompare] = React.useState<CompareState | null>(null);
  const [actErr, setActErr] = React.useState<string | null>(null);

  // Liveness guard shared by mount fetches and the async handlers below: a late
  // resolve after unmount must not setState. Set false in the mount cleanup.
  const live = React.useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const refetch = React.useCallback(() => {
    fetchMyDeals().then(d => { if (live.current) setDeals(d); }).catch(() => { /* keep last good list */ });
  }, []);

  React.useEffect(() => {
    refetch();
    fetchDealTypes().then(t => { if (live.current) setTypes(t); }).catch(() => { if (live.current) setTypes([]); });
  }, [refetch]);

  // The deal-type info for a request/offer's type, used to derive the rail kind.
  const infoFor = (t: string): DealTypeInfo | undefined => types.find(i => i.deal_type === t);
  const kindFor = (t: string): DealKind => infoFor(t)?.kind ?? 'marketplace';

  function errOf(e: any): string {
    return e?.response?.data?.error ?? e?.message ?? 'Action failed';
  }

  // Publish from the composer, then close the veil and refresh My Deals.
  async function publish(values: Record<string, unknown>, meta: Record<string, unknown>) {
    if (!compose) return;
    const { info, mode } = compose;
    if (mode === 'request') await publishDealRequest(info.deal_type, values, meta);
    else await publishDealOffer(info.deal_type, values, meta);
    if (!live.current) return;
    setCompose(null);
    refetch();
  }

  // Load scored options for a request and open the compare veil.
  async function openCompare(req: DealRequestSummary) {
    setActErr(null);
    try {
      const options = await fetchDealOptions(req.deal_type, req.id);
      if (live.current) setCompare({ req, options });
    } catch (e: any) {
      if (live.current) setActErr(errOf(e));
    }
  }

  // Accept a scored option → dispatch into a chain thread, then close + refresh.
  async function accept(req: DealRequestSummary, opt: ScoredOption) {
    setActErr(null);
    try {
      await acceptDealOffer(req.deal_type, { request_id: req.id, offer_id: opt.option_id });
      if (!live.current) return;
      setCompare(null);
      refetch();
    } catch (e: any) {
      if (live.current) setActErr(errOf(e));
    }
  }

  // Veil dialog behaviour (CommandPalette idiom): Escape dismisses the open veil,
  // and focus is restored to whatever held it before the veil opened.
  const veilOpen = compose != null || compare != null;
  React.useEffect(() => {
    if (!veilOpen) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setCompose(null); setCompare(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [veilOpen]);

  const { requests, offers } = deals;

  return (
    <div className="mer deal-desk">
      <header className="mer-head">
        <Link to="/horizon" className="back">← Horizon</Link>
        <span className="wordmark">DEAL DESK</span>
        <span className="counts mono">{requests.length} requests · {offers.length} offers</span>
      </header>

      {actErr && (
        <div className="act-error" role="alert">
          <span>{actErr}</span>
          <button type="button" className="btn ghost" onClick={() => setActErr(null)}>Dismiss</button>
        </div>
      )}

      {/* AUTHOR bar — one chip per capability the role holds on each deal type. */}
      <div className="author-bar" aria-label="Author a deal">
        {types.map(t => (
          <React.Fragment key={t.deal_type}>
            {t.can_request && (
              <button type="button" className="btn pri"
                      onClick={() => setCompose({ info: t, mode: 'request' })}>
                Request {dealLabel(t.deal_type)}
              </button>
            )}
            {t.can_offer && (
              <button type="button" className="btn ghost"
                      onClick={() => setCompose({ info: t, mode: 'offer' })}>
                Offer {dealLabel(t.deal_type)}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="deal-cols">
        <section className="deal-col" aria-label="My requests">
          <h2>MY REQUESTS</h2>
          {requests.length === 0 && (
            <div className="deal-empty">No open requests. Author one from the bar above.</div>
          )}
          {requests.map(r => (
            <div className="dcard" key={r.id}>
              <div className="dcard-top">
                <b>{dealLabel(r.deal_type)}</b>
                <span className="chip">{r.status}</span>
              </div>
              <DealProcessRail kind={kindFor(r.deal_type)} stage={dealStage(r)} />
              <div className="dcard-meta mono">
                {r.offer_count} offers
                {r.target_amount_zar != null && <> · {fmtZar(r.target_amount_zar)}</>}
              </div>
              <div className="dcard-acts">
                {r.offer_count > 0 && (
                  <button type="button" className="btn pri" onClick={() => openCompare(r)}>
                    Compare offers
                  </button>
                )}
                {r.dispatched_chain_key && r.dispatched_case_id && (
                  r.dispatched_chain_key === 'loi' ? (
                    <Link className="btn ghost" to={`/lois/${r.dispatched_case_id}`}>
                      Open LOI
                    </Link>
                  ) : (
                    <Link className="btn ghost" to={`/thread/${r.dispatched_chain_key}/${r.dispatched_case_id}`}>
                      Open thread
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="deal-col" aria-label="My offers">
          <h2>MY OFFERS</h2>
          {offers.length === 0 && (
            <div className="deal-empty">No live offers. Author one from the bar above.</div>
          )}
          {offers.map((o: DealOfferSummary) => (
            <div className="dcard" key={o.id}>
              <div className="dcard-top">
                <b>{o.title || dealLabel(o.deal_type)}</b>
                <span className="chip">{o.status}</span>
              </div>
              <div className="dcard-meta mono">
                {dealLabel(o.deal_type)}
                {o.bid_amount_zar != null && <> · bid {fmtZar(o.bid_amount_zar)}</>}
                {o.committed_amount_zar != null && <> · committed {fmtZar(o.committed_amount_zar)}</>}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Compose veil — schema-driven publish form. */}
      {compose && (
        <div className="mer veil" onClick={() => setCompose(null)}>
          <div className="veil-body" role="dialog" aria-modal="true"
               aria-label={`${compose.mode === 'request' ? 'Request' : 'Offer'} ${dealLabel(compose.info.deal_type)}`}
               onClick={e => e.stopPropagation()}>
            <DealOfferComposer
              dealType={compose.info.deal_type}
              kind={compose.info.kind}
              mode={compose.mode}
              schema={compose.mode === 'request' ? compose.info.need_schema : compose.info.term_sheet_schema}
              onPublish={publish}
              onCancel={() => setCompose(null)}
            />
          </div>
        </div>
      )}

      {/* Compare veil — scored offers; accept dispatches the TRACK handoff. */}
      {compare && (
        <div className="mer veil" onClick={() => setCompare(null)}>
          <div className="veil-body" role="dialog" aria-modal="true"
               aria-label={`Compare offers — ${dealLabel(compare.req.deal_type)}`}
               onClick={e => e.stopPropagation()}>
            <OfferCompareGrid
              options={compare.options}
              dealType={compare.req.deal_type}
              requestId={compare.req.id}
              onAccept={opt => accept(compare.req, opt)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
