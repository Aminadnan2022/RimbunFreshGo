import { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, X, AlertTriangle, Package, Loader2, Settings, ShoppingBag, Truck, CheckCircle2, AlertCircle, PenLine, ShieldAlert, Clock, Calendar, Users, ClipboardList, ChevronLeft, CreditCard, Phone, Copy, MapPin } from 'lucide-react';
import { getPrepLabel } from '../lib/preparationOptions';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../hooks/useProducts';
import { deleteProduct } from '../data/products';
import { useDeliveryConfig } from '../context/DeliveryConfigContext';
import { supabase } from '../lib/supabase';
import type { PaymentStatus, ComboExpandedItem } from '../types';

type Tab = 'products' | 'settings' | 'users' | 'orders';

export default function AdminProductsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('products');

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
      <div className="mb-6">
        <h1 className="font-display font-bold text-forest-900 text-2xl">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage products and site settings</p>
      </div>

      <div className="flex gap-1 border-b border-cream-200 mb-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'products'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ShoppingBag size={16} />
          Products
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'settings'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Settings size={16} />
          Settings
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'users'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Users size={16} />
          Users
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'orders'
              ? 'border-forest-700 text-forest-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <ClipboardList size={16} />
          Orders
        </button>
      </div>

      {activeTab === 'products' ? <ProductsTab /> : activeTab === 'settings' ? <SettingsTab /> : activeTab === 'users' ? <UsersTab /> : <OrdersTab />}
    </main>
  );
}

function ProductsTab() {
  const { products, loading, error } = useProducts();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const filtered = products
    .filter((p) => !deletedIds.has(p.id))
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.nameMs.toLowerCase().includes(q) || p.category.includes(q);
    });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      setDeletedIds((prev) => new Set(prev).add(deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-sm text-gray-500">{filtered.length} products</p>
        <Link to="/admin/products/new" className="btn-primary inline-flex items-center gap-2 self-start">
          <Plus size={18} />
          Add Product
        </Link>
      </div>

      <div className="relative mb-6">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search by name, Malay name, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-11"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-forest-500" size={32} />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{search ? 'No products match your search.' : 'No products yet.'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 border-b border-cream-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-8">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Product</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Category</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Price</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {filtered.map((product, index) => (
                    <tr key={product.id} className="hover:bg-cream-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={product.image} alt={product.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-400 truncate">{product.nameMs}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-forest-50 text-forest-700 capitalize">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">RM{product.price.toFixed(2)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          product.freshness === 'available' ? 'bg-green-50 text-green-700' :
                          product.freshness === 'limited' ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {product.freshness}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link to={`/admin/products/edit/${product.id}`} className="p-2 rounded-lg text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all" title="Edit">
                            <Pencil size={16} />
                          </Link>
                          <button onClick={() => setDeleteTarget({ id: product.id, name: product.name })} className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all" title="Delete">
                            <Trash2 size={16} />
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
            {search.trim()
              ? `Showing ${filtered.length} of ${products.length} products`
              : `Total Products: ${products.length}`}
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
              <h3 className="font-semibold text-gray-900 text-lg">Delete Product</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-all disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsTab() {
  const { config, loading, updateConfig } = useDeliveryConfig();
  const [editing, setEditing] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [customDay, setCustomDay] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftAnnouncement, setDraftAnnouncement] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Pickup locations state
  const [editingLocations, setEditingLocations] = useState(false);
  const [draftLocations, setDraftLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState('');
  const [savingLocations, setSavingLocations] = useState(false);
  const [locStatus, setLocStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [locError, setLocError] = useState('');

  const handleEditClick = () => {
    setShowWarning(true);
  };

  const handleConfirmEdit = () => {
    setDraftDays([...config.days]);
    setDraftTime(config.time);
    setDraftAnnouncement(config.announcement);
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
      setErrorMsg('Add at least one delivery day.');
      return;
    }
    if (!draftTime.trim()) {
      setStatus('error');
      setErrorMsg('Enter a delivery time window.');
      return;
    }
    if (!draftAnnouncement.trim()) {
      setStatus('error');
      setErrorMsg('Announcement message cannot be empty.');
      return;
    }
    setSaving(true);
    setStatus('idle');
    try {
      await updateConfig({
        days: draftDays,
        time: draftTime.trim(),
        announcement: draftAnnouncement.trim(),
      });
      setStatus('success');
      setEditing(false);
      setTimeout(() => setStatus('idle'), 4000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditLocations = () => {
    setDraftLocations([...config.pickupLocations]);
    setEditingLocations(true);
    setLocStatus('idle');
  };

  const addLocation = () => {
    const trimmed = newLocation.trim();
    if (trimmed && !draftLocations.includes(trimmed)) {
      setDraftLocations([...draftLocations, trimmed]);
    }
    setNewLocation('');
  };

  const removeLocation = (loc: string) => {
    setDraftLocations(draftLocations.filter((l) => l !== loc));
  };

  const handleSaveLocations = async () => {
    if (draftLocations.length === 0) {
      setLocStatus('error');
      setLocError('Add at least one pickup location.');
      return;
    }
    setSavingLocations(true);
    setLocStatus('idle');
    try {
      await updateConfig({ pickupLocations: draftLocations });
      setLocStatus('success');
      setEditingLocations(false);
      setTimeout(() => setLocStatus('idle'), 4000);
    } catch (err) {
      setLocStatus('error');
      setLocError(err instanceof Error ? err.message : 'Failed to save locations.');
    } finally {
      setSavingLocations(false);
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* Current Live Settings */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
            <Truck size={20} className="text-forest-700" />
          </div>
          <div>
            <h2 className="font-semibold text-forest-900 text-base">Delivery Settings</h2>
            <p className="text-xs text-gray-500 mt-0.5">These settings affect the entire site -- announcement bar, product pages, checkout, and footer</p>
          </div>
        </div>

        {/* Current live values */}
        {!editing && (
          <div className="space-y-4 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar size={14} className="text-forest-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery Days</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{daysText}</p>
              </div>
              <div className="bg-cream-50 rounded-xl p-4 border border-cream-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <Clock size={14} className="text-forest-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Window</p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{config.time}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Announcement Bar Preview</p>
              <div className="gradient-forest text-white py-2.5 px-4 rounded-xl text-center text-sm font-medium">
                <div className="flex items-center justify-center gap-2">
                  <Truck size={15} className="opacity-90 flex-shrink-0" />
                  <span>{config.announcement}</span>
                </div>
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
                Delivery Days
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
                  <span className="text-sm text-gray-400 italic">No days added yet</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customDay}
                  onChange={(e) => setCustomDay(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomDay(); } }}
                  placeholder="Type a day name (e.g. Monday, 1st Saturday)..."
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={addCustomDay}
                  disabled={!customDay.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-forest-700 text-white hover:bg-forest-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Add any custom day names. These will appear as delivery slot options across the site.</p>
            </div>

            {/* Delivery Time */}
            <div>
              <label htmlFor="delivery_time" className="block text-sm font-medium text-gray-700 mb-2">
                <Clock size={14} className="inline mr-1.5 -mt-0.5" />
                Delivery Time Window
              </label>
              <input
                id="delivery_time"
                type="text"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                placeholder="e.g. 6:30-8:00 PM"
                className="input-field max-w-xs"
              />
              <p className="text-xs text-gray-400 mt-1.5">Shown on delivery slots, checkout, and product pages.</p>
            </div>

            {/* Announcement Message */}
            <div>
              <label htmlFor="announcement_msg" className="block text-sm font-medium text-gray-700 mb-2">
                <Truck size={14} className="inline mr-1.5 -mt-0.5" />
                Announcement Bar Message
              </label>
              <textarea
                id="announcement_msg"
                value={draftAnnouncement}
                onChange={(e) => setDraftAnnouncement(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder="e.g. We deliver to your door every Tuesday & Saturday, 9:00 AM - 12:00 PM"
              />
              <p className="text-xs text-gray-400 mt-1.5">Full custom message shown in the green bar at the top of every page.</p>
            </div>

            {/* Preview */}
            {draftAnnouncement.trim() && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Live Preview</p>
                <div className="gradient-forest text-white py-2.5 px-4 rounded-xl text-center text-sm font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <Truck size={15} className="opacity-90 flex-shrink-0" />
                    <span>{draftAnnouncement}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Saving...' : 'Save All Settings'}
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
            Edit Settings
          </button>
        )}
      </section>

      {/* Status messages */}
      {status === 'success' && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium animate-[fadeSlideUp_0.2s_ease-out]">
          <CheckCircle2 size={18} /> Settings updated successfully! Changes are now live across the site.
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
              <h3 className="font-semibold text-gray-900 text-lg">Edit Live Settings</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Changes you save here will <strong>immediately update</strong> the delivery schedule and announcement shown across the entire site.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This affects the announcement bar, product pages, checkout flow, footer, and delivery slot options.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowWarning(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Keep Current
              </button>
              <button
                onClick={handleConfirmEdit}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-forest-700 hover:bg-forest-800 transition-all"
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pickup Locations */}
      <section className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
            <MapPin size={20} className="text-forest-700" />
          </div>
          <div>
            <h2 className="font-semibold text-forest-900 text-base">Pickup Locations</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage the delivery drop-off points shown to customers during checkout</p>
          </div>
        </div>

        {!editingLocations ? (
          <>
            <ul className="space-y-2 mb-5">
              {config.pickupLocations.map((loc) => (
                <li key={loc} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-forest-500 flex-shrink-0" />
                  {loc}
                </li>
              ))}
              {config.pickupLocations.length === 0 && (
                <li className="text-sm text-gray-400 italic">No pickup locations configured.</li>
              )}
            </ul>
            <button
              type="button"
              onClick={handleEditLocations}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-forest-700 border-2 border-forest-200 bg-forest-50 hover:bg-forest-100 transition-all"
            >
              <PenLine size={16} />
              Edit Locations
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {draftLocations.map((loc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 bg-cream-50 border border-cream-200 rounded-xl px-3 py-2">{loc}</span>
                  <button
                    type="button"
                    onClick={() => removeLocation(loc)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {draftLocations.length === 0 && (
                <p className="text-sm text-gray-400 italic">No locations added yet.</p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); } }}
                placeholder="e.g. Delivery to Lobby A Rimbun"
                className="input-field flex-1"
              />
              <button
                type="button"
                onClick={addLocation}
                disabled={!newLocation.trim()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-forest-700 text-white hover:bg-forest-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setEditingLocations(false)}
                disabled={savingLocations}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLocations}
                disabled={savingLocations}
                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
              >
                {savingLocations ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {savingLocations ? 'Saving...' : 'Save Locations'}
              </button>
            </div>
            {locStatus === 'error' && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                <AlertCircle size={16} /> {locError}
              </div>
            )}
          </div>
        )}

        {locStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mt-3 animate-[fadeSlideUp_0.2s_ease-out]">
            <CheckCircle2 size={16} /> Pickup locations updated successfully.
          </div>
        )}
      </section>
    </div>
  );
}
type UserRoleValue = 'admin' | 'supplier' | 'customer';

type UserRow = {
  id: string;
  email: string;
  role: UserRoleValue;
};

const roleBadgeClass: Record<UserRoleValue, string> = {
  admin:    'bg-forest-50 text-forest-700',
  supplier: 'bg-jade-50 text-jade-700',
  customer: 'bg-cream-100 text-gray-600',
};

function UsersTab() {
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
          r === 'admin' ? 'admin' : r === 'supplier' ? 'supplier' : 'customer';
        return { id: u.id, email: u.email, role };
      });

      merged.sort((a, b) => {
        const order: Record<UserRoleValue, number> = { admin: 0, supplier: 1, customer: 2 };
        return order[a.role] - order[b.role] || a.email.localeCompare(b.email);
      });

      setUsers(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
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

      // Optimistic update — re-fetch to confirm
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
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
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Role</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              const isLoading = mutating === u.id;

              const actions: { label: string; to: UserRoleValue; danger?: boolean }[] =
                u.role === 'customer'
                  ? [
                      { label: 'Promote to Supplier', to: 'supplier' },
                      { label: 'Promote to Admin',    to: 'admin' },
                    ]
                  : u.role === 'supplier'
                  ? [
                      { label: 'Make Customer',    to: 'customer', danger: true },
                      { label: 'Promote to Admin', to: 'admin' },
                    ]
                  : [
                      { label: 'Make Supplier', to: 'supplier' },
                      { label: 'Make Customer', to: 'customer', danger: true },
                    ];

              return (
                <tr key={u.id} className="hover:bg-cream-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.email}
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadgeClass[u.role]}`}>
                      {u.role}
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
                          title={isSelf ? 'Cannot change your own role' : undefined}
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
  deliveryWindow: string;
  deliveryNotes: string;
  createdAt: string;
  total: number;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  orderStatus: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orderItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supplierWeights: Record<string, number>;
  deliveryFee: number;
  subtotal: number;
}

const PAYMENT_FILTERS: { label: string; value: PaymentStatus | 'all' }[] = [
  { label: 'All',           value: 'all' },
  { label: 'Pending',       value: 'Pending' },
  { label: 'Ready To Pay',  value: 'Ready To Pay' },
  { label: 'Paid',          value: 'Paid' },
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

const ORDER_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  'confirmed':        { label: 'Confirmed',       className: 'bg-jade-100 text-jade-700' },
  'preparing':        { label: 'Being Prepared',   className: 'bg-blue-100 text-blue-700' },
  'out-for-delivery': { label: 'Out for Delivery', className: 'bg-amber-100 text-amber-700' },
  'delivered':        { label: 'Delivered',        className: 'bg-forest-100 text-forest-700' },
};

function AdminOrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS_BADGE[status] ?? ORDER_STATUS_BADGE['confirmed'];
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
    `RM ${order.total.toFixed(2)}`,
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

function OrdersTab() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PaymentStatus | 'all'>('all');
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('Orders')
        .select('id, full_name, phone_number, apartment, house_unit, pickup_location, order_notes, order_summary, order_items, supplier_weights, subtotal, delivery_fee, total, payment_status, paid_at, created_at')
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
          deliveryWindow: summary.deliveryWindow ?? '',
          deliveryNotes: r.order_notes ?? '',
          createdAt: r.created_at,
          total: Number(r.total),
          paymentStatus: (r.payment_status as PaymentStatus) ?? 'Pending',
          paidAt: r.paid_at ?? null,
          orderStatus: summary.status ?? 'confirmed',
          orderItems: r.order_items ?? [],
          supplierWeights: (r.supplier_weights as Record<string, number>) ?? {},
          deliveryFee: Number(r.delivery_fee),
          subtotal: Number(r.subtotal),
        };
      });

      setOrders(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.paymentStatus === filter);

  if (selected) {
    return (
      <AdminOrderDetailView
        order={selected}
        onBack={() => setSelected(null)}
        onUpdated={() => { setSelected(null); load(); }}
      />
    );
  }

  return (
    <>
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {PAYMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f.value
                ? 'bg-forest-700 text-white'
                : 'bg-cream-100 text-gray-600 hover:bg-cream-200'
            }`}
          >
            {f.label}
          </button>
        ))}
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
          <p className="text-gray-500">{filter === 'all' ? 'No orders yet.' : `No orders with status "${filter}".`}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-cream-200 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream-50 border-b border-cream-200">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 w-8">#</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Order Ref</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Created</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Delivery</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Total</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Order Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Payment Status</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700">Action</th>
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
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell whitespace-nowrap">{order.deliveryDate || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">RM{order.total.toFixed(2)}</td>
                      <td className="px-4 py-3"><AdminOrderStatusBadge status={order.orderStatus} /></td>
                      <td className="px-4 py-3"><AdminPaymentBadge status={order.paymentStatus} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelected(order)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-right text-xs text-gray-400 mt-2">
            Showing {filtered.length} of {orders.length} orders
          </div>
        </>
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
      setSaveError(err instanceof Error ? err.message : 'Failed to confirm payment');
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
        <ChevronLeft size={16} /> Back to Orders
      </button>

      {/* Order header */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Order Ref</p>
            <p className="font-mono font-semibold text-gray-900 mt-0.5">{order.orderRef}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Customer</p>
            <p className="font-semibold text-gray-900 mt-0.5">{order.customerName}</p>
            {order.customerPhone && (
              <p className="text-xs text-gray-500 mt-0.5">{order.customerPhone}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Delivery Address</p>
            <p className="font-semibold text-gray-900 mt-0.5">Unit {order.houseUnit || '—'}</p>
            {order.apartment && <p className="text-xs text-gray-500">{order.apartment}</p>}
            {order.pickupLocation && <p className="text-xs text-gray-500">{order.pickupLocation}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Delivery Date</p>
            <p className="font-semibold text-gray-900 mt-0.5">{order.deliveryDate}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Placed</p>
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
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Item</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 hidden sm:table-cell">Prep</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Qty</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 hidden md:table-cell">Actual Weight</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Item Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {order.orderItems.map((item, i) => {
                  const isPerKg = item.pricingType === 'per_kg' || (!item.pricingType && item.unit === 'per kg');
                  const actualKg = order.supplierWeights[String(i)];
                  const lineTotal = isPerKg && actualKg
                    ? actualKg * item.price
                    : item.price * item.quantity;
                  const hasComboItems = item.comboItems && item.comboItems.length > 0;
                  return (
                    <tr key={i} className={`hover:bg-cream-50/50 ${hasComboItems ? 'bg-cream-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {item.name}
                        {!isPerKg && !hasComboItems && <span className="ml-2 text-xs text-jade-600 font-normal">Fixed</span>}
                        {hasComboItems && (
                          <div className="mt-2 pt-2 border-t border-cream-200 space-y-1.5">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contains</p>
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
                      <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {isPerKg && !hasComboItems
                          ? actualKg != null
                            ? <span className="font-medium text-gray-900">{actualKg} kg</span>
                            : <span className="text-amber-600 text-xs">Pending weighing</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        RM{lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-cream-200 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span><span>RM{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Delivery</span>
              <span>{order.deliveryFee === 0 ? 'FREE' : `RM${order.deliveryFee.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-cream-200 pt-2">
              <span>Final Amount</span>
              <span className="text-forest-800">RM{order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Customer remarks */}
      {order.deliveryNotes && (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5 mb-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Customer Remarks / Notes</p>
          <p className="text-sm text-gray-700">{order.deliveryNotes}</p>
        </div>
      )}

      {/* Payment section */}
      <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-5">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={18} className="text-forest-600" />
          <h3 className="font-semibold text-charcoal">Payment</h3>
        </div>

        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600 font-medium">Payment Status</span>
          <AdminPaymentBadge status={order.paymentStatus} />
        </div>

        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-gray-600 font-medium">Final Amount</span>
          <span className="font-bold text-forest-800 text-base">RM{order.total.toFixed(2)}</span>
        </div>

        {order.paymentStatus === 'Paid' && order.paidAt && (
          <div className="text-xs text-gray-400 mb-4">
            Confirmed on {new Date(order.paidAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
              WhatsApp Customer
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
              {copied ? 'Copied!' : 'Copy Payment Message'}
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
            >
              <CreditCard size={16} />
              Mark as Paid
            </button>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-[fadeSlideUp_0.2s_ease-out]">
            <CheckCircle2 size={16} /> Payment confirmed successfully.
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
              <h3 className="font-semibold text-gray-900 text-lg">Confirm Payment</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Have you confirmed payment has been received for order <strong>{order.orderRef}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPayment}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-all disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? 'Confirming...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
