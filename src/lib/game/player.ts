import { movePlayer } from "./collision";
import type { Input } from "./input";
import type { LevelData, PlayerBody } from "./types";

export const PLAYER_WIDTH = 34;
export const PLAYER_HEIGHT = 48;

const MOVE_SPEED = 260;
const ACCELERATION_GROUND = 2400;
const ACCELERATION_AIR = 1500;
const FRICTION_GROUND = 2800;
const FRICTION_AIR = 720;
const GRAVITY = 1850;
const JUMP_VELOCITY = -640;
const MAX_FALL_SPEED = 940;
const COYOTE_TIME = 0.085;
const JUMP_BUFFER_TIME = 0.1;

export interface PlayerEvents {
	onJump?: () => void;
	onLand?: () => void;
}

function approach(value: number, target: number, delta: number): number {
	if (value < target) return Math.min(value + delta, target);
	if (value > target) return Math.max(value - delta, target);
	return target;
}

export class Player implements PlayerBody {
	x: number;
	y: number;
	w = PLAYER_WIDTH;
	h = PLAYER_HEIGHT;
	vx = 0;
	vy = 0;
	onGround = true;
	facing: 1 | -1 = 1;
	animTime = 0;
	moving = false;
	featherFall = false;

	private coyote = 0;
	private jumpBuffer = 0;
	private wasOnGround = false;
	private launchTimer = 0;

	constructor(spawn: { x: number; y: number }) {
		this.x = spawn.x;
		this.y = spawn.y;
	}

	get centerX(): number {
		return this.x + this.w / 2;
	}

	get centerY(): number {
		return this.y + this.h / 2;
	}

	reset(spawn: { x: number; y: number }): void {
		this.x = spawn.x;
		this.y = spawn.y;
		this.vx = 0;
		this.vy = 0;
		this.onGround = true;
		this.facing = 1;
		this.animTime = 0;
		this.moving = false;
		this.featherFall = false;
		this.coyote = 0;
		this.jumpBuffer = 0;
		this.wasOnGround = false;
		this.launchTimer = 0;
	}

	launch(velocity: number, duration = 0.45): void {
		this.vy = velocity;
		this.launchTimer = Math.max(this.launchTimer, duration);
		this.onGround = false;
	}

	suppressJumpCut(duration = 0.12): void {
		this.launchTimer = Math.max(this.launchTimer, duration);
	}

	update(dt: number, input: Input, level: LevelData, events: PlayerEvents = {}): void {
		const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
		const acceleration = this.onGround ? ACCELERATION_GROUND : ACCELERATION_AIR;
		const friction = this.onGround ? FRICTION_GROUND : FRICTION_AIR;
		const wantSpeed = direction * MOVE_SPEED;

		if (direction !== 0) {
			this.vx = approach(this.vx, wantSpeed, acceleration * dt);
			this.facing = direction > 0 ? 1 : -1;
		} else {
			this.vx = approach(this.vx, 0, friction * dt);
		}

		if (input.consumeJump()) {
			this.jumpBuffer = JUMP_BUFFER_TIME;
		} else {
			this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
		}

		if (this.onGround) {
			this.coyote = COYOTE_TIME;
		} else {
			this.coyote = Math.max(0, this.coyote - dt);
		}

		if (this.jumpBuffer > 0 && this.coyote > 0) {
			this.vy = JUMP_VELOCITY;
			this.onGround = false;
			this.coyote = 0;
			this.jumpBuffer = 0;
			events.onJump?.();
		}

		this.launchTimer = Math.max(0, this.launchTimer - dt);
		if (this.launchTimer <= 0 && !input.jumpHeld && this.vy < -260) {
			this.vy = -260;
		}

		this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL_SPEED);
		if (this.featherFall && this.vy > 150) {
			this.vy = 150;
		}

		const result = movePlayer(this, [...level.platforms, ...level.movingPlatforms], dt);
		if (result.landed && !this.wasOnGround) {
			events.onLand?.();
		}
		this.wasOnGround = this.onGround;

		if (this.x < 0) {
			this.x = 0;
			if (this.vx < 0) this.vx = 0;
		}
		if (this.x + this.w > level.width) {
			this.x = level.width - this.w;
			if (this.vx > 0) this.vx = 0;
		}

		this.moving = this.onGround && Math.abs(this.vx) > 18;
		this.animTime += dt * (this.onGround ? (this.moving ? 10 : 2.2) : 4);
	}
}
