import { BarChart3, History } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

export default function ReportsNavigation() {
  const { t } = useLanguage();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
      isActive
        ? 'border-forest-700 text-forest-700'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <nav className="flex gap-1 border-b border-cream-200 mb-6" aria-label={t('businessReports.navigation.label')}>
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
