import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchProductById, createProduct, updateProduct } from '../data/products';
import type { ProductPayload } from '../data/products';
import type { Category, PreparationOption } from '../types';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'chicken', label: 'Chicken' },
  { value: 'fish', label: 'Fish' },
  { value: 'prawns', label: 'Prawns' },
  { value: 'squid', label: 'Squid' },
  { value: 'combo', label: 'Combo' },
];

const FRESHNESS_OPTIONS: { value: 'available' | 'limited' | 'sold-out'; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'limited', label: 'Limited' },
  { value: 'sold-out', label: 'Sold Out' },
];

const PREP_OPTIONS: { value: PreparationOption; label: string }[] = [
  { value: 'whole', label: 'Whole' },
  { value: 'cleaned', label: 'Cleaned' },
  { value: 'descaled', label: 'Descaled & Gutted' },
  { value: 'gutted', label: 'Gutted & Cleaned' },
  { value: 'cut', label: 'Cut into pieces' },
  { value: 'cut4', label: 'Cut into 4' },
  { value: 'cut12', label: 'Cut into 12' },
  { value: 'cut16', label: 'Cut into 16' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
  images: string;
  freshness: 'available' | 'limited' | 'sold-out';
  preparation_options: PreparationOption[];
  vendor_id: string;
  vendor_name: string;
  tags: string;
  is_popular: boolean;
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
  images: '',
  freshness: 'available',
  preparation_options: ['whole', 'cleaned'],
  vendor_id: '',
  vendor_name: '',
  tags: '',
  is_popular: false,
};

export default function AdminProductFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();

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
          images: product.images.join('\n'),
          freshness: product.freshness,
          preparation_options: product.preparationOptions,
          vendor_id: product.vendorId,
          vendor_name: '',
          tags: product.tags.join(', '),
          is_popular: product.isPopular ?? false,
        });
      } catch {
        navigate('/admin/products', { replace: true });
      } finally {
        setLoadingProduct(false);
      }
    })();
  }, [id, isEdit, navigate]);

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

  const togglePrep = (opt: PreparationOption) => {
    setForm((prev) => ({
      ...prev,
      preparation_options: prev.preparation_options.includes(opt)
        ? prev.preparation_options.filter((o) => o !== opt)
        : [...prev.preparation_options, opt],
    }));
  };

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
      image: form.image.trim(),
      images: form.images.split('\n').map((s) => s.trim()).filter(Boolean),
      freshness: form.freshness,
      preparation_options: form.preparation_options,
      vendor_id: form.vendor_id.trim(),
      vendor_name: form.vendor_name.trim(),
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      is_popular: form.is_popular,
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
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed');
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
          {isEdit ? 'Edit Product' : 'Add New Product'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name (English) *</label>
              <input id="name" type="text" required value={form.name} onChange={(e) => set('name', e.target.value)} className="input-field" placeholder="e.g. Siakap" />
            </div>
            <div>
              <label htmlFor="name_ms" className="block text-sm font-medium text-gray-700 mb-1.5">Name (Malay) *</label>
              <input id="name_ms" type="text" required value={form.name_ms} onChange={(e) => set('name_ms', e.target.value)} className="input-field" placeholder="e.g. Ikan Siakap" />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1.5">Category *</label>
              <select id="category" value={form.category} onChange={(e) => set('category', e.target.value as Category)} className="input-field">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="freshness" className="block text-sm font-medium text-gray-700 mb-1.5">Freshness Status</label>
              <select id="freshness" value={form.freshness} onChange={(e) => set('freshness', e.target.value)} className="input-field">
                {FRESHNESS_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Pricing & Units</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1.5">Price (RM) *</label>
              <input id="price" type="number" step="0.01" min="0" required value={form.price} onChange={(e) => set('price', e.target.value)} className="input-field" placeholder="e.g. 19.00" />
            </div>
            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-gray-700 mb-1.5">Unit *</label>
              <input id="unit" type="text" required value={form.unit} onChange={(e) => set('unit', e.target.value)} className="input-field" placeholder="e.g. per kg" />
            </div>
            <div>
              <label htmlFor="price_note" className="block text-sm font-medium text-gray-700 mb-1.5">Price Note</label>
              <input id="price_note" type="text" value={form.price_note} onChange={(e) => set('price_note', e.target.value)} className="input-field" placeholder="e.g. RM19/kg" />
            </div>
            <div>
              <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1.5">Weight</label>
              <input id="weight" type="text" value={form.weight} onChange={(e) => set('weight', e.target.value)} className="input-field" placeholder="e.g. 1.5-1.7 kg" />
            </div>
          </div>
        </section>

        {/* Descriptions */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Descriptions</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Short Description *</label>
              <input id="description" type="text" required value={form.description} onChange={(e) => set('description', e.target.value)} className="input-field" placeholder="Short card description" />
            </div>
            <div>
              <label htmlFor="long_description" className="block text-sm font-medium text-gray-700 mb-1.5">Long Description *</label>
              <textarea id="long_description" required rows={4} value={form.long_description} onChange={(e) => set('long_description', e.target.value)} className="input-field resize-y" placeholder="Full detail page description" />
            </div>
          </div>
        </section>

        {/* Images */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Images</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1.5">Primary Image URL *</label>
              <input id="image" type="url" required value={form.image} onChange={(e) => set('image', e.target.value)} className="input-field" placeholder="https://..." />
            </div>
            <div>
              <label htmlFor="images" className="block text-sm font-medium text-gray-700 mb-1.5">Gallery URLs (one per line)</label>
              <textarea id="images" rows={3} value={form.images} onChange={(e) => set('images', e.target.value)} className="input-field resize-y" placeholder={"https://url1.jpg\nhttps://url2.jpg"} />
            </div>
            {form.image && (
              <div className="flex gap-2">
                <img src={form.image} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-cream-200" />
              </div>
            )}
          </div>
        </section>

        {/* Preparation options */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Preparation Options</h2>
          <div className="flex flex-wrap gap-2">
            {PREP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => togglePrep(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  form.preparation_options.includes(opt.value)
                    ? 'bg-forest-700 text-white border-forest-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* Vendor & metadata */}
        <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
          <h2 className="font-semibold text-forest-900 text-base mb-4">Vendor & Metadata</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="vendor_id" className="block text-sm font-medium text-gray-700 mb-1.5">Vendor ID *</label>
              <input id="vendor_id" type="text" required value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)} className="input-field" placeholder="e.g. vendor-aminah" />
            </div>
            <div>
              <label htmlFor="vendor_name" className="block text-sm font-medium text-gray-700 mb-1.5">Vendor Name *</label>
              <input id="vendor_name" type="text" required value={form.vendor_name} onChange={(e) => set('vendor_name', e.target.value)} className="input-field" placeholder="e.g. Aminah Seafood Trading" />
            </div>
            <div>
              <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1.5">Tags (comma-separated)</label>
              <input id="tags" type="text" value={form.tags} onChange={(e) => set('tags', e.target.value)} className="input-field" placeholder="e.g. premium, fresh, omega-3" />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={form.is_popular} onChange={(e) => set('is_popular', e.target.checked)} className="sr-only peer" />
                <div className="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-forest-300 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-forest-600"></div>
              </label>
              <span className="text-sm font-medium text-gray-700">Mark as Popular</span>
            </div>
          </div>
        </section>

        {/* Status messages */}
        {status === 'success' && (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
            <CheckCircle2 size={18} /> Product {isEdit ? 'updated' : 'created'} successfully! Redirecting...
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
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save size={16} />
            {submitting ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
          </button>
        </div>
      </form>
    </main>
  );
}
