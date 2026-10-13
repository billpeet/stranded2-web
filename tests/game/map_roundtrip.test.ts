/**
 * Package "map": save_map writes what the original writes.
 *
 * Every shipped map is loaded with load_map (in the editor section, as the
 * author of the map did) and saved again with save_map; the result is compared
 * BYTE FOR BYTE with the file, after the fields that legitimately differ have
 * been accounted for (each one asserted on its own):
 *
 *  1. header line and version line: a map written by an older version of the
 *     game says "... 2004-2005" / "Alpha 0.0.2.3" / "Beta 0.1.0.2" / "1.0.0.0";
 *     save_map of 1.0.0.1 writes its own two lines.
 *  2. date and time lines: CurrentDate() / CurrentTime(). The test sets the
 *     clock to the moment the file was written, so they are identical.
 *  3. preview image (96x72 RGB): save_map_image() takes a new screenshot.
 *  4. password key and encoded password: the key is Rand(5,250) at every save.
 *     The saved password must decode to the same text.
 *  5. extensions of maps written by Alpha / Beta versions: those wrote the
 *     "g_drive" and "env_cweather" extensions into maps as well (1.0.0.1 only
 *     into savegames) and did not have the "lasttime" extension, which 1.0.0.1
 *     always appends. (maps\adventure\map01.s2 and maps\Survival Guide.s2.)
 *
 * Everything else is reproduced exactly: map variables, quick slots, colour
 * map, height map (see TerrainHeight_exe in _additions/map.ts), grass map,
 * objects, units, items, infos, states, extensions and attachments.
 *
 * The functions of other packages that load_map / save_map reach are replaced
 * by minimal stand-ins (an entity is a pivot at the given place), so the test
 * does not depend on the state of those packages.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, PositionEntity, RotateEntity } from '../../src/lib/s2/bb3d';
import { SeedRnd, code, setClock } from '../../src/lib/s2/blitz';
import { resetMapBridge } from '../../src/lib/s2/game/_additions/map';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import * as console_ from '../../src/lib/s2/game/console';
import { Csection_editor } from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { e_tery } from '../../src/lib/s2/game/e_environment';
import { load_map } from '../../src/lib/s2/game/e_load_map';
import { save_map } from '../../src/lib/s2/game/e_save_map';
import { readFileBytes } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, New, TYPES, Tat, Tinfo, Titem, Tobject, Tstate, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

/** Every .s2 file below maps\ (game paths). */
function shippedMaps(): string[] {
	const out: string[] = [];
	const walk = (dir: string, rel: string) => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) walk(p, rel + name + '\\');
			else if (name.toLowerCase().endsWith('.s2')) out.push(rel + name);
		}
	};
	if (existsSync(join(MOD, 'maps'))) walk(join(MOD, 'maps'), 'maps\\');
	return out.sort();
}

/** Stand-ins for the entity functions of the packages entities1 / entities2 / ai / player. */
function mockEntities(): void {
	vi.spyOn(console_, 'con_add').mockImplementation(() => {});
	vi.spyOn(handle_objects, 'set_object').mockImplementation((id, typ, x, z, yaw = 0) => {
		const o = New(Tobject);
		o.id = id;
		o.typ = typ;
		o.h = CreatePivot();
		PositionEntity(o.h, x, e_tery(x, z), z);
		RotateEntity(o.h, 0, yaw, 0);
		G.TCobject = o;
		return id;
	});
	vi.spyOn(handle_objects, 'grow_object').mockImplementation(() => {});
	vi.spyOn(handle_objects, 'serialpeak_object').mockImplementation(() => {});
	vi.spyOn(handle_objects, 'con_object').mockImplementation((id) => {
		for (const o of Tobject.list) if (o.id === id) return ((G.TCobject = o), 1);
		return 0;
	});
	vi.spyOn(handle_units, 'set_unit').mockImplementation((id, typ, x, z) => {
		const u = New(Tunit);
		u.id = id;
		u.typ = typ;
		u.h = CreatePivot();
		PositionEntity(u.h, x, e_tery(x, z), z);
		G.TCunit = u;
		return id;
	});
	vi.spyOn(handle_units, 'serialpeak_unit').mockImplementation(() => {});
	vi.spyOn(handle_units, 'con_unit').mockImplementation((id) => {
		for (const u of Tunit.list) if (u.id === id) return ((G.TCunit = u), 1);
		return 0;
	});
	vi.spyOn(ai_units, 'ai_ini').mockImplementation(() => {});
	vi.spyOn(handle_items, 'set_item').mockImplementation((id, typ, x = 0, y = 0, z = 0, count = 1) => {
		const it = New(Titem);
		it.id = id;
		it.typ = typ;
		it.count = count;
		it.h = CreatePivot();
		PositionEntity(it.h, x, y, z);
		G.TCitem = it;
		return id;
	});
	vi.spyOn(handle_items, 'serialpeak_item').mockImplementation(() => {});
	vi.spyOn(handle_items, 'con_item').mockImplementation((id) => {
		for (const it of Titem.list) if (it.id === id) return ((G.TCitem = it), 1);
		return 0;
	});
	vi.spyOn(handle_infos, 'set_info').mockImplementation((id, typ, x, y, z) => {
		const inf = New(Tinfo);
		inf.id = id;
		inf.typ = typ;
		inf.h = CreatePivot();
		PositionEntity(inf.h, x, y, z);
		G.TCinfo = inf;
		return id;
	});
	vi.spyOn(handle_infos, 'info_stv').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'info_setupsprite').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'info_setuploudspeaker').mockImplementation(() => {});
	vi.spyOn(handle_infos, 'serialpeak_info').mockImplementation(() => {});
	vi.spyOn(handle_states, 'set_state').mockImplementation((typ, parent_class, parent_id) => {
		const st = New(Tstate);
		st.typ = typ;
		st.parent_class = parent_class;
		st.parent_id = parent_id;
		G.TCstate = st;
		return 1;
	});
	vi.spyOn(handle_states, 'look_state').mockImplementation(() => {});
	vi.spyOn(game_functions, 'game_setcam').mockImplementation(() => 0);
}

interface Ext {
	start: number;
	end: number;
	mode: number;
	key: string;
	stuff: string;
}

/** Walks a map file (the format of e_save_map.bb) and returns the offsets the comparison needs. */
function walk(b: Uint8Array) {
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
	let p = 0;
	const line = () => {
		const start = p;
		let text = '';
		while (p < b.length && b[p] !== 10) {
			if (b[p] !== 13) text += String.fromCharCode(b[p]);
			p++;
		}
		p++;
		return { start, end: p, text };
	};
	const int = () => {
		const v = dv.getInt32(p, true);
		p += 4;
		return v;
	};
	const str = () => {
		const n = int();
		let t = '';
		for (let i = 0; i < n; i++) t += String.fromCharCode(b[p + i]);
		p += n;
		return t;
	};
	const lines = Array.from({ length: 12 }, line); // header, version, date, time, format, mode, type format, 4 empty, ###
	const tf = lines[6].text;
	const image = { start: p, end: (p += 96 * 72 * 3) };
	const pwkey = p++;
	const pw = line();
	const afterPw = p;
	const day = int();
	const hour = b[p++];
	const minute = b[p++];
	p++; // freezetime
	str(); // skybox
	p += 2; // multiplayer, climate
	str(); // music
	str(); // briefing
	p += 5; // fog, extended
	for (let i = 0; i < 10; i++) str(); // quickslots
	const h = int();
	p += h * h * 3;
	const heightmap = { start: p, size: 0, end: 0 };
	heightmap.size = int();
	p += (heightmap.size + 1) * (heightmap.size + 1) * 4;
	heightmap.end = p;
	p += (h + 1) * (h + 1);
	const counts: Record<string, number> = {};
	counts.objects = int();
	p += counts.objects * (4 + (tf[0] === '1' ? 2 : 1) + 12 + 8 + 4);
	counts.units = int();
	p += counts.units * (4 + (tf[1] === '1' ? 2 : 1) + 44);
	counts.items = int();
	p += counts.items * (4 + (tf[2] === '1' ? 2 : 1) + 12 + 4 + 4 + 4 + 2 + 4);
	counts.infos = int();
	for (let i = 0; i < counts.infos; i++) {
		p += 4 + 1 + 20;
		str();
	}
	counts.states = int();
	for (let i = 0; i < counts.states; i++) {
		p += 1 + 1 + 4 + 24 + 4 + 4;
		str();
	}
	const extCount = p;
	counts.extensions = int();
	const exts: Ext[] = [];
	for (let i = 0; i < counts.extensions; i++) {
		const start = p;
		p += 2 + 4;
		const mode = int();
		const key = str();
		str();
		const stuff = str();
		exts.push({ start, end: p, mode, key, stuff });
	}
	const eof = p;
	const tail = [line(), line(), line()];
	counts.attachments = 0;
	while (p < b.length) {
		line();
		p += int();
		counts.attachments++;
	}
	return { lines, image, pwkey, pw, afterPw, day, hour, minute, heightmap, counts, extCount, exts, eof, tail, mode: lines[5].text };
}

function concat(parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
	let o = 0;
	for (const a of parts) {
		out.set(a, o);
		o += a.length;
	}
	return out;
}
const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const int32 = (n: number): Uint8Array => {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setInt32(0, n, true);
	return b;
};
/** An extension record as save_map writes it: typ, parent class (bytes), parent id, mode (ints), key, value, stuff (strings). */
const extRecord = (mode: number, key: string, value: string, stuff: string): Uint8Array =>
	concat([Uint8Array.of(0, 0), int32(0), int32(mode), int32(key.length), latin1(key), int32(value.length), latin1(value), int32(stuff.length), latin1(stuff)]);

function firstDifference(a: Uint8Array, b: Uint8Array): number {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
	return a.length === b.length ? -1 : n;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

describe.skipIf(!existsSync(MOD))('save_map reproduces the shipped maps', () => {
	let now = 0;

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		mockEntities();
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

	const maps = shippedMaps();

	it('finds the shipped maps', () => {
		expect(maps.length).toBeGreaterThanOrEqual(13);
	});

	it.each(maps)('%s: load_map, then save_map gives the same bytes', async (map) => {
		const original = new Uint8Array(readFileSync(join(MOD, map.replaceAll('\\', '/'))));
		const lo = walk(original);

		// the editor needs the map password; the file stores it encoded with the key byte
		const pw = code(lo.pw.text, original[lo.pwkey], 1);

		G.m_section = Csection_editor;
		expect(await load_map(map, pw)).toBe(1);
		expect(G.map_password).toBe(pw);
		expect(G.map_mode).toBe(lo.mode);
		expect([Tobject.list.count, Tunit.list.count, Titem.list.count, Tinfo.list.count, Tstate.list.count, Tat.list.count]).toEqual([
			lo.counts.objects,
			lo.counts.units,
			lo.counts.items,
			lo.counts.infos,
			lo.counts.states,
			lo.counts.attachments
		]);

		// 2. CurrentDate() / CurrentTime(): the moment the original file was written
		const [d, mon, y] = lo.lines[2].text.split(' ');
		const [hh, mm, ss] = lo.lines[3].text.split(':').map(Number);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(Number(y), MONTHS.indexOf(mon), Number(d), hh, mm, ss));

		expect(await save_map('maps\\__roundtrip.s2', G.map_mode, pw)).toBe(1);
		vi.useRealTimers();
		const saved = readFileBytes('maps\\__roundtrip.s2')!;
		expect(saved).not.toBeNull();
		const ls = walk(saved);

		// 1. header and version line
		expect(ls.lines[0].text).toBe('### Stranded II Mapfile \xa9by Unreal Software 2004-2007');
		expect(ls.lines[1].text).toBe('1.0.0.1');
		const oldVersion = lo.lines[1].text !== '1.0.0.0';
		// 4. password key and encoded password
		expect(saved[ls.pwkey]).toBeGreaterThanOrEqual(5);
		expect(saved[ls.pwkey]).toBeLessThanOrEqual(250);
		expect(code(ls.pw.text, saved[ls.pwkey], 1)).toBe(pw);
		expect(ls.pw.text.length).toBe(lo.pw.text.length);

		// 5. extensions of Alpha / Beta maps
		const obsolete = lo.mode === 'map' ? lo.exts.filter((e) => e.mode === 6 && (e.key === 'g_drive' || e.key === 'env_cweather')) : [];
		const hasLasttime = lo.exts.some((e) => e.mode === 6 && e.key === 'lasttime');
		if (!oldVersion) {
			// a map of the release version needs no correction at all
			expect(obsolete.length).toBe(0);
			expect(hasLasttime).toBe(true);
		}
		const keptExts = lo.exts.filter((e) => !obsolete.includes(e)).map((e) => original.subarray(e.start, e.end));
		if (!hasLasttime) keptExts.push(extRecord(6, 'lasttime', '', `${lo.day},${lo.hour},${lo.minute}`));

		// --- the file the original 1.0.0.1 would write for this state, byte for byte
		const expected = concat([
			saved.subarray(ls.lines[0].start, ls.lines[1].end), // 1. header + version (asserted above)
			original.subarray(lo.lines[2].start, lo.image.start), // date, time, format, mode, type format, ..., ###
			saved.subarray(ls.image.start, ls.image.end), // 3. preview image
			saved.subarray(ls.pwkey, ls.afterPw), // 4. key + password (asserted above)
			original.subarray(lo.afterPw, lo.extCount), // map vars ... states: untouched
			int32(keptExts.length),
			...keptExts,
			original.subarray(lo.eof) // end marker and attachments: untouched
		]);
		expect(saved.length).toBe(expected.length);
		expect(firstDifference(saved, expected)).toBe(-1);
		if (!oldVersion) {
			// and without any reconstruction: everything after the password line equals the shipped file
			expect(saved.length - ls.afterPw).toBe(original.length - lo.afterPw);
			expect(firstDifference(saved.subarray(ls.afterPw), original.subarray(lo.afterPw))).toBe(-1);
		}
	});
});
