/**
 * Package entities1: handle_objects.bb, handle_units.bb, handle_all.bb, parentchild.bb.
 * Expected values are derived from the original source, branch by branch.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CreateCube,
	CreatePivot,
	CreateTexture,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	GetEntityType,
	GetParent,
	HideEntity,
	NameEntity,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	type BBEntity,
	type Handle
} from '../../src/lib/s2/bb3d';
import { Rand, Rnd, SEP_LINE, SeedRnd, Sin, f32, fmod, setClock } from '../../src/lib/s2/blitz';
import { CreateImage } from '../../src/lib/s2/gfx2d';
import { injectKeyDown, injectKeyUp } from '../../src/lib/s2/input';
import * as ai_units from '../../src/lib/s2/game/ai_units';
import * as console_ from '../../src/lib/s2/game/console';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_tiny,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_state,
	Cclass_unit,
	Cp_fall,
	Cp_flash,
	Cp_splash,
	Cpm_in,
	Cpm_out,
	Cres_texture,
	Csection_editor,
	Csection_game_mp,
	Csection_game_sp,
	Cstate_bloodrush,
	Cstate_fracture,
	Cstate_frostbite,
	Cstate_invulnerability,
	Cstate_speedmod,
	Cworld_col,
	ai_attack,
	ai_flee,
	ai_hunt,
	ai_sani,
	snd_die
} from '../../src/lib/s2/game/consts';
import {
	Ditem_name,
	Dobject_behaviour,
	Dobject_health,
	Dobject_mat,
	Dobject_model,
	Dobject_name,
	Dobject_script,
	Dobject_scriptk,
	Dobject_searchratio,
	Dobject_swaypower,
	Dobject_swayspeed,
	Dstate_a,
	Dunit_ani_die,
	Dunit_eyes,
	Dunit_mat,
	Dunit_modelh,
	Dunit_name,
	Dunit_speed,
	Dunit_state,
	Dunit_store,
	loadAllDefinitions
} from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as functions from '../../src/lib/s2/game/functions';
import {
	ha_copychilds,
	ha_damage,
	ha_distance,
	ha_free,
	ha_freespace,
	ha_getclass,
	ha_heal,
	ha_health,
	ha_idinrange,
	ha_inrange,
	ha_intersect,
	ha_killed,
	ha_pastechilds,
	ha_setpos,
	ha_type,
	ha_typeexists
} from '../../src/lib/s2/game/handle_all';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as handle_items from '../../src/lib/s2/game/handle_items';
import {
	alpha_object,
	con_object,
	damage_object,
	draw_object,
	find_object,
	frap_object,
	free_object,
	get_object,
	grow_object,
	object_spawnpos,
	search_object,
	serialpeak_object,
	set_object,
	update_object,
	update_object_behaviour,
	use_object
} from '../../src/lib/s2/game/handle_objects';
import * as handle_states from '../../src/lib/s2/game/handle_states';
import {
	ani_unit,
	checkattackline,
	con_unit,
	draw_unit,
	draw_units_debug,
	frap_unit,
	free_unit,
	freeze_unit,
	get_unit,
	get_unitcp,
	health_unit,
	hurt_unit,
	kill_unit,
	pos_unit,
	serialpeak_unit,
	set_unit,
	spawn_unit_items,
	unit_loadani,
	unit_scriptani,
	unit_speed,
	unit_values,
	use_unit
} from '../../src/lib/s2/game/handle_units';
import * as interface_ from '../../src/lib/s2/game/interface';
import * as load_bmpf from '../../src/lib/s2/game/load_bmpf';
import * as load_materials from '../../src/lib/s2/game/load_materials';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { se, sm, ss } from '../../src/lib/s2/game/load_strings';
import {
	drop_childs,
	free_childs,
	parent_con,
	parent_h,
	parent_material,
	parent_pos,
	parent_statepos,
	parent_stateposstatic,
	parent_stateposvertex
} from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import * as ressources from '../../src/lib/s2/game/ressources';
import { RT } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import {
	CONST_STORE,
	DeleteEach,
	First,
	New,
	TYPES,
	Tcopy,
	Tfind,
	Tfrap,
	Tinfo,
	Titem,
	Tobject,
	Tp,
	Tsani,
	Tstate,
	Ttimer,
	Tunit,
	Tup,
	Tx,
	isNull
} from '../../src/lib/s2/game/types';
import * as unitpath from '../../src/lib/s2/game/unitpath';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

// definitions of the shipped mod used below (objects.inf / units.inf)
const PALM = 1; // col 1, swayspeed 2, behaviour tree, health 300, growtime 10
const BUSH = 30; // col 2, swayspeed 0
const BUSH_NOCOL = 37; // col 0
const FENCE = 163; // col 3
const JETTY = 178; // align 1
const WATERPIPE = 187; // align 2
const TARGET = 192; // detailtex "1"
const GRAPEVINE = 44; // spawn 45,3,4,5,18,3,5
const BERRYBUSH = 46; // spawn 46,3,10,5,10,3,5
const TORCH = 166; // state 1,0,39,0
const POISONFLOWER = 110; // behaviour closetrigger
const BANGMUSHROOM = 186; // behaviour closekill

const PLAYER = 1; // behaviour 0, eyes 16
const RAPTOR = 2; // behaviour 2, col 1, colxr 15, colyr 30, eyes 10, health 110, speed 2.5, sfx raptor
const CRAB = 3; // behaviour 200, eyes 0, health 40
const SAILRAFT = 30; // behaviour 501, align 1, colyr 20
const PLANE = 39; // behaviour 502

const freed = (h: Handle): boolean => (h as BBEntity).freed;

describe.skipIf(!existsSync(MOD))('entities1', () => {
	let now = 0;
	let itemSerial = 0;
	let M: ReturnType<typeof mockOthers>;

	/** Stand-ins for the functions of other packages this package calls. */
	function mockOthers() {
		return {
			set_item: vi.spyOn(handle_items, 'set_item').mockImplementation((id, typ, x = 0, y = 0, z = 0, count = 1) => {
				const it = New(Titem);
				it.id = id === -1 ? ++itemSerial : id;
				it.typ = typ;
				it.count = count;
				it.h = CreateCube();
				PositionEntity(it.h, x, y, z);
				G.TCitem = it;
				return it.id;
			}),
			store_item: vi.spyOn(handle_items, 'store_item').mockImplementation(() => 1),
			countstored_items: vi.spyOn(handle_items, 'countstored_items').mockImplementation(() => 0),
			item_phyreset: vi.spyOn(handle_items, 'item_phyreset').mockImplementation(() => {}),
			get_item: vi.spyOn(handle_items, 'get_item').mockImplementation((h) => {
				for (let it = First(Titem); it !== null; it = Titem.list.after(it)) {
					if (it.h === h) {
						G.TCitem = it;
						return it.id;
					}
				}
				return -1;
			}),
			con_item: vi.spyOn(handle_items, 'con_item').mockImplementation((id) => {
				for (let it = First(Titem); it !== null; it = Titem.list.after(it)) {
					if (it.id === id) {
						G.TCitem = it;
						return 1;
					}
				}
				return 0;
			}),
			free_item: vi.spyOn(handle_items, 'free_item').mockImplementation(() => 1),
			damage_item: vi.spyOn(handle_items, 'damage_item').mockImplementation(() => 7),
			get_state: vi.spyOn(handle_states, 'get_state').mockImplementation(() => 0),
			free_state: vi.spyOn(handle_states, 'free_state').mockImplementation(() => 1),
			set_state: vi.spyOn(handle_states, 'set_state').mockImplementation((typ, parent_class, parent_id) => {
				const st = New(Tstate);
				st.typ = typ;
				st.parent_class = parent_class;
				st.parent_id = parent_id;
				return 1;
			}),
			look_state: vi.spyOn(handle_states, 'look_state').mockImplementation(() => {}),
			free_info: vi.spyOn(handle_infos, 'free_info').mockImplementation(() => 1),
			p_add: vi.spyOn(particles, 'p_add').mockImplementation(() => {
				const p = New(Tp);
				p.h = CreateCube();
				G.TCp = p;
			}),
			p_add2d: vi.spyOn(particles, 'p_add2d').mockImplementation(() => 0),
			if_msg: vi.spyOn(interface_, 'if_msg').mockImplementation(() => {}),
			if_exchange: vi.spyOn(interface_, 'if_exchange').mockImplementation(() => 0),
			material_fx: vi.spyOn(load_materials, 'material_fx').mockImplementation(() => {}),
			groundpitch: vi.spyOn(functions, 'groundpitch').mockImplementation(() => 12),
			ai_mode: vi.spyOn(ai_units, 'ai_mode').mockImplementation(() => {}),
			ai_modetxt: vi.spyOn(ai_units, 'ai_modetxt').mockImplementation((mode) => 'mode' + mode),
			up_free: vi.spyOn(unitpath, 'up_free').mockImplementation(() => {}),
			con_add: vi.spyOn(console_, 'con_add').mockImplementation(() => {}),
			bmpf_txt_c: vi.spyOn(load_bmpf, 'bmpf_txt_c').mockImplementation(() => {}),
			// the script engine and the audio layer are real; these record
			parse_task: vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {}),
			set_parsecache: vi.spyOn(RT.script, 'set_parsecache'),
			parse_sel: vi.spyOn(RT.script, 'parse_sel').mockImplementation(() => 0),
			parse_kill_add: vi.spyOn(RT.script, 'parse_kill_add'),
			parse_error: vi.spyOn(RT.script, 'parse_error').mockImplementation(() => {}),
			defvar_oncreate: vi.spyOn(RT.script, 'defvar_oncreate'),
			sfx: vi.spyOn(RT.audio, 'sfx').mockImplementation(() => 0),
			sfx_emit: vi.spyOn(RT.audio, 'sfx_emit').mockImplementation(() => 77),
			speech: vi.spyOn(RT.audio, 'speech').mockImplementation(() => 0),
			play_soundset: vi.spyOn(RT.audio, 'play_soundset').mockImplementation(() => 0),
			StopChannel: vi.spyOn(RT.audio.bb, 'StopChannel').mockImplementation(() => {})
		};
	}

	beforeEach(async () => {
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb());
		now = 1000;
		setClock(() => (now += 20));
		SeedRnd(0x1234);
		include_load_setup();
		// unit models are loaded (and their animation sequences extracted) by load_units
		await RT.world.preload(['gfx\\strandedguy.b3d', 'gfx\\raptor.b3d', 'gfx\\crab.b3d', 'gfx\\sailraft.b3d', 'gfx\\plane.b3d']);
		await loadAllDefinitions();
		itemSerial = 0;
		M = mockOthers();
		G.m_section = Csection_game_sp;
		G.tmp_loading = 0;
		G.set_debug = 0;
		G.set_terrain = 0;
		G.set_viewfac = 1;
		G.ter = null;
		G.ter_groundy = 0;
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

	// ------------------------------------------------------------ fixtures

	/** A Tobject without model loading: a cube as entity. */
	function obj(id: number, typ: number, x = 0, y = 0, z = 0): Tobject {
		const o = New(Tobject);
		o.id = id;
		o.typ = typ;
		o.h = CreateCube();
		PositionEntity(o.h, x, y, z);
		o.health = f32(Dobject_health(typ));
		o.health_max = o.health;
		return o;
	}
	/** A Tunit without model: pivot + cube child, like set_unit builds it. */
	function unit(id: number, typ: number, x = 0, y = 0, z = 0): Tunit {
		const u = New(Tunit);
		u.id = id;
		u.typ = typ;
		u.h = CreatePivot();
		PositionEntity(u.h, x, y, z);
		u.mh = CreateCube(u.h);
		u.health = 100;
		u.health_max = 100;
		return u;
	}
	function item(id: number, typ: number, x = 0, y = 0, z = 0): Titem {
		const it = New(Titem);
		it.id = id;
		it.typ = typ;
		it.count = 1;
		it.h = CreateCube();
		PositionEntity(it.h, x, y, z);
		return it;
	}
	function info(id: number, typ: number, x = 0, y = 0, z = 0): Tinfo {
		const i = New(Tinfo);
		i.id = id;
		i.typ = typ;
		i.h = CreatePivot();
		PositionEntity(i.h, x, y, z);
		return i;
	}
	function find(cls: number, parent: number, typ: number, ratio: number, min: number, max: number, reqtyp = 0): Tfind {
		const f = New(Tfind);
		f.class = cls;
		f.parent = parent;
		f.typ = typ;
		f.ratio = ratio;
		f.min = min;
		f.max = max;
		f.reqtyp = reqtyp;
		return f;
	}
	async function model(typ: number): Promise<void> {
		await RT.world.preload([Dobject_model(typ)]);
	}
	/** First seed (from 1) whose fresh random sequence satisfies the predicate. */
	function seedWhere(pred: () => boolean): number {
		for (let s = 1; s < 5000; s++) {
			SeedRnd(s);
			if (pred()) return s;
		}
		throw new Error('no seed');
	}
	const count = <T extends object>(t: { list: { count: number } } & object): number => (t as { list: { count: number } }).list.count;

	// ============================================================ handle_objects.bb

	describe('set_object', () => {
		it('invalid typ: -1, TCobject Null, nothing created', () => {
			G.TCobject = obj(1, PALM);
			G.object_serial = 5;
			expect(set_object(-1, 254, 0, 0)).toBe(-1);
			expect(G.TCobject).toBeNull();
			expect(G.object_serial).toBe(5);
			expect(count(Tobject)).toBe(1);
		});

		it('creates a swaying col-1 object with a collision copy and fires on:create', async () => {
			await model(PALM);
			G.object_serial = 10;
			SeedRnd(99);
			const sway = Rand(0, 360);
			SeedRnd(99);
			// quirk: no Return value at the end of the function: 0
			expect(set_object(-1, PALM, 100, 200, 45)).toBe(0);
			const o = G.TCobject!;
			expect(o.id).toBe(11);
			expect(G.object_serial).toBe(11);
			expect(o.typ).toBe(PALM);
			expect(o.windsway).toBe(sway);
			expect(o.health).toBe(300);
			expect(o.health_max).toBe(300);
			expect(o.alpha).toBe(1);
			expect([EntityX(o.h), EntityY(o.h), EntityZ(o.h)]).toEqual([100, 0, 200]);
			expect(EntityYaw(o.h)).toBeCloseTo(45, 3);
			// swayspeed<>0: the model itself has no collision type, the invisible copy has
			expect(o.ch).not.toBeNull();
			expect(GetEntityType(o.ch)).toBe(Cworld_col);
			expect(GetEntityType(o.h)).toBe(0);
			expect([EntityX(o.ch), EntityY(o.ch), EntityZ(o.ch)]).toEqual([100, 0, 200]);
			expect(EntityYaw(o.ch)).toBeCloseTo(45, 3);
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_object, 11, 'create');
			expect(M.defvar_oncreate).toHaveBeenCalledWith(Cclass_object, 11, PALM);
			expect(M.parse_task).not.toHaveBeenCalled(); // the palm has no on:create
		});

		it('on:create is queued when the definition script has the event; not while loading', async () => {
			await model(BUSH);
			Dobject_scriptk.set(BUSH, SEP_LINE + 'create' + SEP_LINE + 'use');
			set_object(-1, BUSH, 0, 0);
			expect(M.parse_task).toHaveBeenCalledWith(Cclass_object, G.TCobject!.id, 'create', '', Dobject_script(BUSH));
			M.parse_task.mockClear();
			M.set_parsecache.mockClear();
			M.defvar_oncreate.mockClear();
			G.tmp_loading = 1;
			set_object(-1, BUSH, 0, 0);
			expect(M.parse_task).not.toHaveBeenCalled();
			expect(M.set_parsecache).not.toHaveBeenCalled();
			expect(M.defvar_oncreate).not.toHaveBeenCalled();
		});

		it('an explicit id leaves the serial alone', async () => {
			await model(BUSH);
			G.object_serial = 3;
			set_object(500, BUSH, 1, 2);
			expect(G.TCobject!.id).toBe(500);
			expect(G.object_serial).toBe(3);
		});

		it('collision by Dobject_col: 2 none, 0 none, 3 copy, 1 without sway on the model; none in the editor', async () => {
			await model(BUSH);
			await model(BUSH_NOCOL);
			await model(FENCE);
			await model(TORCH);
			await model(PALM);
			set_object(-1, BUSH, 0, 0);
			expect(G.TCobject!.ch).toBeNull();
			expect(GetEntityType(G.TCobject!.h)).toBe(0);
			set_object(-1, BUSH_NOCOL, 0, 0);
			expect(G.TCobject!.ch).toBeNull();
			set_object(-1, FENCE, 7, 8);
			expect(G.TCobject!.ch).not.toBeNull();
			expect(GetEntityType(G.TCobject!.ch)).toBe(Cworld_col);
			expect(EntityX(G.TCobject!.ch)).toBe(7);
			set_object(-1, TORCH, 0, 0); // col 1, no sway
			expect(G.TCobject!.ch).toBeNull();
			expect(GetEntityType(G.TCobject!.h)).toBe(Cworld_col);
			G.m_section = Csection_editor;
			set_object(-1, PALM, 0, 0);
			expect(G.TCobject!.ch).toBeNull();
			expect(GetEntityType(G.TCobject!.h)).toBe(0);
		});

		it('align 1 lifts to y=1, align 2 pitches to the ground', async () => {
			await model(JETTY);
			await model(WATERPIPE);
			set_object(-1, JETTY, 5, 6);
			expect(EntityY(G.TCobject!.h)).toBe(1);
			G.ter_groundy = 30;
			set_object(-1, JETTY, 5, 6);
			expect(EntityY(G.TCobject!.h)).toBe(30);
			set_object(-1, WATERPIPE, 5, 6, 90);
			expect(M.groundpitch).toHaveBeenCalledWith(G.TCobject!.h, 60);
			expect(EntityPitch(G.TCobject!.h)).toBeCloseTo(12, 3);
			expect(EntityYaw(G.TCobject!.h)).toBeCloseTo(90, 3);
		});

		it('detail texture: only with set_terrain>1; "" is not "0", so load_res("") is asked (quirk)', async () => {
			await model(BUSH);
			await model(TARGET);
			const load_res = vi.spyOn(ressources, 'load_res');
			const textures = () => load_res.mock.calls.filter((c) => c[1] === Cres_texture);
			G.set_terrain = 1;
			set_object(-1, BUSH, 0, 0);
			expect(textures()).toEqual([]);
			G.set_terrain = 2;
			G.gfx_struc = CreateTexture(8, 8);
			set_object(-1, TARGET, 0, 0); // detailtex "1": gfx_struc, no load
			expect(textures()).toEqual([]);
			set_object(-1, BUSH, 0, 0);
			expect(textures()).toEqual([['', Cres_texture, 768]]);
		});
	});

	describe('get_object / con_object / alpha_object / serialpeak_object', () => {
		it('finds by model and by collision handle and sets TCobject', () => {
			const a = obj(4, PALM);
			const b = obj(9, PALM);
			b.ch = CreateCube();
			expect(get_object(null)).toBe(-1);
			expect(get_object(b.ch)).toBe(9);
			expect(G.TCobject).toBe(b);
			expect(get_object(a.h)).toBe(4);
			expect(G.TCobject).toBe(a);
			expect(get_object(CreatePivot())).toBe(-1);
			expect(G.TCobject).toBe(a);
		});

		it('con_object, alpha_object, serialpeak_object', () => {
			const a = obj(4, PALM);
			const b = obj(9, PALM);
			expect(con_object(9)).toBe(1);
			expect(G.TCobject).toBe(b);
			expect(con_object(5)).toBe(0);
			expect(G.TCobject).toBe(b);
			expect(alpha_object(4, 0.3)).toBe(1);
			expect(a.alpha).toBe(f32(0.3));
			expect(alpha_object(77, 0.3)).toBe(0);
			serialpeak_object();
			expect(G.object_serial).toBe(9);
			DeleteEach(Tobject);
			serialpeak_object();
			expect(G.object_serial).toBe(0);
		});
	});

	describe('use_object', () => {
		it('sets the parse cache and queues on:use only if the definition has it', () => {
			obj(4, PALM);
			expect(use_object(4)).toBe(1);
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_object, 4, 'use');
			expect(M.parse_task).not.toHaveBeenCalled();
			Dobject_scriptk.set(PALM, SEP_LINE + 'use');
			expect(use_object(4)).toBe(1);
			expect(M.parse_task).toHaveBeenCalledWith(Cclass_object, 4, 'use', '', Dobject_script(PALM));
			expect(use_object(5)).toBe(0);
		});
	});

	describe('search_object / find_object', () => {
		beforeEach(() => {
			DeleteEach(Tfind);
			G.g_player = 1;
			unit(1, PLAYER);
			G.in_mx = 300;
			G.in_my = 200;
		});

		it('search_object: finds with ratio 100, stores at the player, returns 0', () => {
			obj(4, PALM);
			find(Cclass_object, PALM, 15, 100, 2, 2);
			expect(search_object(4, 15)).toBe(0);
			expect(M.set_item).toHaveBeenCalledWith(-1, 15, 0, 0, 0, 2);
			expect(M.p_add2d).toHaveBeenCalledWith(300, 200, -2, 15);
			expect(M.if_msg).toHaveBeenCalledWith(Ditem_name(15) + ' gefunden!', Cbmpf_green);
			expect(M.store_item).toHaveBeenCalledWith(G.TCitem!.id, Cclass_unit, 1, Cpm_in);
			// other item type / unknown object: nothing
			M.set_item.mockClear();
			expect(search_object(4, 16)).toBe(0);
			expect(search_object(99, 15)).toBe(0);
			expect(M.set_item).not.toHaveBeenCalled();
		});

		it('search_object: ratio 0 finds nothing; closes the menu when the object is gone', () => {
			obj(4, PALM);
			find(Cclass_object, PALM, 15, 0, 1, 1);
			G.m_menu = 9;
			expect(search_object(4, 15)).toBe(0);
			expect(M.set_item).not.toHaveBeenCalled();
			expect(G.m_menu).toBe(9);
			M.store_item.mockImplementation(() => {
				DeleteEach(Tobject);
				return 1;
			});
			First(Tfind)!.ratio = 100;
			search_object(4, 15);
			expect(G.m_menu).toBe(0);
		});

		it('find_object: no player, unknown object, nothing to find', () => {
			obj(4, PALM);
			find(Cclass_object, PALM, 15, 50, 1, 1, 60); // needs weapon 60
			expect(find_object(4)).toBe(0); // total 0: wrong weapon
			expect(find_object(99)).toBe(0);
			G.g_player = 2;
			expect(find_object(4)).toBe(0);
			expect(M.set_item).not.toHaveBeenCalled();
		});

		it('find_object: picks by ratio, creates at the camera, stores, reports the count', () => {
			obj(4, PALM);
			find(Cclass_unit, PALM, 99, 1000, 1, 1); // other class: ignored
			find(Cclass_object, PALM, 15, 50, 1, 3);
			find(Cclass_object, PALM, 24, 50, 2, 2, 60); // weapon 60
			G.TCunit = null;
			First(Tunit)!.player_weapon = 60;
			PositionEntity(G.cam, 11, 22, 33);
			expect(Dobject_searchratio(PALM)).toBe(30);
			// total=100; Rand(1,100)<=30, then total_r=Rand(0,100) in the second entry's range (51..100)
			const seed = seedWhere(() => Rand(1, 100) <= 30 && Rand(0, 100) > 50);
			SeedRnd(seed);
			M.countstored_items.mockReturnValueOnce(3).mockReturnValueOnce(5);
			expect(find_object(4)).toBe(1);
			expect(M.set_item).toHaveBeenCalledWith(-1, 24, 11, 22, 33, 2);
			expect(M.p_add2d).toHaveBeenCalledWith(300, 200, -2, 24);
			expect(M.store_item).toHaveBeenCalledWith(G.TCitem!.id, Cclass_unit, 1, Cpm_in);
			expect(M.countstored_items).toHaveBeenCalledWith(Cclass_unit, 1, 24, 0);
			expect(M.if_msg).toHaveBeenCalledWith(ss(sm(180), Ditem_name(24), '2'), Cbmpf_green);
			expect(M.sfx).toHaveBeenCalledWith(G.sfx_collect);

			// first entry (0..50), count from Rand(min,max); no space: fail message and speech
			M.set_item.mockClear();
			M.store_item.mockImplementation(() => 0);
			const seed2 = seedWhere(() => Rand(1, 100) <= 30 && Rand(0, 100) <= 50);
			SeedRnd(seed2);
			Rand(1, 100);
			Rand(0, 100);
			const findcount = Rand(1, 3);
			SeedRnd(seed2);
			expect(find_object(4)).toBe(1);
			expect(M.set_item).toHaveBeenCalledWith(-1, 15, 11, 22, 33, findcount);
			expect(M.if_msg).toHaveBeenLastCalledWith(sm(181), Cbmpf_red);
			expect(M.sfx).toHaveBeenLastCalledWith(G.sfx_fail);
			expect(M.speech).toHaveBeenCalledWith('nospace');

			// the search ratio fails: 0, nothing created
			M.set_item.mockClear();
			SeedRnd(seedWhere(() => Rand(1, 100) > 30));
			expect(find_object(4)).toBe(0);
			expect(M.set_item).not.toHaveBeenCalled();
		});
	});

	describe('free_object', () => {
		it('frees entity, collision copy, object and its children', () => {
			const o = obj(4, PALM);
			o.ch = CreateCube();
			const { h, ch } = o;
			const fr = New(Tfrap);
			fr.parent_class = Cclass_object;
			fr.parent_id = 4;
			expect(free_object(4)).toBe(1);
			expect(freed(h)).toBe(true);
			expect(freed(ch)).toBe(true);
			expect(isNull(Tobject, o)).toBe(true);
			expect(count(Tfrap)).toBe(0);
			expect(M.item_phyreset).toHaveBeenCalledOnce();
			expect(free_object(4)).toBe(0);
		});

		it('entity=0 keeps the model in tmp_h without collision type; childs=0 keeps the children', () => {
			const o = obj(4, PALM);
			const fr = New(Tfrap);
			fr.parent_class = Cclass_object;
			fr.parent_id = 4;
			const h = o.h;
			expect(free_object(4, 1, 0, 0)).toBe(1);
			expect(freed(h)).toBe(false);
			expect(G.tmp_h).toBe(h);
			expect(GetEntityType(h)).toBe(0);
			expect(count(Tfrap)).toBe(1);
			expect(count(Tobject)).toBe(0);
		});
	});

	describe('update_object / update_object_behaviour', () => {
		it('windsway advances by swayspeed*f and rolls by Sin(angle)*swaypower', () => {
			const o = obj(4, PALM);
			o.windsway = 350;
			G.TCobject = o;
			G.f = f32(7.5);
			RotateEntity(o.h, 0, 30, 0);
			G.set_windsway = 0;
			update_object();
			expect(o.windsway).toBe(350);
			G.set_windsway = 1;
			update_object();
			const angle = fmod(f32(350 + f32(Dobject_swayspeed(PALM) * G.f)), 360);
			expect(angle).toBe(5); // 350 + 2*7.5 = 365 Mod 360
			expect(o.windsway).toBe(angle);
			expect(EntityRoll(o.h)).toBeCloseTo(f32(Sin(angle) * Dobject_swaypower(PALM)), 3);
			expect(EntityYaw(o.h)).toBeCloseTo(30, 3);
		});

		it('fountain: splash particle every 50 ms tick, sound when near and silent', () => {
			const o = obj(4, BUSH, 10, 20, 30);
			Dobject_behaviour.set(BUSH, 'fountain');
			G.TCobject = o;
			G.sfx_fountain = 5;
			PositionEntity(G.cam, 10, 20, 500);
			G.in_gt50go = 0;
			update_object_behaviour();
			expect(M.p_add).not.toHaveBeenCalled();
			expect(M.sfx_emit).not.toHaveBeenCalled(); // 470 away
			G.in_gt50go = 1;
			PositionEntity(G.cam, 10, 20, 130);
			SeedRnd(7);
			const rx = Rnd(-3, 3);
			const rz = Rnd(-3, 3);
			const size = Rnd(15, 18);
			SeedRnd(7);
			update_object_behaviour();
			expect(M.p_add).toHaveBeenCalledWith(f32(10 + rx), 25, f32(30 + rz), Cp_splash, size, 1);
			expect(M.sfx_emit).toHaveBeenCalledOnce();
			expect(M.sfx_emit.mock.calls[0][0]).toBe(5);
			expect(o.chan).toBe(77);
		});

		it('closetrigger: on:trigger when the player is within 50 on the 500 ms tick', () => {
			const o = obj(4, POISONFLOWER);
			G.TCobject = o;
			const p = unit(1, PLAYER, 0, 0, 60);
			G.g_cplayer = p;
			G.in_gt500go = 1;
			update_object_behaviour();
			expect(M.set_parsecache).not.toHaveBeenCalled();
			PositionEntity(p.h, 0, 0, 40);
			G.in_gt500go = 0;
			update_object_behaviour();
			expect(M.set_parsecache).not.toHaveBeenCalled();
			G.in_gt500go = 1;
			update_object_behaviour();
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_object, 4, 'trigger');
			expect(M.parse_task).toHaveBeenCalledTimes(Dobject_scriptk(POISONFLOWER).includes(SEP_LINE + 'trigger') ? 1 : 0);
			G.g_cplayer = null;
			M.set_parsecache.mockClear();
			update_object_behaviour();
			expect(M.set_parsecache).not.toHaveBeenCalled();
		});

		it('closekill: the object dies when the player is within 50 on the 100 ms tick', () => {
			const o = obj(4, BANGMUSHROOM);
			G.TCobject = o;
			G.g_cplayer = unit(1, PLAYER, 0, 0, 40);
			G.in_gt100go = 0;
			update_object_behaviour();
			expect(count(Tobject)).toBe(1);
			G.in_gt100go = 1;
			update_object_behaviour();
			expect(count(Tobject)).toBe(0);
			expect(G.tmp_kill).toBe(1);
		});
	});

	describe('damage_object', () => {
		it('reduces health, material effect at the object; invulnerable objects keep their health', () => {
			const o = obj(4, PALM, 1, 2, 3);
			G.TCobject = o;
			expect(damage_object(120.5)).toBe(1);
			expect(o.health).toBe(179.5);
			expect(M.get_state).toHaveBeenCalledWith(Cstate_invulnerability, Cclass_object, 4);
			expect(M.material_fx).toHaveBeenCalledWith(1, 2, 3, Dobject_mat(PALM));
			M.get_state.mockReturnValue(1);
			expect(damage_object(500)).toBe(1);
			expect(o.health).toBe(179.5);
		});

		it('pickcords 1 uses the pick position, any other value no effect', () => {
			G.TCobject = obj(4, PALM, 1, 2, 3);
			G.in_px = 7;
			G.in_py = 8;
			G.in_pz = 9;
			damage_object(1, 0, 1);
			expect(M.material_fx).toHaveBeenLastCalledWith(7, 8, 9, Dobject_mat(PALM));
			M.material_fx.mockClear();
			damage_object(1, 0, 2);
			expect(M.material_fx).not.toHaveBeenCalled();
		});

		it('kill: event, kill pivot for the parser, model handed to the fall particle', () => {
			const o = obj(4, PALM, 1, 2, 3);
			RotateEntity(o.h, 0, 40, 0);
			o.daytimer = -3;
			const h = o.h;
			G.TCobject = o;
			G.sfx_treefall = 9;
			const out = item(50, 15);
			out.parent_class = Cclass_object;
			out.parent_id = 4;
			out.parent_mode = Cpm_out;
			out.phy_pause = 1;
			expect(damage_object(300)).toBe(2);
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_object, 4, 'kill');
			expect(out.parent_class).toBe(0); // drop_childs
			expect(M.sfx_emit.mock.calls.map((c) => c[0])).toEqual([9]); // behaviour tree
			expect(isNull(Tobject, o)).toBe(true);
			expect(freed(h)).toBe(false);
			expect(G.tmp_h).toBe(h);
			expect(G.tmp_ph).toBe(h);
			expect([G.tmp_killclass, G.tmp_killid, G.tmp_killspawntimer, G.tmp_kill]).toEqual([Cclass_object, 4, -3, 1]);
			expect(M.parse_kill_add).toHaveBeenCalledWith(Cclass_object, 4, G.tmp_killmodel, -3);
			const piv = G.tmp_killmodel;
			expect(piv).not.toBe(h);
			expect([EntityX(piv), EntityY(piv), EntityZ(piv)]).toEqual([1, 2, 3]);
			expect(EntityYaw(piv)).toBeCloseTo(40, 3);
			expect(M.p_add).toHaveBeenCalledWith(0, 0, 0, Cp_fall);
			expect(M.item_phyreset).toHaveBeenCalledTimes(2); // free_object and damage_object
		});

		it('kill=1 kills whatever the health; non-trees make no sound', () => {
			const o = obj(4, BUSH);
			G.TCobject = o;
			expect(damage_object(0, 1)).toBe(2);
			expect(count(Tobject)).toBe(0);
			expect(M.sfx_emit).not.toHaveBeenCalled();
		});
	});

	describe('grow_object', () => {
		it('grown objects (daytimer>=0) keep health when health_max already fits', () => {
			const o = obj(4, PALM);
			o.health = 7;
			grow_object(o);
			expect(o.health_max).toBe(300);
			expect(o.health).toBe(7);
		});

		it('growing: percentage (growtime+daytimer)/growtime, at least 1/growtime; health follows', () => {
			const o = obj(4, PALM); // growtime 10
			o.ch = CreateCube();
			o.daytimer = -5;
			grow_object(o);
			expect(o.health_max).toBe(150);
			expect(o.health).toBe(150);
			o.daytimer = -20; // part<1 -> 1 -> 10%
			grow_object(o);
			expect(o.health_max).toBe(30);
			expect(o.health).toBe(30);
			o.daytimer = -3; // 70%: Ceil(300*0.7)
			grow_object(o);
			expect(o.health_max).toBe(Math.ceil(f32(300 * f32(f32(7) / f32(10)))));
		});
	});

	describe('object_spawnpos', () => {
		it('0 for unknown ids and objects without spawn definition', () => {
			obj(4, PALM);
			expect(object_spawnpos(4)).toBe(0);
			expect(object_spawnpos(5)).toBe(0);
		});

		it('random position around the object from the spawn definition of TCobject (quirk)', () => {
			const o = obj(4, GRAPEVINE, 100, 50, 200); // 45,3,4,5,18,3,5
			G.TCobject = o;
			SeedRnd(21);
			const ry = Rnd(-5, 5);
			const yaw = Rand(360);
			const dist = Rnd(f32(4 / 2.5), 4);
			SeedRnd(21);
			expect(object_spawnpos(4)).toBe(1);
			expect(G.tmp_y).toBe(f32(f32(50 + ry) + 18));
			const d = Math.hypot(G.tmp_x - 100, G.tmp_z - 200);
			expect(d).toBeCloseTo(dist, 3);
			expect(d).toBeGreaterThanOrEqual(1.59);
			expect(d).toBeLessThanOrEqual(4.01);
			expect(G.tmp_x).toBeCloseTo(100 - Math.sin((yaw * Math.PI) / 180) * dist, 3);
			expect(G.tmp_z).toBeCloseTo(200 + Math.cos((yaw * Math.PI) / 180) * dist, 3);

			// quirk: the definition of TCobject's typ is split, not the one of the object found
			G.TCobject = obj(5, BERRYBUSH); // 46,3,10,5,10,3,5
			SeedRnd(21);
			expect(object_spawnpos(4)).toBe(1);
			expect(G.tmp_y).toBe(f32(f32(50 + ry) + 10));
		});
	});

	describe('draw_object / frap_object', () => {
		beforeEach(() => {
			PositionEntity(G.cam, 0, 0, -100);
			RotateEntity(G.cam, 0, 0, 0);
			G.gfx_ex = CreateImage(8, 8);
			G.gfx_ey = CreateImage(8, 8);
			G.gfx_ez = CreateImage(8, 8);
			G.gfx_esel = CreateImage(8, 8);
			G.in_editor_sidebar = 1;
		});

		it('draw_object: label, info text; Space starts FRAP mode, Del frees', () => {
			const o = obj(4, PALM);
			G.TCobject = o;
			draw_object();
			expect(M.bmpf_txt_c).toHaveBeenCalledWith(400, 270, '#4 ' + Dobject_name(PALM), Cbmpf_tiny);
			expect(G.in_edoverinfo).toBe(ss(se(197), Dobject_name(PALM)));
			expect(count(Tfrap)).toBe(0);
			injectKeyDown(57);
			draw_object();
			injectKeyUp(57);
			expect(count(Tfrap)).toBe(1);
			const fr = First(Tfrap)!;
			expect([fr.parent_class, fr.parent_id, fr.y, fr.pitch, fr.roll]).toEqual([Cclass_object, 4, 0, 0, 0]);
			expect(G.in_fraph).toBe(o.h);
			// existing FRAP: no second one
			G.in_fraph = null;
			injectKeyDown(57);
			draw_object();
			injectKeyUp(57);
			expect(count(Tfrap)).toBe(1);
			expect(G.in_fraph).toBe(o.h);
			injectKeyDown(211);
			draw_object();
			injectKeyUp(211);
			expect(count(Tobject)).toBe(0);
		});

		it('draw_object: nothing when the object is not in view', () => {
			G.TCobject = obj(4, PALM, 0, 0, -500); // behind the camera
			draw_object();
			expect(M.bmpf_txt_c).not.toHaveBeenCalled();
			expect(G.in_edoverinfo).toBe('');
		});

		it('frap_object: dragging the centre handle moves on the camera plane and in height', () => {
			const o = obj(4, PALM, 10, 5, 0);
			G.TCobject = o;
			const fr = New(Tfrap);
			fr.parent_class = Cclass_object;
			fr.parent_id = 4;
			G.in_frapdown = 4;
			G.in_mdown[1] = 1;
			G.in_mxs = 4;
			G.in_mys = 8;
			G.in_mzs = 12;
			frap_object();
			// TranslateEntity h,0,-in_mys*0.25,0 ; pivot at camera yaw moved by (-in_mxs*0.25, 0, in_mzs*0.25)
			expect(EntityX(o.h)).toBeCloseTo(9, 4);
			expect(EntityY(o.h)).toBeCloseTo(3, 4);
			expect(EntityZ(o.h)).toBeCloseTo(3, 4);
			expect(G.in_frapdown).toBe(4);
			expect(G.in_cursorf).toBe(2);
			expect(G.in_mxo).toBe(G.in_mx);
			expect(G.in_myo).toBe(G.in_my);
			expect(fr.y).toBe(f32(EntityY(o.h)));
			expect(G.in_edoverinfo).toBe(ss(se(197), Dobject_name(PALM)));
			expect(M.bmpf_txt_c).not.toHaveBeenCalled(); // the name only while nothing is dragged
		});

		it('frap_object: the green handle turns (yaw), with Shift it moves along the axis', () => {
			const o = obj(4, BUSH, 10, 5, 0);
			G.TCobject = o;
			G.in_frapdown = 2;
			G.in_mdown[1] = 1;
			G.in_mxs = 4;
			G.in_mys = 8;
			frap_object();
			expect(EntityYaw(o.h)).toBeCloseTo(3, 4);
			expect(G.in_cursorf).toBe(4);
			expect(EntityY(o.h)).toBe(5);
			injectKeyDown(42);
			frap_object();
			injectKeyUp(42);
			expect(EntityY(o.h)).toBeCloseTo(8, 4);
			expect(G.in_cursorf).toBe(2);
		});

		it('frap_object: no mouse button, nothing dragged: name label; Space leaves, Del frees', () => {
			const o = obj(4, BUSH, 10, 5, 0);
			G.TCobject = o;
			G.in_fraph = o.h;
			G.in_mx = 0;
			G.in_my = 0;
			frap_object();
			expect(M.bmpf_txt_c).toHaveBeenCalledOnce();
			expect(M.bmpf_txt_c.mock.calls[0][2]).toBe('#4 ' + Dobject_name(BUSH));
			expect([EntityX(o.h), EntityY(o.h), EntityZ(o.h)]).toEqual([10, 5, 0]);
			expect(G.in_fraph).toBe(o.h);
			injectKeyDown(57);
			frap_object();
			injectKeyUp(57);
			expect(G.in_fraph).toBeNull();
			G.in_fraph = o.h;
			injectKeyDown(211);
			frap_object();
			injectKeyUp(211);
			expect(count(Tobject)).toBe(0);
			expect(G.in_fraph).toBeNull();
		});
	});

	// ============================================================ handle_units.bb

	describe('set_unit', () => {
		it('invalid typ: -1 and TCunit Null', () => {
			G.TCunit = unit(5, RAPTOR);
			G.unit_serial = 100;
			expect(set_unit(-1, 99, 0, 0)).toBe(-1);
			expect(G.TCunit).toBeNull();
			expect(G.unit_serial).toBe(100);
			expect(count(Tunit)).toBe(1);
		});

		it('collision pivot with the model as child, on the ground (align 0)', () => {
			G.unit_serial = 100;
			G.ter_groundy = 4;
			expect(set_unit(-1, RAPTOR, 10, 20)).toBe(0); // quirk: no Return value at the end
			const u = G.TCunit!;
			expect(u.id).toBe(101);
			expect(G.unit_serial).toBe(101);
			expect(u.typ).toBe(RAPTOR);
			expect(u.h_pivot).toBe(1);
			// pivot: terrain + 50 + colyr(30), then 50 down; the model: terrain
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([10, 34, 20]);
			expect(GetParent(u.mh)).toBe(u.h);
			expect([EntityX(u.mh, 1), EntityY(u.mh, 1), EntityZ(u.mh, 1)]).toEqual([10, 4, 20]);
			expect(GetEntityType(u.h)).toBe(1);
			expect(u.vh).toBeNull();
			expect(u.health).toBe(110);
			expect(u.health_max).toBe(110);
			expect([u.ai_cx, u.ai_cz]).toEqual([10, 20]);
			expect(u.ai_ch).not.toBeNull();
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_unit, 101, 'create');
			expect(M.defvar_oncreate).toHaveBeenCalledWith(Cclass_unit, 101, RAPTOR);
		});

		it('debug: a sphere instead of the pivot; while loading no events; explicit id', () => {
			G.set_debug = 1;
			G.tmp_loading = 1;
			G.unit_serial = 100;
			set_unit(7, RAPTOR, 0, 0);
			expect(G.TCunit!.id).toBe(7);
			expect(G.unit_serial).toBe(100);
			expect(G.TCunit!.h_pivot).toBe(0);
			expect(M.set_parsecache).not.toHaveBeenCalled();
			expect(M.defvar_oncreate).not.toHaveBeenCalled();
		});

		it('vehicles (behaviour >499, not 502) get a collision model; align 1 puts the pivot at 1+colyr', () => {
			set_unit(-1, SAILRAFT, 10, 20);
			const u = G.TCunit!;
			expect(u.vh).not.toBeNull();
			expect(GetEntityType(u.vh)).toBe(Cworld_col);
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([10, 21, 20]);
			expect(EntityY(u.mh, 1)).toBe(1);
			// quirk: the vehicle model is not positioned here
			expect([EntityX(u.vh) + 0, EntityY(u.vh) + 0, EntityZ(u.vh) + 0]).toEqual([0, 0, 0]);
			set_unit(-1, PLANE, 0, 0);
			expect(G.TCunit!.vh).toBeNull();
		});

		it('in the editor the model plays its move animation', () => {
			G.m_section = Csection_editor;
			expect(set_unit(-1, RAPTOR, 0, 0)).toBe(0);
			expect(G.TCunit).not.toBeNull();
			// models without animation frames come from LoadAnimMesh too: Animate works on them
			expect(set_unit(-1, SAILRAFT, 0, 0)).toBe(0);
			freeze_unit(G.TCunit);
			expect(G.TCunit!.freeze).toBe(1);
		});
	});

	describe('get_unit / get_unitcp / con_unit / serialpeak_unit', () => {
		it('by model handle, by collision pivot or vehicle model', () => {
			const a = unit(5, RAPTOR);
			const b = unit(6, SAILRAFT);
			b.vh = CreateCube();
			expect(get_unit(b.mh)).toBe(6);
			expect(G.TCunit).toBe(b);
			expect(get_unit(b.h)).toBe(-1); // mode 0 looks at models only
			expect(get_unit(a.h, 1)).toBe(5);
			expect(G.TCunit).toBe(a);
			expect(get_unit(b.vh, 1)).toBe(6);
			expect(get_unit(a.mh, 1)).toBe(-1);
			expect(get_unitcp(b.h)).toBe(6);
			expect(get_unitcp(b.vh)).toBe(-1);
		});

		it('quirk: handle 0 by collision pivot matches the first unit without vehicle model', () => {
			const b = unit(6, SAILRAFT);
			b.vh = CreateCube();
			unit(5, RAPTOR);
			expect(get_unit(null, 1)).toBe(5);
			expect(get_unit(null, 0)).toBe(-1);
		});

		it('con_unit and serialpeak_unit (at least 99)', () => {
			const a = unit(5, RAPTOR);
			expect(con_unit(5)).toBe(1);
			expect(G.TCunit).toBe(a);
			expect(con_unit(6)).toBe(0);
			expect(G.TCunit).toBe(a);
			serialpeak_unit();
			expect(G.unit_serial).toBe(99);
			unit(140, RAPTOR);
			serialpeak_unit();
			expect(G.unit_serial).toBe(140);
		});
	});

	describe('use_unit / free_unit', () => {
		it('use: events; loot window only for dead units and unless the script skips', () => {
			const u = unit(5, RAPTOR);
			G.p_skipevent = 1;
			expect(use_unit(5)).toBe(1);
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_unit, 5, 'use');
			expect(M.parse_sel).toHaveBeenCalledWith(Cclass_unit, 5, 'use');
			expect(M.if_exchange).not.toHaveBeenCalled(); // alive
			u.health = 0;
			expect(use_unit(5)).toBe(1);
			expect(M.if_exchange).toHaveBeenCalledWith(Cclass_unit, 5);
			M.if_exchange.mockClear();
			M.parse_sel.mockImplementation(() => {
				G.p_skipevent = 1;
				return 1;
			});
			use_unit(5);
			expect(M.if_exchange).not.toHaveBeenCalled();
			// the script freed the unit
			M.parse_sel.mockImplementation(() => {
				free_unit(5);
				return 1;
			});
			use_unit(5);
			expect(M.if_exchange).not.toHaveBeenCalled();
			expect(use_unit(5)).toBe(0);
		});

		it('free: children, sound channel, entities; the AI pivot stays (quirk)', () => {
			const u = unit(5, SAILRAFT);
			u.vh = CreateCube();
			u.ai_ch = CreatePivot();
			u.chan = 31;
			const { h, mh, vh, ai_ch } = u;
			const up = New(Tup);
			up.unit = 5;
			expect(free_unit(5)).toBe(1);
			expect(M.StopChannel).toHaveBeenCalledWith(31);
			expect([freed(h), freed(mh), freed(vh), freed(ai_ch)]).toEqual([true, true, true, false]);
			expect(count(Tunit)).toBe(0);
			expect(count(Tup)).toBe(0);
			expect(free_unit(5)).toBe(0);
			const v = unit(6, RAPTOR);
			const up2 = New(Tup);
			up2.unit = 6;
			free_unit(6, 1, 0);
			expect(isNull(Tunit, v)).toBe(true);
			expect(count(Tup)).toBe(1); // childs=0
			expect(M.StopChannel).toHaveBeenCalledOnce();
		});
	});

	describe('hurt_unit / health_unit / kill_unit', () => {
		it('damage, material effect at eye height, predators hunt, others flee', () => {
			G.g_player = 1;
			const r = unit(5, RAPTOR, 1, 2, 3);
			G.TCunit = r;
			expect(hurt_unit(30)).toBe(1);
			expect(r.health).toBe(70);
			expect(M.material_fx).toHaveBeenCalledWith(1, f32(2 + Dunit_eyes(RAPTOR)), 3, Dunit_mat(RAPTOR));
			expect(M.ai_mode).toHaveBeenCalledWith(ai_hunt, 15000);
			expect(M.p_add).not.toHaveBeenCalled();
			M.ai_mode.mockClear();
			r.ai_mode = ai_attack;
			hurt_unit(1);
			r.ai_mode = ai_hunt;
			hurt_unit(1);
			expect(M.ai_mode).not.toHaveBeenCalled();

			const c = unit(6, CRAB);
			G.TCunit = c;
			expect(hurt_unit(1, 0, 2)).toBe(1);
			expect(M.ai_mode).toHaveBeenCalledWith(ai_flee, 10000);
			expect([c.ai_target_class, c.ai_target_id]).toEqual([Cclass_unit, 1]);
			expect(M.material_fx).toHaveBeenCalledTimes(3); // the three hits above; pickcords 2: none
		});

		it('invulnerable units keep their health; pickcords 1 uses the pick position', () => {
			const r = unit(5, RAPTOR);
			G.TCunit = r;
			M.get_state.mockReturnValue(1);
			G.in_px = 7;
			G.in_py = 8;
			G.in_pz = 9;
			expect(hurt_unit(30, 0, 1)).toBe(1);
			expect(r.health).toBe(100);
			expect(M.get_state).toHaveBeenCalledWith(Cstate_invulnerability, Cclass_unit, 5);
			expect(M.material_fx).toHaveBeenCalledWith(7, 8, 9, Dunit_mat(RAPTOR));
		});

		it('the player: red flash, hit sound 4 times out of 5, no AI reaction', () => {
			G.g_player = 1;
			const p = unit(1, PLAYER);
			G.TCunit = p;
			G.sfx_humanhit = [11, 12, 13, 14, 15];
			const seed = seedWhere(() => Rand(5) !== 2);
			SeedRnd(seed);
			Rand(5);
			const idx = Rand(0, 4);
			SeedRnd(seed);
			expect(hurt_unit(10)).toBe(1);
			expect(M.sfx_emit.mock.calls.map((c) => c[0])).toEqual([11 + idx]);
			expect(M.p_add).toHaveBeenCalledWith(0, 0, 0, Cp_flash, f32(0.06), 0.75);
			expect(M.ai_mode).not.toHaveBeenCalled();
			M.sfx_emit.mockClear();
			SeedRnd(seedWhere(() => Rand(5) === 2));
			hurt_unit(10);
			expect(M.sfx_emit).not.toHaveBeenCalled();
		});

		it('lethal damage or kill=1 kills (2)', () => {
			G.unit_serial = 100;
			set_unit(-1, RAPTOR, 0, 0);
			const r = G.TCunit!;
			expect(hurt_unit(110)).toBe(2);
			expect(r.health_max).toBe(0);
			set_unit(-1, CRAB, 0, 0);
			const c = G.TCunit!;
			expect(hurt_unit(0, 1)).toBe(2);
			expect(c.health).toBe(0);
			expect(M.ai_mode).not.toHaveBeenCalled();
		});

		it('health_unit: clamps to the maximum, kills at 0', () => {
			G.unit_serial = 100;
			set_unit(-1, RAPTOR, 0, 0);
			const r = G.TCunit!;
			r.health = 50;
			health_unit(20.5);
			expect(r.health).toBe(70.5);
			health_unit(500);
			expect(r.health).toBe(110);
			health_unit(-110);
			expect(r.health).toBe(0);
			expect(r.health_max).toBe(0);
			expect(G.tmp_kill).toBe(1);
		});

		it('kill_unit: loot, event, kill pivot, death animation, states and paths freed', () => {
			DeleteEach(Tfind);
			find(Cclass_unit, RAPTOR, 15, 100, 1, 4);
			find(Cclass_unit, CRAB, 16, 100, 1, 1);
			find(Cclass_object, RAPTOR, 17, 100, 1, 1);
			G.g_player = 1;
			G.unit_serial = 100;
			set_unit(-1, RAPTOR, 10, 20);
			const u = G.TCunit!;
			u.freeze = 1;
			RotateEntity(u.h, 0, 70, 0);
			M.set_parsecache.mockClear();
			const st = New(Tstate);
			st.typ = 4;
			st.parent_class = Cclass_unit;
			st.parent_id = u.id;
			const other = New(Tstate);
			other.typ = 5;
			other.parent_class = Cclass_object;
			other.parent_id = u.id;
			kill_unit();
			expect([u.health, u.health_max]).toEqual([0, 0]);
			expect(M.set_item.mock.calls.map((c) => c.slice(0, 6))).toEqual([[-1, 15, 0, 0, 0, 4]]);
			expect(M.store_item).toHaveBeenCalledWith(G.TCitem!.id, Cclass_unit, u.id);
			expect(M.set_parsecache).toHaveBeenCalledWith(Cclass_unit, u.id, 'kill');
			expect([G.tmp_killclass, G.tmp_killid, G.tmp_kill]).toEqual([Cclass_unit, u.id, 1]);
			expect(M.parse_kill_add.mock.calls).toEqual([[Cclass_unit, u.id, G.tmp_killmodel]]);
			expect([EntityX(G.tmp_killmodel), EntityY(G.tmp_killmodel), EntityZ(G.tmp_killmodel)]).toEqual([10, 30, 20]);
			expect(EntityYaw(G.tmp_killmodel)).toBeCloseTo(70, 3);
			expect(u.freeze).toBe(0);
			expect(u.ani).toBe(Dunit_ani_die(RAPTOR, 1));
			expect(u.ani).toBe(3);
			expect(M.play_soundset).toHaveBeenCalledOnce();
			expect(M.play_soundset.mock.calls[0].slice(0, 2)).toEqual(['raptor', snd_die]);
			expect(GetEntityType(u.h)).toBe(0);
			expect(M.free_state.mock.calls).toEqual([[4, Cclass_unit, u.id]]);
			expect(M.up_free).toHaveBeenCalledWith(u.id);
			expect(G.g_player_dead).toBe(0);

			// already dead: only the second half runs
			G.tmp_kill = 0;
			M.set_item.mockClear();
			M.play_soundset.mockClear();
			kill_unit();
			expect(G.tmp_kill).toBe(0);
			expect(M.set_item).not.toHaveBeenCalled();
			expect(M.play_soundset).not.toHaveBeenCalled();
			expect(M.up_free).toHaveBeenCalledTimes(2);
		});

		it('kill_unit: the player sets g_player_dead; no second death animation', () => {
			G.g_player = 1;
			set_unit(1, RAPTOR, 0, 0);
			const u = G.TCunit!;
			u.ani = 3; // already the die sequence
			kill_unit();
			expect(G.g_player_dead).toBe(1);
			expect(M.play_soundset).not.toHaveBeenCalled();
			expect(u.health_max).toBe(0);
		});

		it('spawn_unit_items stores only items that were created (id<>0)', () => {
			DeleteEach(Tfind);
			find(Cclass_unit, RAPTOR, 15, 100, 1, 4);
			find(Cclass_unit, RAPTOR, 16, 100, 1, 2);
			M.set_item.mockImplementationOnce(() => 0);
			spawn_unit_items(5, RAPTOR);
			expect(M.set_item).toHaveBeenCalledTimes(2);
			expect(M.store_item.mock.calls).toEqual([[1, Cclass_unit, 5]]);
		});
	});

	describe('unit_values / ani_unit / pos_unit / freeze_unit / unit_speed', () => {
		it('unit_values clamps health, hunger, thirst, exhaustion', () => {
			const u = unit(5, RAPTOR);
			G.TCunit = u;
			const store = Dunit_store(RAPTOR);
			expect(store).toBe(100);
			Object.assign(u, { health_max: -5, health: 20, hunger: 150, thirst: -3, exhaustion: 100.5 });
			unit_values();
			expect([u.health_max, u.health, u.hunger, u.thirst, u.exhaustion]).toEqual([0, 0, 100, 0, 100]);
			Object.assign(u, { health_max: 50, health: -1, hunger: -1, thirst: 101, exhaustion: -0.5 });
			unit_values();
			expect([u.health_max, u.health, u.hunger, u.thirst, u.exhaustion]).toEqual([50, 0, 0, 100, 0]);
		});

		it('ani_unit animates only on a new sequence or with override', () => {
			set_unit(-1, RAPTOR, 0, 0);
			const u = G.TCunit!;
			ani_unit(1, 0.1, 2);
			expect(u.ani).toBe(2);
			ani_unit(1, 0.1, 2); // same: nothing (would throw for a missing sequence otherwise)
			ani_unit(1, 0.1, 1, 1, 1);
			expect(u.ani).toBe(1);
		});

		it('pos_unit moves the pivot and the vehicle model', () => {
			const u = unit(5, SAILRAFT);
			u.vh = CreateCube();
			pos_unit(u, 4, 5, 6);
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([4, 5, 6]);
			expect([EntityX(u.vh), EntityY(u.vh), EntityZ(u.vh)]).toEqual([4, 5, 6]);
			const v = unit(6, RAPTOR);
			pos_unit(v, 1, 2, 3);
			expect(EntityZ(v.h)).toBe(3);
		});

		it('freeze_unit stops the animation; mode 0 only clears the flag', () => {
			set_unit(-1, RAPTOR, 0, 0);
			const u = G.TCunit!;
			u.ani = 2;
			freeze_unit(u);
			expect([u.freeze, u.ani]).toEqual([1, 0]);
			u.ani = 2;
			freeze_unit(u, 0);
			expect([u.freeze, u.ani]).toEqual([0, 2]);
		});

		it('unit_speed: definition speed, changed by active states of the unit', () => {
			const u = unit(5, RAPTOR);
			G.TCunit = u;
			const st = (typ: number, value_f = 0, cls = Cclass_unit, id = 5) => {
				const s = New(Tstate);
				s.typ = typ;
				s.parent_class = cls;
				s.parent_id = id;
				s.value_f = value_f;
				Dstate_a.set(typ, 1);
				return s;
			};
			const frost = st(Cstate_frostbite);
			expect(Dunit_speed(RAPTOR)).toBe(2.5);
			expect(unit_speed()).toBe(2.5); // Tunit\states is 0
			u.states = 1;
			expect(unit_speed()).toBe(1.25);
			st(Cstate_fracture, 0, Cclass_unit, 6); // another unit
			st(Cstate_fracture, 0, Cclass_object, 5); // an object
			expect(unit_speed()).toBe(1.25);
			st(Cstate_bloodrush, 3);
			expect(unit_speed()).toBe(3.75);
			Dstate_a.set(Cstate_frostbite, 0); // not active
			expect(unit_speed()).toBe(7.5);
			frost.typ = 71; // beyond Cstate_count: ignored
			st(Cstate_speedmod, 0.5);
			expect(unit_speed()).toBe(0.5);
			st(Cstate_fracture);
			expect(unit_speed()).toBe(0.25);
		});
	});

	describe('unit_loadani / unit_scriptani / checkattackline', () => {
		it('unit_loadani extracts once per typ and frame range', () => {
			expect(unit_loadani(RAPTOR, 2, 3)).toBe(1);
			expect(count(Tsani)).toBe(1);
			const sani = First(Tsani)!;
			expect([sani.typ, sani.f1, sani.f2]).toEqual([RAPTOR, 2, 3]);
			expect(sani.h as unknown as number).toBeGreaterThan(0);
			expect(unit_loadani(RAPTOR, 2, 3)).toBe(1);
			expect(count(Tsani)).toBe(1);
			expect(unit_loadani(RAPTOR, 2, 4)).toBe(1);
			expect(count(Tsani)).toBe(2);
			expect(M.parse_error).not.toHaveBeenCalled();
		});

		it('unit_loadani: unit type without model', () => {
			expect(Dunit_modelh(77)).toBeNull();
			expect(unit_loadani(77, 1, 2)).toBe(0);
			expect(M.parse_error).toHaveBeenCalledWith("Unit type '77' does not exist - unable to load animation");
			expect(count(Tsani)).toBe(0);
		});

		it('unit_scriptani plays a script animation and puts the AI into ai_sani for 10 s', () => {
			set_unit(-1, RAPTOR, 0, 0);
			const u = G.TCunit!;
			G.gt = 5000;
			expect(unit_scriptani(u.id, 2, 3, 0.5)).toBe(1);
			expect(M.con_add.mock.calls.map((c) => c[0])).toEqual(['animate unit ' + u.id + ' 2 - 3 speed 0.5 mode 3', 'new sani']);
			const seq = First(Tsani)!.h as unknown as number;
			expect(seq).toBeGreaterThan(0);
			expect([u.ani, u.ai_mode, u.ai_timer]).toEqual([seq, ai_sani, 15000]);
			M.con_add.mockClear();
			u.ai_mode = 0;
			G.gt = 6000;
			expect(unit_scriptani(u.id, 2, 3, 1, 1)).toBe(1);
			expect(M.con_add.mock.calls.map((c) => c[0])).toEqual(['animate unit ' + u.id + ' 2 - 3 speed 1.0 mode 1', 'existing sani']);
			expect(count(Tsani)).toBe(1);
			expect([u.ai_mode, u.ai_timer]).toEqual([ai_sani, 16000]);
			expect(unit_scriptani(9999, 2, 3, 1)).toBe(0);
		});

		it('checkattackline: units without eyes always see; no player: 0; otherwise the line of sight', () => {
			G.TCunit = unit(6, CRAB);
			expect(checkattackline()).toBe(1);
			const r = unit(5, RAPTOR, 0, 20, 0);
			EntityPickMode(r.mh, 2, 1);
			G.TCunit = r;
			G.g_cplayer = null;
			expect(checkattackline()).toBe(0);
			const p = unit(1, PLAYER, 0, 10, 200);
			HideEntity(p.mh);
			G.g_cplayer = p;
			expect(checkattackline()).toBe(1);
			const wall = CreateCube();
			ScaleEntity(wall, 50, 50, 1);
			PositionEntity(wall, 0, 10, 100);
			EntityPickMode(wall, 2, 1);
			expect(checkattackline()).toBe(0);
		});
	});

	describe('draw_unit / draw_units_debug / frap_unit', () => {
		beforeEach(() => {
			PositionEntity(G.cam, 0, 0, -100);
			RotateEntity(G.cam, 0, 0, 0);
			G.gfx_ex = CreateImage(8, 8);
			G.gfx_ey = CreateImage(8, 8);
			G.gfx_ez = CreateImage(8, 8);
			G.gfx_esel = CreateImage(8, 8);
			G.in_editor_sidebar = 1;
		});

		it('draw_unit: two labels, FRAP on Space, free on Del', () => {
			const u = unit(5, RAPTOR);
			u.health = 70.5;
			G.TCunit = u;
			draw_unit();
			expect(M.bmpf_txt_c.mock.calls).toEqual([
				[400, 240, '#5 ' + Dunit_name(RAPTOR), Cbmpf_tiny],
				[400, 270, '70.5|100.0', Cbmpf_tiny]
			]);
			expect(G.in_edoverinfo).toBe(ss(se(197), Dunit_name(RAPTOR)));
			injectKeyDown(57);
			draw_unit();
			injectKeyUp(57);
			const fr = First(Tfrap)!;
			expect([fr.parent_class, fr.parent_id]).toEqual([Cclass_unit, 5]);
			expect(G.in_fraph).toBe(u.h);
			injectKeyDown(211);
			draw_unit();
			injectKeyUp(211);
			expect(count(Tunit)).toBe(0);
		});

		it('draw_units_debug: id, name and AI mode of the units in view within 500', () => {
			const u = unit(5, RAPTOR);
			u.ai_mode = ai_hunt;
			unit(6, CRAB, 0, 0, 900); // too far
			unit(7, CRAB, 0, 0, -400); // behind the camera
			draw_units_debug();
			expect(M.bmpf_txt_c.mock.calls).toEqual([
				[400, 255, '#5 ' + Dunit_name(RAPTOR), Cbmpf_tiny],
				[400, 265, 'mode' + ai_hunt, Cbmpf_tiny]
			]);
		});

		it('frap_unit: handles only move; the FRAP entry keeps the height only', () => {
			const u = unit(5, RAPTOR, 10, 5, 0);
			G.TCunit = u;
			const fr = New(Tfrap);
			fr.parent_class = Cclass_unit;
			fr.parent_id = 5;
			fr.pitch = 1;
			G.in_frapdown = 2;
			G.in_mdown[1] = 1;
			G.in_mxs = 4;
			G.in_mys = 8;
			frap_unit();
			expect(EntityY(u.h)).toBeCloseTo(8, 4);
			expect(EntityYaw(u.h)).toBeCloseTo(0, 4);
			expect(G.in_cursorf).toBe(2);
			expect(fr.y).toBe(f32(EntityY(u.h)));
			expect(fr.pitch).toBe(1);
			G.in_frapdown = 4;
			G.in_mzs = 0;
			frap_unit();
			expect(EntityX(u.h)).toBeCloseTo(9, 4);
			expect(EntityY(u.h)).toBeCloseTo(6, 4);
			G.in_mdown[1] = 0;
			G.in_fraph = u.h;
			injectKeyDown(211);
			frap_unit();
			injectKeyUp(211);
			expect(count(Tunit)).toBe(0);
			expect(G.in_fraph).toBeNull();
		});
	});

	// ============================================================ handle_all.bb

	describe('ha_inrange / ha_idinrange / ha_distance / ha_freespace', () => {
		it('ha_inrange counts per class', () => {
			const c = CreatePivot();
			obj(1, PALM, 10, 0, 0);
			obj(2, PALM, 0, 0, 30);
			obj(3, BUSH, 5, 0, 0);
			obj(4, PALM, 0, 0, 31);
			expect(ha_inrange(c, 30, Cclass_object, PALM)).toBe(2);
			expect(ha_inrange(c, 30, Cclass_object, BUSH)).toBe(1);
			unit(100, RAPTOR, 3, 0, 0);
			const dead = unit(101, RAPTOR, 4, 0, 0);
			dead.health = 0;
			unit(102, CRAB, 4, 0, 0);
			expect(ha_inrange(c, 30, Cclass_unit, RAPTOR)).toBe(1);
			const i1 = item(1, 15, 1, 0, 0);
			i1.count = 5;
			const i2 = item(2, 15, 1, 0, 0);
			i2.count = 3;
			i2.parent_class = Cclass_unit; // stored: not counted
			item(3, 15, 100, 0, 0);
			expect(ha_inrange(c, 30, Cclass_item, 15)).toBe(5);
			info(1, 5, 0, 20, 0);
			info(2, 5, 0, 40, 0);
			expect(ha_inrange(c, 30, Cclass_info, 5)).toBe(1);
			const s1 = New(Tstate);
			s1.typ = 4;
			s1.parent_class = Cclass_object;
			s1.parent_id = 1;
			const s2 = New(Tstate);
			s2.typ = 4;
			s2.parent_class = Cclass_object;
			s2.parent_id = 999; // no parent
			const s3 = New(Tstate);
			s3.typ = 4;
			s3.parent_class = Cclass_object;
			s3.parent_id = 4; // too far
			expect(ha_inrange(c, 30, Cclass_state, 4)).toBe(1);
			expect(ha_inrange(c, 30, 77, 4)).toBe(0);
		});

		it('ha_inrange class 0: the player in single player, units below id 100 otherwise', () => {
			const c = CreatePivot();
			unit(1, PLAYER, 5, 0, 0);
			unit(2, PLAYER, 6, 0, 0);
			unit(3, PLAYER, 600, 0, 0);
			unit(100, RAPTOR, 1, 0, 0);
			G.g_cplayer = First(Tunit);
			G.m_section = Csection_game_sp;
			expect(ha_inrange(c, 30, 0)).toBe(1);
			expect(ha_inrange(c, 4, 0)).toBe(0);
			G.m_section = Csection_game_mp;
			expect(ha_inrange(c, 30, 0)).toBe(2);
		});

		it('ha_idinrange', () => {
			const c = CreatePivot();
			obj(1, PALM, 10, 0, 0);
			unit(100, RAPTOR, 40, 0, 0);
			const it1 = item(7, 15, 2, 0, 0);
			info(3, 5, 0, 30, 0);
			expect(ha_idinrange(c, 30, Cclass_object, 1)).toBe(1);
			expect(ha_idinrange(c, 9, Cclass_object, 1)).toBe(0);
			expect(ha_idinrange(c, 30, Cclass_object, 2)).toBe(0);
			expect(ha_idinrange(c, 30, Cclass_unit, 100)).toBe(0);
			expect(ha_idinrange(c, 40, Cclass_unit, 100)).toBe(1);
			expect(ha_idinrange(c, 30, Cclass_item, 7)).toBe(1);
			it1.parent_class = Cclass_unit;
			expect(ha_idinrange(c, 30, Cclass_item, 7)).toBe(0);
			expect(ha_idinrange(c, 30, Cclass_info, 3)).toBe(1);
			expect(ha_idinrange(c, 30, 0, 1)).toBe(0);
			expect(ha_idinrange(c, 30, Cclass_state, 1)).toBe(0);
		});

		it('ha_distance is an Int: the distance rounds', () => {
			obj(1, PALM, 0, 0, 0);
			unit(100, RAPTOR, 10.6, 0, 0);
			item(7, 15, 2.5, 0, 0);
			expect(ha_distance(Cclass_object, 1, Cclass_unit, 100)).toBe(11);
			expect(ha_distance(Cclass_object, 1, Cclass_item, 7)).toBe(2); // 2.5 rounds to even
			expect(ha_distance(Cclass_object, 2, Cclass_unit, 100)).toBe(0);
			expect(ha_distance(Cclass_object, 1, Cclass_unit, 101)).toBe(0);
		});

		it('ha_freespace', () => {
			expect(ha_freespace(0, 0, 0)).toBe(1);
			const o = obj(1, PALM, 100, 0, 0);
			expect(ha_freespace(0, 0, 0)).toBe(0);
			expect(ha_freespace(0, 0, 0, 100)).toBe(1); // < range
			expect(ha_freespace(0, 0, 0, 300, 0)).toBe(1);
			PositionEntity(o.h, 5000, 0, 0);
			unit(100, RAPTOR, 0, 200, 0);
			expect(ha_freespace(0, 0, 0)).toBe(0);
			expect(ha_freespace(0, 0, 0, 300, 1, 0)).toBe(1);
			const it1 = item(7, 15, 0, 0, 50);
			expect(ha_freespace(0, 0, 0, 300, 1, 0)).toBe(0);
			it1.parent_mode = Cpm_in; // stored items do not block
			expect(ha_freespace(0, 0, 0, 300, 1, 0)).toBe(1);
			info(3, 5, 0, 30, 0);
			expect(ha_freespace(0, 0, 0, 300, 1, 0)).toBe(1); // infos off by default
			expect(ha_freespace(0, 0, 0, 300, 1, 0, 1, 1)).toBe(0);
		});
	});

	describe('ha_getclass / ha_free / ha_damage / ha_heal / ha_killed / ha_health / ha_type / ha_typeexists', () => {
		it('ha_getclass: object, then unit (by collision pivot by default), then item', () => {
			const o = obj(1, PALM);
			const u = unit(100, RAPTOR);
			u.vh = CreateCube();
			const it1 = item(7, 15);
			expect(ha_getclass(o.h)).toBe(1);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_object, 1]);
			expect(ha_getclass(u.h)).toBe(1);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_unit, 100]);
			expect(ha_getclass(u.mh)).toBe(0);
			expect([G.tmp_class, G.tmp_id]).toEqual([0, 0]);
			expect(ha_getclass(u.mh, 0)).toBe(1);
			expect(ha_getclass(it1.h)).toBe(1);
			expect([G.tmp_class, G.tmp_id]).toEqual([Cclass_item, 7]);
		});

		it('ha_free dispatches by class; -1 is the script environment', () => {
			obj(1, PALM);
			unit(100, RAPTOR);
			ha_free(Cclass_object, 1);
			expect(count(Tobject)).toBe(0);
			G.p_env_class = Cclass_unit;
			G.p_env_id = 100;
			ha_free(-1, 0);
			expect(count(Tunit)).toBe(0);
			ha_free(Cclass_item, 7);
			expect(M.free_item).toHaveBeenCalledWith(7);
			ha_free(Cclass_info, 8);
			expect(M.free_info).toHaveBeenCalledWith(8);
			ha_free(Cclass_state, 9);
			expect(M.con_add).toHaveBeenCalledWith("ERROR: Unable to remove a state by 'free' scriptcommand!", Cbmpf_red);
		});

		it('ha_damage', () => {
			const o = obj(1, PALM);
			const u = unit(100, RAPTOR);
			item(7, 15);
			expect(ha_damage(Cclass_object, 1, 10)).toBe(1);
			expect(o.health).toBe(290);
			expect(ha_damage(Cclass_object, 1, 1000)).toBe(2);
			expect(ha_damage(Cclass_object, 1, 10)).toBe(0); // gone
			expect(ha_damage(Cclass_unit, 100, 10, 0, 2)).toBe(1);
			expect(u.health).toBe(90);
			expect(M.material_fx).toHaveBeenCalledTimes(2); // not for pickcords 2
			expect(ha_damage(Cclass_item, 7, 4, 0, 1)).toBe(7);
			expect(M.damage_item).toHaveBeenCalledWith(4, 0, 1);
			expect(ha_damage(Cclass_item, 8, 4)).toBe(0);
			expect(ha_damage(Cclass_info, 1, 4)).toBe(0);
		});

		it('ha_heal adds the absolute value up to the maximum', () => {
			const o = obj(1, PALM);
			o.health = 100;
			const u = unit(100, RAPTOR);
			u.health = 10;
			u.health_max = 50;
			const it1 = item(7, 15);
			it1.health = 0;
			expect(ha_heal(Cclass_object, 1, -50)).toBe(0);
			expect(o.health).toBe(150);
			ha_heal(Cclass_object, 1, 500);
			expect(o.health).toBe(300);
			ha_heal(Cclass_unit, 100, 20.5);
			expect(u.health).toBe(30.5);
			ha_heal(Cclass_unit, 100, 100);
			expect(u.health).toBe(50);
			ha_heal(Cclass_item, 7, 1e9);
			expect(it1.health).toBe(f32(DEFS_item_health(15)));
		});

		it('ha_killed: missing things are killed; units with health_max 0', () => {
			obj(1, PALM);
			const u = unit(100, RAPTOR);
			item(7, 15);
			info(3, 5);
			expect(ha_killed(Cclass_object, 1)).toBe(0);
			expect(ha_killed(Cclass_object, 2)).toBe(1);
			expect(ha_killed(Cclass_unit, 100)).toBe(0);
			u.health_max = 0;
			expect(ha_killed(Cclass_unit, 100)).toBe(1);
			expect(ha_killed(Cclass_unit, 101)).toBe(1);
			expect(ha_killed(Cclass_item, 7)).toBe(0);
			expect(ha_killed(Cclass_item, 8)).toBe(1);
			expect(ha_killed(Cclass_info, 3)).toBe(0);
			expect(ha_killed(Cclass_info, 4)).toBe(1);
			expect(ha_killed(Cclass_state, 4)).toBe(0);
		});

		it('ha_health, ha_type, ha_typeexists', () => {
			const o = obj(1, PALM);
			o.health = 12.5;
			const u = unit(100, RAPTOR);
			u.health = 33.25;
			const it1 = item(7, 15);
			it1.health = 4;
			info(3, 5);
			expect(ha_health(Cclass_object, 1)).toBe(12.5);
			expect(ha_health(Cclass_unit, 100)).toBe(33.25);
			expect(ha_health(Cclass_item, 7)).toBe(4);
			expect(ha_health(Cclass_info, 3)).toBe(0);
			expect(ha_health(Cclass_object, 2)).toBe(0);
			expect(ha_type(Cclass_object, 1)).toBe(PALM);
			expect(ha_type(Cclass_unit, 100)).toBe(RAPTOR);
			expect(ha_type(Cclass_item, 7)).toBe(15);
			expect(ha_type(Cclass_info, 3)).toBe(5);
			expect(ha_type(Cclass_info, 4)).toBe(0);
			expect(ha_type(Cclass_state, 1)).toBe(0);
			expect(ha_typeexists(Cclass_object, PALM)).toBe(1);
			expect(ha_typeexists(Cclass_object, 0)).toBe(0);
			expect(ha_typeexists(Cclass_object, 254)).toBe(0);
			expect(ha_typeexists(Cclass_object, G.Cobject_count + 1)).toBe(0);
			expect(ha_typeexists(Cclass_unit, RAPTOR)).toBe(1);
			expect(ha_typeexists(Cclass_unit, 99)).toBe(0);
			expect(ha_typeexists(Cclass_unit, G.Cunit_count + 1)).toBe(0);
			expect(ha_typeexists(Cclass_item, 15)).toBe(1);
			expect(ha_typeexists(Cclass_item, G.Citem_count + 1)).toBe(0);
			expect(ha_typeexists(Cclass_info, 5)).toBe(0);
		});
	});

	describe('ha_intersect / ha_setpos', () => {
		it('ha_intersect: against objects, unit models and items, not against itself', () => {
			const a = obj(1, PALM, 0, 0, 0);
			expect(ha_intersect(Cclass_object, 1)).toBe(0);
			const b = obj(2, PALM, 1, 0, 0);
			expect(ha_intersect(Cclass_object, 1)).toBe(1);
			PositionEntity(b.h, 50, 0, 0);
			expect(ha_intersect(Cclass_object, 1)).toBe(0);
			const u = unit(100, RAPTOR, 1, 0, 0);
			expect(ha_intersect(Cclass_object, 1)).toBe(1);
			// (ha_intersect of a unit itself passes its collision pivot to MeshesIntersect: not a mesh)
			PositionEntity(u.h, 90, 0, 0);
			const it1 = item(7, 15, 0, 1, 0);
			expect(ha_intersect(Cclass_object, 1)).toBe(1);
			PositionEntity(a.h, 0, 0, 80);
			expect(ha_intersect(Cclass_item, 7)).toBe(0);
			void it1;
		});

		it('ha_setpos: unit with vehicle model; the player gets the teleport fix', () => {
			const u = unit(1, SAILRAFT);
			u.vh = CreateCube();
			G.g_player = 1;
			ha_setpos(u.h, Cclass_unit, 1, '10.5', '20', '-3');
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([10.5, 20, -3]);
			expect([EntityX(u.vh), EntityY(u.vh), EntityZ(u.vh)]).toEqual([10.5, 20, -3]);
			expect(G.in_tpforce).toBe(3);
			expect(G.in_tp.slice(0, 3)).toEqual([10.5, 20, -3]);
			G.in_tpforce = 0;
			const v = unit(2, RAPTOR);
			ha_setpos(v.h, Cclass_unit, 2, '1', '2', '3');
			expect(EntityZ(v.h)).toBe(3);
			expect(G.in_tpforce).toBe(0);
		});

		it('ha_setpos: object with collision copy; creates or updates the FRAP entry', () => {
			const o = obj(1, PALM);
			o.ch = CreateCube();
			RotateEntity(o.h, 10, 0, 20);
			ha_setpos(o.h, Cclass_object, 1, '1', '2.5', '3');
			expect([EntityX(o.ch), EntityY(o.ch), EntityZ(o.ch)]).toEqual([1, 2.5, 3]);
			expect(count(Tfrap)).toBe(1);
			const fr = First(Tfrap)!;
			expect([fr.parent_class, fr.parent_id, fr.y]).toEqual([Cclass_object, 1, 2.5]);
			expect(fr.pitch).toBeCloseTo(10, 3);
			expect(fr.roll).toBeCloseTo(20, 3);
			expect(M.item_phyreset).toHaveBeenCalledOnce();
			ha_setpos(o.h, Cclass_object, 1, '1', '7', '3');
			expect(count(Tfrap)).toBe(1);
			expect(fr.y).toBe(7);
		});

		it('ha_setpos: items wake up; other classes are just moved', () => {
			const it1 = item(7, 15);
			it1.phy_pause = 1;
			ha_setpos(it1.h, Cclass_item, 7, '1', '2', '3');
			expect(it1.phy_pause).toBe(0);
			expect(EntityY(it1.h)).toBe(2);
			const i = info(3, 5);
			ha_setpos(i.h, Cclass_info, 3, 'x', '2abc', '');
			expect([EntityX(i.h), EntityY(i.h), EntityZ(i.h)]).toEqual([0, 2, 0]);
		});
	});

	describe('ha_copychilds / ha_pastechilds', () => {
		function children() {
			const script = New(Tx);
			Object.assign(script, { parent_class: Cclass_object, parent_id: 1, mode: 0, value: 'on:use {' + SEP_LINE + '}', key: '' });
			const v = New(Tx);
			Object.assign(v, { parent_class: Cclass_object, parent_id: 1, mode: 4, key: 'a', value: '5' });
			const foreign = New(Tx);
			Object.assign(foreign, { parent_class: Cclass_object, parent_id: 2, mode: 4, key: 'b', value: '6' });
			const i1 = item(7, 15);
			Object.assign(i1, { parent_class: Cclass_object, parent_id: 1, parent_mode: Cpm_in, count: 4 });
			const i2 = item(8, 16);
			Object.assign(i2, { parent_class: Cclass_object, parent_id: 1, parent_mode: Cpm_out, count: 2 });
			const st = New(Tstate);
			Object.assign(st, { typ: 4, parent_class: Cclass_object, parent_id: 1, x: 1, y: 2, z: 3, fx: 4, fy: 5, fz: 6, value: 7, value_f: 8.5, value_s: 'nine', r: 10, g: 11, b: 12 });
		}

		it('copy: local variables, stored items and states; the script only on request', () => {
			children();
			New(Tcopy).typ = 9;
			ha_copychilds(Cclass_object, 1);
			const c = Tcopy.list.toArray();
			expect(c.map((x) => x.typ)).toEqual([1, 2, 3]);
			expect([c[0].key, c[0].value_s]).toEqual(['a', '5']);
			expect([c[1].id, c[1].value]).toEqual([15, 4]);
			expect({ ...c[2] }).toMatchObject({ id: 4, x: 1, y: 2, z: 3, fx: 4, fy: 5, fz: 6, value: 7, value_f: 8.5, value_s: 'nine', r: 10, g: 11, b: 12 });
			// quirk: items=0 and states=0 are ignored when copying; vars=0 is not
			ha_copychilds(Cclass_object, 1, 0, 0, 0, 1);
			expect(Tcopy.list.toArray().map((x) => x.typ)).toEqual([0, 2, 3]);
			expect(First(Tcopy)!.value_s).toBe('on:use {' + SEP_LINE + '}');
			// addtocache=1 keeps the old entries
			ha_copychilds(Cclass_object, 2, 1, 1, 1, 0, 1);
			expect(Tcopy.list.toArray().map((x) => x.typ)).toEqual([0, 2, 3, 1]);
		});

		it('paste: 0 for a missing target; variables, items, states onto the target', () => {
			children();
			ha_copychilds(Cclass_object, 1, 1, 1, 1, 1);
			expect(ha_pastechilds(Cclass_unit, 100)).toBe(0);
			unit(100, RAPTOR);
			const before = count(Tx);
			expect(ha_pastechilds(Cclass_unit, 100)).toBe(1);
			const mine = LIST(Tx).filter((x) => x.parent_class === Cclass_unit && x.parent_id === 100);
			expect(count(Tx)).toBe(before + 1); // script=0: only the variable
			expect(mine.map((x) => [x.mode, x.key, x.value])).toEqual([[4, 'a', '5']]);
			expect(M.set_item).toHaveBeenCalledWith(-1, 15, 0, 0, 0, 4);
			expect(M.store_item).toHaveBeenCalledWith(G.TCitem!.id, Cclass_unit, 100);
			expect(M.set_state).toHaveBeenCalledWith(4, Cclass_unit, 100);
			expect(M.look_state).toHaveBeenCalledOnce();
			const st = G.TCstate!;
			expect({ ...st }).toMatchObject({ typ: 4, parent_class: Cclass_unit, parent_id: 100, value: 7, value_f: 8.5, value_s: 'nine', r: 10, g: 11, b: 12 });
			expect([st.x, st.fx]).toEqual([0, 0]); // positions are not pasted

			// again: the variable is overwritten, not duplicated
			LIST(Tcopy).find((c) => c.typ === 1)!.value_s = '9';
			ha_pastechilds(Cclass_unit, 100, 1, 0, 0);
			expect(LIST(Tx).filter((x) => x.parent_id === 100).map((x) => x.value)).toEqual(['9']);
			expect(M.set_item).toHaveBeenCalledOnce();
			expect(M.set_state).toHaveBeenCalledOnce();
		});

		it('paste script: new script entry, or appended to the first Tx of the target (quirk: whatever its mode)', () => {
			children();
			ha_copychilds(Cclass_object, 1, 0, 0, 0, 1);
			unit(100, RAPTOR);
			ha_pastechilds(Cclass_unit, 100, 0, 0, 0, 1);
			let mine = LIST(Tx).filter((x) => x.parent_class === Cclass_unit && x.parent_id === 100);
			expect(mine.length).toBe(1);
			expect([mine[0].mode, mine[0].value]).toEqual([0, 'on:use {' + SEP_LINE + '}']);
			expect(mine[0].key).toContain('use');
			ha_pastechilds(Cclass_unit, 100, 0, 0, 0, 1);
			mine = LIST(Tx).filter((x) => x.parent_class === Cclass_unit && x.parent_id === 100);
			expect(mine.length).toBe(1);
			expect(mine[0].value).toBe('on:use {' + SEP_LINE + '}' + SEP_LINE + 'on:use {' + SEP_LINE + '}');
			// items are never pasted into items
			item(7, 15);
			M.set_item.mockClear();
			ha_copychilds(Cclass_object, 1);
			expect(ha_pastechilds(Cclass_item, 7)).toBe(1);
			expect(M.set_item).not.toHaveBeenCalled();
		});
	});

	// ============================================================ parentchild.bb

	describe('parent_h / parent_pos / parent_con / parent_material', () => {
		it('parent_h', () => {
			const o = obj(1, PALM);
			const u = unit(100, RAPTOR);
			const it1 = item(7, 15);
			const i = info(3, 5);
			expect(parent_h(Cclass_object, 1)).toBe(o.h);
			expect(parent_h(Cclass_object, 2)).toBeNull();
			expect(parent_h(Cclass_unit, 100)).toBe(u.h);
			expect(parent_h(Cclass_unit, 100, 1)).toBe(u.mh);
			expect(parent_h(Cclass_item, 7)).toBe(it1.h);
			expect(parent_h(Cclass_info, 3)).toBe(i.h);
			expect(parent_h(Cclass_info, 3, 1)).toBe(i.h); // no child "model"
			const m = CreatePivot(i.h);
			NameEntity(m, 'model');
			expect(parent_h(Cclass_info, 3, 1)).toBe(m);
			expect(parent_h(Cclass_info, 3, 0)).toBe(i.h);
			expect(parent_h(Cclass_state, 3)).toBeNull();
		});

		it('parent_pos; quirk: infos are never found (handle compared with the id)', () => {
			obj(1, PALM, 1, 2, 3);
			unit(100, RAPTOR, 4, 5, 6);
			item(7, 15, 7, 8, 9);
			info(3, 5, 10, 11, 12);
			expect(parent_pos(Cclass_object, 1)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([1, 2, 3]);
			expect(parent_pos(Cclass_unit, 100)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([4, 5, 6]);
			expect(parent_pos(Cclass_item, 7)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([7, 8, 9]);
			expect(parent_pos(Cclass_info, 3)).toBe(0);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([7, 8, 9]);
			expect(parent_pos(Cclass_object, 2)).toBe(0);
		});

		it('parent_con sets the container; quirk: Null when the id does not exist', () => {
			const o = obj(1, PALM);
			const o2 = obj(2, PALM);
			const u = unit(100, RAPTOR);
			const it1 = item(7, 15);
			const i = info(3, 5);
			expect(parent_con(Cclass_object, 2)).toBe(1);
			expect(G.TCobject).toBe(o2);
			expect(parent_con(Cclass_unit, 100)).toBe(1);
			expect(G.TCunit).toBe(u);
			expect(parent_con(Cclass_item, 7)).toBe(1);
			expect(G.TCitem).toBe(it1);
			expect(parent_con(Cclass_info, 3)).toBe(1);
			expect(G.TCinfo).toBe(i);
			expect(G.TCobject).toBe(o2); // other classes untouched
			expect(parent_con(Cclass_object, 9)).toBe(0);
			expect(G.TCobject).toBeNull();
			expect(parent_con(Cclass_unit, 9)).toBe(0);
			expect(G.TCunit).toBeNull();
			expect(parent_con(Cclass_item, 9)).toBe(0);
			expect(G.TCitem).toBeNull();
			expect(parent_con(Cclass_info, 9)).toBe(0);
			expect(G.TCinfo).toBeNull();
			expect(parent_con(Cclass_state, 1)).toBe(0);
			void o;
		});

		it('parent_material', () => {
			obj(1, PALM);
			unit(100, RAPTOR);
			item(7, 15);
			expect(parent_material(Cclass_object, 1)).toBe(Dobject_mat(PALM));
			expect(parent_material(Cclass_unit, 100)).toBe(Dunit_mat(RAPTOR));
			expect(parent_material(Cclass_item, 7)).toBe(DEFS_item_mat(15));
			expect(parent_material(Cclass_object, 2)).toBe(0);
			expect(parent_material(Cclass_info, 1)).toBe(0);
		});
	});

	describe('parent_statepos / parent_stateposstatic / parent_stateposvertex', () => {
		const corner = (c: number[]) => {
			expect([9, 11]).toContain(G.tmp_x);
			expect([4, 6]).toContain(G.tmp_y);
			expect([-4, -2]).toContain(G.tmp_z);
			void c;
		};

		it('static state position: entity position plus the offset of the definition', () => {
			obj(1, TORCH, 10, 5, -3); // state 1,0,39,0
			expect(parent_stateposstatic(Cclass_object, 1)).toBe(1);
			expect(parent_statepos(Cclass_object, 1)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z, G.tmp_ry]).toEqual([10, 44, -3, 44]);
			unit(100, RAPTOR, 1, 2, 3); // state 1,0,0,0
			expect(parent_stateposstatic(Cclass_unit, 100)).toBe(1);
			expect(parent_statepos(Cclass_unit, 100)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z, G.tmp_ry]).toEqual([1, 2, 3, 2]);
			info(3, 5, 7, 8, 9);
			expect(parent_stateposstatic(Cclass_info, 12345)).toBe(1); // infos: always
			expect(parent_statepos(Cclass_info, 3)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z, G.tmp_ry]).toEqual([7, 8, 9, 8]);
			expect(parent_statepos(Cclass_info, 4)).toBe(0);
			expect(parent_statepos(Cclass_object, 2)).toBe(0);
			expect(parent_stateposstatic(Cclass_object, 2)).toBe(0);
			expect(parent_stateposstatic(Cclass_state, 2)).toBe(0);
		});

		it('otherwise a random vertex of the model, in world coordinates', () => {
			obj(1, PALM, 10, 5, -3); // state 0,...: a cube of +-1
			expect(parent_stateposstatic(Cclass_object, 1)).toBe(0);
			expect(parent_statepos(Cclass_object, 1)).toBe(1);
			corner([]);
			expect(G.tmp_ry).toBe(5);
			Dunit_state.set(RAPTOR, 0, 0);
			Dunit_state.set(RAPTOR, 2, 7);
			unit(100, RAPTOR, 10, 5, -3);
			expect(parent_stateposstatic(Cclass_unit, 100)).toBe(0);
			G.tmp_x = 0;
			expect(parent_statepos(Cclass_unit, 100)).toBe(1);
			corner([]);
			expect(G.tmp_ry).toBe(12);
			G.tmp_x = 0;
			expect(parent_stateposvertex(Cclass_unit, 100)).toBe(1);
			corner([]);
			expect(G.tmp_ry).toBe(12);
		});

		it('parent_stateposvertex ignores the static flag; infos get a random offset', () => {
			obj(1, TORCH, 10, 5, -3);
			expect(parent_stateposvertex(Cclass_object, 1)).toBe(1);
			corner([]);
			expect(G.tmp_ry).toBe(44);
			item(7, 15, 10, 5, -3);
			expect(parent_stateposvertex(Cclass_item, 7)).toBe(1);
			corner([]);
			info(3, 5, 7, 8, 9);
			SeedRnd(5);
			const r = [Rnd(-5, 5), Rnd(-5, 5), Rnd(-5, 5)];
			SeedRnd(5);
			expect(parent_stateposvertex(Cclass_info, 3)).toBe(1);
			expect([G.tmp_x, G.tmp_y, G.tmp_z]).toEqual([f32(7 + r[0]), f32(8 + r[1]), f32(9 + r[2])]);
			expect(G.tmp_ry).toBe(G.tmp_y);
			SeedRnd(5);
			const r2 = Rnd(-0.5, 0.5);
			SeedRnd(5);
			parent_stateposvertex(Cclass_info, 3, 0.5);
			expect(G.tmp_x).toBe(f32(7 + r2));
			expect(parent_stateposvertex(Cclass_info, 4)).toBe(0);
			expect(parent_stateposvertex(Cclass_state, 4)).toBe(0);
		});
	});

	describe('drop_childs / free_childs', () => {
		it('drop_childs: outside items are released; inside items only with in=1, around the model', () => {
			const h = CreateCube();
			ScaleEntity(h, 3, 1, 5); // MeshWidth etc. are those of the mesh: 2
			PositionEntity(h, 100, 50, 200);
			const out = item(1, 15);
			Object.assign(out, { parent_class: Cclass_object, parent_id: 4, parent_mode: Cpm_out, phy_pause: 1 });
			const inside = item(2, 15, 1, 1, 1);
			Object.assign(inside, { parent_class: Cclass_object, parent_id: 4, parent_mode: Cpm_in, phy_pause: 1 });
			HideEntity(inside.h);
			const foreign = item(3, 15);
			Object.assign(foreign, { parent_class: Cclass_unit, parent_id: 4, parent_mode: Cpm_out, phy_pause: 1 });
			drop_childs(Cclass_object, 4);
			expect([out.parent_class, out.parent_id, out.phy_pause]).toEqual([0, 0, 0]);
			expect([inside.parent_class, inside.parent_id, inside.phy_pause]).toEqual([Cclass_object, 4, 1]);
			expect([foreign.parent_class, foreign.phy_pause]).toEqual([Cclass_unit, 1]);

			// exe: the random numbers are drawn for y, z, x in this order; y uses the width, z only goes negative (sz# is 0)
			SeedRnd(33);
			const ry = Rnd(1);
			const rz = Rnd(-1, 0);
			const rx = Rnd(-1, 1);
			SeedRnd(33);
			drop_childs(Cclass_object, 4, 1, h);
			expect([EntityX(inside.h), EntityY(inside.h), EntityZ(inside.h)]).toEqual([f32(100 + rx), f32(50 + ry), f32(200 + rz)]);
			expect(EntityZ(inside.h)).toBeLessThanOrEqual(200);
			expect(EntityY(inside.h)).toBeGreaterThanOrEqual(50);
			expect([inside.parent_class, inside.parent_id, inside.phy_pause]).toEqual([0, 0, 0]);
			// parent_mode stays
			expect(inside.parent_mode).toBe(Cpm_in);
		});

		function kids(cls: number, id: number) {
			const it1 = item(50, 15);
			Object.assign(it1, { parent_class: cls, parent_id: id });
			const st = New(Tstate);
			Object.assign(st, { typ: 4, parent_class: cls, parent_id: id });
			for (const mode of [0, 1, 2, 3, 4, 5, 6]) Object.assign(New(Tx), { parent_class: cls, parent_id: id, mode, key: 'k' + mode });
			Object.assign(New(Tx), { parent_class: cls, parent_id: id + 1, mode: 0, key: 'other' });
			Object.assign(New(Ttimer), { parent_class: cls, parent_id: id });
			Object.assign(New(Ttimer), { parent_class: cls, parent_id: id });
			Object.assign(New(Ttimer), { parent_class: cls + 1, parent_id: id });
			Object.assign(New(Tfrap), { parent_class: cls, parent_id: id });
			Object.assign(New(Tfrap), { parent_class: cls, parent_id: id });
			Object.assign(New(Tup), { unit: id });
			Object.assign(New(Tup), { unit: id });
			Object.assign(New(Tup), { unit: id + 1 });
		}

		it('free_childs of an object: items, states, scripts (locals only marked), timers, one FRAP', () => {
			kids(Cclass_object, 4);
			free_childs(Cclass_object, 4);
			expect(M.free_item.mock.calls).toEqual([[50]]);
			expect(M.free_state.mock.calls).toEqual([[4, Cclass_object, 4]]);
			// even modes below 6 go, except mode 4 (local variables): marked with typ 1 for the dump
			expect(LIST(Tx).map((x) => x.key)).toEqual(['k1', 'k3', 'k4', 'k5', 'k6', 'other']);
			expect(LIST(Tx).find((x) => x.key === 'k4')!.typ).toBe(1);
			expect(G.tmp_dumpvars).toBe(1);
			expect(count(Ttimer)).toBe(1);
			expect(count(Tfrap)).toBe(1); // quirk: Exit after the first
			expect(count(Tup)).toBe(3); // unit paths only for units
		});

		it('free_childs of a unit also frees its paths; items have no child items, states neither items nor states', () => {
			kids(Cclass_unit, 4);
			free_childs(Cclass_unit, 4);
			expect(LIST(Tup).map((u) => u.unit)).toEqual([5]);
			expect(M.free_item).toHaveBeenCalledOnce();
			DeleteEach(Tx);
			M.free_item.mockClear();
			M.free_state.mockClear();
			G.tmp_dumpvars = 0;
			kids(Cclass_item, 4);
			free_childs(Cclass_item, 4);
			expect(M.free_item).not.toHaveBeenCalled();
			expect(M.free_state).toHaveBeenCalledOnce();
			M.free_state.mockClear();
			kids(Cclass_state, 4);
			free_childs(Cclass_state, 4);
			expect(M.free_item).not.toHaveBeenCalled();
			expect(M.free_state).not.toHaveBeenCalled();
			kids(Cclass_info, 4);
			free_childs(Cclass_info, 4);
			expect(M.free_item).toHaveBeenCalledOnce();
			expect(M.free_state).toHaveBeenCalledOnce();
		});
	});
});

// ---------------------------------------------------------------- small helpers

import { Ditem_health, Ditem_mat } from '../../src/lib/s2/game/defs';
const DEFS_item_health = (typ: number): number => Ditem_health(typ);
const DEFS_item_mat = (typ: number): number => Ditem_mat(typ);
/** The live objects of a Type, in list order. */
function LIST<T extends object>(t: { list: { toArray(): T[] } }): T[] {
	return t.list.toArray();
}
