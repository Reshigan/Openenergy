import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Users, DollarSign, Check, ArrowRight, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { Skeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

export function ProcurementHub() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rfps, setRfps] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRfp, setSelectedRfp] = useState<any>(null);

  useEffect(() => { fetchProcurementData(); }, []);

  const fetchProcurementData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rfpsRes, bidsRes] = await Promise.all([
        api.get('/procurement/rfps').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/procurement/bids').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setRfps(rfpsRes.data?.data || []);
      setMyBids(bidsRes.data?.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={4} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchProcurementData} /></div>;

  const activeRfps = rfps.filter(r => r.status === 'open');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Procurement Hub</h1>
          <p className="text-ionex-text-mute">RFP management and bid tracking</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-dark">
          <Plus className="w-4 h-4" /> Create RFP
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
          <p className="text-ionex-text-mute text-sm mb-1">Open RFPs</p>
          <p className="text-2xl font-bold">{activeRfps.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
          <p className="text-ionex-text-mute text-sm mb-1">My Bids</p>
          <p className="text-2xl font-bold">{myBids.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
          <p className="text-ionex-text-mute text-sm mb-1">Won Bids</p>
          <p className="text-2xl font-bold text-green-600">{myBids.filter(b => b.status === 'awarded').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
          <p className="text-ionex-text-mute text-sm mb-1">Total Value</p>
          <p className="text-2xl font-bold">{formatZAR(myBids.reduce((sum, b) => sum + (b.proposed_price || 0), 0))}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open RFPs */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Open RFPs</h2>
          {activeRfps.length === 0 ? (
            <EmptyState icon={<FileText className="w-8 h-8" />} title="No open RFPs" description="Create an RFP to receive bids" />
          ) : (
            <div className="space-y-3">
              {activeRfps.map(rfp => (
                <div key={rfp.id} onClick={() => setSelectedRfp(rfp)} className="border border-ionex-border-100 rounded-lg p-4 hover:bg-gray-50 cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium">{rfp.title}</h3>
                    <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">{rfp.status}</span>
                  </div>
                  <p className="text-sm text-ionex-text-mute mb-2">{rfp.description?.substring(0, 100)}...</p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>{rfp.bid_count || 0} bids</span>
                    <span>Deadline: {rfp.deadline}</span>
                    <span>{formatZAR(rfp.budget_min || 0)} - {formatZAR(rfp.budget_max || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Bids */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">My Bids</h2>
          {myBids.length === 0 ? (
            <EmptyState icon={<Users className="w-8 h-8" />} title="No bids yet" description="Browse RFPs and submit your first bid" />
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">RFP</th><th className="text-right">Bid Amount</th><th className="text-left">Status</th></tr></thead>
              <tbody>
                {myBids.map(bid => (
                  <tr key={bid.id} className="border-b border-ionex-border-50">
                    <td className="py-2">{bid.rfp_title}</td>
                    <td className="text-right font-medium">{formatZAR(bid.proposed_price)}</td>
                    <td><span className={`px-2 py-0.5 text-xs rounded-full ${bid.rfp_status === 'awarded' ? 'bg-green-100 text-green-700' : bid.rfp_status === 'closed' ? 'bg-gray-100 text-ionex-text-sub' : 'bg-blue-100 text-blue-700'}`}>{bid.rfp_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && <CreateRfpModal onClose={() => setShowCreateModal(false)} onCreated={fetchProcurementData} />}
      {selectedRfp && <RfpDetailModal rfp={selectedRfp} onClose={() => setSelectedRfp(null)} />}
    </div>
  );
}

function CreateRfpModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [formData, setFormData] = useState({ title: '', description: '', budget_min: '', budget_max: '', deadline: '', project_type: 'ppa' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/procurement/rfps', { ...formData, budget_min: parseInt(formData.budget_min) || 0, budget_max: parseInt(formData.budget_max) || 0 });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-ionex-border-100 flex items-center justify-between"><h3 className="text-lg font-semibold">Create RFP</h3><button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label><input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" rows={3} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Min Budget (ZAR)</label><input type="number" value={formData.budget_min} onChange={e => setFormData({ ...formData, budget_min: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Max Budget (ZAR)</label><input type="number" value={formData.budget_max} onChange={e => setFormData({ ...formData, budget_max: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label><input type="date" required value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" /></div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-dark disabled:opacity-50">{loading ? 'Creating...' : 'Create RFP'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RfpDetailModal({ rfp, onClose }: { rfp: any; onClose: () => void }) {
  useEscapeKey(onClose);
  const [submitting, setSubmitting] = useState(false);
  const [price, setPrice] = useState('');

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/procurement/rfps/${rfp.id}/bid`, { proposed_price: parseInt(price) });
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="p-4 border-b border-ionex-border-100 flex items-center justify-between"><h3 className="text-lg font-semibold">{rfp.title}</h3><button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button></div>
        <div className="p-6 space-y-4">
          <p className="text-ionex-text-sub">{rfp.description}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-ionex-text-mute">Budget:</span> {formatZAR(rfp.budget_min)} - {formatZAR(rfp.budget_max)}</div>
            <div><span className="text-ionex-text-mute">Deadline:</span> {rfp.deadline}</div>
            <div><span className="text-ionex-text-mute">Type:</span> {rfp.project_type}</div>
            <div><span className="text-ionex-text-mute">Bids:</span> {rfp.bid_count || 0}</div>
          </div>
          <form onSubmit={handleBid} className="border-t border-ionex-border-100 pt-4">
            <h4 className="font-medium mb-3">Submit Your Bid</h4>
            <div className="flex gap-2">
              <input type="number" required placeholder="Your price (ZAR)" value={price} onChange={e => setPrice(e.target.value)} className="flex-1 px-3 py-2 border border-ionex-border-200 rounded-lg" />
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-ionex-accent text-white rounded-lg hover:bg-ionex-accent/90 disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Bid'}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
