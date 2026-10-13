/**
 * Integration round: list behaviour that only shows when packages run together.
 * Blitz keeps a deleted object in its list while a variable references it, so a
 * First/After loop standing on a deleted object continues with whatever follows
 * its position at `Next`, including objects created after the Delete.
 */
import { describe, expect, it } from 'vitest';
import { TypeList } from '../src/lib/s2/blitz';
import { ArrayList } from '../src/lib/s2/game/bblist';

interface O {
	n: string;
}

function walk(list: { first(): O | null; after(o: O): O | null }, body: (o: O) => void): string[] {
	const seen: string[] = [];
	for (let o = list.first(); o !== null; o = list.after(o)) {
		seen.push(o.n);
		body(o);
	}
	return seen;
}

describe.each([
	['TypeList', () => new TypeList<O>()],
	['ArrayList', () => new ArrayList<O>(((a: O[]) => () => a)([]))]
])('%s: First/After loops with Delete and New in the body', (_name, make) => {
	it('delete the current (last) object, then New: the new object is visited', () => {
		const l = make();
		l.add({ n: 'a' });
		l.add({ n: 'b' });
		const seen = walk(l, (o) => {
			if (o.n === 'b') {
				l.delete(o);
				l.add({ n: 'c' });
			}
		});
		expect(seen).toEqual(['a', 'b', 'c']);
	});

	it('delete the current and the next object, then New twice', () => {
		const l = make();
		const a = l.add({ n: 'a' });
		const b = l.add({ n: 'b' });
		const c = l.add({ n: 'c' });
		void a;
		const seen = walk(l, (o) => {
			if (o === b) {
				l.delete(b);
				l.delete(c);
				l.add({ n: 'd' });
				l.add({ n: 'e' });
			}
		});
		expect(seen).toEqual(['a', 'b', 'd', 'e']);
	});

	it('delete everything from the first object, then New twice', () => {
		const l = make();
		const all = [l.add({ n: 'a' }), l.add({ n: 'b' })];
		const seen = walk(l, (o) => {
			if (o.n === 'a') {
				for (const x of all) l.delete(x);
				l.add({ n: 'n1' });
				l.add({ n: 'n2' });
			}
		});
		expect(seen).toEqual(['a', 'n1', 'n2']);
	});
});

describe('TypeList.purge', () => {
	it('unlinks dead nodes; After on a purged object still finds a live neighbour', () => {
		const l = new TypeList<O>();
		const a = l.add({ n: 'a' });
		const b = l.add({ n: 'b' });
		const c = l.add({ n: 'c' });
		l.delete(b);
		l.purge();
		expect(l.toArray()).toEqual([a, c]);
		expect(l.after(b)).toBe(c);
		expect(l.isNull(b)).toBe(true);
	});
});
