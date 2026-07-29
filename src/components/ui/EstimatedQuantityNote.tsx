import { useLanguage } from '../../context/LanguageContext';

interface Props {
  weightGrams: number;
  averageWeight: number;
  unitLabel: string;
}

export default function EstimatedQuantityNote({ weightGrams, averageWeight, unitLabel }: Props) {
  const { t } = useLanguage();
  if (!averageWeight || averageWeight <= 0) return null;

  const min = Math.floor(weightGrams / averageWeight);
  const max = Math.ceil(weightGrams / averageWeight);

  return (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 leading-relaxed space-y-1">
      <p className="font-semibold">{t("product.estimatedQuantity")}</p>
      {min === max ? (
        <p>≈ {min} {unitLabel}</p>
      ) : (
        <p>≈ {min}–{max} {unitLabel}</p>
      )}
      <p className="text-amber-500">{t("product.estimationDisclaimer")}</p>
    </div>
  );
}
