import { Minus, Plus } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}

export default function QuantityStepper({ value, onChange, min = 1, max = 20, size = 'md' }: Props) {
  const { t } = useLanguage();
  const btnClass = size === 'sm'
    ? 'w-7 h-7 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed'
    : 'w-9 h-9 flex items-center justify-center rounded-full bg-cream-100 hover:bg-forest-100 text-forest-700 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-forest-400 disabled:opacity-40 disabled:cursor-not-allowed';
  const iconSize = size === 'sm' ? 14 : 16;
  const numClass = size === 'sm' ? 'w-8 text-center font-semibold text-sm' : 'w-10 text-center font-semibold';

  return (
    <div className="flex items-center gap-2">
      <button
        className={btnClass}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={t("quantity.decrease")}
      >
        <Minus size={iconSize} />
      </button>
      <span className={numClass} aria-live="polite">{value}</span>
      <button
        className={btnClass}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={t("quantity.increase")}
      >
        <Plus size={iconSize} />
      </button>
    </div>
  );
}
