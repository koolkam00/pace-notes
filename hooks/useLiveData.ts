'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LiveJson } from '@/lib/types';
import { dataFetch } from '@/lib/data-fetch';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function useLiveData(pollMs: number = 60000) {
  const [data, setData] = useState<LiveJson | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await dataFetch(`${BASE_PATH}/data/live.json`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Failed to load live.json (${res.status})`);
      }
      const json = (await res.json()) as LiveJson;
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (pollMs > 0) {
      const id = setInterval(load, pollMs);
      return () => clearInterval(id);
    }
  }, [pollMs]);

  const status = useMemo<'loading' | 'error' | 'empty' | 'ready'>(() => {
    if (loading) return 'loading';
    if (error) return 'error';
    if (!data) return 'loading';
    return data.status === 'ready' ? 'ready' : 'empty';
  }, [data, loading, error]);

  return { data, status, loading, error, reload: load };
}
