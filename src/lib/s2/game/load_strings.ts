/**
 * includes/load_strings.bb: the string tables s$(), sm$(), se$() and ss$().
 * The implementation is ui/strings.ts; `G.s`, `G.sm`, `G.se` are the same arrays.
 *
 *     s$(21)                    s(21)
 *     ss$(sm$(48),set_moddir$)  ss(sm(48), G.set_moddir)
 */
import { RuntimeError } from '../blitz';
import { parse_strings } from '../ui/strings';
import { readFileLines } from './files';

export { s, se, sm, ss } from '../ui/strings';

/** Function load_strings() */
export async function load_strings(): Promise<void> {
	const lines = readFileLines('sys\\strings.inf');
	if (lines === null) RuntimeError('Unable to read sys\\strings.inf');
	parse_strings(lines);
}

/** Top-level code of load_strings.bb */
export const include_load_strings = load_strings;
