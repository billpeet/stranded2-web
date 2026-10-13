/**
 * Blitz3D numeric semantics used by the environment code. The
 * implementations live in src/lib/s2/blitz.ts; this module keeps the
 * environment code's import names.
 */
import { BlitzRnd, blitzRnd, f32 } from '../../blitz';

export { Cos, Sin, fmod, idiv, floatToInt as blitzInt } from '../../blitz';

/**
 * Rnd/Rand for the environment code.
 *
 * Without an argument it draws from the program-wide Blitz generator
 * (blitzRnd), so sequences follow SeedRnd exactly as in the original. A
 * `next` function returning a number in [0,1) replaces the generator's raw
 * draw, for tests and replays; Rnd/Rand apply the same float32 arithmetic to
 * it either way.
 */
export class BlitzRandom extends BlitzRnd {
	constructor(public next?: () => number) {
		super();
	}

	override rnd(): number {
		return this.next ? f32(this.next()) : blitzRnd.rnd();
	}

	override SeedRnd(seed: number): void {
		blitzRnd.SeedRnd(seed);
	}

	override RndSeed(): number {
		return blitzRnd.RndSeed();
	}
}
