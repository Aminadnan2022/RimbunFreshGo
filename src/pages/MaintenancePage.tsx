import { Wrench } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function MaintenancePage() {
  const { t } = useLanguage();
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
      <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-50 flex items-center justify-center mb-6">
        <Wrench size={30} className="text-amber-600" />
      </div>
      <h1 className="font-display text-4xl font-bold text-forest-900 mb-3">{t("maintenance.title")}</h1>
      <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">{t("maintenance.description")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="btn-primary inline-flex items-center gap-2"
      >
        {t("maintenance.refresh")}
      </button>
    </main>
  );
}
