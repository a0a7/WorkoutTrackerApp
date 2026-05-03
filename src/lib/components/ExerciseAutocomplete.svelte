<script lang="ts">
  import { EXERCISES } from '../exercises';
  import type { Exercise } from '../types';

  let {
    value = $bindable(''),
    exerciseId = $bindable(''),
    onSelect,
    placeholder = 'Exercise...',
  }: {
    value?: string;
    exerciseId?: string;
    onSelect?: (exercise: Exercise) => void;
    placeholder?: string;
  } = $props();

  let query = $state(value);
  let focused = $state(false);
  let activeIndex = $state(-1);
  let inputEl: HTMLInputElement;

  const filtered = $derived(() => {
    if (!query || query.length < 1) return EXERCISES.slice(0, 20);
    const q = query.toLowerCase();
    return EXERCISES.filter((e) =>
      e.name.toLowerCase().includes(q)
    ).slice(0, 15);
  });

  const showDropdown = $derived(focused && filtered().length > 0);

  function select(ex: Exercise) {
    query = ex.name;
    value = ex.name;
    exerciseId = ex.id;
    focused = false;
    activeIndex = -1;
    onSelect?.(ex);
  }

  function handleKeydown(e: KeyboardEvent) {
    const items = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(items[activeIndex]);
    } else if (e.key === 'Escape') {
      focused = false;
    }
  }

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    value = query;
    exerciseId = '';
    activeIndex = -1;
  }

  const categoryColors: Record<string, string> = {
    'barbell': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'free-weight': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'machine': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'cable': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'bodyweight': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  };
</script>

<div class="relative w-full">
  <input
    bind:this={inputEl}
    type="text"
    value={query}
    {placeholder}
    oninput={handleInput}
    onfocus={() => { focused = true; }}
    onblur={() => { setTimeout(() => { focused = false; }, 150); }}
    onkeydown={handleKeydown}
    class="w-full rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] placeholder:text-[hsl(var(--muted-foreground))]"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
  />

  {#if showDropdown}
    <div class="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
      {#each filtered() as ex, i}
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))] {i === activeIndex ? 'bg-[hsl(var(--muted))]' : ''}"
          onmousedown={() => select(ex)}
        >
          <span class="flex-1 font-medium text-[hsl(var(--foreground))]">{ex.name}</span>
          <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {categoryColors[ex.category] ?? ''}">
            {ex.category}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
