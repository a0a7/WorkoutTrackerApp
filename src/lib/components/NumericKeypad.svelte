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
  <!-- Backdrop — tap to cancel -->
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 bg-black/20"
    onclick={handleCancel}
  ></div>

  <!-- Bottom sheet -->
  <div
    class="fixed bottom-0 left-0 right-0 z-50
           bg-[hsl(var(--card))] rounded-t-3xl shadow-2xl
           border-t border-[hsl(var(--border))]"
    style="padding-bottom: max(env(safe-area-inset-bottom, 0px), 8px)"
    transition:fly={{ y: 320, duration: 220, opacity: 1 }}
    role="dialog"
    aria-modal="true"
    aria-label="Number keypad"
  >
    <!-- Drag handle -->
    <div class="flex justify-center pt-2.5 pb-1">
      <div class="h-1 w-10 rounded-full bg-[hsl(var(--border))]"></div>
    </div>

    <!-- Value display -->
    <div class="px-5 py-2">
      {#if $keypadConfig.label}
        <p class="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-0.5">{$keypadConfig.label}</p>
      {/if}
      <div class="text-right text-3xl font-semibold text-[hsl(var(--foreground))] min-h-[2.75rem] leading-tight">
        {#if localValue}
          {localValue}
        {:else}
          <span class="text-[hsl(var(--muted-foreground)/0.4)]">—</span>
        {/if}
      </div>
    </div>

    <!-- Number grid -->
    <div class="grid grid-cols-3 gap-2 px-3 pb-1">
      {#each ['7','8','9','4','5','6','1','2','3'] as key (key)}
        <button
          onclick={() => handleKey(key)}
          class="h-14 rounded-2xl bg-[hsl(var(--muted))] text-xl font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation"
        >{key}</button>
      {/each}

      <!-- Modifier key (decimal or shorthand) -->
      {#if $keypadConfig.allowDecimal}
        <button
          onclick={() => handleKey('.')}
          disabled={localValue.includes('.')}
          class="h-14 rounded-2xl bg-[hsl(var(--muted))] text-xl font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation disabled:opacity-25"
        >.</button>
      {:else if $keypadConfig.allowShorthand}
        <!-- Disabled once 2 separators are already in place (format: "NxRxW") -->
        <button
          onclick={() => handleKey('x')}
          disabled={localValue.startsWith('x') || localValue.split('x').length > 2}
          class="h-14 rounded-2xl bg-[hsl(var(--muted))] text-xl font-medium
                 text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
                 transition-transform select-none touch-manipulation disabled:opacity-25"
        >x</button>
      {:else}
        <div class="h-14"></div>
      {/if}

      <button
        onclick={() => handleKey('0')}
        class="h-14 rounded-2xl bg-[hsl(var(--muted))] text-xl font-medium
               text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
               transition-transform select-none touch-manipulation"
      >0</button>

      <button
        onclick={() => handleKey('⌫')}
        class="h-14 rounded-2xl bg-[hsl(var(--muted))] text-xl font-medium
               text-[hsl(var(--foreground))] active:scale-95 active:bg-[hsl(var(--border))]
               transition-transform select-none touch-manipulation"
        aria-label="Backspace"
      >
        <svg class="mx-auto" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
          <line x1="18" y1="9" x2="12" y2="15"/>
          <line x1="12" y1="9" x2="18" y2="15"/>
        </svg>
      </button>
    </div>

    <!-- Action row -->
    <div class="flex gap-2 px-3 py-2">
      <button
        onclick={handleCancel}
        class="h-12 flex-none w-24 rounded-2xl bg-[hsl(var(--muted))]
               text-sm font-medium text-[hsl(var(--muted-foreground))]
               active:scale-95 transition-transform select-none touch-manipulation"
      >Cancel</button>

      {#if $keypadConfig.onNext}
        <button
          onclick={handleNext}
          class="h-12 flex-1 rounded-2xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                 active:scale-95 transition-transform select-none touch-manipulation"
        >Next →</button>
      {:else}
        <button
          onclick={handleDone}
          class="h-12 flex-1 rounded-2xl bg-[hsl(var(--primary))]
                 text-sm font-semibold text-white
                 active:scale-95 transition-transform select-none touch-manipulation"
        >Done ✓</button>
      {/if}
    </div>
  </div>
{/if}
