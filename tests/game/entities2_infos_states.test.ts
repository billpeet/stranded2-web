/**
 * Package entities2: handle_infos.bb and handle_states.bb. Expected values are derived from the
 * original source, branch by branch; other packages' functions are mocked on their modules.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CameraProject,
	CountChildren,
	CreateCube,
	CreatePivot,
	CreateTexture,
	EntityName,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Int, Rand, Rnd, SEP_LINE, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { CreateImage } from '../../src/lib/s2/gfx2d';
import { injectKeyDown } from '../../src/lib/s2/input';
import * as ai_signals from '../../src/lib/s2/game/ai_signals';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import {
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cp_firespark,
	Cp_flames,
	Cp_rwave,
	Cp_smoke,
	Cp_spark,
	Cp_spawn,
	Cp_splatter,
	Csection_editor,
	Cstate_bleeding,
	Cstate_bloodrush,
	Cstate_dizzy,
	Cstate_electroshock,
	Cstate_eternalfire,
	Cstate_fire,
	Cstate_flare,
	Cstate_frostbite,
	Cstate_ghost,
	Cstate_healing,
	Cstate_intoxication,
	Cstate_light,
	Cstate_link,
	Cstate_particles,
	Cstate_pc_build,
	Cstate_phy,
	Cstate_wet,
	ai_attract,
	ai_distract
} from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { Dinfo_name, Ditem_modelh, Dstate_a } from '../../src/lib/s2/game/defs_arrays';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as handle_all from '../../src/lib/s2/game/handle_all';
import {
	con_info,
	draw_info,
	frap_info,
	free_info,
	get_info,
	info_area,
	info_setuploudspeaker,
	info_setupsprite,
	info_spawncontrol,
	info_stv,
	info_vts,
	serialpeak_info,
	set_info,
	update_info
} from '../../src/lib/s2/game/handle_infos';
import { set_item } from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import {
	attach_state,
	free_state,
	get_state,
	get_state_process,
	look_state,
	set_state,
	state_depleted,
	state_impactfx,
	state_inrange,
	update_state
} from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as motionblur from '../../src/lib/s2/game/motionblur';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, First, New, TYPES, Tinfo, Titem, Tobject, Tp, Tstate, Tunit, isNull } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const LEAF = 16; // Bloodleaf: weight 50, no script

describe.skipIf(!existsSync(MOD))('entities2: handle_infos, handle_states', () => {
	let now = 0;
	let pAdd: ReturnType<typeof vi.fn>;
	let cache: ReturnType<typeof vi.spyOn>;
	let emu: ReturnType<typeof vi.spyOn>;
	const parents = new Map<string, Handle>();
	const P = { material: 1, static: 0, statepos: 1 };

	function unit(id: number, typ = 1): Tunit {
		const u = New(Tunit);
		u.id = id;
		u.typ = typ;
		u.h = CreatePivot();
		parents.set(Cclass_unit + ':' + id, u.h);
		return u;
	}
	function object(id: number, x = 0, z = 0, typ = 1): Tobject {
		const o = New(Tobject);
		o.id = id;
		o.typ = typ;
		o.h = CreatePivot();
		PositionEntity(o.h, x, 0, z);
		parents.set(Cclass_object + ':' + id, o.h);
		return o;
	}
	function info(typ: number, x = 0, y = 0, z = 0): Tinfo {
		expect(set_info(-1, typ, x, y, z)).toBe(0);
		return G.TCinfo!;
	}
	function state(typ: number, cls: number, id: number, value_f = 3): Tstate {
		const s = New(Tstate);
		Object.assign(s, { typ, parent_class: cls, parent_id: id, value_f });
		return s;
	}
	const states = () => [...Each(Tstate)].map((s) => `${s.typ}@${s.parent_class}:${s.parent_id}=${s.value_f}`);
	const typs = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map((c) => c[3]);

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		parents.clear();
		Object.assign(P, { material: 1, static: 0, statepos: 1 });

		vi.spyOn(parentchild, 'free_childs').mockImplementation(() => {});
		vi.spyOn(parentchild, 'parent_h').mockImplementation((c: number, i: number) => parents.get(c + ':' + i) ?? null);
		vi.spyOn(parentchild, 'parent_material').mockImplementation(() => P.material);
		vi.spyOn(parentchild, 'parent_stateposstatic').mockImplementation(() => P.static);
		vi.spyOn(parentchild, 'parent_statepos').mockImplementation(() => {
			G.tmp_x = 1;
			G.tmp_y = 2;
			G.tmp_z = 3;
			return P.statepos;
		});
		vi.spyOn(parentchild, 'parent_stateposvertex').mockImplementation(() => {
			G.tmp_x = 4;
			G.tmp_y = 5;
			G.tmp_z = 6;
			return 1;
		});
		vi.spyOn(parentchild, 'parent_pos').mockImplementation((c: number, i: number) => {
			const h = parents.get(c + ':' + i) ?? null;
			if (h === null) return 0;
			G.tmp_x = EntityX(h);
			G.tmp_y = EntityY(h);
			G.tmp_z = EntityZ(h);
			return 1;
		});
		vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
			for (const u of Each(Tunit)) {
				if (u.id === id) {
					G.TCunit = u;
					return 1;
				}
			}
			return 0;
		});
		pAdd = vi.fn(() => {
			const p = New(Tp);
			p.h = CreatePivot();
			G.TCp = p;
		});
		vi.spyOn(particles, 'p_add').mockImplementation(pAdd as never);
		vi.spyOn(functions, 'incam').mockImplementation(() => 1);
		cache = vi.spyOn(RT.script, 'set_parsecache');
		emu = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
		vi.spyOn(RT.audio, 'sfx_emit').mockImplementation(() => 55);
		G.gfx_p_flare[0] = CreateTexture(8, 8); // load_media has no textures without a renderer
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

	// =========================================================================== infos

	describe('set_info / get_info / con_info / free_info / serialpeak_info', () => {
		it('invalid typ: -1; a created info returns 0 (the original has no Return id)', () => {
			expect(set_info(-1, 99, 0, 0, 0)).toBe(-1);
			expect(First(Tinfo)).toBeNull();
			const defvar = vi.spyOn(RT.script, 'defvar_oncreate');
			G.info_serial = 6;
			expect(set_info(-1, 10, 1, 2, 3)).toBe(0);
			const i = G.TCinfo!;
			expect([i.id, i.typ, G.info_serial]).toEqual([7, 10, 7]);
			expect([EntityX(i.h), EntityY(i.h), EntityZ(i.h)]).toEqual([1, 2, 3]);
			expect(defvar).toHaveBeenCalledWith(Cclass_info, 7, 10);
			expect(i.ints).toEqual([0, 0, 0]);
			G.tmp_loading = 1;
			defvar.mockClear();
			expect(set_info(40, 10, 0, 0, 0)).toBe(0);
			expect(G.TCinfo!.id).toBe(40);
			expect(G.info_serial).toBe(7);
			expect(defvar).not.toHaveBeenCalled();
		});

		it('sprite infos (typ 5) get their defaults; vars to string and back', () => {
			const i = info(5);
			expect(i.ints).toEqual([255, 255, 255]);
			expect(i.floats).toEqual([1, 1, 1]);
			expect(i.strings).toEqual(['', '0', '0']);
			info_vts();
			expect(i.vars).toBe(['255', '255', '255', '1.0', '1.0', '1.0', '', '0', '0', ''].join(SEP_LINE));
			i.vars = ['1', '-2', '3x', '0.5', '2', '-1.25', 'a b', 'x', 'y', ''].join(SEP_LINE);
			info_stv();
			expect(i.ints).toEqual([1, -2, 3]);
			expect(i.floats).toEqual([0.5, 2, -1.25]);
			expect(i.strings).toEqual(['a b', 'x', 'y']);
		});

		it('lookup, serial peak, free (a loudspeaker frees its sound and stops its channel)', () => {
			const a = info(10);
			const b = info(47);
			b.id = 30;
			G.TCinfo = null;
			expect(con_info(a.id)).toBe(1);
			expect(G.TCinfo).toBe(a);
			expect(con_info(999)).toBe(0);
			expect(get_info(b.h)).toBe(30);
			expect(G.TCinfo).toBe(b);
			expect(get_info(CreatePivot())).toBe(-1);
			serialpeak_info();
			expect(G.info_serial).toBe(30);

			const freeSound = vi.spyOn(RT.audio.bb, 'FreeSound').mockImplementation(() => {});
			const stop = vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {});
			a.ints[0] = 5;
			a.ints[1] = 6;
			expect(free_info(a.id)).toBe(1); // not a loudspeaker
			expect(freeSound).not.toHaveBeenCalled();
			expect(parentchild.free_childs).toHaveBeenCalledWith(Cclass_info, a.id);
			b.ints[0] = 5;
			b.ints[1] = 6;
			expect(free_info(30)).toBe(1);
			expect(freeSound).toHaveBeenCalledWith(5);
			expect(stop).toHaveBeenCalledWith(6);
			expect(First(Tinfo)).toBeNull();
			expect(free_info(30)).toBe(0);
		});

		it('in the editor the info is a pickable cube; info_setupsprite without a texture rebuilds the plain handle', () => {
			const game = info(5, 1, 2, 3);
			const old = game.h;
			info_setupsprite(game);
			expect(game.h).not.toBe(old);
			expect([EntityX(game.h), EntityY(game.h), EntityZ(game.h)]).toEqual([1, 2, 3]);
			expect(CountChildren(game.h)).toBe(0);

			game.strings[0] = 'gfx\\this file does not exist.bmp';
			info_setupsprite(game);
			expect(EntityName(game.h)).toBe('');

			G.m_section = Csection_editor;
			const ed = info(5, 4, 5, 6);
			info_setupsprite(ed);
			expect([EntityX(ed.h), EntityY(ed.h), EntityZ(ed.h)]).toEqual([4, 5, 6]);
		});

		it('info_setupsprite with a texture: the sprite is the handle (game) or the child "model" of the cube (editor)', async () => {
			const file = 'sys\\gfx\\defaulticon.bmp';
			await RT.world.preload([file]);
			const i = info(5, 1, 2, 3);
			i.strings[0] = file;
			info_setupsprite(i);
			expect(EntityName(i.h)).toBe('model');
			expect([EntityX(i.h), EntityY(i.h), EntityZ(i.h)]).toEqual([1, 2, 3]);

			G.m_section = Csection_editor;
			const e = info(5, 7, 8, 9);
			e.strings[0] = file;
			info_setupsprite(e);
			expect(EntityName(e.h)).toBe('');
			expect(CountChildren(e.h)).toBe(1);
			expect([EntityX(e.h), EntityY(e.h), EntityZ(e.h)]).toEqual([7, 8, 9]);
		});

		it('info_setuploudspeaker', () => {
			const load = vi.spyOn(RT.audio.bb, 'LoadSound').mockImplementation(() => 9);
			const loop = vi.spyOn(RT.audio.bb, 'LoopSound').mockImplementation(() => {});
			const stop = vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {});
			const sfx = vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 77);
			const i = info(47);
			// no file: stop and clear, but not while a map loads
			i.ints[0] = 3;
			i.ints[1] = 4;
			G.tmp_loading = 1;
			info_setuploudspeaker(i);
			expect(i.ints.slice(0, 2)).toEqual([3, 4]);
			G.tmp_loading = 0;
			info_setuploudspeaker(i);
			expect(stop).toHaveBeenCalledWith(4);
			expect(i.ints.slice(0, 2)).toEqual([0, 0]);
			// a file that does not exist
			i.strings[0] = 'sfx\\nope.wav';
			info_setuploudspeaker(i);
			expect(load).not.toHaveBeenCalled();
			// an existing file, range 0: looped and played everywhere at once
			i.strings[0] = 'sys\\infos.inf';
			info_setuploudspeaker(i);
			expect(load).toHaveBeenCalledWith('sys\\infos.inf');
			expect(loop).toHaveBeenCalledWith(9);
			expect(sfx).toHaveBeenCalledWith(9);
			expect(i.ints.slice(0, 2)).toEqual([9, 77]);
			// with a range: loaded, not played
			i.ints[1] = 0;
			i.floats[0] = 50;
			sfx.mockClear();
			info_setuploudspeaker(i);
			expect(sfx).not.toHaveBeenCalled();
		});
	});

	describe('update_info', () => {
		it('typ 10, range trigger: the six comparisons, only when active', () => {
			const inrange = vi.spyOn(handle_all, 'ha_inrange').mockImplementation(() => 3);
			const i = info(10);
			i.ints = [Cclass_unit, 7, 3];
			i.floats = [60.5, 0, 0];
			update_info();
			expect(inrange).not.toHaveBeenCalled(); // floats[1]<>1
			i.floats[1] = 1;
			const want: Record<number, number[]> = { 2: [0, 1, 0, 1, 0, 1], 3: [1, 0, 0, 1, 1, 0], 4: [0, 0, 1, 0, 1, 1] };
			for (const target of [2, 3, 4]) {
				i.ints[2] = target;
				const got: number[] = [];
				for (let mode = 0; mode <= 5; mode++) {
					i.floats[2] = mode;
					cache.mockClear();
					update_info();
					got.push(cache.mock.calls.length);
				}
				expect(got).toEqual(want[target]); // c=3 against target: = > < >= <= <>
			}
			expect(inrange).toHaveBeenLastCalledWith(i.h, 60, Cclass_unit, 7); // Int(60.5): to even
			expect(cache).toHaveBeenLastCalledWith(Cclass_info, i.id, 'trigger', 'triggered');
			i.floats[2] = 6;
			cache.mockClear();
			update_info();
			expect(cache).not.toHaveBeenCalled();
		});

		it('typ 11, time trigger: every x calls', () => {
			const i = info(11);
			i.ints = [0, 3, 0];
			i.floats[1] = 1;
			update_info();
			update_info();
			expect(cache).not.toHaveBeenCalled();
			expect(i.timer).toBe(2);
			update_info();
			expect(i.timer).toBe(0);
			expect(cache).toHaveBeenCalledWith(Cclass_info, i.id, 'trigger', 'triggered (every x seconds)');
		});

		it('typ 11, time trigger: every x game minutes, counted on time updates', () => {
			const i = info(11);
			i.ints = [1, 25, 0];
			i.floats[1] = 1;
			Object.assign(G, { map_day: 2, map_hour: 0, map_minute: 5, map_lday: 1, map_lhour: 23, map_lminute: 55 });
			update_info();
			expect(i.timer).toBe(0); // map_timeupdate=0
			G.map_timeupdate = 1;
			update_info();
			expect(i.timer).toBe(10);
			update_info();
			expect(cache).not.toHaveBeenCalled();
			update_info(); // 30 >= 25
			expect(i.timer).toBe(0);
			expect(cache).toHaveBeenCalledWith(Cclass_info, i.id, 'trigger', 'triggered (every x game minutes)');
		});

		it('typ 11, time trigger: at a time (once, deactivates itself and writes vars) and daily', () => {
			const intime = vi.spyOn(functions, 'intime').mockImplementation(() => 1);
			const daily = vi.spyOn(functions, 'indailytime').mockImplementation(() => 1);
			const i = info(11);
			i.ints = [2, 3, 14];
			i.floats = [29.5, 1, 0];
			update_info();
			expect(intime).not.toHaveBeenCalled();
			G.map_timeupdate = 1;
			update_info();
			expect(intime).toHaveBeenCalledWith(3, 14, 30); // day, hour, Int(29.5)
			expect(i.floats[1]).toBe(0);
			expect(i.vars).toBe(['2', '3', '14', '29.5', '0.0', '0.0', '', '', '', ''].join(SEP_LINE));
			expect(cache).toHaveBeenCalledWith(Cclass_info, i.id, 'trigger', 'triggered (at defined time)');
			cache.mockClear();
			update_info();
			expect(cache).not.toHaveBeenCalled();

			i.ints[0] = 3;
			i.floats[1] = 1;
			update_info();
			expect(daily).toHaveBeenCalledWith(3, 14);
			expect(cache).toHaveBeenCalledWith(Cclass_info, i.id, 'trigger', 'triggered (daily at defined time)');
			expect(i.floats[1]).toBe(1);
			daily.mockImplementation(() => 0);
			cache.mockClear();
			update_info();
			i.ints[0] = 4; // "Sleep": removed
			update_info();
			expect(cache).not.toHaveBeenCalled();
		});

		it('typ 12, item count trigger: player or given parent; modes 3 and 4 are > and < (not >=, <=)', () => {
			Ditem_modelh.set(LEAF, CreateCube());
			G.g_player = 1;
			set_item(-1, LEAF, 0, 0, 0, 4, 1);
			Object.assign(G.TCitem!, { parent_class: Cclass_unit, parent_id: 1 });
			set_item(-1, LEAF, 0, 0, 0, 9, 1);
			Object.assign(G.TCitem!, { parent_class: Cclass_object, parent_id: 7 });
			const i = info(12);
			G.TCinfo = i;
			i.ints = [0, 0, LEAF];
			i.floats = [4, 1, 0];
			const run = (mode: number): number => {
				i.floats[2] = mode;
				cache.mockClear();
				update_info();
				return cache.mock.calls.length;
			};
			expect([0, 1, 2, 3, 4, 5].map(run)).toEqual([1, 0, 0, 0, 0, 0]); // c=4, want 4
			i.floats[0] = 3;
			expect([0, 1, 2, 3, 4, 5].map(run)).toEqual([0, 1, 0, 1, 0, 1]);
			i.floats[0] = 5;
			expect([0, 1, 2, 3, 4, 5].map(run)).toEqual([0, 0, 1, 0, 1, 1]);
			i.ints = [Cclass_object, 7, LEAF];
			i.floats[0] = 9;
			expect(run(0)).toBe(1);
			expect(cache).toHaveBeenLastCalledWith(Cclass_info, i.id, 'trigger', 'triggered');
			i.floats[1] = 0;
			expect(run(0)).toBe(0);
		});

		it('typ 43, fishing area: a ring wave and bubbles inside the radius while the camera is near', () => {
			const i = info(43, 10, 0, 20);
			i.floats[0] = 100;
			PositionEntity(G.cam, 10, 50, 20);
			SeedRnd(77);
			update_info();
			// the same draws in the order of the original
			SeedRnd(77);
			const want: unknown[][] = [];
			const pos = (): [number, number] => {
				const dir = Rand(360);
				const d = Rnd(100);
				return [f32(10 + f32(Math.fround(Math.sin(f32(f32(dir) * f32(0.017453292519943295)))) * d)), f32(20 - f32(Math.fround(Math.cos(f32(f32(dir) * f32(0.017453292519943295)))) * d))];
			};
			let [nx, nz] = pos();
			want.push([nx, 1, nz, Cp_rwave, Rnd(5, 10), Rnd(0.9, 1.5)]);
			for (let x = 0; x <= Rand(5, 10); x++) {
				[nx, nz] = pos();
				want.push([nx, f32(-Rnd(5, 50)), nz, 10, Rnd(1, 3)]);
			}
			expect(pAdd.mock.calls).toEqual(want);
			expect(want.length).toBeGreaterThan(1);

			pAdd.mockClear();
			PositionEntity(G.cam, 10, 50, 20 + 600); // 600-100 >= 500
			update_info();
			expect(pAdd).not.toHaveBeenCalled();
		});

		it('typ 46, AI area: attract / distract signal with the rounded radius', () => {
			const sig = vi.spyOn(ai_signals, 'ai_signal').mockImplementation((() => 0) as never);
			const i = info(46);
			i.floats[0] = 120.7;
			update_info();
			expect(sig).toHaveBeenLastCalledWith(Cclass_info, i.id, ai_attract, 121);
			i.ints[0] = 1;
			update_info();
			expect(sig).toHaveBeenLastCalledWith(Cclass_info, i.id, ai_distract, 121);
			i.ints[0] = 2;
			update_info();
			expect(sig).toHaveBeenCalledTimes(2);
		});

		it('typ 47, loudspeaker: everywhere, or only while the camera is in range', () => {
			const sfx = vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 77);
			const stop = vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {});
			const i = info(47);
			update_info();
			expect(sfx).not.toHaveBeenCalled(); // no sound loaded
			i.ints[0] = 9;
			update_info();
			update_info();
			expect(sfx).toHaveBeenCalledTimes(1); // channel kept
			expect(i.ints[1]).toBe(77);

			i.floats[0] = 50;
			PositionEntity(G.cam, 0, 0, 51);
			update_info();
			expect(stop).toHaveBeenCalledWith(77);
			expect(i.ints[1]).toBe(0);
			update_info();
			expect(stop).toHaveBeenCalledTimes(1);
			PositionEntity(G.cam, 0, 0, 50);
			update_info();
			expect(i.ints[1]).toBe(77);
			expect(sfx).toHaveBeenCalledTimes(2);
		});

		it('other info types do nothing', () => {
			info(5);
			update_info();
			expect(cache).not.toHaveBeenCalled();
			expect(pAdd).not.toHaveBeenCalled();
		});
	});

	it('info_area: inside when the distance does not exceed the radius', () => {
		const i = info(41, 0, 50, 0);
		i.floats[0] = 10;
		info(42, 100, 0, 100).floats[0] = 1000;
		expect(info_area(41, 6, 8)).toBe(1);
		expect(info_area(41, 6.5, 8)).toBe(0);
		expect(info_area(42, 6.5, 8)).toBe(1);
		expect(info_area(43, 0, 0)).toBe(0);
	});

	describe('info_spawncontrol', () => {
		function spawner(cls: number, typ: number, max: number): Tinfo {
			const i = info(45, 100, 0, 100);
			i.ints = [cls, typ, max];
			i.floats = [50, 1, 0];
			i.strings = ['2', '1', '0']; // at most 2 per run, every day
			return i;
		}
		beforeEach(() => {
			PositionEntity(G.cam, 100, 20, -200); // looks along +z at the area
			Ditem_modelh.set(LEAF, CreateCube());
		});

		it('items: fills up to the maximum, limited by the partial count, inside the radius on the ground', () => {
			const i = spawner(Cclass_item, LEAF, 5);
			set_item(-1, LEAF, 110, 0, 110, 1, 1); // one is there already
			set_item(-1, LEAF, 500, 0, 500, 1, 1); // outside: not counted
			G.ter = null;
			G.ter_groundy = 7;
			cache.mockClear();
			info_spawncontrol(i);
			expect(i.strings[2]).toBe('0'); // day counter reset
			const all = [...Each(Titem)];
			expect(all.length).toBe(4); // 5-1 = 4 wanted, 2 per run
			for (const n of all.slice(2)) {
				expect(Math.hypot(EntityX(n.h) - 100, EntityZ(n.h) - 100)).toBeLessThanOrEqual(50.001);
				expect(EntityY(n.h)).toBe(7);
				expect(cache).toHaveBeenCalledWith(Cclass_item, n.id, 'spawn');
			}
			expect(typs(pAdd)).toEqual(new Array(10).fill(Cp_spawn)); // 5+set_effects*10 per spawn, in view
			info_spawncontrol(i);
			expect([...Each(Titem)].length).toBe(6);
			info_spawncontrol(i); // 5 in the area: nothing missing
			expect([...Each(Titem)].length).toBe(6);
		});

		it('the day counter and the active flag; force overrides both', () => {
			const i = spawner(Cclass_item, LEAF, 1);
			i.strings[1] = '3';
			info_spawncontrol(i);
			info_spawncontrol(i);
			expect(i.strings[2]).toBe('2');
			expect(First(Titem)).toBeNull();
			info_spawncontrol(i);
			expect(i.strings[2]).toBe('0');
			expect([...Each(Titem)].length).toBe(1);

			const off = spawner(Cclass_item, LEAF, 2);
			off.floats[1] = 0;
			off.strings[0] = '0'; // no partial limit
			info_spawncontrol(off);
			expect([...Each(Titem)].length).toBe(1);
			off.strings = ['0', '9', '0'];
			info_spawncontrol(off, 1);
			expect([...Each(Titem)].length).toBe(2); // 2 wanted, 1 in the area
			expect(off.strings[2]).toBe('0');

			const other = info(10);
			other.strings[2] = '5';
			info_spawncontrol(other); // not a spawn control
			expect(other.strings[2]).toBe('5');
		});

		it('objects and units go through set_object / set_unit (+ ai_ini) and get the spawn event', () => {
			let serial = 100;
			const setObject = vi.spyOn(handle_objects, 'set_object').mockImplementation(((_id: number, typ: number, x: number, z: number) => {
				const o = object(++serial, x, z, typ);
				G.TCobject = o;
				return o.id;
			}) as never);
			const setUnit = vi.spyOn(handle_units, 'set_unit').mockImplementation(((_id: number, typ: number, x: number, z: number) => {
				const u = unit(++serial, typ);
				PositionEntity(u.h, x, 0, z);
				G.TCunit = u;
				return u.id;
			}) as never);
			const aiIni = vi.spyOn(ai_units, 'ai_ini').mockImplementation(() => {});
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});

			const o = spawner(Cclass_object, 1, 3);
			o.strings[0] = '0';
			object(1, 120, 120, 1); // counted
			object(2, 120, 120, 2); // other typ
			info_spawncontrol(o);
			expect(setObject).toHaveBeenCalledTimes(2);
			for (const c of setObject.mock.calls) {
				expect([c[0], c[1]]).toEqual([-1, 1]);
				expect(Math.hypot((c[2] as number) - 100, (c[3] as number) - 100)).toBeLessThanOrEqual(50.001);
			}
			expect(cache).toHaveBeenCalledWith(Cclass_object, 101, 'spawn');
			expect(cache).toHaveBeenCalledWith(Cclass_object, 102, 'spawn');

			const u = spawner(Cclass_unit, 5, 1);
			info_spawncontrol(u);
			expect(setUnit).toHaveBeenCalledTimes(1);
			expect(aiIni).toHaveBeenCalledTimes(1);
			expect(cache).toHaveBeenCalledWith(Cclass_unit, 103, 'spawn');

			// a failed set_object (TCobject Null) is skipped
			setObject.mockImplementation((() => {
				G.TCobject = null;
				return -1;
			}) as never);
			cache.mockClear();
			o.ints[2] = 10;
			info_spawncontrol(o);
			expect(cache).not.toHaveBeenCalled();
		});
	});

	describe('draw_info / frap_info (editor)', () => {
		beforeEach(() => {
			G.m_section = Csection_editor;
			G.gfx_icons = CreateImage(32, 32, 100);
			G.gfx_arrows = CreateImage(16, 16, 16);
			G.gfx_ex = CreateImage(8, 8);
			G.gfx_ey = CreateImage(8, 8);
			G.gfx_ez = CreateImage(8, 8);
			G.gfx_esel = CreateImage(8, 8);
		});

		it('draw_info: the range circle of triggers and areas only in info mode and near', () => {
			const range = vi.spyOn(editor_functions, 'editor_range').mockImplementation(() => {});
			const a = info(10, 30, 20, 100);
			a.floats[0] = 77.5;
			const b = info(41, -30, 20, 100);
			b.floats[0] = 12;
			info(36, 0, 20, 100);
			info(10, 0, 0, -500).floats[0] = 5; // behind the camera
			info(10, 0, 0, 1200).floats[0] = 5; // 1000 <= dist < 1500: icon only
			draw_info();
			expect(range).not.toHaveBeenCalled(); // in_opt(0)<>4
			G.in_opt[0] = 4;
			draw_info();
			expect(range.mock.calls).toEqual([
				[30, 20, 100, 78],
				[-30, 20, 100, 12]
			]);
		});

		it('frap_info: the green handle turns the info, with shift it moves it; delete frees it', () => {
			const i = info(10, 30, 20, 100);
			G.TCinfo = i;
			G.in_fraph = i.h;
			CameraProject(G.cam, 30, 40, 100); // the y handle: 20 units up
			const px = Int(ProjectedX());
			const py = Int(ProjectedY());
			Object.assign(G, { in_editor_sidebar: 0, in_frapdown: 0, in_mx: px, in_my: py, in_mxs: 8, in_mys: 4 });
			G.in_mdown[1] = 1;
			frap_info();
			expect([G.in_frapdown, G.in_cursorf]).toEqual([2, 4]);
			expect(EntityYaw(i.h)).toBeCloseTo(3, 4); // (8+4)*0.25
			expect(EntityY(i.h)).toBeCloseTo(20, 4);

			G.in_mdown[1] = 0;
			frap_info(); // still "down" state 2, button released: nothing moves
			expect(EntityYaw(i.h)).toBeCloseTo(3, 4);

			const j = info(10, -30, 20, 100);
			G.TCinfo = j;
			CameraProject(G.cam, -30, 40, 100);
			Object.assign(G, { in_frapdown: 0, in_mx: Int(ProjectedX()), in_my: Int(ProjectedY()) });
			G.in_mdown[1] = 1;
			injectKeyDown(42); // left shift held
			frap_info();
			expect([G.in_frapdown, G.in_cursorf]).toEqual([2, 2]);
			expect(EntityY(j.h)).toBeCloseTo(23, 4);
			expect(EntityYaw(j.h)).toBeCloseTo(0, 4);

			G.in_fraph = j.h;
			injectKeyDown(211);
			frap_info();
			expect(G.in_fraph).toBeNull();
			expect(isNull(Tinfo, j)).toBe(true);
			expect(isNull(Tinfo, i)).toBe(false);
		});
	});

	// =========================================================================== states

	describe('set_state', () => {
		it('creates the state with power 3, announces it, flags units for behaviour states', () => {
			expect(Dstate_a(Cstate_bleeding)).toBe(0);
			expect(Dstate_a(Cstate_frostbite)).toBe(1);
			const u = unit(1);
			expect(set_state(Cstate_bleeding, Cclass_unit, 1)).toBe(1);
			const s = G.TCstate!;
			expect([s.typ, s.parent_class, s.parent_id, s.value_f, s.light, s.h]).toEqual([Cstate_bleeding, Cclass_unit, 1, 3, null, null]);
			expect(G.pv_state).toBe(Cstate_bleeding);
			expect(emu).toHaveBeenLastCalledWith(Cclass_unit, 1, 'addstate');
			expect(u.states).toBe(0);
			set_state(Cstate_frostbite, Cclass_unit, 1);
			expect(u.states).toBe(1);
			const o = unit(2);
			set_state(Cstate_frostbite, Cclass_object, 2); // not a unit
			expect(o.states).toBe(0);
		});

		it('setting it again replaces the state and adds the old power', () => {
			set_state(Cstate_bleeding, Cclass_object, 1);
			set_state(Cstate_intoxication, Cclass_object, 1);
			set_state(Cstate_bleeding, Cclass_object, 1);
			set_state(Cstate_bleeding, Cclass_object, 1);
			expect(states()).toEqual(['2@1:1=3', '1@1:1=9']);
			expect(emu.mock.calls.map((c) => c[2])).toEqual(['addstate', 'addstate', 'freestate', 'addstate', 'freestate', 'addstate']);
		});

		it('fire: not in rain or snow, not on fireproof material, not under water (unless loading)', () => {
			object(1);
			G.env_cweather = 1;
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(0);
			expect(isNull(Tstate, G.TCstate)).toBe(true); // TCstate is left on the deleted state
			G.env_cweather = 2;
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(0);
			G.env_cweather = 3;
			P.material = 2; // Dmat_nofire(2)=1
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(0);
			P.material = 1;
			PositionEntity(parents.get('1:1')!, 0, -1, 0);
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(0);
			expect(emu).not.toHaveBeenCalled();
			expect(states()).toEqual([]);
			G.tmp_loading = 1;
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(1);
			expect(set_state(Cstate_fire, Cclass_object, 99)).toBe(1); // no handle: allowed
			expect(states()).toEqual(['4@1:1=3', '4@1:99=3']);
		});

		it('fire against wet: the weaker one goes, with a fizzle and smoke', () => {
			object(1);
			state(Cstate_wet, Cclass_object, 1, 5);
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(0); // 3-5
			expect(states()).toEqual(['11@1:1=2']);
			expect(RT.audio.sfx_emit).toHaveBeenCalledTimes(1);
			expect(typs(pAdd)).toEqual([Cp_smoke]);
			expect(set_state(Cstate_fire, Cclass_object, 1)).toBe(1); // wet 2-3 -> freed; fire 3-2
			expect(states()).toEqual(['4@1:1=1']);
			expect(G.TCstate!.light).toBeNull(); // parent_stateposstatic=0
		});

		it('wet against fire, and wet on eternal fire (which stays: the Delete after Exit never runs)', () => {
			object(1);
			state(Cstate_fire, Cclass_object, 1, 3);
			expect(set_state(Cstate_wet, Cclass_object, 1)).toBe(0); // both used up
			expect(states()).toEqual([]);
			state(Cstate_fire, Cclass_object, 1, 1);
			expect(set_state(Cstate_wet, Cclass_object, 1)).toBe(1);
			expect(states()).toEqual(['11@1:1=2']);

			object(2);
			state(Cstate_eternalfire, Cclass_object, 2, 0);
			pAdd.mockClear();
			expect(set_state(Cstate_wet, Cclass_object, 2)).toBe(1);
			expect(typs(pAdd)).toEqual([Cp_smoke, Cp_smoke, Cp_smoke]);
			expect(states()).toEqual(['11@1:1=2', '5@1:2=0', '11@1:2=3']);
		});

		it('fire and eternal fire get a light on parents with a static state position', () => {
			object(1);
			P.static = 1;
			set_state(Cstate_fire, Cclass_object, 1);
			const l = G.TCstate!.light;
			expect(l).not.toBeNull();
			expect([EntityX(l), EntityY(l), EntityZ(l)]).toEqual([1, 2, 3]);

			state(Cstate_wet, Cclass_object, 2, 9);
			pAdd.mockClear();
			set_state(Cstate_eternalfire, Cclass_object, 2);
			expect(G.TCstate!.value_f).toBe(0); // 3-3
			expect(G.TCstate!.light).not.toBeNull();
			expect(states()).toEqual(['4@1:1=3', '5@1:2=0']); // wet is freed
			expect(pAdd).not.toHaveBeenCalled(); // no handle for object 2: no smoke
		});

		it('electroshock, bloodrush, flare, light, particles', () => {
			set_state(Cstate_electroshock, Cclass_object, 1);
			const l = G.TCstate!.light;
			expect([EntityX(l), EntityY(l), EntityZ(l)]).toEqual([4, 5, 6]); // parent_stateposvertex
			state(Cstate_bloodrush, Cclass_unit, 1, 40);
			set_state(Cstate_bloodrush, Cclass_unit, 1);
			expect(G.TCstate!.value_f).toBe(2);
			set_state(Cstate_flare, Cclass_object, 1);
			let s = G.TCstate!;
			expect([s.value, s.value_s, EntityX(s.h), EntityY(s.h), EntityZ(s.h)]).toEqual([50, '255,255,255', 1, 2, 3]);
			set_state(Cstate_light, Cclass_object, 1);
			s = G.TCstate!;
			expect([s.value, s.value_s, s.h !== null]).toEqual([10, '255,255,255', true]);
			set_state(Cstate_particles, Cclass_object, 1);
			s = G.TCstate!;
			expect([s.value_s, s.r, s.g, s.b]).toEqual(['-1,-1,-1', -1, 0, 0]);
		});
	});

	it('look_state: colours from value_s', () => {
		set_state(Cstate_particles, Cclass_object, 1);
		G.TCstate!.value_s = '10, 20,30';
		look_state();
		expect([G.TCstate!.r, G.TCstate!.g, G.TCstate!.b]).toEqual([10, 20, 30]);
		set_state(Cstate_flare, Cclass_object, 1);
		G.TCstate!.value_s = '1,2,3';
		G.TCstate!.value = 7;
		look_state();
		set_state(Cstate_light, Cclass_object, 1);
		G.TCstate!.value = 0; // range untouched
		look_state();
		G.TCstate = state(Cstate_light, Cclass_object, 2); // no handle: only the split
		G.TCstate.value_s = '9,8,7';
		look_state();
		expect(G.splits.slice(0, 3)).toEqual(['9', '8', '7']);
		G.TCstate = state(Cstate_bleeding, Cclass_object, 2);
		G.TCstate.value_s = 'x';
		look_state();
		expect(G.splits[0]).toBe('9');
	});

	it('attach_state: by the class and id of the handle', () => {
		const h = CreatePivot();
		const getclass = vi.spyOn(handle_all, 'ha_getclass').mockImplementation(() => {
			G.tmp_class = Cclass_unit;
			G.tmp_id = 4;
			return 1;
		});
		expect(attach_state(h, Cstate_bleeding)).toBe(1);
		expect(getclass).toHaveBeenCalledWith(h, 1);
		expect(states()).toEqual(['1@2:4=3']);
		expect(attach_state(h, Cstate_bleeding, Cclass_object, 0)).toBe(0); // only on objects
		expect(getclass).toHaveBeenLastCalledWith(h, 0);
		expect(attach_state(h, Cstate_bleeding, Cclass_unit)).toBe(1);
		G.env_cweather = 1;
		expect(attach_state(h, Cstate_fire)).toBe(0); // set_state refused
		getclass.mockImplementation(() => 0);
		expect(attach_state(h, Cstate_bleeding)).toBe(0);
		expect(states()).toEqual(['1@2:4=6']);
	});

	it('free_state: entities, linked object, unit flag, event', () => {
		const freeObject = vi.spyOn(handle_objects, 'free_object').mockImplementation(() => 1);
		const u = unit(1);
		set_state(Cstate_frostbite, Cclass_unit, 1);
		set_state(Cstate_electroshock, Cclass_unit, 1); // a=1 as well, has a light
		set_state(Cstate_bleeding, Cclass_unit, 1);
		expect(u.states).toBe(1);
		emu.mockClear();
		expect(free_state(Cstate_frostbite, Cclass_unit, 1)).toBe(1);
		expect(u.states).toBe(1); // electroshock still there
		expect(emu).toHaveBeenCalledWith(Cclass_unit, 1, 'freestate');
		expect(G.pv_state).toBe(Cstate_frostbite);
		expect(free_state(Cstate_electroshock, Cclass_unit, 1)).toBe(1);
		expect(u.states).toBe(0);
		expect(free_state(Cstate_electroshock, Cclass_unit, 1)).toBe(0);
		expect(freeObject).not.toHaveBeenCalled();

		state(Cstate_link, Cclass_object, 9).value = 33;
		expect(free_state(Cstate_link, Cclass_object, 9)).toBe(1);
		expect(freeObject).toHaveBeenCalledWith(33);
		expect(states()).toEqual(['1@2:1=3']);
	});

	it('get_state, get_state_process, state_depleted', () => {
		const a = state(Cstate_wet, Cclass_unit, 1);
		const b = state(Cstate_pc_build, Cclass_unit, 1);
		G.TCstate = null;
		expect(get_state(Cstate_wet, Cclass_unit, 1)).toBe(1);
		expect(G.TCstate).toBe(a);
		expect(get_state(Cstate_wet, Cclass_unit, 2)).toBe(0);
		expect(get_state(Cstate_wet, Cclass_object, 1)).toBe(0);
		expect(get_state_process(Cclass_unit, 1)).toBe(1);
		expect(G.TCstate).toBe(b);
		expect(get_state_process(Cclass_unit, 2)).toBe(0);
		b.typ = 99;
		expect(get_state_process(Cclass_unit, 1)).toBe(0);
		expect([state_depleted(Cstate_fire, 1), state_depleted(Cstate_wet, 1), state_depleted(Cstate_fire, 0), state_depleted(Cstate_fire, 2)]).toEqual([1, 0, 0, 0]);
	});

	it('state_inrange: a state of the typ whose position is within the range of the entity', () => {
		const root = CreatePivot();
		expect(state_inrange(root, Cstate_fire)).toBe(0);
		state(Cstate_fire, Cclass_object, 1); // mocked position (1,2,3)
		PositionEntity(root, 1, 2, 51);
		expect(state_inrange(root, Cstate_fire)).toBe(1); // 48 <= Cworld_userange
		expect(state_inrange(root, Cstate_wet)).toBe(0);
		PositionEntity(root, 1, 2, 52);
		expect(state_inrange(root, Cstate_fire)).toBe(0);
		expect(state_inrange(root, Cstate_fire, 49)).toBe(1);
		P.statepos = 0; // the parent has no position
		expect(state_inrange(root, Cstate_fire, 1000)).toBe(0);
	});

	it('state_impactfx: sparks and smoke; the loop limit is drawn again on every pass', () => {
		const h = CreatePivot();
		PositionEntity(h, 1, 2, 3);
		for (const st of [Cstate_bleeding, Cstate_wet, Cstate_phy]) state_impactfx(st, h);
		expect(pAdd).not.toHaveBeenCalled();

		SeedRnd(5);
		state_impactfx(Cstate_intoxication, h);
		SeedRnd(5);
		let want: unknown[][] = [];
		for (let i = 0; i <= Rand(3, 5); i++) want.push([1, 2, 3, Cp_spark, Rand(1, 2), 3]);
		want.push([1, 2, 3, Cp_smoke, Rnd(8, 14), Rnd(1, 1.5)]);
		expect(pAdd.mock.calls).toEqual(want);

		for (const st of [Cstate_fire, Cstate_eternalfire]) {
			pAdd.mockClear();
			SeedRnd(6);
			state_impactfx(st, h);
			SeedRnd(6);
			want = [[1, 2, 3, Cp_flames, 5, 1]];
			for (let i = 0; i <= Rand(3, 5); i++) want.push([1, 2, 3, Cp_firespark, Rand(2, 6), 1]);
			for (let i = 0; i <= Rand(3, 5); i++) want.push([1, 2, 3, Cp_spark, Rand(1, 2), 3]);
			expect(pAdd.mock.calls).toEqual(want);
		}
	});

	describe('update_state', () => {
		let damage: ReturnType<typeof vi.spyOn>;
		let playing: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			damage = vi.spyOn(handle_all, 'ha_damage').mockImplementation(() => 1);
			playing = vi.spyOn(RT.audio.bb, 'ChannelPlaying').mockImplementation(() => 1);
		});

		it('resets the per-frame overrides; debug text with the count', () => {
			G.set_mb_alpha_override = 0.5;
			G.set_xinvert = 1;
			state(Cstate_wet, Cclass_object, 1);
			state(Cstate_wet, Cclass_object, 2);
			update_state();
			expect([G.set_mb_alpha_override, G.set_xinvert, G.set_debug_rt_states]).toEqual([0, 0, '']);
			G.set_debug_rt = 1;
			update_state();
			expect(G.set_debug_rt_states).toBe('20 ms States (2)');
		});

		it('physics: pushes the item, decays on the 100 ms tick, ends below 0.001', () => {
			Ditem_modelh.set(LEAF, CreateCube());
			const id = set_item(-1, LEAF, 0, 0, 0, 1, 1);
			const it = G.TCitem!;
			const s = state(Cstate_phy, Cclass_item, id);
			Object.assign(s, { fx: 1, fy: 2, fz: -1, x: 0.5, y: 0.5, z: 0.5 });
			update_state();
			expect([EntityX(it.h), EntityY(it.h), EntityZ(it.h)]).toEqual([1, 2, -1]);
			expect(s.fx).toBe(1);
			G.in_gt100go = 1;
			update_state();
			expect([EntityX(it.h), s.fx, s.fy, s.fz]).toEqual([2, 0.5, 1, -0.5]);
			Object.assign(s, { fx: 0.001, fy: 0.001, fz: 0.001 });
			update_state();
			expect(isNull(Tstate, s)).toBe(true);
			expect(emu).not.toHaveBeenCalled(); // plain Delete, no freestate event

			const u = unit(3);
			Object.assign(state(Cstate_phy, Cclass_unit, 3), { fx: 0, fy: 5, fz: 0, x: 1, y: 1, z: 1 });
			update_state();
			expect(EntityY(u.h)).toBe(5);
		});

		it('bleeding: blood every 500 ms, damage every 5 s (not in the editor, not with power 0)', () => {
			const s = state(Cstate_bleeding, Cclass_unit, 1, 4);
			update_state();
			expect(pAdd).not.toHaveBeenCalled();
			G.in_gt500go = 1;
			update_state();
			expect(pAdd.mock.calls.map((c) => c.slice(0, 4))).toEqual(new Array(3).fill([1, 2, 3, Cp_splatter]));
			expect(damage).not.toHaveBeenCalled();
			G.in_gt5000go = 1;
			update_state();
			expect(damage).toHaveBeenCalledWith(Cclass_unit, 1, 4);
			damage.mockClear();
			s.value_f = 0;
			update_state();
			s.value_f = 4;
			G.m_section = Csection_editor;
			update_state();
			expect(damage).not.toHaveBeenCalled();
		});

		it('the damaging states damage, healing heals every second', () => {
			const heal = vi.spyOn(handle_all, 'ha_heal').mockImplementation(() => 1);
			G.in_gt5000go = 1;
			state(Cstate_intoxication, Cclass_unit, 1, 1);
			state(Cstate_frostbite, Cclass_unit, 2, 2);
			state(7, Cclass_unit, 3, 3); // fracture
			state(Cstate_eternalfire, Cclass_object, 4, 4);
			state(Cstate_electroshock, Cclass_object, 5, 5);
			state(Cstate_healing, Cclass_unit, 6, 6);
			state(Cstate_wet, Cclass_unit, 7, 7);
			update_state();
			expect(damage.mock.calls).toEqual([
				[Cclass_unit, 1, 1],
				[Cclass_unit, 2, 2],
				[Cclass_unit, 3, 3],
				[Cclass_object, 4, 4],
				[Cclass_object, 5, 5]
			]);
			expect(heal).not.toHaveBeenCalled();
			G.in_gt1000go = 1;
			update_state();
			expect(heal).toHaveBeenCalledWith(Cclass_unit, 6, 6);
		});

		it('dizzy, bloodrush and fuddle blur the view of the player only; dizzy inverts the mouse', () => {
			const mb = vi.spyOn(motionblur, 'mb_override').mockImplementation(() => {});
			G.g_player = 1;
			state(Cstate_dizzy, Cclass_unit, 2);
			state(Cstate_dizzy, Cclass_object, 1);
			update_state();
			expect(mb).not.toHaveBeenCalled();
			expect(G.set_xinvert).toBe(0);
			state(Cstate_dizzy, Cclass_unit, 1);
			state(Cstate_bloodrush, Cclass_unit, 1);
			state(12, Cclass_unit, 1); // fuddle
			update_state();
			expect(mb.mock.calls).toEqual([[0.75], [f32(0.4)], [f32(0.9)]]);
			expect(G.set_xinvert).toBe(1);
		});

		it('fire: the sound restarts near the camera; the light follows and flickers', () => {
			object(1);
			P.static = 1;
			set_state(Cstate_fire, Cclass_object, 1);
			const s = G.TCstate!;
			update_state();
			expect(s.chan).toBe(0); // ChannelPlaying
			playing.mockImplementation(() => 0);
			update_state();
			expect(RT.audio.sfx_emit).toHaveBeenCalledWith(G.sfx_fire, expect.anything(), 1);
			expect(s.chan).toBe(55);
			PositionEntity(G.cam, 0, 0, 100);
			s.chan = 0;
			update_state();
			expect(s.chan).toBe(0); // not < 100

			PositionEntity(s.light, 9, 9, 9);
			G.in_gt50go = 1;
			G.tmp_ry = 0;
			update_state();
			expect([EntityX(s.light), EntityY(s.light), EntityZ(s.light)]).toEqual([1, 2, 3]);
			expect(isNull(Tstate, s)).toBe(false);
		});

		it('fire: flames on the 100 ms tick, a spark every 5 s', () => {
			state(Cstate_fire, Cclass_object, 1);
			G.in_gt100go = 1;
			SeedRnd(3);
			update_state();
			SeedRnd(3);
			const want: number[] = [Cp_flames];
			if (Rand(5) === 1) {
				want.push(Cp_firespark);
				Rand(2, 6);
			}
			expect(typs(pAdd)).toEqual(want);
			pAdd.mockClear();
			G.in_gt5000go = 1;
			G.m_section = Csection_editor;
			state(Cstate_eternalfire, Cclass_object, 2);
			update_state();
			expect(typs(pAdd).filter((t) => t === Cp_spark).length).toBe(2); // Rand(1)=1 always
			expect(typs(pAdd).filter((t) => t === Cp_flames).length).toBe(2);
		});

		it('fire that destroys its parent spreads to the objects in game_firerange', () => {
			object(1, 0, 0);
			object(2, 30, 40); // 50 away: <=
			object(3, 30, 41);
			state(Cstate_fire, Cclass_object, 1, 3);
			damage.mockImplementationOnce(() => 2);
			G.in_gt5000go = 1;
			G.tmp_ry = 0;
			expect(G.game_firerange).toBe(50);
			update_state();
			// object 1 burns again with the added power (set_state frees the running state), object 2 caught fire
			expect(states()).toEqual(['4@1:1=6', '4@1:2=3']);
			expect(G.tmp_ry).toBe(1); // "Prevent Double Deletion"
			expect(damage).toHaveBeenCalledTimes(3); // the two new states are updated in the same pass
		});

		it('fire goes out when tmp_ry# is below 0 (under water)', () => {
			object(1);
			const s = state(Cstate_fire, Cclass_object, 1);
			G.in_gt50go = 1;
			G.tmp_ry = -1;
			update_state();
			expect(isNull(Tstate, s)).toBe(true);
			expect(typs(pAdd)).toEqual([Cp_smoke]);
			expect(RT.audio.sfx_emit).toHaveBeenCalledWith(G.sfx_fizzle, expect.anything(), 1);
			expect(emu).toHaveBeenCalledWith(Cclass_object, 1, 'freestate');
		});

		it('electroshock: the light jumps to a vertex; lightning on Rand(3=1), i.e. Rand(0,1)', () => {
			const lightning = vi.spyOn(particles, 'p_lightning').mockImplementation(() => {});
			const sfx3d = vi.spyOn(RT.audio, 'sfx_3d').mockImplementation(() => {});
			set_state(Cstate_electroshock, Cclass_object, 1);
			const s = G.TCstate!;
			PositionEntity(s.light, 0, 0, 0);
			G.in_gt50go = 1;
			let seen = 0;
			for (let seed = 1; seed <= 12; seed++) {
				lightning.mockClear();
				pAdd.mockClear();
				sfx3d.mockClear();
				SeedRnd(seed);
				update_state();
				SeedRnd(seed);
				Rand(150, 200);
				Rnd(50, 100);
				if (Rand(0)) {
					seen |= 1;
					expect(lightning.mock.calls).toEqual([[4, 5, 6, Rand(3, 6), Rnd(4, 8)]]);
					const spark = Rand(2) === 1;
					if (spark) Rand(1, 2);
					expect(pAdd.mock.calls.length).toBe(spark ? 1 : 0);
					if (Rand(4) === 1) expect(sfx3d.mock.calls).toEqual([[4, 5, 6, G.sfx_spark[Rand(0, 3)]]]);
					else expect(sfx3d).not.toHaveBeenCalled();
				} else {
					seen |= 2;
					expect(lightning).not.toHaveBeenCalled();
				}
			}
			expect(seen).toBe(3);
			expect([EntityX(s.light), EntityY(s.light), EntityZ(s.light)]).toEqual([4, 5, 6]);
		});

		it('flare and light follow units only; particles take the state colour', () => {
			set_state(Cstate_flare, Cclass_unit, 1);
			const flare = G.TCstate!;
			set_state(Cstate_light, Cclass_unit, 1);
			const light = G.TCstate!;
			set_state(Cstate_flare, Cclass_object, 1);
			const fixed = G.TCstate!;
			for (const s of [flare, light, fixed]) PositionEntity(s.h, 0, 0, 0);
			update_state();
			expect([EntityX(flare.h), EntityY(flare.h), EntityZ(flare.h)]).toEqual([1, 2, 3]);
			expect([EntityX(light.h), EntityY(light.h), EntityZ(light.h)]).toEqual([1, 2, 3]);
			expect(EntityX(fixed.h)).toBe(0);

			G.in_gt50go = 1;
			set_state(Cstate_particles, Cclass_object, 2);
			pAdd.mockClear();
			update_state();
			expect(pAdd).toHaveBeenCalledTimes(1);
			G.TCstate!.value_s = '1,2,3';
			look_state();
			update_state();
			expect(pAdd).toHaveBeenCalledTimes(2);
		});

		it('ghost: collision comes back once the camera is more than 75 away', () => {
			const o = object(1, 0, 0);
			const s = state(Cstate_ghost, Cclass_object, 1);
			PositionEntity(G.cam, 0, 0, 75);
			G.in_gt50go = 1;
			update_state();
			expect(isNull(Tstate, s)).toBe(false);
			PositionEntity(G.cam, 0, 0, 76);
			G.in_gt50go = 0;
			update_state();
			expect(isNull(Tstate, s)).toBe(false);
			G.in_gt50go = 1;
			update_state();
			expect(isNull(Tstate, s)).toBe(true);
			expect(emu).not.toHaveBeenCalled();
			expect(isNull(Tobject, o)).toBe(false);
		});
	});

	it('the info names the tests rely on', () => {
		expect([5, 10, 11, 12, 43, 45, 46, 47].map((i) => Dinfo_name(i))).toEqual(['Sprite', 'Areal Trigger', 'Time Trigger', 'Item Count Trigger', 'Fishing Area', 'Spawn Control', 'AI Area', 'Loudspeaker']);
		expect(Dinfo_name(99)).toBe('');
	});
});
