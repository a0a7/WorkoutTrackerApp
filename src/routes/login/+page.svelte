<script lang="ts">

  import { goto } from '$app/navigation';
  import { userStore } from '$lib/stores/userStore';

  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function submit() {
    if (!email || !password) { error = 'Email and password required.'; return; }
    loading = true; error = '';
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as any;
      if (!res.ok) {
        error = data.message ?? data.error ?? `Request failed (${res.status})`;
        return;
      }
      userStore.login({ id: data.userId, email, token: data.token });
      goto('/');
    } catch (e) {
      error = (e as Error).message ?? 'An unexpected error occurred';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Logbook - Sign in</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 bg-[hsl(var(--background))]">
  <div class="w-full max-w-sm">
    <!-- Logo -->
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-white p-2 shadow-lg dark:bg-[hsl(var(--card))]">
        <img src="/icons/logo.png" alt="Logbook logo" class="h-full w-full object-contain" />
      </div>
      <h1 class="text-3xl font-bold text-[hsl(var(--foreground))]">Logbook</h1>
      <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">log ur sessions broski</p>
    </div>

    <!-- Card -->
    <div class="rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-6 shadow-sm">
      <!-- Mode toggle -->
      <div class="mb-5 flex rounded-xl bg-[hsl(var(--muted))] p-1">
        <button
          onclick={() => { mode = 'login'; error = ''; }}
          class="flex-1 rounded-lg py-2 text-sm font-medium transition-all {mode === 'login' ? 'bg-[hsl(var(--card))] shadow-sm text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}"
        >Sign In</button>
        <button
          onclick={() => { mode = 'register'; error = ''; }}
          class="flex-1 rounded-lg py-2 text-sm font-medium transition-all {mode === 'register' ? 'bg-[hsl(var(--card))] shadow-sm text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}"
        >Register</button>
      </div>

      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="flex flex-col gap-3">
        <input
          type="email"
          bind:value={email}
          placeholder="Email"
          required
          class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
        />
        <input
          type="password"
          bind:value={password}
          placeholder="Password"
          required
          class="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
        />

        {#if error}
          <p class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
        {/if}

        <button 
          type="submit" 
          disabled={loading}
          class="mt-1 w-full rounded-xl bg-[hsl(var(--foreground))] text-[hsl(var(--background))] py-3 text-sm font-semibold shadow-sm transition-all hover:opacity-90 disabled:opacity-60 active:scale-[0.98] cursor-pointer"
        >
          {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
        </button>
      </form>

      <p class="mt-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
        Your data is stored locally and syncs when online.
      </p>
    </div>
  </div>
</div>
