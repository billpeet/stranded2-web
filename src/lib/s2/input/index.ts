/**
 * Blitz3D input commands (bbruntime/bbinput.cpp, gxruntime/gxinput.cpp).
 * Global state like the original. The inject* functions are the only way
 * state changes, so the logic is testable without a DOM; attachInput() wires
 * them to browser events.
 */
import { Device } from './device';
import { scancodeOf, toAscii } from './scancodes';

export { Device } from './device';
export { CODE_TO_SCANCODE, scancodeOf, toAscii } from './scancodes';

const keyboard = new Device();
const mouse = new Device();

/** bbinput.cpp: static int mouse_x,mouse_y,mouse_z — the reference for the speed functions. */
let mouse_x = 0,
	mouse_y = 0,
	mouse_z = 0;

let gfxW = 800,
	gfxH = 600;

/** Logical screen size mouse coordinates are clamped to (Graphics width/height). */
export function setInputSize(w: number, h: number): void {
	gfxW = w;
	gfxH = h;
}

/** input_create(): everything back to zero. */
export function resetInput(): void {
	keyboard.reset();
	mouse.reset();
	mouse_x = mouse_y = mouse_z = 0;
}

// ---------------------------------------------------------------- clock

/** MilliSecs() and its injectable clock live in blitz/time.ts. */
export { MilliSecs, setClock } from '../blitz';

// ---------------------------------------------------------------- keyboard

export function KeyDown(n: number): number {
	return keyboard.keyDown(n);
}
/** Number of times the key went down since the last KeyHit for it. */
export function KeyHit(n: number): number {
	return keyboard.keyHit(n);
}
/** Character of the next queued key press, 0 if none (or if that press has no character). */
export function GetKey(): number {
	return keyboard.getKeyAscii();
}
export function FlushKeys(): void {
	keyboard.flush();
}
/** GetJoy(): the next joystick button press. There is no joystick: 0, as in Blitz without one. */
export function GetJoy(): number {
	return 0;
}
export function FlushJoy(): void {}

/**
 * A key went down. Auto-repeat must not be reported: Blitz ignores repeated
 * WM_KEYDOWN (lparam bit 30) and DirectInput never produces it.
 */
export function injectKeyDown(scancode: number, asc = 0): void {
	if (!scancode || scancode > 255) return;
	keyboard.downEvent(scancode, asc);
}
export function injectKeyUp(scancode: number): void {
	if (!scancode || scancode > 255) return;
	keyboard.upEvent(scancode);
}

// ---------------------------------------------------------------- mouse

/** Buttons: 1 left, 2 right, 3 middle (4/5 exist in the game's key table but Blitz never reports them). */
export function MouseDown(n: number): number {
	return mouse.keyDown(n);
}
export function MouseHit(n: number): number {
	return mouse.keyHit(n);
}
/** Next queued button press (1..3), 0 if none. */
export function GetMouse(): number {
	return mouse.getKey();
}
export function FlushMouse(): void {
	mouse.flush();
}
export function MouseX(): number {
	return mouse.axis_states[0];
}
export function MouseY(): number {
	return mouse.axis_states[1];
}
export function MouseZ(): number {
	return Math.trunc(mouse.axis_states[2] / 120);
}
export function MouseXSpeed(): number {
	const dx = MouseX() - mouse_x;
	mouse_x += dx;
	return dx;
}
export function MouseYSpeed(): number {
	const dy = MouseY() - mouse_y;
	mouse_y += dy;
	return dy;
}
export function MouseZSpeed(): number {
	const dz = MouseZ() - mouse_z;
	mouse_z += dz;
	return dz;
}

/**
 * MoveMouse x,y: the pointer is now at x,y and the speed reference is reset.
 * The browser cannot warp the system pointer. While the pointer is locked
 * the game's position is purely virtual, so this is exact; while it is not
 * locked the position snaps back to the real pointer on its next movement.
 */
export function MoveMouse(x: number, y: number): void {
	mouse.axis_states[0] = mouse_x = Math.round(x);
	mouse.axis_states[1] = mouse_y = Math.round(y);
	lastWarp = now();
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Time of the last MoveMouse. While the game keeps warping the pointer, movement must be relative. */
let lastWarp = -Infinity;
/** How long after a MoveMouse an unlocked pointer is still read as relative movement (ms). */
const WARP_HOLD_MS = 250;

const clampX = (x: number) => (x < 0 ? 0 : x >= gfxW ? gfxW - 1 : x);
const clampY = (y: number) => (y < 0 ? 0 : y >= gfxH ? gfxH - 1 : y);

export function injectMouseDown(button: number): void {
	mouse.downEvent(button);
}
export function injectMouseUp(button: number): void {
	mouse.upEvent(button);
}
/** Absolute pointer position in logical pixels (WM_MOUSEMOVE path: clamped to the screen). */
export function injectMouseMove(x: number, y: number): void {
	mouse.axis_states[0] = clampX(Math.trunc(x));
	mouse.axis_states[1] = clampY(Math.trunc(y));
}
/** Relative movement (DirectInput path, used while the pointer is locked). */
export function injectMouseDelta(dx: number, dy: number): void {
	mouse.axis_states[0] = clampX(mouse.axis_states[0] + dx);
	mouse.axis_states[1] = clampY(mouse.axis_states[1] + dy);
}
/** Wheel movement in Windows units: +120 per notch away from the user. */
export function injectWheel(dz: number): void {
	mouse.axis_states[2] += dz;
}

// ---------------------------------------------------------------- DOM

export interface AttachOptions {
	/** Keys the browser keeps (default: F5, F11, F12 and anything with the Meta key). */
	passThrough?: (e: KeyboardEvent) => boolean;
}

let lockTarget: HTMLElement | null = null;

export function PointerLocked(): boolean {
	return typeof document !== 'undefined' && !!lockTarget && document.pointerLockElement === lockTarget;
}
/** Must be called from a user gesture (click/keydown handler or the frame right after one). */
export function requestPointerLock(): void {
	if (lockTarget && !PointerLocked()) void Promise.resolve(lockTarget.requestPointerLock()).catch(() => {});
}
export function exitPointerLock(): void {
	if (PointerLocked()) {
		exitRequested = true;
		document.exitPointerLock();
	}
}
/** True while an exit of the pointer lock was asked for by code rather than by the user's Esc. */
let exitRequested = false;
/** Times of the last real and the last synthesised Escape key press, to avoid reporting one press twice. */
let lastRealEscape = -Infinity;
let lastSynthEscape = -Infinity;
const SC_ESCAPE = 1;

let pointerHidden = false;
/** HidePointer / ShowPointer: the game draws its own cursor image. */
export function HidePointer(): void {
	pointerHidden = true;
	if (lockTarget) lockTarget.style.setProperty('cursor', 'none', 'important');
}
export function ShowPointer(): void {
	pointerHidden = false;
	if (lockTarget) lockTarget.style.removeProperty('cursor');
}

const defaultPassThrough = (e: KeyboardEvent): boolean =>
	e.metaKey || e.code === 'F5' || e.code === 'F11' || e.code === 'F12';

const BUTTONS = [1, 3, 2, 4, 5]; // MouseEvent.button -> Blitz button

/**
 * Wire browser events to the emulated devices. `target` is the element that
 * shows the game (its box is mapped to the logical screen for MouseX/MouseY
 * and it is the pointer-lock target). Returns a function that detaches.
 */
export function attachInput(target: HTMLElement, opts: AttachOptions = {}): () => void {
	const passThrough = opts.passThrough ?? defaultPassThrough;
	lockTarget = target;
	if (pointerHidden) target.style.setProperty('cursor', 'none', 'important');
	const ac = new AbortController();
	const o = { signal: ac.signal };
	const editable = (t: EventTarget | null): boolean =>
		t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

	window.addEventListener(
		'keydown',
		(e) => {
			if (editable(e.target) || passThrough(e)) return;
			e.preventDefault();
			if (e.repeat) return;
			const sc = scancodeOf(e.code);
			if (sc === SC_ESCAPE) {
				// Already reported when the browser dropped the pointer lock for this press.
				if (now() - lastSynthEscape < 150) return;
				lastRealEscape = now();
			}
			if (sc) injectKeyDown(sc, toAscii(sc, e.key, e.ctrlKey && !e.altKey));
		},
		o
	);
	window.addEventListener(
		'keyup',
		(e) => {
			if (editable(e.target)) return;
			const sc = scancodeOf(e.code);
			if (sc) injectKeyUp(sc);
		},
		o
	);
	window.addEventListener(
		'blur',
		() => {
			keyboard.releaseAll();
			mouse.releaseAll();
		},
		o
	);

	let fracX = 0;
	let fracY = 0;
	const move = (e: MouseEvent) => {
		if (PointerLocked()) {
			injectMouseDelta(e.movementX, e.movementY);
			return;
		}
		const r = target.getBoundingClientRect();
		if (r.width <= 0 || r.height <= 0) return;
		if (e.type === 'mousemove' && now() - lastWarp < WARP_HOLD_MS) {
			// The game is re-centring the pointer every frame (mouse look). The real
			// pointer cannot be warped, so reading its absolute position would turn
			// its distance from the centre into a constant speed. Use the movement.
			// Whole logical pixels only, carrying the remainder, as the mouse axes are integers.
			fracX += (e.movementX * gfxW) / r.width;
			fracY += (e.movementY * gfxH) / r.height;
			const dx = Math.trunc(fracX);
			const dy = Math.trunc(fracY);
			fracX -= dx;
			fracY -= dy;
			injectMouseDelta(dx, dy);
			return;
		}
		injectMouseMove(((e.clientX - r.left) * gfxW) / r.width, ((e.clientY - r.top) * gfxH) / r.height);
	};
	window.addEventListener('mousemove', move, o);
	document.addEventListener(
		'pointerlockchange',
		() => {
			if (PointerLocked()) return;
			const byCode = exitRequested;
			exitRequested = false;
			// The browser releases the lock on Esc and keeps that key press to itself.
			// Hand it to the game, which uses Esc for its menu.
			if (!byCode && document.hasFocus() && now() - lastRealEscape > 150) {
				lastSynthEscape = now();
				injectKeyDown(SC_ESCAPE, 27);
				injectKeyUp(SC_ESCAPE);
			}
		},
		o
	);
	target.addEventListener(
		'mousedown',
		(e) => {
			move(e);
			// Blitz owns the mouse while the game runs; the browser equivalent is the
			// pointer lock, which needs a user gesture such as this click.
			requestPointerLock();
			const b = BUTTONS[e.button];
			if (b) injectMouseDown(b);
			e.preventDefault();
			if (document.activeElement instanceof HTMLElement && editable(document.activeElement)) document.activeElement.blur();
		},
		o
	);
	window.addEventListener(
		'mouseup',
		(e) => {
			const b = BUTTONS[e.button];
			if (b) injectMouseUp(b);
		},
		o
	);
	target.addEventListener('contextmenu', (e) => e.preventDefault(), o);
	target.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			// One wheel notch is deltaY=100 pixels (or 3 lines) in browsers and 120 units in Windows.
			const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 120 : 1.2;
			injectWheel(-e.deltaY * unit);
		},
		{ signal: ac.signal, passive: false }
	);

	return () => {
		ac.abort();
		if (lockTarget === target) lockTarget = null;
	};
}
