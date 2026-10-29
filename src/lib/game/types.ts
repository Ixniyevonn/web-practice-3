export type GamePhase = "loading" | "idle" | "running" | "paused" | "won" | "lost";

export type LoseReason = "fall" | "mist" | "guardian" | "spikes" | null;

export type RuneId = "path" | "fire" | "lightness";

export type CollectibleKind = "rune" | "shard";

export type VirtualAction = "left" | "right" | "jump" | "dash" | "fire";

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface PlayerBody extends Rect {
	vx: number;
	vy: number;
	onGround: boolean;
	facing: 1 | -1;
	animTime: number;
	moving: boolean;
}

export interface Platform extends Rect {
	id: string;
	kind: "ground" | "ledge" | "finish" | "moving";
	axis?: "x" | "y";
}

export interface MovingPlatform extends Platform {
	axis: "x" | "y";
	baseX: number;
	baseY: number;
	range: number;
	speed: number;
	phase: number;
}

export interface JumpPad extends Rect {
	id: string;
	power: number;
	lastUsed: number;
}

export interface Updraft extends Rect {
	id: string;
	strength: number;
}

export interface SpikeZone extends Rect {
	id: string;
}

export interface Collectible extends Rect {
	id: string;
	kind: CollectibleKind;
	runeId?: RuneId;
	label?: string;
	collected: boolean;
	phase: number;
}

export interface MistHazard extends Rect {
	id: string;
	kind: "mist";
}

export interface Checkpoint extends Rect {
	id: string;
	label: string;
	activated: boolean;
	active: boolean;
	phase: number;
}

export interface Guardian extends Rect {
	id: string;
	baseX: number;
	baseY: number;
	range: number;
	speed: number;
	phase: number;
	t: number;
}

export interface LevelData {
	width: number;
	height: number;
	spawn: { x: number; y: number };
	platforms: Platform[];
	movingPlatforms: MovingPlatform[];
	runes: Collectible[];
	shards: Collectible[];
	mist: MistHazard;
	checkpoints: Checkpoint[];
	guardians: Guardian[];
	spikeZones: SpikeZone[];
	jumpPads: JumpPad[];
	updrafts: Updraft[];
	portal: Rect;
}

export interface ScoreBreakdown {
	runes: number;
	shards: number;
	finish: number;
	time: number;
	total: number;
}

export interface RunResult {
	won: boolean;
	reason: LoseReason;
	score: number;
	elapsedMs: number;
	runes: number;
	shards: number;
	breakdown: ScoreBreakdown;
	bestScore: number;
	bestTimeMs: number;
	newBestScore: boolean;
	newBestTime: boolean;
}

export interface HudSnapshot {
	phase: GamePhase;
	score: number;
	bestScore: number;
	bestTimeMs: number;
	runes: number;
	runesTotal: number;
	shards: number;
	shardsTotal: number;
	elapsedMs: number;
	muted: boolean;
	loseReason: LoseReason;
	autoPaused: boolean;
	portalActive: boolean;
	collectedRunes: RuneId[];
	hasDash: boolean;
	hasFire: boolean;
	hasLightness: boolean;
	dashCooldownMs: number;
	fireCooldownMs: number;
	checkpoints: number;
	checkpointsTotal: number;
	checkpointLabel: string | null;
	canRespawn: boolean;
}

export interface GameCallbacks {
	onHud: (snapshot: HudSnapshot) => void;
	onResult: (result: RunResult) => void;
	onToast: (message: string) => void;
}

export const SCORE = {
	rune: 100,
	shard: 50,
	finish: 200,
	timeMax: 300,
	timePenaltyPerSecond: 3
} as const;

export const VIEW = {
	width: 960,
	height: 540,
	groundY: 470
} as const;

export function timeBonus(elapsedMs: number): number {
	const seconds = Math.max(0, elapsedMs / 1000);
	return Math.max(0, SCORE.timeMax - Math.floor(seconds * SCORE.timePenaltyPerSecond));
}
