'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { DEFAULT_UNITS, unitText, type UnitSystem } from '@/lib/units';
import { unitHref, unitSwitchShown, unitsFromSearch } from '@/lib/unit-preference';
import { trackAnalytics } from '@/lib/analytics';

const STORAGE_KEY = 'marathon-study-units';
/**
 * `resolved` turns true once the URL and stored preference have been read; before that, units are only the default.
 * `inertOn` is the page's path when the header's switch is inert there (`unitSwitchShown`), else null.
 */
type Units = { units: UnitSystem; setUnits: (units: UnitSystem) => void; resolved: boolean; inertOn: string | null };
const UnitsContext = createContext<Units>({ units: DEFAULT_UNITS, setUnits: () => {}, resolved: false, inertOn: null });

/** In the server render (the static export's build), stops the build when a page whose switch is inert shows text that changes with the units. */
function requireSwitch({ inertOn }: Units) {
  if (inertOn !== null && typeof window === 'undefined') {
    throw new Error(`${inertOn} shows text that changes with the units, but the header's units switch is inert there: add the page to unitSwitchShown in lib/unit-preference.ts.`);
  }
}

/**
 * The visitor's units, for text and figures that change with them, so only on a page with the working switch (the
 * build stops otherwise). Links (UnitLink) and the switch read the context directly, since they belong on every page.
 */
export const useUnits = () => {
  const context = useContext(UnitsContext);
  requireSwitch(context);
  return context;
};

export default function UnitsProvider({ children }: { children: ReactNode }) {
  const [units, updateUnits] = useState<UnitSystem>(DEFAULT_UNITS);
  const [resolved, setResolved] = useState(false);
  const pathname = usePathname();
  // The units on screen, for setUnits: pressing the button already chosen is not a change.
  const shown = useRef<UnitSystem>(DEFAULT_UNITS);
  useEffect(() => { shown.current = units; }, [units]);
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
    if (next === shown.current) return;
    shown.current = next;
    trackAnalytics('units_changed', { units: next });
    updateUnits(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    window.history.replaceState(window.history.state, '', unitHref(window.location.pathname + window.location.search + window.location.hash, next));
  }, []);
  const inertOn = pathname && !unitSwitchShown(pathname) ? pathname : null;
  return <UnitsContext.Provider value={{ units, setUnits, resolved, inertOn }}>{children}</UnitsContext.Provider>;
}

export function UnitSwitch() {
  const { units, setUnits } = useContext(UnitsContext);
  const path = usePathname();
  if (!unitSwitchShown(path)) return <div className="unit-switch unit-switch-placeholder" aria-hidden="true"><button type="button" tabIndex={-1}>Miles</button><button type="button" tabIndex={-1}>Kilometres</button></div>;
  // Phones show the short forms; the full names stay as the buttons' accessible names.
  return <div className="unit-switch" role="group" aria-label="Distance and pace units">
    <button type="button" aria-pressed={units === 'mi'} onClick={() => setUnits('mi')}><span className="unit-name">Miles</span><span className="unit-short" aria-hidden="true">mi</span></button>
    <button type="button" aria-pressed={units === 'km'} onClick={() => setUnits('km')}><span className="unit-name">Kilometres</span><span className="unit-short" aria-hidden="true">km</span></button>
  </div>;
}

/** Prose with kilometre figures, in the visitor's units. Text without one is the same in both and may go on any page. */
export function UnitText({ children }: { children: string }) {
  const context = useContext(UnitsContext);
  if (context.inertOn !== null && unitText(children, 'mi') !== unitText(children, 'km')) requireSwitch(context);
  return <>{unitText(children, context.units)}</>;
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
  const { units, resolved } = useContext(UnitsContext);
  return <Link {...props} prefetch={prefetch} href={typeof href === 'string' && resolved ? unitHref(href, units) : href} />;
}
