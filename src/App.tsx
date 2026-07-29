import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthModalProvider } from './context/AuthModalContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import { BasketProvider } from './context/BasketContext';
import { DeliveryConfigProvider } from './context/DeliveryConfigContext';
import { LanguageProvider } from './context/LanguageContext';
import AnnouncementBar from './components/layout/AnnouncementBar';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductDetailPage from './pages/ProductDetailPage';
import ComboDetailPage from './pages/ComboDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import OrdersPage from './pages/OrdersPage';
import VendorsPage from './pages/VendorsPage';
import RecurringBasketPage from './pages/RecurringBasketPage';
import ProfilePage from './pages/ProfilePage';
import AdminProductsPage from './pages/AdminProductsPage';
import AdminProductFormPage from './pages/AdminProductFormPage';
import AuthRedirectPage from './pages/AuthRedirectPage';
import SupplierDashboardPage from './pages/SupplierDashboardPage';

function AppRoutes() {
  const { loading, isAdmin, isSupplier } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (loading || hasRedirected.current) return;
    hasRedirected.current = true;

    const target = isAdmin ? '/admin/products' : isSupplier ? '/supplier' : '/';
    if (location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [loading, isAdmin, isSupplier, navigate, location.pathname]);

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <AnnouncementBar />
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/combo" element={<ComboDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<OrderTrackingPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/recurring" element={<RecurringBasketPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/products" element={<AdminProductsPage />} />
          <Route path="/admin/products/new" element={<AdminProductFormPage />} />
          <Route path="/admin/products/edit/:id" element={<AdminProductFormPage />} />
          <Route path="/auth/redirect" element={<AuthRedirectPage />} />
          <Route path="/supplier" element={<SupplierDashboardPage />} />
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
    </BrowserRouter>
  );
}
