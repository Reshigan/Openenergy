import React, { useState, useEffect } from 'react';
import { Leaf, TrendingUp, RefreshCw, Plus, ArrowUpRight, ArrowDownRight, FileText, Send } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

const formatZAR = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

export function Carbon() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [options, setOptions] = useState<any[]>([]);
  const [balance, setBalance] = useState({ total: 0, available: 0, retired: 0 });
  const [showRetireModal, setShowRetireModal] = useState(false);

  useEffect(() => { fetchCarbonData(); }, []);

  const fetchCarbonData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [creditsRes, optionsRes] = await Promise.all([
        api.get('/carbon/credits').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/carbon/options').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setCredits(creditsRes.data?.data || []);
      setOptions(optionsRes.data?.data || []);
      setBalance({ total: 5000, available: 3500, retired: 1500 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={4} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchCarbonData} /></div>;

  const vintageData = [
    { vintage: '2021', credits: 1200, color: '#22c55e' },
    { vintage: '2022', credits: 1800, color: '#84cc16' },
    { vintage: '2023', credits: 2200, color: '#c9a227' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carbon Credits</h1>
          <p className="text-ionex-text-mute">Track and manage your carbon portfolio</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRetireModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            <Leaf className="w-4 h-4" /> Retire Credits
          </button>
          <button onClick={fetchCarbonData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6 text-white">
          <p className="text-green-100 text-sm mb-1">Total Holdings</p>
          <p className="text-3xl font-bold">{balance.total.toLocaleString()} tCO₂e</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Available</p>
          <p className="text-2xl font-bold text-green-600">{balance.available.toLocaleString()} tCO₂e</p>
        </div>
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <p className="text-ionex-text-mute text-sm mb-1">Retired</p>
          <p className="text-2xl font-bold text-gray-400">{balance.retired.toLocaleString()} tCO₂e</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Credits List */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Credit Holdings</h2>
          {credits.length === 0 ? (
            <EmptyState icon={<Leaf className="w-8 h-8" />} title="No carbon credits" description="Purchase credits to build your portfolio" />
          ) : (
            <>
              <ExportBar data={credits} filename="carbon_credits" />
              <table className="w-full text-sm">
                <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">Project</th><th className="text-right">Quantity</th><th className="text-right">Price</th><th className="text-left">Status</th></tr></thead>
                <tbody>
                  {credits.slice(0, 10).map((c, i) => (
                    <tr key={i} className="border-b border-ionex-border-50">
                      <td className="py-2"><EntityLink id={c.project_id} type="project" /></td>
                      <td className="text-right">{c.quantity?.toLocaleString()} tCO₂e</td>
                      <td className="text-right">{formatZAR(c.price_per_credit || 150)}</td>
                      <td><span className={`px-2 py-0.5 text-xs rounded-full ${c.status === 'available' ? 'bg-green-100 text-green-700' : c.status === 'retired' ? 'bg-gray-100 text-ionex-text-sub' : 'bg-blue-100 text-blue-700'}`}>{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Vintage Chart */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Vintage Distribution</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={vintageData}>
              <XAxis dataKey="vintage" />
              <YAxis tickFormatter={v => `${v}`} />
              <Tooltip formatter={(v: number) => [`${v} tCO₂e`, 'Credits']} />
              <Bar dataKey="credits" radius={[4, 4, 0, 0]}>
                {vintageData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Options Book */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Options Book</h2>
        {options.length === 0 ? <div className="text-center py-8 text-ionex-text-mute">No active options</div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">Type</th><th className="text-right">Strike</th><th className="text-right">Expiry</th><th className="text-right">Greeks</th></tr></thead>
            <tbody>
              {options.map((o, i) => (
                <tr key={i} className="border-b border-ionex-border-50">
                  <td className="py-2"><span className={`px-2 py-0.5 text-xs rounded ${o.type === 'call' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.type?.toUpperCase()}</span></td>
                  <td className="text-right">{formatZAR(o.strike)}</td>
                  <td className="text-right">{o.expiry}</td>
                  <td className="text-right">Δ {o.delta} | Γ {o.gamma}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showRetireModal && <RetireModal onClose={() => setShowRetireModal(false)} onRetired={fetchCarbonData} />}
    </div>
  );
}

function RetireModal({ onClose, onRetired }: { onClose: () => void; onRetired: () => void }) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/carbon/retire', { quantity: parseInt(quantity), reason });
      onRetired();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-ionex-border-100"><h3 className="text-lg font-semibold">Retire Carbon Credits</h3></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (tCO₂e)</label>
            <input type="number" required value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" placeholder="100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border border-ionex-border-200 rounded-lg" rows={3} placeholder="Reason for retirement..." />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-ionex-border-300 rounded-lg">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{loading ? 'Processing...' : 'Retire Credits'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
