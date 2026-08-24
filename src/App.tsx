import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModalProvider } from './context/AuthModalContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import { BasketProvider } from './context/BasketContext';
import { DeliveryConfigProvider } from './context/DeliveryConfigContext';
import { WebsiteSettingsProvider, useWebsiteSettings } from './context/WebsiteSettingsContext';
import { FooterSettingsProvider } from './context/FooterSettingsContext';
import { LanguageProvider } from './context/LanguageContext';
import AnnouncementBar from './components/layout/AnnouncementBar';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ComboDetailPage from './pages/ComboDetailPage';
import ComboListPage from './pages/ComboListPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import OrdersPage from './pages/OrdersPage';
import VendorsPage from './pages/VendorsPage';
import RecurringBasketPage from './pages/RecurringBasketPage';
import ProfilePage from './pages/ProfilePage';
import AdminProductsPage from './pages/AdminProductsPage';
import AdminProductFormPage from './pages/AdminProductFormPage';
import AdminComboFormPage from './pages/AdminComboFormPage';
import BusinessReportsPage from './pages/BusinessReportsPage';
import AdminHistoricalDataPage from './pages/AdminHistoricalDataPage';
import AdminPreparationConfigurationsPage from './pages/AdminPreparationConfigurationsPage';
import AuthRedirectPage from './pages/AuthRedirectPage';
import SupplierDashboardPage from './pages/SupplierDashboardPage';
import DeliveryDashboardPage from './pages/DeliveryDashboardPage';
import MaintenancePage from './pages/MaintenancePage';
import FeatureRoute from './components/system/FeatureRoute';
import FullScreenLoader from './components/system/FullScreenLoader';
import NotificationsPage from './pages/NotificationsPage';

function AppRoutes() {
  const { loading, isAdmin, isSupplier, isRider } = useAuth();
  const { settings, loading: settingsLoading } = useWebsiteSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (loading || hasRedirected.current) return;
    hasRedirected.current = true;

    // Only redirect role-based home when landing on the root path.
    // Deep links (e.g. /shop, /product/:id, /admin/combos/new) must load as-is.
    if (location.pathname === '/') {
      const target = isAdmin ? '/admin' : isSupplier ? '/supplier' : isRider ? '/delivery' : '/';
      if (location.pathname !== target) {
        navigate(target, { replace: true });
      }
    }
  }, [loading, isAdmin, isSupplier, isRider, navigate, location.pathname]);

  // During initialization (auth session + settings) only the full screen loader may render,
  // so the guest layout (AnnouncementBar/Header/Footer) never flashes before auth resolves.
  if (loading || settingsLoading) {
    return <FullScreenLoader />;
  }

  // Maintenance mode: non-admin/non-supplier/non-rider visitors see the maintenance page.
  if (settings.maintenance_mode && !isAdmin && !isSupplier && !isRider && !settingsLoading && !loading) {
    return (
      <div className="min-h-screen bg-page flex flex-col">
        <div className="flex-1">
          <MaintenancePage />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <AnnouncementBar />
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={
            <FeatureRoute feature="show_shop"><ShopPage /></FeatureRoute>
          } />
          <Route path="/product/:id" element={
            <FeatureRoute feature="show_shop"><ProductDetailPage /></FeatureRoute>
          } />
          <Route path="/combos" element={
            <FeatureRoute feature="show_family_combo"><ComboListPage /></FeatureRoute>
          } />
          <Route path="/combos/:slug" element={
            <FeatureRoute feature="show_family_combo"><ComboDetailPage /></FeatureRoute>
          } />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<OrderTrackingPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/vendors" element={
            <FeatureRoute feature="show_suppliers"><VendorsPage /></FeatureRoute>
          } />
          <Route path="/recurring" element={
            <FeatureRoute feature="show_recurring_basket"><RecurringBasketPage /></FeatureRoute>
          } />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<AdminProductsPage />} />
          <Route path="/admin/products" element={<AdminProductsPage />} />
          <Route path="/admin/reports" element={<BusinessReportsPage />} />
          <Route path="/admin/historical" element={<AdminHistoricalDataPage />} />
          <Route path="/admin/preparation-configurations" element={<AdminPreparationConfigurationsPage />} />
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/edit/:id" element={<AdminProductFormPage />} />
          <Route path="/admin/combos" element={<AdminProductsPage />} />
          <Route path="/admin/combos/new" element={<AdminComboFormPage />} />
          <Route path="/admin/combos/edit/:id" element={<AdminComboFormPage />} />
          <Route path="/auth/redirect" element={<AuthRedirectPage />} />
          <Route path="/supplier" element={<SupplierDashboardPage />} />
          <Route path="/delivery" element={<DeliveryDashboardPage />} />
          <Route path="*" element={
            <div className="flex flex-col items-center justify-center py-32 text-center px-4">
              <p className="text-6xl font-display font-bold text-forest-200 mb-4">404</p>
              <h2 className="text-2xl font-bold text-charcoal mb-2">Page not found</h2>
              <p className="text-gray-500 mb-8">That page doesn't exist.</p>
              <a href="/" className="btn-primary">Back to Home</a>
            </div>
          } />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WebsiteSettingsProvider>
        <FooterSettingsProvider>
          <AuthProvider>
            <AuthModalProvider>
              <DeliveryConfigProvider>
                <CartProvider>
                  <OrderProvider>
                    <BasketProvider>
                      <LanguageProvider>
                        <AppRoutes />
                      </LanguageProvider>
                    </BasketProvider>
                  </OrderProvider>
                </CartProvider>
              </DeliveryConfigProvider>
            </AuthModalProvider>
          </AuthProvider>
        </FooterSettingsProvider>
      </WebsiteSettingsProvider>
    </BrowserRouter>
  );
}
