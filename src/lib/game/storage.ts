const PREFIX = "silent-toll";

function key(name: string): string {
	return `${PREFIX}-${name}`;
}

export function readNumber(name: string, fallback = 0): number {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key(name));
		if (raw === null) return fallback;
		const value = Number(raw);
		return Number.isFinite(value) && value >= 0 ? value : fallback;
	} catch {
		return fallback;
	}
}

export function writeNumber(name: string, value: number): boolean {
	if (typeof window === "undefined") return false;
	try {
		window.localStorage.setItem(key(name), String(value));
		return true;
	} catch {
		return false;
	}
}

export function readBool(name: string, fallback = false): boolean {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key(name));
		if (raw === "1") return true;
		if (raw === "0") return false;
		return fallback;
	} catch {
		return fallback;
	}
}

export function writeBool(name: string, value: boolean): boolean {
	if (typeof window === "undefined") return false;
	try {
		window.localStorage.setItem(key(name), value ? "1" : "0");
		return true;
	} catch {
		return false;
	}
}

export const STORAGE_KEYS = {
	bestScore: "best-score",
	bestTime: "best-time",
	muted: "muted"
} as const;
