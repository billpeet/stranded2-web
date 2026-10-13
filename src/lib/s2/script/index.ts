/**
 * Stranded II script interpreter. See engine.ts for the language core,
 * commandTable.ts for the command set and host.ts for what a game has to
 * provide.
 */
import type { CommandDef } from './api';
import { commandTable } from './commandTable';
import { ScriptEngine } from './engine';
import { createRecordingHost, type HostCall, type ScriptHost } from './host';

export * from './api';
export * from './host';
export * from './engine';
export * from './commandTable';
export * from './scan';
export { BlitzRnd, fstr, istr, f2i } from './_helpers';

/** A ScriptEngine with every command of the table registered. */
export function createScriptEngine(host?: ScriptHost, extra: readonly CommandDef[] = []): ScriptEngine {
	return new ScriptEngine(host, [...commandTable, ...extra]);
}

/**
 * An engine on the default "unimplemented" host: every host method that
 * `impl` does not provide records its call in `calls` and returns undefined.
 */
export function createRecordingEngine(impl: Partial<ScriptHost> = {}): { engine: ScriptEngine; calls: HostCall[] } {
	const { host, calls } = createRecordingHost(impl);
	return { engine: createScriptEngine(host), calls };
}
