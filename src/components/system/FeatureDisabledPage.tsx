import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function FeatureDisabledPage() {
  const { t } = useLanguage();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-3xl bg-forest-50 border border-forest-100 flex items-center justify-center mb-6">
        <Construction size={36} className="text-forest-600" />
      </div>
      <span className="inline-block bg-forest-100 text-forest-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
        {t('featureDisabled.badge')}
      </span>
      <h1 className="font-display text-4xl sm:text-5xl font-bold text-forest-900 mb-4">
        {t('featureDisabled.title')}
      </h1>
      <p className="text-lg text-gray-600 mb-2 max-w-md">
        {t('featureDisabled.description')}
      </p>
      <p className="text-gray-400 mb-10 max-w-md">
        {t('featureDisabled.subtitle')}
      </p>
      <Link
        to="/"
        className="btn-primary inline-flex items-center gap-2"
      >
        {t('featureDisabled.backHome')}
      </Link>
    </main>
  );
}
