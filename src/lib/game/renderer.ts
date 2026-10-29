import { base } from "$app/paths";
import { RUNE_META, RUNE_ORDER } from "./level";
import {
	VIEW,
	type Collectible,
	type GamePhase,
	type Guardian,
	type LevelData,
	type LoseReason,
	type Platform,
	type PlayerBody,
	type RuneId,
	type Updraft
} from "./types";

const TAU = Math.PI * 2;

interface ImageSet {
	guardian: HTMLImageElement | null;
	runes: Record<RuneId, HTMLImageElement | null>;
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	maxLife: number;
	size: number;
	color: string;
	kind: "spark" | "dust" | "confetti" | "wind";
	rotation: number;
	spin: number;
}

export interface RenderState {
	phase: GamePhase;
	player: PlayerBody;
	level: LevelData;
	guardians: Guardian[];
	cameraX: number;
	time: number;
	runesCollected: number;
	shardsCollected: number;
	portalActive: boolean;
	loseReason: LoseReason;
	reducedMotion: boolean;
	hasLightness: boolean;
	fireTimer: number;
	fireFacing: 1 | -1;
	shake: number;
}

function asset(path: string): string {
	return `${base}/${path}`;
}

function loadImage(path: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => resolve(image);
		image.onerror = () => resolve(null);
		image.src = asset(path);
	});
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function hash01(value: number): number {
	const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
	return x - Math.floor(x);
}

export class Renderer {
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;
	private dpr = 1;
	private assets: ImageSet = {
		guardian: null,
		runes: { path: null, fire: null, lightness: null }
	};
	private particles: Particle[] = [];
	private reducedMotion = false;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas 2D is not available");
		this.ctx = ctx;
		this.resize();
		if (typeof window !== "undefined") {
			this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		}
	}

	async load(): Promise<void> {
		const [guardian, path, fire, lightness] = await Promise.all([
			loadImage("assets/guardian.webp"),
			loadImage(RUNE_META.path.image),
			loadImage(RUNE_META.fire.image),
			loadImage(RUNE_META.lightness.image)
		]);
		this.assets = { guardian, runes: { path, fire, lightness } };
	}

	resize(): void {
		if (typeof window === "undefined") return;
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.canvas.width = Math.round(VIEW.width * this.dpr);
		this.canvas.height = Math.round(VIEW.height * this.dpr);
		this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
	}

	updateEffects(dt: number): void {
		for (const particle of this.particles) {
			particle.life -= dt;
			particle.x += particle.vx * dt;
			particle.y += particle.vy * dt;
			particle.vy += (particle.kind === "confetti" ? 260 : particle.kind === "wind" ? -60 : 120) * dt;
			particle.vx *= 1 - Math.min(0.9, dt * 1.2);
			particle.rotation += particle.spin * dt;
		}
		this.particles = this.particles.filter((particle) => particle.life > 0);
	}

	resetEffects(): void {
		this.particles = [];
	}

	burst(
		x: number,
		y: number,
		color: string,
		count: number,
		kind: Particle["kind"] = "spark"
	): void {
		const amount = this.reducedMotion ? Math.ceil(count * 0.35) : count;
		for (let index = 0; index < amount; index += 1) {
			const angle = Math.random() * TAU;
			const speed =
				kind === "confetti" ? 70 + Math.random() * 230 : 40 + Math.random() * 150;
			const life =
				kind === "confetti" ? 0.9 + Math.random() * 0.8 : 0.35 + Math.random() * 0.45;
			this.particles.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - (kind === "confetti" ? 90 : kind === "wind" ? 80 : 20),
				life,
				maxLife: life,
				size: kind === "confetti" ? 3 + Math.random() * 3 : 1.5 + Math.random() * 2.2,
				color,
				kind,
				rotation: Math.random() * TAU,
				spin: (Math.random() - 0.5) * 8
			});
		}
	}

	render(state: RenderState): void {
		this.reducedMotion = state.reducedMotion;
		const ctx = this.ctx;
		ctx.clearRect(0, 0, VIEW.width, VIEW.height);
		ctx.save();
		if (state.shake > 0) {
			ctx.translate(
				(Math.random() - 0.5) * state.shake,
				(Math.random() - 0.5) * state.shake
			);
		}
		this.drawAtmosphere(state);
		this.drawUpdrafts(state);
		this.drawMist(state);
		this.drawPlatforms(state);
		this.drawSpikes(state);
		this.drawJumpPads(state);
		this.drawCheckpoints(state);
		this.drawBell(state);
		this.drawCollectibles(state);
		this.drawGuardians(state);
		this.drawPlayer(state);
		this.drawFire(state);
		this.drawParticles(state);
		this.drawForeground(state);
		if (state.phase === "lost") this.drawLoseTint();
		if (state.phase === "won") this.drawWinTint(state);
		ctx.restore();
	}

	flame(x: number, y: number, facing: 1 | -1): void {
		const amount = this.reducedMotion ? 12 : 38;
		for (let index = 0; index < amount; index += 1) {
			const life = 0.18 + Math.random() * 0.3;
			this.particles.push({
				x,
				y,
				vx: facing * (120 + Math.random() * 360) + (Math.random() - 0.5) * 80,
				vy: (Math.random() - 0.5) * 120 - 20,
				life,
				maxLife: life,
				size: 2 + Math.random() * 4,
				color:
					index % 4 === 0
						? "rgba(255, 241, 176, 0.95)"
						: index % 2 === 0
							? "rgba(255, 154, 61, 0.9)"
							: "rgba(212, 74, 42, 0.82)",
				kind: "spark",
				rotation: Math.random() * TAU,
				spin: (Math.random() - 0.5) * 10
			});
		}
	}

	private drawAtmosphere(state: RenderState): void {
		const ctx = this.ctx;
		const time = state.reducedMotion ? 0 : state.time;
		const blobs = [
			{
				x: 160 + Math.sin(time * 0.11) * 50,
				y: 190,
				r: 270,
				color: "rgba(109, 148, 255, 0.075)"
			},
			{
				x: 760 + Math.cos(time * 0.09) * 60,
				y: 250,
				r: 320,
				color: "rgba(228, 180, 114, 0.055)"
			},
			{
				x: 470 + Math.sin(time * 0.14) * 70,
				y: 430,
				r: 260,
				color: "rgba(212, 106, 88, 0.035)"
			}
		];
		ctx.save();
		ctx.globalCompositeOperation = "screen";
		for (const blob of blobs) {
			const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
			gradient.addColorStop(0, blob.color);
			gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = gradient;
			ctx.fillRect(blob.x - blob.r, blob.y - blob.r, blob.r * 2, blob.r * 2);
		}
		ctx.restore();
	}

	private drawUpdrafts(state: RenderState): void {
		const ctx = this.ctx;
		const time = state.reducedMotion ? 0 : state.time;
		for (const updraft of state.level.updrafts) {
			this.drawUpdraft(updraft, state.cameraX, time);
		}
	}

	private drawUpdraft(updraft: Updraft, cameraX: number, time: number): void {
		const ctx = this.ctx;
		const x = updraft.x - cameraX;
		if (x + updraft.w < -40 || x > VIEW.width + 40) return;
		const top = updraft.y;
		const bottom = updraft.y + updraft.h;

		const column = ctx.createLinearGradient(0, top, 0, bottom);
		column.addColorStop(0, "rgba(109, 148, 255, 0.008)");
		column.addColorStop(0.48, "rgba(109, 148, 255, 0.05)");
		column.addColorStop(0.86, "rgba(228, 180, 114, 0.08)");
		column.addColorStop(1, "rgba(255, 201, 157, 0.12)");
		for (let band = 0; band < 10; band += 1) {
			const t = (band + 0.5) / 10;
			const edge = Math.abs(t - 0.5) * 2;
			ctx.globalAlpha = 1 - edge * edge;
			ctx.fillStyle = column;
			ctx.fillRect(x + (band / 10) * updraft.w, top, updraft.w / 10 + 1, updraft.h);
		}
		ctx.globalAlpha = 1;

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		for (let index = 0; index < 14; index += 1) {
			const offset = (time * (34 + (index % 5) * 18) + hash01(index * 3.1) * updraft.h) % updraft.h;
			const lineX = x + 10 + hash01(index * 1.7) * (updraft.w - 20);
			const lineY = bottom - offset;
			const length = 16 + hash01(index * 2.3) * 34;
			const gradient = ctx.createLinearGradient(lineX, lineY - length, lineX, lineY);
			gradient.addColorStop(0, "rgba(109, 148, 255, 0)");
			gradient.addColorStop(0.5, "rgba(109, 148, 255, 0.3)");
			gradient.addColorStop(1, "rgba(255, 201, 157, 0.5)");
			ctx.strokeStyle = gradient;
			ctx.lineWidth = 1 + (index % 3) * 0.4;
			ctx.beginPath();
			ctx.moveTo(lineX, lineY - length);
			ctx.lineTo(lineX + Math.sin(time * 2 + index) * 4, lineY);
			ctx.stroke();
		}
		const base = ctx.createRadialGradient(
			x + updraft.w / 2,
			bottom - 6,
			0,
			x + updraft.w / 2,
			bottom - 6,
			70
		);
		base.addColorStop(0, "rgba(255, 201, 157, 0.28)");
		base.addColorStop(0.5, "rgba(109, 148, 255, 0.12)");
		base.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = base;
		ctx.fillRect(x - 60, bottom - 80, updraft.w + 120, 100);
		ctx.restore();
	}

	private drawMist(state: RenderState): void {
		const ctx = this.ctx;
		const mist = state.level.mist;
		const x = mist.x - state.cameraX;
		if (x + mist.w < -100 || x > VIEW.width + 100) return;
		const time = state.reducedMotion ? 0 : state.time;

		const base = ctx.createLinearGradient(0, mist.y - 20, 0, VIEW.height);
		base.addColorStop(0, "rgba(8, 6, 4, 0)");
		base.addColorStop(0.4, "rgba(60, 17, 15, 0.3)");
		base.addColorStop(1, "rgba(8, 6, 4, 0.9)");
		ctx.fillStyle = base;
		ctx.fillRect(x, mist.y - 20, mist.w, mist.h + 20);

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		for (let index = 0; index < 14; index += 1) {
			const cx = x + 40 + index * (mist.w / 13) + Math.sin(time * 0.7 + index) * 22;
			if (cx < -120 || cx > VIEW.width + 120) continue;
			const cy = mist.y + 20 + Math.sin(time * 1.1 + index * 1.7) * 12;
			const radius = 60 + (index % 4) * 22;
			const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
			gradient.addColorStop(
				0,
				index % 2 === 0 ? "rgba(212, 106, 88, 0.14)" : "rgba(228, 180, 114, 0.09)"
			);
			gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = gradient;
			ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
		}
		ctx.restore();

		ctx.save();
		for (let index = 0; index < 22; index += 1) {
			const px = x + hash01(index * 2.7) * mist.w;
			const py = mist.y + 30 - ((time * (8 + (index % 5) * 4) + hash01(index) * 60) % 54);
			const alpha = 0.1 + hash01(index * 4.3) * 0.24;
			ctx.fillStyle =
				index % 3 === 0 ? `rgba(255, 201, 157, ${alpha})` : `rgba(212, 106, 88, ${alpha})`;
			ctx.fillRect(px, py, 1.5, 1.5);
		}
		ctx.restore();
	}

	private drawPlatforms(state: RenderState): void {
		for (const platform of state.level.platforms) {
			this.drawPlatform(platform, state);
		}
		for (const platform of state.level.movingPlatforms) {
			this.drawPlatform(platform, state);
		}
	}

	private drawPlatform(platform: Platform, state: RenderState): void {
		const ctx = this.ctx;
		const x = platform.x - state.cameraX;
		const y = platform.y;
		const width = platform.w;
		const height = platform.h;
		if (x + width < -80 || x > VIEW.width + 80) return;

		const seed = hashString(platform.id);
		const moving = platform.kind === "moving";

		if (platform.kind !== "ground") {
			ctx.save();
			ctx.translate(x + width / 2, y + height + 16);
			ctx.scale(1, 0.22);
			const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.5);
			shadow.addColorStop(0, "rgba(0, 0, 0, 0.38)");
			shadow.addColorStop(0.58, "rgba(0, 0, 0, 0.18)");
			shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = shadow;
			ctx.beginPath();
			ctx.arc(0, 0, width * 0.5, 0, TAU);
			ctx.fill();
			ctx.restore();
		}

		ctx.fillStyle = "rgba(10, 7, 4, 0.66)";
		ctx.fillRect(x - 4, y - 3, width + 8, height + 8);

		const body = ctx.createLinearGradient(0, y, 0, y + height);
		body.addColorStop(0, platform.kind === "finish" ? "#3a2714" : moving ? "#26364d" : "#352717");
		body.addColorStop(0.34, "#1d150d");
		body.addColorStop(1, "#0b0806");
		ctx.fillStyle = body;
		ctx.fillRect(x, y, width, height);

		if (platform.kind !== "ground") {
			ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
			ctx.fillRect(x, y + height - 5, width, 5);
		}

		ctx.fillStyle = moving ? "#283b57" : "#2d2012";
		ctx.fillRect(x, y, width, 5);
		ctx.fillStyle = moving ? "#b8d4ff" : platform.kind === "finish" ? "#ffd39a" : "#e4b472";
		ctx.fillRect(x, y, width, 1.5);
		ctx.fillStyle = moving ? "rgba(184, 212, 255, 0.35)" : "rgba(255, 201, 157, 0.22)";
		ctx.fillRect(x, y + 3, width, 1);

		ctx.save();
		ctx.shadowColor = moving ? "rgba(109, 148, 255, 0.8)" : "rgba(228, 180, 114, 0.65)";
		ctx.shadowBlur = moving ? 16 : 12;
		ctx.strokeStyle = moving ? "rgba(184, 212, 255, 0.65)" : "rgba(255, 201, 157, 0.42)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, y + 0.5);
		ctx.lineTo(x + width, y + 0.5);
		ctx.stroke();
		ctx.restore();

		const corner = 10;
		ctx.strokeStyle = moving
			? "rgba(184, 212, 255, 0.8)"
			: platform.kind === "finish"
				? "rgba(255, 211, 154, 0.9)"
				: "rgba(228, 180, 114, 0.62)";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(x + 3, y + 8);
		ctx.lineTo(x + 3, y + 3);
		ctx.lineTo(x + 3 + corner, y + 3);
		ctx.moveTo(x + width - 3 - corner, y + 3);
		ctx.lineTo(x + width - 3, y + 3);
		ctx.lineTo(x + width - 3, y + 8);
		ctx.moveTo(x + 3, y + height - 3);
		ctx.lineTo(x + 3, y + height - 3 - corner);
		ctx.moveTo(x + width - 3, y + height - 3);
		ctx.lineTo(x + width - 3, y + height - 3 - corner);
		ctx.stroke();

		const glyphCount = Math.max(3, Math.floor(width / 70));
		for (let index = 0; index < glyphCount; index += 1) {
			const gx = x + 26 + ((index + 0.5) * (width - 52)) / glyphCount;
			const gy = y + height * 0.56;
			const variant = (seed + index * 7) % 4;
			ctx.strokeStyle = moving ? "rgba(184, 212, 255, 0.28)" : "rgba(228, 180, 114, 0.2)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			if (variant === 0) {
				ctx.moveTo(gx, gy - 5);
				ctx.lineTo(gx, gy + 5);
				ctx.moveTo(gx - 4, gy - 2);
				ctx.lineTo(gx + 4, gy + 2);
			} else if (variant === 1) {
				ctx.moveTo(gx - 4, gy - 5);
				ctx.lineTo(gx + 4, gy + 5);
				ctx.moveTo(gx + 4, gy - 5);
				ctx.lineTo(gx - 4, gy + 5);
			} else if (variant === 2) {
				ctx.moveTo(gx - 4, gy + 4);
				ctx.lineTo(gx, gy - 5);
				ctx.lineTo(gx + 4, gy + 4);
			} else {
				ctx.arc(gx, gy, 4, 0.2, Math.PI * 1.8);
			}
			ctx.stroke();
		}

		if (moving) {
			ctx.save();
			ctx.strokeStyle = "rgba(184, 212, 255, 0.72)";
			ctx.lineWidth = 1.2;
			const pulse = Math.sin(state.time * 2 + seed) * 0.5 + 0.5;
			ctx.globalAlpha = 0.45 + pulse * 0.35;
			const arrowY = y + height * 0.65;
			ctx.beginPath();
			if (platform.axis === "y") {
				ctx.moveTo(x + width / 2, arrowY - 6);
				ctx.lineTo(x + width / 2 - 5, arrowY);
				ctx.moveTo(x + width / 2, arrowY - 6);
				ctx.lineTo(x + width / 2 + 5, arrowY);
				ctx.moveTo(x + width / 2, arrowY + 6);
				ctx.lineTo(x + width / 2 - 5, arrowY);
				ctx.moveTo(x + width / 2, arrowY + 6);
				ctx.lineTo(x + width / 2 + 5, arrowY);
			} else {
				ctx.moveTo(x + width / 2 - 22, arrowY);
				ctx.lineTo(x + width / 2 - 14, arrowY - 5);
				ctx.moveTo(x + width / 2 - 22, arrowY);
				ctx.lineTo(x + width / 2 - 14, arrowY + 5);
				ctx.moveTo(x + width / 2 + 22, arrowY);
				ctx.lineTo(x + width / 2 + 14, arrowY - 5);
				ctx.moveTo(x + width / 2 + 22, arrowY);
				ctx.lineTo(x + width / 2 + 14, arrowY + 5);
			}
			ctx.stroke();
			ctx.restore();
		}

		if (platform.kind !== "ground" && !moving) {
			ctx.save();
			ctx.strokeStyle = "rgba(103, 79, 47, 0.55)";
			ctx.lineWidth = 1;
			for (let index = 0; index < 3; index += 1) {
				const hx = x + width * (0.2 + index * 0.3);
				const length = 15 + ((seed >> (index * 3)) & 15);
				ctx.beginPath();
				ctx.moveTo(hx, y + 5);
				ctx.quadraticCurveTo(
					hx + Math.sin(index + state.time) * 5,
					y + 5 + length * 0.55,
					hx + Math.sin(index * 2 + state.time * 0.6) * 7,
					y + 5 + length
				);
				ctx.stroke();
				ctx.fillStyle = "rgba(228, 180, 114, 0.35)";
				ctx.beginPath();
				ctx.arc(
					hx + Math.sin(index * 2 + state.time * 0.6) * 7,
					y + 5 + length,
					1.3,
					0,
					TAU
				);
				ctx.fill();
			}
			ctx.restore();
		}

		if (platform.kind === "finish") {
			const bannerX = x + 24;
			ctx.strokeStyle = "rgba(255, 201, 157, 0.75)";
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo(bannerX, y - 34);
			ctx.lineTo(bannerX, y - 4);
			ctx.stroke();
			ctx.fillStyle = "rgba(228, 180, 114, 0.35)";
			ctx.beginPath();
			ctx.moveTo(bannerX, y - 32);
			ctx.lineTo(bannerX + 22, y - 27);
			ctx.lineTo(bannerX, y - 22);
			ctx.closePath();
			ctx.fill();
		}
	}

	private drawSpikes(state: RenderState): void {
		const ctx = this.ctx;
		for (const zone of state.level.spikeZones) {
			const x = zone.x - state.cameraX;
			if (x + zone.w < -40 || x > VIEW.width + 40) continue;
			const y = zone.y;
			const baseY = y + zone.h;

			ctx.save();
			ctx.fillStyle = "rgba(70, 18, 12, 0.5)";
			ctx.beginPath();
			ctx.ellipse(x + zone.w / 2, baseY, zone.w / 2, 4, 0, 0, TAU);
			ctx.fill();

			const count = Math.max(3, Math.floor(zone.w / 14));
			const step = zone.w / count;
			for (let index = 0; index < count; index += 1) {
				const px = x + index * step;
				ctx.beginPath();
				ctx.moveTo(px, baseY);
				ctx.lineTo(px + step / 2, y);
				ctx.lineTo(px + step, baseY);
				ctx.closePath();
				const gradient = ctx.createLinearGradient(0, y, 0, baseY);
				gradient.addColorStop(0, "#d46a58");
				gradient.addColorStop(0.35, "#5a2a20");
				gradient.addColorStop(1, "#1a100c");
				ctx.fillStyle = gradient;
				ctx.fill();
				ctx.strokeStyle = "rgba(255, 140, 110, 0.55)";
				ctx.lineWidth = 0.8;
				ctx.stroke();
			}

			ctx.shadowColor = "rgba(212, 106, 88, 0.6)";
			ctx.shadowBlur = 12;
			ctx.strokeStyle = "rgba(255, 140, 110, 0.35)";
			ctx.beginPath();
			ctx.moveTo(x, baseY);
			ctx.lineTo(x + zone.w, baseY);
			ctx.stroke();
			ctx.restore();
		}
	}

	private drawJumpPads(state: RenderState): void {
		const ctx = this.ctx;
		const time = state.reducedMotion ? 0 : state.time;
		for (const pad of state.level.jumpPads) {
			const x = pad.x - state.cameraX;
			if (x + pad.w < -40 || x > VIEW.width + 40) continue;
			const cx = x + pad.w / 2;
			const cy = pad.y + pad.h / 2;
			const pulse = Math.sin(time * 3 + pad.x) * 0.5 + 0.5;

			ctx.save();
			ctx.shadowColor = "rgba(109, 148, 255, 0.85)";
			ctx.shadowBlur = 18;
			const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, pad.w / 2 + 8);
			gradient.addColorStop(0, "rgba(255, 241, 204, 0.85)");
			gradient.addColorStop(0.35, "rgba(109, 148, 255, 0.62)");
			gradient.addColorStop(1, "rgba(109, 148, 255, 0)");
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.ellipse(cx, cy, pad.w / 2 + 8, 12, 0, 0, TAU);
			ctx.fill();

			ctx.strokeStyle = `rgba(255, 201, 157, ${0.55 + pulse * 0.3})`;
			ctx.lineWidth = 1.4;
			ctx.beginPath();
			ctx.ellipse(cx, cy, pad.w / 2, 5, 0, 0, TAU);
			ctx.stroke();
			ctx.strokeStyle = "rgba(109, 148, 255, 0.75)";
			ctx.beginPath();
			ctx.ellipse(cx, cy, pad.w / 2 - 7, 3.5, 0, 0, TAU);
			ctx.stroke();

			ctx.fillStyle = "rgba(255, 241, 204, 0.85)";
			ctx.font = '10px "JetBrains Mono", monospace';
			ctx.textAlign = "center";
			ctx.fillText("↑", cx, cy + 3);
			ctx.restore();
		}
	}

	private drawCheckpoints(state: RenderState): void {
		const ctx = this.ctx;
		const time = state.reducedMotion ? 0 : state.time;
		for (const checkpoint of state.level.checkpoints) {
			const x = checkpoint.x - state.cameraX;
			if (x + checkpoint.w < -70 || x > VIEW.width + 70) continue;

			const bottom = checkpoint.y + checkpoint.h;
			const cx = x + checkpoint.w / 2;
			const columnTop = bottom - 46;
			const flameY = columnTop - 8;
			const flicker = 0.92 + Math.sin(time * 6 + checkpoint.phase) * 0.08;
			const lit = checkpoint.activated || checkpoint.active;
			const edge = lit ? 0.5 : 0.18;

			ctx.save();

			ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
			ctx.beginPath();
			ctx.ellipse(cx, bottom - 2, 20, 5, 0, 0, TAU);
			ctx.fill();

			ctx.fillStyle = "#1a130c";
			ctx.beginPath();
			ctx.moveTo(cx - 15, bottom);
			ctx.lineTo(cx + 15, bottom);
			ctx.lineTo(cx + 11, bottom - 9);
			ctx.lineTo(cx - 11, bottom - 9);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = `rgba(228, 180, 114, ${edge})`;
			ctx.lineWidth = 1;
			ctx.stroke();

			ctx.fillStyle = "#221a11";
			ctx.beginPath();
			ctx.moveTo(cx - 10, bottom - 9);
			ctx.lineTo(cx + 10, bottom - 9);
			ctx.lineTo(cx + 7, columnTop);
			ctx.lineTo(cx - 7, columnTop);
			ctx.closePath();
			ctx.fill();

			ctx.strokeStyle = `rgba(228, 180, 114, ${edge * 0.9})`;
			ctx.beginPath();
			ctx.moveTo(cx - 9, bottom - 10);
			ctx.lineTo(cx - 6, columnTop + 2);
			ctx.moveTo(cx + 9, bottom - 10);
			ctx.lineTo(cx + 6, columnTop + 2);
			ctx.stroke();

			ctx.fillStyle = "#2b2015";
			ctx.beginPath();
			ctx.moveTo(cx - 12, columnTop);
			ctx.lineTo(cx + 12, columnTop);
			ctx.lineTo(cx + 8, columnTop - 8);
			ctx.lineTo(cx - 8, columnTop - 8);
			ctx.closePath();
			ctx.fill();
			ctx.strokeStyle = `rgba(255, 201, 157, ${lit ? 0.55 : 0.2})`;
			ctx.stroke();

			if (lit) {
				const radius = checkpoint.active ? 78 : 48;
				const glow = ctx.createRadialGradient(cx, flameY, 2, cx, flameY, radius);
				glow.addColorStop(0, `rgba(255, 214, 150, ${checkpoint.active ? 0.34 : 0.15})`);
				glow.addColorStop(0.5, `rgba(255, 154, 61, ${checkpoint.active ? 0.13 : 0.05})`);
				glow.addColorStop(1, "rgba(0, 0, 0, 0)");
				ctx.fillStyle = glow;
				ctx.fillRect(cx - radius, flameY - radius, radius * 2, radius * 2);
			}

			ctx.globalCompositeOperation = "lighter";
			const height = (checkpoint.active ? 21 : checkpoint.activated ? 16 : 9) *
				(checkpoint.active ? flicker : 1);
			const width = checkpoint.active ? 6.5 : checkpoint.activated ? 5.4 : 4;
			const alpha = checkpoint.active ? 1 : checkpoint.activated ? 0.6 : 0.3;
			const sway = Math.sin(time * 5 + checkpoint.phase) * 1.6;

			ctx.save();
			ctx.translate(cx + sway, flameY);
			const body = ctx.createLinearGradient(0, 0, 0, -height);
			body.addColorStop(0, `rgba(255, 214, 140, ${0.8 * alpha})`);
			body.addColorStop(0.45, `rgba(255, 148, 58, ${0.55 * alpha})`);
			body.addColorStop(1, "rgba(210, 70, 24, 0)");
			ctx.fillStyle = body;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.bezierCurveTo(width, -height * 0.3, width * 0.85, -height * 0.72, 0, -height);
			ctx.bezierCurveTo(-width * 0.85, -height * 0.72, -width, -height * 0.3, 0, 0);
			ctx.closePath();
			ctx.fill();

			if (checkpoint.active) {
				const core = ctx.createLinearGradient(0, 0, 0, -height * 0.6);
				core.addColorStop(0, "rgba(255, 248, 214, 0.85)");
				core.addColorStop(1, "rgba(255, 190, 90, 0)");
				ctx.fillStyle = core;
				ctx.beginPath();
				ctx.moveTo(0, 0);
				ctx.bezierCurveTo(
					width * 0.5,
					-height * 0.2,
					width * 0.45,
					-height * 0.45,
					0,
					-height * 0.6
				);
				ctx.bezierCurveTo(
					-width * 0.45,
					-height * 0.45,
					-width * 0.5,
					-height * 0.2,
					0,
					0
				);
				ctx.closePath();
				ctx.fill();
			}
			ctx.restore();

			if (checkpoint.active) {
				for (let index = 0; index < 4; index += 1) {
					const progress = (time * 0.55 + checkpoint.phase * 0.3 + index * 0.25) % 1;
					const emberY = flameY - 10 - progress * 58;
					const emberX = cx + Math.sin(progress * 11 + index * 1.7) * 8;
					ctx.fillStyle = `rgba(255, 196, 120, ${0.65 * (1 - progress)})`;
					ctx.fillRect(emberX, emberY, 1.7, 1.7);
				}
			}

			ctx.restore();
		}
	}

	private drawBell(state: RenderState): void {
		const ctx = this.ctx;
		const portal = state.level.portal;
		const cx = portal.x + portal.w / 2 - state.cameraX;
		if (cx + 150 < 0 || cx - 150 > VIEW.width) return;
		const active = state.portalActive;
		const time = state.reducedMotion ? 0 : state.time;
		const top = portal.y;
		const bottom = portal.y + portal.h;
		const bellTop = top + 12;
		const bellBottom = bottom - 2;

		const halo = ctx.createRadialGradient(cx, bottom - 30, 4, cx, bottom - 30, active ? 150 : 90);
		halo.addColorStop(0, active ? "rgba(109, 148, 255, 0.26)" : "rgba(120, 100, 70, 0.08)");
		halo.addColorStop(0.55, active ? "rgba(228, 180, 114, 0.14)" : "rgba(60, 46, 28, 0.04)");
		halo.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = halo;
		ctx.fillRect(cx - 160, top - 40, 320, 280);

		ctx.save();
		ctx.fillStyle = "#2a1b10";
		ctx.fillRect(cx - 74, top - 30, 148, 9);
		ctx.fillStyle = "rgba(228, 180, 114, 0.6)";
		ctx.fillRect(cx - 74, top - 30, 148, 1);
		ctx.fillStyle = "#1b120a";
		ctx.fillRect(cx - 68, top - 21, 6, 44);
		ctx.fillRect(cx + 62, top - 21, 6, 44);
		ctx.strokeStyle = "rgba(228, 180, 114, 0.7)";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(cx, top - 21);
		ctx.lineTo(cx, bellTop + 4);
		ctx.stroke();
		ctx.restore();

		ctx.beginPath();
		ctx.moveTo(cx - 28, bellTop);
		ctx.bezierCurveTo(cx - 34, bellTop + 28, cx - 52, bellBottom - 44, cx - 52, bellBottom - 14);
		ctx.quadraticCurveTo(cx - 52, bellBottom, cx - 38, bellBottom);
		ctx.lineTo(cx + 38, bellBottom);
		ctx.quadraticCurveTo(cx + 52, bellBottom, cx + 52, bellBottom - 14);
		ctx.bezierCurveTo(cx + 52, bellBottom - 44, cx + 34, bellTop + 28, cx + 28, bellTop);
		ctx.closePath();
		const bronze = ctx.createLinearGradient(cx - 50, bellTop, cx + 50, bellBottom);
		bronze.addColorStop(0, active ? "#a77a3d" : "#5e4326");
		bronze.addColorStop(0.42, active ? "#6f4a23" : "#3d2a18");
		bronze.addColorStop(1, active ? "#2b1a0d" : "#1a100a");
		ctx.fillStyle = bronze;
		ctx.fill();
		ctx.strokeStyle = active ? "rgba(255, 211, 154, 0.9)" : "rgba(160, 126, 78, 0.55)";
		ctx.lineWidth = 1.4;
		ctx.stroke();

		ctx.fillStyle = active ? "#8d6331" : "#4e3820";
		ctx.beginPath();
		ctx.ellipse(cx, bellBottom - 10, 54, 10, 0, 0, TAU);
		ctx.fill();
		ctx.strokeStyle = active ? "rgba(255, 211, 154, 0.9)" : "rgba(160, 126, 78, 0.6)";
		ctx.beginPath();
		ctx.ellipse(cx, bellBottom - 10, 54, 10, 0, 0, TAU);
		ctx.stroke();

		const mouth = ctx.createRadialGradient(cx, bellBottom - 20, 2, cx, bellBottom - 20, 44);
		mouth.addColorStop(0, active ? "rgba(109, 148, 255, 0.55)" : "rgba(20, 14, 9, 0.75)");
		mouth.addColorStop(0.55, active ? "rgba(228, 180, 114, 0.22)" : "rgba(20, 14, 9, 0.8)");
		mouth.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = mouth;
		ctx.beginPath();
		ctx.ellipse(cx, bellBottom - 18, 44, 22, 0, 0, TAU);
		ctx.fill();

		ctx.save();
		ctx.shadowColor = active ? "#6d94ff" : "rgba(0,0,0,0)";
		ctx.shadowBlur = active ? 18 : 0;
		ctx.fillStyle = active ? "#ffd39a" : "#2a1a0d";
		ctx.beginPath();
		ctx.arc(cx, bellBottom - 4, 7, 0, TAU);
		ctx.fill();
		ctx.restore();

		if (active) {
			ctx.save();
			ctx.globalCompositeOperation = "screen";
			for (let index = 0; index < 18; index += 1) {
				const angle = time * 0.6 + (index / 18) * TAU;
				const radius = 58 + Math.sin(time * 1.7 + index) * 6;
				ctx.fillStyle =
					index % 3 === 0 ? "rgba(109, 148, 255, 0.8)" : "rgba(255, 201, 157, 0.72)";
				ctx.beginPath();
				ctx.arc(
					cx + Math.cos(angle) * radius,
					bottom - 32 + Math.sin(angle) * 30,
					1.3 + (index % 2),
					0,
					TAU
				);
				ctx.fill();
			}
			ctx.restore();
		}

		const slotPositions = [
			{ x: -82, y: bottom - 34 },
			{ x: 0, y: top - 50 },
			{ x: 82, y: bottom - 34 }
		];
		RUNE_ORDER.forEach((runeId, index) => {
			const meta = RUNE_META[runeId];
			const slot = slotPositions[index] ?? { x: 0, y: 0 };
			const sx = cx + slot.x;
			const sy = slot.y;
			const collected = this.isRuneCollected(state, runeId);
			ctx.save();
			ctx.globalAlpha = collected ? 0.95 : 0.22;
			if (collected) {
				ctx.shadowColor = meta.color;
				ctx.shadowBlur = 12;
			}
			const image = this.assets.runes[runeId];
			if (image) {
				ctx.drawImage(image, sx - 12, sy - 12, 24, 24);
			} else {
				ctx.strokeStyle = meta.color;
				ctx.beginPath();
				ctx.arc(sx, sy, 9, 0, TAU);
				ctx.stroke();
			}
			ctx.restore();
			if (!collected) {
				ctx.strokeStyle = "rgba(228, 180, 114, 0.22)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.arc(sx, sy, 14, 0, TAU);
				ctx.stroke();
			}
		});

		ctx.save();
		ctx.textAlign = "center";
		ctx.font = '9px "JetBrains Mono", monospace';
		ctx.fillStyle = active ? "rgba(255, 211, 154, 0.9)" : "rgba(228, 180, 114, 0.42)";
		ctx.fillText(active ? "КОЛОКОЛ ПРОБУЖДЁН" : "ТРИ РУНЫ НЕ СОБРАНЫ", cx, bottom + 22);
		ctx.restore();
	}

	private isRuneCollected(state: RenderState, runeId: RuneId): boolean {
		return state.level.runes.some((rune) => rune.runeId === runeId && rune.collected);
	}

	private drawCollectibles(state: RenderState): void {
		for (const collectible of [...state.level.runes, ...state.level.shards]) {
			if (collectible.collected) continue;
			this.drawCollectible(collectible, state);
		}
	}

	private drawCollectible(collectible: Collectible, state: RenderState): void {
		const ctx = this.ctx;
		const cx = collectible.x + collectible.w / 2 - state.cameraX;
		const cy = collectible.y + collectible.h / 2;
		if (cx < -80 || cx > VIEW.width + 80) return;
		const time = state.reducedMotion ? 0 : state.time;
		const bob = Math.sin(time * 2.1 + collectible.phase) * 4;

		if (collectible.kind === "rune" && collectible.runeId) {
			const meta = RUNE_META[collectible.runeId];
			ctx.save();
			ctx.globalAlpha = 0.75;
			ctx.strokeStyle = meta.color;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(cx, cy + bob, 29, 0, TAU);
			ctx.stroke();
			ctx.globalAlpha = 0.28;
			ctx.beginPath();
			ctx.arc(cx, cy + bob, 36 + Math.sin(time * 1.8 + collectible.phase) * 3, 0, TAU);
			ctx.stroke();
			ctx.restore();

			ctx.save();
			ctx.shadowColor = meta.color;
			ctx.shadowBlur = 20;
			const image = this.assets.runes[collectible.runeId];
			if (image) {
				ctx.drawImage(image, cx - 23, cy - 23 + bob, 46, 46);
			} else {
				ctx.fillStyle = meta.color;
				ctx.beginPath();
				ctx.moveTo(cx, cy - 16 + bob);
				ctx.lineTo(cx + 12, cy + bob);
				ctx.lineTo(cx, cy + 16 + bob);
				ctx.lineTo(cx - 12, cy + bob);
				ctx.closePath();
				ctx.fill();
			}
			ctx.restore();

			ctx.save();
			ctx.globalCompositeOperation = "screen";
			for (let index = 0; index < 3; index += 1) {
				const angle = time * 1.5 + collectible.phase + (index / 3) * TAU;
				ctx.fillStyle = meta.color;
				ctx.globalAlpha = 0.7;
				ctx.beginPath();
				ctx.arc(cx + Math.cos(angle) * 34, cy + bob + Math.sin(angle) * 16, 1.4, 0, TAU);
				ctx.fill();
			}
			ctx.restore();
			return;
		}

		ctx.save();
		ctx.translate(cx, cy + bob);
		ctx.rotate(time * 1.1 + collectible.phase);
		ctx.shadowColor = "rgba(255, 201, 157, 0.75)";
		ctx.shadowBlur = 16;
		const gradient = ctx.createLinearGradient(0, -13, 0, 13);
		gradient.addColorStop(0, "#fff1cc");
		gradient.addColorStop(0.45, "#e4b472");
		gradient.addColorStop(1, "#8f6228");
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo(0, -13);
		ctx.lineTo(9, 0);
		ctx.lineTo(0, 13);
		ctx.lineTo(-9, 0);
		ctx.closePath();
		ctx.fill();
		ctx.strokeStyle = "rgba(255, 241, 204, 0.8)";
		ctx.lineWidth = 1;
		ctx.stroke();
		ctx.shadowBlur = 0;
		ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
		ctx.beginPath();
		ctx.moveTo(0, -8);
		ctx.lineTo(4, -1);
		ctx.lineTo(0, 3);
		ctx.lineTo(-4, -1);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	private drawGuardians(state: RenderState): void {
		for (const guardian of state.guardians) {
			this.drawGuardian(guardian, state);
		}
	}

	private drawGuardian(guardian: Guardian, state: RenderState): void {
		const ctx = this.ctx;
		const cx = guardian.x + guardian.w / 2 - state.cameraX;
		const cy = guardian.y + guardian.h / 2;
		if (cx < -100 || cx > VIEW.width + 100) return;
		const time = state.reducedMotion ? 0 : state.time;

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		for (let index = 1; index <= 3; index += 1) {
			ctx.globalAlpha = 0.12 / index;
			ctx.fillStyle = "#d46a58";
			ctx.beginPath();
			ctx.arc(cx - index * 13, cy + Math.sin(time * 2 + index) * 6, 20 - index * 3, 0, TAU);
			ctx.fill();
		}
		ctx.restore();

		const aura = ctx.createRadialGradient(cx, cy, 4, cx, cy, 56);
		aura.addColorStop(0, "rgba(212, 106, 88, 0.24)");
		aura.addColorStop(0.55, "rgba(228, 180, 114, 0.09)");
		aura.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = aura;
		ctx.fillRect(cx - 60, cy - 60, 120, 120);

		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, 31, 0, TAU);
		ctx.clip();
		if (this.assets.guardian) {
			ctx.drawImage(this.assets.guardian, cx - 36, cy - 30, 72, 61);
		} else {
			ctx.fillStyle = "#1a1510";
			ctx.fillRect(cx - 36, cy - 30, 72, 61);
		}
		const vignette = ctx.createRadialGradient(cx, cy, 8, cx, cy, 34);
		vignette.addColorStop(0, "rgba(26, 10, 8, 0.05)");
		vignette.addColorStop(0.72, "rgba(20, 8, 6, 0.35)");
		vignette.addColorStop(1, "rgba(8, 6, 4, 0.92)");
		ctx.fillStyle = vignette;
		ctx.fillRect(cx - 36, cy - 34, 72, 68);
		ctx.restore();

		ctx.strokeStyle = "rgba(228, 180, 114, 0.72)";
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.arc(cx, cy, 31, 0, TAU);
		ctx.stroke();

		ctx.strokeStyle = "rgba(212, 106, 88, 0.62)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.ellipse(cx - 24, cy - 8, 19, 7, -0.45, 0, TAU);
		ctx.stroke();
		ctx.beginPath();
		ctx.ellipse(cx + 24, cy - 8, 19, 7, 0.45, 0, TAU);
		ctx.stroke();

		ctx.save();
		ctx.shadowColor = "#d46a58";
		ctx.shadowBlur = 10;
		ctx.fillStyle = "rgba(255, 90, 64, 0.85)";
		ctx.beginPath();
		ctx.arc(cx - 7, cy - 4, 1.6, 0, TAU);
		ctx.arc(cx + 7, cy - 4, 1.6, 0, TAU);
		ctx.fill();
		ctx.restore();
	}

	private drawPlayer(state: RenderState): void {
		const ctx = this.ctx;
		const player = state.player;
		const x = player.x - state.cameraX;
		const y = player.y;
		if (x + player.w < -60 || x > VIEW.width + 60) return;
		const time = state.reducedMotion ? 0 : state.time;
		const bob = player.onGround && !player.moving ? Math.sin(time * 3.2) * 1.2 : 0;

		ctx.save();
		ctx.globalAlpha = player.onGround ? 0.32 : 0.14;
		ctx.fillStyle = "#000000";
		ctx.beginPath();
		ctx.ellipse(x + player.w / 2, y + player.h + 2, 18, 5, 0, 0, TAU);
		ctx.fill();
		ctx.restore();

		const aura = ctx.createRadialGradient(
			x + player.w / 2,
			y + player.h / 2,
			2,
			x + player.w / 2,
			y + player.h / 2,
			36
		);
		aura.addColorStop(0, "rgba(109, 148, 255, 0.12)");
		aura.addColorStop(0.55, "rgba(228, 180, 114, 0.05)");
		aura.addColorStop(1, "rgba(0, 0, 0, 0)");
		ctx.fillStyle = aura;
		ctx.fillRect(x + player.w / 2 - 40, y + player.h / 2 - 40, 80, 80);

		if (state.hasLightness && player.vy > 10) {
			ctx.save();
			ctx.globalCompositeOperation = "screen";
			const featherGlow = ctx.createRadialGradient(
				x + player.w / 2,
				y + player.h / 2,
				2,
				x + player.w / 2,
				y + player.h / 2,
				48
			);
			featherGlow.addColorStop(0, "rgba(169, 214, 255, 0.2)");
			featherGlow.addColorStop(0.6, "rgba(169, 214, 255, 0.07)");
			featherGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
			ctx.fillStyle = featherGlow;
			ctx.fillRect(x + player.w / 2 - 50, y + player.h / 2 - 50, 100, 100);

			ctx.strokeStyle = "rgba(196, 228, 255, 0.55)";
			ctx.lineWidth = 1.1;
			for (let index = 0; index < 3; index += 1) {
				const drift = Math.sin(state.time * 4 + index * 2) * 6;
				ctx.beginPath();
				ctx.moveTo(x + player.w / 2 - 12 + index * 11, y - 4);
				ctx.quadraticCurveTo(
					x + player.w / 2 - 20 + index * 13 + drift,
					y - 16,
					x + player.w / 2 - 7 + index * 11 + drift,
					y - 26 - index * 4
				);
				ctx.stroke();
			}
			ctx.restore();
		}

		ctx.save();
		ctx.translate(x + player.w / 2, y + bob);
		ctx.scale(player.facing, 1);

		const walk = player.moving ? Math.sin(player.animTime) * 6 : 0;
		const flutter = Math.sin(player.animTime * 1.8) * 1.5 + (player.onGround ? 0 : -3);

		ctx.beginPath();
		ctx.moveTo(-8, 15);
		ctx.quadraticCurveTo(-16, 26, -12 - flutter, 43);
		ctx.lineTo(-2, 39);
		ctx.lineTo(6, 44);
		ctx.quadraticCurveTo(13, 29, 8, 15);
		ctx.closePath();
		const cloak = ctx.createLinearGradient(0, 14, 0, 45);
		cloak.addColorStop(0, "#151d2c");
		cloak.addColorStop(0.7, "#0c111b");
		cloak.addColorStop(1, "#080b12");
		ctx.fillStyle = cloak;
		ctx.fill();
		ctx.strokeStyle = "rgba(109, 148, 255, 0.32)";
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.strokeStyle = "rgba(228, 180, 114, 0.5)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(-11, 24);
		ctx.quadraticCurveTo(-14, 34, -10 - flutter * 0.6, 42);
		ctx.stroke();

		ctx.strokeStyle = "#1b2233";
		ctx.lineWidth = 5;
		ctx.lineCap = "round";
		ctx.beginPath();
		if (player.onGround) {
			ctx.moveTo(-5, 34);
			ctx.lineTo(-5 + walk, 46);
			ctx.moveTo(5, 34);
			ctx.lineTo(5 - walk, 46);
		} else {
			ctx.moveTo(-5, 34);
			ctx.lineTo(-9, 42);
			ctx.moveTo(5, 34);
			ctx.lineTo(9, 40);
		}
		ctx.stroke();
		ctx.lineCap = "butt";

		ctx.fillStyle = "#0d1118";
		ctx.fillRect(-9, 43, 8, 4);
		ctx.fillRect(3, 40, 8, 4);
		ctx.fillStyle = "rgba(228, 180, 114, 0.42)";
		ctx.fillRect(-9, 45, 8, 1);
		ctx.fillRect(3, 42, 8, 1);

		const body = ctx.createLinearGradient(0, 14, 0, 34);
		body.addColorStop(0, "#1a2334");
		body.addColorStop(1, "#0d121b");
		ctx.fillStyle = body;
		ctx.beginPath();
		ctx.moveTo(-8, 16);
		ctx.lineTo(8, 16);
		ctx.lineTo(10, 32);
		ctx.lineTo(-10, 32);
		ctx.closePath();
		ctx.fill();
		ctx.strokeStyle = "rgba(109, 148, 255, 0.22)";
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.strokeStyle = "rgba(228, 180, 114, 0.75)";
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.moveTo(-9, 30);
		ctx.lineTo(9, 30);
		ctx.stroke();
		ctx.fillStyle = "rgba(255, 201, 157, 0.85)";
		ctx.fillRect(-2, 29, 4, 3);

		ctx.fillStyle = "rgba(143, 98, 40, 0.55)";
		ctx.fillRect(-10, 25, 5, 7);
		ctx.strokeStyle = "rgba(228, 180, 114, 0.5)";
		ctx.lineWidth = 1;
		ctx.strokeRect(-10, 25, 5, 7);

		ctx.beginPath();
		ctx.moveTo(-10, 16);
		ctx.quadraticCurveTo(-13, 7, -4, 4);
		ctx.lineTo(1, 1);
		ctx.lineTo(6, 4);
		ctx.quadraticCurveTo(13, 7, 10, 16);
		ctx.closePath();
		ctx.fillStyle = "#111827";
		ctx.fill();
		ctx.strokeStyle = "rgba(228, 180, 114, 0.6)";
		ctx.lineWidth = 1;
		ctx.stroke();

		ctx.fillStyle = "#d8c3a5";
		ctx.beginPath();
		ctx.ellipse(1, 11, 5, 6, 0, 0, TAU);
		ctx.fill();
		ctx.fillStyle = "#2a1c12";
		ctx.beginPath();
		ctx.arc(-1, 11, 0.8, 0, TAU);
		ctx.arc(3, 11, 0.8, 0, TAU);
		ctx.fill();
		ctx.fillStyle = "rgba(228, 180, 114, 0.9)";
		ctx.fillRect(-4, 6, 9, 1);

		ctx.strokeStyle = "#1b2233";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(-8, 20);
		ctx.lineTo(-13, 27);
		ctx.moveTo(8, 20);
		ctx.lineTo(13, 26);
		ctx.stroke();
		ctx.lineCap = "butt";

		ctx.strokeStyle = "#6b4a28";
		ctx.lineWidth = 2.2;
		ctx.beginPath();
		ctx.moveTo(14, 29);
		ctx.lineTo(17, 3);
		ctx.stroke();
		ctx.strokeStyle = "rgba(228, 180, 114, 0.8)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(15, 23);
		ctx.lineTo(16.5, 9);
		ctx.stroke();

		ctx.save();
		ctx.shadowColor = "#6d94ff";
		ctx.shadowBlur = 14;
		ctx.fillStyle = "#9eb6ff";
		ctx.beginPath();
		ctx.moveTo(17, -4);
		ctx.lineTo(21, 2);
		ctx.lineTo(17, 7);
		ctx.lineTo(13, 2);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
		ctx.beginPath();
		ctx.arc(17, 1.5, 1.2, 0, TAU);
		ctx.fill();
		ctx.restore();

		ctx.restore();
	}

	private drawFire(state: RenderState): void {
		if (state.fireTimer <= 0) return;
		const ctx = this.ctx;
		const player = state.player;
		const tipX = player.x + player.w / 2 - state.cameraX + state.fireFacing * 14;
		const tipY = player.y + 8;
		const alpha = Math.min(1, state.fireTimer / 0.14);

		ctx.save();
		ctx.translate(tipX, tipY);
		ctx.scale(state.fireFacing, 1);
		ctx.globalCompositeOperation = "lighter";
		ctx.globalAlpha = alpha;
		ctx.shadowColor = "rgba(255, 120, 40, 0.8)";
		ctx.shadowBlur = 16;

		const cone = ctx.createLinearGradient(0, 0, 245, 0);
		cone.addColorStop(0, "rgba(255, 244, 196, 0.95)");
		cone.addColorStop(0.18, "rgba(255, 178, 74, 0.8)");
		cone.addColorStop(0.6, "rgba(234, 88, 38, 0.42)");
		cone.addColorStop(1, "rgba(150, 28, 12, 0)");
		ctx.fillStyle = cone;
		ctx.beginPath();
		ctx.moveTo(0, -8);
		ctx.quadraticCurveTo(120, -44, 245, -58);
		ctx.quadraticCurveTo(270, 0, 245, 58);
		ctx.quadraticCurveTo(120, 44, 0, 8);
		ctx.closePath();
		ctx.fill();

		ctx.lineCap = "round";
		for (let tongue = 0; tongue < 4; tongue += 1) {
			const offset = Math.sin(state.time * 24 + tongue * 2.1) * 10;
			ctx.strokeStyle =
				tongue % 2 === 0 ? "rgba(255, 213, 120, 0.6)" : "rgba(235, 92, 44, 0.55)";
			ctx.lineWidth = 8 - tongue;
			ctx.beginPath();
			ctx.moveTo(20, offset * 0.2);
			ctx.quadraticCurveTo(95, offset, 205, offset * 1.8);
			ctx.stroke();
		}
		ctx.restore();
	}

	private drawParticles(state: RenderState): void {
		const ctx = this.ctx;
		ctx.save();
		for (const particle of this.particles) {
			const alpha = Math.max(0, particle.life / particle.maxLife);
			const x = particle.x - state.cameraX;
			const y = particle.y;
			ctx.globalAlpha = alpha;
			ctx.fillStyle = particle.color;
			if (particle.kind === "confetti") {
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(particle.rotation);
				ctx.fillRect(
					-particle.size / 2,
					-particle.size / 2,
					particle.size,
					particle.size * 1.6
				);
				ctx.restore();
			} else {
				ctx.beginPath();
				ctx.arc(x, y, particle.size, 0, TAU);
				ctx.fill();
			}
		}
		ctx.restore();
	}

	private drawForeground(state: RenderState): void {
		const ctx = this.ctx;
		const time = state.reducedMotion ? 0 : state.time;

		ctx.save();
		ctx.globalCompositeOperation = "screen";
		for (let index = 0; index < 34; index += 1) {
			const speed = 6 + (index % 4) * 3;
			const x = (hash01(index * 1.3) * (VIEW.width + 40) + time * speed) % (VIEW.width + 40) - 20;
			const y =
				VIEW.height +
				40 -
				((time * (3 + (index % 3) * 2) + hash01(index * 2.1) * VIEW.height) %
					(VIEW.height + 40)) -
				20;
			const alpha = 0.08 + hash01(index * 3.7) * 0.22;
			ctx.fillStyle =
				index % 5 === 0 ? `rgba(109, 148, 255, ${alpha})` : `rgba(228, 180, 114, ${alpha})`;
			ctx.fillRect(x, y, 1.5, 1.5);
		}
		ctx.restore();

		const bottom = ctx.createLinearGradient(0, VIEW.height - 120, 0, VIEW.height);
		bottom.addColorStop(0, "rgba(8, 6, 4, 0)");
		bottom.addColorStop(1, "rgba(8, 6, 4, 0.72)");
		ctx.fillStyle = bottom;
		ctx.fillRect(0, VIEW.height - 120, VIEW.width, 120);
	}

	private drawLoseTint(): void {
		const ctx = this.ctx;
		const gradient = ctx.createRadialGradient(
			VIEW.width / 2,
			VIEW.height / 2,
			80,
			VIEW.width / 2,
			VIEW.height / 2,
			VIEW.width * 0.7
		);
		gradient.addColorStop(0, "rgba(120, 24, 16, 0.05)");
		gradient.addColorStop(0.65, "rgba(120, 24, 16, 0.2)");
		gradient.addColorStop(1, "rgba(60, 8, 6, 0.55)");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, VIEW.width, VIEW.height);
	}

	private drawWinTint(state: RenderState): void {
		const ctx = this.ctx;
		const portal = state.level.portal;
		const cx = portal.x + portal.w / 2 - state.cameraX;
		const cy = portal.y + portal.h / 2;
		const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 420);
		gradient.addColorStop(0, "rgba(255, 211, 154, 0.16)");
		gradient.addColorStop(0.55, "rgba(228, 180, 114, 0.08)");
		gradient.addColorStop(1, "rgba(0, 0, 0, 0.18)");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, VIEW.width, VIEW.height);
	}
}
