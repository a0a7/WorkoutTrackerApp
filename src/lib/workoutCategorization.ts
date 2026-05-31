import { EXERCISES, EXERCISE_MAP } from './exercises';
import type { MuscleActivation, MuscleId, Workout, WorkoutSet } from './types';

export type WorkoutCategory =
	| 'push'
	| 'pull'
	| 'legs'
	| 'antagonist pull'
	| 'antagonist push'
	| 'upper'
	| 'abs'
	| 'back'
	| 'chest'
	| 'arms'
	| 'shoulders'
	| 'full body';

export type DayCategory = WorkoutCategory | 'rest';

export interface WorkoutCategoryBreakdown {
	activityTotal: number;
	push: number;
	pull: number;
	legs: number;
	abs: number;
	upper: number;
	chest: number;
	back: number;
	arms: number;
	shoulders: number;
}

const ACTIVATION_WEIGHTS: Record<MuscleActivation['activation'], number> = {
	primary: 3,
	secondary: 1.5,
	tertiary: 0.5,
};

const EXERCISE_NAME_MAP = new Map(
	EXERCISES.map((exercise) => [normalizeKey(exercise.name), exercise] as const)
);

function normalizeKey(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveExercise(set: WorkoutSet) {
	return EXERCISE_MAP.get(set.exerciseId) ?? EXERCISE_NAME_MAP.get(normalizeKey(set.exerciseName));
}

function createBreakdown(): WorkoutCategoryBreakdown {
	return {
		activityTotal: 0,
		push: 0,
		pull: 0,
		legs: 0,
		abs: 0,
		upper: 0,
		chest: 0,
		back: 0,
		arms: 0,
		shoulders: 0,
	};
}

function addScores(breakdown: WorkoutCategoryBreakdown, setWeight: number, muscle: MuscleId) {
	switch (muscle) {
		case 'chest_upper':
		case 'chest_mid':
		case 'chest_lower':
			breakdown.chest += setWeight * 1;
			breakdown.push += setWeight * 1;
			breakdown.upper += setWeight * 0.9;
			return;
		case 'front_delt':
			breakdown.shoulders += setWeight * 1;
			breakdown.push += setWeight * 0.9;
			breakdown.upper += setWeight * 0.9;
			return;
		case 'side_delt':
			breakdown.shoulders += setWeight * 1;
			breakdown.push += setWeight * 0.4;
			breakdown.upper += setWeight * 0.85;
			return;
		case 'rear_delt':
			breakdown.shoulders += setWeight * 0.6;
			breakdown.back += setWeight * 0.8;
			breakdown.pull += setWeight * 0.9;
			breakdown.upper += setWeight * 0.75;
			return;
		case 'tricep':
			breakdown.arms += setWeight * 1;
			breakdown.push += setWeight * 0.85;
			breakdown.upper += setWeight * 0.55;
			return;
		case 'bicep':
			breakdown.arms += setWeight * 1;
			breakdown.pull += setWeight * 0.85;
			breakdown.upper += setWeight * 0.55;
			return;
		case 'forearm':
			breakdown.arms += setWeight * 0.7;
			breakdown.pull += setWeight * 0.35;
			breakdown.upper += setWeight * 0.35;
			return;
		case 'lat':
		case 'rhomboid':
		case 'trap_upper':
		case 'trap_mid':
		case 'trap_lower':
			breakdown.back += setWeight * 1;
			breakdown.pull += setWeight * 1;
			breakdown.upper += setWeight * 0.85;
			return;
		case 'erector':
		case 'lower_back':
			breakdown.back += setWeight * 0.7;
			breakdown.pull += setWeight * 0.25;
			breakdown.abs += setWeight * 0.35;
			breakdown.upper += setWeight * 0.25;
			return;
		case 'quad':
		case 'hamstring':
		case 'glute':
		case 'calf':
		case 'adductor':
		case 'abductor':
			breakdown.legs += setWeight * 1;
			return;
		case 'hip_flexor':
			breakdown.abs += setWeight * 0.85;
			breakdown.legs += setWeight * 0.45;
			return;
		case 'abs':
			breakdown.abs += setWeight * 1;
			return;
		case 'oblique':
			breakdown.abs += setWeight * 0.95;
			breakdown.upper += setWeight * 0.1;
			return;
		case 'serratus':
			breakdown.push += setWeight * 0.45;
			breakdown.chest += setWeight * 0.25;
			breakdown.shoulders += setWeight * 0.35;
			breakdown.upper += setWeight * 0.55;
			return;
	}
}

function scoreWorkoutSets(sets: WorkoutSet[]): WorkoutCategoryBreakdown {
	const breakdown = createBreakdown();

	for (const set of sets) {
		const exercise = resolveExercise(set);
		if (!exercise) continue;
		for (const activation of exercise.muscleActivations) {
			const activationWeight = ACTIVATION_WEIGHTS[activation.activation] ?? 0;
			if (activationWeight <= 0) continue;
			const weightedActivation = activationWeight;
			breakdown.activityTotal += weightedActivation;
			addScores(breakdown, weightedActivation, activation.muscle);
		}
	}

	return breakdown;
}

function share(value: number, total: number): number {
	if (total <= 0) return 0;
	return value / total;
}

function strongestCategory(breakdown: WorkoutCategoryBreakdown): WorkoutCategory {
	const total = breakdown.activityTotal;
	if (total <= 0) return 'full body';

	const shares = {
		push: share(breakdown.push, total),
		pull: share(breakdown.pull, total),
		legs: share(breakdown.legs, total),
		abs: share(breakdown.abs, total),
		upper: share(breakdown.upper, total),
		chest: share(breakdown.chest, total),
		back: share(breakdown.back, total),
		arms: share(breakdown.arms, total),
		shoulders: share(breakdown.shoulders, total),
	};

	const upperScore = breakdown.upper;
	const legsScore = breakdown.legs;
	const absScore = breakdown.abs;
	const pushScore = breakdown.push;
	const pullScore = breakdown.pull;

	const regionsStrong = [shares.upper, shares.legs, shares.abs].filter((value) => value >= 0.2).length;
	if (regionsStrong >= 3 && shares.legs >= 0.18 && shares.upper >= 0.25 && shares.abs >= 0.12) {
		return 'full body';
	}

	if (shares.legs >= 0.34 && legsScore >= upperScore * 1.15 && legsScore >= absScore * 1.15) {
		return 'legs';
	}

	if (shares.abs >= 0.34 && absScore >= upperScore * 1.15 && absScore >= legsScore * 1.15) {
		return 'abs';
	}

	if (shares.upper >= 0.55) {
		const balancedUpper =
			pushScore >= total * 0.18 &&
			pullScore >= total * 0.18 &&
			Math.min(pushScore, pullScore) / Math.max(pushScore, pullScore || 1) >= 0.72;

		if (balancedUpper) {
			return pushScore >= pullScore ? 'antagonist push' : 'antagonist pull';
		}

		if (
			shares.chest >= 0.18 &&
			breakdown.chest >= breakdown.back * 1.15 &&
			breakdown.chest >= breakdown.shoulders * 1.1 &&
			breakdown.chest >= breakdown.arms * 1.1
		) {
			return 'chest';
		}

		if (
			shares.back >= 0.18 &&
			breakdown.back >= breakdown.chest * 1.15 &&
			breakdown.back >= breakdown.shoulders * 1.05 &&
			breakdown.back >= breakdown.arms * 1.05
		) {
			return 'back';
		}

		if (
			shares.shoulders >= 0.18 &&
			breakdown.shoulders >= breakdown.chest * 1.05 &&
			breakdown.shoulders >= breakdown.back * 1.05
		) {
			return 'shoulders';
		}

		if (shares.arms >= 0.18 && breakdown.arms >= breakdown.chest * 1.05 && breakdown.arms >= breakdown.back * 1.05) {
			return 'arms';
		}

		if (pushScore >= pullScore && pushScore >= total * 0.22) {
			return 'push';
		}

		if (pullScore > pushScore && pullScore >= total * 0.22) {
			return 'pull';
		}

		return 'upper';
	}

	if (shares.push >= 0.2 && shares.pull >= 0.2) {
		return pushScore >= pullScore ? 'antagonist push' : 'antagonist pull';
	}

	if (shares.push >= shares.pull && shares.push >= 0.2) {
		return 'push';
	}

	if (shares.pull > shares.push && shares.pull >= 0.2) {
		return 'pull';
	}

	if (shares.upper >= 0.4) {
		return 'upper';
	}

	return 'full body';
}

export function classifyWorkout(workout: Workout): WorkoutCategory {
	return strongestCategory(scoreWorkoutSets(workout.sets));
}

export function classifyWorkouts(workouts: Workout[]): WorkoutCategory | 'rest' {
	if (workouts.length === 0) return 'rest';
	const breakdown = createBreakdown();
	for (const workout of workouts) {
		const scored = scoreWorkoutSets(workout.sets);
		breakdown.activityTotal += scored.activityTotal;
		breakdown.push += scored.push;
		breakdown.pull += scored.pull;
		breakdown.legs += scored.legs;
		breakdown.abs += scored.abs;
		breakdown.upper += scored.upper;
		breakdown.chest += scored.chest;
		breakdown.back += scored.back;
		breakdown.arms += scored.arms;
		breakdown.shoulders += scored.shoulders;
	}
	return strongestCategory(breakdown);
}

export function getWorkoutCategoryLabel(category: WorkoutCategory | 'rest'): string {
	if (category === 'rest') return 'Rest';
	return category
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
