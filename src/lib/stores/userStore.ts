import { writable, derived } from 'svelte/store';
import type { User } from '../types';

function createUserStore() {
  const { subscribe, set, update } = writable<User | null>(null);

  return {
    subscribe,
    init() {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('workout_user');
        if (saved) {
          try {
            set(JSON.parse(saved));
          } catch {
            localStorage.removeItem('workout_user');
          }
        }
      }
    },
    login(user: User) {
      set(user);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('workout_user', JSON.stringify(user));
      }
    },
    logout() {
      set(null);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('workout_user');
      }
    },
  };
}

export const userStore = createUserStore();
export const isLoggedIn = derived(userStore, ($u) => $u !== null);

export const unitPreference = writable<'lbs' | 'kg'>('lbs');
export const tertiaryActivationPreference = writable<boolean>(true);

// Locales/regions that use lbs by convention (US, Liberia, Myanmar)
const LBS_LOCALE_PREFIXES = [
  'en-US', // United States
  'en-LR', // Liberia
  'my',    // Myanmar (Burma)
];

function detectRegionUnit(): 'lbs' | 'kg' {
  try {
    const lang = navigator.language || 'en-US';
    for (const prefix of LBS_LOCALE_PREFIXES) {
      if (lang.startsWith(prefix)) return 'lbs';
    }
  } catch {
    // navigator unavailable (SSR)
  }
  return 'kg';
}

export function initUnitPreference() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('unit_preference') as 'lbs' | 'kg' | null;
    if (saved) {
      unitPreference.set(saved);
    } else {
      // First launch — auto-detect based on browser locale
      const detected = detectRegionUnit();
      unitPreference.set(detected);
      localStorage.setItem('unit_preference', detected);
    }
  }
}

export function initTertiaryActivationPreference() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('show_tertiary_activations');
    if (saved === 'true' || saved === 'false') {
      tertiaryActivationPreference.set(saved === 'true');
    } else {
      tertiaryActivationPreference.set(true);
      localStorage.setItem('show_tertiary_activations', 'true');
    }
  }
}
