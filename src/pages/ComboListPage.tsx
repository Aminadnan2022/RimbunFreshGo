import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Loader2, Star, SlidersHorizontal } from 'lucide-react';
import { fetchActiveComboList } from '../data/combos';
import { useProducts } from '../hooks/useProducts';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import ComboCard from '../components/combo/ComboCard';
import FeatureDisabledPage from '../components/system/FeatureDisabledPage';
import type { ComboWithItems } from '../types';

type SortKey = 'featured' | 'popular' | 'newest' | 'name' | 'price';

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'comboList.sortFeatured' },
  { value: 'popular', label: 'comboList.sortPopular' },
  { value: 'newest', label: 'comboList.sortNewest' },
  { value: 'name', label: 'comboList.sortName' },
  { value: 'price', label: 'comboList.sortPrice' },
];

function sortCombos(list: ComboWithItems[], sort: SortKey): ComboWithItems[] {
  const arr = [...list];
  switch (sort) {
    case 'newest':
      return arr.sort((a, b) => new Date(b.combo.created_at).getTime() - new Date(a.combo.created_at).getTime());
    case 'name':
      return arr.sort((a, b) => a.combo.name.localeCompare(b.combo.name));
    case 'price':
      return arr.sort((a, b) => Number(a.combo.price) - Number(b.combo.price));
    case 'popular':
      return arr.sort((a, b) => (Number(b.combo.badge === 'Popular')) - (Number(a.combo.badge === 'Popular')));
    case 'featured':
    default:
      return arr.sort((a, b) => (a.combo.display_order ?? 0) - (b.combo.display_order ?? 0));
  }
}

export default function ComboListPage() {
  const { t } = useLanguage();
  const { products } = useProducts();
  const { settings, loading: settingsLoading } = useWebsiteSettings();
  const [combos, setCombos] = useState<ComboWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<SortKey>('featured');

  useEffect(() => {
    const s = settings.default_combo_sort || 'manual';
    if (s === 'name') setSort('name');
    else if (s === 'price_low') setSort('price');
    else if (s === 'newest') setSort('newest');
    else setSort('featured');
  }, [settings.default_combo_sort]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchActiveComboList();
        setCombos(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load combos');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set(combos.map((c) => c.combo.category_label).filter(Boolean));
    return Array.from(set);
  }, [combos]);

  const filtered = useMemo(() => {
    const list = combos.filter((cw) => {
      const combo = cw.combo;
      if (category !== 'all' && (combo.category_label || '') !== category) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          combo.name.toLowerCase().includes(q) ||
          combo.tagline.toLowerCase().includes(q) ||
          combo.description.toLowerCase().includes(q) ||
          combo.badge.toLowerCase().includes(q)
        );
      }
      return true;
    });
    return sortCombos(list, sort);
  }, [combos, category, query, sort]);

  const hasFilter = Boolean(query.trim()) || category !== 'all';
  const featured = filtered.filter((c) => c.combo.featured);
  const gridCombos = filtered;

  if (!settingsLoading && !settings.show_family_combo) {
    return <FeatureDisabledPage />;
  }

  const count = gridCombos.length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page title */}
      <div className="mb-8">
        <nav className="text-xs text-gray-400 mb-2">
          <Link to="/" className="hover:text-forest-600">{t("comboList.breadcrumbHome")}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{t("comboList.breadcrumbCombos")}</span>
        </nav>
        <h1 className="section-title">{t("comboList.title")}</h1>
        <p className="text-gray-500 mt-1">{t("comboList.subtitle")}</p>
      </div>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("comboList.searchPlaceholder")}
            className="w-full bg-white border border-cream-300 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent shadow-soft"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-gray-400 hidden sm:block" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white border border-cream-300 rounded-2xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-forest-500 shadow-soft cursor-pointer"
            aria-label={t("comboList.sortLabel")}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{t(o.label)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category pills */}
      {categories.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setCategory('all')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              category === 'all'
                ? 'bg-forest-700 text-white shadow-green'
                : 'bg-white text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700'
            }`}
          >
            {t("comboList.allCategories")}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                category === c
                  ? 'bg-forest-700 text-white shadow-green'
                  : 'bg-white text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="text-center py-24 text-red-500 text-sm">{error}</div>
      ) : combos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
            <Star size={28} className="text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("comboList.emptyAllTitle")}</h3>
          <p className="text-gray-500 text-sm mb-6">{t("comboList.emptyAllDescription")}</p>
          <Link to="/shop" className="btn-primary text-sm">{t("comboList.startShopping")}</Link>
        </div>
      ) : (
        <>
          {/* Featured combos section */}
          {!hasFilter && featured.length > 0 && (
            <section className="mb-12">
              <div className="mb-6">
                <h2 className="section-title flex items-center gap-2">
                  <Star size={22} className="fill-yellow-400 text-yellow-400" />
                  {t("comboList.featuredTitle")}
                </h2>
                <p className="text-gray-500 mt-1">{t("comboList.featuredSubtitle")}</p>
              </div>
              <div className="flex gap-5 overflow-x-auto pb-4 -mx-4 px-4">
                {featured.map((cw) => (
                  <div key={cw.combo.id} className="w-72 sm:w-80 shrink-0">
                    <ComboCard comboWithItems={cw} products={products} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All combos grid */}
          <section>
            <div className="mb-6">
              <h2 className="section-title">{t("comboList.allTitle")}</h2>
              <p className="text-gray-500 mt-1">
                {count === 1 ? t("comboList.resultCount", { count }) : t("comboList.resultCountPlural", { count })}
              </p>
            </div>
            {gridCombos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 bg-cream-200 rounded-full flex items-center justify-center mb-4">
                  <Search size={24} className="text-cream-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("comboList.emptyTitle")}</h3>
                <p className="text-gray-500 text-sm mb-6">{t("comboList.emptyDescription")}</p>
                <button
                  onClick={() => { setQuery(''); setCategory('all'); }}
                  className="btn-secondary text-sm"
                >
                  {t("comboList.clearFilters")}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {gridCombos.map((cw) => (
                  <ComboCard key={cw.combo.id} comboWithItems={cw} products={products} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
