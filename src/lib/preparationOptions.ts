import type { Category, PreparationOption } from '../types';

const CATEGORY_PREP_OPTIONS: Record<Category, PreparationOption[]> = {
  fish: ['whole', 'cleaned', 'descaled', 'gutted'],
  chicken: ['whole', 'cut4', 'cut12', 'cut16'],
  prawns: [],
  squid: [],
  combo: [],
};

const PREP_LABELS: Record<PreparationOption, string> = {
  whole: 'Whole',
  cleaned: 'Cleaned',
  descaled: 'Descaled',
  gutted: 'Gutted & Cleaned',
  cut: 'Cut into pieces',
  cut4: 'Cut into 4',
  cut12: 'Cut into 12',
  cut16: 'Cut into 16',
};

export function getPrepOptionsByCategory(category: Category): PreparationOption[] {
  return CATEGORY_PREP_OPTIONS[category] ?? [];
}

export function getPrepLabel(option: PreparationOption): string {
  return PREP_LABELS[option] ?? option;
}

export { CATEGORY_PREP_OPTIONS, PREP_LABELS };
