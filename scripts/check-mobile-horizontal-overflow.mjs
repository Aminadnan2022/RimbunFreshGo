import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const header = read('src/components/layout/Header.tsx');
const shop = read('src/pages/ShopPage.tsx');
const productCard = read('src/components/ui/ProductCard.tsx');

const checks = [
  [header, 'flex min-w-0 items-center justify-between gap-2 h-16', 'header row can shrink inside the viewport'],
  [header, 'hidden leading-none sm:block', 'mobile header hides wordmark text while preserving the logo'],
  [header, 'flex min-w-0 shrink-0 items-center gap-1', 'authenticated header actions retain bounded touch targets'],
  [header, 'className="min-w-0 flex-1 bg-cream-50', 'header search input may shrink'],
  [shop, 'w-full min-w-0 max-w-7xl', 'Shop root is viewport-bounded'],
  [shop, 'relative min-w-0 flex-1', 'Shop search field may shrink beside its filter button'],
  [shop, 'grid min-w-0 grid-cols-1', 'Shop grid may shrink'],
  [productCard, 'card card-hover flex min-w-0 max-w-full', 'product cards cannot widen their grid track'],
  [productCard, 'flex min-w-0 items-end justify-between gap-2', 'product price and controls share a shrinkable row'],
];

for (const [source, expected, description] of checks) {
  if (!source.includes(expected)) {
    throw new Error(`Mobile overflow regression: ${description}`);
  }
}

console.log('Mobile horizontal overflow layout guards passed.');
