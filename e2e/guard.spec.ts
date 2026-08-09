import { test, expect } from '@playwright/test';
import {
  isProductionSupabaseUrl,
  assertSafeSupabaseUrl,
  PRODUCTION_SUPABASE_URLS,
} from './support/env';

/**
 * Verifies the production safety guard logic itself. This test is pure and
 * never touches the browser or the database, so it is always safe to run.
 */
test('guard recognises every known production Supabase URL', () => {
  for (const url of PRODUCTION_SUPABASE_URLS) {
    expect(isProductionSupabaseUrl(url), `should flag ${url}`).toBe(true);
  }
});

test('guard refuses to run destructive setup against the production project', () => {
  for (const url of PRODUCTION_SUPABASE_URLS) {
    expect(() => assertSafeSupabaseUrl(url)).toThrow(
      'Refusing to run destructive E2E setup against the FreshGo production Supabase project.',
    );
  }
});

test('guard allows a fresh, non-production Supabase URL', () => {
  const testUrl = 'https://abcdefghijklmnopqrst.supabase.co';
  expect(isProductionSupabaseUrl(testUrl)).toBe(false);
  expect(() => assertSafeSupabaseUrl(testUrl)).not.toThrow();
});

test('guard allows a local Supabase URL', () => {
  expect(isProductionSupabaseUrl('http://localhost:54321')).toBe(false);
  expect(() => assertSafeSupabaseUrl('http://localhost:54321')).not.toThrow();
});

test('guard rejects a missing Supabase URL', () => {
  expect(() => assertSafeSupabaseUrl(undefined)).toThrow(
    /No Supabase URL configured for the E2E test environment/,
  );
});

test('guard tolerates trailing slashes when comparing against production', () => {
  expect(isProductionSupabaseUrl('https://zcfpdmjjmihhvtuwngii.supabase.co/')).toBe(true);
});