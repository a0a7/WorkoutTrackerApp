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

  function handleDone() {
    const cfg = $keypadConfig;
    closeKeypad();
    cfg?.onDone();
  }

  function handleNext() {
    const cfg = $keypadConfig;
    closeKeypad();
    cfg?.onNext?.();
  }

  function handleCancel() {
    const cfg = $keypadConfig;
    closeKeypad();
    cfg?.onCancel?.();
  }
</script>

{#if $keypadConfig}
  <div
    class="fixed bottom-0 left-0 right-0 z-[60]
           bg-[hsl(var(--card))] border-t border-[hsl(var(--border))] shadow-lg"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    transition:fly={{ y: 280, duration: 180, opacity: 1 }}
    role="toolbar"
    aria-label="Number keypad"
  >
    <div class="grid grid-cols-3 gap-1 px-2 pt-2 pb-1">
      {#each ['7','8','9','4','5','6','1','2','3'] as key (key)}
        <button
          onclick={() => handleKey(key)}
          class="h-11 rounded-xl bg-[hsl(var(--muted))] text-lg font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation"
        >{key}</button>
      {/each}

      {#if $keypadConfig.allowDecimal}
        <button
          onclick={() => handleKey('.')}
          disabled={localValue.includes('.')}
          class="h-11 rounded-xl bg-[hsl(var(--muted))] text-lg font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation disabled:opacity-25"
        >.</button>
      {:else if $keypadConfig.allowShorthand}
        <button
          onclick={() => handleKey('x')}
          disabled={localValue.startsWith('x') || localValue.split('x').length > 2}
          class="h-11 rounded-xl bg-[hsl(var(--muted))] text-lg font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation disabled:opacity-25"
        >x</button>
      {:else}
        <div class="h-11"></div>
      {/if}

      <button
        onclick={() => handleKey('0')}
        class="h-11 rounded-xl bg-[hsl(var(--muted))] text-lg font-medium
               text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
               transition-transform select-none touch-manipulation"
      >0</button>

      <button
        onclick={() => handleKey('⌫')}
        class="h-11 rounded-xl bg-[hsl(var(--muted))] text-lg font-medium
               text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
               transition-transform select-none touch-manipulation"
        aria-label="Backspace"
      >
        <svg class="mx-auto" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <line x1="18" y1="9" x2="12" y2="15"/>
          <line x1="12" y1="9" x2="18" y2="15"/>
        </svg>
      </button>
    </div>

    <div class="flex gap-1 px-2 pb-2">
      {#if $keypadConfig.onNext}
        <button
          onclick={handleNext}
          class="h-10 flex-1 rounded-xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                 active:scale-95 transition-transform select-none touch-manipulation"
        >Next &#8594;</button>
      {:else}
        <button
          onclick={handleDone}
          class="h-10 flex-1 rounded-xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                 active:scale-95 transition-transform select-none touch-manipulation"
        >Done &#10003;</button>
      {/if}
    </div>
  </div>
{/if}
