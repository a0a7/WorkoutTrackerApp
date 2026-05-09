<script lang="ts">
  import { fly } from 'svelte/transition';
  import { keypadConfig, closeKeypad } from '$lib/stores/keypadStore';

  // Local display value — initialised from config when keypad opens
  let localValue = $state('');

  $effect(() => {
    if ($keypadConfig !== null) {
      localValue = $keypadConfig.value;
    }
  });

  function handleKey(key: string) {
    const cfg = $keypadConfig;
    if (!cfg) return;

    let v = localValue;
    if (key === '⌫') {
      v = v.slice(0, -1);
    } else if (key === '.') {
      if (cfg.allowDecimal && !v.includes('.')) v = v + '.';
    } else if (key === 'x') {
      if (cfg.allowShorthand) v = v + 'x';
    } else {
      // Digits — prevent multiple leading zeros
      if (v === '0') {
        v = key;
      } else {
        v = v + key;
      }
    }
    localValue = v;
    cfg.onInput(v);
  }

  async function handleDone() {
    const cfg = $keypadConfig;
    closeKeypad();
    await cfg?.onDone();
  }

  async function handleNext() {
    const cfg = $keypadConfig;
    closeKeypad();
    await cfg?.onNext?.();
  }

  async function handleCancel() {
    const cfg = $keypadConfig;
    closeKeypad();
    await cfg?.onCancel?.();
  }

  async function handleEnter() {
    const cfg = $keypadConfig;
    if (!cfg) return;
    if (cfg.onNext) await handleNext();
    else await handleDone();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (!$keypadConfig) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnter().catch(() => {});
    }
  }}
/>

{#if $keypadConfig}
  <!-- Backdrop — tap anywhere outside to dismiss -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-[59]" onclick={handleCancel}></div>

  <div
    class="fixed bottom-0 left-0 right-0 z-[60]
           bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] shadow-lg"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    transition:fly={{ y: 280, duration: 180, opacity: 1 }}
    role="toolbar"
    aria-label="Number keypad"
  >
    <div class="grid grid-cols-3 gap-1 px-2 pt-2 pb-1">
      {#each ['1','2','3','4','5','6','7','8','9'] as key (key)}
        <button
          onclick={() => handleKey(key)}
          class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95"
        >
          <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-lg font-medium text-[hsl(var(--foreground))] active:bg-[hsl(var(--border))]">
            {key}
          </span>
        </button>
      {/each}

      {#if $keypadConfig.allowDecimal}
        <button
          onclick={() => handleKey('.')}
          disabled={localValue.includes('.')}
          class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95 disabled:opacity-25"
        >
          <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-lg font-medium text-[hsl(var(--foreground))] active:bg-[hsl(var(--border))]">.</span>
        </button>
      {:else if $keypadConfig.allowShorthand}
        <button
          onclick={() => handleKey('x')}
          disabled={localValue.startsWith('x') || (localValue.match(/[xX×*]/g)?.length ?? 0) >= 2}
          class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95 disabled:opacity-25"
        >
          <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-lg font-medium text-[hsl(var(--foreground))] active:bg-[hsl(var(--border))]">x</span>
        </button>
      {:else}
        <div class="h-12"></div>
      {/if}

      <button
        onclick={() => handleKey('0')}
        class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95"
      >
        <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-lg font-medium text-[hsl(var(--foreground))] active:bg-[hsl(var(--border))]">0</span>
      </button>

      <button
        onclick={() => handleKey('⌫')}
        class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95"
        aria-label="Backspace"
      >
        <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] active:bg-[hsl(var(--border))]">
          <svg class="mx-auto" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
            <line x1="18" y1="9" x2="12" y2="15"/>
            <line x1="12" y1="9" x2="18" y2="15"/>
          </svg>
        </span>
      </button>
    </div>

    <div class="grid grid-cols-3 gap-1 px-2 pb-2">
      <button
        onclick={handleCancel}
        class="h-12 rounded-2xl p-1 transition-transform select-none touch-manipulation active:scale-95"
        aria-label="Close keyboard"
      >
        <span class="flex h-full w-full items-center justify-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] active:bg-[hsl(var(--border))]">
          <svg class="mx-auto" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>

      {#if $keypadConfig.onNext}
        <button
          onclick={handleNext}
          class="col-span-2 h-12 rounded-xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                  active:scale-95 transition-transform select-none touch-manipulation"
        >Next &#8594;</button>
      {:else}
        <button
          onclick={handleDone}
          class="col-span-2 h-12 rounded-xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                  active:scale-95 transition-transform select-none touch-manipulation"
        >Done &#10003;</button>
      {/if}
    </div>
  </div>
{/if}
