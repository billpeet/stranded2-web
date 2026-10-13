/**
 * DirectInput scancodes (DIK_*), the key numbers Blitz's KeyDown/KeyHit take
 * and the game stores in sys\controls.cfg and names in sys\keys.inf.
 *
 * Browsers report physical keys as KeyboardEvent.code, which is layout
 * independent just like a scancode, so the mapping is one to one.
 */
export const CODE_TO_SCANCODE: Readonly<Record<string, number>> = {
	Escape: 1,
	Digit1: 2,
	Digit2: 3,
	Digit3: 4,
	Digit4: 5,
	Digit5: 6,
	Digit6: 7,
	Digit7: 8,
	Digit8: 9,
	Digit9: 10,
	Digit0: 11,
	Minus: 12,
	Equal: 13,
	Backspace: 14,
	Tab: 15,
	KeyQ: 16,
	KeyW: 17,
	KeyE: 18,
	KeyR: 19,
	KeyT: 20,
	KeyY: 21,
	KeyU: 22,
	KeyI: 23,
	KeyO: 24,
	KeyP: 25,
	BracketLeft: 26,
	BracketRight: 27,
	Enter: 28,
	ControlLeft: 29,
	KeyA: 30,
	KeyS: 31,
	KeyD: 32,
	KeyF: 33,
	KeyG: 34,
	KeyH: 35,
	KeyJ: 36,
	KeyK: 37,
	KeyL: 38,
	Semicolon: 39,
	Quote: 40,
	Backquote: 41,
	ShiftLeft: 42,
	Backslash: 43,
	KeyZ: 44,
	KeyX: 45,
	KeyC: 46,
	KeyV: 47,
	KeyB: 48,
	KeyN: 49,
	KeyM: 50,
	Comma: 51,
	Period: 52,
	Slash: 53,
	ShiftRight: 54,
	NumpadMultiply: 55,
	AltLeft: 56,
	Space: 57,
	CapsLock: 58,
	F1: 59,
	F2: 60,
	F3: 61,
	F4: 62,
	F5: 63,
	F6: 64,
	F7: 65,
	F8: 66,
	F9: 67,
	F10: 68,
	NumLock: 69,
	ScrollLock: 70,
	Numpad7: 71,
	Numpad8: 72,
	Numpad9: 73,
	NumpadSubtract: 74,
	Numpad4: 75,
	Numpad5: 76,
	Numpad6: 77,
	NumpadAdd: 78,
	Numpad1: 79,
	Numpad2: 80,
	Numpad3: 81,
	Numpad0: 82,
	NumpadDecimal: 83,
	IntlBackslash: 86,
	F11: 87,
	F12: 88,
	F13: 100,
	F14: 101,
	F15: 102,
	NumpadEnter: 156,
	ControlRight: 157,
	NumpadDivide: 181,
	PrintScreen: 183,
	AltRight: 184,
	Pause: 197,
	Home: 199,
	ArrowUp: 200,
	PageUp: 201,
	ArrowLeft: 203,
	ArrowRight: 205,
	End: 207,
	ArrowDown: 208,
	PageDown: 209,
	Insert: 210,
	Delete: 211,
	MetaLeft: 219,
	MetaRight: 220,
	ContextMenu: 221
};

/** KeyboardEvent.code to scancode; 0 when the key has none. */
export function scancodeOf(code: string): number {
	return CODE_TO_SCANCODE[code] ?? 0;
}

/** gxInput::ASC_* values returned by GetKey for keys without a character. */
export const ASC_HOME = 1,
	ASC_END = 2,
	ASC_INSERT = 3,
	ASC_DELETE = 4,
	ASC_PAGEUP = 5,
	ASC_PAGEDOWN = 6,
	ASC_UP = 28,
	ASC_DOWN = 29,
	ASC_RIGHT = 30,
	ASC_LEFT = 31;

const SPECIAL: Readonly<Record<number, number>> = {
	210: ASC_INSERT,
	211: ASC_DELETE,
	199: ASC_HOME,
	207: ASC_END,
	201: ASC_PAGEUP,
	209: ASC_PAGEDOWN,
	200: ASC_UP,
	208: ASC_DOWN,
	203: ASC_LEFT,
	205: ASC_RIGHT
};

/** Characters Windows-1252 places in 0x80..0x9F, for typed text that is not Latin-1. */
const CP1252: Readonly<Record<string, number>> = {
	'€': 0x80,
	'‚': 0x82,
	ƒ: 0x83,
	'„': 0x84,
	'…': 0x85,
	'†': 0x86,
	'‡': 0x87,
	ˆ: 0x88,
	'‰': 0x89,
	Š: 0x8a,
	'‹': 0x8b,
	Œ: 0x8c,
	Ž: 0x8e,
	'‘': 0x91,
	'’': 0x92,
	'“': 0x93,
	'”': 0x94,
	'•': 0x95,
	'–': 0x96,
	'—': 0x97,
	'˜': 0x98,
	'™': 0x99,
	š: 0x9a,
	'›': 0x9b,
	œ: 0x9c,
	ž: 0x9e,
	Ÿ: 0x9f
};

/**
 * gxInput::toAscii for a key press: the value GetKey returns.
 * Blitz asks Windows (ToAscii) with the current Shift/Ctrl/Alt state; the
 * browser has already done that translation and reports it as `key`.
 *  - navigation keys map to the ASC_* constants by scancode;
 *  - Ctrl+letter yields the control code (Ctrl+A = 1 ...), as ToAscii does;
 *  - keys that produce no single ANSI character yield 0.
 */
export function toAscii(scancode: number, key: string, ctrl = false): number {
	const special = SPECIAL[scancode];
	if (special !== undefined) return special;
	switch (key) {
		case 'Enter':
			return ctrl ? 10 : 13;
		case 'Backspace':
			return ctrl ? 127 : 8;
		case 'Tab':
			return 9;
		case 'Escape':
			return 27;
	}
	if (key.length !== 1) return 0;
	let c = key.charCodeAt(0);
	if (c > 255) c = CP1252[key] ?? 0;
	if (ctrl) {
		const u = c & ~0x20;
		if (u >= 0x40 && u <= 0x5f) return u & 0x1f;
		return 0;
	}
	return c;
}
