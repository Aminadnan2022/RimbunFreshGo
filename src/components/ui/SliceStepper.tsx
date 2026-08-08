import { Minus, Plus } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getSliceRange } from '../../lib/sellingOptions';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  increment?: number;
  unit?: string;
  size?: 'sm' | 'md';
}

export default function SliceStepper({
  value,
  onChange,
  min,
  max,
  increment,
  unit = 'slice',
  size = 'md',
}: Props) {
  const { t } = useLanguage();
  const range = getSliceRange({ minSlice: min, maxSlice: max, sliceIncrement: increment });

  const btnClass = size === 'sm'
    ? 'w-7 h-7 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed'
    : 'w-9 h-9 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed';
  const iconSize = size === 'sm' ? 14 : 16;

  const bounded = Math.min(Math.max(value, range.min), range.max);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btnClass}
        onClick={() => onChange(Math.max(range.min, bounded - range.increment))}
        disabled={bounded <= range.min}
        aria-label={t("quantity.decrease")}
      >
        <Minus size={iconSize} />
      </button>
      <span className={`text-center font-semibold ${size === 'sm' ? 'text-sm' : ''}`} aria-live="polite">
        {bounded} {unit}
      </span>
      <button
        type="button"
        className={btnClass}
        onClick={() => onChange(Math.min(range.max, bounded + range.increment))}
        disabled={bounded >= range.max}
        aria-label={t("quantity.increase")}
      >
        <Plus size={iconSize} />
      </button>
    </div>
  );
}