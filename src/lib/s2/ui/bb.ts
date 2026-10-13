/**
 * Blitz3D string and number semantics used by the interface code. The
 * implementations live in src/lib/s2/blitz.ts; this module keeps the
 * interface code's import names and adds the Unicode <-> game byte string
 * conversion that only the browser side needs.
 */
export {
	Asc,
	BlitzRuntimeError,
	Chr,
	Instr,
	LSet,
	Left,
	Len,
	Lower,
	Mid,
	Replace,
	Right,
	RuntimeError,
	Trim,
	Upper,
	idiv,
	imod,
	ntrim,
	trimspace,
	atoi as IntS,
	floatToInt as bbInt
} from '../blitz';

/** Bytes 0x80..0x9F of Windows-1252 as Unicode, for text leaving the game (clipboard). */
const CP1252_HIGH =
	'€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

/** Game byte string to Unicode. */
export function fromGameString(s: string): string {
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i) & 255;
		out += c >= 0x80 && c <= 0x9f ? CP1252_HIGH[c - 0x80] : String.fromCharCode(c);
	}
	return out;
}

/** Unicode to game byte string; characters outside Windows-1252 become '?'. */
export function toGameString(s: string): string {
	let out = '';
	for (const ch of s) {
		const c = ch.codePointAt(0)!;
		if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out += ch;
		else {
			const i = CP1252_HIGH.indexOf(ch);
			out += i >= 0 ? String.fromCharCode(0x80 + i) : '?';
		}
	}
	return out;
}
