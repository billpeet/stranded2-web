/**
 * Program flow that Blitz gets from blocking calls and a browser cannot have:
 * Flip, Delay, WaitKey inside loops, modal windows, and the 50 FPS limiter.
 *
 * The rule (PORTING_GUIDE.md, "Blocking code"): a function is `async` exactly
 * when function_index.json says so. Inside it
 *
 *     Flip                 Flip(); await frame();
 *     Delay n              await delay(n);
 *     WaitKey()            await waitKey();
 *     bmpf_loadscreen(..)  await bmpf_loadscreen(..);      (game/load_bmpf.ts)
 *     gui_msg(..) etc.     await gui_msg(..);
 *
 * A synchronous function (a "sync barrier" of the index: script commands,
 * debug(), console()) that has to start something blocking uses defer().
 */
import { MilliSecs } from '../blitz';
import { GetKey } from '../input';
import { G } from './state';

// ---------------------------------------------------------------- frames

type Scheduler = (cb: () => void) => void;

const browserScheduler: Scheduler = (cb) => {
	if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => cb());
	else setTimeout(cb, 0);
};
let scheduler: Scheduler = browserScheduler;
let frameHook: (() => void) | null = null;

/** Replaces how frame() waits (tests: `setFrameScheduler((cb) => cb())` or a manual pump). null = default. */
export function setFrameScheduler(s: Scheduler | null): void {
	scheduler = s ?? browserScheduler;
}

/** Called at every frame() before waiting (tests: count frames, inject input, break endless modal loops). */
export function setFrameHook(fn: (() => void) | null): void {
	frameHook = fn;
}

/**
 * THE helper for original code that stands still while the screen goes on:
 * waits for the next display frame. Where the original has `Flip` inside a
 * loop (modal windows, load screens, intro) the port has `Flip(); await frame();`.
 * It is also what ui/host.ts `host.frame` is set to.
 */
export function frame(): Promise<void> {
	frameHook?.();
	lastYield = now();
	return new Promise<void>((resolve) => scheduler(resolve));
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let lastYield = 0;

/**
 * frame() for load screens: bmpf_loadscreen is called hundreds of times
 * while definitions load, and waiting a display frame for each (as the
 * original's Flip does with vertical sync on) only costs time. Waits when
 * more than `ms` have passed since the last wait, so the screen stays alive.
 */
export function frameIfDue(ms = 12): Promise<void> {
	if (now() - lastYield < ms) return RESOLVED;
	return frame();
}
const RESOLVED = Promise.resolve();

/** `Delay ms`: the program sleeps, input and timers go on. */
export function delay(ms: number): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, ms > 0 ? ms : 0));
}

/** `WaitKey()`: waits for a key press and returns its ASCII code. */
export async function waitKey(): Promise<number> {
	for (;;) {
		const k = GetKey();
		if (k !== 0) return k;
		await frame();
	}
}

// ---------------------------------------------------------------- deferred blocking work

type Deferred = () => void | Promise<void>;
const deferred: Deferred[] = [];

/**
 * For the sync barriers: run `fn` (which may await) as soon as the current
 * synchronous code has returned to the main loop, before the frame is
 * flipped. Put the blocking call AND everything the original does after it
 * in the same block into `fn`:
 *
 *     ;debug.bb                               // debug.ts (sync)
 *     editor_ini()                            defer(async () => {
 *     m_section=Csection_editor                   await editor_ini();
 *     load_map(...)                               G.m_section = Csection_editor;
 *     in_edmap$=...                               await load_map(...);
 *     set_debug=0                                 G.in_edmap = ...; G.set_debug = 0;
 *                                             });
 *
 * Difference to the original: the code after the block in the calling
 * function runs before `fn`. Mark such places with a `// deferred:` comment.
 */
export function defer(fn: Deferred): void {
	deferred.push(fn);
}

/** True while deferred work is queued (the main loop then runs it instead of the section). */
export function hasDeferred(): boolean {
	return deferred.length > 0;
}

/** Main loop: runs everything queued by defer(), in order, including work queued while running. */
export async function runDeferred(): Promise<void> {
	while (deferred.length) {
		const fn = deferred.shift()!;
		await fn();
	}
}

/** Tests: forget queued work. */
export function clearDeferred(): void {
	deferred.length = 0;
}

// ---------------------------------------------------------------- 50 FPS limiter

/**
 * The frame limiter of calcfpsfactor() (load_fps.bb):
 *
 *     While MilliSecs()-ms<(looplimit) : Delay 1 : Wend
 *
 * runs at the end of every frame (endinput), then the main loop does Flip,
 * which waits for the vertical blank. A browser cannot wait inside the
 * frame, so the wait moves to the start of the next one: the main loop
 * (driven by requestAnimationFrame = the vertical blank) starts a frame only
 * when frameDue() is true. calcfpsfactor() of game/load_fps.ts accounts for
 * the wait when it computes f#.
 *
 * The result is the original's pacing for the display it runs on: 50 FPS on
 * a 100 Hz display, 30 FPS on 60 Hz (a 20 ms frame misses every other
 * blank; the original does the same with its default `Flip`).
 */
export function frameDue(ms: number = MilliSecs()): boolean {
	// before the first getinput() ms is 0
	return G.ms === 0 || ms - G.ms >= G.looplimit;
}
