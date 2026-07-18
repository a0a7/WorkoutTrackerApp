import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { EXERCISES } from './src/lib/exercises.ts';

// Normalize helper to match DB strings against App exercises
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const appExercisesStr = EXERCISES.map(e => e.name);

// Find the best match for an old exercise name to the new app's schema
function findBestMatch(dbEx) {
    if (!dbEx) return { name: 'Unknown', id: 'unknown' };

    let normalizedDb = normalize(dbEx);
    
    // Exact overrides for known bad mappings
    if (dbEx === 'WEIGHTED_LEG_CURL') return { name: 'Lying Leg Curl', id: 'lying-leg-curl'};
    if (dbEx === 'BARBELL_HACK_SQUAT') return { name: 'Hack Squat Machine', id: 'hack-squat'};
    if (dbEx === 'FLYE') return { name: 'Pec Deck Machine', id: 'pec-deck'};
    if (dbEx === 'WEIGHTED_LEG_EXTENSIONS') return { name: 'Leg Extension', id: 'leg-extension'};
    if (dbEx === 'SHOULDER_PRESS') return { name: 'Barbell Overhead Press', id: 'barbell-ohp'};
    if (dbEx === 'WEIGHTED_STANDING_CALF_RAISE') return { name: 'Standing Calf Raise Machine', id: 'standing-calf-raise-machine'};  
    if (dbEx === 'LEG_ADDUCTION') return { name: 'Hip Adduction Machine', id: 'hip-adduction'};
    if (dbEx === 'REVERSE_EZ_BAR_CURL') return { name: 'Reverse Barbell Curl', id: 'reverse-curl'};
    if (dbEx === 'STANDING_EZ_BAR_BICEPS_CURL') return { name: 'EZ-Bar Curl', id: 'ez-bar-curl'};
    if (dbEx === 'PULL_UP') return { name: 'Pull-Up', id: 'pullup'};
    if (dbEx === 'TRICEPS_PRESSDOWN') return { name: 'Tricep Pushdown (Bar)', id: 'tricep-pushdown-bar'};
    if (dbEx === 'CABLE_OVERHEAD_TRICEPS_EXTENSION') return { name: 'Overhead Cable Tricep Extension', id: 'overhead-cable-tricep'};
    if (dbEx === 'EZ_BAR_PREACHER_CURL') return { name: 'EZ-Bar Curl', id: 'ez-bar-curl'};
    if (dbEx === 'TRICEPS_EXTENSION') return { name: 'Overhead Tricep Extension (Dumbbell)', id: 'overhead-tricep-ext-db'};
    if (dbEx === 'SEATED_REAR_LATERAL_RAISE') return { name: 'Bent-Over Rear Delt Raise', id: 'bent-over-rear-delt-raise'};
    if (dbEx === 'BARBELL_DEADLIFT') return { name: 'Deadlift', id: 'deadlift'};
    if (dbEx === 'LEG_ABDUCTION') return { name: 'Hip Abduction Machine', id: 'hip-abduction'};
    if (dbEx === 'CURL') return { name: 'Dumbbell Curl', id: 'dumbbell-curl'};
    if (dbEx === 'ROW') return { name: 'Barbell Row', id: 'barbell-row'};
    if (dbEx === 'BENCH_PRESS') return { name: 'Barbell Bench Press', id: 'barbell-bench-press'};
    if (dbEx === 'SIT_UP') return { name: 'Sit-Up', id: 'situp'};
    if (dbEx === 'EZ_BAR_OVERHEAD_TRICEPS_EXTENSION') return { name: 'EZ-Bar Skull Crusher', id: 'ez-bar-skull-crusher'};
    if (dbEx === 'CHEST_PRESS_WITH_BAND') return { name: 'Machine Chest Press', id: 'machine-chest-press'};
    if (dbEx === 'LEG_RAISE') return { name: 'Lying Leg Raise', id: 'lying-leg-raise'};
    if (dbEx === 'LYING_EZ_BAR_TRICEPS_EXTENSION') return { name: 'EZ-Bar Skull Crusher', id: 'ez-bar-skull-crusher'};
    if (dbEx === 'HANGING_LEG_RAISE') return { name: 'Hanging Leg Raise', id: 'leg-raise-hanging'};
    if (dbEx === 'TRICEPS_PRESS') return { name: 'Close-Grip Bench Press', id: 'close-grip-bench'};
    if (dbEx === '_30_DEGREE_LAT_PULLDOWN') return { name: 'Lat Pulldown', id: 'lat-pulldown'};
    if (dbEx === 'BEHIND_THE_BACK_ONE_ARM_CABLE_CURL') return { name: 'Cable Curl', id: 'cable-curl'};
    if (dbEx === 'PREACHER_CURL_WITH_CABLE') return { name: 'Machine Preacher Curl', id: 'machine-preacher-curl'};
    if (dbEx === 'WEIGHTED_SIT_UP') return { name: 'Decline Sit-Up', id: 'decline-sit-up'};
    if (dbEx === 'WEIGHTED_SEATED_CALF_RAISE') return { name: 'Seated Calf Raise Machine', id: 'seated-calf-raise'};
    if (dbEx === 'WIDE_GRIP_PULL_UP') return { name: 'Pull-Up', id: 'pullup'};
    if (dbEx === 'NEUTRAL_GRIP_PULL_UP') return { name: 'Pull-Up', id: 'pullup'};
    if (dbEx === 'BEHIND_THE_BACK_BARBELL_REVERSE_WRIST_CURL') return { name: 'Reverse Wrist Curl', id: 'reverse-wrist-curl'};
    if (dbEx === 'REVERSE_GRIP_BARBELL_BICEPS_CURL') return { name: 'Reverse Barbell Curl', id: 'reverse-curl'};
    if (dbEx === 'ONE_ARM_CABLE_LATERAL_RAISE') return { name: 'Cable Lateral Raise', id: 'cable-lateral-raise'};
    if (dbEx === 'SEATED_UNDERHAND_GRIP_CABLE_ROW') return { name: 'Seated Cable Row', id: 'cable-row'};
    if (dbEx === 'INCLINE_EZ_BAR_LYING_TRICEPS_EXTENSION') return { name: 'EZ-Bar Skull Crusher', id: 'ez-bar-skull-crusher'};
    if (dbEx === 'BODY_WEIGHT_DIP') return { name: 'Chest Dip', id: 'chest-dip'};
    if (dbEx === 'WIDE_GRIP_SEATED_CABLE_ROW') return { name: 'Wide-Grip Cable Row', id: 'cable-row-wide'};
    if (dbEx === 'SEATED_BARBELL_OVERHEAD_TRICEPS_EXTENSION') return { name: 'Overhead Tricep Extension (Barbell)', id: 'overhead-tricep-ext-barbell'};
    if (dbEx === 'LEANING_DUMBBELL_LATERAL_RAISE') return { name: 'Leaning Lateral Raise', id: 'leaning-lateral-raise'};
    if (dbEx === 'UNDERHAND_GRIP_CABLE_ROW') return { name: 'Seated Cable Row', id: 'cable-row'};
    if (dbEx === 'SINGLE_ARM_CABLE_CHEST_PRESS') return { name: 'Cable Chest Press', id: 'cable-chest-press'};
    if (dbEx === 'WEIGHTED_QUADRUPED_HIP_EXTENSION') return { name: 'Cable Glute Kickback', id: 'cable-kickback'};
    if (dbEx === 'KNEELING_UNDERHAND_GRIP_LAT_PULLDOWN') return { name: 'Reverse-Grip Lat Pulldown', id: 'lat-pulldown-underhand'};
    if (dbEx === 'KNEELING_REAR_FLYE') return { name: 'Cable Rear Delt Fly', id: 'cable-rear-delt-fly'};
    if (dbEx === 'CHEST_FLY') return { name: 'Chest Fly Machine', id: 'chest-fly-machine'};
    if (dbEx === 'UPRIGHT_ROW') return { name: 'Barbell Upright Row', id: 'upright-row-barbell'};
    if (dbEx === 'WIDE_GRIP_EZ_BAR_BICEPS_CURL') return { name: 'EZ-Bar Curl', id: 'ez-bar-curl'};
    if (dbEx === 'INCLINE_REVERSE_FLYE') return { name: 'Rear Delt Fly', id: 'rear-delt-fly'};
    if (dbEx === 'PUSH_UP') return { name: 'Push-Up', id: 'pushup'};
    if (dbEx === 'BANDED_EXERCISES') return { name: 'UNKNOWN', id: 'unknown'};
    if (dbEx === 'CHEST_PRESS') return { name: 'Machine Chest Press', id: 'machine-chest-press'};
    if (dbEx === 'SINGLE_ARM_STANDING_CABLE_REVERSE_FLYE') return { name: 'Cable Rear Delt Fly', id: 'cable-rear-delt-fly'};
    if (dbEx === 'WEIGHTED_INVERTED_SHOULDER_PRESS') return { name: 'Handstand Push-Up', id: 'handstand-pushup'}; 
    if (dbEx === 'BARBELL_HIP_THRUST_WITH_BENCH') return { name: 'Barbell Hip Thrust', id: 'barbell-hip-thrust'};
    if (dbEx === 'WEIGHTED_SQUAT') return { name: 'Barbell Back Squat', id: 'barbell-squat'};
    if (dbEx === 'KNEELING_CABLE_CRUNCH') return { name: 'Cable Crunch', id: 'cable-crunch'};
    
    // Look for exact normalized matches
    for (let e of EXERCISES) {
        if (normalize(e.name) === normalizedDb) return { name: e.name, id: e.id };
    }
    
    // Look for containment
    for (let e of EXERCISES) {
        let normApp = normalize(e.name);
        if (normalizedDb.includes(normApp) || normApp.includes(normalizedDb)) return { name: e.name, id: e.id };
    }
    
    // Look for partial word matches
    let dbWords = dbEx.split('_').map(w => w.toLowerCase());
    let bestMatch = null;
    let bestId = null;
    let maxScore = 0;
    
    for (let e of EXERCISES) {
        let appWords = e.name.split(/[^a-zA-Z0-9]/).map(w => w.toLowerCase());
        let score = 0;
        for (let dw of dbWords) {
            if (appWords.includes(dw)) score++;
        }
        if (score > maxScore) {
            maxScore = score;
            bestMatch = e.name;
            bestId = e.id;
        }
    }
    
    return { name: bestMatch || dbEx, id: bestId || "unknown" };
}

async function run() {
    console.log("Reading CSV files from ./old_data...");
    
    // 1. Process Activities
    const activitiesRaw = fs.readFileSync('./old_data/activities.csv', 'utf8');
    const activities = parse(activitiesRaw, { columns: true, skip_empty_lines: true });
    
    // Filter activities to only Strength ones and map to new 'workouts' columns
    const mappedWorkouts = activities
      .filter(a => a.type.toLowerCase().includes('strength_training') || a.type.toLowerCase() === 'strength')
      .map(a => {
        let startTime = new Date(a.start_time).getTime();
        let durationStr = a.duration || a.moving_time || '0';
        let durationMs = parseInt(durationStr) * 1000;
        let endTime = startTime + durationMs;
        
        return {
            id: a.id,
            user_id: "REPLACE_WITH_YOUR_USER_ID", // Prompt user to flip this out 
            start_time: startTime,
            end_time: endTime,
            notes: a.name,
            location_lat: a.start_latitude || null,
            location_lng: a.start_longitude || null,
            location_label: '',
            synced: 1,
            created_at: new Date(a.created_at || a.start_time).getTime()
        };
    });

    const outWorkouts = stringify(mappedWorkouts, { header: true });
    fs.writeFileSync('./old_data/mapped_workouts.csv', outWorkouts);
    console.log(`Saved ${mappedWorkouts.length} strength workouts to mapped_workouts.csv`);

    // 2. Process Exercise Sets
    const setsRaw = fs.readFileSync('./old_data/sets.csv', 'utf8');
    const sets = parse(setsRaw, { columns: true, skip_empty_lines: true });

    // Grab known activity IDs that are strength to filter orphan sets
    const strengthIds = new Set(mappedWorkouts.map(w => w.id));

    const mappedSets = sets
      .filter(s => strengthIds.has(s.activity_id))
      .map(s => {
        const match = findBestMatch(s.exercise_name);
        return {
            id: s.id,
            server_id: '',
            user_id: "REPLACE_WITH_YOUR_USER_ID", // Prompt user to flip this out 
            local_workout_id: s.activity_id,
            exercise_id: match.id,
            exercise_name: match.name,
            reps: s.reps || 0,
            weight: s.weight || 0,
            notes: '',
            sort_order: s.set_number || 1,
            created_at: s.start_time ? new Date(s.start_time).getTime() : new Date().getTime(),
            updated_at: s.created_at ? new Date(s.created_at).getTime() : new Date().getTime(),
            deleted: 0
        };
    });

    const outSets = stringify(mappedSets, { header: true });
    fs.writeFileSync('./old_data/mapped_sets.csv', outSets);
    console.log(`Saved ${mappedSets.length} structural sets to mapped_sets.csv\n\n`);
    
    console.log("MIGRATION INSTRUCTIONS FOR CLOUDFLARE D1:");
    console.log("1. Open the mapped_workouts.csv and mapped_sets.csv files.");
    console.log("2. Find and Replace 'REPLACE_WITH_YOUR_USER_ID' with your actual User UUID from your `users` table.");
    console.log("3. In the D1 Table Console, completely import these two CSVs into 'workouts' and 'sets' respectively. Done!");
}

run();
