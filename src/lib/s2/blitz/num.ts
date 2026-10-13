/**
 * Blitz3D numeric semantics: conversions, integer and float operators,
 * implicit coercion. Verified against the Blitz3D source
 * (github.com/blitz-research/blitz3d):
 *
 *  - compiler/exprnode.cpp      CastNode, UniExprNode, BinExprNode,
 *                               ArithExprNode, RelExprNode (typing + folding)
 *  - compiler/codegen_x86/codegen_x86.cpp   the instructions that are emitted
 *  - compiler/parser.cpp        precedence, Not, Int/Float/Str casts
 *  - compiler/stmtnode.cpp      If/While/For
 *  - bbruntime/basic.cpp        _bbStrToInt, _bbStrFromFloat, _bbMod, ...
 *  - stdutil/stdutil.cpp        itoa/atoi/atof/ftoa
 *  - bbruntime_dll/bbruntime_dll.cpp  FPU control word, exception translation
 *
 * ## The FPU
 *
 * Runtime::execute() runs the program under
 * `_control87(_RC_NEAR|_PC_24|<all exceptions masked>)`:
 *
 *  - precision control is 24 bit, so every x87 add/sub/mul/div/sqrt result is
 *    rounded to a float32 mantissa. A Blitz float expression therefore equals
 *    the same expression with Math.fround() around every single operation
 *    (use fadd/fsub/fmul/fdiv or f32 by hand).
 *  - rounding is to nearest/even, which is what `fistp` (Float -> Int) uses.
 *  - division by zero, overflow and invalid operations do not trap: they give
 *    Infinity / NaN.
 *
 * `fild` (Int -> Float) is exact; the value is only rounded by the next
 * operation or store. Passing the unrounded integer into fadd()/fmul() is
 * therefore closer to the original than rounding it first, though the two
 * only differ for |n| > 2^24.
 *
 * ## Typing rules (exprnode.cpp)
 *
 *  - arithmetic: a String operand makes it a String (only `+` is legal and
 *    concatenates, the other side is converted with Str). Otherwise `^` or a
 *    Float operand makes it Float. Otherwise Int.
 *  - comparison: String if either side is a String (the number is converted
 *    to a string, *not* the string to a number: 1.0 = "1" is false because
 *    "1.0" <> "1"), else Float if either is Float, else Int. Result is Int 0/1.
 *  - And Or Xor Shl Shr Sar: both sides are cast to Int (Float by rounding,
 *    String by atoi) and the operation is bitwise. There is no short circuit.
 *  - `Not x` is parsed as `x = 0` with x's own type (so Not 0.4 is 0, and
 *    Not "abc" compares "abc" with "0" and gives 0).
 *  - If/While/Until conditions are cast to Int: `If 0.4` is false (rounds to
 *    0), `If "abc"` is false, `If "1x"` is true.
 *  - assignment, arguments and Return cast to the declared type.
 *
 * Precedence, loosest first: Not; And Or Xor; = < > <= >= <>; + -;
 * Shl Shr Sar; * / Mod; ^; unary (+ - ~ Abs Sgn Int Float Str Before After
 * Handle Object). All binary operators associate to the left, and unary minus
 * binds tighter than `^`: -2^2 is 4.
 *
 * Constant expressions are folded by the compiler with the same C operators,
 * except integer division (see idivConst).
 *
 * ## For loops (stmtnode.cpp ForNode)
 *
 *     var = from : Goto cond
 *     loop: body : var = var + step
 *     cond: If Not (var > to) Goto loop      ; `<` when step is not > 0
 *
 * `to` is re-evaluated on every pass, `step` must be constant and is cast to
 * the variable's type (an Int variable with Step 0.5 gets step 0 and never
 * ends for from <= to). A Float variable accumulates with float32 additions,
 * see forFloat().
 *
 * ## Defaults
 *
 * Every variable, array element and Type field starts as 0, 0.0, "" or Null
 * (Node::createVars, _bbDimArray, _bbObjNew). `Return` without a value
 * returns the same. An undeclared identifier is an Int local.
 */
import { BlitzRuntimeError } from './errors';

// ---------------------------------------------------------------- floats

/** Rounds to single precision: the result of any Blitz float operation or store. */
export const f32: (x: number) => number = Math.fround;

/** a# + b#, a# - b#, a# * b#, a# / b# as one x87 instruction under 24 bit precision. */
export const fadd = (a: number, b: number): number => Math.fround(a + b);
export const fsub = (a: number, b: number): number => Math.fround(a - b);
export const fmul = (a: number, b: number): number => Math.fround(a * b);
/** Float division: x/0 is +-Infinity, 0/0 is NaN (exceptions are masked). */
export const fdiv = (a: number, b: number): number => Math.fround(a / b);
export const fneg = (a: number): number => Math.fround(-a);

/** Float Mod: _bbFMod = (float)fmod(x,y). Sign of the dividend; fmod(x,0) is NaN. */
export function fmod(a: number, b: number): number {
	return Math.fround(a % b);
}

/**
 * a ^ b: always a Float operation, _bbFPow = (float)pow(x,y), both operands
 * cast to Float first. 2^3 is 8.0, and an Int receiving it rounds.
 */
export function fpow(a: number, b: number): number {
	return Math.fround(Math.pow(Math.fround(a), Math.fround(b)));
}

/** Abs(x#): _bbFAbs, `n>=0 ? n : -n` (NaN and -0.0 are negated). */
export function fabs(n: number): number {
	n = Math.fround(n);
	return n >= 0 ? n : -n;
}

/** Sgn(x#): _bbFSgn, a Float -1, 0 or 1 (0 for NaN). */
export function fsgn(n: number): number {
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

// ---------------------------------------------------------------- float -> int

/**
 * Float -> Int as the compiler emits it (IR_CAST: `fistp [esp]`, and the
 * same instruction in FloatConstNode::intValue for constants): round to
 * nearest, ties to even. Int(2.5)=2, Int(3.5)=4, Int(-2.5)=-2, Int(-2.7)=-3.
 *
 * NaN and results outside the Int range give the x87 "integer indefinite"
 * $80000000 (-2147483648), because the invalid-operation exception is masked.
 *
 * This is every implicit conversion too: `i% = f#`, a Float passed to an Int
 * parameter, `If f#`, `f# And 1`, a Float array index.
 */
export function floatToInt(x: number): number {
	if (x !== x) return -2147483648;
	const f = Math.floor(x);
	const d = x - f;
	let r: number;
	if (d < 0.5) r = f;
	else if (d > 0.5) r = f + 1;
	else r = f % 2 === 0 ? f : f + 1;
	if (!(r >= -2147483648 && r <= 2147483647)) return -2147483648;
	return r | 0; // also turns -0 into 0
}

/**
 * The C cast `int(x)` the runtime itself uses in a few places (bbRand):
 * MSVC _ftol, truncation toward zero. Not what Blitz code gets from Int().
 */
export function ftol(x: number): number {
	if (x !== x) return -2147483648;
	const r = Math.trunc(x);
	if (!(r >= -2147483648 && r <= 2147483647)) return -2147483648;
	return r | 0;
}

// ---------------------------------------------------------------- strings <-> numbers

const isSpace = (c: number): boolean => c === 32 || (c >= 9 && c <= 13);

/**
 * String -> Int: _bbStrToInt = C atoi(). MSVC's atoi skips isspace()
 * characters (space, \t \n \v \f \r), takes an optional sign and then decimal
 * digits, accumulating `total = 10*total + digit` in a 32 bit int without any
 * overflow check, so long digit strings wrap. No digits: 0.
 */
export function atoi(s: string): number {
	let i = 0;
	const n = s.length;
	while (i < n && isSpace(s.charCodeAt(i))) i++;
	let neg = false;
	const c = s.charCodeAt(i);
	if (c === 45 || c === 43) {
		neg = c === 45;
		i++;
	}
	let total = 0;
	for (; i < n; i++) {
		const d = s.charCodeAt(i) - 48;
		if (d < 0 || d > 9) break;
		total = (Math.imul(total, 10) + d) | 0;
	}
	return neg ? -total | 0 : total;
}

/**
 * String -> Float: _bbStrToFloat = (float)atof(). MSVC's atof skips
 * whitespace and reads [sign] digits [. digits] [(e|E|d|D) [sign] digits];
 * at least one digit is needed, an exponent marker without digits is ignored.
 * It knows no "inf", "nan" or hex forms. The double is then rounded to float.
 */
export function atof(s: string): number {
	const m = /^[ \t\n\v\f\r]*([+-]?(?:\d+\.?\d*|\.\d+))(?:[eEdD]([+-]?\d+))?/.exec(s);
	if (!m) return 0;
	return Math.fround(parseFloat(m[2] !== undefined ? m[1] + 'e' + m[2] : m[1]));
}

/** Int -> String: _bbStrFromInt = itoa(n, buf, 10). */
export function itoa(n: number): string {
	return String(n | 0);
}

/**
 * Float -> String: ftoa() in stdutil.cpp ("By FLOYD").
 *
 *     t = _ecvt(n, 6, &dec, &sign)            // 6 significant digits
 *     if (dec <= -3 || dec > 8) { _gcvt(n, 6, buffer); return buffer; }
 *     ...insert the decimal point, keep at least one decimal, strip zeroes
 *
 * `dec` is the decimal exponent + 1 after rounding to 6 digits. So values
 * that round to at least 0.001 and less than 1e8 print plainly with six
 * significant digits ("0.001", "1234570.0", "3.14159"), everything else in
 * MSVCRT _gcvt layout: "%.5e" with the zeroes before the 'e' removed, which
 * leaves the decimal point dangling and a three digit exponent: "1.e+008",
 * "1.23457e+008", "1.e-004", "-2.5e-005".
 *
 * Non-finite values: "NaN" (never signed), "Infinity", "-Infinity".
 * Zero is "0.0"; negative zero takes the sign _ecvt reports, "-0.0".
 *
 * _ecvt rounds half up on the decimal expansion, which is what
 * Number.prototype.toExponential does for an exact tie (1000005 -> "1000010.0").
 */
export function ftoa(x: number): string {
	const n = Math.fround(x);
	if (n !== n) return 'NaN';
	if (n === Infinity) return 'Infinity';
	if (n === -Infinity) return '-Infinity';
	const digits = 6;
	const sign = n < 0 || Object.is(n, -0);
	const a = Math.abs(n);
	let t: string;
	let dec: number;
	if (a === 0) {
		t = '000000';
		dec = 0;
	} else {
		const e = a.toExponential(digits - 1); // d.ddddde[+-]x
		const k = e.indexOf('e');
		t = e[0] + e.substring(2, k);
		dec = parseInt(e.substring(k + 1), 10) + 1;
	}
	if (dec <= -3 || dec > 8) {
		const frac = t.substring(1).replace(/0+$/, '');
		const ex = dec - 1;
		const es = (ex < 0 ? '-' : '+') + String(Math.abs(ex)).padStart(3, '0');
		return (sign ? '-' : '') + t[0] + '.' + frac + 'e' + es;
	}
	if (dec <= 0) {
		t = '0.' + '0'.repeat(-dec) + t;
		dec = 1;
	} else if (dec < digits) {
		t = t.substring(0, dec) + '.' + t.substring(dec);
	} else {
		t = t + '0'.repeat(dec - digits) + '.0';
		dec += dec - digits;
	}
	const dp1 = dec + 1;
	let p = t.length;
	while (--p > dp1 && t[p] === '0');
	t = t.substring(0, p + 1);
	return sign ? '-' + t : t;
}

/** The names the script interpreter uses for the two conversions. */
export const istr = itoa;
export const fstr = ftoa;

/**
 * Int(x): the cast operator. A number is taken to be a Float and rounded
 * (floatToInt; an Int passes through unchanged), a string goes through atoi.
 */
export function Int(x: number | string): number {
	return typeof x === 'string' ? atoi(x) : floatToInt(x);
}

/** Float(x): a number is rounded to single precision, a string goes through atof. */
export function Float(x: number | string): number {
	return typeof x === 'string' ? atof(x) : Math.fround(x);
}

/**
 * Str(x). JavaScript cannot tell an Int from a Float, so say which one the
 * Blitz expression was: Str(3) is "3" but Str(3.0) is "3.0".
 */
export function Str(x: number | string, type: 'int' | 'float' = 'int'): string {
	if (typeof x === 'string') return x;
	return type === 'float' ? ftoa(x) : itoa(x);
}

// ---------------------------------------------------------------- integers

/** Int +, -, *, unary -: 32 bit two's complement wraparound (add/sub/imul/neg). */
export const iadd = (a: number, b: number): number => (a + b) | 0;
export const isub = (a: number, b: number): number => (a - b) | 0;
export const imul = (a: number, b: number): number => Math.imul(a, b);
export const ineg = (a: number): number => -a | 0;

/**
 * Int / Int with a divisor that is not a compile-time constant power of two:
 * `cdq : idiv ecx`, truncating toward zero (-7/2 = -3).
 *
 * Division by zero raises EXCEPTION_INT_DIVIDE_BY_ZERO, which the runtime
 * turns into the fatal "Integer divide by zero". $80000000 / -1 overflows
 * the idiv instruction and ends as "Unknown runtime exception".
 */
export function idiv(a: number, b: number): number {
	a |= 0;
	b |= 0;
	if (b === 0) throw new BlitzRuntimeError('Integer divide by zero');
	if (a === -2147483648 && b === -1) throw new BlitzRuntimeError('Unknown runtime exception');
	return Math.trunc(a / b) | 0;
}

/**
 * Int / constant, where the divisor is a literal or a Const in the source.
 *
 * Codegen_x86::munchArith replaces a division by a constant power of two
 * (1, 2, 4, ... and $80000000) with `sar`, an arithmetic shift. That rounds
 * toward minus infinity instead of toward zero:
 *
 *     x = -7 : Print x/2     ; -4  (sar)
 *     y = 2  : Print x/y     ; -3  (idiv)
 *     Print -7/2             ; -3  (folded by the compiler with C division)
 *     Print x/3              ; -2  (idiv, 3 is not a power of two)
 *
 * Use this wherever the original divides a possibly negative Int variable
 * by 2, 4, 8, ... written as a constant; idiv() otherwise. For non-negative
 * dividends the two agree.
 */
export function idivConst(a: number, c: number): number {
	c |= 0;
	if (c !== 0 && (c & (c - 1)) === 0) return (a | 0) >> (31 - Math.clz32(c));
	return idiv(a, c);
}

/**
 * Int Mod Int: _bbMod = C `x % y` (idiv): the result has the sign of the
 * dividend (-7 Mod 3 = -1, 7 Mod -3 = 1). Mod 0 is the fatal
 * "Integer divide by zero"; $80000000 Mod -1 faults like the division.
 */
export function imod(a: number, b: number): number {
	a |= 0;
	b |= 0;
	if (b === 0) throw new BlitzRuntimeError('Integer divide by zero');
	if (a === -2147483648 && b === -1) throw new BlitzRuntimeError('Unknown runtime exception');
	return (a % b) | 0;
}

/**
 * Shl / Shr / Sar: x86 `shl`, `shr` (logical) and `sar` (arithmetic). The
 * CPU masks the count to 5 bits, as JavaScript does: 1 Shl 32 = 1,
 * -1 Shr 28 = 15, -16 Sar 2 = -4.
 */
export const Shl = (a: number, n: number): number => a << n;
export const Shr = (a: number, n: number): number => (a >>> n) | 0;
export const Sar = (a: number, n: number): number => a >> n;

/** And / Or / Xor / ~ are bitwise on Ints (operands are cast to Int first). */
export const And = (a: number, b: number): number => a & b;
export const Or = (a: number, b: number): number => a | b;
export const Xor = (a: number, b: number): number => a ^ b;
/** ~x is parsed as x Xor -1. */
export const BitNot = (a: number): number => ~a;

/** Not x for an Int or Float x: `x = 0`, giving 1 or 0. (NaN = 0 is "true" in Blitz, see feq.) */
export const Not = (x: number): number => (x === 0 || x !== x ? 1 : 0);

/** Abs(n%): _bbAbs, `n>=0 ? n : -n`; Abs($80000000) stays $80000000. */
export function Abs(n: number): number {
	n |= 0;
	return n >= 0 ? n : -n | 0;
}

/** Sgn(n%): _bbSgn, -1, 0 or 1. */
export function Sgn(n: number): number {
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

// ---------------------------------------------------------------- comparisons

/**
 * Float comparisons as emitted by Codegen_x86::munchFPRelop:
 * `fucompp : fnstsw ax : sahf : setXX`. For ordinary numbers these are the
 * usual comparisons. With a NaN operand the flags come out "unordered"
 * (ZF=PF=CF=1) and nothing checks PF, so:
 *
 *     NaN = x   is 1        NaN <> x  is 0
 *     a > b, a >= b are 1   a < b, a <= b are 0     (either operand NaN)
 *
 * The last line holds for the usual evaluation order (left operand first,
 * which the code generator picks unless the right operand needs more
 * registers); with the operands evaluated the other way round `<`/`<=` are 1
 * and `>`/`>=` are 0.
 */
const unordered = (a: number, b: number): boolean => a !== a || b !== b;
export const feq = (a: number, b: number): number => (a === b || unordered(a, b) ? 1 : 0);
export const fne = (a: number, b: number): number => (a !== b && !unordered(a, b) ? 1 : 0);
export const flt = (a: number, b: number): number => (a < b ? 1 : 0);
export const fle = (a: number, b: number): number => (a <= b ? 1 : 0);
export const fgt = (a: number, b: number): number => (a > b || unordered(a, b) ? 1 : 0);
export const fge = (a: number, b: number): number => (a >= b || unordered(a, b) ? 1 : 0);

/**
 * String comparison: _bbStrCompare = std::string::compare, i.e. memcmp on
 * the bytes (unsigned, so "ä" > "z"; case sensitive, "B" < "a") and then the
 * shorter string first. Returns <0, 0 or >0. For byte strings this is the
 * JavaScript string order.
 */
export function strCompare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------- implicit coercion

export type BBType = 'int' | 'float' | 'string';
export type RelOp = '=' | '<>' | '<' | '>' | '<=' | '>=';

/** CastNode: converts a value of type `from` to type `to` the way the compiler does. */
export function castTo(v: number | string, from: BBType, to: BBType): number | string {
	if (from === to) return from === 'float' ? Math.fround(v as number) : v;
	if (to === 'int') return from === 'float' ? floatToInt(v as number) : atoi(v as string);
	if (to === 'float') return from === 'int' ? Math.fround(v as number) : atof(v as string);
	return from === 'int' ? itoa(v as number) : ftoa(v as number);
}

/** The type a comparison of two operands is carried out in (RelExprNode::semant). */
export function relType(a: BBType, b: BBType): BBType {
	if (a === 'string' || b === 'string') return 'string';
	if (a === 'float' || b === 'float') return 'float';
	return 'int';
}

/**
 * The type of `a op b` for + - * / Mod ^ (ArithExprNode::semant). With a
 * String operand only `+` compiles ("Operator cannot be applied to strings").
 */
export function arithType(op: string, a: BBType, b: BBType): BBType {
	if (a === 'string' || b === 'string') return 'string';
	if (op === '^' || a === 'float' || b === 'float') return 'float';
	return 'int';
}

/** `l op r` for operands of the given static types; 1 or 0. */
export function compare(op: RelOp, l: number | string, lt: BBType, r: number | string, rt: BBType): number {
	const t = relType(lt, rt);
	const a = castTo(l, lt, t);
	const b = castTo(r, rt, t);
	if (t === 'float') {
		const x = a as number;
		const y = b as number;
		switch (op) {
			case '=':
				return feq(x, y);
			case '<>':
				return fne(x, y);
			case '<':
				return flt(x, y);
			case '>':
				return fgt(x, y);
			case '<=':
				return fle(x, y);
			default:
				return fge(x, y);
		}
	}
	switch (op) {
		case '=':
			return a === b ? 1 : 0;
		case '<>':
			return a !== b ? 1 : 0;
		case '<':
			return a < b ? 1 : 0;
		case '>':
			return a > b ? 1 : 0;
		case '<=':
			return a <= b ? 1 : 0;
		default:
			return a >= b ? 1 : 0;
	}
}

/** `l + r` when at least one side is a String: both are converted with Str and joined. */
export function concat(l: number | string, lt: BBType, r: number | string, rt: BBType): string {
	return (castTo(l, lt, 'string') as string) + (castTo(r, rt, 'string') as string);
}

/** The Int a condition (If/While/Until, And/Or operand) sees for a value of the given type. */
export function truth(v: number | string, t: BBType): boolean {
	return (castTo(v, t, 'int') as number) !== 0;
}

/**
 * The values a `For v# = from To to Step step` loop body sees, for a
 * constant `to`. The variable is advanced with float32 additions and the
 * loop runs while Not (v > to) (Not (v < to) when step is not positive), so
 * the count is whatever the accumulated float32 sum gives, not (to-from)/step.
 */
export function* forFloat(from: number, to: number, step: number): Generator<number> {
	step = Math.fround(step);
	to = Math.fround(to);
	let v = Math.fround(from);
	const up = step > 0;
	for (;;) {
		if (up ? fgt(v, to) : flt(v, to)) return;
		yield v;
		v = Math.fround(v + step);
	}
}
