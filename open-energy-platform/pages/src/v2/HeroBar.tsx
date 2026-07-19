// ═══════════════════════════════════════════════════════════════════════════
// HeroBar — the role-based hero + role-based menu shown on every v2 surface.
// Rendered once by Shell, between the topbar and <main>. Full state shows role
// name + blurb + domain menu; Compact drops the blurb to a single-line role
// chip. Transaction always starts Compact (high-frequency page); everywhere
// else starts Full unless the user collapsed it before (per-role localStorage).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { heroBlurb, heroStorageKey, heroDefaultCollapsed, type ChainMap } from './decl';
import { roleAlias, groupedStarts, type JourneyDomain } from './starts';

export function HeroBar({ role, chains }: { role: string; chains: ChainMap }) {
  const loc = useLocation();
  const nav = useNavigate();

  const readCollapsed = () => {
    if (heroDefaultCollapsed(loc.pathname)) return true;
    return localStorage.getItem(heroStorageKey(role)) === '1';
  };
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Re-derive on role or route change — a different JWT role has its own
  // stored preference, and entering/leaving Transaction flips the default.
  useEffect(() => { setCollapsed(readCollapsed()); }, [role, loc.pathname]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(heroStorageKey(role), next ? '1' : '0');
  };

  const label = getRoleConfig(roleAlias(role))?.label ?? role;
  const blurb = heroBlurb(role);
  const domains = groupedStarts(chains, role);
  const loading = Object.keys(chains).length === 0;

  return (
    <div className={`v2-herobar${collapsed ? ' compact' : ''}`}>
      {collapsed ? (
        <span className="v2-role-chip">{label}</span>
      ) : (
        <div className="v2-herobar-id">
          <span className="v2-herobar-name">{label}</span>
          {blurb && <p className="v2-herobar-blurb">{blurb}</p>}
        </div>
      )}
      <div className="v2-spacer" />
      {(loading || domains.length > 0) && (
        <DomainMenu domains={domains} loading={loading} onNavigate={(to) => nav(to)} />
      )}
      <button
        className="v2-btn v2-btn-ghost v2-herobar-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand role summary' : 'Collapse role summary'}
        onClick={toggle}
      >
        {collapsed ? '⌄' : '⌃'}
      </button>
    </div>
  );
}

// ── the domain dropdown: the "role-based menu" ───────────────────────────────
function DomainMenu({
  domains, loading, onNavigate,
}: { domains: JourneyDomain[]; loading: boolean; onNavigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="v2-herobar-menu">
      <button
        className="v2-btn v2-btn-ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Menu
      </button>
      {open && (
        <>
          <div className="v2-menu-scrim" onClick={() => setOpen(false)} />
          <div className="v2-menu v2-hero-dropdown" role="menu">
            {loading && <div className="v2-hero-domain-loading">Loading…</div>}
            {domains.map((d) => (
              <div key={d.key} className="v2-hero-domain">
                <button
                  role="menuitem"
                  className="v2-hero-domain-hd"
                  aria-expanded={expanded === d.key}
                  onClick={() => setExpanded((cur) => (cur === d.key ? null : d.key))}
                >
                  <span className="dot" style={{ ['--dc' as any]: d.color }} />
                  <span className="grow">{d.label}</span>
                  <span className="n">{d.starts.length}</span>
                </button>
                {expanded === d.key && (
                  <div className="v2-hero-domain-body">
                    {d.starts.map((s) => (
                      <button
                        key={`${s.chainKey}:${s.edge.id}`}
                        role="menuitem"
                        onClick={() => { onNavigate(`/v2/find?start=${s.chainKey}:${s.edge.id}`); setOpen(false); }}
                      >
                        <span className="start">＋</span> {s.label}
                      </button>
                    ))}
                    {d.links.map((l) => (
                      <button
                        key={l.key}
                        role="menuitem"
                        onClick={() => { onNavigate(l.to); setOpen(false); }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
