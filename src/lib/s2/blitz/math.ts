/**
 * Blitz3D maths and random numbers: bbruntime/bbmath.cpp.
 *
 * All functions take and return Floats (float32). Angles are degrees. The
 * conversion constants are themselves floats and the multiplication happens
 * in single precision before/after the C library call, e.g.
 *
 *     float bbSin( float n ){ return (float)sin(n*dtor); }
 *     float bbASin( float n ){ return (float)asin(n)*rtod; }
 *
 * That is why Sin(180) is -8.74228e-008 and not 0: 180*dtor rounds to the
 * float nearest to pi.
 */
import { ftol } from './num';

const f = Math.fround;

/** `static const float dtor=0.0174532925199432957692369076848861f;` */
export const DTOR = f(0.0174532925199432957692369076848861);
/** `static const float rtod=57.2957795130823208767981548141052f;` */
export const RTOD = f(57.2957795130823208767981548141052);
/** The `Pi` keyword: FloatConstNode( 3.1415926535897932384626433832795f ). */
export const Pi = f(3.1415926535897932384626433832795);

export const Sin = (deg: number): number => f(Math.sin(f(f(deg) * DTOR)));
export const Cos = (deg: number): number => f(Math.cos(f(f(deg) * DTOR)));
export const Tan = (deg: number): number => f(Math.tan(f(f(deg) * DTOR)));
/** ASin/ACos outside -1..1 give NaN. */
export const ASin = (n: number): number => f(f(Math.asin(f(n))) * RTOD);
export const ACos = (n: number): number => f(f(Math.acos(f(n))) * RTOD);
export const ATan = (n: number): number => f(f(Math.atan(f(n))) * RTOD);
/** ATan2(y, x), -180..180. */
export const ATan2 = (n: number, t: number): number => f(f(Math.atan2(f(n), f(t))) * RTOD);
/** Sqr of a negative number is NaN. */
export const Sqr = (n: number): number => f(Math.sqrt(f(n)));
/** Floor/Ceil return Floats (Floor(-0.5) is -1.0); assigning to an Int then rounds an already whole number. */
export const Floor = (n: number): number => f(Math.floor(f(n)));
export const Ceil = (n: number): number => f(Math.ceil(f(n)));
export const Exp = (n: number): number => f(Math.exp(f(n)));
/** Natural logarithm; Log(0) is -Infinity, Log of a negative number is NaN. */
export const Log = (n: number): number => f(Math.log(f(n)));
export const Log10 = (n: number): number => f(Math.log10(f(n)));

// ---------------------------------------------------------------- random

const RND_A = 48271;
const RND_M = 2147483647;
const RND_Q = 44488;
const RND_R = 3399;

/**
 * The generator behind Rnd/Rand/SeedRnd/RndSeed: a Park-Miller "minimal
 * standard" generator (a=48271, m=2^31-1, Schrage's method) of which each
 * draw only uses the low 16 bits:
 *
 *     rnd_state=RND_A*(rnd_state%RND_Q)-RND_R*(rnd_state/RND_Q);
 *     if( rnd_state<0 ) rnd_state+=RND_M;
 *     return (rnd_state&65535)/65536.0f+(.5f/65536.0f);
 *
 * so rnd() is one of the 65536 values (k+0.5)/65536, never 0 and never 1.
 * math_create() seeds with $1234 at program start.
 *
 * Blitz has one generator for the whole program: use the shared `blitzRnd`
 * (or the free functions below) for anything that must stay in step with
 * the rest of the game, and a private instance only for isolated tests.
 */
export class BlitzRnd {
	state = 0x1234;

	/** SeedRnd seed: `seed&=0x7fffffff; rnd_state=seed ? seed : 1;` */
	SeedRnd(seed: number): void {
		seed &= 0x7fffffff;
		this.state = seed ? seed : 1;
	}

	/** RndSeed(): the current state (not the last value passed to SeedRnd). */
	RndSeed(): number {
		return this.state;
	}

	/** The runtime's static rnd(): advances the state, returns a float in (0,1). */
	rnd(): number {
		const s0 = this.state;
		let s = RND_A * (s0 % RND_Q) - RND_R * Math.trunc(s0 / RND_Q);
		if (s < 0) s += RND_M;
		this.state = s;
		return f((s & 65535) / 65536 + 0.5 / 65536);
	}

	/**
	 * Rnd#(from#, to#=0): `rnd()*(to-from)+from` in single precision. With one
	 * argument the range is from..0, i.e. Rnd(5) is between 0 and 5.
	 */
	Rnd(from: number, to = 0): number {
		from = f(from);
		to = f(to);
		return f(f(this.rnd() * f(to - from)) + from);
	}

	/**
	 * Rand%(from%, to%=1): `if( to<from ) swap; return int(rnd()*(to-from+1))+from;`
	 * The C cast truncates. Rand(6) is 1..6.
	 */
	Rand(from: number, to = 1): number {
		from |= 0;
		to |= 0;
		if (to < from) {
			const t = from;
			from = to;
			to = t;
		}
		const span = (to - from + 1) | 0;
		return (ftol(f(this.rnd() * span)) + from) | 0;
	}
}

/** The program-wide generator. */
export const blitzRnd = new BlitzRnd();

export const Rnd = (from: number, to = 0): number => blitzRnd.Rnd(from, to);
export const Rand = (from: number, to = 1): number => blitzRnd.Rand(from, to);
export const SeedRnd = (seed: number): void => blitzRnd.SeedRnd(seed);
export const RndSeed = (): number => blitzRnd.RndSeed();
