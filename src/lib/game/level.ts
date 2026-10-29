import type { LevelData, RuneId } from "./types";

export interface RuneMeta {
	id: RuneId;
	label: string;
	description: string;
	image: string;
	color: string;
}

export const RUNE_META: Record<RuneId, RuneMeta> = {
	path: {
		id: "path",
		label: "Путь",
		description: "Рывок с телепортацией",
		image: "assets/runes/rune-path.webp",
		color: "#79c99a"
	},
	fire: {
		id: "fire",
		label: "Огонь",
		description: "Пламя из посоха",
		image: "assets/runes/rune-fire.webp",
		color: "#ff8a3d"
	},
	lightness: {
		id: "lightness",
		label: "Лёгкость",
		description: "Медленное падение",
		image: "assets/runes/rune-lightness.webp",
		color: "#a9d6ff"
	}
};

export const RUNE_ORDER: RuneId[] = ["path", "fire", "lightness"];

/**
 * Creates a fresh level. Collectibles and moving parts are mutable, so a
 * restart must never reuse the objects from a previous attempt.
 */
export function createLevel(): LevelData {
	return {
		width: 7400,
		height: 540,
		spawn: { x: 84, y: 422 },
		platforms: [
			{ id: "ground", kind: "ground", x: -40, y: 470, w: 760, h: 90 },
			{ id: "ledge-1", kind: "ledge", x: 780, y: 390, w: 190, h: 26 },
			{ id: "ledge-2", kind: "ledge", x: 1050, y: 310, w: 200, h: 26 },
			{ id: "ledge-4", kind: "ledge", x: 1630, y: 310, w: 220, h: 26 },
			{ id: "high-1", kind: "ledge", x: 1900, y: 130, w: 180, h: 26 },
			{ id: "ledge-5", kind: "ledge", x: 2160, y: 270, w: 220, h: 26 },
			{ id: "stone-1", kind: "ledge", x: 2480, y: 400, w: 110, h: 22 },
			{ id: "stone-2", kind: "ledge", x: 2680, y: 400, w: 180, h: 22 },
			{ id: "ledge-6", kind: "ledge", x: 2860, y: 350, w: 260, h: 26 },
			{ id: "corridor-roof-1", kind: "ledge", x: 2960, y: 250, w: 140, h: 26 },
			{ id: "high-2", kind: "ledge", x: 3290, y: 160, w: 220, h: 26 },
			{ id: "landing-1", kind: "ledge", x: 4030, y: 330, w: 200, h: 26 },
			{ id: "ledge-8", kind: "ledge", x: 4230, y: 280, w: 220, h: 26 },
			{ id: "ledge-9", kind: "ledge", x: 4460, y: 300, w: 300, h: 26 },
			{ id: "final-1", kind: "ledge", x: 5020, y: 300, w: 220, h: 26 },
			{ id: "final-2", kind: "ledge", x: 5340, y: 330, w: 380, h: 26 },
			{ id: "corridor-roof-2", kind: "ledge", x: 5420, y: 230, w: 180, h: 26 },
			{ id: "final-3", kind: "ledge", x: 5780, y: 180, w: 220, h: 26 },
			{ id: "landing-2", kind: "ledge", x: 6130, y: 330, w: 200, h: 26 },
			{ id: "final-4", kind: "ledge", x: 6450, y: 300, w: 220, h: 26 },
			{ id: "finish", kind: "finish", x: 6790, y: 260, w: 460, h: 26 }
		],
		movingPlatforms: [
			{
				id: "lift-a",
				kind: "moving",
				x: 2440,
				y: 350,
				w: 170,
				h: 24,
				axis: "x",
				baseX: 2440,
				baseY: 350,
				range: 250,
				speed: 0.55,
				phase: 0
			}
		],
		runes: [
			{
				id: "rune-path",
				kind: "rune",
				runeId: "path",
				label: "Путь",
				x: 1128,
				y: 232,
				w: 44,
				h: 44,
				collected: false,
				phase: 0.35
			},
			{
				id: "rune-fire",
				kind: "rune",
				runeId: "fire",
				label: "Огонь",
				x: 1958,
				y: 68,
				w: 44,
				h: 44,
				collected: false,
				phase: 2.1
			},
			{
				id: "rune-lightness",
				kind: "rune",
				runeId: "lightness",
				label: "Лёгкость",
				x: 3378,
				y: 82,
				w: 44,
				h: 44,
				collected: false,
				phase: 4.15
			}
		],
		shards: [
			{
				id: "echo-1",
				kind: "shard",
				label: "Эхо",
				x: 487,
				y: 347,
				w: 26,
				h: 26,
				collected: false,
				phase: 0.8
			},
			{
				id: "echo-2",
				kind: "shard",
				label: "Эхо",
				x: 847,
				y: 287,
				w: 26,
				h: 26,
				collected: false,
				phase: 2.7
			},
			{
				id: "echo-3",
				kind: "shard",
				label: "Эхо",
				x: 1417,
				y: 287,
				w: 26,
				h: 26,
				collected: false,
				phase: 4.9
			},
			{
				id: "echo-4",
				kind: "shard",
				label: "Эхо",
				x: 2267,
				y: 217,
				w: 26,
				h: 26,
				collected: false,
				phase: 1.4
			},
			{
				id: "echo-5",
				kind: "shard",
				label: "Эхо",
				x: 3207,
				y: 287,
				w: 26,
				h: 26,
				collected: false,
				phase: 3.2
			},
			{
				id: "echo-6",
				kind: "shard",
				label: "Эхо",
				x: 3697,
				y: 247,
				w: 26,
				h: 26,
				collected: false,
				phase: 5.1
			},
			{
				id: "echo-7",
				kind: "shard",
				label: "Эхо",
				x: 4257,
				y: 227,
				w: 26,
				h: 26,
				collected: false,
				phase: 0.6
			},
			{
				id: "echo-9",
				kind: "shard",
				label: "Эхо",
				x: 2557,
				y: 287,
				w: 26,
				h: 26,
				collected: false,
				phase: 1.1
			},
			{
				id: "echo-10",
				kind: "shard",
				label: "Эхо",
				x: 3987,
				y: 287,
				w: 26,
				h: 26,
				collected: false,
				phase: 3.6
			},
			{
				id: "echo-11",
				kind: "shard",
				label: "Эхо",
				x: 4877,
				y: 247,
				w: 26,
				h: 26,
				collected: false,
				phase: 0.9
			},
			{
				id: "echo-12",
				kind: "shard",
				label: "Эхо",
				x: 5900,
				y: 110,
				w: 26,
				h: 26,
				collected: false,
				phase: 2.8
			}
		],
		mist: { id: "mist", kind: "mist", x: 720, y: 476, w: 6220, h: 64 },
		checkpoints: [
			{
				id: "checkpoint-1",
				label: "У первых шипов",
				x: 880,
				y: 314,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 0.4
			},
			{
				id: "checkpoint-2",
				label: "У алтаря огня",
				x: 2250,
				y: 194,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 1.9
			},
			{
				id: "checkpoint-3",
				label: "Перед галереей",
				x: 2700,
				y: 324,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 3.1
			},
			{
				id: "checkpoint-4",
				label: "За разломом",
				x: 4110,
				y: 254,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 5.2
			},
			{
				id: "checkpoint-5",
				label: "У последней галереи",
				x: 5160,
				y: 224,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 2.3
			},
			{
				id: "checkpoint-6",
				label: "У колокола",
				x: 6530,
				y: 224,
				w: 40,
				h: 76,
				activated: false,
				active: false,
				phase: 4.4
			}
		],
		guardians: [
			{
				id: "guardian-1",
				x: 1060,
				y: 350,
				w: 52,
				h: 40,
				baseX: 1060,
				baseY: 350,
				range: 260,
				speed: 1.15,
				phase: 0,
				t: 0
			},
			{
				id: "guardian-2",
				x: 3860,
				y: 430,
				w: 52,
				h: 40,
				baseX: 3860,
				baseY: 430,
				range: 300,
				speed: 0.9,
				phase: 1.6,
				t: 1.6
			},
			{
				id: "guardian-3",
				x: 2990,
				y: 310,
				w: 52,
				h: 40,
				baseX: 2990,
				baseY: 310,
				range: 0,
				speed: 0,
				phase: 0,
				t: 0
			},
			{
				id: "guardian-4",
				x: 3050,
				y: 310,
				w: 52,
				h: 40,
				baseX: 3050,
				baseY: 310,
				range: 0,
				speed: 0,
				phase: 1.1,
				t: 1.1
			},
			{
				id: "guardian-5",
				x: 5480,
				y: 290,
				w: 52,
				h: 40,
				baseX: 5480,
				baseY: 290,
				range: 0,
				speed: 0,
				phase: 0.4,
				t: 0.4
			},
			{
				id: "guardian-6",
				x: 5550,
				y: 290,
				w: 52,
				h: 40,
				baseX: 5550,
				baseY: 290,
				range: 0,
				speed: 0,
				phase: 1.8,
				t: 1.8
			}
		],
		spikeZones: [
			{ id: "spikes-ground", x: 360, y: 458, w: 70, h: 12 },
			{ id: "spikes-ledge-9", x: 4560, y: 288, w: 70, h: 12 }
		],
		jumpPads: [
			{ id: "pad-1", x: 1700, y: 302, w: 72, h: 8, power: 1000, lastUsed: -10 },
			{ id: "pad-3", x: 5640, y: 322, w: 70, h: 8, power: 950, lastUsed: -10 }
		],
		updrafts: [
			{ id: "updraft-1", x: 3130, y: 70, w: 110, h: 400, strength: 2800 }
		],
		portal: { x: 7060, y: 130, w: 120, h: 130 }
	};
}




