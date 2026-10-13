/**
 * Package entities2: handle_items.bb. Expected values are derived from the original source
 * (handle_items.bb), branch by branch; other packages' functions are mocked on their modules.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CameraProject,
	CreateCube,
	CreatePivot,
	EntityPitch,
	EntityX,
	EntityY,
	EntityZ,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	type BBEntity,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Int, Rand, SEP_LINE, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { CreateImage } from '../../src/lib/s2/gfx2d';
import { injectKeyDown } from '../../src/lib/s2/input';
import {
	Cbmpf_red,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_if_combine,
	Cmenu_if_items,
	Cmenu_if_map,
	Cp_flash,
	Cpm_in,
	Cpm_out,
	Cstate_invulnerability,
	Cworld_g
} from '../../src/lib/s2/game/consts';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { Ditem_behaviour, Ditem_health, Ditem_mat, Ditem_modelh, Ditem_scriptk, Ditem_weight, Dobject_maxweight, Dunit_maxweight } from '../../src/lib/s2/game/defs_arrays';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import {
	capacity,
	combine_item,
	con_item,
	countstored_items,
	damage_item,
	eat_item,
	exchange_item,
	frap_item,
	free_item,
	get_item,
	get_stored_item,
	item_getrandom,
	item_istool,
	item_phyreset,
	merge_item,
	serialpeak_item,
	set_item,
	store_item,
	unstore_item,
	update_items,
	use_item
} from '../../src/lib/s2/game/handle_items';
import * as handle_objects from '../../src/lib/s2/game/handle_objects';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as iface from '../../src/lib/s2/game/interface';
import * as load_materials from '../../src/lib/s2/game/load_materials';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { sm } from '../../src/lib/s2/game/load_strings';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, Each, First, Last, New, TYPES, Tcom, Titem, Tobject, Tp, Tstate, Tunit, Tx, isNull } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

// items of the shipped mod (sys/items*.inf)
const MEAT = 9; // weight 500, health 15, script keys use/eat/drop
const MEATF = 10; // weight 500
const LEAF = 16; // Bloodleaf: weight 50, no script
const HERB = 17; // Healing Herb: weight 50, on:eat
const GOLD = 19; // Goldherb
const WATCH = 65; // behaviour "watch"
const MAP = 73; // behaviour "map"
const HUT = 160; // object typ with maxweight 100000

describe.skipIf(!existsSync(MOD))('entities2: handle_items', () => {
	let now = 0;
	let ifMsg: ReturnType<typeof vi.fn>;
	let quickslot: ReturnType<typeof vi.fn>;
	let freeChilds: ReturnType<typeof vi.fn>;
	let pAdd: ReturnType<typeof vi.fn>;
	let materialFx: ReturnType<typeof vi.fn>;
	let speech: ReturnType<typeof vi.fn>;
	const parents = new Map<string, Handle>();

	/** set_item with a model that needs no file */
	function mk(typ: number, count = 1, x = 0, y = 0, z = 0): Titem {
		if (Ditem_modelh(typ) === null) Ditem_modelh.set(typ, CreateCube());
		const id = set_item(-1, typ, x, y, z, count, 1);
		expect(id).toBeGreaterThan(0);
		return G.TCitem!;
	}
	function inv(typ: number, count: number, cls: number, pid: number): Titem {
		const it = mk(typ, count);
		it.parent_class = cls;
		it.parent_id = pid;
		it.parent_mode = Cpm_in;
		return it;
	}
	function unit(id: number, typ = 1): Tunit {
		const u = New(Tunit);
		u.id = id;
		u.typ = typ;
		u.h = CreatePivot();
		return u;
	}
	function object(id: number, typ = HUT): Tobject {
		const o = New(Tobject);
		o.id = id;
		o.typ = typ;
		o.h = CreatePivot();
		return o;
	}
	const ids = () => [...Each(Titem)].map((i) => i.id);

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		await loadAllDefinitions();
		parents.clear();

		freeChilds = vi.fn();
		vi.spyOn(parentchild, 'free_childs').mockImplementation(freeChilds as never);
		vi.spyOn(parentchild, 'parent_h').mockImplementation((c: number, i: number) => parents.get(c + ':' + i) ?? null);
		vi.spyOn(handle_units, 'con_unit').mockImplementation((id: number) => {
			for (const u of Each(Tunit)) {
				if (u.id === id) {
					G.TCunit = u;
					return 1;
				}
			}
			return 0;
		});
		vi.spyOn(handle_objects, 'con_object').mockImplementation((id: number) => {
			for (const o of Each(Tobject)) {
				if (o.id === id) {
					G.TCobject = o;
					return 1;
				}
			}
			return 0;
		});
		ifMsg = vi.fn();
		vi.spyOn(iface, 'if_msg').mockImplementation(ifMsg as never);
		quickslot = vi.fn(() => 1);
		vi.spyOn(iface, 'if_quickslot').mockImplementation(quickslot as never);
		pAdd = vi.fn(() => {
			const p = New(Tp);
			p.h = CreatePivot();
			G.TCp = p;
		});
		vi.spyOn(particles, 'p_add').mockImplementation(pAdd as never);
		materialFx = vi.fn();
		vi.spyOn(load_materials, 'material_fx').mockImplementation(materialFx as never);
		speech = vi.fn(() => 0);
		vi.spyOn(RT.audio, 'speech').mockImplementation(speech as never);
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

	it('the mod data the tests rely on', () => {
		expect(Ditem_weight(MEAT)).toBe(500);
		expect(Ditem_weight(MEATF)).toBe(500);
		expect(Ditem_weight(LEAF)).toBe(50);
		expect(Ditem_health(MEAT)).toBe(15);
		expect(Ditem_scriptk(MEAT)).toContain(SEP_LINE + 'drop');
		expect(Ditem_scriptk(LEAF)).toBe('');
		expect(Ditem_behaviour(WATCH)).toBe('watch');
		expect(Ditem_behaviour(MAP)).toBe('map');
		expect(Dunit_maxweight(1)).toBe(25000);
		expect(Dobject_maxweight(HUT)).toBe(100000);
	});

	describe('set_item', () => {
		it('invalid typ: -1 and TCitem is Null', () => {
			G.TCitem = New(Titem);
			expect(set_item(-1, 254, 0, 0, 0)).toBe(-1);
			expect(G.TCitem).toBeNull();
			expect(G.item_serial).toBe(0);
		});

		it('creates the item, takes the next serial, fires on:create unless silent or loading', () => {
			const cache = vi.spyOn(RT.script, 'set_parsecache');
			const defvar = vi.spyOn(RT.script, 'defvar_oncreate');
			Ditem_modelh.set(LEAF, CreateCube());
			G.gt = 4711;
			G.item_serial = 41;
			const id = set_item(-1, LEAF, 10, 20, 30, 0);
			expect(id).toBe(42);
			expect(G.item_serial).toBe(42);
			const it = G.TCitem!;
			expect(it).toBe(Last(Titem));
			expect([it.id, it.typ, it.count, it.health, it.phy_fall]).toEqual([42, LEAF, 1, 15, 4711]); // count<=1 -> 1
			expect([EntityX(it.h), EntityY(it.h), EntityZ(it.h)]).toEqual([10, 20, 30]);
			expect(it.h).not.toBe(Ditem_modelh(LEAF)); // a copy
			expect(cache).toHaveBeenCalledWith(Cclass_item, 42, 'create');
			expect(defvar).toHaveBeenCalledWith(Cclass_item, 42, LEAF);

			cache.mockClear();
			defvar.mockClear();
			expect(set_item(7, LEAF, 0, 0, 0, 5, 1)).toBe(7); // explicit id: serial untouched; silent
			expect(G.item_serial).toBe(42);
			expect(G.TCitem!.count).toBe(5);
			G.tmp_loading = 1;
			set_item(-1, LEAF, 0, 0, 0);
			expect(cache).not.toHaveBeenCalled();
			expect(defvar).not.toHaveBeenCalled();
		});

		it('without a model the default item model is copied', () => {
			const none = [...DEFS.items.byId.values()].find((i) => i.model === '');
			if (!none) return;
			G.game_defaultitemmodel = CreateCube();
			const id = set_item(-1, none.id, 1, 2, 3, 1, 1);
			expect(id).toBe(1);
			expect(G.TCitem!.h).not.toBeNull();
			expect(G.TCitem!.h).not.toBe(G.game_defaultitemmodel);
		});
	});

	describe('store_item', () => {
		it('unknown id: 0', () => {
			expect(store_item(99, Cclass_unit, 1)).toBe(0);
		});

		it('full storage: parent set, hidden, moved to the end of the list', () => {
			unit(1);
			const a = mk(MEAT, 2, 5, 5, 5);
			const b = mk(LEAF);
			expect(store_item(a.id, Cclass_unit, 1)).toBe(1);
			expect([a.parent_class, a.parent_id, a.parent_mode]).toEqual([Cclass_unit, 1, Cpm_in]);
			expect(ids()).toEqual([b.id, a.id]); // Insert Titem After Last Titem
			expect([EntityX(a.h), EntityY(a.h), EntityZ(a.h)]).toEqual([0, 0, 0]);
			expect((a.h as BBEntity).hidden ?? true).toBeTruthy();
			expect(freeChilds).toHaveBeenCalledWith(Cclass_item, a.id);
		});

		it('full storage with the same typ already there: merged into the existing item', () => {
			unit(1);
			const old = inv(MEAT, 1, Cclass_unit, 1);
			const other = inv(LEAF, 1, Cclass_unit, 1);
			const a = mk(MEAT, 4);
			expect(store_item(a.id, Cclass_unit, 1)).toBe(1);
			expect(isNull(Titem, a)).toBe(true); // free_item(id)
			expect(old.count).toBe(5);
			expect(ids()).toEqual([other.id, old.id]); // the existing item moves to the end too
		});

		it('partial storage into an existing stack: only what fits (weight*i > free ends the count)', () => {
			unit(1);
			const old = inv(MEAT, 48, Cclass_unit, 1); // 24000 of 25000 used: 1000 free
			const a = mk(MEAT, 5); // needs 2500
			expect(capacity(Cclass_unit, 1, 1)).toBe(1000);
			expect(store_item(a.id, Cclass_unit, 1)).toBe(1);
			expect(a.count).toBe(3); // storecount 2
			expect(old.count).toBe(50);
			expect(a.parent_class).toBe(0);
			expect(ids()).toEqual([old.id, a.id]); // no Insert for storemode 2
		});

		it('partial storage without an existing stack: a new silent item takes the stored part', () => {
			unit(1);
			const full = inv(MEATF, 48, Cclass_unit, 1);
			const a = mk(MEAT, 5);
			const cache = vi.spyOn(RT.script, 'set_parsecache');
			expect(store_item(a.id, Cclass_unit, 1)).toBe(1);
			expect(cache).not.toHaveBeenCalled(); // set_item(...,storecount,1)
			expect(a.count).toBe(3);
			expect(a.parent_class).toBe(0);
			const n = Last(Titem)!;
			expect(n).not.toBe(a);
			expect([n.typ, n.count, n.parent_class, n.parent_id, n.parent_mode]).toEqual([MEAT, 2, Cclass_unit, 1, Cpm_in]);
			expect(G.TCitem).toBe(n);
			expect(full.count).toBe(48);
		});

		it('no capacity at all: 0 and nothing changes', () => {
			unit(1);
			inv(MEATF, 50, Cclass_unit, 1); // 25000: full
			const a = mk(MEAT, 1);
			expect(store_item(a.id, Cclass_unit, 1)).toBe(0);
			expect(a.parent_class).toBe(0);
		});

		it('a parent that does not exist has no capacity limit (free stays -1)', () => {
			const a = mk(MEAT, 1000);
			expect(store_item(a.id, Cclass_object, 77)).toBe(1);
			expect([a.parent_class, a.parent_id]).toEqual([Cclass_object, 77]);
		});

		it('Cpm_out: no capacity check, shown at the position, pitched -90, TCitem set', () => {
			object(3);
			const a = mk(MEAT, 1000);
			G.TCitem = null;
			SeedRnd(99);
			expect(store_item(a.id, Cclass_object, 3, Cpm_out, 1, 2, 3)).toBe(1);
			expect([a.parent_class, a.parent_id, a.parent_mode]).toEqual([Cclass_object, 3, Cpm_out]);
			expect([EntityX(a.h), EntityY(a.h), EntityZ(a.h)]).toEqual([1, 2, 3]);
			expect(EntityPitch(a.h)).toBeCloseTo(-90, 3);
			expect(G.TCitem).toBe(a);
			SeedRnd(99);
			Rand(360);
			const after = Rand(1, 1000);
			SeedRnd(99);
			store_item(a.id, Cclass_object, 3, Cpm_out);
			expect(Rand(1, 1000)).toBe(after); // exactly one Rand(360)
		});
	});

	describe('unstore_item', () => {
		it('part of a stack: a new free item at the position, the stack shrinks', () => {
			const a = inv(MEAT, 5, Cclass_unit, 1);
			expect(unstore_item(a.id, 2, 0, 7, 8, 9)).toBe(1);
			expect(a.count).toBe(3);
			expect(a.parent_class).toBe(Cclass_unit);
			const n = G.TCitem!;
			expect(n).not.toBe(a);
			expect([n.typ, n.count, n.parent_class]).toEqual([MEAT, 2, 0]);
			expect([EntityX(n.h), EntityY(n.h), EntityZ(n.h)]).toEqual([7, 8, 9]);
		});

		it('the whole stack at the parent: parent, selection and physics reset', () => {
			const p = CreatePivot();
			PositionEntity(p, 11, 12, 13);
			parents.set(Cclass_unit + ':1', p);
			const a = inv(MEAT, 2, Cclass_unit, 1);
			a.if_sel = 1;
			a.phy_pause = 1;
			G.gt = 555;
			expect(unstore_item(a.id, 2, 1)).toBe(1);
			expect([a.parent_class, a.parent_id, a.parent_mode, a.if_sel, a.phy_pause, a.phy_fall]).toEqual([0, 0, 0, 0, 0, 555]);
			expect([EntityX(a.h), EntityY(a.h), EntityZ(a.h)]).toEqual([11, 12, 13]);
			expect(G.TCitem).toBe(a);
			expect(unstore_item(999)).toBe(0);
		});
	});

	it('countstored_items, capacity, get_stored_item, con_item, get_item, serialpeak_item, item_phyreset', () => {
		const a = inv(MEAT, 3, Cclass_unit, 1);
		const b = inv(LEAF, 4, Cclass_unit, 1);
		inv(LEAF, 9, Cclass_object, 1);
		expect(countstored_items(Cclass_unit, 1)).toBe(7);
		expect(countstored_items(Cclass_unit, 1, LEAF)).toBe(4);
		expect(countstored_items(Cclass_unit, 1, 0, 1)).toBe(2);
		expect(countstored_items(Cclass_unit, 2)).toBe(0);
		expect(capacity(Cclass_unit, 1, 1)).toBe(25000 - 3 * 500 - 4 * 50);
		expect(capacity(Cclass_object, 1, HUT)).toBe(100000 - 9 * 50);
		expect(capacity(Cclass_item, 1, 1)).toBe(0); // no class: total 0

		G.TCitem = null;
		expect(get_stored_item(LEAF, Cclass_unit, 1)).toBe(1);
		expect(G.TCitem).toBe(b);
		expect(get_stored_item(GOLD, Cclass_unit, 1)).toBe(0);
		expect(con_item(a.id)).toBe(1);
		expect(G.TCitem).toBe(a);
		expect(con_item(1234)).toBe(0);
		expect(G.TCitem).toBe(a);
		expect(get_item(b.h)).toBe(b.id);
		expect(G.TCitem).toBe(b);
		expect(get_item(CreatePivot())).toBe(-1);

		G.item_serial = 0;
		mk(LEAF).id = 500;
		serialpeak_item();
		expect(G.item_serial).toBe(500);

		a.phy_pause = 1;
		b.phy_pause = 1;
		item_phyreset();
		expect([a.phy_pause, b.phy_pause]).toEqual([0, 0]);
	});

	it('free_item: part of a stack, the whole item, unknown id', () => {
		const a = mk(MEAT, 5);
		expect(free_item(a.id, 2)).toBe(1);
		expect(a.count).toBe(3);
		expect(freeChilds).not.toHaveBeenCalled();
		expect(free_item(a.id, 3)).toBe(1); // count>=Titem\count
		expect(isNull(Titem, a)).toBe(true);
		expect(freeChilds).toHaveBeenCalledWith(Cclass_item, a.id);
		const b = mk(MEAT, 5);
		expect(free_item(b.id)).toBe(1);
		expect(First(Titem)).toBeNull();
		expect(free_item(b.id)).toBe(0);
	});

	it('merge_item: same typ and parent id within the range are added and freed', () => {
		const a = mk(LEAF, 1, 0, 0, 0);
		const near = mk(LEAF, 2, 30, 0, 0); // exactly at the range: <=
		const far = mk(LEAF, 4, 31, 0, 0);
		const otherTyp = mk(HERB, 8, 1, 0, 0);
		const otherParent = mk(LEAF, 16, 1, 0, 0);
		otherParent.parent_id = 5;
		expect(merge_item(a.id)).toBe(1);
		expect(a.count).toBe(3);
		expect(isNull(Titem, near)).toBe(true);
		expect(merge_item(a.id, 100)).toBe(1);
		expect(a.count).toBe(7);
		expect(isNull(Titem, far)).toBe(true);
		expect(isNull(Titem, otherTyp)).toBe(false);
		expect(isNull(Titem, otherParent)).toBe(false);
		expect(merge_item(4242)).toBe(-1);
	});

	describe('combine_item', () => {
		function combi(id: number, gid: number, aid: string, req: [number, number, number][], gen: [number, number][]): void {
			const head = New(Tcom);
			Object.assign(head, { id, mode: 2, gid, aid, script: '' });
			for (const [typ, count, del] of req) Object.assign(New(Tcom), { id, mode: 0, typ, count, del });
			for (const [typ, count] of gen) Object.assign(New(Tcom), { id, mode: 1, typ, count });
		}
		beforeEach(() => {
			DeleteEach(Tcom);
			unit(1);
			PositionEntity(G.cam, 3, 4, 5);
		});

		it('all conditions met: consumes the "del" requirements and stores the result', () => {
			combi(900, 0, 't', [[LEAF, 2, 1], [HERB, 1, 0]], [[GOLD, 3]]);
			const leaf = inv(LEAF, 3, Cclass_unit, 1);
			const herb = inv(HERB, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			herb.if_sel = 1;
			Ditem_modelh.set(GOLD, CreateCube());
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect(leaf.count).toBe(1); // free_item(id,2)
			expect(herb.count).toBe(1); // "stay"
			expect(get_stored_item(GOLD, Cclass_unit, 1)).toBe(1);
			expect(G.TCitem!.count).toBe(3);
			expect(speech).not.toHaveBeenCalled();
			expect(ifMsg).not.toHaveBeenCalled();
		});

		it('result does not fit: message 181 in red and the fail sound; the item stays at the camera', () => {
			combi(900, 0, 't', [[LEAF, 1, 0]], [[MEAT, 1]]);
			inv(MEATF, 50, Cclass_unit, 1); // full
			inv(LEAF, 1, Cclass_unit, 1).if_sel = 1;
			Ditem_modelh.set(MEAT, CreateCube());
			const sfx = vi.spyOn(RT.audio, 'sfx');
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect(ifMsg).toHaveBeenCalledWith(sm(181), Cbmpf_red);
			expect(sfx).toHaveBeenCalledWith(G.sfx_fail);
			const n = Last(Titem)!;
			expect([n.typ, n.parent_class, EntityX(n.h), EntityY(n.h), EntityZ(n.h)]).toEqual([MEAT, 0, 3, 4, 5]);
		});

		it('types right but counts too low: "negative", 0 (the combination is entered because game_combiscreen>0)', () => {
			combi(900, 0, 't', [[LEAF, 2, 1]], [[GOLD, 1]]);
			const leaf = inv(LEAF, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			expect(G.game_combiscreen).toBe(2);
			expect(combine_item(Cclass_unit, 1)).toBe(0);
			expect(speech).toHaveBeenCalledWith('negative');
			expect(leaf.count).toBe(1);
		});

		it('a locked combination (Tx mode 50 with its id text): "negative", 0', () => {
			combi(900, 0, 'secret', [[LEAF, 1, 1]], [[GOLD, 1]]);
			const leaf = inv(LEAF, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			Object.assign(New(Tx), { mode: 50, key: 'secret' });
			expect(combine_item(Cclass_unit, 1)).toBe(0);
			expect(speech).toHaveBeenCalledTimes(1);
			expect(isNull(Titem, leaf)).toBe(false);
		});

		it('a group of similar combinations opens the combination screen instead (gid>0, or gid<0 with game_combiscreen>1)', () => {
			combi(900, 5, 't', [[LEAF, 1, 1]], [[GOLD, 1]]);
			const leaf = inv(LEAF, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			G.in_scr_scr = 9;
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect([G.in_combi_gid, G.in_scr_scr, G.m_menu]).toEqual([5, 0, Cmenu_if_combine]);
			expect(leaf.count).toBe(1);

			First(Tcom)!.gid = -3;
			G.m_menu = 0;
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect([G.in_combi_gid, G.m_menu]).toEqual([-3, Cmenu_if_combine]);

			// game_combiscreen=1: negative groups combine at once; forced combinations never open the screen
			G.game_combiscreen = 1;
			G.m_menu = 0;
			Ditem_modelh.set(GOLD, CreateCube());
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect(G.m_menu).toBe(0);
			expect(isNull(Titem, leaf)).toBe(true);
		});

		it('selection does not match any combination: "negative", 0; forceid checks only that combination', () => {
			combi(900, 0, 'a', [[LEAF, 1, 1]], [[GOLD, 1]]);
			combi(901, 0, 'b', [[HERB, 1, 1]], [[GOLD, 2]]);
			const leaf = inv(LEAF, 1, Cclass_unit, 1);
			const herb = inv(HERB, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			herb.if_sel = 1; // two selected, each combination wants one
			expect(combine_item(Cclass_unit, 1)).toBe(0);
			expect(speech).toHaveBeenCalledTimes(1);

			leaf.if_sel = 0;
			expect(combine_item(Cclass_unit, 1, 900)).toBe(0); // forced: 900 does not match, 901 is not tried
			expect(isNull(Titem, herb)).toBe(false);
			Ditem_modelh.set(GOLD, CreateCube());
			expect(combine_item(Cclass_unit, 1, 901)).toBe(1);
			expect(isNull(Titem, herb)).toBe(true);
			expect(Last(Titem)!.count).toBe(2);
		});

		it('a combination script that skips the event keeps the items', () => {
			combi(900, 0, 't', [[LEAF, 1, 1]], [[GOLD, 1]]);
			First(Tcom)!.script = 'x';
			const leaf = inv(LEAF, 1, Cclass_unit, 1);
			leaf.if_sel = 1;
			const task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => {
				G.p_skipevent = 1;
				return 1;
			});
			expect(combine_item(Cclass_unit, 1)).toBe(1);
			expect(task).toHaveBeenCalledWith(0, 0, 'combine', '(combinations.inf-script)', 'x');
			expect(isNull(Titem, leaf)).toBe(false);
			expect(get_stored_item(GOLD, Cclass_unit, 1)).toBe(0);
		});
	});

	describe('exchange_item', () => {
		beforeEach(() => {
			unit(1);
			object(7);
			G.g_player = 1;
			vi.spyOn(RT.script, 'parse').mockImplementation(() => 0);
		});

		it('part of a stack: 2, the rest stays; the drop event of a player item runs', () => {
			const env = vi.spyOn(RT.script, 'parse_env');
			const a = inv(MEAT, 5, Cclass_unit, 1);
			G.TCitem = a;
			expect(exchange_item(Cclass_object, 7, 2)).toBe(2);
			expect(env).toHaveBeenCalledWith(Cclass_item, a.id, 'drop');
			expect(RT.script.parse).toHaveBeenCalledTimes(1); // set_parsecache()=0, then the definition script
			expect(a.count).toBe(3);
			const n = G.TCitem!;
			expect(n).not.toBe(a);
			expect([n.typ, n.count, n.parent_class, n.parent_id]).toEqual([MEAT, 2, Cclass_object, 7]);
		});

		it('a script that skips the drop event: -2', () => {
			vi.spyOn(RT.script, 'parse').mockImplementation(() => {
				G.p_skipevent = 1;
				return 0;
			});
			const a = inv(MEAT, 5, Cclass_unit, 1);
			G.TCitem = a;
			expect(exchange_item(Cclass_object, 7, 5)).toBe(-2);
			expect(a.parent_class).toBe(Cclass_unit);
		});

		it('the whole stack: 1; merged into the same typ at the destination, else re-parented and moved to the end', () => {
			const a = inv(LEAF, 5, Cclass_object, 7);
			const dest = inv(LEAF, 1, Cclass_unit, 1);
			G.TCitem = a;
			expect(exchange_item(Cclass_unit, 1, 99)).toBe(1); // count is cut to TCitem\count
			expect(dest.count).toBe(6);
			expect(isNull(Titem, a)).toBe(true);

			const b = inv(HERB, 2, Cclass_object, 7);
			b.parent_mode = Cpm_out;
			const c = mk(GOLD);
			G.TCitem = b;
			expect(exchange_item(Cclass_unit, 1, 2)).toBe(1);
			expect([b.parent_class, b.parent_id, b.parent_mode]).toEqual([Cclass_unit, 1, Cpm_out]); // parent_mode untouched
			expect(Last(Titem)).toBe(b);
			expect(isNull(Titem, c)).toBe(false);
		});

		it('not enough capacity: the count is reduced; 0 when nothing fits', () => {
			unit(2);
			const fill = inv(MEATF, 49, Cclass_unit, 2); // 500 free
			const a = inv(MEAT, 3, Cclass_object, 7);
			G.TCitem = a;
			expect(exchange_item(Cclass_unit, 2, 3)).toBe(2);
			expect(a.count).toBe(2);
			expect(countstored_items(Cclass_unit, 2, MEAT)).toBe(1);

			fill.count = 50; // 25000 + 500 used: nothing free
			G.TCitem = a;
			expect(exchange_item(Cclass_unit, 2, 2)).toBe(0);
			expect(a.count).toBe(2);
		});
	});

	describe('use_item / eat_item', () => {
		beforeEach(() => {
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
		});

		it('unknown id: 0', () => {
			expect(use_item(5)).toBe(0);
			expect(eat_item(5)).toBe(0);
		});

		it('watch: the time message; at 13:37 the "leet" event and a green flash', () => {
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			const leet = vi.spyOn(RT.script, 'parse_globalevent').mockImplementation(() => {});
			const parse = vi.spyOn(RT.script, 'parse').mockImplementation(() => 0);
			const w = mk(WATCH);
			G.map_hour = 7;
			G.map_minute = 5;
			expect(use_item(w.id)).toBe(1);
			expect(ifMsg).toHaveBeenLastCalledWith('7:5 ' + sm(36));
			expect(leet).not.toHaveBeenCalled();
			G.map_hour = 13;
			G.map_minute = 37;
			use_item(w.id);
			expect(ifMsg).toHaveBeenLastCalledWith('13:37 ' + sm(36) + ' - Y4y! t3h 3l!te!');
			expect(leet).toHaveBeenCalledWith('leet');
			expect(parse).toHaveBeenCalled();
			expect(pAdd).toHaveBeenCalledWith(0, 0, 0, Cp_flash, f32(0.06), 0.75);
			expect(speech).not.toHaveBeenCalled();
		});

		it('map: opens the map menu', () => {
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			const m = mk(MAP);
			expect(use_item(m.id)).toBe(1);
			expect(G.m_menu).toBe(Cmenu_if_map);
			expect(ifMsg).not.toHaveBeenCalled();
		});

		it('nothing to do: message 196 in red and "negative"; a script task counts as action', () => {
			const sel = vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			const leaf = mk(LEAF);
			expect(use_item(leaf.id)).toBe(1);
			expect(sel).not.toHaveBeenCalled(); // no on:use in the definition
			expect(ifMsg).toHaveBeenCalledWith(sm(196), Cbmpf_red);
			expect(speech).toHaveBeenCalledWith('negative');

			ifMsg.mockClear();
			sel.mockImplementation(() => 1);
			const meat = mk(MEAT); // has on:use
			expect(use_item(meat.id)).toBe(1);
			expect(sel).toHaveBeenCalledWith(Cclass_item, meat.id, 'use');
			expect(ifMsg).not.toHaveBeenCalled();
		});

		it('a tool in the item menu goes to the quick slot', () => {
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
			const tool = [...DEFS.items.byId.values()].find((i) => item_istool(i.behaviour) === 1)!;
			const t = mk(tool.id);
			G.m_menu = Cmenu_if_items;
			expect(use_item(t.id)).toBe(1);
			expect(quickslot).toHaveBeenCalledWith(0, 1);
			expect(ifMsg).not.toHaveBeenCalled();
			quickslot.mockClear();
			G.m_menu = 0;
			use_item(t.id);
			expect(quickslot).not.toHaveBeenCalled();
		});

		it('eat: message 195 unless the on:eat script ran', () => {
			const sel = vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 1);
			const herb = mk(HERB);
			expect(eat_item(herb.id)).toBe(1);
			expect(sel).toHaveBeenCalledWith(Cclass_item, herb.id, 'eat');
			expect(ifMsg).not.toHaveBeenCalled();
			const leaf = mk(LEAF); // no on:eat
			expect(eat_item(leaf.id)).toBe(1);
			expect(ifMsg).toHaveBeenCalledWith(sm(195), Cbmpf_red);
			expect(speech).toHaveBeenCalledWith('negative');
		});
	});

	it('item_istool', () => {
		for (const b of ['tool', 'weapon', 'hammer', 'slowblade', 'blade', 'fastblade', 'slingshot', 'bow', 'launcher', 'catapult', 'pistol', 'gun', 'machinegun', 'spear', 'selfthrow', 'spade', 'fishingrod', 'net', 'torch']) {
			expect(item_istool(b)).toBe(1);
		}
		for (const b of ['throw', '', 'watch', 'Tool', 'ammo:81']) expect(item_istool(b)).toBe(0);
	});

	it('item_getrandom: one Rand(1,c) over the stored items in list order', () => {
		expect(item_getrandom(Cclass_unit, 1)).toBe(0);
		const stored = [inv(MEAT, 1, Cclass_unit, 1), inv(LEAF, 1, Cclass_unit, 1), inv(HERB, 1, Cclass_unit, 1)];
		inv(GOLD, 1, Cclass_unit, 2);
		for (const seed of [1, 2, 3, 4, 5]) {
			SeedRnd(seed);
			const want = stored[Rand(1, 3) - 1];
			SeedRnd(seed);
			expect(item_getrandom(Cclass_unit, 1)).toBe(1);
			expect(G.TCitem).toBe(want);
		}
	});

	it('update_items: falls by Cworld_g*f*0.6 and is put on the ground below terrain+5', () => {
		const a = mk(LEAF, 1, 1, 100, 2);
		const b = mk(LEAF, 1, 3, 9, 4);
		G.g_itemlist = [null, a, b];
		G.g_itemlistc = 2;
		G.f = f32(1.5);
		G.ter = null;
		G.ter_groundy = 0;
		update_items();
		const fall = f32(f32(Cworld_g * G.f) * f32(0.6));
		expect(EntityY(a.h)).toBeCloseTo(100 - fall, 4);
		expect(EntityY(b.h)).toBe(0); // 9-8.829 < 0+5
		expect([EntityX(b.h), EntityZ(b.h)]).toEqual([3, 4]);
	});

	describe('damage_item', () => {
		beforeEach(() => {
			vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0);
		});

		it('health goes down; a stack loses one item and health is restored; the effect is at the item or the pick', () => {
			const a = mk(MEAT, 3, 1, 2, 3);
			G.TCitem = a;
			expect(damage_item(5)).toBe(1);
			expect(a.health).toBe(10);
			expect(materialFx).toHaveBeenLastCalledWith(1, 2, 3, Ditem_mat(MEAT));
			G.in_px = 7;
			G.in_py = 8;
			G.in_pz = 9;
			expect(damage_item(20, 0, 1)).toBe(1);
			expect(materialFx).toHaveBeenLastCalledWith(7, 8, 9, Ditem_mat(MEAT));
			expect([a.count, a.health]).toEqual([2, 15]);
			materialFx.mockClear();
			damage_item(1, 0, 2);
			expect(materialFx).not.toHaveBeenCalled();
			expect(a.health).toBe(14);
		});

		it('invulnerable items keep their health', () => {
			const a = mk(MEAT);
			Object.assign(New(Tstate), { typ: Cstate_invulnerability, parent_class: Cclass_item, parent_id: a.id });
			G.TCitem = a;
			expect(damage_item(100)).toBe(1);
			expect(a.health).toBe(15);
		});

		it('kill: 2, the item is freed, a pivot with its placement goes to the kill list', () => {
			const kill = vi.spyOn(RT.script, 'parse_kill_add');
			const cache = vi.spyOn(RT.script, 'set_parsecache');
			const a = mk(MEAT, 1, 4, 5, 6);
			const id = a.id;
			G.TCitem = a;
			G.tmp_h = CreatePivot();
			expect(damage_item(15)).toBe(2);
			expect(isNull(Titem, a)).toBe(true);
			expect(cache).toHaveBeenCalledWith(Cclass_item, id, 'kill');
			expect([G.tmp_kill, G.tmp_killclass, G.tmp_killid, G.tmp_h]).toEqual([1, Cclass_item, id, null]);
			expect(kill).toHaveBeenCalledWith(Cclass_item, id, G.tmp_killmodel);
			expect([EntityX(G.tmp_killmodel), EntityY(G.tmp_killmodel), EntityZ(G.tmp_killmodel)]).toEqual([4, 5, 6]);

			const b = mk(MEAT, 9);
			G.TCitem = b;
			expect(damage_item(0, 1)).toBe(2); // kill=1 frees the whole stack
			expect(isNull(Titem, b)).toBe(true);
		});

		it('an item attached outside is only separated: 0, health untouched (parent_mode stays)', () => {
			const a = mk(MEAT);
			a.parent_class = Cclass_object;
			a.parent_id = 3;
			a.parent_mode = Cpm_out;
			G.TCitem = a;
			expect(damage_item(100)).toBe(0);
			expect([a.parent_class, a.parent_id, a.parent_mode, a.health]).toEqual([0, 0, Cpm_out, 15]);
			expect(RT.script.parse_sel).not.toHaveBeenCalled(); // no on:separate in the definition

			// stored inside (Cpm_in): damaged as usual
			const b = inv(MEAT, 1, Cclass_unit, 1);
			G.TCitem = b;
			expect(damage_item(5)).toBe(1);
			expect(b.health).toBe(10);
		});
	});

	describe('frap_item', () => {
		beforeEach(() => {
			G.gfx_ex = CreateImage(8, 8);
			G.gfx_ey = CreateImage(8, 8);
			G.gfx_ez = CreateImage(8, 8);
			G.gfx_esel = CreateImage(8, 8);
		});

		it('dragging the centre handle moves the item in the camera plane', () => {
			// off the camera axis: on it the blue (z) handle would cover the centre handle and be grabbed first
			const a = mk(LEAF, 1, 30, 20, 100);
			G.TCitem = a;
			G.in_fraph = a.h;
			CameraProject(G.cam, 30, 20, 100);
			const cx = Int(ProjectedX());
			const cy = Int(ProjectedY());
			G.in_editor_sidebar = 0;
			G.in_frapdown = 0;
			G.in_mx = cx;
			G.in_my = cy;
			G.in_mdown[1] = 1;
			G.in_mxs = 8;
			G.in_mys = 4;
			G.in_mzs = 0;
			frap_item();
			expect(G.in_frapdown).toBe(4);
			expect(G.in_cursorf).toBe(2);
			expect([G.in_mxo, G.in_myo]).toEqual([cx, cy]);
			expect(EntityX(a.h)).toBeCloseTo(28, 4); // -in_mxs*0.25 along the camera's x
			expect(EntityY(a.h)).toBeCloseTo(19, 4); // -in_mys*0.25
			expect(EntityZ(a.h)).toBeCloseTo(100, 4);
			expect(G.in_fraph).toBe(a.h);

			// held: keeps moving wherever the mouse is
			G.in_mx = 0;
			G.in_my = 0;
			frap_item();
			expect(G.in_frapdown).toBe(4);
			expect(EntityY(a.h)).toBeCloseTo(18, 4);
		});

		it('space leaves the mode, delete frees the item', () => {
			const a = mk(LEAF, 1, 0, 0, 100);
			G.TCitem = a;
			G.in_fraph = a.h;
			frap_item();
			expect(G.in_fraph).toBe(a.h);
			injectKeyDown(57);
			frap_item();
			expect(G.in_fraph).toBeNull();
			expect(isNull(Titem, a)).toBe(false);

			G.in_fraph = a.h;
			injectKeyDown(211);
			frap_item();
			expect(G.in_fraph).toBeNull();
			expect(isNull(Titem, a)).toBe(true);
		});
	});
});
