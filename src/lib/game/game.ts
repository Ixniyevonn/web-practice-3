import { SoundManager } from "./audio";
import { circleRect, overlaps } from "./collision";
import { Input } from "./input";
import { createLevel, RUNE_META, RUNE_ORDER } from "./level";
import { Player } from "./player";
import { Renderer, type RenderState } from "./renderer";
import { readBool, readNumber, STORAGE_KEYS, writeBool, writeNumber } from "./storage";
import {
	SCORE,
	timeBonus,
	VIEW,
	type Checkpoint,
	type GameCallbacks,
	type GamePhase,
	type HudSnapshot,
	type LevelData,
	type LoseReason,
	type RuneId,
	type RunResult,
	type VirtualAction
} from "./types";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export class Game {
	private readonly callbacks: GameCallbacks;
	private readonly input: Input;
	private readonly renderer: Renderer;
	private readonly audio: SoundManager;
	private readonly motionQuery: MediaQueryList | null;

	private level: LevelData;
	private player: Player;
	private phase: GamePhase = "loading";
	private score = 0;
	private runesCollected = 0;
	private shardsCollected = 0;
	private collectedRunes: RuneId[] = [];
	private elapsedMs = 0;
	private time = 0;
	private cameraX = 0;
	private loseReason: LoseReason = null;
	private bestScore = 0;
	private bestTimeMs = 0;
	private muted = false;
	private autoPaused = false;
	private reducedMotion = false;
	private portalHintCooldown = 0;
	private hasDash = false;
	private hasFire = false;
	private hasLightness = false;
	private dashCooldown = 0;
	private fireCooldown = 0;
	private fireTimer = 0;
	private fireFacing: 1 | -1 = 1;
	private shakeTime = 0;
	private activeCheckpointId: string | null = null;
	private raf: number | null = null;
	private lastTime = 0;
	private lastHudAt = 0;
	private destroyed = false;

	constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
		this.callbacks = callbacks;
		this.level = createLevel();
		this.player = new Player(this.level.spawn);
		this.input = new Input(() => this.phase === "running");
		this.renderer = new Renderer(canvas);
		this.muted = readBool(STORAGE_KEYS.muted, false);
		this.audio = new SoundManager(this.muted);
		this.bestScore = readNumber(STORAGE_KEYS.bestScore, 0);
		this.bestTimeMs = readNumber(STORAGE_KEYS.bestTime, 0);
		this.motionQuery =
			typeof window !== "undefined"
				? window.matchMedia("(prefers-reduced-motion: reduce)")
				: null;
		this.reducedMotion = this.motionQuery?.matches ?? false;
		this.motionQuery?.addEventListener("change", this.onMotionChange);
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", this.onVisibility);
		}
		this.emitHud();
	}

	async init(): Promise<void> {
		await this.renderer.load();
		if (this.destroyed) return;
		this.phase = "idle";
		this.renderer.render(this.renderState());
		this.emitHud();
	}

	start(): void {
		if (this.phase === "loading" || this.phase === "running") return;
		this.resetRun();
		this.phase = "running";
		this.autoPaused = false;
		this.audio.unlock();
		this.audio.setMuted(this.muted);
		this.lastTime = performance.now();
		this.lastHudAt = 0;
		this.beginLoop();
		this.emitHud();
	}

	restart(): void {
		if (this.phase === "loading") return;
		this.stopLoop();
		this.resetRun();
		this.phase = "running";
		this.autoPaused = false;
		this.audio.unlock();
		this.audio.setMuted(this.muted);
		this.lastTime = performance.now();
		this.lastHudAt = 0;
		this.beginLoop();
		this.emitHud();
	}

	respawnAtCheckpoint(): void {
		if (this.phase !== "lost") return;
		const spawn = this.respawnPoint();
		this.player.reset(spawn);
		this.player.featherFall = this.hasLightness;
		this.loseReason = null;
		this.dashCooldown = 0;
		this.fireCooldown = 0;
		this.fireTimer = 0;
		this.shakeTime = 0;
		this.portalHintCooldown = 0;
		this.cameraX = clamp(
			spawn.x + this.player.w / 2 - VIEW.width / 2,
			0,
			Math.max(0, this.level.width - VIEW.width)
		);
		this.input.clear();
		this.renderer.resetEffects();
		this.audio.unlock();
		this.audio.setMuted(this.muted);
		this.phase = "running";
		this.autoPaused = false;
		this.lastTime = performance.now();
		this.lastHudAt = 0;
		this.renderer.burst(
			this.player.centerX,
			this.player.centerY,
			"rgba(228, 180, 114, 0.9)",
			22
		);
		this.beginLoop();
		this.emitHud();
		const label = this.activeCheckpoint?.label;
		this.callbacks.onToast(label ? `Возврат к очагу «${label}»` : "Возврат к началу пути");
	}

	private get activeCheckpoint(): Checkpoint | null {
		if (!this.activeCheckpointId) return null;
		return this.level.checkpoints.find((c) => c.id === this.activeCheckpointId) ?? null;
	}

	private respawnPoint(): { x: number; y: number } {
		const checkpoint = this.activeCheckpoint;
		if (!checkpoint) return this.level.spawn;
		return {
			x: checkpoint.x + checkpoint.w + 8,
			y: checkpoint.y + checkpoint.h - this.player.h
		};
	}

	pause(auto = false): void {
		if (this.phase !== "running") return;
		this.phase = "paused";
		this.autoPaused = auto;
		this.stopLoop();
		this.input.clear();
		this.renderer.render(this.renderState());
		this.emitHud();
	}

	resume(): void {
		if (this.phase !== "paused") return;
		this.phase = "running";
		this.autoPaused = false;
		this.audio.unlock();
		this.lastTime = performance.now();
		this.beginLoop();
		this.emitHud();
	}

	togglePause(): void {
		if (this.phase === "running") this.pause(false);
		else if (this.phase === "paused") this.resume();
	}

	toggleMute(): void {
		this.muted = !this.muted;
		this.audio.unlock();
		this.audio.setMuted(this.muted);
		writeBool(STORAGE_KEYS.muted, this.muted);
		this.emitHud();
	}

	setVirtual(action: VirtualAction, pressed: boolean): void {
		this.input.setVirtual(action, pressed);
	}

	resize(): void {
		this.renderer.resize();
		this.renderer.render(this.renderState());
	}

	destroy(): void {
		this.destroyed = true;
		this.stopLoop();
		this.input.destroy();
		this.audio.destroy();
		this.motionQuery?.removeEventListener("change", this.onMotionChange);
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", this.onVisibility);
		}
		this.renderer.resetEffects();
	}

	private readonly onMotionChange = (): void => {
		this.reducedMotion = this.motionQuery?.matches ?? false;
	};

	private readonly onVisibility = (): void => {
		if (typeof document === "undefined") return;
		if (document.hidden && this.phase === "running") {
			this.pause(true);
		}
	};

	private readonly frame = (now: number): void => {
		if (this.phase !== "running") {
			this.raf = null;
			return;
		}
		const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
		this.lastTime = now;
		this.update(dt);
		if (this.phase === "running") {
			this.renderer.render(this.renderState());
			this.raf = requestAnimationFrame(this.frame);
		} else {
			this.raf = null;
		}
	};

	private beginLoop(): void {
		this.stopLoop();
		this.raf = requestAnimationFrame(this.frame);
	}

	private stopLoop(): void {
		if (this.raf !== null) {
			cancelAnimationFrame(this.raf);
			this.raf = null;
		}
	}

	private resetRun(): void {
		this.input.clear();
		this.level = createLevel();
		this.player.reset(this.level.spawn);
		this.score = 0;
		this.runesCollected = 0;
		this.shardsCollected = 0;
		this.collectedRunes = [];
		this.elapsedMs = 0;
		this.time = 0;
		this.cameraX = 0;
		this.loseReason = null;
		this.portalHintCooldown = 0;
		this.autoPaused = false;
		this.hasDash = false;
		this.hasFire = false;
		this.hasLightness = false;
		this.dashCooldown = 0;
		this.fireCooldown = 0;
		this.fireTimer = 0;
		this.shakeTime = 0;
		this.activeCheckpointId = null;
		this.player.featherFall = false;
		this.renderer.resetEffects();
	}

	private update(dt: number): void {
		this.time += dt;
		this.elapsedMs += dt * 1000;

		this.updateMovingPlatforms();
		this.updateGuardians(dt);

		this.dashCooldown = Math.max(0, this.dashCooldown - dt);
		this.fireCooldown = Math.max(0, this.fireCooldown - dt);
		this.fireTimer = Math.max(0, this.fireTimer - dt);
		this.shakeTime = Math.max(0, this.shakeTime - dt);

		if (this.input.consumeDash() && this.hasDash && this.dashCooldown <= 0) {
			this.castDash();
		}
		if (this.input.consumeFire() && this.hasFire && this.fireCooldown <= 0) {
			this.castFire();
		}

		this.player.update(dt, this.input, this.level, {
			onJump: () => {
				this.audio.jump();
				this.renderer.burst(
					this.player.centerX,
					this.player.y + this.player.h,
					"rgba(228, 180, 114, 0.55)",
					5,
					"dust"
				);
			},
			onLand: () => {
				this.audio.land();
				this.renderer.burst(
					this.player.centerX,
					this.player.y + this.player.h,
					"rgba(228, 180, 114, 0.35)",
					4,
					"dust"
				);
			}
		});

		this.applyJumpPads();
		this.applyUpdrafts(dt);
		this.renderer.updateEffects(dt);
		this.collect();
		this.updateCheckpoints();
		if (this.checkHazards()) return;
		this.checkPortal(dt);
		if (this.phase !== "running") return;
		this.updateCamera(dt);
		this.emitHudThrottled();
	}

	private updateMovingPlatforms(): void {
		for (const platform of this.level.movingPlatforms) {
			const previousX = platform.x;
			const previousY = platform.y;
			const wave = (Math.sin(this.time * platform.speed + platform.phase) + 1) / 2;
			platform.x = platform.baseX + (platform.axis === "x" ? wave * platform.range : 0);
			platform.y = platform.baseY + (platform.axis === "y" ? wave * platform.range : 0);

			const player = this.player;
			const standingOnIt =
				player.onGround &&
				Math.abs(player.y + player.h - previousY) < 2 &&
				player.x + player.w > previousX &&
				player.x < previousX + platform.w;
			if (standingOnIt) {
				player.x += platform.x - previousX;
				player.y += platform.y - previousY;
			}
		}
	}

	private updateGuardians(dt: number): void {
		for (const guardian of this.level.guardians) {
			guardian.t += dt;
			const wave = (Math.sin(guardian.t * guardian.speed + guardian.phase) + 1) / 2;
			guardian.x = guardian.baseX + wave * guardian.range;
			guardian.y = guardian.baseY + Math.sin(guardian.t * 1.7 + guardian.phase) * 14;
		}
	}

	private castDash(): void {
		const distance = 300;
		const direction = this.player.facing;
		const startX = this.player.x;
		let targetX = clamp(
			this.player.x + direction * distance,
			0,
			this.level.width - this.player.w
		);

		while (
			Math.abs(targetX - startX) > 8 &&
			this.positionBlocked(targetX, this.player.y)
		) {
			targetX -= direction * 12;
		}

		this.player.x = targetX;
		this.player.vx = 0;
		this.player.onGround = false;
		this.dashCooldown = 2.4;
		this.renderer.burst(
			startX + this.player.w / 2,
			this.player.centerY,
			"rgba(109, 148, 255, 0.9)",
			16
		);
		this.renderer.burst(
			targetX + this.player.w / 2,
			this.player.centerY,
			"rgba(184, 212, 255, 0.9)",
			18
		);
		this.audio.dash();
	}

	private positionBlocked(x: number, y: number): boolean {
		const rect = { x, y, w: this.player.w, h: this.player.h };
		const platforms = [...this.level.platforms, ...this.level.movingPlatforms];
		return platforms.some((platform) => overlaps(rect, platform));
	}

	private castFire(): void {
		this.fireCooldown = 1.15;
		this.fireTimer = 0.3;
		this.fireFacing = this.player.facing;
		this.shakeTime = 0.35;
		this.audio.fire();

		const originX = this.player.centerX;
		const originY = this.player.y + 16;
		for (const guardian of [...this.level.guardians]) {
			const dx = guardian.x + guardian.w / 2 - originX;
			const dy = guardian.y + guardian.h / 2 - originY;
			if (dx * this.player.facing < -30) continue;
			if (Math.abs(dx) > 330 || Math.abs(dy) > 78) continue;
			this.level.guardians = this.level.guardians.filter(
				(candidate) => candidate !== guardian
			);
			this.renderer.burst(
				guardian.x + guardian.w / 2,
				guardian.y + guardian.h / 2,
				"rgba(255, 138, 61, 0.95)",
				26
			);
		}

		this.renderer.flame(
			this.player.centerX + this.player.facing * 14,
			this.player.y + 8,
			this.player.facing
		);
	}

	private applyJumpPads(): void {
		for (const pad of this.level.jumpPads) {
			if (this.time - pad.lastUsed < 0.65) continue;
			if (!overlaps(this.player, pad)) continue;
			pad.lastUsed = this.time;
			this.player.launch(-pad.power, 0.5);
			this.audio.jumpPad();
			this.renderer.burst(
				pad.x + pad.w / 2,
				pad.y,
				"rgba(109, 148, 255, 0.9)",
				18
			);
		}
	}

	private applyUpdrafts(dt: number): void {
		for (const updraft of this.level.updrafts) {
			if (!overlaps(this.player, updraft)) continue;
			this.player.onGround = false;
			this.player.vy = Math.max(-540, this.player.vy - updraft.strength * dt);
			this.player.suppressJumpCut(0.12);
			if (!this.reducedMotion && Math.random() < 0.35) {
				this.renderer.burst(
					this.player.centerX + (Math.random() - 0.5) * 28,
					this.player.centerY + 18,
					"rgba(109, 148, 255, 0.65)",
					1
				);
			}
		}
	}

	private collect(): void {
		for (const collectible of [...this.level.runes, ...this.level.shards]) {
			if (collectible.collected) continue;
			const cx = collectible.x + collectible.w / 2;
			const cy = collectible.y + collectible.h / 2;
			const radius = Math.min(collectible.w, collectible.h) / 2;
			if (!circleRect(cx, cy, radius, this.player)) continue;

			collectible.collected = true;
			if (collectible.kind === "rune" && collectible.runeId) {
				const meta = RUNE_META[collectible.runeId];
				this.runesCollected += 1;
				this.collectedRunes.push(collectible.runeId);
				this.score += SCORE.rune;
				const runeIndex = RUNE_ORDER.indexOf(collectible.runeId);
				this.audio.collectRune(runeIndex);
				this.renderer.burst(cx, cy, meta.color, 24);

				if (collectible.runeId === "path") {
					this.hasDash = true;
				} else if (collectible.runeId === "fire") {
					this.hasFire = true;
				} else if (collectible.runeId === "lightness") {
					this.hasLightness = true;
					this.player.featherFall = true;
				}

				if (this.runesCollected === this.level.runes.length) {
					this.callbacks.onToast(
						collectible.runeId === "lightness"
							? "Все три руны собраны — Лёгкость активна, колокол открыт"
							: "Все три руны собраны — колокол открыт"
					);
				} else if (collectible.runeId === "path") {
					this.callbacks.onToast("Руна «Путь» найдена — Shift: рывок");
				} else if (collectible.runeId === "fire") {
					this.callbacks.onToast("Руна «Огонь» найдена — F: пламя");
				} else {
					this.callbacks.onToast("Руна «Лёгкость» найдена — медленное падение");
				}
			} else {
				this.shardsCollected += 1;
				this.score += SCORE.shard;
				this.audio.collectShard();
				this.renderer.burst(cx, cy, "#ffd39a", 14);
				this.callbacks.onToast("Эхо +50");
			}
		}
	}

	private updateCheckpoints(): void {
		for (const checkpoint of this.level.checkpoints) {
			if (checkpoint.id === this.activeCheckpointId) continue;
			if (!overlaps(this.player, checkpoint)) continue;
			this.activateCheckpoint(checkpoint);
		}
	}

	private activateCheckpoint(checkpoint: Checkpoint): void {
		checkpoint.activated = true;
		for (const candidate of this.level.checkpoints) {
			candidate.active = candidate === checkpoint;
		}
		this.activeCheckpointId = checkpoint.id;
		this.audio.checkpoint();
		this.renderer.burst(
			checkpoint.x + checkpoint.w / 2,
			checkpoint.y + 8,
			"rgba(255, 214, 150, 0.9)",
			20
		);
		this.callbacks.onToast(`Очаг «${checkpoint.label}» зажжён — возврат сюда`);
		this.emitHud();
	}

	private checkHazards(): boolean {
		if (overlaps(this.player, this.level.mist)) {
			this.lose("mist");
			return true;
		}
		for (const spikes of this.level.spikeZones) {
			if (!overlaps(this.player, spikes)) continue;
			this.lose("spikes");
			return true;
		}
		for (const guardian of this.level.guardians) {
			if (!overlaps(this.player, guardian)) continue;
			this.lose("guardian");
			return true;
		}
		if (this.player.y > VIEW.height + 120) {
			this.lose("fall");
			return true;
		}
		return false;
	}

	private checkPortal(dt: number): void {
		this.portalHintCooldown = Math.max(0, this.portalHintCooldown - dt);
		if (!overlaps(this.player, this.level.portal)) return;
		if (this.runesCollected >= this.level.runes.length) {
			this.win();
			return;
		}
		if (this.portalHintCooldown <= 0) {
			this.portalHintCooldown = 2.4;
			this.audio.portalLocked();
			this.callbacks.onToast("Колокол ждёт три руны");
		}
	}

	private updateCamera(dt: number): void {
		const maxCamera = Math.max(0, this.level.width - VIEW.width);
		const target = clamp(this.player.centerX - VIEW.width / 2, 0, maxCamera);
		const smoothing = this.reducedMotion ? 1 : Math.min(1, dt * 7.5);
		this.cameraX += (target - this.cameraX) * smoothing;
		if (Math.abs(target - this.cameraX) < 0.08) this.cameraX = target;
	}

	private win(): void {
		if (this.phase !== "running") return;
		this.stopLoop();
		this.phase = "won";
		this.input.clear();
		const breakdown = {
			runes: this.runesCollected * SCORE.rune,
			shards: this.shardsCollected * SCORE.shard,
			finish: SCORE.finish,
			time: timeBonus(this.elapsedMs),
			total: 0
		};
		breakdown.total = breakdown.runes + breakdown.shards + breakdown.finish + breakdown.time;
		this.score = breakdown.total;
		const newBestScore = this.commitBestScore();
		const newBestTime = this.commitBestTime();
		const portal = this.level.portal;
		const px = portal.x + portal.w / 2;
		const py = portal.y + portal.h / 2;
		this.renderer.burst(px, py, "#ffd39a", 64, "confetti");
		this.renderer.burst(px, py, "#6d94ff", 28);
		this.audio.win();
		this.renderer.render(this.renderState());
		this.callbacks.onResult({
			won: true,
			reason: null,
			score: this.score,
			elapsedMs: this.elapsedMs,
			runes: this.runesCollected,
			shards: this.shardsCollected,
			breakdown,
			bestScore: this.bestScore,
			bestTimeMs: this.bestTimeMs,
			newBestScore,
			newBestTime
		});
		this.emitHud();
	}

	private lose(reason: Exclude<LoseReason, null>): void {
		if (this.phase !== "running") return;
		this.stopLoop();
		this.phase = "lost";
		this.loseReason = reason;
		this.input.clear();
		this.score = this.runesCollected * SCORE.rune + this.shardsCollected * SCORE.shard;
		const newBestScore = this.commitBestScore();
		this.audio.lose();
		this.renderer.burst(
			this.player.centerX,
			this.player.centerY,
			"rgba(212, 106, 88, 0.9)",
			22
		);
		this.renderer.render(this.renderState());
		this.callbacks.onResult({
			won: false,
			reason,
			score: this.score,
			elapsedMs: this.elapsedMs,
			runes: this.runesCollected,
			shards: this.shardsCollected,
			breakdown: {
				runes: this.runesCollected * SCORE.rune,
				shards: this.shardsCollected * SCORE.shard,
				finish: 0,
				time: 0,
				total: this.score
			},
			bestScore: this.bestScore,
			bestTimeMs: this.bestTimeMs,
			newBestScore,
			newBestTime: false
		});
		this.emitHud();
	}

	private commitBestScore(): boolean {
		if (this.score <= this.bestScore) return false;
		this.bestScore = this.score;
		writeNumber(STORAGE_KEYS.bestScore, this.score);
		return true;
	}

	private commitBestTime(): boolean {
		if (this.elapsedMs <= 0) return false;
		if (this.bestTimeMs > 0 && this.elapsedMs >= this.bestTimeMs) return false;
		this.bestTimeMs = Math.round(this.elapsedMs);
		writeNumber(STORAGE_KEYS.bestTime, this.bestTimeMs);
		return true;
	}

	private emitHudThrottled(): void {
		if (this.time - this.lastHudAt < 0.08) return;
		this.lastHudAt = this.time;
		this.emitHud();
	}

	private emitHud(): void {
		const snapshot: HudSnapshot = {
			phase: this.phase,
			score: this.score,
			bestScore: this.bestScore,
			bestTimeMs: this.bestTimeMs,
			runes: this.runesCollected,
			runesTotal: this.level.runes.length,
			shards: this.shardsCollected,
			shardsTotal: this.level.shards.length,
			elapsedMs: this.elapsedMs,
			muted: this.muted,
			loseReason: this.loseReason,
			autoPaused: this.autoPaused,
			portalActive: this.runesCollected >= this.level.runes.length,
			collectedRunes: [...this.collectedRunes],
			hasDash: this.hasDash,
			hasFire: this.hasFire,
			hasLightness: this.hasLightness,
			dashCooldownMs: Math.round(this.dashCooldown * 1000),
			fireCooldownMs: Math.round(this.fireCooldown * 1000),
			checkpoints: this.level.checkpoints.filter((checkpoint) => checkpoint.activated).length,
			checkpointsTotal: this.level.checkpoints.length,
			checkpointLabel: this.activeCheckpoint?.label ?? null,
			canRespawn: this.activeCheckpointId !== null
		};
		this.callbacks.onHud(snapshot);
	}

	private renderState(): RenderState {
		return {
			phase: this.phase,
			player: this.player,
			level: this.level,
			guardians: this.level.guardians,
			cameraX: this.cameraX,
			time: this.time,
			runesCollected: this.runesCollected,
			shardsCollected: this.shardsCollected,
			portalActive: this.runesCollected >= this.level.runes.length,
			loseReason: this.loseReason,
			reducedMotion: this.reducedMotion,
			hasLightness: this.hasLightness,
			fireTimer: this.fireTimer,
			fireFacing: this.fireFacing,
			shake: this.reducedMotion ? 0 : this.shakeTime > 0 ? (this.shakeTime / 0.35) * 7 : 0
		};
	}
}
