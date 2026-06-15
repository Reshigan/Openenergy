// pages/src/meridian/surfaces/ipp/InvitePartnersSurface.tsx — IPP "Invite partners" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `invite_partners` tab body
// (direct partner invite form + sent-invitation history). Self-contained `{ role }` body;
// the original tab took no onRefresh prop, so its internal state is unchanged.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

const PARTNER_ROLES = [
  { role: 'lender',      label: 'Lender / Investor',        desc: 'Auto-creates 5 standard covenants (DSCR, LLCR, availability, insurance, debt ratio)' },
  { role: 'offtaker',    label: 'Offtaker / Corporate Buyer', desc: 'Auto-creates a PPA contract shell in Draft state' },
  { role: 'carbon_fund', label: 'Carbon Fund / Registry',   desc: 'Links the fund to your project for carbon credit flows' },
];

type Proj = { id: string; project_name?: string; name?: string; capacity_mw?: number };
type Invitation = { id: string; token: string; role: string; project_id?: string; expires_at: string; invite_url: string };

export default function InvitePartnersSurface(_props: { role: string }) {
  const [projects, setProjects] = useState<Proj[]>([]);
  const [selectedRole, setSelectedRole] = useState('lender');
  const [form, setForm] = useState({ project_id: '', email: '', organization: '', note: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<Invitation | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    api.get('/projects').then(r => {
      const rows: Proj[] = r.data?.data ?? r.data?.projects ?? r.data ?? [];
      setProjects(rows);
      if (rows.length) setForm(f => ({ ...f, project_id: rows[0].id }));
    }).catch(() => {});
    api.get('/rbac/me/invitations').then(r => {
      setHistory((r.data?.data ?? []).filter((i: any) => ['lender', 'offtaker', 'carbon_fund'].includes(i.role)));
    }).catch(() => {}).finally(() => setHistLoading(false));
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    setSent(null);
    try {
      const res = await api.post('/rbac/me/invitations', {
        role: selectedRole,
        project_id: form.project_id || undefined,
        email: form.email || undefined,
        organization: form.organization || undefined,
        note: form.note || undefined,
      });
      if (!res.data.success) throw new Error(res.data.error);
      setSent(res.data.data);
      setHistory(h => [{ ...res.data.data, status: 'pending', created_at: new Date().toISOString() }, ...h]);
      setForm(f => ({ ...f, email: '', organization: '', note: '' }));
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message || 'Failed to create invitation');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = (url: string) => navigator.clipboard?.writeText(`${window.location.origin}${url}`).catch(() => {});

  const selectedPartner = PARTNER_ROLES.find(r => r.role === selectedRole)!;

  return (
    <div className="space-y-6">
      {/* Send invite form */}
      <div className="rounded-lg border border-[#dde4ec] bg-white p-5">
        <h3 className="text-sm font-semibold text-[oklch(0.17_0.010_250)] mb-1">Invite a partner</h3>
        <p className="text-xs text-[#6b7685] mb-4">
          Send a direct invitation. The partner registers via a unique link and their account is immediately active — no admin approval required.
        </p>

        {err && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        {sent && (
          <div className="mb-4 rounded-lg border border-[oklch(0.46_0.16_55)]/20 bg-[oklch(0.94_0.02_250)]/50 p-3">
            <p className="text-xs font-semibold text-[oklch(0.17_0.010_250)] mb-1">Invitation created</p>
            <div className="flex items-center gap-2 font-mono text-xs text-[oklch(0.46_0.16_55)] bg-white rounded border border-[#dde4ec] px-2 py-1.5 break-all">
              {window.location.origin}{sent.invite_url}
              <button type="button"
                onClick={() => copyUrl(sent.invite_url)}
                className="ml-auto shrink-0 text-[10px] uppercase tracking-wide font-bold text-[oklch(0.46_0.16_55)] hover:underline"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-[#6b7685] mt-1">Expires: {new Date(sent.expires_at).toLocaleDateString()}</p>
          </div>
        )}

        <form onSubmit={handleSend} className="space-y-4">
          {/* Role selector */}
          <div>
            <label className="block text-xs font-medium text-[#3d4756] mb-2">Partner type</label>
            <div className="grid grid-cols-3 gap-2">
              {PARTNER_ROLES.map(r => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => setSelectedRole(r.role)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    selectedRole === r.role
                      ? 'border-[oklch(0.46_0.16_55)] bg-[oklch(0.94_0.02_250)]/60 text-[oklch(0.17_0.010_250)]'
                      : 'border-[#dde4ec] bg-white text-[#6b7685] hover:border-[oklch(0.46_0.16_55)]/40'
                  }`}
                >
                  <div className="text-xs font-semibold">{r.label.split(' /')[0]}</div>
                  <div className="text-[10px] mt-0.5 opacity-70 truncate">{r.label.split(' /')[1] || ''}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#6b7685] mt-1.5">{selectedPartner.desc}</p>
          </div>

          {/* Project selector */}
          {projects.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Link to project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm text-[oklch(0.17_0.010_250)]"
              >
                <option value="">— no project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_name || p.name || p.id}{p.capacity_mw ? ` (${p.capacity_mw} MW)` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-[#3d4756] mb-1">
              Partner email <span className="font-normal text-[#6b7685]">(optional — locks invite to this address)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
              placeholder="partner@bank.co.za"
            />
          </div>

          {/* Organisation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Organisation</label>
              <input
                type="text"
                value={form.organization}
                onChange={(e) => setForm(f => ({ ...f, organization: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
                placeholder="First National Bank"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#3d4756] mb-1">Note to recipient</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-[#dde4ec] rounded px-2.5 py-1.5 text-sm"
                placeholder="Invitation to review term sheet"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-[oklch(0.46_0.16_55)] text-white text-sm font-semibold px-5 py-2 hover:bg-[#0f2540] transition-colors disabled:opacity-50"
          >
            {loading ? 'Generating link…' : 'Generate invite link'}
          </button>
        </form>
      </div>

      {/* Invitation history */}
      <div className="rounded-lg border border-[#dde4ec] bg-white">
        <div className="px-4 py-3 border-b border-[#eef1f5]">
          <h3 className="text-sm font-semibold text-[oklch(0.17_0.010_250)]">Sent invitations</h3>
        </div>
        {histLoading ? (
          <div className="px-4 py-4 text-xs text-[#6b7685]">Loading…</div>
        ) : history.length === 0 ? (
          <div className="px-4 py-6 text-xs text-[#6b7685] text-center">No partner invitations sent yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[#f6f8fa] text-[#6b7685]">
              <tr>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-left px-4 py-2">Email / org</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Expires</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {history.map((inv: any) => (
                <tr key={inv.id} className="border-t border-[#eef1f5]">
                  <td className="px-4 py-2 font-medium capitalize">{(inv.role || '').replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2 text-[#6b7685]">{inv.email || inv.organization || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      inv.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                      inv.status === 'pending'  ? 'bg-[oklch(0.94_0.008_250)] text-[oklch(0.46_0.16_55)]' :
                      'bg-gray-100 text-gray-500'
                    }`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-2 text-[#6b7685]">{inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {inv.status === 'pending' && inv.token && (
                      <button type="button"
                        onClick={() => copyUrl(`/register?token=${inv.token}`)}
                        className="text-[10px] uppercase tracking-wide font-bold text-[oklch(0.46_0.16_55)] hover:underline"
                      >
                        Copy link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
