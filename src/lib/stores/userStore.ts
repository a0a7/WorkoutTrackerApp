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

export function initUnitPreference() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('unit_preference') as 'lbs' | 'kg' | null;
    if (saved) unitPreference.set(saved);
  }
}
