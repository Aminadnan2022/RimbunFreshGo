import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { getPrepOptionsByCategory, getPrepLabel } from '../lib/preparationOptions';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { fetchProductById, createProduct, updateProduct } from '../data/products';
import type { ProductPayload } from '../data/products';
import type { Category, PreparationOption } from '../types';
import MultiImageUploader from '../components/ui/MultiImageUploader';

const CATEGORIES: { value: Category; labelKey: string }[] = [
  { value: 'chicken', labelKey: 'adminProducts.labels.chicken' },
  { value: 'fish', labelKey: 'adminProducts.labels.fish' },
  { value: 'prawns', labelKey: 'adminProducts.labels.prawns' },
  { value: 'squid', labelKey: 'adminProducts.labels.squid' },
  { value: 'combo', labelKey: 'adminProducts.labels.combo' },
];

const FRESHNESS_OPTIONS: { value: 'available' | 'limited' | 'sold-out'; labelKey: string }[] = [
  { value: 'available', labelKey: 'adminProducts.labels.available' },
  { value: 'limited', labelKey: 'adminProducts.labels.limited' },
  { value: 'sold-out', labelKey: 'adminProducts.labels.soldOut' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ORDERING_MODES: { value: string; labelKey: string }[] = [
  { value: 'fixed_quantity', labelKey: 'adminProducts.form.fixedQuantity' },
  { value: 'weight_only', labelKey: 'adminProducts.form.weightOnly' },
  { value: 'whole_or_weight', labelKey: 'adminProducts.form.wholeOrWeight' },
  { value: 'combo', labelKey: 'adminProducts.form.combo' },
];

type FormData = {
  name: string;
  name_ms: string;
  category: Category;
  price: string;
  unit: string;
  price_note: string;
  weight: string;
  quantity: string;
  description: string;
  long_description: string;
  image: string;
  images: string[];
  freshness: 'available' | 'limited' | 'sold-out';
  preparation_options: PreparationOption[];
  vendor_id: string;
  vendor_name: string;
  tags: string;
  is_popular: boolean;
  ordering_mode: string;
};

const EMPTY_FORM: FormData = {
  name: '',
  name_ms: '',
  category: 'fish',
  price: '',
  unit: 'per kg',
  price_note: '',
  weight: '',
  quantity: '0',
  description: '',
  long_description: '',
  image: '',
  images: [],
  freshness: 'available',
  preparation_options: getPrepOptionsByCategory('fish'),
  vendor_id: '',
  vendor_name: '',
  tags: '',
  is_popular: false,
  ordering_mode: 'weight_only',
};

export default function AdminProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      try {
        const product = await fetchProductById(id);
        if (!product) {
          navigate('/admin/products', { replace: true });
          return;
        }
        setForm({
          name: product.name,
          name_ms: product.nameMs,
          category: product.category,
          price: String(product.price),
          unit: product.unit,
          price_note: product.priceNote ?? '',
          weight: product.weight ?? '',
          quantity: '0',
          description: product.description,
          long_description: product.longDescription,
          image: product.image,
          images: product.images,
          freshness: product.freshness,
          preparation_options: getPrepOptionsByCategory(product.category),
          vendor_id: product.vendorId,
          vendor_name: '',
          tags: product.tags.join(', '),
          is_popular: product.isPopular ?? false,
          ordering_mode: product.orderingMode,
        });
      } catch {
        navigate('/admin/products', { replace: true });
      } finally {
        setLoadingProduct(false);
      }
    })();
  }, [id, isEdit, navigate]);

  // Recompute preparation options whenever category changes
  useEffect(() => {
    setForm((prev) => ({ ...prev, preparation_options: getPrepOptionsByCategory(prev.category) }));
  }, [form.category]);

  if (authLoading || loadingProduct) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  const set = (key: keyof FormData, value: FormData[keyof FormData]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('idle');
    setErrorMsg('');
    setSubmitting(true);

    const payload: ProductPayload = {
      id: isEdit ? id! : slugify(form.name),
      name: form.name.trim(),
      name_ms: form.name_ms.trim(),
      category: form.category,
      price: parseFloat(form.price),
      unit: form.unit.trim(),
      price_note: form.price_note.trim() || null,
      weight: form.weight.trim() || null,
      quantity: parseInt(form.quantity) || 0,
      description: form.description.trim(),
      long_description: form.long_description.trim(),
      image: form.images[0] || '',
      images: form.images,
      freshness: form.freshness,
      preparation_options: getPrepOptionsByCategory(form.category),
      vendor_id: form.vendor_id.trim(),
      vendor_name: form.vendor_name.trim(),
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      is_popular: form.is_popular,
      ordering_mode: form.ordering_mode,
    };

    try {
      if (isEdit) {
        const { id: _id, ...rest } = payload;
        await updateProduct(id!, rest);
      } else {
        await createProduct(payload);
      }
      setStatus('success');
      setTimeout(() => navigate('/admin/products'), 1200);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : t("adminProducts.messages.operationFailed"));
      setSubmitting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/admin/products')}
          className="p-2 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-display font-bold text-forest-900 text-2xl">
          {isEdit ? t("adminProducts.form.editTitle") : t("adminProducts.form.addTitle")}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">{t("adminProducts.form.basicInfo")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.nameEn")}</label>
              <input id="name" type="text" required value={form.name} onChange={(e) => set('name', e.target.value)} className="input-field" placeholder={t("adminProducts.form.nameEnPlaceholder")} />
            </div>
            <div>
              <label htmlFor="name_ms" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.nameMs")}</label>
              <input id="name_ms" type="text" required value={form.name_ms} onChange={(e) => set('name_ms', e.target.value)} className="input-field" placeholder={t("adminProducts.form.nameMsPlaceholder")} />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.category")}</label>
              <select id="category" value={form.category} onChange={(e) => set('category', e.target.value as Category)} className="input-field">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="freshness" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.freshness")}</label>
              <select id="freshness" value={form.freshness} onChange={(e) => set('freshness', e.target.value)} className="input-field">
                {FRESHNESS_OPTIONS.map((f) => <option key={f.value} value={f.value}>{t(f.labelKey)}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">{t("adminProducts.form.pricing")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.price")}</label>
              <input id="price" type="number" step="0.01" min="0" required value={form.price} onChange={(e) => set('price', e.target.value)} className="input-field" placeholder={t("adminProducts.form.pricePlaceholder")} />
            </div>
            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.unit")}</label>
              <input id="unit" type="text" required value={form.unit} onChange={(e) => set('unit', e.target.value)} className="input-field" placeholder={t("adminProducts.form.unitPlaceholder")} />
            </div>
            <div>
              <label htmlFor="price_note" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.priceNote")}</label>
              <input id="price_note" type="text" value={form.price_note} onChange={(e) => set('price_note', e.target.value)} className="input-field" placeholder={t("adminProducts.form.priceNotePlaceholder")} />
            </div>
            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.weight")}</label>
              <input id="weight" type="text" value={form.weight} onChange={(e) => set('weight', e.target.value)} className="input-field" placeholder={t("adminProducts.form.weightPlaceholder")} />
            </div>
          </div>
        </section>

        {/* Ordering Mode */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-1">{t("adminProducts.form.orderingMode")}</h2>
          <p className="text-xs text-gray-400 mb-4">
            {t("adminProducts.form.orderingModeHelper")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <select id="ordering_mode" value={form.ordering_mode} onChange={(e) => set('ordering_mode', e.target.value)} className="input-field">
                {ORDERING_MODES.map((m) => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Descriptions */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">{t("adminProducts.form.descriptions")}</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.shortDesc")}</label>
              <input id="description" type="text" required value={form.description} onChange={(e) => set('description', e.target.value)} className="input-field" placeholder={t("adminProducts.form.shortDescPlaceholder")} />
            </div>
            <div>
              <label htmlFor="long_description" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.longDesc")}</label>
              <textarea id="long_description" required rows={4} value={form.long_description} onChange={(e) => set('long_description', e.target.value)} className="input-field resize-y" placeholder={t("adminProducts.form.longDescPlaceholder")} />
            </div>
          </div>
        </section>

        {/* Product Images */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">{t("adminProducts.form.images")}</h2>
          <MultiImageUploader
            category={form.category}
            images={form.images}
            onChange={(imgs) => setForm((prev) => ({ ...prev, images: imgs }))}
          />
        </section>

        {/* Preparation options — auto-determined by category */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-1">{t("adminProducts.form.preparation")}</h2>
          <p className="text-xs text-gray-400 mb-4">
            {t("adminProducts.form.preparationHelper")}
          </p>
          {form.preparation_options.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {form.preparation_options.map((opt) => (
                <span
                  key={opt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-forest-700 text-white border border-forest-700"
                >
                  {getPrepLabel(opt)}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 bg-cream-50 border border-cream-200 rounded-xl text-sm text-gray-500">
              <Info size={16} className="flex-shrink-0 mt-0.5 text-gray-400" />
              <p>{t("adminProducts.form.noPrepOptions")}</p>
            </div>
          )}
        </section>

        {/* Vendor & metadata */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">{t("adminProducts.form.vendor")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="vendor_id" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.vendorId")}</label>
              <input id="vendor_id" type="text" required value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)} className="input-field" placeholder={t("adminProducts.form.vendorIdPlaceholder")} />
            </div>
            <div>
              <label htmlFor="vendor_name" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.vendorName")}</label>
              <input id="vendor_name" type="text" required value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} className="input-field" placeholder={t("adminProducts.form.vendorNamePlaceholder")} />
            </div>
            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1.5">{t("adminProducts.form.tags")}</label>
              <input id="tags" type="text" value={form.tags} onChange={(e) => set('tags', e.target.value)} className="input-field" placeholder={t("adminProducts.form.tagsPlaceholder")} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.is_popular} onChange={(e) => set('is_popular', e.target.checked)} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-forest-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest-600"></div>
              </label>
              <span className="text-sm font-medium text-gray-700">{t("adminProducts.form.popular")}</span>
            </div>
          </div>
        </section>

        {/* Status messages */}
        {status === 'success' && (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
            <CheckCircle2 size={18} /> {isEdit ? t("adminProducts.messages.updated") : t("adminProducts.messages.added")}
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
            <AlertCircle size={18} /> {errorMsg}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
          >
            {t("adminProducts.buttons.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {submitting ? t("adminProducts.messages.saving") : isEdit ? t("adminProducts.buttons.update") : t("adminProducts.buttons.create")}
          </button>
        </div>
      </form>
    </main>
  );
}
