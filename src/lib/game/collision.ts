import type { Platform, PlayerBody, Rect } from "./types";

export interface MoveResult {
	landed: boolean;
	hitHead: boolean;
	hitWall: boolean;
}

export function overlaps(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
	const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
	const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
	const dx = cx - closestX;
	const dy = cy - closestY;
	return dx * dx + dy * dy <= radius * radius;
}

/**
 * Moves the player axis by axis and resolves collisions with platforms.
 * The previous position is used for the vertical test so a fast fall cannot
 * tunnel through a thin platform.
 */
export function movePlayer(
	player: PlayerBody,
	platforms: Platform[],
	dt: number
): MoveResult {
	const result: MoveResult = { landed: false, hitHead: false, hitWall: false };

	const bottomBeforeX = player.y + player.h;
	player.x += player.vx * dt;
	for (const platform of platforms) {
		if (!overlaps(player, platform)) continue;
		// If the player was above this platform at the start of the frame and is
		// falling, let the Y pass land them instead of treating the platform as
		// a wall. Without this, a fast landing can be pushed off the edge.
		if (player.vy >= 0 && bottomBeforeX <= platform.y + 2) continue;

		if (player.vx > 0) {
			player.x = platform.x - player.w;
		} else if (player.vx < 0) {
			player.x = platform.x + platform.w;
		} else {
			const pushRight = platform.x + platform.w - player.x;
			const pushLeft = player.x + player.w - platform.x;
			player.x += pushRight < pushLeft ? pushRight : -pushLeft;
		}
		player.vx = 0;
		result.hitWall = true;
	}

	const previousTop = player.y;
	const previousBottom = player.y + player.h;
	player.y += player.vy * dt;
	player.onGround = false;

	for (const platform of platforms) {
		if (!overlaps(player, platform)) continue;

		const wasAbove = previousBottom <= platform.y + 2;
		const wasBelow = previousTop >= platform.y + platform.h - 2;

		if (player.vy >= 0 && wasAbove) {
			player.y = platform.y - player.h;
			player.vy = 0;
			player.onGround = true;
			result.landed = true;
			continue;
		}

		if (player.vy < 0 && wasBelow) {
			player.y = platform.y + platform.h;
			player.vy = 0;
			result.hitHead = true;
			continue;
		}

		const overlapTop = player.y + player.h - platform.y;
		const overlapBottom = platform.y + platform.h - player.y;
		if (overlapTop <= overlapBottom) {
			player.y = platform.y - player.h;
			player.vy = 0;
			player.onGround = true;
			result.landed = true;
		} else {
			player.y = platform.y + platform.h;
			player.vy = 0;
			result.hitHead = true;
		}
	}

	return result;
}
