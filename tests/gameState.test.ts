/**
 * The shared foundation of the game port (src/lib/s2/game): completeness
 * against the original source, and that the pieces are wired to one storage.
 *
 * The original source is at ../s2_re/source/source (not part of this
 * repository); the tests that re-parse it are skipped when it is missing.
 * The data tests need static/game/mod (pnpm sync-assets).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSource, sourceAvailable } from '../scripts/bb-parse.mjs';
import { Rnd, SeedRnd } from '../src/lib/s2/blitz';
import { CreateCamera, CreatePivot, EntityX, PositionEntity } from '../src/lib/s2/bb3d';
import { S } from '../src/lib/s2/input/state';
import { M } from '../src/lib/s2/ui/gfx';
import { strings } from '../src/lib/s2/ui/strings';
import * as consts from '../src/lib/s2/game/consts';
import * as defs from '../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../src/lib/s2/game/defs_store';
import * as files from '../src/lib/s2/game/files';
import { clearDeferred, defer, frame, frameDue, hasDeferred, runDeferred, setFrameScheduler } from '../src/lib/s2/game/flow';
import functionIndex from '../src/lib/s2/game/function_index.json';
import { calcfpsfactor } from '../src/lib/s2/game/load_fps';
import { include_load_commandline } from '../src/lib/s2/game/load_commandline';
import { load_settings, save_settings } from '../src/lib/s2/game/load_settings';
import { PROGRAM, mainLoopStep } from '../src/lib/s2/game/main';
import { prepare_cache_viewranges } from '../src/lib/s2/game/prepare';
import { RT, hasRuntime } from '../src/lib/s2/game/rt';
import { BOUND, assembleScriptHost, createTestRuntime, disposeRuntime } from '../src/lib/s2/game/runtime';
import { DEF_ARRAY_NAMES, FORWARDED, G, OWN_NAMES, dim, resetGameState } from '../src/lib/s2/game/state';
import { setCommandLine } from '../src/lib/s2/game/sys';
import { NotPortedError, isSkeleton, live, markSkeleton, notPorted } from '../src/lib/s2/game/_stubs';
import { set_unit } from '../src/lib/s2/game/handle_units';
import { parse_sel, var_set } from '../src/lib/s2/game/parser_functions';
import * as parserVars from '../src/lib/s2/game/parser_vars';
import {
	After,
	CONST_STORE,
	Delete,
	DeleteEach,
	Each,
	First,
	HandleOf,
	InsertBefore,
	LIST_STORES,
	Last,
	New,
	ObjectOf,
	TYPES,
	TYPE_INFO,
	Tconst,
	Tdefvar,
	Tfile,
	Tfind,
	Titem,
	Tobject,
	Ttbt,
	Tunit,
	Tx,
	isNull
} from '../src/lib/s2/game/types';
import { NodeVfs } from './NodeVfs';

const haveSource = sourceAvailable();
const MOD = resolve('static/game/mod');
const haveData = existsSync(resolve(MOD, 'sys/game.inf'));
const GAME = resolve('src/lib/s2/game');

function resetLists(): void {
	for (const t of Object.values(TYPES)) {
		try {
			t.list.deleteEach();
		} catch {
			// Tconst view
		}
	}
	CONST_STORE.clear();
}

afterEach(() => {
	if (hasRuntime('script')) disposeRuntime();
	resetGameState();
	resetDefs();
	resetLists();
	clearDeferred();
	setFrameScheduler(null);
	setCommandLine(null);
});

// =====================================================================================
// completeness against the original source
// =====================================================================================

describe.skipIf(!haveSource)('completeness against the original source', () => {
	const P = haveSource ? parseSource() : (undefined as never);

	it('parses the whole program', () => {
		expect(P.files.length).toBe(117);
		expect(P.included).toBe(113); // parser_math.bb2.bb, watersystem.bb, mp_get_client.bb, mp_get_server.bb are never included
		expect(P.functions.length).toBe(653);
		expect(P.types.length).toBe(61);
		expect(P.labels).toEqual([]); // no labels,
		expect(P.jumps).toEqual([]); // no Goto / Gosub
	});

	it('G has every Global', () => {
		const missing = P.globals.filter((g: { name: string }) => !(g.name in G)).map((g: { name: string }) => g.name);
		expect(missing).toEqual([]);
		expect(P.globals.length).toBe(690);
	});

	it('G has every Dim array, except the definition arrays, which are accessors in defs.ts', () => {
		const top = P.dims.filter((d: { inFunction: string | null }) => !d.inFunction);
		const excluded = new Set(DEF_ARRAY_NAMES);
		const missing = top.filter((d: { name: string }) => !excluded.has(d.name) && !(d.name in G)).map((d: { name: string }) => d.name);
		expect(missing).toEqual([]);
		// deliberate exclusions: exactly the D<class>_ arrays
		for (const n of excluded) expect(n).toMatch(/^D(object|unit|item|info|state|mat)_/);
		const defAccessors = defs as unknown as Record<string, unknown>;
		const noAccessor = [...excluded].filter((n) => typeof defAccessors[n] !== 'function');
		expect(noAccessor).toEqual([]);
		// arrays re-dimensioned inside functions are the same names
		const redim = P.dims.filter((d: { inFunction: string | null }) => d.inFunction).map((d: { name: string }) => d.name);
		for (const n of redim) expect(n in G || excluded.has(n)).toBe(true);
	});

	it('arrays have the size of the original Dim', () => {
		expect(G.in_mhit.length).toBe(6);
		expect(G.in_keyname.length).toBe(263);
		expect(G.in_tercol.length).toBe(3);
		expect(G.in_tercol[2].length).toBe(3);
		expect(G.seq_msg.length).toBe(3);
		expect(G.seq_msg[0]).toEqual(['', '']);
		expect(G.grass_h.length).toBe(20); // Dim grass_h(grass_c,grass_c), grass_c=19
		expect(G.grass_h[19].length).toBe(20);
		expect(G.Drprofile.length).toBe(51); // Crandom_c=50
		expect(G.game_tercol.length).toBe(9);
		expect(G.game_tercol[0].length).toBe(4);
		expect(G.g_objectlist).toEqual([null]);
		expect(G.bmpf_framesw.length).toBe(256);
		expect(G.s.length).toBe(51);
		expect(dim(0, 2, 1)).toEqual([[0, 0], [0, 0], [0, 0]]);
		expect(dim('', -1)).toEqual([]);
	});

	it('initial values are the ones of the declarations', () => {
		expect(G.tmod).toBe(1);
		expect(G.set_drawinterface).toBe(1);
		expect(G.in_scr_sel).toBe(-1);
		expect(G.in_getkey).toBe(-1);
		expect(G.in_edzoom).toBe(1);
		expect(G.in_gtmod).toBe(1);
		expect(G.grass_c).toBe(19);
		expect(G.ed_current_class).toBe(-5);
		expect(G.game_projectiletimeout).toBe(15000);
		expect(G.game_jumptime2).toBe(450);
		expect(G.game_jumpfac).toBe(Math.fround(1.7));
		expect(G.game_jumpfac2).toBe(Math.fround(1.7));
		expect(G.Cobject_count).toBe(255);
		expect(G.Cunit_count).toBe(100);
		expect(G.looplimit).toBe(20);
		expect(G.udp_timeout).toBe(20000);
		expect(G.cam).toBeNull();
		expect(G.TCunit).toBeNull();
		expect(G.map_image).toBe(0);
		expect(G.set_name).toBe('');
	});

	it('every Const exists with its value', () => {
		const c = consts as unknown as Record<string, unknown>;
		const missing = P.consts.filter((k: { name: string }) => !(k.name in c)).map((k: { name: string }) => k.name);
		expect(missing).toEqual([]);
		expect(consts.CONST_NAMES.length).toBe(P.consts.length);
		expect(c.Cversion).toBe('1.0.0.1');
		expect(c.Cstate_count).toBe(70);
		expect(c.Cudp_sys_ack).toBe(255);
		expect(c.Cworld_minute_ms).toBe(500);
	});

	it('every Type exists with its fields in original order', () => {
		const lower = new Map(TYPE_INFO.map((t) => [t.bb.toLowerCase(), t]));
		for (const t of P.types as { name: string; fields: { name: string; type: string; size: number | null }[] }[]) {
			const info = lower.get(t.name.toLowerCase());
			expect(info, t.name).toBeDefined();
			const type = TYPES[info!.name];
			expect(type, info!.name).toBeDefined();
			expect(info!.fields).toEqual(t.fields.map((f) => f.name));
			if (info!.kind === 'reused') continue; // the record type of the owning layer (documented in TYPE_INFO.owner)
			const obj = type.create() as Record<string, unknown>;
			expect(Object.keys(obj)).toEqual(t.fields.map((f) => f.name));
			for (const f of t.fields) {
				const v = obj[f.name];
				if (f.size !== null) expect((v as unknown[]).length, `${t.name}.${f.name}`).toBe(f.size + 1);
				else if (f.type === 'string') expect(v).toBe('');
				else if (f.type === 'ref') expect(v).toBeNull();
				else expect(v === 0 || v === null, `${t.name}.${f.name}`).toBe(true);
			}
		}
		expect(TYPE_INFO.length).toBe(P.types.length);
	});

	it('the current-object pointers are on G', () => {
		for (const n of ['TCobject', 'TCunit', 'TCitem', 'TCinfo', 'TCstate', 'TCx', 'TCp', 'TCpro', 'TCup', 'g_cplayer', 'p_loop_object']) {
			expect(n in G, n).toBe(true);
		}
	});

	it('the function index lists every Function with the module that exports it', async () => {
		const index = functionIndex as {
			counts: Record<string, number>;
			functions: { name: string; file: string; module: string; export: string; async: boolean; status: string; toplevel?: boolean }[];
		};
		const byName = new Map<string, (typeof index.functions)[number][]>();
		for (const f of index.functions) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
		// every Function of the source is in the index
		for (const fn of P.functions as { name: string; file: string }[]) {
			const e = (byName.get(fn.name.toLowerCase()) ?? []).find((x) => x.file === fn.file.replace(/^includes\//, ''));
			expect(e, `${fn.name} (${fn.file})`).toBeDefined();
		}
		// the four functions of the executable that the repository lacks
		for (const n of ['ai_signal', 'ai_typesignal', 'ai_behavioursignal', 'ai_unitmode']) expect(byName.get(n)?.[0].status).toBe('ported');
		// only the network files may still be to port
		for (const f of index.functions.filter((x) => x.status === 'todo')) expect(f.file, f.name).toMatch(/^(mp_|udp_|tcpcommands)/);
		// dead files have no module
		for (const f of index.functions.filter((x) => x.status === 'dead')) expect(f.module).toBe('');
		expect(index.functions.filter((x) => x.status === 'dead').map((x) => x.name).sort()).toEqual(
			['parse_math', 'parse_math_op', 'parse_math_prev', 'parse_math_st', 'updatewatersystem'].sort()
		);

		// every listed module exists and exports the function; sync/async and ported/skeleton agree with the index
		const mods = import.meta.glob('../src/lib/s2/game/**/*.ts');
		const cache = new Map<string, Record<string, unknown>>();
		const problems: string[] = [];
		for (const f of index.functions) {
			if (f.status !== 'ported' && f.status !== 'todo') continue;
			const path = f.module.replace('$lib/s2/game/', '../src/lib/s2/game/') + '.ts';
			if (!mods[path]) {
				problems.push(`${f.name}: module ${f.module} does not exist`);
				continue;
			}
			if (!cache.has(path)) cache.set(path, (await mods[path]()) as Record<string, unknown>);
			const fn = cache.get(path)![f.export];
			if (typeof fn !== 'function') {
				problems.push(`${f.name}: ${f.module} does not export ${f.export}`);
				continue;
			}
			if (f.status === 'ported' && isSkeleton(fn)) problems.push(`${f.name}: index says ported, module has a skeleton`);
			const isAsync = fn.constructor.name === 'AsyncFunction';
			// an agent that has ported a todo function must keep the index's sync/async; ported functions are checked exactly
			if (f.async !== isAsync && !(f.status === 'ported' && f.async && !isAsync && /^(include_load_|load_)/.test(f.name))) {
				// `export const include_x = load_x` aliases are AsyncFunctions too, so no exception is needed for them
				problems.push(`${f.name}: index says ${f.async ? 'async' : 'sync'}, module is ${isAsync ? 'async' : 'sync'}`);
			}
		}
		expect(problems).toEqual([]);
		expect(index.counts.functions).toBe(P.functions.length + 4);
	});

	it('the generated files are up to date with the generator', async () => {
		const { execFileSync } = await import('node:child_process');
		const out = execFileSync(process.execPath, [resolve('scripts/gen-game-foundation.mjs'), '--check'], { encoding: 'utf8' });
		expect(out).toContain('up to date');
	});
});

// =====================================================================================
// G: one storage per variable
// =====================================================================================

describe('G', () => {
	it('forwards the input, image and string globals to the layers that own them', () => {
		G.in_mx = 123;
		expect(S.in_mx).toBe(123);
		S.in_key = 65;
		expect(G.in_key).toBe(65);
		G.in_input[3] = 'abc';
		expect(S.in_input[3]).toBe('abc');
		G.in_keys = dim(0, 20);
		expect(S.in_keys).toBe(G.in_keys);
		G.gfx_bar = 0;
		expect(G.gfx_icons).toBe(M.gfx_icons);
		expect(G.gfx_cursor).toBe(M.gfx_cursor);
		expect(G.s).toBe(strings.s);
		strings.sm[5] = 'x';
		expect(G.sm[5]).toBe('x');
		strings.sm[5] = '';
		G.f = 2;
		expect(S.f).toBe(2);
	});

	it('converts the entity handles the input layer stores as 0', () => {
		expect(G.in_pe).toBeNull();
		expect(S.in_pe).toBe(0);
		S.in_fraph = 0;
		expect(G.in_fraph).toBeNull();
	});

	it('every name is either stored or forwarded, never both', () => {
		const fwd = [...FORWARDED.S, ...FORWARDED.M, ...FORWARDED.bmpf, ...FORWARDED.strings] as string[];
		expect(new Set(fwd).size).toBe(fwd.length);
		for (const n of fwd) {
			expect(OWN_NAMES).not.toContain(n);
			expect(Object.getOwnPropertyDescriptor(G, n)?.get, n).toBeTypeOf('function');
		}
		for (const n of OWN_NAMES) expect(Object.getOwnPropertyDescriptor(G, n)?.get, n).toBeUndefined();
	});

	it('resetGameState restores program-start values', () => {
		G.set_debug = 1;
		G.in_mx = 5;
		G.game_exh_move[1] = 3;
		G.seq_msg[2][1] = 'x';
		resetGameState();
		expect(G.set_debug).toBe(0);
		expect(G.in_mx).toBe(0);
		expect(G.game_exh_move).toEqual([0, 0, 0]);
		expect(G.seq_msg[2][1]).toBe('');
	});
});

// =====================================================================================
// Types and lists
// =====================================================================================

describe('Types', () => {
	it('New / Each / Delete / First / Last / After on a class Type', () => {
		const a = New(Tunit);
		const b = New(Tunit);
		const c = New(Tunit);
		a.id = 1;
		b.id = 2;
		c.id = 3;
		expect(First(Tunit)).toBe(a);
		expect(Last(Tunit)).toBe(c);
		expect(After(Tunit, a)).toBe(b);
		const seen: number[] = [];
		// For Tunit.Tunit=Each Tunit ... Delete inside the loop
		let u: Tunit | null;
		for (u = First(Tunit); u !== null; u = After(Tunit, u)) {
			seen.push(u.id);
			if (u.id === 2) Delete(Tunit, u);
		}
		expect(seen).toEqual([1, 2, 3]);
		expect(isNull(Tunit, b)).toBe(true);
		expect(isNull(Tunit, a)).toBe(false);
		expect([...Each(Tunit)].map((x) => x.id)).toEqual([1, 3]);
		InsertBefore(Tunit, c, a);
		expect(Tunit.list.toArray().map((x) => x.id)).toEqual([3, 1]);
		DeleteEach(Tunit);
		expect(Tunit.list.count).toBe(0);
		expect(() => After(Tunit, null)).toThrow('Memory access violation');
	});

	it('fields have Blitz defaults and independent arrays', () => {
		const i = New(Tinfoish());
		const j = New(Tinfoish());
		i.ints[1] = 5;
		expect(j.ints).toEqual([0, 0, 0]);
		expect(i.strings).toEqual(['', '', '']);
		expect(New(Tobject).h).toBeNull();
		expect(New(Titem).count).toBe(0);
	});

	it('Handle / Object', () => {
		const a = New(Tfind);
		const h = HandleOf(Tfind, a);
		expect(h).toBeGreaterThan(0);
		expect(HandleOf(Tfind, a)).toBe(h);
		expect(ObjectOf(Tfind, h)).toBe(a);
		expect(ObjectOf(Tunit, h)).toBeNull();
		Delete(Tfind, a);
		expect(HandleOf(Tfind, a)).toBe(0);
		expect(ObjectOf(Tfind, h)).toBeNull();
		expect(HandleOf(Tfind, null)).toBe(0);
	});

	it('reused Types are views of the owning layer array', () => {
		const row = New(Ttbt);
		row.txt = 'hello';
		expect(S.Ttbt).toEqual([{ txt: 'hello' }]);
		S.Tfile.push({ name: 'a', path: 'p', typ: 1, icon: 0 });
		expect(First(Tfile)?.name).toBe('a');
		// deleting inside a loop over an array-backed list
		New(Ttbt).txt = 'b';
		New(Ttbt).txt = 'c';
		const seen: string[] = [];
		let t: Ttbt | null;
		for (t = First(Ttbt); t !== null; t = After(Ttbt, t)) {
			seen.push(t.txt);
			if (t.txt !== 'b') Delete(Ttbt, t);
		}
		expect(seen).toEqual(['hello', 'b', 'c']);
		expect(S.Ttbt.map((x) => x.txt)).toEqual(['b']);
		DeleteEach(Ttbt);
		DeleteEach(Tfile);
		expect(S.Tfile.length).toBe(0);
	});

	it('Tconst is a view of the constant table', () => {
		CONST_STORE.set('wood', 7);
		expect([...Each(Tconst)]).toEqual([{ name: 'wood', value: 7 }]);
		expect(Tconst.list.count).toBe(1);
	});
});

function Tinfoish() {
	return TYPES.Tinfo as unknown as { typeName: string; list: (typeof Tunit)['list']; create(): { ints: number[]; strings: string[] } } as never as {
		typeName: string;
		list: import('../src/lib/s2/game/bblist').BBList<{ ints: number[]; strings: string[] }>;
		create(): { ints: number[]; strings: string[] };
	};
}

// =====================================================================================
// runtime: wiring
// =====================================================================================

describe('runtime (headless)', () => {
	it('binds the layer objects to G and shares the lists', async () => {
		await createTestRuntime();
		// script engine
		G.p_env_class = 2;
		expect(RT.script.p_env_class).toBe(2);
		RT.script.p_return = 'r';
		expect(G.p_return).toBe('r');
		RT.script.pv.impact_x = 1.5;
		expect(G.pv_impact_x).toBe(1.5);
		G.set_debug = 1;
		expect(RT.script.set_debug).toBe(1);
		G.m_section = consts.Csection_editor;
		expect(RT.script.m_section_editor).toBe(true);
		expect(RT.core.editor).toBe(true);
		G.m_section = consts.Csection_menu;
		RT.script.dialogue.buttons[3].txt = 'Ok';
		expect(G.in_sb_txt[3]).toBe('Ok');
		G.in_sb = dim(0, 9);
		G.in_sb[2] = 1;
		expect(RT.script.dialogue.buttons[2].active).toBe(1);
		// the Tx list is the engine's list
		parserVars.var_set('answer', '42');
		expect(Tx.list.count).toBe(1);
		expect(First(Tx)?.value).toBe('42');
		expect(RT.script.tx.items).toBe(LIST_STORES.Tx);
		const x = New(Tx);
		x.mode = 1;
		x.key = 'other';
		x.value = '7';
		expect(parserVars.var_get('other')).toBe('7');
		// constants
		parserVars.const_set('#stone', 3);
		expect(CONST_STORE.get('stone')).toBe(3);
		// environment core
		G.map_hour = 13;
		expect(RT.core.map_hour).toBe(13);
		RT.core.env_wcol = [1, 2, 3];
		expect(G.env_wcol).toEqual([1, 2, 3]);
		RT.core.e_clear();
		expect(G.env_wcol).toEqual([220, 110, 90]);
		expect(G.set_flarefx).toBe(1);
		// frame timer
		G.gt = 500;
		expect(RT.timer.gt).toBe(500);
		expect(RT.core.timer).toBe(RT.timer);
		// audio
		G.set_fxvolume = 0.5;
		expect(RT.audio.set_fxvolume).toBe(0.5);
		RT.audio.sfx_click = 9;
		expect(G.sfx_click).toBe(9);
		expect(RT.audio.Tres).toBe(LIST_STORES.Tres);
		// every binding points at an existing G variable
		expect(BOUND.length).toBeGreaterThan(150);
		for (const b of BOUND) expect(b.g.replace(/\(i\)$/, '') in G, `${b.object}.${b.field}`).toBe(true);
	});

	it('script engine and game code draw from the same random generator', async () => {
		await createTestRuntime();
		SeedRnd(1234);
		const a = [RT.script.Rnd(0, 1), Rnd(0, 1), RT.script.Rand(1, 100)];
		SeedRnd(1234);
		const b = [Rnd(0, 1), RT.script.Rnd(0, 1), RT.script.Rand(1, 100)];
		expect(a).toEqual(b);
	});

	it('assembles the ScriptHost from game/script_host/*.ts; missing methods are inert', async () => {
		const { host, provided } = assembleScriptHost();
		expect(provided.has('con_add')).toBe(true);
		expect(provided.get('entities')).toContain('script_host/core.ts');
		const u = New(Tunit);
		u.id = 5;
		u.typ = 3;
		expect(host.entities(consts.Cclass_unit)).toEqual([u]);
		expect(host.con_unit(5)).toBe(1);
		expect(G.TCunit).toBe(u);
		expect(host.con_unit(6)).toBe(0);
		// a command no module implements yet does nothing and returns undefined
		expect((host as unknown as Record<string, () => unknown>).cmd_definitely_missing()).toBeUndefined();
	});

	it('runs a script through the facades (worked example of PORTING_GUIDE.md)', async () => {
		await createTestRuntime();
		const u = New(Tunit);
		u.id = 1;
		u.typ = 1;
		G.g_player = 1;
		// parse_sel-style: load a script into the parse cache and run it for unit 1
		RT.script.loadstring_parsecache('on:test {¦$x=5;¦$x+=2;¦}¦');
		RT.script.parse_env(consts.Cclass_unit, 1, 'test');
		RT.script.parse();
		expect(parserVars.var_get('x')).toBe('7');
		expect(RT.script.errors).toEqual([]);
		void parse_sel;
		void var_set;
	});

	it('bb3d commands work on the headless world', async () => {
		await createTestRuntime();
		G.cam = CreateCamera();
		const p = CreatePivot();
		PositionEntity(p, 3, 4, 5);
		expect(EntityX(p)).toBe(3);
		expect(RT.world.renderer ?? null).toBeNull();
		expect(() => RT.env).toThrow(/headless/);
	});
});

// =====================================================================================
// skeletons, stubs, flow
// =====================================================================================

describe('skeletons and flow', () => {
	it('a skeleton throws NotPortedError and is recognised; live() picks the stand-in; ported modules are no skeletons', () => {
		const skeleton = (): number => notPorted('skeleton');
		markSkeleton(skeleton);
		expect(isSkeleton(skeleton)).toBe(true);
		expect(() => skeleton()).toThrow(NotPortedError);
		expect(isSkeleton(calcfpsfactor)).toBe(false);
		// set_unit (handle_units.bb) is ported: invalid typ -> -1, TCunit Null
		expect(isSkeleton(set_unit)).toBe(false);
		const real = () => 1;
		expect(live(real, () => 2)()).toBe(1);
		expect(live(skeleton, () => 2)()).toBe(2);
	});

	it('defer runs queued blocking work in order', async () => {
		const log: string[] = [];
		defer(async () => {
			log.push('a');
			defer(() => {
				log.push('c');
			});
			await Promise.resolve();
			log.push('b');
		});
		expect(hasDeferred()).toBe(true);
		await runDeferred();
		expect(log).toEqual(['a', 'b', 'c']);
		expect(hasDeferred()).toBe(false);
	});

	it('frame() uses the installed scheduler', async () => {
		let n = 0;
		setFrameScheduler((cb) => {
			n++;
			cb();
		});
		await frame();
		await frame();
		expect(n).toBe(2);
	});

	it('calcfpsfactor: f# is 1.0 at the 20 ms limit and the wait is accounted for', async () => {
		const { setClock } = await import('../src/lib/s2/blitz');
		let now = 1000;
		setClock(() => now);
		G.ms = 1000;
		now = 1005; // frame took 5 ms: the original waits until 20
		calcfpsfactor();
		expect(G.f).toBe(1);
		expect(frameDue()).toBe(false);
		now = 1020;
		expect(frameDue()).toBe(true);
		now = 1040;
		G.in_gtmod = 0.5;
		calcfpsfactor();
		expect(G.f).toBe(1);
		expect(G.in_gtmod).toBe(1);
		now = 1050;
		calcfpsfactor();
		expect(G.f).toBe(2.5);
		setClock(() => performance.now());
	});

	it('the main loop step runs the section function, deferred work, console and counts the frame', async () => {
		await createTestRuntime();
		let ran = 0;
		defer(() => {
			ran++;
		});
		// a section value without a Case: only the "Everywhere" part of the loop runs
		G.m_section = 99;
		const before = G.gframe;
		await mainLoopStep();
		expect(G.gframe).toBe(before + 1);
		expect(ran).toBe(1);
		expect(G.m_section).toBe(99);
		expect(PROGRAM.phase).toBeTypeOf('string');
		// the section functions main.ts dispatches to are the ported ones
		const { menu } = await import('../src/lib/s2/game/menu');
		const { game } = await import('../src/lib/s2/game/game');
		const { editor } = await import('../src/lib/s2/game/editor');
		for (const f of [menu, game, editor]) expect(isSkeleton(f)).toBe(false);
	});
});

// =====================================================================================
// files
// =====================================================================================

describe('files.ts', () => {
	const base = new Map<string, Uint8Array>([
		['sys/settings.cfg', files.stringToBytes('### x\r\n800\r\n600\r\n')],
		['maps/a.s2', Uint8Array.of(1, 2, 3)],
		['gfx/tree.bmp', Uint8Array.of(66, 77)]
	]);
	const vfs = {
		exists: (p: string) => base.has(p.replaceAll('\\', '/').toLowerCase()),
		list: () => [],
		readBytes: async (p: string) => base.get(p.replaceAll('\\', '/').toLowerCase())!,
		url: (p: string) => p
	};
	const stored = new Map<string, files.StoredFile>();
	const persistence: files.Persistence = {
		load: async () => new Map(stored),
		put: (k, f) => void stored.set(k, f),
		delete: (k) => void stored.delete(k)
	};
	const warm = () => files.warmUp({ vfs, allFiles: ['sys/settings.cfg', 'maps/a.s2', 'gfx/tree.bmp'], persistence });

	it('reads base files synchronously after the warm-up; media files only after ensureFile', async () => {
		stored.clear();
		await warm();
		expect(files.FileType('sys\\settings.cfg')).toBe(1);
		expect(files.FileType('SYS/Settings.CFG')).toBe(1);
		expect(files.FileType('sys')).toBe(2);
		expect(files.FileType('nothing.txt')).toBe(0);
		const s = files.ReadFile('sys\\settings.cfg');
		expect(s).not.toBe(0);
		expect(files.ReadLine(s)).toBe('### x');
		expect(files.ReadLine(s)).toBe('800');
		expect(files.Eof(s)).toBe(0);
		expect(files.ReadLine(s)).toBe('600');
		expect(files.Eof(s)).toBe(1);
		files.CloseFile(s);
		expect(files.FileType('gfx\\tree.bmp')).toBe(1);
		expect(files.ReadFile('gfx\\tree.bmp')).toBe(0); // not loaded
		expect(await files.ensureFile('gfx\\tree.bmp')).toBe(true);
		expect(files.FileSize('gfx\\tree.bmp')).toBe(2);
	});

	it('writes go to the overlay, persist, and absolute paths below the mod are the same files', async () => {
		stored.clear();
		await warm();
		expect(files.WriteFile('nodir\\x.sav')).toBe(0); // the directory does not exist
		files.CreateDir('saves');
		expect(files.FileType('saves')).toBe(2);
		const s = files.WriteFile('saves\\Game1.sav');
		files.WriteLine(s, 'hello');
		files.WriteInt(s, -5);
		files.WriteShort(s, 65535);
		files.WriteFloat(s, 1.5);
		files.WriteString(s, 'abc');
		files.WriteByte(s, 200);
		files.CloseFile(s);
		expect(files.FileType(files.ROOT_DIR + 'mods\\Stranded II\\saves\\game1.sav')).toBe(1);
		const r = files.ReadFile('saves/game1.sav');
		expect(files.ReadLine(r)).toBe('hello');
		expect(files.ReadInt(r)).toBe(-5);
		expect(files.ReadShort(r)).toBe(65535);
		expect(files.ReadFloat(r)).toBe(1.5);
		expect(files.ReadString(r)).toBe('abc');
		expect(files.ReadByte(r)).toBe(200);
		expect(files.Eof(r)).toBe(1);
		// directory listing: base and overlay, "." and ".." first
		const d = files.ReadDir('saves');
		const names: string[] = [];
		for (let n = files.NextFile(d); n !== ''; n = files.NextFile(d)) names.push(n);
		expect(names).toEqual(['.', '..', 'Game1.sav']);
		expect(files.dirEntries('').sort()).toEqual(['gfx', 'maps', 'saves', 'sys']);
		// replacing and deleting a base file
		files.CopyFile('maps\\a.s2', 'maps\\b.s2');
		expect([...files.readFileBytes('maps\\b.s2')!]).toEqual([1, 2, 3]);
		files.DeleteFile('maps\\a.s2');
		expect(files.FileType('maps\\a.s2')).toBe(0);
		expect(files.dirEntries('maps')).toEqual(['b.s2']);
		// a file outside the mod (core\mods.inf) lives in the overlay only
		const m = files.WriteFile(files.ROOT_DIR + 'core\\mods.inf');
		files.WriteLine(m, '### mods');
		files.CloseFile(m);
		expect(files.readFileLines(files.ROOT_DIR + 'core\\mods.inf')).toEqual(['### mods']);
		expect(files.FileType('core\\mods.inf')).toBe(0);

		// a new session sees it all again
		await warm();
		expect(files.FileType('saves\\Game1.sav')).toBe(1);
		expect(files.FileType('maps\\a.s2')).toBe(0);
		expect(files.readFileLines(files.ROOT_DIR + 'core\\mods.inf')).toEqual(['### mods']);
		expect(files.overlayFiles().map((f) => f.name).sort()).toContain('saves/Game1.sav');
	});

	it('OpenFile appends like mod_check does', async () => {
		stored.clear();
		await warm();
		const w = files.WriteFile('sys\\list.inf');
		files.WriteLine(w, 'one');
		files.CloseFile(w);
		const o = files.OpenFile('sys\\list.inf');
		files.SeekFile(o, files.FileSize('sys\\list.inf'));
		files.WriteLine(o, 'two');
		files.CloseFile(o);
		expect(files.readFileLines('sys\\list.inf')).toEqual(['one', 'two']);
	});
});

// =====================================================================================
// definitions on the real data
// =====================================================================================

describe.skipIf(!haveData)('definitions (static/game/mod)', () => {
	it('loadAllDefinitions fills the accessors, counts, constants and lists', async () => {
		const vfs = new NodeVfs(MOD);
		await createTestRuntime({ vfs });
		// a definition file written by the "player" (overlay): constants, parameters, a find
		const extra = files.WriteFile('sys\\objects_zz_test.inf');
		for (const l of ['id=250', 'const=#testobject', 'const=#', 'name=Test Object', 'param=colour,red', 'find=1,50,3,1', 'var=charge,Charge,7,0']) files.WriteLine(extra, l);
		files.CloseFile(extra);
		const sum = await defs.loadAllDefinitions();
		// counts of the shipped game
		expect(sum.limits).toEqual({ Cobject_count: G.Cobject_count, Cunit_count: G.Cunit_count, Citem_count: G.Citem_count });
		// Stranded II 1.0.0.1: 161 objects, 38 units, 119 items, 24 infos, 20 states, 51 combinations, 25 buildings, 27 groups
		expect(G.object_count).toBe(161 + 1);
		expect(G.unit_count).toBe(38);
		expect(G.item_count).toBe(119);
		expect(G.info_count).toBe(24);
		expect(G.state_count).toBe(20);
		expect(G.object_count_e).toBeGreaterThan(100);
		expect(sum.combinations).toBe(51);
		expect(sum.buildings).toBe(25);
		expect(sum.groups).toBe(27);
		expect(sum.finds).toBe(174 + 1);
		expect(sum.defparams).toBe(1);
		expect(sum.defvars).toBe(29 + 1);
		expect(defs.Dobject_name(250)).toBe('Test Object');
		expect(CONST_STORE.get('testobject')).toBe(250);
		expect(CONST_STORE.has('')).toBe(false);
		expect(sum.consts).toBe(1);
		expect(sum.defvars).toBe(Tdefvar.list.count);
		expect(sum.accessors).toBe(134);

		// accessors read the records; index 0 is the zero slot
		const firstObject = [...DEFS.objects.byId.values()][0];
		expect(defs.Dobject_name(firstObject.id)).toBe(firstObject.name);
		expect(defs.Dobject_size(firstObject.id, 1)).toBe(firstObject.size[1]);
		expect(defs.Dunit_name(1)).not.toBe('');
		expect(defs.Dunit_speed(0)).toBe(defs.Dunit_speed(1)); // player values cached in slot 0
		expect(defs.Ditem_speed(0)).toBe(1); // "0 Values"
		expect(defs.Ditem_damage(0)).toBe('1');
		expect(defs.Dobject_name(G.Cobject_count + 1)).toBe('');
		expect(defs.Dobject_health(9999999)).toBe(0);
		expect(defs.Dmat_swim(consts.Cmat_wood)).toBe(1);
		expect(defs.Dstate_a(consts.Cstate_frostbite)).toBe(1);

		// arrays the game writes at run time
		defs.Dunit_speed.set(1, 2.5);
		expect(DEFS.units.byId.get(1)!.speed).toBe(2.5);
		defs.Dobject_modelh.set(firstObject.id, null);
		expect(defs.Dobject_modelh(firstObject.id)).toBeNull();
		defs.Dobject_size.set(firstObject.id, 2, 9);
		expect(firstObject.size[2]).toBe(9);
		// an id without a definition reads as zeros and can be written
		const free = [...Array(G.Cobject_count).keys()].find((i) => i > 0 && !DEFS.objects.byId.has(i))!;
		expect(defs.Dobject_health(free)).toBe(0);
		defs.Dobject_health.set(free, 12);
		expect(defs.Dobject_health(free)).toBe(12);
		expect(defs.Dobject_alpha(free)).toBe(0);

		// script keys and the engine's view of the definition scripts
		const scripted = [...DEFS.units.byId.values()].find((u) => u.script !== '')!;
		expect(defs.Dunit_scriptk(scripted.id)).toMatch(/^¦\w+/); // the key list: SEP_LINE + event name, ...
		const E = RT.script as unknown as { Dscript: Record<number, string[]>; Dscriptk: Record<number, string[]>; Dcount: Record<number, number> };
		expect(E.Dscript[2][scripted.id]).toBe(scripted.script);
		expect(E.Dcount[1]).toBe(G.Cobject_count);
		E.Dscript[2][scripted.id] = 'x';
		expect(defs.Dunit_script(scripted.id)).toBe('x');

		// constants: the table is the engine's
		expect(RT.script.Tconst).toBe(CONST_STORE);
		const [name, value] = [...CONST_STORE][0];
		expect(parserVars.const_get(name)).toBe(1);
		expect(G.tmp_constv).toBe(value);

		// Tfind / Tdefparam belong to existing definitions
		for (const f of Tfind.list) {
			expect([consts.Cclass_object, consts.Cclass_unit]).toContain(f.class);
			expect(f.max).toBeGreaterThanOrEqual(f.min);
		}

		// prepare_cache_viewranges on the loaded data
		G.set_viewfac = 1.5;
		prepare_cache_viewranges();
		expect(defs.Dobject_afc(firstObject.id)).toBe(Math.round(firstObject.autofade * 1.5 + 300));
	});

	it('game.inf limits apply: an id above Cobject_count is the original error', async () => {
		const vfs = new NodeVfs(MOD);
		await createTestRuntime({ vfs });
		await defs.include_load_game();
		G.Cobject_count = 10;
		await expect(defs.load_objects()).rejects.toThrow('ID between 1 and 10 expected!');
	});

	it('load_settings / save_settings round-trip through the file layer', async () => {
		const vfs = new NodeVfs(MOD);
		await createTestRuntime({ vfs });
		setCommandLine('-debug');
		include_load_commandline();
		expect(G.set_debug).toBe(1);
		expect(G.set_moddir).toBe('Stranded II');
		expect(G.set_rootdir).toBe(files.ROOT_DIR);
		load_settings();
		expect(G.set_scrx).toBeGreaterThanOrEqual(640);
		expect(G.in_keys.length).toBe(21);
		expect(G.in_keys.some((k) => k !== 0)).toBe(true);
		G.set_viewrange = 3;
		G.set_name = 'Tester';
		save_settings();
		expect(G.set_viewfac).toBe(2); // save_settings uses its own table (2), load_settings gives 2.5
		G.set_viewrange = 0;
		G.set_name = '';
		load_settings();
		expect(G.set_viewrange).toBe(3);
		expect(G.set_name).toBe('Tester');
		expect(G.set_viewfac).toBe(2.5);
		expect(existsSync(resolve(MOD, 'sys/settings.cfg'))).toBe(true);
		expect(readFileSync(resolve(MOD, 'sys/settings.cfg'), 'latin1')).not.toContain('Tester'); // the base is not touched
	});
});

void GAME;
