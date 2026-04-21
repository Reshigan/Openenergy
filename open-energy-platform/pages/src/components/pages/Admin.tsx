import React, { useState, useEffect } from 'react';
import { Users, Settings, Shield, Activity, DollarSign, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, BarChart2, UserPlus, FileText, Database } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';

interface Participant {
  id: string;
  name: string;
  email: string;
  role: string;
  kyc_status: string;
  created_at: string;
}

interface KYCRequest {
  id: string;
  participant_name: string;
  submitted_at: string;
  documents_count: number;
}

export function Admin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'kyc' | 'participants' | 'config' | 'fees' | 'analytics'>('kyc');
  const [kycQueue, setKycQueue] = useState<KYCRequest[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => { fetchAdminData(); }, [activeTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'kyc') {
        const res = await api.get('/admin/kyc-queue').catch(() => ({ data: { success: true, data: getDefaultKycQueue() } }));
        setKycQueue(res.data?.data || getDefaultKycQueue());
      } else if (activeTab === 'participants') {
        const res = await api.get('/admin/participants').catch(() => ({ data: { success: true, data: getDefaultParticipants() } }));
        setParticipants(res.data?.data || getDefaultParticipants());
      }
      setStats(getDefaultStats());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchAdminData} /></div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-ionex-text-mute">Platform management and configuration</p>
        </div>
        <button onClick={fetchAdminData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard title="Total Participants" value={stats?.totalParticipants || 156} icon={<Users className="w-5 h-5" />} />
        <StatCard title="Pending KYC" value={stats?.pendingKyc || 12} icon={<Clock className="w-5 h-5" />} status="warning" />
        <StatCard title="Active Traders" value={stats?.activeTraders || 45} icon={<Activity className="w-5 h-5" />} />
        <StatCard title="Monthly Revenue" value={`R${((stats?.monthlyRevenue || 250000) / 1000).toFixed(0)}k`} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard title="System Uptime" value="99.9%" icon={<Shield className="w-5 h-5" />} status="success" />
      </div>

      {/* Tabs */}
      <div className="border-b border-ionex-border-100">
        <div className="flex gap-6">
          {[
            { id: 'kyc', label: 'KYC Queue', icon: <Shield className="w-4 h-4" /> },
            { id: 'participants', label: 'Participants', icon: <Users className="w-4 h-4" /> },
            { id: 'config', label: 'Configuration', icon: <Settings className="w-4 h-4" /> },
            { id: 'fees', label: 'Fee Management', icon: <DollarSign className="w-4 h-4" /> },
            { id: 'analytics', label: 'Analytics', icon: <BarChart2 className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-ionex-brand text-ionex-brand'
                  : 'border-transparent text-ionex-text-mute hover:text-ionex-brand'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'kyc' && <KYCTab queue={kycQueue} onRefresh={fetchAdminData} />}
      {activeTab === 'participants' && <ParticipantsTab participants={participants} onRefresh={fetchAdminData} />}
      {activeTab === 'config' && <ConfigTab />}
      {activeTab === 'fees' && <FeesTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

function StatCard({ title, value, icon, status }: { title: string; value: string | number; icon: React.ReactNode; status?: string }) {
  const statusColors: Record<string, string> = {
    success: 'bg-green-50 text-green-600',
    warning: 'bg-yellow-50 text-yellow-600',
    error: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ionex-text-mute text-sm">{title}</span>
        <div className={`p-2 rounded-lg ${statusColors[status || ''] || 'bg-ionex-brand/10 text-ionex-brand'}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function KYCTab({ queue, onRefresh }: { queue: KYCRequest[]; onRefresh: () => void }) {
  const handleApprove = async (id: string) => {
    await api.post(`/admin/kyc/${id}/approve`);
    onRefresh();
  };

  const handleReject = async (id: string) => {
    await api.post(`/admin/kyc/${id}/reject`);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">KYC Verification Queue</h2>
        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full">{queue.length} pending</span>
      </div>
      {queue.length === 0 ? (
        <EmptyState icon={<CheckCircle className="w-8 h-8" />} title="All caught up!" description="No pending KYC verifications" />
      ) : (
        <>
          <ExportBar data={queue} filename="kyc_queue" />
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-3">Applicant</th><th className="text-left">Submitted</th><th className="text-center">Documents</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {queue.map(item => (
                <tr key={item.id} className="border-b border-ionex-border-50">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-ionex-brand/10 rounded-full flex items-center justify-center text-ionex-brand font-semibold">
                        {item.participant_name.charAt(0)}
                      </div>
                      <span className="font-medium">{item.participant_name}</span>
                    </div>
                  </td>
                  <td className="text-ionex-text-mute">{item.submitted_at}</td>
                  <td className="text-center">{item.documents_count}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleApprove(item.id)} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">Approve</button>
                      <button onClick={() => handleReject(item.id)} className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">Reject</button>
                      <button className="px-3 py-1 border border-ionex-border-200 text-xs rounded hover:bg-gray-50">Review</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ParticipantsTab({ participants, onRefresh }: { participants: Participant[]; onRefresh: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Platform Participants</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">
          <UserPlus className="w-4 h-4" /> Add Participant
        </button>
      </div>
      {participants.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="No participants" description="Participants will appear here" />
      ) : (
        <>
          <ExportBar data={participants} filename="participants" />
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-3">Name</th><th className="text-left">Email</th><th className="text-left">Role</th><th className="text-left">KYC Status</th><th className="text-left">Joined</th></tr></thead>
            <tbody>
              {participants.map(p => (
                <tr key={p.id} className="border-b border-ionex-border-50">
                  <td className="py-3 font-medium">{p.name}</td>
                  <td className="text-ionex-text-mute">{p.email}</td>
                  <td><span className="px-2 py-0.5 bg-ionex-brand/10 text-ionex-brand text-xs rounded-full">{p.role}</span></td>
                  <td>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      p.kyc_status === 'verified' ? 'bg-green-100 text-green-700' :
                      p.kyc_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {p.kyc_status}
                    </span>
                  </td>
                  <td className="text-ionex-text-mute">{p.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function ConfigTab() {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <h2 className="text-lg font-semibold mb-6">Platform Configuration</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-medium text-gray-700">General Settings</h3>
          <ConfigField label="Platform Name" defaultValue="Open Energy Platform" />
          <ConfigField label="Support Email" defaultValue="support@openenergy.co.za" />
          <ConfigField label="Maintenance Mode" type="toggle" defaultChecked={false} />
        </div>
        <div className="space-y-4">
          <h3 className="font-medium text-gray-700">Trading Settings</h3>
          <ConfigField label="Min Trade Size (MWh)" defaultValue="10" type="number" />
          <ConfigField label="Max Price (ZAR/MWh)" defaultValue="5000" type="number" />
          <ConfigField label="Enable Carbon Trading" type="toggle" defaultChecked={true} />
        </div>
      </div>
      <div className="mt-6 pt-6 border-t border-ionex-border-100">
        <button className="px-6 py-2 bg-ionex-brand text-white rounded-lg hover:bg-ionex-brand-light">Save Configuration</button>
      </div>
    </div>
  );
}

function ConfigField({ label, defaultValue, type = 'text', defaultChecked }: {
  label: string;
  defaultValue?: string | number;
  type?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm text-gray-600">{label}</label>
      {type === 'toggle' ? (
        <input type="checkbox" defaultChecked={defaultChecked} className="w-5 h-5 rounded border-ionex-border" />
      ) : type === 'number' ? (
        <input type="number" defaultValue={defaultValue} className="w-32 px-3 py-1 border border-ionex-border-200 rounded-lg" />
      ) : (
        <input type="text" defaultValue={defaultValue} className="w-64 px-3 py-1 border border-ionex-border-200 rounded-lg" />
      )}
    </div>
  );
}

function FeesTab() {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <h2 className="text-lg font-semibold mb-6">Fee Management</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <FeeCard title="Transaction Fee" rate="0.5%" description="Per trade execution" />
        <FeeCard title="Membership Fee" rate="R5,000" description="Monthly per participant" />
        <FeeCard title="Carbon Trading Fee" rate="1.2%" description="Per carbon credit trade" />
      </div>
      <div className="mt-6">
        <h3 className="font-medium text-gray-700 mb-4">Recent Fee Collections</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-2">Date</th><th className="text-left">Type</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b border-ionex-border-50"><td className="py-2">2024-04-15</td><td>Transaction Fee</td><td className="text-right">R12,450</td></tr>
            <tr className="border-b border-ionex-border-50"><td className="py-2">2024-04-14</td><td>Membership</td><td className="text-right">R85,000</td></tr>
            <tr className="border-b border-ionex-border-50"><td className="py-2">2024-04-13</td><td>Carbon Trading</td><td className="text-right">R8,200</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeeCard({ title, rate, description }: { title: string; rate: string; description: string }) {
  return (
    <div className="p-4 border border-ionex-border-100 rounded-lg">
      <h4 className="font-medium text-gray-900">{title}</h4>
      <p className="text-2xl font-bold text-ionex-brand mt-2">{rate}</p>
      <p className="text-sm text-ionex-text-mute mt-1">{description}</p>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <h2 className="text-lg font-semibold mb-6">Platform Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Trading Volume (30 days)</h4>
          <p className="text-3xl font-bold text-ionex-brand">45,230 MWh</p>
          <p className="text-sm text-green-600 mt-1">+12% from last month</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Active Participants</h4>
          <p className="text-3xl font-bold text-ionex-brand">156</p>
          <p className="text-sm text-green-600 mt-1">+8 new this month</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Total Carbon Traded</h4>
          <p className="text-3xl font-bold text-ionex-brand">8,450 tCO₂e</p>
          <p className="text-sm text-green-600 mt-1">+23% from last month</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-3">Platform Revenue</h4>
          <p className="text-3xl font-bold text-ionex-brand">R342,000</p>
          <p className="text-sm text-green-600 mt-1">+5% from last month</p>
        </div>
      </div>
    </div>
  );
}

function getDefaultKycQueue(): KYCRequest[] {
  return [
    { id: '1', participant_name: 'GreenPower Solutions', submitted_at: '2024-04-15', documents_count: 5 },
    { id: '2', participant_name: 'SolarTech Investments', submitted_at: '2024-04-14', documents_count: 7 },
    { id: '3', participant_name: 'EcoEnergy Trading', submitted_at: '2024-04-13', documents_count: 4 },
  ];
}

function getDefaultParticipants(): Participant[] {
  return [
    { id: '1', name: 'SolarCorp SA', email: 'info@solarcorp.co.za', role: 'ipp_developer', kyc_status: 'verified', created_at: '2024-01-15' },
    { id: '2', name: 'WindPower Ltd', email: 'contact@windpower.co.za', role: 'trader', kyc_status: 'verified', created_at: '2024-02-01' },
    { id: '3', name: 'EnergyFund Africa', email: 'invest@energyfund.co.za', role: 'carbon_fund', kyc_status: 'verified', created_at: '2024-02-20' },
  ];
}

function getDefaultStats() {
  return { totalParticipants: 156, pendingKyc: 12, activeTraders: 45, monthlyRevenue: 250000 };
}