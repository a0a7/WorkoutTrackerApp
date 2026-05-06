<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import { initDB } from '$lib/db';
  import { userStore } from '$lib/stores/userStore';
  import { setupSyncListeners, syncFromServer, syncToServer } from '$lib/sync';

  let { children } = $props();

  const navItems = [
    { href: '/', label: 'Today', icon: 'today' },
    { href: '/history', label: 'History', icon: 'history' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  onMount(() => {
    // 1. Theme (synchronous — avoid flash of wrong theme)
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }

    // 2. Restore session (synchronous localStorage read — must happen before auth guard)
    userStore.init();

    // 3. Auth guard — redirect to login if not authenticated
    const user = get(userStore);
    if (!user && $page.url.pathname !== '/login') {
      goto('/login');
      return;
    }

    // 4. Start IndexedDB in the background — don't block render
    initDB().catch(() => {});

    // 5. Register service worker (fire and forget)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch(() => {});
    }

    // 6. Setup cloud sync when logged in
    let cleanup: (() => void) | undefined;
    const unsub = userStore.subscribe((u) => {
      cleanup?.();
      if (u) {
        cleanup = setupSyncListeners(u);
        // Initial two-way sync: pull from server then push any queued local changes
        syncFromServer(u).catch(() => {});
        syncToServer(u).catch(() => {});
      }
    });
    return () => { unsub(); cleanup?.(); };
  });

  const currentPath = $derived($page.url.pathname);

  function isActive(href: string) {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }
</script>

<div class="flex min-h-screen flex-col bg-[hsl(var(--background))]">
  <!-- Main content area: no bottom padding on login page -->
  <main class="flex-1 overflow-y-auto {currentPath !== '/login' ? 'pb-[calc(4rem+env(safe-area-inset-bottom,0px))]' : ''}">
    {@render children()}
  </main>

  <!-- Bottom Navigation — hidden on the login page -->
  {#if currentPath !== '/login'}
  <nav
    class="fixed bottom-0 left-0 right-0 z-50 glass border-t border-[hsl(var(--border))]"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  >
    <div class="flex h-16 items-center justify-around px-4">
      {#each navItems as item}
        <a
          href={item.href}
          class="flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-colors {isActive(item.href)
            ? 'text-[hsl(var(--primary))]'
            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
          aria-label={item.label}
        >
          {#if item.icon === 'today'}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{isActive(item.href) ? 2.5 : 2}" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          {:else if item.icon === 'history'}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{isActive(item.href) ? 2.5 : 2}" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          {:else}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{isActive(item.href) ? 2.5 : 2}" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          {/if}
          <span class="text-xs font-medium">{item.label}</span>
        </a>
      {/each}

      <ThemeToggle />
    </div>
  </nav>
  {/if}
</div>
