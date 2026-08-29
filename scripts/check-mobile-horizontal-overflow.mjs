import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const header = read('src/components/layout/Header.tsx');
const languageSwitcher = read('src/components/layout/LanguageSwitcher.tsx');
const shop = read('src/pages/ShopPage.tsx');
const checkout = read('src/pages/CheckoutPage.tsx');
const productCard = read('src/components/ui/ProductCard.tsx');
const comboDetail = read('src/pages/ComboDetailPage.tsx');
const admin = read('src/pages/AdminProductsPage.tsx');
const adminCombos = read('src/pages/AdminComboListPage.tsx');
const reports = read('src/pages/BusinessReportsPage.tsx');
const reportsNavigation = read('src/components/admin/ReportsNavigation.tsx');
const sortableCard = read('src/components/admin/sortable/SortableCard.tsx');

const checks = [
  [header, 'flex min-w-0 items-center justify-between gap-1 sm:gap-2 h-16', 'header row uses a compact mobile gap and can shrink inside the viewport'],
  [header, 'text-jade-600 sm:hidden', 'mobile header keeps the compact FreshGo wordmark visible'],
  [header, 'w-7 h-7 sm:w-8 sm:h-8', 'mobile header uses a compact logo beside the visible wordmark'],
  [header, 'flex min-w-0 shrink-0 items-center gap-0 sm:gap-1', 'authenticated header actions retain bounded touch targets with compact spacing'],
  [header, 'px-2 sm:px-3', 'mobile cart remains a compact touch target'],
  [header, 'className="min-w-0 flex-1 bg-cream-50', 'header search input may shrink'],
  [languageSwitcher, 'justify-center gap-0 px-2', 'mobile language action uses its globe-only compact touch target'],
  [languageSwitcher, 'hidden sm:inline', 'language text and flag remain available from the small breakpoint'],
  [shop, 'w-full min-w-0 max-w-7xl', 'Shop root is viewport-bounded'],
  [shop, 'relative min-w-0 flex-1', 'Shop search field may shrink beside its filter button'],
  [shop, 'grid min-w-0 grid-cols-1', 'Shop grid may shrink'],
  [checkout, 'w-full min-w-0 max-w-5xl', 'Checkout root is viewport-bounded'],
  [checkout, 'grid min-w-0 grid-cols-1 lg:grid-cols-3', 'Checkout columns collapse without widening mobile layout'],
  [checkout, 'card min-w-0 max-w-full p-5 sm:p-8 space-y-5', 'Checkout payment card cannot widen from receipt content'],
  [checkout, 'flex min-w-0 gap-3', 'Checkout payment actions may shrink within the viewport'],
  [productCard, 'card card-hover flex min-w-0 max-w-full', 'product cards cannot widen their grid track'],
  [productCard, 'flex min-w-0 items-end justify-between gap-2', 'product price and controls share a shrinkable row'],
  [comboDetail, 'grid min-w-0 grid-cols-1 lg:grid-cols-2', 'Combo detail hero has a shrinkable single-column mobile layout'],
  [comboDetail, 'flex min-w-0 flex-wrap items-end', 'Combo detail pricing can reflow'],
  [admin, 'overflow-x-auto overscroll-x-contain', 'admin tabs use an intentional internal touch scroller'],
  [admin, 'aria-selected={activeTab ===', 'admin active tabs are exposed and can be scrolled into view'],
  [admin, 'space-y-3 md:hidden', 'admin Users has a mobile card presentation'],
  [adminCombos, 'flex min-w-0 flex-col gap-3', 'admin Combo rows stack on mobile'],
  [adminCombos, 'grid grid-cols-2 gap-2 border-t', 'admin Combo actions reflow on mobile'],
  [reports, 'grid min-w-0 grid-cols-1 gap-3', 'report filters use a viewport-safe mobile grid'],
  [reports, 'grid min-w-0 grid-cols-1 gap-3 mb-6', 'report KPI cards reflow at narrow widths'],
  [reportsNavigation, 'overflow-x-auto overscroll-x-contain', 'report navigation scrolls internally'],
  [sortableCard, 'flex min-w-0 flex-col', 'sortable admin cards move reorder controls above mobile content'],
];

for (const [source, expected, description] of checks) {
  if (!source.includes(expected)) {
    throw new Error(`Mobile overflow regression: ${description}`);
  }
}

console.log('Mobile horizontal overflow layout guards passed.');
