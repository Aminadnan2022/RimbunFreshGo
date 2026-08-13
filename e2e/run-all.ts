import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

type Status = 'PASS' | 'FAIL' | 'ERROR' | 'TIMEOUT';

interface SuiteDef {
  order: number;
  name: string;
  file: string;
  tableLabel: string;
  timeoutMs: number;
}

interface SuiteResult {
  suite: SuiteDef;
  status: Status;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  reason?: string;
}

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(E2E_DIR, '..');

const SUITES: SuiteDef[] = [
  { order: 1, name: 'AUTH + ROLES', file: 'verify.auth.ts', tableLabel: 'AUTH', timeoutMs: 120_000 },
  { order: 2, name: 'ORDERS SCHEMA', file: 'verify.orders.ts', tableLabel: 'ORDERS', timeoutMs: 120_000 },
  { order: 3, name: 'CUSTOMER ORDERS RLS', file: 'verify.orders.rls.ts', tableLabel: 'CUSTOMER RLS', timeoutMs: 120_000 },
  { order: 4, name: 'SUPPLIER ORDERS RLS', file: 'verify.supplier.rls.ts', tableLabel: 'SUPPLIER RLS', timeoutMs: 120_000 },
  { order: 5, name: 'RIDER ORDERS RLS', file: 'verify.rider.rls.ts', tableLabel: 'RIDER RLS', timeoutMs: 120_000 },
  { order: 6, name: 'CHECKOUT', file: 'verify.checkout.ts', tableLabel: 'CHECKOUT', timeoutMs: 120_000 },
  { order: 7, name: 'ORDER CALCULATION', file: 'verify.order-calculation.ts', tableLabel: 'ORDER CALCULATION', timeoutMs: 120_000 },
  { order: 8, name: 'PAYMENT INTEGRITY', file: 'verify.payment.ts', tableLabel: 'PAYMENT INTEGRITY', timeoutMs: 180_000 },
  { order: 9, name: 'DELIVERY / RIDER WORKFLOW', file: 'verify.delivery.workflow.ts', tableLabel: 'DELIVERY WORKFLOW', timeoutMs: 180_000 },
  { order: 10, name: 'SUPPLIER WRITE GUARDS', file: 'verify.r4.ts', tableLabel: 'SUPPLIER WRITE GUARDS', timeoutMs: 180_000 },
];

function runSuite(suite: SuiteDef): Promise<SuiteResult> {
  return new Promise((done) => {
    const start = performance.now();
    const target = resolve(E2E_DIR, suite.file);
    const child = spawn(process.execPath, ['--experimental-strip-types', target], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, suite.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      done({
        suite,
        status: 'ERROR',
        exitCode: null,
        signal: null,
        durationMs: performance.now() - start,
        reason: err.message,
      });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const status: Status = timedOut ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL';
      done({ suite, status, exitCode: code, signal, durationMs: performance.now() - start });
    });
  });
}

const line = '═'.repeat(62);
const thin = '─'.repeat(58);

async function main(): Promise<void> {
  const startedAt = new Date();
  console.log(line);
  console.log('              FRESHGO MASTER E2E REGRESSION');
  console.log(line);
  console.log('Environment:');
  console.log(`Project: ${PROJECT_ROOT}`);
  console.log('Mode: sequential');
  console.log(`Suites: ${SUITES.length}`);
  console.log('');

  const results: SuiteResult[] = [];
  for (const suite of SUITES) {
    console.log(`[${suite.order}/${SUITES.length}] ${suite.name}`);
    const result = await runSuite(suite);
    results.push(result);
    console.log(`    ${result.status}`);
    console.log(`    Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.status !== 'PASS') {
      console.log(`    Exit code: ${result.exitCode === null ? 'n/a' : result.exitCode}`);
      console.log(`    Signal: ${result.signal ?? 'none'}`);
      if (result.reason) console.log(`    Reason: ${result.reason}`);
      console.log(`    Verifier: ${join('e2e', suite.file)}`);
    }
    console.log('');
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const errors = results.filter((r) => r.status === 'ERROR').length;
  const timeouts = results.filter((r) => r.status === 'TIMEOUT').length;
  const totalDurationMs = results.reduce((acc, r) => acc + r.durationMs, 0);
  const allPassed = failed === 0 && errors === 0 && timeouts === 0 && passed === SUITES.length;

  console.log(thin);
  console.log('MASTER REGRESSION SUMMARY');
  console.log('');
  console.log(`Total suites : ${SUITES.length}`);
  console.log(`Passed       : ${passed}`);
  console.log(`Failed       : ${failed}`);
  console.log(`Errors       : ${errors}`);
  console.log(`Timeouts     : ${timeouts}`);
  console.log('');
  for (const r of results) {
    console.log(`${r.suite.tableLabel.padEnd(20)} ${r.status.padEnd(6)} ${(r.durationMs / 1000).toFixed(1)}s`);
  }
  console.log('');
  console.log(`Total duration: ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log(`RESULT: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(allPassed ? '🎉 ALL FRESHGO E2E REGRESSION CHECKS PASSED' : '❌ SOME FRESHGO E2E REGRESSION CHECKS FAILED');
  if (!allPassed) {
    console.log('');
    console.log('DETAILED FAILURES:');
    for (const r of results.filter((x) => x.status !== 'PASS')) {
      console.log(`- ${r.suite.name}`);
      console.log(`    Verifier: ${join('e2e', r.suite.file)}`);
      console.log(`    Status: ${r.status}`);
      console.log(`    Exit code: ${r.exitCode === null ? 'n/a' : r.exitCode}`);
      console.log(`    Duration: ${(r.durationMs / 1000).toFixed(1)}s`);
      if (r.reason) console.log(`    Reason: ${r.reason}`);
    }
  }
  console.log(line);

  try {
    mkdirSync(join(E2E_DIR, 'results'), { recursive: true });
    const summary = {
      generatedAt: startedAt.toISOString(),
      project: PROJECT_ROOT,
      mode: 'sequential',
      totalSuites: SUITES.length,
      passed,
      failed,
      errors,
      timeouts,
      allPassed,
      totalDurationMs,
      suites: results.map((r) => ({
        name: r.suite.name,
        verifier: join('e2e', r.suite.file),
        status: r.status,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
      })),
    };
    writeFileSync(join(E2E_DIR, 'results', 'latest-e2e-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  } catch (err) {
    console.log(`WARN: could not write e2e/results/latest-e2e-summary.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.exitCode = allPassed ? 0 : 1;
}

void main();