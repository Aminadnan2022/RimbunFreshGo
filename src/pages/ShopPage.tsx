import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Loader2 } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import ProductCard from '../components/ui/ProductCard';
import { useLanguage } from '../context/LanguageContext';
import { useWebsiteSettings } from '../context/WebsiteSettingsContext';
import FeatureDisabledPage from '../components/system/FeatureDisabledPage';
import type { Category } from '../types';

const categories: { value: Category | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'fish', label: 'Fish' },
  { value: 'prawns', label: 'Prawns' },
  { value: 'squid', label: 'Squid' },
];

const priceRanges = [
  { value: 'all', label: 'Any Price' },
  { value: '0-15', label: 'Under RM15' },
  { value: '15-25', label: 'RM15 – RM25' },
  { value: '25-50', label: 'RM25 – RM50' },
];

const availabilityOpts = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited' },
];

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, loading, error } = useProducts();
  const { t } = useLanguage();
  const { settings, loading: settingsLoading } = useWebsiteSettings();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState<Category | 'all'>(
    (searchParams.get('category') as Category) ?? 'all'
  );
  const [priceRange, setPriceRange] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    const cat = searchParams.get('category');
    if (q) setQuery(q);
    if (cat) setCategory(cat as Category);
  }, [searchParams]);

  const filtered = useMemo(() => {
    const list = products.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (availability !== 'all' && p.freshness !== availability) return false;
      if (priceRange !== 'all') {
        const [min, max] = priceRange.split('-').map(Number);
        if (p.price < min || p.price > max) return false;
      }
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.nameMs.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });

    const sort = settings.default_product_sort || 'manual';
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price_low') return [...list].sort((a, b) => a.price - b.price);
    if (sort === 'price_high') return [...list].sort((a, b) => b.price - a.price);
    return list;
  }, [products, category, priceRange, availability, query, settings.default_product_sort]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams((prev) => {
      if (query.trim()) prev.set('q', query);
      else prev.delete('q');
      return prev;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setPriceRange('all');
    setAvailability('all');
    setSearchParams({});
  };

  const hasActiveFilters = category !== 'all' || priceRange !== 'all' || availability !== 'all' || query;

  if (!settingsLoading && !settings.show_shop) {
    return <FeatureDisabledPage />;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Page title */}
      <div className="mb-8">
        <nav className="text-xs text-gray-400 mb-2">
          <Link to="/" className="hover:text-forest-600">{t("shop.breadcrumbHome")}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-600">{t("shop.breadcrumbShop")}</span>
        </nav>
        <h1 className="section-title">{t("shop.title")}</h1>
        <p className="text-gray-500 mt-1">
          {filtered.length === 1 ? t("shop.resultCount", { count: filtered.length }) : t("shop.resultCountPlural", { count: filtered.length })}
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("shop.searchPlaceholder")}
            className="w-full bg-white border border-cream-300 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent shadow-soft"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-cream-300 bg-white hover:border-forest-400 hover:bg-forest-50 text-gray-600 text-sm font-medium transition-all shadow-soft"
        >
          <SlidersHorizontal size={16} />
          <span className="hidden sm:block">{t("shop.filterButton")}</span>
          <ChevronDown size={14} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
      </form>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap mb-4">
        {categories.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              category === c.value
                ? 'bg-forest-700 text-white shadow-green'
                : 'bg-white text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700'
            }`}
          >
            {t("shop.categories." + c.value)}
          </button>
        ))}
      </div>

      {/* Expanded filters */}
      {filtersOpen && (
        <div className="bg-white rounded-3xl border border-cream-200 shadow-soft p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">{t("shop.priceRange")}</label>
            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value)}
              className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            >
              {priceRanges.map((r) => (
                <option key={r.value} value={r.value}>{t("shop.priceOptions." + r.value)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">{t("shop.availability")}</label>
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              className="w-full bg-cream-50 border border-cream-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-400"
            >
              {availabilityOpts.map((o) => (
                <option key={o.value} value={o.value}>{t("shop.availabilityOptions." + o.value)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors">
                <X size={15} /> {t("shop.clearAllFilters")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="text-center py-24 text-red-500 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
            <Search size={28} className="text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">{t("shop.empty.title")}</h3>
          <p className="text-gray-500 text-sm mb-6">{t("shop.empty.description")}</p>
          <button onClick={clearFilters} className="btn-primary text-sm">{t("shop.empty.clearButton")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
