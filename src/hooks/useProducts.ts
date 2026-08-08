import { useState, useEffect, useCallback } from 'react';
import { fetchProducts, fetchProductById } from '../data/products';
import type { Product } from '../types';

type State = {
  products: Product[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useProducts(includeInactive = false): State {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProducts(includeInactive);
      setProducts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await fetchProducts(includeInactive);
        if (active) {
          setProducts(data);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [includeInactive]);

  return { products, loading, error, refetch };
}

type SingleState = {
  product: Product | null;
  loading: boolean;
  error: string | null;
};

export function useProduct(id: string | undefined): SingleState {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setProduct(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProductById(id);
      setProduct(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return { product, loading, error };
}
