/**
 * includes/load_keynames.bb: in_keyname$(0..262) from sys/keys.inf
 * (implementation: ui/strings.ts).
 */
import { RuntimeError } from '../blitz';
import { parse_keynames } from '../ui/strings';
import { readFileLines } from './files';

/** Function load_keynames() */
export async function load_keynames(): Promise<void> {
	const lines = readFileLines('sys\\keys.inf');
	if (lines === null) RuntimeError('Unable to read sys\\keys.inf');
	parse_keynames(lines);
}

/** Top-level code of load_keynames.bb */
export const include_load_keynames = load_keynames;
