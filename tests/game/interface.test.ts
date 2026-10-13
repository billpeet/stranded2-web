/**
 * interface.bb: interface() and the if_* functions. Expected values are derived from the original source.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bb3d from '../../src/lib/s2/bb3d';
import { EntityX, EntityY, EntityZ, PositionEntity } from '../../src/lib/s2/bb3d';
import { SEP_LINE, f32 } from '../../src/lib/s2/blitz';
import {
	Cbmpf_red,
	Cclass_building,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Ckey_chat,
	Cmenu_if_build,
	Cmenu_if_char,
	Cmenu_if_chat,
	Cmenu_if_cracklock,
	Cmenu_if_debugmenu,
	Cmenu_if_debugmenu_items,
	Cmenu_if_dlg,
	Cmenu_if_exchange,
	Cmenu_if_items,
	Cmenu_if_loadgame,
	Cmenu_if_msg,
	Cmenu_if_savegame,
	Cmenu_if_selplace
} from '../../src/lib/s2/game/consts';
import { Ditem_name, Ditem_scriptk, Dunit_store } from '../../src/lib/s2/game/defs';
import { DEFS } from '../../src/lib/s2/game/defs_store';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import * as e_save_map from '../../src/lib/s2/game/e_save_map';
import * as game_build from '../../src/lib/s2/game/game_build';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import {
	if_centerpos,
	if_drop,
	if_exchange,
	if_exchange_allowed,
	if_lastentry,
	if_msg,
	if_quickslot,
	if_selectitem,
	if_unselectitems,
	interface_
} from '../../src/lib/s2/game/interface';
import { sm, ss } from '../../src/lib/s2/game/load_strings';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { G } from '../../src/lib/s2/game/state';
import { After, DeleteEach, First, New, T3d, Tbui, Tgroup, Titem, Tmsg, Tp, Tsg, Ttrade, Tx } from '../../src/lib/s2/game/types';
import * as gfx2d from '../../src/lib/s2/gfx2d';
import * as bmpf from '../../src/lib/s2/ui/bmpf';
import { MOD, clickAt, mkItem, mkPlayer, mockFrameBasics, setup, teardown } from './interface_setup';

function msgs(): Tmsg[] {
	const out: Tmsg[] = [];
	for (let m = First(Tmsg); m !== null; m = After(Tmsg, m)) out.push(m);
	return out;
}

/** An item type of the mod that has a name. */
function itemTyp(n = 0): number {
	return [...DEFS.items.byId.values()][n].id;
}

function mockItems() {
	return {
		get_stored_item: vi.spyOn(handle_items, 'get_stored_item').mockImplementation((typ, pc, pid) => {
			for (let it = First(Titem); it !== null; it = After(Titem, it)) {
				if (it.typ === typ && it.parent_class === pc && it.parent_id === pid) {
					G.TCitem = it;
					return 1;
				}
			}
			return 0;
		}),
		unstore_item: vi.spyOn(handle_items, 'unstore_item').mockImplementation(() => 1),
		merge_item: vi.spyOn(handle_items, 'merge_item').mockImplementation(() => 1),
		exchange_item: vi.spyOn(handle_items, 'exchange_item').mockImplementation(() => 1),
		countstored_items: vi.spyOn(handle_items, 'countstored_items').mockImplementation(() => 0),
		free_item: vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1),
		set_item: vi.spyOn(handle_items, 'set_item').mockImplementation(() => 0),
		store_item: vi.spyOn(handle_items, 'store_item').mockImplementation(() => 1),
		p_add2d: vi.spyOn(particles, 'p_add2d').mockImplementation(() => {
			G.TCp = New(Tp);
			G.TCp.fx = 5;
			G.TCp.fy = 5;
			return 1;
		})
	};
}

describe.skipIf(!existsSync(MOD))('interface.bb', () => {
	beforeEach(async () => {
		await setup();
		G.in_mx = 799;
		G.in_my = 599;
	});
	afterEach(teardown);

	describe('if_msg', () => {
		it('creates the message at the front of the list', () => {
			G.ms = 5000;
			if_msg('a');
			if_msg('b', 4, 100);
			const l = msgs();
			expect(l.map((m) => m.msg)).toEqual(['b', 'a']);
			expect(l[0].col).toBe(4);
			expect(l[0].age).toBe(5100);
			expect(l[0].scroll).toBe(f32(0.1));
			expect(l[1].col).toBe(0);
			expect(l[1].age).toBe(8000);
		});
	});

	describe('item selection', () => {
		it('if_selectitem selects the first item with the id or the type, whoever owns it', () => {
			const a = mkItem(1, 7, 1, 0, 0);
			const b = mkItem(5, 8, 1, Cclass_unit, 1);
			const c = mkItem(6, 7, 1, Cclass_unit, 1);
			expect(if_selectitem(99, 7)).toBe(1);
			expect([a.if_sel, b.if_sel, c.if_sel]).toEqual([1, 0, 0]);
			expect(if_selectitem(5)).toBe(1);
			expect(b.if_sel).toBe(1);
			expect(if_selectitem(1234)).toBe(0);
			if_unselectitems();
			expect([a.if_sel, b.if_sel, c.if_sel]).toEqual([0, 0, 0]);
		});
	});

	describe('if_quickslot', () => {
		it('returns 0 without a selected item', () => {
			mkItem(1, 7, 1, Cclass_unit, 1);
			expect(if_quickslot(3, 1)).toBe(0);
			expect(G.in_quickslot[3]).toBe(0);
		});

		it('forced slot: sets it, clears the type from the other slots, unselects, tells', () => {
			const typ = itemTyp();
			const it = mkItem(1, typ, 1, Cclass_unit, 1);
			it.if_sel = 1;
			G.in_quickslot[5] = typ;
			G.ms = 100;
			expect(if_quickslot(3, 1)).toBe(1);
			expect(G.in_quickslot[3]).toBe(typ);
			expect(G.in_quickslot[5]).toBe(0);
			expect(it.if_sel).toBe(0);
			expect(msgs().map((m) => m.msg)).toEqual([ss(sm(197), Ditem_name(typ), '3')]);
			// forced slot that already holds the type: toggles off
			it.if_sel = 1;
			expect(if_quickslot(3, 1)).toBe(1);
			expect(G.in_quickslot[3]).toBe(0);
			expect(msgs()[0].msg).toBe(ss(sm(198), Ditem_name(typ)));
		});

		it('free slot: removes an existing assignment, else takes the first free slot, else slot 1', () => {
			const typ = itemTyp();
			const it = mkItem(1, typ, 1, Cclass_unit, 1);
			// first free slot
			G.in_quickslot[1] = 9999;
			it.if_sel = 1;
			expect(if_quickslot()).toBe(1);
			expect(G.in_quickslot[2]).toBe(typ);
			expect(msgs()).toHaveLength(0); // msg=0
			// already assigned: removed
			it.if_sel = 1;
			if_quickslot(0, 1);
			expect(G.in_quickslot[2]).toBe(0);
			expect(msgs()[0].msg).toBe(ss(sm(198), Ditem_name(typ)));
			// everything full: slot 1 is overwritten, without a message
			for (let i = 1; i <= 9; i++) G.in_quickslot[i] = 9000 + i;
			it.if_sel = 1;
			if_quickslot(0, 1);
			expect(G.in_quickslot[1]).toBe(typ);
			expect(G.in_quickslot[2]).toBe(9002);
			expect(msgs()).toHaveLength(1);
		});
	});

	describe('if_exchange / if_exchange_allowed', () => {
		it('sets the exchange state and selects the first item of the other side, else of the player', () => {
			G.g_player = 1;
			mkItem(8, 2, 1, Cclass_unit, 1);
			G.in_scr_scr = 4;
			G.in_scr_scr2 = 4;
			expect(if_exchange(Cclass_object, 9, 1, '|5|')).toBe(1);
			expect(G.in_ex_sel).toBe(8);
			expect([G.in_ex_class, G.in_ex_id, G.in_ex_allowstore, G.in_ex_only]).toEqual([Cclass_object, 9, 1, '|5|']);
			expect(G.m_menu).toBe(Cmenu_if_exchange);
			expect([G.in_scr_scr, G.in_scr_scr2]).toEqual([0, 0]);
			mkItem(3, 2, 1, Cclass_object, 9);
			expect(if_exchange(Cclass_object, 9)).toBe(1);
			expect(G.in_ex_sel).toBe(3);
			expect([G.in_ex_allowstore, G.in_ex_only]).toEqual([0, '']);
		});

		it('returns 0 with nothing to select', () => {
			G.g_player = 1;
			G.in_ex_sel = 77;
			expect(if_exchange(Cclass_object, 9)).toBe(0);
			expect(G.in_ex_sel).toBe(0);
		});

		it('if_exchange_allowed looks for |typ| in in_ex_only', () => {
			G.in_ex_only = '';
			expect(if_exchange_allowed(1)).toBe(1);
			G.in_ex_only = '|5|12|';
			expect(if_exchange_allowed(5)).toBe(1);
			expect(if_exchange_allowed(12)).toBe(1);
			expect(if_exchange_allowed(1)).toBe(0);
			expect(if_exchange_allowed(2)).toBe(0);
		});
	});

	it('if_centerpos: no click, mouse to the middle of the screen', () => {
		G.in_mhit[1] = 1;
		G.in_mdown[1] = 1;
		G.in_mrelease[1] = 1;
		if_centerpos();
		expect([G.in_mhit[1], G.in_mdown[1], G.in_mrelease[1]]).toEqual([0, 0, 0]);
		expect([G.in_mx, G.in_my]).toEqual([G.set_scrx / 2, G.set_scry / 2]);
	});

	it('if_lastentry selects the last diary entry and scrolls to it', () => {
		const add = (mode: number) => {
			const t = New(Tx);
			t.mode = mode;
		};
		for (let i = 0; i < 3; i++) add(2);
		add(1);
		G.in_scr_scr = 7;
		if_lastentry();
		expect(G.in_opt[0]).toBe(3);
		expect(G.in_scr_scr).toBe(7); // only changed for more than 4 entries
		for (let i = 0; i < 3; i++) add(2);
		if_lastentry();
		expect(G.in_opt[0]).toBe(6);
		expect(G.in_scr_scr).toBe(2);
	});

	describe('if_drop', () => {
		it('outside the window: drops the whole stack at the mouse and resets drag and drop', () => {
			const m = mockItems();
			G.g_player = 1;
			const it = mkItem(4, 33, 6, Cclass_unit, 1);
			G.in_dnd = 1;
			G.in_dnd_src = 0;
			G.in_dnd_typ = 33;
			G.in_dnd_pivotx = 10;
			G.in_dnd_pivoty = 20;
			G.in_mx = 100;
			G.in_my = 300;
			G.p_skipevent = 1;
			const set_parsecache = vi.spyOn(RT.script, 'set_parsecache').mockReturnValue(0);
			if_drop();
			expect(set_parsecache).toHaveBeenCalledWith(Cclass_item, 4, 'drop');
			expect(m.p_add2d).toHaveBeenCalledWith(90, 280, -2, 33);
			expect([G.TCp!.fx, G.TCp!.fy]).toEqual([0, 0]);
			expect(m.unstore_item).toHaveBeenCalledWith(4, 6, 1);
			expect(m.merge_item).toHaveBeenCalledWith(4);
			expect([G.in_dnd, G.in_dnd_src, G.in_dnd_typ]).toEqual([0, 0, 0]);
			expect(G.TCitem).toBe(it);
		});

		it('the on:drop script can skip the drop', () => {
			const m = mockItems();
			G.g_player = 1;
			mkItem(4, 33, 6, Cclass_unit, 1);
			G.in_dnd_src = 0;
			G.in_dnd_typ = 33;
			G.in_mx = 300;
			G.in_my = 598; // in_my>595
			vi.spyOn(RT.script, 'set_parsecache').mockReturnValue(1);
			const parse = vi.spyOn(RT.script, 'parse').mockImplementation(() => {
				G.p_skipevent = 1;
				return 1;
			});
			if_drop();
			expect(parse).toHaveBeenCalledOnce();
			expect(m.unstore_item).not.toHaveBeenCalled();
			expect(m.p_add2d).not.toHaveBeenCalled();
		});

		it('inside the window nothing is dropped; an item from the exchange side is not dropped outside either', () => {
			const m = mockItems();
			G.g_player = 1;
			mkItem(4, 33, 6, Cclass_unit, 1);
			G.in_dnd_typ = 33;
			G.in_mx = 300;
			G.in_my = 300;
			if_drop();
			G.in_dnd_typ = 33;
			G.in_dnd_src = 1;
			G.in_mx = 100;
			if_drop();
			expect(m.get_stored_item).not.toHaveBeenCalled();
			expect(m.unstore_item).not.toHaveBeenCalled();
		});

		it('exchange: object -> player; a failed exchange tells, and selects the first item of the object', () => {
			const m = mockItems();
			const sfx = vi.spyOn(RT.audio, 'sfx').mockReturnValue(0);
			const speech = vi.spyOn(RT.audio, 'speech').mockReturnValue(0);
			G.g_player = 1;
			mkItem(20, 34, 2, Cclass_object, 9);
			mkItem(21, 33, 6, Cclass_object, 9);
			G.m_menu = Cmenu_if_exchange;
			G.in_ex_class = Cclass_object;
			G.in_ex_id = 9;
			G.in_ex_only = '';
			G.in_ex_sel = 21;
			G.in_dnd_src = 1;
			G.in_dnd_typ = 33;
			G.in_mx = 300;
			G.in_my = 100;
			m.exchange_item.mockReturnValue(0);
			if_drop();
			expect(m.exchange_item).toHaveBeenCalledWith(Cclass_unit, 1, 6);
			expect(msgs().map((x) => [x.msg, x.col])).toEqual([[sm(181), Cbmpf_red]]);
			expect(sfx).toHaveBeenCalledWith(G.sfx_fail);
			expect(speech).toHaveBeenCalledWith('nospace');
			expect(G.in_ex_sel).toBe(20);
			// result 2: the selection stays
			G.in_dnd_src = 1;
			G.in_dnd_typ = 33;
			G.in_ex_sel = 21;
			m.exchange_item.mockReturnValue(2);
			if_drop();
			expect(G.in_ex_sel).toBe(21);
			expect(msgs()).toHaveLength(1);
		});

		it('exchange: player -> object needs allowstore and an allowed type', () => {
			const m = mockItems();
			const speech = vi.spyOn(RT.audio, 'speech').mockReturnValue(0);
			vi.spyOn(RT.audio, 'sfx').mockReturnValue(0);
			G.g_player = 1;
			mkItem(4, 33, 6, Cclass_unit, 1);
			G.m_menu = Cmenu_if_exchange;
			G.in_ex_class = Cclass_object;
			G.in_ex_id = 9;
			const drop = () => {
				G.in_dnd_src = 0;
				G.in_dnd_typ = 33;
				G.in_mx = 300;
				G.in_my = 400;
				if_drop();
			};
			G.in_ex_allowstore = 0;
			drop();
			expect(speech).toHaveBeenLastCalledWith('negative');
			expect(m.exchange_item).not.toHaveBeenCalled();
			G.in_ex_allowstore = 1;
			G.in_ex_only = '|1|';
			drop();
			expect(speech).toHaveBeenCalledTimes(2);
			expect(m.exchange_item).not.toHaveBeenCalled();
			G.in_ex_only = '|33|';
			m.exchange_item.mockReturnValue(-1);
			drop();
			expect(m.exchange_item).toHaveBeenCalledWith(Cclass_object, 9, 6);
			expect(speech).toHaveBeenLastCalledWith('nospace'); // -1 in this direction
			expect(G.in_ex_sel).toBe(4);
		});
	});

	describe('interface()', () => {
		it('dead player: message in the middle and the death blur', async () => {
			const m = mockFrameBasics();
			mkPlayer(0);
			const txt_c = vi.spyOn(bmpf, 'bmpf_txt_c');
			await interface_();
			expect(txt_c).toHaveBeenCalledWith(400, 250, sm(140), Cbmpf_red);
			expect(m.mb_override).toHaveBeenCalledWith(f32(0.96));
			expect(m.parent_h).not.toHaveBeenCalled();
		});

		it('messages: scroll once their time is over, are drawn upwards from the middle, and are removed', async () => {
			mockFrameBasics();
			mkPlayer();
			G.ms = 10000;
			G.f = 1;
			G.set_drawinterface = 0;
			const txt = vi.spyOn(bmpf, 'bmpf_txt');
			if_msg('gone', 0, -5);
			First(Tmsg)!.scroll = 300; // *2 = 600 > 400: drawn, then deleted
			if_msg('old', 2, -1); // age 9999: scrolls
			if_msg('new', 1); // age 13000
			await interface_();
			expect(txt.mock.calls).toEqual([
				[5, 300, 'new', 1],
				[5, 280, 'old', 2], // Int(5-0.2)
				[-595, 260, 'gone', 0]
			]);
			expect(msgs().map((x) => [x.msg, x.scroll])).toEqual([
				['new', f32(0.1)],
				['old', f32(f32(0.1) * 2)]
			]);
		});

		it('messages above y=55 are deleted without being drawn', async () => {
			mockFrameBasics();
			mkPlayer();
			G.ms = 0;
			G.set_drawinterface = 0;
			for (let i = 0; i < 16; i++) if_msg('m' + i);
			await interface_();
			// y = 300, 280, ... 60 are 13 lines
			expect(msgs()).toHaveLength(13);
			expect(msgs()[12].msg).toBe('m3');
		});

		it('3D texts are projected for a living player; texts without a parent are deleted', async () => {
			const m = mockFrameBasics();
			mkPlayer();
			G.set_drawinterface = 0;
			const t = New(T3d);
			t.class = Cclass_object;
			t.id = 5;
			await interface_();
			expect(m.parent_h).toHaveBeenCalledWith(Cclass_object, 5);
			expect(First(T3d)).toBeNull();
		});

		it('HUD bars: percentages are rounded Ints, the frames blink below 30 / above 70', async () => {
			mockFrameBasics();
			const u = mkPlayer(25.4);
			const store = Dunit_store(1);
			u.hunger = f32(store * 0.8);
			u.thirst = f32(store * 0.25);
			G.game_healthsystem = 3;
			G.in_cursor = 1;
			G.set_drawinterface = 1;
			const rect = vi.spyOn(gfx2d, 'DrawBlockRect');
			await interface_();
			expect(rect.mock.calls).toEqual([
				[G.gfx_bars, 5, 4, 0, 0, 25, 5, 1],
				[G.gfx_bar_hunger, 5, 12, 0, 0, 80, 5, 1],
				[G.gfx_bar_thirst, 5, 20, 0, 0, 25, 5, 1]
			]);
			G.in_cursor = 0;
			u.health = 31;
			rect.mockClear();
			await interface_();
			expect(rect.mock.calls[0]).toEqual([G.gfx_bars, 5, 4, 0, 0, 31, 5, 0]);
			expect(rect.mock.calls[1]).toEqual([G.gfx_bar_hunger, 5, 12, 0, 0, 80, 5, 0]);
			expect(rect.mock.calls[2]).toEqual([G.gfx_bar_thirst, 5, 20, 0, 0, 25, 5, 1]);
		});

		it('script texts: right aligned ones stack below the compass, the others use their position', async () => {
			mockFrameBasics();
			mkPlayer();
			G.set_drawinterface = 0;
			G.in_compass = 1;
			G.in_sitxt[0] = 1;
			G.in_sitxt_align[0] = -1;
			G.in_sitxt_txt[0] = 'A';
			G.in_sitxt_font[0] = 2;
			G.in_sitxt[3] = 1;
			G.in_sitxt_align[3] = -1;
			G.in_sitxt_txt[3] = 'B';
			G.in_sitxt[4] = 1;
			G.in_sitxt_align[4] = 2;
			G.in_sitxt_x[4] = 50;
			G.in_sitxt_y[4] = 60;
			G.in_sitxt_txt[4] = 'C';
			const r = vi.spyOn(bmpf, 'bmpf_txt_r');
			const c = vi.spyOn(bmpf, 'bmpf_txt_c');
			await interface_();
			expect(r.mock.calls).toEqual([
				[797, 100, 'A', 2],
				[797, 116, 'B', 0]
			]);
			expect(c).toHaveBeenCalledWith(50, 60, 'C', 0);
		});

		it('side bar: "items" opens the inventory with nothing selected', async () => {
			mockFrameBasics();
			mockItems();
			mkPlayer();
			const it = mkItem(4, itemTyp(), 2, Cclass_unit, 1);
			it.if_sel = 1;
			G.m_menu = Cmenu_if_char;
			G.in_scr_scr = 22;
			clickAt(10, 115);
			await interface_();
			expect(G.m_menu).toBe(Cmenu_if_items);
			expect(G.in_scr_scr).toBe(0);
			expect(it.if_sel).toBe(0);
			expect(G.in_mrelease[1]).toBe(0); // the click is used up
		});

		it('a dead player is sent to the load menu, also from the debug item menu (misspelled constant)', async () => {
			mockFrameBasics();
			mockItems();
			mkPlayer(0);
			const load_savegames = vi.spyOn(e_load_map, 'load_savegames').mockImplementation(() => {});
			G.m_menu = Cmenu_if_debugmenu;
			await interface_();
			expect(G.m_menu).toBe(Cmenu_if_debugmenu);
			expect(load_savegames).not.toHaveBeenCalled();
			G.m_menu = Cmenu_if_debugmenu_items;
			G.in_scr_scr = 3;
			await interface_();
			expect(G.m_menu).toBe(Cmenu_if_loadgame);
			expect(load_savegames).toHaveBeenCalledOnce();
			expect(G.in_scr_scr).toBe(0);
		});

		it('load menu: the side button loads the selected savegame', async () => {
			mockFrameBasics();
			mkPlayer();
			const load_map = vi.spyOn(e_load_map, 'load_map').mockResolvedValue(1);
			vi.spyOn(e_load_map, 'load_map_header').mockReturnValue(1);
			New(Tsg).name = 'a';
			New(Tsg).name = 'b';
			G.m_menu = Cmenu_if_loadgame;
			G.in_opt[0] = 2;
			G.set_debug_testmap = 1;
			clickAt(10, 305);
			await interface_();
			expect(load_map).toHaveBeenCalledWith('saves\\b.sav', '');
			expect(G.m_menu).toBe(0);
			expect(G.set_debug_testmap).toBe(0);
		});

		it('load menu: without a selection the button does nothing; from another menu it opens the list', async () => {
			mockFrameBasics();
			mkPlayer();
			const load_map = vi.spyOn(e_load_map, 'load_map').mockResolvedValue(1);
			const load_savegames = vi.spyOn(e_load_map, 'load_savegames').mockImplementation(() => {});
			G.m_menu = Cmenu_if_loadgame;
			G.in_opt[0] = 0;
			clickAt(10, 305);
			await interface_();
			expect(load_map).not.toHaveBeenCalled();
			expect(G.m_menu).toBe(Cmenu_if_loadgame);
			G.m_menu = Cmenu_if_char;
			G.in_scr_scr = 5;
			clickAt(10, 305);
			await interface_();
			expect(load_savegames).toHaveBeenCalledOnce();
			expect(G.m_menu).toBe(Cmenu_if_loadgame);
			expect(G.in_scr_scr).toBe(0);
		});

		it('save menu: the side button saves under the entered name', async () => {
			mockFrameBasics();
			mkPlayer();
			const save_map = vi.spyOn(e_save_map, 'save_map').mockResolvedValue(1);
			G.m_menu = Cmenu_if_savegame;
			G.in_input[0] = 'slot';
			clickAt(10, 355);
			await interface_();
			expect(save_map).toHaveBeenCalledWith('saves\\slot.sav', 'sav', '');
			expect(G.m_menu).toBe(0);
		});

		it('save menu: typing the name of a savegame selects it and loads its header once', async () => {
			mockFrameBasics();
			mkPlayer();
			const header = vi.spyOn(e_load_map, 'load_map_header').mockReturnValue(1);
			New(Tsg).name = 'a';
			New(Tsg).name = 'b';
			G.m_menu = Cmenu_if_savegame;
			G.in_input[0] = 'b';
			await interface_();
			expect(G.in_opt[0]).toBe(2);
			expect(header).toHaveBeenCalledWith('saves\\b.sav');
			await interface_();
			expect(header).toHaveBeenCalledOnce();
			G.in_input[0] = 'bx';
			await interface_();
			expect(G.in_opt[0]).toBe(0);
		});

		it('inventory: "drop" drops one of the selected stack, as a 2D particle from its box', async () => {
			mockFrameBasics();
			const m = mockItems();
			mkPlayer();
			const typ = itemTyp();
			mkItem(3, itemTyp(1), 1, Cclass_unit, 1);
			Ditem_scriptk.set(typ, '');
			const it = mkItem(4, typ, 3, Cclass_unit, 1);
			it.if_sel = 1;
			G.m_menu = Cmenu_if_items;
			vi.spyOn(RT.script, 'set_parsecache').mockReturnValue(0);
			clickAt(236 + 37 + 74 + 74 + 74 + 5, 547);
			await interface_();
			expect(G.TCitem).toBe(it);
			expect([G.tmp_iselx, G.tmp_isely, G.tmp_iseltyp]).toEqual([236 + 45, 63, typ]);
			expect(m.p_add2d).toHaveBeenCalledWith(236 + 45, 63, -2, typ);
			expect(m.unstore_item).toHaveBeenCalledWith(4, 1, 1);
			expect(m.merge_item).toHaveBeenCalledWith(4);
			expect(G.m_menu).toBe(Cmenu_if_items);
		});

		it('inventory: the action buttons are passive with two selected items; clicking a box toggles its selection', async () => {
			mockFrameBasics();
			const m = mockItems();
			mkPlayer();
			const a = mkItem(3, itemTyp(1), 1, Cclass_unit, 1);
			const b = mkItem(4, itemTyp(), 3, Cclass_unit, 1);
			a.if_sel = 1;
			b.if_sel = 1;
			G.m_menu = Cmenu_if_items;
			clickAt(236 + 37 + 74 + 74 + 74 + 5, 547);
			await interface_();
			expect(m.unstore_item).not.toHaveBeenCalled();
			clickAt(236 + 45 + 5, 63 + 5);
			await interface_();
			expect([a.if_sel, b.if_sel]).toEqual([1, 0]);
		});

		it('crack lock: the right key advances, the last one fires the event; a wrong key resets', async () => {
			mockFrameBasics();
			mkPlayer();
			const sfx = vi.spyOn(RT.audio, 'sfx').mockReturnValue(0);
			const emu = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
			G.m_menu = Cmenu_if_cracklock;
			G.pc_cl_code = 'lr';
			G.pc_cl_pos = 1;
			G.pc_cl_mode = 4;
			G.pc_cl_class = Cclass_object;
			G.pc_cl_id = 12;
			clickAt(489 - 37 + 5, 305);
			await interface_();
			expect(G.pc_cl_pos).toBe(2);
			expect(sfx).toHaveBeenLastCalledWith(G.sfx_crack[0]);
			expect(emu).not.toHaveBeenCalled();
			// wrong key
			clickAt(489 + 5, 300 + 37 + 5);
			await interface_();
			expect(G.pc_cl_pos).toBe(1);
			expect(emu).toHaveBeenLastCalledWith(Cclass_object, 12, 'cracklock_failure');
			expect(sfx).toHaveBeenLastCalledWith(G.sfx_fail);
			expect(G.m_menu).toBe(Cmenu_if_cracklock);
			// l, r
			clickAt(489 - 37 + 5, 305);
			await interface_();
			clickAt(489 + 37 + 5, 305);
			await interface_();
			expect(emu).toHaveBeenLastCalledWith(Cclass_object, 12, 'cracklock_success');
			expect(G.pc_cl_pos).toBe(3);
			expect(G.m_menu).toBe(0);
		});

		it('crack lock: a key above the mode is passive', async () => {
			mockFrameBasics();
			mkPlayer();
			vi.spyOn(RT.audio, 'sfx').mockReturnValue(0);
			G.m_menu = Cmenu_if_cracklock;
			G.pc_cl_code = 'r';
			G.pc_cl_pos = 1;
			G.pc_cl_mode = 1; // only "left"
			clickAt(489 + 37 + 5, 305);
			await interface_();
			expect(G.pc_cl_pos).toBe(1);
			expect(G.m_menu).toBe(Cmenu_if_cracklock);
		});

		it('chat: sends the trimmed text as a local message and closes', async () => {
			mockFrameBasics();
			mkPlayer();
			G.ms = 1000;
			G.m_menu = Cmenu_if_chat;
			G.in_chat = 'hi  ';
			G.in_keyhit[Ckey_chat] = 1;
			G.udp = 1;
			await interface_();
			expect(G.in_lastchat).toBe('hi');
			expect(msgs().map((x) => [x.msg, x.col, x.age])).toEqual([['Tester: hi', 0, 9000]]);
			expect(G.m_menu).toBe(0);
			expect(G.in_keyhit[Ckey_chat]).toBe(0);
		});

		it('chat: without a network stream nothing is said', async () => {
			mockFrameBasics();
			mkPlayer();
			G.m_menu = Cmenu_if_chat;
			G.in_chat = 'hi';
			G.in_keyhit[Ckey_chat] = 1;
			G.udp = 0;
			await interface_();
			expect(msgs()).toHaveLength(0);
			expect(G.m_menu).toBe(0);
		});

		it('select place: a click picks, stores the point and fires the event', async () => {
			mockFrameBasics();
			mkPlayer();
			const emu = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
			G.m_menu = Cmenu_if_selplace;
			G.pc_sp_class = Cclass_unit;
			G.pc_sp_id = 3;
			G.pc_sp_x = 99;
			G.in_mx = 400;
			G.in_my = 300;
			G.in_mhit[1] = 1;
			await interface_();
			expect(G.pc_sp_x).toBe(bb3d.PickedX());
			expect(emu).toHaveBeenCalledWith(Cclass_unit, 3, 'selectplace');
			expect(G.m_menu).toBe(Cmenu_if_selplace);
		});

		it('message box: a script button runs an event or a script', async () => {
			mockFrameBasics();
			mkPlayer();
			const isevent = vi.spyOn(RT.script, 'parse_isevent').mockReturnValue(1);
			const gevent = vi.spyOn(RT.script, 'parse_globalevent').mockImplementation(() => {});
			const task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			G.m_menu = Cmenu_if_msg;
			G.in_msgtext = 'text';
			G.in_sb[0] = 1;
			G.in_sb_icon[0] = 3;
			G.in_sb_scr[0] = 'ev1';
			G.in_sb[1] = 1;
			G.in_sb_icon[1] = 3;
			G.in_sb_scr[1] = 'msg "x";';
			// two buttons: the first at y=542-37, the second at 542
			clickAt(241, 542 - 37 + 5);
			await interface_();
			expect(gevent).toHaveBeenCalledWith('ev1', 'Script Button Click');
			isevent.mockReturnValue(0);
			clickAt(241, 547);
			await interface_();
			expect(task).toHaveBeenCalledWith(0, 0, 'click', 'Script Button Click', 'msg "x";');
		});

		it('dialogue trade: needs every sold item, takes them and gives the bought ones', async () => {
			mockFrameBasics();
			const m = mockItems();
			mkPlayer();
			const speech = vi.spyOn(RT.audio, 'speech').mockReturnValue(0);
			vi.spyOn(RT.audio, 'play').mockImplementation(() => {});
			const sell = itemTyp();
			const buy = itemTyp(1);
			const row = (id: number, mode: number, typ: number, count: number) => {
				const t = New(Ttrade);
				t.id = id;
				t.mode = mode;
				t.typ = typ;
				t.count = count;
			};
			row(1, 0, 0, 0);
			row(1, 1, sell, 2);
			row(1, 2, buy, 3);
			const mine = mkItem(4, sell, 5, Cclass_unit, 1);
			PositionEntity(G.cam, 1, 2, 3);
			G.m_menu = Cmenu_if_dlg;
			// not enough
			m.countstored_items.mockReturnValue(1);
			clickAt(300, 70);
			await interface_();
			expect(speech).toHaveBeenLastCalledWith('negative');
			expect(m.free_item).not.toHaveBeenCalled();
			// enough
			m.countstored_items.mockReturnValue(5);
			m.set_item.mockImplementation(() => {
				G.TCitem = mkItem(50, buy, 3, 0, 0);
				return 50;
			});
			clickAt(300, 70);
			await interface_();
			expect(speech).toHaveBeenLastCalledWith('positive');
			expect(m.free_item).toHaveBeenCalledWith(mine.id, 2);
			expect(m.set_item).toHaveBeenCalledWith(-1, buy, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), 3);
			expect(m.store_item).toHaveBeenCalledWith(50, Cclass_unit, 1);
		});

		it('build menu: locked buildings are hidden, a click starts the build setup (old list and group list)', async () => {
			mockFrameBasics();
			mkPlayer();
			const start = vi.spyOn(game_build, 'game_buildsetup_start').mockImplementation(() => {});
			const head = (id: number, typ: number) => {
				const b = New(Tbui);
				b.id = id;
				b.mode = 2;
				b.typ = typ;
				b.group = 'x';
				return b;
			};
			DeleteEach(Tbui);
			DeleteEach(Tgroup);
			head(1, 5);
			head(2, 6);
			const lock = New(Tx);
			lock.mode = 3;
			lock.key = '1';
			G.m_menu = Cmenu_if_build;
			G.in_buildg = 'x';
			clickAt(300, 80);
			await interface_();
			// the first visible row is building 2
			expect(start).toHaveBeenCalledOnce();
			expect(start).toHaveBeenCalledWith(6);
			expect(G.in_buildg).toBe('x'); // without groups the group is not touched
			// with a group of buildings: the list of the selected group; the click also leaves the group
			const g = New(Tgroup);
			g.class = Cclass_building;
			g.group = 'x';
			g.name = 'X';
			clickAt(300, 80);
			await interface_();
			expect(start).toHaveBeenCalledTimes(2);
			expect(G.in_buildg).toBe('');
			// group selection: the button of the group opens it
			clickAt(241, 68);
			await interface_();
			expect(G.in_buildg).toBe('x');
			expect(start).toHaveBeenCalledTimes(2);
		});

		it('exchange menu: the 1x button moves one item to the other side when storing is allowed', async () => {
			mockFrameBasics();
			const m = mockItems();
			mkPlayer();
			const speech = vi.spyOn(RT.audio, 'speech').mockReturnValue(0);
			const it = mkItem(4, itemTyp(), 7, Cclass_unit, 1);
			G.m_menu = Cmenu_if_exchange;
			G.in_ex_class = Cclass_item;
			G.in_ex_id = 9;
			G.in_ex_sel = 4;
			G.in_ex_only = '';
			G.in_ex_allowstore = 0;
			clickAt(410 + 37 + 5, 310);
			await interface_();
			expect(G.TCitem).toBe(it);
			expect(speech).toHaveBeenLastCalledWith('negative');
			expect(m.exchange_item).not.toHaveBeenCalled();
			G.in_ex_allowstore = 1;
			m.exchange_item.mockReturnValue(2);
			clickAt(410 + 37 + 5, 310);
			await interface_();
			expect(m.exchange_item).toHaveBeenLastCalledWith(Cclass_item, 9, 1);
			expect(G.in_ex_sel).toBe(4);
			// all
			m.exchange_item.mockReturnValue(1);
			G.in_ex_sel = 4;
			clickAt(410 + 37 + 37 + 37 + 5, 310);
			await interface_();
			expect(m.exchange_item).toHaveBeenLastCalledWith(Cclass_item, 9, 7);
			expect(G.in_ex_sel).toBe(4); // first item of the player again
		});

		it('items carry the script key list with the line separator (on:drop of the definition)', async () => {
			mockFrameBasics();
			const m = mockItems();
			mkPlayer();
			const typ = itemTyp();
			Ditem_scriptk.set(typ, SEP_LINE + 'drop');
			const it = mkItem(4, typ, 1, Cclass_unit, 1);
			it.if_sel = 1;
			G.m_menu = Cmenu_if_items;
			vi.spyOn(RT.script, 'set_parsecache').mockReturnValue(0);
			const env = vi.spyOn(RT.script, 'parse_env').mockImplementation(() => {});
			const load = vi.spyOn(RT.script, 'loadstring_parsecache').mockImplementation(() => {});
			const parse = vi.spyOn(RT.script, 'parse').mockImplementation(() => {
				G.p_skipevent = 1;
				return 1;
			});
			clickAt(236 + 37 + 74 + 74 + 74 + 5, 547);
			await interface_();
			expect(env).toHaveBeenCalledWith(Cclass_item, 4, 'drop');
			expect(load).toHaveBeenCalledOnce();
			expect(parse).toHaveBeenCalledOnce();
			expect(m.unstore_item).not.toHaveBeenCalled();
			expect(G.p_skipevent).toBe(1);
		});
	});
});
