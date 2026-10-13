/**
 * Blitz3D string functions: bbruntime/bbstring.cpp.
 *
 * Strings are byte strings (std::string). The port keeps one JavaScript
 * char per byte, char codes 0..255 (Windows-1252 / Latin-1), which is how
 * the Vfs decodes game files. Positions are 1-based.
 *
 * ## Out-of-range arguments are fatal
 *
 *     #define CHKPOS(x) if( (x)<0 ) RTEX( "parameter must be positive" );
 *     #define CHKOFF(x) if( (x)<=0 ) RTEX( "parameter must be greater than 0" );
 *
 * RTEX throws unconditionally, release builds included. The shipped
 * StrandedII.exe has exactly this code (bbLeft at file offset 0x38020:
 * `test eax,eax : jge ok : ... call __CxxThrowException`; bbMid at 0x38420
 * with `jg`). So Left$(s,-1), Right$(s,-1), LSet/RSet with a negative size,
 * Mid$(s,0) and Instr(s,t,0) end the game with an error box; they do not
 * clamp. The functions here throw BlitzRuntimeError with the same text.
 */
import { BlitzRuntimeError } from './errors';

function chkpos(n: number): void {
	if (n < 0) throw new BlitzRuntimeError('parameter must be positive');
}
function chkoff(n: number): void {
	if (n <= 0) throw new BlitzRuntimeError('parameter must be greater than 0');
}

/** Len(s) */
export function Len(s: string): number {
	return s.length;
}

/** Left$(s,n): the first n characters, the whole string when n >= Len. n<0 is fatal. */
export function Left(s: string, n: number): string {
	chkpos(n);
	return s.substring(0, n);
}

/** Right$(s,n): the last n characters, the whole string when n >= Len. n<0 is fatal. */
export function Right(s: string, n: number): string {
	chkpos(n);
	n = s.length - n;
	if (n < 0) n = 0;
	return s.substring(n);
}

/**
 * Mid$(s,start,count=-1): from 1-based `start`; a start past the end gives
 * "". Any negative count means "to the end", a count of 0 gives "".
 * start<=0 is fatal.
 */
export function Mid(s: string, start: number, count = -1): string {
	chkoff(start);
	let o = start - 1;
	if (o > s.length) o = s.length;
	return count >= 0 ? s.substring(o, o + count) : s.substring(o);
}

/**
 * Instr(s,find,from=1): 1-based position of the first match at or after
 * `from`, 0 when there is none or `from` is past the end. An empty `find`
 * matches at `from` itself as long as from <= Len+1. from<=0 is fatal.
 */
export function Instr(s: string, find: string, from = 1): number {
	chkoff(from);
	const f = from - 1;
	if (f > s.length) return 0;
	const n = s.indexOf(find, f);
	return n < 0 ? 0 : n + 1;
}

/**
 * Replace$(s,from,to): every non-overlapping occurrence, scanning left to
 * right and never rescanning inserted text.
 *
 * An empty `from` on a non-empty string never terminates in the original
 * (find("") matches at every position and the loop either stalls or keeps
 * inserting). The port cannot hang usefully and returns s unchanged.
 */
export function Replace(s: string, from: string, to: string): string {
	if (from === '') return s;
	return s.split(from).join(to);
}

/**
 * Upper$/Lower$: C toupper()/tolower() in the "C" locale, which only map
 * the ASCII letters. Umlauts and other bytes >= 0x80 are left alone.
 */
export function Upper(s: string): string {
	return s.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32));
}
export function Lower(s: string): string {
	return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * Bytes >= 0x80 that Trim$ keeps. See Trim.
 */
const TRIM_GRAPHIC_HIGH = new Set([
	0x80, 0x82, 0x84, 0x86, 0x88, 0x8a, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x92, 0x98, 0xa7, 0xa8, 0xaf, 0xb0, 0xb8,
	0xf5, 0xf7, 0xf9, 0xfb, 0xfc, 0xfd, 0xfe
]);

/** What isgraph() answers for a byte inside bbTrim of the shipped runtime. */
export function isTrimGraphic(c: number): boolean {
	c &= 255;
	return c < 0x80 ? c > 32 && c < 127 : TRIM_GRAPHIC_HIGH.has(c);
}

/**
 * Trim$(s): strips from both ends every character isgraph() rejects.
 *
 *     while( n<s->size() && !isgraph( (*s)[n] ) ) ++n;
 *     while( p>n && !isgraph( (*s)[p-1] ) ) --p;
 *
 * For ASCII that is everything except 0x21..0x7E: spaces, tabs, CR/LF and
 * also all other control characters and DEL.
 *
 * Bytes >= 0x80 are passed as a negative `char`. The runtime's isgraph
 * (file offset 0x9dc6b of StrandedII.exe, called from bbTrim at 0x387e0) is the plain table lookup
 * `_pctype[c] & (_PUNCT|_ALPHA|_DIGIT)` (mask 0x117), so a negative index
 * reads the 16 bit words lying in front of the CRT's _ctype table. Those
 * are C-locale bookkeeping (lconv string pointers, CHAR_MAX fillers,
 * __mb_cur_max, the decimal point, the _pctype pointers) and are constant
 * for a module loaded at its preferred base 0x10000000. Evaluating the mask
 * over them gives the 25 "graphic" bytes in TRIM_GRAPHIC_HIGH; every other
 * high byte is stripped. In practice: Trim eats trailing/leading
 * ä ö Ä Ö Ü ß and the separators 0xA6 / 0xBF, but keeps ü (0xFC), § and °.
 * This is the "error with Umlaute" that functions.bb's ntrim$ works around.
 */
export function Trim(s: string): string {
	let n = 0;
	let p = s.length;
	while (n < p && !isTrimGraphic(s.charCodeAt(n))) ++n;
	while (p > n && !isTrimGraphic(s.charCodeAt(p - 1))) --p;
	return s.substring(n, p);
}

/** LSet$(s,n): exactly n characters, cut on the right or padded with spaces on the right. n<0 is fatal. */
export function LSet(s: string, n: number): string {
	chkpos(n);
	return s.length > n ? s.substring(0, n) : s.padEnd(n, ' ');
}

/** RSet$(s,n): exactly n characters, keeping the right end or padding with spaces on the left. n<0 is fatal. */
export function RSet(s: string, n: number): string {
	chkpos(n);
	return s.length > n ? s.substring(s.length - n) : s.padStart(n, ' ');
}

/** Chr$(n): one byte, `(char)n`, so only the low 8 bits count. Chr(0) is a one-character string. */
export function Chr(n: number): string {
	return String.fromCharCode(n & 255);
}

/** Asc(s): the first byte as 0..255, -1 for an empty string. */
export function Asc(s: string): number {
	return s.length ? s.charCodeAt(0) & 255 : -1;
}

/** Asc(Mid$(s,i,1)): the byte at 1-based position i, -1 past the end. i<=0 is fatal like Mid. */
export function asc(s: string, i: number): number {
	chkoff(i);
	return i <= s.length ? s.charCodeAt(i - 1) & 255 : -1;
}

/** Hex$(n): always 8 upper-case digits of the 32 bit value. */
export function Hex(n: number): string {
	return (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/** Bin$(n): always 32 binary digits. */
export function Bin(n: number): string {
	return (n >>> 0).toString(2).padStart(32, '0');
}

/** String$(s,n): s repeated n times; "" for n <= 0 (no error). */
function StringRepeat(s: string, n: number): string {
	return n > 0 ? s.repeat(n) : '';
}
export { StringRepeat, StringRepeat as String };
