<script lang="ts">

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { userStore } from '$lib/stores/userStore';
  import { unitPreference, initUnitPreference } from '$lib/stores/userStore';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let user = $state<{ id: string; email: string; token: string } | null>(null);
  let unit = $state<'lbs' | 'kg'>('lbs');
  let stravaConnected = $state(false);
  let stravaLoading = $state(false);
  let stravaError = $state('');
  const stravaConnectedNow = $derived($page.url.searchParams.get('strava') === 'connected');

  async function loadStravaStatus() {
    if (!user) {
      stravaConnected = false;
      return;
    }
    try {
      const res = await fetch('/api/strava/status', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) return;
      const data = (await res.json()) as { connected?: boolean };
      stravaConnected = Boolean(data.connected);
    } catch {
      // ignore
    }
  }

  onMount(() => {
    initUnitPreference();
    const unsub = userStore.subscribe((u) => {
      user = u;
      loadStravaStatus();
    });
    const unsub2 = unitPreference.subscribe((u) => { unit = u; });
    return () => { unsub(); unsub2(); };
  });

  function logout() {
    userStore.logout();
    goto('/login');
  }

  function setUnit(u: 'lbs' | 'kg') {
    unit = u;
    unitPreference.set(u);
    localStorage.setItem('unit_preference', u);
  }

  async function connectStrava() {
    if (!user || stravaLoading) return;
    stravaLoading = true;
    stravaError = '';
    try {
      const res = await fetch('/api/strava/connect', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error('Missing redirect URL');
      window.location.href = data.url;
    } catch (e) {
      stravaError = e instanceof Error ? e.message : 'Failed to connect Strava';
      stravaLoading = false;
    }
  }

  async function disconnectStrava() {
    if (!user || stravaLoading) return;
    stravaLoading = true;
    stravaError = '';
    try {
      const res = await fetch('/api/strava/status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` }
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      stravaConnected = false;
    } catch (e) {
      stravaError = e instanceof Error ? e.message : 'Failed to disconnect Strava';
    } finally {
      stravaLoading = false;
    }
  }

  let isCheckingStatus = $state(false);
</script>

<svelte:head>
  <title>Logbook – Settings</title>
</svelte:head>

<div class="px-4 pt-4 pb-8">
  <h1 class="mb-6 text-2xl font-bold text-[hsl(var(--foreground))]">Settings</h1>

  <!-- Account -->
  <section class="mb-5">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Account</h2>
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden shadow-sm">
      {#if user}
        <div class="px-4 py-3 border-b border-[hsl(var(--border))]">
          <p class="text-xs text-[hsl(var(--muted-foreground))]">Signed in as</p>
          <p class="font-medium text-[hsl(var(--foreground))]">{user.email}</p>
        </div>
        <button class="block px-4 py-3 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors w-full text-left cursor-pointer" onclick={logout}>
          Sign Out
        </button>
      {:else}
        <a
          href="/login"
          class="block px-4 py-3 text-sm font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          Sign In / Create Account
        </a>
      {/if}
    </div>
  </section>

  <!-- Appearance -->
  <section class="mb-5">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Appearance</h2>
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden shadow-sm">
      <button class="flex w-full items-center justify-between px-4 py-3 cursor-pointer text-left transition-colors hover:bg-[hsl(var(--muted))]" onclick={() => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      }}>
        <span class="text-sm font-medium text-[hsl(var(--foreground))]">Toggle Dark Mode</span>
      </button>
    </div>
  </section>

  <!-- Units -->
  <section class="mb-5">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Units</h2>
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm font-medium text-[hsl(var(--foreground))]">Weight</span>
        <div class="flex items-center gap-1 border border-[hsl(var(--border))] rounded bg-[hsl(var(--background))] shadow-sm overflow-hidden p-0">
          <button
            onclick={() => setUnit('lbs')}
            class="px-3 py-1 cursor-pointer transition-colors text-xs font-semibold m-0 rounded-none {unit === 'lbs' ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'bg-transparent text-[hsl(var(--muted-foreground))]'}"
          >lbs</button>
          <div class="w-[1px] h-3 bg-[hsl(var(--border))]"></div>
          <button
            onclick={() => setUnit('kg')}
            class="px-3 py-1 cursor-pointer transition-colors text-xs font-semibold m-0 rounded-none {unit === 'kg' ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))]' : 'bg-transparent text-[hsl(var(--muted-foreground))]'}"
          >kg</button>
        </div>
      </div>
    </div>
  </section>

  <!-- Integrations -->
  <section class="mb-5">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Integrations</h2>
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden shadow-sm">
      <div class="px-4 py-3 border-b border-[hsl(var(--border))]">
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1">
            <p class="text-sm font-medium text-[hsl(var(--foreground))]">Strava</p>
            <p class="text-xs text-[hsl(var(--muted-foreground))]">
              {#if stravaConnected || stravaConnectedNow}
                Connected
              {:else}
                Not connected
              {/if}
            </p>
          </div>
          {#if user}
            <button
                     onclick={stravaConnected ? disconnectStrava : connectStrava}
                     class="px-3 py-1.5 text-xs font-semibold border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer rounded"
            >
              {#if isCheckingStatus}
                <span class="inline-block w-3 h-3 rounded-full border border-[hsl(var(--foreground))] border-t-transparent animate-spin"></span>
              {:else if stravaConnected}
                Disconnect
              {:else}
                Connect
              {/if}
            </button>
          {/if}
        </div>
      </div>
      {#if stravaError}
        <p class="px-4 py-2 text-xs text-red-500">{stravaError}</p>
      {/if}
    </div>
  </section>
</div>
