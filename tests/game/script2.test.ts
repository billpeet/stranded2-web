/**
 * Package script2: the ScriptHost methods of game/script_host/script2.ts
 * (parser_commands.bb 2188-5434), driven through the real interpreter.
 * Expected values are derived from the original Case blocks.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityX, EntityZ, PositionEntity, RotateEntity, type BBEntity } from '../../src/lib/s2/bb3d';
import * as bb3d from '../../src/lib/s2/bb3d';
import { Rnd, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import * as ai_signals from '../../src/lib/s2/game/ai_signals';
import {
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cbmpf_yellow,
	Cicon_ok,
	Cmenu_if_clickscreen,
	Cmenu_if_cracklock,
	Cmenu_if_diary,
	Cmenu_if_items,
	Cmenu_if_map,
	Cmenu_if_movie,
	Cmenu_if_msg,
	Cmenu_if_selplace,
	Cp_flash,
	Cp_spawn,
	Cp_subsplatter,
	Cpeakblur,
	Cpm_in,
	Cpm_out,
	Csection_game_sp,
	Csection_menu,
	Cstate_ai_stick,
	Cstate_link,
	Cstate_pc_custom
} from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { Ditem_health, Dobject_mat, Dunit_behaviour, Dunit_eyes, Dunit_size } from '../../src/lib/s2/game/defs_arrays';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import * as e_environment from '../../src/lib/s2/game/e_environment';
import { clearDeferred, hasDeferred, runDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import * as game_build from '../../src/lib/s2/game/game_build';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as game_sequences from '../../src/lib/s2/game/game_sequences';
import * as gui from '../../src/lib/s2/game/gui';
import * as handle_all from '../../src/lib/s2/game/handle_all';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { sm } from '../../src/lib/s2/game/load_strings';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import { parse_task } from '../../src/lib/s2/game/parser_functions';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { host as script2 } from '../../src/lib/s2/game/script_host/script2';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, First, New, TYPES, Tbui, Tcom, Tcscr, Tdefparam, Tinfo, Titem, Tobject, Tp, Tstate, Tunit, Tx } from '../../src/lib/s2/game/types';
import { commands as cmdInterface } from '../../src/lib/s2/script/commands/interface';
import { commands as cmdReturns } from '../../src/lib/s2/script/commands/returns';
import { commands as cmdWorld } from '../../src/lib/s2/script/commands/world';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const SEP = '\xa6';
const IMG = 'sys\\gfx\\defaulticon.bmp';

describe.skipIf(!existsSync(MOD))('script2: ScriptHost methods of interface / world / returns', () => {
	let now = 0;
	let errors: string[] = [];
	let self: Tunit;

	/** Runs script lines as event "test" of unit 7 (p_env_class=unit, p_env_id=7). */
	function run(...lines: string[]): void {
		parse_task(Cclass_unit, 7, 'test', '', 'on:test {' + SEP + lines.join(SEP) + SEP + '}' + SEP);
		RT.script.parse_all();
	}
	/** Runs the lines in the script of another entity. */
	function runAs(cls: number, id: number, ...lines: string[]): void {
		parse_task(cls, id, 'test', '', 'on:test {' + SEP + lines.join(SEP) + SEP + '}' + SEP);
		RT.script.parse_all();
	}
	/** $r=<expr>; and the value of r. */
	function val(expr: string): string {
		run('$r="unset";', '$r=' + expr + ';');
		return var_get('r');
	}
	/** The parse errors of one line (a parse error ends the script). */
	function err(line: string): string[] {
		errors = [];
		run(line);
		const e = errors;
		errors = [];
		return e;
	}
	function pivotAt(x: number, y: number, z: number): BBEntity {
		const p = CreatePivot();
		PositionEntity(p, x, y, z);
		return p;
	}
	/** parent_h of parentchild.bb for the entities the tests create. */
	function mockParentH() {
		return vi.spyOn(parentchild, 'parent_h').mockImplementation((cls: number, id: number) => {
			const list = cls === Cclass_object ? Tobject : cls === Cclass_unit ? Tunit : cls === Cclass_item ? Titem : cls === 4 ? Tinfo : null;
			if (!list) return null;
			for (const e of Each(list as typeof Tunit)) if (e.id === id) return e.h;
			return null;
		});
	}
	/** p_add of particles.bb: a new Tp with a pivot, TCp set, arguments recorded. */
	function mockPAdd() {
		return vi.spyOn(particles, 'p_add').mockImplementation(() => {
			G.TCp = New(Tp);
			G.TCp.h = CreatePivot();
		});
	}

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		errors = [];
		const parse_error = RT.script.parse_error.bind(RT.script);
		vi.spyOn(RT.script, 'parse_error').mockImplementation((id: string, param?: string | number) => {
			errors.push(param === undefined ? id : id + ':' + param);
			return parse_error(id, param as never);
		});
		self = New(Tunit);
		self.id = 7;
		self.typ = 1;
		G.m_section = Csection_game_sp;
		G.m_menu = 0;
		G.ms = 4242;
		G.gt = 9000;
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

	it('provides every Host method of interface.ts, world.ts and returns.ts, and every host command reaches one', () => {
		const used = new Set<string>();
		for (const c of [...cmdInterface, ...cmdWorld, ...cmdReturns]) {
			for (const m of c.run.toString().matchAll(/P\.host\.([A-Za-z_0-9]+)/g)) used.add(m[1]);
		}
		// seq() and the shared readers of world.ts
		for (const m of ['seq_addevent', 'parent_h']) used.add(m);
		const core = ['con_add', 'con_info', 'parent_con', 'entities', 'entity_typ', 'g_player'];
		const missing = [...used].filter((m) => !core.includes(m) && !(m in script2));
		expect(missing).toEqual([]);
		expect(Object.keys(script2).length).toBe(137);
	});

	// ------------------------------------------------------------------ Interface

	it('closemenu / map: only outside the main menu', () => {
		G.m_menu = 5;
		G.in_pc_menu = 3;
		run('closemenu;');
		expect([G.m_menu, G.in_pc_menu]).toEqual([0, 0]);
		run('map;');
		expect(G.m_menu).toBe(Cmenu_if_map);
		G.m_section = Csection_menu;
		G.m_menu = 5;
		G.in_pc_menu = 3;
		run('closemenu;', 'map;');
		expect([G.m_menu, G.in_pc_menu]).toEqual([5, 3]);
	});

	it('equip: type range check, or the quick slot in the item menu', () => {
		const use = vi.spyOn(game_functions, 'game_useasweapon').mockImplementation(() => 0);
		const quick = vi.spyOn(interface_, 'if_quickslot').mockImplementation(() => 0);
		run('equip 1;', 'equip 0;', 'equip ' + (G.Citem_count + 1) + ';', 'equip ' + G.Citem_count + ';');
		expect(use.mock.calls).toEqual([[1], [G.Citem_count]]);
		run('equip;');
		expect(quick).not.toHaveBeenCalled();
		G.m_menu = Cmenu_if_items;
		run('equip;');
		expect(quick).toHaveBeenCalledWith();
	});

	it('msg: colour outside 0..6 becomes 0, default time 3000', () => {
		const if_msg = vi.spyOn(interface_, 'if_msg').mockImplementation(() => {});
		run('msg "Hi";', 'msg "A",7,500;', 'msg "B",6;', 'msg "C",-1;');
		expect(if_msg.mock.calls).toEqual([
			['Hi', 0, 3000],
			['A', 0, 500],
			['B', 6, 3000],
			['C', 0, 3000]
		]);
	});

	it('msgbox: buffer as source, buttons freed, close block; msg_extend / msg_replace', () => {
		G.in_sb[2] = 1;
		G.in_sb[9] = 1;
		G.pv_buffer = 'line1';
		run('msgbox "Title";');
		expect(G.in_msgtitle).toBe('Title');
		expect(G.in_msgtext).toBe('line1');
		expect(G.pv_buffer).toBe('');
		expect(G.m_menu).toBe(Cmenu_if_msg);
		expect(G.in_sb.slice(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		expect(G.in_blockclose).toBe(4242);
		G.pv_buffer = 'more';
		run('msg_extend;');
		expect(G.in_msgtext).toBe('line1' + SEP + 'more');
		run('msg_replace "line","LINE";');
		expect(G.in_msgtext).toBe('LINE1' + SEP + 'more');
	});

	it('msgbox with an unresolvable source: error, title replaced, text and menu kept, buttons still freed', () => {
		G.in_msgtext = 'old';
		G.in_sb[1] = 1;
		G.in_blockclose = 0;
		run('msgbox "T2",999;');
		expect(errors).toEqual(['txtsource:999']);
		expect(G.in_msgtitle).toBe('T2');
		expect(G.in_msgtext).toBe('old');
		expect(G.m_menu).toBe(0);
		expect(G.in_sb[1]).toBe(0);
		expect(G.in_blockclose).toBe(4242);
	});

	it('msgbox takes the first Tx of an info as source, in the main menu without opening the box', () => {
		const tx = New(Tx);
		tx.parent_class = 4;
		tx.parent_id = 12;
		tx.value = 'from info';
		G.m_section = Csection_menu;
		G.m_menu = 0;
		run('msgbox "T",12;');
		expect(G.in_msgtext).toBe('from info');
		expect(G.m_menu).toBe(0);
	});

	it('msgwin / imagewin open deferred; decisionwin / inputwin give the cancel result', async () => {
		const gui_msg = vi.spyOn(gui, 'gui_msg').mockImplementation(async () => {});
		const gui_win_image = vi.spyOn(gui, 'gui_win_image').mockImplementation(async () => 0);
		const decide = vi.spyOn(gui, 'gui_msgdecide').mockImplementation(async () => 1);
		const input = vi.spyOn(gui, 'gui_msginput').mockImplementation(async () => 'typed');
		run('msgwin "Hello",2,"gfx\\a.bmp";', 'imagewin "gfx\\b.bmp";');
		expect(gui_msg).not.toHaveBeenCalled();
		expect(hasDeferred()).toBe(true);
		await runDeferred();
		expect(gui_msg.mock.calls).toEqual([['Hello', 2, 'gfx\\a.bmp']]);
		expect(gui_win_image.mock.calls).toEqual([['gfx\\b.bmp']]);
		expect(val('decisionwin("Sure?",1,"No","Yes")')).toBe('0');
		expect(script2.gui_msginput!(RT.script, 'Name?', 0, '', '', '')).toBe('');
		await runDeferred();
		expect(decide.mock.calls).toEqual([['Sure?', 1, 'No', 'Yes', '']]);
		expect(input.mock.calls).toEqual([['Name?', 0, '', '', '']]);
	});

	it('button: icon number, script from the buffer, image path that cannot be loaded gives Cicon_ok', () => {
		G.pv_buffer = 'scr';
		run('button 3,"Go",5;');
		expect([G.in_sb[3], G.in_sb_icon[3], G.in_sb_txt[3], G.in_sb_scr[3], G.in_sb_handle[3]]).toEqual([1, 5, 'Go', 'scr', 0]);
		expect(G.pv_buffer).toBe('');
		run('button 4,"Def";');
		expect([G.in_sb[4], G.in_sb_icon[4], G.in_sb_scr[4]]).toEqual([1, Cicon_ok, '']);
		// Len(frame$)>2: load_res(frame$,Cres_image,1); 0 -> Cicon_ok
		run('button 5,"Img","gfx\\nothere.bmp";');
		expect([G.in_sb_icon[5], G.in_sb_handle[5]]).toEqual([Cicon_ok, 0]);
		// an unresolvable source: error, but the button is still set up and keeps its old script
		G.in_sb_scr[3] = 'keep';
		run('button 3,"Again",2,999;');
		expect(errors).toEqual(['txtsource:999']);
		expect([G.in_sb_txt[3], G.in_sb_icon[3], G.in_sb_scr[3]]).toEqual(['Again', 2, 'keep']);
		expect(err('button 10,"X";')[0]).toBe('Button ID between 0 and 9 expected!');
	});

	it('exchange: self or class,id; type list as |a|b|; nothing for a missing entity', () => {
		const ex = vi.spyOn(interface_, 'if_exchange').mockImplementation(() => 0);
		const o = New(Tobject);
		o.id = 4;
		run('exchange "self";');
		expect(ex.mock.calls[0]).toEqual([Cclass_unit, 7, 1, '']);
		expect(G.in_blockclose).toBe(4242);
		run('exchange "object",4,0,10,11;');
		expect(ex.mock.calls[1]).toEqual([Cclass_object, 4, 0, '|10|11|']);
		G.in_blockclose = 0;
		run('exchange "object",5;');
		expect(ex).toHaveBeenCalledTimes(2);
		expect(G.in_blockclose).toBe(0);
		expect(errors).toEqual([]);
	});

	it('selectplace and its coordinates', () => {
		G.pc_sp_x = 3;
		run('selectplace "Where?",50.5;');
		expect([G.pc_sp_txt, G.pc_sp_height, G.pc_sp_x, G.pc_sp_y, G.pc_sp_z, G.pc_sp_class, G.pc_sp_id]).toEqual(['Where?', 50.5, 0, 0, 0, Cclass_unit, 7]);
		expect(G.m_menu).toBe(Cmenu_if_selplace);
		expect(G.in_blockclose).toBe(4242);
		run('selectplace "W";');
		expect(G.pc_sp_height).toBe(100);
		G.pc_sp_x = f32(1.5);
		G.pc_sp_y = -2;
		G.pc_sp_z = f32(0.1);
		expect([val('selectplace_x()'), val('selectplace_y()'), val('selectplace_z()')]).toEqual(['1.5', '-2.0', '0.1']);
	});

	it('process: starts the custom process and remembers an open menu', () => {
		G.m_menu = 2;
		G.in_mx = 100;
		G.in_my = 50;
		run('process "Working",1500,"done";');
		expect([G.in_pc_custom, G.in_pc_customt, G.in_pc_event]).toEqual(['Working', 1500, 'done']);
		expect([G.pc_typ, G.pc_gt, G.in_focus]).toEqual([Cstate_pc_custom, 9000, Cstate_pc_custom]);
		expect([G.in_pc_menu, G.in_pc_menu_x, G.in_pc_menu_y, G.m_menu]).toEqual([2, 100, 50, 0]);
		run('process "W2";');
		expect([G.in_pc_customt, G.in_pc_event, G.in_pc_menu]).toEqual([5000, '', 0]);
	});

	it('cracklock', () => {
		run('cracklock "Lock",2,"lrlr";');
		expect([G.pl_cl_title, G.pc_cl_mode, G.pc_cl_code, G.pc_cl_class, G.pc_cl_id, G.pc_cl_pos]).toEqual(['Lock', 2, 'lrlr', Cclass_unit, 7, 1]);
		expect(G.m_menu).toBe(Cmenu_if_cracklock);
		expect(G.in_blockclose).toBe(4242);
	});

	it('text: defaults (align -1 without a position, 1 with one) and the id range', () => {
		run('text 2,"hello";');
		expect([G.in_sitxt[2], G.in_sitxt_txt[2], G.in_sitxt_font[2], G.in_sitxt_align[2], G.in_sitxt_x[2], G.in_sitxt_y[2]]).toEqual([1, 'hello', 0, -1, 0, 0]);
		run('text 19,"t",3,10,20;');
		expect([G.in_sitxt_font[19], G.in_sitxt_align[19], G.in_sitxt_x[19], G.in_sitxt_y[19]]).toEqual([3, 1, 10, 20]);
		run('text 0,"t",1,5,6,2;');
		expect(G.in_sitxt_align[0]).toBe(2);
		expect(err('text 20,"t";')[0]).toBe('Interface Text ID between 0 and 19 expected!');
		// freetext: "id<19"
		run('freetext 2;');
		expect(G.in_sitxt[2]).toBe(0);
		expect(err('freetext 19;')).toEqual(['Interface Text ID between 0 and 19 expected!']);
		expect(G.in_sitxt[19]).toBe(1);
	});

	it('image: an empty path only frees the slot and resets the mask; id 39 is rejected', async () => {
		await RT.world.preload([IMG]);
		G.in_siimg_x[3] = 77;
		G.in_siimg_mask[3] = 0;
		run('image 3,"";');
		expect([G.in_siimg[3], G.in_siimg_mask[3], G.in_siimg_x[3]]).toEqual([0, 1, 77]);
		run('image 4,"' + IMG + '",11,12,0;');
		expect(G.in_siimg[4]).not.toBe(0);
		expect([G.in_siimg_x[4], G.in_siimg_y[4], G.in_siimg_mask[4]]).toEqual([11, 12, 0]);
		const img = G.in_siimg[4];
		run('image 4,"";');
		expect(G.in_siimg[4]).toBe(0);
		expect(img !== 0 && img.freed).toBe(true);
		expect(err('image 39,"";')[0]).toBe('Interface Image ID between 0 and 39 expected!');
		// load_image raises like the original when the file cannot be loaded
		expect(() => run('image 5,"gfx\\nothere.bmp",1,1;')).toThrow('Unable to load Image');
	});

	it('menu returns m_menu', () => {
		G.m_menu = 14;
		expect(val('menu()')).toBe('14');
	});

	it('cscr, cscr_text, cscr_image', async () => {
		await RT.world.preload([IMG]);
		const old = New(Tcscr);
		old.typ = 1;
		G.m_section = Csection_menu; // no m_section test in cscr
		run('cscr;');
		expect(Tcscr.list.count).toBe(0);
		expect([G.in_clickscreenx, G.in_clickscreenimage, G.m_menu]).toEqual([1, 0, Cmenu_if_clickscreen]);
		run('cscr "' + IMG + '",0;');
		expect(G.in_clickscreenx).toBe(0);
		expect(G.in_clickscreenimage).not.toBe(0);
		G.pv_buffer = 'ev';
		run('cscr_text "Click",10,20;');
		const t = First(Tcscr)!;
		expect([t.typ, t.txt, t.x, t.y, t.col, t.align, t.tooltip, t.event]).toEqual([1, 'Click', 10, 20, -1, 0, '', 'ev']);
		expect(G.pv_buffer).toBe('');
		run('cscr_image "' + IMG + '",1,2,"tip";');
		const all = [...Each(Tcscr)];
		expect(all.length).toBe(2);
		expect([all[1].typ, all[1].x, all[1].y, all[1].tooltip, all[1].event]).toEqual([2, 1, 2, 'tip', '']);
		expect(all[1].image).not.toBe(0);
		// a new click screen frees the images and the elements
		const csimg = G.in_clickscreenimage;
		run('cscr;');
		expect(Tcscr.list.count).toBe(0);
		expect(csimg !== 0 && csimg.freed).toBe(true);
		expect(G.in_clickscreenimage).toBe(0);
	});

	it('savemapimage: genmap(size), and back to 256', () => {
		const genmap = vi.spyOn(functions, 'genmap').mockImplementation(() => {});
		run('savemapimage "map.bmp",128;');
		expect(genmap.mock.calls).toEqual([[128], [256]]);
		run('savemapimage "map.bmp";');
		expect(genmap.mock.calls.slice(2)).toEqual([[256]]);
	});

	it('lockcombi / lockcombis work on the combination definitions', () => {
		const ids = [...Each(Tcom)].filter((c) => c.mode === 2).map((c) => c.aid);
		expect(ids.length).toBeGreaterThan(0);
		const known = ids.find((a) => a !== '')!;
		run('lockcombi "' + known + '";', 'lockcombi "' + known + '";', 'lockcombi "no such combination";');
		expect([...Each(Tx)].filter((x) => x.mode === 50).map((x) => x.key)).toEqual([known]);
		run('lockcombis;');
		expect([...Each(Tx)].filter((x) => x.mode === 50).map((x) => x.key)).toEqual(ids);
		expect(val('locked("' + known + '")')).toBe('1');
		run('unlockcombis;');
		expect([...Each(Tx)].filter((x) => x.mode === 50)).toEqual([]);
	});

	// ------------------------------------------------------------------ Diary

	it('diary: entry from the buffer, diary menu, selection, sound and message', () => {
		const if_msg = vi.spyOn(interface_, 'if_msg').mockImplementation(() => {});
		const center = vi.spyOn(interface_, 'if_centerpos').mockImplementation(() => {});
		const sfx = vi.spyOn(RT.audio, 'sfx');
		for (let i = 0; i < 5; i++) {
			const e = New(Tx);
			e.mode = 2;
			e.key = 'old' + i;
		}
		G.pv_buffer = 'Dear diary';
		G.in_scr_scr2 = 9;
		run('diary "Day 1";');
		const e = [...Each(Tx)].filter((x) => x.mode === 2);
		expect(e.length).toBe(6);
		expect([e[5].key, e[5].value]).toEqual(['Day 1', 'Dear diary']);
		expect(G.m_menu).toBe(Cmenu_if_diary);
		expect([G.in_opt[0], G.in_scr_scr, G.in_scr_scr2]).toEqual([6, 2, 0]);
		expect(center).toHaveBeenCalledTimes(1);
		expect(sfx).toHaveBeenCalledWith(G.sfx_diary);
		expect(if_msg.mock.calls).toEqual([[sm(182), Cbmpf_yellow]]);
		expect(G.in_blockclose).toBe(4242);
	});

	it('diary during a sequence (m_menu>=Cmenu_if_movie): entry, sound and message, but no menu change', () => {
		vi.spyOn(interface_, 'if_msg').mockImplementation(() => {});
		const center = vi.spyOn(interface_, 'if_centerpos').mockImplementation(() => {});
		G.m_menu = Cmenu_if_movie;
		G.in_opt[0] = 3;
		G.pv_buffer = 'x';
		run('diary "E";');
		expect(G.m_menu).toBe(Cmenu_if_movie);
		expect(G.in_opt[0]).toBe(3);
		expect(center).not.toHaveBeenCalled();
		expect([...Each(Tx)].filter((x) => x.mode === 2).length).toBe(1);
	});

	it('showentry: selects the entry; sfx parameter; "<>" movie test', () => {
		vi.spyOn(interface_, 'if_centerpos').mockImplementation(() => {});
		const sfx = vi.spyOn(RT.audio, 'sfx');
		for (const k of ['a', 'b', 'c']) {
			const e = New(Tx);
			e.mode = 2;
			e.key = k;
		}
		G.in_scr_scr = 5;
		run('showentry "b",0;');
		expect([G.m_menu, G.in_opt[0], G.in_scr_scr]).toEqual([Cmenu_if_diary, 2, 0]);
		expect(sfx).not.toHaveBeenCalled();
		run('showentry "zzz";');
		expect(G.in_opt[0]).toBe(0);
		expect(sfx).toHaveBeenCalledWith(G.sfx_diary);
		// a menu above Cmenu_if_movie is replaced here (diary keeps it)
		G.m_menu = Cmenu_if_movie + 1;
		run('showentry "a";');
		expect(G.m_menu).toBe(Cmenu_if_diary);
	});

	it('setday / sethour / setminute: Abs, out of range becomes 0, light update', () => {
		const light = vi.spyOn(e_environment, 'e_environment_update_light').mockImplementation(() => {});
		run('setday -3;', 'sethour 23;', 'setminute 59;');
		expect([G.map_day, G.map_hour, G.map_minute]).toEqual([3, 23, 59]);
		run('sethour 24;', 'setminute -60;');
		expect([G.map_hour, G.map_minute]).toEqual([0, 0]);
		expect(light).toHaveBeenCalledTimes(4);
		expect([val('day()'), val('hour()'), val('minute()')]).toEqual(['3', '0', '0']);
	});

	// ------------------------------------------------------------------ Indicators, infos

	it('indicators: single and all, look and info text', () => {
		const vts = vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
		const a = New(Tinfo);
		a.id = 5;
		a.typ = 36;
		a.ints[1] = 1;
		const b = New(Tinfo);
		b.id = 6;
		b.typ = 36;
		const other = New(Tinfo);
		other.id = 8;
		other.typ = 10;
		other.ints[1] = 5;
		run('hideindicator 5;');
		expect(a.ints[1]).toBe(0);
		expect(G.TCinfo).toBe(a);
		run('showindicator 5;');
		expect(a.ints[1]).toBe(1);
		expect([...err('hideindicator 8;'), ...err('showindicator 99;')]).toEqual(['infotype:36', 'object:99']);
		expect(other.ints[1]).toBe(5);
		run('showindicators;');
		expect([a.ints[1], b.ints[1], other.ints[1]]).toEqual([1, 1, 5]);
		expect(G.TCinfo).toBeNull(); // the loop variable is the global
		run('hideindicators;');
		expect([a.ints[1], b.ints[1], other.ints[1]]).toEqual([0, 0, 5]);
		a.ints[0] = 77;
		run('setindicatorlook 5,3;');
		expect(a.ints[0]).toBe(10);
		run('setindicatorlook 5,1;');
		expect(a.ints[0]).toBe(0);
		run('setindicatorlook 5,2;');
		expect(a.ints[0]).toBe(9);
		run('setindicatorlook 5,4;');
		expect(a.ints[0]).toBe(11);
		run('setindicatorlook 5,7;');
		expect(a.ints[0]).toBe(11);
		run('setindicatorinfo 5,"Here";');
		expect(a.strings[0]).toBe('Here');
		expect(vts).toHaveBeenCalledTimes(2 + 2 + 2 + 5 + 1);
	});

	it('triggers: floats[1] of any info; all triggers are typ 10..29', () => {
		vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
		const t = New(Tinfo);
		t.id = 3;
		t.typ = 10;
		t.floats[1] = 1;
		const t2 = New(Tinfo);
		t2.id = 4;
		t2.typ = 29;
		t2.floats[1] = 1;
		const n = New(Tinfo);
		n.id = 5;
		n.typ = 30;
		n.floats[1] = 1;
		run('stoptrigger 5;');
		expect(n.floats[1]).toBe(0); // quirk: the type is not checked
		run('starttrigger 5;', 'stoptriggers;');
		expect([t.floats[1], t2.floats[1], n.floats[1]]).toEqual([0, 0, 1]);
		run('starttriggers;');
		expect([t.floats[1], t2.floats[1]]).toEqual([1, 1]);
		runAs(4, 3, 'stoptrigger "self";');
		expect(t.floats[1]).toBe(0);
		expect(err('stoptrigger 77;')).toEqual(['object:77']);
	});

	it('trigger: info_spawncontrol(TCinfo,1) and the event cached for class unit (sic)', () => {
		const sc = vi.spyOn(handle_infos, 'info_spawncontrol').mockImplementation(() => {});
		const cache = vi.spyOn(RT.script, 'set_parsecache');
		const t = New(Tinfo);
		t.id = 3;
		t.typ = 45;
		run('trigger 3;');
		expect(sc.mock.calls).toEqual([[t, 1]]);
		expect(cache).toHaveBeenCalledWith(Cclass_unit, 3, 'trigger', 'triggered by trigger command');
	});

	it('info_sprite / info_loudspeaker / info_spawncontrol write the info variables', () => {
		const vts = vi.spyOn(handle_infos, 'info_vts').mockImplementation(() => {});
		const sprite = vi.spyOn(handle_infos, 'info_setupsprite').mockImplementation(() => {});
		const loud = vi.spyOn(handle_infos, 'info_setuploudspeaker').mockImplementation(() => {});
		const s = New(Tinfo);
		s.id = 1;
		s.typ = 5;
		s.strings[0] = 'old.bmp';
		const l = New(Tinfo);
		l.id = 2;
		l.typ = 47;
		l.floats[0] = 9;
		l.strings[0] = 'old.wav';
		const c = New(Tinfo);
		c.id = 3;
		c.typ = 45;
		run('info_sprite 1,"self",2,3.5,10,20,30,0.5,3,1;');
		expect(s.strings).toEqual(['old.bmp', '3', '1']);
		expect(s.floats).toEqual([2, 3.5, 0.5]);
		expect(s.ints).toEqual([10, 20, 30]);
		expect(sprite).toHaveBeenCalledWith(s);
		// quirk: without a file the file name becomes ""
		run('info_sprite 1;');
		expect(s.strings).toEqual(['', '0', '0']);
		expect(s.floats).toEqual([1, 1, 1]);
		expect(s.ints).toEqual([255, 255, 255]);
		run('info_loudspeaker 2,"self";');
		expect([l.strings[0], l.floats[0]]).toEqual(['old.wav', 9]);
		run('info_loudspeaker 2,"new.wav",120;');
		expect([l.strings[0], l.floats[0]]).toEqual(['new.wav', 120]);
		expect(loud).toHaveBeenCalledTimes(2);
		run('info_spawncontrol 3,150.5,"unit",9,2,4,3;');
		expect(c.floats[0]).toBe(150.5);
		expect(c.ints).toEqual([Cclass_unit, 9, 4]);
		expect(c.strings.slice(0, 2)).toEqual(['2', '3']);
		expect(vts).toHaveBeenCalledTimes(5);
		expect([...err('info_sprite 2;'), ...err('info_loudspeaker 1,"x";'), ...err('info_spawncontrol 1,1,"unit",1,1,1,1;'), ...err('info_sprite 99;')]).toEqual(["'info_sprite' expects a sprite info", "'info_loudspeaker' expects a loudspeaker info", "'info_spawncontrol' expects a spawncontrol info"]);
	});

	// ------------------------------------------------------------------ Buildings

	it('lockbuildings, builtat, buildsetup', () => {
		const ids = [...Each(Tbui)].filter((b) => b.mode === 2).map((b) => String(b.id));
		expect(ids.length).toBeGreaterThan(0);
		run('lockbuilding 4711;', 'lockbuildings;');
		expect([...Each(Tx)].filter((x) => x.mode === 3).map((x) => x.key)).toEqual(ids);
		expect(val('locked(' + ids[0] + ')')).toBe('1');

		const st = New(Tstate);
		st.typ = Cstate_link;
		st.value = 7;
		st.parent_id = 31;
		expect(val('builtat("self")')).toBe('31');
		expect(val('builtat(8)')).toBe('0');

		const start = vi.spyOn(game_build, 'game_buildsetup_start').mockImplementation(() => {});
		run('buildsetup 12,2.5;', 'buildsetup 13,3.5;', 'buildsetup 14;');
		// changeh is an Int parameter: 2.5 -> 2, 3.5 -> 4 (round to even)
		expect(start.mock.calls).toEqual([
			[12, 2],
			[13, 4],
			[14, 0]
		]);
		expect(G.tmp_y).toBe(0);
	});

	// ------------------------------------------------------------------ Sequences

	it('sequence commands: the game functions read their parameters themselves', () => {
		const got: unknown[] = [];
		const start = vi.spyOn(game_sequences, 'seq_start').mockImplementation(() => {
			if (RT.script.parse_param()) {
				got.push('start', RT.script.param());
				if (RT.script.parse_comma(0)) got.push(RT.script.param());
			}
		});
		const add = vi.spyOn(game_sequences, 'seq_addevent').mockImplementation((event: string) => {
			got.push(event, RT.script.param());
			while (RT.script.parse_comma(0)) got.push(RT.script.param());
		});
		run('seqstart 0,1;', 'seqmsg 100,"Hi",2;', 'hidbar 5;', 'mc 1,2,3;', 'seqend 900;', '$after=1;');
		expect(start).toHaveBeenCalledTimes(1);
		expect(add.mock.calls.map((c) => c[0])).toEqual(['msg', 'hidebar', 'movecam', 'end']);
		expect(got).toEqual(['start', '0', '1', 'msg', '100', 'Hi', '2', 'hidebar', '5', 'movecam', '1', '2', '3', 'end', '900']);
		expect(errors).toEqual([]);
		expect(var_get('after')).toBe('1');
	});

	it('seqtimemode: 0 becomes 1, negative becomes positive, absolute flag', () => {
		run('seqtimemode -5;');
		expect([G.seq_tmod, G.seq_tabs]).toEqual([5, 1]);
		run('seqtimemode 0,0;');
		expect([G.seq_tmod, G.seq_tabs]).toEqual([1, 0]);
	});

	// ------------------------------------------------------------------ Effects

	it('flash: a flash particle, coloured', () => {
		const p_add = mockPAdd();
		const color = vi.spyOn(bb3d, 'EntityColor');
		run('flash 10,20,30;');
		expect(p_add.mock.calls[0]).toEqual([0, 0, 0, Cp_flash, f32(0.05), f32(1.1)]);
		run('flash 1,2,3,0.5,0.25;');
		expect(p_add.mock.calls[1]).toEqual([0, 0, 0, Cp_flash, 0.5, 0.25]);
		expect(color.mock.calls.map((c) => c.slice(1))).toEqual([
			[10, 20, 30],
			[1, 2, 3]
		]);
		expect(color.mock.calls[1][0]).toBe(G.TCp!.h);
	});

	it('corona: 10+set_effects*10 spawn particles from the shared random generator', () => {
		const p_add = mockPAdd();
		const parent = vi.spyOn(particles, 'p_parent').mockImplementation(() => {});
		const color = vi.spyOn(bb3d, 'EntityColor');
		G.set_effects = 1;
		G.ter = null;
		G.ter_groundy = 0;
		const y = e_environment.e_tery(100, 200);
		SeedRnd(77);
		run('corona 100,200;');
		expect(p_add).toHaveBeenCalledTimes(20);
		SeedRnd(77);
		for (let i = 0; i < 20; i++) {
			// exe: arguments evaluated size, alpha, z, y, x
			const size = Rnd(3, 6);
			const alpha = Rnd(0.5, 2);
			const pz = f32(200 + Rnd(-20, 20));
			const py = f32(y + Rnd(-5, 5));
			const px = f32(100 + Rnd(-20, 20));
			const expected = [px, py, pz, Cp_spawn, size, alpha];
			expect(p_add.mock.calls[i]).toEqual(expected);
		}
		expect(G.TCp!.fx).toBe(1);
		expect(color).not.toHaveBeenCalled();
		expect(parent).not.toHaveBeenCalled();

		G.set_effects = 0;
		p_add.mockClear();
		run('corona 1,2,5,255,128,0,2.5,"self";');
		expect(p_add).toHaveBeenCalledTimes(10);
		expect(color).toHaveBeenCalledTimes(10);
		expect(color.mock.calls[0].slice(1)).toEqual([255, 128, 0]);
		expect(G.TCp!.fx).toBe(2.5);
		expect(parent).toHaveBeenCalledTimes(10);
		expect(parent.mock.calls[9]).toEqual([7, G.TCp]);
	});

	it('thunder: one of three sounds and a white, additive flash', () => {
		const p_add = mockPAdd();
		const sfx = vi.spyOn(RT.audio, 'sfx');
		const blend = vi.spyOn(bb3d, 'EntityBlend');
		G.sfx_thunder = [11, 12, 13];
		SeedRnd(5);
		run('thunder;');
		expect([11, 12, 13]).toContain(sfx.mock.calls[0][0]);
		expect(p_add.mock.calls[0].slice(0, 4)).toEqual([0, 0, 0, Cp_flash]);
		const speed = p_add.mock.calls[0][4] as number;
		expect(speed).toBeGreaterThanOrEqual(f32(0.1));
		expect(speed).toBeLessThanOrEqual(f32(0.3));
		expect(blend).toHaveBeenCalledWith(G.TCp!.h, 3);
	});

	it('explosion: defaults 50, 50, 1', () => {
		const ex = vi.spyOn(game_functions, 'game_explosion').mockImplementation(() => {});
		run('explosion 1,2,3;', 'explode 1.5,2,3,80,12.5,2;');
		expect(ex.mock.calls).toEqual([
			[1, 2, 3, 50, 50, 1],
			[1.5, 2, 3, 80, 12.5, 2]
		]);
	});

	it('blur is clamped to 0..Cpeakblur', () => {
		run('blur 0.5;');
		expect(G.in_scriptblur).toBe(0.5);
		run('blur 2;');
		expect(G.in_scriptblur).toBe(Cpeakblur);
		run('blur -1;');
		expect(G.in_scriptblur).toBe(0);
	});

	it('vomit: 15 splatter particles at the eyes of the unit', () => {
		const p_add = mockPAdd();
		self.h = pivotAt(10, 20, 30);
		vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
			if (id !== 7) return 0;
			G.TCunit = self;
			return 1;
		});
		SeedRnd(9);
		run('vomit "self";');
		expect(p_add).toHaveBeenCalledTimes(15);
		SeedRnd(9);
		// exe: arguments evaluated z, size, alpha, y, x
		const pz = f32(30 + Rnd(-5, 5));
		const size = Rnd(4, 5);
		const alpha = Rnd(f32(0.9), 3);
		const py = f32(f32(20 + Rnd(-5, 5)) + Dunit_eyes(1));
		const px = f32(10 + Rnd(-5, 5));
		const first = [px, py, pz, Cp_subsplatter, size, alpha];
		expect(p_add.mock.calls[0]).toEqual(first);
		const r = Rnd(50, 150);
		const g = f32(r + Rnd(0, 55));
		const p = First(Tp)!;
		expect([p.frame, p.r, p.g, p.b]).toEqual([2, r, g, 0]);
		p_add.mockClear();
		run('vomit 8;');
		expect(p_add).not.toHaveBeenCalled();
	});

	it('particle needs size AND alpha; particlec colours the last particle', () => {
		const p_add = mockPAdd();
		const color = vi.spyOn(bb3d, 'EntityColor');
		run('particlec 1,2,3;');
		expect(color).not.toHaveBeenCalled();
		run('particle 1,2,3,20;', 'particle 1,2,3,20,4;');
		expect(p_add).not.toHaveBeenCalled();
		run('particle 1,2,3,20,4,0.5;');
		expect(p_add.mock.calls).toEqual([[1, 2, 3, 20, 4, 0.5]]);
		run('particlec 1,2,3;');
		expect(color).toHaveBeenCalledWith(G.TCp!.h, 1, 2, 3);
	});

	// ------------------------------------------------------------------ Sounds

	it('play, stopsounds, music with fade, fademusic, musicvolume, stopmusic', () => {
		const play = vi.spyOn(RT.audio, 'sfx_play').mockImplementation(() => 0);
		const stop = vi.spyOn(RT.audio, 'stopsounds').mockImplementation(() => {});
		const music = vi.spyOn(RT.audio, 'sfx_music').mockImplementation(() => 0);
		run('play "a.wav";', 'play "b.wav",0.5,-1,2000;', 'stopsounds;');
		expect(play.mock.calls).toEqual([
			['a.wav', 1, 0, 0],
			['b.wav', 0.5, -1, 2000]
		]);
		expect(stop).toHaveBeenCalledTimes(1);
		G.mfx_fade = 0;
		run('music "m.mp3";');
		expect(music.mock.calls[0]).toEqual(['m.mp3', 1]);
		expect(G.mfx_fade).toBe(0);
		run('music "m.mp3",0.5,-2000;');
		expect(music.mock.calls[1]).toEqual(['m.mp3', 0.5]);
		expect([G.mfx_fade, G.mfx_fadestart, G.mfx_fadeend]).toEqual([1, 9000, 2000]);
		G.gt = 9500;
		run('fademusic -300;');
		expect([G.mfx_fade, G.mfx_fadestart, G.mfx_fadeend]).toEqual([-1, 9500, 300]);
		run('musicvolume 0.25;');
		expect([G.mfx_fade, G.mfx_peakvol]).toEqual([0, 0.25]);
		const free = vi.spyOn(RT.audio.bb, 'FreeSound').mockImplementation(() => {});
		G.mfx_file = 5;
		G.mfx_chan = 6;
		run('stopmusic;');
		expect(free).toHaveBeenCalledWith(5);
		expect([G.mfx_file, G.mfx_chan]).toEqual([0, 0]);
	});

	it('ambientsfx: stops and frees the old sound, loads sfx\\<file>; an empty name loads nothing', () => {
		const stop = vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {});
		const free = vi.spyOn(RT.audio.bb, 'FreeSound').mockImplementation(() => {});
		const load = vi.spyOn(RT.audio.bb, 'LoadSound').mockImplementation(() => 42);
		G.amb_chan = 3;
		G.amb_file = 4;
		run('ambientsfx "wind.wav";');
		expect(stop).toHaveBeenCalledWith(3);
		expect(free).toHaveBeenCalledWith(4);
		expect(load).toHaveBeenCalledWith('sfx\\wind.wav');
		expect([G.map_music, G.amb_file]).toEqual(['wind.wav', 42]);
		run('ambientsfx "";');
		expect(load).toHaveBeenCalledTimes(1);
		expect([G.map_music, G.amb_file]).toEqual(['', 42]); // stale handle kept
	});

	// ------------------------------------------------------------------ Model

	it('color / blend / alpha / fx / shininess on self or on class,id; error without a model', () => {
		const ph = mockParentH();
		const color = vi.spyOn(bb3d, 'EntityColor').mockImplementation(() => {});
		const blend = vi.spyOn(bb3d, 'EntityBlend').mockImplementation(() => {});
		const alpha = vi.spyOn(bb3d, 'EntityAlpha').mockImplementation(() => {});
		const fx = vi.spyOn(bb3d, 'EntityFX').mockImplementation(() => {});
		const shin = vi.spyOn(bb3d, 'EntityShininess').mockImplementation(() => {});
		const alpha_object = vi.spyOn(handle_objects, 'alpha_object').mockImplementation(() => 0);
		self.h = pivotAt(0, 0, 0);
		const o = New(Tobject);
		o.id = 4;
		o.h = pivotAt(1, 1, 1);
		run('color 1,2,3;', 'blend 3,"object",4;', 'alpha 0.5,"object",4;', 'fx 16;', 'shininess 0.75;');
		expect(color.mock.calls).toEqual([[self.h, 1, 2, 3]]);
		expect(blend.mock.calls).toEqual([[o.h, 3]]);
		expect(alpha.mock.calls).toEqual([[o.h, 0.5]]);
		expect(fx.mock.calls).toEqual([[self.h, 16]]);
		expect(shin.mock.calls).toEqual([[self.h, 0.75]]);
		expect(ph).toHaveBeenCalledWith(Cclass_unit, 7, 1);
		// alpha_object keys on p_env_class, not on the target
		expect(alpha_object).not.toHaveBeenCalled();
		runAs(Cclass_object, 4, 'alpha 0.25,"unit",7;');
		expect(alpha.mock.calls[1]).toEqual([self.h, 0.25]);
		expect(alpha_object.mock.calls).toEqual([[4, 0.25]]);
		const all = ['color 1,2,3,"object",99;', 'blend 1,"self",7;', 'alpha 1,"object",99;', 'fx 1,"object",99;', 'shininess 1,"object",99;', 'texture "x.bmp","object",99;', 'scale 1,1,1,"object",99;', 'model "x.b3d","object",99;'].flatMap((l) => err(l));
		// an explicit "self" is not resolved (class -1); "texture" reports "fx"
		expect(all).toEqual(['model:color', 'model:blend', 'model:alpha', 'model:fx', 'model:shininess', 'model:fx', 'model:scale', 'model:model']);
	});

	it('scale: multiplied with the definition size; unit collision radius', () => {
		mockParentH();
		const scale = vi.spyOn(bb3d, 'ScaleEntity').mockImplementation(() => {});
		const radius = vi.spyOn(bb3d, 'EntityRadius').mockImplementation(() => {});
		const u = [...DEFS.units.byId.values()].find((d) => d.col > 0)!;
		self.typ = u.id;
		self.h = pivotAt(0, 0, 0);
		G.set_debug = 0;
		run('scale 2,3,0.5;');
		expect(radius.mock.calls).toEqual([[self.h, f32(u.colxr * 2), f32(u.colyr * 3)]]);
		expect(scale.mock.calls).toEqual([[self.h, f32(2 * Dunit_size(u.id, 0)), f32(3 * Dunit_size(u.id, 1)), f32(0.5 * Dunit_size(u.id, 2)), 1]]);
		// an item without a radius gets 5*sx (sx already multiplied with the definition size)
		const it0 = [...DEFS.items.byId.values()].find((d) => d.radius === 0)!;
		const item = New(Titem);
		item.id = 3;
		item.typ = it0.id;
		item.h = pivotAt(0, 0, 0);
		radius.mockClear();
		scale.mockClear();
		run('scale 2,2,2,"item",3;');
		expect(radius.mock.calls).toEqual([[item.h, f32(5 * f32(2 * it0.size[0]))]]);
		expect(scale).toHaveBeenCalledTimes(1);
		// the model command accepts objects and items only
		expect(err('model "x.b3d";')).toEqual(["'model' command needs to be executed at an object or item"]);
	});

	it('model: the object gets a copy of the new mesh at the old place', async () => {
		mockParentH();
		const def = [...DEFS.objects.byId.values()].find((o) => o.model.toLowerCase().endsWith('.b3d') && o.col === 1 && o.swayspeed === 0)!;
		await RT.world.preload([def.model]);
		const o = New(Tobject);
		o.id = 4;
		o.typ = def.id;
		o.h = pivotAt(5, 6, 7);
		RotateEntity(o.h, 0, 90, 0);
		const oldh = o.h;
		vi.spyOn(handle_objects, 'con_object').mockImplementation(() => {
			G.TCobject = o;
			return 1;
		});
		runAs(Cclass_object, 4, 'model "' + def.model + '";');
		expect(errors).toEqual([]);
		expect(o.h).not.toBe(oldh);
		expect([bb3d.EntityX(o.h), bb3d.EntityY(o.h), bb3d.EntityZ(o.h)]).toEqual([5, 6, 7]);
		expect(bb3d.EntityYaw(o.h)).toBeCloseTo(90, 3);
		expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([5, 6, 7]);
		expect(o.ch).toBeNull();
		// a mesh that cannot be loaded leaves everything alone
		const h2 = o.h;
		runAs(Cclass_object, 4, 'model "gfx\\nothere.b3d";');
		expect(o.h).toBe(h2);
	});

	// ------------------------------------------------------------------ States

	it('addstate: set_state for an existing parent, its result returned', () => {
		const set = vi.spyOn(handle_states, 'set_state').mockImplementation(() => 1);
		expect(val('addstate("self","fire")')).toBe('1');
		expect(set.mock.calls[0]).toEqual([RT.script.parse_getstate('fire'), Cclass_unit, 7]);
		expect(val('addstate("unit",99,"fire")')).toBe('0');
		expect(errors).toEqual(['object:99']);
		expect(set).toHaveBeenCalledTimes(1);
	});

	it('statecolor / statesize / statevalue / getstatevalue work on TCstate', () => {
		const look = vi.spyOn(handle_states, 'look_state').mockImplementation(() => {});
		const fire = RT.script.parse_getstate('fire');
		const other = New(Tstate);
		other.typ = fire;
		other.parent_class = Cclass_unit;
		other.parent_id = 8;
		const st = New(Tstate);
		st.typ = fire;
		st.parent_class = Cclass_unit;
		st.parent_id = 7;
		run('statecolor "self","fire",10,20,30;');
		expect([st.value_s, st.r, st.g, st.b]).toEqual(['10,20,30', 10, 20, 30]);
		expect(G.TCstate).toBe(st);
		expect(other.value_s).toBe('');
		// size# is a Float, the field an Int: round to nearest even
		run('statesize "unit",7,"fire",2.5;');
		expect(st.value).toBe(2);
		run('statesize "unit",7,"fire",3.5;');
		expect(st.value).toBe(4);
		expect(look).toHaveBeenCalledTimes(3);
		run('statevalue "self","fire",1.25;');
		expect(st.value_f).toBe(1.25);
		expect(look).toHaveBeenCalledTimes(3);
		expect(val('getstatevalue("self","fire")')).toBe('1.25');
		expect(val('getstatevalue("self","fire",1)')).toBe('4');
		expect(val('getstatevalue("self","fire",2)')).toBe('10');
		expect(val('getstatevalue("self","fire",3)')).toBe('20');
		expect(val('getstatevalue("self","fire",4)')).toBe('30');
		// no such state: the loop ran to its end, TCstate is Null
		run('statevalue "unit",9,"fire",1;');
		expect(G.TCstate).toBeNull();
		expect(val('gotstate("self","fire")')).toBe('1');
		expect(val('gotstate("unit",9,"fire")')).toBe('0');
		expect(val('count_state("fire")')).toBe('2');
	});

	it('areal_state: objects, units and lying items closer than the range', () => {
		const set = vi.spyOn(handle_states, 'set_state').mockImplementation(() => 1);
		const fire = RT.script.parse_getstate('fire');
		self.h = pivotAt(1000, 0, 0);
		const o1 = New(Tobject);
		o1.id = 1;
		o1.h = pivotAt(10, 0, 0);
		const o2 = New(Tobject);
		o2.id = 2;
		o2.h = pivotAt(50, 0, 0); // not "<range"
		const i1 = New(Titem);
		i1.id = 3;
		i1.parent_mode = Cpm_out;
		i1.h = pivotAt(0, 0, 49);
		const i2 = New(Titem);
		i2.id = 4;
		i2.parent_mode = Cpm_in;
		i2.h = pivotAt(0, 0, 0);
		run('areal_state "fire",0,0,0;');
		expect(set.mock.calls).toEqual([
			[fire, Cclass_object, 1],
			[fire, Cclass_item, 3]
		]);
		set.mockClear();
		run('areal_state "fire",0,0,0,2000;');
		expect(set.mock.calls.map((c) => c.slice(1))).toEqual([
			[Cclass_object, 1],
			[Cclass_object, 2],
			[Cclass_unit, 7],
			[Cclass_item, 3]
		]);
	});

	// ------------------------------------------------------------------ Free

	it('free: items with a count, particles, other classes, self', () => {
		const free_item = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 0);
		const ha_free = vi.spyOn(handle_all, 'ha_free').mockImplementation(() => {});
		run('free "item",5;', 'free "item",6,2;', 'free "object",9;', 'free "self";', 'free "nonsense";');
		expect(free_item.mock.calls).toEqual([
			[5, -1],
			[6, 2]
		]);
		expect(ha_free.mock.calls).toEqual([
			[Cclass_object, 9],
			[-1, -1]
		]);
		runAs(Cclass_item, 12, 'free "self",3;');
		expect(free_item.mock.calls[2]).toEqual([12, 3]);
		const p = New(Tp);
		p.h = CreatePivot();
		New(Tp);
		run('free "particles";');
		expect(Tp.list.count).toBe(0);
	});

	it('freestate: one state or all states of the parent', () => {
		const free = vi.spyOn(handle_states, 'free_state').mockImplementation(() => 0);
		const fire = RT.script.parse_getstate('fire');
		for (const [typ, id] of [
			[3, 7],
			[4, 7],
			[5, 8]
		]) {
			const s = New(Tstate);
			s.typ = typ;
			s.parent_class = Cclass_unit;
			s.parent_id = id;
		}
		run('freestate "self","fire";');
		expect(free.mock.calls).toEqual([[fire, Cclass_unit, 7]]);
		expect(err('freestate "unit",99,"fire";')).toEqual(['object:99']);
		free.mockClear();
		run('freestate "unit",7;');
		expect(free.mock.calls).toEqual([
			[3, Cclass_unit, 7],
			[4, Cclass_unit, 7]
		]);
	});

	it('freestored: all, or the first stored item of a type with a count', () => {
		const free_item = vi.spyOn(handle_items, 'free_item').mockImplementation(() => 0);
		const mk = (id: number, typ: number, pid: number) => {
			const i = New(Titem);
			i.id = id;
			i.typ = typ;
			i.parent_class = Cclass_unit;
			i.parent_id = pid;
		};
		mk(1, 10, 7);
		mk(2, 11, 7);
		mk(3, 11, 7);
		mk(4, 11, 8);
		run('freestored "self";');
		expect(free_item.mock.calls).toEqual([
			[1, -1],
			[2, -1],
			[3, -1]
		]);
		free_item.mockClear();
		run('freestored "unit",7,11,5;', 'freestored "unit",8,11;', 'freestored "unit",8,"all",5;');
		expect(free_item.mock.calls).toEqual([
			[2, 5],
			[4, -1],
			[4, -1]
		]);
	});

	it('freebutton', () => {
		G.in_sb[9] = 1;
		run('freebutton 9;');
		expect(G.in_sb[9]).toBe(0);
		expect(err('freebutton 10;')).toEqual(['Button ID between 0 and 9 expected!']);
	});

	// ------------------------------------------------------------------ Return

	it('playergotitem, riding, sleeping, getweather, mapsize, use_x/y/z, player weapon', () => {
		const count = vi.spyOn(handle_items, 'countstored_items').mockImplementation(() => 12);
		G.g_player = 7;
		expect(val('playergotitem(33)')).toBe('12');
		expect(count).toHaveBeenCalledWith(Cclass_unit, 7, 33);
		G.g_drive = 4;
		G.g_sleep = 1;
		G.env_cweather = 2;
		G.ter_size = 32;
		G.pc_use_x = f32(1.5);
		G.pc_use_y = 0;
		G.pc_use_z = -3;
		expect([val('riding()'), val('sleeping()'), val('getweather()'), val('mapsize()')]).toEqual(['4', '1', '2', '2048']);
		expect([val('use_x()'), val('use_y()'), val('use_z()')]).toEqual(['1.5', '0.0', '-3.0']);
		G.g_cplayer = null;
		expect(script2.cmd_getplayerweapon!(RT.script)).toBeUndefined(); // p_return$ stays ""
		expect(script2.cmd_getplayerammo!(RT.script)).toBeUndefined();
		self.player_weapon = 23;
		self.player_ammo = 5;
		G.g_cplayer = self;
		expect([val('getplayerweapon()'), val('getplayerammo()')]).toEqual(['23', '5']);
	});

	it('inrange / count_inrange', () => {
		const dist = vi.spyOn(handle_all, 'ha_distance').mockImplementation(() => 120);
		const idin = vi.spyOn(handle_all, 'ha_idinrange').mockImplementation(() => 1);
		const inr = vi.spyOn(handle_all, 'ha_inrange').mockImplementation(() => 3);
		mockParentH();
		self.h = pivotAt(0, 0, 0);
		expect(val('inrange("self")')).toBe('1');
		expect(idin).toHaveBeenLastCalledWith(G.cam, 300, Cclass_unit, 7);
		expect(val('inrange("object",4,50)')).toBe('1');
		expect(idin).toHaveBeenLastCalledWith(G.cam, 50, Cclass_object, 4);
		expect(val('inrange("object",4,120,"unit",7)')).toBe('1');
		expect(val('inrange("object",4,119,"unit",7)')).toBe('0');
		expect(dist).toHaveBeenLastCalledWith(Cclass_object, 4, Cclass_unit, 7);
		expect(val('count_inrange("unit",5)')).toBe('3');
		expect(inr).toHaveBeenLastCalledWith(G.cam, 300, Cclass_unit, 5);
		expect(val('count_inrange("unit",5,80,"self")')).toBe('3');
		expect(inr).toHaveBeenLastCalledWith(self.h, 80, Cclass_unit, 5);
		expect(val('count_inrange("unit",5,80,"object",99)')).toBe('0');
	});

	it('count_behaviourinrange: objects by name, units by number; items crash as in the original', () => {
		mockParentH();
		PositionEntity(G.cam!, 0, 0, 0);
		const od = [...DEFS.objects.byId.values()].find((o) => o.behaviour !== '')!;
		const o1 = New(Tobject);
		o1.typ = od.id;
		o1.h = pivotAt(100, 0, 0);
		const o2 = New(Tobject);
		o2.typ = od.id;
		o2.h = pivotAt(301, 0, 0);
		expect(val('count_behaviourinrange("object","' + od.behaviour + '")')).toBe('1');
		expect(val('count_behaviourinrange("object","' + od.behaviour + '",301)')).toBe('2');
		// units compare Dunit_behaviour with ai_getbehaviour(behaviour$): "predator" and "raptor" are both 2
		const ud = [...DEFS.units.byId.values()].find((u) => u.behaviour === 2)!;
		self.typ = ud.id;
		self.h = pivotAt(0, 0, 10);
		const far = New(Tunit);
		far.id = 8;
		far.typ = ud.id;
		far.h = pivotAt(0, 0, 61);
		expect(Dunit_behaviour(self.typ)).toBe(2);
		expect(val('count_behaviourinrange("unit","predator",50,"unit",7)')).toBe('1');
		expect(val('count_behaviourinrange("unit","raptor",51,"unit",7)')).toBe('2');
		expect(val('count_behaviourinrange("unit","fish")')).toBe('0');
		expect(err('$r=count_behaviourinrange("info","x");')).toEqual(['wrongclass:' + RT.script.parse_getclasstxt(4)]);
		// item branch: Tunit\typ with Tunit=Null
		expect(val('count_behaviourinrange("item","x")')).toBe('0');
		const i = New(Titem);
		i.h = pivotAt(0, 0, 0);
		expect(() => run('$r=count_behaviourinrange("item","x");')).toThrow();
	});

	it('count_stored: stored items only, by type or all', () => {
		const mk = (typ: number, count: number, mode: number, pid = 7) => {
			const i = New(Titem);
			i.typ = typ;
			i.count = count;
			i.parent_class = Cclass_unit;
			i.parent_id = pid;
			i.parent_mode = mode;
		};
		mk(10, 3, Cpm_in);
		mk(10, 4, Cpm_in);
		mk(11, 5, Cpm_in);
		mk(10, 100, Cpm_out);
		mk(10, 1000, Cpm_in, 8);
		expect(val('count_stored("self")')).toBe('12');
		expect(val('count_stored("unit",7,10)')).toBe('7');
		expect(val('count_stored("unit",7,0)')).toBe('0');
		expect(val('count_stored("unit",8)')).toBe('1000');
	});

	it('distance / playerdistance / inview / getx...: handles through parent_h, errors for missing entities', () => {
		mockParentH();
		self.h = pivotAt(0, 0, 0);
		const o = New(Tobject);
		o.id = 4;
		o.h = pivotAt(3, 4, 0);
		RotateEntity(o.h, 10, 20, 30);
		expect(val('distance("self","object",4)')).toBe('5.0');
		expect(val('distance("object",99,"object",4)')).toBe('0');
		expect(val('distance("object",4,"object",98)')).toBe('0');
		expect(errors).toEqual(['object:99', 'object:98']);
		errors = [];
		G.g_cplayer = self;
		expect(val('playerdistance("object",4)')).toBe('5.0');
		expect(val('playerdistance("object",99)')).toBe('0');
		expect(errors).toEqual(['object:99']);
		errors = [];
		expect([val('getx("object",4)'), val('gety("object",4)'), val('getz("object",4)')]).toEqual(['3.0', '4.0', '0.0']);
		expect(Number(val('getpitch("object",4)'))).toBeCloseTo(10, 3);
		expect(Number(val('getyaw("object",4)'))).toBeCloseTo(20, 3);
		expect(Number(val('getroll("object",4)'))).toBeCloseTo(30, 3);
		expect(val('getx("object",99)')).toBe('0');
		expect(errors).toEqual(['object:99']);
		errors = [];
		// a stored item reports the position of its parent
		const item = New(Titem);
		item.id = 20;
		item.h = pivotAt(500, 0, 0);
		item.parent_mode = Cpm_in;
		item.parent_class = Cclass_object;
		item.parent_id = 4;
		expect(val('getx("item",20)')).toBe('3.0');
		item.parent_mode = Cpm_out;
		expect(val('getx("item",20)')).toBe('500.0');
		// a killed entity: the pivot of the kill cache
		const dead = pivotAt(-7, 0, 0);
		vi.spyOn(RT.script, 'parse_kill_get').mockImplementation((cls: number, id: number) => (cls === Cclass_unit && id === 55 ? dead : 0));
		expect(val('getx("unit",55)')).toBe('-7.0');
		const inview = vi.spyOn(bb3d, 'EntityInView').mockImplementation(() => 1);
		expect(val('inview("object",4)')).toBe('1');
		expect(inview).toHaveBeenCalledWith(o.h, G.cam);
		expect(val('inview("object",99)')).toBe('0');
		expect(errors).toEqual(['object:99']);
	});

	it('exists, lives, type, freespace, terrainy', () => {
		const killed = vi.spyOn(handle_all, 'ha_killed').mockImplementation((_c: number, id: number) => (id === 7 ? 0 : 1));
		const type = vi.spyOn(handle_all, 'ha_type').mockImplementation(() => 44);
		const space = vi.spyOn(handle_all, 'ha_freespace').mockImplementation(() => 1);
		expect([val('exists("self")'), val('exists("unit",8)')]).toEqual(['1', '0']);
		expect([val('lives("self")'), val('lives("unit",8)')]).toEqual(['1', '0']);
		expect(killed).toHaveBeenLastCalledWith(Cclass_unit, 8);
		expect(val('type("self")')).toBe('44');
		expect(type).toHaveBeenCalledWith(Cclass_unit, 7);
		expect(val('freespace(1.5,2,3)')).toBe('1');
		expect(space).toHaveBeenLastCalledWith(1.5, 2, 3, 300, 1, 1, 1, 0);
		val('freespace(1,2,3,40,0,0,0,1)');
		expect(space).toHaveBeenLastCalledWith(1, 2, 3, 40, 0, 0, 0, 1);
		G.ter = null;
		G.ter_groundy = 0;
		const y = e_environment.e_tery(10, 20);
		expect(Number(val('terrainy(10,20)'))).toBe(y);
		expect(val('terrainy(10,20)')).toContain('.');
	});

	it('inarea*: info type 41..44 at the position of the entity; nothing without a handle', () => {
		mockParentH();
		self.h = pivotAt(11, 5, 22);
		const area = vi.spyOn(handle_infos, 'info_area').mockImplementation((typ: number) => typ - 40);
		expect([val('inarea_freshwater("self")'), val('inarea_dig("self")'), val('inarea_fish("self")'), val('inarea("self")')]).toEqual(['1', '2', '3', '4']);
		expect(area.mock.calls).toEqual([
			[41, 11, 22],
			[42, 11, 22],
			[43, 11, 22],
			[44, 11, 22]
		]);
		expect(script2.cmd_inarea!(RT.script, Cclass_unit, 99)).toBeUndefined(); // p_return$ stays ""
	});

	it('getstored / getamount / parent_class / parent_id', () => {
		const mk = (id: number, typ: number, count: number) => {
			const i = New(Titem);
			i.id = id;
			i.typ = typ;
			i.count = count;
			i.parent_class = Cclass_unit;
			i.parent_id = 7;
			return i;
		};
		mk(31, 10, 2);
		mk(32, 11, 9);
		expect(val('getstored("unit",7)')).toBe('31');
		expect(val('getstored("unit",7,11)')).toBe('32');
		expect(val('getstored("unit",7,12)')).toBe('0');
		expect(val('getamount(32)')).toBe('9');
		expect(script2.cmd_getamount!(RT.script, 99)).toBeUndefined(); // p_return$ stays ""
		expect([val('parent_class(32)'), val('parent_id(32)'), val('parent_id(99)')]).toEqual(['2', '7', '0']);
		runAs(Cclass_item, 31, '$r=parent_id("self");');
		expect(var_get('r')).toBe('7');
	});

	it('compare_material / compare_behaviour', () => {
		const od = [...DEFS.objects.byId.values()].find((o) => o.behaviour !== '' && Dobject_mat(o.id) > 0)!;
		const o = New(Tobject);
		o.id = 4;
		o.typ = od.id;
		vi.spyOn(handle_objects, 'con_object').mockImplementation((id: number) => {
			if (id !== 4) return 0;
			G.TCobject = o;
			return 1;
		});
		const mats = ['wood', 'stone', 'dirt', 'dust', 'leaf', 'metal', 'flesh', 'water', 'lava', 'fruit', 'glass'];
		const own = mats.find((m) => RT.script.host.get_material(m) === Dobject_mat(od.id))!;
		const foreign = mats.find((m) => RT.script.host.get_material(m) !== Dobject_mat(od.id))!;
		expect(val('compare_material("object",4,"' + own + '")')).toBe('1');
		expect(val('compare_material("object",4,"' + foreign + '")')).toBe('0');
		expect(val('compare_material("object",5,"' + own + '")')).toBe('0');
		expect(val('compare_behaviour("object",4,"' + od.behaviour + '")')).toBe('1');
		expect(val('compare_behaviour("object",4,"something else")')).toBe('0');
		expect(val('compare_behaviour("info",4,"x")')).toBe('0');
	});

	it('health: change, clamped to 0..max, float text', () => {
		self.health = 50;
		self.health_max = 100;
		expect(val('health("self")')).toBe('50.0');
		expect(val('health("self",-20.5)')).toBe('29.5');
		expect(val('health("self",500)')).toBe('100.0');
		expect(val('health("self",-500)')).toBe('0.0');
		expect(val('health("unit",99,1)')).toBe('0');
		const d = [...DEFS.items.byId.values()].find((i) => Ditem_health(i.id) > 0)!;
		const item = New(Titem);
		item.id = 3;
		item.typ = d.id;
		item.health = 1;
		expect(Number(val('health("item",3,100000)'))).toBe(Ditem_health(d.id));
		const o = New(Tobject);
		o.id = 4;
		o.health = 10;
		o.health_max = 12;
		expect(val('health("object",4,1.5)')).toBe('11.5');
	});

	it('count: objects, living units, item amounts, infos, states; the unit branch prints a console line', () => {
		const con = vi.spyOn(RT.script.host, 'con_add');
		for (const typ of [5, 5, 6]) New(Tobject).typ = typ;
		const u2 = New(Tunit);
		u2.typ = 1;
		u2.health = 0;
		self.health = 10;
		for (const c of [3, 4]) {
			const i = New(Titem);
			i.typ = 9;
			i.count = c;
		}
		New(Tinfo).typ = 36;
		New(Tstate).typ = 4;
		New(Tstate).typ = 4;
		expect(val('count("object",5)')).toBe('2');
		expect(con).not.toHaveBeenCalledWith('result 2');
		expect(val('count("unit",1)')).toBe('1');
		expect(con).toHaveBeenCalledWith('result 1');
		expect(val('count("item",9)')).toBe('7');
		expect(val('count("info",36)')).toBe('1');
		expect(val('count("state",4)')).toBe('2');
	});

	it('defparam', () => {
		const d = New(Tdefparam);
		d.class = Cclass_unit;
		d.typ = 1;
		d.key = 'speed';
		d.value = 'fast';
		expect(val('defparam("unit",1,"speed")')).toBe('fast');
		expect(val('defparam("unit",2,"speed")')).toBe('0');
	});

	// ------------------------------------------------------------------ AI

	it('ai_signal / ai_typesignal / ai_behavioursignal / ai_mode pass class, id, mode and range', () => {
		const sig = vi.spyOn(ai_signals, 'ai_signal').mockImplementation((() => undefined) as never);
		const tsig = vi.spyOn(ai_signals, 'ai_typesignal').mockImplementation((() => undefined) as never);
		const bsig = vi.spyOn(ai_signals, 'ai_behavioursignal').mockImplementation((() => undefined) as never);
		const mode = vi.spyOn(ai_signals, 'ai_unitmode').mockImplementation((() => undefined) as never);
		const attract = RT.script.parse_getaisignal('attract');
		run('ai_signal "attract";', 'ai_signal "attract",50,"object",4;');
		expect(sig.mock.calls).toEqual([
			[Cclass_unit, 7, attract, 300],
			[Cclass_object, 4, attract, 50]
		]);
		run('ai_typesignal "attract",12;', 'ai_typesignal "attract",12,80,"item",3;');
		expect(tsig.mock.calls).toEqual([
			[Cclass_unit, 7, attract, 12, 300],
			[Cclass_item, 3, attract, 12, 80]
		]);
		run('ai_behavioursignal "attract","raptor";');
		expect(bsig.mock.calls).toEqual([[Cclass_unit, 7, attract, RT.script.host.ai_getbehaviour('raptor'), 300]]);
		const goto = RT.script.parse_getaimode('goto');
		run('ai_mode "self","goto";', 'ai_mode 9,"goto","object",4;');
		expect(mode.mock.calls).toEqual([
			[7, goto, 0, 0],
			[9, goto, Cclass_object, 4]
		]);
	});

	it('ai_stay sets or frees the stick state; ai_center moves the AI centre to the unit', () => {
		const set = vi.spyOn(handle_states, 'set_state').mockImplementation(() => 1);
		const free = vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1);
		run('ai_stay "self";', 'ai_stay 9,1;');
		expect(set.mock.calls).toEqual([
			[Cstate_ai_stick, Cclass_unit, 7],
			[Cstate_ai_stick, Cclass_unit, 9]
		]);
		run('ai_stay "self",0;', 'ai_stay 9,2;');
		expect(free.mock.calls).toEqual([
			[Cstate_ai_stick, Cclass_unit, 7],
			[Cstate_ai_stick, Cclass_unit, 9]
		]);
		self.h = pivotAt(12, 3, 34);
		self.ai_ch = pivotAt(0, 9, 0);
		const u2 = New(Tunit);
		u2.id = 9;
		u2.h = pivotAt(-1, 0, -2);
		run('ai_center;');
		expect([self.ai_cx, self.ai_cz]).toEqual([12, 34]);
		expect([EntityX(self.ai_ch), bb3d.EntityY(self.ai_ch), EntityZ(self.ai_ch)]).toEqual([12, 0, 34]);
		run('ai_center 9;');
		expect([u2.ai_cx, u2.ai_cz]).toEqual([-1, -2]);
	});
});

