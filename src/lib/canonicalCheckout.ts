import type { CartItem, CustomerDetails, DeliveryDay } from '../types';
import type { PreparationAnswers, PreparationTarget } from './checkoutPreparation';
import { canonicalCheckoutItems, type CanonicalCheckoutItem } from './canonicalCheckoutItems';
import { nextBulkDeliveryDate } from './deliverySlots';
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
  p_items: CanonicalCheckoutItem[];
  p_preparation_answers: CanonicalPreparationAnswer[];
  p_expected_final_total?: number;
  p_expected_payment_configuration_version_id?: string;
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
  functionName: 'place_sales_order' | 'place_sales_order_with_checkout_payment_preview',
  arguments_: CanonicalPlaceOrderRequest,
) => Promise<{
  data: CanonicalPlaceOrderResult[] | null;
  error: { message: string } | null;
}>;

export function nextCanonicalDeliveryDate(day: DeliveryDay, now = new Date()): string {
  return nextBulkDeliveryDate(day, now);
}

export function zoneCodeFromDeliveryPoint(value: string): string | undefined {
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

export function isBulkDeliveryPointEligible(value: string): boolean {
  return zoneCodeFromDeliveryPoint(value) !== undefined;
}

function preparationAnswerPayload(
  targets: PreparationTarget[],
  answers: PreparationAnswers,
): CanonicalPreparationAnswer[] {
  return targets.flatMap((target) => {
    const component = target.componentNumber;
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
    p_items: canonicalCheckoutItems(items),
    p_preparation_answers: preparationAnswerPayload(input.preparationTargets, input.preparationAnswers),
  };
}

export async function placeCanonicalOrder(request: CanonicalPlaceOrderRequest) {
  const guarded = request.p_expected_final_total !== undefined;
  const { data, error } = await (supabase.rpc as unknown as PlaceOrderRpc)(
    guarded ? 'place_sales_order_with_checkout_payment_preview' : 'place_sales_order',
    request,
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error('Canonical order placement returned no order.');
  return result;
}
