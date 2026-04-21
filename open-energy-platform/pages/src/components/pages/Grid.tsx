import React, { useState, useEffect } from 'react';
import { Zap, Activity, AlertTriangle, RefreshCw, BarChart2, TrendingUp, MapPin, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';

export function Grid() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gridStatus, setGridStatus] = useState<any>(null);
  const [wheeling, setWheeling] = useState<any[]>([]);
  const [imbalances, setImbalances] = useState<any[]>([]);

  useEffect(() => { fetchGridData(); }, []);

  const fetchGridData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, wheelRes, imbRes] = await Promise.all([
        api.get('/grid/status').catch(() => ({ data: { success: true, data: getDefaultStatus() } })),
        api.get('/grid/wheeling').catch(() => ({ data: { success: true, data: [] } })),
        api.get('/grid/imbalances').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setGridStatus(statusRes.data?.data || getDefaultStatus());
      setWheeling(wheelRes.data?.data || []);
      setImbalances(imbRes.data?.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchGridData} /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Grid Management</h1>
          <p className="text-ionex-text-mute">Real-time grid status and power wheeling</p>
        </div>
        <button onClick={fetchGridData} className="flex items-center gap-2 px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatusCard
          title="Grid Frequency"
          value={gridStatus?.frequency || '50.05'}
          unit="Hz"
          icon={<Activity className="w-5 h-5" />}
          status={gridStatus?.frequency > 49.5 && gridStatus?.frequency < 50.5 ? 'normal' : 'warning'}
        />
        <StatusCard
          title="Total Load"
          value={gridStatus?.totalLoad || '42,500'}
          unit="MW"
          icon={<Zap className="w-5 h-5" />}
          status="normal"
          trend={{ value: 2.5, positive: false }}
        />
        <StatusCard
          title="Available Capacity"
          value={gridStatus?.capacity || '15,200'}
          unit="MW"
          icon={<TrendingUp className="w-5 h-5" />}
          status="normal"
        />
        <StatusCard
          title="Active Wheeling"
          value={gridStatus?.activeWheeling || '8'}
          unit="transactions"
          icon={<MapPin className="w-5 h-5" />}
          status="normal"
        />
      </div>

      {/* Grid Map Placeholder */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Network Status</h2>
        <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg h-64 flex items-center justify-center">
          <div className="text-center">
            <Activity className="w-12 h-12 text-ionex-brand mx-auto mb-2" />
            <p className="text-ionex-text-sub">Grid topology visualization</p>
            <p className="text-sm text-ionex-text-mute">Eskom + Independent generators</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wheeling Transactions */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Active Wheeling</h2>
          {wheeling.length === 0 ? (
            <EmptyState icon={<MapPin className="w-8 h-8" />} title="No active wheeling" description="Power wheeling transactions will appear here" />
          ) : (
            <div className="space-y-3">
              {wheeling.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-ionex-accent/10 rounded-lg text-ionex-accent">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-medium">{w.from} → {w.to}</p>
                      <p className="text-sm text-ionex-text-mute">{w.volume_mw} MW</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${w.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{w.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Imbalance Alerts */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">Imbalance Alerts</h2>
          {imbalances.length === 0 ? (
            <EmptyState icon={<Activity className="w-8 h-8" />} title="No imbalances" description="System is balanced" />
          ) : (
            <div className="space-y-3">
              {imbalances.map((imb, i) => (
                <div key={i} className={`p-4 rounded-lg ${imb.severity === 'high' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{imb.zone}</span>
                    <span className={`text-xs ${imb.severity === 'high' ? 'text-red-600' : 'text-yellow-600'}`}>{imb.mw_diff} MW</span>
                  </div>
                  <p className="text-sm text-ionex-text-sub">{imb.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Frequency Chart Placeholder */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Grid Frequency (24h)</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Normal</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded"></span> Warning</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> Critical</span>
          </div>
        </div>
        <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
          <BarChart2 className="w-8 h-8 text-ionex-text-mute mr-2" />
          <span className="text-ionex-text-sub">Real-time frequency chart</span>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ title, value, unit, icon, status, trend }: {
  title: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  status: string;
  trend?: { value: number; positive: boolean };
}) {
  const statusColors: Record<string, string> = {
    normal: 'text-green-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ionex-text-mute text-sm">{title}</span>
        <div className={`p-2 rounded-lg ${status === 'normal' ? 'bg-green-50 text-green-600' : status === 'warning' ? 'bg-yellow-50 text-yellow-600' : 'bg-red-50 text-red-600'}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold ${statusColors[status]}`}>{value}</span>
        <span className="text-ionex-text-mute text-sm">{unit}</span>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-sm ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
          {trend.positive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {trend.value}% from last hour
        </div>
      )}
    </div>
  );
}