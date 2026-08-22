import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const panel = readFileSync(
  resolve(root, 'src/components/delivery/DeliveryProofPanel.tsx'),
  'utf8',
);
const failures = [];

for (const token of [
  'const [advanceToPlacement, setAdvanceToPlacement] = useState(false);',
  "if (proofType === 'closeup') {",
  'setAdvanceToPlacement(true);',
  "behavior: 'smooth'",
  "block: 'center'",
  'placementActionRef.current?.focus({ preventScroll: true });',
  'cardRef={placementCardRef}',
  'actionRef={placementActionRef}',
  'capture="environment"',
  "? 'Take Photo 2'",
]) {
  if (!panel.includes(token)) failures.push(`missing rider photo hand-off: ${token}`);
}

if (/setAdvanceToPlacement\(true\)[\s\S]{0,500}?\.click\(\)/.test(panel)) {
  failures.push('the async upload completion must not programmatically open the file picker');
}

if (failures.length) {
  console.error('Rider delivery proof auto-advance checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Rider delivery proof auto-advance checks passed.');
