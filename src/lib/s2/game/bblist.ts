/**
 * The list side of Blitz `Type`s for ported game code: one interface
 * (`BBList`) over the two list implementations the port has, and the Blitz
 * statements as functions (`New`, `Delete`, `First`, `After`, ...).
 *
 *  - `TypeList` (blitz/typelist.ts): the exact port of the Blitz object
 *    list. Every Type declared in types.ts as a class uses one.
 *  - `ArrayList`: the same interface over a plain array that an existing
 *    runtime layer already owns (the script engine's Tx list, the text box
 *    rows of the input layer, ...). The array stays the single storage; the
 *    layer and the game code see the same objects.
 *
 * See PORTING_GUIDE.md, "Types and lists".
 */
import { BlitzRuntimeError, TypeList } from '../blitz';

export interface BBList<T extends object> extends Iterable<T> {
	/** Drops the dead nodes that are kept for running loops (TypeList). Between frames only. */
	purge?(): void;
	/** Number of live objects. */
	readonly count: number;
	/** Registers a new object at the end of the list (`New T`). */
	add(obj: T): T;
	/** `Delete obj`; null and already deleted objects are ignored. */
	delete(obj: T | null | undefined): void;
	/** `Delete Each T` */
	deleteEach(): void;
	/** True for null and for deleted objects: what `obj=Null` gives in Blitz. */
	isNull(obj: T | null | undefined): boolean;
	first(): T | null;
	last(): T | null;
	/** `After obj`. `After Null` is a memory access violation. */
	after(obj: T): T | null;
	before(obj: T): T | null;
	insertBefore(a: T, b: T): void;
	insertAfter(a: T, b: T): void;
	/** `For v.T = Each T`; the body may delete, create and reorder. */
	each(): Generator<T, void, undefined>;
	toArray(): T[];
}

/** What a Type is at run time: its name, its list, and how to make a blank object. */
export interface BBType<T extends object> {
	readonly typeName: string;
	readonly list: BBList<T>;
	/** A new object with every field at its Blitz default (0, "", Null). Not yet in the list. */
	create(): T;
}

/**
 * BBList over an array owned elsewhere. `get` is called on every operation,
 * so the owner may replace the array (input/state.ts resetState does).
 *
 * Deleting removes the element from the array at once (the owning layers
 * expect that). Iteration copes with it the way Blitz does: the loop goes on
 * with the element that followed the deleted one, elements appended in the
 * body are visited, elements removed ahead of the loop are not.
 */
export class ArrayList<T extends object> implements BBList<T> {
	/**
	 * Deleted objects and the element that preceded them (null: none), so that `After` on a
	 * deleted object gives what follows its old position NOW, as in Blitz, where the dead
	 * object stays in the list while a variable references it (objects appended after the
	 * Delete are found).
	 */
	private dead = new WeakMap<T, T | null>();

	constructor(private readonly get: () => T[]) {}

	get count(): number {
		return this.get().length;
	}

	add(obj: T): T {
		this.get().push(obj);
		return obj;
	}

	delete(obj: T | null | undefined): void {
		if (obj == null) return;
		const a = this.get();
		const i = a.indexOf(obj);
		if (i < 0) return;
		this.dead.set(obj, i > 0 ? a[i - 1] : null);
		a.splice(i, 1);
	}

	deleteEach(): void {
		const a = this.get();
		for (const o of a) this.dead.set(o, null);
		a.length = 0;
	}

	isNull(obj: T | null | undefined): boolean {
		return obj == null || !this.get().includes(obj);
	}

	first(): T | null {
		const a = this.get();
		return a.length ? a[0] : null;
	}

	last(): T | null {
		const a = this.get();
		return a.length ? a[a.length - 1] : null;
	}

	after(obj: T): T | null {
		if (obj == null) throw new BlitzRuntimeError('Memory access violation');
		const a = this.get();
		const i = a.indexOf(obj);
		if (i >= 0) return i + 1 < a.length ? a[i + 1] : null;
		// deleted: follow the chain of successors recorded at deletion to the first live one
		// the nearest live element in front of the old position; what follows it now
		let p = this.dead.get(obj) ?? null;
		let j = p === null ? -1 : a.indexOf(p);
		while (p !== null && j < 0) {
			p = this.dead.get(p) ?? null;
			j = p === null ? -1 : a.indexOf(p);
		}
		return j + 1 < a.length ? a[j + 1] : null;
	}

	before(obj: T): T | null {
		if (obj == null) throw new BlitzRuntimeError('Memory access violation');
		const a = this.get();
		const i = a.indexOf(obj);
		if (i >= 0) return i > 0 ? a[i - 1] : null;
		let p = this.dead.get(obj) ?? null;
		while (p !== null && !a.includes(p)) p = this.dead.get(p) ?? null;
		return p;
	}

	insertBefore(x: T, b: T): void {
		if (x === b) return;
		const a = this.get();
		const i = a.indexOf(x);
		if (i >= 0) a.splice(i, 1);
		const j = a.indexOf(b);
		a.splice(j < 0 ? a.length : j, 0, x);
	}

	insertAfter(x: T, b: T): void {
		if (x === b) return;
		const a = this.get();
		const i = a.indexOf(x);
		if (i >= 0) a.splice(i, 1);
		const j = a.indexOf(b);
		a.splice(j < 0 ? a.length : j + 1, 0, x);
	}

	*each(): Generator<T, void, undefined> {
		let cur = this.first();
		while (cur !== null) {
			yield cur;
			cur = this.after(cur);
		}
	}

	[Symbol.iterator](): Generator<T, void, undefined> {
		return this.each();
	}

	toArray(): T[] {
		return [...this.get()];
	}
}

/** A Type whose objects are plain records in an array another layer owns. */
export function arrayType<T extends object>(typeName: string, create: () => T, get: () => T[]): BBType<T> {
	return { typeName, create, list: new ArrayList<T>(get) };
}

export { TypeList };

// ---------------------------------------------------------------- Blitz statements

/** `x.T = New T` */
export function New<T extends object>(type: BBType<T>): T {
	return type.list.add(type.create());
}

/** `Delete x` (x keeps pointing at the dead object; test it with isNull) */
export function Delete<T extends object>(type: BBType<T>, obj: T | null | undefined): void {
	type.list.delete(obj);
	if (obj != null) handles.delete(obj);
}

/** `Delete Each T` */
export function DeleteEach<T extends object>(type: BBType<T>): void {
	for (const o of type.list.toArray()) handles.delete(o);
	type.list.deleteEach();
}

/** `First T` */
export function First<T extends object>(type: BBType<T>): T | null {
	return type.list.first();
}

/** `Last T` */
export function Last<T extends object>(type: BBType<T>): T | null {
	return type.list.last();
}

/** `After x`. Throws "Memory access violation" for Null, as the release runtime does. */
export function After<T extends object>(type: BBType<T>, obj: T | null): T | null {
	return type.list.after(obj as T);
}

/** `Before x` */
export function Before<T extends object>(type: BBType<T>, obj: T | null): T | null {
	return type.list.before(obj as T);
}

/** `Insert a Before b` */
export function InsertBefore<T extends object>(type: BBType<T>, a: T, b: T): void {
	type.list.insertBefore(a, b);
}

/** `Insert a After b` */
export function InsertAfter<T extends object>(type: BBType<T>, a: T, b: T): void {
	type.list.insertAfter(a, b);
}

/** `For x.T = Each T` when x is not used after the loop. */
export function Each<T extends object>(type: BBType<T>): Generator<T, void, undefined> {
	return type.list.each();
}

/** `x = Null`: true for null and for an object that has been deleted. */
export function isNull<T extends object>(type: BBType<T>, obj: T | null | undefined): boolean {
	return type.list.isNull(obj);
}

// ---------------------------------------------------------------- Handle / Object

const handles = new Map<object, number>();
const objects = new Map<number, WeakRef<object>>();
let nextHandle = 1;

/**
 * `Handle(x)`: an Int that identifies the object, 0 for Null and for deleted
 * objects. The original mostly uses it as a "not Null" test
 * (`If Handle(TCitem)<>0`); prefer `!isNull(T, x)` there.
 */
export function HandleOf<T extends object>(type: BBType<T>, obj: T | null | undefined): number {
	if (type.list.isNull(obj)) return 0;
	let h = handles.get(obj as T);
	if (h === undefined) {
		h = nextHandle++;
		handles.set(obj as T, h);
		objects.set(h, new WeakRef(obj as T));
	}
	return h;
}

/** `Object.T(handle)`: the object of that handle, Null if it is gone or of another Type. */
export function ObjectOf<T extends object>(type: BBType<T>, handle: number): T | null {
	const o = objects.get(handle)?.deref() as T | undefined;
	if (o === undefined || type.list.isNull(o)) return null;
	return o;
}
