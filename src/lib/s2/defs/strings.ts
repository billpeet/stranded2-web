import { Int } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream } from './_helpers';
import { DefinitionError } from './objects';

/**
 * Interface texts (sys/strings.inf). Ported from load_strings() and ss$()
 * in includes/load_strings.bb.
 */

export interface Strings {
	/** s$(0..50): keys starting with "0" */
	s: string[];
	/** sm$(0..250): keys starting with "m", numbered by their last three characters */
	sm: string[];
	/** se$(0..300): keys starting with "e", numbered by their last three characters */
	se: string[];
}

export async function loadStrings(vfs: Vfs): Promise<Strings> {
	const out: Strings = {
		s: new Array<string>(51).fill(''),
		sm: new Array<string>(251).fill(''),
		se: new Array<string>(301).fill('')
	};
	if (!vfs.exists('sys\\strings.inf')) throw new DefinitionError('Unable to read sys\\strings.inf');
	const stream = await InfStream.open(vfs, 'sys\\strings.inf');

	const set = (table: string[], id: string, val: string) => {
		if (Int(id) < 0 || Int(id) > table.length - 1) {
			throw new DefinitionError(`Invalid String ID '${id}'`);
		}
		table[Int(id)] = val;
	};

	for (let p = stream.next(); p; p = stream.next()) {
		// The value is taken as it stands, without any trimming.
		const val = p.raw;
		switch (p.key.substring(0, 1)) {
			case '0':
				set(out.s, p.key, val);
				break;
			case 'm':
				set(out.sm, p.key.slice(-3), val);
				break;
			case 'e':
				set(out.se, p.key.slice(-3), val);
				break;
			default:
				throw new DefinitionError(`Invalid String ID '${p.key}'`);
		}
	}
	return out;
}

/** ss$(txt$,p1$,p2$,p3$): fills the $1, $2, $3 placeholders, in that order. */
export function ss(txt: string, p1 = '', p2 = '', p3 = ''): string {
	return txt.replaceAll('$1', () => p1).replaceAll('$2', () => p2).replaceAll('$3', () => p3);
}
