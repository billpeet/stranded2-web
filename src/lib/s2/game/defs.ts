/**
 * The definition loaders of the original (load_states.bb ... load_buildings.bb)
 * for the game: each `load_x()` runs the typed loader of defs/*.ts and then
 * does what that pure loader cannot: fill the game's globals and counts
 * (G), the scripting constants (const_set), the Tfind / Tdefparam / Tdefvar /
 * Tgroup / Tcom / Tbui lists, icon and model handles, sound sets and script
 * keys. Afterwards the D... accessors of defs_arrays.ts read the result.
 *
 * `loadAllDefinitions()` runs them in the order StrandedII.bb includes them.
 * main.ts calls the single `include_load_x()` functions instead, with the
 * original's load screens in between.
 *
 * Original error texts are kept: a DefinitionError of the typed loaders is
 * the RuntimeError of the original (same message).
 */
import { Int, RuntimeError, split as splitList } from '../blitz';
import { loadBuildings } from '../defs/buildings';
import { combinations_similar as combinations_similar_, loadCombinations } from '../defs/combinations';
import { loadGame } from '../defs/game';
import { loadInfos } from '../defs/infos';
import { loadItems } from '../defs/items';
import { loadLightcycle } from '../defs/lightcycle';
import { loadObjects, type FindDef } from '../defs/objects';
import { loadStates } from '../defs/states';
import { loadUnits, type UnitAni, type UnitDef } from '../defs/units';
import { ExtractAnimSeq, HideEntity, type Handle } from '../bb3d';
import type { Vfs } from '../io/Vfs';
import { ScriptEngine } from '../script/engine';
import { con_add } from './con_add';
import * as C from './consts';
import {
	DEF_ACCESSOR_NAMES,
	Dinfo_scriptk,
	Dinfo_scripto,
	Ditem_iconh,
	Ditem_model,
	Ditem_modelh,
	Ditem_scriptk,
	Ditem_scripto,
	Dobject_iconh,
	Dobject_model,
	Dobject_modelh,
	Dobject_scriptk,
	Dobject_scripto,
	Dstate_a,
	Dstate_icon,
	Dunit_iconh,
	Dunit_modelh,
	Dunit_scriptk,
	Dunit_scripto
} from './defs_arrays';
import { DEFS, clearExtra } from './defs_store';
import { overlayVfs } from './files';
import { load_res, load_soundset } from './ressources';
import { RT, hasRuntime } from './rt';
import { G, dim } from './state';
import { CONST_STORE, LIST_STORES, New, Tdefparam, Tdefvar, Tfind, Tgroup } from './types';

export * from './defs_arrays';
export { DEFS, resetDefs } from './defs_store';

let vfsOverride: Vfs | null = null;
/** The files the loaders read: base + overlay of files.ts, or the Vfs given to loadAllDefinitions. */
const V = (): Vfs => vfsOverride ?? overlayVfs();

let preparser: ScriptEngine | null = null;
/** preparse_string$(script$): the "Śon:event" key list of a script. */
function preparse_string(txt: string): string {
	const e = hasRuntime('script') ? RT.script : (preparser ??= new ScriptEngine());
	return e.preparse_string(txt);
}

/** const_set(n$,v) (parser_vars.bb): the loaders already stripped the leading '#' and dropped empty names. */
function const_set(n: string, v: number): void {
	if (n.startsWith('#')) n = n.substring(1);
	if (n !== '') CONST_STORE.set(n, v | 0);
}

/** defvar_set(class,typ) after split(val$) */
function defvar_set(cls: number, typ: number, raw: string): void {
	const s = splitList(raw);
	if (s[0] === '') RuntimeError('Invalid Def VAR definition (missing var name)');
	if (s[1] === '') s[1] = s[0];
	const d = New(Tdefvar);
	d.class = cls;
	d.typ = typ;
	d.key = s[0];
	d.descr = s[1];
	d.defaultval = s[2];
	d.isglobal = Int(s[3]);
}

function defparams(cls: number, typ: number, params: readonly { key: string; value: string }[]): void {
	for (const p of params) {
		const t = New(Tdefparam);
		t.class = cls;
		t.typ = typ;
		t.key = p.key;
		t.value = p.value;
	}
}

function finds(cls: number, parent: number, list: readonly FindDef[]): void {
	for (const f of list) {
		const t = New(Tfind);
		t.class = cls;
		t.parent = parent;
		t.typ = f.typ;
		t.ratio = f.ratio;
		t.max = f.max;
		t.min = f.min;
		t.reqtyp = f.reqtyp;
	}
}

/** Dx_iconh(i)=gfx_defaulticon, replaced by load_res(icon$,Cres_image,0) when "icon=" is given (0 if that fails). */
function iconHandle(icon: string) {
	return icon === '' ? G.gfx_defaulticon : load_res(icon, C.Cres_image, 0);
}

// =====================================================================================
// load_states.bb
// =====================================================================================

/** load_states() */
export async function load_states(): Promise<void> {
	G.state_count = 0;
	DEFS.states = await loadStates(V());
	G.state_count = DEFS.states.count ?? 0;
	clearExtra('Dstate_icon');
	for (const d of [DEFS.states.zero, ...DEFS.states.byId.values()]) {
		for (const n of d.consts) const_set(n, d.id);
		if (d.id === 0) continue;
		//Dstate_icon(i)=gfx_states / load_res(val$,Cres_image,0), falling back to gfx_states
		let icon = G.gfx_states;
		if (d.icon !== '') {
			const h = load_res(d.icon, C.Cres_image, 0);
			if (h !== 0) icon = h;
		}
		Dstate_icon.set(d.id, icon);
	}
}

/** Top-level code of load_states.bb: the Dstate_a() table, then load_states(). */
export async function include_load_states(): Promise<void> {
	await load_states();
	//Dstate_a(Cstate_frostbite)=1 ... : also for ids states.inf does not define
	for (const id of [C.Cstate_frostbite, C.Cstate_fracture, C.Cstate_electroshock, C.Cstate_bloodrush, C.Cstate_tame, C.Cstate_ai_stick, C.Cstate_speedmod]) {
		Dstate_a.set(id, 1);
	}
}

// =====================================================================================
// load_lightcycle.bb
// =====================================================================================

/** load_lightcycle() */
export async function load_lightcycle(): Promise<void> {
	G.Dlightcycle = dim(0, 24, 2);
	try {
		G.Dlightcycle = await loadLightcycle(V());
	} catch (e) {
		RuntimeError(e instanceof Error ? e.message : String(e));
	}
}
export const include_load_lightcycle = load_lightcycle;

// =====================================================================================
// load_game.bb
// =====================================================================================

/** load_game() */
export async function load_game(): Promise<void> {
	const g = await loadGame(V());
	G.game_healthsystem = g.healthsystem;
	G.game_exh_move = [...g.exh_move];
	G.game_exh_swim = [...g.exh_swim];
	G.game_exh_jump = [...g.exh_jump];
	G.game_exh_attack = [...g.exh_attack];
	G.game_exh_damage = [...g.exh_damage];
	G.game_divetime = g.divetime;
	G.game_divedamage = g.divedamage;
	if (g.defaultitemmodel !== '') {
		//game_defaultitemmodel=load_res(val$,Cres_mesh)
		const h = load_res(g.defaultitemmodel, C.Cres_mesh);
		if (h === null) {
			if (!headless()) RuntimeError(`Unable to load ${g.defaultitemmodel} (default_itemmodel in sys\\game.inf)`);
		} else HideEntity(h);
		G.game_defaultitemmodel = h;
	}
	G.game_projectiletimeout = g.projectiletimeout;
	G.game_firerange = g.firerange;
	G.game_digtime = g.digtime;
	G.game_fishtime = g.fishtime;
	G.game_jumptime = g.jumptime;
	G.game_rainratio = g.rainratio;
	G.game_snowratio = g.snowratio;
	G.game_jumpfac = g.jumpfac;
	G.game_jumptime2 = g.jumptime2;
	G.game_jumpfac2 = g.jumpfac2;
	G.game_falltime = g.falltime;
	G.game_falldamage = g.falldamage;
	G.game_fallminy = g.fallminy;
	G.game_fallmaxy = g.fallmaxy;
	G.game_scriptlooptimeout = g.scriptlooptimeout;
	G.game_script = g.script;
	//game_scriptk$=preparse_string$(game_script$)
	if (g.script !== '') G.game_scriptk = preparse_string(g.script);
	G.game_scriptkeys = g.scriptkeys;
	G.game_scriptkeyn = [...g.scriptkeyn];
	G.game_combiscreen = g.combiscreen;
	G.Cobject_count = g.Cobject_count;
	G.Cunit_count = g.Cunit_count;
	G.Citem_count = g.Citem_count;
	G.game_m_adventure = g.m_adventure;
	G.game_m_random = g.m_random;
	G.game_m_loadsave = g.m_loadsave;
	G.game_m_singleplayer = g.m_singleplayer;
	G.game_m_multiplayer = g.m_multiplayer;
	G.game_m_editor = g.m_editor;
	G.game_m_credits = g.m_credits;
	G.game_waverate = g.waverate;
	G.game_minwavespace = g.minwavespace;
	G.game_firelightsize = g.firelightsize;
	G.game_firelightbrightness = g.firelightbrightness;
	G.game_tercol = g.tercol.map((row) => [...row]);
	G.game_showemptybuildinggroups = g.showemptybuildinggroups;
	if (g.set_gore !== undefined) G.set_gore = g.set_gore;
}
export const include_load_game = load_game;

const headless = (): boolean => !hasRuntime('world') || RT.headless;

// =====================================================================================
// load_groups.bb
// =====================================================================================

/** group_add(class,group$,name$) */
export function group_add(cls: number, group: string, name: string): void {
	if (name === '') name = group;
	if (group === '') RuntimeError('Missing Group Name');
	for (const g of Tgroup.list) {
		if (g.class === cls) {
			if (g.group === group) RuntimeError(`Group '${group}' has already been defined`);
		}
	}
	const g = New(Tgroup);
	g.class = cls;
	g.group = group;
	g.name = name;
}

/** group_set$(class,group$): the check against the defined groups is commented out in the original. */
export function group_set(_cls: number, group: string): string {
	return group;
}

/** load_groups() */
export async function load_groups(): Promise<void> {
	const { loadGroups } = await import('../defs/groups');
	let groups;
	try {
		groups = await loadGroups(V());
	} catch (e) {
		RuntimeError(e instanceof Error ? e.message : String(e));
	}
	for (const g of groups) {
		const t = New(Tgroup);
		t.class = g.class;
		t.group = g.group;
		t.name = g.name;
	}
}
export const include_load_groups = load_groups;

// =====================================================================================
// load_objects.bb
// =====================================================================================

/** load_objects() */
export async function load_objects(): Promise<void> {
	G.object_count = 0;
	//Dim Dobject_iconh(Cobject_count) : Dim Dobject_modelh(Cobject_count)
	clearExtra('Dobject_iconh');
	clearExtra('Dobject_modelh');
	DEFS.objects = await rt(loadObjects(V(), G.Cobject_count));
	const defs = DEFS.objects;
	G.object_count = defs.count ?? 0;
	for (const n of defs.zero.consts) const_set(n, 0);
	for (const d of defs.byId.values()) {
		for (const n of d.consts) const_set(n, d.id);
		Dobject_iconh.set(d.id, iconHandle(d.icon));
		defparams(C.Cclass_object, d.id, d.params);
		finds(C.Cclass_object, d.id, d.finds);
		for (const v of d.vars) defvar_set(C.Cclass_object, d.id, v);
		//behaviour "buildingsite" / "buildingsite_water"
		Dobject_scripto.set(d.id, d.script);
		Dobject_scriptk.set(d.id, d.script !== '' ? preparse_string(d.script) : '');
	}
	if (defs.buildplaceId) G.set_buildplaceid = defs.buildplaceId;
	if (defs.buildplaceWaterId) G.set_buildplacewaterid = defs.buildplaceWaterId;
	//Editor Count
	G.object_count_e = G.object_count_e + (defs.countEditor ?? 0);
}
export const include_load_objects = load_objects;

/** load_object_model(i): models of objects are loaded when first needed. */
export function load_object_model(i: number): void {
	if (Dobject_modelh(i) === null) {
		Dobject_modelh.set(i, load_res(Dobject_model(i), C.Cres_mesh));
		if (Dobject_modelh(i) === null) {
			if (Dobject_model(i) !== '') {
				RuntimeError('Unable to load ' + Dobject_model(i));
			}
		} else {
			HideEntity(Dobject_modelh(i));
		}
	}
}

// =====================================================================================
// load_units.bb
// =====================================================================================

const ANIS = ['ani_idle1', 'ani_idle2', 'ani_idle3', 'ani_move', 'ani_attack', 'ani_use', 'ani_die', 'ani_spcl'] as const;

/** load_units() */
export async function load_units(): Promise<void> {
	G.unit_count = 0;
	//Dim Dunit_iconh(Cunit_count) : Dim Dunit_modelh(Cunit_count)
	clearExtra('Dunit_iconh');
	clearExtra('Dunit_modelh');
	DEFS.units = await rt(loadUnits(V(), G.Cunit_count));
	const defs = DEFS.units;
	G.unit_count = defs.count ?? 0;
	for (const n of defs.zero.consts) const_set(n, 0);
	/** model handle -> the animation sequences to extract from it, in the order the original extracted them */
	const seqs = new Map<NonNullable<Handle>, { ani: UnitAni; unit: UnitDef }[]>();
	for (const d of defs.byId.values()) {
		for (const n of d.consts) const_set(n, d.id);
		Dunit_iconh.set(d.id, iconHandle(d.icon));
		if (d.model !== '') {
			//Dunit_modelh(i)=load_res(Dunit_model$(i),Cres_animmesh)
			const h = load_res(d.model, C.Cres_animmesh);
			if (h === null) {
				if (!headless()) RuntimeError('Unable to load ' + d.model);
			} else {
				HideEntity(h);
				let list = seqs.get(h);
				if (!list) seqs.set(h, (list = []));
				for (const a of ANIS) if (d[a].seq > 0) list.push({ ani: d[a], unit: d });
			}
			Dunit_modelh.set(d.id, h);
		}
		if (d.sfx !== '') load_soundset(d.sfx);
		finds(C.Cclass_unit, d.id, d.loot);
		defparams(C.Cclass_unit, d.id, d.params);
		for (const v of d.vars) defvar_set(C.Cclass_unit, d.id, v);
		Dunit_scripto.set(d.id, d.script);
		Dunit_scriptk.set(d.id, d.script !== '' ? preparse_string(d.script) : '');
	}
	// ExtractAnimSeq(Dunit_modelh(i),f1,f2): the typed loader already knows the sequence
	// number each call returns (it counts per shared model handle); extract in that order.
	for (const [h, list] of seqs) {
		list.sort((a, b) => a.ani.seq - b.ani.seq);
		for (const { ani, unit } of list) {
			const got = ExtractAnimSeq(h, ani.f1, ani.f2);
			if (got !== ani.seq) console.warn(`load_units: animation sequence of unit ${unit.id} is ${got}, expected ${ani.seq}`);
		}
	}
	if (G.set_debug) for (const w of defs.warnings ?? []) con_add(w, C.Cbmpf_red);
	//Editor Count
	G.unit_count_e = G.unit_count_e + (defs.countEditor ?? 0);
}

/** Top-level code of load_units.bb */
export async function include_load_units(): Promise<void> {
	await load_units();
	//No Units created? (one needed as player unit!)
	if (G.unit_count === 0) {
		// the original copies units.template into the mod when sys\units.inf is missing (mod_copy_template) and loads again
		RuntimeError('Unit with ID 1 must be defined (used as player unit)!');
	}
}

// =====================================================================================
// load_items.bb
// =====================================================================================

/** load_items() */
export async function load_items(): Promise<void> {
	G.item_count = 0;
	//Dim Ditem_iconh(Citem_count) : Dim Ditem_modelh(Citem_count)
	clearExtra('Ditem_iconh');
	clearExtra('Ditem_modelh');
	DEFS.items = await rt(loadItems(V(), G.Citem_count));
	const defs = DEFS.items;
	G.item_count = defs.count ?? 0;
	for (const n of defs.zero.consts) const_set(n, 0);
	for (const d of defs.byId.values()) {
		for (const n of d.consts) const_set(n, d.id);
		Ditem_iconh.set(d.id, iconHandle(d.icon));
		defparams(C.Cclass_item, d.id, d.params);
		for (const v of d.vars) defvar_set(C.Cclass_item, d.id, v);
		Ditem_scripto.set(d.id, d.script);
		Ditem_scriptk.set(d.id, d.script !== '' ? preparse_string(d.script) : '');
	}
	//Editor Count
	G.item_count_e = G.item_count_e + (defs.countEditor ?? 0);
}
/** Top-level code of load_items.bb: `Ditem_speed#(0)=1 : Ditem_damage(0)=1` are the loader's zero slot. */
export const include_load_items = load_items;

/** load_item_model(i) */
export function load_item_model(i: number): void {
	if (Ditem_modelh(i) === null) {
		Ditem_modelh.set(i, load_res(Ditem_model(i), C.Cres_mesh));
		if (Ditem_modelh(i) === null) {
			if (Ditem_model(i) !== '') {
				RuntimeError('Unable to load ' + Ditem_model(i));
			}
		} else {
			HideEntity(Ditem_modelh(i));
		}
	}
}

// =====================================================================================
// load_infos.bb
// =====================================================================================

/** load_infos() */
export async function load_infos(): Promise<void> {
	DEFS.infos = await rt(loadInfos(V()));
	const defs = DEFS.infos;
	// quirk: info_count is not reset at the start of load_infos (it resets a local state_count instead)
	G.info_count = G.info_count + (defs.count ?? 0);
	for (const n of defs.zero.consts) const_set(n, 0);
	for (const d of defs.byId.values()) {
		for (const n of d.consts) const_set(n, d.id);
		for (const v of d.vars) defvar_set(C.Cclass_info, d.id, v);
		Dinfo_scripto.set(d.id, d.script);
		Dinfo_scriptk.set(d.id, d.script !== '' ? preparse_string(d.script) : '');
	}
}
export const include_load_infos = load_infos;

// =====================================================================================
// load_combinations.bb
// =====================================================================================

/** load_combinations() */
export async function load_combinations(): Promise<void> {
	//Delete Old
	LIST_STORES.Tcom.length = 0;
	const defs = await rt(loadCombinations(V(), DEFS.items as never));
	LIST_STORES.Tcom.push(...defs.list);
	for (const n of defs.zeroConsts) const_set(n, 0);
	for (const c of defs.combinations) for (const n of c.consts) const_set(n, c.id);
}

/** combinations_similar(): groups combinations with the same requirements (Tcom\gid). */
export function combinations_similar(): void {
	combinations_similar_(LIST_STORES.Tcom);
	let max = G.coms_serial;
	for (const c of LIST_STORES.Tcom) if (c.mode === 2 && c.gid > max) max = c.gid;
	G.coms_serial = max;
}

/** Top-level code of load_combinations.bb */
export async function include_load_combinations(): Promise<void> {
	await load_combinations();
	combinations_similar();
}

// =====================================================================================
// load_buildings.bb
// =====================================================================================

/** load_buildings() */
export async function load_buildings(): Promise<void> {
	const defs = await rt(
		loadBuildings(V(), {
			objects: DEFS.objects as never,
			units: DEFS.units as never,
			items: DEFS.items as never,
			Cobject_count: G.Cobject_count
		})
	);
	LIST_STORES.Tbui.push(...defs.list);
	for (const n of defs.zeroConsts) const_set(n, 0);
	for (const b of defs.buildings) for (const n of b.consts) const_set(n, b.id);
}
export const include_load_buildings = load_buildings;

// =====================================================================================

/** A DefinitionError of the typed loaders is a RuntimeError of the original with the same text. */
async function rt<T>(p: Promise<T>): Promise<T> {
	try {
		return await p;
	} catch (e) {
		if (e instanceof Error && e.constructor.name === 'DefinitionError') RuntimeError(e.message);
		throw e;
	}
}

/**
 * Every definition, in the order StrandedII.bb includes the loaders:
 * states, lightcycle, game, groups, objects, units, items, infos,
 * combinations, buildings. Scripting constants accumulate over all of them
 * (a name defined twice keeps the last value).
 *
 * `vfs`: read from this Vfs instead of the game's file layer (tests without a runtime).
 */
export async function loadAllDefinitions(vfs?: Vfs): Promise<DefinitionSummary> {
	vfsOverride = vfs ?? null;
	try {
		await include_load_states();
		await include_load_lightcycle();
		await include_load_game();
		await include_load_groups();
		await include_load_objects();
		await include_load_units();
		await include_load_items();
		await include_load_infos();
		await include_load_combinations();
		await include_load_buildings();
	} finally {
		vfsOverride = null;
	}
	return definitionSummary();
}

export interface DefinitionSummary {
	states: number;
	objects: number;
	units: number;
	items: number;
	infos: number;
	combinations: number;
	buildings: number;
	groups: number;
	consts: number;
	finds: number;
	defparams: number;
	defvars: number;
	limits: { Cobject_count: number; Cunit_count: number; Citem_count: number };
	accessors: number;
}

export function definitionSummary(): DefinitionSummary {
	return {
		states: G.state_count,
		objects: G.object_count,
		units: G.unit_count,
		items: G.item_count,
		infos: G.info_count,
		combinations: LIST_STORES.Tcom.filter((c) => c.mode === 2).length,
		buildings: LIST_STORES.Tbui.filter((b) => b.mode === 2).length,
		groups: Tgroup.list.count,
		consts: CONST_STORE.size,
		finds: Tfind.list.count,
		defparams: Tdefparam.list.count,
		defvars: Tdefvar.list.count,
		limits: { Cobject_count: G.Cobject_count, Cunit_count: G.Cunit_count, Citem_count: G.Citem_count },
		accessors: DEF_ACCESSOR_NAMES.length
	};
}
