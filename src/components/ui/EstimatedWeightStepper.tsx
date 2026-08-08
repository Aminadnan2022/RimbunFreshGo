import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getWeightOptions } from '../../lib/sellingOptions';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  unit?: 'g' | 'kg';
}

export default function EstimatedWeightStepper({ value, onChange, min = 250, max = 3000, size = 'md', unit = 'g' }: Props) {
  const { t } = useLanguage();
  const weightOptions = getWeightOptions();

  const handleDecrease = () => {
    const currentIndex = weightOptions.findIndex(w => w === value);
    if (currentIndex > 0) onChange(weightOptions[currentIndex - 1]);
  };

  const handleIncrease = () => {
    const currentIndex = weightOptions.findIndex(w => w === value);
    if (currentIndex < weightOptions.length - 1) onChange(weightOptions[currentIndex + 1]);
  };

  const formatWeight = (w: number) => {
    return unit === 'kg' ? `${(w / 1000).toFixed(1)}kg` : `${w}g`;
  };

  const btnClass = size === 'sm'
    ? 'w-7 h-7 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed'
    : 'w-9 h-9 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed';

  const iconSize = size === 'sm' ? 14 : 16;
  const displayClass = size === 'sm' ? 'w-8 text-center font-semibold text-sm' : 'w-10 text-center font-semibold';

  return (
    <div className="flex items-center gap-2">
      <button
        className={btnClass}
        onClick={handleDecrease}
        disabled={value <= min}
        aria-label={t("estimatedWeight.decrease")}
      >
        <ChevronLeft size={iconSize} />
      </button>
      <span className={displayClass} aria-live="polite">{formatWeight(value)}</span>
      <button
        className={btnClass}
        onClick={handleIncrease}
        disabled={value >= max}
        aria-label={t("estimatedWeight.increase")}
      >
        <ChevronRight size={iconSize} />
      </button>
    </div>
  );
}
