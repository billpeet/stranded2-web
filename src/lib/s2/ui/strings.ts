/**
 * load_strings.bb and load_keynames.bb: the string tables s$(), sm$(), se$()
 * from sys\strings.inf and the key names from sys\keys.inf.
 */
import { readLines, type Vfs } from '../io/Vfs';
import { S } from '../input/state';
import { Instr, IntS, Left, Mid, Replace, Right, RuntimeError, Trim, trimspace } from './bb';

/** Dim s$(50), sm$(250), se$(300) */
export const strings = {
	s: new Array<string>(51).fill(''),
	sm: new Array<string>(251).fill(''),
	se: new Array<string>(301).fill('')
};

/** s$(i): loading messages */
export const s = (i: number): string => strings.s[i] ?? '';
/** sm$(i): GUI/menu strings */
export const sm = (i: number): string => strings.sm[i] ?? '';
/** se$(i): editor strings */
export const se = (i: number): string => strings.se[i] ?? '';

/** load_strings() from already-read lines. */
export function parse_strings(lines: string[]): void {
	for (const line of lines) {
		let equal = Instr(line, '=');
		if (Left(line, 1) === '#') equal = 0;
		if (equal > 0) {
			let v = Trim(Left(line, equal - 1));
			const val = Mid(line, equal + 1, -1);
			switch (Left(v, 1)) {
				case '0':
					if (IntS(v) < 0 || IntS(v) > 50) RuntimeError(`Invalid String ID '${v}'`);
					strings.s[IntS(v)] = val;
					break;
				case 'm':
					v = Right(v, 3);
					if (IntS(v) < 0 || IntS(v) > 250) RuntimeError(`Invalid String ID '${v}'`);
					strings.sm[IntS(v)] = val;
					break;
				case 'e':
					v = Right(v, 3);
					if (IntS(v) < 0 || IntS(v) > 300) RuntimeError(`Invalid String ID '${v}'`);
					strings.se[IntS(v)] = val;
					break;
				default:
					RuntimeError(`Invalid String ID '${v}'`);
			}
		}
	}
}

export async function load_strings(vfs: Vfs): Promise<void> {
	if (!vfs.exists('sys\\strings.inf')) RuntimeError('Unable to read sys\\strings.inf');
	parse_strings(await readLines(vfs, 'sys\\strings.inf'));
}

/** ss$(txt,p1,p2,p3): fill the $1..$3 placeholders. */
export function ss(txt: string, p1 = '', p2 = '', p3 = ''): string {
	txt = Replace(txt, '$1', p1);
	txt = Replace(txt, '$2', p2);
	txt = Replace(txt, '$3', p3);
	return txt;
}

/** load_keynames() from already-read lines: fills in_keyname$(0..262). */
export function parse_keynames(lines: string[]): void {
	for (const line of lines) {
		let equal = Instr(line, '=');
		if (Left(line, 1) === '#') equal = 0;
		if (equal > 0) {
			const v = Trim(Left(line, equal - 1));
			const val = trimspace(Mid(line, equal + 1, -1));
			if (v.length < 4) {
				if (IntS(v) < 0 || IntS(v) > 262) RuntimeError(`Invalid KEY ID '${v}' - value between 0 and 262 expected`);
				S.in_keyname[IntS(v)] = val;
			} else {
				switch (v) {
					case 'mouse1':
						S.in_keyname[256] = val;
						break;
					case 'mouse2':
						S.in_keyname[257] = val;
						break;
					case 'mouse3':
						S.in_keyname[258] = val;
						break;
					case 'mouse4':
						S.in_keyname[259] = val;
						break;
					case 'mouse5':
						S.in_keyname[260] = val;
						break;
					case 'mwheelup':
						S.in_keyname[261] = val;
						break;
					case 'mwheeldown':
						S.in_keyname[262] = val;
						break;
					default:
						RuntimeError(`Invalid KEY '${v}'`);
				}
			}
		}
	}
	S.in_keyname[0] = '-';
}

export async function load_keynames(vfs: Vfs): Promise<void> {
	if (!vfs.exists('sys\\keys.inf')) RuntimeError('Unable to read sys\\keys.inf');
	parse_keynames(await readLines(vfs, 'sys\\keys.inf'));
}
