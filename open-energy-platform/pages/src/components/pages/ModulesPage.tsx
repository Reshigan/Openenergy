import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowRight, Lock } from 'lucide-react';
import { api } from '../../lib/api';

interface ModuleRow {
  module_key: string;
  display_name: string;
  description: string;
}

// Deep-link each module to its primary workspace route. A module_key with no
// entry here has no first-class destination yet, so its card renders without an
// Open affordance even when enabled.
const MODULE_ROUTE: Record<string, string> = {
  bilateral_trading: '/trading',
  exchange: '/trading',
  carbon_market: '/carbon',
  ipp_projects: '/projects',
  esg_sustainability: '/esg',
  grid_wheeling: '/grid',
  fund_management: '/funds',
  deal_rooms: '/contracts',
  procurement: '/procurement',
  intelligence: '/intelligence',
  morning_briefing: '/briefing',
  marketplace: '/marketplace',
};

export function ModulesPage() {
  const navigate = useNavigate();
  const [catalogue, setCatalogue] = useState<ModuleRow[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, mine] = await Promise.all([
          api.get<{ data: ModuleRow[] }>('/modules'),
          api.get<{ data: { enabled_modules: string[] } }>('/modules/my'),
        ]);
        if (cancelled) return;
        setCatalogue(cat.data.data ?? []);
        setEnabled(new Set(mine.data.data?.enabled_modules ?? []));
      } catch {
        if (!cancelled) setError('Could not load the module catalogue.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Enabled modules first, then alphabetical within each group.
  const sorted = useMemo(
    () =>
      [...catalogue].sort((a, b) => {
        const ar = enabled.has(a.module_key) ? 0 : 1;
        const br = enabled.has(b.module_key) ? 0 : 1;
        if (ar !== br) return ar - br;
        return a.display_name.localeCompare(b.display_name);
      }),
    [catalogue, enabled],
  );

  return (
    <div style={{ minHeight: 'calc(100vh - 50px)', background: 'oklch(0.96 0.003 250)', padding: '24px' }}>
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <div style={{ borderRadius: '12px', background: 'oklch(0.46 0.16 55)', color: '#fff', padding: '10px' }}>
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>Platform modules</h1>
            <p className="text-[13px]" style={{ color: 'oklch(0.60 0.007 250)' }}>
              Every capability on the exchange. Enabled modules open directly; the rest are available on request.
            </p>
          </div>
        </header>

        {loading && <p className="text-[13px]" style={{ color: 'oklch(0.60 0.007 250)' }}>Loading modules…</p>}
        {error && <p className="text-[13px]" style={{ color: 'oklch(0.48 0.20 20)' }}>{error}</p>}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((m) => {
              const isOn = enabled.has(m.module_key);
              const route = MODULE_ROUTE[m.module_key];
              return (
                <div
                  key={m.module_key}
                  className="flex flex-col justify-between p-4 transition-colors"
                  style={{
                    borderRadius: '12px',
                    border: '1px solid oklch(0.87 0.006 250)',
                    background: 'oklch(0.99 0.002 80)',
                  }}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-[14px] font-display font-semibold" style={{ color: 'oklch(0.17 0.010 250)' }}>{m.display_name}</h2>
                      {!isOn && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'oklch(0.60 0.007 250)' }} aria-hidden />}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'oklch(0.60 0.007 250)' }}>{m.description}</p>
                  </div>
                  <div className="mt-4">
                    {isOn && route ? (
                      <button
                        type="button"
                        onClick={() => navigate(route)}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                        style={{ background: 'oklch(0.46 0.16 55)' }}
                      >
                        Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : isOn ? (
                      <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: 'oklch(0.93 0.008 250)', color: 'oklch(0.40 0.009 250)' }}>
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: 'oklch(0.94 0.004 250)', color: 'oklch(0.60 0.007 250)' }}>
                        Not enabled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
