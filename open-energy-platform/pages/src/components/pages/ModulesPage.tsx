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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-[#1a3a5c] text-white p-2.5">
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-display font-semibold text-[#0f1c2e]">Platform modules</h1>
          <p className="text-[13px] text-[#6b7685]">
            Every capability on the exchange. Enabled modules open directly; the rest are available on request.
          </p>
        </div>
      </header>

      {loading && <p className="text-[13px] text-[#6b7685]">Loading modules…</p>}
      {error && <p className="text-[13px] text-red-700">{error}</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((m) => {
            const isOn = enabled.has(m.module_key);
            const route = MODULE_ROUTE[m.module_key];
            return (
              <div
                key={m.module_key}
                className="flex flex-col justify-between rounded-xl border border-[#dde4ec] bg-white p-4 transition-colors hover:border-[#1a3a5c]/40"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[14px] font-display font-semibold text-[#0f1c2e]">{m.display_name}</h2>
                    {!isOn && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6b7685]" aria-hidden />}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#6b7685]">{m.description}</p>
                </div>
                <div className="mt-4">
                  {isOn && route ? (
                    <button
                      type="button"
                      onClick={() => navigate(route)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#1a3a5c] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#16314e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c] focus-visible:ring-offset-1"
                    >
                      Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : isOn ? (
                    <span className="inline-flex items-center rounded-md bg-[#eef3f8] px-2 py-1 text-[11px] font-medium text-[#1a3a5c]">
                      Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-[#f4f6f9] px-2 py-1 text-[11px] font-medium text-[#6b7685]">
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
  );
}
