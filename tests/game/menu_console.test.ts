/**
 * Package "menu": console.bb, debug.bb, mods.bb, unrealsoftware.bb.
 * Expected values are derived from the original source, branch by branch.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bb3d from '../../src/lib/s2/bb3d';
import { CreatePivot, EntityX, PositionEntity } from '../../src/lib/s2/bb3d';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { BackBuffer, ReadPixelFast, SetBuffer, setGraphicsDepth } from '../../src/lib/s2/gfx2d';
import { injectKeyDown, injectKeyUp, injectMouseDown } from '../../src/lib/s2/input';
import * as con from '../../src/lib/s2/game/console';
import { Cbmpf_dark, Cbmpf_green, Cbmpf_over, Cbmpf_red, Cbmpf_tiny, Cbmpf_yellow, Cclass_object, Cclass_unit, Cmenu_if_debug, Cmenu_if_debugmenu, Csection_editor, Csection_game_sp, Csection_menu } from '../../src/lib/s2/game/consts';
import * as dbg from '../../src/lib/s2/game/debug';
import { Dinfo_name, Ditem_health, Ditem_name, Dobject_name, Dstate_name, Dunit_name, loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import * as editor_functions from '../../src/lib/s2/game/editor_functions';
import { CreateDir, FileType, ROOT_DIR, bytesToString, readFileBytes, readFileLines, stringToBytes, writeFileBytes } from '../../src/lib/s2/game/files';
import * as files from '../../src/lib/s2/game/files';
import { clearDeferred, hasDeferred, runDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as load_bmpf from '../../src/lib/s2/game/load_bmpf';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as mods from '../../src/lib/s2/game/mods';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import * as sys from '../../src/lib/s2/game/sys';
import { setCommandLine, setNetwork } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, New, TYPES, Tcon, Tfrap, Tinfo, Titem, Tobject, Tseq, Tstate, Tudp_con, Tunit, Tup, Tx } from '../../src/lib/s2/game/types';
import { unrealsoftware } from '../../src/lib/s2/game/unrealsoftware';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');
const SEP = '\xa6';

/** The console rows. */
const lines = (): string[] => [...Each(Tcon)].map((c) => c.txt);
const sp = (col: number, txt: string): string => `!${col} ${txt}`;

describe.skipIf(!existsSync(MOD))('package menu: console, debug, mods, intro', () => {
	let now = 0;

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		G.set_rootdir = ROOT_DIR;
		G.set_moddir = 'Stranded II';
		DeleteEach(Tcon); // the loaders report unloadable media of the headless runtime
	});

	afterEach(() => {
		disposeRuntime();
		resetGameState();
		resetDefs();
		clearDeferred();
		setFrameScheduler(null);
		setFrameHook(null);
		setCommandLine(null);
		setNetwork(null);
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
	// console.bb
	// =================================================================================

	describe('console.bb', () => {
		it('con_add: plain rows and "!<font> " rows; con_clear deletes all', () => {
			con.con_add();
			con.con_add('plain');
			con.con_add('red', Cbmpf_red);
			con.con_add('zero', 0);
			expect(lines()).toEqual(['', 'plain', '!3 red', '!0 zero']);
			expect(Cbmpf_red).toBe(3);
			con.con_clear();
			expect(lines()).toEqual([]);
		});

		it('con_welcome: eight rows with the version', () => {
			con.con_welcome();
			const stars = '!0 ' + '*'.repeat(88);
			expect(lines()).toEqual(['', stars, '!0 Welcome to Stranded II', '!0 You are playing version 1.0.0.1', '!0 Web: www.stranded.unrealsoftware.de', '!0 Mail: stranded2@unrealsoftware.de', stars, '']);
		});

		it('con_toggle / con_open / con_close', () => {
			G.in_conin = 'abc';
			G.in_conscroll = 7;
			con.con_toggle();
			expect([G.in_console, G.in_conin, G.in_conscroll]).toEqual([1, '', 0]);
			con.con_toggle();
			expect(G.in_console).toBe(0);
			con.con_toggle(1);
			expect(G.in_console).toBe(1);
			con.con_open();
			expect(G.in_console).toBe(1); // 1-1=0, then set
			con.con_close();
			expect(G.in_console).toBe(0);
			con.con_close();
			expect(G.in_console).toBe(0);
		});

		it('con_memory: megabytes and kilobytes by integer division', () => {
			vi.spyOn(sys, 'TotalVidMem').mockReturnValue(67108864);
			vi.spyOn(sys, 'AvailVidMem').mockReturnValue(16778216);
			con.con_memory();
			expect(lines()).toEqual([
				'',
				'!0 *** Video Memory ***',
				sp(Cbmpf_over, 'Total: 64 mb (65536 kb)'),
				sp(Cbmpf_red, 'Used: 47 mb (49151 kb)'),
				sp(Cbmpf_green, 'Avail: 16 mb (16384 kb)'),
				''
			]);
		});

		it('con_3d', () => {
			vi.spyOn(bb3d, 'TrisRendered').mockReturnValue(12999);
			vi.spyOn(bb3d, 'ActiveTextures').mockReturnValue(42);
			setGraphicsDepth(32); // GraphicsDepth(): the depth given to Graphics3D
			con.con_3d();
			expect(lines()).toEqual(['', '!0 *** 3D Stats ***', sp(Cbmpf_over, 'Res: 800*600*32'), sp(Cbmpf_over, 'Tris: 12999 (12 k)'), sp(Cbmpf_over, 'Textures: 42'), '']);
		});

		it('con_debugmenu / con_debugmap: only in a game', () => {
			G.m_section = Csection_menu;
			G.in_console = 1;
			con.con_debugmenu();
			con.con_debugmap();
			expect(lines()).toEqual(['Debug Menu is only available in-game', sp(Cbmpf_red, 'Debugmap is only available in a single- or multiplayer game')]);
			expect(G.in_console).toBe(1);

			G.m_section = Csection_game_sp;
			con.con_debugmenu();
			expect(G.m_menu).toBe(Cmenu_if_debugmenu);
			expect(G.in_console).toBe(0);
			G.in_console = 1;
			con.con_debugmap();
			expect([G.set_debug_menu, G.m_menu, G.in_console]).toEqual([1, Cmenu_if_debug, 0]);
		});

		it('con_debug: toggles set_debug and shows / hides the collision entities of units', () => {
			const alpha = vi.spyOn(bb3d, 'EntityAlpha');
			const a = New(Tunit);
			a.h = CreatePivot();
			a.vh = CreatePivot();
			a.h_pivot = 1;
			const b = New(Tunit);
			b.h = CreatePivot();
			b.h_pivot = 0;
			con.con_debug();
			expect(G.set_debug).toBe(1);
			expect(lines()).toEqual(['', '!0 *** Debug ***', sp(Cbmpf_green, 'Debug mode is ON'), '']);
			expect(alpha.mock.calls).toEqual([
				[a.vh, Math.fround(0.5)],
				[b.h, Math.fround(0.1)]
			]);
			alpha.mockClear();
			con.con_clear();
			con.con_debug();
			expect(G.set_debug).toBe(0);
			expect(lines()[2]).toBe(sp(Cbmpf_red, 'Debug mode is OFF'));
			expect(alpha.mock.calls).toEqual([
				[a.vh, 0],
				[b.h, 0]
			]);
		});

		it('con_debugtimes / con_debugsequences / con_debugload / con_wireframe toggle their flags', () => {
			const wf = vi.spyOn(bb3d, 'WireFrame').mockImplementation(() => {});
			con.con_debugtimes();
			con.con_debugsequences();
			con.con_debugload();
			con.con_wireframe();
			expect([G.set_debug_rt, G.set_debug_seq, G.set_debug_load, G.set_debug_wireframe]).toEqual([1, 1, 1, 1]);
			expect(wf).toHaveBeenLastCalledWith(1);
			expect(lines()).toEqual([
				'',
				'!0 *** Debug Times ***',
				sp(Cbmpf_green, 'Debug Times ON'),
				'',
				'',
				'!0 *** Debug Sequences ***',
				sp(Cbmpf_green, 'Debug Sequences ON'),
				'',
				'',
				'!0 *** Debug Load ***',
				sp(Cbmpf_green, 'Debug Load ON'),
				'',
				'',
				'!0 *** Wireframe ***',
				sp(Cbmpf_green, 'Wireframe mode is ON')
			]);
			con.con_clear();
			con.con_debugtimes();
			con.con_debugsequences();
			con.con_debugload();
			con.con_wireframe();
			expect([G.set_debug_rt, G.set_debug_seq, G.set_debug_load, G.set_debug_wireframe]).toEqual([0, 0, 0, 0]);
			expect(wf).toHaveBeenLastCalledWith(0);
			expect(lines().filter((l) => l.startsWith('!3'))).toEqual([sp(Cbmpf_red, 'Debug Times OFF'), sp(Cbmpf_red, 'Debug Sequences OFF'), sp(Cbmpf_red, 'Debug Load OFF'), sp(Cbmpf_red, 'Wireframe mode is OFF')]);
		});

		it('con_debugscript: the parse cache with three-digit line numbers', () => {
			G.Dpc = ['on:start {', 'msg "x";', '}'];
			G.p_lines = 3;
			con.con_debugscript();
			expect(lines()).toEqual(['', '!0 *** Debug Script ***', '001: on:start {', '002: msg "x";', '003: }']);
		});

		it('con_online: offline without a transport, online with IP and ping', () => {
			con.con_online();
			expect(lines()).toEqual(['', '!0 *** Online ***', sp(Cbmpf_red, 'You are OFFLINE'), '']);
			con.con_clear();

			const sent: string[] = [];
			const closed: number[] = [];
			setNetwork({
				...sys.NET,
				OpenTCPStream: (server, port) => (server === 'www.usgn.unrealsoftware.de' && port === 80 ? 5 : 0),
				WriteLine: (_s, txt) => void sent.push(txt),
				ReadLine: () => '10.1.2.3',
				CloseTCPStream: (s) => void closed.push(s)
			});
			con.con_online();
			expect(sent).toEqual(['GET http://www.usgn.unrealsoftware.de/getip.php']);
			expect(closed).toEqual([5]);
			// two MilliSecs() calls, 20 ms apart
			expect(lines()).toEqual(['', '!0 *** Online ***', sp(Cbmpf_green, 'You are ONLINE'), sp(Cbmpf_over, 'IP: 10.1.2.3'), sp(Cbmpf_over, 'Ping: 20 ms (usgn.unrealsoftware.de)'), '']);

			// an empty answer is "offline"
			con.con_clear();
			setNetwork({ ...sys.NET, OpenTCPStream: () => 5, ReadLine: () => '' });
			con.con_online();
			expect(lines()[2]).toBe(sp(Cbmpf_red, 'You are OFFLINE'));
		});

		it('con_save: writes every row to CON_D_<date>_T_<time>.txt', () => {
			con.con_add('one');
			con.con_add('two', 3);
			con.con_save();
			const last = lines()[2];
			const m = /^!4 Console output saved to '(CON_D_\d\d_[A-Za-z]{3}_\d{4}_T_\d\d_\d\d_\d\d\.txt)'$/.exec(last);
			expect(m).not.toBeNull();
			expect(readFileLines(m![1])).toEqual(['one', '!3 two']);
			expect(Cbmpf_green).toBe(4);

			vi.spyOn(files, 'WriteFile').mockReturnValue(0);
			con.con_save();
			expect(lines()[3]).toMatch(/^!3 ERROR: Unable to save console output to 'CON_D_.*\.txt'$/);
		});

		it('con_listplayers: units with id<100, the own player in green', () => {
			const a = New(Tunit);
			a.id = 1;
			a.player_name = 'Me';
			a.player_ip = (192 << 24) | (168 << 16) | (0 << 8) | 7;
			a.player_port = 36963;
			const b = New(Tunit);
			b.id = 2;
			b.player_name = 'You';
			const c = New(Tunit);
			c.id = 100;
			G.g_player = 1;
			con.con_listplayers();
			expect(lines()).toEqual(['', '!0 *** Player List ***', sp(Cbmpf_green, '#1 Me (192.168.0.7:36963)'), sp(Cbmpf_yellow, '#2 You (0.0.0.0:0)')]);
		});

		it('con_listvars: globals first, then locals; con_listconst', () => {
			Object.assign(New(Tx), { mode: 4, key: 'loc', value: '2', parent_class: 1, parent_id: 17 });
			Object.assign(New(Tx), { mode: 1, key: 'glob', value: 'x y' });
			Object.assign(New(Tx), { mode: 0, value: 'script' });
			con.con_listvars();
			expect(lines()).toEqual(['', '!0 *** Variables List ***', 'GLOBAL $glob = x y', 'LOCAL $loc = 2 @ 1,17']);
			con.con_clear();
			CONST_STORE.set('speed', 12);
			con.con_listconst();
			expect(lines()).toEqual(['', '!0 *** Constants List ***', 'CONST #speed = 12']);
		});

		it('con_listitems: free and stored items', () => {
			const typ = [...DEFS.items.byId.keys()][0];
			Object.assign(New(Titem), { id: 3, typ, count: 5 });
			Object.assign(New(Titem), { id: 4, typ, count: 1, parent_class: 2, parent_id: 1, parent_mode: 6 });
			con.con_listitems();
			expect(lines()).toEqual(['', '!0 *** Item List ***', sp(Cbmpf_yellow, `#3 ${Ditem_name(typ)} 5x`), sp(Cbmpf_dark, `#4 ${Ditem_name(typ)} 1x (stored 2,1,6)`)]);
			expect(Ditem_name(typ)).not.toBe('');
		});

		it('con_listscripts: map script, scripts of existing parents, and deletes scripts without parent', () => {
			const pivot = CreatePivot();
			vi.spyOn(parentchild, 'parent_h').mockImplementation((cls, id) => (cls === 1 && id === 5 ? pivot : null));
			G.map_briefing = `on:start {${SEP}}`;
			Object.assign(New(Tx), { mode: 0, parent_class: 1, parent_id: 5, value: `a${SEP}b${SEP}` });
			Object.assign(New(Tx), { mode: 0, parent_class: 2, parent_id: 9, value: 'lost' });
			Object.assign(New(Tx), { mode: 1, key: 'v', value: '1' });
			con.con_listscripts();
			expect(lines()).toEqual([
				'',
				'!0 *** Scripts List ***',
				'Script @ 0,0 (Map Script)',
				'on:start {',
				'}',
				sp(Cbmpf_yellow, 'Script @ 1,5'),
				'a',
				'b',
				'',
				sp(Cbmpf_red, 'Script @ 2,9 - PARENT DOES NOT EXIST! -> DELETED'),
				'lost'
			]);
			expect([...Each(Tx)].map((t) => `${t.mode}:${t.parent_class},${t.parent_id}`)).toEqual(['0:1,5', '1:0,0']);
		});

		it('con_listfraps and con_modinfo count', () => {
			New(Tfrap);
			New(Tfrap);
			con.con_listfraps();
			expect(lines()).toEqual(['', '!0 *** FRAP List ***', 'FRAP Count: 2']);
			con.con_clear();
			con.con_modinfo();
			const l = lines();
			expect(l.slice(0, 8)).toEqual([
				'',
				'!0 *** Mod Info ***',
				'!1 Name/Dir: Stranded II',
				'!0 ---------------',
				`!1 Objects: ${G.object_count}`,
				`!1 Units: ${G.unit_count}`,
				`!1 Items: ${G.item_count}`,
				`!1 Infos: ${G.info_count}`
			]);
			expect(G.object_count).toBeGreaterThan(0);
			expect(l[8]).toBe('!0 ---------------');
			expect(l[9]).toMatch(/^!1 Buildings: [1-9]\d*$/);
			expect(l[10]).toMatch(/^!1 Combinations: [1-9]\d*$/);
			expect(l[11]).toBe('');
			expect(l.length).toBe(12);
		});

		it('con_enter: dispatches the trimmed input and clears it', () => {
			const run = (cmd: string): void => {
				G.in_conin = cmd;
				con.con_enter();
				expect(G.in_conin).toBe('');
			};
			con.con_add('x');
			run('  cls ');
			expect(lines()).toEqual([]);
			con.con_add('x');
			run('clear');
			expect(lines()).toEqual([]);

			G.in_console = 1;
			run('close');
			expect(G.in_console).toBe(0);

			run('quit');
			expect(G.m_performquit).toBe(1);
			G.m_performquit = 0;
			run('exit');
			expect(G.m_performquit).toBe(1);

			for (const c of ['welcome', 'info', 'version']) {
				con.con_clear();
				run(c);
				expect(lines()[2]).toBe('!0 Welcome to Stranded II');
			}

			run('gore');
			expect(G.set_gore).toBe(1);
			run('nogore');
			expect(G.set_gore).toBe(0);

			G.set_drawinterface = 1;
			run('if');
			expect(G.set_drawinterface).toBe(0);
			run('interface');
			expect(G.set_drawinterface).toBe(1);

			run('debug');
			expect(G.set_debug).toBe(1);
			run('t');
			run('times');
			run('debugtimes');
			expect(G.set_debug_rt).toBe(1);
			run('seq');
			expect(G.set_debug_seq).toBe(1);
			run('debugload');
			expect(G.set_debug_load).toBe(1);

			con.con_clear();
			run('');
			expect(lines()).toEqual(['']);

			con.con_clear();
			run(' foo bar ');
			expect(lines()).toEqual([sp(Cbmpf_red, "ERROR: Unknown Command 'foo bar'")]);

			// commands are case sensitive
			con.con_clear();
			run('CLS');
			expect(lines()).toEqual([sp(Cbmpf_red, "ERROR: Unknown Command 'CLS'")]);

			con.con_clear();
			for (const c of ['memory', '3d', 'tris', 'online', 'ip', 'listplayers', 'playerlist', 'vars', 'items', 'scripts', 'fraps', 'const', 'modinfo', 'debugscript', 'dm', 'debugmap']) run(c);
			const heads = lines().filter((l) => l.startsWith('!0 ***') && l !== '!0 ' + '*'.repeat(88));
			expect(heads).toEqual([
				'!0 *** Video Memory ***',
				'!0 *** 3D Stats ***',
				'!0 *** 3D Stats ***',
				'!0 *** Online ***',
				'!0 *** Online ***',
				'!0 *** Player List ***',
				'!0 *** Player List ***',
				'!0 *** Variables List ***',
				'!0 *** Item List ***',
				'!0 *** Scripts List ***',
				'!0 *** FRAP List ***',
				'!0 *** Constants List ***',
				'!0 *** Mod Info ***',
				'!0 *** Debug Script ***'
			]);
			expect(lines().slice(-2)).toEqual(['Debug Menu is only available in-game', sp(Cbmpf_red, 'Debugmap is only available in a single- or multiplayer game')]);
		});

		it('con_enter "centers": the AI centre of every unit as Floats', () => {
			const u = New(Tunit);
			u.ai_ch = CreatePivot();
			PositionEntity(u.ai_ch, 12.5, 0, -3);
			G.in_conin = 'centers';
			con.con_enter();
			expect(lines()).toEqual(['12.5|-3.0']);
		});

		describe('console()', () => {
			it('closed: draws nothing and returns 0; key 41 opens it', () => {
				const txt = vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
				expect(con.console()).toBe(0);
				expect(txt).not.toHaveBeenCalled();
				injectKeyDown(41);
				expect(con.console()).toBe(0);
				expect(G.in_console).toBe(1);
				// the input row only (cursor off)
				expect(txt.mock.calls).toEqual([[2, G.set_scry - 15, '', Cbmpf_tiny]]);
				expect(G.in_inputfocus).toBe(-1);
				injectKeyUp(41);
			});

			it('draws the rows bottom-up, 15 pixels apart, coloured rows with a ">" in their font', () => {
				const txt = vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
				G.in_console = 1;
				G.in_cursor = 1;
				G.in_conin = 'ab';
				con.con_add('first');
				con.con_add('second', 3);
				con.con_add('third');
				con.console();
				expect(G.set_scry).toBe(600);
				expect(txt.mock.calls).toEqual([
					[2, 560, 'third', Cbmpf_tiny],
					[2, 543, '>', 3],
					[14, 545, 'second', Cbmpf_tiny],
					[2, 530, 'first', Cbmpf_tiny],
					[2, 585, 'ab|', Cbmpf_tiny]
				]);
			});

			it('scrolling: offset in rows from the end; an offset past the first row is reduced by one per frame', () => {
				const txt = vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
				G.in_console = 1;
				con.con_add('first');
				con.con_add('second');
				con.con_add('third');
				G.in_conscroll = 1;
				con.console();
				expect(txt.mock.calls.slice(0, -1)).toEqual([
					[2, 560, 'second', Cbmpf_tiny],
					[2, 545, 'first', Cbmpf_tiny]
				]);
				txt.mockClear();
				G.in_conscroll = 9;
				con.console();
				// i=3 walks off the list: nothing is drawn, in_conscroll=8
				expect(txt.mock.calls.length).toBe(1);
				expect(G.in_conscroll).toBe(8);
			});

			it('scroll input: wheel*3, page up/down 25, end 0, never negative', () => {
				vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
				G.in_console = 1;
				for (let i = 0; i < 40; i++) con.con_add('row ' + i);
				G.in_mzs = 1;
				con.console();
				expect(G.in_conscroll).toBe(3);
				G.in_mzs = 0;
				injectKeyDown(201);
				con.console();
				injectKeyUp(201);
				expect(G.in_conscroll).toBe(28);
				injectKeyDown(209);
				con.console();
				injectKeyUp(209);
				expect(G.in_conscroll).toBe(3);
				injectKeyDown(209);
				con.console();
				injectKeyUp(209);
				expect(G.in_conscroll).toBe(0); // -22 -> 0
				G.in_conscroll = 12;
				injectKeyDown(207);
				con.console();
				injectKeyUp(207);
				expect(G.in_conscroll).toBe(0);
				G.in_mzs = -1;
				con.console();
				expect(G.in_conscroll).toBe(0);
			});

			it('quirk: an empty console with a scroll offset crashes (Before of Null)', () => {
				G.in_console = 1;
				G.in_conscroll = 1;
				expect(() => con.console()).toThrow('Memory access violation');
			});

			it('typing: printable keys append, 8 deletes, 4 clears, a leading ^ goes, 13 runs the command', () => {
				vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation(() => {});
				G.in_console = 1;
				con.con_add('x');
				const press = (key: number): void => {
					G.in_key = key;
					con.console();
					expect(G.in_key).toBe(0);
				};
				press(94); // ^ (the console key on German keyboards)
				expect(G.in_conin).toBe('');
				press(103);
				press(111);
				press(114);
				press(101);
				press(33);
				expect(G.in_conin).toBe('gore!');
				press(31);
				press(127);
				expect(G.in_conin).toBe('gore!');
				press(8);
				expect(G.in_conin).toBe('gore');
				press(13);
				expect(G.in_conin).toBe('');
				expect(G.set_gore).toBe(1);
				press(8); // nothing to delete
				expect(G.in_conin).toBe('');
				press(65);
				press(4);
				expect(G.in_conin).toBe('');
			});
		});
	});

	// =================================================================================
	// debug.bb
	// =================================================================================

	describe('debug.bb', () => {
		it('dlog: creates debug.txt; quirk: later calls overwrite the start of the file', () => {
			dbg.dlog('first line long');
			expect(bytesToString(readFileBytes(ROOT_DIR + 'debug.txt')!)).toBe('first line long\r\n');
			dbg.dlog('2nd');
			expect(bytesToString(readFileBytes(ROOT_DIR + 'debug.txt')!)).toBe('2nd\r\n line long\r\n');
		});

		it('dbugcmd object: data of the object, then its locals, states, items and script', () => {
			const typ = [...DEFS.objects.byId.keys()][0];
			const ityp = [...DEFS.items.byId.keys()][0];
			const o = New(Tobject);
			o.id = 7;
			o.typ = typ;
			o.h = CreatePivot();
			PositionEntity(o.h, 10.4, 2.6, -3.5);
			o.health = 12.5;
			o.health_max = 50;
			Object.assign(New(Tx), { mode: 4, parent_class: 1, parent_id: 7, key: 'k', value: 'v' });
			Object.assign(New(Tx), { mode: 4, parent_class: 1, parent_id: 7, key: 'k2', value: 'v2', stuff: 'tmp' });
			Object.assign(New(Tx), { mode: 4, parent_class: 1, parent_id: 8, key: 'other', value: '1' });
			Object.assign(New(Tx), { mode: 4, parent_class: 2, parent_id: 7, key: 'other', value: '1' });
			Object.assign(New(Tx), { mode: 0, parent_class: 1, parent_id: 7, value: `on:use {${SEP}}` });
			Object.assign(New(Tstate), { typ: 4, parent_class: 1, parent_id: 7 });
			Object.assign(New(Tstate), { typ: 5, parent_class: 2, parent_id: 7 });
			Object.assign(New(Titem), { id: 1, typ: ityp, count: 3, parent_class: 1, parent_id: 7 });
			Object.assign(New(Tup), { unit: 7, mode: 0, info: 1 });

			dbg.dbugcmd('object', '7');
			expect(lines()).toEqual([
				'',
				sp(Cbmpf_red, '*** Debug: object 7 ***'),
				'object #7',
				`type: ${typ} (${Dobject_name(typ)})`,
				'health: 12.5/50.0',
				'position: 10,3,-4',
				'rotation: 0,0,0',
				sp(Cbmpf_red, '* locals: '),
				'$k = v',
				'$k2 = v2 (tmp)',
				sp(Cbmpf_red, '* states: '),
				`4 (${Dstate_name(4)})`,
				sp(Cbmpf_red, '* items: '),
				`${ityp} (${Ditem_name(ityp)}) x3`,
				sp(Cbmpf_red, '* script: '),
				'on:use {',
				'}'
			]);

			// the class as a number, and an id that does not exist
			con.con_clear();
			dbg.dbugcmd('1', '99x');
			expect(lines()).toEqual(['', sp(Cbmpf_red, '*** Debug: 1 99x ***'), 'object #99', 'does not exist']);
			expect(Cclass_object).toBe(1);
		});

		it('dbugcmd unit: lists the unit path; "self" takes class and id from the script environment but lists no children', () => {
			const typ = [...DEFS.units.byId.keys()][0];
			const u = New(Tunit);
			u.id = 3;
			u.typ = typ;
			u.h = CreatePivot();
			u.health = 30;
			u.health_max = 30;
			Object.assign(New(Tup), { unit: 3, mode: 0, info: 11 });
			Object.assign(New(Tup), { unit: 3, mode: 1, info: 12 });
			Object.assign(New(Tup), { unit: 3, mode: 2, info: 13 });
			Object.assign(New(Tup), { unit: 4, mode: 1, info: 99 });
			Object.assign(New(Tx), { mode: 4, parent_class: 2, parent_id: 3, key: 'k', value: 'v' });

			dbg.dbugcmd('unit', '3');
			expect(lines()).toEqual([
				'',
				sp(Cbmpf_red, '*** Debug: unit 3 ***'),
				'unit #3',
				`type: ${typ} (${Dunit_name(typ)})`,
				'health: 30.0/30.0',
				'position: 0,0,0',
				'rotation: 0,0,0',
				sp(Cbmpf_red, '* locals: '),
				'$k = v',
				sp(Cbmpf_red, '* states: '),
				sp(Cbmpf_red, '* unitpath: '),
				'rootnode - current node: 11',
				'node 1 @ info 12',
				'node 2 @ info 13',
				sp(Cbmpf_red, '* items: '),
				sp(Cbmpf_red, '* script: ')
			]);

			con.con_clear();
			G.p_env_class = Cclass_unit;
			G.p_env_id = 3;
			dbg.dbugcmd('self');
			// quirk: dbugcmdchilds gets class -1
			expect(lines()).toEqual([
				'',
				sp(Cbmpf_red, '*** Debug: self  ***'),
				'unit #3',
				`type: ${typ} (${Dunit_name(typ)})`,
				'health: 30.0/30.0',
				'position: 0,0,0',
				'rotation: 0,0,0',
				sp(Cbmpf_red, '* locals: '),
				sp(Cbmpf_red, '* states: '),
				sp(Cbmpf_red, '* items: '),
				sp(Cbmpf_red, '* script: ')
			]);
		});

		it('dbugcmd item (quirk: titled "unit #") and info', () => {
			const ityp = [...DEFS.items.byId.keys()][0];
			const it_ = New(Titem);
			Object.assign(it_, { id: 4, typ: ityp, count: 2, parent_class: 2, parent_id: 1, parent_mode: 6, health: 1.5 });
			it_.h = CreatePivot();
			Object.assign(New(Titem), { id: 5, typ: ityp, count: 1, parent_class: 3, parent_id: 4 });
			dbg.dbugcmd('item', '4');
			expect(lines()).toEqual([
				'',
				sp(Cbmpf_red, '*** Debug: item 4 ***'),
				'unit #4',
				`type: ${ityp} (${Ditem_name(ityp)})`,
				'count: 2',
				'parent: 2,1 (Mode 6)',
				`health: 1.5/${Number.isInteger(Ditem_health(ityp)) ? Ditem_health(ityp).toFixed(1) : Ditem_health(ityp)}`,
				'position: 0,0,0',
				'rotation: 0,0,0',
				sp(Cbmpf_red, '* locals: '),
				sp(Cbmpf_red, '* states: '),
				// no "* items: " for an item
				sp(Cbmpf_red, '* script: ')
			]);

			con.con_clear();
			const ntyp = [...DEFS.infos.byId.keys()][0];
			const inf = New(Tinfo);
			inf.id = 5;
			inf.typ = ntyp;
			inf.h = CreatePivot();
			PositionEntity(inf.h, 1, 2, 3);
			dbg.dbugcmd('info', '5');
			expect(lines().slice(0, 5)).toEqual(['', sp(Cbmpf_red, '*** Debug: info 5 ***'), 'info #5', `type: ${ntyp} (${Dinfo_name(ntyp)})`, 'position: 1,2,3']);
			con.con_clear();
			dbg.dbugcmd('info', '6');
			expect(lines().slice(2)).toEqual(['info #6', 'does not exist']);
			con.con_clear();
			dbg.dbugcmd('item', '6');
			expect(lines().slice(2)).toEqual(['unit #6', 'does not exist']);
			con.con_clear();
			dbg.dbugcmd('unit', '6');
			expect(lines().slice(2)).toEqual(['unit #6', 'does not exist']);
		});

		it('dbugcmd map / vars / scripts run the console command; anything else prints the head only', () => {
			G.m_section = Csection_menu;
			dbg.dbugcmd('map');
			expect(lines()).toEqual(['', sp(Cbmpf_red, '*** Debug: map  ***'), sp(Cbmpf_red, 'Debugmap is only available in a single- or multiplayer game')]);
			expect(G.in_conin).toBe('');
			con.con_clear();
			dbg.dbugcmd('vars');
			expect(lines().slice(2)).toEqual(['', '!0 *** Variables List ***']);
			con.con_clear();
			dbg.dbugcmd('scripts');
			expect(lines().slice(2)).toEqual(['', '!0 *** Scripts List ***']);
			con.con_clear();
			dbg.dbugcmd('state', '1');
			expect(lines()).toEqual(['', sp(Cbmpf_red, '*** Debug: state 1 ***')]);
		});

		it('debug(): nothing without set_debug; FPS, factor and camera rows with it', () => {
			const r = vi.spyOn(load_bmpf, 'bmpf_txt_r').mockImplementation(() => {});
			const units = vi.spyOn(handle_units, 'draw_units_debug').mockImplementation(() => {});
			dbg.debug();
			expect(r).not.toHaveBeenCalled();
			expect(units).not.toHaveBeenCalled();

			G.set_debug = 1;
			G.fps = 50;
			G.f = Math.fround(1.23456789);
			PositionEntity(G.cam, 10.6, -2.5, 3.5);
			dbg.debug();
			expect(units).toHaveBeenCalledOnce();
			expect(r.mock.calls).toEqual([
				[797, 0, '50 FPS', 5],
				[797, 12, '1.234 Factor', 5],
				[797, 25, 'cam: 11|-2|4', 5],
				[797, 37, 'pitch: 0 yaw: 0', 5]
			]);
		});

		it('debug(): connections, debug times and sequence rows', () => {
			const r = vi.spyOn(load_bmpf, 'bmpf_txt_r').mockImplementation(() => {});
			vi.spyOn(handle_units, 'draw_units_debug').mockImplementation(() => {});
			G.set_debug = 1;
			G.set_debug_rt = 1;
			G.set_debug_seq = 1;
			G.set_debug_rt_objects = 'O';
			G.set_debug_rt_units = 'U';
			G.set_debug_rt_items = 'I';
			G.set_debug_rt_infos = 'N';
			G.set_debug_rt_states = 'S';
			G.set_debug_rt_particles = 'P';
			G.set_debug_rt_cull = 'C';
			G.set_debug_rt_poststuff = 'X';
			G.set_debug_rt_updateworld = 'W';
			G.set_debug_rt_render = 7;
			G.seq_start = 400;
			G.seq_cpoint = 2;
			Object.assign(New(Tudp_con), { ip: (10 << 24) | 1, port: 5000 });
			Object.assign(New(Tudp_con), { ip: (10 << 24) | 2, port: 5001 });
			for (let i = 0; i < 14; i++) Object.assign(New(Tseq), { t: i * 100, event: 'ev' + i });
			G.f = 1;
			now = 1000;
			dbg.debug();
			// MilliSecs(): 1020 at the start (debugtime), 1040 for "ms Debug", 1060 for "SEQ T"
			const rows = r.mock.calls.map((c) => `${c[1]}:${c[2]}:${c[3] ?? 0}`);
			expect(rows.slice(0, 4)).toEqual(['0:0 FPS:5', '12:1.0 Factor:5', '450:10.0.0.1:5000:0', '465:10.0.0.2:5001:0']);
			expect(rows.slice(4, 15)).toEqual(['25:O:5', '37:U:5', '49:I:5', '61:N:5', '73:S:5', '85:P:5', '97:C:5', '109:X:5', '121:W:5', '133:7 ms Rendertime:5', '145:20 ms Debug:5']);
			expect(rows[15]).toBe('157:SEQ T: 660 CAM: 2:5');
			// eleven sequence rows (i>10 exits after the eleventh)
			expect(rows.slice(16, 27)).toEqual(Array.from({ length: 11 }, (_, i) => `${169 + i * 12}:${i * 100} ev${i}:5`));
			expect(rows.slice(27)).toEqual(['301:cam: 0|0|0:5', '313:pitch: 0 yaw: 0:5']);
		});

		it('debug(): test map hint and F12 back to the editor (deferred)', async () => {
			const c = vi.spyOn(load_bmpf, 'bmpf_txt_c').mockImplementation(() => {});
			const order: string[] = [];
			vi.spyOn(editor_functions, 'editor_ini').mockImplementation(async () => {
				order.push(`editor_ini section=${G.m_section}`);
			});
			vi.spyOn(e_load_map, 'load_map').mockImplementation(async (path, pw) => {
				order.push(`load_map ${path}|${pw} section=${G.m_section}`);
				return 1;
			});
			G.set_debug_testmap = 1;
			G.set_debug_testmapfile = 'my\\map';
			G.set_drawinterface = 1;
			G.in_cursor = 1;
			G.m_section = Csection_menu;
			dbg.debug();
			expect(c).not.toHaveBeenCalled();

			G.m_section = Csection_game_sp;
			G.set_debug = 0;
			dbg.debug();
			expect(c.mock.calls.length).toBe(1);
			expect(c.mock.calls[0].slice(0, 2)).toEqual([400, 580]);
			expect(c.mock.calls[0][3]).toBe(1);
			expect(hasDeferred()).toBe(false);

			G.set_drawinterface = 0;
			G.set_debug = 1;
			vi.spyOn(load_bmpf, 'bmpf_txt_r').mockImplementation(() => {});
			vi.spyOn(handle_units, 'draw_units_debug').mockImplementation(() => {});
			injectKeyDown(88);
			dbg.debug();
			injectKeyUp(88);
			expect(c.mock.calls.length).toBe(1);
			expect(hasDeferred()).toBe(true);
			expect(order).toEqual([]);
			await runDeferred();
			expect(order).toEqual([`editor_ini section=${Csection_game_sp}`, `load_map maps\\my\\map.s2| section=${Csection_editor}`]);
			expect([G.m_section, G.in_edmap, G.set_debug]).toEqual([Csection_editor, 'my\\map', 0]);

			// an absolute path is used as it is; the check map leaves in_edmap empty
			for (const [file, path, edmap] of [
				['C:\\x\\y', 'C:\\x\\y.s2', 'C:\\x\\y'],
				['editor\\checkmap', 'maps\\editor\\checkmap.s2', '']
			]) {
				order.length = 0;
				G.m_section = Csection_game_sp;
				G.set_debug_testmapfile = file;
				G.in_edmap = '?';
				injectKeyDown(88);
				dbg.debug();
				injectKeyUp(88);
				await runDeferred();
				expect(order[1]).toBe(`load_map ${path}| section=${Csection_editor}`);
				expect(G.in_edmap).toBe(edmap);
			}
		});

		it('debug_map: units near the camera as yellow dots around the red centre', () => {
			SetBuffer(BackBuffer());
			PositionEntity(G.cam, 0, 50, 0);
			const near = New(Tunit);
			near.h = CreatePivot();
			PositionEntity(near.h, -10, 0, -20); // x=(0+10)*0.3=3, z=6
			near.ai_cx = -10;
			near.ai_cz = -20;
			const far = New(Tunit);
			far.h = CreatePivot();
			PositionEntity(far.h, -1000, 0, 0); // x=300 >= 268: not drawn
			const farz = New(Tunit);
			farz.h = CreatePivot();
			PositionEntity(farz.h, 0, 0, 900); // z=-270: Abs >= 254: not drawn
			dbg.debug_map();
			const px = (x: number, y: number): number => ReadPixelFast(x, y, BackBuffer()) & 0xffffff;
			// centre: cx=236+268=504, cz=63+254=317
			expect(px(503, 316)).toBe(0xff0000);
			expect(px(504, 317)).toBe(0xff0000);
			// unit: black 4x4 at (505,321), yellow 2x2 at (506,322)
			expect(px(506, 322)).toBe(0xffff00);
			expect(px(507, 323)).toBe(0xffff00);
			expect(px(505, 321)).toBe(0x000000);
			expect(px(508, 324)).toBe(0x000000);
			expect(px(504 + 300, 317)).not.toBe(0xffff00);
			expect(px(504, 317 - 270)).not.toBe(0xffff00);
		});
	});

	// =================================================================================
	// mods.bb
	// =================================================================================

	describe('mods.bb', () => {
		it('mod_copy: copies once, reports in the console', () => {
			CreateDir('modtest_a');
			CreateDir('modtest_b');
			expect(writeFileBytes('modtest_a\\x.txt', stringToBytes('hello'))).toBe(true);
			mods.mod_copy('modtest_a\\', 'modtest_b\\', 'x.txt');
			expect(bytesToString(readFileBytes('modtest_b\\x.txt')!)).toBe('hello');
			expect(lines()).toEqual(["Copying 'x.txt' ..."]);
			writeFileBytes('modtest_a\\x.txt', stringToBytes('changed'));
			mods.mod_copy('modtest_a\\', 'modtest_b\\', 'x.txt');
			expect(bytesToString(readFileBytes('modtest_b\\x.txt')!)).toBe('hello');
			expect(lines().length).toBe(1);
		});

		it('mod_copy_template: the source is <root>core\\<src>', () => {
			CreateDir('modtest_b');
			CreateDir('modtest_b\\sys');
			expect(writeFileBytes(ROOT_DIR + 'core\\game.template', stringToBytes('tpl'))).toBe(true);
			mods.mod_copy_template('game.template', 'modtest_b\\', 'sys\\game.inf');
			expect(bytesToString(readFileBytes('modtest_b\\sys\\game.inf')!)).toBe('tpl');
			expect(lines()).toEqual(["Copying 'sys\\game.inf' ..."]);
			mods.mod_copy_template('game.template', 'modtest_b\\', 'sys\\game.inf');
			expect(lines().length).toBe(1);
		});

		it('mod_dir: creates the directory (quirk: the message never names it); fails loudly when it cannot', () => {
			mods.mod_dir('modtest_c\\', 'sub');
			expect(FileType('modtest_c\\sub')).toBe(2);
			expect(lines()).toEqual(["Creating '' ..."]);
			mods.mod_dir('modtest_c\\', 'sub');
			expect(lines().length).toBe(1);
			vi.spyOn(files, 'CreateDir').mockImplementation(() => {});
			expect(() => mods.mod_dir('modtest_c\\', 'nope')).toThrow("Unable to setup directory 'modtest_c\\nope'");
		});

		it('mod_check: creates core\\mods.inf; the standard mod is never listed', () => {
			expect(FileType(ROOT_DIR + 'core\\mods.inf')).toBe(0);
			mods.mod_check();
			expect(readFileLines(ROOT_DIR + 'core\\mods.inf')).toEqual(["### List of 'installed' mods (besides Stranded II):"]);
			mods.mod_check();
			expect(readFileLines(ROOT_DIR + 'core\\mods.inf')).toEqual(["### List of 'installed' mods (besides Stranded II):"]);
			expect(lines()).toEqual([]);
		});

		it('mod_check: a new mod is appended once and set up from the standard mod', () => {
			G.set_moddir = 'MyMod';
			const tgt = ROOT_DIR + 'mods\\MyMod\\';
			CreateDir(ROOT_DIR + 'mods\\MyMod');
			expect(FileType(tgt)).toBe(2);
			mods.mod_check();
			expect(readFileLines(ROOT_DIR + 'core\\mods.inf')).toEqual(["### List of 'installed' mods (besides Stranded II):", 'MyMod']);

			const l = lines();
			// twelve directories first
			expect(l.slice(0, 12)).toEqual(Array(12).fill("Creating '' ..."));
			for (const d of ['gfx', 'maps', 'maps\\adventure', 'maps\\editor', 'maps\\menu', 'saves', 'sfx', 'sfx\\speech', 'skies', 'sprites', 'sys', 'sys\\gfx']) {
				expect(FileType(tgt + d)).toBe(2);
			}
			expect(l.slice(12, 16)).toEqual(["Copying 'sys\\controls.cfg' ...", "Copying 'sys\\settings.cfg' ...", "Copying 'gfx\\model.b3d' ...", "Copying 'maps\\menu\\menu.s2' ..."]);
			expect(l).toContain("Copying 'sys\\strings.inf' ...");
			expect(l).toContain("Copying 'sys\\game.inf' ...");
			expect(l[l.length - 1]).toMatch(/^Copying 'sfx\\mat_.*' \.\.\.$/);
			expect(l.filter((x) => /^Copying 'sprites\\/.test(x)).length).toBeGreaterThan(5);
			// data files are really there
			expect(readFileBytes(tgt + 'sys\\strings.inf')).toEqual(readFileBytes('sys\\strings.inf'));
			expect(readFileBytes(tgt + 'sys\\states.inf')!.length).toBeGreaterThan(100);

			// listed now: nothing happens the second time
			const n = l.length;
			mods.mod_check();
			expect(lines().length).toBe(n);
			expect(readFileLines(ROOT_DIR + 'core\\mods.inf')!.length).toBe(2);
			// and mod_setup() itself stops at the existing sys directory
			mods.mod_setup();
			expect(lines().length).toBe(n);
		});

		it('mod_setup: does nothing when the mod directory does not exist', () => {
			G.set_moddir = 'Ghost';
			mods.mod_setup();
			expect(lines()).toEqual([]);
			mods.mod_check();
			// listed, but not set up
			expect(readFileLines(ROOT_DIR + 'core\\mods.inf')).toEqual(["### List of 'installed' mods (besides Stranded II):", 'Ghost']);
			expect(lines()).toEqual([]);
		});
	});

	// =================================================================================
	// unrealsoftware.bb
	// =================================================================================

	describe('unrealsoftware.bb', () => {
		/** The fade as the original computes it: frames until the loop ends, and the alpha of every frame. */
		function fade(keyS: (frame: number) => boolean = () => false): number[] {
			const f = Math.fround;
			const out: number[] = [];
			let a = f(-0.3);
			let fadeDir = 0;
			for (;;) {
				if (fadeDir === 0) {
					a = f(a + f(0.025));
					if (a > 2.5) fadeDir = 1;
				} else {
					a = f(a - f(0.025));
					if (a < -0.5) break;
				}
				out.push(a);
				if (keyS(out.length)) {
					a = f(1.5);
					fadeDir = 0;
				}
			}
			return out;
		}

		it('fades the logo in and out, one frame per step, and frees it', async () => {
			await RT.world.preload(['sys\\gfx\\logo.bmp']);
			const alpha = vi.spyOn(bb3d, 'EntityAlpha');
			const free = vi.spyOn(bb3d, 'FreeEntity');
			const freeTex = vi.spyOn(bb3d, 'FreeTexture');
			let frames = 0;
			setFrameHook(() => void frames++);
			PositionEntity(G.cam, 5, 6, 7);
			await unrealsoftware();
			const expected = fade();
			expect(expected.length).toBeGreaterThan(225);
			expect(expected.length).toBeLessThan(240);
			expect(frames).toBe(expected.length);
			expect(alpha.mock.calls.map((c) => c[1])).toEqual(expected);
			expect(expected[0]).toBe(Math.fround(Math.fround(-0.3) + Math.fround(0.025)));
			expect(Math.max(...expected)).toBeGreaterThan(2.5);
			expect(EntityX(G.cam)).toBe(0);
			expect(free).toHaveBeenCalledOnce();
			expect(freeTex).toHaveBeenCalledOnce();
			expect(free.mock.calls[0][0]).toBe(alpha.mock.calls[0][0]);
		});

		it('a mouse click or key ends it at once; S restarts the fade at 1.5', async () => {
			await RT.world.preload(['sys\\gfx\\logo.bmp']);
			let frames = 0;
			setFrameHook(() => {
				if (++frames === 3) injectMouseDown(1);
			});
			await unrealsoftware();
			expect(frames).toBe(3);

			frames = 0;
			setFrameHook(() => {
				if (++frames === 4) injectKeyDown(57, 32);
			});
			await unrealsoftware();
			expect(frames).toBe(4);
			injectKeyUp(57);

			// S held during frames 2..3: alpha jumps to 1.5 each time, other keys do not end the intro meanwhile
			const alpha = vi.spyOn(bb3d, 'EntityAlpha');
			frames = 0;
			setFrameHook(() => {
				++frames;
				if (frames === 2) injectKeyDown(31, 115);
				if (frames === 4) injectKeyUp(31);
			});
			await unrealsoftware();
			const expected = fade((n) => n === 2 || n === 3);
			expect(alpha.mock.calls.map((c) => c[1])).toEqual(expected);
			expect(expected[2]).toBe(Math.fround(1.5 + Math.fround(0.025)));
			expect(frames).toBe(expected.length);
		});
	});
});
