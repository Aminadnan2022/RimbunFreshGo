import assert from 'node:assert/strict';
import {
  buildCartItem,
  computeSubtotal,
  isBulkWeighedPieceItem,
  isBulkWeighedPieceProduct,
} from '../src/lib/sellingOptions.ts';
import type { Product } from '../src/types/index.ts';

const bulkPieceFish: Product = {
  id: 'selar-test',
  name: 'Selar',
  nameMs: 'Ikan Selar',
  category: 'fish',
  price: 14,
  unit: 'per kg',
  description: '',
  longDescription: '',
  image: '',
  images: [],
  freshness: 'available',
  preparationOptions: [],
  vendorId: 'supplier-1',
  tags: [],
  orderingMode: 'weight_only',
  selling_unit: 'piece',
  averageWeight: 100,
  displayOrder: 0,
  isPinned: false,
};

const bulkWeightFish: Product = {
  ...bulkPieceFish,
  id: 'selar-by-weight-test',
  selling_unit: 'kg',
};

assert.equal(isBulkWeighedPieceProduct(bulkPieceFish), true);

const fiveFish = buildCartItem(bulkPieceFish, { quantity: 5 });
assert.equal(fiveFish.quantity, 5, 'customer count is retained');
assert.equal(fiveFish.sellingUnit, 'piece', 'customer buying unit is frozen');
assert.equal(fiveFish.estimatedWeight, 0.5, 'five 100g fish estimate to 0.5kg');
assert.equal(fiveFish.pricingType, 'per_kg');
assert.equal(isBulkWeighedPieceItem(fiveFish), true);
assert.equal(computeSubtotal(bulkPieceFish, { quantity: 5 }), 7);

const halfKg = buildCartItem(bulkWeightFish, { weightG: 500 });
assert.equal(halfKg.quantity, 1, 'kg orders remain a single weighted line');
assert.equal(halfKg.estimatedWeight, 0.5);
assert.equal(isBulkWeighedPieceItem(halfKg), false);

console.log('piece-count bulk-weight ordering checks passed');
