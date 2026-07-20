// pages/src/meridian/JourneyAdmin.tsx — admin journey-crafting (surface admin:journeys).
// Per role, set each feature's availability (required / optional / not-available) and
// an optional per-action charge. Persists to /api/journey-config/:role/:feature.
// This is where new functionality is slotted into a journey and priced. The cockpit
// reads the same config (hides unavailable, badges required, shows charges).
import React from 'react';
import '../shared/surfaces.css';
import { api } from '../lib/api';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { getJourneys } from './journeys';
import { Icon } from './icons';
import { cleanLabel } from './labels';

const ROLES = [
  'ipp_developer', 'esco', 'trader', 'lender', 'offtaker',
  'carbon_fund', 'grid_operator', 'regulator', 'support', 'admin',
];
type Status = 'required' | 'optional' | 'unavailable';
type Cfg = Record<string, { status: Status; charge_zar: number | null; charge_event: string | null }>;

export default function JourneyAdmin() {
  const [role, setRole] = React.useState('ipp_developer');
  const [cfgMap, setCfgMap] = React.useState<Cfg>({});
  const [saved, setSaved] = React.useState<string | null>(null);
  const roleCfg = getRoleConfig(role);
  const { journeys } = React.useMemo(() => getJourneys(role), [role]);
  const domByKey = React.useMemo(() => new Map((roleCfg?.domains ?? []).map(d => [d.key, d])), [roleCfg]);

  React.useEffect(() => {
    api.get(`/journey-config/${role}`).then(r => setCfgMap(r.data?.data ?? {})).catch(() => setCfgMap({}));
  }, [role]);

  const get = (k: string) => cfgMap[k] ?? { status: 'optional' as Status, charge_zar: null, charge_event: null };

  function save(featureKey: string, patch: Partial<Cfg[string]>) {
    const next = { ...get(featureKey), ...patch };
    setCfgMap(m => ({ ...m, [featureKey]: next }));
    api.put(`/journey-config/${role}/${featureKey}`, next)
      .then(() => { setSaved(featureKey); setTimeout(() => setSaved(s => (s === featureKey ? null : s)), 1200); })
      .catch(() => { /* optimistic */ });
  }

  return (
    <div className="mer ja">
      <header className="ja-head">
        <h1 className="hd-serif">Journey crafting</h1>
        <p>Set what each role can do — and what it costs. <b>Required</b> is surfaced first; <b>optional</b> is available; <b>not-available</b> is hidden from that role's cockpit.</p>
        <div className="ja-roles" role="group" aria-label="Role">
          {ROLES.map(r => (
            <button key={r} type="button" className={r === role ? 'btn pri' : 'btn ghost'}
              aria-pressed={r === role} onClick={() => setRole(r)}>{cleanLabel(r.replace(/_/g, ' '))}</button>
          ))}
        </div>
      </header>

      <div className="ja-body">
        {journeys.filter(j => j.domainKeys.length > 0).map(j => {
          const feats = j.domainKeys.flatMap(dk => domByKey.get(dk)?.features ?? []);
          if (!feats.length) return null;
          return (
            <section className="ja-journey" key={j.key}>
              <h2><Icon name={j.icon} size={16} /> {cleanLabel(j.label)}</h2>
              <table className="ja-table">
                <thead>
                  <tr><th>Functionality</th><th>Availability</th><th>Charge (ZAR / action)</th></tr>
                </thead>
                <tbody>
                  {feats.map(f => {
                    const cur = get(f.key);
                    return (
                      <tr key={f.key} className={saved === f.key ? 'ja-saved' : undefined}>
                        <td>{cleanLabel(f.label)}{f.chainKey ? <span className="ja-kind mono">chain</span> : <span className="ja-kind mono">tool</span>}</td>
                        <td>
                          <select value={cur.status} aria-label={`${f.label} availability`}
                            onChange={e => save(f.key, { status: e.target.value as Status })}>
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                            <option value="unavailable">Not available</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" placeholder="—" className="ja-charge mono"
                            value={cur.charge_zar ?? ''} aria-label={`${f.label} charge`}
                            onChange={e => save(f.key, { charge_zar: e.target.value === '' ? null : Number(e.target.value) })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
