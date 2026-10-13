/**
 * Support for the generated signature skeletons (files starting with
 * `// @skeleton`): `notPorted` / `markSkeleton` / `isSkeleton`. A skeleton
 * function throws NotPortedError; nothing else. Delete the file when the last
 * skeleton (the network modules) is gone.
 */
export class NotPortedError extends Error {
	constructor(readonly fn: string) {
		super(`${fn}() is not ported yet (generated skeleton; see PORTING_GUIDE.md and function_index.json)`);
		this.name = 'NotPortedError';
	}
}

/** Body of every skeleton function. */
export function notPorted(name: string): never {
	throw new NotPortedError(name);
}

// Created on first use: skeleton modules call markSkeleton while they are being imported, possibly
// before this module's own top-level code has run (import cycles).
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, no-var
var skeletons: WeakSet<Function> | undefined;

/** Called at the end of a skeleton module with all of its functions. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function markSkeleton(...fns: Function[]): void {
	skeletons ??= new WeakSet();
	for (const f of fns) skeletons.add(f);
}

/** True while `fn` is still the generated skeleton. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isSkeleton(fn: Function): boolean {
	return skeletons?.has(fn) ?? false;
}

/** The real function once it is ported, the stand-in until then. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function live<F extends Function>(real: F, stub: F): F {
	return isSkeleton(real) ? stub : real;
}
