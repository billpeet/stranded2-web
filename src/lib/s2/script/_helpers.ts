/**
 * Blitz3D runtime helpers the script interpreter uses. They all live in
 * src/lib/s2/blitz.ts; this module only keeps the interpreter's import
 * names.
 *
 * Strings are latin1-decoded: one JS char per original byte.
 */
export {
	BlitzRnd,
	Cos,
	Float,
	Instr,
	Int,
	Left,
	Mid,
	Replace,
	Right,
	Sin,
	Tan,
	asc,
	code,
	f32,
	fstr,
	istr,
	trimexquote,
	trimtext,
	floatToInt as f2i
} from '../blitz';
