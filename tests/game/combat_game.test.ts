/**
 * projectiles.bb, game_weapons.bb and game_build.bb (package combat).
 * Functions of other packages are mocked on their skeleton modules; the
 * expected values come from reading the original source.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	Collisions,
	CreateCube,
	CreateMesh,
	CreatePivot,
	EntityDistance,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	GetEntityType,
	GetParent,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	UpdateWorld,
	type BBEntity,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Cos, SEP_LINE, Sin, f32 } from '../../src/lib/s2/blitz';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_if_build,
	Cmenu_if_buildsetup,
	Cp2d_item,
	Cp_attack,
	Cp_explode,
	Cp_fadeout,
	Cp_impact,
	Cp_smoke,
	Cp_spark,
	Cpro_aresfade,
	Cpro_asmoke,
	Cpro_asparkle,
	Cpro_asupersparkle,
	Cpro_fire,
	Cpro_poison,
	Cpro_smoke,
	Cstate_buildplace,
	Cstate_fire,
	Cstate_ghost,
	Cstate_intoxication,
	Cstate_link,
	Cstate_pc_build,
	Cworld_procol
} from '../../src/lib/s2/game/consts';
import {
	Ditem_behaviour,
	Ditem_damage,
	Ditem_drag,
	Ditem_mat,
	Ditem_modelh,
	Ditem_rate,
	Ditem_script,
	Ditem_scriptk,
	Ditem_speed,
	Ditem_wstate,
	Dobject_model,
	Dobject_script,
	Dobject_scriptk,
	Dunit_attackrange,
	Dunit_colxr,
	Dunit_damage,
	Dunit_eyes
} from '../../src/lib/s2/game/defs';
import { DEFS } from '../../src/lib/s2/game/defs_store';
import * as functions from '../../src/lib/s2/game/functions';
import { game_build, game_buildfocus, game_buildplace, game_buildsetup_end, game_buildsetup_start, game_buildsetup_update } from '../../src/lib/s2/game/game_build';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import { game_wpn_blade, game_wpn_distance, game_wpn_distancef, game_wpn_none, game_wpn_selfthrow } from '../../src/lib/s2/game/game_weapons';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import * as load_materials from '../../src/lib/s2/game/load_materials';
import { pro_add, pro_add_script, pro_ini, pro_update } from '../../src/lib/s2/game/projectiles';
import { RT } from '../../src/lib/s2/game/rt';
import { G } from '../../src/lib/s2/game/state';
import { New, Tbui, Titem, Tobject, Tpro, Tstate, Tunit, isNull } from '../../src/lib/s2/game/types';
import { MOD, particles, setupCombat, teardownCombat } from './combat.helpers';

/** An item type of the mod with a (dummy) model, and neutral weapon values. */
function testItem(n = 0): number {
	const typ = [...DEFS.items.byId.keys()][n];
	Ditem_modelh.set(typ, CreateCube());
	Ditem_behaviour.set(typ, '');
	Ditem_wstate.set(typ, 0);
	Ditem_scriptk.set(typ, '');
	Ditem_drag.set(typ, 0);
	Ditem_damage.set(typ, '1');
	Ditem_rate.set(typ, 0);
	return typ;
}

/** The mocks nearly every function of the package needs. */
function mockWorld() {
	const m = {
		con_unit: vi.spyOn(handle_units, 'con_unit').mockImplementation((id) => {
			for (const u of Tunit.list.toArray()) {
				if (u.id === id) {
					G.TCunit = u;
					return 1;
				}
			}
			return 0;
		}),
		get_stored_item: vi.spyOn(handle_items, 'get_stored_item').mockImplementation((typ, cls, id) => {
			for (const it of Titem.list.toArray()) {
				if (it.typ === typ && it.parent_class === cls && it.parent_id === id) {
					G.TCitem = it;
					return 1;
				}
			}
			return 0;
		}),
		free_item: vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1),
		set_item: vi.spyOn(handle_items, 'set_item').mockImplementation(() => 1),
		store_item: vi.spyOn(handle_items, 'store_item').mockImplementation(() => 1),
		get_object: vi.spyOn(handle_objects, 'get_object').mockImplementation((h) => {
			for (const o of Tobject.list.toArray()) {
				if (o.h === h) {
					G.TCobject = o;
					return o.id;
				}
			}
			return -1;
		}),
		find_object: vi.spyOn(handle_objects, 'find_object').mockImplementation(() => 1),
		con_object: vi.spyOn(handle_objects, 'con_object').mockImplementation(() => 1),
		set_object: vi.spyOn(handle_objects, 'set_object').mockImplementation((_id, typ, x, z) => {
			const o = New(Tobject);
			o.id = 500 + Tobject.list.count;
			o.typ = typ;
			o.h = CreateCube();
			PositionEntity(o.h, x, 0, z);
			G.TCobject = o;
			return o.id;
		}),
		free_object: vi.spyOn(handle_objects, 'free_object').mockImplementation(() => 1),
		set_unit: vi.spyOn(handle_units, 'set_unit').mockImplementation((_id, typ, x, z) => {
			const u = New(Tunit);
			u.id = 700 + Tunit.list.count;
			u.typ = typ;
			u.h = CreatePivot();
			PositionEntity(u.h, x, 0, z);
			G.TCunit = u;
			return u.id;
		}),
		get_state: vi.spyOn(handle_states, 'get_state').mockImplementation((typ, cls, id) => {
			for (const s of Tstate.list.toArray()) {
				if (s.typ === typ && s.parent_class === cls && s.parent_id === id) {
					G.TCstate = s;
					return 1;
				}
			}
			return 0;
		}),
		set_state: vi.spyOn(handle_states, 'set_state').mockImplementation((typ, cls, id) => {
			const s = New(Tstate);
			s.typ = typ;
			s.parent_class = cls;
			s.parent_id = id;
			G.TCstate = s;
			return 1;
		}),
		free_state: vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1),
		attach_state: vi.spyOn(handle_states, 'attach_state').mockImplementation(() => 1),
		state_depleted: vi.spyOn(handle_states, 'state_depleted').mockImplementation(() => 0),
		state_impactfx: vi.spyOn(handle_states, 'state_impactfx').mockImplementation(() => {}),
		game_exhaust: vi.spyOn(game_functions, 'game_exhaust').mockImplementation(() => {}),
		game_damage: vi.spyOn(game_functions, 'game_damage').mockImplementation(() => 0),
		game_explosion: vi.spyOn(game_functions, 'game_explosion').mockImplementation(() => {}),
		game_picking: vi.spyOn(game_functions, 'game_picking').mockImplementation(() => {}),
		material_fx: vi.spyOn(load_materials, 'material_fx').mockImplementation(() => {}),
		if_msg: vi.spyOn(interface_, 'if_msg').mockImplementation(() => {}),
		meshline: vi.spyOn(functions, 'meshline').mockImplementation(() => CreateMesh()),
		parse_task: vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {}),
		parse_sel_event: vi.spyOn(RT.script, 'parse_sel_event').mockImplementation(() => {}),
		parse_globalevent: vi.spyOn(RT.script, 'parse_globalevent').mockImplementation(() => {}),
		set_parsecache: vi.spyOn(RT.script, 'set_parsecache').mockImplementation(() => 0),
		sfx: vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0),
		sfx_emit: vi.spyOn(RT.audio, 'sfx_emit').mockImplementation(() => 0),
		sfx_3d: vi.spyOn(RT.audio, 'sfx_3d').mockImplementation(() => {}),
		speech: vi.spyOn(RT.audio, 'speech').mockImplementation(() => 0)
	};
	return m;
}

/** The player: unit 1 at the origin, the camera at eye height looking along +z. */
function player(): Tunit {
	const u = New(Tunit);
	u.id = 1;
	u.typ = 1;
	u.h = CreatePivot();
	G.g_player = 1;
	G.g_cplayer = u;
	G.env_sea2 = CreatePivot();
	PositionEntity(G.cam, 0, 10, 0);
	RotateEntity(G.cam, 0, 0, 0);
	return u;
}

function pickTarget(z: number, y = 10): BBEntity {
	const t = CreateCube();
	ScaleEntity(t, 5, 5, 5);
	PositionEntity(t, 0, y, z);
	EntityPickMode(t, 2);
	return t;
}

function inventory(typ: number, cls: number, id: number, count = 1): Titem {
	const it = New(Titem);
	it.id = 100 + Titem.list.count;
	it.typ = typ;
	it.parent_class = cls;
	it.parent_id = id;
	it.count = count;
	return it;
}

describe.skipIf(!existsSync(MOD))('combat: projectiles.bb', () => {
	let m: ReturnType<typeof mockWorld>;
	beforeEach(async () => {
		await setupCombat();
		m = mockWorld();
		G.ter_groundy = -1000;
	});
	afterEach(teardownCombat);

	it('pro_add without a spawner unit: a copy of the model on a collision pivot, tail by behaviour', () => {
		const typ = testItem();
		G.gt = 4321;
		Ditem_behaviour.set(typ, 'asparkle:10,20,30,1,2.5,7');
		expect(pro_add(0, typ, 0, 0)).toBe(1);
		const p = G.TCpro!;
		expect(m.con_unit).toHaveBeenCalledWith(0);
		expect([p.spawner, p.typ, p.weapon, p.age, p.water, p.wc]).toEqual([0, typ, 0, 4321, 0, 0]);
		expect(p.mh).not.toBe(Ditem_modelh(typ));
		expect(GetParent(p.mh)).toBe(p.h);
		expect(GetEntityType(p.h)).toBe(Cworld_procol);
		expect(p.tail).toBe(Cpro_asparkle);
		expect([p.tcol, p.tfx, p.tset]).toEqual([[10, 20, 30], 1, [2.5, 7]]);

		const tails: [string, number][] = [
			['notail', 0],
			['rocket', Cpro_fire],
			['toxicrocket', Cpro_fire],
			['poison', Cpro_poison],
			['smoke', Cpro_smoke],
			['asmoke', Cpro_asmoke],
			['asupersparkle', Cpro_asupersparkle],
			['aresfade:1,2,3', Cpro_aresfade],
			['throw', 0]
		];
		for (const [b, tail] of tails) {
			Ditem_behaviour.set(typ, b);
			pro_add(0, typ, 0, 0);
			expect([b, G.TCpro!.tail]).toEqual([b, tail]);
		}
		// defaults of the adjustable tails
		expect([G.TCpro!.tail, G.TCpro!.tcol, G.TCpro!.tset]).toEqual([0, [0, 0, 0], [0, 0]]);
		Ditem_behaviour.set(typ, 'asupersparkle:1,2,3,0,-1');
		pro_add(0, typ, 0, 0);
		expect(G.TCpro!.tset).toEqual([3, 0]);
		Ditem_behaviour.set(typ, 'aresfade:1,2,3');
		pro_add(0, typ, 0, 0);
		expect([G.TCpro!.tcol, G.TCpro!.tset]).toEqual([[1, 2, 3], [f32(0.15), f32(0.2)]]);
		// the split stops at the first empty field
		Ditem_behaviour.set(typ, 'asmoke:9,,7');
		pro_add(0, typ, 0, 0);
		expect(G.TCpro!.tcol).toEqual([9, 0, 0]);

		// tail by the ammunition's weapon state; "notail" wins over it
		Ditem_behaviour.set(typ, '');
		Ditem_wstate.set(typ, Cstate_fire);
		pro_add(0, typ, 0, 0);
		expect(G.TCpro!.tail).toBe(Cpro_fire);
		Ditem_wstate.set(typ, Cstate_intoxication);
		pro_add(0, typ, 0, 0);
		expect(G.TCpro!.tail).toBe(Cpro_poison);
		Ditem_behaviour.set(typ, 'notail');
		pro_add(0, typ, 0, 0);
		expect(G.TCpro!.tail).toBe(0);
		expect(Tpro.list.count).toBe(16);
	});

	it('pro_add from a unit: starts at eye height, colxr+5 ahead; the player shoots from the camera; fire dies under water', () => {
		const typ = testItem();
		const wpn = testItem(1);
		const u = New(Tunit);
		u.id = 5;
		u.typ = 1;
		u.player_weapon = wpn;
		u.h = CreatePivot();
		PositionEntity(u.h, 10, 0, 20);
		G.g_player = 99;
		pro_add(5, typ, 0, 0);
		const p = G.TCpro!;
		expect(p.weapon).toBe(wpn);
		expect(EntityX(p.h)).toBeCloseTo(10, 4);
		expect(EntityY(p.h)).toBeCloseTo(Dunit_eyes(1), 4);
		expect(EntityZ(p.h)).toBeCloseTo(20 + Dunit_colxr(1) + 5, 4);

		G.g_player = 5;
		PositionEntity(G.cam, 1, 2, 3);
		RotateEntity(G.cam, 0, 0, 0);
		pro_add(5, typ, 0, 0);
		expect(EntityX(G.TCpro!.h)).toBeCloseTo(1, 4);
		expect(EntityY(G.TCpro!.h)).toBeCloseTo(2, 4);
		expect(EntityZ(G.TCpro!.h)).toBeCloseTo(3 + Dunit_colxr(1) + 5, 4);

		Ditem_wstate.set(wpn, Cstate_fire);
		pro_add(5, typ, 0, 0);
		expect(G.TCpro!.tail).toBe(Cpro_fire);
		PositionEntity(G.cam, 1, -20, 3);
		pro_add(5, typ, 0, 0);
		expect([G.TCpro!.water, G.TCpro!.wc, G.TCpro!.tail]).toEqual([1, 1, Cpro_smoke]);
	});

	it('pro_add_script / pro_ini', () => {
		const typ = testItem();
		const wpn = testItem(1);
		expect(pro_add_script(typ, 1, 2, 3, 30, 0, 10, 0, 2, 3, 0.5)).toBe(1);
		const p = G.TCpro!;
		expect([p.weapon, p.speed, p.damage, p.drag, p.spitch]).toEqual([0, 2, 3, 0.5, 30]);
		expect(GetEntityType(p.h)).toBe(Cworld_procol);
		expect(EntityPitch(p.h)).toBeCloseTo(30, 3);
		// offset 10 along the flight direction (pitch 30 points downwards)
		expect(EntityX(p.h)).toBeCloseTo(1, 4);
		expect(EntityY(p.h)).toBeCloseTo(2 - 10 * Math.sin(Math.PI / 6), 3);
		expect(EntityZ(p.h)).toBeCloseTo(3 + 10 * Math.cos(Math.PI / 6), 3);
		expect(p.sx).toBe(f32(Sin(p.spitch) * 2));
		expect(p.sy).toBe(f32(f32(-Cos(p.spitch)) * 2));

		// with a weapon the speed is the weapon's
		Ditem_speed.set(wpn, 7.5);
		pro_add_script(typ, 0, 0, 0, 0, 0, 0, wpn, 2);
		expect(G.TCpro!.speed).toBe(7.5);
		G.TCpro!.weapon = 0;
		G.TCpro!.speed = 4;
		pro_ini();
		expect([G.TCpro!.speed, Math.abs(G.TCpro!.sx), G.TCpro!.sy]).toEqual([4, 0, -4]);
	});

	it('pro_update: flight, drag, tails and the age timeout', () => {
		const typ = testItem();
		Ditem_drag.set(typ, 0.25);
		G.gt = 1000;
		pro_add_script(typ, 0, 100, 0, 0, 0, 0, 0, 2, 3, 0.25);
		const p = G.TCpro!;
		G.set_effects = 0;
		pro_update();
		expect(EntityZ(p.h)).toBeCloseTo(2, 4); // speed * f
		expect(EntityPitch(p.h)).toBeCloseTo(0.5, 3); // (drag + Ditem_drag) * f
		expect(particles()).toEqual([]);

		// model tail (tail 0): a fading copy of the model, slower fade at full effects
		G.set_effects = 1;
		G.in_gt20go = 1;
		pro_update();
		G.set_effects = 2;
		pro_update();
		expect(particles().map((t) => [t.typ, t.a, t.fx])).toEqual([
			[Cp_fadeout, f32(0.3), f32(0.025)],
			[Cp_fadeout, f32(0.3), f32(0.018)]
		]);
		expect(particles()[0].h).not.toBe(p.mh);
		// smoke tail
		p.tail = Cpro_smoke;
		pro_update();
		const smoke = particles()[2];
		expect([smoke.typ, smoke.r]).toEqual([Cp_smoke, f32(0.025)]);
		// adjustable super sparkle: Int(tset[0]) star flares
		p.tail = Cpro_asupersparkle;
		p.tset[0] = 3;
		pro_update();
		expect(particles().length).toBe(6);
		G.in_gt20go = 0;

		// the pitch stops at 88 degrees
		p.drag = 0.25;
		RotateEntity(p.h, 87.9, 0, 0);
		pro_update(); // 87.9 + 0.5 > 88
		expect(EntityPitch(p.h)).toBeCloseTo(88, 3);
		expect(EntityYaw(p.h)).toBeCloseTo(0, 3);

		// timeout: game_projectiletimeout (15 s) after it was created
		G.gt = 1000 + 15000;
		pro_update();
		expect(isNull(Tpro, p)).toBe(false);
		G.gt = 1000 + 15001;
		pro_update();
		expect(isNull(Tpro, p)).toBe(true);
		expect([p.h!.freed, p.mh!.freed]).toEqual([true, true]);
		expect(m.material_fx).not.toHaveBeenCalled();
	});

	it('pro_update: diving in and out of the water', () => {
		const typ = testItem();
		pro_add_script(typ, 0, 1, 0, 90, 0, 0, 0, 2, 1, 0); // straight down
		const p = G.TCpro!;
		p.tail = Cpro_fire;
		G.set_effects = 0;
		G.sfx_blubb = 31;
		G.sfx_fizzle = 32;
		pro_update();
		expect(EntityY(p.h)).toBeCloseTo(-1, 3);
		expect([p.water, p.wc, p.tail]).toEqual([1, 0, Cpro_smoke]);
		expect(m.sfx_emit.mock.calls.map((c) => c[0])).toEqual([31, 32]);
		expect(particles().length).toBe(3); // round wave, splash, the fizzle smoke
		pro_update();
		expect(p.wc).toBe(1); // "had water contact" is set one frame later
	});

	it('pro_update: hitting the ground runs the impact events, the material effect and frees the projectile', () => {
		const typ = testItem();
		Ditem_damage.set(typ, '2.5');
		Ditem_scriptk.set(typ, SEP_LINE + 'impact');
		Ditem_wstate.set(typ, Cstate_fire);
		pro_add_script(typ, 3, 10, 4, 0, 0, 0, 0, 0, 3, 0);
		const p = G.TCpro!;
		G.ter_groundy = 50; // the ground is above it
		G.set_effects = 0;
		pro_update();
		expect(G.pv_attack_damage).toBe(7.5); // Tpro\damage * Float(Ditem_damage$(typ))
		expect([G.pv_attack_weapon, G.pv_attack_ammo]).toEqual([0, typ]);
		expect([G.pv_impact_class, G.pv_impact_id, G.pv_impact_kill, G.pv_impact_num, G.pv_impact_amount, G.pv_impact_ground]).toEqual([0, 0, 0, 1, 1, 1]);
		expect([G.pv_impact_x, G.pv_impact_y, G.pv_impact_z]).toEqual([3, 10, 4]);
		expect([G.in_px, G.in_py, G.in_pz]).toEqual([3, 10, 4]);
		// weapon 0 is not in the player's inventory: cache -2, and so is the ammunition
		expect(m.set_parsecache.mock.calls).toEqual([
			[-2, 0, 'impact'],
			[-2, 0, 'impact']
		]);
		expect(m.parse_task.mock.calls).toEqual([[-2, 0, 'impact', '', Ditem_script(typ)]]);
		expect(m.material_fx).toHaveBeenCalledWith(3, 10, 4, Ditem_mat(typ));
		expect(m.state_depleted).toHaveBeenCalledWith(Cstate_fire, 0);
		expect(m.state_impactfx.mock.calls.map((c) => c[0])).toEqual([Cstate_fire]);
		expect(m.game_damage).not.toHaveBeenCalled();
		expect(isNull(Tpro, p)).toBe(true);
		expect(p.h!.freed).toBe(true);

		// a depleted state has no impact effect
		m.state_impactfx.mockClear();
		m.state_depleted.mockImplementation(() => 1);
		pro_add_script(typ, 3, 10, 4, 0, 0, 0, 0, 0, 3, 0);
		pro_update();
		expect(m.state_impactfx).not.toHaveBeenCalled();
	});

	it('pro_update: impact with the weapon in the inventory runs the event on that item', () => {
		const typ = testItem();
		const wpn = testItem(1);
		Ditem_damage.set(typ, '2');
		Ditem_damage.set(wpn, '4');
		Ditem_scriptk.set(wpn, SEP_LINE + 'impact');
		G.g_player = 1;
		const stored = inventory(wpn, Cclass_unit, 1);
		pro_add_script(typ, 0, 10, 0, 0, 0, 0, wpn, 1, 1, 0);
		G.ter_groundy = 50;
		pro_update();
		expect(G.pv_attack_damage).toBe(8); // weapon damage * ammunition damage
		expect(m.set_parsecache.mock.calls).toEqual([
			[Cclass_item, stored.id, 'impact'],
			[-2, 0, 'impact']
		]);
		expect(m.parse_task.mock.calls).toEqual([[Cclass_item, stored.id, 'impact', '', Ditem_script(wpn)]]);

		// weapon = ammunition (thrown weapons): its own damage, one event
		m.set_parsecache.mockClear();
		pro_add_script(wpn, 0, 10, 0, 0, 0, 0, wpn, 1, 1, 0);
		pro_update();
		expect(G.pv_attack_damage).toBe(4);
		expect(m.set_parsecache.mock.calls.length).toBe(1);
	});

	it('pro_update: behaviours rocket, toxicrocket and throw', () => {
		const typ = testItem();
		Ditem_damage.set(typ, '5');
		G.ter_groundy = 50;
		G.set_effects = 0;

		Ditem_behaviour.set(typ, 'rocket');
		pro_add_script(typ, 1, 2, 3, 0, 0, 0, 0, 0, 2, 0);
		pro_update();
		expect(m.game_explosion.mock.calls).toEqual([[1, 2, 3, 100, 10, 1]]);

		m.game_explosion.mockClear();
		const near = New(Tunit);
		near.id = 8;
		near.h = CreatePivot();
		PositionEntity(near.h, 1, 2, 90);
		const far = New(Tunit);
		far.id = 9;
		far.h = CreatePivot();
		PositionEntity(far.h, 1, 2, 110);
		Ditem_behaviour.set(typ, 'toxicrocket');
		pro_add_script(typ, 1, 2, 3, 0, 0, 0, 0, 0, 2, 0);
		pro_update();
		expect(m.game_explosion.mock.calls).toEqual([[1, 2, 3, 100, 10, 0]]); // style 0: no explosion effect of its own
		expect(m.set_state.mock.calls).toEqual([[Cstate_intoxication, Cclass_unit, 8]]);
		expect(m.sfx_3d).toHaveBeenCalledOnce();
		const types = particles().map((t) => t.typ);
		expect(types.slice(0, 3)).toEqual([Cp_explode, Cp_explode, Cp_explode]);
		const sparks = types.filter((t) => t === Cp_spark).length;
		expect(sparks).toBeGreaterThanOrEqual(1);
		expect(sparks).toBeLessThanOrEqual(6);
		expect(types[types.length - 1]).toBe(Cp_smoke);

		Ditem_behaviour.set(typ, 'throw');
		G.TCitem = null;
		pro_add_script(typ, 1, 2, 3, 0, 0, 0, 0, 0, 2, 0);
		pro_update();
		expect(m.set_item.mock.calls).toEqual([[-1, typ, 1, 2, 3, 1]]);
		G.p_skipevent = 1; // a script skipped the event: the thrown item is lost
		pro_add_script(typ, 1, 2, 3, 0, 0, 0, 0, 0, 2, 0);
		pro_update();
		expect(m.set_item).toHaveBeenCalledOnce();
		expect(Tpro.list.count).toBe(0);
	});

	it('pro_update: a collision damages what was hit; rockets do no impact damage of their own', () => {
		const typ = testItem();
		Ditem_damage.set(typ, '5');
		Ditem_wstate.set(typ, Cstate_fire);
		const target = CreatePivot();
		PositionEntity(target, 0, 100, 10);
		EntityRadius(target, 5);
		EntityType(target, 77);
		Collisions(Cworld_procol, 77, 1, 1);
		G.set_effects = 0;
		G.set_debug = 0;
		const seen: number[] = [];
		m.game_damage.mockImplementation((_h, dmg) => {
			seen.push(dmg);
			G.tmp_class = Cclass_unit;
			G.tmp_id = 42;
			G.tmp_kill = 1;
			return 1;
		});

		pro_add_script(typ, 0, 100, 0, 0, 0, 0, 0, 6, 2, 0);
		const p = G.TCpro!;
		pro_update();
		UpdateWorld();
		pro_update();
		expect(isNull(Tpro, p)).toBe(true);
		expect(m.game_damage.mock.calls.map((c) => [c[0], c[2], c[3], c[4]])).toEqual([[target, 0, 1, 1]]);
		expect(seen).toEqual([10]);
		expect(m.attach_state.mock.calls).toEqual([[target, Cstate_fire]]);
		expect([G.pv_impact_class, G.pv_impact_id, G.pv_impact_kill, G.pv_impact_num, G.pv_impact_amount, G.pv_impact_ground]).toEqual([Cclass_unit, 42, 1, 1, 1, 0]);

		seen.length = 0;
		Ditem_behaviour.set(typ, 'rocket');
		pro_add_script(typ, 0, 100, 0, 0, 0, 0, 0, 6, 2, 0);
		pro_update();
		UpdateWorld();
		pro_update();
		expect(seen).toEqual([0]); // the damage comes from the explosion,
		expect(m.game_explosion.mock.calls[0].slice(3)).toEqual([100, 10, 1]); // which gets the restored value
	});
});

describe.skipIf(!existsSync(MOD))('combat: game_weapons.bb', () => {
	let m: ReturnType<typeof mockWorld>;
	let u: Tunit;
	beforeEach(async () => {
		await setupCombat();
		m = mockWorld();
		u = player();
		G.ter_groundy = -1000;
		G.game_exh_attack = [0.5, 0.25, 0.125];
	});
	afterEach(teardownCombat);

	it('game_wpn_none: bare hands, at most every 400 ms, with the range and damage of unit 1', () => {
		expect(game_wpn_none(2)).toBe(0); // no such unit
		const target = pickTarget(Math.min(20, Dunit_attackrange(1) - 2));
		G.gt = 1000;
		expect(game_wpn_none(1)).toBe(1);
		expect(m.parse_globalevent).toHaveBeenCalledWith('usehand');
		expect(m.parse_sel_event).toHaveBeenCalledWith('usehand');
		expect(u.player_lastattack).toBe(1000);
		expect(m.game_exhaust.mock.calls).toEqual([[0.5, 0.25, 0.125]]);
		expect(G.in_pe).toBe(target);
		expect(m.game_damage.mock.calls).toEqual([[target, Dunit_damage(1), 1, 1]]);
		expect([G.pv_attack_damage, G.pv_attack_weapon, G.pv_attack_ammo]).toEqual([Dunit_damage(1), 0, 0]);
		expect(particles().map((t) => t.typ)).toEqual([Cp_attack]); // game_damage said 0: no impact flash
		expect(m.find_object).not.toHaveBeenCalled(); // the target is no object

		G.gt = 1399;
		expect(game_wpn_none(1)).toBe(0);
		expect(m.game_exhaust).toHaveBeenCalledOnce();

		// the thing hit is an object: it is searched (find_object)
		const o = New(Tobject);
		o.id = 33;
		o.h = target;
		G.gt = 1400;
		expect(game_wpn_none(1)).toBe(1);
		expect(m.find_object.mock.calls).toEqual([[33]]);

		// a script skips the event: no attack, but still "okay"
		m.parse_globalevent.mockImplementation(() => {
			G.p_skipevent = 1;
		});
		G.gt = 5000;
		expect(game_wpn_none(1)).toBe(1);
		expect(u.player_lastattack).toBe(1400);
	});

	it('game_wpn_blade: rate and damage of the weapon; a hit sets the impact variables and runs on:impact', () => {
		const wpn = testItem();
		Ditem_rate.set(wpn, 800);
		Ditem_damage.set(wpn, '12.5');
		Ditem_wstate.set(wpn, Cstate_fire);
		Ditem_scriptk.set(wpn, SEP_LINE + 'impact');
		u.player_weapon = wpn;
		const stored = inventory(wpn, Cclass_unit, 1);
		const target = pickTarget(30);
		m.game_damage.mockImplementation(() => {
			G.tmp_class = Cclass_object;
			G.tmp_id = 12;
			G.tmp_kill = 0;
			return 1;
		});

		G.gt = 700;
		expect(game_wpn_blade(1)).toBe(0); // 700 - 0 < 800
		G.gt = 800;
		expect(game_wpn_blade(1, 10)).toBe(1); // out of reach (cube face at 25, pick radius 5)
		expect(G.in_pe).toBeNull();
		expect(m.game_damage).not.toHaveBeenCalled();
		expect(particles().map((t) => t.typ)).toEqual([Cp_attack]);

		G.gt = 1600;
		expect(game_wpn_blade(1)).toBe(1); // default range 50
		expect(m.attach_state.mock.calls).toEqual([[target, Cstate_fire, -1, 0]]);
		expect(m.game_damage.mock.calls).toEqual([[target, 12.5, 1, 1]]);
		expect([G.pv_attack_damage, G.pv_attack_weapon, G.pv_attack_ammo]).toEqual([12.5, wpn, 0]);
		expect([G.pv_impact_class, G.pv_impact_id, G.pv_impact_kill, G.pv_impact_num, G.pv_impact_amount, G.pv_impact_ground]).toEqual([Cclass_object, 12, 0, 1, 1, 0]);
		expect(G.pv_impact_z).toBeCloseTo(25, 3); // the near face of the cube
		const flash = particles()[2];
		expect([flash.typ, flash.h!.order]).toEqual([Cp_impact, -1]);
		expect(m.set_parsecache.mock.calls).toEqual([[Cclass_item, stored.id, 'impact']]);
		expect(m.parse_task.mock.calls).toEqual([[Cclass_item, stored.id, 'impact', '', Ditem_script(wpn)]]);

		// hitting the terrain entity is a ground impact
		G.ter = target;
		G.gt = 2400;
		game_wpn_blade(1);
		expect(G.pv_impact_ground).toBe(1);
		G.ter = null;
	});

	it('game_wpn_distance: uses up ammunition and shoots a projectile, or runs on:noammo', () => {
		const wpn = testItem();
		const ammo = testItem(1);
		Ditem_rate.set(wpn, 500);
		Ditem_scriptk.set(wpn, SEP_LINE + 'noammo');
		u.player_weapon = wpn;
		u.player_ammo = ammo;
		const stored = inventory(wpn, Cclass_unit, 1);

		G.gt = 499;
		expect(game_wpn_distance(1)).toBe(0);
		expect(m.parse_task).not.toHaveBeenCalled();
		G.gt = 500;
		expect(game_wpn_distance(1)).toBe(0);
		expect(m.parse_task.mock.calls).toEqual([[Cclass_item, stored.id, 'noammo', '', Ditem_script(wpn)]]);
		expect(u.player_lastattack).toBe(500); // the empty shot counts for the rate
		expect(Tpro.list.count).toBe(0);

		const a1 = inventory(ammo, Cclass_unit, 1, 5);
		inventory(ammo, Cclass_unit, 2, 5); // somebody else's
		G.gt = 1000;
		expect(game_wpn_distance(1)).toBe(1);
		expect(m.free_item.mock.calls).toEqual([[a1.id, 1]]);
		const p = G.TCpro!;
		expect([p.spawner, p.typ, p.weapon]).toEqual([1, ammo, wpn]);
		expect(p.speed).toBe(Ditem_speed(wpn)); // pro_ini
	});

	it('game_wpn_selfthrow: throws one of the weapon itself', () => {
		const wpn = testItem();
		Ditem_rate.set(wpn, 300);
		u.player_weapon = wpn;
		G.gt = 1000;
		expect(game_wpn_selfthrow(1)).toBe(0); // none left
		expect(u.player_lastattack).toBe(0);
		const it1 = inventory(wpn, Cclass_unit, 1, 3);
		expect(game_wpn_selfthrow(1)).toBe(1);
		expect(m.game_exhaust.mock.calls).toEqual([[0.5, 0.25, 0.125]]);
		expect(m.free_item.mock.calls).toEqual([[it1.id, 1]]);
		expect([G.TCpro!.typ, G.TCpro!.weapon, G.TCpro!.spawner]).toEqual([wpn, wpn, 1]);
		G.gt = 1299;
		expect(game_wpn_selfthrow(1)).toBe(0);
		expect(Tpro.list.count).toBe(1);
	});

	it('game_wpn_distancef: instant hit with weapon damage x ammunition damage', () => {
		const wpn = testItem();
		const ammo = testItem(1);
		Ditem_rate.set(wpn, 100);
		Ditem_damage.set(wpn, '3');
		Ditem_damage.set(ammo, '2.5');
		Ditem_speed.set(wpn, 500); // the range of the pick
		Ditem_wstate.set(ammo, Cstate_fire);
		Ditem_scriptk.set(wpn, SEP_LINE + 'impact' + SEP_LINE + 'noammo');
		u.player_weapon = wpn;
		u.player_ammo = ammo;
		const stored = inventory(wpn, Cclass_unit, 1);
		const target = pickTarget(200, Dunit_eyes(1));
		G.set_effects = 1;

		G.gt = 100;
		expect(game_wpn_distancef(1)).toBe(0); // no ammunition
		expect(m.parse_task.mock.calls).toEqual([[Cclass_item, stored.id, 'noammo', '', Ditem_script(wpn)]]);
		m.parse_task.mockClear();

		const a1 = inventory(ammo, Cclass_unit, 1, 5);
		m.game_damage.mockImplementation(() => {
			G.tmp_class = Cclass_unit;
			G.tmp_id = 3;
			G.tmp_kill = 1;
			return 1;
		});
		G.gt = 200;
		expect(game_wpn_distancef(1)).toBe(1);
		expect(m.free_item.mock.calls).toEqual([[a1.id, 1]]);
		expect(G.in_pe).toBe(target);
		expect([G.pv_attack_damage, G.pv_attack_weapon, G.pv_attack_ammo]).toEqual([7.5, wpn, ammo]);
		expect(m.attach_state.mock.calls).toEqual([[target, Cstate_fire]]);
		expect(m.game_damage.mock.calls).toEqual([[target, 7.5, 1, 1]]);
		expect([G.pv_impact_class, G.pv_impact_id, G.pv_impact_kill, G.pv_impact_ground]).toEqual([Cclass_unit, 3, 1, 0]);
		expect(G.pv_impact_z).toBeCloseTo(195, 2);
		// on:impact at the weapon and at the ammunition item (which has no such event)
		expect(m.set_parsecache.mock.calls).toEqual([
			[Cclass_item, stored.id, 'impact'],
			[Cclass_item, a1.id, 'impact']
		]);
		expect(m.parse_task.mock.calls).toEqual([[Cclass_item, stored.id, 'impact', '', Ditem_script(wpn)]]);
		expect(particles().map((t) => t.typ)).toEqual([Cp_smoke, Cp_smoke, Cp_smoke, Cp_smoke, Cp_smoke]); // muzzle smoke
		expect(m.meshline).not.toHaveBeenCalled(); // no water involved

		// quirk: "in_pe=e_ter" never matches, so the terrain is damaged like an object (no ground impact)
		G.ter = target;
		G.gt = 300;
		m.game_damage.mockClear();
		expect(game_wpn_distancef(1)).toBe(1);
		expect(m.game_damage).toHaveBeenCalledOnce();
		expect(G.pv_impact_ground).toBe(0);
		G.ter = null;
	});

	it('game_wpn_distancef under water: bubbles along the shot and a fading line', () => {
		const wpn = testItem();
		const ammo = testItem(1);
		Ditem_speed.set(wpn, 500);
		u.player_weapon = wpn;
		u.player_ammo = ammo;
		inventory(ammo, Cclass_unit, 1, 5);
		PositionEntity(u.h, 0, -100, 0);
		pickTarget(200, -100 + Dunit_eyes(1));
		G.set_effects = 0;
		G.gt = 1000;
		expect(game_wpn_distancef(1)).toBe(1);
		expect(m.meshline).toHaveBeenCalledOnce();
		const c = m.meshline.mock.calls[0];
		// from the muzzle (still under water at the end) to the hit point
		expect(c[0]).toBeCloseTo(0, 3);
		expect(c[1]).toBeCloseTo(-100 + Dunit_eyes(1), 3);
		expect(c[2]).toBeCloseTo(Dunit_colxr(1) + 5, 3);
		expect(c.slice(3)).toEqual([G.in_px, G.in_py, G.in_pz, f32(0.4)]);
		const line = particles()[particles().length - 1];
		expect([line.typ, line.a, line.fx]).toEqual([Cp_fadeout, f32(0.2), f32(0.011)]);
		expect(line.h).toBe(m.meshline.mock.results[0].value as Handle);
	});
});

describe.skipIf(!existsSync(MOD))('combat: game_build.bb', () => {
	let m: ReturnType<typeof mockWorld>;
	let u: Tunit;
	/** Building 2 "Shelter": objectid=165, req=24,20 and req=15,30, on land. */
	const SHELTER = 165;

	beforeEach(async () => {
		await setupCombat();
		m = mockWorld();
		u = player();
		G.ter_groundy = 5;
		G.gt = 10000;
	});
	afterEach(teardownCombat);

	function site(typ: number, x = 0, z = 20): Tobject {
		const o = New(Tobject);
		o.id = 60;
		o.typ = G.set_buildplaceid;
		o.h = CreatePivot();
		PositionEntity(o.h, x, 0, z);
		const s = New(Tstate);
		s.typ = Cstate_buildplace;
		s.parent_class = Cclass_object;
		s.parent_id = 60;
		s.value = typ;
		return o;
	}

	it('the building definitions the tests rely on', () => {
		const head = Tbui.list.toArray().find((b) => b.mode === 2 && b.typ === SHELTER)!;
		expect(head.id).toBe(2);
		expect(
			Tbui.list
				.toArray()
				.filter((b) => b.id === 2 && b.mode === 0)
				.map((b) => [b.typ, b.count])
		).toEqual([
			[24, 20],
			[15, 30]
		]);
	});

	it('game_build: rate limit, and the build menu when no building site is near', () => {
		const wpn = testItem();
		Ditem_rate.set(wpn, 500);
		u.player_weapon = wpn;
		u.player_lastattack = 9600;
		G.m_menu = 0;
		G.in_buildg = 'x';
		G.in_scr_scr = 3;
		expect(game_build()).toBe(0);
		expect(G.m_menu).toBe(0);
		u.player_lastattack = 9500;
		site(SHELTER, 0, 200); // too far away (75)
		expect(game_build()).toBe(0);
		expect(u.player_lastattack).toBe(10000);
		expect([G.m_menu, G.in_buildg, G.in_scr_scr]).toEqual([Cmenu_if_build, '', 0]);
	});

	it('game_build: moves one missing item from the player to the building site', () => {
		const o = site(SHELTER);
		inventory(24, Cclass_object, 60, 20); // first requirement complete
		const have = inventory(15, Cclass_unit, 1, 4); // the player has some of the second
		m.set_item.mockImplementation((_id, typ) => {
			G.TCitem = inventory(typ, 0, 0);
			return G.TCitem.id;
		});
		G.sfx_build = 77;
		expect(game_build()).toBe(1);
		expect(m.free_item.mock.calls).toEqual([[have.id, 1]]);
		expect(m.set_item.mock.calls).toEqual([[-1, 15]]);
		expect(m.store_item.mock.calls).toEqual([[G.TCitem!.id, Cclass_object, 60]]);
		expect(m.if_msg.mock.calls.length).toBe(1);
		expect(m.if_msg.mock.calls[0][1]).toBe(Cbmpf_green);
		expect(m.sfx_emit.mock.calls.map((c) => c[0])).toEqual([77]);
		const p = particles();
		expect(p.map((t) => [t.typ, t.x, t.y, t.a])).toEqual([[Cp2d_item, 400 - 20, 300 - 20, 15]]);
		expect([G.pc_typ, G.pc_gt, G.pc_child, G.in_focus]).toEqual([Cstate_pc_build, 10000, 60, Cstate_pc_build]);
		expect(isNull(Tobject, o)).toBe(false);
	});

	it('game_build: nothing to add and not complete: failure message, the process still starts', () => {
		site(SHELTER);
		G.sfx_fail = 5;
		expect(game_build()).toBe(0);
		expect(m.if_msg.mock.calls.map((c) => c[1])).toEqual([Cbmpf_red]);
		expect(m.sfx).toHaveBeenCalledWith(5);
		expect([G.pc_typ, G.pc_child, G.in_focus]).toEqual([Cstate_pc_build, 60, Cstate_pc_build]);
		expect(m.set_object).not.toHaveBeenCalled();
	});

	it('game_build: all requirements stored: the building replaces the site', () => {
		const o = site(SHELTER, 30, 40);
		RotateEntity(o.h, 0, 90, 0);
		PositionEntity(G.cam, 30, 10, 40);
		inventory(24, Cclass_object, 60, 20);
		inventory(15, Cclass_object, 60, 31);
		// something is linked to the building site
		const link = New(Tstate);
		link.typ = Cstate_link;
		link.parent_class = Cclass_object;
		link.parent_id = 13;
		link.value = 60;
		Dobject_scriptk.set(SHELTER, SEP_LINE + 'build_finish');
		const head = Tbui.list.toArray().find((b) => b.mode === 2 && b.typ === SHELTER)!;

		expect(game_build()).toBe(1);
		expect(m.set_object.mock.calls.length).toBe(1);
		const [id, typ, x, z, yaw] = m.set_object.mock.calls[0];
		expect([id, typ, x, z]).toEqual([-1, SHELTER, 30, 40]);
		expect(yaw).toBeCloseTo(90, 3);
		const built = G.TCobject!;
		// ghost state on the new building, a new link state pointing at it
		expect(m.set_state.mock.calls).toEqual([
			[Cstate_ghost, Cclass_object, built.id],
			[Cstate_link, Cclass_object, 13]
		]);
		expect(G.TCstate!.value).toBe(built.id);
		expect(m.free_object.mock.calls).toEqual([[60]]);
		expect(particles().length).toBe(15);
		expect(particles().every((t) => t.typ === Cp_smoke)).toBe(true);
		// y is an Int local: ground height 5 plus Rand(2,5)
		for (const t of particles()) expect([7, 8, 9, 10]).toContain(EntityY(t.h));
		expect(m.parse_task.mock.calls).toEqual([
			[Cclass_object, built.id, 'build', '(buildings.inf-script)', head.script],
			[Cclass_object, built.id, 'build_finish', '', Dobject_script(SHELTER)]
		]);
		expect(m.parse_sel_event).toHaveBeenCalledWith('build_finish');
		expect(m.free_state.mock.calls).toEqual([[Cstate_pc_build, Cclass_unit, 1]]);
		expect(m.if_msg.mock.calls.map((c) => c[1])).toEqual([Cbmpf_green]);
	});

	it('game_build: a unit building (negative type) is created with set_unit', () => {
		const unitHead = Tbui.list.toArray().find((b) => b.mode === 2 && b.typ < 0)!;
		expect(unitHead).toBeDefined();
		const o = site(unitHead.typ, 0, 20);
		RotateEntity(o.h, 0, 45, 0);
		for (const r of Tbui.list.toArray().filter((b) => b.id === unitHead.id && b.mode === 0)) inventory(r.typ, Cclass_object, 60, r.count);
		expect(game_build()).toBe(1);
		expect(m.set_unit.mock.calls).toEqual([[-1, -unitHead.typ, 0, 20]]);
		expect(EntityYaw(G.TCunit!.h)).toBeCloseTo(45, 3);
		expect(m.set_state).not.toHaveBeenCalled(); // no ghost state for units
	});

	it('game_buildplace: the buildspace decides where a site may be put', () => {
		G.set_buildplaceid = 901;
		G.set_buildplacewaterid = 902;
		G.sfx_fail = 5;
		// land (no buildspace record): not under water
		G.ter_groundy = -1;
		expect(game_buildplace(10, 20, 30, SHELTER)).toBe(0);
		expect(m.if_msg.mock.calls.map((c) => c[1])).toEqual([Cbmpf_red]);
		expect(m.sfx).toHaveBeenCalledWith(5);
		expect(m.speech).toHaveBeenCalledWith('negative');
		expect(m.set_object).not.toHaveBeenCalled();

		G.ter_groundy = 5;
		expect(game_buildplace(10, 20, 30, SHELTER)).toBe(1);
		expect(m.set_object.mock.calls).toEqual([[-1, 901, 10, 20]]);
		const placed = G.TCobject!;
		expect(EntityYaw(placed.h)).toBeCloseTo(30, 3);
		expect(G.pv_lastbuilding).toBe(placed.id);
		expect(m.set_state.mock.calls).toEqual([[Cstate_buildplace, Cclass_object, placed.id]]);
		expect(G.TCstate!.value).toBe(SHELTER); // the state caches the type of the building
		expect(particles().length).toBe(10);

		// water buildings: only where the ground is below 0, on the water site object
		const water = Tbui.list.toArray().find((b) => b.mode === 1 && b.typ === 2)!;
		const waterHead = Tbui.list.toArray().find((b) => b.mode === 2 && b.id === water.id)!;
		m.set_object.mockClear();
		expect(game_buildplace(0, 0, 0, waterHead.typ)).toBe(0);
		G.ter_groundy = -5;
		expect(game_buildplace(0, 0, 0, waterHead.typ)).toBe(1);
		expect(m.set_object.mock.calls).toEqual([[-1, 902, 0, 0]]);

		// a script skips on:build_start
		Dobject_scriptk.set(SHELTER, SEP_LINE + 'build_start');
		m.parse_task.mockImplementation(() => {
			G.p_skipevent = 1;
		});
		G.ter_groundy = 5;
		m.set_object.mockClear();
		expect(game_buildplace(10, 20, 30, SHELTER)).toBe(0);
		expect(m.parse_task).toHaveBeenLastCalledWith(0, 0, 'build_start', '', Dobject_script(SHELTER));
		expect(m.set_object).not.toHaveBeenCalled();
	});

	it('game_buildplace "at object": needs a grown object of an allowed type at exactly that place, and links to it', () => {
		const space = Tbui.list.toArray().find((b) => b.mode === 1 && b.typ === 6)!;
		const head = Tbui.list.toArray().find((b) => b.mode === 2 && b.id === space.id)!;
		const allowed = Tbui.list.toArray().find((b) => b.mode === 3 && b.id === space.id)!;
		G.set_buildplaceid = 901;
		expect(game_buildplace(10, 20, 0, head.typ)).toBe(0); // nothing there

		const tree = New(Tobject);
		tree.id = 44;
		tree.typ = allowed.typ;
		tree.h = CreatePivot();
		PositionEntity(tree.h, 10, 0, 20);
		tree.daytimer = -1; // still growing
		expect(game_buildplace(10, 20, 0, head.typ)).toBe(0);
		tree.daytimer = 0;
		expect(game_buildplace(10, 20, 0, head.typ)).toBe(1);
		const placed = G.TCobject!;
		expect(m.set_state.mock.calls).toEqual([
			[Cstate_buildplace, Cclass_object, placed.id],
			[Cstate_link, Cclass_object, 44]
		]);
		expect(G.TCstate!.value).toBe(placed.id); // the link state on the tree points at the site
	});

	it('game_buildsetup_start / _update / _end', async () => {
		await RT.world.preload([Dobject_model(SHELTER)]);
		G.in_mdown = [0, 0, 0, 0, 0, 0];
		G.in_mrelease = [0, 0, 0, 0, 0, 0];
		G.in_mhit = [0, 0, 0, 0, 0, 0];
		PositionEntity(G.cam, 50, 30, 60);

		game_buildsetup_start(SHELTER);
		const dummy = G.in_buildsetup_dummy!;
		expect(dummy).not.toBeNull();
		expect([G.in_buildcamh, G.in_buildsetup_typ, G.m_menu, G.in_buildsetup_space, G.in_buildsetup_id, G.in_buildsetup_watersurface]).toEqual([100, SHELTER, Cmenu_if_buildsetup, 0, 2, 0]);
		expect([EntityX(dummy), EntityY(dummy), EntityZ(dummy)]).toEqual([50, 5, 60]); // under the camera, on the ground
		expect(m.game_picking.mock.calls).toEqual([[0]]);

		// the upper 50 pixels belong to the interface
		G.in_my = 50;
		G.in_mhit[2] = 1;
		game_buildsetup_update();
		expect(dummy.freed).toBe(false);

		// mouse wheel turns the dummy by 10 degrees per step
		G.in_my = 300;
		G.in_mx = 400;
		G.in_mhit[2] = 0;
		G.in_mzs = 2;
		game_buildsetup_update();
		expect(EntityYaw(dummy)).toBeCloseTo(-20, 3);
		G.in_mzs = 0;

		// release: the site is placed where the dummy stands, then the setup ends
		G.in_mrelease[1] = 1;
		game_buildsetup_update();
		expect(m.set_object.mock.calls.length).toBe(1);
		expect(m.set_object.mock.calls[0].slice(0, 2)).toEqual([-1, G.set_buildplaceid]);
		expect(m.speech).toHaveBeenCalledWith('buildingsite');
		expect(dummy.freed).toBe(true);
		expect([G.in_buildsetup_typ, G.m_menu]).toEqual([0, 0]);
		expect(m.game_picking).toHaveBeenLastCalledWith(1);

		// changeh sets the camera height; right click cancels
		G.in_mrelease[1] = 0;
		game_buildsetup_start(SHELTER, 250);
		expect(G.in_buildcamh).toBe(250);
		const d2 = G.in_buildsetup_dummy!;
		G.in_mhit[2] = 1;
		game_buildsetup_update();
		expect(d2.freed).toBe(true);
		expect(m.set_object.mock.calls.length).toBe(1);

		// on:build_setup can skip the whole thing
		Dobject_scriptk.set(SHELTER, SEP_LINE + 'build_setup');
		m.parse_task.mockImplementation(() => {
			G.p_skipevent = 1;
		});
		G.m_menu = 0;
		game_buildsetup_start(SHELTER);
		expect(G.m_menu).toBe(0);
		expect(G.in_buildsetup_dummy).toBe(d2);
		void game_buildsetup_end;
	});

	it('game_buildsetup_update: a colliding object in view blocks the place', async () => {
		await RT.world.preload([Dobject_model(SHELTER)]);
		G.in_mdown = [0, 0, 0, 0, 0, 0];
		G.in_mrelease = [0, 1, 0, 0, 0, 0];
		G.in_mhit = [0, 0, 0, 0, 0, 0];
		G.sfx_fail = 5;
		PositionEntity(G.cam, 0, 30, -80);
		game_buildsetup_start(SHELTER);
		const dummy = G.in_buildsetup_dummy!;
		PositionEntity(dummy, 0, 5, 0);
		const o = New(Tobject);
		o.id = 9;
		o.typ = [...DEFS.objects.byId.values()].find((d) => d.col !== 0)!.id;
		o.h = CreateCube();
		ScaleEntity(o.h, 50, 50, 50);
		PositionEntity(o.h, 0, 5, 0);
		G.in_my = 300;
		game_buildsetup_update();
		expect(m.set_object).not.toHaveBeenCalled();
		expect(m.sfx).toHaveBeenCalledWith(5);
		expect(m.speech).toHaveBeenCalledWith('negative');
		expect(m.if_msg.mock.calls.map((c) => c[1])).toEqual([Cbmpf_red]);
		expect(dummy.freed).toBe(true);
	});

	it('game_buildfocus: position of the focus text, bar and missing items', () => {
		site(SHELTER);
		inventory(24, Cclass_object, 60, 20);
		inventory(15, Cclass_object, 60, 12);
		game_buildfocus(60);
		expect(m.con_object).toHaveBeenCalledWith(60);
		expect([G.in_fo_x, G.in_fo_y]).toEqual([400, 35]);
		// without the state nothing happens
		G.in_fo_x = 0;
		game_buildfocus(61);
		expect(G.in_fo_x).toBe(0);
	});
});
