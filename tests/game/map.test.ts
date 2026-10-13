/**
 * Package "map": e_clear, e_load_map, e_save_map, cull, collisions, physics,
 * randommap and the rest of e_environment, functions and load_materials.
 *
 * Expected values are derived from the original source (the .bb line is cited
 * where it is not obvious). Functions of other packages are replaced by small
 * stand-ins or recording spies.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AddAnimSeq,
	CountCollisions,
	CreateCube,
	CreatePivot,
	CreateTerrain,
	CreateTexture,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	ModifyTerrain,
	MoveEntity,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	TerrainHeight,
	TerrainSize,
	TerrainState,
	TerrainY,
	TextureBuffer,
	TextureHeight,
	UpdateWorld,
	type BBEntity,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Cos, Int, Rand, Rnd, SEP_FIELD, SEP_LINE, SeedRnd, Sin, Str, code, f32, setClock } from '../../src/lib/s2/blitz';
import { parseMap } from '../../src/lib/s2/formats/map';
import { BackBuffer, Cls, CreateImage, FrontBuffer, ImageHeight, ImageWidth, ReadPixelFast, SetBuffer, WritePixelFast } from '../../src/lib/s2/gfx2d';
import { injectKeyDown } from '../../src/lib/s2/input';
import { TerrainHeight_exe, grass_rgb_get, grass_rgb_set, resetMapBridge, splitLimit } from '../../src/lib/s2/game/_additions/map';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import { col_bottom, col_jump, col_player, col_set, include_collisions } from '../../src/lib/s2/game/collisions';
import * as console_ from '../../src/lib/s2/game/console';
import {
	Cbmpf_red,
	Cbmpf_yellow,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmat_dirt,
	Cmat_flesh,
	Cmat_stone,
	Cmat_water,
	Cmat_wood,
	Cmenu_if_movie,
	Cp_smoke,
	Cp_spark,
	Cp_wood,
	Csection_editor,
	Csection_game_sp,
	Cstate_phy
} from '../../src/lib/s2/game/consts';
import { cull, cull_items } from '../../src/lib/s2/game/cull';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import {
	Ditem_afc,
	Ditem_mat,
	Dobject_active,
	Dobject_afc,
	Dobject_col,
	Dobject_script,
	Dobject_scriptk,
	Dobject_scripto,
	Dobject_swaypower,
	Dobject_swayspeed,
	Dunit_afc,
	Dunit_colyr,
	Dunit_speed
} from '../../src/lib/s2/game/defs_arrays';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { e_clear } from '../../src/lib/s2/game/e_clear';
import { e_gc, e_teralign, e_terrain, e_terrainground, e_tery } from '../../src/lib/s2/game/e_environment';
import { load_map, load_map_extensions, load_map_header, load_map_id, load_maps, load_recent, load_savegames } from '../../src/lib/s2/game/e_load_map';
import { save_map, save_map_extensions } from '../../src/lib/s2/game/e_save_map';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { CloseFile, CreateDir, FileType, WriteFile, WriteLine, readFileBytes, readFileLines, writeFileBytes } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import {
	brightness,
	cachedata,
	darkbuffer,
	drawaxes,
	genmap,
	groundpitch,
	incam,
	indailytime,
	intime,
	meshline,
	pheight,
	screenshot,
	split,
	viewline
} from '../../src/lib/s2/game/functions';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as game_input_vehicles from '../../src/lib/s2/game/game_input_vehicles';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import { material_fx, material_stepsfx } from '../../src/lib/s2/game/load_materials';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as particles from '../../src/lib/s2/game/particles';
import { preparse_string } from '../../src/lib/s2/game/parser_pre';
import { phy_set } from '../../src/lib/s2/game/physics';
import { include_randommap, load_randommap, randomcreate, randommap, randommapcreate } from '../../src/lib/s2/game/randommap';
import { GrassCore } from '../../src/lib/s2/engine/environment/grass';
import type { Terrain } from '../../src/lib/s2/engine/terrain';
import { RT, installRuntime, type Runtime } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import {
	CONST_STORE,
	DeleteEach,
	HandleOf,
	New,
	T3d,
	TYPES,
	Tat,
	Tbmpf_img,
	Tcopy,
	Tcscr,
	Tfrap,
	Tin_quicksave,
	Tinfo,
	Titem,
	Tmsg,
	Tobject,
	Tp,
	Tpro,
	Tpt,
	Tran,
	Trecent,
	Tseq,
	Tsg,
	Tstate,
	Ttimer,
	Tunit,
	Tup,
	Tx,
	Txc
} from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const visible = (h: Handle): boolean => (h as BBEntity).obj.visible;
const freed = (h: Handle): boolean => (h as BBEntity).freed;

/** Console lines of con_add (console.bb, package menu). */
let con: { txt: string; col: number }[] = [];
/** Calls into other packages, in order. */
let calls: string[] = [];

/** Stand-ins for the entity functions of the packages entities1 / entities2 / ai / player. */
function mockEntities(): void {
	vi.spyOn(console_, 'con_add').mockImplementation((txt = '', col = -1) => {
		con.push({ txt, col });
	});
	vi.spyOn(handle_objects, 'set_object').mockImplementation((id, typ, x, z, yaw = 0) => {
		const o = New(Tobject);
		o.id = id === -1 ? ++G.object_serial : id;
		o.typ = typ;
		o.h = CreatePivot();
		PositionEntity(o.h, x, e_tery(x, z), z);
		RotateEntity(o.h, 0, yaw, 0);
		G.TCobject = o;
		calls.push(`set_object ${typ}`);
		return o.id;
	});
	vi.spyOn(handle_objects, 'grow_object').mockImplementation(() => {});
	vi.spyOn(handle_objects, 'serialpeak_object').mockImplementation(() => {
		calls.push('serialpeak_object');
	});
	vi.spyOn(handle_objects, 'con_object').mockImplementation((id) => {
		for (const o of Tobject.list) if (o.id === id) return ((G.TCobject = o), 1);
		return 0;
	});
	vi.spyOn(handle_objects, 'update_object_behaviour').mockImplementation(() => {
		calls.push(`update_object_behaviour ${G.TCobject!.id}`);
	});
	vi.spyOn(handle_units, 'set_unit').mockImplementation((id, typ, x, z) => {
		const u = New(Tunit);
		u.id = id === -1 ? ++G.unit_serial : id;
		u.typ = typ;
		u.h = CreatePivot();
		PositionEntity(u.h, x, e_tery(x, z), z);
		G.TCunit = u;
		calls.push(`set_unit ${typ}`);
		return u.id;
	});
	vi.spyOn(handle_units, 'serialpeak_unit').mockImplementation(() => {
		calls.push('serialpeak_unit');
	});
	vi.spyOn(handle_units, 'con_unit').mockImplementation((id) => {
		for (const u of Tunit.list) if (u.id === id) return ((G.TCunit = u), 1);
		return 0;
	});
	vi.spyOn(ai_units, 'ai_ini').mockImplementation(() => {
		calls.push(`ai_ini ${G.TCunit!.id}`);
	});
	vi.spyOn(ai_units, 'update_unit').mockImplementation(() => {
		calls.push(`update_unit ${G.TCunit!.id}`);
	});
	vi.spyOn(handle_items, 'set_item').mockImplementation((id, typ, x = 0, y = 0, z = 0, count = 1) => {
		const it = New(Titem);
		it.id = id === -1 ? ++G.item_serial : id;
		it.typ = typ;
		it.count = count;
		it.h = CreatePivot();
		PositionEntity(it.h, x, y, z);
		G.TCitem = it;
		calls.push(`set_item ${typ} x${count}`);
		return it.id;
	});
	vi.spyOn(handle_items, 'serialpeak_item').mockImplementation(() => {
		calls.push('serialpeak_item');
	});
	vi.spyOn(handle_items, 'con_item').mockImplementation((id) => {
		for (const it of Titem.list) if (it.id === id) return ((G.TCitem = it), 1);
		return 0;
	});
	vi.spyOn(handle_items, 'store_item').mockImplementation((id, parentclass, parentid) => {
		calls.push(`store_item ${id} ${parentclass} ${parentid}`);
		return 1;
	});
	vi.spyOn(handle_infos, 'set_info').mockImplementation((id, typ, x, y, z) => {
		const inf = New(Tinfo);
		inf.id = id === -1 ? ++G.info_serial : id;
		inf.typ = typ;
		inf.h = CreatePivot();
		PositionEntity(inf.h, x, y, z);
		G.TCinfo = inf;
		return inf.id;
	});
	vi.spyOn(handle_infos, 'info_stv').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'info_setupsprite').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'info_setuploudspeaker').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'serialpeak_info').mockImplementation(() => {
		calls.push('serialpeak_info');
	});
	vi.spyOn(handle_infos, 'update_info').mockImplementation(() => {
		calls.push(`update_info ${G.TCinfo!.id}`);
	});
	vi.spyOn(handle_states, 'set_state').mockImplementation((typ, parent_class, parent_id) => {
		const st = New(Tstate);
		st.typ = typ;
		st.parent_class = parent_class;
		st.parent_id = parent_id;
		G.TCstate = st;
		return 1;
	});
	vi.spyOn(handle_states, 'get_state').mockImplementation((typ, parent_class, parent_id) => {
		for (const st of Tstate.list) if (st.typ === typ && st.parent_class === parent_class && st.parent_id === parent_id) return ((G.TCstate = st), 1);
		return 0;
	});
	vi.spyOn(handle_states, 'look_state').mockImplementation(() => {
		calls.push('look_state');
	});
	vi.spyOn(game_functions, 'game_setcam').mockImplementation(() => {
		calls.push(`game_setcam m_menu=${G.m_menu}`);
		return 0;
	});
	vi.spyOn(game_functions, 'game_playerspawn').mockImplementation((id = -1) => {
		const u = New(Tunit);
		u.id = id;
		u.typ = 1;
		u.h = CreatePivot();
		calls.push(`game_playerspawn ${id}`);
		return id;
	});
	vi.spyOn(game_functions, 'game_setplayer').mockImplementation((id) => {
		for (const u of Tunit.list) if (u.id === id) G.g_cplayer = u;
		calls.push(`game_setplayer ${id}`);
	});
	vi.spyOn(game_input_vehicles, 'game_input_vehicledata').mockImplementation((typ) => {
		calls.push(`game_input_vehicledata ${typ}`);
	});
	vi.spyOn(interface_, 'if_msg').mockImplementation((msg, col = 0) => {
		calls.push(`if_msg ${msg} ${col}`);
	});
	vi.spyOn(particles, 'p_add').mockImplementation((x, y, z, typ, size = 1, a = 1) => {
		const p = New(Tp);
		p.typ = typ;
		p.h = CreatePivot();
		G.TCp = p;
		calls.push(`p_add ${typ} ${size} ${a}`);
	});
}

/** Records the script events instead of running scripts. */
function recordEvents(): void {
	vi.spyOn(RT.script, 'parse_globalevent').mockImplementation((event) => {
		calls.push(`globalevent ${event}`);
	});
	vi.spyOn(RT.script, 'parse_sel_event').mockImplementation((event) => {
		calls.push(`sel_event ${event}`);
	});
	vi.spyOn(RT.script, 'parse_all').mockImplementation(() => {
		calls.push('parse_all');
	});
	vi.spyOn(RT.script, 'timer_update').mockImplementation(() => {
		calls.push('timer_update');
	});
	vi.spyOn(RT.script, 'defvar_ini').mockImplementation(() => {
		calls.push('defvar_ini');
	});
	vi.spyOn(RT.script, 'defvar_oncreate').mockImplementation((cls, id, typ) => {
		calls.push(`defvar_oncreate ${cls} ${id} ${typ}`);
	});
}

/** A flat bb3d terrain of `size` cells at height `h` (0..1) as e_terrain positions it, without the layer. */
function flatTerrain(size: number, h: number): void {
	SeedRnd(1);
	e_terrain(size, 'no such file');
	for (let x = 0; x <= size; x++) for (let z = 0; z <= size; z++) ModifyTerrain(G.ter, x, z, h);
}

describe.skipIf(!existsSync(MOD))('package map', () => {
	let now = 0;

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		con = [];
		calls = [];
		mockEntities();
		PositionEntity(G.cam, 0, 0, 0);
		RotateEntity(G.cam, 0, 0, 0);
	});

	afterEach(() => {
		vi.useRealTimers();
		disposeRuntime();
		resetGameState();
		resetDefs();
		resetMapBridge();
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

	// =================================================================================
	describe('functions.bb', () => {
		it('intime: the check time lies between the last update and now (inclusive)', () => {
			G.map_lday = 2;
			G.map_lhour = 10;
			G.map_lminute = 30;
			G.map_day = 3;
			G.map_hour = 8;
			G.map_minute = 0;
			expect(intime(2, 10, 30)).toBe(1); // = lastupdate
			expect(intime(3, 8, 0)).toBe(1); // = current
			expect(intime(2, 10, 29)).toBe(0);
			expect(intime(3, 8, 1)).toBe(0);
			expect(intime(3)).toBe(1); // 3 00:00
			expect(intime(2)).toBe(0); // 2 00:00 is before the last update
		});

		it('indailytime: today, or the day of the last update when that was an earlier day', () => {
			G.map_lday = 2;
			G.map_lhour = 22;
			G.map_lminute = 0;
			G.map_day = 3;
			G.map_hour = 6;
			G.map_minute = 0;
			expect(indailytime(5)).toBe(1); // today 05:00
			expect(indailytime(6)).toBe(1);
			expect(indailytime(7)).toBe(0); // today 07:00 is later, yesterday 07:00 before the last update
			expect(indailytime(23, 30)).toBe(1); // yesterday 23:30 (second check with map_lday)
			expect(indailytime(21)).toBe(0);
			G.map_lday = 3;
			G.map_lhour = 5;
			expect(indailytime(23, 30)).toBe(0); // same day: no second check
		});

		it('incam: strictly closer than 500*set_viewfac to the camera, on the XZ plane', () => {
			G.set_viewfac = 1;
			PositionEntity(G.cam, 10, 999, 0);
			expect(incam(509, 0)).toBe(1);
			expect(incam(510, 0)).toBe(0); // "<", not "<="
			expect(incam(310, 400)).toBe(0); // 3-4-5 triangle: exactly 500
			G.set_viewfac = 2;
			expect(incam(310, 400)).toBe(1);
		});

		it('pheight: e_tery at the picked position', () => {
			G.ter_groundy = f32(7.5);
			G.in_px = 3;
			G.in_pz = 4;
			expect(pheight()).toBe(7.5); // no terrain: e_tery gives ter_groundy
			flatTerrain(16, 1);
			expect(pheight()).toBe(1600); // 1*Cworld_height - Cworld_height/2
		});

		it('meshline: a cube between the points; the three pivots are freed', () => {
			const before = RT.world.entities?.size;
			const h = meshline(0, 0, 0, 0, 0, 10);
			expect(h).not.toBeNull();
			expect([EntityX(h), EntityY(h), EntityZ(h)]).toEqual([0, 0, 5]);
			if (before !== undefined) expect(RT.world.entities.size).toBe(before + 1);
		});

		it('drawaxes: three coloured lines from the projected position of the entity', () => {
			const e = CreatePivot();
			PositionEntity(e, 0, 0, 100);
			SetBuffer(BackBuffer());
			drawaxes(e, 20);
			const cx = G.set_scrx >> 1;
			const cy = G.set_scry >> 1;
			const at = (x: number, y: number) => ReadPixelFast(x, y, BackBuffer()) & 0xffffff;
			expect(at(cx + 10, cy)).toBe(0xff0000); // red: the X axis, to the right
			expect(at(cx, cy - 10)).toBe(0x00ff00); // green: the Y axis, upwards (drawn last, so it owns the centre column)
			expect(at(cx + 10, cy - 10)).toBe(0);
			// turned by 90 degrees the Z axis (blue) points to the right
			Cls();
			RotateEntity(e, 0, -90, 0);
			drawaxes(e);
			expect(at(cx + 10, cy)).toBe(0x0000ff);
		});

		it('viewline: 1 when nothing pickable is between the points', () => {
			expect(viewline(0, 0, 0, 0, 0, 100)).toBe(1);
		});

		it('groundpitch: quirk - pivot 1 keeps the height of the entity', () => {
			G.ter_groundy = 0;
			const e = CreatePivot();
			PositionEntity(e, 0, 10, 0);
			// p1 = (0,10,100) (the first e_tery positions p2, not p1), p2 = (0,0,-100): looking up by atan(10/200)
			expect(groundpitch(e, 100)).toBeCloseTo((-Math.atan2(10, 200) * 180) / Math.PI, 4);
			// with the entity on the ground both pivots are level
			PositionEntity(e, 0, 0, 0);
			expect(groundpitch(e)).toBeCloseTo(0, 5);
		});

		it('darkbuffer: (r+40)/2.5, (g+20)/2.5, b/2.5 on the front buffer', () => {
			WritePixelFast(10, 10, 0xff000000 | (100 << 16) | (50 << 8) | 25, FrontBuffer());
			WritePixelFast(11, 10, 0xff000000 | (3 << 16) | (4 << 8) | 4, FrontBuffer());
			darkbuffer();
			expect(ReadPixelFast(10, 10, FrontBuffer()) & 0xffffff).toBe((56 << 16) | (28 << 8) | 10);
			// (3+40)/2.5=17.2 -> 17, (4+20)/2.5=9.6 -> 10, 4/2.5=1.6 -> 2 (Int rounds to nearest)
			expect(ReadPixelFast(11, 10, FrontBuffer()) & 0xffffff).toBe((17 << 16) | (10 << 8) | 2);
		});

		it('genmap: height colours, mirrored in x, darker grid lines', () => {
			flatTerrain(16, 0.8); // byte 204 -> TerrainY 960 -> h#=0.3
			SeedRnd(7);
			genmap(64);
			expect(ImageWidth(G.map_mapimage)).toBe(64);
			expect(ImageHeight(G.map_mapimage)).toBe(64);
			// 118+137*0.3=159.1, 105+41.1=146.1, 52+41.1=93.1; pixel (x,y) is written at (size-(x+1), y)
			const px = (x: number, y: number) => ReadPixelFast(64 - (x + 1), y, G.map_mapimage ? G.map_mapimage.frames[0] : undefined) >>> 0;
			expect(px(1, 1)).toBe((0xff000000 | (159 << 16) | (146 << 8) | 93) >>> 0);
			expect(px(33, 47)).toBe((0xff000000 | (159 << 16) | (146 << 8) | 93) >>> 0);
			// x Mod 64=0: each channel divided by its own Rnd(1.1,1.2), drawn in the order r,g,b; (0,0) is the first pixel
			SeedRnd(7);
			const r = Int(f32(159 / Rnd(1.1, 1.2)));
			const g = Int(f32(146 / Rnd(1.1, 1.2)));
			const b = Int(f32(93 / Rnd(1.1, 1.2)));
			expect(px(0, 0)).toBe((0xff000000 | (r << 16) | (g << 8) | b) >>> 0);
			// x Mod 16=0 (and not 64): Rnd(1.02,1.05): darker than plain, lighter than the 64 lines
			const p16 = px(16, 5);
			expect((p16 >> 16) & 255).toBeLessThan(159);
			expect((p16 >> 16) & 255).toBeGreaterThanOrEqual(Int(f32(159 / 1.05)));
		});

		it('genmap: under water the colour is blended with (41,221,241)', () => {
			flatTerrain(16, 0.25); // byte 63 -> TerrainY -809.41 -> h#=-0.2529
			genmap(32);
			const hh = f32(TerrainY(G.ter, 5, 0, 5) / 3200);
			const r0 = Int(f32(118 + f32(137 * hh)));
			const g0 = Int(f32(105 + f32(137 * hh)));
			const b0 = Int(f32(52 + f32(137 * hh)));
			const px = ReadPixelFast(32 - 2, 1, G.map_mapimage ? G.map_mapimage.frames[0] : undefined) >>> 0;
			expect(px).toBe((0xff000000 | (((r0 * 3 + 41) >> 2) << 16) | (((g0 * 3 + 221) >> 2) << 8) | ((b0 * 3 + 241) >> 2)) >>> 0);
		});

		it('cachedata: what the loadmap command carries over', () => {
			const tx = (mode: number, key: string, value: string) => Object.assign(New(Tx), { mode, key, value, typ: mode * 10, parent_class: 2, parent_id: 1, stuff: 's' + mode });
			tx(1, 'var', '5');
			tx(2, 'diary', 'd');
			tx(3, 'lock', '1');
			tx(5, 'skill', '9');
			tx(0, 'script', '');
			G.g_player = 1;
			Object.assign(New(Titem), { typ: 44, count: 15, parent_class: Cclass_unit, parent_id: 1 });
			Object.assign(New(Titem), { typ: 45, count: 2, parent_class: Cclass_unit, parent_id: 2 }); // another unit's
			Object.assign(New(Titem), { typ: 46, count: 3, parent_class: Cclass_object, parent_id: 1 });
			G.in_quickslot[4] = 44;
			const player = Object.assign(New(Tunit), { id: 1, player_weapon: 30, player_ammo: 31 });
			G.g_cplayer = player;
			Object.assign(New(Tstate), { typ: 7, parent_class: Cclass_unit, parent_id: 1, x: 1.5, y: 0, z: -2, fx: f32(0.1), fy: 0, fz: 0, value: 3, value_f: 2.5, value_s: 'txt', r: 255, g: 0, b: 10 });
			Object.assign(New(Tstate), { typ: 8, parent_class: Cclass_object, parent_id: 1 });
			Object.assign(New(Txc), { mode: 1, key: 'old' });

			cachedata(1, 1, 1, 1, 1, 1, 1);
			const c = [...Txc.list].map((x) => `${x.mode}:${x.typ}:${x.key}:${x.value}:${x.stuff}`);
			expect(c).toEqual([
				'5:50:skill:9:s5', // skills
				'7:44::15:', // the player's item, count as text
				...Array.from({ length: 10 }, (_, i) => `8:${i}::${i === 4 ? 44 : 0}:`), // quick slots
				'8:10::30:', // weapon
				'8:11::31:', // ammo
				'1:10:var:5:s1', // variables
				'2:20:diary:d:s2', // diary
				// the state: floats with Str (0.1 -> "0.1"), separator byte 0xBF
				'9:7:::' + ['1.5', '0.0', '-2.0', '0.1', '0.0', '0.0', '3', '2.5', 'txt', '255', '0', '10'].join(SEP_FIELD),
				'3:30:lock:1:s3' // build locks
			]);
			expect(SEP_FIELD).toBe('\xbf');

			// free=0 keeps the old cache; without a player object no weapon / ammo entries
			G.g_cplayer = null;
			cachedata(0, 0, 1);
			expect(Txc.list.count).toBe(c.length + 1 + 10);
		});

		it('screenshot: the first free screen_NNNNN.bmp, and a message', () => {
			screenshot();
			expect(FileType('screen_00001.bmp')).toBe(1);
			const bmp = readFileBytes('screen_00001.bmp')!;
			expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
			screenshot(0);
			expect(FileType('screen_00002.bmp')).toBe(1);
			expect(calls.filter((c) => c.startsWith('if_msg'))).toEqual([`if_msg < screenshot saved as 'screen_00001.bmp' > ${Cbmpf_yellow}`]);
		});

		it('brightness: scales every pixel that is not (mr,mr,mr); space saves the image over the file', async () => {
			const img = CreateImage(2, 1);
			WritePixelFast(0, 0, 0xff000000 | (200 << 16) | (100 << 8) | 7, img.frames[0]);
			WritePixelFast(1, 0, 0xff000000 | (9 << 16) | (9 << 8) | 9, img.frames[0]);
			const lf = await import('../../src/lib/s2/game/load_functions');
			vi.spyOn(lf, 'LoadImage').mockImplementation(() => img);
			let frames = 0;
			setFrameHook(() => {
				if (++frames > 20) throw new Error('brightness did not return');
			});
			G.br = 1;
			injectKeyDown(57, 32); // space
			await brightness('gfx\\test.bmp', 9, 1, 2, 1.5);
			// (200,100,7)*1.5 = (300 -> 255, 150, 10.5 -> 10 (ties to even)); (9,9,9) is the mask colour: untouched
			expect(img.frames[0].getPixelFast(0, 0) & 0xffffff).toBe((255 << 16) | (150 << 8) | 10);
			expect(img.frames[0].getPixelFast(1, 0) & 0xffffff).toBe((9 << 16) | (9 << 8) | 9);
			expect(img.freed).toBe(true);
			const bmp = readFileBytes('gfx\\test.bmp')!;
			expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
			expect(G.br).toBe(1);
		});
	});

	// =================================================================================
	describe('e_environment.bb: e_terrain, e_gc, e_teralign', () => {
		it('e_terrain: only powers of two from 16 up', () => {
			expect(() => e_terrain(20, 'x')).toThrow("'20' is an invalid Terrainsize! ");
			expect(() => e_terrain(8, 'x')).toThrow("'8' is an invalid Terrainsize! ");
			for (const size of [16, 32, 64, 128]) {
				e_terrain(size, 'x');
				expect(G.ter_size).toBe(size);
				expect(TerrainSize(G.ter)).toBe(size);
			}
		});

		it('e_terrain: position, random heights in the original draw order, default texture, grass map', () => {
			SeedRnd(99);
			e_terrain(32, 'gfx\\no such colormap.bmp');
			const after = Rand(1, 1000000);
			expect([EntityX(G.ter), EntityY(G.ter), EntityZ(G.ter)]).toEqual([-1024, -1600, -1024]);
			expect(TextureHeight(G.ter_tex_color)).toBe(64); // CreateTexture(64,64) when the file does not exist

			// replay: For x / For z: ModifyTerrain Rnd(0.5,0.52); If Rand(50)=1 Then ModifyTerrain 1
			SeedRnd(99);
			const cells = new Map<number, number>();
			for (let x = 0; x <= 32; x++) {
				for (let z = 0; z <= 32; z++) {
					let h = Rnd(0.5, 0.52);
					if (Rand(50) === 1) h = 1;
					cells.set((x & 31) * 32 + (z & 31), Math.trunc(f32(h * 255))); // x=32 / z=32 are the cells 0 again
				}
			}
			expect(Rand(1, 1000000)).toBe(after); // exactly 2*33*33 random numbers were drawn
			let ones = 0;
			for (let x = 0; x < 32; x++) {
				for (let z = 0; z < 32; z++) {
					const byte = Math.round(TerrainHeight(G.ter, x, z) * 255);
					expect(byte).toBe(cells.get(x * 32 + z));
					if (byte === 255) ones++;
				}
			}
			expect(ones).toBeGreaterThan(0);

			// grass_map(): grass_rgb(0..63,0..63,3)=1 from the 64x64 texture; row 64 exists and is 0
			expect(G.grass_mapsize).toBe(64);
			expect(grass_rgb_get(0, 0, 3)).toBe(1);
			expect(grass_rgb_get(63, 63, 3)).toBe(1);
			expect(grass_rgb_get(64, 0, 3)).toBe(0);
			grass_rgb_set(64, 64, 3, 1);
			expect(G.grass_rgb[64][64][3]).toBe(1);
			grass_rgb_set(65, 0, 3, 1); // outside: ignored
			expect(grass_rgb_get(65, 0, 3)).toBe(0);
		});

		it('e_terrain "generated": keeps the texture load_map made', () => {
			const tex = CreateTexture(32, 32, 256);
			TextureBuffer(tex)!.setPixelFast(3, 4, 0xff102030 | 0);
			G.ter_tex_color = tex;
			e_terrain(16, 'generated');
			expect(G.ter_tex_color).toBe(tex);
			expect(G.grass_mapsize).toBe(32);
			expect([G.grass_rgb[3][4][0], G.grass_rgb[3][4][1], G.grass_rgb[3][4][2], G.grass_rgb[3][4][3]]).toEqual([0x10, 0x20, 0x30, 1]);
		});

		it('e_terrainground: ter_groundy is the terrain height at the map corner', () => {
			flatTerrain(16, 0);
			ModifyTerrain(G.ter, 0, 0, 0.8);
			G.ter_groundy = 12345;
			e_terrainground();
			expect(G.ter_groundy).toBe(TerrainY(G.ter, -512, 0, -512));
			expect(G.ter_groundy).toBeCloseTo(0.8 * 3200 - 1600, 2);
			expect(e_tery(100, 100)).toBe(G.ter_groundy); // the flat part is lower than the ground level
		});

		it('e_teralign: pitch and roll from the terrain; e_gc does nothing (it returns at once)', () => {
			flatTerrain(16, 0.5);
			const e = CreatePivot();
			PositionEntity(e, 10, 500, 20);
			RotateEntity(e, 30, 40, 50);
			e_teralign(e);
			expect(EntityPitch(e)).toBeCloseTo(0, 4);
			expect(EntityYaw(e)).toBeCloseTo(0, 4); // RotateEntity h,pitch#,0,roll#: the yaw is lost
			expect(EntityRoll(e)).toBeCloseTo(0, 4);
			PositionEntity(e, 0, -5000, 0);
			e_gc(e, 10);
			expect(EntityY(e)).toBe(-5000);
		});

		it('TerrainHeight_exe: byte * float32(1/255), as the shipped height maps have it', () => {
			G.ter = CreateTerrain(16);
			ModifyTerrain(G.ter, 1, 1, 114 / 255 + 0.001);
			const buf = new DataView(new ArrayBuffer(4));
			buf.setFloat32(0, TerrainHeight_exe(G.ter, 1, 1));
			expect(buf.getUint32(0).toString(16)).toBe('3ee4e4e6'); // maps\Color Game.s2, first height
			expect(TerrainHeight_exe(G.ter, 0, 0)).toBe(0);
			ModifyTerrain(G.ter, 2, 2, 1);
			expect(TerrainHeight_exe(G.ter, 2, 2)).toBe(1);
		});
	});

	// =================================================================================
	describe('physics.bb, collisions.bb, load_materials.bb', () => {
		it('phy_set: one Cstate_phy state per parent, force and position set to the vector', () => {
			phy_set(Cclass_unit, 5, 1, 2, 3);
			expect(Tstate.list.count).toBe(1);
			const st = Tstate.list.first()!;
			expect([st.typ, st.parent_class, st.parent_id, st.fx, st.fy, st.fz, st.x, st.y, st.z]).toEqual([Cstate_phy, Cclass_unit, 5, 1, 2, 3, 1, 2, 3]);
			phy_set(Cclass_unit, 5, 4, 5, f32(6.1), 9, 9, 9); // found: overwritten, mx/my/mz are unused
			expect(Tstate.list.count).toBe(1);
			expect([st.fx, st.fy, st.fz]).toEqual([4, 5, f32(6.1)]);
			phy_set(Cclass_item, 5, 0, 0, 0);
			expect(Tstate.list.count).toBe(2);
		});

		it('col_jump / col_player without collisions; col_set registers the five collision pairs', () => {
			const collisions = vi.spyOn(RT.world.collision, 'Collisions');
			include_collisions();
			// UNITS->WORLD, PROJECTILES->WORLD, PROJECTILES->UNITS, PROJECTILES->ITEMS, ITEMS->WORLD
			expect(collisions.mock.calls.map((c) => c.slice(0, 4))).toEqual([
				[1, 100, 2, 3],
				[50, 100, 2, 3],
				[50, 1, 1, 3],
				[50, 2, 2, 1],
				[2, 100, 2, 3]
			]);
			col_set();
			expect(collisions).toHaveBeenCalledTimes(10);
			const u = New(Tunit);
			u.h = CreatePivot();
			G.TCunit = u;
			expect(col_jump()).toBe(1);
			col_player();
			col_bottom(u.h, 5);
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([0, 0, 0]);
		});

		it('col_jump / col_player against an object', () => {
			include_collisions();
			const wall = CreateCube();
			ScaleEntity(wall, 10, 10, 10);
			PositionEntity(wall, 0, 0, 30);
			EntityType(wall, 100); // Cworld_col
			const u = Object.assign(New(Tunit), { id: 1, typ: 2, h: CreatePivot() });
			EntityType(u.h, 1); // Cworld_unitcol
			EntityRadius(u.h, 5);
			G.TCunit = u;
			UpdateWorld();
			MoveEntity(u.h, 0, 0, 18); // into the wall (its face is at z=20)
			UpdateWorld();
			expect(CountCollisions(u.h)).toBeGreaterThan(0);
			const z = EntityZ(u.h);
			expect(z).toBeCloseTo(15, 1); // stopped a radius in front of the wall

			const object = Object.assign(New(Tobject), { id: 3, typ: 1, h: wall });
			let found = -1;
			const get_object = vi.spyOn(handle_objects, 'get_object').mockImplementation((h) => {
				if (h === wall && found !== -1) G.TCobject = object;
				return h === wall ? found : -1;
			});
			Dunit_colyr.set(2, 15);
			Dobject_col.set(1, 1);
			// the collided entity is no object: jumping is allowed, the player is not pushed
			expect(col_jump()).toBe(1);
			col_player();
			expect([EntityX(u.h), EntityZ(u.h)]).toEqual([0, z]);
			expect(get_object).toHaveBeenCalledWith(wall);
			// an object, hit above (EntityY - colyr/1.5 = -10): no jump; the player is pushed away by one unit per axis
			found = 3;
			expect(col_jump()).toBe(0);
			col_player();
			// CollisionX (0) is not greater than EntityX (0): +1; CollisionZ (20) is greater than EntityZ: -1
			expect(EntityX(u.h)).toBeCloseTo(1, 5);
			expect(EntityZ(u.h)).toBeCloseTo(z - 1, 5);
			// collision mode 4 objects are ignored
			Dobject_col.set(1, 4);
			expect(col_jump()).toBe(1);
			// a collision low on the unit (colyr small: EntityY - 1.5/1.5 = -1 < CollisionY = 0 still high) vs. far below
			Dobject_col.set(1, 1);
			Dunit_colyr.set(2, -30); // threshold EntityY+20: the collision is below it
			expect(col_jump()).toBe(1);
		});

		it('material_stepsfx: by material, silent in sequences', () => {
			const sfx = vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0);
			G.sfx_woodstep = [11, 12];
			G.sfx_stonestep = [21, 22];
			G.sfx_waterstep = 31;
			G.sfx_step = [41, 42, 43, 44];
			material_stepsfx(Cmat_wood);
			material_stepsfx(Cmat_stone);
			material_stepsfx(Cmat_water);
			material_stepsfx(Cmat_dirt);
			const got = sfx.mock.calls.map((c) => c[0]);
			expect([11, 12]).toContain(got[0]);
			expect([21, 22]).toContain(got[1]);
			expect(got[2]).toBe(31);
			expect([41, 42, 43, 44]).toContain(got[3]);
			G.m_menu = Cmenu_if_movie;
			material_stepsfx(Cmat_wood);
			expect(sfx).toHaveBeenCalledTimes(4);
		});

		it('material_fx: particles by set_effects, the sound at the rounded position', () => {
			const sfx_3d = vi.spyOn(RT.audio, 'sfx_3d').mockImplementation(() => {});
			G.sfx_mat_wood = [51, 52];
			G.sfx_mat_stone = [61];
			G.sfx_mat_flesh = [71, 72, 73, 74, 75];
			G.sfx_startdive = 81;
			G.sfx_splash = 82;
			G.sfx_splash2 = 83;
			G.set_effects = 2;
			material_fx(f32(1.6), f32(2.5), f32(3.4), Cmat_wood);
			// one smoke, then set_effects*3 wood fragments of size Rand(1,3), alpha 3
			const p = calls.filter((c) => c.startsWith('p_add'));
			expect(p.length).toBe(7);
			expect(p[0].startsWith(`p_add ${Cp_smoke} `)).toBe(true);
			for (const c of p.slice(1)) expect(c).toMatch(new RegExp(`^p_add ${Cp_wood} [123] 3$`));
			// sfx_3d(x,y,z,sound) has Int parameters: 1.6 -> 2, 2.5 -> 2 (ties to even), 3.4 -> 3
			expect(sfx_3d).toHaveBeenCalledTimes(1);
			expect(sfx_3d.mock.calls[0].slice(0, 3)).toEqual([2, 2, 3]);
			expect([51, 52]).toContain(sfx_3d.mock.calls[0][3]);

			calls = [];
			material_fx(0, 0, 0, Cmat_wood, 0); // sfx=0
			expect(sfx_3d).toHaveBeenCalledTimes(1);

			calls = [];
			G.set_effects = 1;
			material_fx(0, 0, 0, Cmat_water);
			expect(calls.filter((c) => c.startsWith(`p_add ${Cp_spark}`)).length).toBe(3);
			expect([81, 82, 83]).toContain(sfx_3d.mock.calls[1][3]);

			calls = [];
			G.set_gore = 0;
			material_fx(0, 0, 0, Cmat_flesh); // no gore: no splatter, but the sound
			expect(calls.filter((c) => c.startsWith('p_add')).length).toBe(0);
			expect(sfx_3d).toHaveBeenCalledTimes(3);

			material_fx(0, 0, 0, Cmat_dirt); // "Case Cmat_dirt" is empty
			expect(sfx_3d).toHaveBeenCalledTimes(3);

			G.set_effects = 0;
			material_fx(0, 0, 0, Cmat_stone);
			expect(calls.filter((c) => c.startsWith('p_add')).length).toBe(0);
			expect(sfx_3d.mock.calls[3][3]).toBe(61);
		});
	});

	// =================================================================================
	describe('e_clear.bb', () => {
		it('frees the world and resets the globals', () => {
			const ents: Handle[] = [];
			const piv = () => {
				const p = CreatePivot();
				ents.push(p);
				return p;
			};
			G.ter = CreateTerrain(16);
			const ter = G.ter;
			G.ter_tex_color = CreateTexture(16, 16);
			const tex = G.ter_tex_color;
			G.env_sea = piv();
			G.env_sea2 = piv();
			G.env_sky = piv();
			G.env_ground = piv();
			G.env_itemlight = piv();
			G.env_moon = piv();
			Object.assign(New(Tobject), { h: piv(), ch: piv() });
			Object.assign(New(Tobject), { h: piv() });
			Object.assign(New(Tunit), { h: piv(), mh: piv(), vh: piv(), ai_ch: piv(), chan: 0 });
			Object.assign(New(Titem), { h: piv() });
			Object.assign(New(Tinfo), { h: piv(), typ: 47 });
			Object.assign(New(Tstate), { h: piv(), light: piv() });
			Object.assign(New(Tp), { h: piv() });
			Object.assign(New(Tpro), { h: piv() });
			const cscrImage = CreateImage(4, 4);
			Object.assign(New(Tcscr), { image: cscrImage });
			for (const t of [Tx, Tmsg, Tseq, Tpt, Tin_quicksave, Tat, Ttimer, Tfrap, Tup, T3d, Tcopy, Tbmpf_img]) New(t as typeof Tmsg);
			const siimg = CreateImage(4, 4);
			G.in_siimg[7] = siimg;
			G.in_sb[2] = 1;
			G.in_sitxt[3] = 1;
			G.map_mapimage = CreateImage(8, 8);
			const mapimage = G.map_mapimage;
			G.seq_img = CreateImage(8, 8);
			G.in_clickscreenimage = CreateImage(8, 8);
			G.seq_msg[1][1] = 'hi';
			Object.assign(G, {
				gt: 1234,
				in_gtmod: 2,
				f: 2.5,
				m_menu: 4,
				g_player: 5,
				g_drive: 6,
				g_sleep: 1,
				in_fo_txt: 'abc',
				in_pc_event: 'ev',
				in_scr_sel: 3,
				in_scr_sel2: 4,
				in_getkey: 9,
				in_compass: 0,
				in_wpnrdy: 0,
				in_quicksave: 3,
				map_briefing: 'x',
				map_briefing_key: 'y',
				map_timeupdate: 1,
				env_cweather: 2,
				env_wa: 0.5,
				set_flarefx: 0,
				object_serial: 50,
				unit_serial: 500,
				item_serial: 60,
				info_serial: 70,
				game_rainratio: 33,
				game_snowratio: 44,
				game_jumptime2: 111,
				game_jumpfac2: 2.25,
				tmp_loading: 1,
				p_parseinprogress: 1,
				p_return: 'r',
				pv_x: 1,
				ed_setscript: 'e',
				set_mb_alpha_override: 0.5,
				in_tpforce: 1
			});
			G.env_wcol = [1, 2, 3];
			G.in_skyoverride[0] = 1;
			Dunit_speed.set(0, f32(1.25));
			Dunit_speed.set(1, 99);
			const typ = 1;
			Dobject_script.set(typ, 'on:changed {' + SEP_LINE + '}' + SEP_LINE);
			Dobject_scriptk.set(typ, 'stale');
			expect(G.seq_cpoint_p).toBeNull();

			e_clear();

			expect(freed(ter)).toBe(true);
			expect(G.ter).toBeNull();
			expect(tex!.freed).toBe(true);
			expect(G.ter_tex_color).toBeNull();
			for (const e of ents) expect(freed(e)).toBe(true);
			expect([G.env_sea, G.env_sea2, G.env_sky, G.env_ground, G.env_itemlight, G.env_moon]).toEqual([null, null, null, null, null, null]);
			for (const t of [Tobject, Tunit, Titem, Tinfo, Tstate, Tx, Tp, Tpro, Tmsg, Tseq, Tpt, Tin_quicksave, Tcscr, Tat, Ttimer, Tfrap, Tup, T3d, Tcopy, Tbmpf_img]) {
				expect([t.typeName, t.list.count]).toEqual([t.typeName, 0]);
			}
			expect([cscrImage.freed, siimg.freed, (mapimage as { freed: boolean }).freed]).toEqual([true, true, true]);
			expect([G.map_mapimage, G.seq_img, G.in_clickscreenimage]).toEqual([0, 0, 0]);
			expect(G.in_siimg.length).toBe(40);
			expect(G.in_siimg[7]).toBe(0);
			expect(G.in_sb).toEqual(new Array(10).fill(0));
			expect(G.in_sitxt).toEqual(new Array(20).fill(0));
			expect(G.seq_msg).toEqual([
				['', ''],
				['', ''],
				['', '']
			]);
			expect(G.seq_cpoint_p).not.toBeNull(); // created once ...
			const cp = G.seq_cpoint_p;

			// serials: units start at 100 (unit_serial=99), everything else at 1
			expect([G.object_serial, G.unit_serial, G.item_serial, G.info_serial]).toEqual([0, 99, 0, 0]);
			expect([G.gt, G.in_gtmod, G.f, G.m_menu, G.g_player, G.g_drive, G.g_sleep]).toEqual([0, 1, 1, 0, 0, 0, 0]);
			// quirk: "in_fo_txt$=0" and "in_pc_event$=0" assign the number 0 to strings
			expect([G.in_fo_txt, G.in_pc_event]).toEqual(['0', '0']);
			expect([G.in_scr_sel, G.in_scr_sel2, G.in_getkey, G.in_compass, G.in_wpnrdy, G.in_quicksave]).toEqual([-1, -1, -1, 1, 1, 0]);
			expect([G.map_briefing, G.map_briefing_key, G.map_timeupdate]).toEqual(['', '', 0]);
			expect([G.env_cweather, G.env_wa, G.set_flarefx]).toEqual([0, 0, 1]);
			expect(G.env_wcol).toEqual([220, 110, 90]);
			expect(G.in_skyoverride).toEqual([0, 0, 0, 0, 0]);
			expect([G.map_rainratio, G.map_snowratio, G.game_jumptime, G.game_jumpfac]).toEqual([33, 44, 111, 2.25]);
			expect([G.tmp_loading, G.p_parseinprogress, G.p_return, G.pv_x, G.ed_setscript, G.set_mb_alpha_override, G.in_tpforce]).toEqual([0, 0, '', 0, '', 0, 0]);
			// definition scripts are back to the originals, the player values to those of slot 0
			expect(Dobject_script(typ)).toBe(Dobject_scripto(typ));
			expect(Dobject_scriptk(typ)).toBe(preparse_string(Dobject_scripto(typ)));
			expect(Dunit_speed(1)).toBe(1.25);

			e_clear();
			expect(G.seq_cpoint_p).toBe(cp); // ... and kept
		});
	});

	// =================================================================================
	describe('e_load_map.bb', () => {
		const MAP = 'maps\\adventure\\map06.s2';
		const file = (map: string) => parseMap(new Uint8Array(readFileSync(join(MOD, map.replaceAll('\\', '/')))));

		it('load_map: a file that does not exist', async () => {
			G.gt = 77;
			expect(await load_map('maps\\nope.s2', '')).toBe(0);
			expect(con).toEqual([{ txt: 'Unable to load Map maps\\nope.s2', col: Cbmpf_red }]);
			expect(G.gt).toBe(77); // e_clear() did not run
			expect(G.map_id).toBe('0');
		});

		it('load_map: not a map file', async () => {
			const s = WriteFile('maps\\bad.s2');
			WriteLine(s, 'hello');
			CloseFile(s);
			await expect(load_map('maps\\bad.s2', '')).rejects.toThrow('Invalid Map! (Invalid Header)');
		});

		it('load_map: the editor checks the password; the game does not', async () => {
			G.m_section = Csection_editor;
			expect(await load_map(MAP, 'wrong')).toBe(0);
			expect(con).toEqual([{ txt: 'ERROR: Invalid Map Password!', col: Cbmpf_red }]);
			expect(G.tmp_loading).toBe(0);
			expect(Tobject.list.count).toBe(0); // stopped before the map data
			recordEvents();
			G.m_section = 0;
			expect(await load_map(MAP, 'wrong')).toBe(1);
		});

		it('load_map in the game: every side effect, in the original order', async () => {
			const m = file(MAP);
			recordEvents();
			const preparse = vi.spyOn(RT.script, 'preparse').mockImplementation(() => {
				calls.push('preparse');
			});
			const e_environment = vi.spyOn(RT.core, 'e_environment').mockImplementation(() => {
				calls.push('e_environment');
			});
			const loadSound = vi.spyOn(RT.audio.bb, 'LoadSound').mockImplementation(() => 4711);
			G.m_section = Csection_game_sp;
			G.m_menu = 5;
			G.gt = 999;
			SeedRnd(3);
			expect(await load_map(MAP, '')).toBe(1);

			// --- order of the calls into the other packages and layers
			const order = calls.filter((c) => !/^(set_|ai_ini|look_state)/.test(c));
			expect(order).toEqual([
				'globalevent preload', // ;on:preload, after the terrain and before the objects
				'sel_event preload',
				'serialpeak_object',
				'serialpeak_unit',
				'serialpeak_item',
				'serialpeak_info',
				'defvar_ini', // not in the editor, mode "map"
				'preparse',
				'e_environment',
				'game_playerspawn 1',
				'game_setplayer 1',
				'globalevent start', // only for mode "map"
				'sel_event start',
				'globalevent load',
				'sel_event load',
				'game_setcam m_menu=0'
			]);
			// "m=m_menu : m_menu=0 : game_setcam() : m_menu=m" restores what e_clear() left: always 0
			expect(G.m_menu).toBe(0);
			expect(preparse).toHaveBeenCalledTimes(1);
			expect(e_environment).toHaveBeenCalledTimes(1);

			// --- entities: counts, order and values of the file
			expect(calls.filter((c) => c.startsWith('set_object')).length).toBe(m.objects.length);
			expect(calls.filter((c) => c.startsWith('ai_ini')).length).toBe(m.units.length); // Initialize AI (not in the editor)
			expect([Tobject.list.count, Titem.list.count, Tinfo.list.count, Tstate.list.count]).toEqual([m.objects.length, m.items.length, m.infos.length, m.states.length]);
			expect(Tunit.list.count).toBe(m.units.length + 1); // + the player spawned by game_playerspawn(1)
			const objs = [...Tobject.list];
			m.objects.forEach((o, i) => {
				expect([objs[i].id, objs[i].typ, objs[i].health, objs[i].health_max, objs[i].daytimer]).toEqual([o.id, o.typ, o.health, o.healthMax, o.daytimer]);
				expect([EntityX(objs[i].h), EntityZ(objs[i].h)]).toEqual([o.x, o.z]);
				expect(visible(objs[i].h)).toBe(false); // HideEntity TCobject\h
			});
			const units = [...Tunit.list];
			m.units.forEach((u, i) => {
				expect([units[i].id, units[i].health, units[i].hunger, units[i].ai_cx, units[i].ai_cz]).toEqual([u.id, u.health, u.hunger, u.aiCx, u.aiCz]);
				expect([EntityX(units[i].h), EntityY(units[i].h), EntityZ(units[i].h)]).toEqual([u.x, u.y, u.z]);
			});
			const items = [...Titem.list];
			m.items.forEach((it, i) => {
				expect([items[i].id, items[i].count, items[i].parent_class, items[i].parent_mode, items[i].parent_id]).toEqual([it.id, it.count, it.parentClass, it.parentMode, it.parentId]);
			});
			const infos = [...Tinfo.list];
			m.infos.forEach((inf, i) => expect([infos[i].id, infos[i].typ, infos[i].vars]).toEqual([inf.id, inf.typ, inf.vars]));

			// --- map variables
			const bytes = readFileBytes(MAP)!;
			expect(G.map_id).toBe(String(bytes.length) + m.date + m.time);
			// getfilename$() copes with one slash only: the sub-directory stays in the name
			expect([G.map_name, G.map_path, G.map_mode]).toEqual(['adventure\\map06', MAP, 'map']);
			expect([G.map_day, G.map_hour, G.map_minute, G.map_freezetime, G.map_skybox, G.map_multiplayer, G.map_climate, G.map_music, G.map_briefing]).toEqual([
				m.day,
				m.hour,
				m.minute,
				m.freezeTime,
				m.skybox,
				m.multiplayer,
				m.climate,
				m.music,
				m.briefing
			]);
			expect(G.map_fog).toEqual(m.fog);
			expect(G.map_timeupdate).toBe(1);
			expect(G.map_briefing_key).toBe(preparse_string(m.briefing));
			expect(G.in_quickslot).toEqual(m.quickslots.map((q) => Int(q))); // Int array: the strings are converted
			expect(G.map_password).toBe(''); // only set in the editor
			if (m.music !== '') {
				expect(loadSound).toHaveBeenCalledWith('sfx\\' + m.music);
				expect(G.amb_file).toBe(4711);
			} else {
				expect(loadSound).not.toHaveBeenCalled();
			}

			// --- preview image, colour map, terrain, grass map
			expect([ImageWidth(G.map_image), ImageHeight(G.map_image)]).toEqual([96, 72]);
			const img = G.map_image ? G.map_image.frames[0] : null;
			expect(img!.getPixelFast(5, 7) >>> 0).toBe((0xff000000 | (m.image[(5 * 72 + 7) * 3] << 16) | (m.image[(5 * 72 + 7) * 3 + 1] << 8) | m.image[(5 * 72 + 7) * 3 + 2]) >>> 0);
			const cs = m.colormapSize;
			expect(TextureHeight(G.ter_tex_color)).toBe(cs);
			const cbuf = TextureBuffer(G.ter_tex_color)!;
			for (const [x, y] of [
				[0, 0],
				[3, cs - 1],
				[cs - 1, 2]
			]) {
				const s = (x * cs + y) * 3;
				expect(cbuf.getPixelFast(x, y) & 0xffffff).toBe((m.colormap[s] << 16) | (m.colormap[s + 1] << 8) | m.colormap[s + 2]);
			}
			expect(G.ter_size).toBe(m.terrainSize);
			expect(TerrainSize(G.ter)).toBe(m.terrainSize);
			const n = m.terrainSize + 1;
			for (const [x, z] of [
				[1, 1],
				[5, 9],
				[m.terrainSize - 1, 3]
			]) {
				expect(TerrainHeight_exe(G.ter, x, z)).toBe(m.heights[x * n + z]);
			}
			for (const [x, y] of [
				[0, 0],
				[cs, cs],
				[7, 11],
				[cs - 1, 1]
			]) {
				expect(grass_rgb_get(x, y, 3)).toBe(m.grass[x * (cs + 1) + y]);
			}
			// ter_groundy: the corner of the terrain
			expect(G.ter_groundy).toBe(TerrainY(G.ter, -((m.terrainSize / 2) * 64), 0, -((m.terrainSize / 2) * 64)));

			// --- extensions: mode 6 is consumed by load_map_extensions, the rest stays in file order
			const kept = m.extensions.filter((x) => x.mode !== 6);
			expect([...Tx.list].map((x) => [x.mode, x.parent_class, x.parent_id, x.key, x.value])).toEqual(kept.map((x) => [x.mode, x.parentClass, x.parentId, x.key, x.value]));
			const last = m.extensions.find((x) => x.key === 'lasttime')!;
			expect([G.map_lday, G.map_lhour, G.map_lminute].join(',')).toBe(last.stuff);

			// --- the end
			expect([G.tmp_loading, G.blackframe, G.gt, G.g_player, G.pv_loadmaploaded]).toEqual([0, 10, 0, 1, 0]);
			expect(G.ms).toBe(G.lastms);
			expect(Tat.list.count).toBe(m.attachments.length);
		});

		it('load_map in the editor: no AI, no definition variables, no player, no start event for a savegame', async () => {
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {});
			G.m_section = Csection_editor;
			expect(await load_map(MAP, '')).toBe(1);
			expect(calls.some((c) => c.startsWith('ai_ini'))).toBe(false);
			expect(calls).not.toContain('defvar_ini');
			expect(calls).not.toContain('game_playerspawn 1');
			expect(calls).not.toContain('game_setplayer 1');
			expect(G.g_player).toBe(0);
		});

		it('load_map: cached extensions of the loadmap command (Txc)', async () => {
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {});
			vi.spyOn(RT.core, 'e_environment').mockImplementation(() => {});
			G.m_section = Csection_game_sp;
			await load_map(MAP, '');
			// the map's own variables, to see the cleanup: the first variable of the file
			const own = [...Tx.list].filter((x) => x.mode === 1);
			DeleteEach(Txc);
			Object.assign(New(Txc), { mode: 1, key: own[0]?.key ?? 'fresh', value: 'cached', typ: 0 });
			Object.assign(New(Txc), { mode: 5, key: 'skill', value: '12', stuff: 'Digging' });
			Object.assign(New(Txc), { mode: 7, typ: 44, value: '15' });
			Object.assign(New(Txc), { mode: 8, typ: 3, value: '77' });
			Object.assign(New(Txc), { mode: 8, typ: 10, value: '30' });
			Object.assign(New(Txc), { mode: 8, typ: 11, value: '31' });
			Object.assign(New(Txc), { mode: 9, typ: 7, parent_class: Cclass_unit, parent_id: 1, stuff: ['1.5', '2', '-3', '0.25', '0', '0', '4', '2.5', 'abc', '255', '128', '0'].join(SEP_FIELD) });
			calls = [];
			await load_map(MAP, '');

			expect(G.pv_loadmaploaded).toBe(1);
			expect(Txc.list.count).toBe(0);
			// mode 1: the map's variable of the same key is replaced by the cached one, appended at the end
			const vars = [...Tx.list].filter((x) => x.mode === 1 && x.key === (own[0]?.key ?? 'fresh'));
			expect(vars.map((x) => x.value)).toEqual(['cached']);
			expect([...Tx.list].filter((x) => x.mode === 5).map((x) => [x.key, x.value, x.stuff])).toEqual([['skill', '12', 'Digging']]);
			// mode 7: the item is created after the player exists and stored in him
			const spawn = calls.indexOf('game_setplayer 1');
			const item = calls.indexOf('set_item 44 x15');
			expect(item).toBeGreaterThan(spawn);
			expect(calls[item + 1]).toBe(`store_item ${G.TCitem!.id} ${Cclass_unit} 1`);
			// mode 8
			expect(G.in_quickslot[3]).toBe(77);
			expect([G.g_cplayer!.player_weapon, G.g_cplayer!.player_ammo]).toEqual([30, 31]);
			// mode 9: the fields come back through Float(); quirk: value_s as well ("abc" -> "0.0")
			const st = [...Tstate.list].find((s) => s.typ === 7 && s.parent_id === 1)!;
			expect([st.x, st.y, st.z, st.fx, st.value, st.value_f, st.value_s, st.r, st.g, st.b]).toEqual([1.5, 2, -3, 0.25, 4, 2.5, '0.0', 255, 128, 0]);
			// the cached entries were applied before the start / load events
			expect(calls.indexOf('globalevent start')).toBeGreaterThan(item);
		});

		it('load_map_id: file size, date line, time line', () => {
			const m = file(MAP);
			expect(load_map_id(MAP)).toBe(String(readFileBytes(MAP)!.length) + m.date + m.time);
			expect(load_map_id('maps\\nope.s2')).toBe('0');
		});

		it('load_map_header: date, time, multiplayer flag, preview image', () => {
			const m = file('maps\\Tower Defense.s2');
			G.map_mode = 'sav';
			expect(load_map_header('maps\\Tower Defense.s2')).toBe(0);
			expect([G.sg_date, G.sg_time, G.sg_multiplayer]).toEqual([m.date, m.time, m.multiplayer]);
			expect(G.map_mode).toBe('map'); // quirk: the mode of the loaded map is overwritten
			expect([ImageWidth(G.map_image), ImageHeight(G.map_image)]).toEqual([96, 72]);
			const img = G.map_image ? G.map_image.frames[0] : null;
			const s = (95 * 72 + 71) * 3;
			expect(img!.getPixelFast(95, 71) & 0xffffff).toBe((m.image[s] << 16) | (m.image[s + 1] << 8) | m.image[s + 2]);
			const first = G.map_image;
			load_map_header('maps\\Tower Defense.s2', 0); // image=0: the pixels are skipped, the image is kept
			expect(G.map_image).toBe(first);
			expect(G.sg_date).toBe(m.date);
			expect(load_map_header('maps\\nope.s2')).toBe(0);
			expect(con).toEqual([{ txt: 'Unable to load Map Info from maps\\nope.s2', col: Cbmpf_red }]);
			const s2 = WriteFile('maps\\bad.s2');
			WriteLine(s2, 'x');
			CloseFile(s2);
			expect(() => load_map_header('maps\\bad.s2')).toThrow('Invalid Map! (Invalid Header)');
		});

		it('load_maps: the .s2 files of maps\\, filtered by the multiplayer flag', () => {
			const names = ['Color Game', 'Shooting Range', 'Survival Guide', 'Tower Defense'];
			const mp = names.filter((n) => file(`maps\\${n}.s2`).multiplayer !== 0);
			load_maps();
			expect([...Tsg.list].map((t) => t.name)).toEqual(names);
			expect(G.in_opt[0]).toBe(1);
			expect(G.in_win_map).toBe('Color Game');
			expect(G.sg_date).toBe(file('maps\\Color Game.s2').date); // header of the first map loaded
			G.in_opt[0] = 0;
			G.in_win_map = '';
			load_maps(0);
			expect(G.in_opt[0]).toBe(0); // loadfirst=0
			expect(G.in_win_map).toBe('');
			load_maps(0, 1);
			expect([...Tsg.list].map((t) => t.name)).toEqual(mp);
			load_maps(0, -1); // quirk of the original: -1 removes the maps whose flag is exactly 1
			expect([...Tsg.list].map((t) => t.name)).toEqual(names.filter((n) => file(`maps\\${n}.s2`).multiplayer !== 1));
		});

		it('load_savegames: the .sav files of saves\\', () => {
			if (FileType('saves') !== 2) {
				load_savegames();
				expect(con).toEqual([{ txt: "ERROR: Unable to read 'saves' dir!", col: Cbmpf_red }]);
				CreateDir('saves');
			}
			const existing = Tsg.list.count;
			void existing;
			writeFileBytes('saves\\zz_test.sav', readFileBytes(MAP)!);
			writeFileBytes('saves\\zz_note.txt', new Uint8Array(3));
			G.in_input[0] = 'typed';
			load_savegames();
			const names = [...Tsg.list].map((t) => t.name);
			expect(names).toContain('zz_test');
			expect(names).not.toContain('zz_note');
			expect(G.in_opt[0]).toBe(1);
			expect(G.in_input[0]).toBe('');
			if (names[0] === 'zz_test') expect(G.sg_date).toBe(file(MAP).date);
		});

		it('load_map_extensions: every mode 6 extension becomes game state and is deleted', () => {
			const ext = (key: string, value = '', stuff = '', parent_class = 0, parent_id = 0) => Object.assign(New(Tx), { mode: 6, key, value, stuff, parent_class, parent_id });
			const keep = Object.assign(New(Tx), { mode: 1, key: 'g_drive', value: '9' }); // not mode 6: untouched
			const model = CreateCube();
			AddAnimSeq(model, 10); // Animate needs an animated model
			const vehicle = Object.assign(New(Tunit), { id: 120, typ: 33, h: CreatePivot(), mh: model, ai_mode: 4, ani: 3 });
			const player = Object.assign(New(Tunit), { id: 1, typ: 1, h: CreatePivot() });
			const frozen = Object.assign(New(Tunit), { id: 130, typ: 2, h: CreatePivot() });
			const obj = Object.assign(New(Tobject), { id: 7, h: CreatePivot(), ch: CreatePivot() });
			PositionEntity(obj.h, 5, 1, 6);
			RotateEntity(obj.h, 0, 90, 0);
			PositionEntity(frozen.h, 1, 2, 3);
			const item = Object.assign(New(Titem), { id: 9, h: CreatePivot() });
			PositionEntity(item.h, 4, 5, 6);
			G.gt = 4000;

			ext('g_drive', '120');
			ext('env_cweather', '2');
			ext('w/a', '55', '', 30, 31); // a value overrides the weapon stored in parent_class
			ext('t', '1,5000,1200,-1', 'timerscript', Cclass_object, 7);
			ext('f', '12.5,10,-20', '', Cclass_object, 7);
			ext('f', '77', '', Cclass_unit, 130);
			ext('f', '-3.25', '', Cclass_item, 9);
			ext('u', '130', '', 2, 45);
			ext('i', '', '', Cclass_unit, 130);
			ext('i', '', '', Cclass_object, 7); // only units freeze
			ext('t3d', 'Hello', '2,15,300', Cclass_object, 7);
			ext('lasttime', '', '3,14,15');
			ext('unknown key');
			G.map_timeupdate = 0;
			load_map_extensions();

			expect([...Tx.list]).toEqual([keep]);
			// g_drive
			expect(G.g_drive).toBe(120);
			expect(calls).toContain('game_input_vehicledata 33');
			expect([vehicle.ai_mode, vehicle.ai_duration, vehicle.ai_timer, vehicle.ani]).toEqual([0, 5000, 4000, 0]);
			expect(G.env_cweather).toBe(2);
			// w/a
			expect([player.player_weapon, player.player_ammo]).toEqual([55, 31]);
			// t: quirk - the saved running time becomes the start time
			expect([...Ttimer.list].map((t) => [t.typ, t.duration, t.start, t.mode, t.scr, t.parent_class, t.parent_id])).toEqual([[1, 5000, 1200, -1, 'timerscript', Cclass_object, 7]]);
			// f
			expect([...Tfrap.list].map((f) => [f.parent_class, f.parent_id, f.y, f.pitch, f.roll])).toEqual([
				[Cclass_object, 7, 12.5, 10, -20],
				[Cclass_unit, 130, 77, 0, 0],
				[Cclass_item, 9, -3.25, 0, 0]
			]);
			expect([EntityX(obj.h), EntityY(obj.h), EntityZ(obj.h)]).toEqual([5, 12.5, 6]);
			expect([EntityPitch(obj.h), EntityYaw(obj.h), EntityRoll(obj.h)].map((v) => Math.round(v * 100) / 100)).toEqual([10, 90, -20]);
			expect([EntityX(obj.ch), EntityY(obj.ch), EntityZ(obj.ch)]).toEqual([5, 12.5, 6]);
			expect([EntityX(frozen.h), EntityY(frozen.h), EntityZ(frozen.h)]).toEqual([1, 77, 3]);
			expect(EntityY(item.h)).toBe(-3.25);
			// u, i, t3d, lasttime
			expect([...Tup.list].map((u) => [u.mode, u.info, u.unit])).toEqual([[2, 45, 130]]);
			expect([frozen.freeze, vehicle.freeze, player.freeze]).toEqual([1, 0, 0]);
			expect([...T3d.list].map((t) => [t.class, t.id, t.txt, t.typ, t.offset, t.range])).toEqual([[Cclass_object, 7, 'Hello', 2, 15, 300]]);
			expect([G.map_lday, G.map_lhour, G.map_lminute, G.map_timeupdate]).toEqual([3, 14, 15, 1]);
		});

		it('load_recent: the list of recent files, newest first, at most 15', () => {
			load_recent();
			if (FileType('sys\\recent.cache') === 0) expect(Trecent.list.count).toBe(0);
			const s = WriteFile('sys/recent.cache');
			for (const l of ['a.s2', '', 'b.s2', 'c.s2']) WriteLine(s, l);
			CloseFile(s);
			load_recent();
			expect([...Trecent.list].map((r) => r.file)).toEqual(['a.s2', 'b.s2', 'c.s2']);
			load_recent('b.s2'); // moves to the front, the old entry is dropped
			expect([...Trecent.list].map((r) => r.file)).toEqual(['b.s2', 'a.s2', 'c.s2']);
			expect(readFileLines('sys\\recent.cache')).toEqual(['b.s2', 'a.s2', 'c.s2']);
			for (let i = 0; i < 20; i++) load_recent(`n${i}.s2`);
			// the read loop stops after 15 old entries (16 with the new one); the write loop after 15 lines
			expect(Trecent.list.count).toBe(16);
			const lines = readFileLines('sys\\recent.cache')!;
			expect(lines.length).toBe(15);
			expect(lines[0]).toBe('n19.s2');
			expect(lines[14]).toBe('n5.s2');
		});
	});

	// =================================================================================
	describe('e_save_map.bb', () => {
		it('save_map_extensions: the game state as mode 6 extensions, in the original order', () => {
			Object.assign(New(Tx), { mode: 6, key: 'stale' });
			const keep = Object.assign(New(Tx), { mode: 1, key: 'var', value: '1' });
			G.g_drive = 120;
			G.env_cweather = 2;
			G.gt = 5000;
			Object.assign(New(Ttimer), { typ: 1, parent_class: 1, parent_id: 7, duration: 900, start: 2000, mode: -1, scr: 'scr' });
			Object.assign(New(Ttimer), { typ: 0, parent_class: 0, parent_id: 0, duration: 10, start: 6000, mode: 3, scr: '' }); // started "in the future": 0
			Object.assign(New(Tunit), { id: 1, player_weapon: 30, player_ammo: 31 });
			Object.assign(New(Tunit), { id: 130, freeze: 1 });
			Object.assign(New(Tfrap), { parent_class: 1, parent_id: 7, y: 12.5, pitch: 10, roll: -20 });
			Object.assign(New(Tfrap), { parent_class: 3, parent_id: 9, y: f32(0.1), pitch: 0, roll: 0 });
			Object.assign(New(Tfrap), { parent_class: 1, parent_id: 7, y: 99, pitch: 0, roll: 0 }); // a second one for the same parent is deleted
			Object.assign(New(Tup), { mode: 2, info: 45, unit: 130 });
			Object.assign(New(T3d), { class: 1, id: 7, txt: 'Hello', typ: 2, offset: 15, range: 300 });
			G.map_lday = 3;
			G.map_lhour = 14;
			G.map_lminute = 15;

			save_map_extensions('sav');
			const rows = [...Tx.list].map((x) => [x.mode, x.key, x.value, x.stuff, x.parent_class, x.parent_id]);
			expect(rows).toEqual([
				[1, 'var', '1', '', 0, 0],
				[6, 'g_drive', '120', '', 0, 0],
				[6, 'env_cweather', '2', '', 0, 0],
				[6, 't', '1,900,3000,-1', 'scr', 1, 7], // start = gt - start
				[6, 't', '0,10,0,3', '', 0, 0],
				[6, 'w/a', '30', '', 30, 31],
				[6, 'f', '12.5,10.0,-20.0', '', 1, 7], // floats as Str() writes them
				[6, 'f', '0.1,0.0,0.0', '', 3, 9],
				[6, 'u', '130', '', 2, 45],
				[6, 'i', '', '', Cclass_unit, 130],
				[6, 't3d', 'Hello', '2,15,300', 1, 7],
				[6, 'lasttime', '', '3,14,15', 0, 0]
			]);
			expect(Tfrap.list.count).toBe(2);
			expect([...Tx.list][0]).toBe(keep);

			// mode "map": no g_drive / env_cweather; s_items=0: no w/a
			save_map_extensions('map', 0);
			expect([...Tx.list].map((x) => x.key)).toEqual(['var', 't', 't', 'f', 'f', 'u', 'i', 't3d', 'lasttime']);
		});

		it('save_map: 0 when the file cannot be created', async () => {
			expect(await save_map('no such dir\\x.s2', 'map', '')).toBe(0);
		});

		it('save_map "sav": events, the partial save flags, the camera angles', async () => {
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {});
			G.m_section = Csection_game_sp;
			flatTerrain(16, 0.5);
			G.map_skybox = 'sky';
			G.map_briefing = 'on:start {' + SEP_LINE + '}' + SEP_LINE;
			G.map_day = 4;
			G.map_hour = 13;
			G.map_minute = 37;
			G.map_fog = [1, 2, 3, 1];
			G.in_quickslot[2] = 44;
			const mk = <T extends { h: Handle }>(o: T, x: number, y: number, z: number, yaw = 0): T => {
				o.h = CreatePivot();
				PositionEntity(o.h, x, y, z);
				RotateEntity(o.h, 0, yaw, 0);
				return o;
			};
			mk(Object.assign(New(Tobject), { id: 1, typ: 5, health: 10, health_max: 20, daytimer: -3 }), 100, 0, -50, 45);
			mk(Object.assign(New(Tunit), { id: 1, typ: 1, health: 100, health_max: 100, ai_cx: 9, ai_cz: 9 }), 10, 20, 30);
			mk(Object.assign(New(Tunit), { id: 150, typ: 3, health: 5, health_max: 6, hunger: 1, thirst: 2, exhaustion: 3, ai_cx: 7, ai_cz: 8 }), 1, 2, 3);
			mk(Object.assign(New(Titem), { id: 1, typ: 44, count: 15, parent_class: Cclass_unit, parent_id: 1, parent_mode: 1 }), 0, 0, 0);
			mk(Object.assign(New(Titem), { id: 2, typ: 45, count: 2, parent_class: 0, parent_id: 0 }), 5, 6, 7);
			mk(Object.assign(New(Tinfo), { id: 3, typ: 1, vars: 'v' }), 1, 1, 1);
			Object.assign(New(Tstate), { typ: 7, parent_class: Cclass_unit, parent_id: 1, value: 3 });
			Object.assign(New(Tstate), { typ: 8, parent_class: Cclass_object, parent_id: 1, x: 1, value_s: 's' });
			Object.assign(New(Tx), { mode: 0, key: 'on:start', value: 'script', parent_class: 1, parent_id: 1 });
			Object.assign(New(Tx), { mode: 1, key: 'var', value: '5' });
			Object.assign(New(Tx), { mode: 1, key: 'tmp', value: '1', stuff: 'temp' });
			Object.assign(New(Tx), { mode: 2, key: 'diary', value: 'd' });
			Object.assign(New(Tx), { mode: 3, key: 'lock', value: '1' });
			Object.assign(New(Tx), { mode: 5, key: 'skill', value: '9' });
			RotateEntity(G.cam, 15, 30, 0);
			CreateDir('saves');
			SeedRnd(5);

			// everything
			expect(await save_map('saves\\t1.sav', 'sav', 'secret')).toBe(1);
			expect(calls.filter((c) => /event|parse_all/.test(c))).toEqual(['globalevent presave', 'parse_all', 'globalevent postsave']);
			const all = parseMap(readFileBytes('saves\\t1.sav')!);
			expect([all.headerLine, all.version, all.format, all.mode]).toEqual(['### Stranded II Mapfile \xa9by Unreal Software 2004-2007', '1.0.0.1', 'default', 'sav']);
			expect(code(all.passwordCoded, all.passwordKey, 1)).toBe('secret');
			expect(G.map_password).toBe('secret');
			expect([all.day, all.hour, all.minute, all.skybox, all.briefing]).toEqual([4, 13, 37, 'sky', G.map_briefing]);
			expect(all.fog).toEqual([1, 2, 3, 1]);
			expect(all.quickslots).toEqual(['0', '0', '44', '0', '0', '0', '0', '0', '0', '0']); // Int array written as text
			expect([all.colormapSize, all.terrainSize]).toEqual([64, 16]);
			expect(all.heights[0]).toBe(f32(127 * f32(1 / 255))); // 0.5 is stored as byte 127
			expect(all.grass.length).toBe(65 * 65);
			expect(all.objects).toEqual([{ id: 1, typ: 5, x: 100, z: -50, yaw: all.objects[0].yaw, health: 10, healthMax: 20, daytimer: -3 }]);
			expect(all.objects[0].yaw).toBeCloseTo(45, 4);
			expect(all.units.map((u) => u.id)).toEqual([1, 150]); // "sav": the players (id<100) are saved
			expect([all.units[1].aiCx, all.units[1].aiCz]).toEqual([7, 8]); // "sav": the AI centre is not refreshed
			expect(all.items.map((i) => i.id)).toEqual([1, 2]);
			expect(all.states.map((s) => s.typ)).toEqual([7, 8]);
			// the temp variable is dropped (and deleted), script keys are not saved, mode 6 comes last
			expect(all.extensions.map((x) => `${x.mode}:${x.key}`)).toEqual(['0:', '1:var', '2:diary', '3:lock', '5:skill', '6:g_drive', '6:env_cweather', '6:w/a', '6:lasttime']);
			expect([...Tx.list].map((x) => x.key)).toEqual(['on:start', 'var', 'diary', 'lock', 'skill']); // mode 6 deleted again
			expect(all.camera!.pitch).toBeCloseTo(15, 4);
			expect(all.camera!.yaw).toBeCloseTo(30, 4);
			expect(all.complete).toBe(true);

			// savemap command with everything switched off
			expect(await save_map('saves\\t2.s2', 'map', '', 0, 0, 0, 0, 0, 0)).toBe(1);
			const part = parseMap(readFileBytes('saves\\t2.s2')!);
			expect(part.units.map((u) => u.id)).toEqual([150]); // "map": only ids from 100
			expect([part.units[0].aiCx, part.units[0].aiCz]).toEqual([1, 3]); // "map": AI centre = position
			expect(part.items.map((i) => i.id)).toEqual([2]); // without the items of unit 1
			expect(part.states.map((s) => s.typ)).toEqual([8]); // without the states of unit 1
			expect(part.extensions.map((x) => `${x.mode}:${x.key}`)).toEqual(['0:', '6:lasttime']); // no vars, diary, locks, skills, w/a
			expect(part.camera).toBeUndefined();
		});
	});

	// =================================================================================
	describe('cull.bb', () => {
		const obj = (id: number, typ: number, z: number, withCh = false) => {
			const o = Object.assign(New(Tobject), { id, typ, h: CreateCube(), ch: withCh ? CreateCube() : null, alpha: 1 });
			PositionEntity(o.h, 0, 0, z);
			return o;
		};

		it('objects: hidden beyond the autofade cache distance, shown in view, kept for collision close by', async () => {
			recordEvents();
			const typ = 1;
			Dobject_afc.set(typ, 1000);
			Dobject_active.set(typ, 0);
			Dobject_swayspeed.set(typ, 0);
			const far = obj(1, typ, 1500);
			const inView = obj(2, typ, 300);
			const behindNear = obj(3, typ, -300);
			const behindFar = obj(4, typ, -700);
			const chFar = obj(5, typ, 1500, true);
			const chView = obj(6, typ, 300, true);
			const chBehindNear = obj(7, typ, -300, true);
			const chBehindFar = obj(8, typ, -700, true);
			G.set_debug_rt = 1;
			await cull();
			expect([far, inView, behindNear, behindFar].map((o) => visible(o.h))).toEqual([false, true, true, false]);
			// with a collision entity: the model is hidden behind the camera, the collision entity stays close by
			expect([chFar, chView, chBehindNear, chBehindFar].map((o) => [visible(o.h), visible(o.ch)])).toEqual([
				[false, false],
				[true, true],
				[false, true],
				[false, false]
			]);
			expect(G.set_debug_rt_objects).toMatch(/^\d+ ms Objects \(2\/8\)$/);
			expect(G.set_debug_rt_cull).toMatch(/^\d+ ms Cull$/);
			expect(G.TCobject).toBeNull(); // the loop variable is the global: Null after the loop
			expect(calls).toContain('parse_all');
			expect(calls).toContain('timer_update');
		});

		it('objects: wind sway and active objects', async () => {
			recordEvents();
			const typ = 1;
			Dobject_afc.set(typ, 1000);
			Dobject_active.set(typ, 1);
			Dobject_swayspeed.set(typ, 2);
			Dobject_swaypower.set(typ, 3);
			const o = obj(1, typ, 300);
			o.windsway = 359;
			G.f = 1.5;
			G.set_windsway = 1;
			await cull();
			// angle#=(angle#+swayspeed*f#) Mod 360 = 362 Mod 360 = 2; roll = Sin(2)*3
			expect(o.windsway).toBe(2);
			expect(EntityRoll(o.h)).toBeCloseTo(f32(Sin(2) * 3), 4);
			expect(calls).toContain('update_object_behaviour 1');
			G.set_windsway = 0;
			await cull();
			expect(o.windsway).toBe(2);
			// in the editor the timers are not updated
			calls = [];
			G.m_section = Csection_editor;
			await cull();
			expect(calls).not.toContain('timer_update');
		});

		it('units and infos in the game', async () => {
			recordEvents();
			Dunit_afc.set(2, 1000);
			const unit = (id: number, z: number) => {
				const u = Object.assign(New(Tunit), { id, typ: 2, h: CreatePivot() });
				PositionEntity(u.h, 0, 0, z);
				return u;
			};
			const player = unit(1, 5000);
			const near = unit(100, -300); // not in view, but near: units are not view-culled in the game
			const far = unit(101, 1500);
			G.g_player = 1;
			G.g_unpaused = 1;
			const info = (id: number, typ: number) => Object.assign(New(Tinfo), { id, typ, h: CreatePivot() });
			for (const [id, typ] of [
				[1, 9],
				[2, 10],
				[3, 29],
				[4, 30],
				[5, 40],
				[6, 41]
			])
				info(id, typ);
			G.in_t1000go = 1;
			G.map_timeupdate = 1;
			G.g_sleep = 1;
			G.set_debug_rt = 1;
			await cull();
			expect([visible(near.h), visible(far.h)]).toEqual([true, false]);
			void player;
			expect(calls.filter((c) => c.startsWith('update_unit'))).toEqual(['update_unit 1', 'update_unit 100']); // the player always, others when near
			expect(calls.filter((c) => c.startsWith('update_info'))).toEqual(['update_info 2', 'update_info 3', 'update_info 6']); // typ 10..29 and >40
			expect([G.map_timeupdate, G.g_sleep]).toEqual([0, 0]);
			expect(G.set_debug_rt_units).toMatch(/Units \(1\/3\)$/);
			expect(G.set_debug_rt_infos).toMatch(/Infos \(3\/6\)$/);

			// paused: nothing is updated; without the 1000 ms tick the infos are skipped
			calls = [];
			G.g_unpaused = 0;
			G.in_t1000go = 0;
			await cull();
			expect(calls.filter((c) => c.startsWith('update_'))).toEqual([]);
			// quirk: the info debug line then shows the numbers of the units
			expect(G.set_debug_rt_infos).toMatch(/Infos \(1\/3\)$/);
		});

		it('units and infos in the editor: view culling', async () => {
			recordEvents();
			G.m_section = Csection_editor;
			Dunit_afc.set(2, 1000);
			const unit = (id: number, z: number) => {
				const u = Object.assign(New(Tunit), { id, typ: 2, h: CreatePivot() });
				PositionEntity(u.h, 0, 0, z);
				return u;
			};
			const a = unit(100, 300);
			const b = unit(101, -300);
			const c = unit(102, 1500);
			const info = (z: number) => {
				const i = Object.assign(New(Tinfo), { typ: 1, h: CreatePivot() });
				PositionEntity(i.h, 0, 0, z);
				return i;
			};
			const i1 = info(300);
			const i2 = info(-300);
			const i3 = info(2500);
			await cull();
			expect([a, b, c].map((u) => visible(u.h))).toEqual([true, false, false]);
			expect([i1, i2, i3].map((i) => visible(i.h))).toEqual([true, false, false]);
			expect(calls.filter((x) => x.startsWith('update_'))).toEqual([]);
		});

		it('quicksave queue: modes, the load/save switch of game.inf, errors', async () => {
			recordEvents();
			const parse_error = vi.spyOn(RT.script, 'parse_error').mockImplementation(() => 0);
			const q = (mode: number, map = '') => Object.assign(New(Tin_quicksave), { mode, map, skills: 1, items: 1, vars: 1, diary: 1, states: 1, locks: 1 });
			// nothing happens while in_quicksave is 0
			q(5, 'maps\\nope.s2');
			G.in_quicksave = 0;
			await cull();
			expect(Tin_quicksave.list.count).toBe(1);
			expect(con).toEqual([]);

			// loadmap (5) of a missing file: load_map reports it; savemap (6) into a missing directory: script error
			q(6, 'no such dir\\x.s2');
			Object.assign(New(Tp), { typ: -1 });
			Object.assign(New(Tp), { typ: 20 });
			G.in_quicksave = 2;
			await cull();
			expect(con).toEqual([{ txt: 'Unable to load Map maps\\nope.s2', col: Cbmpf_red }]);
			expect(parse_error).toHaveBeenCalledWith('Failed to save no such dir\\x.s2');
			expect([...Tp.list].map((p) => p.typ)).toEqual([20]); // the typ -1 particles are deleted after a save
			expect(Tin_quicksave.list.count).toBe(0);
			expect(G.in_quicksave).toBe(0);
			expect(G.tmp_loadmapcmdmap).toBe('no such dir\\x.s2');

			// quicksave / quickload / autosave / autoload do nothing when game.inf switches load/save off
			G.game_m_loadsave = 0;
			for (const mode of [1, 2, 3, 4]) q(mode);
			G.in_quicksave = 1;
			con = [];
			await cull();
			expect(Tin_quicksave.list.count).toBe(0);
			expect(con).toEqual([]);
			expect(FileType('saves\\QUICKSAVE.sav')).toBe(0);
			expect(FileType('saves\\AUTOSAVE.sav')).toBe(0);
		});

		it('quicksave and quickload through save_map / load_map', async () => {
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {});
			vi.spyOn(RT.core, 'e_environment').mockImplementation(() => {});
			G.m_section = Csection_game_sp;
			await load_map('maps\\adventure\\map06.s2', '');
			const objects = Tobject.list.count;
			CreateDir('saves');
			G.game_m_loadsave = 1;
			Object.assign(New(Tin_quicksave), { mode: 1 });
			G.in_quicksave = 1;
			await cull();
			expect(FileType('saves\\QUICKSAVE.sav')).toBe(1);
			const sav = parseMap(readFileBytes('saves\\QUICKSAVE.sav')!);
			expect(sav.mode).toBe('sav');
			expect(sav.objects.length).toBe(objects);
			// quickload: e_clear() runs inside load_map and empties the queue while it is being walked
			Object.assign(New(Tobject), { id: 9999, h: CreatePivot() });
			Object.assign(New(Tin_quicksave), { mode: 2 });
			Object.assign(New(Tin_quicksave), { mode: 5, map: 'maps\\nope.s2' });
			G.in_quicksave = 1;
			con = [];
			await cull();
			expect(G.map_mode).toBe('sav');
			expect(Tobject.list.count).toBe(objects);
			expect(Tin_quicksave.list.count).toBe(0);
			expect(con.filter((c) => c.txt.startsWith('Unable'))).toEqual([]); // the second entry died with e_clear()
		});

		describe('cull_items', () => {
			const item = (id: number, y: number, o: Partial<Titem> = {}) => {
				const it = Object.assign(New(Titem), { id, typ: 1, h: CreatePivot(), ...o });
				PositionEntity(it.h, 0, y, 100);
				return it;
			};
			beforeEach(() => {
				Ditem_afc.set(1, 500);
				Ditem_afc.set(2, 500);
				Ditem_mat.set(1, Cmat_stone); // sinks
				Ditem_mat.set(2, Cmat_wood); // swims
				G.ter_groundy = -1000;
				G.g_unpaused = 1;
				G.f = 1;
				G.gt = 1500;
			});

			it('falling: accelerates over Cworld_facct ms, stops on the ground', () => {
				const a = item(1, 100, { phy_fall: 0 }); // 1500 ms -> perc 0.5
				const b = item(2, 100, { phy_fall: -9000 }); // capped at 3000 ms -> perc 1
				const c = item(3, -999, { phy_fall: 1500 }); // just above the ground (tery+3 = -997)
				Ditem_afc.set(1, 5000); // c is 1000 below the camera
				G.set_debug_rt = 1;
				cull_items();
				expect(EntityY(a.h)).toBeCloseTo(100 - 9.81 * 0.75, 4);
				expect(EntityY(b.h)).toBeCloseTo(100 - 9.81 * 1.5, 4);
				expect([a.phy_pause, b.phy_pause]).toEqual([0, 0]);
				// PositionEntity ...,tery#+1.: on the ground, physics paused
				expect(EntityY(c.h)).toBe(-999);
				expect([c.phy_pause, c.phy_fall]).toEqual([1, 1500]);
				expect(G.set_debug_rt_items).toMatch(/Items \(3\/3\)$/);
				// paused physics: the item no longer moves
				G.gt = 3000;
				cull_items();
				expect(EntityY(c.h)).toBe(-999);
			});

			it('swimming material: sinks to the surface, rises from below, wobbles at y=-1', () => {
				G.in_wa = 30;
				const above = item(1, 10, { typ: 2, phy_fall: 0 });
				const below = item(2, -5, { typ: 2 });
				const nearly = item(3, f32(-1.2), { typ: 2, phy_fall: 0 });
				const floating = item(4, -1, { typ: 2, phy_fall: 0 });
				cull_items();
				expect(EntityY(above.h)).toBeCloseTo(10 - 9.81 * 0.75, 4);
				expect(EntityY(below.h)).toBeCloseTo(-4.55, 5); // Escalate: 0.45*f#
				expect(EntityY(nearly.h)).toBe(-1); // passed the surface: set to -1
				expect(nearly.phy_fall).toBe(1500);
				expect(EntityY(floating.h)).toBe(-1);
				// RotateEntity h,Sin(in_wa#+id*20),yaw,Cos(in_wa#+id*20)
				expect(EntityPitch(floating.h)).toBeCloseTo(Sin(110), 3);
				expect(EntityRoll(floating.h)).toBeCloseTo(Cos(110), 3);
				expect(floating.phy_pause).toBe(0); // swimming items never pause
			});

			it('stored, hanging and distant items; the paused game', () => {
				const stored = item(1, 0, { parent_class: Cclass_unit, parent_mode: 1, parent_id: 1 });
				const hanging = item(2, 0, { parent_class: Cclass_object, parent_mode: 0, parent_id: 1 }); // Cpm_out
				const hangingBehind = item(3, 0, { parent_class: Cclass_object, parent_mode: 0, parent_id: 1 });
				PositionEntity(hangingBehind.h, 0, 0, -100);
				const distant = item(4, 50, {});
				PositionEntity(distant.h, 0, 50, 900);
				cull_items();
				expect([stored, hanging, hangingBehind, distant].map((i) => visible(i.h))).toEqual([false, true, false, false]);
				expect([stored, hanging, hangingBehind, distant].map((i) => i.phy_fall)).toEqual([1500, 1500, 1500, 1500]);
				expect(EntityY(hanging.h)).toBe(0); // no physics for hanging items
				expect(EntityY(distant.h)).toBe(50);

				// paused game: free items are shown but do not move; behind the camera they are hidden
				G.g_unpaused = 0;
				const free = item(5, 0, {});
				const freeBehind = item(6, 0, {});
				PositionEntity(freeBehind.h, 0, 0, -100);
				cull_items();
				expect(EntityY(free.h)).toBe(0);
				expect([visible(free.h), visible(freeBehind.h)]).toEqual([true, false]);

				// editor: no physics at all
				G.g_unpaused = 1;
				G.m_section = Csection_editor;
				cull_items();
				expect(EntityY(free.h)).toBe(0);
				expect([visible(free.h), visible(freeBehind.h), visible(stored.h), visible(hanging.h), visible(hangingBehind.h)]).toEqual([true, true, false, true, false]);
			});
		});
	});

	// =================================================================================
	describe('randommap.bb', () => {
		it('load_randommap: profile 1 of sys\\random_01_endless_e.inf', () => {
			G.random_c = 0;
			load_randommap(1);
			const t = [...Tran.list];
			const of = (cls: number) => t.filter((x) => x.class === cls);
			// counted by hand in the file: 74 object, 16 unit, 20 item entries
			expect([of(Cclass_object).length, of(Cclass_unit).length, of(Cclass_item).length]).toEqual([74, 16, 20]);
			// and the sums of their ratios
			const sum = (cls: number) => of(cls).reduce((n, x) => n + x.a, 0);
			expect([sum(Cclass_object), sum(Cclass_unit), sum(Cclass_item)]).toEqual([803, 260, 97]);
			expect([t[0].r1, t[0].r2, t[0].a, t[0].class, t[0].id]).toEqual([15, 255, 40, Cclass_object, 1]);
			// "objects=6,213": split$ with limit 0 returns Len("6,213")=5; the empty parts are skipped
			expect(of(Cclass_object).filter((x) => x.id === 213).length).toBe(1);
			// "ratio=10 / range=50,150 / units=19"
			const u19 = of(Cclass_unit).find((x) => x.id === 19)!;
			expect([u19.r1, u19.r2, u19.a]).toEqual([50, 150, 10]);
			const last = t[t.length - 1];
			expect([last.r1, last.r2, last.a, last.class, last.id]).toEqual([0, 30, 5, Cclass_item, 103]);
			// the script of the profile: every line trimmed, separated by byte 0xA6
			expect(G.random_script.startsWith('on:preload {' + SEP_LINE + '// Set Startpoint in Sea' + SEP_LINE)).toBe(true);
			expect(G.random_script.endsWith('}' + SEP_LINE)).toBe(true);
			expect(G.random_script).not.toContain('Raptor'); // scripts of other profiles are skipped
			// all four profile files are read for their names
			expect([G.Drprofile[1], G.Drprofile[2], G.Drprofile[3], G.Drprofile[4], G.Drprofile[5]]).toEqual(['Endless Game - Easy', 'Endless Game - Normal', 'Endless Game - Hard', '', 'Raptor Hunter']);
			expect(G.random_c).toBe(4);
			// quirk: random_c is never reset
			include_randommap(); // load_randommap(0): no profile has id 0
			expect(Tran.list.count).toBe(0);
			expect(G.random_script).toBe('');
			expect(G.random_c).toBe(8);
		});

		it('split$ returns its limit (the value load_randommap uses as loop end)', () => {
			expect(splitLimit(split('6,213', ',', 0))).toBe(5);
			expect(G.splits).toEqual(['6', '213', '', '', '', '']);
			expect(splitLimit(split('a,b,c', ',', 2))).toBe(2);
		});

		it('load_randommap: errors of a profile file', () => {
			const write = (lines: string[]) => {
				const s = WriteFile('sys\\random_zz_test.inf');
				for (const l of lines) WriteLine(s, l);
				CloseFile(s);
			};
			write(['id=51']);
			expect(() => load_randommap(0)).toThrow('ID between 1 and 50 expected!');
			write(['id=7', 'ratio=0']);
			expect(() => load_randommap(7)).toThrow("Invalid AMOUNT Value '0' - has to be at least 1 (sys\\random_zz_test.inf)");
			expect(() => load_randommap(1)).not.toThrow(); // not the profile that is read: not checked
			write(['id=7', 'range=5,1']);
			expect(() => load_randommap(7)).toThrow("Invalid RANGE Value '5,1' - first value has to be smaller than the second one (sys\\random_zz_test.inf)");
			write(['id=7', 'range=moon']);
			expect(() => load_randommap(7)).toThrow("Invalid RANGE Value 'moon' (sys\\random_zz_test.inf)");
			write(['id=7', 'colour=red']);
			expect(() => load_randommap(1)).toThrow("Invalid RANDOM Property 'colour' (sys\\random_zz_test.inf)");
			write(['id=7', '# comment=1', 'name = My Profile ', 'range=shallow water', 'amount=100', 'object=12', 'range=water', 'units=3, 4', 'script=start', ' a ', 'script=end']);
			load_randommap(7);
			expect(G.Drprofile[7]).toBe('My Profile');
			expect([...Tran.list].map((x) => [x.class, x.id, x.r1, x.r2, x.a])).toEqual([
				[Cclass_object, 12, -3, f32(-0.1), 100],
				[Cclass_unit, 3, -10000000, 0, 100],
				[Cclass_unit, 4, -10000000, 0, 100]
			]);
			expect(G.random_script).toBe('a' + SEP_LINE);
		});

		it('randommap: fills the pool by ratio and places things where the height fits', () => {
			recordEvents();
			flatTerrain(16, 0.8); // y=960 everywhere
			expect(randommap(5)).toBe(0);
			expect(con).toEqual([{ txt: 'ERROR: random.inf contains not enough information for random map filling (or does not exist)', col: Cbmpf_red }]);
			const tree = Object.assign(New(Tran), { class: Cclass_object, id: 10, a: 3, r1: 0, r2: 2000 });
			const fish = Object.assign(New(Tran), { class: Cclass_unit, id: 4, a: 2, r1: -5000, r2: -70 }); // never fits on this map
			const stone = Object.assign(New(Tran), { class: Cclass_item, id: 7, a: 4, r1: 900, r2: 1000 });
			calls = [];

			// objects and units only (items=0): pool of 3+2 handles
			SeedRnd(11);
			expect(randommap(40, 1, 1, 0)).toBe(0);
			expect(G.Drpool.slice(0, 5)).toEqual([HandleOf(Tran, tree), HandleOf(Tran, tree), HandleOf(Tran, tree), HandleOf(Tran, fish), HandleOf(Tran, fish)]);
			expect(G.Drpool.length).toBe(6); // Dim Drpool(t)
			// replay of the random numbers: Rand(0,t-1), then per try x, z, yaw; 100 tries for the fish
			SeedRnd(11);
			let trees = 0;
			for (let i = 1; i <= 40; i++) {
				const rid = Rand(0, 4);
				for (let retry = 0; retry <= 99; retry++) {
					Rand(-512, 512);
					Rand(-512, 512);
					Rand(360);
					if (rid < 3) {
						trees++;
						break;
					}
				}
			}
			const after = Rand(1, 1000000);
			expect(calls.filter((c) => c === 'set_object 10').length).toBe(trees);
			expect(calls.some((c) => c.startsWith('set_unit'))).toBe(false);
			expect(calls.filter((c) => c.startsWith('defvar_oncreate 1 ')).length).toBe(trees);
			expect(trees).toBeGreaterThan(0);
			expect(trees).toBeLessThan(40);
			SeedRnd(11);
			DeleteEach(Tobject);
			randommap(40, 1, 1, 0);
			expect(Rand(1, 1000000)).toBe(after); // the same number of random numbers was drawn
			// objects are placed inside the map, turned by Rand(360)
			for (const o of Tobject.list) {
				expect(Math.abs(EntityX(o.h))).toBeLessThanOrEqual(512);
				expect(Math.abs(EntityZ(o.h))).toBeLessThanOrEqual(512);
			}

			// items only
			calls = [];
			randommap(6, 0, 0, 1);
			expect(G.Drpool.length).toBe(5);
			expect(calls.filter((c) => c === 'set_item 7 x1').length).toBe(6);
			expect(calls.filter((c) => c.startsWith('defvar_oncreate 3 ')).length).toBe(6);
			void stone;
		});

		it('randomcreate: by class; 0 after 10000 failed tries', () => {
			flatTerrain(16, 0.8);
			G.object_serial = 40;
			expect(randomcreate(Cclass_object, 10, 0, 2000)).toBe(41);
			G.unit_serial = 140;
			G.m_section = Csection_game_sp;
			expect(randomcreate(Cclass_unit, 4, 0, 2000)).toBe(141);
			expect(calls).toContain('ai_ini 141');
			G.item_serial = 7;
			expect(randomcreate(Cclass_item, 44, 0, 2000, 15)).toBe(8);
			expect(calls).toContain('set_item 44 x15');
			expect(EntityY(G.TCitem!.h)).toBeCloseTo(960, 1); // items are created at the terrain height
			expect(randomcreate(4, 1, 0, 2000)).toBe(G.TCinfo!.id);
			expect(randomcreate(99, 1, 0, 2000)).toBe(0); // unknown class: id stays 0
			// a height that does not exist: 10000 tries with three random numbers each
			SeedRnd(21);
			calls = [];
			expect(randomcreate(Cclass_object, 10, 5000, 6000)).toBe(0);
			const after = Rand(1, 1000000);
			SeedRnd(21);
			for (let i = 0; i < 30000; i++) Rand(1, 2);
			expect(Rand(1, 1000000)).toBe(after);
			expect(calls).toEqual([]);
			// a creation that fails (set_object leaves TCobject Null): id 0
			vi.spyOn(handle_objects, 'set_object').mockImplementation(() => -1);
			expect(randomcreate(Cclass_object, 10, 0, 2000)).toBe(0);
		});

		it('randommapcreate: island, script, filling, player, events', async () => {
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {
				calls.push('preparse ' + (G.map_briefing === G.random_script ? 'random_script' : '?'));
			});
			vi.spyOn(RT.core, 'e_environment').mockImplementation(() => {
				calls.push('e_environment');
			});
			vi.spyOn(editor_functions, 'editor_defaultmapsettings').mockImplementation(() => {
				calls.push('editor_defaultmapsettings');
			});
			vi.spyOn(editor_functions, 'editor_genmap').mockImplementation(async () => {
				calls.push('editor_genmap');
				e_terrain(16, 'none');
				for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) ModifyTerrain(G.ter, x, z, 0.8);
			});
			vi.spyOn(editor_functions, 'editor_gencolormap').mockImplementation(async () => {
				calls.push('editor_gencolormap');
			});
			load_randommap(1);
			Object.assign(New(Tobject), { id: 5, h: CreatePivot() }); // from the previous map
			G.m_menu = 3;
			G.gt = 500;
			await randommapcreate();

			expect(G.m_section).toBe(Csection_game_sp);
			expect(G.map_briefing).toBe(G.random_script);
			const structure = calls.filter((c) => !/^(set_|ai_ini|defvar_oncreate)/.test(c));
			expect(structure).toEqual([
				'editor_defaultmapsettings',
				'editor_genmap',
				'editor_gencolormap',
				'e_environment',
				'preparse random_script',
				'globalevent preload',
				'sel_event preload',
				'game_playerspawn 1',
				'game_setplayer 1',
				'globalevent start',
				'globalevent load', // both global events first, then the object events
				'sel_event start',
				'sel_event load',
				'game_setcam m_menu=0'
			]);
			expect([G.g_player, G.tmp_loading, G.blackframe, G.gt, G.m_menu]).toEqual([1, 0, 10, 0, 0]); // m_menu: reset by e_clear()
			// count=(ter_size*ter_size)/4 = 64 things are tried; the old object is gone (e_clear)
			expect([...Tobject.list].some((o) => o.id === 5 && o.typ === 0)).toBe(false);
			const placed = calls.filter((c) => /^set_(object|unit|item)/.test(c)).length;
			expect(placed).toBeGreaterThan(0);
			expect(placed).toBeLessThanOrEqual(64);
			expect(Tobject.list.count + Tunit.list.count - 1 + Titem.list.count).toBe(placed);
		});
	});

	// =================================================================================
	/**
	 * The browser half of the bridge (_additions/map.ts) cannot run without
	 * WebGL. This stand-in has the members of WorldEnvironment the bridge and
	 * the facades use, with the real engine Terrain, TerrainState proxy and
	 * GrassCore behind them, so that the code path "RT.env exists" is executed.
	 */
	describe('bridge to the environment layer (stand-in layer)', () => {
		const MAP = 'maps\\adventure\\map06.s2';

		function installStandInEnvironment() {
			const env = {
				terrain: undefined as Terrain | undefined,
				terrainEditor: undefined as unknown,
				colormap: new Uint8Array(3),
				colormapSize: 1,
				grass: new GrassCore(),
				core: RT.core,
				entities: {
					get ter() {
						return G.ter;
					},
					set ter(v: Handle) {
						G.ter = v;
					}
				},
				log: [] as string[],
				gfx_waterimg_custom: new Uint8Array(1) as Uint8Array | undefined,
				waterAlpha: 0.5,
				async load() {
					env.log.push('load');
				},
				async loadSkyTextures() {
					env.log.push('loadSkyTextures ' + G.map_skybox);
				},
				// WorldEnvironment.adoptTerrain
				adoptTerrain(terrain: Terrain) {
					FreeEntity(env.entities.ter);
					const ter = RT.world.createProxy('Terrain', terrain.collider, {}, new TerrainState(terrain.collider));
					ScaleEntity(ter, 64, 3200, 64);
					PositionEntity(ter, -(64 * terrain.size) / 2, -1600, -(64 * terrain.size) / 2);
					env.entities.ter = ter;
					env.log.push('adoptTerrain ' + terrain.size);
				},
				// Environment.setColormapData
				setColormapData(colormap: Uint8Array, size: number) {
					env.colormap = colormap;
					env.colormapSize = size;
					env.log.push('setColormapData ' + size);
				},
				grass_spread: () => 0,
				render() {
					RT.world.renderWorld();
				},
				e_terrainground() {
					if (env.terrain) env.terrain.groundY = env.terrain.terrainY(env.terrain.origin, env.terrain.origin);
				},
				dispose() {}
			};
			installRuntime({ env: env as unknown as Runtime['env'] });
			return env;
		}

		it('load_map and save_map through the layer: same bytes, the layer holds terrain, colour map and grass', async () => {
			const env = installStandInEnvironment();
			recordEvents();
			vi.spyOn(RT.script, 'preparse').mockImplementation(() => {});
			vi.spyOn(RT.core, 'e_environment').mockImplementation(() => {
				env.log.push('e_environment');
			});
			const original = readFileBytes(MAP)!;
			const m = parseMap(original);
			G.m_section = Csection_editor;
			expect(await load_map(MAP, '')).toBe(1);

			// order: media before the terrain, the colour map with the terrain, the sky textures right before e_environment()
			expect(env.log).toEqual(['load', 'adoptTerrain ' + m.terrainSize, 'setColormapData ' + m.colormapSize, 'load', 'loadSkyTextures ' + m.skybox, 'e_environment']);
			// e_clear() reset the layer's own state
			expect([env.gfx_waterimg_custom, env.waterAlpha]).toEqual([undefined, 1]);
			// the terrain is the layer's, in the scene, and G.ter is its proxy
			const terrain = env.terrain!;
			expect(terrain.size).toBe(m.terrainSize);
			expect(terrain.mesh.parent).toBe(RT.world.scene);
			expect(TerrainSize(G.ter)).toBe(m.terrainSize);
			const n = m.terrainSize + 1;
			expect(terrain.collider.getHeight(5, 9)).toBe(TerrainHeight(G.ter, 5, 9));
			expect(TerrainHeight_exe(G.ter, 5, 9)).toBe(m.heights[5 * n + 9]);
			// colour map and grass flags are in the layer's storage
			expect(env.colormapSize).toBe(m.colormapSize);
			expect([...env.colormap]).toEqual([...m.colormap]);
			const cs = m.colormapSize;
			expect(env.grass.grass_mapsize).toBe(cs);
			for (const i of [0, 7 * (cs + 1) + 11, (cs + 1) * (cs + 1) - 1]) expect(env.grass.grass_rgb[i * 4 + 3]).toBe(m.grass[i]);
			expect(G.grass_rgb.length).toBe(1); // G.grass_rgb is not used when the layer exists
			// e_tery is the layer's, with the ground level load_map computed
			expect(terrain.groundY).toBe(G.ter_groundy);
			expect(e_tery(100000, 100000)).toBe(G.ter_groundy);
			G.ter_groundy = 0;
			e_terrainground();
			expect(G.ter_groundy).toBe(terrain.groundY); // layer -> G

			// save: identical after the password line
			await save_map('maps\\__env.s2', 'map', '');
			const saved = readFileBytes('maps\\__env.s2')!;
			const after = (b: Uint8Array) => {
				let p = 0;
				for (let i = 0; i < 12; i++) p = b.indexOf(10, p) + 1;
				p += 96 * 72 * 3 + 1;
				return b.subarray(b.indexOf(10, p) + 1);
			};
			expect(Buffer.from(after(saved)).equals(Buffer.from(after(original)))).toBe(true);

			// the layer replaced its colour map (e_terraincm / e_terraincmscale): save_map writes the new one
			const small = new Uint8Array(16 * 16 * 3).fill(0);
			small[(3 * 16 + 4) * 3 + 1] = 200;
			env.setColormapData(small, 16);
			await save_map('maps\\__env2.s2', 'map', '');
			const m2 = parseMap(readFileBytes('maps\\__env2.s2')!);
			expect(m2.colormapSize).toBe(16);
			expect([...m2.colormap]).toEqual([...small]);
			expect(TextureHeight(G.ter_tex_color)).toBe(16);

			// e_clear: the terrain leaves the scene and the layer
			e_clear();
			expect(terrain.mesh.parent).toBeNull();
			expect([env.terrain, env.terrainEditor, G.ter]).toEqual([undefined, undefined, null]);
		});
	});
});
