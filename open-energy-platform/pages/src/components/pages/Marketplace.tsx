import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Store, Search, RefreshCw, Plus, Tag, Zap, Leaf, Package, CheckCircle2, XCircle, Clock, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// ── Design tokens ────────────────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BG2     = 'oklch(0.93 0.004 250)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_BG  = 'oklch(0.96 0.05 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const WARN    = 'oklch(0.50 0.18 55)';
const WARN_BG = 'oklch(0.96 0.05 55)';
const GOOD    = 'oklch(0.40 0.16 155)';
const GOOD_BG = 'oklch(0.95 0.04 155)';
const MONO    = '"IBM Plex Mono","Fira Code",monospace';

// ── Types ────────────────────────────────────────────────────────────────────
type ListingType = 'energy' | 'capacity' | 'carbon' | 'equipment' | 'service';
type ListingStatus = 'active' | 'pending' | 'sold' | 'withdrawn';

interface Listing {
  id: string;
  seller_id: string;
  listing_type: ListingType;
  title: string;
  description?: string;
  price: number;
  price_unit?: string;
  currency?: string;
  volume_available?: number;
  volume_unit?: string;
  delivery_start?: string;
  delivery_end?: string;
  status: ListingStatus;
  created_at: string;
  seller_name?: string;
  seller_company?: string;
}

interface Inquiry {
  id: string;
  listing_id: string;
  buyer_id: string;
  buyer_name?: string;
  buyer_company?: string;
  message?: string;
  status: 'pending' | 'responded' | 'accepted' | 'rejected';
  created_at: string;
  listing_title?: string;
  listing_type?: ListingType;
  seller_id?: string;
  seller_name?: string;
  seller_company?: string;
}

interface Summary {
  active_listings: number;
  by_type: Array<{ listing_type: string; c: number }>;
  my_listings: number;
  my_inquiries: number;
}

type Tab = 'browse' | 'mine' | 'inquiries';

const LISTING_TYPES: Array<{ value: ListingType | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'energy', label: 'Energy (MWh)' },
  { value: 'capacity', label: 'Capacity (MW)' },
  { value: 'carbon', label: 'Carbon credits / RECs' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'service', label: 'Services' },
];

const TYPE_ICONS: Record<ListingType, React.ReactNode> = {
  energy:    <Zap size={12} />,
  capacity:  <Zap size={12} />,
  carbon:    <Leaf size={12} />,
  equipment: <Package size={12} />,
  service:   <Store size={12} />,
};

const statusStyle = (s: ListingStatus | string) => {
  if (s === 'active')    return { background: GOOD_BG, color: GOOD };
  if (s === 'pending')   return { background: WARN_BG, color: WARN };
  if (s === 'sold')      return { background: BG2,     color: TX2 };
  return { background: BG2, color: TX3 };
};

const inquiryStatusStyle = (s: string) => {
  if (s === 'accepted') return { background: GOOD_BG, color: GOOD };
  if (s === 'rejected') return { background: BAD_BG,  color: BAD };
  if (s === 'responded') return { background: ACC_BG, color: ACC };
  return { background: WARN_BG, color: WARN };
};

const formatMoney = (value: number, currency = 'ZAR') => {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

// ── Main component ───────────────────────────────────────────────────────────
export function Marketplace() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('browse');
  const [listings, setListings] = useState<Listing[]>([]);
  const [myInquiries, setMyInquiries] = useState<Inquiry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedInquiries, setSelectedInquiries] = useState<Inquiry[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showInquire, setShowInquire] = useState<Listing | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(h);
  }, [searchQuery]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'browse') {
        const params = new URLSearchParams();
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (debouncedQuery) params.set('q', debouncedQuery);
        const [list, sum] = await Promise.all([
          api.get(`/marketplace/listings?${params.toString()}`),
          api.get('/marketplace/summary'),
        ]);
        setListings(list.data?.data || []);
        setSummary(sum.data?.data || null);
      } else if (tab === 'mine') {
        const [list, sum] = await Promise.all([
          api.get('/marketplace/listings?mine=1'),
          api.get('/marketplace/summary'),
        ]);
        setListings(list.data?.data || []);
        setSummary(sum.data?.data || null);
      } else {
        const [inq, sum] = await Promise.all([
          api.get('/marketplace/inquiries/mine'),
          api.get('/marketplace/summary'),
        ]);
        setMyInquiries(inq.data?.data || []);
        setSummary(sum.data?.data || null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [tab, typeFilter, debouncedQuery]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const openListing = useCallback(async (listing: Listing) => {
    setSelectedListing(listing);
    setSelectedInquiries(null);
    if (listing.seller_id === user?.id) {
      setDetailLoading(true);
      try {
        const res = await api.get(`/marketplace/listings/${listing.id}`);
        setSelectedInquiries(res.data?.data?.inquiries || []);
      } catch {
        setSelectedInquiries([]);
      } finally {
        setDetailLoading(false);
      }
    }
  }, [user?.id]);

  const respondToInquiry = useCallback(async (inquiryId: string, status: 'accepted' | 'rejected', message?: string) => {
    try {
      await api.post(`/marketplace/inquiries/${inquiryId}/respond`, { status, message });
      if (selectedListing) await openListing(selectedListing);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to respond');
    }
  }, [selectedListing, openListing, fetchData]);

  const withdrawListing = useCallback(async (listing: Listing) => {
    if (!confirm(`Withdraw listing "${listing.title}"?`)) return;
    try {
      await api.post(`/marketplace/listings/${listing.id}/withdraw`, {});
      setSelectedListing(null);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to withdraw');
    }
  }, [fetchData]);

  const summaryTiles = useMemo(() => ([
    { label: 'Active listings', value: summary?.active_listings ?? '—' },
    { label: 'My listings',     value: summary?.my_listings ?? '—' },
    { label: 'My inquiries',    value: summary?.my_inquiries ?? '—' },
    { label: 'Categories',      value: summary?.by_type?.length ?? '—' },
  ]), [summary]);

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: 'browse',    label: 'Browse' },
    { k: 'mine',      label: 'My Listings' },
    { k: 'inquiries', label: 'My Inquiries' },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
      fontFamily: 'inherit',
    }}>
      {/* ── LEFT COLUMN ── */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Store size={20} color={ACC} />
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Marketplace</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={fetchData}
                style={{
                  background: 'transparent',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  padding: '7px 10px',
                  cursor: 'pointer',
                  color: TX2,
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="Refresh"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  background: ACC,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Plus size={14} /> Create listing
              </button>
            </div>
          </div>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Capacity, RECs and carbon credits — list, inquire, transact.
          </p>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {summaryTiles.map(t => (
            <div key={t.label} style={{
              background: BG1,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: '12px 16px',
              flex: 1,
              minWidth: 100,
            }}>
              <div style={{ fontSize: 10, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {t.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TX1, fontFamily: MONO, marginTop: 4 }}>
                {t.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${BORDER}`, marginBottom: 20 }}>
          {TABS.map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.k ? `2px solid ${ACC}` : '2px solid transparent',
                marginBottom: -2,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === t.k ? 700 : 500,
                color: tab === t.k ? ACC : TX2,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <ErrorBanner message={error} onRetry={fetchData} />}
        {loading && <Skeleton variant="card" rows={4} />}

        {/* Listings grid */}
        {!loading && !error && tab !== 'inquiries' && (
          listings.length === 0 ? (
            <EmptyState
              icon={<Store size={32} color={TX3} />}
              title="No listings"
              description={tab === 'mine' ? "You haven't created a listing yet." : 'No listings match your filters.'}
            />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}>
              {listings.map(l => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isMine={l.seller_id === user?.id}
                  onOpen={() => openListing(l)}
                  onInquire={() => setShowInquire(l)}
                />
              ))}
            </div>
          )
        )}

        {/* Inquiries list */}
        {!loading && !error && tab === 'inquiries' && (
          myInquiries.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={32} color={TX3} />}
              title="No inquiries"
              description="You haven't inquired on any listings yet."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myInquiries.map(inq => (
                <InquiryRow key={inq.id} inquiry={inq} />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Search (browse tab only) */}
        {tab === 'browse' && (
          <div style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Search &amp; Filter
            </div>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TX3 }} />
              <input
                type="text"
                placeholder="Search listings…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  paddingLeft: 30,
                  paddingRight: 12,
                  paddingTop: 8,
                  paddingBottom: 8,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: TX1,
                  background: BG1,
                  outline: 'none',
                }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 13,
                color: TX1,
                background: BG1,
                cursor: 'pointer',
              }}
            >
              {LISTING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {/* Quick actions */}
        <div style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              style={{
                background: ACC,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '9px 14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              <Plus size={14} /> New Listing
            </button>
            <button
              type="button"
              onClick={fetchData}
              style={{
                background: 'transparent',
                color: ACC,
                border: `1px solid ${ACC}`,
                borderRadius: 6,
                padding: '8px 14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Market Summary
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summaryTiles.map(t => (
              <div key={t.label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 10px',
                background: BG1,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
              }}>
                <span style={{ fontSize: 12, color: TX2 }}>{t.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: TX1, fontFamily: MONO }}>{t.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By-type breakdown */}
        {summary?.by_type && summary.by_type.length > 0 && (
          <div style={{
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: '16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              By Category
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {summary.by_type.map(bt => (
                <div key={bt.listing_type} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: TX2,
                    textTransform: 'capitalize',
                  }}>
                    {TYPE_ICONS[bt.listing_type as ListingType] ?? <Tag size={12} />}
                    {bt.listing_type.replace('_', ' ')}
                  </span>
                  <span style={{
                    background: ACC_BG,
                    color: ACC,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontFamily: MONO,
                  }}>
                    {bt.c}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          isMine={selectedListing.seller_id === user?.id}
          inquiries={selectedInquiries}
          inquiriesLoading={detailLoading}
          onClose={() => { setSelectedListing(null); setSelectedInquiries(null); }}
          onInquire={() => { setShowInquire(selectedListing); setSelectedListing(null); setSelectedInquiries(null); }}
          onWithdraw={() => withdrawListing(selectedListing)}
          onRespond={respondToInquiry}
        />
      )}

      {showCreate && (
        <CreateListingModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await fetchData(); }}
        />
      )}

      {showInquire && (
        <InquireModal
          listing={showInquire}
          onClose={() => setShowInquire(null)}
          onSent={() => { setShowInquire(null); setTab('inquiries'); }}
        />
      )}
    </div>
  );
}

export default Marketplace;

// ── Listing card ─────────────────────────────────────────────────────────────
function ListingCard({ listing, isMine, onOpen, onInquire }: {
  listing: Listing;
  isMine: boolean;
  onOpen: () => void;
  onInquire: () => void;
}) {
  const ss = statusStyle(listing.status);
  return (
    <div style={{
      background: BG1,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ padding: '14px 16px', flex: 1 }}>
        {/* Type + status row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: ACC_BG,
            color: ACC,
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 10,
            letterSpacing: '0.04em',
          }}>
            {TYPE_ICONS[listing.listing_type] ?? <Tag size={12} />}
            {listing.listing_type.replace('_', ' ').toUpperCase()}
          </span>
          <span style={{
            ...ss,
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 10,
            textTransform: 'uppercase',
          }}>
            {listing.status}
          </span>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: TX1 }}>{listing.title}</div>
          {listing.seller_company && (
            <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>by {listing.seller_company}</div>
          )}
        </div>

        {listing.description && (
          <div style={{
            fontSize: 12,
            color: TX2,
            marginBottom: 10,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}>
            {listing.description}
          </div>
        )}

        {/* Price + volume */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: TX1, fontFamily: MONO }}>
            {formatMoney(listing.price, listing.currency)}{listing.price_unit ? ` / ${listing.price_unit}` : ''}
          </span>
          {listing.volume_available != null && (
            <span style={{ color: TX3 }}>
              {listing.volume_available}{listing.volume_unit ? ` ${listing.volume_unit}` : ''} avail.
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        padding: '10px 16px',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex',
        gap: 8,
      }}>
        <button
          type="button"
          onClick={onOpen}
          style={{
            flex: 1,
            padding: '7px 10px',
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: TX1,
            cursor: 'pointer',
          }}
        >
          View details
        </button>
        {!isMine && listing.status === 'active' && (
          <button
            type="button"
            onClick={onInquire}
            style={{
              flex: 1,
              padding: '7px 10px',
              background: ACC,
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Inquire
          </button>
        )}
      </div>
    </div>
  );
}

// ── Inquiry row ───────────────────────────────────────────────────────────────
function InquiryRow({ inquiry }: { inquiry: Inquiry }) {
  const ss = inquiryStatusStyle(inquiry.status);
  const Icon = {
    pending:   <Clock size={14} color={WARN} />,
    responded: <MessageSquare size={14} color={ACC} />,
    accepted:  <CheckCircle2 size={14} color={GOOD} />,
    rejected:  <XCircle size={14} color={BAD} />,
  }[inquiry.status];

  return (
    <div style={{
      background: BG1,
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TX1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inquiry.listing_title || 'Listing'}
        </div>
        <div style={{ fontSize: 12, color: TX3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {inquiry.seller_company || inquiry.seller_name || 'Seller'} · {new Date(inquiry.created_at).toLocaleDateString()}
        </div>
        {inquiry.message && (
          <div style={{ fontSize: 12, color: TX2, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{inquiry.message}"
          </div>
        )}
      </div>
      <span style={{
        ...ss,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 10,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}>
        {Icon}
        {inquiry.status}
      </span>
    </div>
  );
}

// ── Listing detail modal ──────────────────────────────────────────────────────
function ListingDetailModal({ listing, isMine, inquiries, inquiriesLoading, onClose, onInquire, onWithdraw, onRespond }: {
  listing: Listing;
  isMine: boolean;
  inquiries: Inquiry[] | null;
  inquiriesLoading: boolean;
  onClose: () => void;
  onInquire: () => void;
  onWithdraw: () => void;
  onRespond: (inquiryId: string, status: 'accepted' | 'rejected', message?: string) => void;
}) {
  useEscapeKey(onClose);
  const ss = statusStyle(listing.status);
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <span style={{ ...ss, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, textTransform: 'uppercase' }}>
              {listing.status}
            </span>
            <div style={{ fontSize: 18, fontWeight: 700, color: TX1, marginTop: 6 }}>{listing.title}</div>
            {listing.seller_company && <div style={{ fontSize: 13, color: TX3, marginTop: 2 }}>by {listing.seller_company}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: TX2, fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px' }}>
          {listing.description && (
            <p style={{ fontSize: 13, color: TX2, whiteSpace: 'pre-wrap', marginBottom: 16 }}>{listing.description}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: BG2, borderRadius: 6, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Price</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: TX1, fontFamily: MONO }}>
                {formatMoney(listing.price, listing.currency)}{listing.price_unit ? ` / ${listing.price_unit}` : ''}
              </div>
            </div>
            {listing.volume_available != null && (
              <div style={{ background: BG2, borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Volume available</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TX1, fontFamily: MONO }}>
                  {listing.volume_available}{listing.volume_unit ? ` ${listing.volume_unit}` : ''}
                </div>
              </div>
            )}
            {listing.delivery_start && (
              <div style={{ background: BG2, borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Delivery start</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>{listing.delivery_start}</div>
              </div>
            )}
            {listing.delivery_end && (
              <div style={{ background: BG2, borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: TX3, marginBottom: 4 }}>Delivery end</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>{listing.delivery_end}</div>
              </div>
            )}
          </div>

          {!isMine && listing.status === 'active' && (
            <button
              type="button"
              onClick={onInquire}
              style={{ width: '100%', padding: '10px 0', background: ACC, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              Inquire about this listing
            </button>
          )}
          {isMine && listing.status === 'active' && (
            <button
              type="button"
              onClick={onWithdraw}
              style={{ width: '100%', padding: '10px 0', background: BAD_BG, color: BAD, border: `1px solid ${BAD}`, borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              Withdraw listing
            </button>
          )}
        </div>

        {/* Inquiries (seller view) */}
        {isMine && (
          <div style={{ padding: '18px 22px', borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Inquiries
            </div>
            {inquiriesLoading && <Skeleton variant="card" rows={2} />}
            {!inquiriesLoading && (!inquiries || inquiries.length === 0) && (
              <p style={{ fontSize: 13, color: TX3 }}>No inquiries yet.</p>
            )}
            {!inquiriesLoading && inquiries && inquiries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inquiries.map(inq => (
                  <div key={inq.id} style={{ background: BG2, borderRadius: 6, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TX1 }}>
                          {inq.buyer_company || inq.buyer_name || inq.buyer_id}
                        </div>
                        <div style={{ fontSize: 11, color: TX3 }}>{new Date(inq.created_at).toLocaleString()}</div>
                      </div>
                      <span style={{
                        ...inquiryStatusStyle(inq.status),
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        textTransform: 'capitalize',
                      }}>
                        {inq.status}
                      </span>
                    </div>
                    {inq.message && (
                      <p style={{ fontSize: 12, color: TX2, margin: '0 0 8px' }}>"{inq.message}"</p>
                    )}
                    {inq.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => onRespond(inq.id, 'accepted')}
                          style={{ flex: 1, padding: '7px 0', background: GOOD, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onRespond(inq.id, 'rejected')}
                          style={{ flex: 1, padding: '7px 0', background: BAD_BG, color: BAD, border: `1px solid ${BAD}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create listing modal ──────────────────────────────────────────────────────
function CreateListingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void; }) {
  useEscapeKey(onClose);
  const [form, setForm] = useState({
    listing_type: 'carbon' as ListingType,
    title: '',
    description: '',
    price: '',
    price_unit: 'per_tonne',
    currency: 'ZAR',
    volume_available: '',
    volume_unit: 'tonnes',
    delivery_start: '',
    delivery_end: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim() || !form.price || Number.isNaN(Number(form.price))) {
      setErr('Title and numeric price are required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await api.post('/marketplace/listings', {
        listing_type: form.listing_type,
        title: form.title.trim(),
        description: form.description || undefined,
        price: Number(form.price),
        price_unit: form.price_unit || undefined,
        currency: form.currency || undefined,
        volume_available: form.volume_available ? Number(form.volume_available) : undefined,
        volume_unit: form.volume_unit || undefined,
        delivery_start: form.delivery_start || undefined,
        delivery_end: form.delivery_end || undefined,
      });
      onCreated();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    fontSize: 13,
    color: TX1,
    background: BG1,
    outline: 'none',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: TX1 }}>Create listing</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: TX2 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <ErrorBanner message={err} />}
          <Field label="Type">
            <select
              value={form.listing_type}
              onChange={e => setForm(f => ({ ...f, listing_type: e.target.value as ListingType }))}
              style={inputStyle}
            >
              {LISTING_TYPES.filter(t => t.value !== 'all').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Title *">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={inputStyle}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Price *">
              <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" step="any" style={inputStyle} />
            </Field>
            <Field label="Price unit">
              <input value={form.price_unit} onChange={e => setForm(f => ({ ...f, price_unit: e.target.value }))} placeholder="per_tonne / per_mwh" style={inputStyle} />
            </Field>
            <Field label="Currency">
              <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Volume available">
              <input value={form.volume_available} onChange={e => setForm(f => ({ ...f, volume_available: e.target.value }))} type="number" step="any" style={inputStyle} />
            </Field>
            <Field label="Volume unit">
              <input value={form.volume_unit} onChange={e => setForm(f => ({ ...f, volume_unit: e.target.value }))} placeholder="tonnes / mwh / recs" style={inputStyle} />
            </Field>
            <Field label="Delivery start">
              <input value={form.delivery_start} onChange={e => setForm(f => ({ ...f, delivery_start: e.target.value }))} type="date" style={inputStyle} />
            </Field>
            <Field label="Delivery end">
              <input value={form.delivery_end} onChange={e => setForm(f => ({ ...f, delivery_end: e.target.value }))} type="date" style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, fontWeight: 600, color: TX1, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{ padding: '8px 16px', background: ACC, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: submitting ? 0.55 : 1 }}
          >
            {submitting ? 'Creating…' : 'Create listing'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inquire modal ─────────────────────────────────────────────────────────────
function InquireModal({ listing, onClose, onSent }: { listing: Listing; onClose: () => void; onSent: () => void; }) {
  useEscapeKey(onClose);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await api.post(`/marketplace/listings/${listing.id}/inquire`, { message: message || undefined });
      onSent();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to send inquiry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{ background: BG1, borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 440, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: TX1 }}>Inquire</div>
            <div style={{ fontSize: 12, color: TX3, marginTop: 2 }}>{listing.title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: TX2 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <ErrorBanner message={err} />}
          <Field label="Message to seller (optional)">
            <textarea
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Volume wanted, delivery terms, any constraints…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 13,
                color: TX1,
                background: BG1,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, fontWeight: 600, color: TX1, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{ padding: '8px 16px', background: ACC, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: submitting ? 0.55 : 1 }}
          >
            {submitting ? 'Sending…' : 'Send inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Form field helper ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TX2, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}
