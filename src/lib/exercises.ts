import type { Exercise } from './types';

export const EXERCISES: Exercise[] = [
  // ── CHEST ──────────────────────────────────────────────────────────────
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'chest_upper', activation: 'secondary' },
      { muscle: 'chest_lower', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
    ],
  },
  {
    id: 'incline-barbell-bench-press',
    name: 'Incline Barbell Bench Press',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'chest_upper', activation: 'primary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'chest_mid', activation: 'tertiary' },
    ],
  },
  {
    id: 'decline-barbell-bench-press',
    name: 'Decline Barbell Bench Press',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'chest_lower', activation: 'primary' },
      { muscle: 'chest_mid', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'dumbbell-bench-press',
    name: 'Dumbbell Bench Press',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'chest_upper', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
    ],
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'chest_upper', activation: 'primary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'serratus', activation: 'tertiary' },
    ],
  },
  {
    id: 'dumbbell-fly',
    name: 'Dumbbell Fly',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'chest_upper', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-fly-high',
    name: 'Cable Fly (High to Low)',
    category: 'cable',
    muscleActivations: [
      { muscle: 'chest_lower', activation: 'primary' },
      { muscle: 'chest_mid', activation: 'secondary' },
      { muscle: 'serratus', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-fly-low',
    name: 'Cable Fly (Low to High)',
    category: 'cable',
    muscleActivations: [
      { muscle: 'chest_upper', activation: 'primary' },
      { muscle: 'chest_mid', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'pec-deck',
    name: 'Pec Deck Machine',
    category: 'machine',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'chest_upper', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'pushup',
    name: 'Push-Up',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'serratus', activation: 'tertiary' },
    ],
  },
  {
    id: 'chest-dip',
    name: 'Chest Dip',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'chest_lower', activation: 'primary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'secondary' },
    ],
  },
  {
    id: 'machine-chest-press',
    name: 'Machine Chest Press',
    category: 'machine',
    muscleActivations: [
      { muscle: 'chest_mid', activation: 'primary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
    ],
  },

  // ── BACK ──────────────────────────────────────────────────────────────
  {
    id: 'deadlift',
    name: 'Deadlift',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'erector', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'trap_upper', activation: 'secondary' },
      { muscle: 'lat', activation: 'secondary' },
      { muscle: 'quad', activation: 'tertiary' },
      { muscle: 'forearm', activation: 'tertiary' },
    ],
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'hamstring', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'erector', activation: 'secondary' },
      { muscle: 'lower_back', activation: 'secondary' },
      { muscle: 'forearm', activation: 'tertiary' },
    ],
  },
  {
    id: 'barbell-row',
    name: 'Barbell Row',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'primary' },
      { muscle: 'trap_mid', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'secondary' },
      { muscle: 'bicep', activation: 'secondary' },
      { muscle: 'erector', activation: 'tertiary' },
    ],
  },
  {
    id: 'pullup',
    name: 'Pull-Up',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'bicep', activation: 'secondary' },
      { muscle: 'rhomboid', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'chinup',
    name: 'Chin-Up',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'secondary' },
      { muscle: 'chest_lower', activation: 'tertiary' },
    ],
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    category: 'cable',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'bicep', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'secondary' },
      { muscle: 'rhomboid', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-row',
    name: 'Seated Cable Row',
    category: 'cable',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'primary' },
      { muscle: 'trap_mid', activation: 'secondary' },
      { muscle: 'bicep', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'dumbbell-row',
    name: 'Single-Arm Dumbbell Row',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'secondary' },
      { muscle: 'bicep', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'secondary' },
    ],
  },
  {
    id: 'machine-row',
    name: 'Machine Row',
    category: 'machine',
    muscleActivations: [
      { muscle: 'rhomboid', activation: 'primary' },
      { muscle: 'lat', activation: 'secondary' },
      { muscle: 'trap_mid', activation: 'secondary' },
      { muscle: 'bicep', activation: 'tertiary' },
    ],
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    category: 'cable',
    muscleActivations: [
      { muscle: 'rear_delt', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'primary' },
      { muscle: 'trap_mid', activation: 'secondary' },
      { muscle: 'trap_lower', activation: 'secondary' },
      { muscle: 'bicep', activation: 'tertiary' },
    ],
  },
  {
    id: 'back-extension',
    name: 'Back Extension',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'erector', activation: 'primary' },
      { muscle: 'lower_back', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'tertiary' },
    ],
  },
  {
    id: 'sumo-deadlift',
    name: 'Sumo Deadlift',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'adductor', activation: 'primary' },
      { muscle: 'quad', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'erector', activation: 'secondary' },
    ],
  },
  {
    id: 'straight-arm-pulldown',
    name: 'Straight-Arm Pulldown',
    category: 'cable',
    muscleActivations: [
      { muscle: 'lat', activation: 'primary' },
      { muscle: 'serratus', activation: 'secondary' },
      { muscle: 'tricep', activation: 'tertiary' },
    ],
  },

  // ── SHOULDERS ─────────────────────────────────────────────────────────
  {
    id: 'barbell-ohp',
    name: 'Barbell Overhead Press',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'side_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'trap_upper', activation: 'tertiary' },
    ],
  },
  {
    id: 'dumbbell-ohp',
    name: 'Dumbbell Overhead Press',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'side_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'trap_upper', activation: 'tertiary' },
    ],
  },
  {
    id: 'lateral-raise',
    name: 'Lateral Raise',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'side_delt', activation: 'primary' },
      { muscle: 'trap_upper', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-lateral-raise',
    name: 'Cable Lateral Raise',
    category: 'cable',
    muscleActivations: [
      { muscle: 'side_delt', activation: 'primary' },
      { muscle: 'trap_upper', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'front-raise',
    name: 'Front Raise',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'side_delt', activation: 'tertiary' },
      { muscle: 'chest_upper', activation: 'tertiary' },
    ],
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'rear_delt', activation: 'primary' },
      { muscle: 'rhomboid', activation: 'secondary' },
      { muscle: 'trap_mid', activation: 'secondary' },
    ],
  },
  {
    id: 'machine-shoulder-press',
    name: 'Machine Shoulder Press',
    category: 'machine',
    muscleActivations: [
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'side_delt', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
    ],
  },
  {
    id: 'upright-row',
    name: 'Upright Row',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'trap_upper', activation: 'primary' },
      { muscle: 'side_delt', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
      { muscle: 'bicep', activation: 'tertiary' },
    ],
  },
  {
    id: 'shrug',
    name: 'Barbell Shrug',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'trap_upper', activation: 'primary' },
      { muscle: 'trap_mid', activation: 'secondary' },
    ],
  },
  {
    id: 'arnold-press',
    name: 'Arnold Press',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'side_delt', activation: 'primary' },
      { muscle: 'tricep', activation: 'secondary' },
      { muscle: 'rear_delt', activation: 'tertiary' },
    ],
  },

  // ── BICEPS ────────────────────────────────────────────────────────────
  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'secondary' },
    ],
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'primary' },
    ],
  },
  {
    id: 'incline-curl',
    name: 'Incline Dumbbell Curl',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'secondary' },
    ],
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    category: 'machine',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'secondary' },
    ],
  },
  {
    id: 'cable-curl',
    name: 'Cable Curl',
    category: 'cable',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'secondary' },
    ],
  },
  {
    id: 'concentration-curl',
    name: 'Concentration Curl',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'bicep', activation: 'primary' },
      { muscle: 'forearm', activation: 'tertiary' },
    ],
  },
  {
    id: 'reverse-curl',
    name: 'Reverse Curl',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'forearm', activation: 'primary' },
      { muscle: 'bicep', activation: 'secondary' },
    ],
  },

  // ── TRICEPS ───────────────────────────────────────────────────────────
  {
    id: 'close-grip-bench',
    name: 'Close-Grip Bench Press',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
      { muscle: 'chest_mid', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'secondary' },
    ],
  },
  {
    id: 'tricep-dip',
    name: 'Tricep Dip',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
      { muscle: 'front_delt', activation: 'secondary' },
      { muscle: 'chest_lower', activation: 'tertiary' },
    ],
  },
  {
    id: 'skull-crusher',
    name: 'Skull Crusher',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },
  {
    id: 'tricep-pushdown',
    name: 'Tricep Pushdown',
    category: 'cable',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
    ],
  },
  {
    id: 'overhead-tricep-extension',
    name: 'Overhead Tricep Extension',
    category: 'cable',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
    ],
  },
  {
    id: 'tricep-kickback',
    name: 'Tricep Kickback',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
    ],
  },
  {
    id: 'diamond-pushup',
    name: 'Diamond Push-Up',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'tricep', activation: 'primary' },
      { muscle: 'chest_mid', activation: 'secondary' },
      { muscle: 'front_delt', activation: 'tertiary' },
    ],
  },

  // ── LEGS ──────────────────────────────────────────────────────────────
  {
    id: 'barbell-squat',
    name: 'Barbell Back Squat',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'erector', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
      { muscle: 'calf', activation: 'tertiary' },
    ],
  },
  {
    id: 'front-squat',
    name: 'Front Squat',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'erector', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    category: 'machine',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    category: 'machine',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
    ],
  },
  {
    id: 'lying-leg-curl',
    name: 'Lying Leg Curl',
    category: 'machine',
    muscleActivations: [
      { muscle: 'hamstring', activation: 'primary' },
      { muscle: 'calf', activation: 'tertiary' },
    ],
  },
  {
    id: 'seated-leg-curl',
    name: 'Seated Leg Curl',
    category: 'machine',
    muscleActivations: [
      { muscle: 'hamstring', activation: 'primary' },
    ],
  },
  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'adductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'lunge',
    name: 'Dumbbell Lunge',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'secondary' },
    ],
  },
  {
    id: 'walking-lunge',
    name: 'Walking Lunge',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'calf', activation: 'tertiary' },
    ],
  },
  {
    id: 'standing-calf-raise',
    name: 'Standing Calf Raise',
    category: 'machine',
    muscleActivations: [
      { muscle: 'calf', activation: 'primary' },
    ],
  },
  {
    id: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    category: 'machine',
    muscleActivations: [
      { muscle: 'calf', activation: 'primary' },
    ],
  },
  {
    id: 'hack-squat',
    name: 'Hack Squat',
    category: 'machine',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'tertiary' },
    ],
  },
  {
    id: 'step-up',
    name: 'Step-Up',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
    ],
  },
  {
    id: 'glute-bridge',
    name: 'Glute Bridge',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
    ],
  },
  {
    id: 'nordic-curl',
    name: 'Nordic Hamstring Curl',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'hamstring', activation: 'primary' },
      { muscle: 'glute', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-kickback',
    name: 'Cable Glute Kickback',
    category: 'cable',
    muscleActivations: [
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'hamstring', activation: 'secondary' },
    ],
  },
  {
    id: 'sumo-squat',
    name: 'Sumo Squat',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'adductor', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'quad', activation: 'secondary' },
    ],
  },
  {
    id: 'hip-abduction',
    name: 'Hip Abduction Machine',
    category: 'machine',
    muscleActivations: [
      { muscle: 'abductor', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
    ],
  },
  {
    id: 'hip-adduction',
    name: 'Hip Adduction Machine',
    category: 'machine',
    muscleActivations: [
      { muscle: 'adductor', activation: 'primary' },
    ],
  },

  // ── CORE ──────────────────────────────────────────────────────────────
  {
    id: 'plank',
    name: 'Plank',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'oblique', activation: 'secondary' },
      { muscle: 'erector', activation: 'secondary' },
    ],
  },
  {
    id: 'crunch',
    name: 'Crunch',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'oblique', activation: 'tertiary' },
    ],
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    category: 'cable',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'oblique', activation: 'secondary' },
    ],
  },
  {
    id: 'leg-raise',
    name: 'Hanging Leg Raise',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'hip_flexor', activation: 'secondary' },
      { muscle: 'oblique', activation: 'tertiary' },
    ],
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'oblique', activation: 'primary' },
      { muscle: 'abs', activation: 'secondary' },
    ],
  },
  {
    id: 'ab-wheel',
    name: 'Ab Wheel Rollout',
    category: 'free-weight',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'oblique', activation: 'secondary' },
      { muscle: 'lat', activation: 'tertiary' },
    ],
  },
  {
    id: 'side-plank',
    name: 'Side Plank',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'oblique', activation: 'primary' },
      { muscle: 'abs', activation: 'secondary' },
      { muscle: 'abductor', activation: 'tertiary' },
    ],
  },
  {
    id: 'bicycle-crunch',
    name: 'Bicycle Crunch',
    category: 'bodyweight',
    muscleActivations: [
      { muscle: 'abs', activation: 'primary' },
      { muscle: 'oblique', activation: 'primary' },
      { muscle: 'hip_flexor', activation: 'secondary' },
    ],
  },
  {
    id: 'pallof-press',
    name: 'Pallof Press',
    category: 'cable',
    muscleActivations: [
      { muscle: 'oblique', activation: 'primary' },
      { muscle: 'abs', activation: 'secondary' },
    ],
  },

  // ── FULL BODY / COMPOUND ───────────────────────────────────────────────
  {
    id: 'clean',
    name: 'Power Clean',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'trap_upper', activation: 'primary' },
      { muscle: 'erector', activation: 'primary' },
      { muscle: 'glute', activation: 'primary' },
      { muscle: 'quad', activation: 'secondary' },
      { muscle: 'hamstring', activation: 'secondary' },
      { muscle: 'calf', activation: 'tertiary' },
    ],
  },
  {
    id: 'thruster',
    name: 'Thruster',
    category: 'barbell',
    muscleActivations: [
      { muscle: 'quad', activation: 'primary' },
      { muscle: 'front_delt', activation: 'primary' },
      { muscle: 'glute', activation: 'secondary' },
      { muscle: 'tricep', activation: 'secondary' },
    ],
  },
];

export const EXERCISE_MAP = new Map<string, Exercise>(
  EXERCISES.map((e) => [e.id, e])
);
