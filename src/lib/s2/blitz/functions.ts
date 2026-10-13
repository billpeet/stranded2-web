/**
 * The game's own generic helpers: includes/functions.bb. Each function is a
 * line-by-line port built on the Blitz primitives, quirks included.
 *
 * Not here because they need the engine (entities, graphics, sound, game
 * globals): pheight, drawaxes, play, darkbuffer, copy, paste, meshline,
 * incam, genmap, intime, indailytime, drawy, groundpitch, brightness,
 * viewline, cachedata, screenshot.
 */
import { atoi, f32, fpow, itoa } from './num';
import { Sqr } from './math';
import { Asc, Chr, Instr, Left, Len, Mid, Replace, Right } from './string';

/**
 * Characters the original uses as in-string separators (Windows-1252 code
 * points). The GitHub listing shows them re-encoded; these are the bytes
 * the binary contains.
 */
export const SEP_LINE = '¦'; // "Ś" in the listing: line separator inside scripts/descriptions
export const SEP_FIELD = '¿'; // "ż" in the listing: field separator in cached state strings

/**
 * cinstr(txt$,sign$): meant to count occurrences, but the loop is
 * `For i=1 To c` with c=0, so it never runs. Always 0.
 */
export function cinstr(_txt: string, _sign: string): number {
	return 0;
}

/**
 * split$(txt$, sign$=",", limit=10): fills the global splits$(limit) array
 * and returns... `limit` (as a string, the function is declared `$`). The
 * port returns the array, always limit+1 entries long.
 *
 *     For num=0 To limit
 *         p1=p2
 *         p2=Instr(txt$, sign$, p1+1)
 *         splits$(num)=Mid(txt$, p1+1, p2-(p1+1))
 *         If p2=0 Then Exit
 *     Next
 *
 * Text after separator number limit+1 is dropped. Only the first character
 * of a longer separator is skipped, the rest stays at the start of the next
 * entry. limit<=0 means Len(txt$).
 */
export function split(txt: string, sign = ',', limit = 10): string[] {
	if (limit <= 0) limit = Len(txt);
	const splits: string[] = new Array(limit + 1).fill('');
	let p1 = 0;
	let p2 = 0;
	for (let num = 0; num <= limit; num++) {
		p1 = p2;
		p2 = Instr(txt, sign, p1 + 1);
		splits[num] = Mid(txt, p1 + 1, p2 - (p1 + 1));
		if (p2 === 0) break;
	}
	return splits;
}

/** code$(txt$,key,mode=0): shift every byte by +key (mode 0) or -key, modulo 256, and reverse the string. */
export function code(txt: string, key: number, mode = 0): string {
	let out = '';
	for (let i = 1; i <= Len(txt); i++) {
		let char = Asc(Mid(txt, i, 1));
		char = mode === 0 ? char + key : char - key;
		char = ((char % 256) + 256) % 256; // the two While loops
		out = Chr(char) + out;
	}
	return out;
}

/** ntrim$(txt$): strips trailing spaces only ("because of error with Umlaute in normal trim functions"). */
export function ntrim(txt: string): string {
	while (Right(txt, 1) === ' ') txt = Left(txt, Len(txt) - 1);
	return txt;
}

/** stripext$(txt$): everything before the *first* dot. */
export function stripext(txt: string): string {
	const p = Instr(txt, '.');
	return p !== 0 ? Left(txt, p - 1) : txt;
}

/** extval#(val#,ext#): limits a non-negative value to at most ext, a negative one to at least ext. */
export function extval(val: number, ext: number): number {
	val = f32(val);
	ext = f32(ext);
	if (val >= 0) return val > ext ? ext : val;
	return val < ext ? ext : val;
}

/** path$(txt$): slashes become backslashes; the text up to and including the last backslash, or all of it when there is none. */
export function path(txt: string): string {
	txt = Replace(txt, '/', '\\');
	if (Instr(txt, '\\') === 0) return txt;
	for (let i = Len(txt); i >= 1; i--) {
		if (Mid(txt, i, 1) === '\\') return Left(txt, i);
	}
	return '';
}

/** strinv$(txt$): every byte b becomes 255-b. */
export function strinv(txt: string): string {
	let nt = '';
	for (let i = 1; i <= Len(txt); i++) nt += Chr(255 - Asc(Mid(txt, i, 1)));
	return nt;
}

/**
 * numsep$(txt$): groups the digits of a number string in threes from the
 * right. The separator is the language string s$(33) in the original, so it
 * is a parameter here. Negative numbers (Int(txt)<0) lose their first
 * character and get a "-" back in front.
 */
export function numsep(txt: string, sep: string): string {
	const group = (t: string): string => {
		const l = Len(t);
		if (l <= 3) return t;
		let c = 0;
		let n = '';
		for (let i = l; i >= 1; i--) {
			c++;
			n = Mid(t, i, 1) + n;
			if (c === 3) {
				if (i > 1) n = sep + n;
				c = 0;
			}
		}
		return n;
	};
	if (atoi(txt) >= 0) return group(txt);
	return '-' + group(Mid(txt, 2, -1));
}

/** dist#(x1#,z1#,x2#,z2#): Sqr((x1-x2)^2+(z1-z2)^2), all in single precision. */
export function dist(x1: number, z1: number, x2: number, z2: number): number {
	const a = fpow(f32(f32(x1) - f32(x2)), 2);
	const b = fpow(f32(f32(z1) - f32(z2)), 2);
	return Sqr(f32(a + b));
}

/** trimtext$(txt$): removes one double quote on the left and one on the right. */
export function trimtext(txt: string): string {
	if (Left(txt, 1) === '"') txt = Mid(txt, 2, -1);
	if (Right(txt, 1) === '"') txt = Left(txt, Len(txt) - 1);
	return txt;
}

/** zerofill$(txt$,fill): left-pads with "0" to `fill` characters. Callers pass Ints, which Blitz converts with Str. */
export function zerofill(txt: string | number, fill: number): string {
	let t = typeof txt === 'number' ? itoa(txt) : txt;
	while (Len(t) < fill) t = '0' + t;
	return t;
}

/**
 * getfilename$(path$): the file name without directory and extension, for
 * paths with at most one slash: the text between the first backslash and
 * the first dot after it.
 */
export function getfilename(p: string): string {
	p = Replace(p, '/', '\\');
	const slash = Instr(p, '\\');
	const dot = slash > 0 ? Instr(p, '.', slash) : Instr(p, '.');
	if (dot !== 0) {
		if (slash === 0) return Left(p, dot - 1);
		p = Left(p, dot - 1);
		return Mid(p, slash + 1, -1);
	}
	return slash === 0 ? p : Mid(p, slash + 1, -1);
}

/** trimexquote$(txt$): removes every space that is not inside double quotes. */
export function trimexquote(txt: string): string {
	let quo = 0;
	let out = '';
	for (let i = 1; i <= Len(txt); i++) {
		const s = Mid(txt, i, 1);
		if (s === '"') {
			quo = 1 - quo;
			out += '"';
		} else if (quo === 0) {
			if (s !== ' ') out += s;
		} else {
			out += s;
		}
	}
	return out;
}

/** trimspace$(txt$): strips leading and trailing spaces only; tabs and everything else survive. */
export function trimspace(txt: string): string {
	while (Left(txt, 1) === ' ') txt = Mid(txt, 2, -1);
	while (Right(txt, 1) === ' ') txt = Mid(txt, 1, Len(txt) - 1);
	return txt;
}

/**
 * reppart$(txt$,otxt$,start,ntxt$): replaces the Len(otxt$) characters at
 * 1-based `start` with ntxt$ (otxt$ only supplies the length).
 */
export function reppart(txt: string, otxt: string, start: number, ntxt: string): string {
	const lt = start <= 1 ? '' : Left(txt, start - 1);
	const rt = start + Len(otxt) - 1 >= Len(txt) ? '' : Mid(txt, start + Len(otxt), -1);
	return lt + ntxt + rt;
}
