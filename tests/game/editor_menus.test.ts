/**
 * editor_menus.bb: editor_menus (one Select over m_menu), editor_setmenu,
 * editor_savescript, editor_savesettings, editor_childs, editor_saveinfo.
 * Expected values are derived from the original source, branch by branch.
 * Functions of other packages are replaced by spies on their modules.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityYaw, RotateEntity } from '../../src/lib/s2/bb3d';
import { SEP_LINE, SeedRnd, Str, f32, setClock } from '../../src/lib/s2/blitz';
import * as additions from '../../src/lib/s2/game/_additions/editor_menus';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_state,
	Cclass_unit,
	Cmenu_ed_attachments,
	Cmenu_ed_colormap,
	Cmenu_ed_grassmap,
	Cmenu_ed_heightmap,
	Cmenu_ed_infolist,
	Cmenu_ed_infos,
	Cmenu_ed_items,
	Cmenu_ed_list,
	Cmenu_ed_load,
	Cmenu_ed_map,
	Cmenu_ed_new,
	Cmenu_ed_objects,
	Cmenu_ed_options,
	Cmenu_ed_quit,
	Cmenu_ed_random,
	Cmenu_ed_save,
	Cmenu_ed_scripts,
	Cmenu_ed_settings,
	Cmenu_ed_states,
	Cmenu_ed_units,
	Cpm_in,
	Cpm_out,
	Cstate_light
} from '../../src/lib/s2/game/consts';
import { Ditem_name, Dobject_health, Dunit_health, loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import * as e_save_map from '../../src/lib/s2/game/e_save_map';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { editor_childs, editor_menus, editor_saveinfo, editor_savescript, editor_savesettings, editor_setmenu } from '../../src/lib/s2/game/editor_menus';
import { CloseFile, WriteFile, WriteLine } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as game_changeday from '../../src/lib/s2/game/game_changeday';
import * as grasspread from '../../src/lib/s2/game/grasspread';
import * as gui from '../../src/lib/s2/game/gui';
import { gui_tb_loadstring, gui_tb_savestring } from '../../src/lib/s2/game/gui_tb';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import * as bmpf from '../../src/lib/s2/game/load_bmpf';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { include_load_strings, se, sm, ss } from '../../src/lib/s2/game/load_strings';
import * as menu from '../../src/lib/s2/game/menu';
import * as particles from '../../src/lib/s2/game/particles';
import * as randommap from '../../src/lib/s2/game/randommap';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import * as sys from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, New, TYPES, Tat, Tdefvar, Tinfo, Titem, Tobject, Trecent, Tstate, Tunit, Tx } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

/** The mouse is at x,y and button `b` was released this frame. */
function click(x: number, y: number, b = 1): void {
	G.in_mx = x;
	G.in_my = y;
	G.in_mrelease[b] = 1;
}
/** Click on an icon button drawn at x,y (32x32). */
function clickButton(x: number, y: number, b = 1): void {
	click(x + 5, y + 5, b);
}
function count(t: unknown): number {
	return [...Each(t as never)].length;
}

describe.skipIf(!existsSync(MOD))('editor_menus.bb', () => {
	let now = 0;
	/** spies on the other half of the editor (package editor_core) */
	let ed: Record<string, ReturnType<typeof vi.spyOn>>;
	let gui_msg: ReturnType<typeof vi.spyOn>;
	let gui_msgdecide: ReturnType<typeof vi.spyOn>;
	let gui_win_file: ReturnType<typeof vi.spyOn>;
	let gui_win_color: ReturnType<typeof vi.spyOn>;
	let objTyp = 0;
	let unitTyp = 0;
	let itemTyp = 0;

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await include_load_strings();
		await loadAllDefinitions();

		ed = {};
		const sync = [
			'editor_quit',
			'editor_picking',
			'editor_setmode',
			'editor_defaultmapsettings',
			'editor_textobuffer',
			'editor_buffertotex',
			'editor_buffertoheightmap',
			'editor_heightmaptobuffer',
			'editor_grassmaptobuffer',
			'editor_bufferwin',
			'editor_resetcam',
			'editor_jumpto'
		] as const;
		for (const n of sync) ed[n] = vi.spyOn(editor_functions, n).mockImplementation((() => {}) as never);
		ed.editor_getskybox = vi.spyOn(editor_functions, 'editor_getskybox').mockImplementation((n: string) => 'SKY(' + n + ')');
		ed.editor_genmap = vi.spyOn(editor_functions, 'editor_genmap').mockResolvedValue(undefined as never);
		ed.editor_gencolormap = vi.spyOn(editor_functions, 'editor_gencolormap').mockResolvedValue(undefined as never);
		ed.editor_ini = vi.spyOn(editor_functions, 'editor_ini').mockResolvedValue(undefined as never);
		ed.editor_testmap = vi.spyOn(editor_functions, 'editor_testmap').mockResolvedValue(1 as never);

		gui_msg = vi.spyOn(gui, 'gui_msg').mockResolvedValue(undefined);
		gui_msgdecide = vi.spyOn(gui, 'gui_msgdecide').mockResolvedValue(0);
		gui_win_file = vi.spyOn(gui, 'gui_win_file').mockResolvedValue(0);
		gui_win_color = vi.spyOn(gui, 'gui_win_color').mockResolvedValue(0);

		objTyp = [...DEFS.objects.byId.keys()][0];
		unitTyp = [...DEFS.units.byId.keys()][0];
		itemTyp = [...DEFS.items.byId.keys()][0];

		G.in_mx = 0;
		G.in_my = 0;
	});

	afterEach(() => {
		disposeRuntime();
		resetGameState();
		resetDefs();
		clearDeferred();
		setFrameScheduler(null);
		setFrameHook(null);
		sys.setCommandLine(null);
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

	// ------------------------------------------------------------------ editor_savescript

	describe('editor_savescript', () => {
		it('class 0: the text box becomes map_briefing$ (every row followed by the separator), "" when empty', () => {
			gui_tb_loadstring('on:start {' + SEP_LINE + 'msg "hi";' + SEP_LINE + '}', SEP_LINE);
			expect(editor_savescript(0)).toBe(1);
			expect(G.map_briefing).toBe('on:start {' + SEP_LINE + 'msg "hi";' + SEP_LINE + '}' + SEP_LINE);
			gui_tb_loadstring('   ', '');
			expect(editor_savescript(0)).toBe(1);
			expect(G.map_briefing).toBe('');
			expect(count(Tx)).toBe(0);
		});

		it('class -1: ed_setscript$', () => {
			gui_tb_loadstring('x', SEP_LINE);
			expect(editor_savescript(-1, 99)).toBe(1);
			expect(G.ed_setscript).toBe('x' + SEP_LINE);
			expect(G.map_briefing).toBe('');
			gui_tb_loadstring('', '');
			expect(editor_savescript(-1)).toBe(1);
			expect(G.ed_setscript).toBe('');
		});

		it('creates, changes and deletes the Tx of a parent; skips Tx with mode<>0', () => {
			// a variable (mode 1) of the same parent is not a script
			const v = New(Tx);
			v.parent_class = Cclass_object;
			v.parent_id = 7;
			v.mode = 1;
			v.value = 'var';

			// nothing to save, nothing there
			gui_tb_loadstring('', '');
			expect(editor_savescript(Cclass_object, 7)).toBe(0);
			expect(count(Tx)).toBe(1);

			// create
			gui_tb_loadstring('a' + SEP_LINE + 'b', SEP_LINE);
			expect(editor_savescript(Cclass_object, 7)).toBe(1);
			const all = [...Each(Tx)];
			expect(all.length).toBe(2);
			expect(all[1]).toMatchObject({ parent_class: Cclass_object, parent_id: 7, mode: 0, value: 'a' + SEP_LINE + 'b' + SEP_LINE });

			// change
			gui_tb_loadstring('c', SEP_LINE);
			expect(editor_savescript(Cclass_object, 7)).toBe(1);
			expect([...Each(Tx)].length).toBe(2);
			expect([...Each(Tx)][1].value).toBe('c' + SEP_LINE);

			// other id: a second script
			expect(editor_savescript(Cclass_object, 8)).toBe(1);
			expect([...Each(Tx)].length).toBe(3);

			// delete (returns 0)
			gui_tb_loadstring(' ', '');
			expect(editor_savescript(Cclass_object, 7)).toBe(0);
			const left = [...Each(Tx)];
			expect(left.map((t) => [t.parent_id, t.mode])).toEqual([
				[7, 1],
				[8, 0]
			]);
		});
	});

	// ------------------------------------------------------------------ editor_savesettings

	describe('editor_savesettings', () => {
		function run(time: string): [number, number, number] {
			G.in_input[3] = time;
			editor_savesettings();
			return [G.map_day, G.map_hour, G.map_minute];
		}

		it('parses day:hour:minute, clamps, and falls back to 1, 9:00 without two colons', () => {
			expect(run('3:14:07')).toEqual([3, 14, 7]);
			expect(run('0:99:-5')).toEqual([1, 23, 0]);
			expect(run('12:-1:75')).toEqual([12, 0, 59]);
			expect(run('abc')).toEqual([1, 9, 0]);
			expect(run('5:6')).toEqual([1, 9, 0]);
			expect(run('')).toEqual([1, 9, 0]);
			// Int() of the parts: "x" is 0 -> day clamped to 1
			expect(run('x:7:8')).toEqual([1, 7, 8]);
		});

		it('copies the other fields of the Settings window', () => {
			G.in_input[3] = '2:3:4';
			G.in_input[4] = 'evening';
			G.in_input[5] = 'sfx\\music.mp3';
			G.in_check[5] = 1;
			G.in_check[6] = 1;
			G.in_check[7] = 1;
			G.in_opt[3] = 4;
			gui_tb_loadstring('briefing', SEP_LINE);
			editor_savesettings();
			expect(G.map_freezetime).toBe(1);
			expect(G.map_skybox).toBe('evening');
			expect(G.map_multiplayer).toBe(1);
			expect(G.map_climate).toBe(4);
			expect(G.map_music).toBe('sfx\\music.mp3');
			expect(G.map_fog[3]).toBe(1);
			expect(G.map_briefing).toBe('briefing' + SEP_LINE);
			gui_tb_loadstring('', '');
			editor_savesettings();
			expect(G.map_briefing).toBe('');
		});
	});

	// ------------------------------------------------------------------ editor_setmenu

	describe('editor_setmenu', () => {
		it('always: previous menu, menu, scroll offsets', () => {
			G.m_menu = Cmenu_ed_settings;
			G.in_scr_scr = 3;
			G.in_scr_scr2 = 4;
			G.in_scr_scr3 = 5;
			G.in_scr_descr = 6;
			editor_setmenu(Cmenu_ed_infolist);
			expect(G.in_prevmenu).toBe(Cmenu_ed_settings);
			expect(G.m_menu).toBe(Cmenu_ed_infolist);
			expect([G.in_scr_scr, G.in_scr_scr2, G.in_scr_scr3, G.in_scr_descr]).toEqual([0, 0, 0, 0]);
		});

		it('New', () => {
			G.in_opt[3] = 5;
			G.in_opt[4] = 5;
			G.in_opt[5] = 5;
			editor_setmenu(Cmenu_ed_new);
			expect([G.in_opt[3], G.in_opt[4], G.in_opt[5]]).toEqual([0, 0, 0]);
			expect([G.in_check[5], G.in_check[6], G.in_check[7], G.in_check[8]]).toEqual([1, 1, 1, 1]);
		});

		it('Load / Save: recent list, name of the edited map', () => {
			const load_recent = vi.spyOn(e_load_map, 'load_recent').mockImplementation(() => {});
			G.in_input[3] = 'x';
			G.in_input[4] = 'pw';
			G.in_opt[3] = 2;
			G.in_edmap = '';
			editor_setmenu(Cmenu_ed_load);
			expect(load_recent).toHaveBeenCalledWith();
			expect([G.in_input[3], G.in_input[4], G.in_opt[3]]).toEqual(['', '', 0]);
			G.in_edmap = 'adventure\\map01';
			G.in_input[4] = 'pw';
			editor_setmenu(Cmenu_ed_save);
			expect(load_recent).toHaveBeenCalledTimes(2);
			expect([G.in_input[3], G.in_input[4]]).toEqual(['adventure\\map01', '']);
		});

		it('Heightmap / Grassmap / Random', () => {
			editor_setmenu(Cmenu_ed_heightmap);
			expect(ed.editor_heightmaptobuffer).toHaveBeenCalledOnce();
			expect([G.in_editor_bufferx, G.in_editor_buffery]).toEqual([-5, -5]);
			expect([G.in_input[3], G.in_input[4]]).toEqual(['', '1']);
			expect([G.in_slider[0], G.in_slider[10], G.in_edtool]).toEqual([50, 100, 0]);

			G.in_edtool = 3;
			G.in_editor_bufferx = 9;
			editor_setmenu(Cmenu_ed_grassmap);
			expect(ed.editor_grassmaptobuffer).toHaveBeenCalledOnce();
			expect([G.in_editor_bufferx, G.in_editor_buffery, G.in_edtool]).toEqual([-5, -5, 0]);

			G.ter_size = 34;
			editor_setmenu(Cmenu_ed_random);
			// (ter_size*ter_size)/4 = 1156/4
			expect(G.in_input[3]).toBe('289');
			expect([G.in_check[5], G.in_check[6], G.in_check[7], G.in_opt[5]]).toEqual([1, 0, 0, 1]);
		});

		it('Colormap: buffer from ter_tex_color, its height into the scale field', () => {
			vi.spyOn(additions, 'ter_tex_color_height').mockReturnValue(256);
			G.in_edtool = 2;
			editor_setmenu(Cmenu_ed_colormap);
			expect(ed.editor_textobuffer).toHaveBeenCalledWith(G.ter_tex_color);
			expect([G.in_input[3], G.in_input[4]]).toEqual(['', '256']);
			expect([G.in_edtool, G.in_slider[10]]).toEqual([0, 100]);
		});

		it('Settings: fills the fields from the map variables', () => {
			G.map_day = 4;
			G.map_hour = 7;
			G.map_minute = 5;
			G.map_freezetime = 1;
			G.map_skybox = 'night';
			G.map_multiplayer = 1;
			G.map_climate = 3;
			G.map_music = 'm.mp3';
			G.map_fog[3] = 1;
			G.map_briefing = 'l1' + SEP_LINE + 'l2' + SEP_LINE;
			editor_setmenu(Cmenu_ed_settings);
			// no leading zeros: Int + ":" + Int
			expect(G.in_input[3]).toBe('4:7:5');
			expect(G.in_check[5]).toBe(1);
			expect(G.in_input[4]).toBe('night');
			expect(G.in_check[6]).toBe(1);
			expect(G.in_opt[3]).toBe(3);
			expect(G.in_input[5]).toBe('m.mp3');
			expect(G.in_check[7]).toBe(1);
			expect(gui_tb_savestring(SEP_LINE)).toBe('l1' + SEP_LINE + 'l2' + SEP_LINE);
		});

		it('Object / Unit properties: yaw, health, script (last matching Tx wins)', () => {
			const o = New(Tobject);
			o.id = 12;
			o.h = CreatePivot();
			RotateEntity(o.h, 0, 90, 0);
			o.health = f32(12.5);
			o.health_max = 100;
			const con_object = vi.spyOn(handle_objects, 'con_object').mockImplementation((id: number) => {
				G.TCobject = id === 12 ? o : null;
				return id === 12 ? 1 : 0;
			});
			for (const [cls, id, mode, value] of [
				[Cclass_object, 12, 1, 'var'],
				[Cclass_unit, 12, 0, 'unit'],
				[Cclass_object, 12, 0, 'first' + SEP_LINE],
				[Cclass_object, 12, 0, 'second' + SEP_LINE]
			] as const) {
				const t = New(Tx);
				t.parent_class = cls;
				t.parent_id = id;
				t.mode = mode;
				t.value = value;
			}
			gui_tb_loadstring('old', '');
			editor_setmenu(Cmenu_ed_objects, 12);
			expect(con_object).toHaveBeenCalledWith(12);
			expect(G.in_input[3]).toBe('12');
			expect(G.in_input[4]).toBe(Str(EntityYaw(o.h), 'float'));
			expect(G.in_input[5]).toBe('12.5');
			expect(G.in_input[6]).toBe('100.0');
			expect(gui_tb_savestring(SEP_LINE)).toBe('second' + SEP_LINE);

			// param=-1 keeps in_input(3); an unknown id leaves everything as it is
			G.in_input[3] = '13';
			G.in_input[4] = 'keep';
			editor_setmenu(Cmenu_ed_objects);
			expect(con_object).toHaveBeenLastCalledWith(13);
			expect(G.in_input[4]).toBe('keep');
			expect(gui_tb_savestring(SEP_LINE)).toBe('second' + SEP_LINE);

			// units
			const u = New(Tunit);
			u.id = 12;
			u.h = CreatePivot();
			u.health = 3;
			u.health_max = 4;
			vi.spyOn(handle_units, 'con_unit').mockImplementation(() => {
				G.TCunit = u;
				return 1;
			});
			editor_setmenu(Cmenu_ed_units, 12);
			expect([G.in_input[3], G.in_input[4], G.in_input[5], G.in_input[6]]).toEqual(['12', Str(EntityYaw(u.h), 'float'), '3.0', '4.0']);
			expect(gui_tb_savestring(SEP_LINE)).toBe('unit' + SEP_LINE);
		});

		it('Item properties: count and "attached to object" only for items stored outside', () => {
			const it_ = New(Titem);
			it_.id = 5;
			it_.h = CreatePivot();
			it_.health = 50;
			it_.count = 3;
			vi.spyOn(handle_items, 'con_item').mockImplementation(() => {
				G.TCitem = it_;
				return 1;
			});
			editor_setmenu(Cmenu_ed_items, 5);
			expect([G.in_input[3], G.in_input[4], G.in_input[5], G.in_input[6], G.in_input[7]]).toEqual(['5', Str(EntityYaw(it_.h), 'float'), '50.0', '3', '0']);
			expect(gui_tb_savestring(SEP_LINE)).toBe(SEP_LINE);

			it_.parent_class = Cclass_object;
			it_.parent_id = 44;
			it_.parent_mode = Cpm_in;
			editor_setmenu(Cmenu_ed_items, 5);
			expect(G.in_input[7]).toBe('0');
			it_.parent_mode = Cpm_out;
			editor_setmenu(Cmenu_ed_items, 5);
			expect(G.in_input[7]).toBe('44');
		});

		it('Info properties: one layout of ints/floats/strings per info type', () => {
			const inf = New(Tinfo);
			inf.id = 3;
			vi.spyOn(handle_infos, 'con_info').mockImplementation(() => {
				G.TCinfo = inf;
				return 1;
			});
			const reset = () => {
				for (let i = 3; i <= 8; i++) G.in_input[i] = '?';
				G.in_opt[3] = -9;
				G.in_check[0] = -9;
				G.in_check[1] = -9;
			};

			//Sprite
			inf.typ = 5;
			inf.strings = ['gfx\\a.bmp', '1', '0'];
			inf.floats = [f32(1.5), 2, f32(0.5)];
			inf.ints = [10, 20, 30];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[3], G.in_input[4], G.in_input[5], G.in_input[6]]).toEqual(['3', 'gfx\\a.bmp', '1.5', '2.0']);
			expect([G.in_scol[0], G.in_scol[1], G.in_scol[2]]).toEqual([10, 20, 30]);
			expect(G.in_slider[0]).toBe(50);
			expect([G.in_check[0], G.in_check[1]]).toEqual([1, 0]);

			//Trigger Range, Time, Item Count: floats are shown as Ints (2.5 -> 2, 3.5 -> 4: round to even)
			for (const typ of [10, 11, 12]) {
				inf.typ = typ;
				inf.ints = [2, 33, 44];
				inf.floats = [f32(2.5), 1, f32(3.5)];
				reset();
				editor_setmenu(Cmenu_ed_infos, 3);
				expect(G.in_opt[3]).toBe(2);
				expect([G.in_input[4], G.in_input[5], G.in_input[6], G.in_input[7]]).toEqual(['33', '44', '2', '4']);
				expect(G.in_check[0]).toBe(1);
			}

			//Map Indication
			inf.typ = 36;
			inf.ints = [9, 1, 0];
			inf.strings = ['Camp', '', ''];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_opt[3], G.in_check[0], G.in_input[4]]).toEqual([9, 1, 'Camp']);

			//Areas
			for (const typ of [41, 42, 43, 44]) {
				inf.typ = typ;
				inf.floats = [150, 0, 0];
				reset();
				editor_setmenu(Cmenu_ed_infos, 3);
				expect(G.in_input[4]).toBe('150');
				expect(G.in_input[5]).toBe('?');
			}

			//Spawn Control
			inf.typ = 45;
			inf.floats = [300, 1, 0];
			inf.ints = [Cclass_unit, 7, 12];
			inf.strings = ['5x', '', ''];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[4], G.in_input[5], G.in_input[6], G.in_input[7], G.in_input[8]]).toEqual(['300', '7', '12', '5', '0']);
			expect([G.in_check[0], G.in_opt[3]]).toEqual([1, Cclass_unit]);

			//AI Area
			inf.typ = 46;
			inf.floats = [80, 0, 0];
			inf.ints = [1, 0, 0];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[4], G.in_opt[3]]).toEqual(['80', 1]);

			//Loudspeaker
			inf.typ = 47;
			inf.strings = ['sfx\\x.wav', '', ''];
			inf.floats = [120, 0, 0];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[4], G.in_input[5]]).toEqual(['sfx\\x.wav', '120']);

			//Previewimage
			inf.typ = 48;
			inf.strings = ['maps\\p.bmp', '', ''];
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[4], G.in_input[5]]).toEqual(['maps\\p.bmp', '?']);

			//anything else: only the id and the script
			inf.typ = 1;
			reset();
			editor_setmenu(Cmenu_ed_infos, 3);
			expect([G.in_input[3], G.in_input[4]]).toEqual(['3', '?']);
		});

		it('Script editor: briefing when coming from Settings, ed_setscript for class -1, else the first Tx', () => {
			G.map_briefing = 'brief' + SEP_LINE;
			G.ed_setscript = 'set' + SEP_LINE;
			for (const value of ['one' + SEP_LINE, 'two' + SEP_LINE]) {
				const t = New(Tx);
				t.parent_class = Cclass_item;
				t.parent_id = 9;
				t.value = value;
			}

			G.m_menu = Cmenu_ed_settings;
			G.in_input[3] = '3';
			G.in_input[4] = '9';
			editor_setmenu(Cmenu_ed_scripts);
			expect(gui_tb_savestring(SEP_LINE)).toBe('brief' + SEP_LINE);

			G.m_menu = Cmenu_ed_items;
			G.in_input[3] = '-1';
			editor_setmenu(Cmenu_ed_scripts);
			expect(gui_tb_savestring(SEP_LINE)).toBe('set' + SEP_LINE);

			G.m_menu = Cmenu_ed_items;
			G.in_input[3] = '3';
			editor_setmenu(Cmenu_ed_scripts);
			// Exit after the first match (unlike the property windows)
			expect(gui_tb_savestring(SEP_LINE)).toBe('one' + SEP_LINE);

			G.m_menu = Cmenu_ed_items;
			G.in_input[4] = '10';
			editor_setmenu(Cmenu_ed_scripts);
			expect(gui_tb_savestring(SEP_LINE)).toBe(SEP_LINE);
		});

		it('State properties: value_f, value and the colour out of value_s', () => {
			const st = New(Tstate);
			st.typ = Cstate_light;
			st.parent_class = Cclass_object;
			st.parent_id = 4;
			st.value_f = f32(1.5);
			st.value = 30;
			st.value_s = '255,128,7';
			G.in_input[3] = Str(Cstate_light);
			G.in_input[4] = Str(Cclass_object);
			G.in_input[5] = '4';
			editor_setmenu(Cmenu_ed_states);
			expect([G.in_input[6], G.in_input[7]]).toEqual(['1.5', '30']);
			expect([G.in_scol[0], G.in_scol[1], G.in_scol[2]]).toEqual([255, 128, 7]);

			// no such state: nothing changes
			G.in_input[5] = '5';
			G.in_input[6] = 'keep';
			editor_setmenu(Cmenu_ed_states);
			expect(G.in_input[6]).toBe('keep');
		});

		it('Map: frees the cached map image', () => {
			G.map_mapimage = 0;
			editor_setmenu(Cmenu_ed_map);
			expect(G.map_mapimage).toBe(0);
			expect(G.m_menu).toBe(Cmenu_ed_map);
		});
	});

	// ------------------------------------------------------------------ editor_saveinfo

	describe('editor_saveinfo', () => {
		let info_vts: ReturnType<typeof vi.spyOn>;
		let info_setupsprite: ReturnType<typeof vi.spyOn>;
		let inf: Tinfo;
		let other: Tinfo;

		beforeEach(() => {
			info_vts = vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
			info_setupsprite = vi.spyOn(handle_infos, 'info_setupsprite').mockImplementation(() => {});
			inf = New(Tinfo);
			inf.id = 3;
			other = New(Tinfo);
			other.id = 4;
			G.TCinfo = other;
			G.in_input[3] = '3';
			gui_tb_loadstring('', '');
		});

		it('Sprite (5)', () => {
			inf.typ = 5;
			G.in_input[4] = 'gfx\\s.bmp';
			G.in_input[5] = '1.5';
			G.in_input[6] = '2';
			G.in_scol[0] = 1;
			G.in_scol[1] = 2;
			G.in_scol[2] = 3;
			G.in_slider[0] = 33;
			G.in_check[0] = 1;
			G.in_check[1] = 0;
			editor_saveinfo(inf);
			expect(inf.strings).toEqual(['gfx\\s.bmp', '1', '0']);
			expect(inf.floats).toEqual([1.5, 2, f32(33 / 100)]);
			expect(inf.ints).toEqual([1, 2, 3]);
			expect(info_vts).toHaveBeenCalledOnce();
			expect(info_setupsprite).toHaveBeenCalledWith(inf);
		});

		it('Triggers (10, 11, 12) and Map Indication (36) write the parameter', () => {
			for (const typ of [10, 11, 12]) {
				inf.typ = typ;
				inf.ints = [0, 0, 0];
				inf.floats = [0, 0, 0];
				G.in_opt[3] = 2;
				G.in_input[4] = '17';
				G.in_input[5] = '5abc';
				G.in_input[6] = '250.9';
				G.in_check[0] = 1;
				G.in_input[7] = '3';
				editor_saveinfo(inf);
				expect(inf.ints).toEqual([2, 17, 5]);
				// Int("250.9") is 250
				expect(inf.floats).toEqual([250, 1, 3]);
			}
			expect(info_vts).toHaveBeenCalledTimes(3);
			expect(info_setupsprite).not.toHaveBeenCalled();

			inf.typ = 36;
			G.in_opt[3] = 11;
			G.in_check[0] = 1;
			G.in_input[4] = 'Here';
			editor_saveinfo(inf);
			expect(inf.ints.slice(0, 2)).toEqual([11, 1]);
			expect(inf.strings[0]).toBe('Here');
			expect(other.strings[0]).toBe('');
		});

		it('quirk: Areas, Spawn Control, AI Area, Loudspeaker write (partly) through TCinfo', () => {
			for (const typ of [41, 42, 43, 44]) {
				inf.typ = typ;
				other.floats = [0, 0, 0];
				G.in_input[4] = '75';
				editor_saveinfo(inf);
				expect(other.floats[0]).toBe(75);
				expect(inf.floats[0]).toBe(0);
			}

			inf.typ = 45;
			other.floats = [0, 0, 0];
			G.in_input[4] = '90';
			G.in_check[0] = 1;
			G.in_opt[3] = Cclass_item;
			G.in_input[5] = '8';
			G.in_input[6] = '20';
			G.in_input[7] = '4';
			G.in_input[8] = 'x';
			editor_saveinfo(inf);
			expect(other.floats).toEqual([90, 0, 0]);
			expect(inf.floats).toEqual([0, 1, 0]);
			expect(other.ints).toEqual([Cclass_item, 8, 20]);
			expect(other.strings.slice(0, 2)).toEqual(['4', '0']);
			expect(inf.ints).toEqual([0, 0, 0]);

			inf.typ = 46;
			G.in_input[4] = '60';
			G.in_opt[3] = 1;
			editor_saveinfo(inf);
			expect([other.floats[0], other.ints[0]]).toEqual([60, 1]);

			inf.typ = 47;
			G.in_input[4] = 'sfx\\a.wav';
			G.in_input[5] = '200';
			editor_saveinfo(inf);
			expect(inf.strings[0]).toBe('sfx\\a.wav');
			expect(other.floats[0]).toBe(200);

			inf.typ = 48;
			G.in_input[4] = 'p.bmp';
			editor_saveinfo(inf);
			expect(inf.strings[0]).toBe('p.bmp');
		});

		it('always saves the script of info in_input(3); other types save nothing else', () => {
			inf.typ = 1;
			gui_tb_loadstring('on:use { }', SEP_LINE);
			editor_saveinfo(inf);
			expect(info_vts).not.toHaveBeenCalled();
			expect([...Each(Tx)]).toMatchObject([{ parent_class: Cclass_info, parent_id: 3, value: 'on:use { }' + SEP_LINE }]);
		});
	});

	// ------------------------------------------------------------------ editor_childs

	describe('editor_childs', () => {
		it('states: the add button first switches the sidebar to states, then adds the selected state', () => {
			const set_state = vi.spyOn(handle_states, 'set_state').mockImplementation(() => 1);
			G.in_opt[0] = Cclass_object;
			G.in_state_sel = 4;
			clickButton(742, 390);
			editor_childs(Cclass_unit, 9);
			expect(G.in_opt[0]).toBe(Cclass_state);
			expect(ed.editor_setmode).toHaveBeenCalledWith(Cclass_state);
			expect(set_state).not.toHaveBeenCalled();

			clickButton(742, 390);
			editor_childs(Cclass_unit, 9);
			expect(set_state).toHaveBeenCalledWith(4, Cclass_unit, 9);
			expect(G.in_scr_scr).toBe(0);
		});

		it('states: left click on a child state frees it, right click opens its window; the list scrolls after four', () => {
			const free_state = vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1);
			for (let i = 0; i < 6; i++) {
				const st = New(Tstate);
				st.typ = 10 + i;
				st.parent_class = i === 1 ? Cclass_item : Cclass_unit;
				st.parent_id = 9;
			}
			// second visible box (x=450+45) is the third state (the second belongs to an item)
			click(450 + 45 + 5, 395, 1);
			G.in_scr_scr = 0;
			editor_childs(Cclass_unit, 9, 1, 0, 0);
			expect(free_state).toHaveBeenCalledWith(12, Cclass_unit, 9);

			// with offset 1 the first box is that state; right click
			click(455, 395, 2);
			G.in_scr_scr = 1;
			G.m_menu = Cmenu_ed_units;
			editor_childs(Cclass_unit, 9, 1, 0, 0);
			expect([G.in_input[3], G.in_input[4], G.in_input[5]]).toEqual(['12', Str(Cclass_unit), '9']);
			expect(G.m_menu).toBe(Cmenu_ed_states);
			expect(G.in_prevmenu).toBe(Cmenu_ed_units);

			// five states of the unit: x passes 450+45*3 -> the "right" button is active
			G.m_menu = Cmenu_ed_units;
			G.in_scr_scr = 0;
			clickButton(742 - 37, 390);
			editor_childs(Cclass_unit, 9, 1, 0, 0);
			expect(G.in_scr_scr).toBe(1);
			clickButton(742 - 37 - 37, 390);
			editor_childs(Cclass_unit, 9, 1, 0, 0);
			expect(G.in_scr_scr).toBe(0);
			// "left" is passive at offset 0
			clickButton(742 - 37 - 37, 390);
			editor_childs(Cclass_unit, 9, 1, 0, 0);
			expect(G.in_scr_scr).toBe(0);
		});

		it('items: add creates the selected item and stores it in the parent', () => {
			const created = New(Titem);
			created.id = 77;
			const set_item = vi.spyOn(handle_items, 'set_item').mockImplementation(() => {
				G.TCitem = created;
				return 77;
			});
			const store_item = vi.spyOn(handle_items, 'store_item').mockImplementation(() => 1);
			G.in_item_sel = itemTyp;
			G.in_opt[0] = Cclass_state;
			clickButton(742, 440);
			editor_childs(Cclass_object, 2, 0, 1, 0);
			expect(G.in_opt[0]).toBe(Cclass_item);
			expect(ed.editor_setmode).toHaveBeenCalledWith(Cclass_item);
			expect(set_item).not.toHaveBeenCalled();

			clickButton(742, 440);
			editor_childs(Cclass_object, 2, 0, 1, 0);
			expect(set_item).toHaveBeenCalledWith(-1, itemTyp, 0, 0, 0, 1);
			expect(store_item).toHaveBeenCalledWith(77, Cclass_object, 2);
		});

		it('items: left click frees the child item, right click opens its window', () => {
			const free_item = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1);
			const child = New(Titem);
			child.id = 31;
			child.typ = itemTyp;
			child.parent_class = Cclass_object;
			child.parent_id = 2;
			child.count = 2;
			vi.spyOn(handle_items, 'con_item').mockReturnValue(0);

			click(455, 445, 1);
			G.in_scr_scr2 = 0;
			editor_childs(Cclass_object, 2, 0, 1, 0);
			expect(free_item).toHaveBeenCalledWith(31);

			click(455, 445, 2);
			editor_childs(Cclass_object, 2, 0, 1, 0);
			expect(G.m_menu).toBe(Cmenu_ed_items);
			expect(G.in_input[3]).toBe('31');

			// other parent: not listed
			free_item.mockClear();
			click(455, 445, 1);
			editor_childs(Cclass_object, 3, 0, 1, 0);
			expect(free_item).not.toHaveBeenCalled();
		});

		it('script button: saves the open property window, then opens the script editor for the parent', () => {
			const o = New(Tobject);
			o.id = 6;
			o.h = CreatePivot();
			G.in_input[3] = '6';
			G.in_input[4] = '45';
			G.in_input[5] = '7.5';
			G.in_input[6] = '20';
			G.m_menu = Cmenu_ed_objects;
			gui_tb_loadstring('on:use { }', SEP_LINE);
			clickButton(742, 490);
			editor_childs(Cclass_object, 6, 0, 0, 1);
			expect(EntityYaw(o.h)).toBeCloseTo(45, 3);
			expect([o.health, o.health_max]).toEqual([7.5, 20]);
			expect([...Each(Tx)]).toMatchObject([{ parent_class: Cclass_object, parent_id: 6, value: 'on:use { }' + SEP_LINE }]);
			expect([G.in_input[3], G.in_input[4]]).toEqual([Str(Cclass_object), '6']);
			expect(G.m_menu).toBe(Cmenu_ed_scripts);
			expect(G.in_prevmenu).toBe(Cmenu_ed_objects);
			// the script editor shows the script that was just saved
			expect(gui_tb_savestring(SEP_LINE)).toBe('on:use { }' + SEP_LINE);
		});

		it('script button for an item: count is at least 1; for an info: editor_saveinfo', () => {
			const item = New(Titem);
			item.id = 8;
			item.h = CreatePivot();
			G.in_input[3] = '8';
			G.in_input[4] = '0';
			G.in_input[5] = '12';
			G.in_input[6] = '0';
			gui_tb_loadstring('', '');
			clickButton(742, 490);
			editor_childs(Cclass_item, 8, 0, 0, 1);
			expect([item.health, item.count]).toEqual([12, 1]);
			expect([G.in_input[3], G.in_input[4]]).toEqual([Str(Cclass_item), '8']);

			const info_vts = vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
			const inf = New(Tinfo);
			inf.id = 2;
			inf.typ = 48;
			G.TCinfo = inf;
			G.in_input[3] = '2';
			G.in_input[4] = 'preview.bmp';
			clickButton(742, 490);
			editor_childs(Cclass_info, 2, 0, 0, 1);
			expect(inf.strings[0]).toBe('preview.bmp');
			expect(info_vts).toHaveBeenCalledOnce();
			expect([G.in_input[3], G.in_input[4]]).toEqual([Str(Cclass_info), '2']);
		});
	});

	// ------------------------------------------------------------------ editor_menus

	describe('editor_menus', () => {
		it('menu 0 draws nothing; every window closes with its X button', async () => {
			const txt = vi.spyOn(bmpf, 'bmpf_txt');
			G.m_menu = 0;
			await editor_menus();
			expect(txt).not.toHaveBeenCalled();

			vi.spyOn(interface_, 'if_map').mockImplementation(() => {});
			vi.spyOn(additions, 'ter_tex_color_height').mockReturnValue(64);
			for (const m of [
				Cmenu_ed_new,
				Cmenu_ed_settings,
				Cmenu_ed_infolist,
				Cmenu_ed_options,
				Cmenu_ed_attachments,
				Cmenu_ed_random,
				Cmenu_ed_quit,
				Cmenu_ed_load,
				Cmenu_ed_save,
				Cmenu_ed_heightmap,
				Cmenu_ed_colormap,
				Cmenu_ed_grassmap,
				Cmenu_ed_objects,
				Cmenu_ed_units,
				Cmenu_ed_items,
				Cmenu_ed_infos,
				Cmenu_ed_scripts,
				Cmenu_ed_states,
				Cmenu_ed_list,
				Cmenu_ed_map
			]) {
				G.m_menu = m;
				clickButton(742, 5);
				await editor_menus();
				expect(G.m_menu, 'menu ' + m).toBe(0);
			}
			// the property windows also reset the sidebar
			expect(ed.editor_setmode.mock.calls).toEqual([[Cclass_object], [Cclass_unit]]);
			expect(ed.editor_picking.mock.calls).toEqual([[Cclass_item]]);
		});

		it('New: Okay generates the map', async () => {
			const grass_map = vi.spyOn(grasspread, 'grass_map').mockImplementation(() => {});
			const grass_heightmap = vi.spyOn(grasspread, 'grass_heightmap').mockImplementation(() => {});
			const order: string[] = [];
			for (const n of ['editor_defaultmapsettings', 'editor_genmap', 'editor_gencolormap', 'editor_resetcam']) {
				ed[n].mockImplementation((() => {
					order.push(n);
				}) as never);
			}
			grass_map.mockImplementation(() => void order.push('grass_map'));
			grass_heightmap.mockImplementation(() => void order.push('grass_heightmap'));
			G.m_menu = Cmenu_ed_new;
			G.in_edmap = 'old';
			clickButton(742, 542);
			await editor_menus();
			expect(order).toEqual(['editor_defaultmapsettings', 'editor_genmap', 'editor_gencolormap', 'grass_map', 'grass_heightmap', 'editor_resetcam']);
			expect(ed.editor_genmap).toHaveBeenCalledWith();
			expect(ed.editor_gencolormap).toHaveBeenCalledWith();
			expect([G.m_menu, G.in_edmap]).toEqual([0, '']);

			// Cancel
			G.m_menu = Cmenu_ed_new;
			clickButton(742 - 37, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
			expect(order.length).toBe(6);
		});

		it('Settings: Okay saves; the buttons at the bottom open the sub windows', async () => {
			G.m_menu = Cmenu_ed_settings;
			G.in_input[3] = '2:10:30';
			G.in_input[4] = 'dusk';
			gui_tb_loadstring('', '');
			clickButton(742, 542);
			await editor_menus();
			expect([G.map_day, G.map_hour, G.map_minute, G.map_skybox]).toEqual([2, 10, 30, 'dusk']);
			expect(G.m_menu).toBe(0);

			G.m_menu = Cmenu_ed_settings;
			clickButton(236, 542);
			await editor_menus();
			expect(ed.editor_testmap).toHaveBeenCalledWith();
			expect(G.m_menu).toBe(Cmenu_ed_settings);

			for (const [x, target] of [
				[236 + 37, Cmenu_ed_options],
				[236 + 74, Cmenu_ed_infolist],
				[236 + 111, Cmenu_ed_attachments]
			]) {
				G.m_menu = Cmenu_ed_settings;
				clickButton(x, 542);
				await editor_menus();
				expect(G.m_menu).toBe(target);
				expect(G.in_prevmenu).toBe(Cmenu_ed_settings);
			}
		});

		it('Settings: script button saves the briefing and opens the script editor for class 0', async () => {
			G.m_menu = Cmenu_ed_settings;
			G.in_input[3] = '1:9:0';
			gui_tb_loadstring('hello', SEP_LINE);
			clickButton(742, 285);
			await editor_menus();
			expect(G.map_briefing).toBe('hello' + SEP_LINE);
			expect(G.in_input[3]).toBe('0');
			expect(G.m_menu).toBe(Cmenu_ed_scripts);
			expect(gui_tb_savestring(SEP_LINE)).toBe('hello' + SEP_LINE);
		});

		it('Settings: sky and music browse buttons, fog colour', async () => {
			G.set_rootdir = 'C:\\Stranded II\\';
			G.set_moddir = 'Stranded II';
			gui_win_file.mockImplementation(async () => {
				G.in_win_file = 'night_up.jpg';
				return 1;
			});
			G.m_menu = Cmenu_ed_settings;
			clickButton(742, 83);
			await editor_menus();
			expect(gui_win_file).toHaveBeenCalledWith(se(56), 'C:\\Stranded II\\mods\\Stranded II\\skies', '', 1);
			expect(ed.editor_getskybox).toHaveBeenCalledWith('night_up.jpg');
			expect(G.in_input[4]).toBe('SKY(night_up.jpg)');

			clickButton(742, 220);
			await editor_menus();
			expect(gui_win_file).toHaveBeenLastCalledWith(se(67), 'C:\\Stranded II\\mods\\Stranded II\\sfx', '', 1);
			expect(G.in_input[5]).toBe('night_up.jpg');

			// fog colour box: sliders get colour/2.55, the picked colour goes to map_fog
			G.map_fog[0] = 255;
			G.map_fog[1] = 128;
			G.map_fog[2] = 0;
			gui_win_color.mockImplementation(async () => {
				G.in_win_color[0] = 1;
				G.in_win_color[1] = 2;
				G.in_win_color[2] = 3;
				return 1;
			});
			click(455, 260);
			await editor_menus();
			expect([G.in_slider[0], G.in_slider[1], G.in_slider[2]]).toEqual([100, 50, 0]);
			expect(G.map_fog.slice(0, 3)).toEqual([1, 2, 3]);
		});

		it('Infolist: counts of all lists', async () => {
			const txt = vi.spyOn(bmpf, 'bmpf_txt');
			New(Tobject);
			New(Tobject);
			New(Tunit);
			for (let i = 0; i < 3; i++) New(Titem).parent_class = i === 0 ? 0 : Cclass_unit;
			New(Tinfo);
			New(Tstate);
			New(Tx);
			New(Tx);
			G.ter_size = 64;
			G.m_menu = Cmenu_ed_infolist;
			await editor_menus();
			const at = (x: number, y: number) => txt.mock.calls.find((c) => c[0] === x && c[1] === y)?.[2];
			expect(at(450, 63)).toBe('64x64');
			expect(at(450, 83)).toBe('N/A');
			expect(at(450, 123)).toBe('2');
			expect(at(450, 143)).toBe('1');
			expect(at(450, 163)).toBe('3 ' + ss(se(79), '2'));
			expect(at(450, 183)).toBe('1');
			expect(at(450, 203)).toBe('1');
			expect(at(450, 223)).toBe('2');
			// total, and "physical" entities objects+units+items
			expect(at(450, 263)).toBe('10' + ss(se(83), '6'));

			clickButton(742, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
		});

		it('Options: fit health to the definitions', async () => {
			const def = Dobject_health(objTyp);
			const udef = Dunit_health(unitTyp);
			const a = New(Tobject);
			a.typ = objTyp;
			a.health_max = f32(def + 100);
			a.health = f32(def + 50);
			const b = New(Tobject);
			b.typ = objTyp;
			b.health_max = f32(def + 100);
			b.health = f32(def - 1);
			const c = New(Tobject);
			c.typ = objTyp;
			c.health_max = f32(def - 5);
			c.health = f32(def - 10);
			const d = New(Tobject);
			d.typ = objTyp;
			d.health_max = def;
			d.health = 1;
			const u = New(Tunit);
			u.typ = unitTyp;
			u.health_max = f32(udef - 1);
			u.health = 1;

			// declined: nothing happens
			G.m_menu = Cmenu_ed_options;
			clickButton(236, 63);
			await editor_menus();
			expect(gui_msgdecide).toHaveBeenCalledWith(se(85));
			expect(a.health_max).toBe(f32(def + 100));
			expect(gui_msg).not.toHaveBeenCalled();

			gui_msgdecide.mockResolvedValue(1);
			clickButton(236, 63);
			await editor_menus();
			expect([a.health_max, a.health]).toEqual([def, def]);
			expect([b.health_max, b.health]).toEqual([def, f32(def - 1)]);
			// a too small maximum also refills the health
			expect([c.health_max, c.health]).toEqual([def, def]);
			expect([d.health_max, d.health]).toEqual([def, 1]);
			expect([u.health_max, u.health]).toEqual([udef, udef]);
			expect(gui_msg).toHaveBeenLastCalledWith(ss(se(86), '3', '1'), Cbmpf_green);

			// nothing left to fit
			clickButton(236, 63);
			await editor_menus();
			expect(gui_msg).toHaveBeenLastCalledWith(se(87), Cbmpf_red);
		});

		it('Options: delete all of the selected type (items: stored ones only on request)', async () => {
			const free_item = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1);
			const free_object = vi.spyOn(handle_objects, 'free_object').mockImplementation(() => 1);
			const mk = (id: number, typ: number, parent_class: number) => {
				const t = New(Titem);
				t.id = id;
				t.typ = typ;
				t.parent_class = parent_class;
			};
			mk(1, itemTyp, 0);
			mk(2, itemTyp, Cclass_unit);
			mk(3, itemTyp + 1, 0);
			G.in_item_sel = itemTyp;

			// passive without a class
			G.in_opt[0] = 0;
			G.m_menu = Cmenu_ed_options;
			clickButton(236, 100);
			await editor_menus();
			expect(gui_msgdecide).not.toHaveBeenCalled();

			// confirm: yes; stored items too: no
			G.in_opt[0] = Cclass_item;
			gui_msgdecide.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
			clickButton(236, 100);
			await editor_menus();
			expect(gui_msgdecide.mock.calls).toEqual([[ss(se(90), Ditem_name(itemTyp))], [se(91), 0, sm(2), sm(1)]]);
			expect(free_item.mock.calls).toEqual([[1]]);
			expect(gui_msg).toHaveBeenLastCalledWith(ss(se(92), '1', Ditem_name(itemTyp)), Cbmpf_green);

			// stored items too: yes
			free_item.mockClear();
			gui_msgdecide.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
			clickButton(236, 100);
			await editor_menus();
			expect(free_item.mock.calls).toEqual([[1], [2]]);

			// objects: none of that type
			G.in_opt[0] = Cclass_object;
			G.in_object_sel = objTyp;
			gui_msgdecide.mockResolvedValueOnce(1);
			clickButton(236, 100);
			await editor_menus();
			expect(free_object).not.toHaveBeenCalled();
			expect(gui_msg.mock.calls.at(-1)![1]).toBe(Cbmpf_red);
		});

		it('Options: delete all states / scripts / stored items, each after its own question', async () => {
			const free_state = vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1);
			const free_item = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1);
			const st = New(Tstate);
			st.typ = 4;
			st.parent_class = Cclass_unit;
			st.parent_id = 2;
			New(Tx).mode = 0;
			New(Tx).mode = 1;
			New(Tx).mode = 0;
			const stored = New(Titem);
			stored.id = 5;
			stored.parent_class = Cclass_object;

			// states: yes, scripts: yes, items: no
			gui_msgdecide.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
			G.m_menu = Cmenu_ed_options;
			clickButton(236, 137);
			await editor_menus();
			expect(gui_msgdecide.mock.calls).toEqual([[se(96)], [se(97)], [se(98)]]);
			expect(free_state.mock.calls).toEqual([[4, Cclass_unit, 2]]);
			expect([...Each(Tx)].map((t) => t.mode)).toEqual([1]);
			expect(free_item).not.toHaveBeenCalled();
			expect(gui_msg).toHaveBeenLastCalledWith(ss(se(99), '1', '2', '0'), Cbmpf_green);

			// all declined
			clickButton(236, 137);
			await editor_menus();
			expect(gui_msg).toHaveBeenLastCalledWith(se(101), Cbmpf_red);

			// Okay goes back to Settings
			clickButton(742, 542);
			await editor_menus();
			expect(G.m_menu).toBe(Cmenu_ed_settings);
		});

		it('Attachments: add a file of the mod; quirk: a file outside leaves an empty entry', async () => {
			G.set_rootdir = 'C:\\Stranded II\\';
			G.set_moddir = 'Stranded II';
			gui_win_file.mockImplementation(async () => {
				G.in_win_path = 'C:\\Stranded II\\mods\\Stranded II\\gfx\\';
				G.in_win_file = 'tree.bmp';
				return 1;
			});
			G.m_menu = Cmenu_ed_attachments;
			clickButton(236, 542);
			await editor_menus();
			expect(gui_win_file).toHaveBeenCalledWith(se(187) + '...', 'C:\\Stranded II\\mods\\Stranded II', '');
			expect([...Each(Tat)].map((t) => t.path)).toEqual(['gfx\\tree.bmp']);
			expect(G.in_win_path).toBe('gfx\\');

			gui_win_file.mockImplementation(async () => {
				G.in_win_path = 'D:\\other\\';
				G.in_win_file = 'x.bmp';
				return 1;
			});
			clickButton(236, 542);
			await editor_menus();
			expect(gui_msg).toHaveBeenCalledWith(se(189), Cbmpf_red);
			expect([...Each(Tat)].map((t) => t.path)).toEqual(['gfx\\tree.bmp', '']);

			// the X of the first row deletes it
			clickButton(236 + 5, 63 + 5);
			await editor_menus();
			expect([...Each(Tat)].map((t) => t.path)).toEqual(['']);

			// twelve rows: no more adding
			for (let i = 0; i < 11; i++) New(Tat).path = 'f' + i;
			gui_win_file.mockClear();
			clickButton(236, 542);
			await editor_menus();
			expect(gui_win_file).not.toHaveBeenCalled();

			clickButton(742, 542);
			await editor_menus();
			expect(G.m_menu).toBe(Cmenu_ed_settings);
		});

		it('Random: Okay loads the profile and spreads; the mouse wheel scrolls the profiles', async () => {
			const load_randommap = vi.spyOn(randommap, 'load_randommap').mockImplementation(() => {});
			const rnd = vi.spyOn(randommap, 'randommap').mockImplementation(() => 0);
			G.m_menu = Cmenu_ed_random;
			G.in_input[3] = '0';
			clickButton(742, 542);
			await editor_menus();
			expect(rnd).not.toHaveBeenCalled();
			expect(G.m_menu).toBe(0);

			G.m_menu = Cmenu_ed_random;
			G.in_input[3] = '120';
			G.in_opt[5] = 3;
			G.in_check[5] = 1;
			G.in_check[6] = 0;
			G.in_check[7] = 1;
			clickButton(742, 542);
			await editor_menus();
			expect(load_randommap).toHaveBeenCalledWith(3);
			expect(rnd).toHaveBeenCalledWith(120, 1, 0, 1);
			expect(G.m_menu).toBe(0);

			// 16 profiles, 14 visible: wheel down scrolls while the 15th row was reached
			for (let i = 1; i <= 16; i++) G.Drprofile[i] = 'profile ' + i;
			G.m_menu = Cmenu_ed_random;
			G.in_scr_scr = 0;
			G.in_mx = 0;
			G.in_my = 0;
			G.in_mzs = -1;
			await editor_menus();
			expect(G.in_scr_scr).toBe(1);
			G.in_mzs = 1;
			await editor_menus();
			expect(G.in_scr_scr).toBe(0);
			await editor_menus();
			expect(G.in_scr_scr).toBe(0);
			G.in_mzs = 0;
		});

		it('Quit: Okay leaves the editor for the menu', async () => {
			const menu_start = vi.spyOn(menu, 'menu_start').mockResolvedValue(undefined);
			G.m_menu = Cmenu_ed_quit;
			clickButton(742 - 37, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
			expect(ed.editor_quit).not.toHaveBeenCalled();

			G.m_menu = Cmenu_ed_quit;
			clickButton(742, 542);
			await editor_menus();
			expect(ed.editor_quit).toHaveBeenCalledOnce();
			expect(menu_start).toHaveBeenCalledOnce();
		});

		it('Load: maps\\<name>.s2, absolute paths as they are, failure re-initialises the editor', async () => {
			const load_map = vi.spyOn(e_load_map, 'load_map').mockResolvedValue(1);
			const load_recent = vi.spyOn(e_load_map, 'load_recent').mockImplementation(() => {});
			G.m_menu = Cmenu_ed_load;
			G.in_input[3] = 'adventure\\map01.S2';
			G.in_input[4] = 'secret';
			clickButton(742, 542);
			await editor_menus();
			expect(load_map).toHaveBeenCalledWith('maps\\adventure\\map01.s2', 'secret');
			expect(load_recent).toHaveBeenCalledWith('maps\\adventure\\map01.s2');
			expect([G.in_input[3], G.in_edmap, G.m_menu]).toEqual(['adventure\\map01', 'adventure\\map01', 0]);
			expect(ed.editor_resetcam).toHaveBeenCalledOnce();

			G.m_menu = Cmenu_ed_load;
			G.in_input[3] = 'D:\\maps\\x.s2';
			clickButton(742, 542);
			await editor_menus();
			expect(load_map).toHaveBeenLastCalledWith('D:\\maps\\x.s2', 'secret');
			expect(load_recent).toHaveBeenLastCalledWith('D:\\maps\\x.s2');
			expect(G.in_edmap).toBe('D:\\maps\\x');

			// failure
			load_map.mockResolvedValue(0);
			load_recent.mockClear();
			G.m_menu = Cmenu_ed_load;
			G.in_input[3] = 'nope';
			clickButton(742, 542);
			await editor_menus();
			expect(gui_msg).toHaveBeenCalledWith(se(106), Cbmpf_red);
			// quirk: editor_ini(menu=Cmenu_ed_new) passes the comparison 0=1
			expect(ed.editor_ini).toHaveBeenCalledWith(0);
			expect(load_recent).not.toHaveBeenCalled();
			expect(G.in_edmap).toBe('D:\\maps\\x');
			expect(G.m_menu).toBe(Cmenu_ed_load);

			// without a click nothing loads
			load_map.mockClear();
			G.in_mx = 0;
			G.in_my = 0;
			await editor_menus();
			expect(load_map).not.toHaveBeenCalled();
		});

		it('Load: a click on a recent file loads it at once; the browse button fills the name', async () => {
			const load_map = vi.spyOn(e_load_map, 'load_map').mockResolvedValue(1);
			vi.spyOn(e_load_map, 'load_recent').mockImplementation(() => {});
			New(Trecent).file = 'maps\\first.s2';
			New(Trecent).file = 'maps/second.s2';
			const txtb = vi.spyOn(gui, 'gui_txtb').mockImplementation((_x, _y, t) => (t === 'maps/second.s2' ? 1 : 0));
			G.m_menu = Cmenu_ed_load;
			G.in_input[3] = '';
			G.in_input[4] = '';
			await editor_menus();
			expect(txtb.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([
				[236, 130, 'maps\\first.s2'],
				[236, 150, 'maps/second.s2']
			]);
			expect(load_map).toHaveBeenCalledWith('maps\\second.s2', '');
			expect(G.in_edmap).toBe('second');
			txtb.mockRestore();

			G.set_rootdir = 'C:\\Stranded II\\';
			G.set_moddir = 'Stranded II';
			gui_win_file.mockImplementation(async () => {
				G.in_win_path = 'C:\\Stranded II\\mods\\Stranded II\\maps\\adventure\\';
				G.in_win_file = 'map02.s2';
				return 1;
			});
			load_map.mockClear();
			G.m_menu = Cmenu_ed_load;
			clickButton(742, 63);
			await editor_menus();
			expect(gui_win_file).toHaveBeenCalledWith(se(2) + '...', 'C:\\Stranded II\\mods\\Stranded II\\maps', '', 0);
			expect(G.in_input[3]).toBe('adventure\\map02');
			expect(load_map).not.toHaveBeenCalled();
		});

		it('Save: asks before overwriting another map, not for the edited one', async () => {
			const save_map = vi.spyOn(e_save_map, 'save_map').mockResolvedValue(1);
			const load_recent = vi.spyOn(e_load_map, 'load_recent').mockImplementation(() => {});
			const stream = WriteFile('maps\\exists.s2');
			WriteLine(stream, 'x');
			CloseFile(stream);

			// new file: no question
			G.m_menu = Cmenu_ed_save;
			G.in_input[3] = 'fresh.s2';
			G.in_input[4] = 'pw';
			G.in_edmap = '';
			clickButton(742, 542);
			await editor_menus();
			expect(gui_msgdecide).not.toHaveBeenCalled();
			expect(save_map).toHaveBeenCalledWith('maps\\fresh.s2', 'map', 'pw');
			expect(load_recent).toHaveBeenCalledWith('maps\\fresh.s2');
			expect([G.in_edmap, G.m_menu]).toEqual(['fresh', 0]);

			// existing other file: question, declined
			save_map.mockClear();
			G.m_menu = Cmenu_ed_save;
			G.in_input[3] = 'exists';
			clickButton(742, 542);
			await editor_menus();
			expect(gui_msgdecide).toHaveBeenCalledWith(se(107), Cbmpf_red);
			expect(save_map).not.toHaveBeenCalled();
			expect([G.in_edmap, G.m_menu]).toEqual(['fresh', Cmenu_ed_save]);

			// accepted, but saving fails
			gui_msgdecide.mockResolvedValue(1);
			save_map.mockResolvedValue(0);
			clickButton(742, 542);
			await editor_menus();
			expect(save_map).toHaveBeenCalledWith('maps\\exists.s2', 'map', 'pw');
			expect(gui_msg).toHaveBeenCalledWith(se(108), Cbmpf_red);
			expect(G.m_menu).toBe(Cmenu_ed_save);

			// the edited map itself: no question
			gui_msgdecide.mockClear();
			save_map.mockResolvedValue(1);
			G.in_edmap = 'exists';
			clickButton(742, 542);
			await editor_menus();
			expect(gui_msgdecide).not.toHaveBeenCalled();
			expect(G.m_menu).toBe(0);

			// absolute path that does not exist
			G.m_menu = Cmenu_ed_save;
			G.in_input[3] = 'D:\\out\\m';
			clickButton(742, 542);
			await editor_menus();
			expect(save_map).toHaveBeenLastCalledWith('D:\\out\\m.s2', 'map', 'pw');
			expect(G.in_edmap).toBe('D:\\out\\m');
		});

		it('Heightmap: grey value of the slider, tools, zoom, Okay writes the buffer back', async () => {
			const colorbox = vi.spyOn(gui, 'gui_colorbox');
			G.m_menu = Cmenu_ed_heightmap;
			G.in_slider[0] = 50;
			G.in_slider[10] = 100;
			await editor_menus();
			// Float(50)*2.55 = 127.5 in single precision -> Int: 128 (round half to even)
			expect(colorbox.mock.calls[0].slice(0, 3)).toEqual([128, 128, 128]);
			expect(colorbox.mock.calls[0][7]).toBe(se(112) + ': 128');
			expect(ed.editor_bufferwin).toHaveBeenCalledWith(236, 160, 500, 375);
			G.in_slider[0] = 100;
			await editor_menus();
			expect(colorbox.mock.calls[1][0]).toBe(255);

			for (const [tool, y] of [
				[1, 160 + 37],
				[2, 160 + 74],
				[3, 160 + 111],
				[4, 160 + 148],
				[0, 160]
			]) {
				clickButton(742, y);
				await editor_menus();
				expect(G.in_edtool).toBe(tool);
			}

			// zoom 1 -> 2 -> 4 -> 8 -> 1, the view is reset each time
			const zooms: number[] = [];
			G.in_edzoom = 1;
			for (let i = 0; i < 4; i++) {
				G.in_editor_bufferx = 50;
				clickButton(742, 160 + 37 * 6);
				await editor_menus();
				zooms.push(G.in_edzoom);
				expect([G.in_editor_bufferx, G.in_editor_buffery]).toEqual([-5, -5]);
			}
			expect(zooms).toEqual([2, 4, 8, 1]);

			clickButton(742 - 37, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
			expect(ed.editor_buffertoheightmap).not.toHaveBeenCalled();
			G.m_menu = Cmenu_ed_heightmap;
			clickButton(742, 542);
			await editor_menus();
			expect(ed.editor_buffertoheightmap).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(0);
		});

		it('Colormap: scale, terrain colours, update and Okay', async () => {
			const p_kill2d = vi.spyOn(particles, 'p_kill2d').mockImplementation(() => {});
			G.m_menu = Cmenu_ed_colormap;
			// headless e_terraincmscale returns its argument: Int("300x") -> "300"
			G.in_input[4] = '300x';
			clickButton(742, 63);
			await editor_menus();
			expect(G.in_input[4]).toBe('300');

			// left click on the base colour box takes it as the paint colour
			G.in_tercol[0][1] = 11;
			G.in_tercol[1][1] = 22;
			G.in_tercol[2][1] = 33;
			click(236 + 64 + 15 + 37 + 3, 545, 1);
			await editor_menus();
			expect([G.in_col[0], G.in_col[1], G.in_col[2]]).toEqual([11, 22, 33]);

			clickButton(742 - 37 - 47, 542);
			await editor_menus();
			expect(ed.editor_gencolormap).toHaveBeenCalledWith(0);
			expect(ed.editor_textobuffer).toHaveBeenCalledWith(G.ter_tex_color);
			expect(p_kill2d).toHaveBeenCalledOnce();

			clickButton(742, 542);
			await editor_menus();
			expect(ed.editor_buffertotex).toHaveBeenCalledWith(G.ter_tex_color);
			expect(G.m_menu).toBe(0);
		});

		it('Grassmap: mode toggle, update', async () => {
			const p_kill2d = vi.spyOn(particles, 'p_kill2d').mockImplementation(() => {});
			const grass_heightmap = vi.spyOn(grasspread, 'grass_heightmap').mockImplementation(() => {});
			G.m_menu = Cmenu_ed_grassmap;
			G.in_edgrassmode = 0;
			clickButton(236, 542);
			await editor_menus();
			expect(G.in_edgrassmode).toBe(1);
			clickButton(236, 542);
			await editor_menus();
			expect(G.in_edgrassmode).toBe(0);

			clickButton(742 - 47, 542);
			await editor_menus();
			expect(grass_heightmap).toHaveBeenCalledOnce();
			expect(ed.editor_grassmaptobuffer).toHaveBeenCalledOnce();
			expect(p_kill2d).toHaveBeenCalledOnce();
		});

		it('Object properties: id field is normalised; Okay writes rotation, health and script', async () => {
			const o = New(Tobject);
			o.id = 5;
			o.typ = objTyp;
			o.h = CreatePivot();
			const con_object = vi.spyOn(handle_objects, 'con_object').mockReturnValue(0);

			G.m_menu = Cmenu_ed_objects;
			G.in_inputfocus = 0;
			G.in_input[3] = '12345678';
			await editor_menus();
			expect(G.in_input[3]).toBe('123456');
			G.in_input[3] = 'abc';
			await editor_menus();
			expect(G.in_input[3]).toBe('0');
			expect(con_object).not.toHaveBeenCalled();

			// while the id field has the focus the window is refilled every frame
			G.in_inputfocus = 3;
			G.in_input[3] = '5';
			G.in_input[5] = '1';
			G.in_input[6] = '2';
			await editor_menus();
			expect(con_object).toHaveBeenCalledWith(5);
			expect(G.TCobject).toBe(o);
			G.in_inputfocus = 0;

			// health above the maximum is cut (as a Float string)
			G.in_input[5] = '30';
			G.in_input[6] = '20';
			await editor_menus();
			expect(G.in_input[5]).toBe('20.0');

			G.in_input[4] = '90';
			G.in_input[5] = '15.5';
			G.in_input[6] = '40';
			gui_tb_loadstring('on:kill { }', SEP_LINE);
			clickButton(742, 542);
			await editor_menus();
			expect(EntityYaw(o.h)).toBeCloseTo(90, 3);
			expect([o.health, o.health_max]).toEqual([15.5, 40]);
			expect([...Each(Tx)]).toMatchObject([{ parent_class: Cclass_object, parent_id: 5, value: 'on:kill { }' + SEP_LINE }]);
			expect([G.m_menu, G.in_opt[0]]).toEqual([0, Cclass_object]);
			expect(ed.editor_setmode).toHaveBeenLastCalledWith(Cclass_object);
		});

		it('Object properties: delete, jump, spawn and info buttons; unknown id', async () => {
			const free_object = vi.spyOn(handle_objects, 'free_object').mockImplementation(() => 1);
			const game_cd_object = vi.spyOn(game_changeday, 'game_cd_object').mockImplementation(() => {});
			const gui_win_text = vi.spyOn(gui, 'gui_win_text').mockResolvedValue(0);
			const gui_win_defvars = vi.spyOn(gui, 'gui_win_defvars').mockResolvedValue(0);
			const spawner = [...DEFS.objects.byId.values()].find((d) => d.spawn !== '' && d.descr !== '');
			const o = New(Tobject);
			o.id = 5;
			o.typ = spawner ? spawner.id : objTyp;
			o.h = CreatePivot();
			G.in_inputfocus = 0;

			// unknown id: delete and jump are passive, Okay just closes
			G.m_menu = Cmenu_ed_objects;
			G.in_input[3] = '6';
			clickButton(236, 542);
			await editor_menus();
			expect(free_object).not.toHaveBeenCalled();
			clickButton(742, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
			expect(count(Tx)).toBe(0);

			G.m_menu = Cmenu_ed_objects;
			G.in_input[3] = '5';
			clickButton(742 - 37, 5);
			await editor_menus();
			expect(ed.editor_jumpto).toHaveBeenCalledWith(Cclass_object, 5);

			if (spawner) {
				clickButton(236 + 37, 542);
				await editor_menus();
				expect(G.TCobject).toBe(o);
				expect(game_cd_object).toHaveBeenCalledOnce();

				clickButton(742 - 37 * 4, 542);
				await editor_menus();
				expect(gui_win_text).toHaveBeenCalledWith(spawner.descr);
			}

			// defvars button: only with a definition for this type
			clickButton(742 - 37 * 3, 542);
			await editor_menus();
			expect(gui_win_defvars).not.toHaveBeenCalled();
			const dv = New(Tdefvar);
			dv.class = Cclass_object;
			dv.typ = o.typ;
			clickButton(742 - 37 * 3, 542);
			await editor_menus();
			expect(gui_win_defvars).toHaveBeenCalledWith(Cclass_object, o.typ, 5);

			clickButton(236, 542);
			await editor_menus();
			expect(free_object).toHaveBeenCalledWith(5);
			expect([G.m_menu, G.in_opt[0]]).toEqual([0, Cclass_object]);
		});

		it('Unit properties: Okay', async () => {
			const u = New(Tunit);
			u.id = 2;
			u.typ = unitTyp;
			u.h = CreatePivot();
			G.in_inputfocus = 0;
			G.m_menu = Cmenu_ed_units;
			G.in_input[3] = '2';
			G.in_input[4] = '180';
			G.in_input[5] = '5';
			G.in_input[6] = '10';
			gui_tb_loadstring('', '');
			clickButton(742, 542);
			await editor_menus();
			expect(Math.abs(EntityYaw(u.h))).toBeCloseTo(180, 3);
			expect([u.health, u.health_max]).toEqual([5, 10]);
			expect([G.m_menu, G.in_opt[0]]).toEqual([0, Cclass_unit]);
			expect(ed.editor_setmode).toHaveBeenLastCalledWith(Cclass_unit);
			expect(count(Tx)).toBe(0);
		});

		it('Item properties: Okay; quirk: an empty "attach to object" field attaches to object 0', async () => {
			const item = New(Titem);
			item.id = 9;
			item.typ = itemTyp;
			item.h = CreatePivot();
			G.in_inputfocus = 0;
			const run = async () => {
				G.m_menu = Cmenu_ed_items;
				G.in_input[3] = '9';
				clickButton(742, 542);
				await editor_menus();
			};
			gui_tb_loadstring('', '');
			G.in_input[4] = '10';
			G.in_input[5] = '33';
			G.in_input[6] = '0';
			G.in_input[7] = '17';
			await run();
			expect([item.health, item.count]).toEqual([33, 1]);
			expect(G.in_input[6]).toBe('1');
			expect([item.parent_class, item.parent_id, item.parent_mode]).toEqual([Cclass_object, 17, Cpm_out]);
			expect([G.m_menu, G.in_opt[0]]).toEqual([0, 3]);
			expect(ed.editor_picking).toHaveBeenLastCalledWith(Cclass_item);

			G.in_input[7] = '0';
			await run();
			expect([item.parent_class, item.parent_id, item.parent_mode]).toEqual([0, 0, 0]);

			// "" <> "0" as strings
			G.in_input[7] = '';
			await run();
			expect([item.parent_class, item.parent_id, item.parent_mode]).toEqual([Cclass_object, 0, Cpm_out]);

			// an item stored inside its parent keeps the parent
			item.parent_class = Cclass_unit;
			item.parent_id = 4;
			item.parent_mode = Cpm_in;
			G.in_input[7] = '17';
			await run();
			expect([item.parent_class, item.parent_id, item.parent_mode]).toEqual([Cclass_unit, 4, Cpm_in]);

			// jump: to the parent of a stored item
			G.m_menu = Cmenu_ed_items;
			clickButton(742 - 37, 5);
			await editor_menus();
			expect(ed.editor_jumpto).toHaveBeenLastCalledWith(Cclass_unit, 4);
			item.parent_class = 0;
			clickButton(742 - 37, 5);
			await editor_menus();
			expect(ed.editor_jumpto).toHaveBeenLastCalledWith(Cclass_item, 9);
		});

		it('Info properties: Okay saves through editor_saveinfo; trigger class options reset the type field', async () => {
			const info_vts = vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
			const free_info = vi.spyOn(handle_infos, 'free_info').mockImplementation(() => 1);
			const inf = New(Tinfo);
			inf.id = 4;
			inf.typ = 10;
			G.TCinfo = inf;
			G.in_inputfocus = 0;
			G.m_menu = Cmenu_ed_infos;
			G.in_input[3] = '4';
			G.in_input[4] = '12';
			G.in_opt[3] = 0;
			// option "units" of the trigger (450,180): select it, type field back to 0
			click(455, 185);
			await editor_menus();
			expect([G.in_opt[3], G.in_input[4]]).toEqual([Cclass_unit, '0']);

			G.in_input[4] = '7';
			G.in_input[5] = '3';
			G.in_input[6] = '100';
			G.in_input[7] = '2';
			G.in_check[0] = 0;
			gui_tb_loadstring('', '');
			clickButton(742, 542);
			await editor_menus();
			expect(inf.ints).toEqual([Cclass_unit, 7, 3]);
			expect(inf.floats).toEqual([100, 0, 2]);
			expect(info_vts).toHaveBeenCalledOnce();
			expect([G.m_menu, G.in_opt[0]]).toEqual([0, 4]);
			expect(ed.editor_picking).toHaveBeenLastCalledWith(Cclass_info);

			G.m_menu = Cmenu_ed_infos;
			clickButton(236, 542);
			await editor_menus();
			expect(free_info).toHaveBeenCalledWith(4);
			expect(G.m_menu).toBe(0);
		});

		it('Script editor: focus, Okay/Cancel return to the previous window, delete', async () => {
			vi.spyOn(handle_objects, 'con_object').mockReturnValue(0);
			const t = New(Tx);
			t.parent_class = Cclass_object;
			t.parent_id = 5;
			t.value = 'old' + SEP_LINE;

			G.m_menu = Cmenu_ed_objects;
			G.in_input[3] = Str(Cclass_object);
			G.in_input[4] = '5';
			editor_setmenu(Cmenu_ed_scripts);
			await editor_menus();
			expect(G.in_inputfocus).toBe(1337);

			// Okay: save and back to the object window of id in_input(4)
			gui_tb_loadstring('new', SEP_LINE);
			clickButton(742, 542);
			await editor_menus();
			expect(t.value).toBe('new' + SEP_LINE);
			expect(G.m_menu).toBe(Cmenu_ed_objects);
			expect(G.in_input[3]).toBe('5');

			// Cancel: back without saving
			G.in_input[3] = Str(Cclass_object);
			editor_setmenu(Cmenu_ed_scripts);
			gui_tb_loadstring('discard', SEP_LINE);
			clickButton(742 - 37, 542);
			await editor_menus();
			expect(t.value).toBe('new' + SEP_LINE);
			expect(G.m_menu).toBe(Cmenu_ed_objects);

			// Jump
			G.in_input[3] = Str(Cclass_object);
			editor_setmenu(Cmenu_ed_scripts);
			clickButton(742 - 37, 5);
			await editor_menus();
			expect(ed.editor_jumpto).toHaveBeenCalledWith(Cclass_object, 5);

			// Delete: question (Cancel/Okay labels swapped: sm(2), sm(1)), then the Tx goes
			clickButton(236, 542);
			await editor_menus();
			expect(gui_msgdecide).toHaveBeenCalledWith(se(176), Cbmpf_red, sm(2), sm(1));
			expect(count(Tx)).toBe(1);
			gui_msgdecide.mockResolvedValue(1);
			clickButton(236, 542);
			await editor_menus();
			expect(count(Tx)).toBe(0);
			expect(G.m_menu).toBe(Cmenu_ed_objects);

			// class 0 deletes the briefing, class -1 the editor script
			G.map_briefing = 'b';
			G.ed_setscript = 's';
			G.m_menu = Cmenu_ed_scripts;
			G.in_input[3] = '0';
			clickButton(236, 542);
			await editor_menus();
			expect([G.map_briefing, G.ed_setscript]).toEqual(['', 's']);
			G.m_menu = Cmenu_ed_scripts;
			G.in_input[3] = '-1';
			clickButton(236, 542);
			await editor_menus();
			expect(G.ed_setscript).toBe('');
		});

		it('Script editor: load/export files, command window, help', async () => {
			const loadfile = vi.spyOn(await import('../../src/lib/s2/game/gui_tb'), 'gui_tb_loadfile').mockResolvedValue(1);
			const savefile = vi.spyOn(await import('../../src/lib/s2/game/gui_tb'), 'gui_tb_savefile').mockResolvedValue(1);
			const command = vi.spyOn(gui, 'gui_win_command').mockResolvedValue(0);
			const exec = vi.spyOn(sys, 'ExecFile').mockImplementation(() => {});
			G.set_rootdir = 'C:\\Stranded II\\';
			gui_win_file.mockImplementation(async () => {
				G.in_win_path = 'C:\\x\\';
				G.in_win_file = 's.txt';
				return 1;
			});
			G.m_menu = Cmenu_ed_scripts;
			G.in_input[3] = '0';
			G.in_input[4] = '0';
			clickButton(236 + 74, 542);
			await editor_menus();
			expect(gui_win_file).toHaveBeenLastCalledWith(se(177), 'C:\\Stranded II\\', '', 0, 0);
			expect(loadfile).toHaveBeenCalledWith('C:\\x\\s.txt');
			clickButton(236 + 111, 542);
			await editor_menus();
			expect(gui_win_file).toHaveBeenLastCalledWith(se(178), 'C:\\Stranded II\\', '', 0, 1);
			expect(savefile).toHaveBeenCalledWith('C:\\x\\s.txt');
			clickButton(236 + 111 + 5 + 37, 542);
			await editor_menus();
			expect(command).toHaveBeenCalledOnce();

			// help: only while the script helper names a command
			G.in_sh = 0;
			G.in_sh_cmd = 'msg';
			clickButton(236 + 37, 542);
			await editor_menus();
			expect(exec).not.toHaveBeenCalled();
		});

		it('State properties: Okay writes value, colour and size, then look_state()', async () => {
			const look_state = vi.spyOn(handle_states, 'look_state').mockImplementation(() => {});
			const free_state = vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1);
			const light = New(Tstate);
			light.typ = Cstate_light;
			light.parent_class = Cclass_object;
			light.parent_id = 3;
			const other = New(Tstate);
			other.typ = 1;
			other.parent_class = Cclass_object;
			other.parent_id = 3;

			G.m_menu = Cmenu_ed_states;
			G.in_input[3] = Str(Cstate_light);
			G.in_input[4] = Str(Cclass_object);
			G.in_input[5] = '3';
			G.in_input[6] = '2.5';
			G.in_input[7] = '40';
			G.in_scol[0] = 255;
			G.in_scol[1] = 100;
			G.in_scol[2] = 0;
			clickButton(742, 542);
			await editor_menus();
			expect([light.value_f, light.value_s, light.value]).toEqual([2.5, '255,100,0', 40]);
			expect(G.TCstate).toBe(light);
			expect(look_state).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(0);

			// a state without colour and size
			G.m_menu = Cmenu_ed_states;
			G.in_input[3] = '1';
			G.in_input[6] = '7';
			clickButton(742, 542);
			await editor_menus();
			expect([other.value_f, other.value_s, other.value]).toEqual([7, '', 0]);

			// unknown: Okay closes, nothing else; delete is passive
			look_state.mockClear();
			G.m_menu = Cmenu_ed_states;
			G.in_input[5] = '99';
			clickButton(236, 542);
			await editor_menus();
			expect(free_state).not.toHaveBeenCalled();
			clickButton(742, 542);
			await editor_menus();
			expect(look_state).not.toHaveBeenCalled();
			expect(G.m_menu).toBe(0);

			G.m_menu = Cmenu_ed_states;
			G.in_input[5] = '3';
			clickButton(236, 542);
			await editor_menus();
			expect(free_state).toHaveBeenCalledWith(1, Cclass_object, 3);
			expect(G.m_menu).toBe(0);

			// jump to the parent
			G.m_menu = Cmenu_ed_states;
			clickButton(742 - 37, 5);
			await editor_menus();
			expect(ed.editor_jumpto).toHaveBeenCalledWith(Cclass_object, 3);
		});

		it('List: a click on a row opens the property window; rows are 45 pixels from y=124', async () => {
			const con_unit = vi.spyOn(handle_units, 'con_unit').mockReturnValue(0);
			for (let i = 1; i <= 3; i++) {
				const u = New(Tunit);
				u.id = 10 + i;
				u.typ = unitTyp;
			}
			G.m_menu = Cmenu_ed_list;
			G.in_opt[3] = Cclass_unit;
			// second row: y 169..213
			click(300, 124 + 45 + 10);
			await editor_menus();
			expect(con_unit).toHaveBeenCalledWith(12);
			expect([G.m_menu, G.in_input[3], G.in_prevmenu]).toEqual([Cmenu_ed_units, '12', Cmenu_ed_list]);

			// with scroll offset 1 the first row is the second unit
			G.m_menu = Cmenu_ed_list;
			G.in_opt[3] = Cclass_unit;
			G.in_scr_scr = 1;
			click(300, 124 + 10);
			await editor_menus();
			expect(con_unit).toHaveBeenLastCalledWith(12);
		});

		it('List: states and scripts fill the fields of their windows; group options reset the scroll offset', async () => {
			const st = New(Tstate);
			st.typ = 3;
			st.parent_class = Cclass_item;
			st.parent_id = 8;
			G.m_menu = Cmenu_ed_list;
			G.in_opt[3] = Cclass_state;
			click(300, 130);
			await editor_menus();
			expect([G.in_input[3], G.in_input[4], G.in_input[5]]).toEqual(['3', Str(Cclass_item), '8']);
			expect(G.m_menu).toBe(Cmenu_ed_states);

			New(Tx).mode = 1;
			const sc = New(Tx);
			sc.parent_class = Cclass_info;
			sc.parent_id = 21;
			sc.value = 'script' + SEP_LINE;
			vi.spyOn(handle_infos, 'con_info').mockReturnValue(0);
			G.m_menu = Cmenu_ed_list;
			G.in_opt[3] = 100;
			click(300, 130);
			await editor_menus();
			expect([G.in_input[3], G.in_input[4]]).toEqual([Str(Cclass_info), '21']);
			expect(G.m_menu).toBe(Cmenu_ed_scripts);
			expect(gui_tb_savestring(SEP_LINE)).toBe('script' + SEP_LINE);

			// 12 objects: 10 rows fit (124+45*10 > 550 after the 10th), the "down" button scrolls
			for (let i = 0; i < 12; i++) New(Tobject).typ = objTyp;
			G.m_menu = Cmenu_ed_list;
			G.in_opt[3] = Cclass_object;
			G.in_scr_scr = 0;
			clickButton(742, 542 - 37);
			await editor_menus();
			expect(G.in_scr_scr).toBe(1);
			clickButton(742, 124);
			await editor_menus();
			expect(G.in_scr_scr).toBe(0);

			G.in_scr_scr = 2;
			click(236 + 3, 63 + 20 + 3);
			await editor_menus();
			expect(G.in_opt[3]).toBe(Cclass_unit);
			expect(G.in_scr_scr).toBe(0);

			clickButton(742, 542);
			await editor_menus();
			expect(G.m_menu).toBe(0);
		});

		it('Map: draws the in-game map', async () => {
			const if_map = vi.spyOn(interface_, 'if_map').mockImplementation(() => {});
			G.m_menu = Cmenu_ed_map;
			G.in_mx = 0;
			G.in_my = 0;
			await editor_menus();
			expect(if_map).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(Cmenu_ed_map);
		});
	});
});
