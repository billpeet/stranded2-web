/**
 * Package "menu": menu.bb (menu_start, menu_set, menu, menu_keysetting, menu_keysettingscript).
 * Expected values are derived from the original source, branch by branch.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityX, EntityY, EntityZ } from '../../src/lib/s2/bb3d';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { injectKeyDown, injectKeyUp, injectMouseDown, injectMouseMove, injectMouseUp, injectWheel } from '../../src/lib/s2/input';
import {
	Cbmpf_red,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cicon_ok,
	Cicon_x,
	Ckey_backward,
	Ckey_forward,
	Ckey_jump,
	Cmenu_credits,
	Cmenu_main,
	Cmenu_mp,
	Cmenu_mp_create,
	Cmenu_mp_lan,
	Cmenu_random,
	Cmenu_reboot,
	Cmenu_set_gfx,
	Cmenu_set_in,
	Cmenu_set_inscript,
	Cmenu_set_sfx,
	Cmenu_sp,
	Cmenu_sp_load,
	Csection_editor,
	Csection_game_sp,
	Csection_menu
} from '../../src/lib/s2/game/consts';
import * as cull from '../../src/lib/s2/game/cull';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { CreateDir, FileType, readFileLines, stringToBytes, writeFileBytes } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as game_sequences from '../../src/lib/s2/game/game_sequences';
import * as gui from '../../src/lib/s2/game/gui';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as load_bmpf from '../../src/lib/s2/game/load_bmpf';
import * as load_settings from '../../src/lib/s2/game/load_settings';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { load_strings, sm, ss } from '../../src/lib/s2/game/load_strings';
import * as menu from '../../src/lib/s2/game/menu';
import * as motionblur from '../../src/lib/s2/game/motionblur';
import * as mp_usgn from '../../src/lib/s2/game/mp_usgn';
import * as particles from '../../src/lib/s2/game/particles';
import * as prepare from '../../src/lib/s2/game/prepare';
import * as randommap from '../../src/lib/s2/game/randommap';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, New, TYPES, Tcon, Tserver, Tsg, Ttbt, Tunit } from '../../src/lib/s2/game/types';
import * as udp_functions from '../../src/lib/s2/game/udp_functions';
import * as unitpath from '../../src/lib/s2/game/unitpath';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const f = Math.fround;

describe.skipIf(!existsSync(MOD))('package menu: menu.bb', () => {
	let now = 0;
	/** Calls into other packages, in order. */
	let order: string[] = [];

	const rec =
		(name: string) =>
		(...a: unknown[]): void => {
			order.push(a.length ? `${name}(${a.join(',')})` : name);
		};
	const recAsync =
		(name: string) =>
		async (...a: unknown[]): Promise<void> => {
			order.push(a.length ? `${name}(${a.join(',')})` : name);
		};

	/** The functions of other packages that menu() and menu_set() reach. */
	function mockOthers(): void {
		vi.spyOn(cull, 'cull_items').mockImplementation(rec('cull_items'));
		vi.spyOn(cull, 'cull').mockImplementation(recAsync('cull'));
		vi.spyOn(game_sequences, 'seq_update').mockImplementation(rec('seq_update'));
		vi.spyOn(game_sequences, 'seq_blend').mockImplementation(rec('seq_blend'));
		vi.spyOn(motionblur, 'mb_update').mockImplementation(recAsync('mb_update'));
		vi.spyOn(handle_states, 'update_state').mockImplementation(rec('update_state'));
		vi.spyOn(unitpath, 'up_update').mockImplementation(rec('up_update'));
		vi.spyOn(particles, 'p_update').mockImplementation(rec('p_update'));
		vi.spyOn(e_load_map, 'load_map').mockImplementation(async (path, pw) => {
			order.push(`load_map(${path},${pw})`);
			return 1;
		});
		vi.spyOn(e_load_map, 'load_maps').mockImplementation(rec('load_maps'));
		vi.spyOn(e_load_map, 'load_savegames').mockImplementation(rec('load_savegames'));
		vi.spyOn(e_load_map, 'load_map_header').mockImplementation((path) => {
			order.push(`load_map_header(${path})`);
			return 1;
		});
		vi.spyOn(editor_functions, 'editor_ini').mockImplementation(recAsync('editor_ini'));
		vi.spyOn(editor_functions, 'editor_testmap').mockImplementation(async (force) => {
			order.push(`editor_testmap(${force})`);
			return 1;
		});
		vi.spyOn(game_functions, 'game_explosion').mockImplementation(rec('game_explosion'));
		vi.spyOn(mp_usgn, 'usgn_setup').mockImplementation(recAsync('usgn_setup'));
		vi.spyOn(mp_usgn, 'usgn_update').mockImplementation(rec('usgn_update'));
		vi.spyOn(mp_usgn, 'usgn_hostserver').mockImplementation(recAsync('usgn_hostserver'));
		vi.spyOn(mp_usgn, 'usgn_joinserver').mockImplementation(async (ip, port) => {
			order.push(`usgn_joinserver(${ip},${port})`);
			return 0;
		});
		vi.spyOn(udp_functions, 'udp_clear').mockImplementation(rec('udp_clear'));
		vi.spyOn(randommap, 'load_randommap').mockImplementation(rec('load_randommap'));
		vi.spyOn(randommap, 'randommapcreate').mockImplementation(recAsync('randommapcreate'));
		// own foundation functions with side effects on files and settings
		vi.spyOn(load_settings, 'load_settings').mockImplementation(rec('load_settings'));
		vi.spyOn(load_settings, 'save_settings').mockImplementation(rec('save_settings'));
		vi.spyOn(prepare, 'prepare_cache_viewranges').mockImplementation(rec('prepare_cache_viewranges'));
	}

	/** One frame with the left button down at (x,y), one with it released: a click on a button. */
	async function click(x: number, y: number): Promise<void> {
		injectMouseMove(x, y);
		injectMouseDown(1);
		await menu.menu();
		injectMouseUp(1);
		await menu.menu();
	}

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		await load_strings();
		DeleteEach(Tcon);
		order = [];
		mockOthers();
		G.game_m_adventure = 1;
		G.game_m_random = 1;
		G.game_m_singleplayer = 1;
		G.game_m_loadsave = 1;
		G.game_m_multiplayer = 1;
		G.game_m_editor = 1;
		G.game_m_credits = 1;
		G.game_scriptkeys = 0;
		G.m_section = Csection_menu;
		G.m_menu = Cmenu_main;
		G.set_moddir = 'Stranded II';
		G.f = 1;
		injectMouseMove(400, 420); // over nothing
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

	// =================================================================================
	// menu_start
	// =================================================================================

	it('menu_start: section, menu map, player 1 spawned and moved far away', async () => {
		const u = New(Tunit);
		u.h = CreatePivot();
		vi.spyOn(game_functions, 'game_playerspawn').mockImplementation((id) => {
			order.push(`game_playerspawn(${id}) section=${G.m_section}`);
			return 1;
		});
		vi.spyOn(game_functions, 'game_setplayer').mockImplementation((id) => {
			order.push(`game_setplayer(${id})`);
			G.TCunit = u;
		});
		G.m_section = Csection_editor;
		await menu.menu_start();
		expect(order).toEqual(['load_map(maps\\menu\\menu.s2,)', `game_playerspawn(1) section=${Csection_menu}`, 'game_setplayer(1)']);
		expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([-1000000, -1000000, -1000000]);
	});

	// =================================================================================
	// menu_set
	// =================================================================================

	describe('menu_set', () => {
		it('controls page: saves sensitivity / invert / smooth, fills them back', async () => {
			G.m_menu = Cmenu_set_in;
			G.in_slider[0] = 10;
			G.in_check[0] = 1;
			G.in_check[1] = 1;
			await menu.menu_set(Cmenu_main);
			expect(G.m_menu).toBe(Cmenu_main);
			expect(G.set_msens).toBe(f(f(0.02) * 10));
			expect([G.set_minvert, G.set_msmooth]).toEqual([-1, 1]);

			G.in_slider[0] = 0;
			G.in_check[0] = 0;
			G.in_check[1] = 0;
			await menu.menu_set(Cmenu_set_in);
			expect([G.in_slider[0], G.in_check[0], G.in_check[1]]).toEqual([10, 1, 1]);

			// not inverted
			G.in_check[0] = 0;
			await menu.menu_set(Cmenu_main);
			expect(G.set_minvert).toBe(1);
			await menu.menu_set(Cmenu_set_in);
			expect(G.in_check[0]).toBe(0);
		});

		it('save=0 leaves the settings alone', async () => {
			G.m_menu = Cmenu_set_in;
			G.set_msens = f(0.5);
			G.in_slider[0] = 10;
			await menu.menu_set(Cmenu_main, 0);
			expect(G.m_menu).toBe(Cmenu_main);
			expect(G.set_msens).toBe(f(0.5));
		});

		it('graphics page: sliders to settings, reboot flag when the mode differs', async () => {
			G.m_menu = Cmenu_set_gfx;
			G.set_scrx = 800;
			G.set_scry = 600;
			G.set_scrbit = 32;
			G.set_scrx_c = 800;
			G.set_scry_c = 600;
			G.set_scrbit_c = 32;
			G.in_slider = [4, 0, 3, 2, 6, 1, 2, 4, 35, 0, 0];
			G.in_check = [1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0];
			await menu.menu_set(Cmenu_main);
			expect([G.set_scrx_c, G.set_scry_c, G.set_scrbit_c]).toEqual([1600, 1200, 16]);
			expect([G.set_viewrange, G.set_terrain, G.set_water, G.set_sky, G.set_effects, G.set_grass]).toEqual([3, 2, 6, 1, 2, 4]);
			expect([G.set_2dfx, G.set_lightfx, G.set_windsway, G.set_fog, G.set_hwmultitex, G.set_mb]).toEqual([1, 0, 1, 0, 1, 1]);
			expect(G.set_mb_alpha).toBe(f(35 / 100));
			expect(G.set_reboot).toBe(1);

			// every resolution and depth step
			const modes: number[][] = [];
			for (let i = 0; i <= 4; i++) {
				G.m_menu = Cmenu_set_gfx;
				G.in_slider[0] = i;
				G.in_slider[1] = Math.min(i, 2);
				await menu.menu_set(Cmenu_main);
				modes.push([G.set_scrx_c, G.set_scry_c, G.set_scrbit_c]);
			}
			expect(modes).toEqual([
				[800, 600, 16],
				[1024, 768, 24],
				[1152, 864, 32],
				[1280, 960, 32],
				[1600, 1200, 32]
			]);

			// same mode as the running one: no reboot
			G.m_menu = Cmenu_set_gfx;
			G.in_slider[0] = 0;
			G.in_slider[1] = 2;
			await menu.menu_set(Cmenu_main);
			expect(G.set_reboot).toBe(0);
			// a slider position without a Case changes nothing
			G.m_menu = Cmenu_set_gfx;
			G.in_slider[0] = 7;
			G.in_slider[1] = 9;
			await menu.menu_set(Cmenu_main);
			expect([G.set_scrx_c, G.set_scry_c, G.set_scrbit_c]).toEqual([800, 600, 32]);
		});

		it('graphics page: settings to sliders', async () => {
			const fill: number[][] = [];
			for (const [x, bit] of [
				[800, 16],
				[1024, 24],
				[1152, 32],
				[1280, 32],
				[1600, 32]
			]) {
				G.set_scrx_c = x;
				G.set_scrbit_c = bit;
				G.in_slider[0] = -1;
				G.in_slider[1] = -1;
				await menu.menu_set(Cmenu_set_gfx, 0);
				fill.push([G.in_slider[0], G.in_slider[1]]);
			}
			expect(fill).toEqual([
				[0, 0],
				[1, 1],
				[2, 2],
				[3, 2],
				[4, 2]
			]);
			// an unknown mode leaves the sliders where they are
			G.set_scrx_c = 640;
			G.set_scrbit_c = 8;
			G.in_slider[0] = 3;
			G.in_slider[1] = 1;
			Object.assign(G, { set_viewrange: 4, set_terrain: 1, set_water: 5, set_sky: 2, set_effects: 0, set_grass: 3, set_2dfx: 1, set_lightfx: 1, set_windsway: 0, set_fog: 1, set_hwmultitex: 0, set_mb: 1 });
			G.set_mb_alpha = f(0.35);
			await menu.menu_set(Cmenu_set_gfx, 0);
			expect(G.in_slider.slice(0, 9)).toEqual([3, 1, 4, 1, 5, 2, 0, 3, 35]);
			expect(G.in_check.slice(0, 6)).toEqual([1, 1, 0, 1, 0, 1]);
		});

		it('sound page: volumes, name, port; the running ambient channel follows', async () => {
			const vol = vi.spyOn(RT.audio.bb, 'ChannelVolume').mockImplementation(() => {});
			G.m_menu = Cmenu_set_sfx;
			G.in_slider[0] = 50;
			G.in_slider[1] = 80;
			G.in_input[0] = 'Bob';
			G.in_input[1] = '12345x';
			G.amb_chan = 0;
			await menu.menu_set(Cmenu_main);
			expect([G.set_musicvolume, G.set_fxvolume, G.set_name, G.set_serverport]).toEqual([f(0.5), f(0.8), 'Bob', 12345]);
			expect(vol).not.toHaveBeenCalled();

			G.m_menu = Cmenu_set_sfx;
			G.amb_chan = 7;
			await menu.menu_set(Cmenu_set_sfx);
			expect(vol).toHaveBeenCalledWith(7, f(0.8));
			// filled back from the settings
			expect([G.in_slider[0], G.in_slider[1], G.in_input[0], G.in_input[1]]).toEqual([50, 80, 'Bob', '12345']);
		});

		it('singleplayer, load, random and multiplayer pages', async () => {
			G.in_scr_scr = 5;
			await menu.menu_set(Cmenu_sp);
			expect(G.in_scr_scr).toBe(0);
			expect(order).toEqual(['load_maps(1,0)']);

			order = [];
			G.in_scr_scr = 5;
			await menu.menu_set(Cmenu_sp_load);
			expect(G.in_scr_scr).toBe(0);
			expect(order).toEqual([]);

			G.in_scr_scr = 5;
			G.in_opt[3] = 4;
			G.in_opt[4] = 3;
			G.in_opt[5] = 9;
			await menu.menu_set(Cmenu_random);
			expect([G.in_opt[3], G.in_opt[4], G.in_opt[5], G.in_scr_scr]).toEqual([1, 0, 1, 0]);

			await menu.menu_set(Cmenu_mp);
			expect(order).toEqual(['usgn_setup']);
			// leaving the multiplayer page shuts the network down, before the next page is set up
			order = [];
			await menu.menu_set(Cmenu_mp);
			expect(order).toEqual(['udp_clear', 'usgn_setup']);
			order = [];
			await menu.menu_set(Cmenu_main, 0);
			expect(order).toEqual([]);
		});

		it('create game page: defaults, and the port field shows set_serverport', async () => {
			G.set_name = 'Bob';
			G.set_serverport = 1234;
			G.set_sv_name = '';
			G.set_sv_port = 0;
			G.set_sv_pw = 'pw';
			G.set_sv_playerlimit = 0;
			G.set_sv_map = 'adventure\\map01';
			G.in_win_map = '';
			await menu.menu_set(Cmenu_mp_create);
			expect(G.set_sv_name).toBe(ss(sm(39), 'Bob'));
			expect(G.set_sv_name).toContain('Bob');
			expect([G.set_sv_port, G.set_sv_playerlimit]).toEqual([1234, 4]);
			expect(G.in_input.slice(0, 4)).toEqual([ss(sm(39), 'Bob'), '1234', 'pw', '4']);
			expect(G.in_win_map).toBe('adventure\\map01');
			expect(order).toEqual(['load_maps(1,1)']);

			// quirk: a set server port is kept but the field still shows the settings port
			G.set_sv_port = 777;
			G.set_sv_map = '';
			G.in_win_map = 'kept';
			await menu.menu_set(Cmenu_mp_create, 0);
			expect([G.set_sv_port, G.in_input[1], G.in_win_map]).toEqual([777, '1234', 'kept']);

			// leaving the page saves the fields as they are
			G.in_input[0] = '  Name ';
			G.in_input[1] = '-5';
			G.in_input[2] = 'secret';
			G.in_input[3] = '9';
			G.in_win_map = 'm';
			await menu.menu_set(Cmenu_main);
			expect([G.set_sv_name, G.set_sv_port, G.set_sv_pw, G.set_sv_playerlimit, G.set_sv_map]).toEqual(['  Name ', -5, 'secret', 9, 'm']);
		});

		it('credits page: loads sys\\credits.inf into the text rows, leaving deletes them', async () => {
			Object.assign(New(Ttbt), { txt: 'old' });
			await menu.menu_set(Cmenu_credits);
			const file = readFileLines('sys\\credits.inf')!;
			expect(file.length).toBeGreaterThan(10);
			expect([...Each(Ttbt)].map((t) => t.txt)).toEqual(file);
			expect(G.in_input[0]).toBe('600');
			await menu.menu_set(Cmenu_main);
			expect([...Each(Ttbt)]).toEqual([]);
		});
	});

	// =================================================================================
	// menu(): main page
	// =================================================================================

	describe('menu(): main page', () => {
		it('one frame: update order, buttons, version', async () => {
			const btn = vi.spyOn(gui, 'gui_button');
			const txtr = vi.spyOn(load_bmpf, 'bmpf_txt_r');
			G.g_unpaused = 0;
			G.set_debug_rt_render = -1;
			await menu.menu();
			expect(G.g_unpaused).toBe(1);
			expect(order).toEqual(['cull_items', 'seq_update', 'mb_update', 'cull', 'update_state', 'up_update', 'p_update', 'seq_blend']);
			expect(G.set_debug_rt_render).toBe(20); // two MilliSecs() around RenderWorld
			expect(btn.mock.calls).toEqual([
				[5, 5, sm(40)],
				[5, 55, sm(41)],
				[5, 105, sm(42)],
				[5, 155, sm(144)],
				[5, 205, sm(43)],
				[5, 275, sm(44)],
				[5, 325, sm(45)],
				[5, 375, sm(46)],
				[5, 550, sm(47), 1, Cicon_x]
			]);
			expect(sm(40)).not.toBe('');
			expect(txtr).toHaveBeenCalledWith(797, 583, '1.0.0.1', Cbmpf_tiny);
			expect(G.m_menu).toBe(Cmenu_main);
		});

		it('switched-off entries move the others up; editor and credits keep their place', async () => {
			const btn = vi.spyOn(gui, 'gui_button');
			G.game_m_adventure = 0;
			G.game_m_random = 0;
			G.game_m_loadsave = 0;
			G.game_m_editor = 0;
			await menu.menu();
			expect(btn.mock.calls).toEqual([
				[5, 5, sm(42)],
				[5, 55, sm(43)],
				[5, 275, sm(44)],
				[5, 375, sm(46)],
				[5, 550, sm(47), 1, Cicon_x]
			]);
		});

		it('adventure: starts maps\\adventure\\map01.s2 as a singleplayer game', async () => {
			G.set_debug_testmap = 1;
			await click(50, 20);
			expect(order).toContain('load_map(maps\\adventure\\map01.s2,)');
			expect([G.m_section, G.set_debug_testmap]).toEqual([Csection_game_sp, 0]);
		});

		it('random / singleplayer / load / multiplayer / settings / credits open their pages', async () => {
			const page = async (y: number): Promise<number> => {
				await menu.menu_set(Cmenu_main, 0);
				order = [];
				await click(50, y);
				return G.m_menu;
			};
			expect(await page(70)).toBe(Cmenu_random);
			expect(await page(120)).toBe(Cmenu_sp);
			expect(order).toContain('load_maps(1,0)');
			G.in_scr_scr = 3;
			expect(await page(170)).toBe(Cmenu_sp_load);
			expect(order).toContain('load_savegames');
			expect(G.in_scr_scr).toBe(0);
			expect(await page(220)).toBe(Cmenu_mp);
			expect(order).toContain('usgn_setup');
			expect(await page(290)).toBe(Cmenu_set_in);
			expect(await page(390)).toBe(Cmenu_credits);
		});

		it('editor: editor_ini(), then the editor section', async () => {
			await click(50, 340);
			expect(order).toContain('editor_ini');
			expect(G.m_section).toBe(Csection_editor);
		});

		it('quit button or Escape: asks, and quits only on "yes"', async () => {
			const decide = vi.spyOn(gui, 'gui_msgdecide').mockResolvedValue(0);
			injectKeyDown(1);
			await menu.menu();
			injectKeyUp(1);
			expect(decide).toHaveBeenCalledWith(ss(sm(48), 'Stranded II'), Cbmpf_red, sm(2), sm(1));
			expect(G.m_performquit).toBe(0);

			decide.mockResolvedValue(1);
			await click(50, 570);
			expect(decide).toHaveBeenCalledTimes(2);
			expect(G.m_performquit).toBe(1);
		});

		it('right click: an explosion at the picked point', async () => {
			injectMouseDown(2);
			await menu.menu();
			injectMouseUp(2);
			expect(order).toContain('game_explosion(0,0,0,50,10,1)');
			order = [];
			await menu.menu();
			expect(order.some((o) => o.startsWith('game_explosion'))).toBe(false);
		});

		it('F12: the check map', async () => {
			await menu.menu();
			expect(order).not.toContain('editor_testmap(1)');
			injectKeyDown(88);
			await menu.menu();
			injectKeyUp(88);
			expect(order[order.length - 1]).toBe('editor_testmap(1)');
		});
	});

	// =================================================================================
	// menu(): settings pages
	// =================================================================================

	describe('menu(): settings', () => {
		it('controls page: key rows, sensitivity never below 1', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const slider = vi.spyOn(gui, 'gui_slider');
			const check = vi.spyOn(gui, 'gui_check');
			G.in_keyname[17] = 'W';
			G.in_keys[Ckey_forward] = 17;
			G.set_msens = 0;
			await menu.menu_set(Cmenu_set_in);
			expect(G.in_slider[0]).toBe(0);
			await menu.menu();
			expect(G.in_slider[0]).toBe(1);
			const calls = txt.mock.calls.map((c) => c.join('|'));
			expect(calls).toContain(`273|10|${sm(49)}`);
			expect(calls).toContain(`236|83|${sm(54)}|0`);
			expect(calls).toContain('506|83|W|0');
			expect(calls).toContain(`236|103|${sm(55)}|0`);
			expect(calls).toContain(`236|423|${sm(59)}|0`); // sleep at y=340
			expect(calls).toContain(`236|443|${sm(70)}|0`); // quick load / save with savegames on
			expect(calls).toContain(`236|463|${sm(71)}|0`);
			expect(calls).toContain(`436|510|${sm(73)} 0.02`);
			expect(slider).toHaveBeenCalledWith(636, 510, 100, 0);
			expect(check).toHaveBeenCalledWith(436, 540, sm(74), 0);

			txt.mockClear();
			G.game_m_loadsave = 0;
			G.game_scriptkeys = 2;
			G.in_slider[0] = 25;
			await menu.menu();
			const calls2 = txt.mock.calls.map((c) => c.join('|'));
			expect(calls2).toContain(`273|10|${sm(49)} (1)`);
			expect(calls2).not.toContain(`236|443|${sm(70)}|0`);
			expect(calls2).toContain(`436|510|${sm(73)} 0.5`);
		});

		it('page buttons: three without script keys, four with', async () => {
			const btn = vi.spyOn(gui, 'gui_button');
			await menu.menu_set(Cmenu_set_in);
			await menu.menu();
			expect(btn.mock.calls).toEqual([
				[5, 5, sm(49)],
				[5, 55, sm(50)],
				[5, 105, sm(51)],
				[5, 500, sm(3), 1, Cicon_x],
				[5, 550, sm(4), 1, Cicon_ok]
			]);
			await click(50, 70);
			expect(G.m_menu).toBe(Cmenu_set_gfx);
			await click(50, 120);
			expect(G.m_menu).toBe(Cmenu_set_sfx);
			await click(50, 20);
			expect(G.m_menu).toBe(Cmenu_set_in);

			G.game_scriptkeys = 1;
			btn.mockClear();
			await menu.menu();
			expect(btn.mock.calls.slice(0, 4)).toEqual([
				[5, 5, sm(49) + ' (1)'],
				[5, 55, sm(49) + ' (2)'],
				[5, 105, sm(50)],
				[5, 155, sm(51)]
			]);
			await click(50, 70);
			expect(G.m_menu).toBe(Cmenu_set_inscript);
			await click(50, 120);
			expect(G.m_menu).toBe(Cmenu_set_gfx);
			await click(50, 170);
			expect(G.m_menu).toBe(Cmenu_set_sfx);
		});

		it('cancel: back to the main page without saving, settings reloaded', async () => {
			await menu.menu_set(Cmenu_set_in);
			G.set_msens = f(0.5);
			G.in_slider[0] = 99;
			G.set_reboot = 1;
			order = [];
			await click(50, 520);
			expect(G.m_menu).toBe(Cmenu_main);
			expect(G.set_msens).toBe(f(0.5));
			expect(G.set_reboot).toBe(0);
			expect(order.filter((o) => o === 'load_settings' || o === 'prepare_cache_viewranges' || o === 'save_settings')).toEqual(['load_settings', 'prepare_cache_viewranges']);
		});

		it('okay: saves; a changed screen mode leads to the reboot page, whose button quits', async () => {
			G.set_scrx = 800;
			G.set_scry = 600;
			G.set_scrbit = 32;
			G.set_scrx_c = 800;
			G.set_scry_c = 600;
			G.set_scrbit_c = 32;
			await menu.menu_set(Cmenu_set_gfx);
			order = [];
			await click(50, 570);
			expect(G.m_menu).toBe(Cmenu_main);
			expect(order.filter((o) => o === 'load_settings' || o === 'prepare_cache_viewranges' || o === 'save_settings')).toEqual(['save_settings', 'prepare_cache_viewranges']);

			await menu.menu_set(Cmenu_set_gfx);
			G.in_slider[0] = 4;
			await click(50, 570);
			expect([G.set_scrx_c, G.set_reboot, G.m_menu]).toEqual([1600, 1, Cmenu_reboot]);

			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const btn = vi.spyOn(gui, 'gui_button');
			await menu.menu();
			expect(btn.mock.calls).toEqual([[5, 550, sm(47), 1, Cicon_ok]]);
			expect(txt.mock.calls.map((c) => c.join('|'))).toEqual([`273|10|${sm(120)}`, `236|63|${sm(121)}`, `236|83|${sm(122)}`, `236|123|${sm(123)}`, `236|143|${sm(124)}`]);
			expect(G.m_performquit).toBe(0);
			await click(50, 570);
			expect(G.m_performquit).toBe(1);
		});

		it('graphics page: the names of the slider positions', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			await menu.menu_set(Cmenu_set_gfx, 0);
			G.in_slider = [2, 1, 4, 0, 6, 1, 2, 3, 35, 0, 0];
			await menu.menu();
			const at = (x: number, y: number): unknown => txt.mock.calls.find((c) => c[0] === x && c[1] === y)?.[2];
			expect(at(436, 63)).toBe('1152x864');
			expect(at(436, 83)).toBe('24 Bit');
			expect(at(436, 123)).toBe(sm(83));
			expect(at(436, 163)).toBe(sm(86));
			expect(at(436, 183)).toBe(sm(92));
			expect(at(436, 203)).toBe(sm(87));
			expect(at(436, 223)).toBe(sm(88));
			expect(at(436, 243)).toBe(sm(99));
			expect(at(436, 403)).toBe(sm(108));

			txt.mockClear();
			G.in_slider = [4, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0];
			await menu.menu();
			expect(at(436, 63)).toBe('1600x1200');
			expect(at(436, 83)).toBe('16 Bit');
			expect(at(436, 123)).toBe(sm(79));
			expect(at(436, 163)).toBe(sm(88));
			expect(at(436, 183)).toBe(sm(85)); // water has its own list: 91,85,86,87,88,89,92
			expect(at(436, 243)).toBe(sm(96));
		});

		it('sound page: percent or "off"; the multiplayer fields only with multiplayer', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const input = vi.spyOn(gui, 'gui_input');
			await menu.menu_set(Cmenu_set_sfx, 0);
			G.in_slider[0] = 0;
			G.in_slider[1] = 30;
			await menu.menu();
			const at = (x: number, y: number): unknown => txt.mock.calls.find((c) => c[0] === x && c[1] === y)?.[2];
			expect(at(436, 63)).toBe(sm(112));
			expect(at(436, 93)).toBe('30%');
			expect(input.mock.calls).toEqual([
				[436, 279, 256, 0],
				[436, 309, 128, 1]
			]);
			input.mockClear();
			G.game_m_multiplayer = 0;
			await menu.menu();
			expect(input).not.toHaveBeenCalled();
		});

		it('script keys page: one row per named script key', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			G.game_scriptkeys = 2;
			G.game_scriptkeyn[0] = 'Wave';
			G.game_scriptkeyn[2] = 'Dance';
			G.game_scriptkey[2] = 30;
			G.in_keyname[30] = 'A';
			await menu.menu_set(Cmenu_set_inscript, 0);
			await menu.menu();
			const calls = txt.mock.calls.map((c) => c.join('|'));
			expect(calls).toContain(`273|10|${sm(49)} (2)`);
			expect(calls).toContain('236|83|Wave|0');
			expect(calls).toContain('236|123|Dance|0');
			expect(calls).toContain('506|123|A|0');
			expect(calls.filter((c) => c.startsWith('236|103|'))).toEqual([]);
		});
	});

	// =================================================================================
	// menu_keysetting / menu_keysettingscript
	// =================================================================================

	describe('menu_keysetting', () => {
		let txt: ReturnType<typeof vi.spyOn>;
		let play: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			txt = vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
			play = vi.spyOn(functions, 'play').mockImplementation(() => {});
			G.sfx_click = 11;
			G.sfx_fail = 22;
			G.in_keyname[17] = 'W';
			G.in_keyname[30] = 'A';
			G.in_keyname[31] = 'S';
			G.in_keys[Ckey_forward] = 17;
			G.in_getkey = -1;
			G.in_mx = 0;
			G.in_my = 0;
		});

		it('idle row: name and key; highlighted and selectable under the mouse', () => {
			menu.menu_keysetting(20, 'Forward', Ckey_forward);
			expect(txt.mock.calls).toEqual([
				[236, 103, 'Forward', 0],
				[506, 103, 'W', 0]
			]);
			txt.mockClear();
			// the row is y+83 .. y+103, x 236 .. 775, borders included
			for (const [x, y, over] of [
				[236, 103, 1],
				[775, 123, 1],
				[235, 110, 0],
				[776, 110, 0],
				[500, 102, 0],
				[500, 124, 0]
			]) {
				G.in_mx = x;
				G.in_my = y;
				txt.mockClear();
				menu.menu_keysetting(20, 'Forward', Ckey_forward);
				expect(txt.mock.calls[0][3]).toBe(over);
			}
			expect(G.in_getkey).toBe(-1);
			expect(play).not.toHaveBeenCalled();

			G.in_mx = 500;
			G.in_my = 110;
			G.in_mhit[1] = 1;
			menu.menu_keysetting(20, 'Forward', Ckey_forward);
			expect(G.in_getkey).toBe(Ckey_forward);
			expect(play).toHaveBeenCalledWith(11);
		});

		it('while another key is being set, rows do not react', () => {
			G.in_getkey = Ckey_jump;
			G.in_mx = 500;
			G.in_my = 110;
			G.in_mhit[1] = 1;
			menu.menu_keysetting(20, 'Forward', Ckey_forward);
			expect(txt.mock.calls[0][3]).toBe(0);
			expect(G.in_getkey).toBe(Ckey_jump);
		});

		it('selected row: waits for a key; the lowest named scancode wins and is taken from every other action', () => {
			G.in_getkey = Ckey_forward;
			G.in_cursor = 1;
			menu.menu_keysetting(0, 'Forward', Ckey_forward);
			expect(txt.mock.calls).toEqual([
				[236, 83, 'Forward', 1],
				[506, 83, sm(138), 1]
			]);
			expect(G.in_getkey).toBe(Ckey_forward);

			G.in_keys[Ckey_backward] = 30;
			G.game_scriptkey[4] = 30;
			injectKeyDown(40); // no name: ignored
			injectKeyDown(31);
			injectKeyDown(30);
			menu.menu_keysetting(0, 'Forward', Ckey_forward);
			injectKeyUp(40);
			injectKeyUp(31);
			injectKeyUp(30);
			expect(G.in_keys[Ckey_forward]).toBe(30);
			expect(G.in_keys[Ckey_backward]).toBe(0);
			expect(G.game_scriptkey[4]).toBe(0);
			expect(G.in_getkey).toBe(-1);
			expect(play).toHaveBeenLastCalledWith(11);
		});

		it('selected row: mouse buttons 256..260 (the highest hit wins), wheel 261 / 262', () => {
			const set = (prep: () => void): number => {
				G.in_keys[Ckey_forward] = 17;
				G.in_getkey = Ckey_forward;
				for (let i = 1; i <= 5; i++) G.in_mhit[i] = 0;
				G.in_mzs = 0;
				prep();
				menu.menu_keysetting(0, 'Forward', Ckey_forward);
				return G.in_keys[Ckey_forward];
			};
			G.in_mdown[1] = 1;
			expect(set(() => (G.in_mhit[1] = 1))).toBe(256);
			// the click is used up, so that no button reacts to it in the same frame
			expect([G.in_mhit[1], G.in_mdown[1]]).toEqual([0, 0]);
			expect(set(() => (G.in_mhit[2] = 1))).toBe(257);
			expect(set(() => (G.in_mhit[3] = 1))).toBe(258);
			expect(set(() => (G.in_mhit[4] = 1))).toBe(259);
			expect(set(() => (G.in_mhit[5] = 1))).toBe(260);
			expect(
				set(() => {
					G.in_mhit[1] = 1;
					G.in_mhit[3] = 1;
				})
			).toBe(258);
			expect(set(() => (G.in_mzs = 1))).toBe(261);
			expect(set(() => (G.in_mzs = -2))).toBe(262);
			expect(
				set(() => {
					G.in_mhit[5] = 1;
					G.in_mzs = 1;
				})
			).toBe(261);
			// Int(0.4)=0: no wheel
			expect(set(() => (G.in_mzs = f(0.4)))).toBe(17);
			expect(G.in_getkey).toBe(Ckey_forward);
			expect(set(() => (G.in_mzs = f(0.6)))).toBe(261);
		});

		it('selected row: Escape cancels (also a key pressed with it), but not a mouse button', () => {
			G.in_getkey = Ckey_forward;
			G.in_escape = 1;
			injectKeyDown(30);
			menu.menu_keysetting(0, 'Forward', Ckey_forward);
			injectKeyUp(30);
			expect([G.in_keys[Ckey_forward], G.in_getkey]).toEqual([17, -1]);
			expect(play).toHaveBeenLastCalledWith(22);

			G.in_getkey = Ckey_forward;
			G.in_mhit[2] = 1;
			menu.menu_keysetting(0, 'Forward', Ckey_forward);
			expect([G.in_keys[Ckey_forward], G.in_getkey]).toEqual([257, -1]);
			expect(play).toHaveBeenLastCalledWith(11);
		});

		it('menu_keysettingscript: the same for the script keys', () => {
			G.game_scriptkey[3] = 31;
			menu.menu_keysettingscript(60, 'Dance', 3);
			expect(txt.mock.calls).toEqual([
				[236, 143, 'Dance', 0],
				[506, 143, 'S', 0]
			]);
			G.in_mx = 300;
			G.in_my = 150;
			G.in_mhit[1] = 1;
			menu.menu_keysettingscript(60, 'Dance', 3);
			expect(G.in_getkey).toBe(3);
			expect(play).toHaveBeenLastCalledWith(11);

			G.in_mhit[1] = 0;
			G.in_keys[Ckey_forward] = 30;
			G.game_scriptkey[5] = 30;
			injectKeyDown(30);
			menu.menu_keysettingscript(60, 'Dance', 3);
			injectKeyUp(30);
			expect([G.game_scriptkey[3], G.game_scriptkey[5], G.in_keys[Ckey_forward], G.in_getkey]).toEqual([30, 0, 0, -1]);

			G.in_getkey = 3;
			G.in_escape = 1;
			menu.menu_keysettingscript(60, 'Dance', 3);
			expect([G.game_scriptkey[3], G.in_getkey]).toEqual([30, -1]);
			expect(play).toHaveBeenLastCalledWith(22);

			G.in_escape = 0;
			G.in_getkey = 3;
			G.in_mzs = -1;
			menu.menu_keysettingscript(60, 'Dance', 3);
			expect(G.game_scriptkey[3]).toBe(262);
		});
	});

	// =================================================================================
	// menu(): map and savegame pages
	// =================================================================================

	describe('menu(): singleplayer and savegames', () => {
		const names = (n: number): void => {
			for (let i = 1; i <= n; i++) Object.assign(New(Tsg), { name: 'map' + i });
		};

		it('lists nineteen rows from the scroll offset; the selected one can be loaded', async () => {
			const opt = vi.spyOn(gui, 'gui_opt');
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			names(25);
			await menu.menu_set(Cmenu_sp);
			G.in_scr_scr = 2;
			G.in_opt[0] = 4;
			G.sg_date = '01.02.2008';
			G.sg_time = '12:00';
			await menu.menu();
			expect(opt.mock.calls.length).toBe(19);
			expect(opt.mock.calls[0]).toEqual([241, 200, 'map3', 3, 0]);
			expect(opt.mock.calls[18]).toEqual([241, 560, 'map21', 21, 0]);
			const calls = txt.mock.calls.map((c) => c.join('|'));
			expect(calls).toContain(`336|63|${sm(33)}:`);
			expect(calls).toContain('450|63|map4');
			expect(calls).toContain('450|83|01.02.2008');
			expect(calls).toContain(`450|103|12:00 ${sm(36)}`);

			order = [];
			G.set_debug_testmap = 1;
			await click(50, 20);
			expect(order).toContain('load_map(maps\\map4.s2,)');
			expect([G.m_section, G.m_menu, G.set_debug_testmap]).toEqual([Csection_game_sp, 0, 0]);
		});

		it('nothing selected: a note instead of the map data, the load buttons are passive', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const btn = vi.spyOn(gui, 'gui_button');
			const ibtn = vi.spyOn(gui, 'gui_ibutton');
			names(3);
			await menu.menu_set(Cmenu_sp);
			G.in_opt[0] = 0;
			await menu.menu();
			expect(txt.mock.calls.map((c) => c.join('|'))).toContain(`336|63|${sm(156)}|${Cbmpf_red}`);
			expect(btn.mock.calls[0]).toEqual([5, 5, sm(5), 0]);
			expect(ibtn.mock.calls.map((c) => [c[0], c[1], c[4]])).toEqual([
				[742, 200, 0],
				[742, 505, 0],
				[742, 542, 0]
			]);
			order = [];
			await click(50, 20);
			expect(order.some((o) => o.startsWith('load_map('))).toBe(false);
			expect(G.m_menu).toBe(Cmenu_sp);

			// selected: the icon button loads as well
			G.in_opt[0] = 2;
			await click(750, 550);
			expect(order).toContain('load_map(maps\\map2.s2,)');
		});

		it('clicking a row loads its header; back returns to the main page', async () => {
			names(3);
			await menu.menu_set(Cmenu_sp);
			order = [];
			injectMouseMove(260, 225);
			injectMouseDown(1);
			await menu.menu();
			injectMouseUp(1);
			await menu.menu();
			expect(order).toContain('load_map_header(maps\\map2.s2)');
			expect(G.in_opt[0]).toBe(2);
			await click(50, 570);
			expect(G.m_menu).toBe(Cmenu_main);
		});

		it('the wheel scrolls only while there is more to see', async () => {
			names(25);
			await menu.menu_set(Cmenu_sp);
			injectWheel(-120);
			await menu.menu();
			expect(G.in_scr_scr).toBe(1);
			injectWheel(120);
			await menu.menu();
			expect(G.in_scr_scr).toBe(0);
			injectWheel(120);
			await menu.menu();
			expect(G.in_scr_scr).toBe(0);

			DeleteEach(Tsg);
			names(5);
			injectWheel(-120);
			await menu.menu();
			expect(G.in_scr_scr).toBe(0);
		});

		it('savegames: load, and delete after a confirmation', async () => {
			const decide = vi.spyOn(gui, 'gui_msgdecide').mockResolvedValue(0);
			const opt = vi.spyOn(gui, 'gui_opt');
			if (FileType('saves') !== 2) CreateDir('saves');
			expect(writeFileBytes('saves\\foo.sav', stringToBytes('x'))).toBe(true);
			Object.assign(New(Tsg), { name: 'foo' });
			Object.assign(New(Tsg), { name: 'bar' });
			await menu.menu_set(Cmenu_sp_load);
			G.in_opt[0] = 1;
			await menu.menu();
			expect(opt.mock.calls).toEqual([
				[241, 200, 'foo', 1, 0],
				[241, 220, 'bar', 2, 0]
			]);

			// delete, answered with "no"
			G.in_scr_scr = 0;
			await click(750, 515);
			expect(decide).toHaveBeenCalledWith(ss(sm(190), 'foo'), Cbmpf_red, sm(2), sm(1));
			expect(FileType('saves\\foo.sav')).toBe(1);
			expect(order).not.toContain('load_savegames');

			decide.mockResolvedValue(1);
			G.in_scr_scr = 1;
			await click(750, 515);
			expect(FileType('saves\\foo.sav')).toBe(0);
			expect(order).toContain('load_savegames');
			expect(G.in_scr_scr).toBe(0);

			// load with the icon button and with the big button
			order = [];
			await click(750, 550);
			expect(order).toContain('load_map(saves\\foo.sav,)');
			expect([G.m_section, G.m_menu]).toEqual([Csection_game_sp, 0]);
			G.m_menu = Cmenu_sp_load;
			G.in_opt[0] = 2;
			order = [];
			await click(50, 20);
			expect(order).toContain('load_map(saves\\bar.sav,)');
		});

		it('clicking a savegame row loads the header of the .sav file', async () => {
			Object.assign(New(Tsg), { name: 'foo' });
			await menu.menu_set(Cmenu_sp_load);
			order = [];
			await click(260, 205);
			expect(order).toContain('load_map_header(saves\\foo.sav)');
		});
	});

	// =================================================================================
	// menu(): random map page
	// =================================================================================

	it('random map page: options, profiles, and both start buttons', async () => {
		const opt = vi.spyOn(gui, 'gui_opt');
		G.Drprofile[1] = 'Small Island';
		G.Drprofile[3] = 'Desert';
		await menu.menu_set(Cmenu_random);
		await menu.menu();
		const calls = opt.mock.calls.map((c) => c.slice(0, 2).concat(c.slice(3)).join('|'));
		// size group 3 (ids 1,3,4), terrain group 4 (ids 0..5), profile group 5
		expect(calls.slice(0, 9)).toEqual(['436|63|1|3', '436|83|3|3', '436|103|4|3', '436|143|0|4', '436|163|1|4', '436|183|2|4', '436|203|3|4', '436|223|4|4', '436|243|5|4']);
		const profiles = opt.mock.calls.filter((c) => c[4] === 5);
		expect(profiles.slice(0, 2)).toEqual([
			[436, 283, 'Small Island', 1, 5],
			[436, 303, 'Desert', 3, 5]
		]);

		G.in_opt[5] = 3;
		order = [];
		await click(50, 20);
		expect(order.filter((o) => o.startsWith('load_randommap') || o === 'randommapcreate')).toEqual(['load_randommap(3)', 'randommapcreate']);
		order = [];
		await click(750, 550);
		expect(order.filter((o) => o.startsWith('load_randommap') || o === 'randommapcreate')).toEqual(['load_randommap(3)', 'randommapcreate']);
		await click(50, 570);
		expect(G.m_menu).toBe(Cmenu_main);
	});

	it('random map page: fourteen profiles at a time, from the scroll offset', async () => {
		const opt = vi.spyOn(gui, 'gui_opt');
		for (let i = 1; i <= 20; i++) G.Drprofile[i * 2] = 'P' + i;
		await menu.menu_set(Cmenu_random);
		G.in_scr_scr = 3;
		await menu.menu();
		const profiles = opt.mock.calls.filter((c) => c[4] === 5);
		expect(profiles.length).toBe(14);
		expect(profiles[0]).toEqual([436, 283, 'P4', 8, 5]);
		expect(profiles[13]).toEqual([436, 543, 'P17', 34, 5]);
	});

	// =================================================================================
	// menu(): multiplayer pages
	// =================================================================================

	describe('menu(): multiplayer', () => {
		it('server list: rows, colours, tooltip and join on click; the news line scrolls', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const ml = vi.spyOn(load_bmpf, 'bmpf_txt_ml');
			const scroll = vi.spyOn(load_bmpf, 'bmpf_txt_scroll');
			const tt = vi.spyOn(gui, 'gui_tt');
			const btn = vi.spyOn(gui, 'gui_button');
			await menu.menu_set(Cmenu_mp);
			Object.assign(New(Tserver), { name: '' , ip: 1, port: 1 });
			Object.assign(New(Tserver), { name: 'Full', ip: (1 << 24) | (2 << 16) | (3 << 8) | 4, port: 1234, map: 'island', players: 2, maxplayers: 2, password: 1, ping: 150 });
			Object.assign(New(Tserver), { name: 'Slow', ip: 9, port: 99, map: 'm2', players: 1, maxplayers: 4, ping: 201 });
			Object.assign(New(Tserver), { name: 'New', ip: 10, port: 100, map: 'm3', players: 0, maxplayers: 4, ping: 0 });
			G.in_usgn_msg = 'news';
			G.in_usgn_msgscr = 100;
			G.f = 2;
			G.udp = 0;
			order = [];
			injectMouseMove(300, 130); // second visible row
			await menu.menu();
			expect(scroll).toHaveBeenCalledWith(236, 60, 'news', 0, 740, 100);
			expect(G.in_usgn_msgscr).toBe(98);
			expect(btn.mock.calls).toEqual([
				[5, 5, sm(125)],
				[5, 55, sm(126), 0],
				[5, 105, sm(127)],
				[5, 550, sm(131), 1, Cicon_x]
			]);
			expect(ml.mock.calls).toEqual([
				[260, 105, 'Full', 0, 445],
				[450, 105, 'island', 0, 615],
				[260, 125, 'Slow', 1, 445],
				[450, 125, 'm2', 1, 615],
				[260, 145, 'New', 0, 445],
				[450, 145, 'm3', 0, 615]
			]);
			const calls = txt.mock.calls.map((c) => c.join('|'));
			expect(calls).toContain(`620|105|2/2|${Cbmpf_red}`);
			expect(calls).toContain(`690|105|150|${Cbmpf_yellow}`);
			expect(calls).toContain(`620|125|1/4|${Cbmpf_yellow}`);
			expect(calls).toContain(`690|125|201|${Cbmpf_red}`);
			expect(calls).toContain(`620|145|0/4|${Cbmpf_yellow}`);
			expect(calls.filter((c) => c.startsWith('690|145|'))).toEqual([]); // no ping yet
			expect(tt).toHaveBeenCalledWith(300, 130, `Slow (0.0.0.9:99) ${sm(132)}`);
			expect(order).not.toContain('usgn_update');
			expect(order.some((o) => o.startsWith('usgn_joinserver'))).toBe(false);

			// click: joins (the hit, not the release)
			G.udp = 1;
			order = [];
			injectMouseDown(1);
			await menu.menu();
			injectMouseUp(1);
			expect(order).toContain('usgn_joinserver(9,99)');
			expect(order).toContain('usgn_update');
		});

		it('news line: starts again at 500 once it has left the screen (checked every 500 ms)', async () => {
			await menu.menu_set(Cmenu_mp);
			G.in_usgn_msg = 'news';
			G.in_usgn_msgscr = -100000;
			let wrapped = false;
			for (let i = 0; i < 80 && !wrapped; i++) {
				await menu.menu();
				if (G.in_usgn_msgscr > 0) wrapped = true;
			}
			expect(wrapped).toBe(true);
			expect(G.in_usgn_msgscr).toBe(500);
		});

		it('page buttons: LAN is passive; create and back work', async () => {
			await menu.menu_set(Cmenu_mp);
			await click(50, 70);
			expect(G.m_menu).toBe(Cmenu_mp);
			expect(Cmenu_mp_lan).not.toBe(Cmenu_mp);
			await click(50, 120);
			expect(G.m_menu).toBe(Cmenu_mp_create);
			await click(50, 20);
			expect(G.m_menu).toBe(Cmenu_mp);
			await click(50, 570);
			expect(G.m_menu).toBe(Cmenu_main);
		});

		it('create game: map browser, and start (quirk: leaving the page saves the raw fields again)', async () => {
			const txt = vi.spyOn(load_bmpf, 'bmpf_txt');
			const input = vi.spyOn(gui, 'gui_input');
			const winmap = vi.spyOn(gui, 'gui_win_map').mockImplementation(async (mp, jumpto) => {
				order.push(`gui_win_map(${mp},${jumpto})`);
				G.in_win_map = 'adventure\\map01';
				return 0;
			});
			G.set_sv_name = 'x';
			G.set_sv_map = '';
			G.in_win_map = '';
			await menu.menu_set(Cmenu_mp_create);
			await menu.menu();
			expect(txt.mock.calls.map((c) => c.join('|'))).toContain(`436|133|${sm(134)}|${Cbmpf_red}`);
			expect(input.mock.calls).toEqual([
				[436, 63, 256, 0],
				[436, 93, 64, 1],
				[436, 243, 128, 2],
				[436, 273, 64, 3]
			]);

			order = [];
			await click(750, 140);
			expect(order.filter((o) => o.startsWith('gui_win_map') || o.startsWith('load_map_header'))).toEqual(['gui_win_map(1,)', 'load_map_header(maps\\adventure\\map01.s2)']);
			// cancelled browser: no header
			winmap.mockImplementation(async () => 1);
			order = [];
			await click(750, 140);
			expect(order.some((o) => o.startsWith('load_map_header'))).toBe(false);

			G.in_input[0] = '  My very long server name here  ';
			G.in_input[1] = '-5';
			G.in_input[2] = 'pw';
			G.in_input[3] = '9';
			G.set_sv_ip = 77;
			order = [];
			await click(750, 550);
			expect(G.m_menu).toBe(Cmenu_main);
			expect(G.set_sv_ip).toBe(0);
			// the trimmed / clamped values (name 20 chars, port 5, limit 4) are overwritten by menu_set's save
			expect([G.set_sv_name, G.set_sv_port, G.set_sv_pw, G.set_sv_playerlimit, G.set_sv_map]).toEqual(['  My very long server name here  ', -5, 'pw', 9, 'adventure\\map01']);
			expect(order).toContain('usgn_hostserver(-5)');
		});
	});

	// =================================================================================
	// menu(): credits
	// =================================================================================

	it('credits: scroll up by the frame factor, "!n " rows in font n, restart below the screen', async () => {
		const c = vi.spyOn(load_bmpf, 'bmpf_txt_c').mockImplementation(() => {});
		G.m_menu = Cmenu_credits;
		Object.assign(New(Ttbt), { txt: '!3 Title' });
		Object.assign(New(Ttbt), { txt: 'plain' });
		Object.assign(New(Ttbt), { txt: 'below' });
		G.in_input[0] = '570';
		G.f = f(1.5);
		await menu.menu();
		// Float("570")-1.5 = 568.5, y=Int("568.5")=568; the third row (y=608) is below the screen
		expect(G.in_input[0]).toBe('568.5');
		expect(c.mock.calls.filter((x) => x[0] === 400)).toEqual([
			[400, 568, 'Title', 3],
			[400, 588, 'plain']
		]);

		// rows above the screen are skipped; when the last one is gone the text starts again at the bottom
		c.mockClear();
		G.in_input[0] = '-30';
		G.f = 1;
		await menu.menu();
		expect(c.mock.calls.filter((x) => x[0] === 400)).toEqual([
			[400, -11, 'plain'],
			[400, 9, 'below']
		]);
		expect(G.in_input[0]).toBe('-31.0');
		c.mockClear();
		G.in_input[0] = '-70';
		await menu.menu();
		// y=-71: rows at -71,-51,-31 are all above (y+20>0 fails), y ends at -11 < 0
		expect(c.mock.calls.filter((x) => x[0] === 400)).toEqual([]);
		expect(G.in_input[0]).toBe('600');

		await menu.menu_set(Cmenu_credits);
		await click(50, 570);
		expect(G.m_menu).toBe(Cmenu_main);
		expect([...Each(Ttbt)]).toEqual([]);
	});
});
