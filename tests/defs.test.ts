import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEP_LINE } from '../src/lib/s2/blitz';
import { ftoa, parseDefVar, typeExists } from '../src/lib/s2/defs/_helpers';
import {
	Cbui_atobject,
	Cbui_head,
	Cbui_req,
	loadBuildings,
	type BuildingDefs
} from '../src/lib/s2/defs/buildings';
import { Ccom_head, loadCombinations, type CombinationDefs } from '../src/lib/s2/defs/combinations';
import * as C from '../src/lib/s2/defs/constants';
import { loadGame, type GameDef } from '../src/lib/s2/defs/game';
import { loadGroups, type Tgroup } from '../src/lib/s2/defs/groups';
import { loadInfos, type InfoDefs } from '../src/lib/s2/defs/infos';
import { loadItems, type ItemDefs } from '../src/lib/s2/defs/items';
import { loadKeynames } from '../src/lib/s2/defs/keynames';
import { loadLightcycle } from '../src/lib/s2/defs/lightcycle';
import { DefinitionError, loadObjects, type ObjectDefs } from '../src/lib/s2/defs/objects';
import {
	loadSettings,
	saveSettings,
	set_viewfac_load,
	set_viewfac_save
} from '../src/lib/s2/defs/settings';
import { loadStates, parse_getstate, type StateDefs } from '../src/lib/s2/defs/states';
import { loadStrings, ss } from '../src/lib/s2/defs/strings';
import { ai_getbehaviour, loadUnits, type UnitDefs } from '../src/lib/s2/defs/units';
import { parseMap } from '../src/lib/s2/formats/map';
import type { Vfs } from '../src/lib/s2/io/Vfs';
import { NodeVfs } from './NodeVfs';

// Tests run against the original game data copied by `pnpm sync-assets`.
const root = resolve('static/game/mod');
const have = existsSync(root);
const vfs = have ? new NodeVfs(root) : (undefined as unknown as NodeVfs);

const f32 = Math.fround;

/** A Vfs holding only the given sys files, for the error paths. */
function memVfs(files: Record<string, string>): Vfs {
	const norm = (p: string) => p.replaceAll('\\', '/').toLowerCase();
	const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
	return {
		exists: (p) => map.has(norm(p)),
		list: (dir) =>
			Object.keys(files)
				.filter((k) => norm(k).startsWith(norm(dir) + '/'))
				.map((k) => k.slice(norm(dir).length + 1))
				.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
		readBytes: async (p) => {
			const text = map.get(norm(p));
			if (text === undefined) throw new Error(`File not found: ${p}`);
			return Uint8Array.from(text, (c) => c.charCodeAt(0));
		},
		url: (p) => p
	};
}

describe('definition helpers', () => {
	it('ftoa formats floats like Blitz3D', () => {
		expect(ftoa(0)).toBe('0.0');
		expect(ftoa(3)).toBe('3.0');
		expect(ftoa(f32(0.03))).toBe('0.03');
		expect(ftoa(f32(0.12))).toBe('0.12');
		expect(ftoa(f32(-1.5))).toBe('-1.5');
		expect(ftoa(100000)).toBe('100000.0');
		expect(ftoa(f32(1234.5678))).toBe('1234.57');
		expect(ftoa(12345678)).toBe('12345700.0');
	});

	it('parseDefVar follows defvar_set', () => {
		expect(parseDefVar('radius,Radius of Explosion,65,0')).toEqual({
			key: 'radius',
			descr: 'Radius of Explosion',
			defaultval: '65',
			isglobal: 0
		});
		expect(parseDefVar('x')).toEqual({ key: 'x', descr: 'x', defaultval: '', isglobal: 0 });
		expect(() => parseDefVar(',a')).toThrow('Invalid Def VAR definition (missing var name)');
	});

	it('maps behaviour and state names', () => {
		expect(ai_getbehaviour('Raptor')).toBe(2);
		expect(ai_getbehaviour('watercraft')).toBe(501);
		expect(ai_getbehaviour('nonsense')).toBe(0);
		expect(parse_getstate('intoxication')).toBe(C.Cstate_intoxication);
		expect(parse_getstate('eternal fire')).toBe(C.Cstate_eternalfire);
		expect(parse_getstate('54')).toBe(C.Cstate_speedmod);
		expect(parse_getstate('Fire')).toBeUndefined();
	});

	it('exposes the constants and material tables', () => {
		expect(C.Cworld_size).toBe(64);
		expect(C.Cworld_g).toBe(f32(9.81));
		expect(C.Cpeakblur).toBe(f32(0.97));
		expect(C.Cclass_building).toBe(150);
		expect(C.Cemnu_ed_defvars).toBe(109);
		expect(C.Cp2d_cdot).toBe(-4);
		expect(C.ai_distract).toBe(-1);
		expect(C.snd_move).toBe(8);
		expect(C.Dmat_swim).toEqual([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
		expect(C.Dmat_nofire).toEqual([0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1]);
		expect(C.Dmat_hard).toEqual([1, 1, 2, 1, 1, 0, 2, 1, 0, 0, 1, 2]);
		expect(C.get_material('Stone')).toBe(2);
		expect(C.get_material('7')).toBe(7);
		expect(C.get_material('unknown')).toBe(0);
	});

	it('picks the view range factor from the table of each function', () => {
		expect([0, 1, 2, 3, 4, 5].map(set_viewfac_load)).toEqual([0.5, 1, 1.5, 2.5, 4, 1.5]);
		expect([0, 1, 2, 3, 4, 5].map(set_viewfac_save)).toEqual([0.5, 1, 1.5, 2, 2.5, 1.5]);
	});

	it('ss fills placeholders', () => {
		expect(ss('$1 of $2 ($3) $1', 'a', 'b')).toBe('a of b () a');
	});
});

describe('original error conditions', () => {
	const player = 'id=1\nname=Player\n';

	it('units', async () => {
		await expect(loadUnits(memVfs({ 'sys/units.inf': 'id=101\n' }))).rejects.toThrow(
			'ID between 1 and 100 expected!'
		);
		await expect(loadUnits(memVfs({ 'sys/units.inf': player + 'id=1\n' }))).rejects.toThrow(
			"Unit with ID 1 is already defined as 'Player'!"
		);
		await expect(loadUnits(memVfs({ 'sys/units.inf': player + 'foo=1\n' }))).rejects.toThrow(
			"Invalid UNIT Property 'foo'"
		);
		await expect(loadUnits(memVfs({ 'sys/units.inf': '# nothing\n' }))).rejects.toThrow(
			'Unit with ID 1 must be defined (used as player unit)!'
		);
		await expect(loadUnits(memVfs({ 'sys/units.inf': player + 'var=,x\n' }))).rejects.toThrow(
			DefinitionError
		);
	});

	it('unit quirks: id defaults, vehicle values, unnamed redefinition, slot 0', async () => {
		const defs = await loadUnits(
			memVfs({
				'sys/units.inf':
					'speed=9\nid=1\nmodel=a.b3d\nfriction=0.5\nid=1\nname=P\nhealth=10\nid=2\nname=Q\nmaxdepth=7\n' +
					'model=a.b3d\nani_move=1,2,0.5\nbehaviour=watercraft\nbehaviour=bogus\nloot=5\nloot=6,3\n' +
					'const=#q\nconst=#\nscript=start\n  a = 1; \n\tb\nscript=end\nscript=start\nc\n',
				'sys/units_b.inf': 'steering=4\n',
				'sys/Units_c.inf': 'id=3\n',
				'sys/units.txt': 'id=4\n'
			})
		);
		expect(defs.count).toBe(3);
		const p = defs.byId.get(1)!;
		// the second id=1 resets the listed defaults but keeps the model
		expect(p.model).toBe('a.b3d');
		expect(p.v).toBe('0.03,0.04,2,3,3.0');
		expect(p.health).toBe(10);
		expect(p.healthchange).toBe(2);
		expect(p.mat).toBe(C.Cmat_flesh);
		const q = defs.byId.get(2)!;
		expect(q.state).toEqual([1, 0, 0, 0]);
		expect(q.health).toBe(5);
		expect(q.healthchange).toBe(0);
		// steering in the next file still applies to the last unit
		expect(q.v).toBe('0.03,0.04,4,7,3.0');
		expect(q.ani_move).toEqual({ speed: 0.5, seq: 1, f1: 1, f2: 2 });
		expect(q.behaviour).toBe(0);
		expect(q.align).toBe(1);
		expect(defs.warnings).toEqual([
			"ERROR: Invalid unit behaviour 'bogus'",
			"ERROR: Invalid unit behaviour 'bogus'"
		]);
		expect(q.loot).toEqual([
			{ typ: 5, ratio: 0, max: 1, min: 0, reqtyp: 0 },
			{ typ: 6, ratio: 0, max: 3, min: 0, reqtyp: 0 }
		]);
		expect(q.consts).toEqual(['q']);
		expect(q.script).toBe(`a = 1;${SEP_LINE}b${SEP_LINE}c${SEP_LINE}`);
		// index 0: the property before the first id, then the cached player values
		expect(defs.zero.speed).toBe(2);
		expect(defs.zero.maxweight).toBe(100000);
		expect(defs.byId.has(3)).toBe(false);
		expect(defs.countEditor).toBe(2);
	});

	it('items', async () => {
		await expect(loadItems(memVfs({ 'sys/items.inf': 'id=256\n' }))).rejects.toThrow(
			'ID between 1 and 255 expected!'
		);
		await expect(
			loadItems(memVfs({ 'sys/items.inf': 'id=2\nname=A\nid=2\n' }))
		).rejects.toThrow("Item with ID 2 is already defined as 'A'!");
		await expect(loadItems(memVfs({ 'sys/items.inf': 'id=2\ngt=1\n' }))).rejects.toThrow(
			"Invalid ITEM Property 'gt'"
		);
		const defs = await loadItems(
			memVfs({ 'sys/items.inf': 'id=2\nname=A\nw=5\nrange=7\nhealth=9\nweaponstate=fire\n' })
		);
		const a = defs.byId.get(2)!;
		expect([a.weight, a.speed, a.health, a.healthchange, a.wstate]).toEqual([5, 7, 9, -4.5, 4]);
		expect(defs.zero.speed).toBe(1);
		expect(defs.zero.damage).toBe('1');
	});

	it('infos and states', async () => {
		await expect(loadInfos(memVfs({ 'sys/infos.inf': 'id=101\n' }))).rejects.toThrow(
			'ID between 1 and 100 expected!'
		);
		await expect(loadInfos(memVfs({ 'sys/infos.inf': 'id=1\nframe=100\n' }))).rejects.toThrow(
			'Frame between 0 and 99 expected!'
		);
		await expect(loadInfos(memVfs({ 'sys/infos.inf': 'id=1\nicon=1\n' }))).rejects.toThrow(
			"Invalid INFO Property 'icon'"
		);
		await expect(loadStates(memVfs({}))).rejects.toThrow('Unable to read sys\\states.inf');
		await expect(loadStates(memVfs({ 'sys/states.inf': 'id=71\n' }))).rejects.toThrow(
			'ID between 1 and 70 expected!'
		);
		await expect(loadStates(memVfs({ 'sys/states.inf': 'id=1\nframe=31\n' }))).rejects.toThrow(
			'Frame between 0 and 30 expected!'
		);
		await expect(
			loadStates(memVfs({ 'sys/states.inf': 'id=28\nscript=start\nscript=end\n' }))
		).rejects.toThrow('States from 1-29 are fixed states which cannot have a script');
		const states = await loadStates(
			memVfs({
				'sys/states.inf':
					'id=29\nframe=5\nicon=gfx\\own.bmp\nscript=start\nx\nscript=end\nid=30\nframe=6\nicon=gfx\\none.bmp\n',
				'gfx/own.bmp': ''
			})
		);
		expect(states.byId.get(29)).toMatchObject({ frame: 0, icon: 'gfx\\own.bmp', script: 'x' + SEP_LINE });
		expect(states.byId.get(30)).toMatchObject({ frame: 6, icon: '' });
	});

	it('combinations', async () => {
		const items = await loadItems(
			memVfs({ 'sys/items.inf': 'id=1\nname=A\nid=2\nname=B\nid=3\nname=C\nid=4\n' })
		);
		const load = (text: string) => loadCombinations(memVfs({ 'sys/combinations.inf': text }), items);
		await expect(load('combi=start\nreq=1\ngen=3\ncombi=end\n')).rejects.toThrow(
			"Invalid COMBINATION. Every Combination needs at least 2 'req'-Properties!"
		);
		await expect(load('combi=start\nreq=1\nreq=2\ncombi=end\n')).rejects.toThrow(
			"Invalid COMBINATION. Every Combination needs at least 1 'gen'-Property!"
		);
		await expect(load('req=1\nreq=2\ngen=3\ncombi=end\n')).rejects.toThrow(
			"Invalid COMBINATION. A Combination has to be enclosed in 'combi=start' and 'combi=end'"
		);
		await expect(load('combi=begin\n')).rejects.toThrow(
			"Invalid COMBINATION Value for 'combi'-Property. Use either 'start' or 'end' as value!"
		);
		// item 4 has no name, item 9 is not defined
		await expect(load('combi=start\nreq=4\n')).rejects.toThrow('Invalid ITEM ID for COMBINATION (4)');
		await expect(load('combi=start\ngen=9\n')).rejects.toThrow('Invalid ITEM ID for COMBINATION (9)');
		await expect(load('combi=start\nfoo=1\n')).rejects.toThrow("Invalid COMBINATION Property 'foo'");

		const one = 'combi=start\nid=x\nreq=1,0\nreq=2,3,stay\ngen=3,-2\ncombi=end\n';
		const defs = await load(
			one + one.replace('id=x', 'id=y') + 'combi=start\nreq=1\nreq=3\ngen=2\ncombi=end\n'
		);
		expect(defs.combinations.map((c) => c.head.gid)).toEqual([1, 1, -1]);
		expect(defs.combinations.map((c) => c.head.aid)).toEqual(['x', 'y', '']);
		expect(defs.combinations[0].req.map((r) => [r.typ, r.count, r.del])).toEqual([
			[1, 1, 1],
			[2, 3, 0]
		]);
		expect(defs.combinations[0].gen[0].count).toBe(1);
	});

	it('buildings', async () => {
		const objects = await loadObjects(memVfs({ 'sys/objects.inf': 'id=1\nname=O\nid=300\nname=Far\n' }));
		const units = await loadUnits(memVfs({ 'sys/units.inf': 'id=1\nname=P\n' }));
		const items = await loadItems(memVfs({ 'sys/items.inf': 'id=1\nname=A\n' }));
		const load = (text: string) =>
			loadBuildings(memVfs({ 'sys/buildings.inf': text }), { objects, units, items, Cobject_count: 255 });

		await expect(load('id=1\nid=1\n')).rejects.toThrow('Building with ID 1 is already defined!');
		await expect(load('id=1\nobjectid=2\n')).rejects.toThrow('Invalid OBJECT ID for BUILDING (0)');
		// defined, but above limit_objects
		await expect(load('id=1\nobjectid=300\n')).rejects.toThrow('Invalid OBJECT ID for BUILDING (0)');
		await expect(load('id=1\nobjectid=1\nunitid=2\n')).rejects.toThrow('Invalid UNIT ID for BUILDING (1)');
		await expect(load('id=1\nbuildspace=sky\n')).rejects.toThrow("Invalid BUILDSPACE for BUILDING 'sky'");
		await expect(load('id=1\nbuildingsite=2\n')).rejects.toThrow(
			'Invalid OBJECT ID for BUILDING buildplace (0)'
		);
		await expect(load('id=1\nreq=2\n')).rejects.toThrow('Invalid REQ ITEM ID for BUILDING (2)');
		await expect(load('id=1\natobject=2\n')).rejects.toThrow('Invalid AT OBJECT ID for BUILDING (0)');
		await expect(load('id=1\nfoo=2\n')).rejects.toThrow("Invalid BUILDING Property 'foo'");

		const defs = await load(
			'id=1\ngroup=a\nunitid=1\nreq=1,0\ngroup=b\nbuildspace=shore\nbuildspace=hill\n' +
				'id=2\nobjectid=1\nbuildspace=water\nbuildspace=at object\nbuildingsite=1\natobject=1\n'
		);
		const [b1, b2] = defs.buildings;
		expect(b1.head).toMatchObject({ typ: -1, group: 'a' });
		// "group=" lands on the record created last, here the requirement
		expect(b1.req[0]).toMatchObject({ typ: 1, count: 1, group: 'b' });
		expect(b1.buildspace!.typ).toBe(4);
		expect(b2.buildspace!.typ).toBe(6);
		// the second buildspace left set=1, so "buildingsite" creates no record
		expect(b2.buildingsite).toBeUndefined();
		expect(b2.atobject.map((t) => t.typ)).toEqual([1]);
	});

	it('groups, game, strings, keys, lightcycle', async () => {
		expect(await loadGroups(memVfs({}))).toEqual([]);
		await expect(loadGroups(memVfs({ 'sys/groups.inf': 'state=a\n' }))).rejects.toThrow(
			"Invalid GROUP Property 'state' - only object,unit,item,info and building are allowed"
		);
		await expect(loadGroups(memVfs({ 'sys/groups.inf': 'item=\n' }))).rejects.toThrow('Missing Group Name');
		await expect(loadGroups(memVfs({ 'sys/groups.inf': 'item=a\nitem=a,b\n' }))).rejects.toThrow(
			"Group 'a' has already been defined"
		);
		expect(await loadGroups(memVfs({ 'sys/groups.inf': 'item=a\nunit=a,b\n' }))).toEqual([
			{ class: C.Cclass_item, group: 'a', name: 'a' },
			{ class: C.Cclass_unit, group: 'a', name: 'b' }
		]);

		const game = (text: string) => loadGame(memVfs({ 'sys/game.inf': text }));
		await expect(game('limit_objects=5001\n')).rejects.toThrow(
			"'limit_objects' is limited to a maximum of 5000"
		);
		await expect(game('limit_units=501\n')).rejects.toThrow("'limit_units' is limited to a maximum of 500");
		await expect(game('limit_items=10001\n')).rejects.toThrow(
			"'limit_items' is limited to a maximum of 10000"
		);
		await expect(game('scriptkey=21,x\n')).rejects.toThrow("'scriptkey' id between 0 and 20 expected!");
		await expect(game('foo=1\n')).rejects.toThrow("Invalid GAME Property 'foo'");
		const g = await game('limit_items=-5\nfirelightbrightness=300\nscriptkey=3,Jump\njumptime=9\n');
		expect(g.Citem_count).toBe(1);
		expect(g.firelightbrightness).toBe(255);
		expect([g.scriptkeys, g.scriptkeyn[3]]).toEqual([1, 'Jump']);
		expect([g.jumptime, g.jumptime2, g.jumpfac, g.jumpfac2]).toEqual([9, 9, f32(1.7), f32(1.7)]);
		expect(g.set_gore).toBeUndefined();
		expect((await game('')).divetime).toBe(8000);

		await expect(loadStrings(memVfs({}))).rejects.toThrow('Unable to read sys\\strings.inf');
		await expect(loadStrings(memVfs({ 'sys/strings.inf': '0051=x\n' }))).rejects.toThrow(
			"Invalid String ID '0051'"
		);
		await expect(loadStrings(memVfs({ 'sys/strings.inf': 'm251=x\n' }))).rejects.toThrow(
			"Invalid String ID '251'"
		);
		await expect(loadStrings(memVfs({ 'sys/strings.inf': 'x001=x\n' }))).rejects.toThrow(
			"Invalid String ID 'x001'"
		);
		expect((await loadStrings(memVfs({ 'sys/strings.inf': ' 0007 = kept \n' }))).s[7]).toBe(' kept ');

		await expect(loadKeynames(memVfs({ 'sys/keys.inf': '263=x\n' }))).rejects.toThrow(
			"Invalid KEY ID '263' - value between 0 and 262 expected"
		);
		await expect(loadKeynames(memVfs({ 'sys/keys.inf': 'mouse9=x\n' }))).rejects.toThrow(
			"Invalid KEY 'mouse9'"
		);
		await expect(loadLightcycle(memVfs({ 'sys/lightcycle.inf': '24=1,2,3\n' }))).rejects.toThrow(
			"Invalid lighcycle Property '24' - Use a number between 0 and 23"
		);
	});

	it('settings defaults without files', async () => {
		const set = await loadSettings(memVfs({}));
		expect(set).toMatchObject({
			set_msens: f32(0.2),
			set_minvert: 1,
			set_msmooth: 0,
			set_scrx: 800,
			set_scry: 600,
			set_scrbit: 32,
			set_scrx_c: 0,
			set_hwmultitex: 1,
			set_mb: 1,
			set_mb_alpha: f32(0.35),
			set_viewrange: 0,
			set_viewfac: 0.5,
			set_musicvolume: 0
		});
		expect(set.in_keys).toEqual(new Array(21).fill(0));
	});
});

describe.skipIf(!have)('original definitions', () => {
	let game: GameDef;
	let objects: ObjectDefs;
	let units: UnitDefs;
	let items: ItemDefs;
	let infos: InfoDefs;
	let states: StateDefs;
	let groups: Tgroup[];
	let combis: CombinationDefs;
	let buildings: BuildingDefs;

	// Load order of StrandedII.bb
	beforeAll(async () => {
		states = await loadStates(vfs);
		game = await loadGame(vfs);
		groups = await loadGroups(vfs);
		objects = await loadObjects(vfs);
		units = await loadUnits(vfs, game.Cunit_count);
		items = await loadItems(vfs, game.Citem_count);
		infos = await loadInfos(vfs);
		combis = await loadCombinations(vfs, items);
		buildings = await loadBuildings(vfs, { objects, units, items, Cobject_count: game.Cobject_count });
	});

	const objectExists = (typ: number) => typeExists(objects, game.Cobject_count, typ);
	const unitExists = (typ: number) => typeExists(units, units.limit, typ);
	const itemExists = (typ: number) => typeExists(items, items.limit, typ);

	it('game.inf', () => {
		expect(game.healthsystem).toBe(4);
		expect(game.exh_move).toEqual([f32(0.02), f32(0.02), f32(0.016)]);
		expect(game.exh_damage).toEqual([5, 5, 5]);
		expect(game.divetime).toBe(20000);
		expect(game.divedamage).toBe(10);
		expect(game.defaultitemmodel).toBe('gfx\\bag.b3d');
		expect(vfs.exists(game.defaultitemmodel)).toBe(true);
		expect(game.fishtime).toBe(5500);
		expect([game.jumptime, game.jumptime2]).toEqual([450, 450]);
		expect([game.jumpfac, game.jumpfac2]).toEqual([f32(1.1), f32(1.1)]);
		expect([game.rainratio, game.snowratio]).toEqual([10, 30]);
		expect([game.firelightsize, game.firelightbrightness]).toEqual([60, 160]);
		expect(game.waverate).toBe(3500);
		expect(game.m_multiplayer).toBe(0);
		expect(game.m_editor).toBe(1);
		expect(game.set_gore).toBe(1);
		expect([game.Cobject_count, game.Cunit_count, game.Citem_count]).toEqual([255, 100, 255]);
		expect(game.tercol.map((c) => c[0])).toEqual([230, 223, 145, 69, 138, 13, 160, 172, 125]);
		expect(game.tercol.map((c) => c[3])).toEqual([159, 206, 0, 135, 174, 0, 70, 104, 72]);
		expect(game.script.startsWith(SEP_LINE + '//Global Game Scripts' + SEP_LINE)).toBe(true);
		expect(game.script).toContain(`on:usesea {${SEP_LINE}if (inarea_freshwater("unit",1)) {`);
		// falltime etc. are not in the shipped file
		expect([game.falltime, game.falldamage, game.fallminy, game.fallmaxy]).toEqual([850, 1000, 100, 3000]);
	});

	it('units.inf', () => {
		expect(units.count).toBe(38);
		expect(units.warnings).toEqual([]);
		const player = units.byId.get(1)!;
		expect(player).toMatchObject({
			name: 'Player',
			group: 'human',
			icon: 'gfx\\strandedguy.bmp',
			model: 'gfx\\strandedguy.b3d',
			colxr: 8,
			colyr: 17,
			speed: f32(1.6),
			eyes: 16,
			store: 100,
			health: 100,
			healthchange: 0,
			damage: 3,
			attackrange: 45,
			maxweight: 25000,
			behaviour: 0,
			mat: C.Cmat_flesh,
			tspeed: 2,
			range: 300,
			autofade: 500,
			ined: 1
		});
		expect(player.script).toContain(`on:kill {${SEP_LINE}$rnd=random(1,3);`);
		expect(units.zero).toMatchObject({ speed: f32(1.6), damage: 3, attackrange: 45, maxweight: 25000, mat: 7 });

		const raptor = units.byId.get(2)!;
		expect(raptor).toMatchObject({
			name: 'Raptor',
			size: [0.5, 0.5, 0.5],
			behaviour: 2,
			health: 110,
			healthchange: 22,
			speed: 2.5,
			tspeed: 3,
			attackrange: 65,
			damage: 24,
			driveoffset: 5,
			sfx: 'raptor',
			v: '0.08,0.04,2,35,3.0'
		});
		expect(raptor.ani_idle1).toEqual({ speed: f32(0.02), seq: 1, f1: 4, f2: 8 });
		expect(raptor.ani_move).toEqual({ speed: f32(0.06), seq: 2, f1: 2, f2: 3 });

		const plane = units.byId.get(39)!;
		expect(plane.name).toBe('Airplane');
		expect(plane.behaviour).toBe(502);
		expect(plane.v.split(',')[2]).toBe('1');

		for (const u of units.byId.values()) {
			expect(u.name, `unit ${u.id}`).not.toBe('');
			expect(vfs.exists(u.model), `unit ${u.id} model ${u.model}`).toBe(true);
			if (u.icon) expect(vfs.exists(u.icon), `unit ${u.id} icon ${u.icon}`).toBe(true);
			for (const l of u.loot) expect(itemExists(l.typ), `unit ${u.id} loot ${l.typ}`).toBe(true);
			if (u.group) {
				for (const g of u.group.split(',')) {
					expect(groups.some((x) => x.class === C.Cclass_unit && x.group === g), `unit group ${g}`).toBe(true);
				}
			}
		}
		expect(units.countEditor).toBeLessThanOrEqual(units.byId.size);
	});

	it('items*.inf', () => {
		expect(items.count).toBe(119);
		expect(items.warnings).toEqual([]);
		const hammer = items.byId.get(30)!;
		expect(hammer).toMatchObject({
			name: 'Hammer',
			group: 'tool',
			icon: 'gfx\\hammer.bmp',
			model: 'gfx\\hammer.b3d',
			size: [f32(0.6), f32(0.6), f32(0.6)],
			behaviour: 'hammer',
			mat: C.Cmat_stone,
			weight: 1000,
			damage: '6',
			health: 15,
			healthchange: 0,
			autofade: 225,
			rate: 500,
			speed: 10,
			ined: 1
		});
		const rod = items.byId.get(50)!;
		expect(rod.name).toBe('Fishing Rod');
		expect(rod).toMatchObject({ mat: C.Cmat_wood, weight: 1000, size: [f32(1.4), f32(1.4), f32(1.4)] });
		expect([...items.byId.values()].filter((i) => i.blend === 3).length).toBe(2);
		expect([...items.byId.values()].map((i) => i.wstate).filter((w) => w !== 0).sort()).toEqual([2, 2, 4]);

		for (const i of items.byId.values()) {
			expect(i.name, `item ${i.id}`).not.toBe('');
			if (i.model) expect(vfs.exists(i.model), `item ${i.id} model ${i.model}`).toBe(true);
			if (i.icon) expect(vfs.exists(i.icon), `item ${i.id} icon ${i.icon}`).toBe(true);
			if (i.group) {
				for (const g of i.group.split(',')) {
					expect(groups.some((x) => x.class === C.Cclass_item && x.group === g), `item group ${g}`).toBe(true);
				}
			}
		}
	});

	it('infos.inf, states.inf, groups.inf', () => {
		expect(infos.count).toBe(24);
		expect(infos.byId.get(1)).toMatchObject({ name: 'Starting Position', group: 'stuff', frame: 18 });
		expect(infos.byId.get(1)!.descr.startsWith('Starting position for the player.')).toBe(true);
		expect(infos.byId.get(5)!.descr).toBe(
			`Allows to put sprites in your map.${SEP_LINE}${SEP_LINE}see also: "info_sprite"${SEP_LINE}`
		);
		expect(infos.byId.get(10)).toMatchObject({ name: 'Areal Trigger', group: 'trigger,area', frame: 60 });

		expect(states.count).toBe(20);
		expect(states.byId.get(1)).toMatchObject({ name: 'Bleeding', frame: 0, active: 0, icon: '' });
		expect(states.byId.get(2)).toMatchObject({ name: 'Poisoning', frame: 1 });
		expect(states.byId.get(25)).toMatchObject({ name: 'Particle', frame: 24 });
		expect(states.byId.get(C.Cstate_frostbite)!.active).toBe(1);
		expect(states.byId.get(C.Cstate_tame)!.active).toBe(1);

		expect(groups.length).toBe(27);
		expect(groups[0]).toEqual({ class: C.Cclass_object, group: 'tree', name: 'Trees' });
		expect(groups.at(-1)).toEqual({ class: C.Cclass_building, group: 'misc', name: 'Miscellaneous' });
		expect(groups.filter((g) => g.class === C.Cclass_item).map((g) => g.group)).toEqual([
			'food',
			'potion',
			'tool',
			'weapon',
			'ammo',
			'material',
			'stuff'
		]);
	});

	it('combinations*.inf', () => {
		expect(combis.combinations.length).toBe(51);
		expect(combis.list.filter((t) => t.mode === Ccom_head).length).toBe(51);
		const flour = combis.combinations.find((c) => c.head.aid === 'flour')!;
		expect(flour.req.map((r) => [r.typ, r.count, r.del])).toEqual([
			[42, 9, 1],
			[23, 1, 0]
		]);
		expect(flour.gen.map((g) => [g.typ, g.count])).toEqual([[43, 1]]);
		expect(flour.head.script).toBe(`play "grind.wav";${SEP_LINE}process "grinding",410;${SEP_LINE}`);
		expect(combis.combinations.filter((c) => c.head.genname === 'splint fracture').length).toBe(2);

		for (const c of combis.combinations) {
			expect(c.req.length, `combi ${c.id}`).toBeGreaterThanOrEqual(2);
			expect(c.gen.length, `combi ${c.id}`).toBeGreaterThanOrEqual(1);
			expect(c.head.gid, `combi ${c.id}`).not.toBe(0);
			for (const t of [...c.req, ...c.gen]) {
				expect(itemExists(t.typ), `combi ${c.id} item ${t.typ}`).toBe(true);
			}
		}
		// combinations sharing a positive gid have the same set of required item types
		const byGid = new Map<number, string[]>();
		for (const c of combis.combinations) {
			const key = c.req.map((r) => r.typ).sort((a, b) => a - b).join(',');
			byGid.set(c.head.gid, [...(byGid.get(c.head.gid) ?? []), key]);
		}
		for (const [gid, keys] of byGid) {
			if (gid > 0) expect(keys.length, `gid ${gid}`).toBeGreaterThan(1);
			else expect(keys.length, `gid ${gid}`).toBe(1);
			expect(new Set(keys).size, `gid ${gid}`).toBe(1);
		}
	});

	it('buildings.inf', () => {
		expect(buildings.buildings.length).toBe(25);
		const tent = buildings.buildings.find((b) => b.id === 1)!;
		expect(tent.head).toMatchObject({ mode: Cbui_head, typ: 184, group: 'building' });
		expect(tent.req.map((r) => [r.typ, r.count])).toEqual([[97, 1]]);
		expect(tent.head.script).toBe(`unlockbuilding 3;${SEP_LINE}unlockbuilding 5;${SEP_LINE}`);
		const shelter = buildings.buildings.find((b) => b.id === 2)!;
		expect(shelter.req.map((r) => [r.typ, r.count])).toEqual([
			[24, 20],
			[15, 30]
		]);
		expect(buildings.buildings.filter((b) => b.head.typ < 0).map((b) => b.head.typ).sort()).toEqual([-30, -31]);
		const atObject = buildings.buildings.filter((b) => b.buildspace?.typ === 6);
		expect(atObject.length).toBe(1);
		expect(atObject[0].atobject.map((t) => t.typ)).toEqual([13, 16, 17]);

		for (const b of buildings.buildings) {
			expect(b.head.typ, `building ${b.id}`).not.toBe(0);
			if (b.head.typ > 0) expect(objectExists(b.head.typ), `building ${b.id}`).toBe(true);
			else expect(unitExists(-b.head.typ), `building ${b.id}`).toBe(true);
			for (const r of b.req) expect(itemExists(r.typ), `building ${b.id} req ${r.typ}`).toBe(true);
			for (const a of b.atobject) expect(objectExists(a.typ), `building ${b.id} atobject`).toBe(true);
			if (b.buildingsite) expect(objectExists(b.buildingsite.typ)).toBe(true);
			// every "group=" in the shipped file directly follows "id=", so it is on the head
			expect(groups.some((g) => g.class === C.Cclass_building && g.group === b.head.group), `building ${b.id}`).toBe(true);
		}
		for (const t of buildings.list) {
			if (t.mode !== Cbui_head) expect(t.group, `mode ${t.mode} of building ${t.id}`).toBe('');
			if (t.mode === Cbui_req || t.mode === Cbui_atobject) expect(t.typ).toBeGreaterThan(0);
		}
	});

	it('object finds, spawns and groups refer to defined types', () => {
		for (const o of objects.byId.values()) {
			expect(objectExists(o.id), `object ${o.id} within limit_objects`).toBe(true);
			for (const f of o.finds) {
				expect(itemExists(f.typ), `object ${o.id} find ${f.typ}`).toBe(true);
				if (f.reqtyp !== 0) expect(itemExists(f.reqtyp), `object ${o.id} find req ${f.reqtyp}`).toBe(true);
			}
			if (o.spawn) expect(itemExists(Number(o.spawn.split(',')[0])), `object ${o.id} spawn`).toBe(true);
			if (o.group) {
				for (const g of o.group.split(',')) {
					expect(groups.some((x) => x.class === C.Cclass_object && x.group === g), `object group ${g}`).toBe(true);
				}
			}
		}
		for (const i of infos.byId.values()) {
			for (const g of i.group.split(',')) {
				expect(groups.some((x) => x.class === C.Cclass_info && x.group === g), `info group ${g}`).toBe(true);
			}
		}
	});

	it('every type id used by the shipped maps is defined', async () => {
		const maps = vfs.all().filter((f) => /^maps\/.*\.s2$/i.test(f));
		expect(maps.length).toBeGreaterThan(0);
		for (const path of maps) {
			const map = parseMap(await vfs.readBytes(path));
			for (const o of map.objects) expect(objectExists(o.typ), `${path} object typ ${o.typ}`).toBe(true);
			for (const u of map.units) expect(unitExists(u.typ), `${path} unit typ ${u.typ}`).toBe(true);
			for (const i of map.items) expect(itemExists(i.typ), `${path} item typ ${i.typ}`).toBe(true);
			for (const i of map.infos) expect(infos.byId.has(i.typ), `${path} info typ ${i.typ}`).toBe(true);
			for (const s of map.states) {
				expect(s.typ >= 1 && s.typ <= C.Cstate_pc_custom, `${path} state typ ${s.typ}`).toBe(true);
			}
		}
	});

	it('strings.inf, keys.inf, lightcycle.inf', async () => {
		const str = await loadStrings(vfs);
		expect(str.s[1]).toBe('Loading Interface');
		expect(str.s[4]).toBe('Loading Units');
		expect(str.s[21]).toBe('Loading Map');
		expect(str.sm[1]).toBe('Yes');
		expect(str.sm[10]).toBe('smaller');
		expect(str.se[1]).toBe('New map');
		expect(str.s[0]).toBe('');

		const keys = await loadKeynames(vfs);
		expect(keys.length).toBe(263);
		expect(keys[0]).toBe('-');
		expect(keys[1]).toBe('Escape');
		expect(keys[28]).toBe('Enter');
		expect(keys[57]).toBe('Space');
		expect(keys[200]).toBe('Cursor Up');
		expect(keys[256]).toBe('Left Mousebutton');
		expect(keys[262]).toBe('Mousewheel Down');

		const light = await loadLightcycle(vfs);
		expect(light.length).toBe(25);
		expect(light[0]).toEqual([23, 23, 55]);
		expect(light[7]).toEqual([255, 100, 50]);
		expect(light[12]).toEqual([255, 255, 255]);
		expect(light[23]).toEqual([40, 40, 70]);
		expect(light[24]).toEqual([0, 0, 0]);
	});

	it('settings.cfg, controls.cfg, scriptcontrols.cfg round-trip', async () => {
		const set = await loadSettings(vfs);
		expect(set).toMatchObject({
			set_scrx: 800,
			set_scry: 600,
			set_scrbit: 32,
			set_scrx_c: 800,
			set_viewrange: 2,
			set_terrain: 2,
			set_water: 3,
			set_sky: 2,
			set_effects: 2,
			set_musicvolume: 1,
			set_fxvolume: 1,
			set_grass: 1,
			set_2dfx: 1,
			set_lightfx: 1,
			set_windsway: 1,
			set_name: 'Mr. Stranded',
			set_serverport: 36963,
			set_fog: 1,
			set_hwmultitex: 1,
			set_mb: 1,
			set_mb_alpha: f32(0.12),
			set_viewfac: 1.5,
			set_minvert: 1,
			set_msmooth: 0
		});
		expect(set.set_msens).toBeCloseTo(0.2, 6);
		expect(set.in_keys.slice(0, 6)).toEqual([17, 31, 30, 32, 57, 21]);
		expect(set.in_keys[C.Ckey_attack1]).toBe(256);
		expect(set.in_keys[C.Ckey_use]).toBe(18);
		expect(set.game_scriptkey.slice(0, 5)).toEqual([22, 23, 0, 24, 0]);

		const saved = saveSettings(set, 'Stranded II', 1);
		expect(saved.settings).toEqual(await vfs.readBytes('sys\\settings.cfg'));
		expect(saved.controls).toEqual(await vfs.readBytes('sys\\controls.cfg'));
		expect(saved.scriptcontrols).toEqual(await vfs.readBytes('sys\\scriptcontrols.cfg'));
		expect(saveSettings(set, 'Stranded II', 0).scriptcontrols).toBeUndefined();
	});
});
