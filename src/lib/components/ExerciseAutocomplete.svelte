<script lang="ts">
  import { EXERCISES } from '../exercises';
  import type { Exercise } from '../types';

  let {
    value = $bindable(''),
    exerciseId = $bindable(''),
    onSelect,
    placeholder = 'Exercise…',
  }: {
    value?: string;
    exerciseId?: string;
    onSelect?: (exercise: Exercise) => void;
    placeholder?: string;
  } = $props();

  let query = $state(value);
  let focused = $state(false);
  let activeIndex = $state(0); // default to first so Enter always works
  let inputEl: HTMLInputElement;

  // Sync internal query when external value prop changes (e.g. after row commit/reset)
  $effect(() => {
    const v = value;
    if (v !== query) query = v;
  });

  /**
   * Smart multi-token fuzzy search over the exercise list.
   *
   * Splits the query into whitespace-separated tokens; every token must appear
   * somewhere in the exercise name (case-insensitive substring match).
   *
   * Scoring (higher = ranked first):
   *  - +position bonus: tokens that appear earlier in the name score higher (100 − index)
   *  - +50 for each token that is a prefix of the name
   *  - +100 if the name starts with the first query token
   *
   * Returns up to 20 results sorted by descending score.
   */
  function smartSearch(q: string): Exercise[] {
    if (!q || q.length < 1) return EXERCISES.slice(0, 20);
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: Array<[number, Exercise]> = [];
    for (const ex of EXERCISES) {
      const n = ex.name.toLowerCase();
      // All tokens must appear somewhere in the name
      if (!tokens.every((t) => n.includes(t))) continue;
      // Score: boost for earlier positions and prefix matches
      let score = 0;
      for (const t of tokens) {
        const idx = n.indexOf(t);
        score += (100 - idx) + (n.startsWith(t) ? 50 : 0);
      }
      // Boost exact full-name starts
      if (n.startsWith(tokens[0])) score += 100;
      scored.push([score, ex]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, 20).map(([, ex]) => ex);
  }

  const filtered = $derived(() => smartSearch(query));
  const showDropdown = $derived(focused && filtered().length > 0);

  function select(ex: Exercise) {
    query = ex.name;
    value = ex.name;
    exerciseId = ex.id;
    focused = false;
    activeIndex = 0;
    onSelect?.(ex);
  }

  function handleKeydown(e: KeyboardEvent) {
    const items = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Always pick the highlighted item (default is index 0 = first suggestion)
      if (items.length > 0) select(items[activeIndex]);
    } else if (e.key === 'Escape') {
      focused = false;
    }
  }

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    value = query;
    exerciseId = '';
    activeIndex = 0; // reset highlight to first item
  }
</script>

<div class="relative z-20 w-full">
  <input
    bind:this={inputEl}
    type="text"
    value={query}
    {placeholder}
    oninput={handleInput}
    onfocus={() => { focused = true; }}
    onblur={() => { setTimeout(() => { focused = false; }, 150); }}
    onkeydown={handleKeydown}
    class="w-full bg-transparent py-1.5 px-1 text-sm font-medium outline-none rounded
           focus:bg-[hsl(var(--muted)/0.5)]
           placeholder:text-[hsl(var(--muted-foreground)/0.35)]
           transition-colors truncate"
    style="font-size:16px"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
  />

  {#if showDropdown}
    <div class="absolute left-0 right-0 top-full z-[80] mt-1 max-h-56 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
      {#each filtered() as ex, i}
        <button
          type="button"
          class="flex w-full items-center px-3 py-2 text-left text-sm transition-colors {i === activeIndex ? 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'}"
          onmousedown={() => select(ex)}
        >
          <span class="flex-1 font-medium">{ex.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
