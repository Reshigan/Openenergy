import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Store, Search, RefreshCw, Plus, Tag, Zap, Leaf, Package, CheckCircle2, XCircle, Clock, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../lib/useAuth';
import { useEscapeKey } from '../../hooks/useEscapeKey';

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
  energy: <Zap className="w-4 h-4" />,
  capacity: <Zap className="w-4 h-4" />,
  carbon: <Leaf className="w-4 h-4" />,
  equipment: <Package className="w-4 h-4" />,
  service: <Store className="w-4 h-4" />,
};

const STATUS_COLOR: Record<ListingStatus, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  sold: 'bg-gray-200 text-gray-700',
  withdrawn: 'bg-gray-100 text-gray-500',
};

const formatMoney = (value: number, currency = 'ZAR') => {
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

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
    { label: 'My listings', value: summary?.my_listings ?? '—' },
    { label: 'My inquiries', value: summary?.my_inquiries ?? '—' },
    { label: 'Categories', value: summary?.by_type?.length ?? '—' },
  ]), [summary]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-ionex-text-mute">Capacity, RECs and carbon credits — list, inquire, transact.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
            <Plus className="w-4 h-4" /> Create listing
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryTiles.map(t => (
          <div key={t.label} className="p-4 bg-white border border-ionex-border-100 rounded-xl">
            <p className="text-xs uppercase tracking-wide text-ionex-text-mute">{t.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="border-b border-ionex-border-100 flex gap-6">
        {([
          { k: 'browse', label: 'Browse' },
          { k: 'mine', label: 'My listings' },
          { k: 'inquiries', label: 'My inquiries' },
        ] as Array<{ k: Tab; label: string }>).map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`pb-3 border-b-2 transition-colors ${tab === t.k ? 'border-ionex-brand text-ionex-brand font-semibold' : 'border-transparent text-ionex-text-mute hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[260px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ionex-text-mute" />
            <input
              type="text"
              placeholder="Search listings by title or description"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-ionex-border-200 rounded-lg focus:border-ionex-brand"
            />
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-ionex-border-200 rounded-lg"
          >
            {LISTING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      )}

      {loading && <Skeleton variant="card" rows={4} />}
      {error && <ErrorBanner message={error} onRetry={fetchData} />}

      {!loading && !error && tab !== 'inquiries' && (
        listings.length === 0 ? (
          <EmptyState icon={<Store className="w-8 h-8" />} title="No listings" description={tab === 'mine' ? "You haven't created a listing yet." : 'No listings match your filters.'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

      {!loading && !error && tab === 'inquiries' && (
        myInquiries.length === 0 ? (
          <EmptyState icon={<MessageSquare className="w-8 h-8" />} title="No inquiries" description="You haven't inquired on any listings yet." />
        ) : (
          <div className="space-y-3">
            {myInquiries.map(inq => (
              <InquiryRow key={inq.id} inquiry={inq} />
            ))}
          </div>
        )
      )}

      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          isMine={selectedListing.seller_id === user?.id}
          inquiries={selectedInquiries}
          inquiriesLoading={detailLoading}
          onClose={() => { setSelectedListing(null); setSelectedInquiries(null); }}
          onInquire={() => { setShowInquire(selectedListing); }}
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

function ListingCard({ listing, isMine, onOpen, onInquire }: {
  listing: Listing;
  isMine: boolean;
  onOpen: () => void;
  onInquire: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 hover:shadow-md transition-shadow flex flex-col">
      <div className="p-5 flex-1 space-y-3">
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-1 px-2 py-1 bg-ionex-brand/10 text-ionex-brand text-xs rounded-full">
            {TYPE_ICONS[listing.listing_type] || <Tag className="w-4 h-4" />}
            {listing.listing_type.replace('_', ' ').toUpperCase()}
          </span>
          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[listing.status] || 'bg-gray-100 text-gray-700'}`}>
            {listing.status}
          </span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{listing.title}</h3>
          {listing.seller_company && <p className="text-sm text-ionex-text-mute">by {listing.seller_company}</p>}
        </div>
        {listing.description && (
          <p className="text-sm text-gray-600 line-clamp-3">{listing.description}</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-gray-900">{formatMoney(listing.price, listing.currency)}{listing.price_unit ? ` / ${listing.price_unit}` : ''}</span>
          {listing.volume_available != null && (
            <span className="text-ionex-text-mute">{listing.volume_available}{listing.volume_unit ? ` ${listing.volume_unit}` : ''} available</span>
          )}
        </div>
      </div>
      <div className="p-4 border-t border-ionex-border-100 flex gap-2">
        <button onClick={onOpen} className="flex-1 px-3 py-2 border border-ionex-border-200 rounded-lg text-sm hover:bg-gray-50">
          View details
        </button>
        {!isMine && listing.status === 'active' && (
          <button onClick={onInquire} className="flex-1 px-3 py-2 bg-ionex-brand text-white rounded-lg text-sm hover:bg-ionex-brand-light">
            Inquire
          </button>
        )}
      </div>
    </div>
  );
}

function InquiryRow({ inquiry }: { inquiry: Inquiry }) {
  const statusIcon: Record<Inquiry['status'], React.ReactNode> = {
    pending: <Clock className="w-4 h-4 text-amber-600" />,
    responded: <MessageSquare className="w-4 h-4 text-blue-600" />,
    accepted: <CheckCircle2 className="w-4 h-4 text-green-600" />,
    rejected: <XCircle className="w-4 h-4 text-red-600" />,
  };
  return (
    <div className="p-4 bg-white border border-ionex-border-100 rounded-lg flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{inquiry.listing_title || 'Listing'}</p>
        <p className="text-sm text-ionex-text-mute truncate">
          {inquiry.seller_company || inquiry.seller_name || 'Seller'} · sent {new Date(inquiry.created_at).toLocaleDateString()}
        </p>
        {inquiry.message && <p className="text-sm text-gray-600 mt-1 truncate">“{inquiry.message}”</p>}
      </div>
      <span className="flex items-center gap-1 text-sm capitalize">
        {statusIcon[inquiry.status]}
        {inquiry.status}
      </span>
    </div>
  );
}

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-start justify-between gap-4">
          <div>
            <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[listing.status]}`}>{listing.status}</span>
            <h2 className="text-xl font-bold mt-2">{listing.title}</h2>
            {listing.seller_company && <p className="text-sm text-ionex-text-mute">by {listing.seller_company}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {listing.description && <p className="text-gray-700 whitespace-pre-wrap">{listing.description}</p>}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-ionex-text-mute">Price</p>
              <p className="font-semibold">{formatMoney(listing.price, listing.currency)}{listing.price_unit ? ` / ${listing.price_unit}` : ''}</p>
            </div>
            {listing.volume_available != null && (
              <div>
                <p className="text-ionex-text-mute">Volume available</p>
                <p className="font-semibold">{listing.volume_available}{listing.volume_unit ? ` ${listing.volume_unit}` : ''}</p>
              </div>
            )}
            {listing.delivery_start && (
              <div>
                <p className="text-ionex-text-mute">Delivery start</p>
                <p className="font-semibold">{listing.delivery_start}</p>
              </div>
            )}
            {listing.delivery_end && (
              <div>
                <p className="text-ionex-text-mute">Delivery end</p>
                <p className="font-semibold">{listing.delivery_end}</p>
              </div>
            )}
          </div>

          {!isMine && listing.status === 'active' && (
            <button onClick={onInquire} className="w-full py-3 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
              Inquire about this listing
            </button>
          )}
          {isMine && listing.status === 'active' && (
            <button onClick={onWithdraw} className="w-full py-3 border border-red-300 text-red-700 rounded-lg hover:bg-red-50">
              Withdraw listing
            </button>
          )}
        </div>

        {isMine && (
          <div className="p-5 border-t border-ionex-border-100 space-y-3">
            <h3 className="font-semibold text-gray-900">Inquiries</h3>
            {inquiriesLoading && <Skeleton variant="card" rows={2} />}
            {!inquiriesLoading && (!inquiries || inquiries.length === 0) && (
              <p className="text-sm text-ionex-text-mute">No inquiries yet.</p>
            )}
            {!inquiriesLoading && inquiries && inquiries.length > 0 && (
              <div className="space-y-2">
                {inquiries.map(inq => (
                  <div key={inq.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{inq.buyer_company || inq.buyer_name || inq.buyer_id}</p>
                        <p className="text-xs text-ionex-text-mute">{new Date(inq.created_at).toLocaleString()}</p>
                      </div>
                      <span className="text-sm capitalize">{inq.status}</span>
                    </div>
                    {inq.message && <p className="text-sm text-gray-700 mt-2">“{inq.message}”</p>}
                    {inq.status === 'pending' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => onRespond(inq.id, 'accepted')}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => onRespond(inq.id, 'rejected')}
                          className="flex-1 px-3 py-2 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50"
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

function CreateListingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void; }) {
  useEscapeKey(onClose);
  const [form, setForm] = useState({
    listing_type: 'carbon' as ListingType,
    // defaults below match tonnes+ZAR for carbon; user can edit
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <h2 className="text-xl font-bold">Create listing</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {err && <ErrorBanner message={err} />}
          <Field label="Type">
            <select
              value={form.listing_type}
              onChange={e => setForm(f => ({ ...f, listing_type: e.target.value as ListingType }))}
              className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg"
            >
              {LISTING_TYPES.filter(t => t.value !== 'all').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Title *">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
          </Field>
          <Field label="Description">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price *">
              <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" step="any" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Price unit">
              <input value={form.price_unit} onChange={e => setForm(f => ({ ...f, price_unit: e.target.value }))} placeholder="per_tonne / per_mwh / per_rec" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Currency">
              <input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Volume available">
              <input value={form.volume_available} onChange={e => setForm(f => ({ ...f, volume_available: e.target.value }))} type="number" step="any" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Volume unit">
              <input value={form.volume_unit} onChange={e => setForm(f => ({ ...f, volume_unit: e.target.value }))} placeholder="tonnes / mwh / recs" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Delivery start">
              <input value={form.delivery_start} onChange={e => setForm(f => ({ ...f, delivery_start: e.target.value }))} type="date" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
            <Field label="Delivery end">
              <input value={form.delivery_end} onChange={e => setForm(f => ({ ...f, delivery_end: e.target.value }))} type="date" className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" />
            </Field>
          </div>
        </div>
        <div className="p-5 border-t border-ionex-border-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create listing'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-ionex-border-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Inquire</h2>
            <p className="text-sm text-ionex-text-mute">{listing.title}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {err && <ErrorBanner message={err} />}
          <Field label="Message to seller (optional)">
            <textarea
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Volume wanted, delivery terms, any constraints…"
              className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg"
            />
          </Field>
        </div>
        <div className="p-5 border-t border-ionex-border-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send inquiry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
