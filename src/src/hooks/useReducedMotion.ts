/**
 * useReducedMotion — reads the prefers-reduced-motion media query.
 *
 * Returns true when the user has requested minimal motion.
 * Subscribed to media query change events so it stays live if the user
 * changes OS settings while the tab is open.
 *
 * Effects when true (per MANIFESTO §3.3):
 *   - Globe auto-rotation disabled
 *   - Emissive pulse animations stopped
 *   - Particle stream arcs not rendered
 *   - Cinematic drift stopped
 */

import { useState, useEffect } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(
    () => {
      if (typeof window === 'undefined') return false;
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
