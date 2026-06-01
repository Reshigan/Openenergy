/**
 * Apex data-fetching hooks
 *
 * Each hook returns { data, loading, error, refetch }.
 * Mutation hooks return { mutate, loading, error }.
 *
 * All hooks use the apexClient and fire on mount (or when deps change).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AxiosError } from 'axios';
import { apexClient } from './client';
import type {
  IppProject, IppBond, IppProcurement, IppStageGate, IppDrawdown,
  IppChangeOrder, IppDocument, IppRisk, IppIssue, IppEvm,
  LenderFacility, LenderCovenant, LenderDrawdown, LenderReserveAccount,
  TraderOrder, TraderPosition, TraderPnl, TraderOrderBook,
  CarbonCredit, CarbonProject, CarbonRetirement, CarbonMrv,
  OfftakerPpa, OfftakerDelivery, OfftakerTariff,
  RegulatorFiling, RegulatorEnforcement, RegulatorLicence,
  GridConnection, GridNomination, GridCurtailment, GridReserveActivation,
  EsumsAsset, EsumsWorkOrder, EsumsPrognostic,
  OemTicket, OemSparePart, OemWarrantyRecovery,
  Invoice, AuditBlock,
  AdminUser, AdminTenant, AdminKyc, AdminModule, AdminAuditLog,
  AdminStats, AdminFeatureFlag, AdminBillingRun, AdminInvoice,
  NotificationItem,
} from './client';

// ─── Core query hook ─────────────────────────────────────────────────────────

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function useQuery<T>(
  initial: T,
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): QueryResult<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcherRef.current()
      .then(result => { setData(result); setLoading(false); })
      .catch((err: unknown) => {
        const msg = err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message ?? err.message
          : String(err);
        setError(msg);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Core mutation hook ───────────────────────────────────────────────────────

export interface MutationResult<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult | null>;
  loading: boolean;
  error: string | null;
}

function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): MutationResult<TArgs, TResult> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (args: TArgs): Promise<TResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(args);
      setLoading(false);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof AxiosError
        ? (err.response?.data as { message?: string })?.message ?? err.message
        : String(err);
      setError(msg);
      setLoading(false);
      return null;
    }
  }, [fn]);

  return { mutate, loading, error };
}

// ─── Auth hooks ──────────────────────────────────────────────────────────────

export type CurrentUser = { id: string; name: string; email: string; role: string; company_name?: string };

export const useCurrentUser = () =>
  useQuery<CurrentUser | null>(null, () => apexClient.auth.me(), []);

export const useNotifCount = () =>
  useQuery<number>(0, () => apexClient.notifications.unreadCount(), []);

export const useNotifications = (enabled: boolean) =>
  useQuery<NotificationItem[]>([], () => apexClient.notifications.list(), [enabled]);

// ─── IPP hooks ───────────────────────────────────────────────────────────────

export const useIppProjects = (params?: Record<string, unknown>) =>
  useQuery<IppProject[]>([], () => apexClient.ipp.listProjects(params), [JSON.stringify(params)]);

export const useIppBonds = (params?: Record<string, unknown>) =>
  useQuery<IppBond[]>([], () => apexClient.ipp.listBonds(params), [JSON.stringify(params)]);

export const useIppProcurement = (params?: Record<string, unknown>) =>
  useQuery<IppProcurement[]>([], () => apexClient.ipp.listProcurement(params), [JSON.stringify(params)]);

export const useIppStageGates = (projectId?: string) =>
  useQuery<IppStageGate[]>([], () => apexClient.ipp.listStageGates(projectId), [projectId]);

export const useIppChangeOrders = (params?: Record<string, unknown>) =>
  useQuery<IppChangeOrder[]>([], () => apexClient.ipp.listChangeOrders(params), [JSON.stringify(params)]);

export const useIppDocuments = (projectId?: string) =>
  useQuery<IppDocument[]>([], () => apexClient.ipp.listDocuments(projectId), [projectId]);

export const useIppRisks = (params?: Record<string, unknown>) =>
  useQuery<IppRisk[]>([], () => apexClient.ipp.listRisks(params), [JSON.stringify(params)]);

export const useIppIssues = (params?: Record<string, unknown>) =>
  useQuery<IppIssue[]>([], () => apexClient.ipp.listIssues(params), [JSON.stringify(params)]);

export const useIppEvm = (params?: Record<string, unknown>) =>
  useQuery<IppEvm[]>([], () => apexClient.ipp.listEvm(params), [JSON.stringify(params)]);

export const useIppDrawdowns = (params?: Record<string, unknown>) =>
  useQuery<IppDrawdown[]>([], () => apexClient.ipp.listDrawdowns(params), [JSON.stringify(params)]);

// ─── Lender hooks ─────────────────────────────────────────────────────────────

export const useLenderFacilities = (params?: Record<string, unknown>) =>
  useQuery<LenderFacility[]>([], () => apexClient.lender.listFacilities(params), [JSON.stringify(params)]);

export const useLenderCovenants = (params?: Record<string, unknown>) =>
  useQuery<LenderCovenant[]>([], () => apexClient.lender.listCovenants(params), [JSON.stringify(params)]);

export const useLenderDrawdowns = (params?: Record<string, unknown>) =>
  useQuery<LenderDrawdown[]>([], () => apexClient.lender.listDrawdowns(params), [JSON.stringify(params)]);

export const useLenderReserveAccounts = (params?: Record<string, unknown>) =>
  useQuery<LenderReserveAccount[]>([], () => apexClient.lender.listReserveAccounts(params), [JSON.stringify(params)]);

// ─── Trader hooks ─────────────────────────────────────────────────────────────

export const useTraderOrders = (params?: Record<string, unknown>) =>
  useQuery<TraderOrder[]>([], () => apexClient.trader.listOrders(params), [JSON.stringify(params)]);

export const useTraderPositions = () =>
  useQuery<TraderPosition[]>([], () => apexClient.trader.listPositions(), []);

export const useTraderPnl = (params?: Record<string, unknown>) =>
  useQuery<TraderPnl[]>([], () => apexClient.trader.listPnl(params), [JSON.stringify(params)]);

export const useOrderBook = (energyType: string) =>
  useQuery<TraderOrderBook | null>(null, () => apexClient.trader.getOrderBook(energyType), [energyType]);

// ─── Carbon hooks ────────────────────────────────────────────────────────────

export const useCarbonCredits = (params?: Record<string, unknown>) =>
  useQuery<CarbonCredit[]>([], () => apexClient.carbon.listCredits(params), [JSON.stringify(params)]);

export const useCarbonProjects = (params?: Record<string, unknown>) =>
  useQuery<CarbonProject[]>([], () => apexClient.carbon.listProjects(params), [JSON.stringify(params)]);

export const useCarbonRetirements = (params?: Record<string, unknown>) =>
  useQuery<CarbonRetirement[]>([], () => apexClient.carbon.listRetirements(params), [JSON.stringify(params)]);

export const useCarbonMrv = (params?: Record<string, unknown>) =>
  useQuery<CarbonMrv[]>([], () => apexClient.carbon.listMrv(params), [JSON.stringify(params)]);

// ─── Offtaker hooks ──────────────────────────────────────────────────────────

export const useOfftakerPpas = (params?: Record<string, unknown>) =>
  useQuery<OfftakerPpa[]>([], () => apexClient.offtaker.listPpas(params), [JSON.stringify(params)]);

export const useOfftakerDeliveries = (params?: Record<string, unknown>) =>
  useQuery<OfftakerDelivery[]>([], () => apexClient.offtaker.listDeliveries(params), [JSON.stringify(params)]);

export const useOfftakerTariffs = (params?: Record<string, unknown>) =>
  useQuery<OfftakerTariff[]>([], () => apexClient.offtaker.listTariffHistory(params), [JSON.stringify(params)]);

// ─── Regulator hooks ─────────────────────────────────────────────────────────

export const useRegulatorFilings = (params?: Record<string, unknown>) =>
  useQuery<RegulatorFiling[]>([], () => apexClient.regulator.listFilings(params), [JSON.stringify(params)]);

export const useRegulatorEnforcement = (params?: Record<string, unknown>) =>
  useQuery<RegulatorEnforcement[]>([], () => apexClient.regulator.listEnforcement(params), [JSON.stringify(params)]);

export const useRegulatorLicences = (params?: Record<string, unknown>) =>
  useQuery<RegulatorLicence[]>([], () => apexClient.regulator.listLicences(params), [JSON.stringify(params)]);

// ─── Grid hooks ──────────────────────────────────────────────────────────────

export const useGridConnections = (params?: Record<string, unknown>) =>
  useQuery<GridConnection[]>([], () => apexClient.grid.listConnections(params), [JSON.stringify(params)]);

export const useGridNominations = (params?: Record<string, unknown>) =>
  useQuery<GridNomination[]>([], () => apexClient.grid.listNominations(params), [JSON.stringify(params)]);

export const useGridCurtailments = (params?: Record<string, unknown>) =>
  useQuery<GridCurtailment[]>([], () => apexClient.grid.listCurtailments(params), [JSON.stringify(params)]);

export const useGridReserveActivations = (params?: Record<string, unknown>) =>
  useQuery<GridReserveActivation[]>([], () => apexClient.grid.listReserveActs(params), [JSON.stringify(params)]);

// ─── Esums hooks ─────────────────────────────────────────────────────────────

export const useEsumsAssets = (params?: Record<string, unknown>) =>
  useQuery<EsumsAsset[]>([], () => apexClient.esums.listAssets(params), [JSON.stringify(params)]);

export const useEsumsWorkOrders = (params?: Record<string, unknown>) =>
  useQuery<EsumsWorkOrder[]>([], () => apexClient.esums.listWorkOrders(params), [JSON.stringify(params)]);

export const useEsumsPrognostics = (params?: Record<string, unknown>) =>
  useQuery<EsumsPrognostic[]>([], () => apexClient.esums.listPrognostics(params), [JSON.stringify(params)]);

// ─── OEM hooks ───────────────────────────────────────────────────────────────

export const useOemTickets = (params?: Record<string, unknown>) =>
  useQuery<OemTicket[]>([], () => apexClient.oem.listTickets(params), [JSON.stringify(params)]);

export const useOemSpareParts = (params?: Record<string, unknown>) =>
  useQuery<OemSparePart[]>([], () => apexClient.oem.listSpareParts(params), [JSON.stringify(params)]);

export const useOemWarrantyRecovery = (params?: Record<string, unknown>) =>
  useQuery<OemWarrantyRecovery[]>([], () => apexClient.oem.listWarrantyRecovery(params), [JSON.stringify(params)]);

// ─── Settlement hooks ────────────────────────────────────────────────────────

export const useInvoices = (params?: Record<string, unknown>) =>
  useQuery<Invoice[]>([], () => apexClient.settlement.listInvoices(params), [JSON.stringify(params)]);

// ─── Audit hooks ─────────────────────────────────────────────────────────────

export const useAuditBlocks = (params?: Record<string, unknown>) =>
  useQuery<AuditBlock[]>([], () => apexClient.audit.listBlocks(params), [JSON.stringify(params)]);

// ─── Admin hooks ──────────────────────────────────────────────────────────────

export const useAdminStats = () =>
  useQuery<AdminStats | null>(null, () => apexClient.admin.getStats(), []);

export const useAdminUsers = (params?: Record<string, unknown>) =>
  useQuery<AdminUser[]>([], () => apexClient.admin.listUsers(params), [JSON.stringify(params)]);

export const useAdminTenants = (params?: Record<string, unknown>) =>
  useQuery<AdminTenant[]>([], () => apexClient.admin.listTenants(params), [JSON.stringify(params)]);

export const useAdminKyc = (params?: Record<string, unknown>) =>
  useQuery<AdminKyc[]>([], () => apexClient.admin.listKyc(params), [JSON.stringify(params)]);

export const useAdminModules = () =>
  useQuery<AdminModule[]>([], () => apexClient.admin.listModules(), []);

export const useAdminAuditLogs = (params?: Record<string, unknown>) =>
  useQuery<AdminAuditLog[]>([], () => apexClient.admin.listAuditLogs(params), [JSON.stringify(params)]);

export const useAdminFlags = () =>
  useQuery<AdminFeatureFlag[]>([], () => apexClient.admin.listFlags(), []);

export const useAdminBillingRuns = () =>
  useQuery<AdminBillingRun[]>([], () => apexClient.admin.listBillingRuns(), []);

export const useAdminInvoices = (params?: Record<string, unknown>) =>
  useQuery<AdminInvoice[]>([], () => apexClient.admin.listInvoices(params), [JSON.stringify(params)]);

// ─── Mutation hooks ───────────────────────────────────────────────────────────

export const usePlaceOrder = () =>
  useMutation((body: Record<string, unknown>) => apexClient.trader.placeOrder(body));

export const useCancelOrder = () =>
  useMutation((id: string) => apexClient.trader.cancelOrder(id));

export const useRetireCredits = () =>
  useMutation(({ id, body }: { id: string; body: Record<string, unknown> }) =>
    apexClient.carbon.retireCredits(id, body));

export const useApproveDisbursement = () =>
  useMutation(({ id, body }: { id: string; body: Record<string, unknown> }) =>
    apexClient.lender.approveDisbursement(id, body));

export const useEscalateTicket = () =>
  useMutation(({ id, body }: { id: string; body: Record<string, unknown> }) =>
    apexClient.oem.escalateTicket(id, body));

export const useSubmitFiling = () =>
  useMutation((id: string) => apexClient.regulator.submitFiling(id));

export const useConfirmNomination = () =>
  useMutation(({ id, body }: { id: string; body: Record<string, unknown> }) =>
    apexClient.grid.confirmNomination(id, body));
