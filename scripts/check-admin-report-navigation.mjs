import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const admin = read('src/pages/AdminProductsPage.tsx');
const reports = read('src/pages/BusinessReportsPage.tsx');
const previous = read('src/pages/AdminHistoricalDataPage.tsx');
const navigation = read('src/components/admin/ReportsNavigation.tsx');
const routes = read('src/App.tsx');
const failures = [];

for (const token of ['/admin/reports', '/admin/historical', 'ReportsNavigation']) {
  if (!navigation.includes(token) && token !== 'ReportsNavigation') failures.push(`missing report navigation target: ${token}`);
}
if (!reports.includes('<ReportsNavigation />')) failures.push('Reports page must expose report section navigation');
if (!previous.includes('<ReportsNavigation />')) failures.push('Previous Data page must remain inside the Reports experience');
if (!previous.includes('to="/admin/reports"')) failures.push('Previous Data back action must return to Reports');
if (admin.includes('to="/admin/reports"') || admin.includes('to="/admin/historical"')) {
  failures.push('Admin Dashboard header must not expose duplicate report actions');
}
for (const route of ['path="/admin/reports"', 'path="/admin/historical"']) {
  if (!routes.includes(route)) failures.push(`route compatibility missing: ${route}`);
}

if (failures.length) {
  console.error('Admin report navigation checks failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin report navigation checks passed: one top-level destination, shared report sections, and compatible routes.');
