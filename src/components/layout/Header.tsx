import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, Menu, X, Leaf, Eye, EyeOff, LogIn, LogOut, ShieldCheck, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

// ---------------------------------------------------------------------------
// Sign In Modal
// ---------------------------------------------------------------------------
function SignInModal({ onClose, onSwitchToCreate, onSuccess }: {
  onClose: () => void;
  onSwitchToCreate: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      onClose();
      onSuccess();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-[fadeSlideUp_0.2s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          aria-label={t("header.signIn.close")}
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 gradient-card rounded-2xl flex items-center justify-center shadow-green">
            <LogIn size={18} className="text-white" />
          </div>
          <div>
            <h2 id="signin-title" className="font-display font-bold text-forest-900 text-xl leading-tight">
              {t("header.signIn.title")}
            </h2>
            <p className="text-sm text-gray-500">{t("header.signIn.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="si-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("header.signIn.emailLabel")}
            </label>
            <input
              id="si-email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("header.signIn.emailPlaceholder")}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="si-password" className="block text-sm font-medium text-gray-700">
                {t("header.signIn.passwordLabel")}
              </label>
              <button
                type="button"
                className="text-xs text-forest-700 font-medium hover:underline"
              >
                {t("header.signIn.forgotPassword")}
              </button>
            </div>
            <div className="relative">
              <input
                  id="si-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder={t("header.signIn.passwordPlaceholder")}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? t("header.signIn.hidePassword") : t("header.signIn.showPassword")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
            {loading ? t("header.signIn.signingIn") : t("header.signIn.signIn")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {t("header.signIn.noAccount")}{' '}
          <button
            type="button"
            onClick={onSwitchToCreate}
            className="text-forest-700 font-semibold hover:underline"
          >
            {t("header.signIn.createOne")}
          </button>
        </p>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Create Account Modal
// ---------------------------------------------------------------------------
function CreateAccountModal({ onClose, onSwitchToSignIn }: { onClose: () => void; onSwitchToSignIn: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-account-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-[fadeSlideUp_0.2s_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
          aria-label={t("header.createAccount.close")}
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 gradient-card rounded-2xl flex items-center justify-center shadow-green">
            <User size={18} className="text-white" />
          </div>
          <div>
            <h2 id="create-account-title" className="font-display font-bold text-forest-900 text-xl leading-tight">
              {t("header.createAccount.title")}
            </h2>
            <p className="text-sm text-gray-500">{t("header.createAccount.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ca-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("header.createAccount.nameLabel")}
            </label>
            <input
              id="ca-name"
              type="text"
              autoComplete="name"
              required
              placeholder={t("header.createAccount.namePlaceholder")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="ca-email" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("header.createAccount.emailLabel")}
            </label>
            <input
              id="ca-email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("header.createAccount.emailPlaceholder")}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="ca-password" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("header.createAccount.passwordLabel")}
            </label>
            <div className="relative">
              <input
                  id="ca-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder={t("header.createAccount.passwordPlaceholder")}
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? t("header.createAccount.hidePassword") : t("header.createAccount.showPassword")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
            {loading ? t("header.createAccount.creating") : t("header.createAccount.createAccount")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {t("header.createAccount.hasAccount")}{' '}
          <button
            type="button"
            onClick={onSwitchToSignIn}
            className="text-forest-700 font-semibold hover:underline"
          >
            {t("header.createAccount.signIn")}
          </button>
        </p>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
export default function Header() {
  const { itemCount } = useCart();
  const { user, signOut, isAdmin, isSupplier } = useAuth();
  const { state: authModalState, openSignIn, closeSignIn } = useAuthModal();
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const navigate = useNavigate();

  const navLinks = [
    { to: '/shop', label: 'header.shop' },
    { to: '/combo', label: 'header.familyCombo' },
    { to: '/vendors', label: 'header.ourSuppliers' },
    { to: '/recurring', label: 'header.recurringBasket' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const displayName: string = user?.user_metadata?.full_name ?? user?.email ?? '';
  const initial: string = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-cream-200 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Wordmark */}
          <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="w-8 h-8 gradient-card rounded-xl flex items-center justify-center shadow-green group-hover:scale-105 transition-transform">
              <Leaf size={16} className="text-white" />
            </div>
            <div className="leading-none">
              <span className="font-display font-bold text-forest-800 text-lg tracking-tight">Rimbun</span>
              <span className="font-display font-bold text-jade-600 text-lg tracking-tight"> FreshGo</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {!isSupplier && navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
              >
                {t(link.label)}
              </Link>
            ))}
            {user && !isSupplier && (
              <>
                <Link
                  to="/orders"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
                >
                  {t("header.myOrders")}
                </Link>
                <Link
                  to="/profile"
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
                >
                  {t("header.profile")}
                </Link>
              </>
            )}
            {isAdmin && (
              <Link
                to="/admin/products"
                className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 hover:bg-forest-50 transition-all inline-flex items-center gap-1.5"
              >
                <ShieldCheck size={15} />
                {t("header.admin")}
              </Link>
            )}
            {isSupplier && (
              <Link
                to="/supplier"
                className="px-4 py-2 rounded-xl text-sm font-medium text-forest-700 hover:bg-forest-50 transition-all inline-flex items-center gap-1.5"
              >
                <Warehouse size={15} />
                {t("header.supplierPortal")}
              </Link>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Search toggle */}
            {!isSupplier && (
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2.5 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
                aria-label={t("header.search")}
              >
                <Search size={20} />
              </button>
            )}

            {/* Language Switcher */}
            <LanguageSwitcher />

            {user ? (
              /* Signed-in state */
              <div className="hidden sm:flex items-center gap-2 ml-1">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-forest-50 border border-forest-100">
                  <div className="w-6 h-6 rounded-full bg-forest-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initial}
                  </div>
                  <span className="text-sm font-medium text-forest-800 max-w-[120px] truncate">
                    {displayName}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                  aria-label={t("header.logout")}
                >
                  <LogOut size={17} />
                  {t("header.logout")}
                </button>
              </div>
            ) : (
              /* Signed-out state */
              <>
                <button
                  onClick={() => openSignIn()}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
                >
                  <LogIn size={17} />
                  {t("header.login")}
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-forest-700 border border-forest-200 hover:bg-forest-50 transition-all"
                >
                  <User size={17} />
                  {t("header.join")}
                </button>
              </>
            )}

            {/* Cart */}
            {user && !isSupplier && (
              <Link
                to="/cart"
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-forest-700 text-white hover:bg-forest-800 transition-all ml-1"
                aria-label={`${t("header.cart")}, ${itemCount} items`}
              >
                <ShoppingCart size={18} />
                {itemCount > 0 && (
                  <span className="text-sm font-semibold">{itemCount}</span>
                )}
                {itemCount === 0 && (
                  <span className="hidden sm:block text-sm font-medium">{t("header.cart")}</span>
                )}
              </Link>
            )}

            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2.5 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50 transition-all"
              aria-label={t("header.menu")}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Inline search bar */}
        {searchOpen && (
          <div className="py-3 border-t border-cream-200">
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("header.searchPlaceholder")}
                className="flex-1 bg-cream-50 border border-cream-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent"
                autoFocus
              />
              <button type="submit" className="btn-primary py-2.5 px-5 text-sm">
                {t("header.searchButton")}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden border-t border-cream-200 bg-white px-4 py-3 space-y-1">
          {!isSupplier && navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
            >
              {t(link.label)}
            </Link>
          ))}
          {user && !isSupplier && (
            <>
              <Link
                to="/orders"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
              >
                {t("header.myOrders")}
              </Link>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
              >
                {t("header.profile")}
              </Link>
            </>
          )}
          {isAdmin && (
            <Link
              to="/admin/products"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-forest-700 hover:bg-forest-50 transition-all"
            >
              <ShieldCheck size={15} />
              {t("header.admin")}
            </Link>
          )}
          {isSupplier && (
            <Link
              to="/supplier"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-forest-700 hover:bg-forest-50 transition-all"
            >
              <Warehouse size={15} />
              {t("header.supplierPortal")}
            </Link>
          )}
          <div className="pt-1 border-t border-cream-100 mt-1 space-y-1">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-forest-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initial}
                  </div>
                  <span className="text-sm font-medium text-forest-800 truncate">{displayName}</span>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); signOut(); }}
                  className="block w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-forest-700 hover:bg-forest-50 transition-all"
                >
                  {t("header.logOut")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setMenuOpen(false); openSignIn(); }}
                  className="block w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:text-forest-700 hover:bg-forest-50 transition-all"
                >
                  {t("header.signInButton")}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setShowCreateModal(true); }}
                  className="block w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold text-forest-700 hover:bg-forest-50 transition-all"
                >
                  {t("header.createAccountButton")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {authModalState.open && (
        <SignInModal
          onClose={closeSignIn}
          onSwitchToCreate={() => { closeSignIn(); setShowCreateModal(true); }}
          onSuccess={() => {
            closeSignIn();
            navigate('/auth/redirect', { state: { returnTo: authModalState.returnTo } });
          }}
        />
      )}
      {showCreateModal && (
        <CreateAccountModal
          onClose={() => setShowCreateModal(false)}
          onSwitchToSignIn={() => { setShowCreateModal(false); openSignIn(); }}
        />
      )}
    </header>
  );
}


