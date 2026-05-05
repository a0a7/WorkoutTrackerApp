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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error = data.message ?? data.error ?? `Request failed (${res.status})`;
        return;
      }
      const data = await res.json();
      userStore.login({ id: data.userId, email, token: data.token });
      goto('/');
    } catch {
      error = 'Network error — check your connection and try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>WorkOut – Sign In</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4 bg-[hsl(var(--background))]">
  <div class="w-full max-w-sm">
    <!-- Logo -->
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] shadow-lg">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
          <path d="M6.5 6.5h11M6.5 12h11M6.5 17.5h11"/>
        </svg>
      </div>
      <h1 class="text-3xl font-bold text-[hsl(var(--foreground))]">WorkOut</h1>
      <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Track your fitness journey</p>
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
          class="mt-1 w-full rounded-xl bg-[hsl(var(--primary))] py-3 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60 active:scale-[0.98]"
        >
          {#if loading}
            <span class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </span>
          {:else}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          {/if}
        </button>
      </form>

      <p class="mt-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
        Your data is stored locally and syncs when online.
      </p>
    </div>
  </div>
</div>
