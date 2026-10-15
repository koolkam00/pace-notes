'use client';
import { useEffect, useState } from 'react';
import { dataFetch } from '@/lib/data-fetch';

export interface PackMeta {
  status: 'ready' | 'ok' | 'empty' | 'enrichment' | 'coming-soon' | 'stub';
  as_of?: string | null;
  [key: string]: unknown;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function usePackMeta(packId: string, initialMeta?: PackMeta | null) {
  const [meta, setMeta] = useState<PackMeta | null>(initialMeta ?? null);
  const [loading, setLoading] = useState<boolean>(!initialMeta);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await dataFetch(`${BASE_PATH}/data/packs/${packId}/pack_meta.json`, {
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          // Keep SSR/ready seed if a refresh fails — never flash Waiting over known-ready.
          if (!cancelled && !initialMeta) setMeta(null);
        } else {
          const json = (await res.json()) as PackMeta;
          if (!cancelled) setMeta(json);
        }
      } catch {
        if (!cancelled && !initialMeta) setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [packId, initialMeta]);

  return { meta, loading };
}
