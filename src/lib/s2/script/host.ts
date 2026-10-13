/**
 * ScriptHost: everything the script interpreter needs from the game world.
 *
 * CoreHost is what the interpreter core itself calls. The Host fragments
 * imported below are declared next to the command handlers that use them:
 * a `cmd_<command>` method receives the parameters of that script command
 * exactly as parse_commands() parsed them (same order, Blitz types,
 * defaults); other methods are named after the original game function the
 * command calls. Value-returning methods return the text for p_return$
 * (already formatted the way Blitz would convert the value to a string).
 *
 * Nothing here is implemented in this directory: createRecordingHost()
 * records every call and returns undefined, which the handlers treat as
 * 0 / "" / "leave p_return$ alone".
 */
import type { Host as HostCore } from './commands/core';
import type { Host as HostBasic1 } from './commands/basic1';
import type { Host as HostBasic2 } from './commands/basic2';
import type { Host as HostInterface } from './commands/interface';
import type { Host as HostWorld } from './commands/world';
import type { Host as HostReturns } from './commands/returns';

export const Cclass_global = 0;
export const Cclass_object = 1;
export const Cclass_unit = 2;
export const Cclass_item = 3;
export const Cclass_info = 4;
export const Cclass_state = 5;

/** con_add() colours (Cbmpf_*). */
export const Cbmpf_yellow = 1;
export const Cbmpf_red = 3;

/** An entry of "For T.Tobject=Each Tobject" (also units, items, infos, states). */
export interface HostEntity {
	id: number;
	typ: number;
}

export interface CoreHost {
	/** con_add(txt$="", special=-1): console line. */
	con_add(txt?: string, special?: number): void;
	/** con_open(): parse_error opens the console when set_debug=1. */
	con_open(): void;
	/** sfx(sfx_fail): played by parse_error when set_debug=1. */
	sfx_fail(): void;
	/** con_object/con_unit/con_item/con_info(id): 1 if the entity exists. */
	con_object(id: number): number;
	con_unit(id: number): number;
	con_item(id: number): number;
	con_info(id: number): number;
	/** parent_con(class, id): 1 if the entity exists. */
	parent_con(cls: number, id: number): number;
	/** g_player: unit id of the local player. */
	g_player(): number;
	/** gt: game time in milliseconds. */
	gt(): number;
	/** The Tobject/Tunit/Titem/Tinfo/Tstate list of a class, in creation order. */
	entities(cls: number): readonly HostEntity[];
	/**
	 * `First T` (e = null) / `After e` on the live list of a class, for the entity loops of
	 * parser_loop.bb (p_loop_object=After p_loop_object): After works on an entity that the loop
	 * body freed, and finds entities created in the body. Optional: without it the loop walks
	 * the entities() snapshot and ends when its current entity is gone.
	 */
	entity_next?(cls: number, e: HostEntity | null): HostEntity | null;
	/** TC<class>\typ after a successful con_<class>(id); 0 when the entity does not exist. */
	entity_typ(cls: number, id: number): number;
	/** Dobject_name$/Dunit_name$/Ditem_name$/Dinfo_name$/Dstate_name$(typ). */
	def_name(cls: number, typ: number): string;
	/** ReadFile + ReadLine until Eof: the lines of a text file, null if it cannot be opened. */
	ReadFileLines(path: string): string[] | null;
	/** ReadFile: raw bytes, null if it cannot be opened. */
	ReadFileBytes(path: string): Uint8Array | null;
	/** WriteFile: 1 on success. */
	WriteFileBytes(path: string, data: Uint8Array): number;
	/** FreeEntity for the pivots kept in the kill cache (Tpkill\h). */
	FreeEntity(h: unknown): void;
	/** load_res(file$, Cres_image, 1): image handle for a dialogue "ibutton", 0 if it cannot be loaded. */
	load_res(file: string, typ: number, mode: number): number;
	/** Ditem_iconh(typ): icon handle of an item type, 0 if the type is not defined (dialogue trades). */
	Ditem_iconh(typ: number): number;
}

export interface ScriptHost
	extends CoreHost,
		HostCore,
		HostBasic1,
		HostBasic2,
		HostInterface,
		HostWorld,
		HostReturns {}

/** One recorded call of an unimplemented host method. */
export interface HostCall {
	method: string;
	/** Arguments without the leading ParseCtx. */
	args: unknown[];
}

export interface RecordingHost {
	host: ScriptHost;
	calls: HostCall[];
}

/**
 * The default "unimplemented" host. Methods present in `impl` are used;
 * every other method records its call and returns undefined.
 */
export function createRecordingHost(impl: Partial<ScriptHost> = {}, record = true): RecordingHost {
	const calls: HostCall[] = [];
	const stubs = new Map<string, (...a: unknown[]) => undefined>();
	const host = new Proxy(impl as ScriptHost, {
		get(target, prop) {
			if (typeof prop !== 'string') return undefined;
			const own = (target as unknown as Record<string, unknown>)[prop];
			if (own !== undefined) return own;
			let f = stubs.get(prop);
			if (!f) {
				f = (...a: unknown[]) => {
					if (record) {
						// cmd_* methods get the ParseCtx first; do not keep it.
						const first = a[0] as { p_com?: unknown } | undefined;
						const args =
							first && typeof first === 'object' && 'p_com' in first ? a.slice(1) : a;
						calls.push({ method: prop, args });
					}
					return undefined;
				};
				stubs.set(prop, f);
			}
			return f;
		}
	});
	return { host, calls };
}
