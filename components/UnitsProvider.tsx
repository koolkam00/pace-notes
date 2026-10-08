'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { DEFAULT_UNITS, unitText, type UnitSystem } from '@/lib/units';
import { unitHref, unitsFromSearch } from '@/lib/unit-preference';
import { trackAnalytics } from '@/lib/analytics';

const STORAGE_KEY = 'marathon-study-units';
/** `resolved` turns true once the URL and stored preference have been read; before that, units are only the default. */
const UnitsContext = createContext<{ units: UnitSystem; setUnits: (units: UnitSystem) => void; resolved: boolean }>({ units: DEFAULT_UNITS, setUnits: () => {}, resolved: false });
export const useUnits = () => useContext(UnitsContext);

export default function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, updateUnits] = useState<UnitSystem>(DEFAULT_UNITS);
  const [resolved, setResolved] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const restore = () => {
      const requested = unitsFromSearch(window.location.search);
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be unavailable. URL preference still works. */ }
      const next = requested || (stored === 'mi' || stored === 'km' ? stored : DEFAULT_UNITS);
      updateUnits(next);
      setResolved(true);
      if (requested) { try { window.localStorage.setItem(STORAGE_KEY, requested); } catch {} }
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [pathname]);
  const setUnits = useCallback((next: UnitSystem) => {
    trackAnalytics('units_changed', { units: next });
    updateUnits(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.history.replaceState(window.history.state, '', unitHref(window.location.pathname + window.location.search + window.location.hash, next));
  }, []);
  return <UnitsContext.Provider value={{ units, setUnits, resolved }}>{children}</UnitsContext.Provider>;
}

export function UnitSwitch() {
  const { units, setUnits } = useUnits();
  const path = usePathname();
  if (path !== '/' && path !== '/about' && path !== '/slowdown' && path !== '/htw' && !['/analyses', '/runners', '/packs', '/courses', '/stories', '/tools', '/finish-times'].some(route => path === route || path.startsWith(route + '/'))) return <div className="unit-switch unit-switch-placeholder" aria-hidden="true"><button type="button" tabIndex={-1}>Miles</button><button type="button" tabIndex={-1}>Kilometres</button></div>;
  return <div className="unit-switch" role="group" aria-label="Distance and pace units">
    <button type="button" aria-pressed={units === 'mi'} onClick={() => setUnits('mi')}>Miles</button>
    <button type="button" aria-pressed={units === 'km'} onClick={() => setUnits('km')}>Kilometres</button>
  </div>;
}

export function UnitText({ children }: { children: string }) {
  const { units } = useUnits();
  return <>{unitText(children, units)}</>;
}

export function MarathonDistance() {
  const { units } = useUnits();
  return <>{units === 'mi' ? '26.2 miles' : '42.195 km'}</>;
}

/**
 * A link that carries the visitor's units. Miles, the default, add nothing (and drop any units= in the href), so every page
 * has one clean link; kilometres add units=km. Until the preference is read (server HTML and the first client render) the
 * href is left as written, so a click before hydration falls back to the stored preference instead of forcing the default.
 */
export function UnitLink({ href, prefetch = false, ...props }: ComponentProps<typeof Link>) {
  const { units, resolved } = useUnits();
  return <Link {...props} prefetch={prefetch} href={typeof href === 'string' && resolved ? unitHref(href, units) : href} />;
}
