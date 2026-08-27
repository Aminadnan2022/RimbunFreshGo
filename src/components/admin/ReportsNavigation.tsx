import { BarChart3, History } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

export default function ReportsNavigation() {
  const { t } = useLanguage();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
      isActive
        ? 'border-forest-700 text-forest-700'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <nav className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b border-cream-200 mb-6 touch-pan-x" aria-label={t('businessReports.navigation.label')}>
      <NavLink to="/admin/reports" end className={linkClass}>
        <BarChart3 size={16} />
        {t('businessReports.navigation.overview')}
      </NavLink>
      <NavLink to="/admin/historical" className={linkClass}>
        <History size={16} />
        {t('historicalData.title')}
      </NavLink>
    </nav>
  );
}
