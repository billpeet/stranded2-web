/**
 * Storage behind the D... accessors of defs_arrays.ts: the definition tables
 * produced by the loaders of defs/*.ts, plus the arrays those loaders have
 * no field for. Filled by defs.ts.
 */
import type { InfoDef, InfoDefs } from '../defs/infos';
import type { ItemDef, ItemDefs } from '../defs/items';
import type { ObjectDef, ObjectDefs } from '../defs/objects';
import type { StateDef, StateDefs } from '../defs/states';
import type { UnitDef, UnitDefs } from '../defs/units';

/** What the accessors need of a definition table. */
export interface DefTable<D> {
	byId: Map<number, D>;
	/** Array index 0. */
	zero: D;
}

/**
 * A record with every field at the value an untouched Blitz array element
 * has: 0, "" and (for the nested tuples and lists) the same all the way down.
 */
export function blankLike<D>(sample: D): D {
	const blank = (v: unknown): unknown => {
		if (typeof v === 'number') return 0;
		if (typeof v === 'string') return '';
		if (Array.isArray(v)) return v.length && typeof v[0] !== 'object' ? v.map(blank) : [];
		if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)]));
		return v;
	};
	return blank(sample) as D;
}

const emptyObject = (): ObjectDef => ({
	id: 0, consts: [], name: '', icon: '', model: '', size: [0, 0, 0], color: [0, 0, 0], fx: 0, autofade: 0, alpha: 0,
	shininess: 0, detailtex: '', col: 0, mat: 0, health: 0, healthchange: 0, swayspeed: 0, swaypower: 0, maxweight: 0,
	state: [0, 0, 0, 0], searchratio: 0, active: 0, behaviour: '', spawn: '', script: '', align: 0, descr: '', ined: 0,
	growtime: 0, group: '', finds: [], params: [], vars: []
}); // prettier-ignore
const emptyAni = () => ({ speed: 0, seq: 0, f1: 0, f2: 0 });
const emptyUnit = (): UnitDef => ({
	id: 0, consts: [], name: '', icon: '', model: '', size: [0, 0, 0], color: [0, 0, 0], fx: 0, autofade: 0, alpha: 0,
	shininess: 0, col: 0, colxr: 0, colyr: 0, mat: 0, health: 0, healthchange: 0, store: 0, maxweight: 0, gt: 0,
	state: [0, 0, 0, 0], ani_idle1: emptyAni(), ani_idle2: emptyAni(), ani_idle3: emptyAni(), ani_move: emptyAni(),
	ani_attack: emptyAni(), ani_use: emptyAni(), ani_die: emptyAni(), ani_spcl: emptyAni(), loopmoveani: 0, sfx: '',
	behaviour: 0, searchratio: 0, speed: 0, tspeed: 0, eyes: 0, damage: 0, range: 0, attackrange: 0, territory: 0,
	driveoffset: 0, script: '', align: 0, v: '', descr: '', ined: 0, group: '', loot: [], params: [], vars: []
}); // prettier-ignore
const emptyItem = (): ItemDef => ({
	id: 0, consts: [], name: '', icon: '', model: '', size: [0, 0, 0], color: [0, 0, 0], fx: 0, autofade: 0, alpha: 0,
	shininess: 0, blend: 0, col: 0, mat: 0, weight: 0, health: 0, healthchange: 0, gt: 0, state: [0, 0, 0, 0], radius: 0,
	behaviour: '', damage: '', speed: 0, drag: 0, rate: 0, wstate: 0, script: '', info: '', descr: '', ined: 0, group: '',
	params: [], vars: []
}); // prettier-ignore
const emptyInfo = (): InfoDef => ({ id: 0, consts: [], name: '', frame: 0, script: '', group: '', descr: '', vars: [] });
const emptyState = (): StateDef => ({ id: 0, consts: [], name: '', frame: 0, icon: '', script: '', active: 0 });

function emptyTable<D>(zero: D): DefTable<D> {
	return { byId: new Map(), zero };
}

/**
 * The loaded definitions. Before loadAllDefinitions() every table is empty,
 * which reads like the freshly Dim'ed arrays of the original.
 */
export const DEFS: {
	objects: DefTable<ObjectDef> & Partial<ObjectDefs>;
	units: DefTable<UnitDef> & Partial<UnitDefs>;
	items: DefTable<ItemDef> & Partial<ItemDefs>;
	infos: DefTable<InfoDef> & Partial<InfoDefs>;
	states: DefTable<StateDef> & Partial<StateDefs>;
} = {
	objects: emptyTable(emptyObject()),
	units: emptyTable(emptyUnit()),
	items: emptyTable(emptyItem()),
	infos: emptyTable(emptyInfo()),
	states: emptyTable(emptyState())
};

const BLANK: Record<keyof typeof DEFS, () => unknown> = {
	objects: emptyObject,
	units: emptyUnit,
	items: emptyItem,
	infos: emptyInfo,
	states: emptyState
};

/** Back to "nothing loaded" (tests), including the extra arrays. */
export function resetDefs(): void {
	DEFS.objects = emptyTable(emptyObject());
	DEFS.units = emptyTable(emptyUnit());
	DEFS.items = emptyTable(emptyItem());
	DEFS.infos = emptyTable(emptyInfo());
	DEFS.states = emptyTable(emptyState());
	for (const e of extras) e.clear();
}

function tableKey(t: DefTable<unknown>): keyof typeof DEFS {
	for (const k of Object.keys(DEFS) as (keyof typeof DEFS)[]) if (DEFS[k] === t) return k;
	throw new Error('unknown definition table');
}

function slot<D>(t: DefTable<D>, i: number): D | undefined {
	return i === 0 ? t.zero : t.byId.get(i);
}

function slotForWrite<D extends { id: number }>(t: DefTable<D>, i: number): D {
	let d = slot(t, i);
	if (d === undefined) {
		d = BLANK[tableKey(t)]() as D;
		d.id = i;
		t.byId.set(i, d);
	}
	return d;
}

/** D...(i): read with `Dx(i)`, write with `Dx.set(i, v)`. */
export interface Acc1<T> {
	(i: number): T;
	set(i: number, v: T): void;
}
/** D...(i,k): read with `Dx(i, k)`, write with `Dx.set(i, k, v)`. */
export interface Acc2<T> {
	(i: number, k: number): T;
	set(i: number, k: number, v: T): void;
}

export function acc1<D extends { id: number }, T>(
	table: () => DefTable<D>,
	get: (d: D) => T,
	set: (d: D, v: T) => void,
	zero: T
): Acc1<T> {
	const f = ((i: number): T => {
		const d = slot(table(), i);
		return d === undefined ? zero : get(d);
	}) as Acc1<T>;
	f.set = (i, v) => set(slotForWrite(table(), i), v);
	return f;
}

export function acc2<D extends { id: number }, T>(
	table: () => DefTable<D>,
	get: (d: D, k: number) => T,
	set: (d: D, k: number, v: T) => void,
	zero: T
): Acc2<T> {
	const f = ((i: number, k: number): T => {
		const d = slot(table(), i);
		if (d === undefined) return zero;
		const v = get(d, k);
		return v === undefined ? zero : v;
	}) as Acc2<T>;
	f.set = (i, k, v) => set(slotForWrite(table(), i), k, v);
	return f;
}

const extras: Map<number, unknown>[] = [];
/** name -> storage of the arrays kept here (diagnostics, tests). */
export const EXTRA_ARRAYS = new Map<string, Map<number, unknown>>();

/** An array the definition loaders have no field for. */
export function extra1<T>(name: string, zero: T): Acc1<T> {
	const store = new Map<number, T>();
	extras.push(store as Map<number, unknown>);
	EXTRA_ARRAYS.set(name, store as Map<number, unknown>);
	const f = ((i: number): T => {
		const v = store.get(i);
		return v === undefined ? zero : v;
	}) as Acc1<T>;
	f.set = (i, v) => {
		store.set(i, v);
	};
	return f;
}

/** `Dim Dx(n)` inside a loader: clears one of the arrays kept here. */
export function clearExtra(name: string): void {
	EXTRA_ARRAYS.get(name)?.clear();
}

/** A plain array view (index -> value) of an accessor, for layers that want an array (ScriptEngine.Dscript). */
export function arrayView<T>(acc: Acc1<T>): T[] {
	return new Proxy([] as T[], {
		get(target, key, receiver) {
			if (typeof key === 'string' && /^\d+$/.test(key)) return acc(Number(key));
			return Reflect.get(target, key, receiver);
		},
		set(target, key, value, receiver) {
			if (typeof key === 'string' && /^\d+$/.test(key)) {
				acc.set(Number(key), value as T);
				return true;
			}
			return Reflect.set(target, key, value, receiver);
		}
	});
}
