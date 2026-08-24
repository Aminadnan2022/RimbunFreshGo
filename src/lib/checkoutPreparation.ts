/* eslint-disable @typescript-eslint/no-explicit-any -- preparation RPC response is validated at the use site. */
import { supabase } from './supabase';
import type { CartItem } from '../types';

export type PreparationOption = {
  id: string;
  code: string;
  label: string;
  label_ms: string;
  value: unknown;
};

export type PreparationQuestion = {
  id: string;
  code: string;
  label: string;
  label_ms: string;
  help_text: string;
  help_text_ms: string;
  answer_type: string;
  selection_scope: 'line' | 'physical_unit';
  required: boolean;
  options: PreparationOption[];
};

export type Questionnaire = {
  product_version_id: string;
  preparation_schema_version_id: string;
  questions: PreparationQuestion[];
};

export type PreparationTarget = {
  key: string;
  lineKey: string;
  componentNumber?: number;
  productId: string;
  name: string;
  category?: string;
  quantity: number;
  comboQuantity?: number;
  unitsPerCombo?: number;
  questionnaire: Questionnaire;
};

export type PreparationAnswers = Record<string, Record<string, unknown>>;

export type PreparationLoadFailure = {
  productId: string;
  name: string;
  error: unknown;
};

export type PreparationLoadResult = {
  targets: PreparationTarget[];
  failures: PreparationLoadFailure[];
};

const db = supabase as any;

export async function loadQuestionnaire(
  productId: string,
): Promise<Questionnaire | null> {
  const { data, error } = await db.rpc(
    'get_published_product_preparation_questionnaire',
    { p_product_id: productId },
  );

  if (error) throw error;

  return data?.preparation_schema_version_id && Array.isArray(data.questions)
    ? (data as Questionnaire)
    : null;
}

function shouldIncludePreparationItem(item: CartItem): boolean {
  if (item.pricingType === 'slice' || item.orderingMode === 'slice') {
    return false;
  }

  if (item.category === 'chicken') {
    return true;
  }

  if (item.category === 'fish') {
    return true;
  }

  return !(
    item.pricingType === 'per_kg' ||
    item.orderingMode === 'weight_only'
  );
}

export async function loadPreparationTargets(
  items: CartItem[],
): Promise<PreparationLoadResult> {
  const candidates: Omit<PreparationTarget, 'questionnaire'>[] = [];

  items.forEach((item, line) => {
    const lineKey = `line-${line}`;

    if (item.isCombo && item.comboItems?.length) {
      item.comboItems.forEach((part, partIndex) => {
        if (part.pricingType === 'slice' || part.sellingUnit === 'slice') {
          return;
        }

        const isFish = part.category === 'fish';
        const isChicken = part.category === 'chicken';

        if (
          !isFish &&
          !isChicken &&
          (part.pricingType === 'per_kg' || part.sellingUnit === 'kg')
        ) {
          return;
        }

        candidates.push({
          key: `${lineKey}-combo-${partIndex}`,
          lineKey,
          componentNumber: partIndex + 1,
          productId: part.productId,
          name: part.name || part.label,
          category: part.category,
          quantity: part.quantity * item.quantity,
          comboQuantity: item.quantity,
          unitsPerCombo: part.quantity,
        });
      });

      return;
    }

    if (!shouldIncludePreparationItem(item)) {
      return;
    }

    candidates.push({
      key: lineKey,
      lineKey,
      productId: item.productId,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
    });
  });

  // Do not let one stale/misconfigured line make every other product's
  // questionnaire disappear. A missing published configuration is a normal
  // result (null); only an actual RPC failure is recorded as a failure.
  const questionnaires = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return {
          candidate,
          questionnaire: await loadQuestionnaire(candidate.productId),
          error: null,
        };
      } catch (error) {
        return { candidate, questionnaire: null, error };
      }
    }),
  );

  return {
    targets: questionnaires
      .filter(
        (
          x,
        ): x is {
          candidate: Omit<PreparationTarget, 'questionnaire'>;
          questionnaire: Questionnaire;
          error: null;
        } => !!x.questionnaire && x.questionnaire.questions.length > 0,
      )
      .map(({ candidate, questionnaire }) => ({
        ...candidate,
        questionnaire,
      })),
    failures: questionnaires
      .filter((x) => x.error !== null)
      .map(({ candidate, error }) => ({
        productId: candidate.productId,
        name: candidate.name,
        error,
      })),
  };
}

export function answerKey(
  target: PreparationTarget,
  unit: number | null,
) {
  return `${target.key}:${unit ?? 'line'}`;
}

export function requiredMissing(
  targets: PreparationTarget[],
  answers: PreparationAnswers,
) {
  return targets.some((target) =>
    target.questionnaire.questions.some((q) => {
      if (!q.required) return false;

      const units =
        q.selection_scope === 'physical_unit'
          ? Array.from(
              {
                length: Math.max(
                  0,
                  Number.isInteger(target.quantity)
                    ? target.quantity
                    : 0,
                ),
              },
              (_, i) => i,
            )
          : [null];

      return units.some((unit) => {
        const value =
          answers[answerKey(target, unit)]?.[q.code];

        return (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && !value.length)
        );
      });
    }),
  );
}

export function snapshotPreparation(
  targets: PreparationTarget[],
  answers: PreparationAnswers,
) {
  return {
    version: 1,
    captured_at: new Date().toISOString(),
    lines: targets.map((target) => ({
      line_key: target.lineKey,
      target_key: target.key,
      product_id: target.productId,
      product_name: target.name,
      product_version_id: target.questionnaire.product_version_id,
      preparation_schema_version_id:
        target.questionnaire.preparation_schema_version_id,
      units: target.questionnaire.questions.some(
        (q) => q.selection_scope === 'physical_unit',
      )
        ? Array.from({ length: target.quantity }, (_, unit) => ({
            unit_number: unit + 1,
            answers: snapshotAnswers(target, unit, answers),
          }))
        : [],
      line_answers: snapshotAnswers(target, null, answers),
    })),
  };
}

function snapshotAnswers(
  target: PreparationTarget,
  unit: number | null,
  answers: PreparationAnswers,
) {
  const values = answers[answerKey(target, unit)] ?? {};

  return target.questionnaire.questions
    .filter(
      (q) =>
        q.selection_scope ===
        (unit === null ? 'line' : 'physical_unit'),
    )
    .map((q) => ({
      question_id: q.id,
      question_code: q.code,
      label: q.label,
      label_ms: q.label_ms,
      answer_type: q.answer_type,
      value: values[q.code] ?? null,
      options: q.options
        .filter((o) => {
          const selected = values[q.code];

          return Array.isArray(selected)
            ? selected.some((code) => code === o.code)
            : selected === o.code;
        })
        .map((o) => ({
          code: o.code,
          label: o.label,
          label_ms: o.label_ms,
          value: o.value,
        })),
    }));
}
