/**
 * Package "ai": ai_units.bb, ai_signals.bb (from the executable), unitpath.bb, ai/*.bb.
 * Expected values are derived from the original source, branch by branch.
 * Every function of another package that the AI reaches is mocked.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bb3d from '../../src/lib/s2/bb3d';
import { CreatePivot, EntityAddress, EntityPitch, EntityX, EntityY, EntityYaw, EntityZ, PositionEntity, RotateEntity, type BBEntity, type Handle } from '../../src/lib/s2/bb3d';
import { Rand, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { include_001_normal_animal } from '../../src/lib/s2/game/ai/001_normal_animal';
import { include_003_standandsnap } from '../../src/lib/s2/game/ai/003_standandsnap';
import { include_005_idleturn } from '../../src/lib/s2/game/ai/005_idleturn';
import { include_009_plague } from '../../src/lib/s2/game/ai/009_plague';
import { include_200_crab } from '../../src/lib/s2/game/ai/200_crab';
import { include_300_fish } from '../../src/lib/s2/game/ai/300_fish';
import { include_303_deepseafish } from '../../src/lib/s2/game/ai/303_deepseafish';
import { include_401_circlingbird } from '../../src/lib/s2/game/ai/401_circlingbird';
import { include_407_landskybird } from '../../src/lib/s2/game/ai/407_landskybird';
import { include_408_killerbird } from '../../src/lib/s2/game/ai/408_killerbird';
import { ai_behavioursignal, ai_signal, ai_typesignal, ai_unitmode } from '../../src/lib/s2/game/ai_signals';
import * as ai from '../../src/lib/s2/game/ai_units';
import * as consoleMod from '../../src/lib/s2/game/console';
import * as K from '../../src/lib/s2/game/consts';
import {
	Cbmpf_red,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cstate_ai_stick,
	Cstate_frostbite,
	Cstate_speedmod,
	Cstate_tame,
	Cworld_g
} from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import {
	Ditem_behaviour,
	Dstate_a,
	Dunit_ani_attack,
	Dunit_ani_die,
	Dunit_ani_idle1,
	Dunit_ani_idle2,
	Dunit_ani_idle3,
	Dunit_ani_move,
	Dunit_attackrange,
	Dunit_behaviour,
	Dunit_colxr,
	Dunit_colyr,
	Dunit_damage,
	Dunit_eyes,
	Dunit_loopmoveani,
	Dunit_range,
	Dunit_scriptk,
	Dunit_sfx,
	Dunit_speed,
	Dunit_tspeed
} from '../../src/lib/s2/game/defs_arrays';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as load_materials from '../../src/lib/s2/game/load_materials';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import * as ressources from '../../src/lib/s2/game/ressources';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, New, TYPES, Tinfo, Titem, Tobject, Tstate, Tunit, Tup } from '../../src/lib/s2/game/types';
import { up_addnode, up_controlled, up_free, up_setup, up_update } from '../../src/lib/s2/game/unitpath';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

describe.skipIf(!existsSync(MOD))('package ai', () => {
	let now = 0;
	let serial = 0;
	// mocks of other packages
	let ani_unit: ReturnType<typeof vi.spyOn>;
	let unit_speed: ReturnType<typeof vi.spyOn>;
	let checkattackline: ReturnType<typeof vi.spyOn>;
	let con_unit: ReturnType<typeof vi.spyOn>;
	let kill_unit: ReturnType<typeof vi.spyOn>;
	let get_state: ReturnType<typeof vi.spyOn>;
	let parent_h: ReturnType<typeof vi.spyOn>;
	let game_damage: ReturnType<typeof vi.spyOn>;
	let p_add: ReturnType<typeof vi.spyOn>;
	let con_info: ReturnType<typeof vi.spyOn>;
	let free_info: ReturnType<typeof vi.spyOn>;
	let con_object: ReturnType<typeof vi.spyOn>;
	let damage_object: ReturnType<typeof vi.spyOn>;
	let con_item: ReturnType<typeof vi.spyOn>;
	let damage_item: ReturnType<typeof vi.spyOn>;
	let con_add: ReturnType<typeof vi.spyOn>;
	let meshline: ReturnType<typeof vi.spyOn>;
	let play_soundset: ReturnType<typeof vi.spyOn>;
	let sfx_emit: ReturnType<typeof vi.spyOn>;
	let set_parsecache: ReturnType<typeof vi.spyOn>;
	let parse_task: ReturnType<typeof vi.spyOn>;
	let parse_sel: ReturnType<typeof vi.spyOn>;
	let parse_emuevent: ReturnType<typeof vi.spyOn>;
	let states: Set<string>; // "typ:class:id" for which get_state gives 1
	let targets: Map<string, Handle>; // "class:id" -> parent_h
	let animating = 0;
	let borrowed: Set<number>;
	let animate: ReturnType<typeof vi.spyOn>;

	/** the first unit type with this behaviour, with known movement values */
	function typOf(behaviour: number): number {
		let d = [...DEFS.units.byId.values()].find((u) => u.behaviour === behaviour && !borrowed.has(u.id)) ?? [...DEFS.units.byId.values()].find((u) => u.behaviour === behaviour && Dunit_speed(u.id) === 2);
		if (!d) {
			// the mod has no unit of this behaviour: borrow a definition
			d = [...DEFS.units.byId.values()].reverse().find((u) => u.id > 1 && !borrowed.has(u.id))!;
			borrowed.add(d.id);
			Dunit_behaviour.set(d.id, behaviour);
		}
		const typ = d.id;
		borrowed.add(typ);
		Dunit_speed.set(typ, 2);
		Dunit_tspeed.set(typ, 3);
		Dunit_colyr.set(typ, 5);
		Dunit_colxr.set(typ, 4);
		Dunit_range.set(typ, 300);
		Dunit_attackrange.set(typ, 50);
		Dunit_damage.set(typ, 7);
		Dunit_eyes.set(typ, 10);
		return typ;
	}

	function mkUnit(typ: number, x = 0, y = 0, z = 0): Tunit {
		const u = New(Tunit);
		u.id = ++serial;
		u.typ = typ;
		u.h = CreatePivot();
		u.mh = CreatePivot(u.h);
		u.ai_ch = CreatePivot();
		u.health = 100;
		u.health_max = 100;
		PositionEntity(u.h, x, y, z);
		return u;
	}

	function mkPlayer(x: number, y: number, z: number): Tunit {
		const p = mkUnit(1, x, y, z);
		G.g_player = p.id;
		G.g_cplayer = p;
		return p;
	}

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		serial = 0;
		states = new Set();
		targets = new Map();
		animating = 0;
		borrowed = new Set();
		G.gt = 100000;
		G.ms = 200000;
		G.f = 1;
		G.ter = null;
		G.ter_groundy = 0;
		if (G.env_sea2 === null) G.env_sea2 = CreatePivot();

		ani_unit = vi.spyOn(handle_units, 'ani_unit').mockImplementation(() => {});
		unit_speed = vi.spyOn(handle_units, 'unit_speed').mockImplementation(() => 2);
		checkattackline = vi.spyOn(handle_units, 'checkattackline').mockImplementation(() => 1);
		con_unit = vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
			for (const u of Tunit.list) {
				if (u.id === id) {
					G.TCunit = u;
					return 1;
				}
			}
			return 0;
		});
		kill_unit = vi.spyOn(handle_units, 'kill_unit').mockImplementation(() => {});
		get_state = vi.spyOn(handle_states, 'get_state').mockImplementation((typ: number, cls: number, id: number) => (states.has(`${typ}:${cls}:${id}`) ? 1 : 0));
		parent_h = vi.spyOn(parentchild, 'parent_h').mockImplementation((cls: number, id: number) => targets.get(`${cls}:${id}`) ?? null);
		game_damage = vi.spyOn(game_functions, 'game_damage').mockImplementation(() => 0);
		p_add = vi.spyOn(particles, 'p_add').mockImplementation(() => {});
		con_info = vi.spyOn(handle_infos, 'con_info').mockImplementation((id: number) => {
			for (const i of Tinfo.list) {
				if (i.id === id) {
					G.TCinfo = i;
					return 1;
				}
			}
			return 0;
		});
		free_info = vi.spyOn(handle_infos, 'free_info').mockImplementation(() => 0);
		con_object = vi.spyOn(handle_objects, 'con_object').mockImplementation(() => 1);
		damage_object = vi.spyOn(handle_objects, 'damage_object').mockImplementation(() => 0);
		con_item = vi.spyOn(handle_items, 'con_item').mockImplementation(() => 0);
		damage_item = vi.spyOn(handle_items, 'damage_item').mockImplementation(() => 0);
		vi.spyOn(handle_objects, 'get_object').mockImplementation(() => -1);
		vi.spyOn(handle_items, 'get_item').mockImplementation(() => -1);
		vi.spyOn(load_materials, 'material_stepsfx').mockImplementation(() => {});
		con_add = vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {});
		meshline = vi.spyOn(functions, 'meshline').mockImplementation(() => null);
		play_soundset = vi.spyOn(ressources, 'play_soundset').mockImplementation(() => 7);
		sfx_emit = vi.spyOn(ressources, 'sfx_emit').mockImplementation(() => 0);
		set_parsecache = vi.spyOn(RT.script, 'set_parsecache').mockImplementation(() => 0);
		parse_task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
		parse_sel = vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
		parse_emuevent = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
		vi.spyOn(bb3d, 'Animating').mockImplementation(() => animating);
		// the test units are pivots: bb3d refuses Animate on an entity without animation
		animate = vi.spyOn(bb3d, 'Animate').mockImplementation(() => {});
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

	// ------------------------------------------------------------------ ai_units.bb

	it('ai_agressive: 1 for the six attacking behaviours', () => {
		for (const b of [2, 3, 6, 302, 402, 408]) expect(ai.ai_agressive(b)).toBe(1);
		for (const b of [0, 1, 4, 5, 7, 300, 400, 407, 500]) expect(ai.ai_agressive(b)).toBe(0);
	});

	it('ai_modetxt: texts, with the wrong number for attack and hunt', () => {
		expect(ai.ai_modetxt(K.ai_idle)).toBe('50: idle');
		expect(ai.ai_modetxt(K.ai_mover)).toBe('53: move right');
		expect(ai.ai_modetxt(K.ai_sreturn)).toBe('102: strict return');
		expect(ai.ai_modetxt(K.ai_attack)).toBe('50: attack player'); // quirk of the original
		expect(ai.ai_modetxt(K.ai_hunt)).toBe('50: hunt player'); // quirk of the original
		expect(ai.ai_modetxt(K.ai_getfood)).toBe('151: get food');
		expect(ai.ai_modetxt(K.ai_sani)).toBe('155: script animation');
		expect(ai.ai_modetxt(-1)).toBe('-1: UNKNOWN MODE');
	});

	it('ai_mode: random duration, fields, move animation by loopmoveani', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		Dunit_ani_move.set(typ, 0, f32(0.25));
		Dunit_ani_move.set(typ, 1, 4);
		Dunit_loopmoveani.set(typ, 1);
		SeedRnd(99);
		const d = Rand(1500, 3500);
		SeedRnd(99);
		ai.ai_mode(K.ai_move);
		expect(u.ai_mode).toBe(51);
		expect(u.ai_duration).toBe(d);
		expect(u.ai_timer).toBe(100000);
		expect(ani_unit).toHaveBeenLastCalledWith(1, f32(0.25), 4);

		Dunit_loopmoveani.set(typ, 0);
		ai.ai_mode(K.ai_fall, 1234);
		expect(u.ai_duration).toBe(1234);
		expect(ani_unit).toHaveBeenLastCalledWith(2, f32(0.25), 4);

		// attack: override=1
		Dunit_ani_attack.set(typ, 0, f32(0.5));
		Dunit_ani_attack.set(typ, 1, 6);
		ai.ai_mode(K.ai_attack, 10);
		expect(ani_unit).toHaveBeenLastCalledWith(3, f32(0.5), 6, 1, 1);

		// setani=0: no animation
		ani_unit.mockClear();
		ai.ai_mode(K.ai_move, 10, 0);
		expect(ani_unit).not.toHaveBeenCalled();
		// ai_sani has no Case: no animation either
		ai.ai_mode(K.ai_sani, 10);
		expect(ani_unit).not.toHaveBeenCalled();
	});

	it('ai_mode: idle without idle animations stops the animation and sets duration 0', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		Dunit_ani_idle1.set(typ, 0, 0);
		Dunit_ani_idle2.set(typ, 0, 0);
		Dunit_ani_idle3.set(typ, 0, 0);
		u.ani = 9;
		ai.ai_mode(K.ai_idle, 4000);
		expect(u.ai_mode).toBe(50);
		expect(animate).toHaveBeenCalledWith(u.mh, 0);
		expect(u.ani).toBe(0);
		expect(u.ai_duration).toBe(0);
		expect(ani_unit).not.toHaveBeenCalled();
	});

	it('ai_mode: idle plays the drawn idle animation, its sound and its script event', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		for (const [i, a] of [Dunit_ani_idle1, Dunit_ani_idle2, Dunit_ani_idle3].entries()) {
			a.set(typ, 0, f32(0.1));
			a.set(typ, 1, 10 + i);
		}
		Dunit_scriptk.set(typ, '\xa6ai_idle2');
		SeedRnd(5);
		const x = Rand(1, 3);
		SeedRnd(5);
		ai.ai_mode(K.ai_idle, 4000);
		expect(u.ai_duration).toBe(4000);
		expect(ani_unit).toHaveBeenLastCalledWith(3, f32(0.1), 9 + x);
		// snd_idle1..3 = 3..5
		expect(play_soundset).toHaveBeenLastCalledWith(Dunit_sfx(typ), 2 + x, u.h);
		expect(set_parsecache).toHaveBeenLastCalledWith(Cclass_unit, u.id, 'ai_idle' + x);
		expect(parse_task.mock.calls.length).toBe(x === 2 ? 1 : 0);
	});

	it('ai_mode: state ai_stick keeps the mode but plays the idle animation', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		u.states = 1;
		states.add(`${Cstate_ai_stick}:${Cclass_unit}:${u.id}`);
		Dunit_ani_idle1.set(typ, 0, 0);
		Dunit_ani_idle2.set(typ, 0, 0);
		Dunit_ani_idle3.set(typ, 0, 0);
		ai.ai_mode(K.ai_move, 3000);
		expect(u.ai_mode).toBe(51); // quirk: mode stays
		expect(u.ai_duration).toBe(0); // from the failed idle animation
		expect(ani_unit).not.toHaveBeenCalled();
	});

	it('ai_ani: every animation type', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		ai.ai_ani(K.ani_use);
		expect(ani_unit).toHaveBeenLastCalledWith(3, expect.any(Number), expect.any(Number));
		ai.ai_ani(K.ani_die);
		expect(ani_unit).toHaveBeenCalledTimes(2);
		ai.ai_ani(K.ani_special); // no Case
		expect(ani_unit).toHaveBeenCalledTimes(2);
		Dunit_scriptk.set(typ, '');
		ai.ai_ani(K.ani_idle3);
		expect(set_parsecache).toHaveBeenLastCalledWith(Cclass_unit, u.id, 'ai_idle3');
		expect(parse_task).not.toHaveBeenCalled();
	});

	it('ai_ini: centre pivot, start mode by behaviour, dead units', () => {
		const typ = typOf(301);
		const u = mkUnit(typ);
		G.TCunit = u;
		u.ai_cx = 30;
		u.ai_cz = -40;
		SeedRnd(7);
		const x = Rand(0, 1);
		SeedRnd(7);
		ai.ai_ini();
		expect(EntityX(u.ai_ch)).toBe(30);
		expect(EntityZ(u.ai_ch)).toBe(-40);
		expect(u.ai_mode).toBe(x === 0 ? K.ai_movel : K.ai_mover);
		expect(u.ai_timer).toBe(G.gt);

		// no setup of the centre, a behaviour without start mode, dead
		const typ2 = typOf(1);
		const d = mkUnit(typ2);
		G.TCunit = d;
		d.ai_cx = 5;
		d.health = 0;
		d.freeze = 1;
		Dunit_ani_die.set(typ2, 0, f32(0.3));
		Dunit_ani_die.set(typ2, 1, 8);
		ai.ai_ini(0);
		expect(EntityX(d.ai_ch)).toBe(0);
		expect(d.ai_mode).toBe(0);
		expect(d.freeze).toBe(0);
		expect(d.health_max).toBe(0);
		expect(d.ani).toBe(8);
		expect(animate).toHaveBeenLastCalledWith(d.mh, 3, f32(0.3), 8);
	});

	it('ai_move: moves along yaw+diroff, speed changed by states', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.TCunit = u;
		G.f = f32(1.5);
		expect(ai.ai_move(2, 90)).toBe(1);
		expect(EntityZ(u.h)).toBeCloseTo(3, 5);
		expect(EntityX(u.h)).toBeCloseTo(0, 5);

		// frostbite halves; the state must be active (Dstate_a) and belong to the unit
		PositionEntity(u.h, 0, 0, 0);
		u.states = 1;
		Dstate_a.set(Cstate_frostbite, 1);
		Dstate_a.set(Cstate_speedmod, 1);
		const s = New(Tstate);
		s.typ = Cstate_frostbite;
		s.parent_class = Cclass_unit;
		s.parent_id = u.id;
		const other = New(Tstate);
		other.typ = Cstate_speedmod;
		other.parent_class = Cclass_unit;
		other.parent_id = u.id + 100;
		other.value_f = 50;
		ai.ai_move(2, 90);
		expect(EntityZ(u.h)).toBeCloseTo(1.5, 5);

		// speedmod replaces the speed
		PositionEntity(u.h, 0, 0, 0);
		other.parent_id = u.id;
		other.value_f = 4;
		ai.ai_move(2, 90);
		expect(EntityZ(u.h)).toBeCloseTo(6, 5);

		// states flag off: no modification
		PositionEntity(u.h, 0, 0, 0);
		u.states = 0;
		RotateEntity(u.h, 0, 90, 0);
		ai.ai_move(2, 90);
		expect(EntityX(u.h)).toBeCloseTo(-3, 5);
		expect(EntityZ(u.h)).toBeCloseTo(0, 5);
	});

	it('ai_check: land check and centre check', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, -1, 0);
		G.TCunit = u;
		// in water with landcheck 1 -> strict return, nothing else
		ai.ai_check(K.ai_shy);
		expect(u.ai_mode).toBe(K.ai_sreturn);
		// landcheck 2 (fish): above -5 -> strict return
		u.ai_mode = 0;
		ai.ai_check(0, 2);
		expect(u.ai_mode).toBe(K.ai_sreturn);
		PositionEntity(u.h, 0, -20, 0);
		u.ai_mode = 0;
		ai.ai_check(0, 2);
		expect(u.ai_mode).toBe(0);
		// during the attack animation nothing is checked
		PositionEntity(u.h, 0, -1, 0);
		u.ai_mode = K.ai_attack;
		ai.ai_check(0, 1);
		expect(u.ai_mode).toBe(K.ai_attack);

		// centre check: farther than Dunit_range from the centre
		PositionEntity(u.h, 301, 10, 0);
		u.ai_mode = 0;
		ai.ai_check(0, 1);
		expect(u.ai_mode).toBe(K.ai_return);
		u.ai_mode = 0;
		ai.ai_check(0, 1, 0);
		expect(u.ai_mode).toBe(0);
		PositionEntity(u.h, 300, 10, 0);
		ai.ai_check(0, 1);
		expect(u.ai_mode).toBe(0);

		// killerbird: not while hunting or rising
		const kb = mkUnit(typOf(408), 301, 10, 0);
		G.TCunit = kb;
		kb.ai_mode = K.ai_hunt;
		ai.ai_check(0, 0);
		expect(kb.ai_mode).toBe(K.ai_hunt);
		kb.ai_mode = K.ai_rise;
		ai.ai_check(0, 0);
		expect(kb.ai_mode).toBe(K.ai_rise);
		kb.ai_mode = K.ai_move;
		ai.ai_check(0, 0);
		expect(kb.ai_mode).toBe(K.ai_return);
	});

	it('ai_check shy: flees from the player within 100, keeps fleeing', () => {
		const typ = typOf(8);
		const u = mkUnit(typ, 0, 10, 0);
		const p = mkPlayer(0, 10, 150);
		G.TCunit = u;
		ai.ai_check(K.ai_shy);
		expect(u.ai_mode).toBe(0);
		PositionEntity(p.h, 0, 10, 99);
		ai.ai_check(K.ai_shy);
		expect(u.ai_mode).toBe(K.ai_flee);
		expect(u.ai_duration).toBe(10000);
		expect(u.ai_target_class).toBe(Cclass_unit);
		expect(u.ai_target_id).toBe(p.id);
		// already fleeing: timer restarted
		u.ai_duration = 5;
		u.ai_timer = 1;
		ai.ai_check(K.ai_shy);
		expect(u.ai_duration).toBe(10000);
		expect(u.ai_timer).toBe(G.gt);
	});

	it('ai_check aggressive: attack in attack range', () => {
		const typ = typOf(2);
		const u = mkUnit(typ, 0, 10, 0);
		const p = mkPlayer(0, 10, 40);
		G.TCunit = u;
		Dunit_scriptk.set(typ, '\xa6ai_attack');
		ai.ai_check(K.ai_agressive);
		// quirk: causer is the entity handle of the unit, not its id
		expect(game_damage).toHaveBeenCalledWith(p.mh, 7, EntityAddress(u.h));
		expect(EntityAddress(u.h)).toBeGreaterThan(0xffffff);
		expect(u.ai_mode).toBe(K.ai_attack);
		expect(play_soundset).toHaveBeenCalledWith(Dunit_sfx(typ), K.snd_attack, u.h);
		expect(set_parsecache).toHaveBeenCalledWith(Cclass_unit, u.id, 'ai_attack');
		expect(parse_task).toHaveBeenCalledTimes(1);
		expect(parse_sel).toHaveBeenCalledWith(Cclass_unit, u.id, 'ai_attack');

		// no line of attack: no damage, but the player is in perception range -> hunt
		game_damage.mockClear();
		play_soundset.mockClear();
		u.ai_mode = 0;
		u.lastspot = 0;
		checkattackline.mockImplementation(() => 0);
		ai.ai_check(K.ai_agressive);
		expect(game_damage).not.toHaveBeenCalled();
		expect(u.ai_mode).toBe(K.ai_hunt);
		expect(u.ai_duration).toBe(10000);
		expect(u.lastspot).toBe(G.ms);
		expect(play_soundset).toHaveBeenCalledWith(Dunit_sfx(typ), K.snd_spot, u.h);

		// spot sound only every 5 seconds
		play_soundset.mockClear();
		u.ai_mode = 0;
		G.ms += 5000;
		ai.ai_check(K.ai_agressive);
		expect(play_soundset).not.toHaveBeenCalled();
		expect(u.ai_mode).toBe(K.ai_hunt);

		// superior modes (>=149), unit path (-1), tame, dead player: nothing
		for (const m of [K.ai_movetarget, K.ai_getfood, K.ai_flee, -1]) {
			u.ai_mode = m;
			ai.ai_check(K.ai_agressive);
			expect(u.ai_mode).toBe(m);
		}
		u.ai_mode = 0;
		u.states = 1;
		states.add(`${Cstate_tame}:${Cclass_unit}:${u.id}`);
		ai.ai_check(K.ai_agressive);
		expect(u.ai_mode).toBe(0);
		states.clear();
		p.health = 0;
		ai.ai_check(K.ai_agressive);
		expect(u.ai_mode).toBe(0);
	});

	it('ai_check aggressive: land predators do not hunt a swimming player; predator fish only bite and hunt in water', () => {
		const land = mkUnit(typOf(2), 0, 10, 0);
		const p = mkPlayer(0, 0, 200);
		G.TCunit = land;
		ai.ai_check(K.ai_agressive);
		expect(land.ai_mode).toBe(0);

		const fish = mkUnit(typOf(302), 0, -20, 0);
		G.TCunit = fish;
		ai.ai_check(K.ai_agressive, 2);
		expect(fish.ai_mode).toBe(K.ai_hunt);

		// in attack range, player above water: no bite (doit stays 0), no hunt (player on land)
		fish.ai_mode = 0;
		PositionEntity(p.h, 0, 5, 20);
		ai.ai_check(K.ai_agressive, 2);
		expect(game_damage).not.toHaveBeenCalled();
		expect(fish.ai_mode).toBe(0);
		// player under water: bite
		PositionEntity(p.h, 0, -5, 20);
		ai.ai_check(K.ai_agressive, 2);
		expect(game_damage).toHaveBeenCalledTimes(1);
		expect(fish.ai_mode).toBe(K.ai_attack);

		// killerbird: hunts on land unless rising, never over water
		const kb = mkUnit(typOf(408), 0, 100, 0);
		G.TCunit = kb;
		PositionEntity(p.h, 0, 5, 250);
		kb.ai_mode = K.ai_rise;
		ai.ai_check(K.ai_agressive, 0);
		expect(kb.ai_mode).toBe(K.ai_rise);
		kb.ai_mode = K.ai_move;
		ai.ai_check(K.ai_agressive, 0);
		expect(kb.ai_mode).toBe(K.ai_hunt);
		kb.ai_mode = K.ai_move;
		PositionEntity(p.h, 0, 0, 250);
		ai.ai_check(K.ai_agressive, 0);
		expect(kb.ai_mode).toBe(K.ai_move);
	});

	it('ai_check aggressive: behaviour 6 shoots', () => {
		const u = mkUnit(typOf(6), 0, 10, 0);
		mkPlayer(0, 10, 40);
		G.TCunit = u;
		const shoot = vi.spyOn(bb3d, 'EntityPick').mockImplementation(() => null);
		ai.ai_check(K.ai_agressive, 0, 0);
		expect(shoot).toHaveBeenCalledTimes(1);
		expect(game_damage).not.toHaveBeenCalled(); // nothing picked
		expect(u.ai_mode).toBe(K.ai_attack); // doit=1 whatever ai_shoot returns
		expect(G.TCunit).toBe(u);
	});

	it('ai_return: turns to the centre, moves, ends below 75', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, 0, 200);
		G.TCunit = u;
		u.ai_timer = 555;
		// centre straight behind: DeltaYaw is +-180, turndelay 30 -> yaw +-6
		ai.ai_return();
		expect(Math.abs(EntityYaw(u.h))).toBeCloseTo(6, 4);
		expect(u.ai_timer).toBe(555);
		// water: MoveEntity by unit_speed()*f along the own z axis
		PositionEntity(u.h, 0, 0, 80);
		RotateEntity(u.h, 0, 0, 0);
		PositionEntity(u.ai_ch, 0, 0, 500); // straight ahead: no turn (the distance test uses ai_cx/ai_cz = 0)
		ai.ai_return(1, 2);
		expect(EntityZ(u.h)).toBeCloseTo(82, 5);
		expect(u.ai_timer).toBe(555);
		PositionEntity(u.h, 0, 0, 72);
		ai.ai_return(1, 2);
		expect(u.ai_timer).toBe(0);
	});

	it('ai_hunt: stops at half the attack range, else approaches (water: adjusts the height)', () => {
		const typ = typOf(302);
		const u = mkUnit(typ, 0, -50, 0);
		const p = mkPlayer(0, -10, 24);
		G.TCunit = u;
		u.ai_timer = 9;
		ai.ai_hunt(1);
		expect(u.ai_timer).toBe(0);
		PositionEntity(p.h, 0, -10, 100);
		u.ai_timer = 9;
		ai.ai_hunt(1);
		expect(u.ai_timer).toBe(9);
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		// 40 below the player: rises by unit_speed/3*f
		expect(EntityY(u.h)).toBeCloseTo(-50 + 2 / 3, 5);
		// above the player: sinks
		PositionEntity(u.h, 0, 30, 0);
		ai.ai_hunt(1);
		expect(EntityY(u.h)).toBeCloseTo(30 - 2 / 3, 5);
		// land: ai_move
		PositionEntity(u.h, 0, 0, 0);
		ai.ai_hunt();
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		expect(EntityY(u.h)).toBe(0);
	});

	it('ai_movetarget: no target, near target, approach', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		mkPlayer(0, 0, 500);
		G.TCunit = u;
		u.ai_target_class = Cclass_info;
		u.ai_target_id = 3;
		u.ai_timer = 9;
		ai.ai_movetarget();
		expect(u.ai_timer).toBe(0);
		const t = CreatePivot();
		targets.set(`${Cclass_info}:3`, t);
		PositionEntity(t, 0, 0, 100);
		u.ai_timer = 9;
		ai.ai_movetarget();
		expect(u.ai_timer).toBe(9);
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		PositionEntity(t, 0, 0, 11);
		ai.ai_movetarget();
		expect(u.ai_timer).toBe(0);
	});

	it('ai_getfood: cancels, approaches, eats', () => {
		const typ = typOf(9);
		const u = mkUnit(typ);
		mkPlayer(0, 0, 500);
		G.TCunit = u;
		u.ai_target_class = Cclass_object;
		u.ai_target_id = 4;
		u.ai_timer = 9;
		u.ai_duration = 9;
		// target gone
		expect(ai.ai_getfood()).toBe(0);
		expect([u.ai_timer, u.ai_duration]).toEqual([0, 0]);

		// approach
		const t = CreatePivot();
		PositionEntity(t, 0, 0, 100);
		targets.set(`${Cclass_object}:4`, t);
		u.ai_timer = 9;
		u.ai_duration = 9;
		ai.ai_getfood();
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		expect([u.ai_timer, u.ai_duration]).toEqual([9, 9]);

		// eat an object that survives the bite: goes on eating for 20 s
		PositionEntity(t, 0, 0, 20);
		u.ai_mode = K.ai_getfood;
		ai.ai_getfood();
		expect(G.pv_ai_eater).toBe(u.id);
		expect(parse_emuevent).toHaveBeenCalledWith(Cclass_object, 4, 'ai_eat');
		expect(parse_sel).toHaveBeenCalledWith(Cclass_object, 4, 'ai_eat');
		expect(sfx_emit).toHaveBeenCalledWith(G.sfx_eat, u.h);
		expect(damage_object).toHaveBeenCalledWith(7);
		expect([u.ai_mode, u.ai_duration, u.ai_timer]).toEqual([K.ai_getfood, 20000, G.gt]);

		// the object is destroyed by the bite: idle for 5 s
		let n = 0;
		con_object.mockImplementation(() => (++n === 1 ? 1 : 0));
		ai.ai_getfood();
		expect([u.ai_mode, u.ai_duration]).toEqual([K.ai_idle, 5000]);

		// the script skips the event: nothing is damaged
		damage_object.mockClear();
		parse_sel.mockImplementation(() => {
			G.p_skipevent = 1;
			return 0;
		});
		ai.ai_getfood();
		expect(damage_object).not.toHaveBeenCalled();
		parse_sel.mockImplementation(() => 0);

		// while the attack animation runs nothing happens
		u.ani = Math.round(Dunit_ani_attack(typ, 1));
		animating = 1;
		parse_emuevent.mockClear();
		ai.ai_getfood();
		expect(parse_emuevent).not.toHaveBeenCalled();
		animating = 0;

		// unit as food: killed, TCunit restored; info as food: freed
		const victim = mkUnit(typ, 0, 0, 5);
		u.ai_target_class = Cclass_unit;
		u.ai_target_id = victim.id;
		targets.set(`${Cclass_unit}:${victim.id}`, victim.h);
		kill_unit.mockImplementation(() => {
			expect(G.TCunit).toBe(victim);
		});
		ai.ai_getfood();
		expect(kill_unit).toHaveBeenCalledTimes(1);
		expect(G.TCunit).toBe(u);
		u.ai_target_class = Cclass_info;
		u.ai_target_id = 8;
		targets.set(`${Cclass_info}:8`, t);
		ai.ai_getfood();
		expect(free_info).toHaveBeenCalledWith(8);

		// item as food
		const it_ = New(Titem);
		it_.id = 77;
		it_.parent_class = 0;
		u.ai_target_class = Cclass_item;
		u.ai_target_id = 77;
		targets.set(`${Cclass_item}:77`, t);
		con_item.mockImplementation(() => 1);
		ai.ai_getfood();
		expect(damage_item).toHaveBeenCalledWith(7, 1);
		expect([u.ai_mode, u.ai_duration]).toEqual([K.ai_getfood, 20000]);
		// stored item: cancelled
		it_.parent_class = Cclass_unit;
		damage_item.mockClear();
		expect(ai.ai_getfood()).toBe(0);
		expect([u.ai_timer, u.ai_duration]).toEqual([0, 0]);
		expect(damage_item).not.toHaveBeenCalled();
	});

	it('ai_flee: runs away from the target; duration 3000 once it is far', () => {
		const typ = typOf(8);
		const u = mkUnit(typ, 0, 0, 0);
		const p = mkPlayer(0, 0, -30);
		G.TCunit = u;
		u.ai_target_class = Cclass_unit;
		u.ai_target_id = 999;
		u.ai_timer = 9;
		ai.ai_flee();
		expect(u.ai_timer).toBe(0); // no target
		u.ai_target_id = p.id;
		targets.set(`${Cclass_unit}:${p.id}`, p.h);
		u.ai_timer = 9;
		u.ai_duration = 10000;
		const pivots = RT.world.entities?.length;
		ai.ai_flee();
		// target straight behind, unit looks away from it already: goes straight on
		expect(EntityZ(u.h)).toBeCloseTo(2, 4);
		expect(EntityYaw(u.h)).toBeCloseTo(0, 3);
		expect(u.ai_duration).toBe(10000);
		expect(RT.world.entities?.length).toBe(pivots); // the flee pivot is freed
		// farther than 50
		PositionEntity(u.h, 0, 0, 30);
		ai.ai_flee();
		expect(u.ai_duration).toBe(3000);
		expect(u.ai_timer).toBe(G.gt);
		// sky (-1): 4 x speed forward, half the speed up
		PositionEntity(u.h, 0, 0, 0);
		ai.ai_flee(-1);
		expect(EntityZ(u.h)).toBeCloseTo(8, 4);
		expect(EntityY(u.h)).toBeCloseTo(1, 5);
		// water (1): terrain (0) is not below the unit minus its radius -> no turn
		PositionEntity(u.h, 0, -3, 0);
		ai.ai_flee(1);
		expect(EntityZ(u.h)).toBeCloseTo(2, 4);
		expect(EntityYaw(u.h)).toBeCloseTo(0, 3);
		// deep water over a ground at -100 ("collision" branch of the original): turns and tests the water
		G.ter_groundy = -100;
		PositionEntity(u.h, 0, -30, 0);
		ai.ai_flee(1);
		expect(EntityYaw(u.h)).toBeCloseTo(2, 3);
	});

	it('ai_attack: keeps the mode while animating, then checks again', () => {
		const typ = typOf(2);
		const u = mkUnit(typ, 0, 10, 0);
		mkPlayer(0, 10, 1000);
		G.TCunit = u;
		u.ai_mode = K.ai_attack;
		animating = 1;
		ai.ai_attack();
		expect(u.ai_timer).toBe(G.gt + 10000);
		expect(u.ai_mode).toBe(K.ai_attack);
		animating = 0;
		ai.ai_attack();
		// player out of range and the unit is at its centre: mode 0, expired
		expect([u.ai_mode, u.ai_timer, u.ai_duration]).toEqual([0, 0, -1]);
	});

	it('ai_watertest: steps back when the ground rises', () => {
		const u = mkUnit(typOf(300), 0, -20, 0);
		G.TCunit = u;
		expect(ai.ai_watertest()).toBe(0);
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		let n = 0;
		Object.defineProperty(G, 'ter_groundy', { get: () => (n++ === 0 ? -50 : -40), set: () => {}, configurable: true });
		expect(ai.ai_watertest()).toBe(1);
		expect(EntityZ(u.h)).toBeCloseTo(2, 5);
		Object.defineProperty(G, 'ter_groundy', { value: 0, writable: true, configurable: true, enumerable: true });
	});

	it('ai_shoot: picks along the line to the player, damages what it hits', () => {
		const typ = typOf(6);
		const u = mkUnit(typ, 0, 10, 0);
		mkPlayer(0, 20, 100);
		G.TCunit = u;
		G.set_effects = 1;
		let from: number[] = [];
		const victim = CreatePivot();
		const pick = vi.spyOn(bb3d, 'EntityPick').mockImplementation((src: Handle, range: number) => {
			from = [EntityX(src), EntityY(src), EntityZ(src), range];
			return null;
		});
		expect(ai.ai_shoot()).toBe(0);
		// start: eyes (10) above the unit, colxr+5 = 9 towards the player (who is straight ahead at the same height)
		expect(from[0]).toBeCloseTo(0, 4);
		expect(from[1]).toBeCloseTo(20, 4);
		expect(from[2]).toBeCloseTo(9, 4);
		expect(from[3]).toBe(50);
		expect(G.in_pe).toBeNull();
		expect(p_add).toHaveBeenCalledTimes(5); // muzzle smoke
		expect(game_damage).not.toHaveBeenCalled();
		expect(meshline).not.toHaveBeenCalled();

		pick.mockImplementation(() => victim);
		G.set_effects = 0;
		p_add.mockClear();
		expect(ai.ai_shoot()).toBe(1);
		expect(p_add).not.toHaveBeenCalled();
		// causer is the unit id here, pickcords=1
		expect(game_damage).toHaveBeenCalledWith(victim, 7, u.id, 1);
		expect(G.TCunit).toBe(u);
	});

	it('ai_obstacle, ai_turn, ai_center, ai_dosani, ai_movesound', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 12, 3, -7);
		G.TCunit = u;
		expect(ai.ai_obstacle()).toBe(0);

		SeedRnd(3);
		const r = Rand(1, 2);
		SeedRnd(3);
		ai.ai_turn();
		expect(u.ai_mode).toBe(r === 1 ? K.ai_movel : K.ai_mover);

		ai.ai_center();
		expect([u.ai_cx, u.ai_cz]).toEqual([12, -7]);
		expect([EntityX(u.ai_ch), EntityY(u.ai_ch), EntityZ(u.ai_ch)]).toEqual([12, 0, -7]);

		u.ai_timer = 5;
		ai.ai_dosani();
		expect(u.ai_timer).toBe(0);
		animating = 1;
		ai.ai_dosani();
		expect(u.ai_timer).toBe(G.gt + 10000);

		// move sound: started when there is no channel or it has finished
		ai.ai_movesound();
		expect(play_soundset).toHaveBeenLastCalledWith(Dunit_sfx(typ), K.snd_move, u.h);
		expect(u.chan).toBe(7);
		const playing = vi.spyOn(RT.audio.bb, 'ChannelPlaying').mockImplementation(() => 1);
		const stop = vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {});
		play_soundset.mockClear();
		ai.ai_movesound();
		expect(play_soundset).not.toHaveBeenCalled();
		ai.ai_movesound(0);
		expect(stop).toHaveBeenCalledWith(7);
		playing.mockImplementation(() => 0);
		ai.ai_movesound();
		expect(play_soundset).toHaveBeenCalledTimes(1);
		// no current unit: nothing
		G.TCunit = null;
		expect(() => ai.ai_movesound()).not.toThrow();
	});

	// ------------------------------------------------------------------ update_unit

	it('update_unit: behaviours 4/5/6 are physics mode 0 (fall with acceleration, jump)', () => {
		const typ = typOf(4);
		const u = mkUnit(typ, 0, 50, 0);
		G.TCunit = u;
		u.ai_timer = G.gt;
		u.ai_duration = 5000;
		u.phy_fall = G.gt - 1500; // half of Cworld_facct
		ai.update_unit();
		expect(EntityY(u.h)).toBeCloseTo(50 - 9.81 * 1.5, 4);
		expect(u.phy_fall).toBe(G.gt - 1500); // not on the ground

		// lands: put on terrain + colyr
		PositionEntity(u.h, 0, 6, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBe(5);
		expect([u.phy_ft, u.phy_fall, u.phy_fally]).toEqual([G.gt, G.gt, 5]);

		// jump: 225 of 450 ms left -> +4*0.5*f
		u.phy_jump = G.gt + 225;
		PositionEntity(u.h, 0, 50, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBeCloseTo(52, 5);
		expect(u.phy_fally).toBeCloseTo(52, 5);
		expect(u.phy_jump).toBe(G.gt + 225);

		// in water (below -colyr/2): no gravity, kept over the terrain
		G.ter_groundy = -50;
		PositionEntity(u.h, 0, -20, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBe(-20);
		expect(u.phy_jump).toBe(0);
		PositionEntity(u.h, 0, -48, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBe(-45);
	});

	it('update_unit: mode 1 (land animals) falls with 0.6 g and stands on the terrain', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, 50, 0);
		G.TCunit = u;
		u.ai_timer = G.gt;
		u.ai_duration = 5000;
		ai.update_unit();
		expect(EntityY(u.h)).toBeCloseTo(50 - f32(f32(Cworld_g * 1) * f32(0.6)), 5);
		expect(u.phy_ft).toBe(0);
		PositionEntity(u.h, 0, 6, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBe(5);
		expect(u.phy_ft).toBe(G.gt);
	});

	it('update_unit: frozen units only lose their animation; dead units sink or fall', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, 50, 0);
		G.TCunit = u;
		u.freeze = 1;
		u.ani = 4;
		ai.update_unit();
		expect(u.ani).toBe(0);
		expect(animate).toHaveBeenCalledWith(u.mh, 0);
		expect(EntityY(u.h)).toBe(50);

		// dead land animal under water: swims up to -3+colyr = 2, not higher
		u.health = 0;
		G.ter_groundy = -100;
		PositionEntity(u.h, 0, -20, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBeCloseTo(-19.5, 5);
		PositionEntity(u.h, 0, 1.75, 0);
		ai.update_unit();
		expect(EntityY(u.h)).toBe(2);

		// dead bird: falls with 2 g, stays at -2 + colyr over water
		const b = mkUnit(typOf(400), 0, 100, 0);
		b.health = 0;
		G.TCunit = b;
		ai.update_unit();
		expect(EntityY(b.h)).toBeCloseTo(100 - 19.62, 4);
		PositionEntity(b.h, 0, 5, 0);
		ai.update_unit();
		expect(EntityY(b.h)).toBe(3);

		// dead fish: rises to -2
		const fi = mkUnit(typOf(300), 0, -30, 0);
		fi.health = 0;
		G.TCunit = fi;
		ai.update_unit();
		expect(EntityY(fi.h)).toBeCloseTo(-29.5, 5);
		PositionEntity(fi.h, 0, -1.9, 0);
		ai.update_unit();
		expect(EntityY(fi.h)).toBe(-2);
	});

	it('update_unit: fish stay under -10, birds at their height, watercraft on the surface', () => {
		const fi = mkUnit(typOf(300), 0, -3, 0);
		G.TCunit = fi;
		G.ter_groundy = -100;
		fi.ai_timer = G.gt;
		fi.ai_duration = 5000;
		ai.update_unit();
		expect(EntityY(fi.h)).toBe(-10);

		G.ter_groundy = 0;
		const b = mkUnit(typOf(400), 0, 100, 0);
		G.TCunit = b;
		b.ai_timer = G.gt;
		b.ai_duration = 5000;
		ai.update_unit();
		expect(EntityY(b.h)).toBe(351); // max(tery,1)+350
		PositionEntity(b.h, 0, 400, 0);
		ai.update_unit();
		expect(EntityY(b.h)).toBeCloseTo(400 - 0.2, 5);

		// landskybird (free control): below the ground while falling -> lands (idle) on dry land
		const typ407 = typOf(407);
		const l = mkUnit(typ407, 0, 2, 0);
		G.TCunit = l;
		G.ter_groundy = 10;
		l.ai_mode = K.ai_fall;
		l.ai_timer = G.gt;
		l.ai_duration = 50000;
		ai.update_unit();
		expect(l.ai_mode).toBe(K.ai_idle);
		expect(EntityY(l.h)).toBe(15);
		// ... over water (ground below 2): rises again
		G.ter_groundy = -20;
		PositionEntity(l.h, 0, 0.5, 0);
		RotateEntity(l.h, 0, 0, 0);
		l.ai_mode = K.ai_fall;
		l.ai_timer = G.gt;
		l.ai_duration = 50000;
		ai.update_unit();
		expect(l.ai_mode).toBe(K.ai_rise);
		expect(l.ai_duration).toBeGreaterThanOrEqual(3000);
		expect(l.ai_duration).toBeLessThanOrEqual(10000);
		expect(EntityY(l.h)).toBe(1);

		{
			const boat = mkUnit(typOf(501), 0, 30, 0);
			boat.vh = CreatePivot();
			G.TCunit = boat;
			G.in_wa = 90;
			ai.update_unit();
			expect(EntityY(boat.h)).toBe(6); // 1 + colyr
			// wobble: pitch Sin(in_wa + id*20), roll Cos(...)
			expect(EntityPitch(boat.h)).toBeCloseTo(Math.sin(((90 + boat.id * 20) * Math.PI) / 180), 4);
		}
	});

	// ------------------------------------------------------------------ ai/*.bb

	it('001 normal animal: acts by mode, draws the next mode when the timer is over', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, 10, 0);
		G.TCunit = u;
		Dunit_ani_idle1.set(typ, 0, 0);
		Dunit_ani_idle2.set(typ, 0, 0);
		Dunit_ani_idle3.set(typ, 0, 0);
		u.ai_mode = K.ai_movel;
		u.ai_timer = G.gt;
		u.ai_duration = 5000;
		include_001_normal_animal();
		expect(u.chan).toBe(7); // ai_movesound
		expect(EntityZ(u.h)).toBeCloseTo(2, 5); // ai_move(speed,90)
		expect(EntityYaw(u.h)).toBeCloseTo(3, 4); // tspeed*f
		u.ai_mode = K.ai_mover;
		include_001_normal_animal();
		expect(EntityYaw(u.h)).toBeCloseTo(0, 4);

		// idle: expires at once unless the animation runs
		u.ai_mode = K.ai_idle;
		animating = 1;
		include_001_normal_animal();
		expect(u.ai_timer).toBe(G.gt + 10000);
		expect(u.ai_mode).toBe(K.ai_idle);
		animating = 0;

		const table = (x: number) => (x <= 3 ? K.ai_move : x <= 6 ? K.ai_movel : x <= 9 ? K.ai_mover : K.ai_idle);
		const seen = new Set<number>();
		for (let seed = 1; seed <= 12; seed++) {
			u.ai_mode = K.ai_sani; // ai_dosani: timer 0 -> expired
			SeedRnd(seed);
			const x = Rand(0, 15);
			const d = Rand(1500, 3500);
			SeedRnd(seed);
			include_001_normal_animal();
			expect(u.ai_mode).toBe(table(x));
			// idle without animations ends at once (duration 0)
			expect(u.ai_duration).toBe(table(x) === K.ai_idle ? 0 : d);
			seen.add(table(x));
		}
		expect(seen.size).toBeGreaterThan(1);

		// every 50 ms of game time: ai_check(passive) -> the centre check
		PositionEntity(u.h, 1000, 10, 0);
		u.ai_mode = K.ai_move;
		u.ai_timer = G.gt;
		u.ai_duration = 5000;
		include_001_normal_animal();
		expect(u.ai_mode).toBe(K.ai_move);
		G.in_gt50go = 1;
		include_001_normal_animal();
		expect(u.ai_mode).toBe(K.ai_return);

		// stick state: idle
		u.states = 1;
		states.add(`${Cstate_ai_stick}:${Cclass_unit}:${u.id}`);
		G.in_gt50go = 0;
		u.ai_mode = K.ai_move;
		include_001_normal_animal();
		expect(u.ai_mode).toBe(K.ai_idle);
	});

	it('003 stand and snap / 005 idle turn', () => {
		const u = mkUnit(typOf(3), 0, 10, 0);
		const p = mkPlayer(30, 10, 0);
		G.TCunit = u;
		Dunit_ani_idle1.set(u.typ, 0, 0);
		Dunit_ani_idle2.set(u.typ, 0, 0);
		Dunit_ani_idle3.set(u.typ, 0, 0);
		u.ai_mode = K.ai_flee;
		u.ai_timer = G.gt;
		u.ai_duration = 100;
		include_003_standandsnap();
		expect(u.ai_mode).toBe(K.ai_idle); // getfood/flee end at once
		G.in_gt50go = 1;
		include_003_standandsnap(); // ai_check(aggressive,0,0): the player is in attack range
		expect(game_damage).toHaveBeenCalledTimes(1);
		expect(u.ai_mode).toBe(K.ai_attack);

		const t = mkUnit(typOf(5), 0, 10, 0);
		G.TCunit = t;
		t.ai_mode = K.ai_idle;
		include_005_idleturn();
		// player at +x: DeltaYaw -90, a fifth per frame
		expect(EntityYaw(t.h)).toBeCloseTo(-18, 3);
		PositionEntity(p.h, 60, 10, 0); // out of attack range: no turn
		include_005_idleturn();
		expect(EntityYaw(t.h)).toBeCloseTo(-18, 3);
	});

	it('009 plague: every 3 s looks for the nearest plague_target', () => {
		const typ = typOf(9);
		const u = mkUnit(typ, 0, 10, 0);
		mkPlayer(0, 10, 5000);
		G.TCunit = u;
		u.ai_mode = K.ai_move;
		u.ai_timer = G.gt;
		u.ai_duration = 5000;
		const food = [...DEFS.items.byId.values()].find((d) => d.behaviour === 'plague_target')!.id;
		const other = [...DEFS.items.byId.values()].find((d) => d.behaviour !== 'plague_target')!.id;
		expect(Ditem_behaviour(food)).toBe('plague_target');
		const mk = (id: number, t: number, z: number, parent = 0) => {
			const i = New(Titem);
			i.id = id;
			i.typ = t;
			i.parent_class = parent;
			i.h = CreatePivot();
			PositionEntity(i.h, 0, 10, z);
			targets.set(`${Cclass_item}:${id}`, i.h);
			return i;
		};
		mk(1, other, 20);
		mk(2, food, 400);
		mk(3, food, 30, Cclass_unit); // stored
		mk(4, food, 200);
		mk(5, food, 600); // beyond 500
		const o = New(Tobject);
		o.id = 9;
		o.typ = [...DEFS.objects.byId.values()].find((d) => d.behaviour === 'plague_target')!.id;
		o.h = CreatePivot();
		PositionEntity(o.h, 0, 10, 50);

		include_009_plague(); // in_t3000go = 0: no search
		expect(u.ai_mode).toBe(K.ai_move);
		G.in_t3000go = 1;
		include_009_plague();
		expect(u.ai_mode).toBe(K.ai_getfood);
		expect(u.ai_duration).toBe(20000);
		// item 2 is taken first (400 < 500), then the nearer item 4; objects are not searched once food is found
		expect([u.ai_target_class, u.ai_target_id]).toEqual([Cclass_item, 4]);

		// only an object in range
		for (const i of [...Titem.list]) i.parent_class = Cclass_unit;
		u.ai_mode = K.ai_move;
		targets.set(`${Cclass_object}:9`, o.h);
		include_009_plague();
		expect([u.ai_target_class, u.ai_target_id]).toEqual([Cclass_object, 9]);
	});

	it('200 crab walks sideways; 300/303 fish; 401 circling bird', () => {
		const c = mkUnit(typOf(200), 0, 10, 0);
		G.TCunit = c;
		c.ai_timer = G.gt;
		c.ai_duration = 5000;
		c.ai_mode = K.ai_move;
		include_200_crab();
		expect(EntityX(c.h)).toBeCloseTo(2, 5); // MoveEntity x
		expect(EntityZ(c.h)).toBeCloseTo(0, 5);
		c.ai_mode = K.ai_turnr;
		include_200_crab();
		expect(EntityYaw(c.h)).toBeCloseTo(-3, 4);

		// fish over deep ground: "collision" branch (terrain <= y - colyr): turns twice as fast, steps back, water test
		G.ter_groundy = -100;
		const fi = mkUnit(typOf(300), 0, -20, 0);
		G.TCunit = fi;
		fi.ai_timer = G.gt;
		fi.ai_duration = 5000;
		fi.ai_mode = K.ai_movel;
		include_300_fish();
		expect(EntityYaw(fi.h)).toBeCloseTo(9, 3); // 3 + 6
		// forward 2 (yaw 3), back 2 (yaw 9), forward 2 by ai_watertest (ground not higher: stays)
		expect(Math.hypot(EntityX(fi.h), EntityZ(fi.h))).toBeGreaterThan(1.9);
		// near the ground: plain move
		G.ter_groundy = -22;
		const f2 = mkUnit(typOf(300), 0, -20, 0);
		G.TCunit = f2;
		f2.ai_timer = G.gt;
		f2.ai_duration = 5000;
		f2.ai_mode = K.ai_move;
		include_300_fish();
		expect(EntityZ(f2.h)).toBeCloseTo(2, 5);
		expect(f2.ai_mode).toBe(K.ai_move);
		// expired: Rand(0,7) -> move / left / right
		f2.ai_duration = -1;
		f2.ai_mode = 0;
		SeedRnd(11);
		const x = Rand(0, 7);
		SeedRnd(11);
		include_300_fish();
		expect(f2.ai_mode).toBe(x <= 1 ? K.ai_move : x <= 4 ? K.ai_movel : K.ai_mover);

		// deep sea fish sinks 1*f per frame
		const d = mkUnit(typOf(303), 0, -20, 0);
		G.TCunit = d;
		d.ai_timer = G.gt;
		d.ai_duration = 5000;
		include_303_deepseafish();
		expect(EntityY(d.h)).toBe(-21);

		{
			const b = mkUnit(typOf(401), 0, 300, 0);
			G.TCunit = b;
			b.ai_mode = K.ai_mover;
			include_401_circlingbird();
			expect(EntityZ(b.h)).toBeCloseTo(2, 5);
			expect(EntityYaw(b.h)).toBeCloseTo(-3, 4);
		}
	});

	it('407 land/sky bird and 408 killerbird', () => {
		const has407 = true;
		const p = mkPlayer(0, 10, 99);
		if (has407) {
			const l = mkUnit(typOf(407), 0, 10, 0);
			G.TCunit = l;
			l.ai_mode = K.ai_idle;
			l.ai_timer = G.gt;
			l.ai_duration = 5000;
			include_407_landskybird();
			expect(l.ai_mode).toBe(K.ai_idle);
			G.in_t100go = 1;
			include_407_landskybird(); // player within 100: flies away
			expect(l.ai_mode).toBe(K.ai_rise);
			G.in_t100go = 0;
			include_407_landskybird(); // rising: pitch -35, forward, turn
			expect(EntityPitch(l.h)).toBeCloseTo(-35, 0);
			expect(EntityYaw(l.h)).toBeCloseTo(3 / Math.cos((35 * Math.PI) / 180), 1); // turned about the pitched axis
			expect(EntityY(l.h)).toBeGreaterThan(10);
			l.ai_mode = K.ai_move;
			include_407_landskybird(); // pitch 0 again
			expect(EntityPitch(l.h)).toBeCloseTo(0, 3);
		}

		const k = mkUnit(typOf(408), 0, 200, 0);
		G.TCunit = k;
		k.ai_mode = K.ai_attack;
		k.ai_timer = G.gt;
		include_408_killerbird(); // after the attack: rise for 3..5 s
		expect(k.ai_mode).toBe(K.ai_rise);
		expect(k.ai_duration).toBeGreaterThanOrEqual(3000);
		expect(k.ai_duration).toBeLessThanOrEqual(5000);

		// hunting: dives towards the player; gives up when the player is in the water
		k.ai_mode = K.ai_hunt;
		k.ai_duration = 50000;
		PositionEntity(k.h, 0, 200, 0);
		RotateEntity(k.h, 0, 0, 0);
		include_408_killerbird();
		expect(EntityPitch(k.h)).toBeGreaterThan(0);
		expect(EntityY(k.h)).toBeLessThan(200);
		expect(k.ai_mode).toBe(K.ai_hunt);
		PositionEntity(p.h, 0, 0, 99);
		include_408_killerbird();
		expect(k.ai_mode).toBe(K.ai_rise);
	});

	// ------------------------------------------------------------------ ai_signals.bb (executable)

	it('ai_signal: every living unit in range gets target and mode; TCunit is restored', () => {
		const typ = typOf(1);
		const src = CreatePivot();
		targets.set(`${Cclass_info}:9`, src);
		const a = mkUnit(typ, 0, 0, 10);
		const b = mkUnit(typ, 0, 0, 500);
		const c = mkUnit(typ, 0, 0, 5);
		const d = mkUnit(typ, 0, 0, 20);
		c.health = 0;
		d.ai_mode = K.ai_getfood;
		d.ai_duration = 1;
		const cur = mkUnit(typ, 0, 0, 9999);
		G.TCunit = cur;
		ai_signal(Cclass_info, 9, K.ai_food, 100);
		expect([a.ai_target_class, a.ai_target_id, a.ai_mode, a.ai_duration]).toEqual([Cclass_info, 9, K.ai_getfood, 20000]);
		expect([b.ai_target_id, b.ai_mode]).toEqual([0, 0]);
		expect([c.ai_target_id, c.ai_mode]).toEqual([0, 0]);
		// already in that mode: target set, mode call skipped
		expect([d.ai_target_id, d.ai_duration]).toEqual([9, 1]);
		expect(G.TCunit).toBe(cur);

		ai_signal(Cclass_info, 9, K.ai_attract, 100);
		expect([a.ai_mode, d.ai_mode]).toEqual([K.ai_movetarget, K.ai_movetarget]);
		ai_signal(Cclass_info, 9, K.ai_distract, 100);
		expect(a.ai_mode).toBe(K.ai_flee);
		// unknown signal: only the target
		a.ai_target_id = 0;
		ai_signal(Cclass_info, 9, 77, 100);
		expect([a.ai_target_id, a.ai_mode]).toEqual([9, K.ai_flee]);
		// no source entity: nothing
		a.ai_target_id = 0;
		ai_signal(Cclass_info, 1234, K.ai_food, 100);
		expect(a.ai_target_id).toBe(0);
		expect(G.TCunit).toBe(cur);
	});

	it('ai_typesignal / ai_behavioursignal / ai_unitmode', () => {
		const t1 = typOf(1);
		const t2 = typOf(2);
		const src = CreatePivot();
		targets.set(`${Cclass_object}:3`, src);
		const a = mkUnit(t1, 0, 0, 10);
		const b = mkUnit(t2, 0, 0, 10);
		G.TCunit = null;
		ai_typesignal(Cclass_object, 3, K.ai_distract, t2, 100);
		expect(a.ai_mode).toBe(0);
		expect([b.ai_mode, b.ai_duration, b.ai_target_class, b.ai_target_id]).toEqual([K.ai_flee, 10000, Cclass_object, 3]);
		expect(G.TCunit).toBeNull();

		// behaviour signal: restarts the timer with 10000 even when the signal is unknown
		G.gt = 123456;
		a.ai_mode = K.ai_move;
		a.ai_duration = 1;
		ai_behavioursignal(Cclass_object, 3, 77, Dunit_behaviour(t1), 100);
		expect([a.ai_mode, a.ai_duration, a.ai_timer, a.ai_target_id]).toEqual([K.ai_move, 10000, 123456, 3]);
		expect(b.ai_timer).not.toBe(123456);
		ai_behavioursignal(Cclass_object, 3, K.ai_attract, Dunit_behaviour(t1), 100);
		expect(a.ai_mode).toBe(K.ai_movetarget);
		ai_behavioursignal(Cclass_object, 3, K.ai_food, Dunit_behaviour(t1), 5); // out of range
		expect(a.ai_mode).toBe(K.ai_movetarget);

		// ai_unitmode: con_unit, ai_mode(mode) with a random duration, target; TCunit stays on the unit
		SeedRnd(21);
		const dur = Rand(1500, 3500);
		SeedRnd(21);
		ai_unitmode(a.id, K.ai_flee, Cclass_unit, 42);
		expect([a.ai_mode, a.ai_duration, a.ai_target_class, a.ai_target_id]).toEqual([K.ai_flee, dur, Cclass_unit, 42]);
		expect(G.TCunit).toBe(a);
		ai_unitmode(9999, K.ai_idle, 0, 0);
		expect(a.ai_mode).toBe(K.ai_flee);
	});

	// ------------------------------------------------------------------ unitpath.bb

	it('up_setup / up_addnode / up_controlled / up_free', () => {
		up_setup(5);
		up_addnode(5, 11);
		up_addnode(5, 12);
		up_addnode(6, 13); // a node without controller: mode 0, i.e. it IS a controller (quirk of the counting)
		const of5 = () => [...Tup.list].filter((t) => t.unit === 5).map((t) => [t.info, t.mode]);
		expect(of5()).toEqual([
			[1, 0],
			[11, 1],
			[12, 2]
		]);
		expect(up_controlled(5)).toBe(1);
		expect(up_controlled(6)).toBe(1);
		expect(up_controlled(7)).toBe(0);
		up_setup(5); // again: old path deleted
		expect(of5()).toEqual([[1, 0]]);
		up_free(5);
		expect(of5()).toEqual([]);
		expect(up_controlled(5)).toBe(0);

		// 256 objects per unit at most (controller + 255 nodes)
		G.set_debug = 1;
		up_setup(8);
		for (let i = 1; i <= 255; i++) up_addnode(8, i);
		expect(con_add).not.toHaveBeenCalled();
		up_addnode(8, 256);
		expect(con_add).toHaveBeenCalledWith('ERROR: Unitpath nodes are limited to 256 per unit!', Cbmpf_red);
		expect([...Tup.list].filter((t) => t.unit === 8).length).toBe(256);
	});

	it('up_update: walks to the node, reaches it, ends the path', () => {
		const typ = typOf(1);
		const u = mkUnit(typ, 0, 0, 0);
		const mkInfo = (id: number, z: number) => {
			const i = New(Tinfo);
			i.id = id;
			i.h = CreatePivot();
			PositionEntity(i.h, 0, 0, z);
			return i;
		};
		mkInfo(11, 50);
		mkInfo(12, 400);
		up_setup(u.id);
		up_addnode(u.id, 11);
		up_addnode(u.id, 12);
		const root = [...Tup.list][0];

		up_update(); // paused
		expect(EntityZ(u.h)).toBe(0);
		G.g_unpaused = 1;
		up_update();
		expect(EntityZ(u.h)).toBeCloseTo(2, 5); // Dunit_speed*f straight ahead
		expect([u.ai_mode, u.ai_duration, u.ai_timer]).toEqual([-1, 1000, G.gt]);
		expect(ani_unit).toHaveBeenCalled();
		expect(root.info).toBe(1);

		// with states the speed is unit_speed()
		u.states = 1;
		unit_speed.mockImplementation(() => 5);
		up_update();
		expect(EntityZ(u.h)).toBeCloseTo(7, 5);
		u.states = 0;

		// the step leads away from the node (and the node is within speed*50): reached
		PositionEntity(u.h, 0, 0, 49.5);
		Dunit_scriptk.set(typ, '\xa6node0011');
		G.set_debug = 1;
		up_update();
		expect(con_add).toHaveBeenCalledWith(`unitpath ${u.id}: reached node 1 @ info 11`, K.Cbmpf_green);
		expect(set_parsecache).toHaveBeenCalledWith(Cclass_unit, u.id, 'node0011');
		expect(parse_task).toHaveBeenCalledWith(Cclass_unit, u.id, 'node0011', 'reached by unit ' + u.id, expect.any(String));
		expect(parse_sel).toHaveBeenCalledWith(Cclass_unit, u.id, 'node0011');
		expect(set_parsecache).toHaveBeenCalledWith(Cclass_info, 11, 'reach');
		expect(root.info).toBe(2);
		expect([...Tup.list].map((t) => t.mode)).toEqual([0, 2]); // node 1 deleted
		expect(EntityZ(u.h)).toBeCloseTo(49.5, 4); // last step undone
		expect(u.ai_cz).toBeCloseTo(49.5, 4); // ai_center

		// far node (>100): only a fifth of the turn per frame
		PositionEntity(u.h, 0, 0, 0);
		const i12 = [...Tinfo.list][1];
		PositionEntity(i12.h, 400, 0, 0);
		up_update();
		expect(EntityYaw(u.h)).toBeCloseTo(-18, 3);

		// last node reached: the whole path is deleted
		RotateEntity(u.h, 0, 0, 0);
		PositionEntity(u.h, 0, 0, 0);
		PositionEntity(i12.h, 0, 0, -0.5);
		up_update();
		expect(con_add).toHaveBeenCalledWith(`unitpath ${u.id}: end (no more nodes found)`, Cbmpf_red);
		expect(Tup.list.count).toBe(0);
		expect(up_controlled(u.id)).toBe(0);
	});

	it('up_update: missing info, missing node, missing unit', () => {
		const typ = typOf(1);
		const u = mkUnit(typ);
		G.g_unpaused = 1;
		G.set_debug = 1;
		up_setup(u.id);
		up_addnode(u.id, 55); // no such info
		const root = [...Tup.list][0];
		up_update();
		expect(con_add).toHaveBeenLastCalledWith(`unitpath ${u.id}: skipping node 1 @ info 55 (info not found)`, Cbmpf_red);
		expect(root.info).toBe(2);
		expect(Tup.list.count).toBe(2);
		up_update(); // node 2 does not exist
		expect(con_add).toHaveBeenLastCalledWith(`unitpath ${u.id}: end (no more nodes found)`, Cbmpf_red);
		expect(Tup.list.count).toBe(0);

		up_setup(4711);
		up_addnode(4711, 1);
		up_setup(u.id);
		up_update();
		expect(con_add).toHaveBeenCalledWith('unitpath 4711: End (units 4711 does Not exist)', Cbmpf_red);
		expect(Tup.list.count).toBe(0); // both paths gone (the second one had no nodes)
	});
});
