/**
 * Blitz3D `Type` lists: the object runtime in bbruntime/basic.cpp
 * (_bbObjNew, _bbObjDelete, _bbObjNext, _bbObjEachFirst, ...) and the
 * statements that call it (compiler/stmtnode.cpp ForEachNode, DeleteNode,
 * InsertNode; exprnode.cpp NewNode, FirstNode, AfterNode, ...).
 *
 * Every Type has one circular doubly linked list of its live objects.
 *
 *  - `New T` appends at the end.
 *  - `Delete obj` clears the object's field block (`obj->fields=0`) and drops
 *    one reference. The node leaves the list only when the last reference is
 *    gone. Until then it stays where it was as a dead node.
 *  - `First`, `Last`, `After`, `Before` and `For ... Each` skip dead nodes
 *    (_bbObjNext/_bbObjPrev loop `while( !obj->fields )`).
 *  - `For v.T = Each T` is `v = First T` and then `v = After v` at each Next.
 *    The loop variable holds a reference, so the current object can be
 *    deleted in the body: `After` still starts from its old position. The
 *    successor is looked up only at Next, so objects created in the body
 *    (appended at the end) are visited, objects deleted ahead of the loop
 *    are not, and objects moved with Insert are met wherever they are then.
 *  - A deleted object compares equal to Null (_bbObjCompare compares the
 *    field blocks), and `Delete Null` / deleting twice does nothing.
 *  - `Insert a Before b` / `After b` unlinks a and relinks it next to b;
 *    `Insert a Before a` does nothing.
 *
 * The port has no reference counts. A deleted object's node stays linked as
 * a tombstone, exactly where it was, until `purge()` is called (the main
 * loop does that once per frame, between two section calls, when no Blitz
 * loop can be running; `Delete Each` purges too). So within a frame
 * everything behaves as in Blitz, whatever the loop form: deleting the
 * current (or any other) element, creating objects after that (they are
 * visited), reordering with Insert, `Delete p : p = After p`. After a purge
 * the tombstone is unlinked but keeps its own neighbour pointers, so
 * `After`/`Before` on a long-dead object still finds a sensible live
 * neighbour, where Blitz would still have had it in the list (as long as a
 * variable referenced it).
 *
 * Not modelled: a `For ... Each` whose loop variable is an object
 * *parameter* of the enclosing function uses the non-counting
 * _bbObjEachFirst2/_bbObjEachNext2; deleting the current object there ends
 * the loop early when nothing else references it.
 */
import { BlitzRuntimeError } from './errors';

interface Node<T> {
	value: T | undefined;
	next: Node<T>;
	prev: Node<T>;
	/** obj->fields != 0 */
	alive: boolean;
	/** still part of the chain */
	linked: boolean;
	sentinel: boolean;
}

export class TypeList<T extends object> implements Iterable<T> {
	private readonly head: Node<T>;
	private nodes = new WeakMap<T, Node<T>>();
	private tombstones: Node<T>[] = [];
	private iterating = 0;
	private live = 0;

	constructor() {
		const h = { value: undefined, alive: false, linked: true, sentinel: true } as Node<T>;
		h.next = h.prev = h;
		this.head = h;
	}

	/** Number of live objects. */
	get count(): number {
		return this.live;
	}

	/** `New T`: registers obj as a new object at the end of the list and returns it. */
	add(obj: T): T {
		if (this.nodes.has(obj)) throw new Error('TypeList.add: object is already in a list');
		const n = { value: obj, alive: true, linked: true, sentinel: false } as Node<T>;
		this.link(n, this.head);
		this.nodes.set(obj, n);
		this.live++;
		return obj;
	}

	/** `Delete obj`. Null, an already deleted object: no effect. */
	delete(obj: T | null | undefined): void {
		if (obj == null) return;
		const n = this.nodes.get(obj);
		if (!n || !n.alive) return;
		n.alive = false;
		this.live--;
		this.tombstones.push(n);
	}

	/** `Delete Each T` */
	deleteEach(): void {
		for (let n = this.head.next; !n.sentinel; n = n.next) {
			if (n.alive) {
				n.alive = false;
				this.tombstones.push(n);
			}
		}
		this.live = 0;
		this.purge();
	}

	/** True for Null and for deleted objects: what `obj = Null` gives in Blitz. */
	isNull(obj: T | null | undefined): boolean {
		if (obj == null) return true;
		const n = this.nodes.get(obj);
		return !n || !n.alive;
	}

	/** `First T`, or null. */
	first(): T | null {
		return this.nextLive(this.head);
	}

	/** `Last T`, or null. */
	last(): T | null {
		return this.prevLive(this.head);
	}

	/** `After obj`: the next live object, or null. `After Null` is a memory access violation in release builds. */
	after(obj: T): T | null {
		return this.nextLive(this.node(obj));
	}

	/** `Before obj`: the previous live object, or null. */
	before(obj: T): T | null {
		return this.prevLive(this.node(obj));
	}

	/** `Insert a Before b` */
	insertBefore(a: T, b: T): void {
		const na = this.node(a);
		const nb = this.node(b);
		if (na === nb) return;
		this.unlink(na);
		this.link(na, nb);
	}

	/** `Insert a After b` */
	insertAfter(a: T, b: T): void {
		const na = this.node(a);
		const nb = this.node(b);
		if (na === nb) return;
		this.unlink(na);
		this.link(na, nb.next);
	}

	/**
	 * `For v.T = Each T`. The body may delete the current object or any
	 * other, create new ones and reorder the list.
	 */
	*each(): Generator<T, void, undefined> {
		this.iterating++;
		try {
			let n = this.nextLiveNode(this.head);
			while (n) {
				yield n.value as T;
				n = this.nextLiveNode(n);
			}
		} finally {
			this.iterating--;
		}
	}

	[Symbol.iterator](): Generator<T, void, undefined> {
		return this.each();
	}

	/** Snapshot of the live objects in list order. */
	toArray(): T[] {
		const out: T[] = [];
		for (let n = this.head.next; !n.sentinel; n = n.next) if (n.alive) out.push(n.value as T);
		return out;
	}

	// ------------------------------------------------------------ internals

	private node(obj: T): Node<T> {
		if (obj == null) throw new BlitzRuntimeError('Memory access violation');
		const n = this.nodes.get(obj);
		if (!n) throw new Error('TypeList: object does not belong to this list');
		return n;
	}

	/** insertObj( obj,next ) */
	private link(n: Node<T>, next: Node<T>): void {
		// an unlinked tombstone can be the anchor: relink relative to where it points
		while (!next.linked) next = next.next;
		n.next = next;
		n.prev = next.prev;
		next.prev.next = n;
		next.prev = n;
		n.linked = true;
	}

	/** unlinkObj: the node keeps its own pointers */
	private unlink(n: Node<T>): void {
		if (!n.linked) return;
		n.next.prev = n.prev;
		n.prev.next = n.next;
		n.linked = false;
	}

	/**
	 * Unlinks the dead nodes. Call only where no loop over the list can be
	 * running (between frames); does nothing while an `each()` is active.
	 */
	purge(): void {
		if (this.iterating !== 0 || this.tombstones.length === 0) return;
		for (const n of this.tombstones) if (!n.alive) this.unlink(n);
		this.tombstones = [];
	}

	private nextLiveNode(n: Node<T>): Node<T> | null {
		do {
			n = n.next;
			if (n.sentinel) return null;
		} while (!n.alive);
		return n;
	}

	private nextLive(n: Node<T>): T | null {
		const r = this.nextLiveNode(n);
		return r ? (r.value as T) : null;
	}

	private prevLive(n: Node<T>): T | null {
		do {
			n = n.prev;
			if (n.sentinel) return null;
		} while (!n.alive);
		return n.value as T;
	}
}
