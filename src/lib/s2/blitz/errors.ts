/**
 * Runtime errors of the Blitz3D runtime.
 *
 * bbsys.h: `#define RTEX(_X_) throw bbEx(_X_);` is unconditional, also in
 * release builds. bbruntime_run() catches the bbEx and the program ends
 * (the release stub shows the text in an "Error!" message box). Hardware
 * exceptions are turned into the same thing by seTranslator() in
 * bbruntime_dll.cpp ("Integer divide by zero", "Memory access violation",
 * "Unknown runtime exception", ...).
 *
 * The port throws; whoever owns the game loop decides how to present it.
 */
export class BlitzRuntimeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RuntimeError';
	}
}

/** RuntimeError(msg): the original shows a message box and ends the program. */
export function RuntimeError(message: string): never {
	throw new BlitzRuntimeError(message);
}
