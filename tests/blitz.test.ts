/**
 * Blitz3D language/runtime semantics (src/lib/s2/blitz.ts).
 *
 * Expected values come from reading the Blitz3D source
 * (github.com/blitz-research/blitz3d) and the C runtime calls it makes, not
 * from running the port. Numeric tables for the random generator and the
 * float32 maths were produced by an independent emulation of the C code
 * (explicit float32 rounding, C integer arithmetic).
 */
import { describe, expect, it } from 'vitest';
import * as B from '../src/lib/s2/blitz';
import { BinaryReader } from '../src/lib/s2/io/BinaryReader';
import { BinaryWriter } from '../src/lib/s2/io/BinaryWriter';

const f = Math.fround;
const INT_MIN = -2147483648;

describe('Float -> Int (fistp, round to nearest even)', () => {
	// compiler/codegen_x86: IR_CAST = "fistp [esp]"; runtime control word _RC_NEAR.
	const cases: [number, number][] = [
		[0.5, 0],
		[1.5, 2],
		[2.5, 2],
		[3.5, 4],
		[-0.5, 0],
		[-1.5, -2],
		[-2.5, -2],
		[-3.5, -4],
		[2.4, 2],
		[2.6, 3],
		[-2.4, -2],
		[-2.6, -3],
		[-2.7, -3],
		[-0.6, -1],
		[0.49999997, 0],
		[0.50000006, 1],
		[7, 7],
		[-7, -7],
		[2147483520, 2147483520], // largest float below 2^31
		[-2147483648, INT_MIN],
		// masked invalid operation: "integer indefinite"
		[2147483648, INT_MIN],
		[1e20, INT_MIN],
		[-1e20, INT_MIN],
		[Infinity, INT_MIN],
		[-Infinity, INT_MIN],
		[NaN, INT_MIN]
	];
	it.each(cases)('Int(%f) = %i', (x, want) => {
		expect(B.floatToInt(x)).toBe(want);
		expect(B.Int(x)).toBe(want);
	});
	it('never returns -0', () => {
		expect(Object.is(B.floatToInt(-0.2), 0)).toBe(true);
		expect(Object.is(B.floatToInt(-0), 0)).toBe(true);
	});
	it('the runtime-internal C cast truncates instead', () => {
		expect(B.ftol(2.9)).toBe(2);
		expect(B.ftol(-2.9)).toBe(-2);
	});
});

describe('String -> Int (atoi)', () => {
	const cases: [string, number][] = [
		['12', 12],
		[' 12abc', 12],
		['\t\r\n 7', 7],
		['abc', 0],
		['', 0],
		['-5', -5],
		['+5', 5],
		['- 5', 0], // no space allowed after the sign
		['--5', 0],
		['3.9', 3], // stops at the dot: no rounding
		['1e3', 1],
		['$FF', 0],
		['0x10', 0],
		['007', 7],
		['2147483647', 2147483647],
		// MSVC atoi accumulates in a 32 bit int without overflow check
		['2147483648', INT_MIN],
		['4294967296', 0],
		['4294967297', 1],
		['99999999999', 1215752191], // 99999999999 mod 2^32
		['-2147483649', 2147483647],
		['\u00a012', 0] // 0xA0 is not isspace() in the C locale
	];
	it.each(cases)('Int(%j) = %i', (s, want) => {
		expect(B.atoi(s)).toBe(want);
		expect(B.Int(s)).toBe(want);
	});
});

describe('String -> Float (atof, then rounded to float)', () => {
	const cases: [string, number][] = [
		['2.5', 2.5],
		['2.5x', 2.5],
		['.5', 0.5],
		['5.', 5],
		['-.25', -0.25],
		['+1.5', 1.5],
		['  3', 3],
		['', 0],
		['.', 0],
		['abc', 0],
		['e5', 0],
		['1e3', 1000],
		['1E-2', f(0.01)],
		['1e', 1], // exponent marker without digits is not consumed
		['1e+', 1],
		['1d2', 100], // MSVC accepts d/D as exponent letter
		['0.1', f(0.1)],
		['16777217', 16777216], // not representable as float
		['1e39', Infinity],
		['-1e39', -Infinity],
		['inf', 0],
		['nan', 0],
		['0x10', 0]
	];
	it.each(cases)('Float(%j) = %f', (s, want) => {
		expect(B.atof(s)).toBe(want);
		expect(B.Float(s)).toBe(want);
	});
	it('Float(number) rounds to single precision', () => {
		expect(B.Float(0.1)).toBe(f(0.1));
		expect(B.Float(3)).toBe(3);
	});
});

describe('Float -> String (ftoa in stdutil.cpp)', () => {
	// _ecvt(n,6): six significant digits, dec = exponent+1.
	// dec <= -3 or dec > 8 -> _gcvt(n,6): "%.5e" minus the zeroes before 'e'.
	const cases: [number, string][] = [
		[0, '0.0'],
		[-0, '-0.0'],
		[1, '1.0'],
		[-1, '-1.0'],
		[0.5, '0.5'],
		[-2.5, '-2.5'],
		[3, '3.0'],
		[100, '100.0'],
		[100000, '100000.0'],
		[123456, '123456.0'],
		[1234567, '1234570.0'], // seventh digit rounded away, zero-filled
		[12345678, '12345700.0'],
		[9999999, '10000000.0'], // rounds up to dec=8, still plain
		[16777216, '16777200.0'],
		[99999992, '1.e+008'], // largest float below 1e8 rounds to 1.00000e8: dec=9
		[1e8, '1.e+008'],
		[1e9, '1.e+009'],
		[-1e9, '-1.e+009'],
		[1.5e10, '1.5e+010'],
		[1.23456789e12, '1.23457e+012'],
		[3.4028234663852886e38, '3.40282e+038'],
		[3.14159274, '3.14159'],
		[0.1, '0.1'],
		[0.1 + 0.2, '0.3'],
		[1 / 3, '0.333333'],
		[2 / 3, '0.666667'],
		[123.456, '123.456'],
		[1234.5678, '1234.57'],
		[0.05, '0.05'],
		[0.03, '0.03'],
		[0.012345678, '0.0123457'],
		[0.001, '0.001'], // dec=-2: last plain decade
		[0.0001, '1.e-004'], // dec=-3
		[0.00099999, '9.9999e-004'],
		[0.00001, '1.e-005'],
		[0.000025, '2.5e-005'],
		[-0.000025, '-2.5e-005'],
		[1.401298464324817e-45, '1.4013e-045'], // smallest denormal
		// exact ties round half up (_ecvt works on the decimal digits)
		[1000005, '1000010.0'],
		[999999.5, '1000000.0'],
		[100000.5, '100001.0'],
		[1 / 0, 'Infinity'],
		[-1 / 0, '-Infinity'],
		[NaN, 'NaN'],
		[1e39, 'Infinity'] // overflows float
	];
	it.each(cases)('Str(%f) = %j', (x, want) => {
		expect(B.ftoa(x)).toBe(want);
	});
	it('Str of ints, and the explicit type switch', () => {
		expect(B.itoa(0)).toBe('0');
		expect(B.itoa(-17)).toBe('-17');
		expect(B.itoa(4294967295)).toBe('-1'); // wraps to signed 32 bit
		expect(B.itoa(INT_MIN)).toBe('-2147483648');
		expect(B.Str(3)).toBe('3');
		expect(B.Str(3, 'float')).toBe('3.0');
		expect(B.Str('x')).toBe('x');
		expect(B.istr).toBe(B.itoa);
		expect(B.fstr).toBe(B.ftoa);
	});
});

describe('float32 discipline (x87 precision control _PC_24)', () => {
	it('every operation rounds to single precision', () => {
		expect(B.fadd(0.1, 0.2)).toBe(0.30000001192092896);
		expect(B.fmul(f(0.1), 3)).toBe(0.30000001192092896);
		expect(B.fdiv(1, 3)).toBe(0.3333333432674408);
		expect(B.fsub(1, f(0.9))).toBe(f(1 - f(0.9)));
		expect(B.f32(16777217)).toBe(16777216);
	});
	it('float division by zero does not trap', () => {
		expect(B.fdiv(1, 0)).toBe(Infinity);
		expect(B.fdiv(-1, 0)).toBe(-Infinity);
		expect(B.fdiv(0, 0)).toBeNaN();
	});
	it('Float Mod is C fmod: sign of the dividend', () => {
		expect(B.fmod(7.5, 2)).toBe(1.5);
		expect(B.fmod(-7.5, 2)).toBe(-1.5);
		expect(B.fmod(7.5, -2)).toBe(1.5);
		expect(B.fmod(365, 360)).toBe(5);
		expect(B.fmod(1, 0)).toBeNaN();
	});
	it('^ is always a float pow', () => {
		expect(B.fpow(2, 3)).toBe(8);
		expect(B.fpow(2, 0.5)).toBe(1.4142135381698608);
		expect(B.fpow(10, -2)).toBe(0.009999999776482582);
		expect(B.fpow(-8, 1 / 3)).toBeNaN();
		expect(B.fpow(0, 0)).toBe(1);
	});
	it('Abs and Sgn for floats', () => {
		expect(B.fabs(-2.5)).toBe(2.5);
		expect(B.fabs(2.5)).toBe(2.5);
		expect(B.fsgn(-0.1)).toBe(-1);
		expect(B.fsgn(0)).toBe(0);
		expect(B.fsgn(12)).toBe(1);
	});
	it('a Float For loop accumulates rounding error', () => {
		// For f#=0 To 1 Step 0.1: the tenth addition gives 1.0000001 > 1, so 1.0 is never reached
		const seen = [...B.forFloat(0, 1, 0.1)];
		expect(seen.length).toBe(10);
		expect(seen[9]).toBe(0.9000000953674316);
		expect([...B.forFloat(3, 1, -1)]).toEqual([3, 2, 1]);
		expect([...B.forFloat(0, 1, 0.25)]).toEqual([0, 0.25, 0.5, 0.75, 1]);
		expect([...B.forFloat(2, 1, 1)]).toEqual([]);
	});
});

describe('integer operators', () => {
	it('+ - * wrap to 32 bits', () => {
		expect(B.iadd(2147483647, 1)).toBe(INT_MIN);
		expect(B.isub(INT_MIN, 1)).toBe(2147483647);
		expect(B.imul(65536, 65536)).toBe(0);
		expect(B.imul(123456789, 1000)).toBe(-1097262584); // 123456789000 mod 2^32, signed
		expect(B.imul(255, 0x1000000)).toBe(-16777216); // 255*$1000000: opaque alpha in an ARGB value
		expect(B.ineg(INT_MIN)).toBe(INT_MIN);
	});
	it.each([
		[7, 2, 3],
		[-7, 2, -3],
		[7, -2, -3],
		[-7, -2, 3],
		[1, 3, 0],
		[-1, 3, 0],
		[INT_MIN, 2, -1073741824]
	])('%i / %i = %i (idiv truncates toward zero)', (a, b, want) => {
		expect(B.idiv(a, b)).toBe(want);
		expect(Object.is(B.idiv(a, b), -0)).toBe(false);
	});
	it('integer division by zero is fatal', () => {
		// seTranslator: EXCEPTION_INT_DIVIDE_BY_ZERO -> "Integer divide by zero"
		expect(() => B.idiv(1, 0)).toThrow('Integer divide by zero');
		expect(() => B.imod(1, 0)).toThrow('Integer divide by zero');
		expect(() => B.idiv(1, 0)).toThrow(B.BlitzRuntimeError);
		// idiv overflow is a different exception code
		expect(() => B.idiv(INT_MIN, -1)).toThrow('Unknown runtime exception');
		expect(() => B.imod(INT_MIN, -1)).toThrow('Unknown runtime exception');
	});
	it.each([
		// Codegen_x86::munchArith: division by a constant power of two is "sar"
		[-7, 2, -4],
		[-1, 2, -1],
		[-8, 2, -4],
		[7, 2, 3],
		[-7, 4, -2],
		[-1, 256, -1],
		[-65536, 65536, -1],
		[-65537, 65536, -2],
		[5, 1, 5],
		[-5, 1, -5],
		// other constants use idiv
		[-7, 3, -2],
		[-7, -2, 3],
		[-7, 10, 0],
		[100, 7, 14]
	])('%i / constant %i = %i', (a, c, want) => {
		expect(B.idivConst(a, c)).toBe(want);
	});
	it('constant zero divisor still faults', () => {
		expect(() => B.idivConst(1, 0)).toThrow('Integer divide by zero');
	});
	it.each([
		[7, 3, 1],
		[-7, 3, -1],
		[7, -3, 1],
		[-7, -3, -1],
		[6, 3, 0],
		[-6, 3, 0],
		[5, 64, 5],
		[-5, 64, -5]
	])('%i Mod %i = %i (sign of the dividend)', (a, b, want) => {
		expect(B.imod(a, b)).toBe(want);
		expect(Object.is(B.imod(a, b), -0)).toBe(false);
	});
	it('Shl / Shr / Sar, count masked to 5 bits', () => {
		expect(B.Shl(1, 4)).toBe(16);
		expect(B.Shl(1, 31)).toBe(INT_MIN);
		expect(B.Shl(1, 32)).toBe(1);
		expect(B.Shl(3, 33)).toBe(6);
		expect(B.Shr(-1, 28)).toBe(15);
		expect(B.Shr(-1, 0)).toBe(-1);
		expect(B.Shr(INT_MIN, 31)).toBe(1);
		expect(B.Sar(-16, 2)).toBe(-4);
		expect(B.Sar(-1, 31)).toBe(-1);
		expect(B.Sar(16, 2)).toBe(4);
	});
	it('And / Or / Xor / ~ are bitwise, Not is "= 0"', () => {
		expect(B.And(6, 3)).toBe(2);
		expect(B.And(2, 1)).toBe(0); // "If a And b" with a=2, b=1 is false
		expect(B.Or(6, 3)).toBe(7);
		expect(B.Xor(6, 3)).toBe(5);
		expect(B.BitNot(0)).toBe(-1);
		expect(B.And(0xff0000, -1)).toBe(0xff0000);
		expect(B.Not(0)).toBe(1);
		expect(B.Not(5)).toBe(0);
		expect(B.Not(-1)).toBe(0);
		expect(B.Not(0.4)).toBe(0); // float compare with 0.0, no rounding
	});
	it('Abs and Sgn', () => {
		expect(B.Abs(-5)).toBe(5);
		expect(B.Abs(5)).toBe(5);
		expect(B.Abs(INT_MIN)).toBe(INT_MIN);
		expect(B.Sgn(-9)).toBe(-1);
		expect(B.Sgn(0)).toBe(0);
		expect(B.Sgn(9)).toBe(1);
	});
});

describe('comparisons and implicit coercion (exprnode.cpp)', () => {
	it('picks String over Float over Int', () => {
		expect(B.relType('int', 'int')).toBe('int');
		expect(B.relType('int', 'float')).toBe('float');
		expect(B.relType('float', 'string')).toBe('string');
		expect(B.arithType('+', 'int', 'int')).toBe('int');
		expect(B.arithType('/', 'int', 'float')).toBe('float');
		expect(B.arithType('^', 'int', 'int')).toBe('float');
		expect(B.arithType('+', 'int', 'string')).toBe('string');
	});
	it('casts like CastNode', () => {
		expect(B.castTo(2.5, 'float', 'int')).toBe(2);
		expect(B.castTo('12x', 'string', 'int')).toBe(12);
		expect(B.castTo('1.5x', 'string', 'float')).toBe(1.5);
		expect(B.castTo(3, 'int', 'string')).toBe('3');
		expect(B.castTo(3, 'float', 'string')).toBe('3.0');
		expect(B.castTo(16777217, 'int', 'float')).toBe(16777216);
	});
	it('a number compared with a string is compared as text', () => {
		expect(B.compare('=', 1, 'int', '1', 'string')).toBe(1);
		expect(B.compare('=', 1, 'float', '1', 'string')).toBe(0); // "1.0" <> "1"
		expect(B.compare('=', 1, 'float', '1.0', 'string')).toBe(1);
		expect(B.compare('<', 10, 'int', '9', 'string')).toBe(1); // "10" < "9"
		expect(B.compare('=', 0, 'int', '', 'string')).toBe(0); // "0" <> ""
		expect(B.compare('=', 1, 'int', ' 1', 'string')).toBe(0);
	});
	it('int against float compares as floats', () => {
		expect(B.compare('=', 0, 'int', 0.5, 'float')).toBe(0);
		expect(B.compare('<', 0, 'int', 0.5, 'float')).toBe(1);
		expect(B.compare('=', 16777217, 'int', 16777216, 'float')).toBe(1); // int rounded to float
		expect(B.compare('>=', 3, 'int', 3, 'float')).toBe(1);
		expect(B.compare('<>', 3, 'int', 4, 'int')).toBe(1);
		expect(B.compare('<=', 5, 'int', 4, 'int')).toBe(0);
	});
	it('NaN compares "equal" (fucompp/sahf without a parity check)', () => {
		expect(B.feq(NaN, 1)).toBe(1);
		expect(B.fne(NaN, 1)).toBe(0);
		expect(B.fgt(NaN, 1)).toBe(1);
		expect(B.fge(1, NaN)).toBe(1);
		expect(B.flt(NaN, 1)).toBe(0);
		expect(B.fle(NaN, 1)).toBe(0);
		expect(B.feq(1, 1)).toBe(1);
		expect(B.feq(1, 2)).toBe(0);
		expect(B.fne(1, 2)).toBe(1);
		expect(B.Not(NaN)).toBe(1);
	});
	it('strings compare bytewise, case sensitive, shorter first', () => {
		expect(B.strCompare('abc', 'abd')).toBeLessThan(0);
		expect(B.strCompare('B', 'a')).toBeLessThan(0);
		expect(B.strCompare('ab', 'abc')).toBeLessThan(0);
		expect(B.strCompare('abc', 'abc')).toBe(0);
		expect(B.strCompare('\u00e4', 'z')).toBeGreaterThan(0); // unsigned bytes
		expect(B.compare('<', 'Zebra', 'string', 'apple', 'string')).toBe(1);
	});
	it('+ with a string concatenates', () => {
		expect(B.concat('n=', 'string', 3, 'int')).toBe('n=3');
		expect(B.concat('f=', 'string', 1.5, 'float')).toBe('f=1.5');
		expect(B.concat(2, 'float', 'x', 'string')).toBe('2.0x');
		expect(B.concat(1, 'int', '2', 'string')).toBe('12');
	});
	it('conditions cast to Int', () => {
		expect(B.truth(0.4, 'float')).toBe(false); // rounds to 0
		expect(B.truth(0.5, 'float')).toBe(false); // ties to even
		expect(B.truth(0.6, 'float')).toBe(true);
		expect(B.truth(-0.6, 'float')).toBe(true);
		expect(B.truth('abc', 'string')).toBe(false);
		expect(B.truth('1x', 'string')).toBe(true);
		expect(B.truth('0', 'string')).toBe(false);
		expect(B.truth(-3, 'int')).toBe(true);
	});
});

describe('maths in degrees, float32 (bbmath.cpp)', () => {
	it('uses float conversion constants', () => {
		expect(B.DTOR).toBe(0.01745329238474369);
		expect(B.RTOD).toBe(57.295780181884766);
		expect(B.Pi).toBe(3.1415927410125732);
	});
	// (float)sin(n*dtor) with n*dtor rounded to float first
	const trig: [number, number, number][] = [
		[0, 0, 1],
		[30, 0.5, 0.8660253882408142],
		[45, 0.7071067690849304, 0.7071067690849304],
		[60, 0.866025447845459, 0.4999999701976776],
		[90, 1, -4.371138828673793e-8],
		[180, -8.742277657347586e-8, -1],
		[270, -1, 1.1924880638503055e-8],
		[360, 1.7484555314695172e-7, 1],
		[-90, -1, -4.371138828673793e-8],
		[11.25, 0.19509032368659973, 0.9807852506637573]
	];
	it.each(trig)('Sin/Cos(%f)', (deg, s, c) => {
		expect(B.Sin(deg)).toBe(s);
		expect(B.Cos(deg)).toBe(c);
	});
	it('Sin(180) prints the way Blitz prints it', () => {
		expect(B.ftoa(B.Sin(180))).toBe('-8.74228e-008');
		expect(B.ftoa(B.Cos(90))).toBe('-4.37114e-008');
	});
	it('Tan', () => {
		expect(B.Tan(0)).toBe(0);
		expect(B.Tan(45)).toBe(1);
		expect(B.Tan(30)).toBe(0.5773502588272095);
		expect(B.Tan(90)).toBe(-22877332); // not infinite: 90*dtor is not pi/2
	});
	it('inverse functions return degrees', () => {
		expect(B.ASin(0)).toBe(0);
		expect(B.ASin(1)).toBe(90);
		expect(B.ASin(-1)).toBe(-90);
		expect(B.ASin(0.5)).toBe(30.000001907348633); // (float)asin(0.5) * rtod in single precision
		expect(B.ACos(1)).toBe(0);
		expect(B.ACos(0)).toBe(90);
		expect(B.ACos(-1)).toBe(180);
		expect(B.ATan(1)).toBe(45);
		expect(B.ATan(-1)).toBe(-45);
		expect(B.ASin(2)).toBeNaN();
		expect(B.ACos(-1.5)).toBeNaN();
	});
	it.each([
		[1, 1, 45],
		[1, 0, 90],
		[0, -1, 180],
		[-1, 0, -90],
		[-1, -1, -135],
		[0, 0, 0],
		[0, 1, 0]
	])('ATan2(%i,%i) = %i', (y, x, want) => {
		expect(B.ATan2(y, x)).toBe(want);
	});
	it('Sqr Floor Ceil Exp Log Log10', () => {
		expect(B.Sqr(16)).toBe(4);
		expect(B.Sqr(2)).toBe(1.4142135381698608);
		expect(B.Sqr(-1)).toBeNaN();
		expect(B.Floor(2.7)).toBe(2);
		expect(B.Floor(-2.1)).toBe(-3);
		expect(B.Floor(-0.5)).toBe(-1);
		expect(B.Ceil(2.1)).toBe(3);
		expect(B.Ceil(-2.7)).toBe(-2);
		expect(B.Exp(0)).toBe(1);
		expect(B.Exp(1)).toBe(2.7182817459106445);
		expect(B.Log(1)).toBe(0);
		expect(B.Log(10)).toBe(2.3025851249694824);
		expect(B.Log(0)).toBe(-Infinity);
		expect(B.Log(-1)).toBeNaN();
		expect(B.Log10(1000)).toBe(3);
	});
});

describe('Rnd / Rand / SeedRnd / RndSeed (bbmath.cpp)', () => {
	it('starts from seed $1234 and steps as a=48271 Park-Miller', () => {
		const r = new B.BlitzRnd();
		expect(r.RndSeed()).toBe(0x1234);
		const states: number[] = [];
		for (let i = 0; i < 5; i++) {
			r.rnd();
			states.push(r.RndSeed());
		}
		// 48271*4660 = 224942860, ...
		expect(states).toEqual([224942860, 539475828, 650989866, 1951098782, 1446483090]);
	});
	it('rnd() uses only the low 16 bits: (state & 65535 + 0.5) / 65536', () => {
		const r = new B.BlitzRnd();
		expect(r.rnd()).toBe(((224942860 & 65535) + 0.5) / 65536);
		expect(r.rnd()).toBeGreaterThan(0);
	});
	it('Rand sequence for the default seed', () => {
		const r = new B.BlitzRnd();
		expect(Array.from({ length: 10 }, () => r.Rand(1, 6))).toEqual([3, 5, 2, 3, 4, 5, 4, 1, 1, 4]);
	});
	it('Rnd sequence for the default seed', () => {
		const r = new B.BlitzRnd();
		expect(Array.from({ length: 5 }, () => r.Rnd(0, 1))).toEqual([
			0.35565948486328125, 0.7478713989257812, 0.31705474853515625, 0.40476226806640625, 0.5803604125976562
		]);
	});
	it('sequences for SeedRnd 42', () => {
		const r = new B.BlitzRnd();
		r.SeedRnd(42);
		expect(Array.from({ length: 8 }, () => r.Rand(100))).toEqual([94, 42, 14, 37, 85, 69, 57, 44]);
		r.SeedRnd(42);
		expect(Array.from({ length: 4 }, () => r.Rnd(-5, 5))).toEqual([
			4.3540191650390625, -0.8167266845703125, -3.6881256103515625, -1.3025665283203125
		]);
	});
	it('mixed calls for SeedRnd 2008, including reversed and defaulted bounds', () => {
		const r = new B.BlitzRnd();
		r.SeedRnd(2008);
		expect(Array.from({ length: 6 }, () => r.Rand(0, 255))).toEqual([1, 85, 81, 51, 169, 236]);
		expect(r.Rnd(1.1, 1.2)).toBe(1.1435097455978394); // float32 arithmetic on float32 bounds
		expect(r.Rand(5, 1)).toBe(2); // bounds swapped
		expect(r.Rnd(360)).toBe(96.19903564453125); // Rnd(x) is x..0
	});
	it('negative ranges', () => {
		const r = new B.BlitzRnd();
		r.SeedRnd(7);
		expect(Array.from({ length: 5 }, () => r.Rand(-150, 150))).toEqual([-104, -29, 107, -82, 92]);
	});
	it('SeedRnd masks the sign bit and maps 0 to 1', () => {
		const r = new B.BlitzRnd();
		r.SeedRnd(0);
		expect(r.RndSeed()).toBe(1);
		r.SeedRnd(0x80000005 | 0);
		expect(r.RndSeed()).toBe(5);
		r.SeedRnd(1);
		r.rnd();
		expect(r.RndSeed()).toBe(48271);
		r.rnd();
		expect(r.RndSeed()).toBe(182605794);
	});
	it('SeedRnd -1 ($7FFFFFFF = the modulus) kills the generator', () => {
		// 48271*(m mod q) - 3399*(m/q) = 0, and 0 stays 0
		const r = new B.BlitzRnd();
		r.SeedRnd(-1);
		expect(r.RndSeed()).toBe(2147483647);
		expect(r.rnd()).toBe(0.5 / 65536);
		expect(r.rnd()).toBe(0.5 / 65536);
		expect(r.RndSeed()).toBe(0);
		expect(r.Rand(1, 6)).toBe(1);
	});
	it('the free functions share one program-wide generator', () => {
		B.SeedRnd(42);
		const a = [B.Rand(100), B.Rand(100)];
		expect(a).toEqual([94, 42]);
		expect(B.RndSeed()).toBe(B.blitzRnd.state);
		B.SeedRnd(0x1234);
		expect(B.Rand(1, 6)).toBe(3);
	});
});

describe('strings (bbstring.cpp)', () => {
	it('Len', () => {
		expect(B.Len('')).toBe(0);
		expect(B.Len('h\u00e4')).toBe(2);
	});
	it.each([
		['hello', 2, 'he'],
		['hello', 0, ''],
		['hello', 5, 'hello'],
		['hello', 99, 'hello'],
		['', 3, '']
	])('Left(%j,%i) = %j', (s, n, want) => expect(B.Left(s, n)).toBe(want));
	it.each([
		['hello', 2, 'lo'],
		['hello', 0, ''],
		['hello', 5, 'hello'],
		['hello', 99, 'hello'],
		['', 3, '']
	])('Right(%j,%i) = %j', (s, n, want) => expect(B.Right(s, n)).toBe(want));
	it.each([
		['hello', 2, 3, 'ell'],
		['hello', 1, -1, 'hello'],
		['hello', 4, -1, 'lo'],
		['hello', 2, -5, 'ello'], // any negative count: rest of the string
		['hello', 2, 0, ''],
		['hello', 2, 99, 'ello'],
		['hello', 5, 1, 'o'],
		['hello', 6, 1, ''], // one past the end
		['hello', 9, -1, ''],
		['', 1, -1, '']
	])('Mid(%j,%i,%i) = %j', (s, o, n, want) => expect(B.Mid(s, o, n)).toBe(want));
	it('Mid count defaults to -1', () => expect(B.Mid('hello', 3)).toBe('llo'));
	it.each([
		['a$b$c', '$', 1, 2],
		['a$b$c', '$', 2, 2],
		['a$b$c', '$', 3, 4],
		['a$b$c', '$', 5, 0],
		['abc', 'x', 1, 0],
		['abc', 'abc', 1, 1],
		['abc', 'abcd', 1, 0],
		['abc', 'c', 3, 3],
		['abc', 'c', 4, 0],
		['abc', 'c', 99, 0],
		['', 'a', 1, 0],
		// std::string::find with an empty needle matches at the start offset
		['abc', '', 1, 1],
		['abc', '', 3, 3],
		['abc', '', 4, 4],
		['abc', '', 5, 0],
		['', '', 1, 1],
		['aBc', 'b', 1, 0] // case sensitive
	])('Instr(%j,%j,%i) = %i', (s, t, from, want) => expect(B.Instr(s, t, from)).toBe(want));
	it('Instr from defaults to 1', () => expect(B.Instr('hello', 'l')).toBe(3));
	it('negative sizes and non-positive positions are fatal, as in the shipped runtime', () => {
		// CHKPOS / CHKOFF -> RTEX, which throws in release builds too
		expect(() => B.Left('abc', -1)).toThrow('parameter must be positive');
		expect(() => B.Right('abc', -1)).toThrow('parameter must be positive');
		expect(() => B.LSet('abc', -1)).toThrow('parameter must be positive');
		expect(() => B.RSet('abc', -1)).toThrow('parameter must be positive');
		expect(() => B.Mid('abc', 0)).toThrow('parameter must be greater than 0');
		expect(() => B.Mid('abc', -3, 2)).toThrow('parameter must be greater than 0');
		expect(() => B.Instr('abc', 'a', 0)).toThrow('parameter must be greater than 0');
		expect(() => B.Left('abc', -1)).toThrow(B.BlitzRuntimeError);
	});
	it.each([
		['a   b', '   ', '\t', 'a\tb'],
		['aaa', 'a', 'b', 'bbb'],
		['aaa', 'aa', 'b', 'ba'], // non-overlapping, left to right
		['aaaa', 'aa', 'a', 'aa'], // inserted text is not rescanned
		['abc', 'b', '', 'ac'],
		['abc', 'x', 'y', 'abc'],
		['a/b/c', '/', '\\', 'a\\b\\c'],
		['abc', 'B', 'x', 'abc'], // case sensitive
		['', 'a', 'b', ''],
		['ab', 'ab', 'abab', 'abab']
	])('Replace(%j,%j,%j) = %j', (s, a, b, want) => expect(B.Replace(s, a, b)).toBe(want));
	it('Upper/Lower only touch ASCII letters (C locale)', () => {
		expect(B.Upper('abc xyz 123')).toBe('ABC XYZ 123');
		expect(B.Lower('ABC XYZ 123')).toBe('abc xyz 123');
		expect(B.Upper('\u00e4\u00f6\u00fc\u00df')).toBe('\u00e4\u00f6\u00fc\u00df');
		expect(B.Lower('\u00c4\u00d6\u00dc')).toBe('\u00c4\u00d6\u00dc');
		expect(B.Upper('{z}')).toBe('{Z}');
	});
	it.each([
		['  \tab c\r\n', 'ab c'],
		['ab', 'ab'],
		['', ''],
		['   ', ''],
		['\x01\x02ab\x7f\x1f', 'ab'], // isgraph: control characters and DEL go too
		['a\tb', 'a\tb'], // only the ends
		['\x00ab\x00', 'ab'],
		// bytes >= 0x80: only the 25 values the runtime's table lookup happens to accept survive
		['\u00e4ab\u00f6', 'ab'], // ä ö are stripped: "error with Umlaute"
		['\u00c4\u00d6\u00dcab\u00df', 'ab'],
		['\u00fcab\u00fc', '\u00fcab\u00fc'], // ü (0xFC) is kept
		['ab\u00a6', 'ab'], // the game's line separator
		['ab\u00bf', 'ab'], // the game's field separator
		['\u00a7 1 \u00b0', '\u00a7 1 \u00b0'], // § and ° are kept
		['\u00ffab', 'ab'], // 0xFF is index -1, the EOF entry
		['x\u00e4y', 'x\u00e4y'],
		['\u0080ab\u0081', '\u0080ab']
	])('Trim(%j) = %j', (s, want) => expect(B.Trim(s)).toBe(want));
	it('Trim keeps exactly 25 high bytes', () => {
		const kept: number[] = [];
		for (let c = 0x80; c < 0x100; c++) if (B.Trim(String.fromCharCode(c)) !== '') kept.push(c);
		expect(kept).toEqual([
			0x80, 0x82, 0x84, 0x86, 0x88, 0x8a, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x92, 0x98, 0xa7, 0xa8, 0xaf, 0xb0,
			0xb8, 0xf5, 0xf7, 0xf9, 0xfb, 0xfc, 0xfd, 0xfe
		]);
		const low: number[] = [];
		for (let c = 0; c < 0x80; c++) if (B.Trim(String.fromCharCode(c)) !== '') low.push(c);
		expect(low.length).toBe(94); // 0x21..0x7E
		expect(low[0]).toBe(0x21);
		expect(low[93]).toBe(0x7e);
	});
	it('LSet / RSet', () => {
		expect(B.LSet('abc', 2)).toBe('ab');
		expect(B.LSet('abc', 5)).toBe('abc  ');
		expect(B.LSet('abc', 3)).toBe('abc');
		expect(B.LSet('abc', 0)).toBe('');
		expect(B.RSet('abc', 2)).toBe('bc');
		expect(B.RSet('abc', 5)).toBe('  abc');
		expect(B.RSet('abc', 3)).toBe('abc');
		expect(B.RSet('abc', 0)).toBe('');
	});
	it('Chr / Asc', () => {
		expect(B.Chr(65)).toBe('A');
		expect(B.Chr(256 + 65)).toBe('A'); // (char)n
		expect(B.Chr(-1)).toBe('\u00ff');
		expect(B.Chr(0).length).toBe(1);
		expect(B.Asc('A')).toBe(65);
		expect(B.Asc('AB')).toBe(65);
		expect(B.Asc('')).toBe(-1);
		expect(B.Asc('\u00e4')).toBe(228); // & 255, never negative
		expect(B.Asc(B.Chr(200))).toBe(200);
		expect(B.asc('abc', 2)).toBe(98);
		expect(B.asc('abc', 4)).toBe(-1); // Asc(Mid(s,4,1)) = Asc("")
	});
	it('Hex / Bin are fixed width', () => {
		expect(B.Hex(255)).toBe('000000FF');
		expect(B.Hex(0)).toBe('00000000');
		expect(B.Hex(-1)).toBe('FFFFFFFF');
		expect(B.Hex(0x12abcdef)).toBe('12ABCDEF');
		expect(B.Bin(5)).toBe('00000000000000000000000000000101');
		expect(B.Bin(-1)).toBe('1'.repeat(32));
		expect(B.Bin(INT_MIN)).toBe('1' + '0'.repeat(31));
	});
	it('String$', () => {
		expect(B.String('ab', 3)).toBe('ababab');
		expect(B.String('ab', 0)).toBe('');
		expect(B.String('ab', -2)).toBe(''); // while( n-->0 ): no error
		expect(B.StringRepeat('-', 4)).toBe('----');
	});
});

describe('time and date', () => {
	it('CurrentDate is strftime "%d %b %Y", CurrentTime "%H:%M:%S"', () => {
		const d = new Date(2008, 2, 5, 9, 7, 3);
		expect(B.CurrentDate(d)).toBe('05 Mar 2008');
		expect(B.CurrentTime(d)).toBe('09:07:03');
		const e = new Date(2026, 11, 31, 23, 59, 0);
		expect(B.CurrentDate(e)).toBe('31 Dec 2026');
		expect(B.CurrentTime(e)).toBe('23:59:00');
		expect(B.CurrentDate()).toMatch(/^\d\d [A-Z][a-z]{2} \d{4}$/);
		expect(B.CurrentTime()).toMatch(/^\d\d:\d\d:\d\d$/);
	});
	it('MilliSecs is an Int and wraps like timeGetTime', () => {
		B.setClock(() => 1234.9);
		expect(B.MilliSecs()).toBe(1234);
		B.setClock(() => 2147483648 + 5);
		expect(B.MilliSecs()).toBe(-2147483643);
		B.setClock(() => 4294967296 + 7);
		expect(B.MilliSecs()).toBe(7);
		B.setClock(() => Date.now());
	});
});

describe('banks (bbbank.cpp)', () => {
	it('are zero-filled and little-endian', () => {
		const b = B.CreateBank(8);
		expect(B.BankSize(b)).toBe(8);
		expect(B.PeekInt(b, 0)).toBe(0);
		B.PokeInt(b, 0, 0x12345678);
		expect([B.PeekByte(b, 0), B.PeekByte(b, 1), B.PeekByte(b, 2), B.PeekByte(b, 3)]).toEqual([0x78, 0x56, 0x34, 0x12]);
		expect(B.PeekShort(b, 0)).toBe(0x5678);
		expect(B.PeekShort(b, 2)).toBe(0x1234);
		expect(B.CreateBank().size).toBe(0);
	});
	it('Peek is unsigned for bytes and shorts, signed for ints', () => {
		const b = B.CreateBank(4);
		B.PokeInt(b, 0, -1);
		expect(B.PeekByte(b, 0)).toBe(255);
		expect(B.PeekShort(b, 0)).toBe(65535);
		expect(B.PeekInt(b, 0)).toBe(-1);
	});
	it('Poke stores the low bits', () => {
		const b = B.CreateBank(4);
		B.PokeByte(b, 0, 0x1ff);
		B.PokeByte(b, 1, -1);
		B.PokeShort(b, 2, 0x12345);
		expect(B.PeekByte(b, 0)).toBe(255);
		expect(B.PeekByte(b, 1)).toBe(255);
		expect(B.PeekShort(b, 2)).toBe(0x2345);
	});
	it('floats are IEEE singles', () => {
		const b = B.CreateBank(4);
		B.PokeFloat(b, 0, 1.5);
		expect(B.PeekInt(b, 0)).toBe(0x3fc00000);
		B.PokeFloat(b, 0, 0.1);
		expect(B.PeekFloat(b, 0)).toBe(f(0.1));
	});
	it('ResizeBank keeps the contents and zero-fills growth', () => {
		const b = B.CreateBank(4);
		B.PokeInt(b, 0, 0x01020304);
		B.ResizeBank(b, 8);
		expect(B.BankSize(b)).toBe(8);
		expect(B.PeekInt(b, 0)).toBe(0x01020304);
		expect(B.PeekInt(b, 4)).toBe(0);
		B.ResizeBank(b, 2);
		expect(B.BankSize(b)).toBe(2);
		B.ResizeBank(b, 4);
		expect(B.PeekInt(b, 0)).toBe(0x0304); // the cut-off bytes come back as zero
	});
	it('CopyBank between banks and overlapping within one (memmove)', () => {
		const a = B.CreateBank(8);
		for (let i = 0; i < 8; i++) B.PokeByte(a, i, i + 1);
		const b = B.CreateBank(8);
		B.CopyBank(a, 2, b, 4, 3);
		expect(Array.from(b.data)).toEqual([0, 0, 0, 0, 3, 4, 5, 0]);
		B.CopyBank(a, 0, a, 2, 6);
		expect(Array.from(a.data)).toEqual([1, 2, 1, 2, 3, 4, 5, 6]);
	});
	it('out-of-range offsets throw instead of corrupting memory', () => {
		const b = B.CreateBank(4);
		expect(() => B.PeekInt(b, 1)).toThrow('Offset out of range');
		expect(() => B.PokeByte(b, 4, 0)).toThrow('Offset out of range');
		expect(() => B.PeekByte(b, -1)).toThrow('Offset out of range');
	});
});

describe('stream encodings (bbstream.cpp)', () => {
	it('writes the bytes Blitz writes', () => {
		const w = new BinaryWriter(2);
		w.byte(0x1ff).short(0x12345).int(-2).float(1.5).string('ab').line('x').line('');
		expect(Array.from(w.toUint8Array())).toEqual([
			0xff, // WriteByte: low 8 bits
			0x45,
			0x23, // WriteShort: low 16 bits, little-endian
			0xfe,
			0xff,
			0xff,
			0xff, // WriteInt
			0x00,
			0x00,
			0xc0,
			0x3f, // WriteFloat 1.5
			0x02,
			0x00,
			0x00,
			0x00,
			0x61,
			0x62, // WriteString: length + bytes
			0x78,
			0x0d,
			0x0a, // WriteLine: bytes + CR LF
			0x0d,
			0x0a
		]);
		expect(w.length).toBe(22);
	});
	it('round-trips through BinaryReader', () => {
		const w = new BinaryWriter();
		w.int(-123456).float(0.1).short(65535).byte(200).string('h\u00e4llo').line('line \u00a6 one').string('').int(7);
		const r = new BinaryReader(w.toUint8Array());
		expect(r.int()).toBe(-123456);
		expect(r.float()).toBe(f(0.1));
		expect(r.short()).toBe(65535); // ReadShort is unsigned
		expect(r.byte()).toBe(200);
		expect(r.string()).toBe('h\u00e4llo');
		expect(r.line()).toBe('line \u00a6 one');
		expect(r.string()).toBe('');
		expect(r.eof()).toBe(false);
		expect(r.int()).toBe(7);
		expect(r.eof()).toBe(true);
	});
	it('text is one byte per char', () => {
		const w = new BinaryWriter();
		w.line('\u00e4\u0141'); // 0x141 & 255 = 0x41
		expect(Array.from(w.toUint8Array())).toEqual([0xe4, 0x41, 0x0d, 0x0a]);
	});
	it('seek overwrites in place', () => {
		const w = new BinaryWriter();
		w.int(0).int(5);
		w.seek(0).int(99);
		expect(w.length).toBe(8);
		expect(w.pos).toBe(4);
		const r = new BinaryReader(w.toUint8Array());
		expect([r.int(), r.int()]).toEqual([99, 5]);
	});
	it('bytes and cstring', () => {
		const w = new BinaryWriter();
		w.bytes(Uint8Array.of(1, 2)).cstring('ok');
		expect(Array.from(w.toUint8Array())).toEqual([1, 2, 0x6f, 0x6b, 0]);
	});
});

describe('TypeList (Type objects, basic.cpp)', () => {
	interface T {
		id: number;
	}
	const make = (n: number) => {
		const list = new B.TypeList<T>();
		const objs: T[] = [];
		for (let i = 1; i <= n; i++) objs.push(list.add({ id: i }));
		return { list, objs };
	};
	const ids = (l: B.TypeList<T>) => l.toArray().map((o) => o.id);

	it('New appends; First/Last/After/Before walk the list', () => {
		const { list, objs } = make(3);
		expect(ids(list)).toEqual([1, 2, 3]);
		expect(list.count).toBe(3);
		expect(list.first()).toBe(objs[0]);
		expect(list.last()).toBe(objs[2]);
		expect(list.after(objs[0])).toBe(objs[1]);
		expect(list.after(objs[2])).toBeNull();
		expect(list.before(objs[1])).toBe(objs[0]);
		expect(list.before(objs[0])).toBeNull();
		const empty = new B.TypeList<T>();
		expect(empty.first()).toBeNull();
		expect(empty.last()).toBeNull();
		expect([...empty]).toEqual([]);
	});
	it('For Each visits in list order', () => {
		const { list } = make(4);
		expect([...list.each()].map((o) => o.id)).toEqual([1, 2, 3, 4]);
		expect([...list].map((o) => o.id)).toEqual([1, 2, 3, 4]);
	});
	it('deleting the current object inside For Each keeps the loop going', () => {
		// "For Txc.Txc=Each Txc : Delete Txc : Next" in functions.bb cachedata()
		const { list } = make(5);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			list.delete(o);
		}
		expect(seen).toEqual([1, 2, 3, 4, 5]);
		expect(list.count).toBe(0);
		expect(list.first()).toBeNull();
	});
	it('deleting some of the current objects', () => {
		const { list } = make(6);
		for (const o of list.each()) if (o.id % 2 === 0) list.delete(o);
		expect(ids(list)).toEqual([1, 3, 5]);
	});
	it('an object deleted ahead of the loop is skipped', () => {
		const { list, objs } = make(4);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			if (o.id === 1) list.delete(objs[1]);
		}
		expect(seen).toEqual([1, 3, 4]);
	});
	it('deleting the current object and its successor', () => {
		const { list, objs } = make(4);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			if (o.id === 2) {
				list.delete(o);
				list.delete(objs[2]);
			}
		}
		expect(seen).toEqual([1, 2, 4]);
		expect(ids(list)).toEqual([1, 4]);
	});
	it('deleting an object behind the loop changes nothing ahead', () => {
		const { list, objs } = make(3);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			if (o.id === 2) list.delete(objs[0]);
		}
		expect(seen).toEqual([1, 2, 3]);
		expect(ids(list)).toEqual([2, 3]);
	});
	it('objects created inside the loop are visited (they are appended)', () => {
		const { list } = make(2);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			if (o.id <= 2) list.add({ id: o.id + 10 });
		}
		expect(seen).toEqual([1, 2, 11, 12]);
	});
	it('delete the current object and create a new one in the same pass', () => {
		const { list } = make(2);
		const seen: number[] = [];
		for (const o of list.each()) {
			seen.push(o.id);
			list.delete(o);
			if (o.id < 10) list.add({ id: o.id + 10 });
		}
		expect(seen).toEqual([1, 2, 11, 12]);
		expect(list.count).toBe(0);
	});
	it('nested loops over the same list may both delete', () => {
		const { list } = make(4);
		const pairs: string[] = [];
		for (const a of list.each()) {
			for (const b of list.each()) {
				pairs.push(`${a.id}${b.id}`);
				if (a.id === 1 && b.id === 3) list.delete(b);
			}
			if (a.id === 2) list.delete(a);
		}
		expect(pairs).toEqual(['11', '12', '13', '14', '21', '22', '24', '41', '44']);
		expect(ids(list)).toEqual([1, 4]);
	});
	it('breaking out of a loop leaves the list usable', () => {
		const { list } = make(3);
		for (const o of list.each()) {
			list.delete(o);
			break;
		}
		expect(ids(list)).toEqual([2, 3]);
		list.add({ id: 9 });
		expect(ids(list)).toEqual([2, 3, 9]);
	});
	it('Delete p : p = After p outside a loop', () => {
		const { list, objs } = make(3);
		list.delete(objs[1]);
		expect(list.after(objs[1])).toBe(objs[2]);
		expect(list.before(objs[1])).toBe(objs[0]);
		expect(list.after(objs[0])).toBe(objs[2]);
	});
	it('a deleted object equals Null; deleting twice or deleting Null does nothing', () => {
		const { list, objs } = make(2);
		expect(list.isNull(objs[0])).toBe(false);
		list.delete(objs[0]);
		expect(list.isNull(objs[0])).toBe(true);
		expect(list.isNull(null)).toBe(true);
		list.delete(objs[0]);
		list.delete(null);
		expect(list.count).toBe(1);
		expect(list.first()).toBe(objs[1]);
	});
	it('Insert Before / After moves an object', () => {
		const { list, objs } = make(4);
		list.insertBefore(objs[3], objs[0]);
		expect(ids(list)).toEqual([4, 1, 2, 3]);
		list.insertAfter(objs[3], objs[2]);
		expect(ids(list)).toEqual([1, 2, 3, 4]);
		list.insertAfter(objs[0], objs[1]);
		expect(ids(list)).toEqual([2, 1, 3, 4]);
		list.insertBefore(objs[2], objs[2]); // o1==o2: nothing
		list.insertAfter(objs[2], objs[2]);
		expect(ids(list)).toEqual([2, 1, 3, 4]);
		expect(list.first()).toBe(objs[1]);
		expect(list.last()).toBe(objs[3]);
		expect(list.count).toBe(4);
	});
	it('moving the current object to the end makes the loop meet the rest again', () => {
		// Next is "v = After v" evaluated at the Next statement
		const { list, objs } = make(3);
		const seen: number[] = [];
		let moved = false;
		for (const o of list.each()) {
			seen.push(o.id);
			if (o.id === 1 && !moved) {
				moved = true;
				list.insertAfter(o, objs[2]);
			}
		}
		expect(seen).toEqual([1]); // 1 is now last: After it is Null
		expect(ids(list)).toEqual([2, 3, 1]);
	});
	it('Delete Each', () => {
		const { list, objs } = make(3);
		list.deleteEach();
		expect(list.count).toBe(0);
		expect(list.first()).toBeNull();
		expect(list.isNull(objs[1])).toBe(true);
		list.add({ id: 7 });
		expect(ids(list)).toEqual([7]);
	});
	it('After Null is a crash in release builds', () => {
		const { list } = make(1);
		expect(() => list.after(null as unknown as T)).toThrow('Memory access violation');
	});
});

describe('functions.bb helpers', () => {
	it('split: limit+1 entries, the tail is dropped, an empty separator-less rest is kept', () => {
		expect(B.split('1,2,3', ',', 2)).toEqual(['1', '2', '3']);
		expect(B.split('a,b', ',', 4)).toEqual(['a', 'b', '', '', '']);
		expect(B.split('a,b,c,d', ',', 1)).toEqual(['a', 'b']);
		expect(B.split('', ',', 1)).toEqual(['', '']);
		expect(B.split('a,,b', ',', 2)).toEqual(['a', '', 'b']);
		expect(B.split(',a,', ',', 2)).toEqual(['', 'a', '']);
		expect(B.split('a,b').length).toBe(11); // defaults: "," and limit 10
		expect(B.split('a;b', ';')[1]).toBe('b');
	});
	it('split: limit <= 0 means Len(txt)', () => {
		expect(B.split('a,b', ',', 0)).toEqual(['a', 'b', '', '']);
		expect(B.split('', ',', 0)).toEqual(['']);
	});
	it('split: only the first character of a long separator is skipped', () => {
		// p1 is the position of the separator's first character, the next piece starts at p1+1
		expect(B.split('a::b', '::', 2)).toEqual(['a', ':b', '']);
	});
	it('cinstr always returns 0 (For i=1 To c with c=0)', () => {
		expect(B.cinstr('a,b,c', ',')).toBe(0);
	});
	it('trimspace strips spaces only', () => {
		expect(B.trimspace('  \ta ')).toBe('\ta');
		expect(B.trimspace('  a b  ')).toBe('a b');
		expect(B.trimspace('    ')).toBe('');
		expect(B.trimspace('')).toBe('');
		expect(B.trimspace(' \u00e4 ')).toBe('\u00e4');
	});
	it('ntrim strips trailing spaces only', () => {
		expect(B.ntrim('  a  ')).toBe('  a');
		expect(B.ntrim('a\t ')).toBe('a\t');
		expect(B.ntrim('   ')).toBe('');
		expect(B.ntrim('\u00e4 ')).toBe('\u00e4');
	});
	it('trimtext removes one quote per side', () => {
		expect(B.trimtext('"abc"')).toBe('abc');
		expect(B.trimtext('""abc""')).toBe('"abc"');
		expect(B.trimtext('"abc')).toBe('abc');
		expect(B.trimtext('abc"')).toBe('abc');
		expect(B.trimtext('"')).toBe(''); // left quote removed, nothing left for the right test
		expect(B.trimtext('')).toBe('');
		expect(B.trimtext(' "a"')).toBe(' "a');
	});
	it('trimexquote removes spaces outside quotes', () => {
		expect(B.trimexquote('a b "c d" e')).toBe('ab"c d"e');
		expect(B.trimexquote(' x = "a  b" ')).toBe('x="a  b"');
		expect(B.trimexquote('"open  q')).toBe('"open  q');
		expect(B.trimexquote('a\tb')).toBe('a\tb');
	});
	it('code shifts bytes modulo 256 and reverses; mode 1 undoes it', () => {
		expect(B.code('abc', 1)).toBe('dcb');
		expect(B.code('dcb', 1, 1)).toBe('abc');
		expect(B.code('\u00ff', 1)).toBe('\x00');
		expect(B.code('\x00', 1, 1)).toBe('\u00ff');
		expect(B.code('a', 256)).toBe('a');
		expect(B.code('a', -300)).toBe(String.fromCharCode(97 - 44));
		const s = 'Stranded II \u00e4\u00f6';
		expect(B.code(B.code(s, 77), 77, 1)).toBe(s);
	});
	it('strinv maps b to 255-b', () => {
		expect(B.strinv('\x00\u00ffA')).toBe('\u00ff\x00\u00be');
		expect(B.strinv(B.strinv('map'))).toBe('map');
	});
	it('stripext cuts at the first dot', () => {
		expect(B.stripext('a.b.c')).toBe('a');
		expect(B.stripext('abc')).toBe('abc');
		expect(B.stripext('.x')).toBe('');
		expect(B.stripext('dir.d\\file.txt')).toBe('dir');
	});
	it('path keeps everything up to the last (back)slash', () => {
		expect(B.path('a/b/c.txt')).toBe('a\\b\\');
		expect(B.path('a\\b')).toBe('a\\');
		expect(B.path('file.txt')).toBe('file.txt');
		expect(B.path('dir/')).toBe('dir\\');
		expect(B.path('')).toBe('');
	});
	it('getfilename: between the first slash and the first dot after it', () => {
		expect(B.getfilename('gfx/palm01.b3d')).toBe('palm01');
		expect(B.getfilename('gfx\\palm01.b3d')).toBe('palm01');
		expect(B.getfilename('palm01.b3d')).toBe('palm01');
		expect(B.getfilename('palm01')).toBe('palm01');
		expect(B.getfilename('gfx/palm01')).toBe('palm01');
		expect(B.getfilename('a.b/c.d')).toBe('c'); // dot search starts at the slash
		expect(B.getfilename('a/b/c.d')).toBe('b\\c'); // "with 1 slash max.!"
		expect(B.getfilename('a/b.c.d')).toBe('b');
	});
	it('numsep groups digits in threes', () => {
		expect(B.numsep('1234567', ',')).toBe('1,234,567');
		expect(B.numsep('123456', '.')).toBe('123.456');
		expect(B.numsep('1234', ',')).toBe('1,234');
		expect(B.numsep('123', ',')).toBe('123');
		expect(B.numsep('0', ',')).toBe('0');
		expect(B.numsep('-1234567', ',')).toBe('-1,234,567');
		expect(B.numsep('-123', ',')).toBe('-123');
		expect(B.numsep('-123456', ',')).toBe('-123,456');
		expect(B.numsep('abcd', ',')).toBe('a,bcd'); // Int("abcd")=0: grouped like a number
	});
	it('zerofill', () => {
		expect(B.zerofill('7', 3)).toBe('007');
		expect(B.zerofill(42, 5)).toBe('00042'); // screenshot(): zerofill$(id,5)
		expect(B.zerofill('1234', 3)).toBe('1234');
		expect(B.zerofill('-5', 4)).toBe('00-5');
		expect(B.zerofill('', 2)).toBe('00');
	});
	it('extval limits toward the sign of the value', () => {
		expect(B.extval(5, 3)).toBe(3);
		expect(B.extval(2, 3)).toBe(2);
		expect(B.extval(-5, -3)).toBe(-3);
		expect(B.extval(-2, -3)).toBe(-2);
		expect(B.extval(0, -1)).toBe(-1); // val>=0 and val>ext
		expect(B.extval(-1, 5)).toBe(5); // val<0 and val<ext
	});
	it('dist is a float32 hypotenuse', () => {
		expect(B.dist(0, 0, 3, 4)).toBe(5);
		expect(B.dist(3, 4, 0, 0)).toBe(5);
		expect(B.dist(1, 1, 1, 1)).toBe(0);
		expect(B.dist(1.5, 2.25, 0.2, 7.1)).toBe(5.021204948425293);
	});
	it('reppart replaces Len(otxt) characters at start', () => {
		expect(B.reppart('hello world', 'world', 7, 'there')).toBe('hello there');
		expect(B.reppart('hello', 'he', 1, 'J')).toBe('Jllo');
		expect(B.reppart('hello', 'XX', 2, '')).toBe('hlo'); // otxt only gives the length
		expect(B.reppart('hello', 'lo', 4, 'p!')).toBe('help!');
		expect(B.reppart('hello', 'x', 0, 'A')).toBe('Ahello'); // start<=1: no left part, right part from Mid(start+1)
		expect(B.reppart('hello', 'o', 5, '')).toBe('hell');
		expect(B.reppart('hello', 'abc', 9, '!')).toBe('hello!');
	});
	it('separator bytes', () => {
		expect(B.SEP_LINE.charCodeAt(0)).toBe(0xa6);
		expect(B.SEP_FIELD.charCodeAt(0)).toBe(0xbf);
	});
});
