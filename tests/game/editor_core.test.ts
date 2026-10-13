/**
 * editor_core: editor_functions.bb (game/editor_functions.ts). Expected values are
 * derived from reading the original code, see the comments at each test.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CreatePivot,
	CreateTerrain,
	CreateTexture,
	EntityPitch,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	ModifyTerrain,
	PositionEntity,
	ScaleEntity,
	TerrainHeight,
	TextureBuffer,
	TextureHeight,
	type BBEntity
} from '../../src/lib/s2/bb3d';
import { Int, Rand, Rnd, SEP_LINE, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { BackBuffer, Color, ColorGreen, ColorRed, CreateImage, ImageBuffer, ImageHeight, ReadPixelFast, SetBuffer, WritePixelFast } from '../../src/lib/s2/gfx2d';
import * as con from '../../src/lib/s2/game/console';
import {
	Cbmpf_red,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_ed_colormap,
	Cmenu_ed_heightmap,
	Cp_shockwave,
	Csection_editor,
	Csection_game_sp,
	Cworld_height,
	Cworld_size
} from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import * as e_clear from '../../src/lib/s2/game/e_clear';
import * as env from '../../src/lib/s2/game/e_environment';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import * as e_save_map from '../../src/lib/s2/game/e_save_map';
import {
	editor_buffergamma,
	editor_buffergetcolor,
	editor_bufferpaint,
	editor_bufferpaint_apm,
	editor_bufferpaintgrassmap,
	editor_buffertoheightmap,
	editor_buffertotex,
	editor_bufferwin,
	editor_defaultmapsettings,
	editor_gencolormap,
	editor_gencolormap_apm,
	editor_genmap,
	editor_genmap_hill,
	editor_getskybox,
	editor_grassmaptobuffer,
	editor_heightmaptobuffer,
	editor_ini,
	editor_ini_sc,
	editor_jumpto,
	editor_list,
	editor_paintcm,
	editor_picking,
	editor_quit,
	editor_range,
	editor_resetcam,
	editor_setfx,
	editor_setmode,
	editor_settoterrain,
	editor_testmap,
	editor_textobuffer
} from '../../src/lib/s2/game/editor_functions';
import * as editor_menus from '../../src/lib/s2/game/editor_menus';
import { CloseFile, CreateDir, WriteFile, WriteLine } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as gui from '../../src/lib/s2/game/gui';
import * as load_bmpf from '../../src/lib/s2/game/load_bmpf';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { se } from '../../src/lib/s2/game/load_strings';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, dim, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, First, New, TYPES, Tgroup, Tgroupl, Tinfo, Titem, Tobject, Tp, Tsc, Tsgr, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

/** The terrain entity as e_terrain() builds it (e_environment.bb:1005-1014), all heights 0. */
function mkTerrain(size: number): BBEntity {
	const t = CreateTerrain(size);
	ScaleEntity(t, Cworld_size, Cworld_height, Cworld_size);
	PositionEntity(t, -((Cworld_size * size) / 2), -(Cworld_height / 2), -((Cworld_size * size) / 2));
	G.ter = t;
	G.ter_size = size;
	return t;
}

/** in_editor_buffer as a black size x size image. */
function mkBuffer(size: number): void {
	G.in_editor_buffer = CreateImage(size, size);
	for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) WritePixelFast(x, y, 0xff000000 | 0, ImageBuffer(G.in_editor_buffer));
}

const px = (x: number, y: number): number => ReadPixelFast(x, y, ImageBuffer(G.in_editor_buffer)) & 0xffffff;

describe.skipIf(!existsSync(MOD))('editor_core: editor_functions.bb', () => {
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

	/** The other packages' functions editor_genmap() reaches; e_terrain builds a plain bb3d terrain. */
	function mockGenmap() {
		const m = {
			e_clear: vi.spyOn(e_clear, 'e_clear').mockImplementation(() => {}),
			e_terrain: vi.spyOn(env, 'e_terrain').mockImplementation((size: number) => {
				mkTerrain(size);
			}),
			e_environment: vi.spyOn(env, 'e_environment').mockImplementation(() => {}),
			distort: vi.spyOn(env, 'e_terraindistort').mockImplementation(() => {}),
			random: vi.spyOn(env, 'e_terrainrandom').mockImplementation(() => {}),
			smooth: vi.spyOn(env, 'e_terrainsmooth').mockImplementation(() => {}),
			loadscreen: vi.spyOn(load_bmpf, 'bmpf_loadscreen').mockImplementation(async () => {})
		};
		return m;
	}

	// ------------------------------------------------------------------ small pure functions

	it('editor_getskybox: name before the first skybox side suffix, tested in the order bk dn do fr lf rt up', () => {
		expect(editor_getskybox('sky_bk.jpg')).toBe('sky');
		expect(editor_getskybox('night_dn.bmp')).toBe('night');
		expect(editor_getskybox('a_do.png')).toBe('a');
		expect(editor_getskybox('a_fr.png')).toBe('a');
		expect(editor_getskybox('a_lf.png')).toBe('a');
		expect(editor_getskybox('a_rt.png')).toBe('a');
		expect(editor_getskybox('a_up.png')).toBe('a');
		expect(editor_getskybox('sky.jpg')).toBe('');
		expect(editor_getskybox('_bk.jpg')).toBe(''); // Left(name$,0)
		// "_bk." is searched first, wherever it is
		expect(editor_getskybox('x_up.y_bk.z')).toBe('x_up.y');
	});

	it('editor_defaultmapsettings', () => {
		G.map_day = 7;
		G.map_hour = 23;
		G.map_minute = 59;
		G.map_freezetime = 1;
		G.map_skybox = 'x';
		G.map_multiplayer = 1;
		G.map_climate = 3;
		G.map_music = 'x';
		G.map_briefing = 'x';
		G.map_password = 'x';
		editor_defaultmapsettings();
		expect([G.map_day, G.map_hour, G.map_minute, G.map_freezetime]).toEqual([1, 9, 0, 0]);
		expect(G.map_skybox).toBe('sky');
		expect(G.map_multiplayer).toBe(0);
		expect(G.map_climate).toBe(0);
		expect(G.map_music).toBe('amb_jungle.mp3');
		expect(G.map_fog.slice(0, 4)).toEqual([205, 210, 245, 0]);
		expect(G.map_briefing).toBe('');
		expect(G.map_password).toBe('');
	});

	// ------------------------------------------------------------------ lists

	it('editor_list: every named editor object for the empty group; cached per class+group', () => {
		const expected = [...DEFS.objects.byId.values()]
			.filter((d) => d.name !== '' && d.ined !== 0)
			.map((d) => d.id)
			.sort((a, b) => a - b);
		expect(expected.length).toBeGreaterThan(10);
		expect(G.ed_current_class).toBe(-5);
		editor_list(Cclass_object, '');
		expect([...Each(Tgroupl)].map((l) => l.id)).toEqual(expected);
		expect(G.ed_current_c).toBe(expected.length);
		expect(G.ed_current_class).toBe(Cclass_object);
		expect(G.ed_current_group).toBe(''); // stored before the "," is appended

		// same class and group: nothing is rebuilt
		const first = First(Tgroupl);
		G.ed_current_c = 999;
		editor_list(Cclass_object, '');
		expect(First(Tgroupl)).toBe(first);
		expect(G.ed_current_c).toBe(999);
	});

	it('editor_list: group filter is Instr(groups without blanks + ",", group + ",")', () => {
		const g = [...Each(Tgroup)].find((t) => t.class === Cclass_object)!;
		expect(g).toBeDefined();
		const expected = [...DEFS.objects.byId.values()]
			.filter((d) => d.name !== '' && d.ined !== 0 && (d.group + ',').split(' ').join('').includes(g.group + ','))
			.map((d) => d.id)
			.sort((a, b) => a - b);
		expect(expected.length).toBeGreaterThan(0);
		editor_list(Cclass_object, g.group);
		expect([...Each(Tgroupl)].map((l) => l.id)).toEqual(expected);
		expect(G.ed_current_c).toBe(expected.length);
		expect(G.ed_current_group).toBe(g.group);

		// another class: rebuilt (units: name and ined; infos: name only)
		editor_list(Cclass_unit, '');
		expect([...Each(Tgroupl)].map((l) => l.id)).toEqual(
			[...DEFS.units.byId.values()]
				.filter((d) => d.name !== '' && d.ined !== 0)
				.map((d) => d.id)
				.sort((a, b) => a - b)
		);
		editor_list(Cclass_item, '');
		expect(G.ed_current_c).toBe([...DEFS.items.byId.values()].filter((d) => d.name !== '' && d.ined !== 0).length);
		editor_list(Cclass_info, '');
		expect(G.ed_current_c).toBe([...DEFS.infos.byId.values()].filter((d) => d.name !== '').length);
		// an unknown class only empties the list
		editor_list(77, '');
		expect(First(Tgroupl)).toBeNull();
		expect(G.ed_current_c).toBe(0);
	});

	it('editor_ini_sc: reads core\\scriptcommands.inf into Tsc and collects the groups in Tsgr', () => {
		const old = New(Tsc);
		old.cmd = 'old';
		New(Tsgr).group = 'oldgroup';
		CreateDir(G.set_rootdir + 'core');
		const s = WriteFile(G.set_rootdir + 'core\\scriptcommands.inf');
		expect(s).not.toBe(0);
		WriteLine(s, 'add' + SEP_LINE + 'basic, objects' + SEP_LINE + '"x",1');
		WriteLine(s, '   ');
		WriteLine(s, '  loop' + SEP_LINE + 'basic' + SEP_LINE + SEP_LINE + 'dropped');
		WriteLine(s, 'nogroup');
		CloseFile(s);
		const con_add = vi.spyOn(con, 'con_add').mockImplementation(() => {});
		editor_ini_sc();
		expect(con_add).not.toHaveBeenCalled();
		expect([...Each(Tsc)].map((t) => [t.cmd, t.groups, t.params])).toEqual([
			['add', 'basic, objects', '"x",1'],
			['loop', 'basic', ''],
			['nogroup', '', '']
		]);
		expect([...Each(Tsgr)].map((t) => t.group)).toEqual(['basic', 'objects']);
	});

	it('editor_ini_sc: without the file both lists are emptied and the console gets the error', () => {
		New(Tsc).cmd = 'old';
		New(Tsgr).group = 'oldgroup';
		const con_add = vi.spyOn(con, 'con_add').mockImplementation(() => {});
		editor_ini_sc();
		expect(con_add).toHaveBeenCalledWith("ERROR: Unable to load 'core\\scriptcommands.inf'", Cbmpf_red);
		expect(First(Tsc)).toBeNull();
		expect(First(Tsgr)).toBeNull();
	});

	it('editor_quit: frees script command lists and the dummy', () => {
		New(Tsc);
		New(Tsgr);
		const d = CreatePivot();
		G.in_editor_dummy = d;
		editor_quit();
		expect(First(Tsc)).toBeNull();
		expect(First(Tsgr)).toBeNull();
		expect(G.in_editor_dummy).toBeNull();
		expect(d.freed).toBe(true);
		editor_quit(); // no dummy: nothing to free
	});

	// ------------------------------------------------------------------ picking / mode / dummy

	function population() {
		const o = New(Tobject);
		o.h = CreatePivot();
		const u = New(Tunit);
		u.h = CreatePivot();
		const flat = [...DEFS.items.byId.values()].find((d) => d.radius === 0)!;
		const round = [...DEFS.items.byId.values()].find((d) => d.radius !== 0);
		const i1 = New(Titem);
		i1.typ = flat.id;
		i1.h = CreatePivot();
		let i2: Titem | null = null;
		if (round) {
			i2 = New(Titem);
			i2.typ = round.id;
			i2.h = CreatePivot();
		}
		const n = New(Tinfo);
		n.h = CreatePivot();
		const n0 = New(Tinfo); // an info without entity is skipped
		n0.h = null;
		const pg = (h: unknown) => (h as BBEntity).ent.pick_geom;
		return { o, u, i1, i2, n, pg };
	}

	it('editor_picking: polygon picking (2) for the class of the mode only; items with a radius get sphere picking (1)', () => {
		const p = population();
		editor_picking(Cclass_object);
		expect([p.pg(p.o.h), p.pg(p.u.h), p.pg(p.i1.h), p.pg(p.n.h)]).toEqual([2, 0, 0, 0]);
		editor_picking(Cclass_unit);
		expect([p.pg(p.o.h), p.pg(p.u.h), p.pg(p.i1.h), p.pg(p.n.h)]).toEqual([0, 2, 0, 0]);
		editor_picking(Cclass_item);
		expect([p.pg(p.o.h), p.pg(p.u.h), p.pg(p.i1.h), p.pg(p.n.h)]).toEqual([0, 0, 2, 0]);
		if (p.i2) expect(p.pg(p.i2.h)).toBe(1);
		editor_picking(Cclass_info);
		expect([p.pg(p.o.h), p.pg(p.u.h), p.pg(p.i1.h), p.pg(p.n.h)]).toEqual([0, 0, 0, 2]);
		if (p.i2) expect(p.pg(p.i2.h)).toBe(0);
		editor_picking(0);
		expect([p.pg(p.o.h), p.pg(p.u.h), p.pg(p.i1.h), p.pg(p.n.h)]).toEqual([0, 0, 0, 0]);
	});

	it('editor_setmode: terrain mode only sets picking; info mode builds the cube dummy; object/item modes need definitions', () => {
		const p = population();
		editor_picking(Cclass_object);
		editor_setmode(0);
		expect(p.pg(p.o.h)).toBe(0);
		expect(G.in_editor_dummy).toBeNull();

		editor_setmode(Cclass_info, 0); // picking=0: pick modes stay
		expect(p.pg(p.n.h)).toBe(0);
		const d1 = G.in_editor_dummy as BBEntity;
		expect(d1).not.toBeNull();
		editor_setmode(Cclass_info);
		expect(p.pg(p.n.h)).toBe(2);
		expect(d1.freed).toBe(true); // the old dummy is freed, a new one made
		expect(G.in_editor_dummy).not.toBe(d1);
		expect((G.in_editor_dummy as BBEntity).freed).toBe(false);

		G.object_count = 0;
		expect(() => editor_setmode(Cclass_object)).toThrow('No objects defined!');
		G.item_count = 0;
		expect(() => editor_setmode(Cclass_item)).toThrow('No items defined!');
	});

	// ------------------------------------------------------------------ pixel functions

	it('editor_bufferpaint_apm: new = old*a + colour*(1-a), rounded to nearest even, not clamped', () => {
		mkBuffer(4);
		SetBuffer(ImageBuffer(G.in_editor_buffer));
		editor_bufferpaint_apm(200, 100, 50, 0, 0, 0, 0.25, 1, 2);
		// 150, 75, 37.5 -> 38
		expect(px(1, 2)).toBe(0x964b26);
		editor_bufferpaint_apm(10, 20, 30, 110, 120, 130, 0.5, 2, 2);
		expect(px(2, 2)).toBe((60 << 16) | (70 << 8) | 80);
		// quirk: 300 is not clamped: 300*$10000 carries into the alpha byte, red keeps 300-256=44
		editor_bufferpaint_apm(300, 0, 0, 0, 0, 0, 0, 3, 3);
		expect(px(3, 3)).toBe(0x2c0000);
		SetBuffer(BackBuffer());
	});

	it('editor_gencolormap_apm: the same mix, clamped to 0..255', () => {
		mkBuffer(4);
		SetBuffer(ImageBuffer(G.in_editor_buffer));
		editor_gencolormap_apm(300, -20, 50, 0, 0, 0, 0, 1, 1);
		expect(px(1, 1)).toBe(0xff0032);
		editor_gencolormap_apm(200, 100, 50, 0, 0, 0, 0.25, 2, 1);
		expect(px(2, 1)).toBe(0x964b26);
		SetBuffer(BackBuffer());
	});

	it('editor_bufferpaint: round brush with falloff; Rand(10) is drawn for every pixel in the brush even without spray', () => {
		mkBuffer(16);
		SeedRnd(7);
		editor_bufferpaint(8, 8, 6, 255, 0, 0, 0, 100);
		const after = Rand(1, 1000);
		// rad=3: 25 pixels have dist<3
		SeedRnd(7);
		for (let i = 0; i < 25; i++) Rand(10);
		expect(after).toBe(Rand(1, 1000));
		// a = 1-100/100 = 0: perc = dist/rad
		expect(px(8, 8)).toBe(0xff0000); // dist 0
		expect(px(10, 8)).toBe(Int(f32(255 * f32(1 - f32(2 / 3)))) << 16); // dist 2 -> 85
		expect(px(10, 8)).toBe(85 << 16);
		expect(px(9, 9)).toBe(Int(f32(255 * f32(1 - f32(f32(Math.sqrt(2)) / 3)))) << 16);
		expect(px(11, 8)).toBe(0); // dist 3: outside
		expect(px(10, 10)).toBe(0x1 * 0 + (Int(f32(255 * f32(1 - f32(f32(Math.sqrt(8)) / 3)))) << 16)); // dist 2.83: inside
		expect(px(8, 11)).toBe(0);
		// the 2D buffer is the back buffer again
		Color(1, 2, 3);
		WritePixelFast(0, 0, 0xff112233 | 0);
		expect(ReadPixelFast(0, 0, BackBuffer()) & 0xffffff).toBe(0x112233);
	});

	it('editor_bufferpaint: alpha slider 0 leaves the pixels (perc is raised to a=1); the image edge is respected', () => {
		mkBuffer(8);
		editor_bufferpaint(4, 4, 6, 255, 255, 255, 0, 0);
		for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) expect(px(x, y)).toBe(0);
		// brush centre outside the image: only the pixels inside are touched, nothing throws
		editor_bufferpaint(-1, 0, 6, 255, 255, 255, 0, 100);
		expect(px(0, 0)).toBe(Int(f32(255 * f32(1 - f32(1 / 3)))) * 0x010101);
		expect(px(2, 0)).toBe(0); // dist 3
	});

	it('editor_bufferpaint: spray paints only where Rand(10)=1', () => {
		mkBuffer(16);
		SeedRnd(99);
		editor_bufferpaint(8, 8, 6, 255, 0, 0, 1, 100);
		SeedRnd(99);
		let painted = 0;
		for (let x = 5; x <= 11; x++) {
			for (let y = 5; y <= 11; y++) {
				const d2 = (x - 8) * (x - 8) + (y - 8) * (y - 8);
				if (d2 >= 9) continue;
				const hit = Rand(10) === 1;
				if (hit) painted++;
				// the centre pixel is the only one that is exactly the colour; elsewhere compare painted/unpainted
				expect(px(x, y) !== 0, `${x},${y}`).toBe(hit);
			}
		}
		expect(painted).toBeGreaterThanOrEqual(0);
	});

	it('editor_buffergamma: lightens (mode 1) or darkens by power*(1-dist/rad), clamped', () => {
		mkBuffer(16);
		SeedRnd(7);
		editor_buffergamma(8, 8, 6, 1, 10);
		const after = Rand(1, 1000);
		SeedRnd(7);
		for (let i = 0; i < 25; i++) Rand(10); // quirk: "spray" is an undeclared local (0), Rand(10) is still drawn
		expect(after).toBe(Rand(1, 1000));
		expect(px(8, 8)).toBe(0x0a0a0a);
		expect(px(10, 8)).toBe(0x030303); // 10*(1-2/3)=3.33
		expect(px(11, 8)).toBe(0);
		// darken: below 0 is clamped
		editor_buffergamma(8, 8, 6, 0, 4);
		expect(px(8, 8)).toBe(0x060606);
		expect(px(10, 8)).toBe(0x020202); // 3-1.33=1.67 -> 2
		expect(px(9, 9)).toBe(Int(f32(Int(f32(10 * f32(1 - f32(f32(Math.sqrt(2)) / 3)))) - f32(4 * f32(1 - f32(f32(Math.sqrt(2)) / 3))))) * 0x010101);
		// lighten: above 255 is clamped
		editor_buffergamma(8, 8, 2, 1, 1000);
		expect(px(8, 8)).toBe(0xffffff);
		// default power is 10
		mkBuffer(16);
		editor_buffergamma(8, 8, 6, 1);
		expect(px(8, 8)).toBe(0x0a0a0a);
	});

	it('editor_buffergetcolor: colour map menu takes the colour, height map menu the grey slider (red/2.55)', () => {
		mkBuffer(4);
		WritePixelFast(1, 1, 0xff804020 | 0, ImageBuffer(G.in_editor_buffer));
		G.m_menu = Cmenu_ed_colormap;
		G.in_slider[0] = 7;
		editor_buffergetcolor(1, 1);
		expect(G.in_col.slice(0, 3)).toEqual([0x80, 0x40, 0x20]);
		expect(G.in_slider[0]).toBe(7);
		G.m_menu = Cmenu_ed_heightmap;
		G.in_col[0] = 1;
		editor_buffergetcolor(1, 1);
		expect(G.in_slider[0]).toBe(50); // 128/2.55=50.2
		expect(G.in_col[0]).toBe(1);
		WritePixelFast(2, 1, 0xffffffff | 0, ImageBuffer(G.in_editor_buffer));
		editor_buffergetcolor(2, 1);
		expect(G.in_slider[0]).toBe(100);
		// quirk: Cmenu_ed_heightmap+1 (the second height map menu) is not handled here
		G.m_menu = Cmenu_ed_heightmap + 1;
		G.in_slider[0] = 3;
		editor_buffergetcolor(2, 1);
		expect(G.in_slider[0]).toBe(3);
	});

	it('editor_textobuffer / editor_buffertotex: copy pixel by pixel between a texture and the buffer image', () => {
		const tex = CreateTexture(8, 8);
		WritePixelFast(3, 5, 0xff123456 | 0, TextureBuffer(tex)!);
		const old = CreateImage(2, 2);
		G.in_editor_buffer = old;
		editor_textobuffer(tex);
		expect(G.in_editor_buffer).not.toBe(old);
		expect(ImageHeight(G.in_editor_buffer)).toBe(8);
		expect(px(3, 5)).toBe(0x123456);
		WritePixelFast(7, 0, 0xffabcdef | 0, ImageBuffer(G.in_editor_buffer));
		editor_buffertotex(tex);
		expect(ReadPixelFast(7, 0, TextureBuffer(tex)!) & 0xffffff).toBe(0xabcdef);
		expect(ReadPixelFast(3, 5, TextureBuffer(tex)!) & 0xffffff).toBe(0x123456);
	});

	it('editor_heightmaptobuffer / editor_buffertoheightmap: grey = height*255, height = red/255', () => {
		const t = mkTerrain(16);
		ModifyTerrain(t, 3, 5, 1);
		ModifyTerrain(t, 4, 5, 0.2); // 51/255
		editor_heightmaptobuffer();
		expect(ImageHeight(G.in_editor_buffer)).toBe(16);
		expect(px(3, 5)).toBe(0xffffff);
		expect(px(4, 5)).toBe(0x333333);
		expect(px(0, 0)).toBe(0);

		WritePixelFast(2, 9, 0xffff0000 | 0, ImageBuffer(G.in_editor_buffer)); // only red counts
		WritePixelFast(3, 5, 0xff00ffff | 0, ImageBuffer(G.in_editor_buffer));
		editor_buffertoheightmap();
		expect(TerrainHeight(t, 2, 9)).toBe(1);
		expect(TerrainHeight(t, 3, 5)).toBe(0);
		expect(TerrainHeight(t, 4, 5)).toBeCloseTo(0.2, 5);
	});

	it('editor_grassmaptobuffer: refreshes grass_rgb from the colour texture; no-grass cells are magenta', () => {
		G.ter_tex_color = CreateTexture(4, 4);
		const tb = TextureBuffer(G.ter_tex_color)!;
		for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) WritePixelFast(x, y, 0xff000000 | 0, tb);
		WritePixelFast(1, 2, 0xff102030 | 0, tb);
		G.grass_mapsize = 4;
		G.grass_rgb = dim<number>(0, 4, 4, 3);
		G.grass_rgb[1][2][3] = 1;
		G.grass_rgb[0][0][3] = 1;
		editor_grassmaptobuffer();
		expect(G.grass_rgb[1][2]).toEqual([0x10, 0x20, 0x30, 1]);
		expect(ImageHeight(G.in_editor_buffer)).toBe(4);
		expect(px(1, 2)).toBe(0x102030);
		expect(px(0, 0)).toBe(0);
		expect(px(2, 2)).toBe(0xff00ff);
	});

	it('editor_bufferpaintgrassmap: brush tool sets the grass flag of every cell in the brush, spray tool one in five', () => {
		mkBuffer(8);
		G.grass_mapsize = 8;
		G.grass_rgb = dim<number>(0, 8, 8, 3);
		for (let x = 0; x < 8; x++)
			for (let y = 0; y < 8; y++) {
				G.grass_rgb[x][y][0] = 10 + x;
				G.grass_rgb[x][y][1] = 20 + y;
				G.grass_rgb[x][y][2] = 30;
			}
		G.in_edtool = 0;
		G.in_edgrassmode = 1;
		SeedRnd(5);
		editor_bufferpaintgrassmap(4, 4, 4); // rad 2: the 9 cells with dist<2
		const after = Rand(1, 1000);
		SeedRnd(5);
		expect(after).toBe(Rand(1, 1000)); // tool 0 draws no random numbers
		let n = 0;
		for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) n += G.grass_rgb[x][y][3];
		expect(n).toBe(9);
		expect(px(4, 4)).toBe((14 << 16) | (24 << 8) | 30);
		expect(px(5, 5)).toBe((15 << 16) | (25 << 8) | 30);
		expect(G.grass_rgb[6][4][3]).toBe(0);
		expect(px(6, 4)).toBe(0);

		G.in_edgrassmode = 0;
		editor_bufferpaintgrassmap(4, 4, 4);
		expect(px(4, 4)).toBe(0xff00ff);
		expect(G.grass_rgb[4][4][3]).toBe(0);

		// spray
		G.in_edtool = 1;
		G.in_edgrassmode = 1;
		SeedRnd(11);
		editor_bufferpaintgrassmap(4, 4, 4);
		SeedRnd(11);
		for (let x = 3; x <= 5; x++) for (let y = 3; y <= 5; y++) expect(G.grass_rgb[x][y][3], `${x},${y}`).toBe(Rand(5) === 1 ? 1 : 0);
	});

	it('editor_paintcm: world position to colour map pixel, then the brush of editor_bufferpaint without alpha', () => {
		G.ter_size = 16;
		G.ter_tex_color = CreateTexture(32, 32);
		const tb = TextureBuffer(G.ter_tex_color)!;
		for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) WritePixelFast(x, y, 0xff000000 | 0, tb);
		const t = (x: number, y: number) => ReadPixelFast(x, y, tb) & 0xffffff;
		SeedRnd(3);
		// sc3d=1024, tfac=32: world (0,0) -> pixel (16,16); (-512,-512) -> (0,0); (64,-96) -> (18,13)
		editor_paintcm(64, -96, 6, 0, 255, 0);
		const after = Rand(1, 1000);
		SeedRnd(3);
		expect(after).toBe(Rand(1, 1000)); // no random numbers
		expect(t(18, 13)).toBe(0x00ff00);
		expect(t(20, 13)).toBe(85 << 8);
		expect(t(21, 13)).toBe(0);
		editor_paintcm(-512, -512, 6, 255, 0, 0);
		expect(t(0, 0)).toBe(0xff0000);
		// the 2D buffer is the back buffer again
		WritePixelFast(0, 0, 0xff112233 | 0);
		expect(ReadPixelFast(0, 0, BackBuffer()) & 0xffffff).toBe(0x112233);
	});

	it('editor_bufferwin: black frame, the buffer at the scroll offset; mouse in the area paints by menu and tool', () => {
		mkBuffer(32);
		WritePixelFast(5, 6, 0xff00ff00 | 0, ImageBuffer(G.in_editor_buffer));
		G.in_edzoom = 1;
		G.in_editor_bufferx = 2;
		G.in_editor_buffery = 3;
		G.in_mx = 0;
		G.in_my = 0;
		SetBuffer(BackBuffer());
		editor_bufferwin(100, 50, 20, 20);
		expect(ReadPixelFast(103, 53, BackBuffer()) & 0xffffff).toBe(0x00ff00);
		expect(G.in_cursorf).not.toBe(-1); // mouse outside: nothing else

		// colour map menu, brush tool, click at buffer pixel ((110-100)+2, (60-50)+3) = (12,13)
		G.m_menu = Cmenu_ed_colormap;
		G.in_edtool = 0;
		G.in_edbrush = 6;
		G.in_col[0] = 255;
		G.in_col[1] = 0;
		G.in_col[2] = 0;
		G.in_slider[10] = 100;
		G.in_mx = 110;
		G.in_my = 60;
		G.in_mhit[1] = 1;
		editor_bufferwin(100, 50, 20, 20);
		expect(G.in_cursorf).toBe(-1);
		expect(px(12, 13)).toBe(0xff0000);
		expect(px(14, 13)).toBe(85 << 16);

		// mouse held without movement and without a hit: nothing is painted
		mkBuffer(32);
		G.in_mhit[1] = 0;
		G.in_mdown[1] = 1;
		G.in_mxs = 0;
		G.in_mys = 0;
		editor_bufferwin(100, 50, 20, 20);
		expect(px(12, 13)).toBe(0);
		G.in_mxs = 1;
		editor_bufferwin(100, 50, 20, 20);
		expect(px(12, 13)).toBe(0xff0000);

		// height map menu: grey = slider*2.55; tool 4 picks the colour instead
		mkBuffer(32);
		G.m_menu = Cmenu_ed_heightmap + 1;
		G.in_slider[0] = 50;
		editor_bufferwin(100, 50, 20, 20);
		expect(px(12, 13)).toBe(0x808080); // 50*2.55 is 127.5 in float32 -> 128 (to even)
		G.m_menu = Cmenu_ed_heightmap;
		G.in_edtool = 4;
		G.in_slider[0] = 0;
		editor_bufferwin(100, 50, 20, 20);
		expect(G.in_slider[0]).toBe(50); // 128/2.55=50.2

		// wheel changes the brush (0..99), right button scrolls
		G.in_edtool = 0;
		G.in_mdown[1] = 0;
		G.in_mzs = 200;
		editor_bufferwin(100, 50, 20, 20);
		expect(G.in_edbrush).toBe(99);
		G.in_mzs = -200;
		editor_bufferwin(100, 50, 20, 20);
		expect(G.in_edbrush).toBe(0);
		G.in_mzs = 0;
		G.in_mdown[2] = 1;
		G.in_mxs = 4;
		G.in_mys = 5;
		editor_bufferwin(100, 50, 20, 20);
		expect(G.in_cursorf).toBe(2);
		expect([G.in_editor_bufferx, G.in_editor_buffery]).toEqual([6, -2]);
	});

	it('editor_bufferwin: zoom builds the zoomed image (size*zoom) and draws that', () => {
		mkBuffer(8);
		WritePixelFast(1, 2, 0xff0000ff | 0, ImageBuffer(G.in_editor_buffer));
		G.in_edzoom = 3;
		G.in_editor_bufferx = 0;
		G.in_editor_buffery = 0;
		G.in_mx = 0;
		G.in_my = 0;
		SetBuffer(BackBuffer());
		editor_bufferwin(10, 10, 24, 24);
		expect(G.in_editor_bufferz).not.toBe(0);
		expect(ImageHeight(G.in_editor_bufferz)).toBe(24);
		const z = G.in_editor_bufferz;
		// quirk: both loops run "For i=0 To in_edzoom" (zoom+1 copies). Columns are filled left to right, so the
		// extra copy is overwritten by the next column; rows are filled bottom to top, so the extra copy of row r
		// overwrites the first row of r+1: every row but row 0 ends up one pixel lower. Pixel (1,2) covers 3..5 x 7..9.
		for (const [x, y] of [
			[3, 7],
			[5, 9],
			[4, 8]
		])
			expect(ReadPixelFast(x, y, ImageBuffer(z)) & 0xffffff, `${x},${y}`).toBe(0x0000ff);
		expect(ReadPixelFast(3, 6, ImageBuffer(z)) & 0xffffff).toBe(0); // the fourth copy of row 1
		expect(ReadPixelFast(3, 10, ImageBuffer(z)) & 0xffffff).toBe(0);
		expect(ReadPixelFast(2, 8, ImageBuffer(z)) & 0xffffff).toBe(0);
		expect(ReadPixelFast(6, 8, ImageBuffer(z)) & 0xffffff).toBe(0);
		expect(ReadPixelFast(10 + 4, 10 + 8, BackBuffer()) & 0xffffff).toBe(0x0000ff);
		// same size: the zoom image is kept; other zoom: replaced
		editor_bufferwin(10, 10, 24, 24);
		expect(G.in_editor_bufferz).toBe(z);
		G.in_edzoom = 2;
		editor_bufferwin(10, 10, 24, 24);
		expect(G.in_editor_bufferz).not.toBe(z);
		expect(ImageHeight(G.in_editor_bufferz)).toBe(16);
	});

	// ------------------------------------------------------------------ terrain generation

	it('editor_genmap_hill: a disc of radius size/2 around the centre, never in the 2-cell border', () => {
		const t = mkTerrain(16);
		editor_genmap_hill(8, 8, 6, 16, 1);
		let n = 0;
		for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) if (TerrainHeight(t, x, z) === 1) n++;
		// Int(Sqr(dx^2+dz^2)) < 3: dist is rounded to Int first, so everything up to 2.5 counts
		let expected = 0;
		for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Int(f32(Math.sqrt(dx * dx + dz * dz))) < 3) expected++;
		expect(expected).toBe(21);
		expect(n).toBe(expected);
		expect(TerrainHeight(t, 8, 8)).toBe(1);
		expect(TerrainHeight(t, 10, 9)).toBe(1); // 2.24 -> 2
		expect(TerrainHeight(t, 10, 10)).toBe(0); // 2.83 -> 3
		// size 1 -> 0 -> raised to 1: only dist 0
		const t2 = mkTerrain(16);
		editor_genmap_hill(1, 8, 1, 16, 1);
		for (let x = 0; x <= 15; x++) for (let z = 0; z <= 15; z++) expect(TerrainHeight(t2, x, z)).toBe(0); // x=1 is border, x=2 has dist 1
		editor_genmap_hill(2, 14, 1, 16, 1);
		expect(TerrainHeight(t2, 2, 14)).toBe(1);
		editor_genmap_hill(2, 15, 1, 16, 1);
		expect(TerrainHeight(t2, 2, 15)).toBe(0);
	});

	it('editor_genmap: size by in_opt(3), island on sea ground, landscape type by in_opt(4)', async () => {
		const m = mockGenmap();
		G.in_opt[3] = 0;
		G.in_opt[4] = 0;
		await editor_genmap();
		expect(m.e_clear).toHaveBeenCalledOnce();
		expect(m.e_terrain).toHaveBeenCalledWith(16, 'generated');
		expect(m.e_environment).toHaveBeenCalledOnce();
		expect(m.loadscreen.mock.calls.map((c) => c[0])).toEqual(['Initialing', 'Generating Terrain']);
		expect(TextureHeight(G.ter_tex_color)).toBe(128);
		// border: sea ground 0.45 (hills never touch the 2-cell border); centre: land 0.55 (115/255, 140/255)
		expect(TerrainHeight(G.ter, 0, 0)).toBeCloseTo(0.45, 2);
		expect(TerrainHeight(G.ter, 1, 14)).toBeCloseTo(0.45, 2);
		expect(TerrainHeight(G.ter, 8, 8)).toBeCloseTo(0.55, 2);
		expect(m.distort).toHaveBeenCalledWith(f32(0.05));
		expect(m.smooth).toHaveBeenCalledTimes(5);
		expect(m.random.mock.calls.length).toBeGreaterThan(0);
		for (const c of m.random.mock.calls) {
			expect(c.length).toBe(3);
			expect(c[2]).toBe(f32(0.03));
			expect(c[0]).toBeGreaterThanOrEqual(1);
			expect(c[0]).toBeLessThanOrEqual(15);
		}

		// sizes
		for (const [opt, size] of [
			[1, 32],
			[2, 32],
			[3, 64],
			[5, 32]
		]) {
			G.in_opt[3] = opt;
			await editor_genmap(64);
			expect(m.e_terrain).toHaveBeenLastCalledWith(size, 'generated');
			expect(TextureHeight(G.ter_tex_color)).toBe(64);
		}
	});

	it('editor_genmap: the Rand/Rnd sequence of the island and the landscape types', async () => {
		const m = mockGenmap();
		G.in_opt[3] = 0;

		// Normal: replay the random numbers of the original statement order
		G.in_opt[4] = 0;
		SeedRnd(42);
		await editor_genmap();
		const end = Rand(1, 100000);
		const randomCalls = m.random.mock.calls.map((c) => [c[0], c[1]]);
		SeedRnd(42);
		const transc = Rand(15, 25);
		for (let i = 1; i <= transc; i++) {
			// angle#=Rnd(0,360) : Rand(1,2) : Rand(transmin,transmax)
			Rnd(0, 360);
			Rand(1, 2);
			Rand(1, 3); // h=6: transmin=6/5=1, transmax=3
		}
		const exp: number[][] = [];
		for (let x = 1; x <= 15; x++) for (let z = 1; z <= 15; z++) if (Rand(3) === 1) exp.push([x, z]);
		expect(randomCalls).toEqual(exp);
		expect(end).toBe(Rand(1, 100000));

		// Hilly / Desert / Snow: 3 smooth, random 0.05, 3 smooth
		for (const opt of [1, 3, 4]) {
			m.smooth.mockClear();
			m.random.mockClear();
			G.in_opt[4] = opt;
			await editor_genmap();
			expect(m.smooth).toHaveBeenCalledTimes(6);
			for (const c of m.random.mock.calls) expect(c[2]).toBe(f32(0.05));
		}

		// Mountains: plateau 0.6 from 4 to size-4, 5 smooth, random 0.25, 3 smooth
		m.smooth.mockClear();
		m.random.mockClear();
		G.in_opt[4] = 2;
		await editor_genmap();
		expect(m.smooth).toHaveBeenCalledTimes(8);
		for (const c of m.random.mock.calls) expect(c[2]).toBe(f32(0.25));
		expect(TerrainHeight(G.ter, 4, 12)).toBeCloseTo(0.6, 2);
		expect(TerrainHeight(G.ter, 8, 8)).toBeCloseTo(0.6, 2);
		expect(TerrainHeight(G.ter, 0, 0)).toBeCloseTo(0.45, 2);

		// Swamp: random 0.05, then one in five 0.2 with mode -1, 2 smooth
		m.smooth.mockClear();
		m.random.mockClear();
		G.in_opt[4] = 5;
		await editor_genmap();
		expect(m.smooth).toHaveBeenCalledTimes(2);
		const kinds = m.random.mock.calls.map((c) => (c.length === 4 ? `${c[2]}/${c[3]}` : `${c[2]}`));
		const firstDeep = kinds.indexOf(`${f32(0.2)}/-1`);
		expect(firstDeep).toBeGreaterThan(0);
		expect(new Set(kinds.slice(0, firstDeep))).toEqual(new Set([`${f32(0.05)}`]));
		expect(new Set(kinds.slice(firstDeep))).toEqual(new Set([`${f32(0.2)}/-1`]));

		// unknown landscape type: nothing after the distortion
		m.smooth.mockClear();
		m.random.mockClear();
		G.in_opt[4] = 6;
		await editor_genmap();
		expect(m.smooth).not.toHaveBeenCalled();
		expect(m.random).not.toHaveBeenCalled();
	});

	it('editor_gencolormap: colour set by in_opt(4), colour by terrain height, +-5 random per channel', async () => {
		const loadscreen = vi.spyOn(load_bmpf, 'bmpf_loadscreen').mockImplementation(async () => {});
		const t = mkTerrain(16);
		G.ter_tex_color = CreateTexture(8, 8);
		const tb = TextureBuffer(G.ter_tex_color)!;
		G.m_section = 0;
		G.in_opt[4] = 0;
		const col = (set: number, id: number) => [G.game_tercol[id * 3][set], G.game_tercol[id * 3 + 1][set], G.game_tercol[id * 3 + 2][set]];
		const cur = (id: number) => [G.in_tercol[0][id], G.in_tercol[1][id], G.in_tercol[2][id]];
		const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

		// all heights 0: "deep" colour, a=1 (h<0.5)
		SeedRnd(21);
		await editor_gencolormap();
		expect(loadscreen).not.toHaveBeenCalled(); // not in the editor section
		expect([cur(0), cur(1), cur(2)]).toEqual([col(0, 0), col(0, 1), col(0, 2)]);
		SeedRnd(21);
		for (let x = 0; x <= 7; x++) {
			for (let y = 0; y <= 7; y++) {
				const [r, g, b] = cur(0).map((c) => clamp(c + Rand(-5, 5)));
				expect(ReadPixelFast(x, y, tb) & 0xffffff, `${x},${y}`).toBe((r << 16) | (g << 8) | b);
			}
		}

		// all heights 1: "high" colour; desert colour set
		for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) ModifyTerrain(t, x, z, 1);
		G.in_opt[4] = 3;
		SeedRnd(22);
		await editor_gencolormap();
		expect([cur(0), cur(1), cur(2)]).toEqual([col(1, 0), col(1, 1), col(1, 2)]);
		SeedRnd(22);
		{
			const [r, g, b] = cur(2).map((c) => clamp(c + Rand(-5, 5)));
			expect(ReadPixelFast(0, 0, tb) & 0xffffff).toBe((r << 16) | (g << 8) | b);
		}
		G.in_opt[4] = 4;
		await editor_gencolormap();
		expect([cur(0), cur(1), cur(2)]).toEqual([col(2, 0), col(2, 1), col(2, 2)]);
		G.in_opt[4] = 5;
		await editor_gencolormap();
		expect([cur(0), cur(1), cur(2)]).toEqual([col(3, 0), col(3, 1), col(3, 2)]);

		// updatecolorset=0 keeps in_tercol
		G.in_opt[4] = 0;
		G.in_tercol[0][1] = 11;
		G.in_tercol[1][1] = 22;
		G.in_tercol[2][1] = 33;
		// normal height 0.53 (135/255): plain "normal" colour
		for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) ModifyTerrain(t, x, z, 135 / 255);
		SeedRnd(23);
		await editor_gencolormap(0);
		expect(cur(1)).toEqual([11, 22, 33]);
		SeedRnd(23);
		{
			const [r, g, b] = [11, 22, 33].map((c) => clamp(c + Rand(-5, 5)));
			expect(ReadPixelFast(0, 0, tb) & 0xffffff).toBe((r << 16) | (g << 8) | b);
		}

		// shore 0.51 (130/255): deep colour mixed with the normal one, a=(h-0.5)/0.02
		for (let x = 0; x <= 16; x++) for (let z = 0; z <= 16; z++) ModifyTerrain(t, x, z, 130 / 255);
		SeedRnd(24);
		await editor_gencolormap(0);
		SeedRnd(24);
		{
			const a = (130 / 255 - 0.5) / 0.02;
			const deep = cur(0).map((c) => clamp(c + Rand(-5, 5)));
			const p = ReadPixelFast(0, 0, tb) & 0xffffff;
			const got = [(p >> 16) & 255, (p >> 8) & 255, p & 255];
			[11, 22, 33].forEach((n, k) => expect(Math.abs(got[k] - (n * a + deep[k] * (1 - a))), `channel ${k}`).toBeLessThanOrEqual(1.5));
		}

		// in the editor section: load screen and UpdateWorld
		G.m_section = Csection_editor;
		await editor_gencolormap(0);
		expect(loadscreen).toHaveBeenCalledWith('Generating Colormap');
		// the 2D buffer is the back buffer again
		WritePixelFast(0, 0, 0xff112233 | 0);
		expect(ReadPixelFast(0, 0, BackBuffer()) & 0xffffff).toBe(0x112233);
	});

	// ------------------------------------------------------------------ camera / helpers

	it('editor_resetcam: at the terrain corner, 150 above the ground (or at 150 when that is below 0), looking at the centre', () => {
		G.ter = null; // e_tery gives ter_groundy
		G.ter_size = 32;
		G.ter_groundy = -500;
		editor_resetcam();
		expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([-1024, 150, -1024]);
		expect(EntityYaw(G.cam)).toBeCloseTo(-45, 3);
		expect(EntityPitch(G.cam)).toBeGreaterThan(0); // looking down
		G.ter_groundy = 10.6; // Local y is an Int: 10.6 -> 11
		editor_resetcam();
		expect(EntityY(G.cam)).toBe(161);
	});

	it('editor_range: nothing for range 0, else the pulsing green', () => {
		Color(1, 2, 3);
		editor_range(0, 0, 0, 0);
		expect([ColorRed(), ColorGreen()]).toEqual([1, 2]);
		G.in_ca = 0;
		editor_range(0, 0, 0, 50);
		expect([ColorRed(), ColorGreen()]).toEqual([0, 255]);
		G.in_ca = 90;
		editor_range(0, 0, 0, 50);
		expect(ColorGreen()).toBe(0);
	});

	it('editor_settoterrain: objects, units and free items go to terrain height; stored items stay', () => {
		G.ter = null;
		G.ter_groundy = 12;
		const mk = <T extends { h: unknown }>(o: T, x: number, y: number, z: number): BBEntity => {
			const h = CreatePivot();
			PositionEntity(h, x, y, z);
			o.h = h;
			return h;
		};
		const o = mk(New(Tobject), 1, 100, 2);
		const u = mk(New(Tunit), 3, 100, 4);
		const i1 = New(Titem);
		const ih1 = mk(i1, 5, 100, 6);
		const i2 = New(Titem);
		i2.parent_id = 9;
		const ih2 = mk(i2, 7, 100, 8);
		editor_settoterrain();
		expect([EntityX(o), EntityY(o), EntityZ(o)]).toEqual([1, 12, 2]);
		expect([EntityX(u), EntityY(u), EntityZ(u)]).toEqual([3, 12, 4]);
		expect(EntityY(ih1)).toBe(12);
		expect(EntityY(ih2)).toBe(100);
	});

	it('editor_setfx / editor_jumpto: five green shock waves around the entity; the camera jumps next to it', () => {
		const calls: number[][] = [];
		const marks: BBEntity[] = [];
		vi.spyOn(particles, 'p_add').mockImplementation((...a: number[]) => {
			calls.push(a);
			const p = New(Tp);
			p.h = CreatePivot();
			marks.push(p.h as BBEntity);
			G.TCp = p;
		});
		const h = CreatePivot();
		PositionEntity(h, 1, 2, 3);
		editor_setfx(h);
		expect(calls).toEqual([
			[1, -8, 3, Cp_shockwave, 10, 0.5],
			[1, -3, 3, Cp_shockwave, 20, 0.5],
			[1, 2, 3, Cp_shockwave, 30, 0.5],
			[1, 7, 3, Cp_shockwave, 20, 0.5],
			[1, 12, 3, Cp_shockwave, 10, 0.5]
		]);
		expect(marks.length).toBe(5);

		calls.length = 0;
		const parent_h = vi.spyOn(parentchild, 'parent_h').mockReturnValue(h);
		G.m_menu = 200;
		editor_jumpto(Cclass_unit, 5);
		expect(parent_h).toHaveBeenCalledWith(Cclass_unit, 5);
		expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([1 - 50, 2 + 100, 3 - 50]);
		expect(EntityYaw(G.cam)).toBeCloseTo(-45, 3);
		expect(calls.length).toBe(5);
		expect(G.m_menu).toBe(0);

		// custom distance
		editor_jumpto(Cclass_unit, 5, 10);
		expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([-9, 22, -7]);

		// unknown parent: only the menu is closed
		calls.length = 0;
		parent_h.mockReturnValue(null);
		G.m_menu = 200;
		editor_jumpto(Cclass_item, 1);
		expect(calls.length).toBe(0);
		expect(G.m_menu).toBe(0);
		expect(EntityX(G.cam)).toBe(-9);
	});

	// ------------------------------------------------------------------ test map

	describe('editor_testmap', () => {
		function mocks(saveResult = 1, decide = 1) {
			return {
				setmenu: vi.spyOn(editor_menus, 'editor_setmenu').mockImplementation(() => {}),
				save: vi.spyOn(e_save_map, 'save_map').mockImplementation(async () => saveResult),
				load: vi.spyOn(e_load_map, 'load_map').mockImplementation(async () => 1),
				decide: vi.spyOn(gui, 'gui_msgdecide').mockImplementation(async () => decide),
				msg: vi.spyOn(gui, 'gui_msg').mockImplementation(async () => {})
			};
		}

		it('forced check map: loads maps\\editor\\checkmap.s2 without saving or closing the menu', async () => {
			const m = mocks();
			New(Tsc);
			expect(await editor_testmap(1)).toBe(1);
			expect(m.setmenu).not.toHaveBeenCalled();
			expect(m.save).not.toHaveBeenCalled();
			expect(m.load).toHaveBeenCalledWith('maps\\editor\\checkmap.s2', '');
			expect([G.set_debug, G.m_section, G.set_debug_testmap, G.set_debug_testmapfile]).toEqual([1, Csection_game_sp, 1, 'editor\\checkmap']);
			expect(First(Tsc)).not.toBeNull(); // no editor_quit on this path
		});

		it('unsaved map: saves the check map, quits the editor, loads it', async () => {
			const m = mocks();
			New(Tsc);
			G.in_edmap = '';
			G.m_section = Csection_editor;
			expect(await editor_testmap()).toBe(1);
			// quirk: Cmenu_ed_check does not exist, the menu is set to 0
			expect(m.setmenu).toHaveBeenCalledWith(0);
			expect(m.decide).not.toHaveBeenCalled();
			expect(m.save).toHaveBeenCalledWith('maps\\editor\\checkmap.s2', 'map', '');
			expect(m.load).toHaveBeenCalledWith('maps\\editor\\checkmap.s2', '');
			expect(First(Tsc)).toBeNull();
			expect([G.set_debug, G.m_section, G.set_debug_testmap, G.set_debug_testmapfile]).toEqual([1, Csection_game_sp, 1, 'editor\\checkmap']);
		});

		it('check map cannot be saved: message, stays in the editor, returns 0', async () => {
			const m = mocks(0);
			New(Tsc);
			G.m_section = Csection_editor;
			expect(await editor_testmap()).toBe(0);
			expect(m.load).not.toHaveBeenCalled();
			expect(m.msg).toHaveBeenCalledWith(se(205), Cbmpf_red);
			expect(G.m_section).toBe(Csection_editor);
			expect(G.set_debug).toBe(1); // already switched on
			expect(G.set_debug_testmap).toBe(0);
			expect(First(Tsc)).not.toBeNull();
		});

		it('named map, confirmed: saved and loaded under its own name with the map password', async () => {
			const m = mocks();
			G.in_edmap = 'adventure\\map01';
			G.map_password = 'pw';
			expect(await editor_testmap()).toBe(1);
			expect(m.decide.mock.calls[0][0]).toBe(se(206));
			expect(m.save.mock.calls).toEqual([['maps\\adventure\\map01.s2', 'map', 'pw']]);
			expect(m.load.mock.calls).toEqual([['maps\\adventure\\map01.s2', 'pw']]);
			expect(G.set_debug_testmapfile).toBe('adventure\\map01');
			expect(G.m_section).toBe(Csection_game_sp);

			// a path with a drive letter is used as it is
			m.save.mockClear();
			m.load.mockClear();
			G.in_edmap = 'C:\\maps\\x';
			expect(await editor_testmap()).toBe(1);
			expect(m.save.mock.calls).toEqual([['C:\\maps\\x.s2', 'map', 'pw']]);
			expect(m.load.mock.calls).toEqual([['C:\\maps\\x.s2', 'pw']]);
		});

		it('named map, declined: the check map is used instead', async () => {
			const m = mocks(1, 0);
			G.in_edmap = 'mymap';
			G.map_password = 'pw';
			expect(await editor_testmap()).toBe(1);
			expect(m.decide).toHaveBeenCalledOnce();
			expect(m.save.mock.calls).toEqual([['maps\\editor\\checkmap.s2', 'map', '']]);
			expect(m.load.mock.calls).toEqual([['maps\\editor\\checkmap.s2', '']]);
			expect(G.set_debug_testmapfile).toBe('editor\\checkmap');
		});
	});

	// ------------------------------------------------------------------ editor_ini

	it('editor_ini: menu, first definitions, group counts (items: quirk), blank map, camera, sidebar', async () => {
		const m = mockGenmap();
		const con_add = vi.spyOn(con, 'con_add').mockImplementation(() => {});
		G.in_opt[0] = 3;
		G.in_opt[3] = 9;
		G.in_opt[4] = 9;
		G.in_edmap = 'old';
		G.in_editor_sidebar = 0;
		G.in_edrandrot = 0;
		G.map_hour = 20;
		G.m_section = 0;
		await editor_ini(5);
		expect(m.e_clear).toHaveBeenCalledTimes(2); // editor_ini and editor_genmap
		expect([G.in_opt[0], G.in_opt[3], G.in_opt[4], G.m_menu]).toEqual([0, 0, 0, 5]);
		const firstNamed = (ids: Iterable<{ id: number; name: string }>) => Math.min(...[...ids].filter((d) => d.name !== '').map((d) => d.id));
		expect(G.in_object_sel).toBe(firstNamed(DEFS.objects.byId.values()));
		expect(G.in_unit_sel).toBe(firstNamed(DEFS.units.byId.values()));
		expect(G.in_item_sel).toBe(firstNamed(DEFS.items.byId.values()));
		expect(G.in_info_sel).toBe(firstNamed(DEFS.infos.byId.values()));

		// group counts: exact comparison of the whole group string
		let objGroups = 0;
		for (const g of Each(Tgroup)) {
			if (g.class === Cclass_object) {
				objGroups++;
				expect(g.count, 'object group ' + g.group).toBe([...DEFS.objects.byId.values()].filter((d) => d.ined === 1 && d.group === g.group).length);
			} else if (g.class === Cclass_unit) {
				expect(g.count, 'unit group ' + g.group).toBe([...DEFS.units.byId.values()].filter((d) => d.ined === 1 && d.group === g.group).length);
			} else if (g.class === Cclass_item) {
				// quirk: "For i=0 To Cobject_item" only looks at item 0, which is not defined
				expect(g.count, 'item group ' + g.group).toBe(0);
			} else if (g.class === Cclass_info) {
				expect(g.count, 'info group ' + g.group).toBe([...DEFS.infos.byId.values()].filter((d) => d.group === g.group).length);
			}
		}
		expect(objGroups).toBeGreaterThan(0);

		expect(con_add).toHaveBeenCalledWith("ERROR: Unable to load 'core\\scriptcommands.inf'", Cbmpf_red);
		expect(G.in_edrandrot).toBe(1);
		expect(G.map_hour).toBe(9);
		expect(m.e_terrain).toHaveBeenCalledWith(16, 'generated');
		expect(G.in_edmap).toBe('');
		expect(G.in_editor_sidebar).toBe(1);
		// editor_resetcam on the 16 terrain
		expect([EntityX(G.cam), EntityZ(G.cam)]).toEqual([-512, -512]);

		// the default menu is Cmenu_ed_new
		await editor_ini();
		expect(G.m_menu).toBe(1);
	});
});
