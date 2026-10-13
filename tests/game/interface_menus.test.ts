/**
 * interface.bb: the map menu, the tutorial bar and further menus of interface(). Expected values are derived from the original source.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityX, EntityY, EntityZ, PositionEntity } from '../../src/lib/s2/bb3d';
import * as consoleMod from '../../src/lib/s2/game/console';
import {
	Cbmpf_handwriting,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cclass_unit,
	Cicon_map,
	Cmenu_if_char,
	Cmenu_if_clickscreen,
	Cmenu_if_combine,
	Cmenu_if_debugmenu,
	Cmenu_if_debugmenu_items,
	Cmenu_if_diary,
	Cmenu_if_items,
	Cmenu_if_map,
	Csection_editor,
	Cstate_invulnerability
} from '../../src/lib/s2/game/consts';
import { Ditem_name, Ditem_rate, Dunit_health } from '../../src/lib/s2/game/defs';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { if_map, if_tutorial, interface_ } from '../../src/lib/s2/game/interface';
import { sm } from '../../src/lib/s2/game/load_strings';
import { G } from '../../src/lib/s2/game/state';
import { After, DeleteEach, First, New, Tcom, Tinfo, Tmsg, Tx } from '../../src/lib/s2/game/types';
import * as gfx2d from '../../src/lib/s2/gfx2d';
import { BackBuffer, Color, ReadPixelFast, Rect, SetBuffer } from '../../src/lib/s2/gfx2d';
import * as bmpf from '../../src/lib/s2/ui/bmpf';
import * as gui from '../../src/lib/s2/ui/gui';
import { MOD, clickAt, mkItem, mkPlayer, mockFrameBasics, setup, teardown } from './interface_setup';

function msgs(): Tmsg[] {
	const out: Tmsg[] = [];
	for (let m = First(Tmsg); m !== null; m = After(Tmsg, m)) out.push(m);
	return out;
}

describe.skipIf(!existsSync(MOD))('interface.bb: menus', () => {
	beforeEach(async () => {
		await setup();
		G.in_mx = 799;
		G.in_my = 599;
	});
	afterEach(teardown);

	describe('if_map', () => {
		const cx = 236 + 15 + 256;
		const cy = 50 + 256;

		beforeEach(() => {
			G.ter_size = 32; // 32*64/256: 8 world units per pixel
			G.ter = null;
			vi.spyOn(functions, 'genmap').mockImplementation(() => {});
		});

		it('generates the map image when there is none and draws the player arrow at the scaled position', () => {
			const draw = vi.spyOn(gfx2d, 'DrawImage');
			PositionEntity(G.cam, 80, 0, -160);
			if_map();
			expect(functions.genmap).toHaveBeenCalledWith(256);
			expect(draw.mock.calls[0]).toEqual([G.gfx_icons, 236, 5, Cicon_map]);
			expect(draw).toHaveBeenCalledWith(G.gfx_arrows, cx - 10, cy - 20, 0);
		});

		it('a player outside the map is clamped to the border with an arrow pointing outwards', () => {
			const draw = vi.spyOn(gfx2d, 'DrawImage');
			PositionEntity(G.cam, -2000, 0, 2000); // px=250, py=250
			if_map();
			expect(draw).toHaveBeenCalledWith(G.gfx_arrows, cx + 127, cy + 127, 4);
			draw.mockClear();
			PositionEntity(G.cam, 2000, 0, 0); // px=-250 -> -127: sx=1, sy=5
			if_map();
			expect(draw).toHaveBeenCalledWith(G.gfx_arrows, cx - 127, cy, 7);
			draw.mockClear();
			PositionEntity(G.cam, 0, 0, -2000); // py=-127: sx=5, sy=1
			if_map();
			expect(draw).toHaveBeenCalledWith(G.gfx_arrows, cx, cy - 127, 1);
		});

		it('map indicators: only active ones in the game, with their text under the mouse', () => {
			const mk = (x: number, z: number, active: number, frame: number, txt: string) => {
				const i = New(Tinfo);
				i.typ = 36;
				i.h = CreatePivot();
				PositionEntity(i.h, x, 0, z);
				i.ints[0] = frame;
				i.ints[1] = active;
				i.strings[0] = txt;
			};
			mk(16, 16, 1, 3, 'here');
			mk(-16, -16, 0, 5, 'hidden');
			const other = New(Tinfo);
			other.typ = 35;
			other.h = CreatePivot();
			const draw = vi.spyOn(gfx2d, 'DrawImage');
			const txt = vi.spyOn(bmpf, 'bmpf_txt_c');
			PositionEntity(G.cam, 800, 0, 800);
			G.in_mx = cx - 2 + 3;
			G.in_my = cy + 2 - 3;
			if_map();
			expect(draw).toHaveBeenCalledWith(G.gfx_arrows, cx - 2, cy + 2, 3);
			expect(draw).not.toHaveBeenCalledWith(G.gfx_arrows, cx + 2, cy - 2, 5);
			expect(txt.mock.calls).toEqual([[cx - 2, cy + 2 - 20, 'here', Cbmpf_tiny]]);
			// the player's own text
			PositionEntity(G.cam, 16, 0, 16);
			txt.mockClear();
			if_map();
			expect(txt.mock.calls[0]).toEqual([cx - 2, cy + 2 - 20, sm(170), Cbmpf_tiny]);
		});

		it('editor: a click on the map moves the camera there, 50 above the ground', () => {
			G.m_section = Csection_editor;
			G.ter_groundy = 0;
			PositionEntity(G.cam, 0, 0, 0);
			G.in_mx = cx - 10;
			G.in_my = cy + 20;
			G.in_mdown[1] = 1;
			if_map();
			expect(G.in_cursorf).toBe(2);
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([80, 50, 160]);
			// outside the frame: nothing
			G.in_cursorf = 0;
			G.in_mx = cx + 193;
			if_map();
			expect(G.in_cursorf).toBe(0);
			expect(EntityX(G.cam)).toBe(80);
		});

		it('the okay button closes the menu; interface() draws the map in the map menu', async () => {
			mockFrameBasics();
			mkPlayer();
			G.m_menu = Cmenu_if_map;
			clickAt(747, 547);
			await interface_();
			expect(functions.genmap).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(0);
		});
	});

	it('if_tutorial slides the tutor out while the mouse is at the bottom of a menu', () => {
		G.f = 1;
		G.in_tut_y = 50;
		G.m_menu = 0;
		if_tutorial();
		expect(G.in_tut_y).toBe(40);
		G.in_tut_y = 5;
		if_tutorial();
		expect(G.in_tut_y).toBe(0);
		G.m_menu = Cmenu_if_items;
		G.in_my = G.set_scry - 150;
		G.in_tut_y = 135;
		if_tutorial();
		expect(G.in_tut_y).toBe(145);
		if_tutorial();
		expect(G.in_tut_y).toBe(150);
		G.in_my = G.set_scry - 151;
		if_tutorial();
		expect(G.in_tut_y).toBe(140);
	});

	describe('interface() menus', () => {
		it('weapon box: red cooldown frame, then a fading green one; a fire rate of 0 never gets ready', async () => {
			mockFrameBasics();
			const u = mkPlayer();
			let typ = 0;
			while (Ditem_name(typ) === '') typ++;
			Ditem_rate.set(typ, 400);
			u.player_weapon = typ;
			u.player_lastattack = 900;
			mkItem(4, typ, 3, Cclass_unit, 1);
			G.f = 1;
			G.gt = 1000; // 300 of 400 ms left
			G.in_wpnrdy = 1;
			G.in_wpnrdyg = 100;
			const color = vi.spyOn(gfx2d, 'Color');
			const rect = vi.spyOn(gfx2d, 'Rect');
			const count = vi.spyOn(gui, 'gui_iconboxc');
			await interface_();
			expect([G.in_wpnrdy, G.in_wpnrdyg]).toEqual([0, 0]);
			expect(color).toHaveBeenCalledWith(191.25, 0, 0);
			expect(rect).toHaveBeenCalledWith(G.set_scrx - 90, G.set_scry - 45, 39, 39, 0);
			expect(count).toHaveBeenCalledWith(G.set_scrx - 90, G.set_scry - 45, 3, 1);
			G.gt = 5000;
			color.mockClear();
			await interface_();
			expect(color).toHaveBeenCalledWith(0, 255, 0);
			expect([G.in_wpnrdy, G.in_wpnrdyg]).toEqual([1, 240]);
			await interface_();
			expect(G.in_wpnrdyg).toBe(225);
			// rate 0: 0/0
			Ditem_rate.set(typ, 0);
			await interface_();
			expect([G.in_wpnrdy, G.in_wpnrdyg]).toEqual([0, 0]);
		});

		it('character menu: values as rounded Ints, day and hour; the sleep button sleeps and closes', async () => {
			mockFrameBasics();
			mkPlayer(25.4);
			const sleep = vi.spyOn(game_functions, 'game_sleep').mockImplementation(() => {});
			const txt = vi.spyOn(bmpf, 'bmpf_txt');
			G.game_healthsystem = 1;
			G.map_day = 12;
			G.map_hour = 7;
			G.m_menu = Cmenu_if_char;
			await interface_();
			expect(txt).toHaveBeenCalledWith(546, 63, '25% (25/100)');
			expect(txt).toHaveBeenCalledWith(346, 535, '12');
			expect(txt).toHaveBeenCalledWith(346, 555, '7 ' + sm(36));
			expect(sleep).not.toHaveBeenCalled();
			clickAt(747, 547);
			await interface_();
			expect(sleep).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(0);
		});

		it('diary: shows the selected entry in handwriting with the text scroll position', async () => {
			mockFrameBasics();
			mkPlayer();
			const entry = (key: string, value: string) => {
				const t = New(Tx);
				t.mode = 2;
				t.key = key;
				t.value = value;
			};
			entry('A', 'first');
			entry('B', 'second');
			const rect = vi.spyOn(bmpf, 'bmpf_txt_rect');
			G.m_menu = Cmenu_if_diary;
			G.in_opt[0] = 2;
			G.in_scr_scr2 = 0;
			await interface_();
			expect(rect).toHaveBeenCalledWith(236, 163 + 16 + 5, 480, 390, 'second', Cbmpf_handwriting, 0);
			clickAt(747, 547);
			await interface_();
			expect(G.m_menu).toBe(0);
		});

		it('debug menu: the buttons are a column of 37 pixel rows', async () => {
			mockFrameBasics();
			const u = mkPlayer();
			u.h = CreatePivot();
			u.mh = CreatePivot();
			u.hunger = 5;
			u.thirst = 6;
			u.exhaustion = 7;
			const con_debug = vi.spyOn(consoleMod, 'con_debug').mockImplementation(() => {});
			const unit_values = vi.spyOn(handle_units, 'unit_values').mockImplementation(() => {});
			const get_state = vi.spyOn(handle_states, 'get_state').mockReturnValue(0);
			const set_state = vi.spyOn(handle_states, 'set_state').mockReturnValue(1);
			const free_state = vi.spyOn(handle_states, 'free_state').mockReturnValue(1);
			// Debug Mode: y=83
			G.m_menu = Cmenu_if_debugmenu;
			clickAt(241, 88);
			await interface_();
			expect(con_debug).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(Cmenu_if_debugmenu);
			// Reset Values: y=335
			clickAt(241, 340);
			await interface_();
			expect([u.hunger, u.thirst, u.exhaustion]).toEqual([0, 0, 0]);
			expect(unit_values).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(0);
			expect(msgs().map((m) => [m.msg, m.col])).toEqual([['< reset values cheat >', Cbmpf_yellow]]);
			// Invulnerability / Revive: y=298
			u.health = 0;
			u.health_max = 1;
			G.g_player_dead = 1;
			G.m_menu = Cmenu_if_debugmenu;
			clickAt(241, 303);
			await interface_();
			expect(set_state).toHaveBeenCalledWith(Cstate_invulnerability, Cclass_unit, 1);
			expect(free_state).not.toHaveBeenCalled();
			expect([u.health, u.health_max]).toEqual([Dunit_health(1), Dunit_health(1)]);
			expect(G.g_player_dead).toBe(0);
			expect(msgs()[0].msg).toBe('< invulnerability / revive cheat >');
			// a second time: off
			get_state.mockReturnValue(1);
			G.m_menu = Cmenu_if_debugmenu;
			clickAt(241, 303);
			await interface_();
			expect(free_state).toHaveBeenCalledWith(Cstate_invulnerability, Cclass_unit, 1);
			// Give Item: y=409
			G.in_item_sel = 4;
			G.in_item_scr = 22;
			G.m_menu = Cmenu_if_debugmenu;
			clickAt(241, 414);
			await interface_();
			expect([G.m_menu, G.in_item_sel, G.in_item_scr]).toEqual([Cmenu_if_debugmenu_items, 0, 0]);
		});

		it('debug item menu: a left click gives one item to the player', async () => {
			mockFrameBasics();
			mkPlayer();
			let first = 0;
			while (Ditem_name(first) === '') first++;
			const set_item = vi.spyOn(handle_items, 'set_item').mockReturnValue(5);
			const merge_item = vi.spyOn(handle_items, 'merge_item').mockReturnValue(1);
			const store_item = vi.spyOn(handle_items, 'store_item').mockReturnValue(1);
			PositionEntity(G.cam, 1, 2, 3);
			G.m_menu = Cmenu_if_debugmenu_items;
			G.in_item_scr = 0;
			clickAt(241, 68);
			await interface_();
			expect(set_item).toHaveBeenCalledOnce();
			expect(set_item).toHaveBeenCalledWith(-1, first, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), 1);
			expect(merge_item).toHaveBeenCalledWith(5);
			expect(store_item).toHaveBeenCalledWith(5, Cclass_unit, 1);
			// nothing is stored when the item could not be created
			set_item.mockReturnValue(0);
			store_item.mockClear();
			clickAt(241, 68);
			await interface_();
			expect(store_item).not.toHaveBeenCalled();
		});

		it('combination menu: a click on a row combines it, the return button goes back to the items', async () => {
			mockFrameBasics();
			mkPlayer();
			vi.spyOn(handle_items, 'countstored_items').mockReturnValue(0);
			const combine = vi.spyOn(handle_items, 'combine_item').mockReturnValue(1);
			DeleteEach(Tcom);
			const row = (id: number, mode: number, typ: number, gid: number) => {
				const c = New(Tcom);
				c.id = id;
				c.mode = mode;
				c.typ = typ;
				c.count = 1;
				c.gid = gid;
			};
			row(7, 2, 0, 3);
			row(7, 1, 0, 0);
			row(7, 0, 0, 0);
			row(8, 2, 0, 4); // another group
			const it = mkItem(4, 1, 1, Cclass_unit, 1);
			it.if_sel = 1;
			G.in_combi_gid = 3;
			G.m_menu = Cmenu_if_combine;
			clickAt(300, 90);
			await interface_();
			expect(combine).toHaveBeenCalledOnce();
			expect(combine).toHaveBeenCalledWith(Cclass_unit, 1, 7);
			expect(G.m_menu).toBe(Cmenu_if_combine);
			// one row of 55 pixels: the return button is below it
			clickAt(241, 83 + 5);
			await interface_();
			expect(G.m_menu).toBe(Cmenu_if_combine);
			clickAt(241, 83 + 55 + 5);
			await interface_();
			expect(G.m_menu).toBe(Cmenu_if_items);
			expect(it.if_sel).toBe(0);
		});

		it('click screen: clears to black; the close button only exists when asked for', async () => {
			mockFrameBasics();
			mkPlayer();
			SetBuffer(BackBuffer());
			Color(255, 255, 255);
			Rect(0, 0, 800, 600, 1);
			G.m_menu = Cmenu_if_clickscreen;
			G.in_clickscreenx = 0;
			clickAt(G.set_scrx - 32, 10);
			await interface_();
			expect(ReadPixelFast(400, 300, BackBuffer()) & 0xffffff).toBe(0);
			expect(G.m_menu).toBe(Cmenu_if_clickscreen);
			G.in_clickscreenx = 1;
			await interface_();
			expect(G.m_menu).toBe(0);
		});
	});
});
