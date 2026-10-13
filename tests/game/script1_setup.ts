/**
 * Shared set-up of the script1 tests (tests/game/script1*.test.ts): the
 * headless runtime of tests/game/example.test.ts, and helpers to run a
 * script through the real interpreter so that the handler
 * (script/commands/basic1.ts, basic2.ts) and the ScriptHost method
 * (game/script_host/script1.ts) are tested together.
 */
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { CreatePivot, PositionEntity, type BBEntity } from '../../src/lib/s2/bb3d';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, New, TYPES, Tinfo, Titem, Tobject, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

export const MOD = resolve('static/game/mod');

export async function setup(): Promise<void> {
	await createTestRuntime({ vfs: new NodeVfs(MOD) });
	setFrameScheduler((cb) => cb());
	let now = 1000;
	setClock(() => (now += 20));
	SeedRnd(0x1234);
	include_load_setup();
	await loadAllDefinitions();
	RT.script.clearErrors();
}

export function teardown(): void {
	disposeRuntime();
	resetGameState();
	resetDefs();
	clearDeferred();
	setFrameScheduler(null);
	setFrameHook(null);
	setCommandLine(null);
	setClock(() => performance.now());
	for (const t of Object.values(TYPES)) {
		try {
			DeleteEach(t);
		} catch {
			// the Tconst view
		}
	}
	CONST_STORE.clear();
	vi.restoreAllMocks();
}

/** Run commands as the global script. */
export function run(script: string): void {
	RT.script.run(script, 0, 0, '');
}

/** Run commands inside `on:<event> { }` of an entity (p_env_class / p_env_id / p_env_event are set). */
export function runAs(cls: number, id: number, event: string, script: string): void {
	RT.script.run(`on:${event} {\n${script}\n}`, cls, id, event);
}

/** p_return$ of a command used as a function. */
export function expr(e: string): string {
	run(`$r=${e};`);
	return var_get('r');
}

export function exprAs(cls: number, id: number, event: string, e: string): string {
	runAs(cls, id, event, `$r=${e};`);
	return var_get('r');
}

export const errors = (): string[] => RT.script.errors.map((e) => e.message);

export function pivot(x = 0, y = 0, z = 0): BBEntity {
	const p = CreatePivot();
	PositionEntity(p, x, y, z);
	return p;
}

export function unit(id: number, typ = 1, x = 0, y = 0, z = 0): Tunit {
	const u = New(Tunit);
	u.id = id;
	u.typ = typ;
	u.h = pivot(x, y, z);
	u.mh = u.h;
	return u;
}

export function object(id: number, typ = 1, x = 0, y = 0, z = 0): Tobject {
	const o = New(Tobject);
	o.id = id;
	o.typ = typ;
	o.h = pivot(x, y, z);
	return o;
}

export function item(id: number, typ = 1, x = 0, y = 0, z = 0): Titem {
	const i = New(Titem);
	i.id = id;
	i.typ = typ;
	i.count = 1;
	i.h = pivot(x, y, z);
	return i;
}

export function info(id: number, typ = 1, x = 0, y = 0, z = 0): Tinfo {
	const i = New(Tinfo);
	i.id = id;
	i.typ = typ;
	i.h = pivot(x, y, z);
	return i;
}

/** con_unit / con_item / con_object of the other packages: "For T=Each T: If T\id=id Then TC=T: Return 1". */
export function mockCon(): {
	con_unit: ReturnType<typeof vi.spyOn>;
	con_item: ReturnType<typeof vi.spyOn>;
	con_object: ReturnType<typeof vi.spyOn>;
} {
	const con_unit = vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
		for (const u of Tunit.list) {
			if (u.id === id) {
				G.TCunit = u;
				return 1;
			}
		}
		return 0;
	});
	const con_item = vi.spyOn(handle_items, 'con_item').mockImplementation((id: number) => {
		for (const u of Titem.list) {
			if (u.id === id) {
				G.TCitem = u;
				return 1;
			}
		}
		return 0;
	});
	const con_object = vi.spyOn(handle_objects, 'con_object').mockImplementation((id: number) => {
		for (const u of Tobject.list) {
			if (u.id === id) {
				G.TCobject = u;
				return 1;
			}
		}
		return 0;
	});
	return { con_unit, con_item, con_object };
}
