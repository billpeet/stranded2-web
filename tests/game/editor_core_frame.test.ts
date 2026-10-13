/**
 * editor_core: editor.bb (game/editor.ts), the per-frame function of the editor.
 * Other packages' functions are mocked; expected values come from reading editor.bb.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CreateCube,
	CreatePivot,
	CreateTerrain,
	CreateTexture,
	EntityPickMode,
	EntityPitch,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	ModifyTerrain,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	TextureBuffer,
	type BBEntity
} from '../../src/lib/s2/bb3d';
import { SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { ReadPixelFast, WritePixelFast } from '../../src/lib/s2/gfx2d';
import { injectKeyDown, injectKeyUp, injectMouseDelta, injectMouseDown, injectMouseMove, injectMouseUp, injectWheel } from '../../src/lib/s2/input';
import {
	Cbmpf_red,
	Cclass_info,
	Cclass_object,
	Cclass_unit,
	Cmenu_ed_infos,
	Cmenu_ed_objects,
	Cp_shockwave,
	Csection_editor,
	Cworld_height,
	Cworld_size
} from '../../src/lib/s2/game/consts';
import * as cull from '../../src/lib/s2/game/cull';
import { Dinfo_name, loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import * as env from '../../src/lib/s2/game/e_environment';
import * as e_save_map from '../../src/lib/s2/game/e_save_map';
import { editor } from '../../src/lib/s2/game/editor';
import * as editor_menus from '../../src/lib/s2/game/editor_menus';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as gui from '../../src/lib/s2/game/gui';
import * as handle_all from '../../src/lib/s2/game/handle_all';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { se, ss } from '../../src/lib/s2/game/load_strings';
import * as motionblur from '../../src/lib/s2/game/motionblur';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, First, New, TYPES, Tgroupl, Tinfo, Titem, Tobject, Tp, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

describe.skipIf(!existsSync(MOD))('editor_core: editor.bb', () => {
	let now = 0;
	let m: ReturnType<typeof frameMocks>;

	/** Everything editor() calls in other packages that is not a facade. */
	function frameMocks() {
		return {
			cull: vi.spyOn(cull, 'cull').mockImplementation(async () => {}),
			mb_update: vi.spyOn(motionblur, 'mb_update').mockImplementation(async () => {}),
			update_state: vi.spyOn(handle_states, 'update_state').mockImplementation(() => {}),
			draw_info: vi.spyOn(handle_infos, 'draw_info').mockImplementation(() => {}),
			editor_menus: vi.spyOn(editor_menus, 'editor_menus').mockImplementation(async () => {}),
			editor_setmenu: vi.spyOn(editor_menus, 'editor_setmenu').mockImplementation(() => {}),
			p_update: vi.spyOn(particles, 'p_update').mockImplementation(() => {}),
			p_add: vi.spyOn(particles, 'p_add').mockImplementation(() => {
				const p = New(Tp);
				p.h = CreatePivot();
				G.TCp = p;
			}),
			drawaxes: vi.spyOn(functions, 'drawaxes').mockImplementation(() => {})
		};
	}

	/** A pickable terrain at world height ~0 below the camera, which looks straight down at its centre. */
	function terrainUnderMouse(): BBEntity {
		const t = CreateTerrain(16);
		ScaleEntity(t, Cworld_size, Cworld_height, Cworld_size);
		PositionEntity(t, -((Cworld_size * 16) / 2), -(Cworld_height / 2), -((Cworld_size * 16) / 2));
		for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) ModifyTerrain(t, x, z, 0.5);
		EntityPickMode(t, 2, 1);
		G.ter = t;
		G.ter_size = 16;
		G.ter_tex_color = CreateTexture(32, 32);
		PositionEntity(G.cam, 10, 300, 20);
		RotateEntity(G.cam, 90, 0, 0);
		injectMouseMove(400, 300);
		return t;
	}

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		if (G.env_ground === null) G.env_ground = CreatePivot();
		// no terrain: in_pe=0 would equal ter=0 and the terrain menu would edit (as in the original); keep them apart
		G.ter = CreateTerrain(16); // not pickable
		G.m_section = Csection_editor;
		G.m_menu = 0;
		G.in_editor_sidebar = 0;
		injectMouseMove(400, 300);
		m = frameMocks();
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

	it('with a menu open: no world update, no camera, no pick; menus, particles and input still run', async () => {
		G.m_menu = 5;
		G.g_unpaused = 0;
		G.in_edoverinfo = 'old';
		injectKeyDown(17);
		await editor();
		expect(G.g_unpaused).toBe(1);
		expect(G.in_edoverinfo).toBe('');
		expect(m.cull).not.toHaveBeenCalled();
		expect(m.mb_update).not.toHaveBeenCalled();
		expect(m.update_state).not.toHaveBeenCalled();
		expect(m.draw_info).not.toHaveBeenCalled();
		expect(m.editor_menus).toHaveBeenCalledOnce();
		expect(m.p_update).toHaveBeenCalledOnce();
		expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([0, 0, 0]);
		expect(G.in_pe).toBeNull(); // getinput resets it, nothing is picked
		injectKeyUp(17);
	});

	it('without a menu: one world frame; W/S/A/D move the camera with growing speed', async () => {
		G.set_debug_rt = 1;
		injectKeyDown(17);
		await editor();
		expect(m.cull).toHaveBeenCalledOnce();
		expect(m.mb_update).toHaveBeenCalledOnce();
		expect(m.update_state).toHaveBeenCalledOnce();
		expect(m.draw_info).toHaveBeenCalledOnce();
		expect(m.editor_menus).toHaveBeenCalledOnce();
		expect(m.p_update).toHaveBeenCalledOnce();
		// the test clock advances 20 ms per MilliSecs()
		expect(G.set_debug_rt_updateworld).toBe('20 ms Update');
		expect(G.set_debug_rt_render).toBe(20);
		// camspeed=(2+in_accelerate)*f, then in_accelerate+=f/0.5. f# of a frame is what the last endinput() computed.
		expect(EntityZ(G.cam)).toBe(2); // first frame: f=1
		expect(G.in_accelerate).toBe(2);
		let f = G.f;
		expect(f).toBeGreaterThan(0);
		const z1 = EntityZ(G.cam);
		const acc1 = G.in_accelerate;
		await editor();
		expect(EntityZ(G.cam)).toBe(f32(z1 + f32(f32(2 + acc1) * f)));
		expect(G.in_accelerate).toBe(f32(acc1 + f32(f / 0.5)));
		// capped at 30
		G.in_accelerate = 29.99;
		await editor();
		expect(G.in_accelerate).toBe(30);
		injectKeyUp(17);
		// no key: acceleration back to 0
		const z3 = EntityZ(G.cam);
		await editor();
		expect(G.in_accelerate).toBe(0);
		expect(EntityZ(G.cam)).toBe(z3);
		// S and D
		injectKeyDown(31);
		injectKeyDown(32);
		f = G.f;
		await editor();
		expect(EntityZ(G.cam)).toBe(f32(z3 - f32(2 * f)));
		expect(EntityX(G.cam)).toBe(f32(2 * f));
		injectKeyUp(31);
		injectKeyUp(32);
		// A
		const x5 = EntityX(G.cam);
		const acc5 = G.in_accelerate;
		expect(acc5).toBeGreaterThan(0);
		injectKeyDown(30);
		f = G.f;
		await editor();
		expect(EntityX(G.cam)).toBe(f32(x5 - f32(f32(2 + acc5) * f))); // still accelerated from the frame before
		injectKeyUp(30);
	});

	it('right mouse button turns the camera; pitch stops at +-70', async () => {
		injectMouseDown(2);
		injectMouseDelta(12, 6);
		await editor();
		expect(G.in_cursorf).toBe(2);
		expect(G.in_mxs).not.toBe(0);
		expect(G.in_mys).not.toBe(0);
		expect((((EntityYaw(G.cam) - G.in_mxs) % 360) + 360 + 180) % 360).toBeCloseTo(180, 3); // the same angle
		expect(EntityPitch(G.cam)).toBeCloseTo(G.in_mys, 3);
		const up = G.in_mys > 0 ? 1 : -1;
		// far beyond the limit
		RotateEntity(G.cam, 69 * up, 0, 0);
		injectMouseDelta(0, 400);
		await editor();
		expect(EntityPitch(G.cam)).toBeCloseTo(70 * up, 3);
		injectMouseUp(2);
	});

	it('picks under the mouse every frame; the object menu places an object on the terrain', async () => {
		const ter = terrainUnderMouse();
		G.in_opt[0] = 1;
		G.object_count_e = 1;
		G.in_object_sel = 7;
		G.in_edrandrot = 1;
		G.in_edrot = 45;
		const placed = CreatePivot();
		PositionEntity(placed, 10, 0, 20);
		const serial = vi.spyOn(handle_objects, 'serialpeak_object').mockImplementation(() => {});
		const set_object = vi.spyOn(handle_objects, 'set_object').mockImplementation(() => {
			const o = New(Tobject);
			o.id = 77;
			o.h = placed;
			G.TCobject = o;
			return 77;
		});
		const get_object = vi.spyOn(handle_objects, 'get_object').mockReturnValue(-1);
		const draw_object = vi.spyOn(handle_objects, 'draw_object').mockImplementation(() => {});
		const setscript = vi.spyOn(RT.script, 'parse_editorsetscript').mockImplementation(() => {});

		// frame 1: only the pick
		await editor();
		expect(G.in_pe).toBe(ter);
		expect(G.in_px).toBeCloseTo(10, 1);
		expect(G.in_pz).toBeCloseTo(20, 1);
		expect(Math.abs(G.in_py)).toBeLessThan(10);
		expect(set_object).not.toHaveBeenCalled();
		expect(get_object).not.toHaveBeenCalled(); // in_pe=ter: no info text
		// the list of the (empty) group was built
		expect(G.ed_current_class).toBe(Cclass_object);
		expect(G.ed_current_c).toBe([...DEFS.objects.byId.values()].filter((d) => d.name !== '' && d.ined !== 0).length);
		expect(First(Tgroupl)).not.toBeNull();

		// frame 2: click
		injectMouseDown(1);
		await editor();
		expect(serial).toHaveBeenCalledOnce();
		expect(set_object).toHaveBeenCalledWith(-1, 7, G.in_px, G.in_pz, 45);
		expect(G.in_turnh).toBe(placed);
		// in_edrot#=Rand(15)*22.5
		expect(G.in_edrot % 22.5).toBe(0);
		expect(G.in_edrot).toBeGreaterThanOrEqual(22.5);
		expect(G.in_edrot).toBeLessThanOrEqual(337.5);
		// editor_setfx: five shock waves at the new object
		expect(m.p_add.mock.calls.map((c) => [c[1], c[3], c[4], c[5]])).toEqual([
			[-10, Cp_shockwave, 10, 0.5],
			[-5, Cp_shockwave, 20, 0.5],
			[0, Cp_shockwave, 30, 0.5],
			[5, Cp_shockwave, 20, 0.5],
			[10, Cp_shockwave, 10, 0.5]
		]);
		expect(setscript).toHaveBeenCalledWith(Cclass_object, 77);
		expect(draw_object).not.toHaveBeenCalled();

		// frame 3: button held: the turn handle follows the mouse, the cursor is the turn cursor
		await editor();
		expect(G.in_cursorf).toBe(4);
		expect(m.drawaxes).toHaveBeenCalledWith(placed, 20);
		expect(set_object).toHaveBeenCalledOnce();

		// frame 4: released
		injectMouseUp(1);
		await editor();
		expect(G.in_turnh).toBeNull();
	});

	it('object menu: shift places on top of another entity through parent_pos; a click on an object opens its menu', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 1;
		G.object_count_e = 1;
		G.in_object_sel = 7;
		G.in_edrandrot = 0;
		G.in_edrot = 90;
		// something else under the mouse
		const cube = CreateCube();
		PositionEntity(cube, 10, 50, 20);
		ScaleEntity(cube, 20, 20, 20);
		EntityPickMode(cube, 2, 1);
		const placed = CreatePivot();
		PositionEntity(placed, 1, 2, 3);
		vi.spyOn(handle_objects, 'serialpeak_object').mockImplementation(() => {});
		const set_object = vi.spyOn(handle_objects, 'set_object').mockImplementation(() => {
			const o = New(Tobject);
			o.id = 78;
			o.h = placed;
			G.TCobject = o;
			return 78;
		});
		const get_object = vi.spyOn(handle_objects, 'get_object').mockReturnValue(5);
		const draw_object = vi.spyOn(handle_objects, 'draw_object').mockImplementation(() => {});
		vi.spyOn(RT.script, 'parse_editorsetscript').mockImplementation(() => {});
		const ha_getclass = vi.spyOn(handle_all, 'ha_getclass').mockImplementation(() => {
			G.tmp_class = Cclass_unit;
			G.tmp_id = 4;
			return 1;
		});
		const parent_pos = vi.spyOn(parentchild, 'parent_pos').mockImplementation(() => {
			G.tmp_x = 100;
			G.tmp_y = 55.5;
			G.tmp_z = 200;
			return 1;
		});
		const ha_setpos = vi.spyOn(handle_all, 'ha_setpos').mockImplementation(() => {});

		// hover: info text of the object under the mouse
		await editor();
		expect(G.in_pe).toBe(cube);
		expect(get_object).toHaveBeenCalledWith(cube);
		expect(draw_object).toHaveBeenCalledOnce();

		// click without shift: the object's menu
		injectMouseDown(1);
		await editor();
		expect(m.editor_setmenu).toHaveBeenCalledWith(Cmenu_ed_objects, 5);
		expect(set_object).not.toHaveBeenCalled();
		injectMouseUp(1);
		await editor();

		// shift+click: on top of it
		injectKeyDown(42);
		injectMouseDown(1);
		await editor();
		expect(ha_getclass).toHaveBeenCalledWith(cube, 0);
		expect(parent_pos).toHaveBeenCalledWith(Cclass_unit, 4);
		expect(set_object).toHaveBeenCalledWith(-1, 7, 100, 200, 90);
		// EntityY of the new object (2) <> tmp_y: moved, with the positions as strings
		expect(ha_setpos).toHaveBeenCalledWith(placed, Cclass_object, 78, '100.0', '55.5', '200.0');
		expect(G.in_edrot).toBe(90); // no random rotation
		injectKeyUp(42);
		injectMouseUp(1);
	});

	it('object/unit/item menus need editor definitions', async () => {
		G.in_opt[0] = 1;
		G.object_count_e = 0;
		await expect(editor()).rejects.toThrow('No editor objects defined!');
		G.in_opt[0] = 2;
		G.unit_count_e = 0;
		await expect(editor()).rejects.toThrow('No editor units defined!');
		G.in_opt[0] = 3;
		G.item_count_e = 0;
		await expect(editor()).rejects.toThrow('No editor items defined!');
	});

	it('terrain menu: DEL removes everything inside the brush circle, items only when not stored', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 0;
		G.in_edbrush = 1; // radius Cworld_size*(1+1)=128 around the picked point (10,20)
		const at = (x: number, z: number): BBEntity => {
			const h = CreatePivot();
			PositionEntity(h, x, 0, z);
			return h;
		};
		const mk = <T extends { id: number; h: unknown }>(o: T, id: number, x: number, z: number): T => {
			o.id = id;
			o.h = at(x, z);
			return o;
		};
		mk(New(Tobject), 1, 10, 20);
		mk(New(Tobject), 2, 10 + 127, 20);
		mk(New(Tobject), 3, 10 + 129, 20);
		mk(New(Tunit), 4, 10, 20 - 100);
		mk(New(Tunit), 5, 500, 500);
		mk(New(Titem), 6, 10, 20);
		mk(New(Titem), 7, 10, 20).parent_class = Cclass_unit;
		mk(New(Tinfo), 8, 20, 20);
		mk(New(Tinfo), 9, -400, 20);
		const free_object = vi.spyOn(handle_objects, 'free_object').mockReturnValue(1);
		const free_unit = vi.spyOn(handle_units, 'free_unit').mockReturnValue(1);
		const free_item = vi.spyOn(handle_items, 'free_item').mockReturnValue(1);
		const free_info = vi.spyOn(handle_infos, 'free_info').mockReturnValue(1);
		await editor(); // pick
		expect(free_object).not.toHaveBeenCalled();
		injectKeyDown(211);
		await editor();
		injectKeyUp(211);
		expect(free_object.mock.calls).toEqual([[1], [2]]);
		expect(free_unit.mock.calls).toEqual([[4]]);
		expect(free_item.mock.calls).toEqual([[6]]);
		expect(free_info.mock.calls).toEqual([[8]]);
	});

	it('terrain menu: the left button paints the colour map at the picked point (plot mode: on the click only)', async () => {
		terrainUnderMouse();
		const tb = TextureBuffer(G.ter_tex_color)!;
		for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) WritePixelFast(x, y, 0xff000000 | 0, tb);
		G.in_opt[0] = 0;
		G.in_edbrush = 2;
		G.in_col[0] = 255;
		G.in_col[1] = 128;
		G.in_col[2] = 0;
		G.in_edterbtool = 0;
		await editor();
		// world (10,20) on a 1024 wide terrain with a 32 pixel map: pixel (16,17) (16.3, 16.6)
		const pxl = () => ReadPixelFast(16, 17, tb) & 0xffffff;
		expect(pxl()).toBe(0);
		injectMouseDown(1);
		await editor();
		expect(pxl()).toBe(0xff8000);
		// held: plot mode paints once
		WritePixelFast(16, 17, 0xff000000 | 0, tb);
		await editor();
		expect(pxl()).toBe(0);
		// line mode: paints while the button is down
		G.in_edterbtool = 1;
		await editor();
		expect(pxl()).toBe(0xff8000);
		injectMouseUp(1);
	});

	it('info menu: hover shows the info name, SPACE starts free positioning, which ends when the info is gone', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 4;
		const cube = CreateCube();
		PositionEntity(cube, 10, 50, 20);
		ScaleEntity(cube, 20, 20, 20);
		EntityPickMode(cube, 2, 1);
		const typ = [...DEFS.infos.byId.values()].find((d) => d.name !== '')!.id;
		const info = New(Tinfo);
		info.id = 3;
		info.typ = typ;
		info.h = cube;
		let found = 3;
		const get_info = vi.spyOn(handle_infos, 'get_info').mockImplementation(() => {
			if (found > -1) G.TCinfo = info;
			return found;
		});
		const frap_info = vi.spyOn(handle_infos, 'frap_info').mockImplementation(() => {});
		const free_info = vi.spyOn(handle_infos, 'free_info').mockReturnValue(1);

		await editor();
		expect(G.in_pe).toBe(cube);
		expect(G.in_edoverinfo).toBe(ss(se(197), Dinfo_name(typ)));
		expect(G.in_fraph).toBeNull();
		expect(free_info).not.toHaveBeenCalled();
		// the list selects the first info of the list when nothing is selected
		expect(G.in_info_sel).toBe(First(Tgroupl)!.id);

		injectKeyDown(57);
		await editor();
		injectKeyUp(57);
		expect(G.in_fraph).toBe(cube);
		expect(frap_info).not.toHaveBeenCalled();

		await editor();
		expect(get_info).toHaveBeenLastCalledWith(cube);
		expect(frap_info).toHaveBeenCalledOnce();
		expect(G.in_fraph).toBe(cube);

		found = -1;
		await editor();
		expect(frap_info).toHaveBeenCalledOnce();
		expect(G.in_fraph).toBeNull();

		// click on the info: its menu
		found = 3;
		injectMouseDown(1);
		await editor();
		injectMouseUp(1);
		expect(m.editor_setmenu).toHaveBeenCalledWith(Cmenu_ed_infos, 3);
	});

	it('info menu: a click on the terrain sets an info at the picked point', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 4;
		G.in_info_sel = 12;
		const placed = CreatePivot();
		const serial = vi.spyOn(handle_infos, 'serialpeak_info').mockImplementation(() => {});
		const set_info = vi.spyOn(handle_infos, 'set_info').mockImplementation(() => {
			const o = New(Tinfo);
			o.id = 31;
			o.h = placed;
			G.TCinfo = o;
			return 31;
		});
		vi.spyOn(handle_infos, 'get_info').mockReturnValue(-1);
		const setscript = vi.spyOn(RT.script, 'parse_editorsetscript').mockImplementation(() => {});
		await editor();
		injectMouseDown(1);
		await editor();
		injectMouseUp(1);
		expect(serial).toHaveBeenCalledOnce();
		expect(set_info).toHaveBeenCalledWith(-1, 12, G.in_px, G.in_py, G.in_pz);
		expect(G.in_turnh).toBe(placed);
		expect(setscript).toHaveBeenCalledWith(Cclass_info, 31);
		expect(m.p_add).toHaveBeenCalledTimes(5);
	});

	it('the dummy follows the picked terrain point, turns in 22.5 degree steps with the wheel, hides elsewhere', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 4;
		vi.spyOn(handle_infos, 'get_info').mockReturnValue(-1);
		const dummy = CreatePivot();
		G.in_editor_dummy = dummy;
		G.in_edrot = 337.5;
		await editor();
		expect(EntityX(dummy)).toBeCloseTo(10, 1);
		expect(EntityZ(dummy)).toBeCloseTo(20, 1);
		expect(EntityY(dummy)).toBeCloseTo(G.in_py, 1);
		expect(EntityYaw(dummy)).toBeCloseTo(-22.5, 3); // 337.5
		expect(dummy.obj.visible).toBe(true);
		injectWheel(120);
		await editor();
		expect(G.in_edrot).toBe(0); // (337.5+22.5) Mod 360
		injectWheel(-120);
		await editor();
		expect(G.in_edrot).toBe(-22.5); // quirk: Mod keeps the sign
		// free positioning active: hidden
		const other = CreatePivot();
		G.in_fraph = other;
		vi.spyOn(handle_infos, 'frap_info').mockImplementation(() => {});
		vi.spyOn(handle_infos, 'get_info').mockReturnValue(1);
		await editor();
		expect(dummy.obj.visible).toBe(false);
		// menu open: the dummy is not touched
		vi.spyOn(handle_infos, 'get_info').mockReturnValue(-1);
		G.in_fraph = null;
		G.m_menu = 3;
		await editor();
		expect(dummy.obj.visible).toBe(false);
	});

	it('terrain menu: the wheel edits the picked grid cell with the selected tool', async () => {
		terrainUnderMouse();
		G.in_opt[0] = 0;
		G.in_edbrush = 4;
		const trans = vi.spyOn(env, 'e_terraintrans').mockImplementation(() => {});
		const flatten = vi.spyOn(env, 'e_terrainflatten').mockImplementation(() => {});
		const smoothp = vi.spyOn(env, 'e_terrainsmoothp').mockImplementation(() => {});
		const distortp = vi.spyOn(env, 'e_terraindistortp').mockImplementation(() => {});
		await editor();
		expect(trans).not.toHaveBeenCalled();
		// picked (10,20): x=(10+16/2*64)/64=8.2 -> 8, z=8.3 -> 8
		G.in_edtertool = 0;
		injectWheel(240);
		await editor();
		expect(trans.mock.calls).toEqual([[8, 8, f32(f32(0.01) * 2), 5]]);
		G.in_edtertool = 1;
		injectWheel(-120);
		await editor();
		expect(flatten.mock.calls).toEqual([[8, 8, 5]]);
		G.in_edtertool = 2;
		injectWheel(120);
		await editor();
		expect(smoothp.mock.calls).toEqual([[8, 8, 5]]);
		G.in_edtertool = 3;
		injectWheel(-120);
		await editor();
		expect(distortp.mock.calls).toEqual([[8, 8, f32(f32(0.01) * -1), 5]]);
		expect(trans).toHaveBeenCalledOnce();
		expect(G.in_edbrush).toBe(4); // sidebar hidden: the wheel does not change the brush
	});

	it('state menu: selects the first defined state', async () => {
		G.in_opt[0] = 5;
		G.in_editor_sidebar = 1;
		await editor();
		expect(G.in_state_sel).toBe(Math.min(...[...DEFS.states.byId.values()].filter((d) => d.name !== '').map((d) => d.id)));
		expect(G.in_state_scr).toBe(0);
	});

	it('F12 tests the map', async () => {
		const save = vi.spyOn(e_save_map, 'save_map').mockImplementation(async () => 0);
		const msg = vi.spyOn(gui, 'gui_msg').mockImplementation(async () => {});
		await editor();
		expect(save).not.toHaveBeenCalled();
		injectKeyDown(88);
		await editor();
		injectKeyUp(88);
		expect(m.editor_setmenu).toHaveBeenCalledWith(0);
		expect(save).toHaveBeenCalledWith('maps\\editor\\checkmap.s2', 'map', '');
		expect(msg).toHaveBeenCalledWith(se(205), Cbmpf_red);
		expect(G.set_debug).toBe(1);
	});
});
