<script lang="ts">
  import type { MuscleActivation, MuscleId } from '../types';

  let { activations = [] }: { activations: MuscleActivation[] } = $props();

  const muscleColors: Record<string, string> = {
    primary: '#6366f1',
    secondary: '#a5b4fc',
    tertiary: '#e0e7ff',
  };

  function getMuscleColor(muscleId: MuscleId): string {
    const found = activations.find((a) => a.muscle === muscleId);
    if (!found) return 'transparent';
    return muscleColors[found.activation] ?? 'transparent';
  }

  function getMuscleOpacity(muscleId: MuscleId): number {
    const found = activations.find((a) => a.muscle === muscleId);
    if (!found) return 0;
    return found.activation === 'primary' ? 1 : found.activation === 'secondary' ? 0.75 : 0.5;
  }

  // Helper to get fill style
  function fill(id: MuscleId) {
    return getMuscleColor(id);
  }
</script>

<div class="flex gap-4 justify-center">
  <!-- Front View -->
  <div class="flex flex-col items-center gap-1">
    <p class="text-xs font-medium text-[hsl(var(--muted-foreground))]">Front</p>
    <svg viewBox="0 0 120 260" width="110" height="220" xmlns="http://www.w3.org/2000/svg">
      <!-- Body silhouette -->
      <path d="M50,8 C44,8 38,12 38,20 C38,28 42,33 50,35 C58,33 62,28 62,20 C62,12 56,8 50,8 Z" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Neck -->
      <rect x="46" y="35" width="8" height="10" rx="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Torso -->
      <path d="M32,45 L68,45 L72,110 L28,110 Z" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Upper chest -->
      <path d="M34,46 L50,52 L50,65 L34,59 Z" fill={fill('chest_upper')} opacity={getMuscleOpacity('chest_upper')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M66,46 L50,52 L50,65 L66,59 Z" fill={fill('chest_upper')} opacity={getMuscleOpacity('chest_upper')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Mid chest -->
      <path d="M34,59 L50,65 L50,76 L34,70 Z" fill={fill('chest_mid')} opacity={getMuscleOpacity('chest_mid')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M66,59 L50,65 L50,76 L66,70 Z" fill={fill('chest_mid')} opacity={getMuscleOpacity('chest_mid')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Lower chest -->
      <path d="M35,70 L50,76 L50,82 L36,78 Z" fill={fill('chest_lower')} opacity={getMuscleOpacity('chest_lower')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M65,70 L50,76 L50,82 L64,78 Z" fill={fill('chest_lower')} opacity={getMuscleOpacity('chest_lower')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Abs -->
      <rect x="43" y="82" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="50" y="82" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="43" y="91" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="50" y="91" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="43" y="100" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="50" y="100" width="7" height="7" rx="1.5" fill={fill('abs')} opacity={getMuscleOpacity('abs')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Obliques -->
      <path d="M36,78 L43,82 L43,107 L34,107 Z" fill={fill('oblique')} opacity={getMuscleOpacity('oblique')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M64,78 L57,82 L57,107 L66,107 Z" fill={fill('oblique')} opacity={getMuscleOpacity('oblique')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Serratus -->
      <path d="M33,62 L36,62 L35,78 L32,78 Z" fill={fill('serratus')} opacity={getMuscleOpacity('serratus')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M67,62 L64,62 L65,78 L68,78 Z" fill={fill('serratus')} opacity={getMuscleOpacity('serratus')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Front delts -->
      <ellipse cx="30" cy="50" rx="6" ry="8" fill={fill('front_delt')} opacity={getMuscleOpacity('front_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <ellipse cx="70" cy="50" rx="6" ry="8" fill={fill('front_delt')} opacity={getMuscleOpacity('front_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Side delts -->
      <ellipse cx="25" cy="55" rx="5" ry="7" fill={fill('side_delt')} opacity={getMuscleOpacity('side_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <ellipse cx="75" cy="55" rx="5" ry="7" fill={fill('side_delt')} opacity={getMuscleOpacity('side_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Upper arms (biceps) -->
      <path d="M22,60 L28,60 L26,82 L20,82 Z" fill={fill('bicep')} opacity={getMuscleOpacity('bicep')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M78,60 L72,60 L74,82 L80,82 Z" fill={fill('bicep')} opacity={getMuscleOpacity('bicep')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Forearms -->
      <path d="M19,82 L26,82 L24,105 L17,105 Z" fill={fill('forearm')} opacity={getMuscleOpacity('forearm')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M81,82 L74,82 L76,105 L83,105 Z" fill={fill('forearm')} opacity={getMuscleOpacity('forearm')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Quads -->
      <path d="M34,112 L47,112 L45,160 L32,160 Z" fill={fill('quad')} opacity={getMuscleOpacity('quad')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M66,112 L53,112 L55,160 L68,160 Z" fill={fill('quad')} opacity={getMuscleOpacity('quad')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Adductors (inner thigh front) -->
      <path d="M47,112 L53,112 L54,145 L46,145 Z" fill={fill('adductor')} opacity={getMuscleOpacity('adductor')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Hip flexors -->
      <path d="M38,108 L47,108 L47,116 L36,116 Z" fill={fill('hip_flexor')} opacity={getMuscleOpacity('hip_flexor')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M62,108 L53,108 L53,116 L64,116 Z" fill={fill('hip_flexor')} opacity={getMuscleOpacity('hip_flexor')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Calves (front visible slightly) -->
      <path d="M33,162 L45,162 L44,200 L32,200 Z" fill={fill('calf')} opacity={getMuscleOpacity('calf') * 0.6} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M67,162 L55,162 L56,200 L68,200 Z" fill={fill('calf')} opacity={getMuscleOpacity('calf') * 0.6} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Knees -->
      <ellipse cx="39" cy="162" rx="7" ry="5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <ellipse cx="61" cy="162" rx="7" ry="5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Feet -->
      <ellipse cx="38" cy="202" rx="8" ry="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <ellipse cx="62" cy="202" rx="8" ry="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
    </svg>
  </div>

  <!-- Back View -->
  <div class="flex flex-col items-center gap-1">
    <p class="text-xs font-medium text-[hsl(var(--muted-foreground))]">Back</p>
    <svg viewBox="0 0 120 260" width="110" height="220" xmlns="http://www.w3.org/2000/svg">
      <!-- Head -->
      <path d="M50,8 C44,8 38,12 38,20 C38,28 42,33 50,35 C58,33 62,28 62,20 C62,12 56,8 50,8 Z" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Neck -->
      <rect x="46" y="35" width="8" height="10" rx="2" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Torso back -->
      <path d="M32,45 L68,45 L72,110 L28,110 Z" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Upper traps -->
      <path d="M34,45 L50,50 L66,45 L60,35 L40,35 Z" fill={fill('trap_upper')} opacity={getMuscleOpacity('trap_upper')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Mid traps -->
      <path d="M36,56 L50,60 L64,56 L66,45 L50,50 L34,45 Z" fill={fill('trap_mid')} opacity={getMuscleOpacity('trap_mid')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Lower traps -->
      <path d="M38,72 L50,75 L62,72 L64,56 L50,60 L36,56 Z" fill={fill('trap_lower')} opacity={getMuscleOpacity('trap_lower')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Rhomboids -->
      <path d="M41,56 L50,59 L59,56 L59,74 L50,76 L41,74 Z" fill={fill('rhomboid')} opacity={getMuscleOpacity('rhomboid')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Lats -->
      <path d="M32,60 L40,56 L40,90 L30,108 Z" fill={fill('lat')} opacity={getMuscleOpacity('lat')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M68,60 L60,56 L60,90 L70,108 Z" fill={fill('lat')} opacity={getMuscleOpacity('lat')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Erector spinae -->
      <rect x="44" y="76" width="5" height="30" rx="2" fill={fill('erector')} opacity={getMuscleOpacity('erector')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <rect x="51" y="76" width="5" height="30" rx="2" fill={fill('erector')} opacity={getMuscleOpacity('erector')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Lower back -->
      <path d="M40,106 L60,106 L62,112 L38,112 Z" fill={fill('lower_back')} opacity={getMuscleOpacity('lower_back')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Rear delts -->
      <ellipse cx="28" cy="50" rx="6" ry="7" fill={fill('rear_delt')} opacity={getMuscleOpacity('rear_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <ellipse cx="72" cy="50" rx="6" ry="7" fill={fill('rear_delt')} opacity={getMuscleOpacity('rear_delt')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Triceps (back of arms) -->
      <path d="M22,60 L28,60 L26,82 L20,82 Z" fill={fill('tricep')} opacity={getMuscleOpacity('tricep')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M78,60 L72,60 L74,82 L80,82 Z" fill={fill('tricep')} opacity={getMuscleOpacity('tricep')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Forearms -->
      <path d="M19,82 L26,82 L24,105 L17,105 Z" fill={fill('forearm')} opacity={getMuscleOpacity('forearm')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M81,82 L74,82 L76,105 L83,105 Z" fill={fill('forearm')} opacity={getMuscleOpacity('forearm')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Glutes -->
      <path d="M34,112 L47,118 L47,138 L34,135 Z" fill={fill('glute')} opacity={getMuscleOpacity('glute')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M66,112 L53,118 L53,138 L66,135 Z" fill={fill('glute')} opacity={getMuscleOpacity('glute')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Hamstrings -->
      <path d="M34,135 L47,138 L46,165 L33,162 Z" fill={fill('hamstring')} opacity={getMuscleOpacity('hamstring')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M66,135 L53,138 L54,165 L67,162 Z" fill={fill('hamstring')} opacity={getMuscleOpacity('hamstring')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Adductors back -->
      <path d="M47,118 L53,118 L54,155 L46,155 Z" fill={fill('adductor')} opacity={getMuscleOpacity('adductor') * 0.6} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Abductors -->
      <path d="M32,112 L38,112 L36,135 L30,132 Z" fill={fill('abductor')} opacity={getMuscleOpacity('abductor')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M68,112 L62,112 L64,135 L70,132 Z" fill={fill('abductor')} opacity={getMuscleOpacity('abductor')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Calves -->
      <path d="M33,165 L46,165 L45,200 L32,200 Z" fill={fill('calf')} opacity={getMuscleOpacity('calf')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <path d="M67,165 L54,165 L55,200 L68,200 Z" fill={fill('calf')} opacity={getMuscleOpacity('calf')} stroke="hsl(var(--border))" stroke-width="0.3"/>
      <!-- Knees -->
      <ellipse cx="39" cy="165" rx="7" ry="5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <ellipse cx="61" cy="165" rx="7" ry="5" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <!-- Feet -->
      <ellipse cx="38" cy="202" rx="8" ry="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
      <ellipse cx="62" cy="202" rx="8" ry="4" fill="hsl(var(--muted))" stroke="hsl(var(--border))" stroke-width="0.5"/>
    </svg>
  </div>
</div>

<!-- Legend -->
{#if activations.length > 0}
  <div class="mt-3 flex items-center gap-3 justify-center flex-wrap">
    <div class="flex items-center gap-1.5">
      <div class="h-3 w-3 rounded-full" style="background: #6366f1"></div>
      <span class="text-xs text-[hsl(var(--muted-foreground))]">Primary</span>
    </div>
    <div class="flex items-center gap-1.5">
      <div class="h-3 w-3 rounded-full" style="background: #a5b4fc"></div>
      <span class="text-xs text-[hsl(var(--muted-foreground))]">Secondary</span>
    </div>
    <div class="flex items-center gap-1.5">
      <div class="h-3 w-3 rounded-full" style="background: #e0e7ff"></div>
      <span class="text-xs text-[hsl(var(--muted-foreground))]">Tertiary</span>
    </div>
  </div>
{/if}
