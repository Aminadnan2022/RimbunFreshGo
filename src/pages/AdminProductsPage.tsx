import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { Plus, Pencil, X, AlertTriangle, Package, Loader2, Settings, ShoppingBag, Truck, CheckCircle2, AlertCircle, PenLine, ShieldAlert, Clock, Calendar, Users, ClipboardList, ChevronLeft, CreditCard, Phone, Copy, Save, Gift, Sparkles, Navigation, FileText, Share2, LayoutDashboard, ListOrdered, Trash2, Boxes, BarChart3 } from 'lucide-react';
import { getPrepLabel } from '../lib/preparationOptions';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { moveProduct, duplicateProduct, toggleProductPinned, setProductsActive, setProductsPinned, deleteProducts } from '../data/products';
import SortableList from '../components/admin/SortableList';
import SortableCard from '../components/admin/sortable/SortableCard';
import RowMenu from '../components/admin/sortable/RowMenu';
import UndoToast from '../components/admin/sortable/UndoToast';
import SortToolbar from '../components/admin/sortable/SortToolbar';
import BulkActionBar from '../components/admin/sortable/BulkActionBar';
import { useSortableManager, type SortModeOption } from '../components/admin/sortable/useSortableManager';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { supabase } from '../lib/supabase';
import ProductImage from '../components/ui/ProductImage';
import { formatCurrency } from '../lib/currency';
import AdminComboListPage from './AdminComboListPage';
import WebsiteVisibilityCard from '../components/admin/WebsiteVisibilityCard';
import FooterSettingsCard from '../components/admin/FooterSettingsCard';
import GeneralSettingsCard from '../components/admin/settings/GeneralSettingsCard';
import BrandingSettingsCard from '../components/admin/settings/BrandingSettingsCard';
import NavigationSettingsCard from '../components/admin/settings/NavigationSettingsCard';
import ContactSettingsCard from '../components/admin/settings/ContactSettingsCard';
import SocialMediaSettingsCard from '../components/admin/settings/SocialMediaSettingsCard';
import DisplaySortingSettingsCard from '../components/admin/settings/DisplaySortingSettingsCard';
import DeliveryCapacitySettingsCard from '../components/admin/settings/DeliveryCapacitySettingsCard';
import DeliveryManagementTab from '../components/admin/DeliveryManagementTab';
import DeliveryBatchesManager from '../components/admin/DeliveryBatchesManager';
import BrandLogo from '../components/branding/BrandLogo';
import type { PaymentStatus, ComboExpandedItem, Product } from '../types';

type Tab = 'products' | 'combos' | 'settings' | 'users' | 'orders' | 'delivery' | 'batches';

export default function AdminProductsPage() {
  const { t } = useLanguage();
  const { isAdmin, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const tabParam = searchParams.get('tab') as Tab | null;
  const pathTab: Tab = location.pathname.startsWith('/admin/combos') ? 'combos' : location.pathname.startsWith('/admin/products') ? 'products' : 'orders';
  const [activeTab, setActiveTab] = useState<Tab>(tabParam && ['products', 'combos', 'settings', 'users', 'orders', 'delivery', 'batches'].includes(tabParam) ? tabParam : pathTab);

  useEffect(() => {
    const valid: Tab[] = ['products', 'combos', 'settings', 'users', 'orders', 'delivery', 'batches'];
    if (tabParam && valid.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <BrandLogo size="w-10 h-10" iconSize={20} rounded="rounded-2xl" />
        <div className="flex-1">
          <h1 className="font-display font-bold text-forest-900 text-2xl">{t("adminDashboard.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("adminDashboard.subtitle")}</p>
        </div>
        <Link
          to="/admin/historical"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-forest-800 bg-cream-100 hover:bg-cream-200 transition-all"
        >
          <FileText size={16} />
          {t("historicalData.title")}
        </Link>
        <Link
          to="/admin/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-all"
        >
          <BarChart3 size={16} />
          {t("businessReports.title")}
        </Link>
      </div>

      <div className="flex gap-1 border-b border-cream-200 mb-6 overflow-x-auto">
        <button
          onClick={() => handleTabChange('orders')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ClipboardList size={16} />
          {t("adminOrders.tabs.orders")}
        </button>
        <button
          onClick={() => handleTabChange('products')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'products'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ShoppingBag size={16} />
          {t("adminDashboard.tabs.products")}
        </button>
        <button
          onClick={() => handleTabChange('combos')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'combos'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Gift size={16} />
          Combos
        </button>
        <button
          onClick={() => handleTabChange('users')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Users size={16} />
          {t("adminDashboard.tabs.users")}
        </button>
        <button
          onClick={() => handleTabChange('settings')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Settings size={16} />
          {t("adminDashboard.tabs.settings")}
        </button>
        <button
          onClick={() => handleTabChange('delivery')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'delivery'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Truck size={16} />
          {t("adminDashboard.tabs.delivery")}
        </button>
        <button
          onClick={() => handleTabChange('batches')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap ${
            activeTab === 'batches'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Boxes size={16} />
          {t("adminDashboard.tabs.batches")}
        </button>
      </div>

      {activeTab === 'products' ? <ProductsTab /> : activeTab === 'combos' ? <AdminComboListPage /> : activeTab === 'settings' ? <SettingsTab /> : activeTab === 'users' ? <UsersTab /> : activeTab === 'delivery' ? <DeliveryManagementTab /> : activeTab === 'batches' ? <DeliveryBatchesManager /> : <OrdersTab />}
    </main>
  );
}

const PRODUCT_SORT_MODES: SortModeOption<Product>[] = [
  { value: 'manual', labelKey: 'adminProducts.sort.manual' },
  { value: 'name', labelKey: 'adminProducts.sort.name', compare: (a, b) => a.name.localeCompare(b.name) },
  { value: 'price_low', labelKey: 'adminProducts.sort.price_low', compare: (a, b) => a.price - b.price },
  { value: 'price_high', labelKey: 'adminProducts.sort.price_high', compare: (a, b) => b.price - a.price },
  { value: 'newest', labelKey: 'adminProducts.sort.newest', compare: (a, b) => (b.displayOrder ?? 0) - (a.displayOrder ?? 0) },
];

const isProductActive = (p: Product) => p.freshness !== 'sold-out';

function ProductsTab() {
  const { t } = useLanguage();
  const { products, loading, error, refetch } = useProducts(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const manager = useSortableManager<Product>({
    items: products,
    sortModes: PRODUCT_SORT_MODES,
    getPinned: (p) => p.isPinned,
    applyPinned: (p, pinned) => ({ ...p, isPinned: pinned }),
    onMove: (id, toIndex) => moveProduct(id, toIndex),
    onTogglePin: (id, pinned) => toggleProductPinned(id, pinned),
    onBulkActive: (ids, active) => setProductsActive(ids, active),
    onBulkPinned: (ids, pinned) => setProductsPinned(ids, pinned),
    onBulkDelete: (ids) => deleteProducts(ids),
    onRefetch: refetch,
    reorderMessage: t('adminProducts.toast.reordered'),
    pinMessage: (pinned) => (pinned ? t('adminProducts.toast.pinned') : t('adminProducts.toast.unpinned')),
    bulkMessage: (label, count) => t('adminProducts.toast.bulkChanged', { count, label: t('adminProducts.actions.' + label) }),
    undoFailedMessage: t('adminProducts.toast.undoFailed'),
  });

  const {
    visible,
    totalCount,
    search,
    setSearch,
    sortMode,
    setSortMode,
    canReorder,
    savingOrder,
    busy,
    selected,
    allSelected,
    someSelected,
    toggleSelected,
    toggleSelectAll,
    clearSelection,
    handleDragEnd,
    moveUp,
    moveDown,
    togglePin,
    bulkSetActive,
    bulkSetPinned,
    bulkDelete,
    resetOrder,
    toast,
    dismissToast,
  } = manager;

  const handleDuplicate = async (product: Product) => {
    try {
      await duplicateProduct(product.id);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : t('adminProducts.messages.duplicateFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProducts([deleteTarget.id]);
      manager.removeLocally([deleteTarget.id]);
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : t('adminProducts.messages.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmReset = () => {
    if (window.confirm(t('adminProducts.sort.resetConfirm'))) resetOrder();
  };

  const bulkLabels = {
    selected: t('adminProducts.bulk.selected'),
    activate: t('adminProducts.bulk.activate'),
    deactivate: t('adminProducts.bulk.deactivate'),
    pin: t('adminProducts.bulk.pin'),
    unpin: t('adminProducts.bulk.unpin'),
    delete: t('adminProducts.bulk.delete'),
    clear: t('adminProducts.bulk.clear'),
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-500">
          {savingOrder && <span className="text-forest-600 font-medium inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> {t('adminProducts.messages.savingOrder')}</span>}
          {!savingOrder && selected.size > 0
            ? t('adminProducts.bulk.selected', { count: selected.size })
            : t('adminProducts.products.count', { count: visible.length })}
        </p>
        <div className="flex items-center gap-2 self-start">
          <button onClick={confirmReset} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700 transition-all">
            {t('adminProducts.sort.reset')}
          </button>
          <Link to="/admin/products/new" className="btn-primary inline-flex items-center gap-2">
            <Plus size={18} />
            {t('adminProducts.buttons.add')}
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <SortToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('adminProducts.search.placeholder')}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          sortModes={PRODUCT_SORT_MODES}
          label={(k) => t(k)}
          manualHint={search.trim() ? t('adminProducts.sort.searchHint') : t('adminProducts.sort.manualHint')}
          showManualHint
          savingOrder={savingOrder}
          busy={busy}
        />
      </div>

      <BulkActionBar
        count={selected.size}
        busy={busy}
        onActivate={() => bulkSetActive(true)}
        onDeactivate={() => bulkSetActive(false)}
        onPin={() => bulkSetPinned(true)}
        onUnpin={() => bulkSetPinned(false)}
        onDelete={bulkDelete}
        onClear={clearSelection}
        labels={bulkLabels}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-500">{error}</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-20">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{search ? t('adminProducts.messages.noSearchResults') : t('adminProducts.messages.noProducts')}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2 bg-cream-50/70 border-b border-cream-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-cream-300 text-forest-700 focus:ring-forest-500"
                />
                {selected.size > 0
                  ? t('adminProducts.bulk.selected', { count: selected.size })
                  : t('adminProducts.labels.selectAll')}
              </label>
              <span className="text-gray-400 normal-case">{t('adminProducts.labels.dragHint')}</span>
            </div>
            <SortableList ids={visible.map((p) => p.id)} onDragEnd={handleDragEnd} disabled={!canReorder}>
              <div className="divide-y divide-cream-100">
                {visible.map((product) => (
                  <SortableCard
                    key={product.id}
                    id={product.id}
                    canReorder={canReorder}
                    pinned={product.isPinned}
                    onTogglePin={() => togglePin(product.id)}
                    onMoveUp={() => moveUp(product.id)}
                    onMoveDown={() => moveDown(product.id)}
                    selected={selected.has(product.id)}
                    onToggleSelect={() => toggleSelected(product.id)}
                    showCheckbox
                    className="bg-white"
                  >
                    <div className="flex items-center gap-4 py-3 pr-3">
                      <ProductImage src={product.image} alt={product.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 truncate">{product.name}</p>
                          {product.isPinned && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-forest-700 bg-forest-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              {t('adminCombos.badges.pinned')}
                            </span>
                          )}
                          {!isProductActive(product) && (
                            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              {t('adminCombos.badges.inactive')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{product.nameMs}</p>
                      </div>
                      <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-forest-50 text-forest-700 capitalize">
                        {product.category}
                      </span>
                      <span className="font-medium text-gray-900 whitespace-nowrap">RM{formatCurrency(product.price)}</span>
                      <span className={`hidden md:inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        product.freshness === 'available' ? 'bg-green-50 text-green-700' :
                        product.freshness === 'limited' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {product.freshness}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link to={`/admin/products/edit/${product.id}`} className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all" title={t('adminProducts.buttons.edit')}>
                          <Pencil size={16} />
                        </Link>
                        <RowMenu
                          title={t('adminProducts.labels.actions')}
                          actions={[
                            { key: 'duplicate', label: t('adminProducts.buttons.duplicate'), onClick: () => handleDuplicate(product) },
                            {
                              key: 'pin',
                              label: product.isPinned ? t('adminProducts.actions.unpin') : t('adminProducts.actions.pin'),
                              onClick: () => togglePin(product.id),
                            },
                            {
                              key: 'activate',
                              label: isProductActive(product) ? t('adminProducts.bulk.deactivate') : t('adminProducts.bulk.activate'),
                              onClick: () => setProductsActive([product.id], !isProductActive(product)).then(refetch),
                            },
                            {
                              key: 'delete',
                              label: t('adminProducts.buttons.delete'),
                              danger: true,
                              onClick: () => setDeleteTarget({ id: product.id, name: product.name }),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </SortableCard>
                ))}
              </div>
            </SortableList>
          </div>

          <div className="text-right text-xs text-gray-400 mt-2">
            {search.trim()
              ? t('adminProducts.pagination.showing', { count: visible.length, total: totalCount })
              : t('adminProducts.pagination.total', { count: totalCount })}
          </div>
        </>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t('adminProducts.delete.title')}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">{t('adminProducts.delete.confirm', { name: deleteTarget.name })}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t('adminProducts.buttons.cancel')}
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {deleting ? t('adminProducts.messages.deleting') : t('adminProducts.buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <UndoToast
          message={toast.message}
          undoLabel={t('adminProducts.toast.undo')}
          onUndo={toast.undo}
          onDismiss={dismissToast}
        />
      )}
    </>
  );
}


function PaymentQrSettingsCard() {
  const [current, setCurrent] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState(
    'Scan the DuitNow QR below and pay the exact order amount. After payment, upload your receipt for verification.'
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_current_payment_configuration'
      );

      if (rpcError) throw rpcError;

      const row = Array.isArray(data) ? data[0] ?? null : null;

      setCurrent(row);

      if (row?.instructions) {
        setInstructions(String(row.instructions));
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load payment QR configuration.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const currentQrUrl = current?.qr_storage_path
    ? supabase.storage
        .from('payment-qr')
        .getPublicUrl(current.qr_storage_path).data.publicUrl
    : null;

  const saveQr = async () => {
    if (!file) {
      setError('Please choose a QR image first.');
      return;
    }

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const ext = extensions[file.type];

    if (!ext) {
      setError('QR must be JPG, PNG or WebP.');
      return;
    }

    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setError('QR image must be 5 MB or smaller.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const nextVersion = Number(current?.version_number ?? 0) + 1;
      const objectId = crypto.randomUUID();

      const storagePath =
        `freshgo_manual_qr/v${nextVersion}/${objectId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-qr')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { error: publishError } = await supabase.rpc(
        'replace_payment_qr_configuration',
        {
          p_qr_storage_path: storagePath,
          p_instructions: instructions.trim() || null,
        }
      );

      if (publishError) throw publishError;

      setFile(null);
      setSuccess('Payment QR published successfully.');

      await loadCurrent();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to publish payment QR.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
      <div className="mb-5">
        <h2 className="font-semibold text-forest-900 text-base">
          Payment Settings
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Manage the DuitNow QR shown to customers when their order is ready for payment.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading payment settings...
        </div>
      ) : (
        <div className="space-y-5">
          {currentQrUrl ? (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Current published QR
              </p>

              <div className="inline-block rounded-2xl border border-cream-200 bg-white p-3">
                <img
                  src={currentQrUrl}
                  alt="FreshGo DuitNow QR"
                  className="w-56 h-56 object-contain rounded-xl"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-green-50 text-green-700 px-3 py-1 font-semibold">
                  Published
                </span>

                <span className="rounded-full bg-cream-100 text-gray-600 px-3 py-1 font-semibold">
                  Version {current?.version_number}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No payment QR has been published yet.
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {current ? 'Replace DuitNow QR' : 'Upload DuitNow QR'}
            </label>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={saving}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
                setSuccess(null);
              }}
              className="block w-full text-sm text-gray-600
                file:mr-4 file:rounded-xl file:border-0
                file:bg-forest-50 file:px-4 file:py-2.5
                file:text-sm file:font-semibold file:text-forest-700
                hover:file:bg-forest-100"
            />

            <p className="mt-1.5 text-xs text-gray-400">
              JPG, PNG or WebP · maximum 5 MB
            </p>
          </div>

          <div>
            <label
              htmlFor="payment-instructions"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              Customer payment instructions
            </label>

            <textarea
              id="payment-instructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={saving}
              className="input-field w-full"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="button"
            onClick={saveQr}
            disabled={!file || saving}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving
              ? 'Publishing...'
              : current
                ? 'Replace & Publish QR'
                : 'Publish QR'}
          </button>

          {current && (
            <p className="text-xs text-gray-400 leading-relaxed">
              Replacing the QR creates a new payment configuration version.
              Existing historical order snapshots are not rewritten.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SettingsTab() {
  const { t } = useLanguage();
  const { config, loading, updateConfig } = useDeliveryConfig();
  const [editing, setEditing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [customDay, setCustomDay] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleEditClick = () => {
    setShowWarning(true);
  };

  const handleConfirmEdit = () => {
    setDraftDays([...config.days]);
    setDraftTime(config.time);
    setEditing(true);
    setShowWarning(false);
    setStatus('idle');
  };

  const handleCancel = () => {
    setEditing(false);
    setCustomDay('');
    setStatus('idle');
  };

  const addCustomDay = () => {
    const trimmed = customDay.trim();
    if (trimmed && !draftDays.includes(trimmed)) {
      setDraftDays([...draftDays, trimmed]);
    }
    setCustomDay('');
  };

  const removeDay = (day: string) => {
    setDraftDays(draftDays.filter((d) => d !== day));
  };

  const handleSave = async () => {
    if (draftDays.length === 0) {
      setStatus('error');
      setErrorMsg(t("adminSettings.errors.noDay"));
      return;
    }
    if (!draftTime.trim()) {
      setStatus('error');
      setErrorMsg(t("adminSettings.errors.noTime"));
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await updateConfig({
        days: draftDays,
        time: draftTime.trim(),
      });
      setStatus('success');
      setEditing(false);
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : t("adminSettings.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  const daysText = config.days.length > 1
    ? `${config.days.slice(0, -1).join(', ')} & ${config.days[config.days.length - 1]}`
    : config.days[0] ?? '';

  const navSections = [
    { id: 'general', icon: Settings, labelKey: 'adminSettings.nav.general' },
    { id: 'branding', icon: Sparkles, labelKey: 'adminSettings.nav.branding' },
    { id: 'navigation', icon: Navigation, labelKey: 'adminSettings.nav.navigation' },
    { id: 'footer', icon: FileText, labelKey: 'adminSettings.nav.footer' },
    { id: 'contact', icon: Phone, labelKey: 'adminSettings.nav.contact' },
    { id: 'social', icon: Share2, labelKey: 'adminSettings.nav.social' },
    { id: 'payment', icon: Settings, labelKey: 'payment.title' },
    { id: 'delivery', icon: Truck, labelKey: 'adminSettings.nav.delivery' },
    { id: 'visibility', icon: LayoutDashboard, labelKey: 'adminSettings.nav.visibility' },
    { id: 'sorting', icon: ListOrdered, labelKey: 'adminSettings.nav.sorting' },
  ];

  return (
    <div className="max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1">
            {navSections.map(({ id, icon: Icon, labelKey }) => (
              <a
                key={id}
                href={`#settings-${id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
              >
                <Icon size={16} className="text-gray-400" />
                {t(labelKey)}
              </a>
            ))}
          </nav>
        </aside>
        <div className="space-y-6 min-w-0">
          <section id="settings-general" className="scroll-mt-28"><GeneralSettingsCard /></section>
          <section id="settings-branding" className="scroll-mt-28"><BrandingSettingsCard /></section>
          <section id="settings-navigation" className="scroll-mt-28"><NavigationSettingsCard /></section>
          <section id="settings-footer" className="scroll-mt-28"><FooterSettingsCard /></section>
          <section id="settings-contact" className="scroll-mt-28"><ContactSettingsCard /></section>
          <section id="settings-social" className="scroll-mt-28"><SocialMediaSettingsCard /></section>

          <section id="settings-payment" className="scroll-mt-28">
            <PaymentQrSettingsCard />
          </section>

          <section id="settings-delivery" className="scroll-mt-28 space-y-6">
            {/* Current Live Settings */}
            <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
            <Truck size={20} className="text-forest-700" />
          </div>
          <div>
            <h2 className="font-semibold text-forest-900 text-base">{t("adminSettings.sections.delivery")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{t("adminSettings.delivery.description")}</p>
          </div>
        </div>

        {/* Current live values */}
        {!editing && (
          <div className="space-y-4 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={14} className="text-forest-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("adminSettings.sections.deliveryDays")}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{daysText}</p>
              </div>
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock size={14} className="text-forest-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("adminSettings.sections.deliveryWindow")}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{config.time}</p>
              </div>
            </div>
          </div>
        )}

        {/* Edit mode */}
        {editing ? (
          <div className="space-y-5">
            {/* Delivery Days */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar size={14} className="inline mr-1.5 -mt-0.5" />
                {t("adminSettings.sections.deliveryDays")}
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {draftDays.map((day) => (
                  <span key={day} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-forest-700 text-white text-sm font-medium">
                    {day}
                    <button type="button" onClick={() => removeDay(day)} className="hover:text-red-200 transition-colors">
                      <X size={14} />
                    </button>
                  </span>
                ))}
                {draftDays.length === 0 && (
                  <span className="text-sm text-gray-400 italic">{t("adminSettings.messages.noDays")}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDay}
                  onChange={(e) => setCustomDay(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomDay(); } }}
                  placeholder={t("adminSettings.delivery.dayPlaceholder")}
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addCustomDay}
                  disabled={!customDay.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-forest-700 text-white hover:bg-forest-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("adminSettings.buttons.add")}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{t("adminSettings.delivery.dayHelper")}</p>
            </div>

            {/* Delivery Time */}
            <div>
              <label htmlFor="delivery_time" className="block text-sm font-medium text-gray-700 mb-2">
                <Clock size={14} className="inline mr-1.5 -mt-0.5" />
                {t("adminSettings.sections.deliveryWindow")}
              </label>
              <input
                id="delivery_time"
                type="text"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                placeholder={t("adminSettings.delivery.timePlaceholder")}
                className="input-field max-w-xs"
              />
              <p className="text-xs text-gray-400 mt-1.5">{t("adminSettings.delivery.timeHelper")}</p>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                {t("adminSettings.buttons.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? t("adminSettings.messages.saving") : t("adminSettings.buttons.save")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleEditClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-forest-700 border-2 border-forest-200 bg-forest-50 hover:bg-forest-100 transition-all"
          >
            <PenLine size={16} />
            {t("adminSettings.buttons.edit")}
          </button>
        )}
      </section>

      {/* Status messages */}
      {status === 'success' && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium animate-[fadeSlideUp_0.2s_ease-out]">
          <CheckCircle2 size={18} /> {t("adminSettings.messages.saved")}
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm animate-[fadeSlideUp_0.2s_ease-out]">
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      {/* Warning modal */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowWarning(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <button onClick={() => setShowWarning(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <ShieldAlert size={20} className="text-amber-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t("adminSettings.confirmation.editTitle")}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              {t("adminSettings.confirmation.editBody")}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {t("adminSettings.confirmation.editScope")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowWarning(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                {t("adminSettings.buttons.discard")}
              </button>
              <button
                onClick={handleConfirmEdit}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-all"
              >
                {t("adminSettings.buttons.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

          <DeliveryCapacitySettingsCard />
        </section>

        <section id="settings-visibility" className="scroll-mt-28">
          <WebsiteVisibilityCard />
        </section>

        <section id="settings-sorting" className="scroll-mt-28">
          <DisplaySortingSettingsCard />
        </section>
        </div>
      </div>
    </div>
  );
}
type UserRoleValue = 'admin' | 'supplier' | 'delivery_rider' | 'customer';

type UserRow = {
  id: string;
  email: string;
  role: UserRoleValue;
};

const roleBadgeClass: Record<UserRoleValue, string> = {
  admin:          'bg-forest-50 text-forest-700',
  supplier:       'bg-jade-50 text-jade-700',
  delivery_rider: 'bg-amber-50 text-amber-700',
  customer:       'bg-cream-100 text-gray-600',
};

function UsersTab() {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string | null>(null); // userId being mutated

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Fetch auth users list via edge function
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const authUsers: { id: string; email: string }[] = await res.json();

      // Fetch all role rows the admin can see
      const { data: roleRows, error: roleErr } = await supabase
        .from('user_roles')
        .select('id, role');
      if (roleErr) throw roleErr;

      const roleMap = new Map<string, string>(
        (roleRows ?? []).map((r: { id: string; role: string }) => [r.id, r.role])
      );

      const merged: UserRow[] = authUsers.map((u) => {
        const r = roleMap.get(u.id);
        const role: UserRoleValue =
          r === 'admin' ? 'admin' : r === 'supplier' ? 'supplier' : r === 'delivery_rider' ? 'delivery_rider' : 'customer';
        return { id: u.id, email: u.email, role };
      });

      merged.sort((a, b) => {
        const order: Record<UserRoleValue, number> = { admin: 0, supplier: 1, delivery_rider: 2, customer: 3 };
        return order[a.role] - order[b.role] || a.email.localeCompare(b.email);
      });

      setUsers(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminUsers.messages.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changeRole = async (targetUser: UserRow, newRole: UserRoleValue) => {
    setMutating(targetUser.id);
    try {
      const current = targetUser.role;

      if (current === 'customer' && newRole !== 'customer') {
        // INSERT
        const { error } = await supabase
          .from('user_roles')
          .insert({ id: targetUser.id, role: newRole });
        if (error) throw error;
      } else if (newRole === 'customer') {
        // DELETE
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('id', targetUser.id);
        if (error) throw error;
      } else {
        // UPDATE (supplier ↔ admin)
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('id', targetUser.id);
        if (error) throw error;
      }

      // Re-fetch to confirm the updated role
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminUsers.messages.failedUpdate"));
    } finally {
      setMutating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
        <AlertCircle size={18} className="flex-shrink-0" /> {error}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream-50 border-b border-cream-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminUsers.labels.email")}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminUsers.labels.role")}</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">{t("adminUsers.labels.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              const isLoading = mutating === u.id;

              const actions: { label: string; to: UserRoleValue; danger?: boolean }[] =
                u.role === 'customer'
                  ? [
                      { label: t("adminUsers.buttons.promoteToSupplier"), to: 'supplier' },
                      { label: t("adminUsers.buttons.promoteToRider"),   to: 'delivery_rider' },
                      { label: t("adminUsers.buttons.promoteToAdmin"),   to: 'admin' },
                    ]
                  : u.role === 'supplier'
                  ? [
                      { label: t("adminUsers.buttons.makeCustomer"),    to: 'customer', danger: true },
                      { label: t("adminUsers.buttons.makeRider"),       to: 'delivery_rider' },
                      { label: t("adminUsers.buttons.promoteToAdmin"),  to: 'admin' },
                    ]
                  : u.role === 'delivery_rider'
                  ? [
                      { label: t("adminUsers.buttons.makeCustomer"), to: 'customer', danger: true },
                      { label: t("adminUsers.buttons.makeSupplier"), to: 'supplier' },
                      { label: t("adminUsers.buttons.makeAdmin"),    to: 'admin' },
                    ]
                  : [
                      { label: t("adminUsers.buttons.makeSupplier"), to: 'supplier' },
                      { label: t("adminUsers.buttons.makeRider"),    to: 'delivery_rider' },
                      { label: t("adminUsers.buttons.makeCustomer"), to: 'customer', danger: true },
                    ];

              return (
                <tr key={u.id} className="hover:bg-cream-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">{t("adminUsers.labels.you")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadgeClass[u.role]}`}>
                      {t("adminUsers.roles." + u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {isLoading ? (
                        <Loader2 size={16} className="animate-spin text-forest-500" />
                      ) : actions.map((action) => (
                        <button
                          key={action.to}
                          onClick={() => changeRole(u, action.to)}
                          disabled={isSelf}
                          title={isSelf ? t("adminUsers.messages.cannotChangeOwnRole") : undefined}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                            action.danger
                              ? 'text-red-600 border border-red-200 hover:bg-red-50'
                              : 'text-forest-700 border border-forest-200 hover:bg-forest-50'
                          }`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders tab
// ---------------------------------------------------------------------------

interface AdminOrder {
  dbId: number;
  orderRef: string;
  customerName: string;
  customerPhone: string;
  apartment: string;
  houseUnit: string;
  pickupLocation: string;
  deliveryDate: string;
  deliverySlot: string;
  deliveryWindow: string;
  deliveryNotes: string;
  createdAt: string;
  total: number;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  orderStatus: string;
  orderSummary: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supplierWeights: Record<string, number>;
  deliveryFee: number;
  subtotal: number;
}

// Local date formatter (avoids timezone shift)
function formatLocalDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Display formatter for delivery date (e.g., "Monday • 3 Aug 2026")
function formatDeliveryDate(dateStr: string): string {
  if (!dateStr || dateStr === '—') return '—';

  // Try ISO format first: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]) - 1;
    const dd = Number(isoMatch[3]);
    if (yyyy > 1900 && mm >= 0 && mm <= 11 && dd >= 1 && dd <= 31) {
      const date = new Date(yyyy, mm, dd);
      if (!isNaN(date.getTime())) {
        const dayName = date.toLocaleDateString('en-MY', { weekday: 'long' });
        const formatted = date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
        return `${dayName} • ${formatted}`;
      }
    }
  }

  // Try parsing human-readable format directly
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const dayName = date.toLocaleDateString('en-MY', { weekday: 'long' });
    const formatted = date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${dayName} • ${formatted}`;
  }

  return '—';
}

const PAYMENT_FILTERS = (t: (key: string) => string): { label: string; value: PaymentStatus | 'all' }[] => [
  { label: t("adminOrders.filters.all"),           value: 'all' },
  { label: t("adminOrders.filters.pending"),       value: 'Pending' },
  { label: t("adminOrders.filters.readyToPay"),    value: 'Ready To Pay' },
  { label: t("adminOrders.filters.paid"),          value: 'Paid' },
];

function AdminPaymentBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    'Pending':      'bg-amber-50 text-amber-700',
    'Ready To Pay': 'bg-orange-50 text-orange-700',
    'Paid':         'bg-green-50 text-green-700',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

const ORDER_STATUS_BADGE = (t: (key: string) => string): Record<string, { label: string; className: string }> => ({
  'confirmed':        { label: t("adminOrders.orderStatus.confirmed"),       className: 'bg-jade-100 text-jade-700' },
  'preparing':        { label: t("adminOrders.orderStatus.preparing"),        className: 'bg-blue-100 text-blue-700' },
  'out-for-delivery': { label: t("adminOrders.orderStatus.outForDelivery"),   className: 'bg-amber-100 text-amber-700' },
  'delivered':        { label: t("adminOrders.orderStatus.delivered"),        className: 'bg-forest-100 text-forest-700' },
});

function AdminOrderStatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const badgeMap = ORDER_STATUS_BADGE(t);
  const cfg = badgeMap[status] ?? badgeMap['confirmed'];
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function normalizeMalaysianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('60')) return digits;
  if (digits.startsWith('0')) return '60' + digits.slice(1);
  return '60' + digits;
}

function buildPaymentMessage(order: AdminOrder): string {
  const lines = [
    `Hi ${order.customerName} 👋`,
    '',
    'Your order has been weighed and the final amount has been confirmed.',
    '',
    'Order Reference:',
    order.orderRef,
    '',
    'Final Amount:',
    `RM ${formatCurrency(order.total)}`,
    '',
    'Delivery Schedule:',
    order.deliveryDate,
    order.deliveryWindow,
    '',
    'Delivery Details:',
    `Unit ${order.houseUnit}`,
  ];
  if (order.apartment) lines.push(order.apartment);
  if (order.pickupLocation) lines.push(order.pickupLocation);
  if (order.deliveryNotes) {
    lines.push('');
    lines.push('Delivery Notes:');
    lines.push(order.deliveryNotes);
  }
  lines.push('');
  lines.push('Please make payment using the DuitNow QR code that I will send in this WhatsApp.');
  lines.push('');
  lines.push('After making payment, kindly reply with your payment receipt.');
  lines.push('');
  lines.push('Thank you for supporting Rimbun FreshGo ❤️');
  return lines.join('\n');
}


function CanonicalPaymentVerificationQueue() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCanonicalReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: receipts, error: receiptError } = await supabase
        .from('sales_order_payment_receipts')
        .select(
          'id, sales_order_id, storage_path, original_file_name, mime_type, file_size, uploaded_at, verification_status'
        )
        .eq('verification_status', 'submitted')
        .order('uploaded_at', { ascending: true });

      if (receiptError) throw receiptError;

      const receiptRows = receipts ?? [];

      if (receiptRows.length === 0) {
        setRows([]);
        return;
      }

      const orderIds = Array.from(
        new Set(receiptRows.map((r: any) => String(r.sales_order_id)))
      );

      const { data: orders, error: orderError } = await supabase
        .from('sales_orders')
        .select(
          'id, order_number, customer_snapshot, final_total, total, payment_status, price_status, created_at'
        )
        .in('id', orderIds);

      if (orderError) throw orderError;

      const ordersById = new Map(
        (orders ?? []).map((o: any) => [String(o.id), o])
      );

      setRows(
        receiptRows.map((receipt: any) => ({
          ...receipt,
          order: ordersById.get(String(receipt.sales_order_id)) ?? null,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load canonical payment receipts.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCanonicalReceipts();
  }, [loadCanonicalReceipts]);

  const viewReceipt = async (row: any) => {
    setError(null);

    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from('sales-order-payment-receipts')
        .createSignedUrl(row.storage_path, 300);

      if (signedUrlError) throw signedUrlError;
      if (!data?.signedUrl) throw new Error('Unable to create receipt URL.');

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to open receipt.'
      );
    }
  };

  const confirmReceipt = async (row: any) => {
    const ref = row.order?.order_number ?? row.sales_order_id;

    if (!window.confirm(`Confirm payment for ${ref}?`)) return;

    setActionId(row.id);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc(
        'confirm_sales_order_payment',
        {
          p_receipt_id: row.id,
        }
      );

      if (rpcError) throw rpcError;

      await loadCanonicalReceipts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to confirm payment.'
      );
    } finally {
      setActionId(null);
    }
  };

  const rejectReceipt = async (row: any) => {
    const reason = window.prompt(
      'Reason for rejecting this payment receipt:'
    );

    if (reason == null) return;

    const cleanReason = reason.trim();

    if (!cleanReason) {
      window.alert('Rejection reason is required.');
      return;
    }

    setActionId(row.id);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc(
        'reject_sales_order_payment_receipt',
        {
          p_receipt_id: row.id,
          p_reason: cleanReason,
        }
      );

      if (rpcError) throw rpcError;

      await loadCanonicalReceipts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to reject payment receipt.'
      );
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Payment Verification
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Customer receipts waiting for verification.
          </p>
        </div>

        <button
          type="button"
          onClick={loadCanonicalReceipts}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-cream-300 text-sm font-semibold text-gray-600 hover:bg-cream-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-cream-200 bg-white p-5 text-sm text-gray-500">
          Loading payment receipts...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-cream-200 bg-white p-5 text-sm text-gray-500">
          No payment receipts awaiting verification.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const order = row.order ?? {};
            const customer = order.customer_snapshot ?? {};
            const total = Number(order.final_total ?? order.total ?? 0);
            const busy = actionId === row.id;

            return (
              <div
                key={row.id}
                className="rounded-2xl border border-blue-200 bg-white p-5 shadow-soft"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <p className="font-mono font-semibold text-gray-900">
                      {order.order_number ?? row.sales_order_id}
                    </p>

                    <p className="mt-2 font-semibold text-gray-900">
                      {customer.name ?? 'Customer'}
                    </p>

                    <p className="text-sm text-gray-500">
                      {customer.phone ?? ''}
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      Final total:{' '}
                      <strong className="text-forest-800">
                        RM{formatCurrency(total)}
                      </strong>
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      {row.original_file_name}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => viewReceipt(row)}
                      disabled={busy}
                      className="px-4 py-2.5 rounded-xl border border-blue-300 text-blue-700 font-semibold text-sm hover:bg-blue-50 disabled:opacity-50"
                    >
                      View Receipt
                    </button>

                    <button
                      type="button"
                      onClick={() => rejectReceipt(row)}
                      disabled={busy}
                      className="px-4 py-2.5 rounded-xl border border-red-300 text-red-700 font-semibold text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      onClick={() => confirmReceipt(row)}
                      disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy ? 'Processing...' : 'Confirm Payment'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrdersTab() {

  const { t } = useLanguage();
const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('all');
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [editSelected, setEditSelected] = useState<AdminOrder | null>(null);
  const [deleteSelected, setDeleteSelected] = useState<AdminOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteSelected) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { error: deleteErr } = await supabase.rpc(
        'admin_archive_order',
        {
          p_order_id: deleteSelected.dbId,
          p_reason: 'Cancelled by admin',
        },
      );
      if (deleteErr) throw deleteErr;

      setOrders((prev) =>
        prev.filter((o) => o.dbId !== deleteSelected.dbId)
      );
      setDeleteSelected(null);
      alert(t("adminOrders.messages.deleted"));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("adminOrders.messages.failedDelete"));
    } finally {
      setDeleting(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('Orders')
        .select('id, full_name, phone_number, apartment, house_unit, pickup_location, order_notes, order_summary, order_items, supplier_weights, subtotal, delivery_fee, total, payment_status, paid_at, created_at, delivery_slot')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;

      const mapped: AdminOrder[] = (data ?? []).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = row as any;
        const summary = r.order_summary ?? {};
        return {
          dbId: r.id,
          orderRef: summary.orderRef ?? String(r.id),
          customerName: r.full_name,
          customerPhone: r.phone_number ?? '',
          apartment: r.apartment ?? '',
          houseUnit: r.house_unit ?? '',
          pickupLocation: r.pickup_location ?? '',
          deliveryDate: summary.deliveryDate ?? '—',
          deliverySlot: r.delivery_slot ?? '',
          deliveryWindow: summary.deliveryWindow ?? '',
          deliveryNotes: r.order_notes ?? '',
          createdAt: r.created_at,
          total: Number(r.total),
          paymentStatus: (r.payment_status as PaymentStatus) ?? 'Pending',
          paidAt: r.paid_at ?? null,
          orderStatus: summary.status ?? 'confirmed',
          orderSummary: summary,
          orderItems: r.order_items ?? [],
          supplierWeights: (r.supplier_weights as Record<string, number>) ?? {},
          deliveryFee: Number(r.delivery_fee),
          subtotal: Number(r.subtotal),
        };
      });

      setOrders(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminOrders.messages.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.paymentStatus === filter);

  const filterCounts = useMemo(() => ({
    'all': orders.length,
    'Pending': orders.filter((o) => o.paymentStatus === 'Pending').length,
    'Ready To Pay': orders.filter((o) => o.paymentStatus === 'Ready To Pay').length,
    'Paid': orders.filter((o) => o.paymentStatus === 'Paid').length,
  }), [orders]);

  if (selected) {
    return (
      <AdminOrderDetailView
        order={selected}
        onBack={() => setSelected(null)}
        onUpdated={() => { setSelected(null); load(); }}
      />
    );
  }

  if (editSelected) {
    return (
      <EditOrderModal
        order={editSelected}
        onClose={() => setEditSelected(null)}
        onSaved={load}
      />
    );
  }

  return (
    <>
      <CanonicalPaymentVerificationQueue />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PAYMENT_FILTERS(t).map((f) => {
          const badgeColors: Record<string, string> = {
            'all': 'bg-gray-100 text-gray-700',
            'Pending': 'bg-red-100 text-red-700',
            'Ready To Pay': 'bg-orange-100 text-orange-700',
            'Paid': 'bg-green-100 text-green-700',
          };
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
                filter === f.value
                  ? 'bg-forest-700 text-white'
                  : 'bg-cream-100 text-gray-600 hover:bg-cream-200'
              }`}
            >
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColors[f.value]}`}>
                {filterCounts[f.value]}
              </span>
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
          <AlertCircle size={18} className="flex-shrink-0" /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{filter === 'all' ? t("adminOrders.messages.noOrders") : t("adminOrders.messages.noOrdersFilter", { filter })}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 border-b border-cream-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-8">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.orderRef")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.customer")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">{t("adminOrders.labels.createdAt")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">{t("adminOrders.labels.deliveryDate")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.total")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.orderStatus")}</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.paymentStatus")}</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {filtered.map((order, index) => (
                    <tr key={order.dbId} className="hover:bg-cream-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.orderRef}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{order.customerName}</td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell whitespace-nowrap">{formatDeliveryDate(order.deliveryDate)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">RM{formatCurrency(order.total)}</td>
                      <td className="px-4 py-3"><AdminOrderStatusBadge status={order.orderStatus} t={t} /></td>
                      <td className="px-4 py-3"><AdminPaymentBadge status={order.paymentStatus} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setEditSelected(order)}
                            className="p-1.5 rounded-lg text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                            title={t("adminOrders.buttons.edit")}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setSelected(order)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                          >
                            {t("adminOrders.buttons.view")}
                          </button>
                          <button
                            onClick={() => setDeleteSelected(order)}
                            className="p-1.5 rounded-lg text-red-600 border border-red-200 hover:bg-red-50 transition-all"
                            title={t("adminOrders.buttons.delete")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-right text-xs text-gray-400 mt-2">
            {t("adminOrders.pagination.showing", { count: filtered.length, total: orders.length })}
</div>
        </>
      )}

      {deleteSelected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t("adminOrders.modal.deleteTitle")}</h3>
              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <p dangerouslySetInnerHTML={{ __html: t("adminOrders.modal.deleteBody", { ref: deleteSelected.orderRef, customer: deleteSelected.customerName, total: `RM${formatCurrency(deleteSelected.total)}` }) }} />
                <p className="text-red-600 font-medium">{t("adminOrders.messages.cannotUndo")}</p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteSelected(null)}
                  className="px-4 py-2 rounded-lg text-gray-700 border border-gray-300 hover:bg-gray-50 transition-all"
                >
                  {t("adminOrders.buttons.cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? t("adminOrders.messages.deleting") : t("adminOrders.buttons.delete")}
                </button>
              </div>
              {deleteError && (
                <p className="mt-4 text-sm text-red-600">{deleteError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function AdminOrderDetailView({
  order,
  onBack,
  onUpdated,
}: {
  order: AdminOrder;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConfirmPayment = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from('Orders')
        .update({
          payment_status: 'Paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id ?? null,
        })
        .eq('id', order.dbId);
      if (error) throw error;
      setSuccess(true);
      setConfirming(false);
      setTimeout(onUpdated, 1800);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("adminOrders.messages.failedConfirm"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-forest-700 mb-6 transition-colors"
      >
        <ChevronLeft size={16} /> {t("adminOrders.buttons.back")}
      </button>

      {/* Order header */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{t("adminOrders.labels.orderRef")}</p>
            <p className="font-mono font-semibold text-gray-900 mt-0.5">{order.orderRef}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{t("adminOrders.labels.customer")}</p>
            <p className="font-semibold text-gray-900 mt-0.5">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-xs text-gray-500 mt-0.5">{order.customerPhone}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{t("adminOrders.labels.deliveryAddress")}</p>
            <p className="font-semibold text-gray-900 mt-0.5">{t("adminOrders.labels.unit", { unit: order.houseUnit || '—' })}</p>
            {order.apartment && <p className="text-xs text-gray-500">{order.apartment}</p>}
            {order.pickupLocation && <p className="text-xs text-gray-500">{order.pickupLocation}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{t("adminOrders.labels.deliveryDate")}</p>
            <p className="font-semibold text-gray-900 mt-0.5">{formatDeliveryDate(order.deliveryDate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{t("adminOrders.labels.createdAt")}</p>
            <p className="font-semibold text-gray-900 mt-0.5">
              {new Date(order.createdAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Items */}
      {order.orderItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.item")}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">{t("adminOrders.labels.prep")}</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.qty")}</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">{t("adminOrders.labels.actualWeight")}</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">{t("adminOrders.labels.itemTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {order.orderItems.map((item, i) => {
                  const isPerKg = item.pricingType === 'per_kg' || item.pricingType === 'slice' || item.sliceQuantity != null || (!item.pricingType && item.unit === 'per kg');
                  const actualKg = order.supplierWeights[String(i)];
                  const lineTotal = isPerKg && actualKg
                    ? actualKg * item.price
                    : item.price * item.quantity;
                  const hasComboItems = item.comboItems && item.comboItems.length > 0;
                  return (
                    <tr key={i} className={`hover:bg-cream-50/50 ${hasComboItems ? 'bg-cream-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.name}
                        {!isPerKg && !hasComboItems && <span className="ml-2 text-xs text-jade-600 font-normal">{t("adminOrders.labels.fixed")}</span>}
                        {hasComboItems && (
                          <div className="mt-2 pt-2 border-t border-cream-200 space-y-1.5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("adminOrders.labels.contains")}</p>
                            {item.comboItems.map((ci: ComboExpandedItem) => (
                              <div key={ci.productId} className="flex items-center gap-2 text-xs">
                                <span className="text-gray-700">{ci.label}</span>
                                {ci.preparation && (
                                  <span className="text-gray-400">({getPrepLabel(ci.preparation)})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {item.preparation ? getPrepLabel(item.preparation) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {item.sliceQuantity != null ? `${item.sliceQuantity} slices` : item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {isPerKg && !hasComboItems
                          ? actualKg != null
                            ? <span className="font-medium text-gray-900">{actualKg} kg</span>
                            : <span className="text-amber-600 text-xs">{t("adminOrders.messages.pendingWeighing")}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        RM{formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-cream-200 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("adminOrders.labels.subtotal")}</span><span>RM{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("adminOrders.labels.delivery")}</span>
              <span>{order.deliveryFee === 0 ? t("adminOrders.messages.free") : `RM${formatCurrency(order.deliveryFee)}`}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
              <span>{t("adminOrders.labels.finalAmount")}</span>
              <span className="text-forest-800">RM{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Customer remarks */}
      {order.deliveryNotes && (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{t("adminOrders.labels.customerNotes")}</p>
          <p className="text-sm text-gray-700">{order.deliveryNotes}</p>
        </div>
      )}

      {/* Payment section */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={18} className="text-forest-600" />
          <h3 className="font-semibold text-charcoal">{t("adminOrders.labels.payment")}</h3>
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600 font-medium">{t("adminOrders.labels.paymentStatus")}</span>
          <AdminPaymentBadge status={order.paymentStatus} />
        </div>

        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-gray-600 font-medium">{t("adminOrders.labels.finalAmount")}</span>
          <span className="font-bold text-forest-800 text-base">RM{formatCurrency(order.total)}</span>
        </div>

        {order.paymentStatus === 'Paid' && order.paidAt && (
          <div className="text-xs text-gray-400 mb-4">
            {t("adminOrders.messages.confirmedOn", { date: new Date(order.paidAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
          </div>
        )}

        {order.paymentStatus === 'Ready To Pay' && !success && (
          <div className="space-y-2">
            <button
              onClick={() => {
                const phone = normalizeMalaysianPhone(order.customerPhone);
                const msg = buildPaymentMessage(order);
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-all"
            >
              <Phone size={16} />
              {t("adminOrders.buttons.whatsapp")}
            </button>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(buildPaymentMessage(order));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
            >
              {copied ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
              {copied ? t("adminOrders.messages.copied") : t("adminOrders.buttons.copyPayment")}
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
            >
              <CreditCard size={16} />
              {t("adminOrders.buttons.markAsPaid")}
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-[fadeSlideUp_0.2s_ease-out]">
            <CheckCircle2 size={16} /> {t("adminOrders.messages.paymentConfirmed")}
          </div>
        )}

        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm mt-3">
            <AlertCircle size={16} /> {saveError}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && setConfirming(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <button
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <CreditCard size={20} className="text-green-700" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg">{t("adminOrders.modal.confirmTitle")}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6"
              dangerouslySetInnerHTML={{ __html: t("adminOrders.modal.confirmBody", { ref: order.orderRef }) }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                {t("adminOrders.buttons.cancel")}
              </button>
              <button
                onClick={handleConfirmPayment}
disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? t("adminOrders.messages.confirming") : t("adminOrders.modal.confirmTitle")}
              </button>
            </div>
          </div>
        </div>
      )}    </div>
  );
}



function EditOrderModal({ order, onClose, onSaved }: { order: AdminOrder; onClose: () => void; onSaved: () => Promise<void> }) {
  if (!order) {
    return null;
  }

  const { t } = useLanguage();
  const { user } = useAuth();
  const { config: deliveryConfig, loading: deliveryLoading } = useDeliveryConfig();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Format delivery date as "Monday\n3 Aug 2026" (two lines) or "Mon 3 Aug 2026" for table
  function formatDeliveryDate(date: string, slot?: string): string {
    if (!date || date === '—') return '—';
    // Parse as local date to avoid timezone shift
    const [yyyy, mm, dd] = date.split('-').map(Number);
    if (!yyyy || !mm || !dd) return date;
    const d = new Date(yyyy, mm - 1, dd);
    const dayName = d.toLocaleDateString('en-MY', { weekday: 'short' });
    const formatted = d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${dayName} ${formatted}`;
  }

  // Generate valid upcoming delivery dates based on configured days
  const generateDeliveryDates = () => {
    if (!deliveryConfig?.days?.length) return [];
    const dates: { value: string; label: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const configuredDays = deliveryConfig.days;
    const dayMap: Record<string, number> = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6
    };
    const targetDayNumbers = configuredDays.map(d => dayMap[d]).filter((n): n is number => n !== undefined);
    const optionsPerDay = 4;
    const maxDaysToCheck = 90;
    let checkedDays = 0;
    let found = 0;
    const currentDate = new Date(today);
    while (checkedDays < maxDaysToCheck && found < configuredDays.length * optionsPerDay) {
      const dayOfWeek = currentDate.getDay();
      if (targetDayNumbers.includes(dayOfWeek)) {
        // Use local date string (YYYY-MM-DD) without timezone conversion
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const value = `${year}-${month}-${day}`;
        const label = currentDate.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        dates.push({ value, label: `${currentDate.toLocaleDateString('en-MY', { weekday: 'long' })} → ${label}` });
        found++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
      checkedDays++;
    }
    return dates;
  };

  const validDeliveryDates = generateDeliveryDates();

const [formData, setFormData] = useState({
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    apartment: order.apartment,
    houseUnit: order.houseUnit,
    pickupLocation: order.pickupLocation,
    deliveryDate: order.deliveryDate === '—' ? '' : order.deliveryDate,
    deliverySlot: order.deliverySlot ?? (order.deliveryDate === '—' ? '' : order.deliveryDate),
    deliveryWindow: order.deliveryWindow,
    deliveryNotes: order.deliveryNotes,
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // When delivery date changes, also update delivery_slot to the day name
      if (field === 'deliveryDate' && value) {
        const date = new Date(value + 'T00:00:00');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        updated.deliverySlot = dayNames[date.getDay()];
      }
      return updated;
    });
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Build the updated order_summary JSON - preserve all existing fields
      const updatedSummary = {
        ...(order.orderSummary ?? {}),
        deliveryDate: formData.deliveryDate,
        deliveryWindow: formData.deliveryWindow,
      };

      const { error: updateError } = await supabase
        .from('Orders')
        .update({
          full_name: formData.customerName,
          phone_number: formData.customerPhone,
          apartment: formData.apartment,
          house_unit: formData.houseUnit,
          pickup_location: formData.pickupLocation,
          order_notes: formData.deliveryNotes,
          delivery_slot: formData.deliverySlot,
          order_summary: updatedSummary,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', order.dbId);

      if (updateError) throw updateError;

      await onSaved();
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminOrders.messages.failedUpdate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!saving ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-[fadeSlideUp_0.2s_ease-out]">
        <div className="flex items-center justify-between p-4 border-b border-cream-200">
          <h3 className="font-semibold text-gray-900">{t("adminOrders.edit.title")}</h3>
          <button
            onClick={!saving ? onClose : undefined}
            disabled={saving}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {success && (
          <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-[fadeSlideUp_0.2s_ease-out] flex items-center gap-2">
            <CheckCircle2 size={16} /> {t("adminOrders.messages.updated")}
          </div>
        )}

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.customerName")}</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              required
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.phone")}</label>
            <input
              type="tel"
              value={formData.customerPhone}
              onChange={(e) => handleChange('customerPhone', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              required
              disabled={saving}
              placeholder={t("adminOrders.edit.phonePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.apartment")}</label>
            <input
              type="text"
              value={formData.apartment}
              onChange={(e) => handleChange('apartment', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              disabled={saving}
              placeholder={t("adminOrders.edit.apartmentPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.houseUnit")}</label>
            <input
              type="text"
              value={formData.houseUnit}
              onChange={(e) => handleChange('houseUnit', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              disabled={saving}
              placeholder={t("adminOrders.edit.unitPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.pickupLocation")}</label>
            <input
              type="text"
              value={formData.pickupLocation}
              onChange={(e) => handleChange('pickupLocation', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              disabled={saving}
              placeholder={t("adminOrders.edit.pickupPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.deliveryDate")}</label>
            {deliveryLoading ? (
              <div className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm text-gray-400 bg-gray-50">{t("adminOrders.messages.loading")}</div>
            ) : (
              <select
                value={formData.deliveryDate}
                onChange={(e) => handleChange('deliveryDate', e.target.value)}
                className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                disabled={saving}
              >
                <option value="">{t("adminOrders.edit.selectDate")}</option>
                {validDeliveryDates.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.deliveryWindow")}</label>
            <input
              type="text"
              value={formData.deliveryWindow}
              onChange={(e) => handleChange('deliveryWindow', e.target.value)}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
              disabled={saving}
              placeholder={t("adminOrders.edit.windowPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("adminOrders.edit.orderNotes")}</label>
            <textarea
              value={formData.deliveryNotes}
              onChange={(e) => handleChange('deliveryNotes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-cream-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none"
              disabled={saving}
              placeholder={t("adminOrders.edit.notesPlaceholder")}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-cream-200 flex justify-end gap-3">
          <button
            onClick={!saving ? onClose : undefined}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t("adminOrders.buttons.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? t("adminOrders.messages.saving") : t("adminOrders.buttons.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
