type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
	if (typeof window === "undefined") return null;
	const candidate =
		window.AudioContext ??
		(window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
	return candidate ?? null;
}

/**
 * Small synthesizer for UI and gameplay sounds.
 * No external audio files are used; everything is generated in the browser.
 */
export class SoundManager {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private muted: boolean;

	constructor(muted = false) {
		this.muted = muted;
	}

	get isMuted(): boolean {
		return this.muted;
	}

	unlock(): void {
		if (!this.ctx) {
			const Constructor = audioContextConstructor();
			if (!Constructor) return;
			this.ctx = new Constructor();
			this.master = this.ctx.createGain();
			this.master.gain.value = this.muted ? 0 : 0.22;
			this.master.connect(this.ctx.destination);
		}
		if (this.ctx.state === "suspended") {
			void this.ctx.resume().catch(() => {
				// The page can be unloaded or hot-reloaded while resume() is pending.
			});
		}
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		if (!this.ctx || !this.master) return;
		const now = this.ctx.currentTime;
		this.master.gain.cancelScheduledValues(now);
		this.master.gain.setTargetAtTime(muted ? 0 : 0.22, now, 0.018);
	}

	jump(): void {
		this.tone(300, 0.12, "square", 0.045, 0, 640);
	}

	land(): void {
		this.tone(92, 0.1, "sine", 0.035, 0, 58);
	}

	jumpPad(): void {
		this.tone(180, 0.3, "triangle", 0.06, 0, 560);
		this.tone(280, 0.26, "sine", 0.04, 0.025, 840);
	}

	dash(): void {
		this.tone(160, 0.18, "sine", 0.05, 0, 620);
		this.tone(84, 0.2, "triangle", 0.032, 0, 220);
	}

	fire(): void {
		this.tone(180, 0.3, "sawtooth", 0.05, 0, 68);
		this.tone(90, 0.36, "square", 0.028, 0.02, 45);
		this.tone(320, 0.2, "triangle", 0.03, 0, 120);
	}

	collectShard(): void {
		this.tone(880, 0.16, "sine", 0.07, 0, 1180);
		this.tone(1320, 0.22, "triangle", 0.035, 0.035);
	}

	collectRune(index: number): void {
		const roots = [523.25, 659.25, 783.99];
		const root = roots[Math.min(index, roots.length - 1)] ?? 523.25;
		this.tone(root, 0.3, "sine", 0.085);
		this.tone(root * 1.5, 0.34, "triangle", 0.045, 0.03);
		this.tone(root * 2, 0.42, "sine", 0.028, 0.08);
	}

	checkpoint(): void {
		this.tone(392, 0.34, "sine", 0.07, 0, 523.25);
		this.tone(523.25, 0.4, "triangle", 0.04, 0.07, 659.25);
		this.tone(783.99, 0.5, "sine", 0.025, 0.14, 880);
	}

	portalLocked(): void {
		this.tone(116, 0.18, "sine", 0.07, 0, 82);
		this.tone(155, 0.2, "triangle", 0.035, 0.02, 110);
	}

	win(): void {
		const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
		notes.forEach((note, index) => {
			this.tone(note, 0.5, index > 2 ? "sine" : "triangle", 0.065, index * 0.095);
		});
		this.tone(130.81, 1.1, "sine", 0.045, 0.02);
	}

	lose(): void {
		const notes = [329.63, 246.94, 185, 123.47];
		notes.forEach((note, index) => {
			this.tone(note, 0.34, "sawtooth", 0.035, index * 0.13);
		});
	}

	click(): void {
		this.tone(440, 0.06, "sine", 0.035);
	}

	destroy(): void {
		if (this.ctx && this.ctx.state !== "closed") {
			void this.ctx.close().catch(() => {
				// Closing can race with a pending resume() during page teardown.
			});
		}
		this.ctx = null;
		this.master = null;
	}

	private tone(
		frequency: number,
		duration: number,
		type: OscillatorType,
		volume: number,
		delay = 0,
		endFrequency?: number
	): void {
		if (!this.ctx || !this.master || this.muted) return;
		const ctx = this.ctx;
		const start = ctx.currentTime + delay;
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();
		oscillator.type = type;
		oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
		if (endFrequency !== undefined) {
			oscillator.frequency.exponentialRampToValueAtTime(
				Math.max(20, endFrequency),
				start + duration
			);
		}
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		oscillator.connect(gain);
		gain.connect(this.master);
		oscillator.start(start);
		oscillator.stop(start + duration + 0.04);
	}
}
