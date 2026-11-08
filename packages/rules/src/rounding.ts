// Rounding conventions. See ROUNDING.md for where each comes from.

/** To the penny, half up. */
export function round2(n: number): number {
	return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Down to a whole pound. */
export function floorPound(n: number): number {
	return Math.floor(n + 1e-9);
}

/** Up to a whole pound. */
export function ceilPound(n: number): number {
	return Math.ceil(n - 1e-9);
}

export function clamp(n: number, lo: number, hi: number): number {
	return Math.min(Math.max(n, lo), hi);
}
