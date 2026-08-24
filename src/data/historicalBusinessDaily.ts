import { supabase } from '../lib/supabase';

export interface HistoricalBusinessDaily {
  id: number; business_date: string; order_count: number; revenue_amount: number;
  supplier_cost_amount: number; delivery_income_amount: number; gross_profit_amount: number;
  source: string; notes: string | null; created_by: string | null; updated_by: string | null;
  created_at: string; updated_at: string;
}

export interface HistoricalBusinessDailyInput {
  business_date: string; order_count: number; revenue_amount: number;
  supplier_cost_amount: number; delivery_income_amount: number; gross_profit_amount: number;
  notes?: string | null;
}

export class HistoricalBusinessDailyError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'HistoricalBusinessDailyError';
  }
}

const throwMutationError = (error: { message: string; code?: string } | null) => {
  if (error) throw new HistoricalBusinessDailyError(error.message, error.code);
};

const toRow = (r: Record<string, unknown>): HistoricalBusinessDaily => ({
  id: Number(r.id), business_date: String(r.business_date), order_count: Number(r.order_count ?? 0),
  revenue_amount: Number(r.revenue_amount ?? 0), supplier_cost_amount: Number(r.supplier_cost_amount ?? 0),
  delivery_income_amount: Number(r.delivery_income_amount ?? 0), gross_profit_amount: Number(r.gross_profit_amount ?? 0),
  source: String(r.source ?? 'historical_import'), notes: (r.notes as string | null) ?? null,
  created_by: (r.created_by as string | null) ?? null, updated_by: (r.updated_by as string | null) ?? null,
  created_at: String(r.created_at), updated_at: String(r.updated_at),
});

/** All historical daily rows, oldest first. Admin-only via RLS. */
export async function fetchHistoricalBusinessDaily(): Promise<HistoricalBusinessDaily[]> {
  const { data, error } = await supabase.from('historical_business_daily').select('*').order('business_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

/** Create through an admin-only SECURITY DEFINER RPC; clients have no table DML. */
export async function createHistoricalBusinessDaily(input: HistoricalBusinessDailyInput): Promise<void> {
  const { error } = await supabase.rpc('admin_create_historical_business_daily', {
    p_business_date: input.business_date, p_order_count: input.order_count,
    p_revenue_amount: input.revenue_amount, p_supplier_cost_amount: input.supplier_cost_amount,
    p_delivery_income_amount: input.delivery_income_amount, p_gross_profit_amount: input.gross_profit_amount,
    p_notes: input.notes ?? undefined,
  });
  throwMutationError(error);
}

/** Update through an admin-only SECURITY DEFINER RPC; clients have no table DML. */
export async function updateHistoricalBusinessDaily(id: number, input: HistoricalBusinessDailyInput): Promise<void> {
  const { error } = await supabase.rpc('admin_update_historical_business_daily', {
    p_id: id, p_business_date: input.business_date, p_order_count: input.order_count,
    p_revenue_amount: input.revenue_amount, p_supplier_cost_amount: input.supplier_cost_amount,
    p_delivery_income_amount: input.delivery_income_amount, p_gross_profit_amount: input.gross_profit_amount,
    p_notes: input.notes ?? undefined,
  });
  throwMutationError(error);
}

/** Delete through an admin-only SECURITY DEFINER RPC; clients have no table DML. */
export async function deleteHistoricalBusinessDaily(id: number): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_historical_business_daily', { p_id: id });
  throwMutationError(error);
}
