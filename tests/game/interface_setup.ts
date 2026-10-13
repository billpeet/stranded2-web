/**
 * Shared set-up of the interface tests (tests/game/interface*.test.ts): the
 * headless runtime of tests/game/example.test.ts plus mocks of the other
 * packages' functions that interface.bb / game_sequences.bb reach.
 */
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import * as consoleMod from '../../src/lib/s2/game/console';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as game_focus from '../../src/lib/s2/game/game_focus';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as motionblur from '../../src/lib/s2/game/motionblur';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, First, After, New, TYPES, Titem, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

export const MOD = resolve('static/game/mod');

/** MilliSecs() of the test: set clock.now. */
export const clock = { now: 1000 };

export async function setup(): Promise<void> {
	await createTestRuntime({ vfs: new NodeVfs(MOD) });
	setFrameScheduler((cb) => cb());
	clock.now = 1000;
	setClock(() => clock.now);
	SeedRnd(0x1234);
	include_load_setup();
	await loadAllDefinitions();
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

/** con_unit(id) of handle_units.bb as far as the interface needs it: sets TCunit. */
export function mockConUnit() {
	return vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
		for (let u = First(Tunit); u !== null; u = After(Tunit, u)) {
			if (u.id === id) {
				G.TCunit = u;
				return 1;
			}
		}
		return 0;
	});
}

/** A player unit (id 1, type 1) with full health; g_player / g_cplayer set. */
export function mkPlayer(health = 100): Tunit {
	const u = New(Tunit);
	u.id = 1;
	u.typ = 1;
	u.health = health;
	u.health_max = 100;
	u.player_name = 'Tester';
	G.g_player = 1;
	G.g_cplayer = u;
	return u;
}

export function mkItem(id: number, typ: number, count: number, parent_class: number, parent_id: number): Titem {
	const it = New(Titem);
	it.id = id;
	it.typ = typ;
	it.count = count;
	it.parent_class = parent_class;
	it.parent_id = parent_id;
	return it;
}

/** The mocks every interface() frame needs. */
export function mockFrameBasics() {
	return {
		con_unit: mockConUnit(),
		mb_override: vi.spyOn(motionblur, 'mb_override').mockImplementation(() => {}),
		parent_h: vi.spyOn(parentchild, 'parent_h').mockImplementation(() => null),
		focus_draw: vi.spyOn(game_focus, 'focus_draw').mockImplementation(() => {}),
		con_add: vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {})
	};
}

/** Mouse over (x,y), left button released this frame (what a click on a gui button is). */
export function clickAt(x: number, y: number): void {
	G.in_mx = x;
	G.in_my = y;
	G.in_mrelease[1] = 1;
}
