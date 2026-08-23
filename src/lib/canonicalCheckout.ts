import type { CartItem, CustomerDetails, DeliveryDay } from '../types';
import type { PreparationAnswers, PreparationTarget } from './checkoutPreparation';
import { supabase } from './supabase';

export type CanonicalDeliveryMethod = 'normal_bulk' | 'instant_customer_lalamove';

export interface CanonicalPreparationAnswer {
  line_number: number;
  component_number?: number;
  unit_number?: number;
  question_code: string;
  option_code?: string;
  answer_value?: unknown;
}

export interface CanonicalPlaceOrderRequest {
  p_idempotency_key: string;
  p_customer_snapshot: {
    name: string;
    phone: string;
    email: string;
    notes: string;
  };
  p_delivery_request: {
    method_code: CanonicalDeliveryMethod;
    requested_date: string;
    requested_time?: string;
    zone_code?: string;
    apartment: string;
    house_unit: string;
    delivery_point_name: string;
    pickup_location: string;
  };
  p_items: Array<{
    product_id?: string;
    combo_id?: string;
    quantity: number;
    estimated_weight_kg?: number;
    component_estimated_weights?: Record<string, number>;
  }>;
  p_preparation_answers: CanonicalPreparationAnswer[];
}

export interface CanonicalPlaceOrderResult {
  sales_order_id: string;
  order_number: string;
  price_status: 'estimated' | 'final';
  payment_status: 'pending' | 'receipt_submitted' | 'rejected' | 'paid';
  requires_supplier_finalisation: boolean;
  estimated_total: number;
  final_total: number | null;
}

type PlaceOrderRpc = (
  functionName: 'place_sales_order',
  arguments_: CanonicalPlaceOrderRequest,
) => Promise<{
  data: CanonicalPlaceOrderResult[] | null;
  error: { message: string } | null;
}>;

const weekdayNumbers: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nextCanonicalDeliveryDate(day: DeliveryDay): string {
  const date = new Date();
  const target = weekdayNumbers[day.toLowerCase()];
  if (target === undefined) throw new Error(`Unsupported delivery day: ${day}`);
  let offset = target - date.getDay();
  if (offset < 0) offset += 7;
  date.setDate(date.getDate() + offset);
  return localDate(date);
}

function zoneCodeFromDeliveryPoint(value: string): string | undefined {
  const normalized = value.toLowerCase();
  const residences: Array<[string, string]> = [
    ['rimbun', 'residensi_rimbun'],
    ['mutiara', 'residensi_mutiara'],
    ['emas', 'residensi_emas'],
    ['jed', 'residensi_jed'],
    ['parkland', 'residensi_parkland'],
    ['zamrud', 'residensi_zamrud'],
  ];
  return residences.find(([needle]) => normalized.includes(needle))?.[1];
}

function componentNumber(target: PreparationTarget): number | undefined {
  const match = target.key.match(/-combo-(\d+)$/);
  return match ? Number(match[1]) + 1 : undefined;
}

function preparationAnswerPayload(
  targets: PreparationTarget[],
  answers: PreparationAnswers,
): CanonicalPreparationAnswer[] {
  return targets.flatMap((target) => {
    const component = componentNumber(target);
    const units = target.questionnaire.questions.some((question) => question.selection_scope === 'physical_unit')
      ? Array.from({ length: target.quantity }, (_, index) => index + 1)
      : [];
    const answerRows: CanonicalPreparationAnswer[] = [];

    for (const question of target.questionnaire.questions.filter((entry) => entry.selection_scope === 'line')) {
      const value = answers[`${target.key}:line`]?.[question.code];
      if (value === undefined) continue;
      answerRows.push({
        line_number: Number(target.lineKey.replace('line-', '')) + 1,
        ...(component !== undefined && { component_number: component }),
        question_code: question.code,
        ...(typeof value === 'string' && question.answer_type === 'single_select'
          ? { option_code: value }
          : { answer_value: value }),
      });
    }

    for (const unitNumber of units) {
      for (const question of target.questionnaire.questions.filter((entry) => entry.selection_scope === 'physical_unit')) {
        const value = answers[`${target.key}:${unitNumber - 1}`]?.[question.code];
        if (value === undefined) continue;
        answerRows.push({
          line_number: Number(target.lineKey.replace('line-', '')) + 1,
          ...(component !== undefined && { component_number: component }),
          unit_number: unitNumber,
          question_code: question.code,
          ...(typeof value === 'string' && question.answer_type === 'single_select'
            ? { option_code: value }
            : { answer_value: value }),
        });
      }
    }

    return answerRows;
  });
}

export function buildCanonicalPlaceOrderRequest(input: {
  idempotencyKey: string;
  customer: CustomerDetails;
  items: CartItem[];
  deliveryMethod: CanonicalDeliveryMethod;
  deliveryDay: DeliveryDay | null;
  instantDate: string;
  instantTime: string;
  preparationTargets: PreparationTarget[];
  preparationAnswers: PreparationAnswers;
}): CanonicalPlaceOrderRequest {
  const { customer, items, deliveryMethod, deliveryDay, instantDate, instantTime } = input;
  const requestedDate = deliveryMethod === 'instant_customer_lalamove'
    ? instantDate
    : deliveryDay ? nextCanonicalDeliveryDate(deliveryDay) : '';
  const zoneCode = deliveryMethod === 'normal_bulk'
    ? zoneCodeFromDeliveryPoint(customer.deliveryPointName)
    : undefined;

  if (!requestedDate) throw new Error('Select a delivery date.');
  if (deliveryMethod === 'normal_bulk' && !zoneCode) {
    throw new Error('Select an eligible Jalan Zamrud Utama residence for bulk delivery.');
  }
  if (deliveryMethod === 'instant_customer_lalamove' && !instantTime) {
    throw new Error('Select an instant delivery time.');
  }

  return {
    p_idempotency_key: input.idempotencyKey,
    p_customer_snapshot: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
      notes: customer.notes.trim(),
    },
    p_delivery_request: {
      method_code: deliveryMethod,
      requested_date: requestedDate,
      ...(deliveryMethod === 'instant_customer_lalamove' && { requested_time: instantTime }),
      ...(zoneCode && { zone_code: zoneCode }),
      apartment: customer.apartment.trim(),
      house_unit: customer.houseUnit.trim(),
      delivery_point_name: customer.deliveryPointName.trim(),
      pickup_location: customer.pickupLocation.trim(),
    },
    p_items: items.map((item) => ({
      ...(item.isCombo && item.comboId ? { combo_id: item.comboId } : { product_id: item.productId }),
      quantity: item.quantity,
      ...(item.estimatedWeight !== undefined && { estimated_weight_kg: item.estimatedWeight }),
    })),
    p_preparation_answers: preparationAnswerPayload(input.preparationTargets, input.preparationAnswers),
  };
}

export async function placeCanonicalOrder(request: CanonicalPlaceOrderRequest) {
  const { data, error } = await (supabase.rpc as unknown as PlaceOrderRpc)(
    'place_sales_order',
    request,
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error('Canonical order placement returned no order.');
  return result;
}
