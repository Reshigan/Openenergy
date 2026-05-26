// Loads /launch/:role/kpis and maps the payload into the shape WorkstationShell
// expects (kpis + panels). Used by every role's workstation page so the top of
// the screen always carries the same density of metrics that the Esums detail
// page does — without each role wiring its own ad-hoc fetch.

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { WorkstationKpi, WorkstationPanel } from './WorkstationShell';

type LaunchKpi = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'flat';
  trend_value?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  footer?: string;
};

type LaunchPayload = {
  kpis: LaunchKpi[];
};

function toneToKpi(t?: LaunchKpi['tone']): WorkstationKpi['tone'] {
  if (t === 'good') return 'up';
  if (t === 'bad') return 'down';
  if (t === 'warn') return 'warn';
  return undefined;
}

function formatValue(k: LaunchKpi): string {
  if (typeof k.value === 'number') {
    const v = k.value;
    const formatted = Number.isInteger(v) ? v.toLocaleString('en-ZA') : v.toFixed(1);
    return k.unit ? `${formatted}${k.unit}` : formatted;
  }
  return k.unit ? `${k.value} ${k.unit}` : String(k.value);
}

export function useWorkstationKpis(role: string): WorkstationKpi[] {
  const [kpis, setKpis] = useState<WorkstationKpi[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/launch/${role}/kpis`);
        const payload = (r.data?.data || null) as LaunchPayload | null;
        if (!alive || !payload?.kpis) return;
        setKpis(
          payload.kpis.slice(0, 6).map((k) => ({
            label: k.label,
            value: formatValue(k),
            caption: k.footer || k.trend_value || undefined,
            tone: toneToKpi(k.tone),
          })),
        );
      } catch {
        /* silent — keep KPIs empty rather than blocking the page */
      }
    })();
    return () => {
      alive = false;
    };
  }, [role]);
  return kpis;
}

export function useWorkstationPanel(
  title: string,
  endpoint: string,
  pick: (row: any) => { id: string; lead?: any; text: any; meta?: any } | null,
  emptyLabel?: string,
): WorkstationPanel | null {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(endpoint);
        const raw = r.data?.data;
        const list: any[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
          ? raw.items
          : Array.isArray(raw?.allocations)
          ? raw.allocations
          : [];
        if (alive) {
          setRows(list);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [endpoint]);
  if (!loaded) return null;
  const mapped = rows
    .map(pick)
    .filter((x): x is { id: string; lead?: any; text: any; meta?: any } => !!x);
  return {
    title,
    countLabel: String(mapped.length),
    rows: mapped,
    emptyLabel,
  };
}
