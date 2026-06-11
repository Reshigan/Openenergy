import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FileText, Eye, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { ErrorBanner } from '../ErrorBanner';
import { ExportBar } from '../ExportBar';
import { EntityLink } from '../EntityLink';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// — design tokens —
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

const phases = ['draft', 'loi', 'term_sheet', 'hoa', 'draft_agreement', 'legal_review', 'statutory_check', 'execution', 'active', 'amended', 'terminated', 'expired'];

function phaseStyle(phase: string): React.CSSProperties {
  switch (phase) {
    case 'active':    return { background: GOOD_BG, color: GOOD };
    case 'terminated':
    case 'expired':   return { background: BAD_BG,  color: BAD  };
    case 'legal_review':
    case 'statutory_check':
    case 'execution': return { background: WARN_BG, color: WARN };
    default:          return { background: BG2,      color: TX2  };
  }
}

export function Contracts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts]         = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState('');
  const [phaseFilter, setPhaseFilter]     = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { fetchContracts(); }, []);

  const fetchContracts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/contracts');
      setContracts(res.data?.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredContracts = contracts.filter(c => {
    const matchesSearch = !search || c.title?.toLowerCase().includes(search.toLowerCase());
    const matchesPhase  = !phaseFilter || c.phase === phaseFilter;
    return matchesSearch && matchesPhase;
  });

  // — phase summary counts —
  const phaseCounts = phases.reduce<Record<string, number>>((acc, p) => {
    acc[p] = contracts.filter(c => c.phase === p).length;
    return acc;
  }, {});
  const activeCount     = phaseCounts['active']    || 0;
  const draftCount      = phaseCounts['draft']      || 0;
  const executionCount  = phaseCounts['execution']  || 0;
  const terminatedCount = (phaseCounts['terminated'] || 0) + (phaseCounts['expired'] || 0);

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <TableSkeleton columns={5} rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <ErrorBanner message={error} onRetry={fetchContracts} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>Contracts</h1>
              <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>Manage your contract lifecycle</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> New Contract
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total',      value: contracts.length,  color: TX1  },
            { label: 'Active',     value: activeCount,       color: GOOD },
            { label: 'In Draft',   value: draftCount,        color: TX2  },
            { label: 'Execution',  value: executionCount,    color: WARN },
            { label: 'Closed',     value: terminatedCount,   color: BAD  },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 16px', flex: 1, minWidth: 90,
            }}>
              <div style={{ fontSize: 11, color: TX3, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color, fontFamily: MONO, marginTop: 4 }}>
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ background: BG1, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          {filteredContracts.length === 0 ? (
            <EmptyState
              icon={<FileText size={32} />}
              title="No contracts yet"
              description="Create your first contract to get started"
              action={{ label: 'Create Contract', onClick: () => setShowCreateModal(true) }}
            />
          ) : (
            <>
              <ExportBar
                data={filteredContracts}
                filename="contracts"
                columns={[
                  { key: 'title',         header: 'Title' },
                  { key: 'phase',         header: 'Phase' },
                  { key: 'document_type', header: 'Type'  },
                ]}
              />
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                    {['Title', 'Type', 'Phase', 'Counterparty', ''].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 12px',
                        color: TX2, fontWeight: 600, fontSize: 11,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.map((contract, i) => (
                    <tr
                      key={contract.id}
                      style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 1 ? BG2 : 'transparent', cursor: 'pointer' }}
                      onClick={() => navigate(`/contracts/${contract.id}`)}
                    >
                      <td style={{ padding: '10px 12px', color: TX1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{contract.title}</div>
                        <div style={{ fontSize: 11, color: TX3, fontFamily: MONO, marginTop: 2 }}>{contract.id}</div>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX2, fontSize: 13 }}>
                        {contract.document_type?.replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          ...phaseStyle(contract.phase),
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        }}>
                          {contract.phase?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: TX2 }}>
                        <EntityLink id={contract.counterparty_id} type="participant" />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/contracts/${contract.id}`); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TX3, padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Search */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Search
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: TX3 }} />
            <input
              type="text"
              placeholder="Search contracts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 13, color: TX1,
                background: BG1, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Phase filter */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Filter by Phase
          </div>
          <select
            value={phaseFilter}
            onChange={e => setPhaseFilter(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 6,
              fontSize: 13, color: TX1, background: BG1, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">All Phases</option>
            {phases.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
          </select>

          {/* Phase breakdown */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {phases.filter(p => phaseCounts[p] > 0).map(p => (
              <div
                key={p}
                onClick={() => setPhaseFilter(phaseFilter === p ? '' : p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                  background: phaseFilter === p ? ACC_BG : 'transparent',
                  border: phaseFilter === p ? `1px solid ${ACC}` : `1px solid transparent`,
                }}
              >
                <span style={{ fontSize: 12, color: phaseFilter === p ? ACC : TX2, fontWeight: 500 }}>
                  {p.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: 11, fontFamily: MONO, color: phaseFilter === p ? ACC : TX3, fontWeight: 600 }}>
                  {phaseCounts[p]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Quick Actions
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{ width: '100%', background: ACC, color: '#fff', border: 'none', padding: '9px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={14} /> New Contract
          </button>
        </div>

        {/* Summary stats */}
        <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Summary
          </div>
          {[
            { label: 'Total contracts',     value: contracts.length         },
            { label: 'Showing',             value: filteredContracts.length },
            { label: 'Active',              value: activeCount              },
            { label: 'In execution',        value: executionCount           },
            { label: 'Terminated/expired',  value: terminatedCount          },
          ].map(stat => (
            <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 12, color: TX2 }}>{stat.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: TX1 }}>{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <CreateContractModal onClose={() => setShowCreateModal(false)} onCreated={fetchContracts} />
      )}
    </div>
  );
}

type Template = {
  id: string;
  code: string;
  name: string;
  category: string;
  document_type: string;
  description: string;
  jurisdiction: string;
  governing_law: string;
  sa_law_references: string;
};

function CreateContractModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  useEscapeKey(onClose);
  const [formData, setFormData] = useState({
    title: '', document_type: 'ppa_wheeling', contract_type: 'ppa_wheeling',
    phase: 'draft', counterparty_id: '', project_id: '', template_code: '',
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    api.get('/contracts/templates')
      .then((res) => setTemplates((res.data?.data as Template[]) || []))
      .catch(() => setTemplates([]));
  }, []);

  const selectTemplate = (code: string) => {
    const tpl = templates.find((t) => t.code === code);
    if (!tpl) { setFormData((f) => ({ ...f, template_code: '' })); return; }
    setFormData((f) => ({
      ...f,
      template_code: code,
      document_type: tpl.document_type,
      contract_type: tpl.document_type,
      title: f.title || tpl.name,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/contracts', {
        title: formData.title,
        document_type: formData.document_type,
        contract_type: formData.contract_type,
        phase: formData.phase,
        counterparty_id: formData.counterparty_id,
        project_id: formData.project_id,
        commercial_terms: formData.template_code ? { template_code: formData.template_code } : undefined,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTpl = templates.find((t) => t.code === formData.template_code);

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: TX2, display: 'block', marginBottom: 6 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: `1px solid ${BORDER}`, borderRadius: 6,
    fontSize: 13, color: TX1, background: BG, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div style={{
        background: BG1, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        width: '100%', maxWidth: 600, margin: '0 16px', maxHeight: '90vh', overflowY: 'auto',
        border: `1px solid ${BORDER}`,
      }}>
        {/* Modal header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: BG1, zIndex: 1,
        }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: TX1, margin: 0 }}>Create Contract</h3>
            <p style={{ fontSize: 12, color: TX3, margin: '2px 0 0' }}>New contract lifecycle entry</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: TX3, padding: 4, borderRadius: 4 }}
          >
            <XCircle size={18} />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {/* Template */}
          <div>
            <label style={labelStyle}>
              SA-law template
              <span style={{ fontWeight: 400, color: TX3, marginLeft: 6 }}>(optional — pre-fills type)</span>
            </label>
            <select
              value={formData.template_code}
              onChange={(e) => selectTemplate(e.target.value)}
              style={inputStyle}
            >
              <option value="">— no template (blank draft) —</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>[{t.category}] {t.name}</option>
              ))}
            </select>
            {selectedTpl && (
              <div style={{
                marginTop: 8, fontSize: 12, color: TX2,
                background: BG2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px',
              }}>
                <div><strong>Governing law:</strong> {selectedTpl.governing_law} · {selectedTpl.jurisdiction}</div>
                <div><strong>SA references:</strong> {selectedTpl.sa_law_references}</div>
                {selectedTpl.description && <div style={{ marginTop: 4, color: TX3 }}>{selectedTpl.description}</div>}
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              style={inputStyle}
              placeholder="Contract title"
            />
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Type</label>
            <select
              value={formData.document_type}
              onChange={e => setFormData({ ...formData, document_type: e.target.value, contract_type: e.target.value })}
              style={inputStyle}
            >
              <option value="ppa_wheeling">PPA — Wheeling</option>
              <option value="ppa_btm">PPA — Behind-the-Meter</option>
              <option value="offtake_agreement">Direct Offtake Agreement</option>
              <option value="wheeling_agreement">Wheeling Agreement</option>
              <option value="loi">Letter of Intent</option>
              <option value="term_sheet">Term Sheet</option>
              <option value="hoa">Heads of Agreement</option>
              <option value="nda">Non-Disclosure</option>
              <option value="epc">EPC</option>
              <option value="forward">Forward / Derivative</option>
              <option value="carbon_purchase">Carbon Purchase (ERPA)</option>
              <option value="carbon_option_isda">Carbon Option (ISDA)</option>
              <option value="intercreditor">Intercreditor</option>
              <option value="facility">Facility Agreement</option>
              <option value="security">Security Agreement</option>
              <option value="services">Services</option>
              <option value="grid_connection">Grid Connection</option>
              <option value="use_of_system">Use-of-System</option>
              <option value="net_metering">Net-Metering</option>
              <option value="jv">Joint Venture</option>
            </select>
          </div>

          {/* Counterparty ID */}
          <div>
            <label style={labelStyle}>Counterparty ID</label>
            <input
              type="text"
              required
              value={formData.counterparty_id}
              onChange={e => setFormData({ ...formData, counterparty_id: e.target.value })}
              style={inputStyle}
              placeholder="e.g. demo_offtaker_001"
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', color: TX2, border: `1px solid ${BORDER}`, padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ background: ACC, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
