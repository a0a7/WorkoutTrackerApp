<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { initDB } from '$lib/db';
  import { userStore } from '$lib/stores/userStore';
  import { refreshSyncStatus, setupSyncListeners, syncFromServer, syncFromStrava, syncToServer } from '$lib/sync';

  let { children } = $props();
  let mainEl = $state<HTMLElement | null>(null);
  let pullStartY = $state<number | null>(null);
  let pullDistance = $state(0);
  let pullSyncing = $state(false);
  let isStandalone = $state(false);
  let keyboardVisible = $state(false);
  const PULL_SYNC_THRESHOLD_PX = 84;

  const navItems = [
    { href: '/', label: 'Today', icon: 'today' },
    { href: '/history', label: 'History', icon: 'history' },
    { href: '/trends', label: 'Trends', icon: 'trends' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  const trendsNavItems = [
    { href: '/trends/calendar', label: 'Calendar' },
    { href: '/trends/aggregate', label: 'General' },
    { href: '/trends/exercise', label: 'By Movement' },
  ];

  const STRAVA_DUE_SYNC_INTERVAL_MS = 5 * 60_000;

  async function triggerStravaDueSync(token: string) {
    try {
      await fetch('/api/strava/sync-due', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignored
    }
  }

  onMount(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandalone = () => {
      const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      isStandalone = standaloneQuery.matches || iosStandalone;
    };
    updateStandalone();
    standaloneQuery.addEventListener('change', updateStandalone);

    const KEYBOARD_THRESHOLD_PX = 140;
    const NON_TEXT_INPUT_TYPES = new Set([
      'button',
      'checkbox',
      'color',
      'date',
      'datetime-local',
      'file',
      'hidden',
      'image',
      'month',
      'radio',
      'range',
      'reset',
      'submit',
      'time',
      'week'
    ]);
    const isTextInput = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
      if (el instanceof HTMLInputElement) {
        return !el.disabled && !el.readOnly && !NON_TEXT_INPUT_TYPES.has(el.type);
      }
      return el.isContentEditable;
    };
    const ensureFocusedInputVisible = (behavior: ScrollBehavior = 'smooth') => {
      const el = document.activeElement;
      if (!isTextInput(el)) return;
      const vv = window.visualViewport;
      const rect = el.getBoundingClientRect();
      const margin = 16;
      if (vv) {
        const viewTop = vv.offsetTop || 0;
        const viewBottom = viewTop + vv.height;
        const overlapTop = rect.top < viewTop + margin;
        const overlapBottom = rect.bottom > viewBottom - margin;
        if (overlapTop || overlapBottom) {
          const targetScroll = window.scrollY + (rect.top - (viewTop + (vv.height / 2 - rect.height / 2)));
          window.scrollTo({ top: Math.max(0, Math.round(targetScroll)), behavior });
        }
        return;
      }
      el.scrollIntoView({ block: 'center', behavior });
    };
    const updateKeyboardVisibility = () => {
      const vv = window.visualViewport;
      const viewportHeight = vv?.height ?? window.innerHeight;
      const heightDiff = window.innerHeight - viewportHeight;
      keyboardVisible = isTextInput(document.activeElement) && heightDiff > KEYBOARD_THRESHOLD_PX;
    };
    const handleFocusChange = () => {
      setTimeout(updateKeyboardVisibility, 0);
      setTimeout(() => ensureFocusedInputVisible('smooth'), 80);
    };
    const handleViewportChange = () => {
      updateKeyboardVisibility();
      ensureFocusedInputVisible('auto');
    };
        const handleTextInput = (event: Event) => {
      // Only scroll on blur/focus, not every input event which causes jittery behavior
    };
    window.addEventListener('focusin', handleFocusChange);
    window.addEventListener('focusout', handleFocusChange);
    window.addEventListener('resize', handleViewportChange);
    // window.addEventListener('input', handleTextInput, true);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    window.visualViewport?.addEventListener('scroll', handleViewportChange);
    updateKeyboardVisibility();

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
    let dueSyncTimer: ReturnType<typeof setInterval> | undefined;
    const handleVisibility = () => {
      const u = get(userStore);
      if (!u || document.visibilityState !== 'visible') return;
      syncFromStrava(u);
      triggerStravaDueSync(u.token);
    };
    const handleOnline = () => {
      const u = get(userStore);
      if (!u) return;
      syncFromStrava(u);
      triggerStravaDueSync(u.token);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    const unsub = userStore.subscribe((u) => {
      cleanup?.();
      if (dueSyncTimer) {
        clearInterval(dueSyncTimer);
        dueSyncTimer = undefined;
      }
      if (u) {
        cleanup = setupSyncListeners(u);
        // Initial two-way sync: push queued local changes first, then pull latest server state
        (async () => {
          await syncToServer(u);
          await syncFromStrava(u);
          await syncFromServer(u);
          await triggerStravaDueSync(u.token);
        })().catch(() => {});
        dueSyncTimer = setInterval(() => {
          if (document.visibilityState === 'visible') {
            triggerStravaDueSync(u.token);
          }
        }, STRAVA_DUE_SYNC_INTERVAL_MS);
      }
    });
    return () => {
      unsub();
      cleanup?.();
      if (dueSyncTimer) clearInterval(dueSyncTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      standaloneQuery.removeEventListener('change', updateStandalone);
            window.removeEventListener('focusin', handleFocusChange);
      window.removeEventListener('focusout', handleFocusChange);
      window.removeEventListener('resize', handleViewportChange);
      // window.removeEventListener('input', handleTextInput, true);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  });

  const currentPath = $derived($page.url.pathname);

  function isActive(href: string) {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }

  function handlePullStart(e: TouchEvent) {
    if (currentPath === '/login' || pullSyncing || !mainEl) return;
    if (mainEl.scrollTop > 0) return;
    pullStartY = e.touches[0]?.clientY ?? null;
    pullDistance = 0;
  }

  function handlePullMove(e: TouchEvent) {
    if (pullStartY === null) return;
    pullDistance = Math.max(0, (e.touches[0]?.clientY ?? pullStartY) - pullStartY);
  }

  async function handlePullEnd() {
    const shouldSync = pullDistance >= PULL_SYNC_THRESHOLD_PX;
    pullStartY = null;
    pullDistance = 0;
    if (!shouldSync || pullSyncing) return;
    const u = get(userStore);
    if (!u) return;
    pullSyncing = true;
    try {
      await syncToServer(u);
      await syncFromStrava(u);
      await syncFromServer(u);
      await syncFromServer(u);
      await refreshSyncStatus();
    } catch {
      // ignored
    } finally {
      pullSyncing = false;
    }
  }

  import { CalendarDays, Home, Settings, Sun, Moon } from 'lucide-svelte';
  import { TrendingUp } from 'lucide-svelte';
  import { unitPreference } from '$lib/stores/userStore';

  function toggleMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function toggleUnit() {
    unitPreference.set($unitPreference === 'lbs' ? 'kg' : 'lbs');
  }
</script>

<svelte:head>
  <title>Logbook</title>
  <meta name="description" content="Track your workouts and progress" />
  <link rel="icon" type="image/png" href="/favicon.png" />
</svelte:head>

<div class="flex min-h-screen lg:flex-row flex-col bg-[hsl(var(--background))]">
  <!-- Desktop Sidebar -->
  {#if currentPath !== '/login'}
    <aside class="hidden lg:flex w-52 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div class="px-4 py-4 flex items-center justify-between">
        <p class="text-sm font-semibold tracking-tight text-[hsl(var(--foreground))]">
          Logbook <span class="text-xs font-normal text-[hsl(var(--muted-foreground))]">v0.1</span>
        </p>
      </div>
      <nav class="flex-1 space-y-1 px-2">
        {#each navItems as pt}
          <a
            href={pt.href}
            class="flex items-center gap-3 px-2 py-1.5 text-sm transition-colors {isActive(pt.href) ? 'text-[hsl(var(--foreground))] font-bold' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
          >
            {#if pt.icon === 'today'}
              <Home class="w-4 h-4" />
            {:else if pt.icon === 'trends'}
              <TrendingUp class="w-4 h-4" />
            {:else if pt.icon === 'history'}
              <CalendarDays class="w-4 h-4" />
            {:else if pt.icon === 'settings'}
              <Settings class="w-4 h-4" />
            {/if}
            {pt.label}
          </a>
          {#if pt.icon === 'trends'}
            <div class="ml-4 border-l border-[hsl(var(--border))] pl-3">
              <div class="space-y-1 py-1">
                {#each trendsNavItems as item}
                  <a
                    href={item.href}
                    class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors {currentPath === item.href || currentPath.startsWith(item.href) ? 'text-[hsl(var(--foreground))] font-bold' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-current opacity-70"></span>
                    {item.label}
                  </a>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </nav>
      <div class="px-3 pb-3 flex items-center gap-2 justify-between">
        <div class="flex items-center border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] shadow-sm overflow-hidden p-0">
          <button
            onclick={() => { unitPreference.set($unitPreference === 'lbs' ? 'kg' : 'lbs'); }}
            class="px-3 py-1 cursor-pointer transition-colors text-xs font-semibold m-0 rounded-none {$unitPreference === 'lbs' ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'bg-transparent text-[hsl(var(--muted-foreground))]'}"
          >lbs</button>
          <div style="width:1px" class="h-3 bg-[hsl(var(--border))]"></div>
          <button
            onclick={() => { unitPreference.set($unitPreference === 'lbs' ? 'kg' : 'lbs'); }}
            class="px-3 py-1 cursor-pointer transition-colors text-xs font-semibold m-0 rounded-none {$unitPreference === 'kg' ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'bg-transparent text-[hsl(var(--muted-foreground))]'}"
          >kg</button>
        </div>
        <button onclick={toggleMode} class="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors p-1.5 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] shadow-sm cursor-pointer">
          <span class="sr-only">Toggle theme</span>
          <div class="relative w-4 h-4">
            <Sun class="absolute inset-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 w-4 h-4" />
            <Moon class="absolute inset-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 w-4 h-4" />
          </div>
        </button>
      </div>
    </aside>
  {/if}

  <!-- Main content area: no bottom padding on login page, flex-1 to fill adjacent to sidebar -->
  <main
    bind:this={mainEl}
    ontouchstart={handlePullStart}
    ontouchmove={handlePullMove}
    ontouchend={handlePullEnd}
    class="flex-1 flex flex-col relative {isStandalone ? 'pt-[env(safe-area-inset-top)]' : ''} {currentPath !== '/login' && !keyboardVisible ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0' : ''} overflow-y-auto"
  >
    {#if pullDistance > 0 && currentPath !== '/login'}
      <div class="absolute inset-x-0 top-0 z-50 flex h-16 items-center justify-center bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md">
        <span class="text-sm font-medium">Release to sync</span>
      </div>
    {/if}
    {@render children()}
  </main>

  <!-- Mobile Bottom Navigation (Hidden on LG) -->
  {#if currentPath !== '/login' && !keyboardVisible}
    <nav
      class="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] pb-[env(safe-area-inset-bottom)] pt-2 sm:px-6 lg:hidden"
    >
      {#each navItems as item}
        <a
          href={item.href}
          class="flex flex-col items-center justify-center gap-1 px-4 py-1 transition-colors {isActive(item.href) ? 'text-[hsl(var(--foreground))] font-bold' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
        >
          {#if item.icon === 'today'}
            <Home class="w-[1.4rem] h-[1.4rem]" strokeWidth={isActive(item.href) ? 2.5 : 2} />
          {:else if item.icon === 'trends'}
            <TrendingUp class="w-[1.4rem] h-[1.4rem]" strokeWidth={isActive(item.href) ? 2.5 : 2} />
          {:else if item.icon === 'history'}
            <CalendarDays class="w-[1.4rem] h-[1.4rem]" strokeWidth={isActive(item.href) ? 2.5 : 2} />
          {:else if item.icon === 'settings'}
            <Settings class="w-[1.4rem] h-[1.4rem]" strokeWidth={isActive(item.href) ? 2.5 : 2} />
          {/if}
          <span class="text-[0.65rem] font-medium {isActive(item.href) ? 'font-semibold' : ''}"
            >{item.label}</span
          >
        </a>
      {/each}
    </nav>
  {/if}
</div>
