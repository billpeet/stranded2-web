/**
 * script1: the script commands of parser_commands.bb lines 18-1143
 * (script/commands/basic1.ts + game/script_host/script1.ts), run through the
 * real interpreter. Expected values come from reading the original Case
 * blocks; functions of other packages are mocked on their modules.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTerrain, LoadAnimMesh, EntityPitch, EntityRoll, EntityYaw, PositionEntity, RotateEntity } from '../../src/lib/s2/bb3d';
import { Float, Rand, SEP_LINE, SeedRnd, Str, f32 } from '../../src/lib/s2/blitz';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import * as console_ from '../../src/lib/s2/game/console';
import { Cbmpf_red, Cbmpf_yellow, Cclass_info, Cclass_item, Cclass_object, Cclass_unit, Cmenu_credits, Cmenu_if_items, Cpm_in, Cpm_out, Cworld_size, ai_idle } from '../../src/lib/s2/game/consts';
import { Dinfo_scriptk, Ditem_health, Ditem_iconh, Ditem_scriptk, Dobject_script, Dobject_scriptk, Dunit_scriptk } from '../../src/lib/s2/game/defs_arrays';
import { DEFS } from '../../src/lib/s2/game/defs_store';
import { runDeferred } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_input_vehicles from '../../src/lib/s2/game/game_input_vehicles';
import * as handle_all from '../../src/lib/s2/game/handle_all';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as menu from '../../src/lib/s2/game/menu';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import * as randommap from '../../src/lib/s2/game/randommap';
import { RT } from '../../src/lib/s2/game/rt';
import { host } from '../../src/lib/s2/game/script_host/script1';
import { G } from '../../src/lib/s2/game/state';
import * as sys from '../../src/lib/s2/game/sys';
import { New, Tfrap, Tin_quicksave, Tinfo, Titem, Tobject, Tunit } from '../../src/lib/s2/game/types';
import * as uiGui from '../../src/lib/s2/ui/gui';
import type { ImageHandle } from '../../src/lib/s2/gfx2d';
import { MOD, errors, expr, exprAs, info, item, mockCon, object, pivot, run, runAs, setup, teardown, unit } from './script1_setup';

describe.skipIf(!existsSync(MOD))('script1: BASIC commands, part 1 (parser_commands.bb 18-1143)', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('terrain: get, set, modify (with the 1000 -> 100 quirk), matrix x/z', () => {
		G.ter = CreateTerrain(32);
		G.ter_size = 32;
		// x#=(xpos#+(ter_size/2*Cworld_size))/Cworld_size = 16 at xpos 0
		expect(expr('terrain(0,0,3)')).toBe('16');
		expect(expr(`terrain(${Cworld_size * 2},${-Cworld_size * 3},3)`)).toBe('18');
		expect(expr(`terrain(${Cworld_size * 2},${-Cworld_size * 3},4)`)).toBe('13');
		// Int(x#) rounds to nearest, ties to even: 18.5 -> 18
		expect(expr(`terrain(${Cworld_size * 2.5},0,3)`)).toBe('18');
		expect(expr('terrain(0,0,0)')).toBe('0.0');
		// set: height/100, stored in steps of 1/255 (0.5 -> 127/255)
		run('terrain 0,0,1,50;');
		expect(expr('terrain(0,0,0)')).toBe(Str(f32(f32(127 / 255) * 100), 'float'));
		// modify: (49.8)+2000 is above 1000 and becomes 100 (not 1000) -> height 1.0
		run('terrain 0,0,2,2000;');
		expect(expr('terrain(0,0,0)')).toBe('100.0');
		// modify below 0 -> 0
		run('terrain 0,0,2,-5000;');
		expect(expr('terrain(0,0,0)')).toBe('0.0');
		// unknown mode: nothing, p_return$ stays "" (which the variable assignment stores as 0)
		expect(expr('terrain(0,0,7)')).toBe('0');
		expect(RT.script.p_return).toBe('');
		expect(errors()).toEqual([]);
	});

	it('compass, rainratio, snowratio assign Int globals', () => {
		run('compass 1;\nrainratio 35;\nsnowratio 7;');
		expect(G.in_compass).toBe(1);
		expect(G.map_rainratio).toBe(35);
		expect(G.map_snowratio).toBe(7);
		expect(errors()).toEqual([]);
	});

	it('eat: effect and free_item before the parameters, then the values of the unit', () => {
		const { con_unit } = mockCon();
		const sfx_emit = vi.spyOn(RT.audio, 'sfx_emit');
		const free_item = vi.spyOn(handle_items, 'free_item').mockReturnValue(1);
		const unit_values = vi.spyOn(handle_units, 'unit_values').mockImplementation(() => {});
		const p_pixelizeeat = vi.spyOn(particles, 'p_pixelizeeat').mockReturnValue(0);
		item(7, 20);
		const u = unit(1);
		Object.assign(u, { health: 50, hunger: 40, thirst: 30, exhaustion: 20 });
		G.g_player = 1;

		runAs(Cclass_item, 7, 'eat', 'eat 10,5,3,2;');
		expect(sfx_emit).toHaveBeenCalledTimes(1);
		expect(sfx_emit.mock.calls[0][0]).toBe(G.sfx_eat);
		expect(p_pixelizeeat).not.toHaveBeenCalled(); // m_menu is not the item menu
		expect(free_item).toHaveBeenCalledWith(7, 1);
		expect(con_unit).toHaveBeenCalledWith(1);
		expect([u.health, u.hunger, u.thirst, u.exhaustion]).toEqual([60, 35, 27, 18]);
		expect(unit_values).toHaveBeenCalledTimes(1);

		// without parameters: effect only; in the item menu with an icon: pixelize (0,1,1 for drink)
		G.m_menu = Cmenu_if_items;
		G.tmp_iseltyp = 20;
		G.tmp_iselx = 11;
		G.tmp_isely = 22;
		const icon = { fake: 1 } as unknown as ImageHandle;
		Ditem_iconh.set(20, icon);
		run('drink;');
		expect(sfx_emit.mock.calls[1][0]).toBe(G.sfx_drink);
		expect(p_pixelizeeat).toHaveBeenLastCalledWith(11, 22, icon, 0, 1, 1);
		expect(free_item).toHaveBeenCalledTimes(1); // global script: p_env_class is not item
		expect(unit_values).toHaveBeenCalledTimes(1);

		// consume: no effect at all; 5th parameter selects the unit
		const other = unit(9);
		other.health = 1;
		run('consume 4,0,0,0,9;');
		expect(sfx_emit).toHaveBeenCalledTimes(2);
		expect(other.health).toBe(5);
		expect(errors()).toEqual([]);
	});

	it('fry: fizzle sound and the red pixelize effect in the item menu', () => {
		const sfx = vi.spyOn(RT.audio, 'sfx');
		const p_pixelizeeat = vi.spyOn(particles, 'p_pixelizeeat').mockReturnValue(0);
		run('fry;');
		expect(sfx).toHaveBeenCalledWith(G.sfx_fizzle);
		expect(p_pixelizeeat).not.toHaveBeenCalled();
		G.m_menu = Cmenu_if_items;
		G.tmp_iseltyp = 20;
		const icon = { fake: 1 } as unknown as ImageHandle;
		Ditem_iconh.set(20, icon);
		run('fry;');
		expect(p_pixelizeeat).toHaveBeenCalledWith(0, 0, icon, 1, 1, 0);
	});

	it('maxhealth: changes and returns health_max of units and objects, Ditem_health for items', () => {
		const u = unit(5);
		Object.assign(u, { health: 80, health_max: 100 });
		expect(expr('maxhealth("unit",5,-30)')).toBe('70.0');
		expect([u.health, u.health_max]).toEqual([70, 70]);
		// below 0 -> 0, and the health follows
		expect(expr('maxhealth("unit",5,-500)')).toBe('0.0');
		expect([u.health, u.health_max]).toEqual([0, 0]);
		const o = object(6);
		Object.assign(o, { health: 10, health_max: 20 });
		expect(expr('maxhealth("object",6,2.5)')).toBe('22.5');
		expect(o.health).toBe(10);
		// "self" takes class and id of the event
		expect(exprAs(Cclass_object, 6, 'x', 'maxhealth("self")')).toBe('22.5');
		item(7, 20);
		expect(expr('maxhealth("item",7)')).toBe(Str(Ditem_health(20), 'float'));
		// unknown id / other class: "0"
		expect(expr('maxhealth("unit",99)')).toBe('0');
		expect(expr('maxhealth("info",1)')).toBe('0');
		expect(errors()).toEqual([]);
	});

	it('jade adds to hunger, thirst and exhaustion of the player', () => {
		mockCon();
		const unit_values = vi.spyOn(handle_units, 'unit_values').mockImplementation(() => {});
		const u = unit(3);
		G.g_player = 3;
		run('jade 2.5;');
		expect([u.hunger, u.thirst, u.exhaustion]).toEqual([2.5, 2.5, 2.5]);
		expect(unit_values).toHaveBeenCalledTimes(1);
		G.g_player = 4; // no such unit
		run('jade 1;');
		expect(unit_values).toHaveBeenCalledTimes(1);
	});

	it('con puts the text into the console input and enters it', () => {
		const con_enter = vi.spyOn(console_, 'con_enter').mockImplementation(() => {
			expect(G.in_conin).toBe('fps');
		});
		run('con "fps";');
		expect(con_enter).toHaveBeenCalledTimes(1);
	});

	it('exec asks first (deferred) and executes or denies', async () => {
		const con_add = vi.spyOn(console_, 'con_add').mockImplementation(() => {});
		const ExecFile = vi.spyOn(sys, 'ExecFile').mockImplementation(() => {});
		const decide = vi.spyOn(uiGui, 'gui_msgdecide').mockResolvedValue(1);
		run('exec "notepad.exe";');
		expect(decide).not.toHaveBeenCalled();
		await runDeferred();
		expect(decide).toHaveBeenCalledWith("Execute 'notepad.exe'?", Cbmpf_yellow);
		expect(con_add).toHaveBeenCalledWith("Executing 'notepad.exe' ...", Cbmpf_yellow);
		expect(ExecFile).toHaveBeenCalledWith('notepad.exe');
		decide.mockResolvedValue(0);
		run('exec "x.bat";');
		await runDeferred();
		expect(con_add).toHaveBeenLastCalledWith("Permission denied to execute 'x.bat'.", Cbmpf_red);
		expect(ExecFile).toHaveBeenCalledTimes(1);
	});

	it('create: every class, position of the player by default, id as result', () => {
		const set_object = vi.spyOn(handle_objects, 'set_object').mockImplementation(() => {
			G.TCobject = New(Tobject);
			G.TCobject.id = 42;
			return 42;
		});
		const set_unit = vi.spyOn(handle_units, 'set_unit').mockImplementation(() => {
			G.TCunit = New(Tunit);
			G.TCunit.id = 100;
			return 100;
		});
		const ai_ini = vi.spyOn(ai_units, 'ai_ini').mockImplementation(() => {});
		const set_item = vi.spyOn(handle_items, 'set_item').mockImplementation(() => {
			G.TCitem = New(Titem);
			G.TCitem.id = 7;
			return 7;
		});
		const set_info = vi.spyOn(handle_infos, 'set_info').mockImplementation(() => {
			G.TCinfo = New(Tinfo);
			G.TCinfo.id = 3;
			return 3;
		});
		G.g_cplayer = unit(1, 1, 3, 0, 4);
		G.ter = null;
		G.ter_groundy = -12;

		expect(expr('create("object",5)')).toBe('42');
		expect(set_object).toHaveBeenCalledWith(-1, 5, 3, 4);
		expect(expr('create("unit",2,10.5,-20)')).toBe('100');
		expect(set_unit).toHaveBeenCalledWith(-1, 2, 10.5, -20);
		expect(ai_ini).toHaveBeenCalledTimes(1);
		// item: y is the terrain height, count defaults to 1
		expect(expr('create("item",20,1,2)')).toBe('7');
		expect(set_item).toHaveBeenLastCalledWith(-1, 20, 1, -12, 2, 1);
		expect(expr('create("item",20,1,2,15)')).toBe('7');
		expect(set_item).toHaveBeenLastCalledWith(-1, 20, 1, -12, 2, 15);
		expect(expr('create("info",1,1,2)')).toBe('3');
		expect(set_info).toHaveBeenLastCalledWith(-1, 1, 1, -12, 2);
		expect(errors()).toEqual([]);

		// nothing created: "0"
		set_object.mockImplementation(() => {
			G.TCobject = null;
			return -1;
		});
		expect(expr('create("object",5)')).toBe('0');
		// other classes: error
		expect(expr('create("state",5)')).toBe('0');
		expect(errors().at(-1)).toMatch(/^Class '.*' is not expected$/);
	});

	it('randomcreate passes class, type, min/max height and count', () => {
		const randomcreate = vi.spyOn(randommap, 'randomcreate').mockReturnValue(55);
		expect(expr('randomcreate("object",5)')).toBe('55');
		expect(randomcreate).toHaveBeenLastCalledWith(Cclass_object, 5, 0, 1000000, 1);
		expect(expr('randomcreate("unit",2,10,200.5,4)')).toBe('55');
		expect(randomcreate).toHaveBeenLastCalledWith(Cclass_unit, 2, 10, 200.5, 4);
	});

	it('areal_event: objects, units, unstored items, infos within the range; event limit', () => {
		const tasks: string[] = [];
		const record = () =>
			vi.spyOn(RT.script, 'parse_task').mockImplementation((cls, id, event, _info, script) => {
				tasks.push(`${cls}:${id}:${event}:${script === Dobject_script(1) ? 'obj' : 'other'}`);
			});
		Dobject_scriptk.set(1, SEP_LINE + 'boom');
		Dunit_scriptk.set(2, SEP_LINE + 'boom');
		Ditem_scriptk.set(20, SEP_LINE + 'boom');
		Dinfo_scriptk.set(1, SEP_LINE + 'boom');
		object(1, 1, 10, 0, 0);
		object(2, 1, 49.5, 0, 0);
		object(3, 1, 50, 0, 0); // distance 50 is not < 50
		object(4, 2, 0, 0, 0); // type without the event
		unit(5, 2, 0, 20, 0);
		const stored = item(6, 20, 0, 0, 0);
		stored.parent_mode = Cpm_in;
		item(7, 20, 0, 0, 5);
		info(8, 1, 1, 1, 1);

		record();
		host.cmd_areal_event!(RT.script, 'boom', 0, 0, 0, 50, 0);
		expect(tasks).toEqual(['1:1:boom:obj', '1:2:boom:obj', '2:5:boom:other', '3:7:boom:other', '4:8:boom:other']);

		// limit 1 (the default): the first hit only
		tasks.length = 0;
		host.cmd_areal_event!(RT.script, 'boom', 0, 0, 0, 50, 1);
		expect(tasks).toEqual(['1:1:boom:obj']);
		// limit 3: stops inside the unit loop, items and infos are not looked at
		tasks.length = 0;
		host.cmd_areal_event!(RT.script, 'boom', 0, 0, 0, 50, 3);
		expect(tasks).toEqual(['1:1:boom:obj', '1:2:boom:obj', '2:5:boom:other']);
		// smaller range around another point
		tasks.length = 0;
		host.cmd_areal_event!(RT.script, 'boom', 49, 0, 0, 2, 0);
		expect(tasks).toEqual(['1:2:boom:obj', '1:3:boom:obj']);
		vi.restoreAllMocks();

		// through the interpreter: parameters and defaults (range 50, limit 1)
		const direct = vi.fn();
		RT.script.parse_task(0, 0, '', '', 'areal_event "boom",1,2,3;' + SEP_LINE + 'areal_event "bang",1,2,3,70,4;');
		const spy = vi.spyOn(RT.script, 'parse_task').mockImplementation(direct);
		RT.script.parse_all();
		spy.mockRestore();
		expect(direct.mock.calls.map((c) => `${c[0]}:${c[1]}:${c[2]}`)).toEqual(['1:1:boom']);
	});

	it('quicksave, quickload, autosave, autoload queue a Tin_quicksave', () => {
		run('quicksave;');
		expect(G.in_quicksave).toBe(1);
		run('quickload;');
		expect(G.in_quicksave).toBe(2);
		run('autosave;');
		expect(G.in_quicksave).toBe(3);
		run('autoload;');
		expect(G.in_quicksave).toBe(4);
		expect([...Tin_quicksave.list].map((q) => q.mode)).toEqual([1, 2, 3, 4]);
	});

	it('loadmap caches the data to take over; savemap stores the six flags', () => {
		const cachedata = vi.spyOn(functions, 'cachedata').mockImplementation(() => {});
		run('loadmap "maps\\x.s2",1,0,1;');
		expect(cachedata).toHaveBeenCalledWith(1, 1, 0, 1, 0, 0, 0);
		expect(G.tmp_loadmapcmdmap).toBe('maps\\x.s2');
		expect(G.in_quicksave).toBe(5);
		let q = [...Tin_quicksave.list].at(-1)!;
		expect([q.mode, q.map, q.skills, q.items]).toEqual([5, 'maps\\x.s2', 0, 0]); // loadmap does not store the flags
		run('loadmap "maps\\z.s2";');
		expect(cachedata).toHaveBeenLastCalledWith(1, 0, 0, 0, 0, 0, 0);

		run('savemap "maps\\y.s2",0,1,0;');
		expect(G.in_quicksave).toBe(6);
		q = [...Tin_quicksave.list].at(-1)!;
		expect([q.mode, q.map, q.skills, q.items, q.vars, q.diary, q.states, q.locks]).toEqual([6, 'maps\\y.s2', 0, 1, 0, 1, 1, 1]);
		expect(cachedata).toHaveBeenCalledTimes(2);
		expect(errors()).toEqual([]);
	});

	it('alteritem: the used item, or a specific item of the player', () => {
		mockCon();
		const p_combine = vi.spyOn(particles, 'p_combine').mockReturnValue(0);
		const free_item = vi.spyOn(handle_items, 'free_item').mockReturnValue(1);
		const set_item = vi.spyOn(handle_items, 'set_item').mockReturnValue(99);
		const store_item = vi.spyOn(handle_items, 'store_item').mockReturnValue(1);
		G.g_player = 1;
		const used = item(7, 20);
		used.count = 3;

		runAs(Cclass_item, 7, 'use', 'alteritem 2,30;');
		expect(p_combine).toHaveBeenCalledWith(20, 30);
		expect(free_item).toHaveBeenCalledWith(7, 2);
		expect(set_item).toHaveBeenCalledWith(-1, 30, 0, 0, 0, 1);
		expect(store_item).toHaveBeenCalledWith(99, Cclass_unit, 1);

		// not enough items: nothing
		runAs(Cclass_item, 7, 'use', 'alteritem 4,30,5;');
		expect(p_combine).toHaveBeenCalledTimes(1);
		// set_item failed (-1): not stored
		set_item.mockReturnValue(-1);
		runAs(Cclass_item, 7, 'use', 'alteritem 3,30,5;');
		expect(set_item).toHaveBeenLastCalledWith(-1, 30, 0, 0, 0, 5);
		expect(store_item).toHaveBeenCalledTimes(1);
		expect(errors()).toEqual([]);

		// outside on:use with 3 or less parameters: error
		run('alteritem 2,30;');
		expect(errors()).toEqual(["'alteritem' only works in 'on:use'-events when it has got 3 or less parameters"]);
		expect(p_combine).toHaveBeenCalledTimes(2);
		RT.script.clearErrors();

		// 4 parameters: the first item of that type the player carries; stops there even if it has too few
		set_item.mockReturnValue(98);
		const a = item(10, 21);
		Object.assign(a, { parent_class: Cclass_unit, parent_id: 2, count: 9 }); // someone else's
		const b = item(11, 21);
		Object.assign(b, { parent_class: Cclass_unit, parent_id: 1, count: 1 });
		const c = item(12, 21);
		Object.assign(c, { parent_class: Cclass_unit, parent_id: 1, count: 9 });
		run('alteritem 2,21,4,31;');
		expect(p_combine).toHaveBeenCalledTimes(2); // b has only 1 and ends the search
		b.count = 2;
		run('alteritem 2,21,4,31;');
		expect(p_combine).toHaveBeenLastCalledWith(21, 31);
		expect(free_item).toHaveBeenLastCalledWith(11, 2);
		expect(set_item).toHaveBeenLastCalledWith(-1, 31, 0, 0, 0, 4);
		expect(store_item).toHaveBeenLastCalledWith(98, Cclass_unit, 1);
		expect(errors()).toEqual([]);
	});

	it('quit and credits go to the menu (deferred)', async () => {
		const order: string[] = [];
		const menu_start = vi.spyOn(menu, 'menu_start').mockImplementation(async () => void order.push('start'));
		const menu_set = vi.spyOn(menu, 'menu_set').mockImplementation(async (m, s) => void order.push(`set ${m} ${s}`));
		run('quit;');
		expect(menu_start).not.toHaveBeenCalled();
		await runDeferred();
		expect(order).toEqual(['start']);
		run('credits;');
		await runDeferred();
		expect(order).toEqual(['start', 'start', `set ${Cmenu_credits} 0`]);
		expect(menu_set).toHaveBeenCalledTimes(1);
	});

	it('setpos: texts as given, "self" is the own coordinate; stored items stay; missing entity is an error', () => {
		const e = pivot(1.5, 2, 3);
		const parent_h = vi.spyOn(parentchild, 'parent_h').mockImplementation((cls, id) => (cls === Cclass_object && id === 4 ? e : cls === Cclass_item ? e : null));
		const ha_setpos = vi.spyOn(handle_all, 'ha_setpos').mockImplementation(() => {});
		run('setpos "object",4,10,"self",-7.25;');
		expect(parent_h).toHaveBeenCalledWith(Cclass_object, 4);
		expect(ha_setpos).toHaveBeenCalledWith(e, Cclass_object, 4, '10', '2.0', '-7.25');

		// items: only when not stored (parent_class=0 Or parent_mode=Cpm_out)
		const it = item(9, 20);
		Object.assign(it, { parent_class: Cclass_unit, parent_mode: Cpm_in });
		run('setpos "item",9,1,2,3;');
		expect(ha_setpos).toHaveBeenCalledTimes(1);
		it.parent_mode = Cpm_out;
		run('setpos "item",9,1,2,3;');
		expect(ha_setpos).toHaveBeenLastCalledWith(e, Cclass_item, 9, '1', '2', '3');
		// an item id that is not in the list: nothing, no error
		run('setpos "item",77,1,2,3;');
		expect(ha_setpos).toHaveBeenCalledTimes(2);
		expect(errors()).toEqual([]);

		run('setpos "unit",5,1,2,3;');
		expect(errors()).toEqual(["Object/Unit/Item/Info with ID '5' does not exist"]);
	});

	it('setat: the position of the target as float text; no target still calls ha_setpos with ""', () => {
		const e = pivot(0, 0, 0);
		const target = pivot(1234567, 0.1, -2.5);
		vi.spyOn(parentchild, 'parent_h').mockImplementation((cls, id) => (cls === Cclass_object && id === 4 ? e : cls === Cclass_unit && id === 2 ? target : null));
		const ha_setpos = vi.spyOn(handle_all, 'ha_setpos').mockImplementation(() => {});
		run('setat "object",4,"unit",2;');
		// the position goes through a String: Str of a Float keeps 6 significant digits
		expect(ha_setpos).toHaveBeenCalledWith(e, Cclass_object, 4, Str(f32(1234567), 'float'), '0.1', '-2.5');
		expect(Str(f32(1234567), 'float')).toBe('1234570.0');
		run('setat "object",4,"unit",3;');
		expect(ha_setpos).toHaveBeenLastCalledWith(e, Cclass_object, 4, '', '', '');
		expect(errors()).toEqual([]);
		run('setat "object",5,"unit",2;');
		expect(errors()).toEqual(["Object/Unit/Item/Info with ID '5' does not exist"]);
	});

	it('setrot: rotates entity and collision handle, keeps the FRAP entry, turns the camera for unit 1', () => {
		const o = object(3);
		o.ch = pivot();
		RotateEntity(o.h, 0, 30, 0);
		PositionEntity(o.h, 0, 7, 0);
		const u = unit(1);
		const u2 = unit(2);
		vi.spyOn(parentchild, 'parent_h').mockImplementation((cls, id) => (cls === Cclass_object ? (id === 3 ? o.h : null) : id === 1 ? u.h : id === 2 ? u2.h : null));
		run('setrot "object",3,10,"self",0;');
		expect(EntityPitch(o.h)).toBeCloseTo(10, 3);
		expect(EntityYaw(o.h)).toBeCloseTo(30, 3);
		expect(EntityYaw(o.ch)).toBeCloseTo(30, 3);
		expect(Tfrap.list.count).toBe(1);
		const fr = [...Tfrap.list][0];
		expect([fr.parent_class, fr.parent_id, fr.y]).toEqual([Cclass_object, 3, 7]);
		expect(fr.pitch).toBeCloseTo(10, 3);
		run('setrot "object",3,20,0,0;');
		expect(Tfrap.list.count).toBe(1);
		expect([...Tfrap.list][0].pitch).toBeCloseTo(20, 3);

		// the camera follows unit id 1 only (not g_player)
		G.g_player = 2;
		RotateEntity(G.cam, 0, 0, 0);
		run('setrot "unit",2,0,90,0;');
		expect(EntityYaw(G.cam)).toBeCloseTo(0, 3);
		expect(Tfrap.list.count).toBe(1);
		run('setrot "unit",1,5,45,0;');
		expect(EntityYaw(G.cam)).toBeCloseTo(45, 3);
		expect(EntityPitch(G.cam)).toBeCloseTo(5, 3);
		expect(EntityRoll(G.cam)).toBeCloseTo(0, 3);
		expect(errors()).toEqual([]);
		run('setrot "unit",9,0,0,0;');
		expect(errors()).toEqual(["Object/Unit/Item/Info with ID '9' does not exist"]);
	});

	it('rpos: moves relative to a rotation (none by default, "self" = the own)', () => {
		const e = pivot(10, 2, 0);
		RotateEntity(e, 0, 90, 0);
		vi.spyOn(parentchild, 'parent_h').mockImplementation((_cls, id) => (id === 4 ? e : null));
		const ha_setpos = vi.spyOn(handle_all, 'ha_setpos').mockImplementation(() => {});
		// without pitch/yaw/roll the rotation is 0,0,0, not the entity's
		run('rpos "object",4,0,0,5;');
		expect(ha_setpos).toHaveBeenCalledWith(e, Cclass_object, 4, '10.0', '2.0', '5.0');
		expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([10, 2, 5]);
		// yaw "self" (90: forward is -x in Blitz)
		run('rpos "object",4,0,0,5,0,"self",0;');
		const a = ha_setpos.mock.calls.at(-1)! as unknown as [unknown, number, number, string, string, string];
		expect(Float(a[3])).toBeCloseTo(5, 3);
		expect(Float(a[4])).toBeCloseTo(2, 3);
		expect(Float(a[5])).toBeCloseTo(0, 3);
		// stored item: not moved
		const it = item(4, 20);
		Object.assign(it, { parent_class: Cclass_unit, parent_mode: Cpm_in });
		run('rpos "item",4,0,0,5;');
		expect(ha_setpos).toHaveBeenCalledTimes(2);
		it.parent_class = 0;
		run('rpos "item",4,0,0,5;');
		expect(ha_setpos).toHaveBeenCalledTimes(3);
		expect(errors()).toEqual([]);
		run('rpos "object",5,0,0,5;');
		expect(errors()).toEqual(["Object/Unit/Item/Info with ID '5' does not exist"]);
	});

	it('store: into a parent, or next to it (modes 1, 2) with the quirks of the original', () => {
		const { con_item } = mockCon();
		const store_item = vi.spyOn(handle_items, 'store_item').mockReturnValue(1);
		const object_spawnpos = vi.spyOn(handle_objects, 'object_spawnpos').mockReturnValue(0);
		expect(expr('store(7,"unit",1)')).toBe('1');
		expect(store_item).toHaveBeenLastCalledWith(7, Cclass_unit, 1);
		// "self" as item only in an item event; class "self" is the event's entity
		store_item.mockReturnValue(0);
		expect(exprAs(Cclass_item, 8, 'x', 'store("self","object",5)')).toBe('0');
		expect(store_item).toHaveBeenLastCalledWith(8, Cclass_object, 5);
		exprAs(Cclass_unit, 3, 'x', 'store("self","self")');
		expect(store_item).toHaveBeenLastCalledWith(0, Cclass_unit, 3); // Int("self")=0
		expect(con_item).not.toHaveBeenCalled();

		// mode 1: con_item() is asked for the CONTAINER id; store_item gets Cpm_out and 0,0,0
		item(5, 20, 9, 9, 9);
		expr('store(7,"object",5,1)');
		expect(con_item).toHaveBeenCalledWith(5);
		expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([9, 9, 9]);
		expect(store_item).toHaveBeenLastCalledWith(7, Cclass_object, 5, Cpm_out, 0, 0, 0);
		expect(object_spawnpos).not.toHaveBeenCalled();
		// mode 2: spawn position of an object
		expr('store(7,"object",6,2)');
		expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([0, 0, 0]);
		expect(object_spawnpos).toHaveBeenCalledWith(6);
		expr('store(7,"unit",6,2)');
		expect(object_spawnpos).toHaveBeenCalledTimes(1);
		expect(errors()).toEqual([]);
	});

	it('unstore returns the id of the current item if there is one', () => {
		const unstore_item = vi.spyOn(handle_items, 'unstore_item').mockImplementation(() => {
			G.TCitem = New(Titem);
			G.TCitem.id = 31;
			return 1;
		});
		expect(expr('unstore(7)')).toBe('31');
		expect(unstore_item).toHaveBeenLastCalledWith(7, 1, 1);
		expect(exprAs(Cclass_item, 8, 'x', 'unstore("self",4)')).toBe('31');
		expect(unstore_item).toHaveBeenLastCalledWith(8, 4, 1);
		unstore_item.mockImplementation(() => {
			G.TCitem = null;
			return 0;
		});
		run('unstore 7;');
		expect(RT.script.p_return).toBe('');
	});

	it('kill, damage, heal/repair', () => {
		const { con_unit } = mockCon();
		const kill_unit = vi.spyOn(handle_units, 'kill_unit').mockImplementation(() => {});
		const ha_damage = vi.spyOn(handle_all, 'ha_damage').mockReturnValue(0);
		const ha_heal = vi.spyOn(handle_all, 'ha_heal').mockReturnValue(0);
		const u = unit(5);
		run('kill 5;');
		expect(kill_unit).toHaveBeenCalledTimes(1);
		expect(G.TCunit).toBe(u);
		run('kill 6;');
		expect(kill_unit).toHaveBeenCalledTimes(1);
		runAs(Cclass_unit, 5, 'x', 'kill "self";');
		expect(kill_unit).toHaveBeenCalledTimes(2);
		// "self" outside a unit event: Int("self") = 0
		runAs(Cclass_object, 5, 'x', 'kill "self";');
		expect(con_unit).toHaveBeenLastCalledWith(0);

		run('damage "unit",5,12.5;');
		expect(ha_damage).toHaveBeenCalledWith(Cclass_unit, 5, 12.5);
		runAs(Cclass_object, 8, 'x', 'damage "self",3;');
		expect(ha_damage).toHaveBeenLastCalledWith(Cclass_object, 8, 3);
		run('heal "object",8,4;\nrepair "item",2,1.5;');
		expect(ha_heal.mock.calls).toEqual([
			[Cclass_object, 8, 4],
			[Cclass_item, 2, 1.5]
		]);
		expect(errors()).toEqual([]);
	});

	it('setcount / setamount: unstored items only, never 0', () => {
		const it = item(3, 20);
		run('setcount 3,-4;');
		expect(it.count).toBe(4);
		run('setamount 3,0;');
		expect(it.count).toBe(1);
		runAs(Cclass_item, 3, 'x', 'setcount "self",12;');
		expect(it.count).toBe(12);
		run('setcount 99,5;');
		expect(errors()).toEqual([]);
		it.parent_class = Cclass_unit;
		run('setamount 3,5;');
		expect(it.count).toBe(12);
		expect(errors()).toEqual(["'setcount' has to be used with an unstored item"]);
	});

	it('ride / drive and getoff', async () => {
		mockCon();
		const vehicledata = vi.spyOn(game_input_vehicles, 'game_input_vehicledata').mockImplementation(() => {});
		const ai_mode = vi.spyOn(ai_units, 'ai_mode').mockImplementation(() => {});
		const u = unit(8, 33);
		const model = [...DEFS.units.byId.values()].find((d) => d.model.toLowerCase().endsWith('.b3d'))!.model;
		await RT.world.preload([model]);
		u.mh = LoadAnimMesh(model);
		expect(u.mh).not.toBeNull();
		RotateEntity(u.h, 0, 70, 0);
		RotateEntity(G.cam, 15, 0, 0);
		Object.assign(u, { ai_mode: 77, ani: 5 });
		G.gt = 4321;
		run('ride 8;');
		expect(G.g_drive).toBe(8);
		expect(EntityYaw(G.cam)).toBeCloseTo(70, 3);
		expect(EntityPitch(G.cam)).toBeCloseTo(15, 3);
		expect(vehicledata).toHaveBeenCalledWith(33);
		expect([u.ai_mode, u.ai_duration, u.ai_timer, u.ani]).toEqual([0, 5000, 4321, 0]);

		run('getoff;');
		expect(ai_mode).toHaveBeenCalledWith(ai_idle);
		expect(G.g_drive).toBe(0);
		// without parameter: the entity of the event; unknown unit: nothing
		runAs(Cclass_unit, 8, 'x', 'drive;');
		expect(G.g_drive).toBe(8);
		G.g_drive = 0;
		run('ride 9;');
		expect(G.g_drive).toBe(0);
		run('getoff;');
		expect(ai_mode).toHaveBeenCalledTimes(1);
		expect(errors()).toEqual([]);
	});

	it('climate sets map_climate and changes the weather where the original does', () => {
		const setweather = vi.spyOn(RT.core, 'e_environment_setweather').mockImplementation(() => {});
		// normal: only when it snows or thunders, then Rand(0,1)
		G.env_cweather = 1;
		run('climate "normal";');
		expect(G.map_climate).toBe(0);
		expect(setweather).not.toHaveBeenCalled();
		G.env_cweather = 3;
		SeedRnd(77);
		const r1 = Rand(0, 1);
		const r2 = Rand(0, 1);
		SeedRnd(77);
		run('climate 0;');
		expect(setweather).toHaveBeenLastCalledWith(r1);
		// arctic: unless sun or snow, Rand(0,1)*2
		G.env_cweather = 1;
		run('climate "arctic";');
		expect(G.map_climate).toBe(1);
		expect(setweather).toHaveBeenLastCalledWith(r2 * 2);
		G.env_cweather = 2;
		run('climate 1;');
		expect(setweather).toHaveBeenCalledTimes(2);
		run('climate "sun";');
		expect([G.map_climate, setweather.mock.calls.at(-1)![0]]).toEqual([2, 0]);
		run('climate 3;');
		expect([G.map_climate, setweather.mock.calls.at(-1)![0]]).toEqual([3, 1]);
		run('climate "snow";');
		expect([G.map_climate, setweather.mock.calls.at(-1)![0]]).toEqual([4, 2]);
		run('climate "thunder";');
		expect([G.map_climate, setweather.mock.calls.at(-1)![0]]).toEqual([5, 3]);
		expect(errors()).toEqual([]);
		run('climate "fog";');
		expect(errors()).toEqual(["'fog' is no valid climate"]);
		expect(G.map_climate).toBe(5);
	});

	it('weather', () => {
		const setweather = vi.spyOn(RT.core, 'e_environment_setweather').mockImplementation(() => {});
		run('weather "sun";\nweather 1;\nweather "snow";\nweather 3;');
		expect(setweather.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3]);
		run('weather "normal";');
		expect(errors()).toEqual(["'normal' is no valid weather"]);
	});
});
