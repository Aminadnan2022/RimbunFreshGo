import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Award, ChevronRight, MapPin, Calendar } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { vendors } from '../data/vendors';
import { fetchProductById } from '../data/products';
import type { Product } from '../types';
import ProductImage from '../components/ui/ProductImage';

export default function VendorsPage() {
  const { t } = useLanguage();
  const [productMap, setProductMap] = useState<Record<string, Product | null>>({});

  useEffect(() => {
    (async () => {
      const allIds = vendors.flatMap((v) => v.products);
      const entries = await Promise.all(
        allIds.map(async (id) => [id, await fetchProductById(id)] as const)
      );
      setProductMap(Object.fromEntries(entries));
    })();
  }, []);
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-14">
        <span className="inline-block bg-forest-100 text-forest-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-4">
          {t("vendors.badge")}
        </span>
        <h1 className="section-title text-4xl mb-3">{t("vendors.title")}</h1>
        <p className="text-gray-500 leading-relaxed">
          {t("vendors.description")}
        </p>
      </div>

      {/* Vendor cards */}
      <div className="space-y-14">
        {vendors.map((vendor) => (
          <article key={vendor.id} id={vendor.id} className="card overflow-hidden scroll-mt-24">
            {/* Cover image */}
            <div className="relative h-52 sm:h-64 overflow-hidden">
              <img
                src={vendor.coverImage}
                alt={`${vendor.name} cover`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 via-forest-950/20 to-transparent" />
              <div className="absolute bottom-5 left-6 flex items-end gap-4">
                <img
                  src={vendor.image}
                  alt={vendor.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-lg"
                />
                <div>
                  <h2 className="font-display text-2xl font-bold text-white">{vendor.name}</h2>
                  <div className="flex items-center gap-1.5 text-forest-200 text-sm">
                    <MapPin size={13} />
                    {vendor.location}
                    <span className="mx-1.5 opacity-50">·</span>
                    <Calendar size={13} />
                    {t("vendors.since")}{vendor.since}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 grid md:grid-cols-3 gap-8">
              {/* Story */}
              <div className="md:col-span-2">
                <h3 className="font-semibold text-forest-800 mb-2">{t("vendors.theirStory")}</h3>
                <p className="text-gray-600 leading-relaxed">{vendor.story}</p>
              </div>

              {/* Sidebar */}
              <div className="space-y-5">
                {/* Certifications */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Award size={15} className="text-jade-600" />
                    <h4 className="text-sm font-semibold text-charcoal">{t("vendors.certifications")}</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {vendor.certifications.map((c) => (
                      <li key={c} className="text-xs text-gray-600 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-jade-500 rounded-full flex-shrink-0" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Quality standards */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={15} className="text-jade-600" />
                    <h4 className="text-sm font-semibold text-charcoal">{t("vendors.qualityStandards")}</h4>
                  </div>
                  <ul className="space-y-1.5">
                    {vendor.qualityStandards.map((s) => (
                      <li key={s} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <span className="w-1.5 h-1.5 bg-forest-400 rounded-full mt-1.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Products from this vendor */}
            <div className="px-6 sm:px-8 pb-8">
              <h3 className="font-semibold text-charcoal mb-4">{t("vendors.availableFrom")}{vendor.name}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {vendor.products.map((pid) => {
                  const product = productMap[pid];
                  if (!product) return null;
                  return (
                    <Link
                      key={pid}
                      to={`/product/${pid}`}
                      className="flex flex-col gap-2 group p-3 rounded-2xl border border-cream-200 hover:border-forest-300 hover:bg-forest-50 transition-all"
                    >
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        className="w-full h-20 rounded-xl object-cover"
                      />
                      <div>
                        <p className="text-xs font-semibold text-charcoal leading-snug group-hover:text-forest-700 transition-colors">
                          {product.name}
                        </p>
                        <p className="text-xs font-bold text-forest-700 mt-0.5">RM{product.price}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-forest-500 font-medium group-hover:gap-2 transition-all">
                        {t("vendors.view")} <ChevronRight size={12} />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
