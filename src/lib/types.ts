export interface Exercise {
	id: string;
	name: string;
	category: 'free-weight' | 'machine';
	muscleActivations: MuscleActivation[];
	equipment?: string;
}

export interface MuscleActivation {
	muscle: MuscleId;
	activation: 'primary' | 'secondary' | 'tertiary';
}

export type MuscleId =
	| 'chest_upper'
	| 'chest_lower'
	| 'chest_mid'
	| 'front_delt'
	| 'side_delt'
	| 'rear_delt'
	| 'bicep'
	| 'tricep'
	| 'forearm'
	| 'lat'
	| 'rhomboid'
	| 'trap_upper'
	| 'trap_mid'
	| 'trap_lower'
	| 'erector'
	| 'lower_back'
	| 'quad'
	| 'hamstring'
	| 'glute'
	| 'calf'
	| 'hip_flexor'
	| 'adductor'
	| 'abductor'
	| 'abs'
	| 'oblique'
	| 'serratus';

export interface WorkoutSet {
	id: string;
	localWorkoutId: string;
	exerciseId: string;
	exerciseName: string;
	reps: number | null;
	weight: number | null;
	notes?: string;
	order: number;
	createdAt: number;
	syncedAt?: number;
	serverId?: string;
}

export interface Workout {
	id: string;
	userId?: string;
	startTime: number;
	endTime: number;
	location?: { lat: number; lng: number; label?: string };
	notes?: string;
	sets: WorkoutSet[];
	synced: boolean;
	serverId?: string;
}

export interface User {
	id: string;
	email: string;
	token: string;
}

export interface UndoState {
	sets: WorkoutSet[];
	description: string;
}
