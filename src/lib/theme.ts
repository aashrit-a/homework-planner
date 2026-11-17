import { useEffect, useState } from 'react';
import type { ThemePreference } from '../types';

/**
 * Theme resolution. An explicit Light/Dark choice in Settings sets
 * `data-theme` on <html>. "System" leaves the attribute alone so the page
 * follows whatever the host (OS setting, or an embedding viewer that sets
 * `data-theme` itself) decides.
 */
let appliedByApp = false;

export function applyThemePreference(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') {
    if (appliedByApp) delete root.dataset.theme;
    appliedByApp = false;
  } else {
    root.dataset.theme = pref;
    appliedByApp = true;
  }
}

function currentlyDark(): boolean {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The theme actually on screen, kept live as the OS or host changes it. */
export function useResolvedTheme(pref: ThemePreference): 'light' | 'dark' {
  const [dark, setDark] = useState(currentlyDark);
  useEffect(() => {
    const update = () => setDark(currentlyDark());
    update();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      obs.disconnect();
    };
  }, [pref]);
  return dark ? 'dark' : 'light';
}
