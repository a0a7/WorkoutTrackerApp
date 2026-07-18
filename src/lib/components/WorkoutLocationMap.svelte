<script lang="ts">
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { WorkoutLocation } from '$lib/location';

  let { location }: { location: WorkoutLocation } = $props();

  let mapEl = $state<HTMLDivElement | null>(null);
  let map: maplibregl.Map | null = null;

  onMount(() => {
    if (!mapEl) return;
    map = new maplibregl.Map({
      container: mapEl,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: [location.lng, location.lat],
      zoom: 16,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    new maplibregl.Marker({ color: '#111827' }).setLngLat([location.lng, location.lat]).addTo(map);

    return () => {
      map?.remove();
      map = null;
    };
  });
</script>

<div class="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-sm">
  <div class="flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Location</p>
      <p class="text-sm font-medium text-[hsl(var(--foreground))]">{location.label?.trim() || `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`}</p>
    </div>
  </div>
  <div bind:this={mapEl} class="h-56 w-full"></div>
</div>
