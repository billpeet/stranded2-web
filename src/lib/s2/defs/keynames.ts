import { Int } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream } from './_helpers';
import { DefinitionError } from './objects';

/**
 * Key names (sys/keys.inf). Ported from load_keynames() in
 * includes/load_keynames.bb.
 */

/** Indices of the named entries in in_keyname$ above the 0..255 scancodes. */
const NAMED_KEYS: Record<string, number> = {
	mouse1: 256,
	mouse2: 257,
	mouse3: 258,
	mouse4: 259,
	mouse5: 260,
	mwheelup: 261,
	mwheeldown: 262
};

/** in_keyname$(0..262): scancode names, then mouse buttons and wheel; entry 0 is "-". */
export async function loadKeynames(vfs: Vfs): Promise<string[]> {
	const in_keyname = new Array<string>(263).fill('');
	if (!vfs.exists('sys\\keys.inf')) throw new DefinitionError('Unable to read sys\\keys.inf');
	const stream = await InfStream.open(vfs, 'sys\\keys.inf');
	for (let p = stream.next(); p; p = stream.next()) {
		const { key, val } = p;
		if (key.length < 4) {
			if (Int(key) < 0 || Int(key) > 262) {
				throw new DefinitionError(
					`Invalid KEY ID '${key}' - value between 0 and 262 expected`
				);
			}
			in_keyname[Int(key)] = val;
		} else {
			if (!Object.hasOwn(NAMED_KEYS, key)) throw new DefinitionError(`Invalid KEY '${key}'`);
			in_keyname[NAMED_KEYS[key]] = val;
		}
	}
	in_keyname[0] = '-';
	return in_keyname;
}
