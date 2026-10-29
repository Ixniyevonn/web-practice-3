import type { VirtualAction } from "./types";

const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const JUMP_KEYS = new Set(["Space", "KeyW", "ArrowUp"]);
const DASH_KEYS = new Set(["ShiftLeft", "ShiftRight", "KeyE"]);
const FIRE_KEYS = new Set(["KeyF", "KeyQ"]);

function isGameKey(code: string): boolean {
	return (
		LEFT_KEYS.has(code) ||
		RIGHT_KEYS.has(code) ||
		JUMP_KEYS.has(code) ||
		DASH_KEYS.has(code) ||
		FIRE_KEYS.has(code)
	);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return Boolean(
		target.closest("button, a, input, textarea, select, summary, [contenteditable='true']")
	);
}

/**
 * Owns keyboard state and the virtual buttons.
 * Listeners are attached once, so restarts never duplicate handlers.
 */
export class Input {
	private keys = new Set<string>();
	private virtual = { left: false, right: false, jump: false, dash: false, fire: false };
	private jumpQueued = false;
	private dashQueued = false;
	private fireQueued = false;
	private readonly isActive: () => boolean;
	private readonly onKeyDownBound = (event: KeyboardEvent) => this.onKeyDown(event);
	private readonly onKeyUpBound = (event: KeyboardEvent) => this.onKeyUp(event);
	private readonly onBlurBound = () => this.clear();

	constructor(isActive: () => boolean) {
		this.isActive = isActive;
		if (typeof window === "undefined") return;
		window.addEventListener("keydown", this.onKeyDownBound, { passive: false });
		window.addEventListener("keyup", this.onKeyUpBound);
		window.addEventListener("blur", this.onBlurBound);
	}

	get left(): boolean {
		for (const code of LEFT_KEYS) {
			if (this.keys.has(code)) return true;
		}
		return this.virtual.left;
	}

	get right(): boolean {
		for (const code of RIGHT_KEYS) {
			if (this.keys.has(code)) return true;
		}
		return this.virtual.right;
	}

	get jumpHeld(): boolean {
		for (const code of JUMP_KEYS) {
			if (this.keys.has(code)) return true;
		}
		return this.virtual.jump;
	}

	consumeJump(): boolean {
		const queued = this.jumpQueued;
		this.jumpQueued = false;
		return queued;
	}

	consumeDash(): boolean {
		const queued = this.dashQueued;
		this.dashQueued = false;
		return queued;
	}

	consumeFire(): boolean {
		const queued = this.fireQueued;
		this.fireQueued = false;
		return queued;
	}

	setVirtual(action: VirtualAction, pressed: boolean): void {
		if (action === "jump" && pressed && !this.virtual.jump) {
			this.jumpQueued = true;
		}
		if (action === "dash" && pressed && !this.virtual.dash) {
			this.dashQueued = true;
		}
		if (action === "fire" && pressed && !this.virtual.fire) {
			this.fireQueued = true;
		}
		this.virtual[action] = pressed;
	}

	clear(): void {
		this.keys.clear();
		this.virtual.left = false;
		this.virtual.right = false;
		this.virtual.jump = false;
		this.virtual.dash = false;
		this.virtual.fire = false;
		this.jumpQueued = false;
		this.dashQueued = false;
		this.fireQueued = false;
	}

	destroy(): void {
		if (typeof window === "undefined") return;
		window.removeEventListener("keydown", this.onKeyDownBound);
		window.removeEventListener("keyup", this.onKeyUpBound);
		window.removeEventListener("blur", this.onBlurBound);
		this.clear();
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (!isGameKey(event.code)) return;
		if (!this.isActive()) return;
		if (isInteractiveTarget(event.target)) return;

		event.preventDefault();
		if (!event.repeat) {
			if (JUMP_KEYS.has(event.code)) this.jumpQueued = true;
			if (DASH_KEYS.has(event.code)) this.dashQueued = true;
			if (FIRE_KEYS.has(event.code)) this.fireQueued = true;
		}
		this.keys.add(event.code);
	}

	private onKeyUp(event: KeyboardEvent): void {
		if (!isGameKey(event.code)) return;
		this.keys.delete(event.code);
		if (this.isActive() && !isInteractiveTarget(event.target)) {
			event.preventDefault();
		}
	}
}
