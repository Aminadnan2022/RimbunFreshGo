import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProductImage } from '../lib/image';
import { fetchComboById, createCombo, updateCombo, setComboLifecycle, toggleComboFeatured, formatComboLifecycleError } from '../data/combos';
import { fetchProducts } from '../data/products';
import { getSellingMode, getWeightOptions, computeComboItemSubtotal, formatWeight } from '../lib/sellingOptions';
import MultiImageUploader from '../components/ui/MultiImageUploader';
import QuantityStepper from '../components/ui/QuantityStepper';
import { formatCurrency } from '../lib/currency';
import type { ComboLifecycleStatus, ComboPayload, Product } from '../types';

type FormItem = {
  product_id: string;
  quantity_value: number;
  selling_unit: string;
  sort_order: number;
  custom_label: string;
  unit: string;
  mode?: 'whole' | 'weight';
  choice_group_key?: string;
  choice_group_label?: string;
  price_adjustment?: number;
};

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function AdminComboFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [autoPrice, setAutoPrice] = useState(true);

  const [form, setForm] = useState({
    id: '',
    name: '',
    name_ms: '',
    slug: '',
    description: '',
    badge: 'Best Value',
    category_label: '',
    tagline: '',
    price: 0,
    original_value: 0,
    discount_percent: 40,
    image: '',
    images: [] as string[],
    servings: 4,
    highlights: '',
    featured: false,
    lifecycle_status: 'draft' as ComboLifecycleStatus,
  });

  const [items, setItems] = useState<FormItem[]>([]);

  useEffect(() => {
    fetchProducts().then((data) => setProducts(data)).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchComboById(id).then((result) => {
      if (!result) return;
      const c = result.combo;
      const images = c.images && c.images.length > 0 ? c.images : (c.image ? [c.image] : []);
      setForm({
        id: c.id,
        name: c.name,
        name_ms: c.name_ms,
        slug: c.slug,
        description: c.description,
        badge: c.badge,
        category_label: c.category_label,
        tagline: c.tagline,
        price: Number(c.price),
        original_value: Number(c.original_value),
        discount_percent: Number(c.discount_percent) || (Number(c.original_value) > 0 ? Math.round((1 - Number(c.price) / Number(c.original_value)) * 100) : 40),
        image: images[0] ?? '',
        images,
        servings: c.servings,
        highlights: (c.highlights ?? []).join('\n'),
        featured: c.featured,
        lifecycle_status: c.lifecycle_status as ComboLifecycleStatus,
      });
      setItems(result.items.map((ci) => ({
        product_id: ci.product_id,
        quantity_value: ci.quantity_value,
        selling_unit: ci.selling_unit,
        sort_order: ci.sort_order,
        custom_label: ci.custom_label ?? '',
        unit: ci.unit ?? '',
        mode: ci.selling_unit === 'kg' ? 'weight' : 'whole',
        choice_group_key: ci.choice_group_key,
        choice_group_label: ci.choice_group_label,
        price_adjustment: ci.price_adjustment,
      })));
    }).finally(() => setLoading(false));
  }, [id]);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
  );

  function addItem(product: Product) {
    const mode = getSellingMode(product);
    const isWeight = mode === 'weight';
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        quantity_value: isWeight ? 0.5 : 1,
        selling_unit: isWeight ? 'kg' : 'piece',
        sort_order: prev.length,
        custom_label: '',
        unit: product.unit,
        mode: mode === 'whole_fish_by_weight' ? 'whole' : undefined,
      },
    ]);
    setSearch('');
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i })));
  }

  function updateItem(index: number, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function getSelectedProductIds() {
    return new Set(items.map((i) => i.product_id));
  }

  const selectedProducts = items
    .map((item) => ({
      ...item,
      product: products.find((p) => p.id === item.product_id),
    }))
    .filter((s) => s.product);

  const choiceGroupSummary = [...selectedProducts.reduce((groups, item) => {
    if (!item.choice_group_key) return groups;
    const label = item.choice_group_label?.trim() || 'Unlabelled choice';
    groups.set(label, (groups.get(label) ?? 0) + 1);
    return groups;
  }, new Map<string, number>())];

  function resolveSellingUnit(item: typeof selectedProducts[number]): string {
    const product = item.product!;
    const mode = getSellingMode(product);
    if (mode === 'weight') return 'kg';
    if (mode === 'whole_fish_by_weight') return item.mode === 'weight' ? 'kg' : 'piece';
    return item.selling_unit || product.selling_unit || 'piece';
  }

  const fixedValue = selectedProducts.filter((item) => !item.choice_group_key).reduce((sum, s) => {
    const p = s.product!;
    return sum + computeComboItemSubtotal(p, s.quantity_value, resolveSellingUnit(s));
  }, 0);
  const choiceValues = new Map<string, number[]>();
  selectedProducts.filter((item) => item.choice_group_key).forEach((s) => {
    const key = slugify(s.choice_group_label ?? '');
    const value = computeComboItemSubtotal(s.product!, s.quantity_value, resolveSellingUnit(s));
    choiceValues.set(key, [...(choiceValues.get(key) ?? []), value]);
  });
  const totalManualValue = fixedValue + [...choiceValues.values()].reduce((sum, values) => sum + Math.max(...values), 0);

  // ── Pricing ────────────────────────────────────────────────────────────
  const clampDiscount = (v: number) => Math.min(90, Math.max(0, v));
  const round2 = (v: number) => Math.round(v * 100) / 100;

  // Auto mode: combo price = total × (100 − discount%) / 100, original = total
  const autoComboPrice = round2((totalManualValue * (100 - clampDiscount(form.discount_percent))) / 100);

  // Manual mode: discount is derived from combo price / original price
  const manualDiscount = form.original_value > 0
    ? clampDiscount(round2((1 - form.price / form.original_value) * 100))
    : 0;

  const effectiveDiscount = autoPrice ? clampDiscount(form.discount_percent) : manualDiscount;
  const comboPrice = autoPrice ? autoComboPrice : form.price;
  const originalPrice = autoPrice ? totalManualValue : form.original_value;
  const savings = Math.max(0, originalPrice - comboPrice);

  function handleDiscountChange(value: number) {
    setForm((f) => ({ ...f, discount_percent: clampDiscount(value) }));
    if (!autoPrice) {
      // In manual mode, editing discount updates the combo price (keep original).
      const orig = form.original_value > 0 ? form.original_value : totalManualValue;
      setForm((f) => ({ ...f, price: round2((orig * (100 - clampDiscount(value))) / 100) }));
    }
  }

  function handleManualPriceChange(value: string) {
    const v = Number(value);
    setForm((f) => ({ ...f, price: v }));
    if (form.original_value > 0 && v > 0) {
      const d = clampDiscount(round2((1 - v / form.original_value) * 100));
      setForm((f) => ({ ...f, discount_percent: d }));
    }
  }

  function handleManualOriginalChange(value: string) {
    const v = Number(value);
    setForm((f) => ({ ...f, original_value: v }));
    if (form.price > 0 && v > 0) {
      const d = clampDiscount(round2((1 - form.price / v) * 100));
      setForm((f) => ({ ...f, discount_percent: d }));
    }
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('Name is required.'); return; }
    const groups = new Map<string, FormItem[]>();
    items.forEach((item) => {
      if (!item.choice_group_key) return;
      const groupKey = slugify(item.choice_group_label ?? '');
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
    });
    for (const options of groups.values()) {
      if (options.length < 2 || options.some((option) => !option.product_id || !option.choice_group_label?.trim())) {
        alert('Each Customer Choice needs a label and at least 2 valid options.');
        return;
      }
    }

    const comboId = form.id || slugify(form.name) + '-' + Date.now();
    const slug = form.slug || slugify(form.name);

    const highlights = form.highlights
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean);

    const payload: ComboPayload = {
      id: comboId,
      name: form.name,
      name_ms: form.name_ms || undefined,
      slug,
      description: form.description,
      badge: form.badge,
      category_label: form.category_label,
      tagline: form.tagline,
      price: autoPrice ? comboPrice : form.price,
      original_value: autoPrice ? originalPrice : form.original_value,
      discount_percent: autoPrice ? clampDiscount(form.discount_percent) : manualDiscount,
      image: form.image,
      images: form.images.length > 0 ? form.images : undefined,
      servings: form.servings,
      highlights,
      featured: form.featured,
      lifecycle_status: form.lifecycle_status,
      items: items.map((item, i) => ({
        product_id: item.product_id,
        quantity_value: item.quantity_value,
        selling_unit: item.selling_unit,
        sort_order: i,
        custom_label: item.custom_label || undefined,
        unit: item.unit || undefined,
        choice_group_key: item.choice_group_key ? `choice-${slugify(item.choice_group_label ?? '')}` : undefined,
        choice_group_label: item.choice_group_label || undefined,
        price_adjustment: item.price_adjustment ?? 0,
      })),
    };

    setSaving(true);
    try {
      let comboId: string;
      if (isEdit && id) {
        await updateCombo(id, payload);
        await setComboLifecycle(id, form.lifecycle_status);
        comboId = id;
      } else {
        const created = await createCombo(payload);
        await setComboLifecycle(created.id, form.lifecycle_status);
        comboId = created.id;
      }
      if (form.lifecycle_status === 'active') {
        await toggleComboFeatured(comboId, form.featured);
      }
      navigate('/admin?tab=combos');
    } catch (err) {
      console.error('Save failed:', err);
      alert(formatComboLifecycleError(err, form.lifecycle_status === 'active' ? 'save and activate combo' : 'save combo'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-6 text-gray-500">Loading combo...</p>;
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Combo' : 'Create New Combo'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin?tab=combos')}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Combo' : 'Create Combo'}
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (EN) *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: isEdit ? f.slug : slugify(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name (MS)</label>
            <input
              type="text"
              value={form.name_ms}
              onChange={(e) => setForm((f) => ({ ...f, name_ms: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
            <input
              type="number"
              value={form.servings}
              onChange={(e) => setForm((f) => ({ ...f, servings: Number(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Badge</label>
            <input
              type="text"
              value={form.badge}
              onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category Label</label>
            <input
              type="text"
              value={form.category_label}
              onChange={(e) => setForm((f) => ({ ...f, category_label: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
          <input
            type="text"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Highlights (one per line)
          </label>
          <textarea
            value={form.highlights}
            onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            rows={3}
            placeholder="Save RM36 vs. buying separately&#10;Feeds a family of 4&#10;All items prepared fresh"
          />
        </div>
      </section>

      {/* Images */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Images</h2>
        <MultiImageUploader
          category="combos"
          images={form.images}
          onChange={(imgs) => setForm((f) => ({ ...f, images: imgs, image: imgs[0] ?? '' }))}
        />
      </section>

      {/* Pricing */}
      <section className="bg-white border rounded-lg p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Pricing</h2>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoPrice}
            onChange={(e) => {
              const next = e.target.checked;
              setAutoPrice(next);
              if (!next) {
                // Seed manual fields from the current auto-calculated values.
                setForm((f) => ({
                  ...f,
                  price: autoComboPrice,
                  original_value: totalManualValue,
                  discount_percent: clampDiscount(f.discount_percent),
                }));
              }
            }}
          />
          Auto calculate from item value
        </label>

        {autoPrice ? (
          <>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Item Value</span>
                <span className="font-semibold text-gray-900">RM {formatCurrency(totalManualValue)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  Discount (%)
                  <input
                    type="number"
                    min={0}
                    max={90}
                    step="0.5"
                    value={form.discount_percent}
                    onChange={(e) => handleDiscountChange(Number(e.target.value))}
                    className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right"
                  />
                </label>
                <span className="text-xs text-gray-400">0–90%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Calculated Combo Price</span>
                <span className="font-semibold text-emerald-700">RM {formatCurrency(comboPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Original Price</span>
                <span className="font-semibold text-gray-900">RM {formatCurrency(originalPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Savings</span>
                <span className="font-semibold text-jade-600">RM {formatCurrency(savings)} ({effectiveDiscount.toFixed(0)}%)</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Combo Price (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => handleManualPriceChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Original Price (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.original_value}
                  onChange={(e) => handleManualOriginalChange(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Discount:</span>
              <span className="font-semibold text-jade-600">{effectiveDiscount.toFixed(1)}%</span>
              <span className="text-xs text-gray-400">(auto-calculated from combo price &amp; original price)</span>
            </div>
          </>
        )}

        {/* Live summary */}
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">Summary</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Item Value</span>
            <span className="font-medium text-gray-900">RM {formatCurrency(totalManualValue)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Discount</span>
            <span className="font-medium text-gray-900">{effectiveDiscount.toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Customer Pays</span>
            <span className="font-semibold text-emerald-700">RM {formatCurrency(comboPrice)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Customer Saves</span>
            <span className="font-semibold text-jade-600">RM {formatCurrency(savings)}</span>
          </div>
        </div>
      </section>

      {/* Combo Items */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Included Items</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add products, then set each one as a fixed item or an option the customer chooses.
          </p>
        </div>

        {choiceGroupSummary.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">Customer Choice groups</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {choiceGroupSummary.map(([label, optionCount]) => (
                <span key={label} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                  {label} · Choose 1 of {optionCount}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Product Search */}
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products to add..."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          {search && (
            <div className="mt-1 border rounded-lg max-h-48 overflow-y-auto bg-white shadow">
              {filteredProducts
                .filter((p) => !getSelectedProductIds().has(p.id))
                .slice(0, 10)
                .map((p) => {
                  const su = p.selling_unit ?? 'piece';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addItem(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                      <img src={getProductImage(p.image)} alt="" className="w-8 h-8 object-cover rounded" />
                      <span>{p.name}</span>
                      <span className="text-gray-400 text-xs">({su})</span>
                      <span className="ml-auto text-gray-500">RM {formatCurrency(p.price)}/{su === 'kg' ? 'kg' : p.unit}</span>
                    </button>
                  );
                })}
              {filteredProducts.filter((p) => !getSelectedProductIds().has(p.id)).length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">No matching products</p>
              )}
            </div>
          )}
        </div>

        {/* Selected Items */}
        {selectedProducts.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No items added yet. Search and add products above.</p>
        ) : (
          <div className="space-y-3">
            {selectedProducts.map((item, index) => {
              const product = item.product!;
              const mode = getSellingMode(product);
              const isWeightBased = mode === 'weight';
              const isWholeOrWeight = mode === 'whole_fish_by_weight';
              const currentMode = isWholeOrWeight ? (item.mode ?? 'whole') : (isWeightBased ? 'weight' : 'whole');
              const su = currentMode === 'weight' ? 'kg' : 'piece';
              const weightGrams = Math.round((item.quantity_value || 0) * 1000);
              const subtotal = computeComboItemSubtotal(product, item.quantity_value, su);
              const weightOptions = getWeightOptions();

              console.log('combo-item-product', {
                id: product.id,
                name: product.name,
                category: product.category,
                orderingMode: product.orderingMode,
                selling_unit: product.selling_unit,
                raw: (product as unknown as Record<string, unknown>).ordering_mode,
                getSellingMode: mode,
              });

              function setMode(next: 'whole' | 'weight') {
                if (next === 'weight') {
                  updateItem(index, {
                    mode: 'weight',
                    selling_unit: 'kg',
                    quantity_value: currentMode === 'whole' ? 0.5 : item.quantity_value,
                  });
                } else {
                  updateItem(index, {
                    mode: 'whole',
                    selling_unit: 'piece',
                    quantity_value: currentMode === 'weight' ? 1 : item.quantity_value,
                  });
                }
              }

              return (
                <div key={index} className="p-4 bg-white border border-cream-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <img
                      src={getProductImage(product.image)}
                      alt=""
                      className="w-14 h-14 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        RM {formatCurrency(product.price)}/{su === 'kg' ? 'kg' : product.unit} · Sold{' '}
                        {isWholeOrWeight ? (currentMode === 'weight' ? 'by weight' : 'per piece') : isWeightBased ? 'by weight' : 'per piece'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      aria-label="Remove item"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Item Type</p>
                    <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`Item type for ${product.name}`}>
                      {(['fixed', 'choice'] as const).map((type) => {
                        const selected = type === 'choice' ? Boolean(item.choice_group_key) : !item.choice_group_key;
                        return (
                          <button
                            key={type}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => updateItem(index, type === 'choice'
                              ? { choice_group_key: item.choice_group_key || `choice-${Date.now()}`, choice_group_label: item.choice_group_label || '' }
                              : { choice_group_key: undefined, choice_group_label: undefined, price_adjustment: 0 })}
                            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${selected
                              ? 'border-forest-600 bg-forest-700 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-forest-300 hover:bg-forest-50'}`}
                          >
                            {type === 'fixed' ? 'Fixed Item' : 'Customer Choice'}
                          </button>
                        );
                      })}
                    </div>
                    {item.choice_group_key && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Choice Label</label>
                        <input
                          value={item.choice_group_label ?? ''}
                          onChange={(e) => updateItem(index, { choice_group_label: e.target.value })}
                          placeholder="e.g. Pilih ikan anda"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-100"
                        />
                        <p className="mt-1.5 text-xs text-gray-500">
                          Give 2 or more items the same label to form one <strong>Choose 1</strong> group for customers.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Whole / Weight toggle for whole_fish_by_weight products */}
                    {isWholeOrWeight && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Mode</span>
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => setMode('whole')}
                            className={`px-2.5 py-1 rounded-md transition-colors ${
                              currentMode === 'whole' ? 'bg-white text-forest-800 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            Whole
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode('weight')}
                            className={`px-2.5 py-1 rounded-md transition-colors ${
                              currentMode === 'weight' ? 'bg-white text-forest-800 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            By Weight
                          </button>
                        </div>
                      </div>
                    )}

                    {currentMode === 'weight' ? (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Estimated Weight</label>
                        <select
                          value={weightGrams}
                          onChange={(e) => updateItem(index, { quantity_value: Number(e.target.value) / 1000, selling_unit: 'kg' })}
                          className="border rounded px-2 py-1.5 text-xs w-full"
                        >
                          {weightOptions.includes(weightGrams) || weightGrams <= 0
                            ? null
                            : (
                              <option value={weightGrams}>{formatWeight(weightGrams)}</option>
                            )}
                          {weightOptions.map((g) => (
                            <option key={g} value={g}>{formatWeight(g)}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Quantity</label>
                        <div className="flex items-center gap-2">
                          <QuantityStepper
                            size="sm"
                            min={1}
                            max={99}
                            value={Math.max(1, Math.round(item.quantity_value))}
                            onChange={(v) => updateItem(index, { quantity_value: v, selling_unit: 'piece' })}
                          />
                        </div>
                      </div>
                    )}

                    {/* Subtotal */}
                    <div className="flex items-end justify-between">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Subtotal</label>
                        <p className="text-sm font-semibold text-forest-800">RM {formatCurrency(subtotal)}</p>
                      </div>
                      <p className="text-xs text-gray-400">
                        {currentMode === 'weight' ? `${formatWeight(weightGrams)} × RM ${formatCurrency(product.price)}/kg` : `${Math.max(1, Math.round(item.quantity_value))} × RM ${formatCurrency(product.price)}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Status */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Status</h2>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Featured (show on homepage)
          </label>
          <label className="flex items-center gap-2 text-sm">
            Lifecycle
            <select
              value={form.lifecycle_status}
              onChange={(e) => setForm((f) => ({ ...f, lifecycle_status: e.target.value as ComboLifecycleStatus }))}
              className="border rounded px-2 py-1.5 text-sm"
            >
              <option value="draft">Draft (hidden from customers)</option>
              <option value="active">Active (available to customers)</option>
              <option value="inactive">Inactive (kept as history)</option>
            </select>
          </label>
        </div>
      </section>
    </form>
  );
}
