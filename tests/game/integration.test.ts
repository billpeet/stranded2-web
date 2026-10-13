/**
 * Integration round: behaviour that only exists when the packages run together
 * (each was ported against mocks of the others). Every test names the original
 * lines it follows.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot } from '../../src/lib/s2/bb3d';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { Cclass_object, Cclass_unit, Cstate_fire } from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as states from '../../src/lib/s2/game/handle_states';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { parse_task } from '../../src/lib/s2/game/parser_functions';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime, envHooks } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, New, TYPES, Tobject, Tstate, Tunit } from '../../src/lib/s2/game/types';
import { host as uiHost } from '../../src/lib/s2/ui/host';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const SEP = '\xa6';

describe.skipIf(!existsSync(MOD))('integration: wiring between the packages', () => {
	let now = 0;

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
	});

	afterEach(() => {
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
	});

	it('e_environment_setweather: rain and snow free every fire state (e_environment.bb:982-988)', () => {
		const free_state = vi.spyOn(states, 'free_state').mockReturnValue(1);
		const mk = (typ: number, cls: number, id: number) => {
			const s = New(Tstate);
			s.typ = typ;
			s.parent_class = cls;
			s.parent_id = id;
		};
		mk(Cstate_fire, Cclass_object, 5);
		mk(1, Cclass_unit, 1);
		mk(Cstate_fire, Cclass_unit, 9);
		envHooks().free_fire_states();
		expect(free_state.mock.calls).toEqual([
			[Cstate_fire, Cclass_object, 5],
			[Cstate_fire, Cclass_unit, 9]
		]);
	});

	it('script parent_con: the TC global is Null when the id does not exist (parentchild.bb:89-109)', () => {
		const o = New(Tobject);
		o.id = 7;
		o.typ = 1;
		o.h = CreatePivot();
		G.TCobject = o;
		// exists(): parent_con of a missing object leaves TCobject Null, as its For-Each does
		parse_task(0, 0, 'x', '', 'on:x {' + SEP + '$a=exists("object",99);' + SEP + '$b=exists("object",7);' + SEP + '}' + SEP);
		RT.script.parse_all();
		expect([var_get('a'), var_get('b')]).toEqual(['0', '1']);
		expect(G.TCobject).toBe(o);
		parse_task(0, 0, 'x', '', 'on:x {' + SEP + '$a=exists("object",99);' + SEP + '}' + SEP);
		RT.script.parse_all();
		expect(G.TCobject).toBeNull();
	});

	it('script loop("units") goes on after its body freed the current unit (parser_loop.bb: After p_loop_unit)', () => {
		for (const id of [11, 12, 13]) {
			const u = New(Tunit);
			u.id = id;
			u.typ = 2;
			u.h = CreatePivot();
		}
		// stand-in for "free": delete the unit the loop stands on
		const seen: number[] = [];
		const host = RT.script.host as unknown as Record<string, unknown>;
		host.cmd_msg = undefined;
		const real = RT.script.var_set.bind(RT.script);
		vi.spyOn(RT.script, 'var_set').mockImplementation((name: string, value: string) => {
			if (name === 'seen') {
				const id = Number(value);
				seen.push(id);
				for (const u of Each(Tunit)) if (u.id === id) TYPES.Tunit.list.delete(u);
			}
			return real(name, value);
		});
		parse_task(0, 0, 'x', '', 'on:x {' + SEP + 'loop("units") {' + SEP + '$seen=loop_id();' + SEP + '}' + SEP + '}' + SEP);
		RT.script.parse_all();
		expect(seen).toEqual([11, 12, 13]);
		expect([...Each(Tunit)]).toEqual([]);
	});

	it('the interface layer reaches the game: console, icons, sounds, map list globals', () => {
		expect(uiHost.Ditem_iconh(0)).toBe(0);
		G.sg_date = '01 Jan 2008';
		expect(uiHost.sg_date).toBe('01 Jan 2008');
		uiHost.con_add('integration line', 1);
		expect([...Each(TYPES.Tcon)].some((c) => (c as { txt: string }).txt.includes('integration line'))).toBe(true);
		const play = vi.spyOn(RT.audio, 'play').mockImplementation(() => {});
		uiHost.play('sfx_click');
		expect(play).toHaveBeenCalledWith(G.sfx_click);
	});
});
