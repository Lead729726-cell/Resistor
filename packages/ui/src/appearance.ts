import { useSyncExternalStore } from 'react';
import presets from './appearance-presets.json';

export const SKINS = presets.skins;
export type Skin = keyof typeof SKINS;
export type ColorMode = 'dark' | 'light' | 'system';
type Appearance = { mode: ColorMode; skin: Skin; resolved: 'dark' | 'light' };
const modes: ColorMode[] = ['dark', 'light', 'system'];
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');
const resolved = (mode: ColorMode) => mode === 'system' ? media.matches ? 'dark' : 'light' : mode;
const read = (): Appearance => {
  let mode: ColorMode = 'system', skin: Skin = 'graphite';
  try {
    const saved = JSON.parse(localStorage.getItem('register.appearance') || 'null');
    if (saved?.version === 1) {
      if (modes.includes(saved.mode)) mode = saved.mode;
      if (Object.hasOwn(SKINS, saved.skin)) skin = saved.skin;
    } else {
      const legacy = JSON.parse(localStorage.getItem('mos.theme') || 'null');
      if (legacy === 'dark' || legacy === 'light') mode = legacy;
    }
  } catch { /* Storage can be unavailable; the in-memory appearance still works. */ }
  return { mode, skin, resolved: resolved(mode) };
};
let current = read();
function apply() {
  document.documentElement.dataset.theme = current.resolved;
  document.documentElement.dataset.skin = current.skin;
  document.documentElement.style.colorScheme = current.resolved;
  document.documentElement.style.backgroundColor = SKINS[current.skin][current.resolved].bg;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = SKINS[current.skin][current.resolved].panel;
}
function publish(next: Appearance) {
  if (next.mode === current.mode && next.skin === current.skin && next.resolved === current.resolved) return;
  current = next; apply(); listeners.forEach(listener => listener());
}
export function setAppearance(change: Partial<Pick<Appearance, 'mode' | 'skin'>>) {
  const mode = change.mode ?? current.mode, skin = change.skin ?? current.skin;
  if (!modes.includes(mode) || !Object.hasOwn(SKINS, skin)) return;
  publish({ mode, skin, resolved: resolved(mode) });
  try { localStorage.setItem('register.appearance', JSON.stringify({ version: 1, mode, skin })); } catch { /* Continue without persistence. */ }
}
apply();
media.addEventListener('change', () => { if (current.mode === 'system') publish({ ...current, resolved: resolved('system') }); });
window.addEventListener('storage', event => { if (event.key === 'register.appearance' || event.key === null) publish(read()); });
export function useAppearance() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
}
