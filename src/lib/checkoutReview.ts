import type { PreparationAnswers, PreparationQuestion, PreparationTarget } from './checkoutPreparation';

type ReviewLanguage = 'en' | 'ms';

const localizedLabel = (value: { label: string; label_ms: string }, language: ReviewLanguage) =>
  language === 'ms' && value.label_ms ? value.label_ms : value.label;

const reviewAnswerKey = (target: PreparationTarget, unit: number | null) =>
  `${target.key}:${unit ?? 'line'}`;

const isCleaningQuestion = (question: PreparationQuestion) => {
  const identity = `${question.code} ${question.label} ${question.label_ms}`.toLowerCase();
  return /clean|bersih/.test(identity);
};

export function concisePreparationAnswer(
  question: PreparationQuestion,
  value: unknown,
  language: ReviewLanguage,
): string[] {
  if (value === undefined || value === null || value === '') return [];

  const phrase = (answer: unknown) => {
    const option = question.options.find((candidate) => candidate.code === answer || candidate.value === answer);
    const configuredLabel = option ? localizedLabel(option, language) : String(answer);
    const normalized = configuredLabel.trim().toLowerCase();

    if (isCleaningQuestion(question)) {
      if (answer === true || ['yes', 'ya', 'true'].includes(normalized)) return language === 'ms' ? 'Dibersihkan' : 'Cleaned';
      if (answer === false || ['no', 'tidak', 'false'].includes(normalized)) return language === 'ms' ? 'Tidak dibersihkan' : 'Not cleaned';
    }

    return configuredLabel.replace(/^.+?:\s*/, '').trim();
  };

  return (Array.isArray(value) ? value : [value]).map(phrase).filter(Boolean);
}

export function concisePreparationText(
  target: PreparationTarget,
  answers: PreparationAnswers,
  unit: number | null,
  language: ReviewLanguage,
): string {
  const scopes: PreparationQuestion['selection_scope'][] = unit === null
    ? ['line']
    : ['line', 'physical_unit'];

  return target.questionnaire.questions
    .filter((question) => scopes.includes(question.selection_scope))
    .flatMap((question) => {
      const answerUnit = question.selection_scope === 'line' ? null : unit;
      const value = answers[reviewAnswerKey(target, answerUnit)]?.[question.code];
      return concisePreparationAnswer(question, value, language);
    })
    .join(' · ');
}

export function conciseReviewLabel(target: PreparationTarget, unit: number | null) {
  return unit !== null && target.quantity > 1 ? `${target.name} #${unit + 1}` : target.name;
}
