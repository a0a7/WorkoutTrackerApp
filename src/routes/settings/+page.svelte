<script lang="ts">

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { userStore } from '$lib/stores/userStore';
  import { unitPreference, initUnitPreference } from '$lib/stores/userStore';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let user = $state<{ id: string; email: string; token: string } | null>(null);
  let unit = $state<'lbs' | 'kg'>('lbs');

  onMount(() => {
    initUnitPreference();
    const unsub = userStore.subscribe((u) => { user = u; });
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
        <button
          onclick={logout}
          class="w-full px-4 py-3 text-left text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
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
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm font-medium text-[hsl(var(--foreground))]">Dark Mode</span>
        <ThemeToggle />
      </div>
    </div>
  </section>

  <!-- Units -->
  <section class="mb-5">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Units</h2>
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] overflow-hidden shadow-sm">
      <div class="flex items-center justify-between px-4 py-3">
        <span class="text-sm font-medium text-[hsl(var(--foreground))]">Weight</span>
        <div class="flex rounded-lg bg-[hsl(var(--muted))] p-0.5">
          <button
            onclick={() => setUnit('lbs')}
            class="rounded-md px-3 py-1 text-sm font-medium transition-all {unit === 'lbs' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}"
          >lbs</button>
          <button
            onclick={() => setUnit('kg')}
            class="rounded-md px-3 py-1 text-sm font-medium transition-all {unit === 'kg' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}"
          >kg</button>
        </div>
      </div>
    </div>
  </section>
</div>
