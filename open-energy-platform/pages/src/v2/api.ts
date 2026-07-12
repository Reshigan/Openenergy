// v2 API client — thin wrappers over the shared axios `api` (Bearer + refresh).
// Endpoints live under /api/v2 (mounted in src/index.ts). All responses use the
// { success, data } envelope except command results, which return the engine
// result verbatim ({ ok, code, ... }).

import { api } from '../lib/api';
import type { ChainMap, TxnRow, TxnBundle, Json } from './decl';

export interface CmdResult {
  ok: boolean;
  code?: string;
  message?: string;
  txn_id?: string;
  state?: string;
  seq?: number;
  constraint?: string;
  [k: string]: Json | undefined;
}

let _chainsCache: ChainMap | null = null;

export async function getChains(force = false): Promise<ChainMap> {
  if (_chainsCache && !force) return _chainsCache;
  const { data } = await api.get('/v2/chains');
  _chainsCache = (data?.data ?? {}) as ChainMap;
  return _chainsCache;
}

export interface ListParams {
  chain_key?: string;
  open?: boolean;
  mine?: boolean;
  q?: string;
  limit?: number;
}

export async function listTxns(p: ListParams = {}): Promise<TxnRow[]> {
  const { data } = await api.get('/v2/txns', {
    params: {
      chain_key: p.chain_key,
      open: p.open ? 1 : undefined,
      mine: p.mine ? 1 : undefined,
      q: p.q || undefined,
      limit: p.limit ?? 100,
    },
  });
  return (data?.data ?? []) as TxnRow[];
}

export async function getTxn(id: string): Promise<TxnBundle | null> {
  try {
    const { data } = await api.get(`/v2/txn/${id}`);
    return (data?.data ?? null) as TxnBundle | null;
  } catch {
    return null;
  }
}

export interface OpenBody {
  chain_key: string;
  edge: string;
  input: Record<string, Json>;
  idempotency_key: string;
  reason_code?: string;
  reason_text?: string;
}

export async function openTxn(b: OpenBody): Promise<CmdResult> {
  const { data } = await api.post('/v2/txn', b, { validateStatus: () => true });
  return data as CmdResult;
}

export interface ActBody extends OpenBody {
  expected_seq: number; // the txn's current seq token (optimistic concurrency)
}

export async function actTxn(id: string, b: ActBody): Promise<CmdResult> {
  const { data } = await api.post(`/v2/txn/${id}/act`, b, { validateStatus: () => true });
  return data as CmdResult;
}
