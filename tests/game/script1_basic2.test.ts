/**
 * script1: the script commands of parser_commands.bb lines 1192-2157
 * (script/commands/basic2.ts + game/script_host/script1.ts: the rest of
 * section BASIC and section PLAYER), run through the real interpreter.
 * Expected values come from reading the original Case blocks; functions of
 * other packages are mocked on their modules.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateCube, CreatePivot, EntityPitch, FreeEntity, PointEntity, PositionEntity, RotateEntity } from '../../src/lib/s2/bb3d';
import { Str, f32 } from '../../src/lib/s2/blitz';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import { Cbmpf_green, Cclass_item, Cclass_object, Cclass_unit, Cstate_tame, ai_attack, ai_idle, ai_movetarget } from '../../src/lib/s2/game/consts';
import * as debug from '../../src/lib/s2/game/debug';
import {
	Ditem_behaviour,
	Ditem_name,
	Ditem_weight,
	Dobject_behaviour,
	Dobject_growtime,
	Dobject_maxweight,
	Dobject_name,
	Dunit_attackrange,
	Dunit_behaviour,
	Dunit_col,
	Dunit_colyr,
	Dunit_damage,
	Dunit_health,
	Dunit_mat,
	Dunit_maxweight,
	Dunit_name,
	Dunit_speed
} from '../../src/lib/s2/game/defs_arrays';
import { DEFS } from '../../src/lib/s2/game/defs_store';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { FileType } from '../../src/lib/s2/game/files';
import { runDeferred } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as handle_all from '../../src/lib/s2/game/handle_all';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import { get_material } from '../../src/lib/s2/game/load_materials';
import { sm, ss } from '../../src/lib/s2/game/load_strings';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import * as projectiles from '../../src/lib/s2/game/projectiles';
import { RT } from '../../src/lib/s2/game/rt';
import { G } from '../../src/lib/s2/game/state';
import * as tcpcommands from '../../src/lib/s2/game/tcpcommands';
import { T3d } from '../../src/lib/s2/game/types';
import * as unitpath from '../../src/lib/s2/game/unitpath';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import { MOD, errors, expr, exprAs, item, mockCon, object, run, runAs, setup, teardown, unit } from './script1_setup';

describe.skipIf(!existsSync(MOD))('script1: BASIC commands, part 2 (parser_commands.bb 1192-2026)', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('downloadfile, callscript (executes only for the exact text "1")', () => {
		const tcp_loadfile = vi.spyOn(tcpcommands, 'tcp_loadfile').mockReturnValue(1);
		const tcp_callscript = vi.spyOn(tcpcommands, 'tcp_callscript').mockImplementation(() => {
			G.pv_buffer = '$got=5;';
		});
		run('downloadfile "www.x.de","/a.txt","b.txt";');
		expect(tcp_loadfile).toHaveBeenCalledWith('www.x.de', '/a.txt', 'b.txt');
		run('callscript "www.x.de","/s.s2s";');
		expect(tcp_callscript).toHaveBeenCalledWith('www.x.de', '/s.s2s');
		expect(var_get('got')).toBe('0');
		run('callscript "www.x.de","/s.s2s",1;');
		expect(var_get('got')).toBe('5');
		expect(errors()).toEqual([]);
	});

	it('fileexists and mkdir work on the file system', () => {
		expect(expr('fileexists("sys\\game.inf")')).toBe('1');
		expect(expr('fileexists("sys")')).toBe('1'); // a directory counts
		expect(expr('fileexists("sys\\nothing.inf")')).toBe('0');
		expect(FileType('s1dir')).toBe(0);
		expect(expr('mkdir("s1dir/")')).toBe('1');
		expect(FileType('s1dir')).toBe(2);
		expect(expr('mkdir("s1dir")')).toBe('1'); // exists already: still 1
		expect(errors()).toEqual([]);
	});

	it('spawntimer: set grows the object; get is always overwritten by the kill cache', () => {
		const grow_object = vi.spyOn(handle_objects, 'grow_object').mockImplementation(() => {});
		const o = object(9);
		o.daytimer = 3;
		expect(expr('spawntimer(9,5)')).toBe('5');
		expect(o.daytimer).toBe(5);
		expect(grow_object).toHaveBeenCalledWith(o);
		expect(expr('spawntimer(77,5)')).toBe('0');
		expect(grow_object).toHaveBeenCalledTimes(1);
		// get: the object's daytimer (5) is replaced by parse_kill_get(...)=0
		expect(expr('spawntimer(9)')).toBe('0');
		G.tmp_killclass = Cclass_object;
		G.tmp_killid = 9;
		G.tmp_killspawntimer = 12;
		expect(expr('spawntimer(9)')).toBe('12');
		expect(exprAs(Cclass_object, 9, 'x', 'spawntimer("self")')).toBe('12');
		expect(expr('spawntimer(8)')).toBe('0');
		expect(errors()).toEqual([]);
	});

	it('growtime', () => {
		const typ = [...DEFS.objects.byId.keys()][0];
		expect(expr(`growtime(${typ})`)).toBe(Str(Dobject_growtime(typ)));
		expect(expr('growtime(-1)')).toBe('0');
		expect(expr(`growtime(${G.Cobject_count + 1})`)).toBe('0');
	});

	it('unitpath sets the path up and adds every node in order; freeunitpath', () => {
		const order: string[] = [];
		vi.spyOn(unitpath, 'up_setup').mockImplementation((u) => void order.push(`setup ${u}`));
		vi.spyOn(unitpath, 'up_addnode').mockImplementation((u, n) => void order.push(`node ${u} ${n}`));
		const up_free = vi.spyOn(unitpath, 'up_free').mockImplementation(() => {});
		run('unitpath 5,10,11,12;');
		expect(order).toEqual(['setup 5', 'node 5 10', 'node 5 11', 'node 5 12']);
		order.length = 0;
		runAs(Cclass_unit, 8, 'x', 'unitpath "self",3;');
		expect(order).toEqual(['setup 8', 'node 8 3']);
		run('freeunitpath 5;');
		expect(up_free).toHaveBeenCalledWith(5);
		// no "self" here: Int("self")=0
		runAs(Cclass_unit, 8, 'x', 'freeunitpath "self";');
		expect(up_free).toHaveBeenLastCalledWith(0);
		expect(errors()).toEqual([]);
	});

	it('watertexture: a missing file ends in the RuntimeError of load_image', () => {
		expect(() => run('watertexture "gfx\\nothing.bmp";')).toThrow('Unable to load Image gfx\\nothing.bmp');
		expect(G.gfx_waterimg_custom).toBe(0);
	});

	it('terraintexture: generated colour maps and files (deferred)', async () => {
		const gen = vi.spyOn(editor_functions, 'editor_gencolormap').mockImplementation(async () => {});
		const e_tercol = vi.spyOn(RT.core, 'e_tercol');
		G.in_opt[4] = 9;
		run('terraintexture "generate";');
		expect(G.in_opt[4]).toBe(0);
		expect(gen).not.toHaveBeenCalled();
		await runDeferred();
		expect(gen).toHaveBeenLastCalledWith(1);
		for (const [name, opt] of [
			['desert', 3],
			['snow', 4],
			['swamp', 5]
		] as const) {
			run(`terraintexture "generate ${name}";`);
			await runDeferred();
			expect(G.in_opt[4]).toBe(opt);
			expect(gen).toHaveBeenLastCalledWith(1);
		}
		// nine colour values: three terrain colours, then without updating the colour set
		run('terraintexture "generate 1,2,3,4,5,6,7,8,9",0;');
		await runDeferred();
		expect(G.in_opt[4]).toBe(0);
		expect(e_tercol.mock.calls).toEqual([
			[1, 2, 3, 0],
			[4, 5, 6, 1],
			[7, 8, 9, 2]
		]);
		expect(gen).toHaveBeenLastCalledWith(0);
		expect(errors()).toEqual([]);

		// a file that cannot be loaded (headless: e_terraincm gives 0)
		run('terraintexture "gfx\\nothing.bmp";');
		expect(errors()).toEqual([]);
		await runDeferred();
		expect(errors()).toEqual(["unable to load terrain texture 'gfx\\nothing.bmp'"]);
	});

	it('skytexture stores the name of the sky box', () => {
		run('skytexture "night";');
		expect(G.map_skybox).toBe('night');
		expect(RT.core.map_skybox).toBe('night');
		run('skytexture "";');
		expect(G.map_skybox).toBe('');
	});

	it('alterobject replaces an object by another type at the same place', () => {
		mockCon();
		const order: string[] = [];
		vi.spyOn(handle_objects, 'free_object').mockImplementation((id) => (order.push(`free ${id}`), 1));
		const set_object = vi.spyOn(handle_objects, 'set_object').mockImplementation((id) => (order.push(`set ${id}`), id));
		const o = object(8, 1, 3, 1, 4);
		RotateEntity(o.h, 0, 30, 0);
		run('alterobject 8,17;');
		expect(order).toEqual(['free 8', 'set 8']);
		const a = set_object.mock.calls[0];
		expect(a.slice(0, 4)).toEqual([8, 17, 3, 4]);
		expect(a[4]).toBeCloseTo(30, 3);
		runAs(Cclass_object, 8, 'x', 'alterobject "self",18;');
		expect(set_object.mock.calls[1].slice(0, 2)).toEqual([8, 18]);
		run('alterobject 9,17;');
		expect(order.length).toBe(4);
		expect(errors()).toEqual([]);
	});

	it('speech, debug', () => {
		const speech = vi.spyOn(RT.audio, 'speech').mockReturnValue(0 as never);
		const dbugcmd = vi.spyOn(debug, 'dbugcmd').mockImplementation(() => {});
		run('speech "hello";\nspeech "bye",1,7;');
		expect(speech.mock.calls).toEqual([
			['hello', 0, 0],
			['bye', 1, 7]
		]);
		run('debug "a";\ndebug "b","c";');
		expect(dbugcmd.mock.calls).toEqual([
			['a', ''],
			['b', 'c']
		]);
	});

	it('revive: health, collision, AI; the loop variable is the global TCunit', () => {
		const ai_ini = vi.spyOn(ai_units, 'ai_ini').mockImplementation(() => {});
		const typ = [...DEFS.units.byId.keys()].find((t) => Dunit_health(t) > 0 && Dunit_col(t) > 0)!;
		const u = unit(5, typ);
		u.mh = CreateCube();
		Object.assign(u, { health: 0, health_max: 500 });
		unit(6, typ);
		G.g_player = 1;
		G.g_player_dead = 1;
		run('revive 5;');
		// health_max>0: only the health is reset
		expect([u.health, u.health_max]).toEqual([Dunit_health(typ), 500]);
		expect(ai_ini).toHaveBeenCalledWith(0);
		expect(G.TCunit).toBe(u);
		expect(G.g_player_dead).toBe(1);
		// health_max 0: both; the player is alive again
		Object.assign(u, { health: 0, health_max: 0 });
		G.g_player = 5;
		runAs(Cclass_unit, 5, 'x', 'revive "self";');
		expect([u.health, u.health_max]).toEqual([Dunit_health(typ), Dunit_health(typ)]);
		expect(G.g_player_dead).toBe(0);
		// unknown unit: TCunit is Null after the loop
		run('revive 99;');
		expect(G.TCunit).toBeNull();
		expect(ai_ini).toHaveBeenCalledTimes(2);
		expect(errors()).toEqual([]);
	});

	it('freeze: all units, one unit, or the state of one', () => {
		const freeze_unit = vi.spyOn(handle_units, 'freeze_unit').mockImplementation(() => {});
		const a = unit(5);
		const b = unit(6);
		b.freeze = 1;
		expect(expr('freeze()')).toBe('0');
		expect(freeze_unit.mock.calls).toEqual([
			[a, 1],
			[b, 1]
		]);
		freeze_unit.mockClear();
		run('freeze 6,0;');
		expect(freeze_unit.mock.calls).toEqual([[b, 0]]);
		// (interpreter quirk: parse_param() looks at the text after a function call, so in
		// "$r=freeze(6,2);" the parameters are not read at all; the statement form reads them)
		run('freeze 6,2;');
		expect(RT.script.p_return).toBe('1');
		run('freeze 5,2;');
		expect(RT.script.p_return).toBe('0');
		runAs(Cclass_unit, 6, 'x', 'freeze "self",3;');
		expect(RT.script.p_return).toBe('1');
		expect(freeze_unit).toHaveBeenCalledTimes(1);
		// id 0 with a query mode: every unit is "frozen" with that mode
		freeze_unit.mockClear();
		run('freeze 0,2;');
		expect(freeze_unit.mock.calls).toEqual([
			[a, 2],
			[b, 2]
		]);
		expect(errors()).toEqual([]);
	});

	it('intersect: with the environment or with a second entity', () => {
		const c1 = CreateCube();
		const c2 = CreateCube();
		const c3 = CreateCube();
		PositionEntity(c3, 50, 0, 0);
		const parent_h = vi.spyOn(parentchild, 'parent_h').mockImplementation((cls, id) => (cls !== Cclass_object ? null : id === 1 ? c1 : id === 2 ? c2 : id === 3 ? c3 : null));
		const ha_intersect = vi.spyOn(handle_all, 'ha_intersect').mockReturnValue(1);
		expect(expr('intersect("object",1)')).toBe('1');
		expect(parent_h).toHaveBeenLastCalledWith(Cclass_object, 1, 1);
		expect(ha_intersect).toHaveBeenCalledWith(Cclass_object, 1);
		expect(expr('intersect("object",1,"object",2)')).toBe('1');
		expect(expr('intersect("object",1,"object",3)')).toBe('0');
		expect(ha_intersect).toHaveBeenCalledTimes(1);
		expect(errors()).toEqual([]);
		expect(expr('intersect("object",9)')).toBe('0');
		expect(expr('intersect("object",1,"object",8)')).toBe('0');
		expect(expr('intersect("object",7,"object",8)')).toBe('0');
		expect(errors()).toEqual([
			"Object/Unit/Item/Info with ID '9' does not exist",
			"Object/Unit/Item/Info with ID '8' does not exist",
			"Object/Unit/Item/Info with ID '7' does not exist"
		]);
	});

	it('storage: capacity, free capacity, maximum; the weight for items', () => {
		const capacity = vi.spyOn(handle_items, 'capacity').mockReturnValue(5000);
		const otyp = [...DEFS.objects.byId.keys()].find((t) => Dobject_maxweight(t) > 0)!;
		const utyp = 1;
		const ityp = [...DEFS.items.byId.keys()].find((t) => Ditem_weight(t) > 0)!;
		object(4, otyp);
		unit(5, utyp);
		item(6, ityp);
		expect(expr('storage("object",4)')).toBe('5000');
		expect(capacity).toHaveBeenLastCalledWith(Cclass_object, 4, otyp);
		expect(expr('storage("object",4,1)')).toBe(Str(5000 - Dobject_maxweight(otyp)));
		expect(expr('storage("object",4,2)')).toBe(Str(Dobject_maxweight(otyp)));
		expect(expr('storage("object",4,3)')).toBe('0');
		expect(expr('storage("unit",5,0)')).toBe('5000');
		expect(capacity).toHaveBeenLastCalledWith(Cclass_unit, 5, utyp);
		expect(expr('storage("unit",5,1)')).toBe(Str(5000 - Dunit_maxweight(utyp)));
		expect(expr('storage("unit",5,2)')).toBe(Str(Dunit_maxweight(utyp)));
		// unknown object: type 0
		expr('storage("object",44)');
		expect(capacity).toHaveBeenLastCalledWith(Cclass_object, 44, 0);
		// items: the weight of the type, whatever the mode
		expect(expr('storage("item",6,2)')).toBe(Str(Ditem_weight(ityp)));
		expect(expr('storage("item",66)')).toBe('0');
		expect(expr('storage("info",1)')).toBe('0');
		expect(errors()).toEqual([]);
	});

	it('projectile: target position (Ints), direction, defaults and the optional tail', () => {
		const pro = vi.spyOn(projectiles, 'pro_add_script').mockReturnValue(0);
		// mode 2: x2,y2,z2 are Ints ("10.6" -> 10); towards +x is yaw -90
		run('projectile 30,0,0,0,2,10.6,0,0;');
		let a = pro.mock.calls.at(-1)!;
		expect(a.slice(0, 4)).toEqual([30, 0, 0, 0]);
		expect(a[4]).toBeCloseTo(0, 3);
		expect(a[5]).toBeCloseTo(-90, 3);
		expect(a.slice(6)).toEqual([0, 0, 1, 1, 0]);
		// the start is a Float position
		run('projectile 30,0.5,1.5,2.5,2,0,1,2,8;');
		a = pro.mock.calls.at(-1)!;
		expect(a.slice(0, 4)).toEqual([30, 0.5, 1.5, 2.5]);
		expect(a[6]).toBe(8);
		// mode 3: pitch and yaw as given, full tail
		run('projectile 30,1,2,3,3,45,90,5,7,2.5,3.5,0.5;');
		expect(pro.mock.calls.at(-1)).toEqual([30, 1, 2, 3, 45, 90, 5, 7, 2.5, 3.5, 0.5]);
		// mode 4 without a player: the pivot is never placed, pitch = yaw = 0
		run('projectile 30,1,2,3,4;');
		expect(pro.mock.calls.at(-1)!.map((v) => v! + 0)).toEqual([30, 1, 2, 3, 0, 0, 0, 0, 1, 1, 0]);
		// mode 4 with a player
		G.g_cplayer = unit(1, 1, 1, 2, 13);
		run('projectile 30,1,2,3,4,2,9;');
		a = pro.mock.calls.at(-1)!;
		expect(a[4]).toBeCloseTo(0, 3);
		expect(a[5]).toBeCloseTo(0, 3);
		expect(a.slice(6)).toEqual([2, 9, 1, 1, 0]);
		// any other mode: nothing
		const n = pro.mock.calls.length;
		run('projectile 30,1,2,3,9;');
		expect(pro.mock.calls.length).toBe(n);
		expect(errors()).toEqual([]);
	});

	it('projectile mode 1: at an entity (units: half the collision height lower)', () => {
		const pro = vi.spyOn(projectiles, 'pro_add_script').mockReturnValue(0);
		const typ = [...DEFS.units.byId.keys()].find((t) => Dunit_colyr(t) > 0)!;
		const u = unit(100, typ, 0, 20, 30);
		const parent_pos = vi.spyOn(parentchild, 'parent_pos').mockImplementation((cls, id) => {
			if (cls === Cclass_unit && id === 100) {
				G.tmp_x = 0;
				G.tmp_y = 20;
				G.tmp_z = 30;
				return 1;
			}
			if (cls === Cclass_object && id === 4) {
				G.tmp_x = 0;
				G.tmp_y = 20;
				G.tmp_z = 30;
				return 1;
			}
			return 0;
		});
		const expectPitch = (ty: number): number => {
			const p = CreatePivot();
			const p2 = CreatePivot();
			PositionEntity(p2, 0, ty, 30);
			PointEntity(p, p2);
			const r = EntityPitch(p);
			FreeEntity(p);
			FreeEntity(p2);
			return r;
		};
		run('projectile 30,0,0,0,1,"object",4;');
		expect(parent_pos).toHaveBeenLastCalledWith(Cclass_object, 4);
		expect(pro.mock.calls.at(-1)![4]).toBe(expectPitch(20));
		run('projectile 30,0,0,0,1,"unit",100,3,6;');
		const a = pro.mock.calls.at(-1)!;
		expect(a[4]).toBe(expectPitch(f32(20 - f32(Dunit_colyr(typ) / 2))));
		expect(a[4]).not.toBe(expectPitch(20));
		expect(a.slice(6)).toEqual([3, 6, 1, 1, 0]);
		runAs(Cclass_unit, 100, 'x', 'projectile 30,0,0,0,1,"self";');
		expect(pro).toHaveBeenCalledTimes(3);
		expect(errors()).toEqual([]);
		// the target does not exist: nothing is fired
		run('projectile 30,0,0,0,1,"unit",7;');
		expect(pro).toHaveBeenCalledTimes(3);
		void u;
	});

	it('projectile modes 5 and 6: the nearest (aggressive, untamed) unit, with the Int distance quirk', () => {
		const pro = vi.spyOn(projectiles, 'pro_add_script').mockReturnValue(0);
		const typ = 2;
		Dunit_colyr.set(typ, 0);
		const yaw = (): number => pro.mock.calls.at(-1)![5] as number;
		// nobody in range (range 20 -> lowdist 21): nothing
		const far = unit(100, typ, 0, 0, 21);
		far.health = 10;
		run('projectile 30,0,0,0,5,20;');
		expect(pro).not.toHaveBeenCalled();
		// A at 10.4 (east): lowdist becomes Int(10.4)=10, so B at 10.2 (north, later in the list) is not nearer
		const a = unit(101, typ, 10.4, 0, 0);
		a.health = 10;
		const b = unit(102, typ, 0, 0, 10.2);
		b.health = 10;
		run('projectile 30,0,0,0,5,20,4;');
		expect(yaw()).toBeCloseTo(-90, 3);
		expect(pro.mock.calls.at(-1)![6]).toBe(4);
		// C at 9 (west) is nearer than 10
		const c = unit(103, typ, -9, 0, 0);
		c.health = 10;
		run('projectile 30,0,0,0,5,20;');
		expect(yaw()).toBeCloseTo(90, 3);
		// dead units and ids below 100 do not count
		c.health = 0;
		const player = unit(1, typ, 0, 0, -2);
		player.health = 10;
		run('projectile 30,0,0,0,5,20;');
		expect(yaw()).toBeCloseTo(-90, 3);

		// mode 6: aggressive behaviour only, and not tame
		const ai_agressive = vi.spyOn(ai_units, 'ai_agressive').mockReturnValue(0);
		const get_state = vi.spyOn(handle_states, 'get_state').mockReturnValue(1);
		pro.mockClear();
		run('projectile 30,0,0,0,6,20;');
		expect(pro).not.toHaveBeenCalled();
		expect(ai_agressive).toHaveBeenCalledWith(Dunit_behaviour(typ));
		ai_agressive.mockReturnValue(1);
		a.states = 1; // A is tame, B is not asked (no states)
		run('projectile 30,0,0,0,6,20;');
		expect(get_state).toHaveBeenCalledWith(Cstate_tame, Cclass_unit, 101);
		expect(get_state).toHaveBeenCalledTimes(1);
		expect(yaw()).toBeCloseTo(0, 3);
		expect(errors()).toEqual([]);
	});

	it('loadani, animate, viewline return the result of the game function', () => {
		const unit_loadani = vi.spyOn(handle_units, 'unit_loadani').mockReturnValue(1);
		const unit_scriptani = vi.spyOn(handle_units, 'unit_scriptani').mockReturnValue(2);
		const viewline = vi.spyOn(functions, 'viewline').mockReturnValue(1);
		expect(expr('loadani(5,10,20)')).toBe('1');
		expect(unit_loadani).toHaveBeenCalledWith(5, 10, 20);
		expect(expr('animate(5,10,20,0.5)')).toBe('2');
		expect(unit_scriptani).toHaveBeenLastCalledWith(5, 10, 20, 0.5, 3);
		expr('animate(5,10,20,2,1)');
		expect(unit_scriptani).toHaveBeenLastCalledWith(5, 10, 20, 2, 1);
		// the first point is Float, the second one Int
		expect(expr('viewline(1.5,2.5,3.5,4.6,5.6,6.6)')).toBe('1');
		expect(viewline).toHaveBeenCalledWith(1.5, 2.5, 3.5, 4, 5, 6);
		expect(errors()).toEqual([]);
	});

	it('text3d: create, change, delete; Int offset and range', () => {
		const ha_type = vi.spyOn(handle_all, 'ha_type').mockReturnValue(1);
		run('text3d "unit",5,"hello";');
		expect(ha_type).toHaveBeenCalledWith(Cclass_unit, 5);
		let t = [...T3d.list];
		expect(t.map((x) => [x.class, x.id, x.txt, x.typ, x.offset, x.range])).toEqual([[Cclass_unit, 5, 'hello', 0, 0, 300]]);
		// change: colour, offset (Float 2.5 -> Int 2), range
		run('text3d "unit",5,"again",3,2.5,150.6;');
		t = [...T3d.list];
		expect(t.map((x) => [x.txt, x.typ, x.offset, x.range])).toEqual([['again', 3, 2, 151]]);
		runAs(Cclass_object, 7, 'x', 'text3d "self","obj";');
		expect(T3d.list.count).toBe(2);
		// empty text deletes
		run('text3d "unit",5,"";');
		expect([...T3d.list].map((x) => [x.class, x.id])).toEqual([[Cclass_object, 7]]);
		// ... but creates an empty entry when there was none
		run('text3d "unit",5,"";');
		expect([...T3d.list].map((x) => [x.class, x.id, x.txt])).toEqual([
			[Cclass_object, 7, 'obj'],
			[Cclass_unit, 5, '']
		]);
		// the entity does not exist: nothing
		ha_type.mockReturnValue(0);
		run('text3d "unit",6,"x";');
		expect(T3d.list.count).toBe(2);
		expect(errors()).toEqual([]);
	});

	it('lensflares, skycolor', () => {
		const update_light = vi.spyOn(RT.core, 'e_environment_update_light').mockImplementation(() => {});
		run('lensflares 0;');
		expect(G.set_flarefx).toBe(0);
		run('lensflares 1;');
		expect(G.set_flarefx).toBe(1);
		run('skycolor 1,10,20,30,40;');
		expect(G.in_skyoverride).toEqual([1, 10, 20, 30, 40]);
		// without colour: the old colour stays, the mix is reset
		run('skycolor 0;');
		expect(G.in_skyoverride).toEqual([0, 10, 20, 30, 0]);
		run('skycolor 2,1,2,3;');
		expect(G.in_skyoverride).toEqual([2, 1, 2, 3, 0]);
		expect(update_light).toHaveBeenCalledTimes(3);
		expect(errors()).toEqual([]);
	});

	it('behaviour and name of a type', () => {
		const otyp = [...DEFS.objects.byId.keys()][0];
		const utyp = [...DEFS.units.byId.keys()].find((t) => Dunit_behaviour(t) !== 0)!;
		const ityp = [...DEFS.items.byId.keys()][0];
		run(`$a=behaviour("object",${otyp});\n$b=behaviour("unit",${utyp});\n$c=behaviour("item",${ityp});`);
		expect(RT.script.p_return).toBe(Ditem_behaviour(ityp));
		expect(var_get('b')).toBe(Str(Dunit_behaviour(utyp)));
		run(`behaviour "object",${otyp};`);
		expect(RT.script.p_return).toBe(Dobject_behaviour(otyp));
		run(`name "object",${otyp};`);
		expect(RT.script.p_return).toBe(Dobject_name(otyp));
		expect(Dobject_name(otyp)).not.toBe('');
		run(`name "unit",${utyp};`);
		expect(RT.script.p_return).toBe(Dunit_name(utyp));
		run(`name "item",${ityp};`);
		expect(RT.script.p_return).toBe(Ditem_name(ityp));
		// type 0 is in range
		run('name "unit",0;');
		expect(errors()).toEqual([]);
		run(`name "unit",${G.Cunit_count + 1};`);
		run('behaviour "item",-1;');
		run('behaviour "info",1;');
		expect(errors()).toEqual([`Type '${G.Cunit_count + 1}' is out of range`, "Type '-1' is out of range", "Class 'info' is not expected"]);
	});

	it('copychilds / pastechilds with their defaults', () => {
		const copy = vi.spyOn(handle_all, 'ha_copychilds').mockImplementation(() => {});
		const paste = vi.spyOn(handle_all, 'ha_pastechilds').mockReturnValue(0);
		run('copychilds "unit",5;\ncopychildren "object",6,0,0,0,1,1;');
		expect(copy.mock.calls).toEqual([
			[Cclass_unit, 5, 1, 1, 1, 0, 0],
			[Cclass_object, 6, 0, 0, 0, 1, 1]
		]);
		run('pastechilds "unit",5;');
		runAs(Cclass_item, 9, 'x', 'pastechildren "self",0,1,0,1;');
		expect(paste.mock.calls).toEqual([
			[Cclass_unit, 5, 1, 1, 1, 0],
			[Cclass_item, 9, 0, 1, 0, 1]
		]);
		expect(errors()).toEqual([]);
	});
});

describe.skipIf(!existsSync(MOD))('script1: PLAYER commands (parser_commands.bb 2031-2157)', () => {
	beforeEach(setup);
	afterEach(teardown);

	it('player_speed, player_damage, player_attackrange, player_maxweight, player_mat change unit type 1', () => {
		run('player_speed 2.5;\nplayer_damage 7.25;');
		expect(Dunit_speed(1)).toBe(2.5);
		expect(Dunit_damage(1)).toBe(7.25);
		// Int arrays: the Float is rounded to nearest, ties to even
		run('player_attackrange 30.5;\nplayer_maxweight 2500.6;');
		expect(Dunit_attackrange(1)).toBe(30);
		expect(Dunit_maxweight(1)).toBe(2501);
		run('player_attackrange 31.5;');
		expect(Dunit_attackrange(1)).toBe(32);
		run('player_mat "stone";');
		expect(Dunit_mat(1)).toBe(get_material('stone'));
		expect(get_material('stone')).not.toBe(get_material('wood'));
		expect(errors()).toEqual([]);
	});

	it('player_weapon, player_ammo, sleep, scantarget', () => {
		const weapon = vi.spyOn(game_functions, 'game_weapon_bytype').mockReturnValue(0);
		const ammo = vi.spyOn(game_functions, 'game_ammo_bytype').mockReturnValue(0);
		const sleep = vi.spyOn(game_functions, 'game_sleep').mockImplementation(() => {});
		const target = vi.spyOn(game_functions, 'game_target').mockReturnValue(0);
		run('player_weapon 30;\nplayer_ammo 31;\nsleep;');
		expect(weapon).toHaveBeenCalledWith(30);
		expect(ammo).toHaveBeenCalledWith(31);
		expect(sleep).toHaveBeenCalledTimes(1);
		run('scantarget;');
		expect(target.mock.calls[0]).toEqual([]); // the default range of game_target()
		run('scantarget 250.7;');
		expect(target.mock.calls[1]).toEqual([250]); // range is an Int
		expect(errors()).toEqual([]);
	});

	it('jumptime (rounded) and jumpfactor', () => {
		run('jumptime 450.5;\njumpfactor 1.5;');
		expect(G.game_jumptime).toBe(450);
		expect(G.game_jumpfac).toBe(1.5);
		run('jumptime 451.5;');
		expect(G.game_jumptime).toBe(452);
	});

	it('playerspotted: an aggressive living unit near the camera that attacks or moves to its target', () => {
		const ai_agressive = vi.spyOn(ai_units, 'ai_agressive').mockReturnValue(1);
		PositionEntity(G.cam, 0, 0, 0);
		const u = unit(100, 2, 0, 0, 299);
		u.health = 10;
		u.ai_mode = ai_idle;
		expect(expr('playerspotted()')).toBe('0');
		u.ai_mode = ai_attack;
		expect(expr('playerspotted()')).toBe('1');
		expect(ai_agressive).toHaveBeenLastCalledWith(Dunit_behaviour(2));
		u.ai_mode = ai_movetarget;
		expect(expr('playerspotted()')).toBe('1');
		u.health = 0;
		expect(expr('playerspotted()')).toBe('0');
		u.health = 10;
		PositionEntity(u.h, 0, 0, 300);
		expect(expr('playerspotted()')).toBe('0');
		PositionEntity(u.h, 0, 0, 10);
		ai_agressive.mockReturnValue(0);
		expect(expr('playerspotted()')).toBe('0');
	});

	it('getplayervalue', () => {
		// no player: nothing, not even the error
		run('getplayervalue 9;');
		expect(RT.script.p_return).toBe('');
		expect(errors()).toEqual([]);
		G.g_cplayer = unit(1);
		Object.assign(G.g_cplayer, { health: 55.5, hunger: 1, thirst: 20.25, exhaustion: 0 });
		expect(expr('getplayervalue(1)')).toBe('55.5');
		expect(expr('getplayervalue(2)')).toBe('1.0');
		expect(expr('getplayervalue(3)')).toBe('20.25');
		expect(expr('getplayervalue(4)')).toBe('0.0');
		run('getplayervalue 9;');
		expect(errors()).toEqual(["Expecting  1,2,3 or 4 as parameter for 'getplayervalue'"]);
	});

	it('targetx/y/z, targetclass, targetid, targetdistance', () => {
		PositionEntity(G.cam, 10, 20, 30);
		G.tmp_tarx = 13;
		G.tmp_tary = 24;
		G.tmp_tarz = 30;
		G.tmp_tarclass = 2;
		G.tmp_tarid = 17;
		expect(expr('targetx()')).toBe('13.0');
		expect(expr('targety()')).toBe('24.0');
		expect(expr('targetz()')).toBe('30.0');
		expect(expr('targetclass()')).toBe('2');
		expect(expr('targetid()')).toBe('17');
		expect(expr('targetdistance()')).toBe('5.0');
		expect(errors()).toEqual([]);
	});

	it('air: only while diving, never later than now', () => {
		G.gt = 150;
		G.g_airtimer = 100;
		run('air 30;');
		expect(G.g_airtimer).toBe(100);
		G.g_dive = 1;
		run('air 30;');
		expect(G.g_airtimer).toBe(130);
		run('air 100;');
		expect(G.g_airtimer).toBe(150);
	});

	it('find: a new item at the camera goes to unit 1, with effect, message and sound', () => {
		const typ = [...DEFS.items.byId.keys()][0];
		PositionEntity(G.cam, 1, 2, 3);
		const set_item = vi.spyOn(handle_items, 'set_item').mockReturnValue(77);
		const store_item = vi.spyOn(handle_items, 'store_item').mockReturnValue(1);
		const p_add2d = vi.spyOn(particles, 'p_add2d').mockReturnValue(0);
		const if_msg = vi.spyOn(interface_, 'if_msg').mockImplementation(() => {});
		const sfx = vi.spyOn(RT.audio, 'sfx');
		G.g_player = 5;
		G.set_scrx = 801;
		G.set_scry = 600;
		run(`find ${typ},3;`);
		expect(set_item).toHaveBeenCalledWith(-1, typ, 1, 2, 3, 3);
		expect(store_item).toHaveBeenCalledWith(77, Cclass_unit, 1); // unit 1, not g_player
		expect(p_add2d).toHaveBeenCalledWith(400, 300, -2, typ);
		expect(if_msg).toHaveBeenCalledWith(ss(sm(180), Ditem_name(typ), '3'), Cbmpf_green);
		expect(sfx).toHaveBeenCalledWith(G.sfx_collect);
		run(`find ${typ};`);
		expect(set_item).toHaveBeenLastCalledWith(-1, typ, 1, 2, 3, 1);
		expect(errors()).toEqual([]);
	});
});

