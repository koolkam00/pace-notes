'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getPackInfo, isEnrichment, isParked } from '@/lib/packs';
import { usePackMeta, type PackMeta } from '@/hooks/usePackMeta';
import { dataFetch } from '@/lib/data-fetch';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { headers, rows };
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    if (Math.abs(v) >= 1000) return v.toLocaleString();
    if (Math.abs(v) < 1) return v.toFixed(4);
    return String(Math.round(v * 1000) / 1000);
  }
  return String(v);
}

export default function PackClientPage({
  params,
  initialMeta,
  initialSummary,
}: {
  params: { packId: string };
  initialMeta?: PackMeta | null;
  initialSummary?: Record<string, unknown> | null;
}) {
  const packId = params.packId;
  const info = getPackInfo(packId);
  const { meta, loading } = usePackMeta(packId, initialMeta ?? null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(initialSummary ?? null);
  const [tables, setTables] = useState<{ name: string; headers: string[]; rows: string[][] }[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  const isReady = meta?.status === 'ready' || meta?.status === 'ok';

  useEffect(() => {
    if (!isReady || packId === 'smyth_htw') return;
    let cancelled = false;
    async function load() {
      setDataError(null);
      try {
        const summaryRes = await dataFetch(`${BASE_PATH}/data/packs/${packId}/summary.json`, {
          cache: 'no-store',
        });
        if (summaryRes.ok) {
          const json = await summaryRes.json();
          if (!cancelled) setSummary(json);
        } else if (!cancelled) {
          setSummary(null);
        }

        const tablePaths: string[] = [];
        const listed = Array.isArray(meta?.tables) ? (meta!.tables as string[]) : [];
        for (const t of listed) {
          if (typeof t === 'string' && t.endsWith('.csv')) tablePaths.push(t.replace(/^\.\//, ''));
        }
        if (!tablePaths.length) {
          // common default
          // leave empty — meta.tables is authoritative
        }

        const loaded: { name: string; headers: string[]; rows: string[][] }[] = [];
        for (const rel of tablePaths) {
          const url = `${BASE_PATH}/data/packs/${packId}/${rel}`;
          const res = await dataFetch(url, { cache: 'no-store' });
          if (!res.ok) continue;
          const text = await res.text();
          const parsed = parseCsv(text);
          loaded.push({ name: rel.split('/').pop() || rel, headers: parsed.headers, rows: parsed.rows });
        }
        if (!cancelled) setTables(loaded);
      } catch (e) {
        if (!cancelled) setDataError(e instanceof Error ? e.message : 'Failed to load pack data');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isReady, packId, meta]);

  if (!info) {
    return (
      <div className="panel">
        <div className="figure-title">Unknown pack</div>
        <div className="site-subtitle">This pack is not registered.</div>
        <div style={{ marginTop: '0.75rem' }}>
          <Link href="/packs">Back to packs</Link>
        </div>
      </div>
    );
  }

  if (info.id === 'smyth_htw') {
    return (
      <div className="panel">
        <div className="figure-title">{info.title}</div>
        <div className="site-subtitle">Explore sustained late-race slowing with Pace Notes.</div>
        <div style={{ marginTop: '0.75rem' }}>
          <Link href="/slowdown">Explore sustained slowdown</Link>
        </div>
      </div>
    );
  }

  const badge =
    isReady
      ? 'Ready'
      : meta?.status === 'coming-soon' || isParked(info.id)
      ? 'Coming soon'
      : isEnrichment(info.id)
      ? 'Enrichment'
      : 'Waiting';
  const enrichmentNeeds = isEnrichment(info.id) && !isReady;
  const isComingSoon = meta?.status === 'coming-soon' || isParked(info.id);
  const waiting = !isReady && !isComingSoon && !enrichmentNeeds;

  return (
    <div className="stack" style={{ display: 'grid', gap: '1rem' }}>
      <div className="panel figure-card">
        <div className="figure-header">
          <div>
            <div className="figure-title">{info.title}</div>
            <div className="site-subtitle">{isReady ? 'Recorded marathon results' : 'Awaiting publication'}</div>
          </div>
          <span className="badge">{badge}</span>
        </div>

        {isComingSoon && <div className="placeholder">Coming soon (parked)</div>}
        {enrichmentNeeds && <div className="placeholder">Coming soon</div>}
        {waiting && (
          <div className="placeholder">{loading ? 'Loading…' : 'Waiting for live pack data'}</div>
        )}
        {dataError && <div className="placeholder">{dataError}</div>}

        {isReady && (meta as any)?.answer_prose && (
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            <div className="figure-title">Answer</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{String((meta as any).answer_prose)}</div>
          </div>
        )}

        {isReady && summary && (
          <div className="stats" role="status" style={{ marginTop: '0.75rem' }}>
            {Object.entries(summary).map(([k, v]) => (
              <div className="stat" key={k}>
                <div className="label">{k}</div>
                <div className="value">{formatVal(v)}</div>
              </div>
            ))}
          </div>
        )}

        {isReady && !summary && !tables.length && !dataError && (
          <div className="placeholder">{loading ? 'Loading…' : 'Pack ready — no summary/tables listed yet.'}</div>
        )}
      </div>

      {tables.map((t) => (
        <div className="panel" key={t.name}>
          <div className="figure-title" style={{ marginBottom: '0.5rem' }}>
            {t.name}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  {t.headers.map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: '0.35rem 0.5rem' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: '0.35rem 0.5rem', borderBottom: '1px solid #eee' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {t.rows.length > 50 && (
              <div className="site-subtitle" style={{ marginTop: '0.5rem' }}>
                Showing first 50 of {t.rows.length} rows
              </div>
            )}
          </div>
        </div>
      ))}

      <div className="panel">
        <Link href="/packs">Back to packs</Link>
      </div>
    </div>
  );
}
