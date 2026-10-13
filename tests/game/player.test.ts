/**
 * Package "player": game.bb, game_functions.bb, game_input.bb,
 * game_input_vehicles.bb, game_focus.bb, game_changeday.bb, skills.bb.
 *
 * Expected values are derived from reading the original source; other
 * packages' functions are mocked on their modules.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CreatePivot,
	CreateTerrain,
	EntityPitch,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	LoadAnimMesh,
	PositionEntity,
	RotateEntity,
	type BBEntity,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Float, Int, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import * as collisions from '../../src/lib/s2/game/collisions';
import * as console_ from '../../src/lib/s2/game/console';
import {
	Cbmpf_red,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Ckey_attack2,
	Ckey_char,
	Ckey_diary,
	Ckey_forward,
	Ckey_items,
	Ckey_jump,
	Ckey_left,
	Cmenu_if_char,
	Cmenu_if_diary,
	Cmenu_if_items,
	Cmenu_if_movie,
	Cpm_in,
	Cpm_out,
	Cstate_pc_build,
	Cstate_pc_custom,
	Cstate_pc_dig,
	Cstate_pc_fish,
	ai_idle
} from '../../src/lib/s2/game/consts';
import * as cull from '../../src/lib/s2/game/cull';
import {
	Dinfo_name,
	Ditem_behaviour,
	Ditem_health,
	Ditem_healthchange,
	Dobject_growtime,
	Dobject_healthchange,
	Dobject_spawn,
	Dunit_ani_move,
	Dunit_behaviour,
	Dunit_eyes,
	Dunit_healthchange,
	Dunit_model,
	Dunit_speed,
	Dunit_store,
	Dunit_tspeed,
	Dunit_v,
	loadAllDefinitions
} from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import { e_tery } from '../../src/lib/s2/game/e_environment';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import { game } from '../../src/lib/s2/game/game';
import * as game_build from '../../src/lib/s2/game/game_build';
import { game_cd, game_cd_item, game_cd_object, game_cd_unit } from '../../src/lib/s2/game/game_changeday';
import { focus_draw, focus_update } from '../../src/lib/s2/game/game_focus';
import {
	game_ammo,
	game_ammo_bytype,
	game_attack2,
	game_damage,
	game_exhaust,
	game_explosion,
	game_falldamage,
	game_move,
	game_picking,
	game_playerh,
	game_playerspawn,
	game_renderweapon,
	game_scrollweapon,
	game_setcam,
	game_setplayer,
	game_sleep,
	game_target,
	game_use,
	game_useasweapon,
	game_weapon_bytype
} from '../../src/lib/s2/game/game_functions';
import { game_input_menu, game_input_normal } from '../../src/lib/s2/game/game_input';
import { game_input_animal, game_input_vehicledata, game_input_vehicles } from '../../src/lib/s2/game/game_input_vehicles';
import * as game_sequences from '../../src/lib/s2/game/game_sequences';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as motionblur from '../../src/lib/s2/game/motionblur';
import * as particles from '../../src/lib/s2/game/particles';
import * as projectiles from '../../src/lib/s2/game/projectiles';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { free_skill, got_skill, inc_skill, set_skill, skill_name, skill_value } from '../../src/lib/s2/game/skills';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, First, New, TYPES, Tcache, Tinfo, Titem, Tobject, Tp, Tseq, Tunit, Tx } from '../../src/lib/s2/game/types';
import * as unitpath from '../../src/lib/s2/game/unitpath';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

describe.skipIf(!existsSync(MOD))('package player', () => {
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

	// ------------------------------------------------------------ helpers

	/** a unit record with pivots as handles (no model) */
	function mkUnit(id: number, typ = 1, x = 0, y = 0, z = 0): Tunit {
		const u = New(Tunit);
		u.id = id;
		u.typ = typ;
		u.h = CreatePivot();
		u.mh = CreatePivot();
		PositionEntity(u.h, x, y, z);
		u.health = 100;
		u.health_max = 100;
		return u;
	}
	function mkItem(id: number, typ: number, parent_class = 0, parent_id = 0, parent_mode = Cpm_in): Titem {
		const it = New(Titem);
		it.id = id;
		it.typ = typ;
		it.h = CreatePivot();
		it.parent_class = parent_class;
		it.parent_id = parent_id;
		it.parent_mode = parent_mode;
		it.count = 1;
		return it;
	}
	function mkObject(id: number, typ: number, x = 0, y = 0, z = 0): Tobject {
		const o = New(Tobject);
		o.id = id;
		o.typ = typ;
		o.h = CreatePivot();
		PositionEntity(o.h, x, y, z);
		return o;
	}
	/** con_unit of handle_units.bb: sets TCunit, 1 if found */
	function mockConUnit() {
		return vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
			for (const u of Each(Tunit)) {
				if (u.id === id) {
					G.TCunit = u;
					return 1;
				}
			}
			return 0;
		});
	}
	function player(id = 1, x = 0, y = 0, z = 0): Tunit {
		const u = mkUnit(id, 1, x, y, z);
		G.g_player = id;
		G.g_cplayer = u;
		return u;
	}
	function events() {
		const calls: string[] = [];
		vi.spyOn(RT.script, 'parse_globalevent').mockImplementation((event: string, info = '') => {
			calls.push(info === '' ? event : event + '|' + info);
		});
		return calls;
	}
	const ammoTypesFor = (weapon: number): number[] =>
		[...DEFS.items.byId.keys()].filter((id) => (Ditem_behaviour(id).replace(/[ ;]/g, ',') + ',').includes('ammo:' + weapon + ',')).sort((a, b) => a - b);

	// ------------------------------------------------------------ skills.bb

	describe('skills.bb', () => {
		it('set_skill creates (1) and modifies (2); the caption is only replaced when given', () => {
			expect(set_skill('dig', 5, 'Digging')).toBe(1);
			const tx = First(Tx)!;
			expect([tx.mode, tx.key, tx.value, tx.stuff]).toEqual([5, 'dig', '5', 'Digging']);
			expect(set_skill('dig', 9)).toBe(2);
			expect([tx.value, tx.stuff]).toEqual(['9', 'Digging']);
			expect(set_skill('dig', -3, 'Dig')).toBe(2);
			expect([tx.value, tx.stuff]).toEqual(['-3', 'Dig']);
			expect(Tx.list.count).toBe(1);
		});

		it('inc_skill adds to the value (1) or creates (0); it always overwrites the caption', () => {
			expect(inc_skill('fish', 4, 'Fishing')).toBe(0);
			expect(skill_value('fish')).toBe(4);
			expect(inc_skill('fish', 3)).toBe(1);
			const tx = First(Tx)!;
			expect(tx.value).toBe('7');
			expect(tx.stuff).toBe(''); // quirk: caption lost
		});

		it('only mode 5 records are skills', () => {
			const other = New(Tx);
			other.mode = 4;
			other.key = 'hunt';
			other.value = '12';
			expect(got_skill('hunt')).toBe(0);
			expect(skill_value('hunt')).toBe(0);
			expect(skill_name('hunt', 'x')).toBe(0);
			expect(free_skill('hunt')).toBe(0);
			set_skill('hunt', 2);
			expect(got_skill('hunt')).toBe(1);
			expect(skill_value('hunt')).toBe(2);
			expect(skill_name('hunt', 'Hunting')).toBe(1);
			expect([...Each(Tx)].find((t) => t.mode === 5)!.stuff).toBe('Hunting');
			expect(free_skill('hunt')).toBe(1);
			expect(got_skill('hunt')).toBe(0);
			expect(Tx.list.count).toBe(1);
		});

		it('skill_value parses the stored text like Int()', () => {
			set_skill('a', 1);
			First(Tx)!.value = '12abc';
			expect(skill_value('a')).toBe(12);
		});
	});

	// ------------------------------------------------------------ game_changeday.bb

	describe('game_changeday.bb', () => {
		it('game_cd: event, weather by climate, spawn control infos', () => {
			const ev = events();
			const weather = vi.spyOn(RT.core, 'e_environment_setweather').mockImplementation(() => {});
			const spawn = vi.spyOn(handle_infos, 'info_spawncontrol').mockImplementation(() => {});
			const i1 = New(Tinfo);
			i1.typ = 45;
			const i2 = New(Tinfo);
			i2.typ = 1;

			G.map_climate = 3;
			game_cd();
			expect(ev).toEqual(['changeday']);
			expect(weather).toHaveBeenLastCalledWith(1);
			expect(spawn).toHaveBeenCalledTimes(1);
			expect(spawn).toHaveBeenCalledWith(i1);

			G.map_climate = 0;
			G.map_rainratio = 100; // Rand(1,100)<=100: always rain
			game_cd();
			expect(weather).toHaveBeenLastCalledWith(1);
			G.map_rainratio = 0;
			game_cd();
			expect(weather).toHaveBeenLastCalledWith(0);

			G.map_climate = 1;
			G.map_snowratio = 100;
			game_cd();
			expect(weather).toHaveBeenLastCalledWith(2);
			G.map_snowratio = 0;
			game_cd();
			expect(weather).toHaveBeenLastCalledWith(0);

			for (const [climate, w] of [
				[2, 0],
				[4, 2],
				[5, 3]
			]) {
				G.map_climate = climate;
				game_cd();
				expect(weather).toHaveBeenLastCalledWith(w);
			}
			weather.mockClear();
			G.map_climate = 6; // no Case
			game_cd();
			expect(weather).not.toHaveBeenCalled();
		});

		it('game_cd runs every object, unit and item through the TC globals', () => {
			events();
			vi.spyOn(RT.core, 'e_environment_setweather').mockImplementation(() => {});
			G.map_climate = 2;
			const typ = [...DEFS.units.byId.keys()][0];
			const u1 = mkUnit(100, typ);
			const u2 = mkUnit(5, typ);
			u1.health = 0; // dead, id>=100: freed
			u2.health = 0; // dead player slot: kept
			const u3 = mkUnit(101, typ);
			const free = vi.spyOn(handle_units, 'free_unit').mockImplementation(() => 1);
			const health = vi.spyOn(handle_units, 'health_unit').mockImplementation(() => {});
			game_cd();
			expect(free.mock.calls).toEqual([[100]]);
			expect(health.mock.calls).toEqual([[Dunit_healthchange(typ)]]);
			expect(G.TCunit).toBeNull(); // For TCunit=Each: Null after the loop
			expect(u3.health).toBe(100);
		});

		it('game_cd_object: growing objects count up and grow', () => {
			const typ = [...DEFS.objects.byId.keys()].find((t) => Dobject_growtime(t) > 0)!;
			expect(typ).toBeDefined();
			const grow = vi.spyOn(handle_objects, 'grow_object').mockImplementation(() => {});
			const o = mkObject(7, typ);
			o.daytimer = -3;
			G.TCobject = o;
			game_cd_object();
			expect(o.daytimer).toBe(-2);
			expect(grow).toHaveBeenCalledWith(o);

			// no growtime: untouched
			const typ0 = [...DEFS.objects.byId.keys()].find((t) => Dobject_growtime(t) === 0)!;
			const o2 = mkObject(8, typ0);
			o2.daytimer = -3;
			G.TCobject = o2;
			grow.mockClear();
			game_cd_object();
			expect(o2.daytimer).toBe(-3);
			expect(grow).not.toHaveBeenCalled();
		});

		it('game_cd_object: spawns an item when the rate is reached and the limit is not', () => {
			const typ = [...DEFS.objects.byId.keys()].find((t) => Dobject_spawn(t) !== '')!;
			expect(typ).toBeDefined();
			const sp = Dobject_spawn(typ).split(',');
			const s_item = Int(sp[0]);
			const s_rate = Int(sp[1]);
			const s_yr = Float(sp[3] ?? '');
			const s_yo = Float(sp[4] ?? '');
			const s_limit = Int(sp[5] ?? '');
			const s_count = Int(sp[6] ?? '');
			Dobject_healthchange.set(typ, 0);
			const o = mkObject(7, typ, 10, 20, 30);
			o.daytimer = s_rate - 1;
			G.TCobject = o;
			const stored = vi.spyOn(handle_items, 'countstored_items').mockReturnValue(s_limit - 1);
			const set_item = vi.spyOn(handle_items, 'set_item').mockImplementation((_id, t) => {
				G.TCitem = mkItem(55, t);
				return 55;
			});
			const store = vi.spyOn(handle_items, 'store_item').mockImplementation(() => 1);
			game_cd_object();
			expect(o.daytimer).toBe(0);
			expect(stored).toHaveBeenCalledWith(Cclass_object, 7, s_item, 1);
			expect(set_item).toHaveBeenCalledWith(-1, s_item, 0, 0, 0, s_count);
			expect(store).toHaveBeenCalledTimes(1);
			const a = store.mock.calls[0];
			expect(a.slice(0, 5)).toEqual([55, Cclass_object, 7, Cpm_out, 10]);
			expect(a[5]).toBeGreaterThanOrEqual(20 - s_yr + s_yo - 0.001);
			expect(a[5]).toBeLessThanOrEqual(20 + s_yr + s_yo + 0.001);
			expect(a[6]).toBe(30);
			expect(EntityPitch(G.TCitem!.h)).toBeCloseTo(-90, 3); // last RotateEntity

			// limit reached: the timer is reset but nothing spawns
			o.daytimer = s_rate - 1;
			stored.mockReturnValue(s_limit);
			set_item.mockClear();
			game_cd_object();
			expect(o.daytimer).toBe(0);
			expect(set_item).not.toHaveBeenCalled();

			// rate not reached: only counts
			if (s_rate > 1) {
				o.daytimer = 0;
				game_cd_object();
				expect(o.daytimer).toBe(1);
				expect(set_item).not.toHaveBeenCalled();
			}
		});

		it('game_cd_object: health change, invulnerability, kill at 0, cap at health_max', () => {
			const typ = [...DEFS.objects.byId.keys()].find((t) => Dobject_spawn(t) === '')!;
			const o = mkObject(9, typ);
			o.health = 10;
			o.health_max = 12;
			G.TCobject = o;
			const state = vi.spyOn(handle_states, 'get_state').mockReturnValue(1);
			const dmg = vi.spyOn(handle_objects, 'damage_object').mockImplementation(() => 0);

			Dobject_healthchange.set(typ, -4);
			game_cd_object(); // invulnerable
			expect(o.health).toBe(10);
			state.mockReturnValue(0);
			game_cd_object();
			expect(o.health).toBe(6);
			expect(dmg).not.toHaveBeenCalled();
			game_cd_object();
			game_cd_object();
			expect(o.health).toBe(-2);
			expect(dmg).toHaveBeenCalledTimes(1);
			expect(dmg).toHaveBeenCalledWith(0, 1);
			expect(o.daytimer).toBe(0); // no spawn definition: the timer does not count

			Dobject_healthchange.set(typ, 9);
			game_cd_object();
			expect(o.health).toBe(7);
			game_cd_object();
			expect(o.health).toBe(12);
		});

		it('game_cd_unit', () => {
			const typ = [...DEFS.units.byId.keys()][0];
			const free = vi.spyOn(handle_units, 'free_unit').mockImplementation(() => 1);
			const health = vi.spyOn(handle_units, 'health_unit').mockImplementation(() => {});
			const u = mkUnit(100, typ);
			u.health = 0;
			G.TCunit = u;
			game_cd_unit();
			expect(free).toHaveBeenCalledWith(100);
			u.id = 99;
			free.mockClear();
			game_cd_unit();
			expect(free).not.toHaveBeenCalled();
			expect(health).not.toHaveBeenCalled();
			u.health = 1;
			game_cd_unit();
			expect(health).toHaveBeenCalledWith(Dunit_healthchange(typ));
		});

		it('game_cd_item: only free items change; decay frees at 0, healing is capped', () => {
			const typ = [...DEFS.items.byId.keys()][0];
			const state = vi.spyOn(handle_states, 'get_state').mockReturnValue(0);
			const free = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1);
			const it1 = mkItem(3, typ, Cclass_unit, 1);
			it1.health = 5;
			Ditem_healthchange.set(typ, -3);
			G.TCitem = it1;
			game_cd_item();
			expect(it1.health).toBe(5); // stored: no change

			it1.parent_class = 0;
			game_cd_item();
			expect(it1.health).toBe(2);
			expect(state).toHaveBeenCalledWith(17, Cclass_item, 3);
			expect(free).not.toHaveBeenCalled();
			game_cd_item();
			expect(it1.health).toBe(-1);
			expect(free).toHaveBeenCalledWith(3);

			state.mockReturnValue(1);
			game_cd_item();
			expect(it1.health).toBe(-1);

			Ditem_healthchange.set(typ, 1e9);
			game_cd_item();
			expect(it1.health).toBe(Ditem_health(typ));
		});
	});

	// ------------------------------------------------------------ game_focus.bb

	describe('game_focus.bb', () => {
		it('focus_update rescans every 300 ms and only in the game', () => {
			G.m_menu = 0;
			G.ms = 1000;
			G.in_fo_timer = 700;
			G.in_focus = 9;
			G.pc_typ = Cstate_pc_dig;
			focus_update(); // 300 is not > 300
			expect(G.in_focus).toBe(9);
			G.ms = 1001;
			focus_update();
			expect(G.in_focus).toBe(Cstate_pc_dig);
			expect(G.in_fo_timer).toBe(1001);
			G.pc_typ = 0;
			G.ms = 1400;
			focus_update();
			expect(G.in_focus).toBe(0);
			G.m_menu = 2;
			G.pc_typ = 5;
			G.ms = 5000;
			focus_update();
			expect(G.in_focus).toBe(0);
		});

		it('focus_draw: the build process ends after 3000 ms', () => {
			const bf = vi.spyOn(game_build, 'game_buildfocus').mockImplementation(() => {});
			G.in_focus = Cstate_pc_build;
			G.pc_typ = Cstate_pc_build;
			G.pc_child = 44;
			G.pc_gt = 1000;
			G.gt = 3999;
			focus_draw();
			expect(bf).toHaveBeenCalledWith(44);
			expect(G.pc_typ).toBe(Cstate_pc_build);
			G.gt = 4000;
			focus_draw();
			expect([G.pc_typ, G.in_focus]).toEqual([0, 0]);
		});

		it('focus_draw: the custom process returns to its menu and raises its event', () => {
			const ev = events();
			G.in_focus = Cstate_pc_custom;
			G.pc_typ = Cstate_pc_custom;
			G.in_pc_custom = 'Working';
			G.in_pc_customt = 2000;
			G.in_pc_menu = Cmenu_if_items;
			G.in_pc_menu_x = 120;
			G.in_pc_menu_y = 80;
			G.in_pc_event = 'done';
			G.pc_gt = 500;
			G.gt = 2499;
			focus_draw();
			expect(G.pc_typ).toBe(Cstate_pc_custom);
			expect(ev).toEqual([]);
			G.gt = 2500;
			focus_draw();
			expect([G.pc_typ, G.in_focus, G.m_menu, G.in_pc_menu]).toEqual([0, 0, Cmenu_if_items, 0]);
			expect(ev).toEqual(['done']);
		});

		it('focus_draw: digging and fishing end in game_dig / game_fish', () => {
			const ev = events();
			const con = vi.spyOn(console_, 'con_add').mockImplementation(() => {});
			vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0);
			player(1);
			G.env_sea2 = CreatePivot(); // the headless world has no sea
			G.in_focus = Cstate_pc_dig;
			G.pc_typ = Cstate_pc_dig;
			G.game_digtime = 2500;
			G.pc_gt = 0;
			G.gt = 2499;
			focus_draw();
			expect(con).not.toHaveBeenCalled();
			G.gt = 2500;
			focus_draw();
			expect([G.pc_typ, G.in_focus]).toEqual([0, 0]);
			// game_dig with nothing around: all four "DIG ..." lines and the failure event
			expect(con.mock.calls.map((c) => c[0])).toEqual(['DIG', 'DIG NOINFO', 'DIG NOOBJECT', 'DIG NOUNIT', 'DIG NOITEM']);
			expect(ev).toEqual(['dig_failure']);

			ev.length = 0;
			G.in_focus = Cstate_pc_fish;
			G.pc_typ = Cstate_pc_fish;
			G.game_fishtime = 100;
			G.gt = 100;
			G.ter = CreateTerrain(32); // game_fish probes the terrain height in front of the camera
			// keep the player's own unit out of reach of the camera (range 150)
			PositionEntity(G.g_cplayer!.h, 5000, 0, 5000);
			focus_draw();
			expect([G.pc_typ, G.in_focus]).toEqual([0, 0]);
			expect(ev).toEqual(['fish_failure']); // no sea entity in the headless world
		});
	});

	// ------------------------------------------------------------ game_functions.bb

	describe('game_functions.bb: player and camera', () => {
		it('game_playerh', () => {
			expect(game_playerh()).toBe(-1);
			const u = player(3);
			mkUnit(4);
			expect(game_playerh()).toBe(u.h);
		});

		it('game_setplayer', () => {
			mockConUnit();
			const u = mkUnit(3);
			game_setplayer(3);
			expect(G.g_player).toBe(3);
			expect(G.g_cplayer).toBe(u);
			expect(() => game_setplayer(8)).toThrow('Unable to setup player #8 (game_setplayer)');
			expect(G.g_player).toBe(8); // set before the check
		});

		it('game_playerspawn without a spawn info: error, player at the centre', () => {
			const con = vi.spyOn(console_, 'con_add').mockImplementation(() => {});
			const free = vi.spyOn(handle_units, 'free_unit').mockImplementation(() => 1);
			const set = vi.spyOn(handle_units, 'set_unit').mockImplementation(() => 1);
			G.tmp_spawnid = 9;
			expect(game_playerspawn(1)).toBe(0);
			expect(con).toHaveBeenCalledWith("ERROR: Missing info '" + Dinfo_name(1) + "' - spawning player at center", Cbmpf_red);
			expect(free).toHaveBeenCalledWith(1);
			expect(set).toHaveBeenCalledWith(1, 1, 0, 0);
			expect(G.tmp_spawnid).toBe(0);

			con.mockClear();
			expect(game_playerspawn(1, 77)).toBe(0);
			expect(con).toHaveBeenCalledWith("ERROR: Missing info '" + Dinfo_name(1) + "' with ID #77 - spawning player at center", Cbmpf_red);
		});

		it('game_playerspawn at an info: position, camera rotation, tmp_spawnid', () => {
			vi.spyOn(handle_units, 'free_unit').mockImplementation(() => 1);
			const set = vi.spyOn(handle_units, 'set_unit').mockImplementation((id) => {
				G.TCunit = mkUnit(id);
				return id;
			});
			const pos = vi.spyOn(handle_units, 'pos_unit').mockImplementation(() => {});
			const other = New(Tinfo);
			other.typ = 2;
			other.id = 5;
			other.h = CreatePivot();
			const info = New(Tinfo);
			info.typ = 1;
			info.id = 5;
			info.h = CreatePivot();
			PositionEntity(info.h, 100, 50, -30);
			RotateEntity(info.h, 10, 45, 0);
			G.g_player = 1;
			expect(game_playerspawn(1, 5)).toBe(1);
			expect(set).toHaveBeenCalledWith(1, 1, 100, -30);
			expect(pos).toHaveBeenCalledWith(G.TCunit, 100, 50, -30);
			expect(G.tmp_spawnid).toBe(5);
			expect(EntityPitch(G.cam)).toBeCloseTo(10, 3);
			expect(EntityYaw(G.cam)).toBeCloseTo(45, 3);

			// another player's spawn does not turn the camera
			RotateEntity(G.cam, 0, 0, 0);
			expect(game_playerspawn(2, 5)).toBe(1);
			expect(EntityYaw(G.cam)).toBeCloseTo(0, 3);

			// random spawn: loops until Rand(10)=1 hits the (only) spawn info
			G.tmp_spawnid = 0;
			expect(game_playerspawn(1)).toBe(1);
			expect(G.tmp_spawnid).toBe(5);
		});

		it('game_setcam in the game: eyes of the living player; a dead player sinks to 8 above the ground', () => {
			const u = player(1, 10, 20, 30);
			G.m_menu = 0;
			G.f = 1;
			expect(game_setcam()).toBe(1);
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([10, f32(20 + Dunit_eyes(1)), 30]);
			expect([EntityX(G.camxz), EntityY(G.camxz), EntityZ(G.camxz)]).toEqual([10, 0, 30]);

			u.health = 0;
			const ground = e_tery(10, 30);
			PositionEntity(G.cam, 0, ground + 100, 0);
			expect(game_setcam()).toBe(1);
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([10, f32(ground + 100 - 1.5), 30]);
			PositionEntity(G.cam, 0, ground + 9, 0);
			expect(game_setcam()).toBe(1); // 7.5 above the ground -> lifted to 8
			expect(EntityY(G.cam)).toBe(f32(ground + 8));

			G.g_player = 0;
			expect(game_setcam()).toBe(0);
		});

		it('game_setcam while driving: follows the unit, freezes its AI, stops when it is gone or dead', () => {
			mockConUnit();
			const u = player(1, 0, 0, 0);
			const typ = [...DEFS.units.byId.keys()].find((t) => Dunit_behaviour(t) >= 500) ?? 1;
			const v = mkUnit(200, typ, 300, 40, -500);
			v.ai_mode = 7;
			v.ai_cx = 0;
			v.ai_cz = 0;
			G.m_menu = 0;
			G.g_drive = 200;
			G.gt = 12345;
			expect(game_setcam()).toBe(0); // quirk: the driving branch falls through to Return 0
			expect(EntityX(u.h)).toBe(300);
			expect(EntityZ(u.h)).toBe(-500);
			expect(EntityY(G.cam)).toBe(EntityY(u.h) + Dunit_eyes(1));
			expect([v.ai_mode, v.ai_duration, v.ai_timer]).toEqual([0, 5000, 12345]);
			expect([v.ai_cx, v.ai_cz]).toEqual([300, -500]); // further than 200 from the old centre

			v.health_max = 0; // "dead" vehicle
			expect(game_setcam()).toBe(1);
			expect(G.g_drive).toBe(0);

			G.g_drive = 999; // no such unit
			expect(game_setcam()).toBe(1);
			expect(G.g_drive).toBe(0);

			G.g_drive = 200;
			u.health = 0; // killed while driving
			expect(game_setcam()).toBe(1);
			expect(G.g_drive).toBe(0);
		});

		it('game_setcam: build setup and select place raise the camera; movie updates the sequence', () => {
			mockConUnit();
			player(1, 0, 10, 0);
			G.f = 1;
			G.m_menu = 300; // Cmenu_if_buildsetup
			G.in_buildcamh = 100;
			PositionEntity(G.cam, 0, 20, 0);
			RotateEntity(G.cam, 0, 0, 0);
			expect(game_setcam()).toBe(0);
			expect(EntityY(G.cam)).toBe(25);
			expect(EntityPitch(G.cam)).toBeCloseTo(1, 4);
			G.in_buildcamh = 5; // far enough
			game_setcam();
			expect(EntityY(G.cam)).toBe(25);

			G.m_menu = 301; // Cmenu_if_selplace
			G.pc_sp_height = 50;
			game_setcam();
			expect(EntityY(G.cam)).toBe(30);

			const seq = vi.spyOn(game_sequences, 'seq_update').mockImplementation(() => {});
			G.m_menu = Cmenu_if_movie;
			game_setcam();
			expect(seq).toHaveBeenCalledOnce();
		});

		it('game_setcam: build setup under water keeps the camera below the surface', () => {
			mockConUnit();
			player(1, 0, -50, 0);
			G.f = 1;
			G.m_menu = 300;
			G.in_buildcamh = 100;
			G.in_buildsetup_watersurface = 0;
			PositionEntity(G.cam, 0, -4, 0);
			game_setcam();
			expect(EntityY(G.cam)).toBe(-1); // -4+5 = 1 > -1 -> -1
			G.in_buildsetup_watersurface = 1;
			PositionEntity(G.cam, 0, 190, 0);
			game_setcam(); // 190 < 200
			expect(EntityY(G.cam)).toBe(195);
			PositionEntity(G.cam, 0, 200, 0);
			game_setcam();
			expect(EntityY(G.cam)).toBe(200);
		});

		it('game_move translates by speed*f along yaw+diroff', () => {
			const u = mkUnit(1);
			G.TCunit = u;
			G.f = 0.5;
			expect(game_move(4, 90)).toBe(1); // forward: +z
			expect(EntityZ(u.h)).toBeCloseTo(2, 5);
			expect(EntityX(u.h)).toBeCloseTo(0, 5);
			expect(game_move(4, 0, 0)).toBe(1); // right: +x, also with climbmax 0
			expect(EntityX(u.h)).toBeCloseTo(2, 5);
			expect(EntityY(u.h)).toBe(0);
		});

		it('game_exhaust adds and caps at the store of the unit type', () => {
			const u = mkUnit(1);
			G.TCunit = u;
			const store = Dunit_store(1);
			game_exhaust(1.5, 2.5, 3.5);
			expect([u.hunger, u.thirst, u.exhaustion]).toEqual([1.5, 2.5, 3.5]);
			game_exhaust(store, 0, store * 2);
			expect([u.hunger, u.thirst, u.exhaustion]).toEqual([store, 2.5, store]);
		});

		it('game_falldamage scales the fall between game_fallminy and game_fallmaxy', () => {
			const hurt = vi.spyOn(handle_units, 'hurt_unit').mockImplementation(() => 0);
			const u = mkUnit(1, 1, 0, 0, 0);
			G.TCunit = u;
			G.game_fallminy = 100;
			G.game_fallmaxy = 3000;
			G.game_falldamage = 1000;
			u.phy_fally = 100;
			game_falldamage(); // not more than the minimum
			expect(hurt).not.toHaveBeenCalled();
			u.phy_fally = 500;
			game_falldamage();
			expect(hurt).toHaveBeenCalledWith(f32(f32(400 / 2900) * 1000));
		});

		it('game_sleep: until 7:00 of the next day after noon, 6 hours before; frozen time only counts the day', () => {
			const ev = events();
			vi.spyOn(RT.script, 'parse_sel_event').mockImplementation(() => {});
			vi.spyOn(RT.core, 'e_environment_setweather').mockImplementation(() => {});
			const light = vi.spyOn(RT.core, 'e_environment_update_light').mockImplementation(() => {});
			const padd = vi.spyOn(particles, 'p_add').mockImplementation(() => {
				G.TCp = New(Tp);
				G.TCp.h = CreatePivot();
			});
			const sfx = vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0);
			G.map_climate = 2;
			G.map_day = 3;
			G.map_hour = 13;
			G.map_minute = 60;
			G.map_timeupdate = 0;
			G.map_freezetime = 0;
			G.gt = 777;
			game_sleep();
			expect(G.g_sleep).toBe(1);
			expect([G.map_lday, G.map_lhour, G.map_lminute, G.map_timeupdate]).toEqual([3, 14, 0, 1]);
			expect([G.map_day, G.map_hour, G.map_minute]).toEqual([4, 7, 0]);
			expect(G.in_tgametime).toBe(777);
			expect(ev).toEqual(['sleep', 'changeday']);
			expect(padd).toHaveBeenCalledWith(0, 0, 0, 100, f32(0.01), 1.5);
			expect(sfx).toHaveBeenCalledWith(G.sfx_sleep);
			expect(light).toHaveBeenCalledOnce();

			game_sleep(); // 7:00 -> 13:00, the "last" time is not taken again
			expect([G.map_day, G.map_hour]).toEqual([4, 13]);
			expect([G.map_lday, G.map_lhour]).toEqual([3, 14]);

			G.map_freezetime = 1;
			game_sleep();
			expect([G.map_day, G.map_hour]).toEqual([5, 13]);
		});

		it('game_sleep can be skipped by the script', () => {
			events();
			vi.spyOn(RT.script, 'parse_sel_event').mockImplementation(() => {
				G.tmp_skipevent = 1;
			});
			const padd = vi.spyOn(particles, 'p_add').mockImplementation(() => {});
			G.map_hour = 13;
			game_sleep();
			expect(G.g_sleep).toBe(0);
			expect(G.map_hour).toBe(13);
			expect(padd).not.toHaveBeenCalled();
		});
	});

	describe('game_functions.bb: weapons and ammunition', () => {
		it('game_useasweapon: hands, nothing, an owned item (with ammunition), an item of somebody else', () => {
			mockConUnit();
			const task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			const u = player(1);
			u.player_weapon = 5;
			u.player_ammo = 6;
			expect(game_useasweapon(-1)).toBe(1);
			expect([u.player_weapon, u.player_ammo]).toEqual([0, 0]);
			expect(game_useasweapon(0)).toBe(0);

			const ammo = ammoTypesFor(51);
			expect(ammo.length).toBeGreaterThan(0);
			mkItem(1, 51, Cclass_unit, 2); // player 2's slingshot
			expect(game_useasweapon(51)).toBe(0);
			expect(u.player_weapon).toBe(0);
			mkItem(2, 51, Cclass_unit, 1);
			mkItem(3, ammo[0], Cclass_unit, 1);
			expect(game_useasweapon(51)).toBe(1);
			expect([u.player_weapon, u.player_ammo]).toEqual([51, ammo[0]]);
			expect(task).not.toHaveBeenCalledWith(Cclass_item, 1, 'inhand', '', expect.anything());
		});

		it('game_ammo cycles through the matching ammunition in the inventory', () => {
			mockConUnit();
			const ammo = ammoTypesFor(51);
			expect(ammo.length).toBeGreaterThan(1);
			const u = player(1);
			u.player_weapon = 51;
			expect(game_ammo(1)).toBe(0);
			expect(u.player_ammo).toBe(0);

			mkItem(1, ammo[1], Cclass_unit, 1);
			mkItem(2, ammo[0], Cclass_unit, 1);
			mkItem(3, ammo[0], Cclass_unit, 2); // not the player's
			mkItem(4, 51, Cclass_unit, 1); // the weapon is no ammunition
			expect(game_ammo(1)).toBe(1);
			expect(u.player_ammo).toBe(ammo[1]); // inventory order, not type order
			expect([...Each(Tcache)].map((c) => c.id)).toEqual([ammo[1], ammo[0]]);
			expect(game_ammo(1)).toBe(1);
			expect(u.player_ammo).toBe(ammo[0]);
			expect(game_ammo(1)).toBe(1); // last one: back to the first
			expect(u.player_ammo).toBe(ammo[1]);

			// current ammunition does not fit the weapon: first of the cache
			u.player_ammo = 51;
			expect(game_ammo(1)).toBe(1);
			expect(u.player_ammo).toBe(ammo[1]);
		});

		it('game_ammo_bytype and game_weapon_bytype need the item in the inventory', () => {
			const ammo = ammoTypesFor(51);
			expect(game_ammo_bytype(ammo[0])).toBe(0); // no player
			expect(game_weapon_bytype(51)).toBe(0);
			const u = player(1);
			u.player_weapon = 51;
			expect(game_ammo_bytype(ammo[0])).toBe(0);
			mkItem(1, ammo[0], Cclass_unit, 1);
			mkItem(2, 59, Cclass_unit, 1);
			expect(game_ammo_bytype(ammo[0])).toBe(1);
			expect(u.player_ammo).toBe(ammo[0]);
			expect(game_ammo_bytype(59)).toBe(0); // owned but no ammunition for 51
			expect(game_weapon_bytype(59)).toBe(1);
			expect(u.player_weapon).toBe(59);
			expect(game_weapon_bytype(60)).toBe(0);
			expect(game_ammo_bytype(ammo[0])).toBe(ammoTypesFor(59).includes(ammo[0]) ? 1 : 0);
		});

		it('game_scrollweapon walks the quick slots and ends at the hands', () => {
			mockConUnit();
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			const u = player(1);
			mkItem(1, 51, Cclass_unit, 1);
			mkItem(2, 59, Cclass_unit, 1);
			G.in_quickslot[1] = 51;
			G.in_quickslot[2] = 84; // not owned
			G.in_quickslot[4] = 59;
			expect(game_scrollweapon(1)).toBe(1);
			expect(u.player_weapon).toBe(51);
			expect(game_scrollweapon(1)).toBe(1);
			expect(u.player_weapon).toBe(59);
			expect(game_scrollweapon(1)).toBe(1); // nothing after slot 4: hands
			expect(u.player_weapon).toBe(0);
			expect(game_scrollweapon(0)).toBe(1); // from the hands backwards: slot 4
			expect(u.player_weapon).toBe(59);
			expect(game_scrollweapon(0)).toBe(1);
			expect(u.player_weapon).toBe(51);
			expect(game_scrollweapon(0)).toBe(1); // slot 1 -> current 0 -> hands
			expect(u.player_weapon).toBe(0);

			// nothing usable in the slots
			DeleteEach(Titem);
			expect(game_scrollweapon(1)).toBe(0);
			expect(game_scrollweapon(0)).toBe(0);

			// a weapon that is in no slot: "current" stays 0
			mkItem(3, 51, Cclass_unit, 1);
			u.player_weapon = 60;
			expect(game_scrollweapon(1)).toBe(1); // searches from slot 1
			expect(u.player_weapon).toBe(51);
		});

		it('game_attack2: spade and fishing rod start their process once; hands use', () => {
			mockConUnit();
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			vi.spyOn(RT.script, 'set_parsecache').mockImplementation(() => 0);
			const emu = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
			const sfx = vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0);
			const stored = vi.spyOn(handle_items, 'get_stored_item').mockReturnValue(0);
			const u = player(1);
			const spade = [...DEFS.items.byId.keys()].find((t) => Ditem_behaviour(t) === 'spade')!;
			const rod = [...DEFS.items.byId.keys()].find((t) => Ditem_behaviour(t) === 'fishingrod')!;

			u.player_weapon = spade;
			expect(game_attack2()).toBe(0); // not in the inventory
			expect(emu).not.toHaveBeenCalled();
			expect(G.pc_typ).toBe(0);

			mkItem(1, spade, Cclass_unit, 1);
			G.gt = 4242;
			game_attack2();
			expect(stored).toHaveBeenCalledWith(spade, Cclass_unit, 1);
			expect(emu).toHaveBeenCalledWith(Cclass_unit, 1, 'attack2');
			expect([G.pc_typ, G.pc_gt, G.in_focus]).toEqual([Cstate_pc_dig, 4242, Cstate_pc_dig]);

			// a running process is not replaced
			mkItem(2, rod, Cclass_unit, 1);
			u.player_weapon = rod;
			G.gt = 5000;
			game_attack2();
			expect([G.pc_typ, G.pc_gt]).toEqual([Cstate_pc_dig, 4242]);
			G.pc_typ = 0;
			game_attack2();
			expect([G.pc_typ, G.pc_gt, G.in_focus]).toEqual([Cstate_pc_fish, 5000, Cstate_pc_fish]);
			expect(sfx).toHaveBeenCalledWith(G.sfx_fish);

			// skipped by the script: nothing happens
			G.pc_typ = 0;
			emu.mockImplementation(() => {
				G.p_skipevent = 1;
			});
			game_attack2();
			expect(G.pc_typ).toBe(0);
		});
	});

	describe('game_functions.bb: world interaction', () => {
		it('game_use while driving: getoff event, AI back to idle, unless the script skips it', () => {
			mockConUnit();
			const cache = vi.spyOn(RT.script, 'set_parsecache').mockImplementation(() => 0);
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			const sel = vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			const mode = vi.spyOn(ai_units, 'ai_mode').mockImplementation(() => {});
			player(1);
			const v = mkUnit(200);
			G.g_drive = 200;
			G.p_skipevent = 1;
			expect(game_use()).toBe(1);
			expect(cache).toHaveBeenCalledWith(Cclass_unit, 200, 'getoff');
			expect(sel).toHaveBeenCalledWith(Cclass_unit, 200, 'getoff');
			expect(mode).toHaveBeenCalledWith(ai_idle);
			expect(G.TCunit).toBe(v);
			expect(G.g_drive).toBe(0);

			G.g_drive = 200;
			sel.mockImplementation(() => {
				G.p_skipevent = 1;
				return 0;
			});
			mode.mockClear();
			expect(game_use()).toBe(1);
			expect(G.g_drive).toBe(200);
			expect(mode).not.toHaveBeenCalled();
		});

		it('game_use with nothing in reach: 0, pick data reset', () => {
			const u = player(1);
			G.env_sea2 = CreatePivot(); // the headless world has no sea
			PositionEntity(G.cam, 0, 500, 0);
			G.in_pe = u.h;
			expect(game_use()).toBe(0);
			expect(G.in_pe).toBeNull();
			expect([G.pc_use_x, G.pc_use_y, G.pc_use_z]).toEqual([G.in_px, G.in_py, G.in_pz]);
		});

		it('game_damage dispatches to item, unit or object and raises on:hit for the player only', () => {
			const cache = vi.spyOn(RT.script, 'set_parsecache').mockImplementation(() => 0);
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			const u = mkUnit(12);
			const o = mkObject(34, [...DEFS.objects.byId.keys()][0]);
			const it1 = mkItem(56, [...DEFS.items.byId.keys()][0]);
			const get_item = vi.spyOn(handle_items, 'get_item').mockImplementation((h: Handle) => {
				if (h !== it1.h) return -1;
				G.TCitem = it1;
				return it1.id;
			});
			const get_unit = vi.spyOn(handle_units, 'get_unit').mockImplementation((h: Handle) => {
				if (h !== u.h) return -1;
				G.TCunit = u;
				return u.id;
			});
			vi.spyOn(handle_objects, 'get_object').mockImplementation((h: Handle) => {
				if (h !== o.h) return -1;
				G.TCobject = o;
				return o.id;
			});
			const di = vi.spyOn(handle_items, 'damage_item').mockImplementation(() => 0);
			const du = vi.spyOn(handle_units, 'hurt_unit').mockImplementation(() => 0);
			const dobj = vi.spyOn(handle_objects, 'damage_object').mockImplementation(() => 0);
			G.g_player = 1;
			G.tmp_kill = 5;

			expect(game_damage(it1.h, 7.5, 1, 1)).toBe(1);
			expect(G.tmp_kill).toBe(0);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_item, 56]);
			expect(di).toHaveBeenCalledWith(7.5, 0, 1);
			expect(cache).toHaveBeenLastCalledWith(Cclass_item, 56, 'hit');
			expect(get_unit).not.toHaveBeenCalled();

			cache.mockClear();
			expect(game_damage(u.h, 3, 2, 0, 1)).toBe(1); // causer is not the player: no event
			expect(get_unit).toHaveBeenCalledWith(u.h, 1);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_unit, 12]);
			expect(du).toHaveBeenCalledWith(3, 0, 0);
			expect(cache).not.toHaveBeenCalled();

			expect(game_damage(o.h, 2, 1)).toBe(1);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_object, 34]);
			expect(dobj).toHaveBeenCalledWith(2, 0, 0);
			expect(cache).toHaveBeenLastCalledWith(Cclass_object, 34, 'hit');

			expect(game_damage(CreatePivot(), 2, 1)).toBe(0);
			expect(get_item).toHaveBeenCalledTimes(4);
		});

		it('game_explosion damages what is in range, stored items excepted', () => {
			const typO = [...DEFS.objects.byId.keys()][0];
			const typI = [...DEFS.items.byId.keys()][0];
			const near = mkObject(1, typO, 10, 0, 0);
			mkObject(2, typO, 100, 0, 0);
			const un = mkUnit(3, 1, 0, 20, 0);
			const itNear = mkItem(4, typI, 0, 0, Cpm_out);
			const itIn = mkItem(5, typI, Cclass_unit, 3, Cpm_in);
			void itIn;
			const seenO: (Tobject | null)[] = [];
			const seenU: (Tunit | null)[] = [];
			const seenI: (Titem | null)[] = [];
			const dobj = vi.spyOn(handle_objects, 'damage_object').mockImplementation(() => (seenO.push(G.TCobject), 0));
			vi.spyOn(handle_units, 'hurt_unit').mockImplementation(() => (seenU.push(G.TCunit), 0));
			vi.spyOn(handle_items, 'damage_item').mockImplementation(() => (seenI.push(G.TCitem), 0));
			const boom = vi.spyOn(particles, 'p_explosion').mockImplementation(() => {});
			game_explosion(0, 0, 0, 50, 33, 0);
			expect(seenO).toEqual([near]);
			expect(seenU).toEqual([un]);
			expect(seenI).toEqual([itNear]);
			expect(dobj).toHaveBeenCalledWith(33, 0, 0);
			expect(boom).not.toHaveBeenCalled();
			game_explosion(1, 2, 3, 80);
			expect(boom).toHaveBeenCalledWith(1, 2, 3, 8); // size = range/10
		});

		it('game_explosion style 3: 20 or more particles per call and the bang', () => {
			let n = 0;
			vi.spyOn(particles, 'p_add').mockImplementation(() => {
				n++;
				G.TCp = New(Tp);
				G.TCp.h = CreatePivot();
				G.TCp.fadein = 0.25;
			});
			const s3d = vi.spyOn(RT.audio, 'sfx_3d').mockImplementation(() => {});
			game_explosion(10.6, 2.5, -3.4, 50, 0, 3);
			expect(n).toBeGreaterThanOrEqual(20);
			expect(n).toBeLessThanOrEqual(30);
			expect(s3d).toHaveBeenCalledWith(11, 2, -3, G.sfx_pang); // Int parameters: rounded (2.5 -> 2)
		});

		it('game_target: reset, no player, nothing picked', () => {
			G.tmp_tarclass = 4;
			G.tmp_tarid = 4;
			G.tmp_tarx = 4;
			expect(game_target()).toBe(0);
			expect([G.tmp_tarclass, G.tmp_tarid, G.tmp_tarx, G.tmp_tary, G.tmp_tarz]).toEqual([0, 0, 0, 0, 0]);
			player(1);
			G.env_sea2 = CreatePivot(); // the headless world has no sea
			PositionEntity(G.cam, 0, 500, 0);
			expect(game_target(100)).toBe(0);
			expect(G.in_pe).toBeNull();
		});

		it('game_picking switches the pick modes of all entities', () => {
			const typO = [...DEFS.objects.byId.keys()][0];
			const o = mkObject(1, typO);
			const u = mkUnit(2);
			const it1 = mkItem(3, [...DEFS.items.byId.keys()][0]);
			expect(() => game_picking(1)).not.toThrow();
			expect(() => game_picking(0)).not.toThrow();
			expect((o.h as BBEntity) && (u.mh as BBEntity) && (it1.h as BBEntity)).toBeTruthy();
		});

		it('game_renderweapon frees the item light when nothing is held', () => {
			player(1);
			G.m_menu = 1;
			G.env_itemlight = CreatePivot();
			const stop = vi.spyOn(RT.audio.bb, 'StopChannel');
			game_renderweapon();
			expect(G.env_itemlight).toBeNull();
			expect(stop).not.toHaveBeenCalled(); // channel 0 is not playing
		});

		it('game_renderweapon: a torch over the water lights up, not in the rain', () => {
			const torch = [...DEFS.items.byId.keys()].find((t) => Ditem_behaviour(t) === 'torch')!;
			const u = player(1, 5, 10, 15);
			u.player_weapon = torch;
			G.m_menu = 0;
			const count = vi.spyOn(handle_items, 'countstored_items').mockReturnValue(1);
			const emit = vi.spyOn(RT.audio, 'sfx_emit').mockImplementation(() => 0);
			vi.spyOn(particles, 'p_add').mockImplementation(() => {});
			G.env_cweather = 0;
			game_renderweapon();
			expect(count).toHaveBeenCalledWith(Cclass_unit, 1, torch);
			expect(G.env_itemlight).not.toBeNull();
			expect([EntityX(G.env_itemlight), EntityY(G.env_itemlight), EntityZ(G.env_itemlight)]).toEqual([5, 10, 15]);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([5, 10, 15]);
			expect(emit).toHaveBeenCalledTimes(1);
			expect(emit.mock.calls[0][2]).toBe(0.5);

			G.env_cweather = 1; // rain
			game_renderweapon();
			expect(G.env_itemlight).toBeNull();
			G.env_cweather = 3;
			game_renderweapon();
			expect(G.env_itemlight).not.toBeNull();
			PositionEntity(u.h, 5, -1, 15); // under water
			game_renderweapon();
			expect(G.env_itemlight).toBeNull();
		});
	});

	// ------------------------------------------------------------ game_input.bb

	describe('game_input.bb', () => {
		function ready(): Tunit {
			const u = player(1, 0, 50, 0);
			G.in_console = 0;
			G.m_menu = 0;
			G.pc_typ = 0;
			G.g_drive = 0;
			G.f = 1;
			G.ms = 0;
			G.gt = 100000;
			G.set_msens = 1;
			G.set_minvert = 1;
			G.game_scriptkeys = 0;
			RotateEntity(G.cam, 0, 0, 0);
			return u;
		}

		it('game_input_normal needs the player', () => {
			G.g_cplayer = null;
			expect(() => game_input_normal()).toThrow('Missing Player Data (game_input_normal)');
		});

		it('hunger, thirst and exhaustion hurt every 5 seconds', () => {
			const u = ready();
			const hurt = vi.spyOn(handle_units, 'hurt_unit').mockImplementation(() => 0);
			G.game_exh_damage[0] = 1.5;
			G.game_exh_damage[1] = 2;
			G.game_exh_damage[2] = 4;
			const store = Dunit_store(1);
			u.hunger = store;
			u.exhaustion = store;
			G.in_gt5000go = 0;
			game_input_normal();
			expect(hurt).not.toHaveBeenCalled();
			G.in_gt5000go = 1;
			game_input_normal();
			expect(hurt).toHaveBeenCalledWith(5.5);
			hurt.mockClear();
			u.hunger = 0;
			u.exhaustion = 0;
			game_input_normal();
			expect(hurt).not.toHaveBeenCalled();
		});

		it('walking: forward moves along the view by the unit speed and exhausts', () => {
			const u = ready();
			const speed = Dunit_speed(1);
			G.in_keydown[Ckey_forward] = 1;
			G.in_gt100go = 1;
			G.game_exh_move[0] = 0.25;
			G.game_exh_move[1] = 0.5;
			G.game_exh_move[2] = 0.75;
			game_input_normal();
			expect(EntityZ(u.h)).toBeCloseTo(speed, 4);
			expect(EntityX(u.h)).toBeCloseTo(0, 4);
			expect([u.hunger, u.thirst, u.exhaustion]).toEqual([0.25, 0.5, 0.75]);
			expect(G.g_swim).toBe(0);

			// two directions: 75% of the speed on each axis
			PositionEntity(u.h, 0, 50, 0);
			G.in_keydown[Ckey_left] = 1;
			game_input_normal();
			expect(EntityZ(u.h)).toBeCloseTo(f32(speed * 0.75), 4);
			expect(EntityX(u.h)).toBeCloseTo(-f32(speed * 0.75), 4);

			// jumping: speed * game_jumpfac, no exhaustion
			PositionEntity(u.h, 0, 50, 0);
			G.in_keydown[Ckey_left] = 0;
			u.phy_jump = G.gt + 100;
			u.hunger = 0;
			game_input_normal();
			expect(EntityZ(u.h)).toBeCloseTo(f32(speed * G.game_jumpfac), 4);
			expect(u.hunger).toBe(0);
		});

		it('a frozen player, a blocking process or the console stop the controls; mouse look stays', () => {
			const u = ready();
			G.in_keydown[Ckey_forward] = 1;
			u.freeze = 1;
			G.in_mxs = 10;
			game_input_normal();
			expect(EntityZ(u.h)).toBe(0);
			expect(EntityYaw(G.cam)).toBeCloseTo(10, 4);
			expect(EntityYaw(u.h)).toBeCloseTo(10, 4);
			u.freeze = 0;
			G.pc_typ = 150;
			game_input_normal();
			expect(EntityZ(u.h)).toBe(0);
			G.pc_typ = 0;
			G.in_console = 1;
			game_input_normal();
			expect(EntityZ(u.h)).toBe(0);
			expect(EntityYaw(G.cam)).toBeCloseTo(20, 4); // not turned again with the console open
		});

		it('mouse look: sensitivity, inversion, pitch limits 88 (alive) and 70 (dead)', () => {
			const u = ready();
			G.set_msens = 0.5;
			G.in_mxs = 20;
			G.in_mys = 40;
			game_input_normal();
			expect(EntityYaw(G.cam)).toBeCloseTo(10, 4);
			expect(EntityPitch(G.cam)).toBeCloseTo(20, 4);
			expect(G.in_mys).toBe(20); // the scaled value is stored back
			expect(EntityPitch(u.h)).toBeCloseTo(20, 4);

			G.in_mxs = 0;
			G.in_mys = 400;
			game_input_normal();
			expect(EntityPitch(G.cam)).toBeCloseTo(88, 3);
			G.set_minvert = -1;
			G.in_mys = 1000;
			game_input_normal();
			expect(EntityPitch(G.cam)).toBeCloseTo(-88, 3);

			G.set_xinvert = 1;
			G.in_mys = 0;
			G.in_mxs = 20;
			RotateEntity(G.cam, 0, 0, 0);
			game_input_normal();
			expect(EntityYaw(G.cam)).toBeCloseTo(-10, 4);
			expect(G.in_mxs).toBe(-20);

			u.health = 0;
			G.set_minvert = 1;
			G.in_mxs = 0;
			G.in_mys = 400;
			G.in_keydown[Ckey_forward] = 1;
			game_input_normal();
			expect(EntityPitch(G.cam)).toBeCloseTo(70, 3);
			expect(EntityZ(u.h)).toBe(0); // dead: no movement
		});

		it('script keys raise keyhit/keydown/keyrelease events of the game script', () => {
			ready();
			const task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			G.game_scriptkeys = 1;
			G.game_scriptkey[3] = 1;
			G.game_scriptkeyn[3] = 'Do it';
			G.game_scriptkey[4] = 1;
			G.game_scriptkeyn[4] = '0'; // quirk: the name "0" disables the key
			G.game_script = 'SCRIPT';
			G.game_scriptk = '\xa6keyhit03\xa6keyrelease03\xa6keyhit04';
			G.in_keyhit[24] = 1;
			G.in_keydown[24] = 1;
			G.in_keyrelease[24] = 1;
			G.in_keyhit[25] = 1;
			game_input_normal();
			expect(task.mock.calls).toEqual([
				[0, 0, 'keyhit03', '', 'SCRIPT'],
				[0, 0, 'keyrelease03', '', 'SCRIPT']
			]);
		});

		it('jumping needs ground contact, the re-hit flag and a free head', () => {
			const u = ready();
			const jump = vi.spyOn(collisions, 'col_jump').mockReturnValue(1);
			G.in_keydown[Ckey_jump] = 1;
			G.in_jumprehit = 1;
			G.game_jumptime = 450;
			G.game_exh_jump[0] = 1;
			u.phy_ft = G.gt - 10; // 10 is not < 10
			game_input_normal();
			expect(jump).not.toHaveBeenCalled();
			u.phy_ft = G.gt - 9;
			G.in_lastjump = G.gt - 100; // 100 is not > 100: no exhaustion
			game_input_normal();
			expect(u.phy_jump).toBe(G.gt + 450);
			expect(u.hunger).toBe(0);
			G.in_lastjump = G.gt - 101;
			game_input_normal();
			expect(u.hunger).toBe(1);
			expect(G.in_lastjump).toBe(G.gt);
		});

		it('attack 2, quick save and quick load keys', () => {
			mockConUnit();
			ready();
			vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
			G.in_keyhit[14] = 1; // Ckey_quicksave
			G.game_m_loadsave = 0;
			game_input_normal();
			expect(G.in_quicksave).toBe(0);
			G.game_m_loadsave = 1;
			game_input_normal();
			expect(G.in_quicksave).toBe(1);
			G.in_keyhit[15] = 1; // Ckey_quickload wins: it is checked last
			game_input_normal();
			expect(G.in_quicksave).toBe(2);
			expect(Ckey_attack2).toBe(7);
		});

		it('chat key opens the chat', () => {
			ready();
			G.in_keyhit[16] = 1;
			G.in_chat = 'old';
			game_input_normal();
			expect(G.m_menu).toBe(305);
			expect(G.in_chat).toBe('');
		});

		it('game_input_menu: menu keys', () => {
			const unsel = vi.spyOn(interface_, 'if_unselectitems').mockImplementation(() => {});
			const last = vi.spyOn(interface_, 'if_lastentry').mockImplementation(() => {});
			G.in_console = 0;
			G.in_inputfocus = -1;
			G.m_menu = 0;
			G.in_keyhit[Ckey_char] = 1;
			G.in_keyhit[Ckey_items] = 1; // the character key is checked first
			game_input_menu();
			expect(G.m_menu).toBe(Cmenu_if_char);
			G.in_keyhit[Ckey_char] = 0;
			G.in_scr_scr = 5;
			game_input_menu();
			expect([G.m_menu, G.in_scr_scr]).toEqual([Cmenu_if_items, 0]);
			expect(unsel).toHaveBeenCalledOnce();
			G.in_keyhit[Ckey_items] = 0;
			G.in_keyhit[Ckey_diary] = 1;
			G.in_scr_scr2 = 4;
			G.in_opt[0] = 3;
			game_input_menu();
			expect([G.m_menu, G.in_scr_scr2, G.in_opt[0]]).toEqual([Cmenu_if_diary, 0, 0]);
			expect(last).toHaveBeenCalledOnce();
			G.in_keyhit[Ckey_diary] = 0;

			// escape toggles between the game and the item menu
			G.in_escape = 1;
			game_input_menu();
			expect(G.m_menu).toBe(0);
			game_input_menu();
			expect(G.m_menu).toBe(Cmenu_if_items);
			G.in_escape = 0;

			// the jump key closes a menu, unless closing is blocked
			G.in_keyhit[Ckey_jump] = 1;
			G.ms = 2000;
			G.in_blockclose = 500; // 1500 is not > 1500
			game_input_menu();
			expect(G.m_menu).toBe(Cmenu_if_items);
			G.ms = 2001;
			game_input_menu();
			expect(G.m_menu).toBe(0);

			// not while typing, not with the console open
			G.in_keyhit[Ckey_jump] = 0;
			G.in_keyhit[Ckey_char] = 1;
			G.in_inputfocus = 0;
			game_input_menu();
			expect(G.m_menu).toBe(0);
			G.in_inputfocus = -1;
			G.in_console = 1;
			game_input_menu();
			expect(G.m_menu).toBe(0);
			// menus from Cmenu_if_quit on cannot be left by the menu keys
			G.in_console = 0;
			G.m_menu = 50;
			game_input_menu();
			expect(G.m_menu).toBe(50);
		});

		it('game_input_menu: escape skips a skipable sequence', () => {
			const ev = events();
			const end = vi.spyOn(game_sequences, 'seq_end').mockImplementation(() => {});
			New(Tseq);
			New(Tseq);
			G.in_console = 0;
			G.m_menu = Cmenu_if_movie;
			G.in_escape = 1;
			G.seq_skipable = 0;
			game_input_menu();
			expect(Tseq.list.count).toBe(2);
			G.seq_skipable = 1;
			game_input_menu();
			expect(Tseq.list.count).toBe(0);
			expect(end).toHaveBeenCalledOnce();
			expect(ev).toEqual(['skipsequence|sequence skipped by user']);
		});
	});

	// ------------------------------------------------------------ game_input_vehicles.bb

	describe('game_input_vehicles.bb', () => {
		it('game_input_vehicledata reads speed, turn speed and the vehicle values of the type', () => {
			const typ = [...DEFS.units.byId.keys()].find((t) => Dunit_v(t) !== '' && Dunit_behaviour(t) >= 500)!;
			expect(typ).toBeDefined();
			G.v_speed = 3;
			G.v_steerpos = 40;
			game_input_vehicledata(typ);
			const v = Dunit_v(typ).split(',');
			expect([G.v_speed, G.v_steerpos]).toEqual([0, 0]);
			expect(G.v_topspeed).toBe(Dunit_speed(typ));
			expect(G.v_turnspeed).toBe(Dunit_tspeed(typ));
			expect(G.v_acceleration).toBe(Float(v[0] ?? ''));
			expect(G.v_friction).toBe(Float(v[1] ?? ''));
			expect(G.v_steering).toBe(Int(v[2] ?? ''));
			expect(G.v_maxdepth).toBe(Int(v[3] ?? ''));
			expect(G.v_flyspeed).toBe(Float(v[4] ?? ''));
			expect(G.splits.length).toBe(5); // split(...,4)
		});

		async function animal(): Promise<Tunit> {
			const typ = [...DEFS.units.byId.keys()].find((t) => Dunit_behaviour(t) < 500 && Dunit_model(t).toLowerCase().endsWith('.b3d') && Dunit_ani_move(t, 1) > 0)!;
			await RT.world.preload([Dunit_model(typ)]);
			const u = New(Tunit);
			u.id = 200;
			u.typ = typ;
			u.h = CreatePivot();
			u.mh = LoadAnimMesh(Dunit_model(typ), u.h);
			expect(u.mh).not.toBeNull();
			u.health = 10;
			u.health_max = 10;
			G.f = 1;
			G.v_speed = 0;
			G.v_steerpos = 0;
			G.v_topspeed = 2;
			G.v_turnspeed = 3;
			G.v_acceleration = 0.5;
			G.v_friction = 0.25;
			G.v_steering = 0;
			return u;
		}

		it('game_input_animal: accelerate, top speed, friction, animation', async () => {
			const u = await animal();
			const volume = vi.spyOn(RT.audio.bb, 'ChannelVolume');
			G.set_fxvolume = 0.5;
			G.in_keydown[Ckey_forward] = 1;
			game_input_animal(u);
			expect(G.v_speed).toBe(0.5);
			expect(EntityZ(u.h)).toBeCloseTo(0.5, 5);
			expect(u.ani).toBe(Int(Dunit_ani_move(u.typ, 1)));
			expect(volume).toHaveBeenLastCalledWith(u.chan, f32(f32(0.5 / 2) * 0.5));
			for (let i = 0; i < 5; i++) game_input_animal(u);
			expect(G.v_speed).toBe(2);

			G.in_keydown[Ckey_forward] = 0;
			game_input_animal(u);
			expect(G.v_speed).toBe(1.75);
			for (let i = 0; i < 10; i++) game_input_animal(u);
			expect(G.v_speed).toBe(0);
			expect(u.ani).toBe(0);

			G.in_keydown[1] = 1; // backward
			for (let i = 0; i < 6; i++) game_input_animal(u);
			expect(G.v_speed).toBe(-2);
		});

		it('game_input_animal: steering position is an Int and turns by tspeed*f*pos/100', async () => {
			const u = await animal();
			G.in_keydown[Ckey_left] = 1;
			game_input_animal(u);
			expect(G.v_steerpos).toBe(7);
			expect(EntityYaw(u.h)).toBeCloseTo(3 * 0.07, 4);
			for (let i = 0; i < 20; i++) game_input_animal(u);
			expect(G.v_steerpos).toBe(100);
			G.in_keydown[Ckey_left] = 0;
			game_input_animal(u);
			expect(G.v_steerpos).toBe(93);

			// quirk: with a small frame factor the Int never moves (7*0.05 = 0.35 rounds to 0)
			G.v_steerpos = 0;
			G.f = 0.05;
			G.in_keydown[Ckey_left] = 1;
			for (let i = 0; i < 10; i++) game_input_animal(u);
			expect(G.v_steerpos).toBe(0);

			// steering 1: the turn speed scales with the speed -> standing still does not turn
			G.f = 1;
			G.v_steering = 1;
			RotateEntity(u.h, 0, 0, 0);
			game_input_animal(u);
			expect(G.v_steerpos).toBe(7);
			expect(EntityYaw(u.h)).toBeCloseTo(0, 5);
			// steering 2: at least half the turn speed
			G.v_steering = 2;
			G.v_steerpos = 93;
			game_input_animal(u);
			expect(EntityYaw(u.h)).toBeCloseTo(1.5, 4);
		});

		it('game_input_vehicles: nothing for a unit on a path; kills a unit below its maximum depth', async () => {
			const u = await animal();
			const controlled = vi.spyOn(unitpath, 'up_controlled').mockReturnValue(1);
			const kill = vi.spyOn(handle_units, 'kill_unit').mockImplementation(() => {});
			G.g_drive = 200;
			G.in_keydown[Ckey_forward] = 1;
			game_input_vehicles();
			expect(controlled).toHaveBeenCalledWith(200);
			expect(G.v_speed).toBe(0);
			controlled.mockReturnValue(0);
			G.v_maxdepth = 35;
			game_input_vehicles();
			expect(G.v_speed).toBe(0.5);
			expect(kill).not.toHaveBeenCalled();
			PositionEntity(u.h, 0, -36, 0);
			game_input_vehicles();
			expect(kill).toHaveBeenCalledOnce();
			expect(G.TCunit).toBe(u);
		});
	});

	// ------------------------------------------------------------ game.bb

	describe('game.bb', () => {
		it('game(): one frame in the order of the original', async () => {
			const order: string[] = [];
			const rec =
				(name: string) =>
				(): never =>
					order.push(name) as never;
			vi.spyOn(cull, 'cull_items').mockImplementation(rec('cull_items'));
			vi.spyOn(cull, 'cull').mockImplementation(async () => void order.push('cull'));
			vi.spyOn(collisions, 'col_player').mockImplementation(rec('col_player'));
			vi.spyOn(functions, 'screenshot').mockImplementation(rec('screenshot'));
			vi.spyOn(motionblur, 'mb_update').mockImplementation(async () => void order.push('mb_update'));
			vi.spyOn(handle_states, 'update_state').mockImplementation(rec('update_state'));
			vi.spyOn(unitpath, 'up_update').mockImplementation(rec('up_update'));
			vi.spyOn(interface_, 'interface_').mockImplementation(async () => void order.push('interface'));
			vi.spyOn(particles, 'p_update').mockImplementation(rec('p_update'));
			vi.spyOn(particles, 'p_update_2d').mockImplementation(rec('p_update_2d'));
			vi.spyOn(projectiles, 'pro_update').mockImplementation(rec('pro_update'));
			vi.spyOn(game_sequences, 'seq_blend').mockImplementation(rec('seq_blend'));
			vi.spyOn(handle_items, 'countstored_items').mockReturnValue(0);
			const u = player(1, 10, 20, 30);
			G.m_menu = 0;
			G.in_tpforce = 1;
			G.in_tp[0] = 100;
			G.in_tp[1] = 200;
			G.in_tp[2] = 300;
			await game();
			expect(G.g_unpaused).toBe(1);
			expect(order).toEqual(['cull_items', 'col_player', 'cull', 'mb_update', 'update_state', 'up_update', 'interface', 'p_update', 'pro_update', 'seq_blend']);
			expect(G.TCunit).toBe(u);
			expect(G.in_tpforce).toBe(0);
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([100, 200, 300]);
			// game_setcam ran before the teleport
			expect([EntityX(G.cam), EntityZ(G.cam)]).toEqual([10, 30]);

			// a pausing menu: no player collision, no normal input, 2D particles only
			order.length = 0;
			G.m_menu = Cmenu_if_items;
			G.in_console = 1;
			await game();
			expect(G.g_unpaused).toBe(0);
			expect(order).toEqual(['cull_items', 'cull', 'mb_update', 'update_state', 'up_update', 'interface', 'p_update_2d', 'seq_blend']);
		});
	});
});
