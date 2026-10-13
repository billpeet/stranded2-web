import { Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream } from './_helpers';
import { DefinitionError } from './objects';

/**
 * Light colour per hour (sys/lightcycle.inf). Ported from load_lightcycle()
 * in includes/load_lightcycle.bb.
 */

/**
 * Dlightcycle(0..24, 0..2): r,g,b for hours 0..23; row 24 is the original's
 * cache for the current colour and stays 0 here.
 */
export async function loadLightcycle(vfs: Vfs): Promise<number[][]> {
	const Dlightcycle = Array.from({ length: 25 }, () => [0, 0, 0]);
	if (!vfs.exists('sys\\lightcycle.inf')) {
		throw new DefinitionError('Unable to read sys\\lightcycle.inf');
	}
	const stream = await InfStream.open(vfs, 'sys\\lightcycle.inf');
	for (let p = stream.next(); p; p = stream.next()) {
		// A key that is not a number counts as hour 0, as Int() gives 0 for it.
		const varint = Int(p.key);
		if (varint >= 0 && varint <= 23) {
			const s = split(Trim(p.raw), ',', 2);
			Dlightcycle[varint] = [Int(Trim(s[0])), Int(Trim(s[1])), Int(Trim(s[2]))];
		} else {
			throw new DefinitionError(
				`Invalid lighcycle Property '${p.key}' - Use a number between 0 and 23`
			);
		}
	}
	return Dlightcycle;
}
