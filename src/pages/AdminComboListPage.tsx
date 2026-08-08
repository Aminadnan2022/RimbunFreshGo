import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, Star, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchCombos,
  deleteCombos,
  toggleComboFeatured,
  toggleComboActive,
  toggleComboPinned,
  duplicateCombo,
  moveCombo,
  setCombosActive,
  setCombosPinned,
} from '../data/combos';
import SortableList from '../components/admin/SortableList';
import SortableCard from '../components/admin/sortable/SortableCard';
import RowMenu from '../components/admin/sortable/RowMenu';
import UndoToast from '../components/admin/sortable/UndoToast';
import SortToolbar from '../components/admin/sortable/SortToolbar';
import BulkActionBar from '../components/admin/sortable/BulkActionBar';
import { useSortableManager, type SortModeOption } from '../components/admin/sortable/useSortableManager';
import ProductImage from '../components/ui/ProductImage';
import { formatCurrency } from '../lib/currency';
import { useLanguage } from '../context/LanguageContext';
import type { DbCombo } from '../types';

const COMBO_SORT_MODES: SortModeOption<DbCombo>[] = [
  { value: 'manual', labelKey: 'adminCombos.sort.manual' },
  { value: 'name', labelKey: 'adminCombos.sort.name', compare: (a, b) => a.name.localeCompare(b.name) },
  { value: 'price_low', labelKey: 'adminCombos.sort.price_low', compare: (a, b) => Number(a.price) - Number(b.price) },
  { value: 'price_high', labelKey: 'adminCombos.sort.price_high', compare: (a, b) => Number(b.price) - Number(a.price) },
  { value: 'newest', labelKey: 'adminCombos.sort.newest', compare: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() },
];

export default function AdminComboListPage() {
  const { t } = useLanguage();
  const [combos, setCombos] = useState<DbCombo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set());
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  async function load() {
    try {
      const data = await fetchCombos();
      setCombos(data);
    } catch (err) {
      console.error('Failed to load combos:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const manager = useSortableManager<DbCombo>({
    items: combos,
    sortModes: COMBO_SORT_MODES,
    getPinned: (c) => c.is_pinned,
    applyPinned: (c, pinned) => ({ ...c, is_pinned: pinned }),
    onMove: (id, toIndex) => moveCombo(id, toIndex),
    onTogglePin: (id, pinned) => toggleComboPinned(id, pinned),
    onBulkActive: (ids, active) => setCombosActive(ids, active),
    onBulkPinned: (ids, pinned) => setCombosPinned(ids, pinned),
    onBulkDelete: (ids) => deleteCombos(ids),
    onRefetch: load,
    reorderMessage: t('adminCombos.toast.reordered'),
    pinMessage: (pinned) => (pinned ? t('adminCombos.toast.pinned') : t('adminCombos.toast.unpinned')),
    bulkMessage: (label, count) => t('adminCombos.toast.bulkChanged', { count, label: t('adminCombos.actions.' + label) }),
    undoFailedMessage: t('adminCombos.toast.undoFailed'),
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

  async function fetchItemCount(comboId: string): Promise<number> {
    const { count } = await supabase
      .from('combo_items')
      .select('*', { count: 'exact', head: true })
      .eq('combo_id', comboId);
    return count ?? 0;
  }

  useEffect(() => {
    combos.forEach((c) => {
      if (!(c.id in itemCounts)) {
        fetchItemCount(c.id).then((n) => setItemCounts((prev) => ({ ...prev, [c.id]: n })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combos]);

  const handleToggleFeatured = async (id: string, current: boolean) => {
    try {
      await toggleComboFeatured(id, !current);
      setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, featured: !current } : c)));
    } catch (err) {
      console.error('Toggle featured failed:', err);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await toggleComboActive(id, !current);
      setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, active: !current } : c)));
    } catch (err) {
      console.error('Toggle active failed:', err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateCombo(id);
      await load();
    } catch (err) {
      console.error('Duplicate failed:', err);
      alert(t('adminCombos.messages.duplicateFailed'));
    }
  };

  const handleDelete = async () => {
    if (deleteIds.size === 0) return;
    setDeleting(true);
    try {
      await deleteCombos(Array.from(deleteIds));
      setCombos((prev) => prev.filter((c) => !deleteIds.has(c.id)));
      manager.removeLocally(Array.from(deleteIds));
      setDeleteIds(new Set());
    } catch (err) {
      console.error('Delete failed:', err);
      alert(t('adminCombos.messages.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmReset = () => {
    if (window.confirm(t('adminCombos.sort.resetConfirm'))) resetOrder();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-forest-500" size={32} />
      </div>
    );
  }

  const bulkLabels = {
    selected: t('adminCombos.bulk.selected'),
    activate: t('adminCombos.bulk.activate'),
    deactivate: t('adminCombos.bulk.deactivate'),
    pin: t('adminCombos.bulk.pin'),
    unpin: t('adminCombos.bulk.unpin'),
    delete: t('adminCombos.bulk.delete'),
    clear: t('adminCombos.bulk.clear'),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-semibold text-gray-900">
          {t('adminCombos.title')}
          {savingOrder && <span className="ml-3 text-sm text-emerald-600 font-medium">{t('adminProducts.messages.savingOrder')}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={confirmReset} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-cream-300 hover:border-forest-400 hover:text-forest-700 transition-all">
            {t('adminCombos.sort.reset')}
          </button>
          <Link to="/admin/combos/new" className="btn-primary inline-flex items-center gap-2">
            <Plus size={18} />
            {t('adminCombos.add')}
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <SortToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('adminCombos.search.placeholder')}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          sortModes={COMBO_SORT_MODES}
          label={(k) => t(k)}
          manualHint={search.trim() ? t('adminCombos.sort.searchHint') : t('adminCombos.sort.manualHint')}
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

      {visible.length === 0 ? (
        <p className="text-gray-500 text-center py-12">{t('adminCombos.messages.noCombos')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-3 py-2 bg-white/60 border border-cream-200 rounded-t-2xl text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-cream-300 text-forest-700 focus:ring-forest-500"
              />
              {selected.size > 0
                ? t('adminCombos.bulk.selected', { count: selected.size })
                : t('adminProducts.labels.selectAll')}
            </label>
            <span className="text-gray-400 normal-case">{t('adminProducts.labels.dragHint')}</span>
          </div>
          <SortableList ids={visible.map((c) => c.id)} onDragEnd={handleDragEnd} disabled={!canReorder}>
            <div className="space-y-3 mt-3">
              {visible.map((combo) => (
                <SortableCard
                  key={combo.id}
                  id={combo.id}
                  canReorder={canReorder}
                  pinned={combo.is_pinned}
                  onTogglePin={() => togglePin(combo.id)}
                  onMoveUp={() => moveUp(combo.id)}
                  onMoveDown={() => moveDown(combo.id)}
                  selected={selected.has(combo.id)}
                  onToggleSelect={() => toggleSelected(combo.id)}
                  showCheckbox
                  className="bg-white border border-cream-200 shadow-soft"
                >
                  <div className="p-4 flex items-center gap-4">
                    <ProductImage
                      src={combo.image}
                      alt={combo.name}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-gray-900 truncate">{combo.name}</h3>
                        {combo.featured && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium">{t('adminCombos.badges.featured')}</span>
                        )}
                        {combo.is_pinned && (
                          <span className="text-xs bg-forest-50 text-forest-700 px-1.5 py-0.5 rounded font-medium">{t('adminCombos.badges.pinned')}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${combo.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {combo.active ? t('adminCombos.badges.active') : t('adminCombos.badges.inactive')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{combo.tagline}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span>RM {formatCurrency(Number(combo.price))}</span>
                        {Number(combo.original_value) > 0 && (
                          <span className="line-through text-gray-400">RM {formatCurrency(Number(combo.original_value))}</span>
                        )}
                        <span>{t('adminCombos.buttons.servings', { count: combo.servings })}</span>
                        <span>{t('adminCombos.buttons.items', { count: itemCounts[combo.id] ?? '...' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleFeatured(combo.id, combo.featured)}
                        className={`px-3 py-1.5 text-sm rounded font-medium transition-all ${
                          combo.featured ? 'bg-amber-400 text-white hover:bg-amber-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Star size={14} className="inline mr-1 -mt-0.5 fill-current" />
                        {combo.featured ? t('adminCombos.buttons.featured') : t('adminCombos.buttons.feature')}
                      </button>
                      <button
                        onClick={() => handleToggleActive(combo.id, combo.active)}
                        className={`px-3 py-1.5 text-sm rounded transition-all ${
                          combo.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        {combo.active ? t('adminCombos.buttons.deactivate') : t('adminCombos.buttons.activate')}
                      </button>
                      <Link
                        to={`/admin/combos/edit/${combo.id}`}
                        className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
                        title={t('adminCombos.buttons.edit')}
                      >
                        <Pencil size={16} />
                      </Link>
                      <RowMenu
                        title={t('adminCombos.buttons.edit')}
                        actions={[
                          { key: 'duplicate', label: t('adminCombos.buttons.duplicate'), onClick: () => handleDuplicate(combo.id) },
                          {
                            key: 'pin',
                            label: combo.is_pinned ? t('adminProducts.actions.unpin') : t('adminProducts.actions.pin'),
                            onClick: () => togglePin(combo.id),
                          },
                          {
                            key: 'delete',
                            label: t('adminCombos.buttons.delete'),
                            danger: true,
                            onClick: () => setDeleteIds(new Set([combo.id])),
                          },
                        ]}
                      />
                    </div>
                  </div>
                </SortableCard>
              ))}
            </div>
          </SortableList>

          <div className="text-right text-xs text-gray-400 mt-2">
            {t('adminCombos.count', { count: totalCount })}
          </div>
        </>
      )}

      {deleteIds.size > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setDeleteIds(new Set())} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeSlideUp_0.2s_ease-out]">
            <h3 className="font-semibold text-gray-900 text-lg mb-4">{t('adminCombos.buttons.delete')}</h3>
            <p className="text-sm text-gray-600 mb-6">{t('adminCombos.messages.deleteConfirm')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteIds(new Set())} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                {t('adminProducts.buttons.cancel')}
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {deleting ? t('adminProducts.messages.deleting') : t('adminCombos.buttons.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <UndoToast
          message={toast.message}
          undoLabel={t('adminCombos.toast.undo')}
          onUndo={toast.undo}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
