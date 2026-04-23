// ═══════════════════════════════════════════════════════════════════════════
// useRealtime — subscribe to /api/realtime/:channel via EventSource.
//
// Browsers can't set Authorization on EventSource, so the server also accepts
// `?token=` — we pass the current access token from localStorage. The hook
// handles reconnect with exponential backoff when the server closes the
// stream at the 30-minute budget ceiling.
//
// Usage:
//   const { rows, lastEvent, status } = useRealtime('margin-calls');
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';

export type RealtimeChannel =
  | 'dispatch-instructions'
  | 'margin-calls'
  | 'surveillance-alerts'
  | 'action-queue';

export interface RealtimeState<Row = Record<string, unknown>> {
  rows: Row[];
  lastEvent: string | null;
  cursor: string | null;
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  error: string | null;
}

/** Subscribe to an SSE channel. Returns the rolling row set + connection status. */
export function useRealtime<Row = Record<string, unknown>>(
  channel: RealtimeChannel | null,
  options: { limit?: number } = {},
): RealtimeState<Row> {
  const [state, setState] = useState<RealtimeState<Row>>({
    rows: [],
    lastEvent: null,
    cursor: null,
    status: 'idle',
    error: null,
  });
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);

  useEffect(() => {
    if (!channel) return;

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const token = localStorage.getItem('token');
      if (!token) {
        setState((s) => ({ ...s, status: 'error', error: 'No access token' }));
        return;
      }
      const url = `/api/realtime/${channel}?token=${encodeURIComponent(token)}`;
      setState((s) => ({ ...s, status: 'connecting', error: null }));
      const src = new EventSource(url);
      sourceRef.current = src;

      src.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setState((s) => ({ ...s, status: 'open', error: null }));
      };

      src.addEventListener('snapshot', (ev) => {
        const data = parseEvent<Row>(ev);
        if (!data) return;
        setState((s) => ({
          ...s,
          lastEvent: 'snapshot',
          rows: capRows((data.rows as Row[]) || [], options.limit),
          cursor: (data.cursor as string | null) ?? s.cursor,
        }));
      });

      src.addEventListener('delta', (ev) => {
        const data = parseEvent<Row>(ev);
        if (!data) return;
        setState((s) => ({
          ...s,
          lastEvent: 'delta',
          rows: capRows([...s.rows, ...((data.rows as Row[]) || [])], options.limit),
          cursor: (data.cursor as string | null) ?? s.cursor,
        }));
      });

      src.addEventListener('heartbeat', () => {
        setState((s) => ({ ...s, lastEvent: 'heartbeat' }));
      });

      src.addEventListener('close', () => {
        setState((s) => ({ ...s, status: 'closed' }));
        src.close();
        scheduleReconnect();
      });

      src.onerror = () => {
        src.close();
        setState((s) => ({ ...s, status: 'error', error: 'Stream error' }));
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectAttemptsRef.current += 1;
      const backoffMs = Math.min(
        30_000,
        1_000 * Math.pow(2, Math.min(reconnectAttemptsRef.current, 5)),
      );
      setTimeout(connect, backoffMs);
    };

    connect();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [channel, options.limit]);

  return state;
}

function parseEvent<T>(ev: MessageEvent): { rows?: T[]; cursor?: string | null } | null {
  try { return JSON.parse(ev.data); } catch { return null; }
}

function capRows<T>(rows: T[], limit?: number): T[] {
  if (!limit || rows.length <= limit) return rows;
  return rows.slice(rows.length - limit);
}
