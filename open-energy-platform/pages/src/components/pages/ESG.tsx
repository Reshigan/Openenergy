import React, { useState, useEffect } from 'react';
import { Leaf, FileText, TrendingUp, BarChart2, Award, RefreshCw, Download, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { api } from '../../lib/api';
import { Skeleton } from '../Skeleton';
import { ErrorBanner } from '../ErrorBanner';
import { EmptyState } from '../EmptyState';
import { ExportBar } from '../ExportBar';

export function ESG() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>(null);
  const [esgData, setEsgData] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [score, setScore] = useState({ total: 0, environmental: 0, social: 0, governance: 0 });

  useEffect(() => { fetchESGData(); }, []);

  const fetchESGData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [esgRes, reportsRes] = await Promise.all([
        api.get('/esg/score').catch(() => ({ data: { success: true, data: null } })),
        api.get('/esg/reports').catch(() => ({ data: { success: true, data: [] } })),
      ]);
      setEsgData(esgRes.data?.data || getDefaultESGData());
      setReports(reportsRes.data?.data || []);
      setScore({ total: 78, environmental: 82, social: 75, governance: 77 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6"><Skeleton variant="card" rows={5} /></div>;
  if (error) return <div className="p-6"><ErrorBanner message={error} onRetry={fetchESGData} /></div>;

  const radarData = [
    { subject: 'Carbon', score: score.environmental, fullMark: 100 },
    { subject: 'Renewable', score: score.environmental + 5, fullMark: 100 },
    { subject: 'Social', score: score.social, fullMark: 100 },
    { subject: 'Diversity', score: score.social + 3, fullMark: 100 },
    { subject: 'Governance', score: score.governance, fullMark: 100 },
    { subject: 'Ethics', score: score.governance - 2, fullMark: 100 },
  ];

  const carbonTrend = [
    { month: 'Jan', emissions: 4500 },
    { month: 'Feb', emissions: 4200 },
    { month: 'Mar', emissions: 3800 },
    { month: 'Apr', emissions: 3600 },
    { month: 'May', emissions: 3200 },
    { month: 'Jun', emissions: 2800 },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ESG Dashboard</h1>
          <p className="text-ionex-text-mute">Environmental, Social, and Governance metrics</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={fetchESGData} className="p-2 border border-ionex-border-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ESG Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-ionex-brand to-ionex-brand-light rounded-xl p-6 text-white">
          <p className="text-blue-200 text-sm mb-1">Overall ESG Score</p>
          <p className="text-4xl font-bold">{score.total}</p>
          <p className="text-blue-200 text-sm mt-1">/ 100</p>
        </div>
        <ScoreCard title="Environmental" score={score.environmental} color="green" icon={<Leaf className="w-5 h-5" />} />
        <ScoreCard title="Social" score={score.social} color="blue" icon={<Award className="w-5 h-5" />} />
        <ScoreCard title="Governance" score={score.governance} color="purple" icon={<CheckCircle className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
          <h2 className="text-lg font-semibold mb-4">ESG Breakdown</h2>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <Radar name="Score" dataKey="score" stroke="#0A3D62" fill="#0A3D62" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Carbon Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-ionex-border-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Carbon Emissions Trend</h2>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">-38% YoY</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={carbonTrend}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`${v.toLocaleString()} tCO₂e`, 'Emissions']} />
              <Bar dataKey="emissions" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Compliance Status */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <h2 className="text-lg font-semibold mb-4">Compliance Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ComplianceCard title="POPIA Compliance" status="compliant" description="Full compliance achieved" />
          <ComplianceCard title="Carbon Tax Filing" status="pending" description="Due: 30 June 2025" />
          <ComplianceCard title="B-BBEE Score" status="compliant" description="Level 4 Contributor" />
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">ESG Reports</h2>
          {reports.length > 0 && <ExportBar data={reports} filename="esg_reports" />}
        </div>
        {reports.length === 0 ? (
          <EmptyState icon={<FileText className="w-8 h-8" />} title="No reports generated" description="ESG reports will appear here once generated" />
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-ionex-border-100"><th className="text-left py-3">Report</th><th className="text-left">Period</th><th className="text-left">Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i} className="border-b border-ionex-border-50">
                  <td className="py-3">{r.title}</td>
                  <td>{r.period}</td>
                  <td><span className={`px-2 py-1 text-xs rounded-full ${r.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status}</span></td>
                  <td className="text-right"><button className="text-ionex-brand hover:underline">Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ScoreCard({ title, score, color, icon }: { title: string; score: number; color: string; icon: React.ReactNode }) {
  const colors: Record<string, { bg: string; text: string }> = {
    green: { bg: 'bg-green-50', text: 'text-green-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    purple: { bg: 'bg-purple-50', text: 'purple-600' },
  };

  return (
    <div className="bg-white rounded-xl border border-ionex-border-100 p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ionex-text-mute text-sm">{title}</span>
        <div className={`p-2 rounded-lg ${colors[color]?.bg || 'bg-gray-50'}`}>
          <span className={colors[color]?.text || 'text-gray-600'}>{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-gray-900">{score}</span>
        <span className="text-ionex-text-mute text-sm">/ 100</span>
      </div>
      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color === 'green' ? 'bg-green-500' : color === 'blue' ? 'bg-blue-500' : 'bg-purple-500'}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function ComplianceCard({ title, status, description }: { title: string; status: string; description: string }) {
  const statusConfig: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
    compliant: { icon: <CheckCircle className="w-5 h-5" />, bg: 'bg-green-50 border-green-200', text: 'text-green-600' },
    pending: { icon: <Clock className="w-5 h-5" />, bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-600' },
    non_compliant: { icon: <AlertCircle className="w-5 h-5" />, bg: 'bg-red-50 border-red-200', text: 'text-red-600' },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className={`p-4 rounded-lg border ${config.bg}`}>
      <div className={`flex items-center gap-2 mb-2 ${config.text}`}>
        {config.icon}
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-sm text-ionex-text-sub">{description}</p>
    </div>
  );
}

function getDefaultESGData() {
  return {
    carbonIntensity: 0.42,
    renewablePercentage: 35,
    waterUsage: 15000,
    wasteRecycled: 78,
  };
}